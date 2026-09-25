import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  ISectionOptions,
  LineNumberRestartFormat,
  Packer,
  PageNumber,
  Paragraph,
  ParagraphChild,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableAnchorType,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType
} from 'docx'
import { PRINT_MARGINS, wordFontName } from '@shared/design'
import {
  A4_HEIGHT,
  A4_WIDTH,
  dataUrlBytes,
  hexColor,
  ImageSizer,
  imageRun,
  MM,
  NO_BORDERS,
  RED,
  run,
  RunOptions,
  writingLines
} from '../../../shared/export/docxKit'
import { MathRasterizer, richTextRuns, richTextToParagraphs } from '../../../shared/richtext/docx'
import { plainText } from '../../../shared/richtext/parse'
import type { Answer, BoardPlan, Sheet, TaskBlock, Worksheet, WsBlock } from '../model/types'
import { INFO_VARIANTS, SOCIAL_FORM_SVG } from '../render/icons'
import { pictogramForSocialForm } from '../render/pictograms'
import { istMcListe, mcSpalten, mcZeilen, ohneOperator } from '../render/mcGrid'
import { imageCredits, isHelpCard, isPhraseSheet } from '../render/SheetPages'
import { contentInsets, footerSlotText, kopfTitel, PageInfo, sidebarBox, sidebarText } from '../render/PageFrame'
import { audioLength, galleryColumns, LONG_TEXT_CHARS, shortLink, splitParagraphs } from '../render/BlockView'
import { COPYRIGHT_NOTE, QR_NOTE, videoKindById } from '../didactics/videoTasks'
import { AI_AUDIO_NOTE, audioRulesFor, playsLabelFor } from '../didactics/audioRules'
import { headerLine } from '../didactics/sourceHeader'
import { gridDrawing } from '../render/gridSvg'
import { qrSvg } from '../render/qr'
import { blockLayout, justifyText, pageInfoFor, taskNumbersFor } from '../render/SheetPages'
import { trueFalseLabels } from '../../../shared/trueFalseLabels'
import { exampleNote } from '../../../shared/exampleNote'
import type { Stars } from '../didactics/differentiation'
import { subjectById } from '../model/subjects'
import { boardList } from '../didactics/boardDesign'
import { phraseSheetModus } from '../generation/prompts'
import { zeigtUebersetzung } from '../didactics/phraseRules'
import { anredeFuerMeta } from '../didactics/anrede'
import { anredeText } from '../../../shared/anrede'

export interface WorksheetDocxDeps {
  logo: string | null
  schoolName: string
  sizer: ImageSizer
  raster: MathRasterizer
  /** Farbstreifen mit senkrechtem Text als PNG (für die Seitenleiste) */
  sidebar: (text: string, color: string, widthMm: number, heightMm: number) => Promise<string>
  /** Selbst gestaltete Piktogramme (Kennung → PNG-data:-URL); leer = mitgelieferte Symbole */
  pictograms?: Record<string, string>
}

export interface WorksheetDocxOptions {
  sheetIds: string[]
  includeKey: boolean
  keyOnly?: boolean
  /** Tafelbild-Seite für die Lehrkraft anhängen */
  includeBoard?: boolean
}

type Child = Paragraph | Table
const EMU_MM = 36000
/** Auflösung, mit der Gitternetze und QR-Codes für Word gerastert werden (ca. 200 dpi) */
const PX_PER_MM = 8
/** Bildmaße in Word rechnen in Bildpunkten zu 96 dpi */
const PX_MM = 96 / 25.4

/** Aufhellen einer Farbe für Hintergründe (Mischung mit Weiß). */
function tint(hex: string, amount: number): string {
  const h = hexColor(hex)
  const mix = (i: number): string =>
    Math.round(parseInt(h.slice(i, i + 2), 16) * amount + 255 * (1 - amount))
      .toString(16)
      .padStart(2, '0')
  return `${mix(0)}${mix(2)}${mix(4)}`.toUpperCase()
}

interface Ctx {
  ws: Worksheet
  info: PageInfo
  deps: WorksheetDocxDeps
  size: number
  accent: string
  font: string
  contentWidth: number
  key: boolean
  /** Niveaustufe dieses Blattes */
  sheetStars?: Stars
  /** Deutsche Entsprechungen im Hilfsblatt? Entschieden in `didactics/phraseRules.ts` */
  phraseGerman: boolean
}

