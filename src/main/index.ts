import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { cleanupWorkDirs } from './services/ai/cli'
import { oeffnePaket, paketAusArgumenten } from './services/paket/wege'
import { fangeAbstuerze, protokolliere } from './services/protokoll'
import { lanBeimStart, stopLan } from './services/lanServer'
import { getSettings } from './services/storage/settings'
import { starteAutoSicherung } from './services/storage/autoSicherung'
import { aktualisiereModelle, registriereKanaele } from './kanaele'
import { electronUmgebung } from './umgebung'
import { begrenzeStand, FensterStand, leseStand, MINDEST_GROESSE, STANDARD_GROESSE } from './fensterStand'
// Kopiert electron-vite beim Bauen nach out/ und liefert den Pfad (liegt damit auch in der .exe)
import fensterSymbol from '../../build/icon.ico?asset'

let mainWindow: BrowserWindow | null = null

/**
 * Wie lange das Fenster beim Schließen auf die Oberfläche wartet, bis alles gesichert ist.
 * Reagiert sie nicht (etwa weil sie hängt), geht das Fenster trotzdem zu – sonst ließe sich
 * das Programm gar nicht mehr beenden.
 */
const SICHERN_BEIM_SCHLIESSEN_MS = 3000

/** Meldung der Oberfläche „alles gesichert" – gesetzt, solange auf sie gewartet wird. */
let gesichert: (() => void) | null = null
/**
 * Die Oberfläche fragt nach (es laufen noch Aufträge): Die Frist von drei Sekunden hält an,
 * bis die Lehrkraft entschieden hat. `bleiben` bricht das Schließen ab.
 */
let rueckfrage: (() => void) | null = null
let bleiben: (() => void) | null = null

/** Gemerkte Fenstergröße und -lage (siehe fensterStand.ts) – je Rechner, nicht in der Sicherung */
const fensterDatei = (): string => join(app.getPath('userData'), 'fenster.json')

function ladeFensterStand(): FensterStand | null {
  try {
    if (!existsSync(fensterDatei())) return null
    const stand = leseStand(JSON.parse(readFileSync(fensterDatei(), 'utf-8')))
    return begrenzeStand(
      stand,
      screen.getAllDisplays().map((d) => d.workArea)
    )
  } catch {
    return null
  }
}

function merkeFensterStand(win: BrowserWindow): void {
  try {
    // getNormalBounds: die Größe VOR dem Maximieren – damit das Fenster beim Verkleinern wieder so wird
    const stand: FensterStand = { bounds: win.getNormalBounds(), maximiert: win.isMaximized() }
    writeFileSync(fensterDatei(), JSON.stringify(stand))
  } catch {
    // Merken ist Komfort – ein Fehler darf das Schließen nicht aufhalten
  }
}

