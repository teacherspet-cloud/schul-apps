// Gemeinsame Bausteine für den Word-Export aller Programme.
import { BorderStyle, ImageRun, Paragraph, TextRun } from 'docx'

/** Word misst in Twips (1/20 pt): 1 cm = 567 Twips. */
export const CM = 567
export const MM = CM / 10
export const A4_WIDTH = 11906
export const A4_HEIGHT = 16838
export const RED = 'C62828'

export const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
export const THIN = { style: BorderStyle.SINGLE, size: 6, color: '000000' } as const
export const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
export const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN }

export interface RunOptions {
  bold?: boolean
  italics?: boolean
  color?: string
  size?: number
  font?: string
  /** Großbuchstaben nur in der Darstellung (Fach über dem Überthema, Paket 11) */
  allCaps?: boolean
}

export const run = (text: string, opts: RunOptions = {}): TextRun => new TextRun({ text, ...opts })

/** Leere Schreiblinien. */
export function writingLines(count: number, indentLeft = 420, spacingBefore = 200): Paragraph[] {
  return Array.from(
    { length: count },
    () =>
      new Paragraph({
        children: [run(' ')],
        indent: { left: indentLeft },
        spacing: { before: spacingBefore },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '555555', space: 1 } }
      })
  )
}

export function dataUrlBytes(dataUrl: string): { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } {
  const [meta, b64] = dataUrl.split(',')
  const bin = atob(b64)
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
  const type = meta.includes('jpeg') || meta.includes('jpg') ? 'jpg' : meta.includes('gif') ? 'gif' : meta.includes('bmp') ? 'bmp' : 'png'
  return { data, type }
}

/** Bild als Word-Element in fester Größe (Pixel bei 96 dpi). */
export function imageRun(dataUrl: string, width: number, height: number): ImageRun {
  const { data, type } = dataUrlBytes(dataUrl)
  const transformation = { width: Math.round(width), height: Math.round(height) }
  return type === 'png' ? new ImageRun({ type: 'png', data, transformation }) : new ImageRun({ type, data, transformation })
}

export type ImageSizer = (dataUrl: string) => Promise<{ width: number; height: number }>

export function hexColor(css: string): string {
  return css.replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6)
}