export async function buildWorksheetDocx(ws: Worksheet, opts: WorksheetDocxOptions, deps: WorksheetDocxDeps): Promise<Uint8Array> {
  const sections: ISectionOptions[] = []
  const sheets = ws.sheets.filter((s) => opts.sheetIds.includes(s.id))
  const add = async (key: boolean): Promise<void> => {
    for (const sheet of sheets) sections.push(...(await sheetSections(ws, sheet, key, deps)))
  }
  if (!opts.keyOnly) await add(false)
  if (opts.includeKey || opts.keyOnly) await add(true)
  // Je gewähltem Tafelformat ein eigener Abschnitt
  if (opts.includeBoard) for (const board of boardList(ws)) sections.push(await boardSection(ws, board, deps.raster))

  const info = pageInfoFor(ws, ws.sheets[0], deps.logo, deps.schoolName, false)
  const doc = new Document({
    creator: 'Schul-Apps',
    title: ws.meta.title || ws.meta.topic,
    styles: { default: { document: { run: { font: wordFontName(ws.design.page.fontFamily), size: Math.round(info.fontPt * 2) } } } },
    sections
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}

/** Randlos in ALLE Richtungen – `NO_BORDERS` kennt die Innenlinien einer Tabelle nicht. */
const RAHMENLOS = { ...NO_BORDERS, insideHorizontal: NO_BORDERS.top, insideVertical: NO_BORDERS.top }

/** Anteil der Blattbreite, den ein seitlich stehender Baustein einnimmt (wie auf dem Blatt: 38 %). */
const SEITE_ANTEIL = 0.38

/**
 * Bild oder Tabelle, um die der Text fließt.
 *
 * Eine randlose Ein-Zellen-Tabelle mit `w:tblpPr`. Sie schwebt, ist am Satzspiegel (waagerecht)
 * und am Text (senkrecht) verankert – dadurch wandert sie beim Neuumbrechen mit ihrem Absatz
 * mit, statt an einer Seitennummer zu kleben, die Word ohnehin anders setzt.
 */
async function schwebenderBehaelter(
  ctx: Ctx,
  block: WsBlock,
  lage: 'left' | 'right' | NonNullable<WsBlock['free']>,
  numbers: Map<string, number>
): Promise<Table> {
  const frei = typeof lage === 'object' ? lage : null
  const seite = frei ? (frei.x < 50 ? 'left' : 'right') : (lage as 'left' | 'right')
  const breite = Math.round(ctx.contentWidth * (frei ? Math.min(1, Math.max(0.15, frei.width / 100)) : SEITE_ANTEIL))
  const luft = Math.round(4 * MM)
  const inhalt = await blockContent({ ...ctx, contentWidth: breite - Math.round(2 * MM) }, block, numbers)
  return new Table({
    float: {
      horizontalAnchor: TableAnchorType.MARGIN,
      verticalAnchor: TableAnchorType.TEXT,
      absoluteHorizontalPosition: frei
        ? Math.min(ctx.contentWidth - breite, Math.max(0, Math.round((frei.x / 100) * ctx.contentWidth)))
        : seite === 'left'
          ? 0
          : ctx.contentWidth - breite,
      absoluteVerticalPosition: 0,
      // Luft zum umfließenden Text – auf der Seite, an der er vorbeiläuft
      ...(seite === 'left' ? { rightFromText: luft } : { leftFromText: luft }),
      bottomFromText: Math.round(1 * MM)
    },
    borders: RAHMENLOS,
    width: { size: breite, type: WidthType.DXA },
    rows: [
      new TableRow({ children: [new TableCell({ borders: RAHMENLOS, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: inhalt as Paragraph[] })] })
    ]
  })
}

async function sheetSections(ws: Worksheet, sheet: Sheet, key: boolean, deps: WorksheetDocxDeps): Promise<ISectionOptions[]> {
  const info = pageInfoFor(ws, sheet, deps.logo, deps.schoolName, key)
  const d = ws.design
  const insets = contentInsets(d)
  const ctx: Ctx = {
    ws,
    info,
    deps,
    size: Math.round(info.fontPt * 2),
    accent: hexColor(d.page.accentColor),
    font: wordFontName(d.page.fontFamily),
    contentWidth: Math.round(A4_WIDTH - (insets.left + insets.right) * MM),
    key,
    sheetStars: sheet.stars,
    phraseGerman: zeigtUebersetzung(ws.meta, sheet.stars)
  }

  const headers = { first: await headerFor(ctx, true), default: await headerFor(ctx, false) }
  const footers = { first: footerFor(ctx), default: footerFor(ctx) }
  const pageProps = {
    page: {
      size: { width: A4_WIDTH, height: A4_HEIGHT },
      margin: {
        top: Math.round((d.page.marginMm + 4) * MM),
        bottom: Math.round((insets.bottom + 8) * MM),
        left: Math.round(insets.left * MM),
        right: Math.round(insets.right * MM),
        header: Math.round(8 * MM),
        footer: Math.round(6 * MM)
      }
    }
  }

  // Texte mit Zeilennummern bekommen einen eigenen fortlaufenden Abschnitt mit Word-Zeilennummerierung
  const sections: ISectionOptions[] = []
  let children: Child[] = []
  const numbers = taskNumbersFor(sheet)
  const flush = (lineNumbers: boolean): void => {
    if (!children.length) return
    const first = sections.length === 0
    sections.push({
      properties: {
        ...pageProps,
        ...(first ? { titlePage: true } : { type: SectionType.CONTINUOUS }),
        ...(lineNumbers ? { lineNumbers: { countBy: 5, restart: LineNumberRestartFormat.NEW_SECTION } } : {})
      },
      headers,
      footers,
      children
    })
    children = []
  }

  // Im Word-Export steht das Hilfsblatt am Ende, wenn es ein eigenes Blatt sein soll
  const ownPhrasePage = phraseSheetModus(ws.meta) === 'blatt'
  // `true`: auch die frei platzierten Bausteine – siehe `blockLayout`, sie gingen sonst verloren
  for (const { block, side, sideAt } of blockLayout(sheet.blocks, ownPhrasePage, true)) {
    const main = await blockContent(ctx, block, numbers)
    if (!main.length) continue
    /*
     * Bild oder Tabelle DANEBEN – als schwebender Behälter, nicht mehr als zweite Spalte.
     *
     * Vorher steckte der Text in einer schmalen Tabellenspalte: Er blieb bis zum Ende schmal,
     * während er auf dem Blatt unter dem Bild wieder über die volle Breite läuft. Word kann
     * das – mit einer schwebenden Tabelle (`w:tblpPr`), um die der Text fließt.
     *
     * An Word gemessen (24.09.2026): Die Absätze daneben beginnen bei 80 mm, die darunter
     * wieder bei 20 mm. Also genau das Verhalten der Vorschau.
     *
     * WARUM eine Tabelle als Behälter und kein Absatzrahmen (`w:framePr`): Ein Rahmen ist eine
     * Absatz-Eigenschaft und kann keine Tabelle aufnehmen. Der Behälter muss aber beides
     * tragen – Bild UND Tabelle. Ein Textfeld (`Textbox`) scheidet aus: Die davon erzeugte
     * Datei ließ sich in Word gar nicht erst öffnen.
     */
    /*
     * FREI gezogene Bausteine bekommen denselben Behälter – mit ihrer waagerechten Lage.
     *
     * Die SEITE lässt sich in Word nicht halten: Word bricht selbst um und braucht für
     * unsere drei Seiten schon vier (nachgemessen am 24.09.2026). Ein an eine Seitennummer
     * gebundener Baustein landete dort irgendwo. Textgebunden wandert er dagegen mit seinem
     * Absatz mit – die waagerechte Lage und der Umfluss stimmen, die Seite ist eine Näherung.
     */
    const content = side
      ? [await schwebenderBehaelter(ctx, side, sideAt ?? 'right', numbers), ...(main as Paragraph[])]
      : block.free
        ? // Der Baustein SELBST kommt in den Behälter – `main` wäre sonst doppelt auf dem Blatt
          [await schwebenderBehaelter(ctx, block, block.free, numbers)]
        : main
    if (block.type === 'text' && block.lineNumbers) {
      flush(false)
      children = content
      flush(true)
    } else {
      children.push(...content)
    }
  }
  if (!children.length && !sections.length) children.push(new Paragraph(''))
  flush(false)

  // Hilfsblatt mit nützlichen Ausdrücken auf einer eigenen Schlussseite, wenn so gewählt
  const phraseBlocks = !key && ownPhrasePage ? sheet.blocks.filter(isPhraseSheet) : []
  if (phraseBlocks.length) {
    children = []
    for (const block of phraseBlocks) children.push(...((await blockContent(ctx, block, numbers)) as Child[]))
    flush(false)
  }

  // Hilfekarten auf einer eigenen Schlussseite (nur im Schülerblatt)
  const helpCards = key ? [] : sheet.blocks.filter(isHelpCard)
  if (helpCards.length) {
    children = [
      new Paragraph({ spacing: { after: 160 }, children: [run('Tipp- und Hilfekarten', { bold: true, size: ctx.size + 4 })] }),
      // Derselbe Hinweis wie in der Vorschau – bis 25.09.2026 fehlte er im Word-Export (Paket 8b)
      new Paragraph({ spacing: { after: 160 }, children: [run(anredeText('hilfekarten', anredeFuerMeta(ctx.ws.meta)), { color: '555555' })] })
    ]
    for (const block of helpCards) children.push(...((await blockContent(ctx, block, numbers)) as Child[]))
    flush(false)
  }

  // Bildnachweise auf einer eigenen Schlussseite – das Blatt selbst bleibt frei davon
  const credits = key ? [] : imageCredits(sheet)
  if (credits.length) {
    children = [
      new Paragraph({ spacing: { after: 160 }, children: [run('Bildnachweise', { bold: true, size: ctx.size + 4 })] }),
      ...credits.map(
        (c) =>
          new Paragraph({ spacing: { after: 60 }, children: [run(`${c.label}: `, { bold: true, size: ctx.size - 2 }), run(c.credit, { size: ctx.size - 2 })] })
      )
    ]
    flush(false)
  }
  // Neues Blatt beginnt auf einer neuen Seite
  return sections
}

// ---------- Tafelbild ----------

/** Tafelbild als eigene Seite: Tafel als Tabelle (Bereiche nebeneinander), Merksatz, Ablauf für die Lehrkraft. */
export async function boardSection(ws: Worksheet, board: BoardPlan, raster: MathRasterizer): Promise<ISectionOptions> {
  const margins = { top: 15, bottom: 15, left: PRINT_MARGINS.holePunchMm, right: 15 }
  const width = Math.round(A4_WIDTH - (margins.left + margins.right) * MM)
  const accent = hexColor(ws.design.page.accentColor)
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
          ? [new Paragraph({ spacing: { before: 40 }, children: [run('✎ Skizze: ', { italics: true, color: '555555', size: size - 3 }), ...runs(sec.sketch)] })]
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
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({ tableHeader: true, children: ['Schritt', 'Impuls der Lehrkraft', 'Erwartete Beiträge → Tafel'].map((t, i) => cell(t, i, true)) }),
          ...board.steps.map(
            (st, n) => new TableRow({ cantSplit: true, children: [cell(st.phase, 0, false, `${n + 1}. `), cell(st.impulse, 1), cell(st.expected, 2)] })
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

// ---------- Kopf und Fuß ----------

async function logoRun(ctx: Ctx, heightMm: number): Promise<ImageRun | null> {
  const logo = ctx.deps.logo
  if (!logo || !ctx.ws.design.header.showLogo) return null
  const dim = await ctx.deps.sizer(logo)
  const h = heightMm * (96 / 25.4)
  return imageRun(logo, (dim.width / dim.height) * h, h)
}

async function sidebarRun(ctx: Ctx): Promise<ImageRun | null> {
  const s = ctx.ws.design.sidebar
  if (!s.show) return null
  // Wie in der Vorschau: im bedruckbaren Bereich, links hinter dem Lochrand
  const box = sidebarBox(ctx.ws.design)!
  const height = 297 - 2 * PRINT_MARGINS.bleedSafeMm
  const png = await ctx.deps.sidebar(sidebarText(ctx.info), s.color, s.widthMm, height)
  const { data } = dataUrlBytes(png)
  return new ImageRun({
    type: 'png',
    data,
    transformation: { width: Math.round(s.widthMm * (96 / 25.4)), height: Math.round(height * (96 / 25.4)) },
    floating: {
      horizontalPosition: {
        relative: HorizontalPositionRelativeFrom.PAGE,
        offset: Math.round((s.side === 'left' ? box.start : 210 - s.widthMm - box.start) * EMU_MM)
      },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(PRINT_MARGINS.bleedSafeMm * EMU_MM) },
      behindDocument: true,
      allowOverlap: true,
      wrap: { type: TextWrappingType.NONE }
    }
  })
}

async function headerFor(ctx: Ctx, first: boolean): Promise<Header> {
  // Aus `info`: Ein Blatt kann eine eigene Kopfzeile haben (Fassung B, C …)
  const d = ctx.info.design
  const h = d.header
  const title = kopfTitel(ctx.ws.meta, ctx.key)
  const children: Child[] = []
  const sidebar = await sidebarRun(ctx)
  const mode = first ? 'full' : h.followingPages

  if (mode === 'none') {
    children.push(new Paragraph({ children: sidebar ? [sidebar] : [] }))
    return new Header({ children })
  }
  if (mode === 'compact') {
    const logo = await logoRun(ctx, 6)
    children.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ctx.accent, space: 2 } },
        tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidth }],
        children: [
          ...(sidebar ? [sidebar] : []),
          ...(logo ? [logo, run('  ')] : []),
          run([h.showSubject ? ctx.ws.meta.subjectLabel : '', title].filter(Boolean).join(' · '), { size: ctx.size - 4, color: '444444' }),
          ...(ctx.info.levelMark ? [run(`\t${ctx.info.levelMark}`, { size: ctx.size - 4, color: '666666' })] : [])
        ]
      })
    )
    return new Header({ children })
  }

  const white = h.layout === 'colorBand'
  const color = white ? 'FFFFFF' : undefined
  const align = h.layout === 'centered' ? AlignmentType.CENTER : undefined
  const textParas: Paragraph[] = []
  if (h.showSchoolName && ctx.info.schoolName)
    textParas.push(new Paragraph({ alignment: align, children: [run(ctx.info.schoolName, { size: ctx.size - 5, color: color ?? '555555' })] }))
  if (h.showTitle)
    textParas.push(
      // Auch die Kopfzeile: ein Mathematikblatt kann „Rechnen mit $a^m \cdot a^n$" heissen
      new Paragraph({ alignment: align, children: await richRun(ctx, title, { bold: true, size: Math.round(ctx.size * 1.55), color }) })
    )
  const subjectLine = [h.showSubject ? ctx.ws.meta.subjectLabel : '', `Klasse ${ctx.ws.meta.grade}`, h.customText].filter(Boolean).join(' · ')
  if (subjectLine) textParas.push(new Paragraph({ alignment: align, children: [run(subjectLine, { size: ctx.size - 4, color: color ?? '444444' })] }))
  const badgeText = [h.showSheetNumber && ctx.ws.meta.sheetNumber ? `AB ${ctx.ws.meta.sheetNumber}` : '', ctx.info.levelMark ?? ''].filter(Boolean).join('  ')
  const logo = await logoRun(ctx, h.logoHeightMm)

  if (h.layout === 'centered') {
    if (logo) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [logo] }))
    textParas.forEach((p) => children.push(p))
    if (badgeText) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(badgeText, { bold: true, size: ctx.size - 4 })] }))
    children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ctx.accent, space: 1 } }, children: [] }))
  } else {
    const logoW = logo ? Math.round(ctx.contentWidth * 0.22) : 0
    const badgeW = badgeText ? Math.round(ctx.contentWidth * 0.14) : 0
    const textW = ctx.contentWidth - logoW - badgeW
    const cellOpts = (width: number) => ({
      width: { size: width, type: WidthType.DXA },
      borders: NO_BORDERS,
      verticalAlign: VerticalAlign.CENTER,
      ...(white ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: ctx.accent } } : {}),
      margins: { left: 80, right: 80, top: 60, bottom: 60 }
    })
    const cells: TableCell[] = []
    const logoCell = logo ? new TableCell({ ...cellOpts(logoW), children: [new Paragraph({ children: [logo] })] }) : null
    const textCell = new TableCell({ ...cellOpts(textW), children: textParas.length ? textParas : [new Paragraph('')] })
    const badgeCell = badgeText
      ? new TableCell({
          ...cellOpts(badgeW),
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(badgeText, { bold: true, size: ctx.size - 3, color })] })]
        })
      : null
    if (h.layout === 'logoRight') {
      if (badgeCell) cells.push(badgeCell)
      cells.push(textCell)
      if (logoCell) cells.push(logoCell)
    } else {
      if (logoCell) cells.push(logoCell)
      cells.push(textCell)
      if (badgeCell) cells.push(badgeCell)
    }
    children.push(
      new Table({ width: { size: ctx.contentWidth, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: cells })] })
    )
    if (!white) children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ctx.accent, space: 1 } }, children: [] }))
  }

  if (!ctx.key && (h.fields.name || h.fields.class || h.fields.date)) {
    const fields: [string, number][] = []
    if (h.fields.name) fields.push(['Name:', 5])
    if (h.fields.class) fields.push(['Klasse:', 2])
    if (h.fields.date) fields.push(['Datum:', 2.5])
    const total = fields.reduce((s, [, w]) => s + w, 0)
    const cells: TableCell[] = []
    // Nur das Datum: schmales Feld rechts statt einer Zeile über die ganze Breite
    const dateOnly = fields.length === 1 && h.fields.date
    if (dateOnly) {
      cells.push(
        new TableCell({ width: { size: Math.round(ctx.contentWidth * 0.75), type: WidthType.DXA }, borders: NO_BORDERS, children: [new Paragraph('')] })
      )
    }
    for (const [label, weight] of fields) {
      const width = dateOnly ? Math.round(ctx.contentWidth * 0.25) : Math.round((ctx.contentWidth * weight) / total)
      cells.push(
        new TableCell({
          width: { size: Math.round(width * 0.32), type: WidthType.DXA },
          borders: NO_BORDERS,
          verticalAlign: VerticalAlign.BOTTOM,
          children: [new Paragraph({ children: [run(label, { size: ctx.size - 2 })] })]
        }),
        new TableCell({
          width: { size: Math.round(width * 0.68), type: WidthType.DXA },
          borders: { ...NO_BORDERS, bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
          children: [new Paragraph('')]
        })
      )
    }
    children.push(
      new Table({
        width: { size: ctx.contentWidth, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        rows: [new TableRow({ height: { value: 460, rule: 'atLeast' }, children: cells })]
      })
    )
  }
  // Seitenleiste als verankertes Bild im ersten Absatz
  if (sidebar) children.unshift(new Paragraph({ spacing: { before: 0, after: 0 }, children: [sidebar] }))
  return new Header({ children })
}

function footerFor(ctx: Ctx): Footer {
  const f = ctx.ws.design.footer
  if (!f.show) return new Footer({ children: [new Paragraph('')] })
  const slot = (s: typeof f.left): ParagraphChild[] => {
    if (s === 'pageNumber')
      return [new TextRun({ children: ['Seite ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: ctx.size - 6, color: '555555' })]
    const text = footerSlotText(s, ctx.info, 1, 1)
    return text ? [run(text, { size: ctx.size - 6, color: '555555' })] : []
  }
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 4 } },
        tabStops: [
          { type: TabStopType.CENTER, position: Math.round(ctx.contentWidth / 2) },
          { type: TabStopType.RIGHT, position: ctx.contentWidth }
        ],
        children: [...slot(f.left), run('\t'), ...slot(f.center), run('\t'), ...slot(f.right)]
      })
    ]
  })
}

