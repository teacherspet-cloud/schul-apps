import { antwortTabellenMasse, linieMmFuerMeta, schreibRegelFuerMeta } from '../../didactics/schreibraum'
import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  FootnoteReferenceRun,
  VerticalAlign,
  WidthType
} from 'docx'
import { dauerAngabe, hoerzeit } from '../../../../shared/verstehen/hoerzeit'
import { maskottchenBild } from '../../../../shared/maskottchenStore'
import { diagramDrawing } from '../../render/diagramSvg'
import { imageRun, MM, NO_BORDERS, RED, run, writingLines } from '../../../../shared/export/docxKit'
import { richTextRuns } from '../../../../shared/richtext/docx'
import { plainText } from '../../../../shared/richtext/parse'
import type { Answer, WsBlock } from '../../model/types'
import { INFO_VARIANTS } from '../../render/icons'
import { galleryColumns, LONG_TEXT_CHARS, shortLink, splitParagraphs } from '../../render/BlockView'
import { COPYRIGHT_NOTE, QR_NOTE, videoKindById } from '../../didactics/videoTasks'
import { AI_AUDIO_NOTE, audioRulesFor, playsLabelFor } from '../../didactics/audioRules'
import { headerLine } from '../../didactics/sourceHeader'
import { anmerkungenVon, anmerkungsArt, type Anmerkung } from '../../didactics/anmerkungen'
import { gridDrawing } from '../../render/gridSvg'
import { qrSvg } from '../../render/qr'
import { justifyText } from '../../render/SheetPages'
import { stripMaterialNo } from '../../render/BlockView'
import { eigeneBreiten, spaltenBreiten } from '../../render/tabelleMasse'
import { svgAusDataUrl } from '../../render/schaltplanSvg'
import { beschriftetesBildSvg } from '../../render/beschriftungSvg'
import { imageSizeFromDataUrl } from '../../../../shared/imageSize'
import { trueFalseLabels } from '../../../../shared/trueFalseLabels'
import { subjectById } from '../../model/subjects'
import { anredeFuerMeta } from '../../didactics/anrede'
import { Child, PX_PER_MM, PX_MM, tint, Ctx, materialNo } from './grundlagen'
import { rich, richRun } from './kopf'
import { taskContent } from './aufgaben'
import { protokollDocx } from './protokoll'

