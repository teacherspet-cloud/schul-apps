/**
 * Die nativen Bausteine der iPad-App (plugins/schulapps-nativ, Swift) – aus Sicht der Web-Seite.
 *
 * Eingebunden über `registerPlugin` mit denselben Namen wie im Swift-Code (`jsName`). Im Browser
 * (npm run dev:mobil, Rauchtest mit Playwright) gibt es sie nicht; dort greifen die Ersatzwege
 * dieser Datei: Schlüssel im localStorage, Drucken über den Druckdialog des Browsers.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

export interface PdfDruckPlugin {
  /** PDF aus HTML (unsichtbarer WKWebView); `messen` ist ein JS-Ausdruck, sein Ergebnis kommt als JSON-Text zurück */
  erzeugen(o: { html: string; messen?: string }): Promise<{ pdf: string; messung?: string }>
  /** PDF über AirPrint drucken */
  drucken(o: { pdf: string; name?: string }): Promise<{ abgeschlossen: boolean }>
}

/** `konto`: eigener Eintrag (z. B. 'iserv', 01.10.2026); ohne = der Eintrag der API-Schlüssel */
export interface SchluesselbundPlugin {
  get(o?: { konto?: string }): Promise<{ value?: string | null }>
  set(o: { value: string; konto?: string }): Promise<void>
  remove(o?: { konto?: string }): Promise<void>
}

export const nativ = (): boolean => Capacitor.isNativePlatform()

const pdfDruckNativ = registerPlugin<PdfDruckPlugin>('PdfDruck')
const schluesselbundNativ = registerPlugin<SchluesselbundPlugin>('Schluesselbund')

/** Derselbe Schlüssel wie im Web-Ersatz des Plugins (plugins/schulapps-nativ/web.js) */
const SPEICHER_SCHLUESSEL = 'schulapps.secrets'
const speicherSchluessel = (konto?: string): string => (konto ? `${SPEICHER_SCHLUESSEL}.${konto}` : SPEICHER_SCHLUESSEL)

export const Schluesselbund: SchluesselbundPlugin = {
  get: async (o) => {
    if (nativ()) return schluesselbundNativ.get(o?.konto ? { konto: o.konto } : undefined)
    try {
      return { value: localStorage.getItem(speicherSchluessel(o?.konto)) }
    } catch {
      return { value: null }
    }
  },
  set: async (o) => {
    if (nativ()) return schluesselbundNativ.set(o)
    localStorage.setItem(speicherSchluessel(o.konto), o.value)
  },
  remove: async (o) => {
    if (nativ()) return schluesselbundNativ.remove(o?.konto ? { konto: o.konto } : undefined)
    try {
      localStorage.removeItem(speicherSchluessel(o?.konto))
    } catch {
      // nichts zu tun
    }
  }
}

export const PdfDruck = {
  verfuegbar: nativ,
  erzeugen: (o: { html: string; messen?: string }) => pdfDruckNativ.erzeugen(o),
  drucken: (o: { pdf: string; name?: string }) => pdfDruckNativ.drucken(o)
}

interface HintergrundPlugin {
  beginnen(): Promise<{ id?: string | null }>
  beenden(o: { id: string }): Promise<void>
}

const hintergrundNativ = registerPlugin<HintergrundPlugin>('Hintergrund')

/**
 * Hintergrundzeit für laufende KI-Aufträge (30.09.2026, mobil/hintergrund.ts). Eine ältere
 * App ohne diese Methode liefert einen Fehler – dann eben ohne Hintergrundzeit.
 */
export const Hintergrund = {
  beginnen: async (): Promise<string | null> => {
    if (!nativ()) return null
    try {
      return (await hintergrundNativ.beginnen()).id ?? null
    } catch {
      return null
    }
  },
  beenden: async (id: string): Promise<void> => {
    if (!nativ() || !id) return
    await hintergrundNativ.beenden({ id }).catch(() => undefined)
  }
}

interface DateienPlugin {
  exportieren(o: { name: string; base64: string }): Promise<{ gespeichert: boolean }>
}

const dateienNativ = registerPlugin<DateienPlugin>('Dateien')

/**
 * In die Dateien-App exportieren (01.10.2026): der Dokumentauswahl-Dialog von iOS im Exportmodus
 * – jeder Ort, den die Dateien-App kennt (iCloud Drive, Auf meinem iPad, eingebundene Anbieter).
 * null = nicht verfügbar (Browser oder ältere App ohne diese Methode).
 */
export const Dateien = {
  verfuegbar: nativ,
  exportieren: async (name: string, base64: string): Promise<boolean | null> => {
    if (!nativ()) return null
    try {
      return (await dateienNativ.exportieren({ name, base64 })).gespeichert
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      if (/not implemented|unimplemented|nicht implementiert/i.test(text)) return null
      throw e
    }
  }
}