// ---------- Bausteine ----------

const rich = (ctx: Ctx, text: string, extra: Partial<Parameters<typeof richTextToParagraphs>[1]> = {}) =>
  richTextToParagraphs(text, { size: ctx.size, raster: ctx.deps.raster, ...extra })

/**
 * Ein kurzes Feld mit Formeln und **Fettdruck** – Überschriften, Bildunterschriften,
 * Antwortmöglichkeiten, Zuordnungen.
 *
 * Diese Felder liefen früher über `run()` und damit als reiner Text. Am Bildschirm und im PDF
 * stand deshalb `$b^4 \cdot b^3$` wörtlich da; nach der Umstellung des Blatt-Renderers auf
 * `RichText` wäre im Word-Export als einziges Ausgabeformat weiterhin roher Text gestanden.
 */
const richRun = (ctx: Ctx, text: string, opts: RunOptions = {}): Promise<ParagraphChild[]> =>
  richTextRuns(text, { size: opts.size ?? ctx.size, raster: ctx.deps.raster, run: opts })

function boxTable(ctx: Ctx, children: Child[], opts: { fill?: string; leftColor?: string; dashed?: boolean; color?: string }): Table {
  const line = { style: opts.dashed ? BorderStyle.DASHED : BorderStyle.SINGLE, size: 6, color: opts.color ?? ctx.accent }
  return new Table({
    width: { size: ctx.contentWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        cantSplit: false,
        children: [
          new TableCell({
            width: { size: ctx.contentWidth, type: WidthType.DXA },
            margins: { top: 100, bottom: 100, left: 200, right: 200 },
            ...(opts.fill ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } } : {}),
            borders: opts.leftColor
              ? {
                  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  left: { style: BorderStyle.SINGLE, size: 36, color: opts.leftColor }
                }
              : { top: line, bottom: line, left: line, right: line },
            children: children.length ? children : [new Paragraph('')]
          })
        ]
      })
    ]
  })
}

