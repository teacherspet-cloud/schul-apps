/**
 * Dateieigenschaften eines fertigen PDF setzen (Großprogramm 0.4, Rechtspaket).
 *
 * `printToPDF` schreibt nur den Titel aus dem HTML und „Chromium" als Erzeuger. Hier kommen
 * Erzeuger, und – wenn eine KI mitgewirkt hat – die maschinenlesbare Kennzeichnung ins
 * Info-Verzeichnis: Betreff mit dem Vermerk, Stichwörter „KI-generiert; AI-generated; …" und
 * eigene Einträge (KI-Anbieter, KI-Modell, KI-Datum). Scheitert das (defektes PDF), bleibt das
 * PDF, wie es war – die Kennzeichnung darf das Speichern nie verhindern.
 */
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { kiEigenschaften, kiStichwoerter, kiVermerkText, leseKiMeta } from '@shared/kiKennzeichnung'

export async function mitPdfMetadaten(pdf: Uint8Array, html: string): Promise<Uint8Array> {
  const ki = leseKiMeta(html)
  const titel = html
    .slice(0, 20000)
    .match(/<title>([^<]*)<\/title>/)?.[1]
    ?.trim()
  try {
    const doc = await PDFDocument.load(pdf, { updateMetadata: false })
    doc.setCreator('Schul-Apps')
    doc.setProducer('Schul-Apps (Chromium)')
    if (titel) doc.setTitle(titel.replace(/&amp;/g, '&'))
    if (ki) {
      doc.setSubject(kiVermerkText(ki))
      doc.setKeywords(kiStichwoerter(ki).split('; '))
      // Eigene Einträge im Info-Verzeichnis – lesbar z. B. in den Dokumenteigenschaften des PDF-Betrachters
      const info = doc.context.lookup(doc.context.trailerInfo.Info)
      if (info && 'set' in info) {
        for (const { name, value } of kiEigenschaften(ki))
          (info as { set: (k: PDFName, v: PDFString) => void }).set(PDFName.of(name.replace(/[^A-Za-z0-9-]/g, '')), PDFString.of(value))
      }
    }
    return await doc.save({ useObjectStreams: false })
  } catch {
    return pdf
  }
}
