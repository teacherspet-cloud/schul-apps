import {
  AlignmentType,
  Document,
  FrameAnchorType,
  FrameWrap,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  ISectionOptions,
  LineNumberRestartFormat,
  LineRuleType,
  Packer,
  Paragraph,
  ParagraphChild,
  SectionType,
  Table,
  TableCell,
  TableAnchorType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType
} from 'docx'
import { kiWordEigenschaften } from '@shared/kiKennzeichnung'
import { gradeScaleRows } from '../../../../shared/gradeScale'
import { punkteZeilen } from '../../../../shared/notenpunkte'
import { wordFontName } from '@shared/design'
import { A4_HEIGHT, A4_WIDTH, dataUrlBytes, hexColor, MM, NO_BORDERS, run } from '../../../../shared/export/docxKit'
import { MathRasterizer, richTextRuns } from '../../../../shared/richtext/docx'
import type { Sheet, Worksheet, WsBlock } from '../../model/types'
import { imageCredits, isHelpCard, isPhraseSheet } from '../../render/SheetPages'
import { contentInsets } from '../../render/PageFrame'
import { blockLayout, materialNumbersFor, pageInfoFor, taskNumbersFor, zurAnzeige } from '../../render/SheetPages'
import { boardList } from '../../didactics/boardDesign'
import { seitenGruppe } from '../../render/printHtml'
import { phraseSheetModus } from '../../generation/prompts'
import { zeigtUebersetzung } from '../../didactics/phraseRules'
import { anredeFuerMeta } from '../../didactics/anrede'
import { anredeText } from '../../../../shared/anrede'
import type { DeckblattBilder, DeckblattText } from '../../render/deckblattBilder'
import { WorksheetDocxDeps, WorksheetDocxOptions, Child, EMU_MM, PX_MM, Ctx, type WordFussnoten } from './grundlagen'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { boardSection } from './tafel'
import { headerFor, footerFor } from './kopf'
import { blockContent, gridTable } from './bausteine'

export async function buildWorksheetDocx(ws: Worksheet, opts: WorksheetDocxOptions, deps: WorksheetDocxDeps): Promise<Uint8Array> {
  const sections: ISectionOptions[] = []
  // Echte Word-Fußnoten der Materialtexte (Blattoptionen „Fußnoten", 01.10.2026)
  const fussnoten: WordFussnoten = { naechste: 1, eintraege: {}, marken: new Map() }
  const sheets = ws.sheets.filter((s) => opts.sheetIds.includes(s.id))
  const add = async (key: boolean): Promise<void> => {
    // Verweise „M{karte}" → „M3", wie am Bildschirm
    for (const sheet of sheets) {
      // Seitenauswahl: nur Blätter mit gewählten Seiten, und davon nur deren Inhalte
      const filter = opts.seiten ? opts.seiten.blaetter.get(seitenGruppe(sheet.id, key)) : undefined
      if (opts.seiten && !filter) continue
      sections.push(...(await sheetSections(ws, zurAnzeige(sheet), key, deps, filter, fussnoten)))
    }
  }
  // Das Deckblatt steht vor allem anderen – aber nicht vor einer reinen Lösungsdatei
  if (deps.deckblatt && ws.meta.coverPage && !opts.keyOnly && (!opts.seiten || opts.seiten.deckblatt))
    sections.push(await deckblattAbschnitt(deps.deckblatt, deps.raster))
  if (!opts.keyOnly) await add(false)
  if (opts.includeKey || opts.keyOnly) await add(true)
  // Je gewähltem Tafelformat ein eigener Abschnitt
  if (opts.includeBoard)
    for (const [b, board] of boardList(ws).entries()) if (!opts.seiten || opts.seiten.tafeln.has(b + 1)) sections.push(await boardSection(ws, board, deps.raster))
  // Ganz ohne Inhalt würde Word die Datei nicht öffnen
  if (!sections.length) sections.push({ children: [new Paragraph('')] })

  const info = pageInfoFor(ws, ws.sheets[0], deps.logo, deps.schoolName, false)
  const doc = new Document({
    creator: 'Schul-Apps',
    title: ws.meta.title || ws.meta.topic,
    // KI-Kennzeichnung, maschinenlesbar (Großprogramm 0.4)
    ...kiWordEigenschaften(ws.meta.ki),
    styles: { default: { document: { run: { font: wordFontName(ws.design.page.fontFamily), size: Math.round(info.fontPt * 2) } } } },
    ...(fussnoten.marken.size ? { footnotes: fussnoten.eintraege } : {}),
    sections
  })
  return fussnotenZeichen(new Uint8Array(await Packer.toArrayBuffer(doc)), fussnoten.marken)
}