const spacer = (): Paragraph => new Paragraph({ spacing: { after: 120 }, children: [] })

async function blockContent(ctx: Ctx, block: WsBlock, numbers: Map<string, number>): Promise<Child[]> {
  const key = ctx.key
  switch (block.type) {
    case 'learningGoals': {
      if (key) return []
      const inner: Child[] = [new Paragraph({ children: await richRun(ctx, block.title, { bold: true, color: ctx.accent }) })]
      for (const g of block.goals)
        inner.push(
          new Paragraph({
            indent: { left: 280, hanging: 280 },
            children: [run('✓\t'), ...(await richTextRuns(g, { size: ctx.size, raster: ctx.deps.raster }))]
          })
        )
      return [boxTable(ctx, inner, {}), spacer()]
    }
    case 'infoBox': {
      const v = INFO_VARIANTS[block.variant] ?? INFO_VARIANTS.merke
      const inner: Child[] = [
        new Paragraph({ spacing: { after: 60 }, children: [run(`${v.symbol}  ${block.title || v.label}`, { bold: true })] }),
        ...(await rich(ctx, block.body))
      ]
      return [boxTable(ctx, inner, { fill: tint(ctx.accent, 0.1), leftColor: ctx.accent }), spacer()]
    }
    case 'text': {
      const out: Child[] = []
      // Zeilennummern zählen nur den Materialtext (nicht Überschrift, Worterklärungen, Quelle)
      if (block.title)
        out.push(
          new Paragraph({ keepNext: true, suppressLineNumbers: true, spacing: { after: 80 }, children: await richRun(ctx, block.title, { bold: true }) })
        )
      /*
       * Materialkopf einer Quelle: Verfasser · Textsorte · Datum – ÜBER dem Text, wie am
       * Bildschirm. Ohne diese Angaben lässt sich die Standortgebundenheit nicht beurteilen
       * (EPA Geschichte 3.3.3). Von der Zeilenzählung ausgenommen, denn gezählt wird nur der
       * Quellentext selbst.
       */
      if (headerLine(block.sourceHeader))
        out.push(
          new Paragraph({
            keepNext: true,
            suppressLineNumbers: true,
            spacing: { after: 60 },
            children: [run(headerLine(block.sourceHeader), { size: ctx.size - 3, color: '555555' })]
          })
        )
      // Längere Texte im Blocksatz wie in der Vorschau
      const justify = justifyText(ctx.ws) && plainText(block.body).length >= LONG_TEXT_CHARS
      for (const p of splitParagraphs(block.body))
        out.push(
          ...(await rich(ctx, p, {
            paragraph: { spacing: { after: 0, line: 360 }, keepLines: true, keepNext: true, ...(justify ? { alignment: AlignmentType.JUSTIFIED } : {}) }
          }))
        )
      if (block.glossary.length) {
        out.push(
          new Paragraph({
            suppressLineNumbers: true,
            spacing: { before: 120 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 2 } },
            children: []
          })
        )
        for (const g of block.glossary)
          out.push(
            new Paragraph({
              suppressLineNumbers: true,
              children: [run(`${g.term}: `, { bold: true, size: ctx.size - 3 }), run(g.explanation, { size: ctx.size - 3 })]
            })
          )
      }
      if (block.source)
        out.push(new Paragraph({ suppressLineNumbers: true, children: [run(`Quelle: ${block.source}`, { size: ctx.size - 6, color: '555555' })] }))
      out.push(spacer())
      return out
    }
    case 'image': {
      const out: Child[] = []
      if (block.items?.length) {
        // Bildreihe als randlose Tabelle: Bilder nebeneinander, Unterschrift darunter
        const cols = galleryColumns(block.items.length)
        const cellWidth = Math.round(ctx.contentWidth / cols)
        const maxW = (cellWidth / 1440) * 96 - 12
        const maxH = 38 * (96 / 25.4)
        const rows: TableRow[] = []
        for (let r = 0; r < block.items.length; r += cols) {
          const cells: TableCell[] = []
          for (let k = r; k < r + cols; k++) {
            const it = block.items[k]
            const children: Paragraph[] = []
            if (it?.image) {
              const dim = await ctx.deps.sizer(it.image.dataUrl)
              const scale = Math.min(maxW / dim.width, maxH / dim.height)
              children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [imageRun(it.image.dataUrl, dim.width * scale, dim.height * scale)] }))
            } else if (it) {
              children.push(
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`[Bild: ${it.description}]`, { color: '777777', size: ctx.size - 4 })] })
              )
            }
            if (it) {
              children.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [run(`${k + 1}${it.caption ? ` ${it.caption}` : ''}`, { size: ctx.size - 3, bold: !it.caption })]
                })
              )
            }
            cells.push(
              new TableCell({
                width: { size: cellWidth, type: WidthType.DXA },
                borders: NO_BORDERS,
                children: children.length ? children : [new Paragraph('')]
              })
            )
          }
          rows.push(new TableRow({ cantSplit: true, children: cells }))
        }
        out.push(new Table({ width: { size: ctx.contentWidth, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows }))
        if (block.caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: await richRun(ctx, block.caption, { size: ctx.size - 3 }) }))
        out.push(spacer())
        return out
      }
      if (block.image) {
        const dim = await ctx.deps.sizer(block.image.dataUrl)
        const maxW = (ctx.contentWidth / 1440) * 96 * (block.widthPercent / 100)
        const maxH = 110 * (96 / 25.4)
        const scale = Math.min(maxW / dim.width, maxH / dim.height)
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [imageRun(block.image.dataUrl, dim.width * scale, dim.height * scale)] }))
      } else {
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`[Bild: ${block.description}]`, { color: '777777' })] }))
      }
      /*
       * Beschriftungen: Im Druck und im PDF sitzen sie mit Linie am gemeinten Bildteil – das
       * ist die wirksamste Form. Word kann das nicht nachbilden, deshalb stehen sie hier als
       * Liste unter dem Bild. Das ist messbar schwächer, aber die Beschriftungen gehen nicht
       * verloren; die Einschränkung ist im README festgehalten.
       */
      if (block.labels?.length) {
        for (const label of block.labels) {
          out.push(
            new Paragraph({
              spacing: { after: 20 },
              children: [
                run('• ', { size: ctx.size - 2 }),
                label.blank && !key ? run('______________________', { size: ctx.size - 2 }) : run(label.text, { size: ctx.size - 2 })
              ]
            })
          )
        }
      }
      // Der Bildnachweis steht auf der Schlussseite, nicht unter dem Bild
      if (block.caption || block.image?.source === 'ai') {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              ...(block.caption ? await richRun(ctx, block.caption, { size: ctx.size - 3 }) : []),
              // Art. 50 Abs. 4 KI-Verordnung: erzeugte Bilder sichtbar kennzeichnen
              ...(block.image?.source === 'ai' ? [run(`${block.caption ? ' ' : ''}(KI-erzeugt)`, { size: ctx.size - 4, color: '666666' })] : [])
            ]
          })
        )
      }
      out.push(spacer())
      return out
    }
    case 'phrases': {
      // Auch im Lösungsteil sichtbar: Die Wendungen sind eine Hilfe, keine Lösung
      const out: Child[] = [new Paragraph({ spacing: { after: 60 }, children: await richRun(ctx, block.title, { bold: true, color: ctx.accent }) })]
      if (block.hint) out.push(new Paragraph({ spacing: { after: 120 }, children: await richRun(ctx, block.hint, { size: ctx.size - 3, color: '666666' }) }))
      for (const group of block.groups) {
        if (group.label) out.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: [run(group.label, { bold: true, size: ctx.size - 1 })] }))
        for (const item of group.items) {
          out.push(
            new Paragraph({
              indent: { left: 280, hanging: 280 },
              spacing: { after: 30 },
              // Ob die deutsche Entsprechung mitkommt, ist in `contextFor` entschieden
              children: [run('• '), run(item.text), ...(item.german && ctx.phraseGerman ? [run(` – ${item.german}`, { color: '666666' })] : [])]
            })
          )
        }
      }
      out.push(spacer())
      return out
    }
    case 'task':
      return taskContent(ctx, block, numbers.get(block.id))
    case 'scaffold': {
      if (key) return []
      const inner: Child[] = [new Paragraph({ spacing: { after: 60 }, children: await richRun(ctx, block.title, { bold: true, color: ctx.accent }) })]
      if (block.variant === 'wortspeicher') {
        inner.push(new Paragraph({ children: block.items.flatMap((it, i) => [...(i ? [run('     ·     ')] : []), run(plainText(it))]) }))
      } else if (block.variant === 'hilfekarten') {
        for (let i = 0; i < block.items.length; i++) {
          inner.push(
            new Paragraph({ spacing: { before: 60 }, children: [run(`Hilfe ${i + 1}: `, { bold: true, color: ctx.accent, size: ctx.size - 2 })] }),
            ...(await rich(ctx, block.items[i]))
          )
        }
      } else {
        for (const it of block.items)
          inner.push(
            new Paragraph({
              indent: { left: 280, hanging: 280 },
              children: [run('•\t'), ...(await richTextRuns(it, { size: ctx.size, raster: ctx.deps.raster }))]
            })
          )
      }
      return [boxTable(ctx, inner, { dashed: true }), spacer()]
    }
    case 'table': {
      const out: Child[] = []
      if (block.title) out.push(new Paragraph({ keepNext: true, children: await richRun(ctx, block.title, { bold: true }) }))
      out.push(await gridTable(ctx, block.headers, block.rows, ctx.contentWidth))
      out.push(spacer())
      return out
    }
    case 'workspace': {
      if (key) return []
      const out: Child[] = []
      if (block.label) out.push(new Paragraph({ children: await richRun(ctx, block.label, { size: ctx.size - 2 }) }))
      if (block.kind === 'lines') out.push(...writingLines(Math.max(1, Math.round(block.heightMm / 8.5)), 0))
      else out.push(gridArea(ctx, block.heightMm, block.kind === 'grid'))
      out.push(spacer())
      return out
    }
    case 'grid': {
      // Das Gitternetz wird als Bild in exakter Millimetergröße eingebettet, damit der Ausdruck maßhaltig bleibt
      const drawing = gridDrawing(block, ctx.contentWidth / MM)
      const png = await ctx.deps.raster(drawing.svg, drawing.widthMm * PX_PER_MM, drawing.heightMm * PX_PER_MM)
      const out: Child[] = []
      if (block.title) out.push(new Paragraph({ keepNext: true, children: await richRun(ctx, block.title, { bold: true }) }))
      out.push(new Paragraph({ children: [imageRun(png, drawing.widthMm * PX_MM, drawing.heightMm * PX_MM)] }))
      if (block.caption) out.push(new Paragraph({ children: await richRun(ctx, block.caption, { size: ctx.size - 2 }) }))
      out.push(spacer())
      return out
    }
    case 'audio': {
      // Abspielzahl und Transkriptpflicht folgen dem Fach – siehe `didactics/audioRules.ts`
      const fach = ctx.ws.meta.subjectId
      const audioRegeln = audioRulesFor(fach)
      const meta = [block.textType, block.seconds ? audioLength(block.seconds) : '', playsLabelFor(fach, block.plays, anredeFuerMeta(ctx.ws.meta))]
        .filter(Boolean)
        .join(' · ')
      const inner: Child[] = [
        new Paragraph({
          spacing: { after: 60 },
          children: [run(`▶ ${block.title}`, { bold: true, color: ctx.accent }), run(meta ? `   ${meta}` : '', { size: ctx.size - 2 })]
        })
      ]
      if (block.speakers.length > 1) inner.push(new Paragraph({ children: [run(block.speakers.map((s) => s.name).join(' · '), { size: ctx.size - 2 })] }))
      if (block.beforeListening) inner.push(...(await rich(ctx, block.beforeListening)))
      /*
       * Word bekommt QR-Code UND Klartext-Adresse – keine eingebettete Audiodatei.
       *
       * Ein eingebettetes OLE-Objekt wäre der einzige Weg zum Abspielen aus dem Dokument
       * heraus. Es funktioniert aber nur in Word für Windows, startet auch dort nur den
       * externen Abspieler, scheitert in Word für Mac und im Browser und wird in Schulnetzen
       * häufig durch Sicherheitsrichtlinien blockiert. Der Gewinn gegenüber „die MP3 liegt
       * im selben Ordner" ist damit null.
       *
       * Die Adresse steht zusätzlich im Klartext: Ein QR-Code hilft nicht, wenn in der
       * Stunde keine Geräte erlaubt sind.
       */
      if (block.url) {
        const qr = await ctx.deps.raster(qrSvg(block.url, 22), 22 * PX_PER_MM, 22 * PX_PER_MM)
        inner.push(new Paragraph({ children: [imageRun(qr, 22 * PX_MM, 22 * PX_MM)] }))
        inner.push(new Paragraph({ children: [run(shortLink(block.url), { size: ctx.size - 3, color: '444444' })] }))
      }
      if (block.audio?.fileName)
        inner.push(
          new Paragraph({
            spacing: { before: 40 },
            children: [run(`Hörtext: Datei „${block.audio.fileName}" im selben Ordner.`, { size: ctx.size - 2, color: '444444' })]
          })
        )
      // KI-Kennzeichnung nur bei selbst erzeugten Aufnahmen, nicht bei Archivaufnahmen
      if (block.origin !== 'archiv' && block.audio?.fileName)
        inner.push(new Paragraph({ spacing: { before: 60 }, children: [run(AI_AUDIO_NOTE, { size: ctx.size - 2, color: '666666' })] }))
      if ((key || audioRegeln.transcriptOnSheet) && block.transcript) {
        inner.push(
          new Paragraph({
            spacing: { before: 120 },
            children: [run(audioRegeln.transcriptOnSheet && !key ? 'Text der Aufnahme' : 'Skript', { bold: true, size: ctx.size - 2 })]
          })
        )
        for (const p of splitParagraphs(block.transcript)) inner.push(...(await rich(ctx, p)))
      }
      return [boxTable(ctx, inner, {}), spacer()]
    }
    case 'video': {
      const kind = videoKindById(block.kind)
      const facts = [
        kind?.label,
        block.minutes ? `${block.minutes} min` : '',
        block.section ? `Abschnitt ${block.section}` : '',
        block.plays === 1 ? 'einmal sehen' : `${block.plays}-mal sehen`
      ]
        .filter(Boolean)
        .join(' · ')
      const inner: Child[] = [
        new Paragraph({
          spacing: { after: 60 },
          children: [run(`▶ ${block.title}`, { bold: true, color: ctx.accent }), run(facts ? `   ${facts}` : '', { size: ctx.size - 2 })]
        })
      ]
      if (block.sourceTitle) {
        inner.push(
          new Paragraph({
            children: [run(block.sourceTitle + (block.platform ? ` · ${block.platform}` : ''), { size: ctx.size - 2 })]
          })
        )
      }
      if (block.summary) inner.push(...(await rich(ctx, block.summary)))
      if (block.beforeViewing) inner.push(...(await rich(ctx, block.beforeViewing)))
      if (block.url) {
        const qr = await ctx.deps.raster(qrSvg(block.url, 24), 24 * PX_PER_MM, 24 * PX_PER_MM)
        inner.push(new Paragraph({ children: [imageRun(qr, 24 * PX_MM, 24 * PX_MM)] }))
        // Der Klartextlink ist der Ersatz für fehlende Geräte – er gehört auch ins Word-Dokument
        inner.push(new Paragraph({ children: [run(shortLink(block.url), { size: ctx.size - 3 })] }))
      }
      if (key && (block.teacherNote || block.url)) {
        inner.push(new Paragraph({ spacing: { before: 120 }, children: [run('Nur für die Lehrkraft', { bold: true, size: ctx.size - 2 })] }))
        if (block.teacherNote) inner.push(...(await rich(ctx, block.teacherNote)))
        if (block.url) inner.push(new Paragraph({ children: [run(block.url, { size: ctx.size - 3 })] }))
        for (const line of [...COPYRIGHT_NOTE, ...(block.url ? QR_NOTE : [])]) {
          inner.push(new Paragraph({ indent: { left: 200, hanging: 200 }, children: [run('–	', { size: ctx.size - 3 }), run(line, { size: ctx.size - 3 })] }))
        }
        inner.push(
          new Paragraph({
            children: [
              run(
                'Hinweis, keine Rechtsberatung. Grundlage: § 60a UrhG und die FAQ „Was darf ich in der Filmbildung?“ (FILM+SCHULE NRW, Institut für Medienrecht der Universität zu Köln, Stand 2023).',
                { size: ctx.size - 4, color: '666666' }
              )
            ]
          })
        )
      }
      return [boxTable(ctx, inner, {}), spacer()]
    }
    case 'selfCheck': {
      if (key) return []
      const heads =
        block.format === 'kompetenzraster' ? ['sicher', 'teilweise', 'noch nicht'] : block.format === 'ampel' ? ['grün', 'gelb', 'rot'] : ['🙂', '😐', '🙁']
      return [
        await gridTable(
          ctx,
          [block.title, ...heads],
          block.statements.map((s) => [s, '', '', '']),
          ctx.contentWidth,
          [0.64, 0.12, 0.12, 0.12]
        ),
        spacer()
      ]
    }
    case 'divider':
      return [
        new Paragraph({
          keepNext: true,
          spacing: { before: 120, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ctx.accent, space: 1 } },
          children: await richRun(ctx, block.title, { bold: true, color: ctx.accent, size: Math.round(ctx.size * 1.1) })
        })
      ]
  }
}

