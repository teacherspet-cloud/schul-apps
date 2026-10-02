import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  ISectionOptions,
  Packer,
  Paragraph as WordParagraph,
  ParagraphChild,
  Table as WordTable,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType
} from 'docx'
import type { IParagraphOptions, ITableOptions } from 'docx'
import { kiVermerkText, kiWordEigenschaften, vermerkSichtbar } from '@shared/kiKennzeichnung'
import { blockPoints, firstLetterOf, formatPoints, letter, variantPoints, wordBankFor } from '../model/blocks'
import type { Block, TestDocument, Variant } from '../model/types'
import { geltendeFachfarbe } from '../../../shared/fachfarben'
import { blockHelp } from '../render/helpTexts'
import type { TestLayouts } from '../render/useTestLayout'
import { vtSeitenGruppe } from '../render/printHtml'
import type { SeitenMarke } from '../../../shared/export/seitenAuswahl'

import {
  A4_WIDTH as PAGE_WIDTH,
  ALL_BORDERS,
  CM,
  dataUrlBytes,
  imageRun,
  ImageSizer,
  NO_BORDERS,
  RED,
  run,
  THIN,
  writingLines
} from '../../../shared/export/docxKit'
import { maskottchenBild } from '../../../shared/maskottchenStore'
import { trueFalseLabels } from '../../../shared/trueFalseLabels'
import { vokabeltestFigur } from '../render/maskottchen'
import { vokabeltestPfad } from '../render/TestPage'
import { kopfTexte } from '../render/aufgabenTexte'
import { istRtl, wordSchrift } from '../../../shared/sprachSchrift'
import { mindmapAeste, mindmapLage, mindmapSvg } from '../render/mindmapLayout'

/*
 * Arabisch (30.09.2026): Absätze und Tabellen von rechts nach links. Statt jede der vielen
 * Absatzstellen einzeln anzufassen, setzen diese beiden Klassen die Richtung für die Dauer eines
 * Exports (buildDocx setzt und löscht den Schalter).
 */
let rechtsNachLinks = false
class Paragraph extends WordParagraph {
  constructor(o: string | IParagraphOptions) {
    super(rechtsNachLinks ? (typeof o === 'string' ? { text: o, bidirectional: true } : { bidirectional: true, ...o }) : o)
  }
}
class Table extends WordTable {
  constructor(o: ITableOptions) {
    super(rechtsNachLinks ? { visuallyRightToLeft: true, ...o } : o)
  }
}

const PX_MM = 96 / 25.4

type Mode = 'print' | 'key'
export type { ImageSizer }

// Druckränder wie in der Vorschau: oben 1,5 cm, unten 2 cm, links 2,5 cm (Lochrand), rechts 2 cm
const MARGINS = { top: Math.round(1.5 * CM), bottom: Math.round(2 * CM), left: Math.round(2.5 * CM), right: Math.round(2 * CM) }
const CONTENT = PAGE_WIDTH - MARGINS.left - MARGINS.right

/**
 * Mindmap als PNG (02.10.2026): SVG über eine Zeichenfläche rechnen, dreifach aufgelöst für einen
 * scharfen Druck. null ohne Zeichenfläche (Tests, Node) – dann nimmt der Export die Tabelle.
 */
