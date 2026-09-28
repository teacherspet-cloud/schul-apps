import {
  AlignmentType,
  BorderStyle,
  ISectionOptions,
  Paragraph,
  ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  WidthType
} from 'docx'
import { PRINT_MARGINS } from '@shared/design'
import { A4_HEIGHT, A4_WIDTH, hexColor, MM, NO_BORDERS, run } from '../../../../shared/export/docxKit'
import { MathRasterizer, richTextRuns } from '../../../../shared/richtext/docx'
import type { BoardPlan, Worksheet } from '../../model/types'
import { druckAkzent } from '../../../../shared/fachfarben'
import { Child, tint } from './grundlagen'

// ---------- Tafelbild ----------

/** Tafelbild als eigene Seite: Tafel als Tabelle (Bereiche nebeneinander), Merksatz, Ablauf für die Lehrkraft. */
export async function boardSection(ws: Worksheet, board: BoardPlan, raster: MathRasterizer): Promise<ISectionOptions> {
  const margins = { top: 15, bottom: 15, left: PRINT_MARGINS.holePunchMm, right: 15 }
  const width = Math.round(A4_WIDTH - (margins.left + margins.right) * MM)
  const accent = hexColor(druckAkzent(ws))
  const size = 22
  const frame = { style: BorderStyle.SINGLE, size: 24, color: '3D4A45' }
  const line = { style: BorderStyle.SINGLE, size: 6, color: accent }
  const p = (
    text: string,
    opts: { bold?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}
  ): Paragraph =>
    new Paragraph({ alignment: opts.align, spacing: { after: 60 }, children: [run(text, { bold: opts.bold, color: opts.color, size: opts.size ?? size })] })

  // Formeln und Fettdruck wie in der Vorschau
  const rich = (value: string, opts: { bold?: boolean; color?: string; size?: number } = {}): Promise<ParagraphChild[]> =>
    richTextRuns(value, { size: opts.size ?? size, raster, run: { bold: opts.bold, color: opts.color } })
  const cache = new Map<string, ParagraphChild[]>()
  const texts = [
    board.title,
    board.conclusion,
    ...board.sections.flatMap((sec) => [sec.heading, ...sec.points, sec.sketch ?? '', sec.fromTasks]),
    ...board.steps.flatMap((st) => [st.phase, st.impulse, st.expected])
  ]
  for (const t of new Set(texts)) if (t) cache.set(t, await rich(t))
  const runs = (t: string): ParagraphChild[] => cache.get(t) ?? []

  const headingRuns = new Map<string, ParagraphChild[]>()
  for (const sec of board.sections) headingRuns.set(sec.heading, await rich(sec.heading, { bold: true, color: accent }))

  const count = Math.max(1, board.sections.length)
  const flow = board.layout === 'flow'
  const sectionCell = (sec: BoardPlan['sections'][number], i: number): TableCell =>
    new TableCell({
      width: { size: Math.round(width / count), type: WidthType.DXA },
      borders: { ...NO_BORDERS, left: i > 0 ? line : NO_BORDERS.left },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      children: [
        new Paragraph({
          spacing: { after: 60 },
          children: [run(flow && i > 0 ? '→ ' : '', { bold: true, color: accent, size }), ...headingRuns.get(sec.heading)!]
        }),
        ...sec.points.map((pt) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: runs(pt) })),
        ...(sec.sketch
          ? [
              new Paragraph({
                spacing: { before: 40 },
                children: [run('✎ An die Tafel zeichnen: ', { italics: true, color: '555555', size: size - 3 }), ...runs(sec.sketch)]
              })
            ]
          : []),
        ...(sec.fromTasks ? [p(sec.fromTasks, { color: '777777', size: size - 5 })] : [])
      ]
    })
  // Bei „Begriff mit Aspekten“ höchstens zwei Bereiche je Zeile
  const perRow = board.layout === 'cluster' ? Math.min(2, count) : count
  const rows: TableRow[] = []
  for (let i = 0; i < board.sections.length; i += perRow) {
    const slice = board.sections.slice(i, i + perRow)
    rows.push(new TableRow({ children: slice.map((sec, j) => sectionCell(sec, j)) }))
  }

  const tableBoard = new Table({
    width: { size: width, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: { top: frame, bottom: frame, left: frame, right: frame, insideHorizontal: NO_BORDERS.top, insideVertical: NO_BORDERS.top },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            columnSpan: perRow,
            margins: { top: 160, bottom: 80, left: 140, right: 140 },
            borders: NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: board.title, bold: true, size: size + 8, underline: { color: accent } })]
              })
            ]
          })
        ]
      }),
      ...rows,
      ...(board.conclusion
        ? [
            new TableRow({
              children: [
                new TableCell({
                  columnSpan: perRow,
                  margins: { top: 100, bottom: 160, left: 200, right: 200 },
                  borders: NO_BORDERS,
                  children: [
                    new Paragraph({
                      shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(accent, 0.1) },
                      border: { top: line, bottom: line, left: line, right: line },
                      children: [run('Merke: ', { bold: true, color: accent, size }), ...runs(board.conclusion)]
                    })
                  ]
                })
              ]
            })
          ]
        : [])
    ]
  })

  const children: Child[] = [
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 2 } },
      tabStops: [{ type: TabStopType.RIGHT, position: width }],
      spacing: { after: 200 },
      children: [
        run('Tafelbild · für die Lehrkraft', { size: size - 4, color: '555555' }),
        run(`\t${[ws.meta.subjectLabel, ws.meta.grade ? `Klasse ${ws.meta.grade}` : '', ws.meta.title || ws.meta.topic].filter(Boolean).join(' · ')}`, {
          size: size - 4,
          color: '555555'
        })
      ]
    }),
    tableBoard
  ]

  if (board.steps.length) {
    const cols = [0.3, 0.35, 0.35].map((f) => Math.round(width * f))
    const cell = (text: string, i: number, head = false, prefix = ''): TableCell =>
      new TableCell({
        width: { size: cols[i], type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F3F5' } : undefined,
        children: [
          new Paragraph({ children: head ? [run(text, { bold: true, size: size - 2 })] : [run(prefix, { bold: true, size: size - 2 }), ...runs(text)] })
        ]
      })
    children.push(
      new Paragraph({ spacing: { before: 300, after: 100 }, children: [run('So entsteht das Tafelbild', { bold: true, size: size + 1 })] }),
      new Table({
        width: { size: width, type: WidthType.DXA },
        columnWidths: cols,
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            tableHeader: true,
            children: ['Schritt', 'Arbeitsauftrag / Impuls der Lehrkraft', 'Erwartete Beiträge → Tafel'].map((t, i) => cell(t, i, true))
          }),
          ...board.steps.map(
            (st, n) =>
              new TableRow({
                cantSplit: true,
                children: [cell(st.phase.replace(/^\s*\d+[.)]\s*/, ''), 0, false, `${n + 1}. `), cell(st.impulse, 1), cell(st.expected, 2)]
              })
          )
        ]
      })
    )
  }

  return {
    properties: {
      page: {
        size: { width: A4_WIDTH, height: A4_HEIGHT },
        margin: {
          top: Math.round(margins.top * MM),
          bottom: Math.round(margins.bottom * MM),
          left: Math.round(margins.left * MM),
          right: Math.round(margins.right * MM)
        }
      }
    },
    children
  }
}