async function gridTable(ctx: Ctx, headers: string[], rows: string[][], width: number, weights?: number[], solutionRows?: string[][]): Promise<Table> {
  const cols = Math.max(headers.length, ...rows.map((r) => r.length), 1)
  const ws = weights ?? Array(cols).fill(1 / cols)
  const border = { style: BorderStyle.SINGLE, size: 6, color: '444444' }
  const borders = { top: border, bottom: border, left: border, right: border }
  const cell = async (text: string, c: number, head: boolean, solution?: string): Promise<TableCell> =>
    new TableCell({
      width: { size: Math.round(width * ws[c]), type: WidthType.DXA },
      borders,
      margins: { left: 100, right: 100, top: 60, bottom: 60 },
      ...(head ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(ctx.accent, 0.12) } } : {}),
      children: [
        new Paragraph({
          children: text
            ? await richTextRuns(text, { size: ctx.size - 1, raster: ctx.deps.raster, run: head ? { bold: true } : {} })
            : solution && ctx.key
              ? await richRun(ctx, solution, { color: RED, bold: true, size: ctx.size - 1 })
              : [run(' ')]
        })
      ]
    })
  const tableRows: TableRow[] = []
  if (headers.length) tableRows.push(new TableRow({ tableHeader: true, children: await Promise.all(headers.map((h, c) => cell(h, c, true))) }))
  for (let r = 0; r < rows.length; r++) {
    tableRows.push(
      new TableRow({
        height: { value: 420, rule: 'atLeast' },
        children: await Promise.all(Array.from({ length: cols }, (_, c) => cell(rows[r][c] ?? '', c, false, solutionRows?.[r]?.[c])))
      })
    )
  }
  return new Table({ width: { size: width, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: tableRows })
}

