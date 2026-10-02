/**
 * Die Umgebung der Aufrufe am PC (Electron) – siehe main/kanaele.ts.
 *
 * Verhalten wie bis 29.09.2026 in main/index.ts: Windows-Dialoge, Explorer, unsichtbares
 * Druckfenster, Netzzugang. Eigene Datei, damit die Prüfung der Kanäle
 * (tests/mobilKanaele.test.ts) sie ohne laufendes Electron-Programm aufbauen kann.
 */
import { BrowserWindow, dialog, shell } from 'electron'
import { writeFileSync } from 'fs'
import type { Umgebung } from './kanaele'
import { htmlToPdf, printHtml } from './services/export/pdf'
import { measureAndPrint } from './services/export/fillablePdf'
import { lanEreignis, lanRundruf, lanStatus, startLan, stopLan } from './services/lanServer'
import { ladeSicherung, listeSicherungen, sichereJetzt } from './services/storage/autoSicherung'
import { getSecret, getSettings, setSecret, setSettings } from './services/storage/settings'
import type { DavAbruf } from './services/iserv/webdav'
import { paketAusArgumenten } from './services/paket/wege'
import { langerExePfad, windowsFreigabe } from './services/netz/windowsFreigabe'

export interface ElectronUmgebungOptionen {
  /** Das Hauptfenster (kann fehlen, solange es noch nicht offen ist) */
  fenster: () => BrowserWindow | null
  /** Zustand des Schließens (main/index.ts, createWindow) */
  schliessen: { gesichert(): void; rueckfrage(): void; bleiben(): void }
  /** Alle registrierten Aufrufe – der Netzzugang leitet dorthin weiter */
  aufruf: (channel: string, args: unknown[]) => Promise<unknown>
  /** Ordner der ausgelieferten Oberfläche (für den Netzzugang) */
  oberflaeche: string
}