async function mindmapPng(svg: string, breiteMm: number, hoeheMm: number): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  try {
    const breite = Math.round(breiteMm * PX_MM * 3)
    const hoehe = Math.round(hoeheMm * PX_MM * 3)
    const canvas = document.createElement('canvas')
    canvas.width = breite
    canvas.height = hoehe
    const zeichen = canvas.getContext('2d')
    if (!zeichen) return null
    const bild = new Image()
    await new Promise<void>((ok, fehler) => {
      bild.onload = () => ok()
      bild.onerror = () => fehler(new Error('Mindmap-Bild nicht ladbar'))
      // Ohne Antwort binnen weniger Sekunden lieber die Tabelle als ein hängender Export
      setTimeout(() => fehler(new Error('Zeitüberschreitung')), 4000)
      bild.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
    zeichen.fillStyle = '#ffffff'
    zeichen.fillRect(0, 0, breite, hoehe)
    zeichen.drawImage(bild, 0, 0, breite, hoehe)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

export interface DocxOptions {
  variantIds: string[]
  includeKey: boolean
  keyOnly?: boolean
  credits?: string[]
  /** Seitenaufteilung aus dem Editor: gleiche Schriftgröße und Seitenumbrüche vor den gleichen Aufgaben */
  layouts?: TestLayouts | null
  /**
   * Seitenauswahl (01.10.2026): je Zählgruppe (render/printHtml.tsx, `vtSeitenGruppe`) die Aufgaben
   * der gewählten Seiten. Word bricht selbst um – ausgegeben wird, was auf diesen Seiten steht.
   */
  auswahl?: Map<string, Set<string>>
}

/** Aus den Marken der gewählten Seiten die Aufgaben je Variante und Teil (für `auswahl`) */
export function vtWordAuswahl(doc: TestDocument, layouts: TestLayouts | null | undefined, marken: SeitenMarke[]): Map<string, Set<string>> {
  const aus = new Map<string, Set<string>>()
  for (const m of marken) {
    const gruppe = m.gruppe ?? ''
    const trenn = gruppe.lastIndexOf(':')
    const variante = doc.variants.find((v) => v.id === gruppe.slice(0, trenn))
    if (!variante) continue
    const ids = aus.get(gruppe) ?? new Set<string>()
    aus.set(gruppe, ids)
    const layout = (gruppe.slice(trenn + 1) === 'loesung' ? layouts?.key : layouts?.student)?.get(variante.id)
    const seite = layout?.pages[(m.index ?? 1) - 1]
    for (const id of seite ? seite.items.map((it) => it.id) : variante.blocks.map((b) => b.id)) ids.add(id)
  }
  return aus
}

export async function buildDocx(doc: TestDocument, opts: DocxOptions, sizer: ImageSizer): Promise<Uint8Array> {
  rechtsNachLinks = istRtl(doc.settings.targetLanguage)
  try {
    return await baueDocx(doc, opts, sizer)
  } finally {
    rechtsNachLinks = false
  }
}

async function baueDocx(doc: TestDocument, opts: DocxOptions, sizer: ImageSizer): Promise<Uint8Array> {
  const layoutFont = opts.layouts?.student.values().next().value?.fontSize
  const size = Math.round((layoutFont ?? doc.fontSize) * 2) // halbe Punkte
  // Dieselbe Farbe wie in Vorschau und Druck (vokabeltestFarbe in TestPage.tsx)
  const farbe = geltendeFachfarbe(doc.settings.targetLanguage, doc.header.vorlagenfarbe)
  const ctx: Ctx = { doc, size, sizer, akzent: farbe ? farbe.replace('#', '').toUpperCase() : null }
  const sections: ISectionOptions[] = []
  const variants = doc.variants.filter((v) => opts.variantIds.includes(v.id))

  const addSections = async (mode: Mode): Promise<void> => {
    for (const v of variants) {
      // Seitenauswahl: nur Varianten mit gewählten Seiten, davon nur deren Aufgaben
      const gewaehlt = opts.auswahl?.get(vtSeitenGruppe(v.id, mode === 'key'))
      if (opts.auswahl && !gewaehlt) continue
      const children: (Paragraph | Table)[] = [...(mode === 'print' ? await figurAbsatz(ctx, 'winkend') : []), ...header(ctx, v, mode)]
      const layout = (mode === 'key' ? opts.layouts?.key : opts.layouts?.student)?.get(v.id)
      // Aufgaben, die im Editor oben auf einer neuen Seite beginnen
      const pageStarts = new Set(
        (layout?.pages.slice(1) ?? [])
          .map((p) => p.items[0])
          .filter((it) => it && !it.continued)
          .map((it) => it.id)
      )
      for (let i = 0; i < v.blocks.length; i++) {
        if (gewaehlt && !gewaehlt.has(v.blocks[i].id)) continue
        children.push(...(await blockContent(ctx, v.blocks[i], i + 1, mode, pageStarts.has(v.blocks[i].id))))
      }
      if (mode === 'print') children.push(...(await figurAbsatz(ctx, 'jubelnd')))
      if (opts.credits?.length) {
        children.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: opts.credits.join(' · '), size: 14, color: '777777' })] }))
      }
      // KI-Vermerk (Großprogramm 0.4)
      if (vermerkSichtbar(doc.ki, doc.kiVermerk, mode === 'key')) {
        children.push(
          new Paragraph({
            spacing: { before: 300 },
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: kiVermerkText(doc.ki!, 'de'), size: 13, color: '777777' })]
          })
        )
      }
      sections.push({
        properties: { page: { size: { width: PAGE_WIDTH, height: 16838 }, margin: MARGINS } },
        children
      })
    }
  }
  if (!opts.keyOnly) await addSections('print')
  if (opts.includeKey || opts.keyOnly) await addSections('key')
  // Ganz ohne Inhalt würde Word die Datei nicht öffnen
  if (!sections.length) sections.push({ children: [new Paragraph('')] })

  const document = new Document({
    creator: 'Schul-Apps',
    title: doc.header.title,
    // KI-Kennzeichnung, maschinenlesbar (Großprogramm 0.4)
    ...kiWordEigenschaften(doc.ki),
    styles: { default: { document: { run: { font: grundschrift(doc.settings.targetLanguage), size, sizeComplexScript: size } } } },
    sections
  })
  const blob = await Packer.toArrayBuffer(document)
  return new Uint8Array(blob)
}

