/**
 * Gewählte Seiten aus einem fertigen PDF – nur für Dokumente OHNE Seitenzahlen-Marken
 * (Elternbrief, Rückmeldung, Tafelbild …). Dort fließt der Text frei über die Seiten, die Seiten
 * stehen erst nach dem Umrechnen fest – und es gibt keine Zahl, die neu gezählt werden müsste.
 * Dokumente mit Seitenzahlen wählen VOR dem Umrechnen aus (seitenAuswahl.ts).
 */
export async function pdfMitSeiten(bytes: Uint8Array, seiten: number[]): Promise<Uint8Array> {
  // Erst bei Bedarf geladen – wie in netzZugang.ts
  const { PDFDocument } = await import('pdf-lib')
  const quelle = await PDFDocument.load(bytes)
  const anzahl = quelle.getPageCount()
  const indizes = [...new Set(seiten)]
    .filter((s) => s >= 1 && s <= anzahl)
    .sort((a, b) => a - b)
    .map((s) => s - 1)
  if (indizes.length === anzahl) return bytes
  const ziel = await PDFDocument.create()
  ziel.setTitle(quelle.getTitle() ?? '')
  for (const seite of await ziel.copyPages(quelle, indizes)) ziel.addPage(seite)
  return ziel.save()
}
