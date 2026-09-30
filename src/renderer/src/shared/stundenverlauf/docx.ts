/**
 * Stundenverlauf als Word-Datei (Großprogramm 0.4, F4): A4 quer, eine Tabelle mit festen
 * Spaltenbreiten (ohne `columnWidths` setzt Word Standardbreiten – Befund vom 28.09.2026).
 */
import { AlignmentType, Document, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx'
import { kiWordEigenschaften, type KiHerkunft } from '@shared/kiKennzeichnung'
import { A4_HEIGHT, A4_WIDTH, ALL_BORDERS, imageRun, MM } from '../export/docxKit'
import { bildKennzeichnung, IMPULS_ARTEN, lizenzHinweis, type Einstiegsimpuls } from './einstiegsimpuls'
import type { Stundenverlauf } from './stundenverlauf'

const RAND = Math.round(14 * MM)

export async function verlaufDocx(v: Stundenverlauf, titel: string, untertitel: string, ki?: KiHerkunft): Promise<Uint8Array> {
  const breite = A4_HEIGHT - 2 * RAND
  const anteile = [0.14, 0.06, 0.53, 0.09, 0.18]
  const spalten = anteile.map((a) => Math.round(breite * a))
  const zelle = (text: string, i: number, kopf = false): TableCell =>
    new TableCell({
      width: { size: spalten[i], type: WidthType.DXA },
      borders: ALL_BORDERS,
      ...(kopf ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EEEEEE' } } : {}),
      children: text.split(' · ').map((zeile) => new Paragraph({ children: [new TextRun({ text: zeile, bold: kopf || i === 0, size: 20 })] }))
    })
  const kopf = new TableRow({
    tableHeader: true,
    children: ['Phase', 'Zeit', 'Geplantes Geschehen', 'Sozialform', 'Medien / Material'].map((t, i) => zelle(t, i, true))
  })
  const zeilen = v.phasen.map((p) => new TableRow({ children: [p.phase, `${p.minuten}′`, p.geschehen, p.sozialform, p.medien].map((t, i) => zelle(t, i)) }))
  const doc = new Document({
    creator: 'Schul-Apps',
    title: `Stundenverlauf – ${titel}`,
    ...kiWordEigenschaften(ki),
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH, height: A4_HEIGHT, orientation: PageOrientation.LANDSCAPE },
            margin: { top: RAND, bottom: RAND, left: RAND, right: RAND }
          }
        },
        children: [
          new Paragraph({ children: [new TextRun({ text: `Stundenverlauf – ${titel}`, bold: true, size: 30 })] }),
          new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: `${untertitel} · ${v.dauer} Minuten`, color: '555555', size: 20 })] }),
          ...(v.ziel ? [new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: 'Stundenziel: ', bold: true }), new TextRun(v.ziel)] })] : []),
          new Table({ layout: TableLayoutType.FIXED, width: { size: breite, type: WidthType.DXA }, columnWidths: spalten, rows: [kopf, ...zeilen] }),
          ...(v.hinweise
            ? [
                new Paragraph({
                  spacing: { before: 200 },
                  alignment: AlignmentType.LEFT,
                  children: [new TextRun({ text: 'Hinweise: ', bold: true }), new TextRun(v.hinweise)]
                })
              ]
            : []),
          ...v.phasen.flatMap((p) => (p.impuls ? impulsAbsaetze(p.impuls, p.phase, breite) : []))
        ]
      }
    ]
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}

/**
 * Der Einstiegsimpuls unter der Tabelle: Bild (höchstens 9 cm hoch) mit Kennzeichnung bzw.
 * Quellenangabe, dann Leitfrage, Moderation, erwartete Beiträge und Überleitung.
 */
function impulsAbsaetze(i: Einstiegsimpuls, phase: string, breite: number): Paragraph[] {
  const fett = (label: string, text: string): Paragraph =>
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${label} `, bold: true }), new TextRun(text)] })
  const punkte = (xs: string[]): Paragraph[] => xs.map((x) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(x)] }))
  const aus: Paragraph[] = [
    new Paragraph({
      spacing: { before: 280, after: 100 },
      children: [new TextRun({ text: `${phase}: ${IMPULS_ARTEN[i.art]?.label ?? 'Impuls'} – ${i.titel}`, bold: true, size: 24 })]
    })
  ]
  // Nur Rasterbilder (PNG/JPEG/GIF) – Word kann SVG nicht ohne Ersatzbild
  if (i.image?.dataUrl && /^data:image\/(png|jpe?g|gif);/.test(i.image.dataUrl)) {
    const format = i.bildFormat && i.bildFormat > 0 ? i.bildFormat : 4 / 3
    // 96 dpi: 9 cm Höhe ≈ 340 Punkte, Breite höchstens Satzspiegel (Twips → Punkte: /15)
    const hoehe = Math.min(340, breite / 15 / format)
    aus.push(new Paragraph({ children: [imageRun(i.image.dataUrl, hoehe * format, hoehe)] }))
    aus.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: [bildKennzeichnung(i.image), lizenzHinweis(i.image)].filter(Boolean).join(' · '), size: 16, color: '444444' })]
      })
    )
  }
  if (i.zitat) aus.push(fett('Zitat:', `„${i.zitat.text}" – ${i.zitat.quelle || 'Quelle fehlt'}`))
  if (i.beschreibung) aus.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun(i.beschreibung)] }))
  if (i.bezug) aus.push(fett('Bezug zum Stundenziel:', i.bezug))
  if (i.leitfrage) aus.push(fett('Leitfrage:', i.leitfrage))
  if (i.moderation.length) aus.push(fett('Moderation:', ''), ...punkte(i.moderation))
  if (i.erwartungen.length) aus.push(fett('Erwartete Beiträge:', ''), ...punkte(i.erwartungen))
  if (i.ueberleitung) aus.push(fett('Überleitung:', i.ueberleitung))
  return aus
}