/**
 * Grundschrift je Sprache (shared/sprachSchrift.ts): Altgriechisch ganz in Palatino Linotype (polyton),
 * Chinesisch/Japanisch mit ostasiatischer Schrift für die Zeichen, Arabisch mit Arial für die
 * komplexe Schrift – lateinische Buchstaben bleiben dort Calibri.
 */
function grundschrift(sprache: string): string | { ascii: string; hAnsi: string; eastAsia?: string; cs?: string } {
  const s = wordSchrift(sprache)
  if (!s) return 'Calibri'
  if (s.wordArt === 'eastAsia') return { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: s.word }
  if (s.wordArt === 'cs') return { ascii: 'Calibri', hAnsi: 'Calibri', cs: s.word }
  return s.word
}

interface Ctx {
  doc: TestDocument
  size: number
  sizer: ImageSizer
  /** Fachfarbe ohne # (Paket 10a) – null = schwarz wie bisher */
  akzent: string | null
}

// ---------- Kopf ----------

/**
 * Kopf- und Schlussfigur (27.09.2026) wie im Arbeitsblatt-Export: ein kleines Bild rechts,
 * vor dem Kopf bzw. nach der letzten Aufgabe – Word kennt keine Ecke „darüber".
 */
async function figurAbsatz(ctx: Ctx, pose: 'winkend' | 'jubelnd'): Promise<Paragraph[]> {
  const figur = vokabeltestFigur(ctx.doc)
  if (!figur) return []
  const src = maskottchenBild(figur.maskottchenId, pose)
  if (!src) return []
  const dim = await ctx.sizer(src).catch(() => ({ width: 2, height: 3 }))
  const h = 16 * PX_MM
  const w = (dim.width / Math.max(1, dim.height)) * h
  return [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 60 }, children: [imageRun(src, w, h)] })]
}

