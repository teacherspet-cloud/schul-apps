/**
 * Ergebnisse eines Onlinetests ausgeben (02.10.2026, Wunsch der Lehrkraft): PDF, Excel, Word,
 * Drucken – und für TeacherTool.
 *
 * TeacherTool (Udo Hilwerling, Version 7.13; Recherche 02.10.2026):
 *  - BELEGT: CSV-Import legt einen NEUEN Kurs mit Stammdaten an (Vorname, Name, Gruppen/Klasse;
 *    Spalten und Kodierung wählt man im Import-Dialog) – teachertool.de/features,
 *    Datenschutz-PDF (Stand 1.11.2023), Changelog 7.5 („Klasse", „Jahrgangsstufe").
 *  - NICHT GEFUNDEN: ein Import von Noten (CSV, Excel, Zwischenablage). Deshalb – abgestimmt –
 *    eine Abschreibliste in der Reihenfolge der Kursliste (Nachname, Vorname) mit Noten im
 *    TeacherTool-Format, die CSV für einen neuen Kurs und die Notenspalte für die Zwischenablage
 *    (falls TeacherTool Desktop Einfügen kann – nicht belegt).
 *  - Tendenzen (+/−): FAUSTREGEL der App, nicht aus TeacherTool – oberes Drittel der Notenstufe
 *    „+", unteres Drittel „−" (bei 1 kein „+", bei 6 keine Tendenz).
 */
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import { strToU8, zipSync } from 'fflate'
import { gradeBoundaries } from '../../shared/gradeScale'

export interface ErgebnisZeile {
  name: string
  fassung: string
  punkte: number
  max: number
  note: number | null
  abgabe: number | null
  verlassen: boolean
  /** Noch offene bzw. zu entscheidende Antworten */
  offen: number
}

export interface ErgebnisDaten {
  titel: string
  lerngruppe: string
  datum: string
  schwellen: number[]
  zeilen: ErgebnisZeile[]
}

export type NotenFormat = 'ganz' | 'tendenz' | 'punkte'

/** „Anna K." → Vorname „Anna", Name „K."; „Max Mustermann" → „Max" / „Mustermann" */
export function namensTeile(name: string): { vorname: string; nachname: string } {
  const teile = name.trim().split(/\s+/)
  if (teile.length < 2) return { vorname: teile[0] ?? '', nachname: '' }
  return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] }
}

/** Reihenfolge wie die Kursliste: Nachname, dann Vorname */
export const nachKursliste = (zeilen: ErgebnisZeile[]): ErgebnisZeile[] =>
  [...zeilen].sort((a, b) => {
    const x = namensTeile(a.name)
    const y = namensTeile(b.name)
    return x.nachname.localeCompare(y.nachname, 'de') || x.vorname.localeCompare(y.vorname, 'de')
  })

/** Note mit Tendenz (Faustregel, siehe oben) */
export function noteMitTendenz(punkte: number, max: number, schwellen: number[]): string {
  const stufen = gradeBoundaries(max, schwellen)
  const i = stufen.findIndex((s) => punkte >= s.fromPoints)
  if (i < 0) return String(stufen[stufen.length - 1]?.grade ?? '')
  const s = stufen[i]
  if (s.grade === 6) return '6'
  const oben = i === 0 ? max : stufen[i - 1].fromPoints - 1
  const breite = oben - s.fromPoints + 1
  if (breite < 3) return String(s.grade)
  const lage = (punkte - s.fromPoints) / breite
  if (lage >= 2 / 3 && s.grade !== 1) return `${s.grade}+`
  if (lage < 1 / 3) return `${s.grade}-`
  return String(s.grade)
}

export function noteAlsText(z: ErgebnisZeile, format: NotenFormat, schwellen: number[]): string {
  if (z.note == null) return ''
  if (format === 'punkte') return String(z.punkte)
  if (format === 'tendenz') return noteMitTendenz(z.punkte, z.max, schwellen)
  return String(z.note)
}

