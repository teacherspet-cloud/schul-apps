/**
 * „Schul-Apps Online" – die Exe zum Schul-Apps-Server (02.10.2026).
 *
 * Wunsch der Lehrkraft: Über eine eigene Exe (neben der bisherigen Standalone-Exe) wird der
 * Kontakt mit dem VPS geführt; Anmeldung mit IServ, angemeldet bleiben, Abmelden-Knopf.
 *
 *  - Ein Fenster mit der Oberfläche vom Server. Die Sitzung (Cookie) liegt in einer dauerhaften
 *    Partition – nach dem Neustart ist man noch angemeldet. Abmelden: Knopf in der Leiste.
 *  - Anmeldung über IServ läuft im selben Fenster (gywem.de), danach zurück zum Server.
 *  - Downloads (Word, PDF) mit dem Speichern-Dialog von Windows; Drucken öffnet das PDF.
 *  - IServ-Ordner: Der Server darf das IServ-Passwort nie bekommen. Deshalb spricht DIESE Exe
 *    IServ per WebDAV direkt an – mit dem Passwort verschlüsselt auf dem PC (Windows-DPAPI).
 *    Die Oberfläche ruft das über `window.__schulappsClient.iserv` auf (preload.ts).
 *  - Ohne Verbindung: eine Hinweisseite mit „Erneut versuchen".
 */
