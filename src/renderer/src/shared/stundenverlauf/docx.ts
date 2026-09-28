/**
 * Stundenverlauf als Word-Datei (Großprogramm 0.4, F4): A4 quer, eine Tabelle mit festen
 * Spaltenbreiten (ohne `columnWidths` setzt Word Standardbreiten – Befund vom 28.09.2026).
 */
import { AlignmentType, Document, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx'
import { kiWordEigenschaften, type KiHerkunft } from '@shared/kiKennzeichnung'
import { A4_HEIGHT, A4_WIDTH, ALL_BORDERS, MM } from '../export/docxKit'
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
            : [])
        ]
      }
    ]
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}
