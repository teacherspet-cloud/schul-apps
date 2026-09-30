import type { Plugin } from '@capacitor/core'

export interface PdfErzeugenOptionen {
  /** Vollstaendiges HTML-Dokument (Stile und Bilder eingebettet). */
  html: string
  /**
   * Optionaler JavaScript-Ausdruck, der nach dem Laden (Schriften und Bilder fertig) im
   * Dokument ausgewertet wird. Ein Promise wird abgewartet; das Ergebnis kommt als Text
   * (Nicht-Text-Werte als JSON) in `messung` zurueck.
   */
  messen?: string
}

export interface PdfErzeugenErgebnis {
  /** PDF als Base64 (A4 bzw. A4 quer je Seite). */
  pdf: string
  messung?: string
}

export interface PdfDruckenOptionen {
  /** PDF als Base64. */
  pdf: string
  /** Name des Druckauftrags. */
  name?: string
}

export interface PdfDruckPlugin extends Plugin {
  erzeugen(optionen: PdfErzeugenOptionen): Promise<PdfErzeugenErgebnis>
  drucken(optionen: PdfDruckenOptionen): Promise<{ abgeschlossen: boolean }>
}

export interface SchluesselbundPlugin extends Plugin {
  get(): Promise<{ value: string | null }>
  set(optionen: { value: string }): Promise<void>
  remove(): Promise<void>
}

export interface ScannerPlugin extends Plugin {
  /** Mehrseitiger Scan; jede Seite als Base64-JPEG. Abbruch ergibt eine leere Liste. */
  scannen(): Promise<{ seiten: string[] }>
}

export interface HintergrundPlugin extends Plugin {
  /** Bittet iOS um Hintergrundzeit (meist rund 30 s); id null = nicht gewaehrt. */
  beginnen(): Promise<{ id: string | null }>
  beenden(optionen: { id: string }): Promise<void>
}

export declare const PdfDruck: PdfDruckPlugin
export declare const Schluesselbund: SchluesselbundPlugin
export declare const Scanner: ScannerPlugin
export declare const Hintergrund: HintergrundPlugin