const prozent = (z: ErgebnisZeile): number => (z.max ? Math.round((z.punkte / z.max) * 100) : 0)
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function kennzahlen(d: ErgebnisDaten): { verteilung: number[]; schnitt: string } {
  const noten = d.zeilen.map((z) => z.note).filter((n): n is number => n != null)
  return {
    verteilung: [1, 2, 3, 4, 5, 6].map((n) => noten.filter((x) => x === n).length),
    schnitt: noten.length ? (noten.reduce((a, b) => a + b, 0) / noten.length).toFixed(2).replace('.', ',') : '–'
  }
}

/** Druck- und PDF-Fassung (A4) */
export function ergebnisHtml(d: ErgebnisDaten, format: NotenFormat = 'ganz', abschreibliste = false): string {
  const zeilen = abschreibliste ? nachKursliste(d.zeilen) : d.zeilen
  const { verteilung, schnitt } = kennzahlen(d)
  const offen = d.zeilen.reduce((s, z) => s + z.offen, 0)
  const zeile = (z: ErgebnisZeile, i: number): string =>
    abschreibliste
      ? `<tr><td>${i + 1}</td><td>${esc(namensTeile(z.name).nachname)}</td><td>${esc(namensTeile(z.name).vorname)}</td><td class="note">${esc(noteAlsText(z, format, d.schwellen))}</td><td class="r">${z.punkte}/${z.max}</td></tr>`
      : `<tr><td>${i + 1}</td><td>${esc(z.name)}</td><td>${esc(z.fassung)}</td><td class="r">${z.abgabe ? `${z.punkte}/${z.max}` : '–'}</td><td class="r">${z.abgabe ? `${prozent(z)} %` : ''}</td><td class="note">${esc(noteAlsText(z, format, d.schwellen))}</td><td>${z.verlassen ? 'Seite verlassen' : z.offen ? `${z.offen} offen` : ''}</td></tr>`
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(d.titel)}</title><style>
@page { size: A4; margin: 18mm 16mm; }
body { font: 11pt/1.4 "Segoe UI", Arial, sans-serif; color: #111; }
h1 { font-size: 16pt; margin: 0 0 2mm; } p.leise { color: #555; margin: 0 0 6mm; }
table { border-collapse: collapse; width: 100%; } th, td { border: 0.3mm solid #999; padding: 1.6mm 2.2mm; text-align: left; }
th { background: #eef2f4; } td.r { text-align: right; white-space: nowrap; } td.note { font-weight: 700; font-size: ${abschreibliste ? '14pt' : '11pt'}; text-align: center; }
tr:nth-child(even) td { background: #fafbfc; } .unten { margin-top: 6mm; color: #333; } .hinweis { margin-top: 3mm; color: #a15c00; font-size: 9.5pt; }
</style></head><body>
<h1>${esc(d.titel)}${abschreibliste ? ' – Abschreibliste' : ''}</h1>
<p class="leise">${esc([d.lerngruppe, d.datum, abschreibliste ? 'Reihenfolge: Nachname, Vorname (wie die Kursliste in TeacherTool)' : ''].filter(Boolean).join(' · '))}</p>
<table><thead><tr>${abschreibliste ? '<th>Nr.</th><th>Name</th><th>Vorname</th><th>Note</th><th>Punkte</th>' : '<th>Nr.</th><th>Name</th><th>Fassung</th><th>Punkte</th><th>%</th><th>Note</th><th>Hinweis</th>'}</tr></thead>
<tbody>${zeilen.map(zeile).join('')}</tbody></table>
<p class="unten">Notenverteilung: ${verteilung.map((n, i) => `${i + 1}: ${n}`).join(' · ')} · Durchschnitt: ${schnitt}</p>
${offen ? `<p class="hinweis">Vorläufig: ${offen} Antwort(en) sind noch zu prüfen bzw. zu entscheiden.</p>` : ''}
${format === 'tendenz' ? '<p class="hinweis">Tendenzen nach Faustregel: oberes Drittel der Notenstufe „+“, unteres Drittel „−“.</p>' : ''}
</body></html>`
}

// ---------------------------------------------------------------- Excel (ohne Bibliothek: Office Open XML)

const xmlEsc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const spalte = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)))

/** Eine einfache Tabelle als .xlsx (Zahlen als Zahlen, Text als Inline-Text, erste Zeile fett) */
export function xlsx(blatt: string, zeilen: (string | number | null)[][]): Uint8Array {
  const zellen = zeilen
    .map(
      (z, r) =>
        `<row r="${r + 1}">${z
          .map((w, c) => {
            const ref = `${spalte(c)}${r + 1}`
            const stil = r === 0 ? ' s="1"' : ''
            if (w == null || w === '') return `<c r="${ref}"${stil}/>`
            return typeof w === 'number' ? `<c r="${ref}"${stil}><v>${w}</v></c>` : `<c r="${ref}" t="inlineStr"${stil}><is><t xml:space="preserve">${xmlEsc(w)}</t></is></c>`
          })
          .join('')}</row>`
    )
    .join('')
  const breiten = (zeilen[0] ?? []).map((_, c) => Math.min(50, Math.max(8, ...zeilen.map((z) => String(z[c] ?? '').length + 2))))
  const dateien: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(blatt.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Ergebnisse')}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>'
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${breiten.map((b, i) => `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"/>`).join('')}</cols><sheetData>${zellen}</sheetData></worksheet>`
    )
  }
  return zipSync(dateien, { level: 6 })
}

export function ergebnisXlsx(d: ErgebnisDaten, format: NotenFormat): Uint8Array {
  const kopf = ['Nachname', 'Vorname', 'Fassung', 'Punkte', 'Höchstpunktzahl', 'Prozent', 'Note', 'Hinweis']
  const zeilen = nachKursliste(d.zeilen).map((z) => {
    const n = namensTeile(z.name)
    const note = noteAlsText(z, format, d.schwellen)
    return [n.nachname, n.vorname, z.fassung, z.abgabe ? z.punkte : null, z.max, z.abgabe ? prozent(z) : null, /^\d+$/.test(note) ? Number(note) : note, z.verlassen ? 'Seite verlassen' : z.offen ? `${z.offen} offen` : '']
  })
  return xlsx(d.titel, [kopf, ...zeilen])
}

// ---------------------------------------------------------------- Word

export async function ergebnisDocx(d: ErgebnisDaten, format: NotenFormat): Promise<Uint8Array> {
  const { verteilung, schnitt } = kennzahlen(d)
  const zelle = (t: string, fett = false, mitte = false): TableCell =>
    new TableCell({ children: [new Paragraph({ alignment: mitte ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: t, bold: fett })] })] })
  const kopf = ['Nr.', 'Name', 'Fassung', 'Punkte', '%', 'Note']
  const tabelle = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: kopf.map((k) => zelle(k, true)) }),
      ...d.zeilen.map(
        (z, i) =>
          new TableRow({
            children: [
              zelle(String(i + 1)),
              zelle(z.name),
              zelle(z.fassung),
              zelle(z.abgabe ? `${z.punkte}/${z.max}` : '–'),
              zelle(z.abgabe ? `${prozent(z)} %` : ''),
              zelle(noteAlsText(z, format, d.schwellen), true, true)
            ]
          })
      )
    ]
  })
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(d.titel)] }),
          new Paragraph({ children: [new TextRun({ text: [d.lerngruppe, d.datum].filter(Boolean).join(' · '), color: '555555' })] }),
          tabelle,
          new Paragraph({ spacing: { before: 240 }, children: [new TextRun(`Notenverteilung: ${verteilung.map((n, i) => `${i + 1}: ${n}`).join(' · ')} · Durchschnitt: ${schnitt}`)] })
        ]
      }
    ]
  })
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer())
}

// ---------------------------------------------------------------- TeacherTool

/** CSV für einen NEUEN Kurs in TeacherTool (Vorname, Name, Klasse) – Semikolon, UTF-8 mit BOM */
export function teachertoolCsv(d: ErgebnisDaten): string {
  const feld = (s: string): string => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const zeilen = nachKursliste(d.zeilen).map((z) => {
    const n = namensTeile(z.name)
    return [n.vorname, n.nachname, d.lerngruppe].map(feld).join(';')
  })
  return `﻿${['Vorname;Name;Klasse', ...zeilen].join('\r\n')}\r\n`
}

/** Notenspalte für die Zwischenablage (eine Note je Zeile, Reihenfolge der Kursliste) */
export const notenSpalte = (d: ErgebnisDaten, format: NotenFormat): string =>
  nachKursliste(d.zeilen)
    .map((z) => noteAlsText(z, format, d.schwellen))
    .join('\n')