export function boxTable(ctx: Ctx, children: Child[], opts: { fill?: string; leftColor?: string; dashed?: boolean; color?: string }): Table {
  const line = { style: opts.dashed ? BorderStyle.DASHED : BorderStyle.SINGLE, size: 6, color: opts.color ?? ctx.accent }
  return new Table({
    width: { size: ctx.contentWidth, type: WidthType.DXA },
    columnWidths: [ctx.contentWidth],
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

export const spacer = (): Paragraph => new Paragraph({ spacing: { after: 120 }, children: [] })

/** Angeheftetes Maskottchen als kleines Bild hinter dem Baustein – Word kennt keine Ecke „darüber" (26.09.2026) */
export async function illustrationDocx(
  ctx: Ctx,
  id: string | undefined,
  pose: string,
  bubble: string | undefined,
  hoeheMm: number,
  indent = 0
): Promise<Child[]> {
  if (key(ctx)) return []
  const src = maskottchenBild(id, pose)
  if (!src) return []
  const dim = await ctx.deps.sizer(src).catch(() => ({ width: 2, height: 3 }))
  const h = hoeheMm * PX_MM
  const w = (dim.width / Math.max(1, dim.height)) * h
  return [
    new Paragraph({
      indent: { left: indent },
      spacing: { before: 40, after: 80 },
      children: [imageRun(src, w, h), ...(bubble ? [run(`   „${bubble}"`, { italics: true, color: '555555' })] : [])]
    })
  ]
}
export const key = (ctx: Ctx): boolean => ctx.key

/**
 * Läufe einer Anmerkung: Ziffer (nur in der Liste unter dem Material – in einer Word-Fußnote setzt
 * Word das Zeichen selbst davor), ggf. KI-Bild, Stichwort fett, Erklärung.
 */
function anmerkungLaeufe(ctx: Ctx, block: WsBlock, a: Anmerkung, mitZiffer: boolean): ParagraphChild[] {
  const bild = a.art === 'fussnote' && block.type === 'text' ? block.fussnoten?.[a.index]?.bild : undefined
  const masse = bild ? imageSizeFromDataUrl(bild.dataUrl) : null
  const hoehe = 16 * PX_PER_MM
  return [
    ...(mitZiffer ? [new TextRun({ text: String(a.nr), superScript: true, bold: true, size: ctx.size - 3 })] : []),
    run(' ', { size: ctx.size - 3 }),
    ...(bild
      ? [imageRun(bild.dataUrl, masse ? (hoehe * masse.width) / masse.height : hoehe, hoehe), run(' (KI-Bild) ', { size: ctx.size - 6, color: '555555' })]
      : []),
    run(a.text ? `${a.wort}: ` : a.wort, { bold: true, size: ctx.size - 3 }),
    ...(a.text ? [run(a.text, { size: ctx.size - 3 })] : [])
  ]
}

export async function blockContent(ctx: Ctx, block: WsBlock, numbers: Map<string, number>): Promise<Child[]> {
  // Nur im Lösungsteil (didactics/loesungsteil.ts): auf dem Schülerblatt fehlt der Baustein ganz
  if (block.nurLoesung && !ctx.key) return []
  const inhalt = await blockInhalt(ctx, block, numbers)
  if (!block.illustration || ctx.key) return inhalt
  return [...inhalt, ...(await illustrationDocx(ctx, block.illustration.maskottchenId, block.illustration.pose, block.illustration.bubble, 16))]
}

export async function blockInhalt(ctx: Ctx, block: WsBlock, numbers: Map<string, number>): Promise<Child[]> {
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
      const kasten = boxTable(ctx, inner, { fill: tint(ctx.accent, 0.1), leftColor: ctx.accent })
      // Abgesetzt (Operatorenliste): eine Leerzeile plus Abstand davor und danach, wie die 8 mm am Bildschirm
      if (block.abgesetzt) {
        const luft = (): Paragraph => new Paragraph({ spacing: { after: 220 }, children: [] })
        return [luft(), kasten, luft()]
      }
      return [kasten, spacer()]
    }
    case 'text': {
      const out: Child[] = []
      // Zeilennummern zählen nur den Materialtext (nicht Überschrift, Worterklärungen, Quelle)
      if (block.title || ctx.materialNumbers.has(block.id))
        out.push(
          new Paragraph({
            keepNext: true,
            suppressLineNumbers: true,
            spacing: { after: 80 },
            children: [...materialNo(ctx, block.id), ...(await richRun(ctx, stripMaterialNo(block.title), { bold: true }))]
          })
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
      // Einleitungssatz (01.10.2026): kursiv über dem Text, nicht Teil des Zitats und nicht der Zeilenzählung
      if (block.intro?.trim())
        out.push(
          new Paragraph({
            keepNext: true,
            suppressLineNumbers: true,
            spacing: { after: 80 },
            children: await richRun(ctx, block.intro.trim(), { italics: true })
          })
        )
      // Längere Texte im Blocksatz wie in der Vorschau
      const justify = justifyText(ctx.ws) && plainText(block.body).length >= LONG_TEXT_CHARS
      /*
       * Fußnoten und Worthilfen (01.10.2026): EINE Zählung, im Text als hochgestellte Ziffer (echter
       * hochgestellter Lauf über `^{n}`), dieselbe Ziffer vor der Anmerkung unter dem Material.
       * Lücken aus dem Textauswahl-Menü: Linie bzw. im Lösungsteil die Lösung.
       */
      const anm = anmerkungenVon(block)
      const luecken = (t: string): string => t.replace(/\[\[(.+?)\]\]/g, (_, w: string) => (ctx.key ? `**${w}**` : '__________'))
      /*
       * Blattoptionen „Fußnoten" (01.10.2026): Die Ziffer im Text wird eine ECHTE Word-Fußnote mit
       * eigenem Zeichen (je Material ab 1), Word setzt sie unten auf die Seite des Worts. Frei
       * gezogene Materialien und Anmerkungen ohne Stelle im Text bleiben in der Liste darunter.
       */
      const sammel = anmerkungsArt(ctx.ws.meta) === 'fussnoten' && !block.free ? ctx.fussnoten : undefined
      const alsFussnote = new Set<number>()
      const hochgestellt = sammel
        ? (t: string) => {
            const a = anm.anmerkungen.find((x) => x.imText && String(x.nr) === t.trim())
            if (!a || alsFussnote.has(a.nr)) return undefined
            alsFussnote.add(a.nr)
            const id = sammel.naechste++
            sammel.eintraege[id] = { children: [new Paragraph({ children: anmerkungLaeufe(ctx, block, a, false) })] }
            sammel.marken.set(id, String(a.nr))
            return new FootnoteReferenceRun(id)
          }
        : undefined
      for (const p of splitParagraphs(anm.anzeige))
        out.push(
          ...(await rich(ctx, luecken(p), {
            paragraph: { spacing: { after: 0, line: 360 }, keepLines: true, keepNext: true, ...(justify ? { alignment: AlignmentType.JUSTIFIED } : {}) },
            hochgestellt
          }))
        )
      const liste = anm.anmerkungen.filter((a) => !alsFussnote.has(a.nr))
      if (liste.length) {
        out.push(
          new Paragraph({
            suppressLineNumbers: true,
            spacing: { before: 120 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 2 } },
            children: []
          })
        )
        for (const a of liste) out.push(new Paragraph({ suppressLineNumbers: true, children: anmerkungLaeufe(ctx, block, a, true) }))
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
        out.push(
          new Table({
            width: { size: ctx.contentWidth, type: WidthType.DXA },
            columnWidths: Array.from({ length: cols }, () => cellWidth),
            layout: TableLayoutType.FIXED,
            rows
          })
        )
        if (block.caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: await richRun(ctx, block.caption, { size: ctx.size - 3 }) }))
        out.push(spacer())
        return out
      }
      if (block.image) {
        const dim = await ctx.deps.sizer(block.image.dataUrl)
        const maxW = (ctx.contentWidth / 1440) * 96 * (block.widthPercent / 100)
        const maxH = 110 * (96 / 25.4)
        /*
         * Beschriftungen (30.09.2026): Word hat keine Ebene über dem Bild. Statt einer Liste unter
         * dem Bild kommen Randspalten, Linien, Punkte und Schilder mit ins Bild – in derselben
         * Setzung wie im PDF, auch mit von Hand verschobenen Punkten. Gerastert mit etwa 380 dpi.
         */
        if (block.labels?.length) {
          const breiteMm = (ctx.contentWidth / 1440) * 25.4 * (block.widthPercent / 100)
          const groesse = imageSizeFromDataUrl(block.image.dataUrl) ?? dim
          const b = beschriftetesBildSvg({ dataUrl: block.image.dataUrl, groesse, labels: block.labels, mitLoesung: key, breiteMm })
          const w = (b.breiteMm * 96) / 25.4
          const h = (b.hoeheMm * 96) / 25.4
          const s = Math.min(1, maxW / w, maxH / h)
          const png = await ctx.deps.raster(b.svg, w * s * 4, h * s * 4)
          out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [imageRun(png, w * s, h * s)] }))
        } else {
          const scale = Math.min(maxW / dim.width, maxH / dim.height)
          // Gezeichnete Schaltpläne sind SVG – Word braucht ein Rasterbild
          const svg = block.schaltplan ? svgAusDataUrl(block.image.dataUrl) : null
          const src = svg ? await ctx.deps.raster(svg, dim.width * scale * 4, dim.height * scale * 4) : block.image.dataUrl
          out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [imageRun(src, dim.width * scale, dim.height * scale)] }))
        }
      } else {
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`[Bild: ${block.description}]`, { color: '777777' })] }))
      }
      // Ohne Bild bleiben die Beschriftungen wenigstens als Liste erhalten
      if (!block.image && block.labels?.length) {
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
              ...materialNo(ctx, block.id),
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
              // **fett** wie am Bildschirm – vorher standen die Sternchen im Dokument
              children: [
                run('• '),
                ...(await richRun(ctx, item.text)),
                ...(item.german && ctx.phraseGerman ? [run(' – ', { color: '666666' }), ...(await richRun(ctx, item.german, { color: '666666' }))] : [])
              ]
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
      if (block.title || ctx.materialNumbers.has(block.id))
        out.push(new Paragraph({ keepNext: true, children: [...materialNo(ctx, block.id), ...(await richRun(ctx, block.title, { bold: true }))] }))
      // Von Hand gezogene Maße (render/tabelleMasse.ts) gelten auch in Word
      out.push(
        await gridTable(
          ctx,
          block.headers,
          block.rows,
          Math.round((ctx.contentWidth * (block.widthPercent ?? 100)) / 100),
          block.colWidths?.length ? spaltenBreiten(block).map((w) => w / 100) : undefined,
          undefined,
          { rowHeightsMm: block.rowHeightsMm, headerHeightMm: block.headerHeightMm }
        )
      )
      out.push(spacer())
      return out
    }
    case 'workspace': {
      if (key) return []
      const out: Child[] = []
      if (block.label) out.push(new Paragraph({ children: await richRun(ctx, block.label, { size: ctx.size - 2 }) }))
      if (block.kind === 'lines') {
        // Linienabstand nach Jahrgang wie im Blatt (02.10.2026)
        const linie = linieMmFuerMeta(ctx.ws.meta)
        out.push(...writingLines(Math.max(1, Math.round(block.heightMm / linie)), 0, 0, linie))
      }
      else out.push(gridArea(ctx, block.heightMm, block.kind === 'grid'))
      out.push(spacer())
      return out
    }
    case 'grid': {
      // Das Gitternetz wird als Bild in exakter Millimetergröße eingebettet, damit der Ausdruck maßhaltig bleibt
      const drawing = block.diagram ? diagramDrawing(block.diagram, ctx.contentWidth / MM, { raster: false }) : gridDrawing(block, ctx.contentWidth / MM)
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
      const meta = [block.textType, hoerzeit(block).sekunden ? dauerAngabe(hoerzeit(block)) : '', playsLabelFor(fach, block.plays, anredeFuerMeta(ctx.ws.meta))]
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
          // Von Hand gezogene Maße (02.10.2026) wie am Bildschirm
          eigeneBreiten(block, 4)?.map((w) => w / 100) ?? [0.64, 0.12, 0.12, 0.12],
          undefined,
          { rowHeightsMm: block.rowHeightsMm, headerHeightMm: block.headerHeightMm }
        ),
        spacer()
      ]
    }
    case 'illustration':
      return illustrationDocx(ctx, block.maskottchenId, block.pose, block.bubble, 24)
    case 'protocol':
      return protokollDocx(ctx, block)
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