/**
 * Eigene Fußnotenzeichen einsetzen (01.10.2026): Word nummeriert Fußnoten sonst durch das ganze
 * Dokument (1 … 9), die App beginnt je Material bei 1. Am Verweis im Text steht dafür
 * `w:customMarkFollows` mit dem Zeichen dahinter, in der Fußnote selbst das Zeichen statt des
 * automatischen `w:footnoteRef` – beides Standard-WordprocessingML, Word und LibreOffice setzen es
 * hochgestellt (Zeichenformat „FootnoteReference").
 */
export function fussnotenZeichen(datei: Uint8Array, marken: Map<number, string>): Uint8Array {
  if (!marken.size) return datei
  const dateien = unzipSync(datei)
  const xml = (name: string): string | undefined => (dateien[name] ? strFromU8(dateien[name]) : undefined)
  const dokument = xml('word/document.xml')
  const noten = xml('word/footnotes.xml')
  if (!dokument || !noten) return datei
  const zeichen = (id: string): string | undefined => marken.get(Number(id))
  dateien['word/document.xml'] = strToU8(
    dokument.replace(/<w:footnoteReference w:id="(\d+)"\/>/g, (alt, id: string) =>
      zeichen(id) ? `<w:footnoteReference w:customMarkFollows="1" w:id="${id}"/><w:t xml:space="preserve">${zeichen(id)}</w:t>` : alt
    )
  )
  dateien['word/footnotes.xml'] = strToU8(
    noten.replace(/(<w:footnote\b[^>]*\bw:id="(\d+)"[^>]*>)([\s\S]*?)(<\/w:footnote>)/g, (alt, auf: string, id: string, inhalt: string, zu: string) =>
      zeichen(id) ? auf + inhalt.replace('<w:footnoteRef/>', `<w:t xml:space="preserve">${zeichen(id)}</w:t>`) + zu : alt
    )
  )
  return zipSync(dateien)
}

/** Millimeter → Twips (Word-Maß für Rahmen und Zeilenabstand) */
export const TWIP_MM = 1440 / 25.4

/**
 * Ein Kopftext des Deckblatts als ECHTER Word-Text: ein Absatz in einem Textrahmen (`w:framePr`)
 * an der gemessenen Stelle, mit Schrift, Größe, Farbe, Ausrichtung und Zeilenhöhe wie im
 * Deckblatt (render/deckblattBilder.tsx, `vermesseTexte`).
 *
 * Warum Rahmen und keine Textfelder: Rahmen sind gewöhnliche Absätze – Word und LibreOffice
 * setzen sie gleich, man tippt direkt hinein, und Formeln im Titel kommen wie überall als
 * Bild mit. Die Zeilenhöhe ist GENAU die des Deckblatts, damit mehrzeilige Titel nicht wachsen.
 * Word misst Schrift etwas anders als der Browser; damit eine Zeile nicht einen Buchstaben
 * früher umbricht, bekommt der Rahmen 2 mm Luft – auf der Seite, zu der der Text NICHT
 * ausgerichtet ist.
 */
export async function deckblattText(t: DeckblattText, raster: MathRasterizer): Promise<Paragraph> {
  const luft = 2
  const x = t.ausrichtung === 'center' ? t.x - luft / 2 : t.ausrichtung === 'right' ? t.x - luft : t.x
  const size = Math.round(t.pt * 2)
  const zeile = Math.max(1, Math.round(t.zeile * TWIP_MM))
  const run = { bold: t.fett, color: t.farbe }
  const children: ParagraphChild[] = t.rich
    ? await richTextRuns(t.text, { size, raster, run })
    : [
        new TextRun({
          text: t.text,
          size,
          ...run,
          allCaps: t.versalien || undefined,
          ...(t.sperrungPt ? { characterSpacing: Math.round(t.sperrungPt * 20) } : {})
        })
      ]
  // In der Pille (Kennzeichen) steht eine Zeile mittig – so hoch wie die Pille, Text in der Mitte
  const hoehe = t.mittig ? t.hoehe : Math.max(t.hoehe, t.zeile)
  const oben = t.mittig ? t.y + (t.hoehe - t.zeile) / 2 : t.y
  return new Paragraph({
    alignment: t.ausrichtung === 'center' ? AlignmentType.CENTER : t.ausrichtung === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { before: 0, after: 0, line: zeile, lineRule: LineRuleType.EXACT },
    frame: {
      type: 'absolute',
      position: { x: Math.round(Math.max(0, x) * TWIP_MM), y: Math.round(Math.max(0, oben) * TWIP_MM) },
      width: Math.round((t.breite + luft) * TWIP_MM),
      height: Math.round((t.mittig ? t.zeile : hoehe) * TWIP_MM),
      rule: HeightRule.ATLEAST,
      anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
      wrap: FrameWrap.NONE
    },
    children
  })
}