export function electronUmgebung(o: ElectronUmgebungOptionen): Umgebung {
  const an = (kanal: string, wert: unknown): void => {
    const win = o.fenster()
    if (win && !win.isDestroyed()) win.webContents.send(kanal, wert)
  }
  const fenster = (): BrowserWindow => o.fenster()!
  let letzterOrdner: string | undefined
  // Per Doppelklick bzw. „Öffnen mit" übergebenes Paket – einmal abholbar
  let startPaket: string | null | undefined

  return {
    /**
     * Ein Ereignis zu EINER Anfrage (Fortschritt, Warteplatz) dorthin schicken, wo sie herkam.
     *
     * Kam sie von einem Gerät im Netz, geht das Ereignis nur an dieses Gerät (services/lanServer.ts,
     * `lanEreignis`) – nicht ans Fenster, damit Rechner und Tablet sich nicht in die Quere kommen.
     */
    sende: (kanal, wert) => {
      if (lanEreignis(kanal, wert)) return
      an(kanal, wert)
    },
    /** Ein Ereignis, das alle angeht (z. B. geänderte KI-Modelle): ans Fenster und an jedes angemeldete Gerät. */
    rundruf: (kanal, wert) => {
      an(kanal, wert)
      lanRundruf(kanal, wert)
    },
    anOberflaeche: an,
    fenster: o.schliessen,
    dateiAusgeben: async (name, filters, daten) => {
      const res = await dialog.showSaveDialog(fenster(), { defaultPath: name, filters })
      if (res.canceled || !res.filePath) return null
      const inhalt = typeof daten === 'function' ? await daten() : daten
      writeFileSync(res.filePath, typeof inhalt === 'string' ? inhalt : Buffer.from(inhalt))
      return res.filePath
    },
    dateiWaehlen: async (filters, titel) => {
      const res = await dialog.showOpenDialog(fenster(), { title: titel, properties: ['openFile'], filters })
      return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
    },
    ordnerWaehlen: async (titel) => {
      const res = await dialog.showOpenDialog(fenster(), {
        title: titel ?? 'Ordner zum Speichern wählen',
        defaultPath: letzterOrdner,
        buttonLabel: 'Hier speichern',
        properties: ['openDirectory', 'createDirectory']
      })
      if (res.canceled || res.filePaths.length === 0) return null
      letzterOrdner = res.filePaths[0]
      return letzterOrdner
    },
    ordnerZeigen: async (ordner) => {
      const fehler = await shell.openPath(ordner)
      if (fehler) throw new Error(fehler)
    },
    // Mehrere Dateien (iPad: gemeinsam teilen) – der Explorer zeigt die erste
    imOrdnerZeigen: async (pfad) => shell.showItemInFolder(Array.isArray(pfad) ? pfad[0] : pfad),
    startDatei: () => process.argv.slice(1).find((a) => a.toLowerCase().endsWith('.vokabeltest')) ?? null,
    startPaket: () => {
      if (startPaket === undefined) startPaket = paketAusArgumenten(process.argv)
      const pfad = startPaket
      startPaket = null
      return pfad
    },
    druck: {
      pdf: async (html) => new Uint8Array(await htmlToPdf(html)),
      messenUndPdf: async (html) => {
        // Das Messskript des PCs ist dasselbe (fillablePdf.MEASURE_SCRIPT) – es läuft im unsichtbaren Fenster
        const { pdf, felder, audios, seite } = await measureAndPrint(html)
        return { pdf: new Uint8Array(pdf), messung: { felder, audios, seite } }
      },
      drucken: (html, optionen) => printHtml(html, optionen),
      drucker: async () =>
        (await fenster().webContents.getPrintersAsync()).map((p) => ({
          name: p.name,
          displayName: p.displayName || p.name,
          isDefault: Boolean((p as { isDefault?: boolean }).isDefault)
        }))
    },
    zertifikatWaehlen: async () => {
      const res = await dialog.showOpenDialog(fenster(), {
        title: 'Zertifikat zum Signieren wählen',
        properties: ['openFile'],
        filters: [{ name: 'Zertifikat mit privatem Schlüssel', extensions: ['pfx', 'p12'] }]
      })
      return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
    },
    sicherungen: {
      liste: () => listeSicherungen(),
      laden: (name) => ladeSicherung(name),
      jetzt: () => sichereJetzt(),
      ordnerWaehlen: async () => {
        const res = await dialog.showOpenDialog(fenster(), { title: 'Ordner für eine Kopie der Sicherungen', properties: ['openDirectory', 'createDirectory'] })
        return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
      }
    },
    /*
     * Der Zugang aus dem lokalen Netz.
     *
     * Er läuft NUR, solange das Programm läuft; beim Beenden wird er mitgenommen – ein Server,
     * der nach dem Schließen des Fensters weiterliefe, wäre genau die Art offener Tür, die
     * niemand bemerkt. Seit 30.09.2026 schaltet er sich beim Start wieder ein, wenn er einmal
     * eingerichtet wurde (Wunsch der Lehrkraft, abschaltbar: lanServer.ts, `lanBeimStart`).
     * PIN und Port bleiben dabei gleich, die Sperre nach zehn Fehlversuchen gilt weiter.
     */
    lan: {
      status: () => lanStatus(),
      start: async () => {
        const s = getSettings()
        const port = s.lan?.port || 8420
        const pin = s.lan?.pin || String(Math.floor(100000 + Math.random() * 900000))
        const stand = await startLan({ port, pin, wurzel: o.oberflaeche, aufruf: o.aufruf })
        // Gemerkt wird erst, wenn der Zugang wirklich läuft
        setSettings({ lan: { port, pin, eingerichtet: true, zuletztAn: true } })
        return stand
      },
      stop: () => {
        stopLan()
        const lan = getSettings().lan
        if (lan) setSettings({ lan: { ...lan, zuletztAn: false } })
        return lanStatus()
      }
    },
    /*
     * Windows-Firewall-Freigabe (30.09.2026): Port = der laufende Port des Netzzugangs, sonst der
     * eingestellte; Programm = der LANGE Pfad der laufenden exe (portabel: %TEMP%\Schul-Apps).
     */
    windowsFreigabe: windowsFreigabe({
      port: () => {
        const s = lanStatus()
        return s.laeuft && s.port ? s.port : getSettings().lan?.port || 8420
      },
      exe: () => langerExePfad()
    }),
    // „Abo über den PC" gibt es nur in der iPad-App – der PC IST der PC
    pcKi: null,
    // IServ per WebDAV (01.10.2026): Node-fetch (kein CORS), Passwort verschlüsselt in secrets.json
    iserv: {
      abruf: nodeDavAbruf,
      passwort: {
        lies: async () => getSecret('iserv') ?? null,
        setze: async (wert) => setSecret('iserv', wert),
        loesche: async () => setSecret('iserv', '')
      }
    }
  }
}

/** WebDAV über das fetch von Node – Weiterleitungen nur auf https (sonst ginge das Passwort offen) */
const nodeDavAbruf: DavAbruf = async (a) => {
  const res = await fetch(a.url, {
    method: a.methode,
    headers: a.kopf,
    body: a.koerper === undefined ? undefined : typeof a.koerper === 'string' ? a.koerper : Buffer.from(a.koerper),
    signal: AbortSignal.timeout(60_000)
  })
  if (res.url && !res.url.startsWith('https://')) throw new Error('Weiterleitung auf eine unverschlüsselte Adresse')
  if (a.binaer) return { status: res.status, text: '', bytes: new Uint8Array(await res.arrayBuffer()) }
  return { status: res.status, text: await res.text() }
}
