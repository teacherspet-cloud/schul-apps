import { Paragraph, ParagraphChild, Table, TextRun } from 'docx'
import { hexColor, ImageSizer } from '../../../../shared/export/docxKit'
import { MathRasterizer } from '../../../../shared/richtext/docx'
import type { Worksheet } from '../../model/types'
import { PageInfo } from '../../render/PageFrame'
import type { Stars } from '../../didactics/differentiation'
import type { DeckblattBilder } from '../../render/deckblattBilder'

export interface WorksheetDocxDeps {
  logo: string | null
  schoolName: string
  sizer: ImageSizer
  raster: MathRasterizer
  /** Farbstreifen mit senkrechtem Text als PNG (für die Seitenleiste) */
  sidebar: (text: string, color: string, widthMm: number, heightMm: number) => Promise<string>
  /** Selbst gestaltete Piktogramme (Kennung → PNG-data:-URL); leer = mitgelieferte Symbole */
  pictograms?: Record<string, string>
  /**
   * Das Deckblatt als Bilder (Paket 11, render/deckblattBilder.tsx). Fehlt es, hat das
   * Word-Dokument kein Deckblatt – so wie vor Paket 11.
   */
  deckblatt?: DeckblattBilder
}

export interface WorksheetDocxOptions {
  sheetIds: string[]
  includeKey: boolean
  keyOnly?: boolean
  /** Tafelbild-Seite für die Lehrkraft anhängen */
  includeBoard?: boolean
}

export type Child = Paragraph | Table
export const EMU_MM = 36000
/** Auflösung, mit der Gitternetze und QR-Codes für Word gerastert werden (ca. 200 dpi) */
export const PX_PER_MM = 8
/** Bildmaße in Word rechnen in Bildpunkten zu 96 dpi */
export const PX_MM = 96 / 25.4

/** Aufhellen einer Farbe für Hintergründe (Mischung mit Weiß). */
export function tint(hex: string, amount: number): string {
  const h = hexColor(hex)
  const mix = (i: number): string =>
    Math.round(parseInt(h.slice(i, i + 2), 16) * amount + 255 * (1 - amount))
      .toString(16)
      .padStart(2, '0')
  return `${mix(0)}${mix(2)}${mix(4)}`.toUpperCase()
}

export interface Ctx {
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
  /**
   * Materialnummern M1, M2 … wie am Bildschirm (render/SheetPages.tsx). Bis zum 27.09.2026
   * fehlten sie in Word ganz: Eine Aufgabe „mithilfe von M2" hatte dort kein M2.
   */
  materialNumbers: Map<string, string>
}

/** „M2 " vor Titel oder Bildunterschrift – dieselbe Nummer wie am Bildschirm */
export const materialNo = (ctx: Ctx, blockId: string): ParagraphChild[] => {
  const n = ctx.materialNumbers.get(blockId)
  return n ? [new TextRun({ text: `${n} `, bold: true, size: ctx.size })] : []
}