/**
 * Das Deckblatt als eigener Abschnitt: die Seite ohne Vorschauen und ohne Texte als Bild hinter
 * dem Text, darüber jede Seitenvorschau als schwebendes Bild – an ihrer Stelle, gedreht und in
 * ihrer Ebene, genau wie im Editor und im PDF. In Word lassen sich die Vorschauen danach noch
 * verschieben. Titel, Fakten-Zeile, Überthema, Kurztext und Kennzeichen stehen als echter
 * Text in Rahmen darüber (`deckblattText`) und lassen sich in Word bearbeiten.
 */
export async function deckblattAbschnitt(b: DeckblattBilder, raster: MathRasterizer): Promise<ISectionOptions> {
  const bild = (png: string, x0: number, y0: number, breite: number, hoehe: number, drehung: number, ebene: number, hinten: boolean): ImageRun =>
    new ImageRun({
      type: 'png',
      data: dataUrlBytes(png).data,
      transformation: {
        width: Math.round(breite * PX_MM),
        height: Math.round(hoehe * PX_MM),
        // Word dreht um die Mitte und kennt nur 0° bis 360°
        ...(drehung ? { rotation: Math.round((((drehung % 360) + 360) % 360) * 100) / 100 } : {})
      },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(x0 * EMU_MM) },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(y0 * EMU_MM) },
        behindDocument: hinten,
        allowOverlap: true,
        zIndex: ebene,
        wrap: { type: TextWrappingType.NONE }
      }
    })
  // Ebenen der Karten auf positive Werte bringen – der Hintergrund liegt ganz unten
  const tiefste = Math.min(0, ...b.karten.map((k) => k.ebene))
  return {
    properties: { page: { size: { width: A4_WIDTH, height: A4_HEIGHT }, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } },
    children: [
      new Paragraph({
        children: [
          bild(b.hintergrund, 0, 0, 210, 297, 0, 1, true),
          ...b.karten.map((k) => bild(k.png, k.x0, k.y0, k.breite, k.hoehe, k.drehung, 10 + k.ebene - tiefste, false))
        ]
      }),
      ...(await Promise.all((b.texte ?? []).map((t) => deckblattText(t, raster))))
    ]
  }
}

/** Randlos in ALLE Richtungen – `NO_BORDERS` kennt die Innenlinien einer Tabelle nicht. */
export const RAHMENLOS = { ...NO_BORDERS, insideHorizontal: NO_BORDERS.top, insideVertical: NO_BORDERS.top }

/** Anteil der Blattbreite, den ein seitlich stehender Baustein einnimmt (wie auf dem Blatt: 38 %). */
export const SEITE_ANTEIL = 0.38

/**
 * Bild oder Tabelle, um die der Text fließt.
 *
 * Eine randlose Ein-Zellen-Tabelle mit `w:tblpPr`. Sie schwebt, ist am Satzspiegel (waagerecht)
 * und am Text (senkrecht) verankert – dadurch wandert sie beim Neuumbrechen mit ihrem Absatz
 * mit, statt an einer Seitennummer zu kleben, die Word ohnehin anders setzt.
 */