function header(ctx: Ctx, v: Variant, mode: Mode): (Paragraph | Table)[] {
  const h = ctx.doc.header
  const out: (Paragraph | Table)[] = []
  // Überthema rechts in der Zeile der Schule – wie in der Vorschau (Paket 11)
  const pfad = vokabeltestPfad(ctx.doc)
  if (pfad) {
    out.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
        children: [
          new TextRun({ text: h.showSchool ? h.schoolName : '', size: ctx.size - 4, color: '555555' }),
          new TextRun({ text: `\t${pfad}`, size: ctx.size - 4, bold: true, color: ctx.akzent ?? '333333' })
        ]
      })
    )
  } else if (h.showSchool && h.schoolName) {
    out.push(new Paragraph({ children: [new TextRun({ text: h.schoolName, size: ctx.size - 4, color: '555555' })] }))
  }
  // Feste Kopftexte in der Testsprache (30.09.2026)
  const k = kopfTexte(ctx.doc.settings.targetLanguage)
  const titleRuns: ParagraphChild[] = [new TextRun({ text: h.title + (mode === 'key' ? ` – ${k.loesung}` : ''), bold: true, size: Math.round(ctx.size * 1.9) })]
  if (h.showVariant && ctx.doc.variants.length > 1) {
    titleRuns.push(new TextRun({ text: `\t${k.gruppe(v.label)}`, bold: true, size: Math.round(ctx.size * 1.3), ...(ctx.akzent ? { color: ctx.akzent } : {}) }))
  }
  out.push(
    new Paragraph({
      children: titleRuns,
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ctx.akzent ?? '000000', space: 2 } },
      spacing: { after: 120 }
    })
  )
  if (h.subtitle) out.push(new Paragraph({ children: [new TextRun(h.subtitle)] }))

  if (mode === 'print') {
    const fields: [string, number][] = []
    if (h.showName) fields.push([k.name, 5])
    if (h.showClass) fields.push([k.klasse, 2])
    if (h.showDate) fields.push([k.datum, 2.5])
    if (fields.length) {
      const totalWeight = fields.reduce((s, [, w]) => s + w, 0)
      const cells: TableCell[] = []
      // Spaltenraster ausdrücklich (28.09.2026) – sonst setzt Word Standardbreiten und die Beschriftung bricht um
      const spalten: number[] = []
      for (const [label, weight] of fields) {
        const width = Math.round((CONTENT * weight) / totalWeight)
        spalten.push(Math.round(width * 0.3), Math.round(width * 0.7))
        cells.push(
          new TableCell({
            width: { size: Math.round(width * 0.3), type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.BOTTOM,
            children: [new Paragraph({ children: [new TextRun(label)] })]
          }),
          new TableCell({
            width: { size: Math.round(width * 0.7), type: WidthType.DXA },
            borders: { ...NO_BORDERS, bottom: THIN },
            children: [new Paragraph('')]
          })
        )
      }
      out.push(
        new Table({
          rows: [new TableRow({ children: cells, height: { value: 500, rule: 'atLeast' } })],
          width: { size: CONTENT, type: WidthType.DXA },
          columnWidths: spalten,
          layout: TableLayoutType.FIXED
        })
      )
    }
  }
  const scoreParts: string[] = []
  if (h.showPoints) scoreParts.push(`${k.punkte} ${mode === 'key' ? '' : '______'} / ${formatPoints(variantPoints(v))}`)
  if (h.showGrade && mode === 'print') scoreParts.push(`${k.note} ______`)
  if (scoreParts.length) {
    out.push(
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 160 }, children: [new TextRun({ text: scoreParts.join('      '), bold: true })] })
    )
  }
  return out
}

// ---------- Hilfen ----------

function gapRuns(answer: string, mode: Mode, firstLetter = false): TextRun[] {
  if (mode === 'key') return [run(answer, { bold: true, color: RED })]
  // Einheitliche Länge: die Lücke darf die Länge der Lösung nicht verraten
  const blanks = '_'.repeat(18)
  return firstLetter ? [run(firstLetterOf(answer), { bold: true }), run(blanks.slice(1))] : [run(blanks)]
}

const numbered = (n: number | string, children: ParagraphChild[], extra: object = {}): Paragraph =>
  new Paragraph({
    children: [run(`${n}.\t`, { bold: true }), ...children],
    tabStops: [{ type: TabStopType.LEFT, position: 420 }],
    indent: { left: 420, hanging: 420 },
    spacing: { after: 100 },
    ...extra
  })

function wordBankTable(words: string[]): Table {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: ALL_BORDERS,
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [new Paragraph({ children: [run(words.join('     ·     '))] })]
          })
        ]
      })
    ]
  })
}

// ---------- Blöcke ----------

