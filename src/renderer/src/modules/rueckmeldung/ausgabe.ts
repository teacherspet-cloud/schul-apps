/**
 * Rückmeldebögen als PDF und Word (Großprogramm 0.4, F3). Je Abgabe eine Seite; mehrere Bögen
 * in einer Datei stehen je auf eigener Seite. Der Name steht erst HIER auf dem Bogen – lokal
 * eingesetzt, die KI hat nur das Kürzel gesehen.
 */
import { bogenUeberschriften } from './render/texte'
import { AlignmentType, Document, Packer, PageBreak, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx'
import { kiMetaTag, kiVermerkText, kiWordEigenschaften, vermerkSichtbar } from '@shared/kiKennzeichnung'
import { setzeNamenEin } from '@shared/pseudonymisierung'
import { A4_WIDTH, ALL_BORDERS, MM } from '../../shared/export/docxKit'
import type { Abgabe, Bogen, Rueckmeldung } from './model/types'

const SYMBOL: Record<string, string> = { sicher: '●●●', teilweise: '●●○', 'noch nicht': '●○○' }

/** Kürzel im Bogen durch den Namen ersetzen (nur, wenn einer eingetragen ist) */
function mitName(text: string, a: Abgabe): string {
  const zuordnung = [...(a.pseudonyme ?? []), ...(a.name.trim() ? [{ kuerzel: a.kuerzel, name: a.name.trim() }] : [])]
  return zuordnung.length ? setzeNamenEin(text, zuordnung) : text
}

const titelZeile = (r: Rueckmeldung): string => ['Rückmeldung', r.meta.subjectLabel, r.grundlage.titel].filter(Boolean).join(' · ')
const fuer = (_r: Rueckmeldung, a: Abgabe): string => `für ${a.name.trim() || a.kuerzel}`

const ueberschriften = (r: Rueckmeldung): ReturnType<typeof bogenUeberschriften> => bogenUeberschriften(r.meta.anrede)

// ---------- PDF (HTML) ----------

export function boegenHtml(r: Rueckmeldung, abgaben: Abgabe[]): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const u = ueberschriften(r)
  const vermerk = vermerkSichtbar(r.meta.ki, r.meta.kiVermerk, false) && r.meta.ki ? `<p class="ki">${esc(kiVermerkText(r.meta.ki))}</p>` : ''
  const seite = (a: Abgabe): string => {
    const b = a.bogen as Bogen
    const n = (s: string): string => esc(mitName(s, a))
    return `<section class="seite">
<h1>${esc(titelZeile(r))}</h1><p class="fuer">${esc(fuer(r, a))} · Klasse ${r.meta.grade}</p>
<h2>${u.staerken}</h2><ul>${b.staerken.map((s) => `<li>${n(s)}</li>`).join('')}</ul>
<h2>${u.schritte}</h2><ol>${b.schritte.map((s) => `<li>${n(s)}</li>`).join('')}</ol>
${b.kriterien.length ? `<h2>${u.kriterien}</h2><table><tbody>${b.kriterien.map((k) => `<tr><td class="k">${n(k.kriterium)}</td><td class="e">${SYMBOL[k.einschaetzung]} ${esc(k.einschaetzung)}</td><td>${k.beleg ? `„${n(k.beleg)}“` : ''}</td></tr>`).join('')}</tbody></table><p class="legende">●●● sicher · ●●○ teilweise · ●○○ noch nicht</p>` : ''}
${b.schluss ? `<p class="schluss">${n(b.schluss)}</p>` : ''}${vermerk}</section>`
  }
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titelZeile(r))}</title>${kiMetaTag(r.meta.ki)}<style>
@page { size: A4; margin: 18mm 18mm 16mm 22mm; }
body { font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 11.5pt; line-height: 1.45; color: #000; margin: 0; }
.seite { page-break-after: always; } .seite:last-child { page-break-after: auto; }
h1 { font-size: 15pt; margin: 0; } .fuer { color: #444; margin: 1mm 0 5mm; border-bottom: 0.3mm solid #999; padding-bottom: 2mm; }
h2 { font-size: 12.5pt; margin: 5mm 0 1.5mm; } ul, ol { margin: 0; padding-left: 6mm; } li { margin-bottom: 1.5mm; }
table { width: 100%; border-collapse: collapse; margin-top: 1mm; } td { border: 0.3mm solid #aaa; padding: 1.5mm 2mm; vertical-align: top; }
td.k { width: 32%; font-weight: 600; } td.e { width: 22%; white-space: nowrap; } .legende { font-size: 9pt; color: #666; margin: 1mm 0 0; }
.schluss { margin-top: 6mm; font-style: italic; } .ki { margin-top: 8mm; font-size: 7pt; color: #777; }
</style></head><body>${abgaben
    .filter((a) => a.bogen)
    .map(seite)
    .join('\n')}</body></html>`
}

// ---------- Word ----------

export async function boegenDocx(r: Rueckmeldung, abgaben: Abgabe[]): Promise<Uint8Array> {
  const rand = Math.round(18 * MM)
  const breite = A4_WIDTH - rand - Math.round(22 * MM)
  const u = ueberschriften(r)
  const spalten = [0.32, 0.22, 0.46].map((x) => Math.round(breite * x))
  const kinder: (Paragraph | Table)[] = []
  const fertige = abgaben.filter((a) => a.bogen)
  fertige.forEach((a, i) => {
    const b = a.bogen as Bogen
    const n = (s: string): string => mitName(s, a)
    if (i > 0) kinder.push(new Paragraph({ children: [new PageBreak()] }))
    kinder.push(
      new Paragraph({ children: [new TextRun({ text: titelZeile(r), bold: true, size: 30 })] }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `${fuer(r, a)} · Klasse ${r.meta.grade}`, color: '444444' })] }),
      new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: u.staerken, bold: true, size: 25 })] }),
      ...b.staerken.map((s) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(n(s))] })),
      new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: u.schritte, bold: true, size: 25 })] }),
      ...b.schritte.map((s, k) => new Paragraph({ children: [new TextRun(`${k + 1}. ${n(s)}`)] }))
    )
    if (b.kriterien.length) {
      kinder.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: u.kriterien, bold: true, size: 25 })] }))
      const zelle = (text: string, j: number, fett = false): TableCell =>
        new TableCell({
          width: { size: spalten[j], type: WidthType.DXA },
          borders: ALL_BORDERS,
          children: [new Paragraph({ children: [new TextRun({ text, bold: fett })] })]
        })
      kinder.push(
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: breite, type: WidthType.DXA },
          columnWidths: spalten,
          rows: b.kriterien.map(
            (k) =>
              new TableRow({
                children: [
                  zelle(n(k.kriterium), 0, true),
                  zelle(`${SYMBOL[k.einschaetzung]} ${k.einschaetzung}`, 1),
                  zelle(k.beleg ? `„${n(k.beleg)}“` : '', 2)
                ]
              })
          )
        }),
        new Paragraph({ children: [new TextRun({ text: '●●● sicher · ●●○ teilweise · ●○○ noch nicht', size: 17, color: '666666' })] })
      )
    }
    if (b.schluss) kinder.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: n(b.schluss), italics: true })] }))
    if (r.meta.ki && vermerkSichtbar(r.meta.ki, r.meta.kiVermerk, false))
      kinder.push(
        new Paragraph({
          spacing: { before: 300 },
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: kiVermerkText(r.meta.ki), size: 14, color: '777777' })]
        })
      )
  })
  const doc = new Document({
    creator: 'Schul-Apps',
    title: titelZeile(r),
    ...kiWordEigenschaften(r.meta.ki),
    styles: { default: { document: { run: { font: 'Calibri', size: 23 } } } },
    sections: [
      {
        properties: { page: { margin: { top: rand, bottom: Math.round(16 * MM), left: Math.round(22 * MM), right: rand } } },
        children: kinder.length ? kinder : [new Paragraph('')]
      }
    ]
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}
