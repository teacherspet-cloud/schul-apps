/**
 * Versuchsprotokoll im Word-Export (29.09.2026) – dieselben Abschnitte wie auf dem Blatt
 * (render/baustein/protokoll.tsx): Schreiblinien, Skizzenfläche, Karo für das Diagramm,
 * Messwerttabelle, Chemikalien mit GHS-Piktogrammen (als Bild gerastert), Schutzmaßnahmen zum
 * Ankreuzen, Checkliste. Im Lösungsteil stehen die Musterlösungen und das Bewertungsraster.
 */
import { BorderStyle, Paragraph, Table, TableCell, TableRow, WidthType } from 'docx'
import { imageRun, run, writingLines } from '../../../../shared/export/docxKit'
import { GESTIS_URL, SCHUTZMASSNAHMEN, SICHERHEIT_HINWEIS } from '../../didactics/protokoll'
import type { ProtocolBlock } from '../../model/types'
import { ghsSvg } from '../../render/ghs'
import type { Child, Ctx } from './grundlagen'
import { PX_PER_MM, PX_MM } from './grundlagen'
import { gridArea, gridTable, spacer } from './bausteine'

const RAND = { style: BorderStyle.SINGLE, size: 6, color: '999999' }

function flaeche(ctx: Ctx, hoeheMm: number): Table {
  return new Table({
    width: { size: ctx.contentWidth, type: WidthType.DXA },
    rows: [
      new TableRow({
        height: { value: Math.round(hoeheMm * 56.7), rule: 'exact' },
        children: [new TableCell({ borders: { top: RAND, bottom: RAND, left: RAND, right: RAND }, children: [new Paragraph('')] })]
      })
    ]
  })
}

export async function protokollDocx(ctx: Ctx, block: ProtocolBlock): Promise<Child[]> {
  const key = ctx.key
  const out: Child[] = [new Paragraph({ keepNext: true, spacing: { after: 80 }, children: [run(block.title, { bold: true, size: Math.round(ctx.size * 1.1) })] })]
  if (key && block.sicherheitZuPruefen) out.push(new Paragraph({ children: [run(`${SICHERHEIT_HINWEIS} ${GESTIS_URL}`, { size: ctx.size - 4, color: '7A4A00' })] }))
  const klein = ctx.size - 3
  for (const a of block.abschnitte) {
    if (a.form === 'kopf') {
      out.push(new Paragraph({ spacing: { after: 120 }, children: [run('Datum: ______________    Name(n): ________________________________')] }))
      continue
    }
    out.push(new Paragraph({ keepNext: true, spacing: { before: 120 }, children: [run(a.titel, { bold: true })] }))
    if (a.leitfrage && !key) out.push(new Paragraph({ keepNext: true, children: [run(a.leitfrage, { italics: true, size: klein, color: '555555' })] }))
    if (a.id === 'chemikalien' || a.id === 'sicherheit') {
      const stoffe = block.chemikalien ?? []
      if (stoffe.length && (a.id === 'chemikalien' || !block.abschnitte.some((x) => x.id === 'chemikalien'))) {
        for (const c of stoffe) {
          const bilder = []
          for (const g of c.ghs) bilder.push(imageRun(await ctx.deps.raster(ghsSvg(g, 9), 9 * PX_PER_MM, 9 * PX_PER_MM), 9 * PX_MM, 9 * PX_MM))
          out.push(
            new Paragraph({
              children: [
                run(`${c.name}${c.menge ? ` (${c.menge})` : ''}  `, { bold: true }),
                ...bilder,
                run(`  ${[c.signalwort, c.hSaetze, c.pSaetze].filter(Boolean).join(' · ')}`, { size: klein })
              ]
            })
          )
        }
      }
      if (a.id === 'sicherheit' || !block.abschnitte.some((x) => x.id === 'sicherheit'))
        out.push(new Paragraph({ children: [run(SCHUTZMASSNAHMEN.map((s) => `${block.schutz?.includes(s.id) ? '☒' : '☐'} ${s.label}`).join('    '), { size: klein })] }))
    }
    if (a.vorgabe && !(key && a.muster && /_{3,}/.test(a.vorgabe)))
      for (const zeile of a.vorgabe.split('\n')) out.push(new Paragraph({ children: [run(zeile.replace(/_{3,}/g, '______________'))] }))
    if (a.satzanfaenge?.length && !key) out.push(new Paragraph({ children: [run(`Satzanfänge: ${a.satzanfaenge.join(' · ')}`, { italics: true, size: klein, color: '555555' })] }))
    if (key && a.muster) {
      // Steht das Muster schon als Vorgabe da, nicht doppelt
      if (a.muster.trim() === (a.vorgabe ?? '').trim()) continue
      for (const zeile of a.muster.split('\n')) out.push(new Paragraph({ children: [run(zeile, { color: '1B5E20' })] }))
      continue
    }
    if (a.form === 'skizze') out.push(flaeche(ctx, a.hoeheMm ?? 60))
    else if (a.form === 'diagramm') out.push(gridArea(ctx, a.hoeheMm ?? 70, true))
    else if (a.form === 'tabelle') {
      const spalten = a.spalten?.length ? a.spalten : ['', '']
      out.push(await gridTable(ctx, spalten, Array.from({ length: a.tabellenZeilen ?? 6 }, () => spalten.map(() => '')), ctx.contentWidth))
    } else if (a.zeilen) out.push(...writingLines(a.zeilen, 0))
  }
  if (!key && block.checkliste?.length) {
    out.push(new Paragraph({ keepNext: true, spacing: { before: 160 }, children: [run('Ist mein Protokoll vollständig?', { bold: true })] }))
    for (const c of block.checkliste) out.push(new Paragraph({ children: [run(`☐ ${c}`, { size: klein })] }))
  }
  if (key && block.raster?.length) {
    out.push(new Paragraph({ keepNext: true, spacing: { before: 160 }, children: [run('Bewertungsraster', { bold: true })] }))
    out.push(await gridTable(ctx, ['Kriterium', 'Erwartung', 'Bewertung'], block.raster.map((r) => [r.kriterium, r.erwartung, '']), ctx.contentWidth, [0.3, 0.55, 0.15]))
  }
  out.push(spacer())
  return out
}