function createWindow(): void {
  const stand = ladeFensterStand()
  mainWindow = new BrowserWindow({
    ...(stand ? stand.bounds : STANDARD_GROESSE),
    minWidth: MINDEST_GROESSE.width,
    minHeight: MINDEST_GROESSE.height,
    show: false,
    title: 'Schul-Apps',
    // Ohne eigenes Symbol zeigt das Fenster beim Entwickeln (npm run dev) das Electron-Symbol
    icon: fensterSymbol,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow.on('ready-to-show', () => {
    if (stand?.maximiert) mainWindow?.maximize()
    mainWindow?.show()
  })

  /*
   * Vor dem Schließen die Oberfläche sichern lassen.
   *
   * Die Programme sichern mit ein bis zwei Sekunden Verzögerung. Wer direkt nach einer
   * Änderung das Fenster schloss, verlor sie bis 25.09.2026 still. Jetzt hält das Schließen
   * kurz an, die Oberfläche führt alles Anstehende sofort aus und meldet sich zurück – oder
   * nach drei Sekunden geht das Fenster ohnehin zu.
   */
  let schliessenErlaubt = false
  mainWindow.on('close', (e) => {
    const win = mainWindow
    if (win && !win.isDestroyed()) merkeFensterStand(win)
    if (schliessenErlaubt || !win || win.webContents.isDestroyed() || win.webContents.isCrashed()) return
    e.preventDefault()
    if (gesichert) return // Es wird schon gewartet – ein zweiter Klick aufs Kreuz ändert daran nichts
    const aufraeumen = (): void => {
      clearTimeout(zeit)
      gesichert = rueckfrage = bleiben = null
    }
    const zu = (): void => {
      aufraeumen()
      schliessenErlaubt = true
      if (!win.isDestroyed()) win.close()
    }
    const zeit = setTimeout(zu, SICHERN_BEIM_SCHLIESSEN_MS)
    gesichert = zu
    /*
     * Laufen noch Hintergrund-Aufträge, fragt die Oberfläche nach („trotzdem beenden?").
     * Solange die Frage offen ist, gilt die Frist nicht – sonst ginge das Fenster zu, während
     * die Lehrkraft noch liest.
     */
    rueckfrage = () => clearTimeout(zeit)
    bleiben = aufraeumen
    win.webContents.send('fenster:schliessen')
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Dateien, die versehentlich neben die Drop-Fläche fallen, sollen die App nicht verlassen.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // Prüfmodus für automatisierte Qualitätsprüfungen (nur mit gesetzter Umgebungsvariable)
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), process.env.SCHULAPPS_SELFTEST === '1' ? { search: 'selftest=1' } : undefined)
  }
}

/**
 * Alle registrierten Aufrufe – damit sie nicht nur über die Electron-Brücke erreichbar sind,
 * sondern auch über den Zugang aus dem lokalen Netz.
 *
 * WELCHE davon im Netz erlaubt sind, entscheidet die Erlaubnisliste in services/lanServer.ts.
 * Diese Sammlung weiß davon nichts; sie kennt nur alles, was es gibt.
 */
const aufrufe = new Map<string, (...args: unknown[]) => unknown>()

/** Registriert einen IPC-Handler; Fehler kommen als lesbare Meldung in der Oberfläche an. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  aufrufe.set(channel, fn as (...args: unknown[]) => unknown)
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (err) {
      const meldung = err instanceof Error ? err.message : String(err)
      // Ins Protokoll: Kanal und Meldung, keine Nutzdaten; Abbrüche durch die Lehrkraft sind kein Fehler
      if (!/abgebrochen|aborted/i.test(meldung)) protokolliere('fehler', `ipc ${channel}`, meldung)
      return { ok: false, error: meldung }
    }
  })
}

/*
 * Die Aufrufe selbst stehen in kanaele.ts (gemeinsam mit der iPad-App); was am PC anders ist –
 * Dialoge, Explorer, Druckfenster, Netzzugang – in umgebung.ts.
 */
function registerIpc(): void {
  registriereKanaele(
    handle,
    electronUmgebung({
      fenster: () => mainWindow,
      schliessen: {
        gesichert: () => gesichert?.(),
        rueckfrage: () => rueckfrage?.(),
        bleiben: () => bleiben?.()
      },
      aufruf: async (channel, args) => {
        const fn = aufrufe.get(channel)
        if (!fn) throw new Error(`Unbekannter Aufruf „${channel}".`)
        return fn(...args)
      },
      oberflaeche: join(__dirname, '../renderer')
    })
  )
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      // Läuft die App schon und wird ein Schulpaket geöffnet, zeigt das Fenster seinen Inhalt
      const paket = paketAusArgumenten(argv)
      if (paket) {
        try {
          mainWindow.webContents.send('paket:vonAussen', oeffnePaket(paket))
        } catch (err) {
          mainWindow.webContents.send('paket:vonAussen', { fehler: err instanceof Error ? err.message : String(err) })
        }
      }
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('de.schulapps.app')
    /*
     * Kein Menü. Electron bringt sonst ein englisches Standardmenü mit („File, Edit, View …"),
     * das mit der Alt-Taste aufklappte – in einer sonst deutschen Oberfläche und ohne einen
     * Eintrag, den die Lehrkraft braucht.
     *
     * Kopieren, Einfügen, Ausschneiden, Alles markieren und Rückgängig in Textfeldern hängen
     * unter Windows NICHT am Menü, sondern an Chromium selbst (geprüft in
     * tests/e2e/hauptapp.mjs). Was das Menü zusätzlich lieferte – Neu laden und die
     * Entwicklerwerkzeuge –, gibt es im Entwicklungsmodus weiter über die Tasten unten.
     */
    Menu.setApplicationMenu(null)
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
      if (is.dev)
        window.webContents.on('before-input-event', (event, input) => {
          if (input.type !== 'keyDown' || !input.control) return
          if (input.shift && input.code === 'KeyI') {
            window.webContents.toggleDevTools()
            event.preventDefault()
          } else if (!input.shift && input.code === 'KeyR') {
            window.webContents.reload()
            event.preventDefault()
          }
        })
    })
    fangeAbstuerze()
    registerIpc()
    createWindow()
    /*
     * Netzzugang wieder einschalten, wenn er eingerichtet ist (30.09.2026, Wunsch der Lehrkraft:
     * „nach jedem Neustart aus"). Derselbe Weg wie der Schalter in den Einstellungen – mit
     * gespeicherter PIN und gespeichertem Port. Scheitert es, bleibt er aus; die Einstellungen
     * zeigen den Stand, das Protokoll den Grund.
     */
    try {
      if (lanBeimStart(getSettings().lan)) {
        const start = aufrufe.get('lan:start')
        void Promise.resolve(start?.())
          .then((stand) => {
            const s = stand as { port?: number; wunschPort?: number } | undefined
            if (s?.port && s.wunschPort && s.port !== s.wunschPort) protokolliere('warnung', 'netz', `Port ${s.wunschPort} belegt – Netzzugang läuft auf ${s.port}`)
          })
          .catch((e: unknown) => protokolliere('fehler', 'netz', `Netzzugang ließ sich beim Start nicht einschalten: ${e instanceof Error ? e.message : String(e)}`))
      }
    } catch {
      // Der Start des Programms hängt nie am Netzzugang
    }
    starteAutoSicherung()
    // Liegengebliebene Arbeitsordner der KI-Programme entfernen. Sie entstehen, wenn die App
    // hart beendet wird – dann kommt das eigene Aufräumen nicht mehr dazu.
    try {
      const removed = cleanupWorkDirs()
      if (removed) console.log(`${removed} liegengebliebene Arbeitsordner entfernt`)
    } catch {
      // Aufräumen darf den Start nie verhindern
    }
    // Beim Start und danach alle 12 Stunden die Modelllisten der Anbieter abgleichen
    mainWindow?.webContents.once('did-finish-load', () => void aktualisiereModelle())
    setInterval(() => void aktualisiereModelle(), 12 * 60 * 60 * 1000)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  /*
   * Der Zugang aus dem Netz geht mit dem Programm mit. Ein Server, der nach dem Schließen
   * des Fensters weiterliefe, wäre genau die Art offener Tür, die niemand bemerkt.
   */
  app.on('before-quit', () => stopLan())

  app.on('window-all-closed', () => {
    stopLan()
    if (process.platform !== 'darwin') app.quit()
  })
}
