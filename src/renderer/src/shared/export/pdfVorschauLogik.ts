/**
 * PDF-Vorschau ohne Speichern (10.10.2026) – der Teil ohne Oberfläche, damit er sich prüfen lässt
 * (tests/pdfVorschau.test.ts). Die Anzeige steckt in export/PdfVorschau.tsx.
 *
 * Wunsch der Lehrkraft: Vor dem Speichern sehen, wie das PDF wirklich aussieht – nicht die
 * Druckvorschau aus HTML, sondern dieselbe Datei, die gespeichert würde. Ein „Vorschau"-Knopf läuft
 * dafür durch denselben Weg wie „Speichern" (`alsVorschau`); `speichereAusgabe` (export/ausgabe.tsx)
 * merkt das, baut die PDFs nur im Speicher und zeigt sie. Erst „PDF speichern" im Fenster speichert.
 */

/** Zusätze eines PDFs, soweit sie die Vorschau betreffen (Formularfelder, Hörtexte, Seitenauswahl) */
export interface VorschauZusatz {
  fillable?: boolean
  audio?: { id: string; fileName: string; title: string; base64: string }[]
  seiten?: number[]
}

export interface VorschauQuelle {
  name: string
  html: string
  pdf?: VorschauZusatz
}

export interface VorschauPdf {
  name: string
  bytes: Uint8Array
}

/** Was die Vorschau zum Umrechnen braucht – in der App window.api.exporter und shared/seitenPdf.ts */
export interface VorschauWerkzeug {
  preview: (html: string) => Promise<Uint8Array>
  fillablePreview: (html: string, audio?: VorschauZusatz['audio']) => Promise<Uint8Array>
  mitSeiten: (bytes: Uint8Array, seiten: number[]) => Promise<Uint8Array>
}

/**
 * Dieselben PDFs wie beim Speichern, nur ohne Datei: Formular bzw. Hörtexte über die Formular-Vorschau,
 * sonst das reine Abbild; gewählte Seiten wie beim Speichern herausgeschnitten.
 * Nicht enthalten: Signatur und Info-Verzeichnis – beides sieht man im Bild ohnehin nicht.
 */
export async function vorschauPdfs(quellen: VorschauQuelle[], w: VorschauWerkzeug): Promise<VorschauPdf[]> {
  const aus: VorschauPdf[] = []
  for (const q of quellen) {
    const extra = Boolean(q.pdf?.fillable || q.pdf?.audio?.length)
    const ganz = extra ? await w.fillablePreview(q.html, q.pdf?.audio) : await w.preview(q.html)
    const bytes = q.pdf?.seiten?.length ? await w.mitSeiten(ganz, q.pdf.seiten) : ganz
    aus.push({ name: q.name, bytes })
  }
  return aus
}

export type VorschauArt = 'rahmen' | 'seiten'

/**
 * Wie das PDF gezeigt wird: im Rahmen mit dem PDF-Betrachter des Browsers, wo es einen gibt – sonst
 * als Seitenbilder (pdf.js). iPad/iPhone zeigen im Rahmen nur die erste Seite und lassen nicht
 * blättern; Android-Browser haben keinen eingebauten Betrachter (`pdfViewerEnabled` false).
 */
export function vorschauArt(u: { pdfViewerEnabled?: boolean; ios: boolean; userAgent: string }): VorschauArt {
  if (u.ios) return 'seiten'
  if (/Android|Mobile/i.test(u.userAgent)) return 'seiten'
  return u.pdfViewerEnabled ? 'rahmen' : 'seiten'
}

/*
 * Der Vorschau-Lauf. Solange `alsVorschau` läuft, speichert `speichereAusgabe` nicht, sondern zeigt.
 * Ein Zähler statt eines Schalters, der „einmal gilt": Bricht ein Programm vor dem Speichern ab
 * (Fehler, Abbruch im Dialog), bliebe ein Schalter stehen – und das nächste echte Speichern zeigte
 * nur eine Vorschau.
 */
let tiefe = 0
let gespeichert = 0

export const vorschauAktiv = (): boolean => tiefe > 0

/** Die Vorschau hat (über „PDF speichern") so viele Dateien gespeichert */
export function meldeVorschauGespeichert(anzahl: number): void {
  gespeichert = anzahl
}

/**
 * `ausgabe` wie beim Speichern aufrufen, aber als Vorschau. Liefert die Zahl der gespeicherten
 * Dateien – 0, wenn das Fenster nur geschlossen wurde. `ausgabe` muss bis zum Ende des Speicherns
 * warten (also das Promise von `speichereAusgabe` zurückgeben bzw. abwarten).
 */
export async function alsVorschau(ausgabe: () => unknown): Promise<number> {
  tiefe++
  gespeichert = 0
  try {
    await ausgabe()
  } finally {
    tiefe--
  }
  return gespeichert
}