async function blockContent(ctx: Ctx, block: Block, n: number, mode: Mode, pageBreakBefore = false): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = []
  const points = blockPoints(block)
  out.push(
    new Paragraph({
      keepNext: true,
      pageBreakBefore,
      spacing: { before: 320, after: 60 },
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
      children: [
        // Die Nummer in der Fachfarbe – im Druck steht sie im farbigen Kreis
        ...(ctx.akzent
          ? [
              run(`${n}  `, { bold: true, size: Math.round(ctx.size * 1.1), color: ctx.akzent }),
              run(block.title, { bold: true, size: Math.round(ctx.size * 1.1) })
            ]
          : [run(`${n}  ${block.title}`, { bold: true, size: Math.round(ctx.size * 1.1) })]),
        ...(points > 0 ? [run(`\t${mode === 'key' ? '' : '____ '}/ ${formatPoints(points)} P.`)] : [])
      ]
    })
  )
  if (block.instruction) {
    out.push(new Paragraph({ keepNext: true, spacing: { after: 60 }, children: [run(block.instruction, { italics: true })] }))
  }
  const help = mode === 'print' ? blockHelp(block, ctx.doc.settings.targetLanguage) : []
  if (help.length) {
    out.push(new Paragraph({ keepNext: true, spacing: { after: 120 }, children: [run('ⓘ ', { bold: true }), run(help.join(' '), { size: ctx.size - 3 })] }))
  }

  switch (block.kind) {
    case 'gap': {
      if (block.wordBank && mode === 'print') out.push(wordBankTable(wordBankFor(block)), new Paragraph(''))
      const wrong = block.taskType === 'wrongWord'
      const twoSentences = block.taskType === 'twoSentences'
      block.items.forEach((it, i) => {
        const firstLetter = block.firstLetterHint || Boolean(it.firstLetter)
        it.sentences.forEach((s, si) => {
          const children: ParagraphChild[] = []
          if (it.sentences.length > 1) children.push(run(`${letter(si)}) `, { bold: true }))
          children.push(run(`${s.before} `))
          if (wrong) children.push(new TextRun({ text: it.hint ?? '', underline: { type: 'thick' }, bold: true }))
          else if (twoSentences) children.push(run('__________'))
          else children.push(...gapRuns(it.answer, mode, firstLetter))
          if (!wrong && !twoSentences && it.hint) children.push(run(` (${it.hint})`))
          children.push(run(` ${s.after}`))
          if (si === 0) out.push(numbered(i + 1, children))
          else out.push(new Paragraph({ indent: { left: 420 }, spacing: { after: 100 }, children }))
        })
        if (wrong || twoSentences) {
          out.push(new Paragraph({ indent: { left: 420 }, spacing: { after: 100 }, children: [run('→ '), ...gapRuns(it.answer, mode, firstLetter)] }))
        }
      })
      break
    }

    case 'gapText': {
      if (block.wordBank && mode === 'print') out.push(wordBankTable(wordBankFor(block)), new Paragraph(''))
      let gapNo = 0
      let children: ParagraphChild[] = []
      const flush = (): void => {
        out.push(new Paragraph({ spacing: { after: 120, line: 360 }, children }))
        children = []
      }
      for (const p of block.parts) {
        if (p.type === 'gap') {
          children.push(run(`(${++gapNo})`, { bold: true, size: ctx.size - 6 }), ...gapRuns(p.answer, mode, block.firstLetterHint || Boolean(p.firstLetter)))
          continue
        }
        const lines = p.text.split('\n')
        lines.forEach((line, li) => {
          if (li > 0) flush()
          if (line) children.push(run(line))
        })
      }
      if (children.length) flush()
      break
    }

    case 'match': {
      const rows = Math.max(block.left.length, block.right.length)
      const boxW = 600
      const leftW = Math.round((CONTENT - boxW) * 0.6)
      const rightW = CONTENT - boxW - leftW
      out.push(
        new Table({
          width: { size: CONTENT, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          rows: Array.from({ length: rows }, (_, r) => {
            const l = block.left[r]
            const right = block.right[r]
            const answer = l ? letter(block.right.findIndex((x) => x.id === l.answerId)) : ''
            return new TableRow({
              children: [
                new TableCell({
                  width: { size: boxW, type: WidthType.DXA },
                  borders: l ? ALL_BORDERS : NO_BORDERS,
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(mode === 'key' ? answer : '', { bold: true, color: RED })] })]
                }),
                new TableCell({
                  width: { size: leftW, type: WidthType.DXA },
                  borders: NO_BORDERS,
                  margins: { left: 160, top: 60, bottom: 60 },
                  children: [new Paragraph({ children: l ? [run(`${r + 1}  `, { bold: true }), run(l.text)] : [] })]
                }),
                new TableCell({
                  width: { size: rightW, type: WidthType.DXA },
                  borders: NO_BORDERS,
                  margins: { left: 160, top: 60, bottom: 60 },
                  children: [new Paragraph({ children: right ? [run(`${letter(r)})  `, { bold: true }), run(right.text)] : [] })]
                })
              ]
            })
          })
        })
      )
      break
    }

    case 'choice':
      block.items.forEach((it, i) => {
        out.push(numbered(i + 1, [run(`${it.before} `), run('__________'), run(` ${it.after}`)], { keepNext: true, spacing: { after: 40 } }))
        out.push(
          new Paragraph({
            indent: { left: 420 },
            spacing: { after: 140 },
            // Buchstabe vor jeder Möglichkeit – wie auf dem Bildschirm und im Arbeitsblatt
            children: it.options.flatMap((o, oi) => {
              const correct = mode === 'key' && oi === it.correct
              return [
                run(`${String.fromCharCode(97 + oi)}) `),
                run(correct ? '☒ ' : '☐ ', { color: correct ? RED : undefined }),
                run(`${o}        `, correct ? { bold: true, color: RED } : {})
              ]
            })
          })
        )
      })
      break

    /*
     * LATEIN: Muster-Vokabeltest als dreispaltige Tabelle „Vokabel | Form | Bedeutungen"
     * (Leitfaden Latein SH 2016, S. 25). Auf dem Schülerblatt bleiben die beiden rechten
     * Spalten leer, im Lösungsteil stehen sie rot da.
     */
    case 'latinForms':
      block.items.forEach((it, i) => {
        const leer = '_'.repeat(28)
        out.push(
          numbered(i + 1, [
            run(it.term, { bold: true }),
            ...(it.transliteration ? [run(` [${it.transliteration}]`, { size: ctx.size - 2, color: '555555' })] : []),
            run('	'),
            run(it.formLabel === '—' ? '' : `${it.formLabel} `, { size: ctx.size - 2, color: '555555' }),
            mode === 'key' ? run(it.form, { color: RED }) : run(it.formLabel === '—' ? '' : leer),
            run('	'),
            mode === 'key' ? run(it.meanings, { color: RED }) : run(leer)
          ])
        )
      })
      break

    // Unregelmäßige Verben (30.09.2026): Tabelle wie im Schulbuch, Lösungen rot in den Lücken
    case 'verbTable': {
      const breite = Math.floor(CONTENT / Math.max(1, block.headers.length))
      const zelle = (text: string, opts: { bold?: boolean; color?: string } = {}): TableCell =>
        new TableCell({
          width: { size: breite, type: WidthType.DXA },
          borders: ALL_BORDERS,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [run(text, opts)] })]
        })
      out.push(
        new Table({
          width: { size: CONTENT, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({ tableHeader: true, children: block.headers.map((h) => zelle(h, { bold: true })) }),
            ...block.rows.map(
              (r) => new TableRow({ children: r.cells.map((c, i) => (c ? zelle(c) : zelle(mode === 'key' ? (r.solution[i] ?? '') : '', { color: RED }))) })
            )
          ]
        })
      )
      break
    }

    case 'open':
      block.items.forEach((it, i) => {
        out.push(numbered(i + 1, [run(it.prompt)], { keepNext: true }))
        if (mode === 'key')
          out.push(new Paragraph({ indent: { left: 420 }, spacing: { after: 120 }, children: [run(it.modelAnswer, { italics: true, color: RED })] }))
        else out.push(...writingLines(it.lines))
      })
      break

    case 'trueFalse': {
      const labels = trueFalseLabels(ctx.doc.settings.targetLanguage)
      block.items.forEach((it, i) => {
        const mark = (b: boolean): TextRun => run(mode === 'key' && it.isTrue === b ? '☒' : '☐', { color: mode === 'key' && it.isTrue === b ? RED : undefined })
        out.push(
          numbered(i + 1, [run(it.statement), run('\t'), mark(true), run(` ${labels.yes}   `), mark(false), run(` ${labels.no}`)], {
            tabStops: [
              { type: TabStopType.LEFT, position: 420 },
              { type: TabStopType.RIGHT, position: CONTENT }
            ]
          })
        )
        if (block.askCorrection) {
          if (mode === 'key') {
            if (!it.isTrue) out.push(new Paragraph({ indent: { left: 420 }, children: [run(it.correction, { italics: true, color: RED })] }))
          } else out.push(...writingLines(1))
        }
      })
      break
    }

    case 'oddOneOut':
      block.items.forEach((it, i) => {
        out.push(
          numbered(
            i + 1,
            it.words.flatMap((w) => {
              const odd = mode === 'key' && w === it.answer
              return [run(w, odd ? { bold: true, color: RED } : {}), run('          ')]
            })
          )
        )
        if (block.askReason) {
          if (mode === 'key') out.push(new Paragraph({ indent: { left: 420 }, children: [run(`Reason: ${it.reason}`, { italics: true, color: RED })] }))
          else
            out.push(
              new Paragraph({ indent: { left: 420 }, spacing: { after: 120 }, children: [run('Reason: ______________________________________________')] })
            )
        }
      })
      break

    case 'categorize': {
      if (mode === 'print') out.push(wordBankTable(block.words.map((w) => w.text)), new Paragraph(''))
      const perCat = block.categories.map((c) => block.words.filter((w) => w.categoryId === c.id))
      const rows = Math.max(1, ...perCat.map((p) => p.length))
      const colW = Math.floor(CONTENT / Math.max(1, block.categories.length))
      const kategorienRaster = block.categories.map(() => colW)
      out.push(
        new Table({
          width: { size: CONTENT, type: WidthType.DXA },
          columnWidths: kategorienRaster,
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              tableHeader: true,
              children: block.categories.map(
                (c) =>
                  new TableCell({
                    width: { size: colW, type: WidthType.DXA },
                    borders: ALL_BORDERS,
                    shading: { fill: 'EEEEEE' },
                    children: [new Paragraph({ children: [run(c.name, { bold: true })] })]
                  })
              )
            }),
            ...Array.from(
              { length: rows },
              (_, r) =>
                new TableRow({
                  height: { value: 440, rule: 'atLeast' },
                  children: perCat.map(
                    (words) =>
                      new TableCell({
                        width: { size: colW, type: WidthType.DXA },
                        borders: ALL_BORDERS,
                        children: [new Paragraph({ children: [run(mode === 'key' ? (words[r]?.text ?? '') : '', { bold: true, color: RED })] })]
                      })
                  )
                })
            )
          ]
        })
      )
      break
    }

    case 'mindmap': {
      /*
       * Echte Mindmap auch in Word (02.10.2026): dieselbe Zeichnung wie im Druck als Bild
       * (render/mindmapLayout.ts). Wo sich kein Bild rechnen lässt (ohne Zeichenfläche, z. B. in
       * den Tests), steht eine Tabelle: je Ast eine Zeile mit Oberbegriff und Schreiblinien.
       */
      const lage = mindmapLage(mindmapAeste(block))
      const png = await mindmapPng(mindmapSvg(block, mode === 'key', ctx.akzent ? `#${ctx.akzent}` : null), lage.breite, lage.hoehe)
      if (png) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({ type: 'png', data: png, transformation: { width: Math.round(lage.breite * PX_MM), height: Math.round(lage.hoehe * PX_MM) } })
            ]
          })
        )
        break
      }
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [run(block.topic, { bold: true, ...(ctx.akzent ? { color: ctx.akzent } : {}) })]
        })
      )
      const labelW = Math.round(CONTENT * 0.32)
      const astRaster = [labelW, CONTENT - labelW]
      out.push(
        new Table({
          width: { size: CONTENT, type: WidthType.DXA },
          columnWidths: astRaster,
          layout: TableLayoutType.FIXED,
          rows: lage.aeste.map(
            ({ ast }) =>
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: labelW, type: WidthType.DXA },
                    borders: ALL_BORDERS,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({
                        children: ast.vorgegeben
                          ? [run(ast.label, { bold: true })]
                          : mode === 'key' && ast.label
                            ? [run(`(${ast.label})`, { italics: true, color: RED })]
                            : []
                      })
                    ]
                  }),
                  new TableCell({
                    width: { size: CONTENT - labelW, type: WidthType.DXA },
                    borders: ALL_BORDERS,
                    children: Array.from(
                      { length: ast.zweige },
                      (_, i) =>
                        new Paragraph({
                          spacing: { before: 240 },
                          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } },
                          children: [run(mode === 'key' ? (ast.woerter[i]?.answer ?? ' ') : ' ', { bold: true, color: RED })]
                        })
                    )
                  })
                ]
              })
          )
        })
      )
      break
    }

    case 'picture': {
      if (block.wordBank && mode === 'print') out.push(wordBankTable(wordBankFor(block)), new Paragraph(''))
      const cols = Math.max(1, block.columns)
      const colW = Math.floor(CONTENT / cols)
      const maxPx = 110
      const rows: TableRow[] = []
      for (let r = 0; r < block.items.length; r += cols) {
        const cells: TableCell[] = []
        for (let c = 0; c < cols; c++) {
          const it = block.items[r + c]
          if (!it) {
            cells.push(new TableCell({ width: { size: colW, type: WidthType.DXA }, borders: NO_BORDERS, children: [new Paragraph('')] }))
            continue
          }
          const children: Paragraph[] = [new Paragraph({ children: [run(`${r + c + 1}`, { bold: true })] })]
          if (it.image) {
            const { data, type } = dataUrlBytes(it.image.dataUrl)
            const dim = await ctx.sizer(it.image.dataUrl)
            const scale = Math.min(maxPx / dim.width, maxPx / dim.height)
            children.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun(
                    type === 'png'
                      ? { type: 'png', data, transformation: { width: Math.round(dim.width * scale), height: Math.round(dim.height * scale) } }
                      : { type, data, transformation: { width: Math.round(dim.width * scale), height: Math.round(dim.height * scale) } }
                  )
                ]
              })
            )
          } else {
            children.push(
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 600 }, children: [run('(Bild fehlt)', { color: RED })] })
            )
          }
          children.push(
            mode === 'key'
              ? new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [run(it.answer, { bold: true, color: RED })] })
              : new Paragraph({
                  spacing: { before: 360 },
                  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
                  children: [run(' ')]
                })
          )
          cells.push(
            new TableCell({
              width: { size: colW, type: WidthType.DXA },
              borders: NO_BORDERS,
              margins: { left: 100, right: 100, top: 100, bottom: 160 },
              children
            })
          )
        }
        rows.push(new TableRow({ cantSplit: true, children: cells }))
      }
      out.push(
        new Table({
          width: { size: CONTENT, type: WidthType.DXA },
          columnWidths: Array.from({ length: cols }, () => colW),
          layout: TableLayoutType.FIXED,
          rows
        })
      )
      break
    }

    case 'scramble':
      block.items.forEach((it, i) => {
        out.push(
          numbered(i + 1, [run(it.scrambled.toUpperCase().split('').join(' '), { bold: true }), run('    '), run(it.hint, { italics: true })], {
            keepNext: true,
            spacing: { after: 40 }
          })
        )
        out.push(new Paragraph({ indent: { left: 420 }, spacing: { after: 140 }, children: [run('→ '), ...gapRuns(it.answer, mode)] }))
      })
      break

    case 'crossword': {
      const cells = new Map<string, { letter: string; number?: number }>()
      for (const e of block.entries) {
        for (let i = 0; i < e.answer.length; i++) {
          const k = `${e.row + (e.dir === 'down' ? i : 0)},${e.col + (e.dir === 'across' ? i : 0)}`
          cells.set(k, { letter: e.answer[i], number: i === 0 ? e.number : cells.get(k)?.number })
        }
      }
      const cellW = Math.min(500, Math.floor(CONTENT / Math.max(1, block.cols)))
      out.push(
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: cellW * block.cols, type: WidthType.DXA },
          columnWidths: Array(block.cols).fill(cellW),
          rows: Array.from(
            { length: block.rows },
            (_, r) =>
              new TableRow({
                height: { value: cellW, rule: 'exact' },
                children: Array.from({ length: block.cols }, (_, c) => {
                  const cell = cells.get(`${r},${c}`)
                  const children: ParagraphChild[] = []
                  if (cell?.number) children.push(run(String(cell.number), { size: 12 }))
                  if (cell && mode === 'key') children.push(run(cell.letter, { bold: true, color: RED, size: ctx.size - 4 }))
                  return new TableCell({
                    width: { size: cellW, type: WidthType.DXA },
                    borders: cell ? ALL_BORDERS : NO_BORDERS,
                    margins: { left: 20, right: 20, top: 0, bottom: 0 },
                    children: [new Paragraph({ spacing: { before: 0, after: 0 }, children })]
                  })
                })
              })
          )
        })
      )
      for (const dir of ['across', 'down'] as const) {
        const entries = block.entries.filter((e) => e.dir === dir)
        if (!entries.length) continue
        out.push(new Paragraph({ spacing: { before: 200 }, children: [run(dir === 'across' ? 'Across →' : 'Down ↓', { bold: true })] }))
        for (const e of entries) {
          out.push(
            new Paragraph({
              spacing: { after: 40 },
              children: [run(`${e.number}  `, { bold: true }), run(e.clue), ...(mode === 'key' ? [run(`  (${e.answer})`, { bold: true, color: RED })] : [])]
            })
          )
        }
      }
      break
    }

    case 'freeText':
      for (const line of block.text.split('\n')) out.push(new Paragraph({ children: [run(line)] }))
      if (mode === 'print') out.push(...writingLines(block.lines))
      break
  }
  return out
}