export async function gridTable(
  ctx: Ctx,
  headers: string[],
  rows: string[][],
  width: number,
  weights?: number[],
  solutionRows?: string[][],
  masse?: { rowHeightsMm?: number[]; headerHeightMm?: number }
): Promise<Table> {
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
  if (headers.length)
    tableRows.push(
      new TableRow({
        tableHeader: true,
        ...(masse?.headerHeightMm ? { height: { value: Math.round(masse.headerHeightMm * MM), rule: 'atLeast' } } : {}),
        children: await Promise.all(headers.map((h, c) => cell(h, c, true)))
      })
    )
  for (let r = 0; r < rows.length; r++) {
    tableRows.push(
      new TableRow({
        height: { value: Math.max(420, Math.round((masse?.rowHeightsMm?.[r] ?? 0) * MM)), rule: 'atLeast' },
        children: await Promise.all(Array.from({ length: cols }, (_, c) => cell(rows[r][c] ?? '', c, false, solutionRows?.[r]?.[c])))
      })
    )
  }
  // Spaltenraster ausdrücklich setzen – sonst zeigt Word gleich breite Spalten, egal was die Zellen sagen
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: ws.map((w) => Math.round(width * w)),
    layout: TableLayoutType.FIXED,
    rows: tableRows
  })
}

