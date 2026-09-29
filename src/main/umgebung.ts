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
import { getSettings, setSettings } from './services/storage/settings'
import { paketAusArgumenten } from './services/paket/wege'

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
    imOrdnerZeigen: async (pfad) => shell.showItemInFolder(pfad),
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
     * Er läuft NUR, solange er eingeschaltet ist, und ist beim Start des Programms immer aus.
     * Beim Beenden wird er mitgenommen – ein Server, der nach dem Schließen des Fensters
     * weiterliefe, wäre genau die Art offener Tür, die niemand bemerkt.
     */
    lan: {
      status: () => lanStatus(),
      start: () => {
        const s = getSettings()
        const port = s.lan?.port || 8420
        const pin = s.lan?.pin || String(Math.floor(100000 + Math.random() * 900000))
        if (pin !== s.lan?.pin) setSettings({ lan: { port, pin } })
        return startLan({ port, pin, wurzel: o.oberflaeche, aufruf: o.aufruf })
      },
      stop: () => {
        stopLan()
        return lanStatus()
      }
    }
  }
}