function gridArea(ctx: Ctx, heightMm: number, squares: boolean): Table {
  const cell = Math.round(5 * MM)
  const cols = Math.max(1, Math.floor(ctx.contentWidth / cell))
  const rows = Math.max(1, Math.round(heightMm / 5))
  const line = { style: squares ? BorderStyle.SINGLE : BorderStyle.NONE, size: 2, color: 'B8C4CC' }
  if (!squares) {
    return boxTable(ctx, [new Paragraph({ spacing: { before: Math.round(heightMm * MM) }, children: [] })], { color: 'BBBBBB' })
  }
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: cols * cell, type: WidthType.DXA },
    columnWidths: Array(cols).fill(cell),
    rows: Array.from(
      { length: rows },
      () =>
        new TableRow({
          height: { value: cell, rule: 'exact' },
          children: Array.from(
            { length: cols },
            () =>
              new TableCell({
                width: { size: cell, type: WidthType.DXA },
                borders: { top: line, bottom: line, left: line, right: line },
                children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [run(' ', { size: 2 })] })]
              })
          )
        })
    )
  })
}

async function answerContent(ctx: Ctx, a: Answer, indent: number): Promise<Child[]> {
  const key = ctx.key
  const width = ctx.contentWidth - indent
  switch (a.kind) {
    case 'none':
      return []
    case 'lines':
      /*
       * Auf dem LÖSUNGSBLATT keine Schreiblinien.
       *
       * Gewünscht von der Lehrkraft (24.09.2026): „bei den Lösungen sind die Linien nicht
       * notwendig". An ihrer Stelle steht der Mustertext – eingesetzt wird er dort, wo die
       * Aufgabe zusammengebaut wird (`taskContent`), weil nur dort der Auftrag bekannt ist.
       */
      return key ? [] : writingLines(Math.max(0, a.count), indent)
    case 'grid':
      return [gridArea(ctx, a.count * 5, true)]
    case 'space':
      return [gridArea(ctx, a.heightMm, false)]
    case 'labels':
      return await Promise.all(
        Array.from(
          { length: a.count },
          async (_, i) =>
            new Paragraph({
              indent: { left: indent },
              spacing: { before: 160 },
              tabStops: [{ type: TabStopType.LEFT, position: indent + 360 }],
              border: key ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 4, color: '666666', space: 1 } },
              children: [run(`${i + 1}\t`, { bold: true }), ...(key ? await richRun(ctx, a.labels[i] ?? '', { color: RED, bold: true }) : [])]
            })
        )
      )
    case 'gapText': {
      // [[Lösung]] → Lücke bzw. rote Lösung
      const parts = a.gapText.split(/\[\[(.+?)\]\]/)
      const children: ParagraphChild[] = []
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) children.push(key ? run(parts[i], { color: RED, bold: true }) : run('________________'))
        else if (parts[i]) children.push(...(await richTextRuns(parts[i], { size: ctx.size, raster: ctx.deps.raster })))
      }
      return [new Paragraph({ indent: { left: indent }, spacing: { line: 400 }, children })]
    }
    case 'matching': {
      const rows = Math.max(a.left.length, a.right.length)
      const border = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
      const w = [500, Math.round((width - 500) * 0.55), Math.round((width - 500) * 0.45)]
      return [
        new Table({
          width: { size: width, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          indent: { size: indent, type: WidthType.DXA },
          rows: await Promise.all(
            Array.from(
              { length: rows },
              async (_, r) =>
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: w[0], type: WidthType.DXA },
                      borders: r < a.left.length ? { top: border, bottom: border, left: border, right: border } : NO_BORDERS,
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [run(key && (a.pairs[r] ?? -1) >= 0 ? String.fromCharCode(97 + a.pairs[r]) : '', { color: RED, bold: true })]
                        })
                      ]
                    }),
                    new TableCell({
                      width: { size: w[1], type: WidthType.DXA },
                      borders: NO_BORDERS,
                      margins: { left: 140, top: 60, bottom: 60 },
                      children: [new Paragraph({ children: r < a.left.length ? [run(`${r + 1}  `, { bold: true }), ...(await richRun(ctx, a.left[r]))] : [] })]
                    }),
                    new TableCell({
                      width: { size: w[2], type: WidthType.DXA },
                      borders: NO_BORDERS,
                      margins: { left: 140, top: 60, bottom: 60 },
                      children: [
                        new Paragraph({
                          children: r < a.right.length ? [run(`${String.fromCharCode(97 + r)})  `, { bold: true }), ...(await richRun(ctx, a.right[r]))] : []
                        })
                      ]
                    })
                  ]
                })
            )
          )
        })
      ]
    }
    case 'multipleChoice':
      /*
       * Eine Möglichkeit je Absatz, mit Buchstabe und Kästchen davor – wie am Bildschirm.
       * Vorher standen alle Möglichkeiten in EINEM Absatz nebeneinander; das ist die
       * schlechter belegte Form (Haladyna u. a. 2002, Guideline 10: „Format the item
       * vertically instead of horizontally") und zerfiel im Word-Umbruch unkontrolliert.
       */
      return await Promise.all(
        a.options.map(async (o, i) => {
          const correct = key && a.correct.includes(i)
          return new Paragraph({
            indent: { left: indent + 200 },
            spacing: { after: 20 },
            children: [
              run(`${String.fromCharCode(97 + i)}) `),
              run(correct ? '☒ ' : '☐ ', { color: correct ? RED : undefined }),
              ...(await richRun(ctx, o, correct ? { bold: true, color: RED } : {}))
            ]
          })
        })
      )
    case 'trueFalse': {
      const rows = a.statements.map((s) => [s.text, key && s.isTrue ? '✗' : '', key && !s.isTrue ? '✗' : ''])
      const labels = trueFalseLabels(subjectById(ctx.ws.meta.subjectId).foreignLanguage ?? 'de')
      return [await gridTable(ctx, ['', labels.yes, labels.no], rows, width, [0.72, 0.14, 0.14])]
    }
    case 'ordering': {
      const order = a.displayOrder.length === a.items.length ? a.displayOrder : a.items.map((_, i) => i)
      return await Promise.all(
        order.map(
          async (idx) =>
            new Paragraph({
              indent: { left: indent },
              spacing: { after: 60 },
              children: [run(key ? `[ ${idx + 1} ]  ` : '[   ]  ', { bold: true, color: key ? RED : undefined }), ...(await richRun(ctx, a.items[idx] ?? ''))]
            })
        )
      )
    }
    case 'tableFill':
      return [await gridTable(ctx, a.headers, a.rows, width, undefined, a.solutionRows)]
  }
}