import { app, BrowserWindow, ipcMain, Menu, safeStorage, session, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { iservAblegen, iservEintraege, iservLaden, iservOrdner, iservStatus, iservTrennen, iservVerbinden, type IservGeraet } from '../main/services/iserv/iserv'
import type { DavAbruf } from '../main/services/iserv/webdav'
import type { AblageZiel } from '@shared/types'
import { getSettings, setSettings } from '../main/services/storage/settings'

const STANDARD_SERVER = 'https://217.154.120.64:8443'
const PARTITION = 'persist:schulapps-online'

/** Server-Adresse: --server=… oder Datei server.txt im Datenordner, sonst die Schul-Adresse */
function serverAdresse(): string {
  const arg = process.argv.find((a) => a.startsWith('--server='))?.slice('--server='.length)
  if (arg && /^https?:\/\/[^\s]+$/.test(arg)) return arg.replace(/\/$/, '')
  const datei = join(app.getPath('userData'), 'server.txt')
  if (existsSync(datei)) {
    const t = readFileSync(datei, 'utf8').trim()
    if (/^https?:\/\/[^\s]+$/.test(t)) return t.replace(/\/$/, '')
  }
  return STANDARD_SERVER
}

// ---------- IServ per WebDAV – nur lokal

const geheimDatei = (): string => join(app.getPath('userData'), 'iserv-passwort.bin')
const geraet: IservGeraet = {
  abruf: (async (a) => {
    const res = await fetch(a.url, {
      method: a.methode,
      headers: a.kopf,
      body: a.koerper === undefined ? undefined : typeof a.koerper === 'string' ? a.koerper : Buffer.from(a.koerper),
      signal: AbortSignal.timeout(60_000)
    })
    if (res.url && !res.url.startsWith('https://')) throw new Error('Weiterleitung auf eine unverschlüsselte Adresse')
    if (a.binaer) return { status: res.status, text: '', bytes: new Uint8Array(await res.arrayBuffer()) }
    return { status: res.status, text: await res.text() }
  }) as DavAbruf,
  passwort: {
    lies: async () => {
      try {
        return existsSync(geheimDatei()) ? safeStorage.decryptString(readFileSync(geheimDatei())) : null
      } catch {
        return null
      }
    },
    setze: async (wert) => writeFileSync(geheimDatei(), safeStorage.encryptString(wert)),
    loesche: async () => {
      if (existsSync(geheimDatei())) writeFileSync(geheimDatei(), '')
    }
  }
}

function iservKanaele(): void {
  const nurVomServer = (e: Electron.IpcMainInvokeEvent): void => {
    if (!e.senderFrame?.url.startsWith(serverAdresse())) throw new Error('Nicht erlaubt.')
  }
  const h = <A extends unknown[], R>(kanal: string, fn: (...a: A) => R | Promise<R>): void =>
    void ipcMain.handle(kanal, async (e, ...args) => {
      nurVomServer(e)
      try {
        return { ok: true, value: await fn(...(args as A)) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  h('client:iserv-status', () => iservStatus(geraet))
  h('client:iserv-verbinden', (eingabe: { schule: string; benutzer: string; passwort?: string }) => iservVerbinden(geraet, eingabe))
  h('client:iserv-ordner', (pfad: string) => iservOrdner(geraet, pfad))
  h('client:iserv-eintraege', (pfad: string) => iservEintraege(geraet, pfad))
  h('client:iserv-laden', (pfad: string) => iservLaden(geraet, pfad))
  h('client:iserv-trennen', () => iservTrennen(geraet))
  h('client:iserv-ablegen', (name: string, daten: Uint8Array | string, ziel: AblageZiel, standardZiel?: string) => {
    // Das Standardziel steht in den Einstellungen auf dem Server – hier vor dem Ablegen übernehmen
    const e = getSettings().iserv
    if (e && typeof standardZiel === 'string' && standardZiel) setSettings({ iserv: { ...e, ziel: standardZiel } })
    return iservAblegen(geraet, name, daten, ziel)
  })
}

// ---------- Fenster

const OFFLINE = (adresse: string, fehler: string): string =>
  `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Schul-Apps Online</title>
<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f3f6f8;color:#1d2a33}main{max-width:460px;background:#fff;border:1px solid #d5dde3;border-radius:14px;padding:28px;text-align:center}button{margin-top:16px;padding:12px 18px;border-radius:10px;border:0;background:#0f7b6c;color:#fff;font:inherit;font-weight:600;cursor:pointer}small{color:#5b6b76}</style></head>
<body><main><h2>Der Schul-Apps-Server ist nicht erreichbar</h2><p>Bitte die Internetverbindung prüfen.</p><small>${adresse.replace(/</g, '&lt;')} · ${fehler.replace(/</g, '&lt;')}</small><br><button onclick="location.href='${adresse}'">Erneut versuchen</button></main></body></html>`)}`

function fenster(): void {
  const adresse = serverAdresse()
  const ursprung = new URL(adresse).origin
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Schul-Apps Online',
    autoHideMenuBar: true,
    backgroundColor: '#f3f6f8',
    webPreferences: {
      partition: PARTITION,
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true
    }
  })
  win.maximize()
  win.webContents.session.setSpellCheckerLanguages(['de-DE'])

  // Nur Server und IServ-Anmeldung im Fenster; alles andere im Browser des Systems
  const erlaubt = (url: string): boolean => {
    try {
      const u = new URL(url)
      return u.origin === ursprung || /(^|\.)gywem\.de$/i.test(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:'
    } catch {
      return false
    }
  }
  win.webContents.on('will-navigate', (e, url) => {
    if (!erlaubt(url)) {
      e.preventDefault()
      void shell.openExternal(url)
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Druckansicht (PDF als blob:) und leere Tabs der Oberfläche im eigenen Fenster mit PDF-Ansicht
    if (url === 'about:blank' || url.startsWith('blob:') || url.startsWith(ursprung)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { partition: PARTITION, plugins: true } } }
    }
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-fail-load', (_e, code, beschreibung, url, hauptframe) => {
    if (!hauptframe || code === -3 || url.startsWith('data:')) return
    void win.loadURL(OFFLINE(adresse, `${beschreibung} (${code})`))
  })
  void win.loadURL(adresse)
}

app.setName('Schul-Apps Online')
// Eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorn
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })
  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    // Downloads: Speichern-Dialog von Windows (Standardverhalten), mit dem vorgeschlagenen Namen
    session.fromPartition(PARTITION).on('will-download', (_e, item) => {
      item.setSaveDialogOptions({ title: 'Speichern', defaultPath: join(app.getPath('documents'), item.getFilename()) })
    })
    iservKanaele()
    fenster()
  })
  app.on('window-all-closed', () => app.quit())
}