export async function schwebenderBehaelter(
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

export async function sheetSections(
  ws: Worksheet,
  sheet: Sheet,
  key: boolean,
  deps: WorksheetDocxDeps,
  /** Seitenauswahl: nur diese Bausteine und Schlussseiten (export/wordSeiten.ts) */
  filter?: { bausteine: Set<string>; zusatz: Set<string> },
  /** Sammelstelle der Word-Fußnoten des Dokuments (Blattoptionen „Fußnoten") */
  fussnoten?: WordFussnoten
): Promise<ISectionOptions[]> {
  const zeigt = (block: WsBlock, side?: WsBlock): boolean => !filter || filter.bausteine.has(block.id) || Boolean(side && filter.bausteine.has(side.id))
  const zusatzGewaehlt = (art: string): boolean => !filter || filter.zusatz.has(art)
  const info = pageInfoFor(ws, sheet, deps.logo, deps.schoolName, key)
  // Mit Fachfarbe (Paket 10a) – pageInfoFor hat sie schon eingesetzt, Word soll aussehen wie die Vorschau
  const d = info.design
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
    phraseGerman: zeigtUebersetzung(ws.meta, sheet.stars),
    materialNumbers: materialNumbersFor(sheet),
    fussnoten
  }

  const headers = { first: await headerFor(ctx, true), default: await headerFor(ctx, false) }
  const footers = { first: footerFor(ctx), default: footerFor(ctx) }
  const pageProps = {
    page: {
      // Jedes Blatt zählt seine Seiten selbst (wie die Vorschau) – vorher nannte Word die Seiten des ganzen Dokuments
      pageNumbers: { start: 1 },
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
  /*
   * Unsichtbarer KI-Test (27.09.2026) auch in Word: weiß, 1 pt, ohne Abstand – im Text enthalten,
   * damit er beim Kopieren mitgeht, wie am Bildschirm und im PDF (shared/aiCanary.ts). Nur Schülerblatt.
   */
  if (info.canary && !key) {
    children.push(new Paragraph({ spacing: { before: 0, after: 0, line: 20 }, children: [new TextRun({ text: info.canary, size: 2, color: 'FFFFFF' })] }))
  }
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
    if (!zeigt(block, side)) continue
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
  const phraseBlocks = !key && ownPhrasePage && zusatzGewaehlt('hilfsblatt') ? sheet.blocks.filter(isPhraseSheet) : []
  if (phraseBlocks.length) {
    children = []
    for (const block of phraseBlocks) children.push(...((await blockContent(ctx, block, numbers)) as Child[]))
    flush(false)
  }

  // Hilfekarten auf einer eigenen Schlussseite (nur im Schülerblatt)
  const helpCards = key || !zusatzGewaehlt('hilfekarten') ? [] : sheet.blocks.filter(isHelpCard)
  if (helpCards.length) {
    children = [
      new Paragraph({ spacing: { after: 160 }, children: [run('Tipp- und Hilfekarten', { bold: true, size: ctx.size + 4 })] }),
      // Derselbe Hinweis wie in der Vorschau – bis 25.09.2026 fehlte er im Word-Export (Paket 8b)
      new Paragraph({ spacing: { after: 160 }, children: [run(anredeText('hilfekarten', anredeFuerMeta(ctx.ws.meta)), { color: '555555' })] })
    ]
    for (const block of helpCards) children.push(...((await blockContent(ctx, block, numbers)) as Child[]))
    flush(false)
  }

  /*
   * NOTENSCHLÜSSEL auf der Lehrkraftseite des Lösungsteils – wie in Vorschau und PDF.
   * Bis 26.09.2026 fehlte er im Word-Export vollständig (Befund der Lehrkraft). In der
   * Sekundarstufe II steht die Punktetabelle 15 … 0 (shared/notenpunkte.ts), sonst der
   * Schlüssel 1–6.
   */
  const scaleGroups = key && zusatzGewaehlt('lehrkraft') ? (ctx.ws.meta.gradeScale?.groups ?? []).filter((g) => g.points > 0) : []
  if (scaleGroups.length) {
    const punkte = ctx.ws.meta.gradeScale?.punkte
    children = [new Paragraph({ spacing: { after: 160 }, children: [run('Notenschlüssel', { bold: true, size: ctx.size + 4 })] })]
    for (const g of scaleGroups) {
      if (g.label) children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [run(g.label, { bold: true })] }))
      const tabelle = punkte
        ? await gridTable(
            ctx,
            ['Notenpunkte', 'Note', 'Punkte', 'Anteil'],
            punkteZeilen(g.points, punkte.schwellen).map((r) => [r.punkte, r.note, r.range, r.percent]),
            Math.round(ctx.contentWidth * 0.8)
          )
        : await gridTable(
            ctx,
            ['Note', 'Punkte', 'Anteil'],
            gradeScaleRows(g.points, ctx.ws.meta.gradeScale?.thresholds).map((r) => [r.grade, r.range, r.percent]),
            Math.round(ctx.contentWidth * 0.8)
          )
      children.push(tabelle)
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 160 },
          children: [
            run(
              punkte
                ? `${g.points} Punkte insgesamt · Punktgrenze = kleinste Punktzahl, die den Prozentsatz erreicht · ${punkte.hinweis}`
                : `${g.points} Punkte insgesamt · gerundet wird ab ,5 aufwärts`,
              { size: ctx.size - 2, color: '555555' }
            )
          ]
        })
      )
    }
    flush(false)
  }

  // Bildnachweise auf einer eigenen Schlussseite – das Blatt selbst bleibt frei davon
  const credits = key || !zusatzGewaehlt('nachweise') ? [] : imageCredits(sheet)
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