async function taskContent(ctx: Ctx, block: TaskBlock, number?: number): Promise<Child[]> {
  const out: Child[] = []
  const indent = 480
  const style = ctx.ws.design.tasks
  const head: ParagraphChild[] = []
  if (number !== undefined)
    head.push(
      new TextRun({
        text: ` ${number} `,
        bold: true,
        color: style.numberStyle === 'plain' ? ctx.accent : 'FFFFFF',
        shading: style.numberStyle === 'plain' ? undefined : { type: ShadingType.CLEAR, color: 'auto', fill: ctx.accent },
        size: ctx.size
      }),
      run('  ')
    )
  if (block.stars && ctx.ws.meta.differentiation.mode === 'combined' && ctx.ws.meta.differentiation.levels > 1)
    head.push(run(`${'★'.repeat(block.stars)} `, { color: 'B8860B' }))
  if (style.showSocialFormIcons) {
    const px = (ctx.size / 2) * (96 / 72) * 1.1
    // Hat die Lehrkraft das Symbol selbst gestalten lassen, gilt ihre Fassung – auch hier
    const own = ctx.deps.pictograms?.[pictogramForSocialForm(block.socialForm)?.id ?? '']
    if (own) {
      head.push(imageRun(own, px, px), run('  '))
    } else {
      const svg = SOCIAL_FORM_SVG[block.socialForm]
      const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
      const w = Number(vb?.[1] ?? 24)
      const h = Number(vb?.[2] ?? 22)
      const png = await ctx.deps.raster(svg.replace(/currentColor/g, '#444444'), w * 4, h * 4)
      head.push(imageRun(png, (w / h) * px, px), run('  '))
    }
  }
  const instruction = await richTextRuns(block.instruction, { size: ctx.size, raster: ctx.deps.raster })
  out.push(
    new Paragraph({
      keepNext: true,
      spacing: { before: 120, after: 60 },
      indent: { left: indent, hanging: indent },
      tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidth }],
      // Auf Arbeitsblättern werden keine Punkte vergeben.
      // Der Hinweis auf das gelöste Beispiel tritt hinzu, wenn eines da ist – wie am Bildschirm.
      children: [
        ...head,
        ...instruction,
        ...(block.example ? [run(` ${exampleNote(subjectById(ctx.ws.meta.subjectId).foreignLanguage ?? 'de')}`, { color: '555555' })] : [])
      ]
    })
  )
  /*
   * Vorgaben einer Schreibaufgabe – dieselbe Reihenfolge wie am Bildschirm.
   *
   * Sie standen lange NUR in der Datei: erzeugt, geprüft, aber weder gedruckt noch
   * exportiert. Die Bewertungskriterien bleiben auch hier draußen; sie gehören in den
   * Erwartungshorizont, nicht in die Hand der Lernenden.
   */
  const brief = block.brief
  if (brief) {
    if (brief.situation)
      out.push(new Paragraph({ indent: { left: indent }, spacing: { before: 60, after: 40 }, children: await richRun(ctx, brief.situation) }))
    const rahmen = [brief.audience, brief.textType, brief.purpose].filter(Boolean).join(' · ')
    if (rahmen) out.push(new Paragraph({ indent: { left: indent }, spacing: { after: 60 }, children: [run(rahmen, { italics: true })] }))

    const notizen = (brief.notes ?? []).filter((s) => s.title || s.items.length || s.prompts.length)
    if (notizen.length) {
      out.push(
        new Table({
          width: { size: ctx.contentWidth - indent, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              children: await Promise.all(
                notizen.map(async (spalte) => {
                  const zellen: Paragraph[] = [new Paragraph({ children: await richRun(ctx, spalte.title, { bold: true }) })]
                  for (const it of spalte.items) zellen.push(new Paragraph({ bullet: { level: 0 }, children: await richRun(ctx, it) }))
                  // Offene Impulse bekommen eine Schreiblinie – sie sind zum Ausfüllen da
                  for (const p of spalte.prompts)
                    zellen.push(
                      new Paragraph({
                        spacing: { before: 60 },
                        border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: '999999' } },
                        children: await richRun(ctx, p)
                      })
                    )
                  return new TableCell({ children: zellen })
                })
              )
            })
          ]
        })
      )
    }

    for (const p of brief.points) out.push(new Paragraph({ bullet: { level: 0 }, indent: { left: indent + 200 }, children: await richRun(ctx, p) }))

    // Die Wortzahl nur, wenn das Blatt sie nennen soll – dieselbe Regel wie am Bildschirm
    const zeigtWortzahl = Boolean(ctx.ws.meta.wordLimit) && brief.words > 0
    const formZeile = [zeigtWortzahl ? `Umfang: etwa ${brief.words} Wörter` : '', ...(brief.form ?? []).filter(Boolean)].filter(Boolean).join(' · ')
    if (formZeile) out.push(new Paragraph({ indent: { left: indent }, spacing: { before: 60, after: 40 }, children: [run(formZeile, { bold: true })] }))
  }

  /*
   * Gelöstes Beispiel als Punkt „0" – wie am Bildschirm vor den echten Items, grau gesetzt
   * und mit eingetragener Lösung. Es steht auch auf dem Schülerblatt; es zeigt die Form der
   * Antwort, es prüft nichts (ÖSZ 2024).
   */
  if (block.example) {
    const grau = '666666'
    out.push(
      new Paragraph({
        keepNext: true,
        indent: { left: indent + 200 },
        spacing: { before: 60, after: 20 },
        children: [run('0. ', { bold: true, color: grau }), ...(await richTextRuns(block.example.instruction, { size: ctx.size, raster: ctx.deps.raster }))]
      })
    )
    const a = block.example.answer
    if (a.kind === 'multipleChoice') {
      a.options.forEach((o, i) => {
        const richtig = a.correct.includes(i)
        out.push(
          new Paragraph({
            indent: { left: indent + 400 },
            spacing: { after: 20 },
            children: [
              run(`${String.fromCharCode(97 + i)}) `, { color: grau }),
              run(richtig ? '☒ ' : '☐ ', { color: grau }),
              run(plainText(o), { color: grau })
            ]
          })
        )
      })
    } else if (block.example.solution) {
      out.push(
        new Paragraph({
          indent: { left: indent + 400 },
          spacing: { after: 20 },
          children: [run(plainText(block.example.solution), { color: grau, bold: true })]
        })
      )
    }
  }

  if (istMcListe(block.parts)) {
    /*
     * Fragenreihe zum Ankreuzen – dieselbe Anordnung wie auf dem Bildschirm: rahmenlose
     * Tabelle, spaltenweise gefüllt, Nummer je Frage und Buchstabe je Möglichkeit.
     * Begründung in `render/mcGrid.ts`.
     */
    const spalten = mcSpalten(block.parts)
    const zeilen = mcZeilen(
      block.parts.map((part, i) => ({ part, i })),
      spalten
    )
    const zellBreite = Math.floor((ctx.contentWidth - indent) / spalten)
    out.push(
      new Table({
        width: { size: ctx.contentWidth - indent, type: WidthType.DXA },
        indent: { size: indent, type: WidthType.DXA },
        borders: { ...NO_BORDERS, insideHorizontal: NO_BORDERS.top, insideVertical: NO_BORDERS.top },
        rows: await Promise.all(
          zeilen.map(
            async (zeile) =>
              new TableRow({
                children: await Promise.all(
                  zeile.map(async (eintrag) => {
                    const kinder: Paragraph[] = []
                    if (eintrag) {
                      kinder.push(
                        new Paragraph({
                          keepNext: true,
                          spacing: { before: 60, after: 20 },
                          children: [
                            run(`${eintrag.i + 1}. `, { bold: true }),
                            ...(await richTextRuns(ohneOperator(eintrag.part.instruction, block.operator), { size: ctx.size, raster: ctx.deps.raster }))
                          ]
                        })
                      )
                      const a = eintrag.part.answer
                      if (a.kind === 'multipleChoice') {
                        a.options.forEach((o, oi) => {
                          const richtig = ctx.key && a.correct.includes(oi)
                          kinder.push(
                            new Paragraph({
                              indent: { left: 200 },
                              spacing: { after: 20 },
                              children: [
                                run(`${String.fromCharCode(97 + oi)}) `),
                                run(richtig ? '☒ ' : '☐ ', { color: richtig ? RED : undefined }),
                                run(plainText(o), richtig ? { bold: true, color: RED } : {})
                              ]
                            })
                          )
                        })
                      }
                      if (ctx.key && eintrag.part.solution) {
                        kinder.push(new Paragraph({ indent: { left: 200 }, children: [run(plainText(eintrag.part.solution), { color: RED })] }))
                      }
                    } else {
                      kinder.push(new Paragraph({ children: [] }))
                    }
                    return new TableCell({ width: { size: zellBreite, type: WidthType.DXA }, borders: NO_BORDERS, children: kinder })
                  })
                )
              })
          )
        )
      })
    )
  } else if (block.parts.length) {
    for (let i = 0; i < block.parts.length; i++) {
      const p = block.parts[i]
      out.push(
        new Paragraph({
          keepNext: true,
          indent: { left: indent * 2, hanging: indent },
          spacing: { before: 60 },
          children: [
            run(`${String.fromCharCode(97 + i)})\t`, { bold: true }),
            ...(await richTextRuns(p.instruction, { size: ctx.size, raster: ctx.deps.raster }))
          ]
        })
      )
      out.push(...(await answerContent(ctx, p.answer, indent * 2)))
      if (ctx.key && p.solution) out.push(...(await rich(ctx, p.solution, { run: { color: RED }, paragraph: { indent: { left: indent * 2 } } })))
    }
  } else {
    /*
     * MUSTERTEXT an der Stelle der Schreiblinien – auf dem Lösungsblatt.
     *
     * Wie am Bildschirm: Wo die Lernenden schreiben, liest die Lehrkraft den ausformulierten
     * Text. Der stichpunktartige Erwartungshorizont bleibt zusätzlich am Ende stehen.
     */
    const mustertextOben = ctx.key && block.answer.kind === 'lines' && Boolean(block.brief?.model)
    if (mustertextOben) out.push(...(await rich(ctx, block.brief!.model!, { run: { color: RED }, paragraph: { indent: { left: indent } } })))
    else out.push(...(await answerContent(ctx, block.answer, indent)))
  }
  if (ctx.key && block.solution)
    out.push(...(await rich(ctx, `**Lösung:** ${block.solution}`, { run: { color: RED }, paragraph: { indent: { left: indent } } })))

  /*
   * Erwartungshorizont einer Schreibaufgabe – wie am Bildschirm, nur auf dem Lösungsblatt.
   * Aufbau nach den amtlichen Erwartungshorizonten: übergeordnetes Kriterium mit Punktzahl,
   * darunter nicht verbindliche Beispiele, dazu die Öffnungsklausel.
   */
  if (ctx.key && brief && ((brief.expected ?? []).length || brief.criteria.length || brief.model)) {
    const links = { left: indent }
    out.push(new Paragraph({ indent: links, spacing: { before: 120, after: 40 }, children: [run('Erwartungshorizont', { bold: true, color: RED })] }))
    for (const e of brief.expected ?? []) {
      out.push(
        new Paragraph({
          indent: links,
          spacing: { before: 60 },
          children: [...(await richRun(ctx, e.aspect, { bold: true, color: RED })), ...(e.points > 0 ? [run(`  ${e.points} P.`, { color: RED })] : [])]
        })
      )
      if (e.criterion) out.push(new Paragraph({ indent: links, children: await richRun(ctx, e.criterion, { color: RED }) }))
      for (const x of e.examples)
        out.push(new Paragraph({ bullet: { level: 0 }, indent: { left: indent + 200 }, children: await richRun(ctx, x, { color: RED }) }))
    }
    if ((brief.expected ?? []).length)
      out.push(
        new Paragraph({
          indent: links,
          spacing: { before: 60 },
          children: [
            run(
              'Die Beispiele sind nicht verbindlich. Passende Aspekte, die hier nicht vorhergesehen sind, können ebenfalls gewertet werden; die Höchstpunktzahl des Aspekts wird dabei nicht überschritten.',
              { italics: true, color: RED }
            )
          ]
        })
      )
    if (brief.criteria.length) {
      out.push(new Paragraph({ indent: links, spacing: { before: 60 }, children: [run('Bewertung', { bold: true, color: RED })] }))
      for (const c of brief.criteria)
        out.push(new Paragraph({ bullet: { level: 0 }, indent: { left: indent + 200 }, children: await richRun(ctx, c, { color: RED }) }))
    }
    // Nicht doppelt: Bei einer Schreibaufgabe steht er schon oben auf den Linien
    const obenGezeigt = block.answer.kind === 'lines' && !block.parts.length && Boolean(brief.model)
    if (brief.model && !obenGezeigt) {
      out.push(new Paragraph({ indent: links, spacing: { before: 60 }, children: [run('Mustertext', { bold: true, color: RED })] }))
      out.push(...(await rich(ctx, brief.model, { run: { color: RED }, paragraph: { indent: links } })))
    }
  }
  if (ctx.key && (block.afb || block.operator)) {
    out.push(
      new Paragraph({
        indent: { left: indent },
        children: [
          run([block.afb ? `AFB ${block.afb}` : '', block.operator ? `Operator: ${block.operator}` : '', block.afbReason].filter(Boolean).join(' · '), {
            size: ctx.size - 6,
            color: '666666'
          })
        ]
      })
    )
  }
  out.push(spacer())
  return out
}
