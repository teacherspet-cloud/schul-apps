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

export interface SchluesselbundPlugin {
  get(): Promise<{ value?: string | null }>
  set(o: { value: string }): Promise<void>
  remove(): Promise<void>
}

export const nativ = (): boolean => Capacitor.isNativePlatform()

const pdfDruckNativ = registerPlugin<PdfDruckPlugin>('PdfDruck')
const schluesselbundNativ = registerPlugin<SchluesselbundPlugin>('Schluesselbund')

/** Derselbe Schlüssel wie im Web-Ersatz des Plugins (plugins/schulapps-nativ/web.js) */
const SPEICHER_SCHLUESSEL = 'schulapps.secrets'

export const Schluesselbund: SchluesselbundPlugin = {
  get: async () => {
    if (nativ()) return schluesselbundNativ.get()
    try {
      return { value: localStorage.getItem(SPEICHER_SCHLUESSEL) }
    } catch {
      return { value: null }
    }
  },
  set: async (o) => {
    if (nativ()) return schluesselbundNativ.set(o)
    localStorage.setItem(SPEICHER_SCHLUESSEL, o.value)
  },
  remove: async () => {
    if (nativ()) return schluesselbundNativ.remove()
    try {
      localStorage.removeItem(SPEICHER_SCHLUESSEL)
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