export function gridArea(ctx: Ctx, heightMm: number, squares: boolean): Table {
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

export async function answerContent(ctx: Ctx, a: Answer, indent: number): Promise<Child[]> {
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
      return key ? [] : writingLines(Math.max(0, a.count), indent, undefined, linieMmFuerMeta(ctx.ws.meta))
    case 'grid':
      return [gridArea(ctx, a.count * 5, true)]
    case 'diagram': {
      // Zeichenfläche mit Achsen als maßhaltiges Bild (26.09.2026) – wie der Gitternetz-Baustein
      const drawing = diagramDrawing(a.diagram, Math.min(160, (ctx.contentWidth - indent) / MM))
      const png = await ctx.deps.raster(drawing.svg, drawing.widthMm * PX_PER_MM, drawing.heightMm * PX_PER_MM)
      return [new Paragraph({ indent: { left: indent }, children: [imageRun(png, drawing.widthMm * PX_MM, drawing.heightMm * PX_MM)] })]
    }
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
      // Von Hand gezogene Spalten (02.10.2026), sonst Kästchen + 55 % / 45 % wie bisher
      const eigene = eigeneBreiten(a, 3)
      const w = eigene ? eigene.map((p) => Math.round((width * p) / 100)) : [500, Math.round((width - 500) * 0.55), Math.round((width - 500) * 0.45)]
      return [
        new Table({
          width: { size: width, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          ...(eigene ? { columnWidths: w } : {}),
          indent: { size: indent, type: WidthType.DXA },
          rows: await Promise.all(
            Array.from(
              { length: rows },
              async (_, r) =>
                new TableRow({
                  ...(a.rowHeightsMm?.[r] ? { height: { value: Math.round(a.rowHeightsMm[r] * MM), rule: 'atLeast' as const } } : {}),
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
      // Von Hand gezogene Maße (02.10.2026) wie am Bildschirm
      return [
        await gridTable(ctx, ['', labels.yes, labels.no], rows, width, eigeneBreiten(a, 3)?.map((w) => w / 100) ?? [0.72, 0.14, 0.14], undefined, {
          rowHeightsMm: a.rowHeightsMm,
          headerHeightMm: a.headerHeightMm
        })
      ]
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
    case 'tableFill': {
      // Dieselben Maße wie am Bildschirm (02.10.2026): von Hand gezogen, sonst nach Jahrgang und erwarteter Antwort (didactics/schreibraum.ts)
      const m = antwortTabellenMasse(a, schreibRegelFuerMeta(ctx.ws.meta))
      return [
        await gridTable(
          ctx,
          a.headers,
          a.rows,
          width,
          m.colWidths.map((w) => w / 100),
          a.solutionRows,
          { rowHeightsMm: m.rowHeightsMm, headerHeightMm: m.headerHeightMm }
        )
      ]
    }
  }
}
