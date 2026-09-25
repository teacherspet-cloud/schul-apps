import { AlignmentType, IParagraphOptions, Paragraph, ParagraphChild, TextRun } from 'docx'
import { imageRun, RunOptions } from '../export/docxKit'
import { texToSvg } from './math'
import { Inline, parseRichText } from './parse'

/** Wandelt eine SVG-Formel in ein PNG (data:-URL) um; in Tests durch eine Attrappe ersetzbar. */
export type MathRasterizer = (svg: string, widthPx: number, heightPx: number) => Promise<string>

export interface RichDocxOptions {
  /** Schriftgröße in halben Punkten (Word) */
  size: number
  raster: MathRasterizer
  run?: RunOptions
  paragraph?: Partial<IParagraphOptions>
}

/** Pixel pro ex bei einer Schriftgröße (ca. 0,45 em). */
const exPx = (halfPoints: number): number => (halfPoints / 2) * (96 / 72) * 0.45

async function inlineRuns(inlines: Inline[], opts: RichDocxOptions): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = []
  for (const i of inlines) {
    if (i.t === 'text') {
      out.push(
        new TextRun({
          text: i.text,
          bold: i.bold || opts.run?.bold,
          italics: i.italic || opts.run?.italics,
          color: opts.run?.color,
          size: opts.size,
          font: opts.run?.font
        })
      )
    } else {
      out.push(await mathImage(i.tex, false, opts))
    }
  }
  return out
}

async function mathImage(tex: string, display: boolean, opts: RichDocxOptions): Promise<ParagraphChild> {
  const m = texToSvg(tex, display)
  const ex = exPx(opts.size)
  const w = Math.max(4, m.widthEx * ex)
  const h = Math.max(4, m.heightEx * ex)
  // Dreifache Auflösung für scharfen Druck
  const png = await opts.raster(m.svg, w * 3, h * 3)
  return imageRun(png, w, h)
}

/** Formatierten Text in Word-Absätze umsetzen (Formeln als Bilder). */
export async function richTextToParagraphs(source: string, opts: RichDocxOptions): Promise<Paragraph[]> {
  const out: Paragraph[] = []
  for (const b of parseRichText(source)) {
    if (b.t === 'para') {
      out.push(new Paragraph({ spacing: { after: 80 }, ...opts.paragraph, children: await inlineRuns(b.inlines, opts) }))
    } else if (b.t === 'math') {
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 100 }, children: [await mathImage(b.tex, true, opts)] }))
    } else {
      for (let k = 0; k < b.items.length; k++) {
        out.push(
          new Paragraph({
            ...opts.paragraph,
            spacing: { after: 40 },
            indent: { left: 420, hanging: 280 },
            children: [new TextRun({ text: b.ordered ? `${(b.start ?? 1) + k}.\t` : '•\t', size: opts.size }), ...(await inlineRuns(b.items[k], opts))]
          })
        )
      }
    }
  }
  return out
}

/** Nur die Textläufe einer Zeile (für Zellen oder Überschriften, die schon einen Absatz haben). */
export async function richTextRuns(source: string, opts: RichDocxOptions): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = []
  const blocks = parseRichText(source)
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]
    if (k > 0) out.push(new TextRun({ text: ' ', size: opts.size, break: 1 }))
    if (b.t === 'para') out.push(...(await inlineRuns(b.inlines, opts)))
    else if (b.t === 'math') out.push(await mathImage(b.tex, true, opts))
    else for (const it of b.items) out.push(new TextRun({ text: '• ', size: opts.size }), ...(await inlineRuns(it, opts)))
  }
  return out
}

/** Browser-Implementierung: SVG über ein Canvas rastern. */
export const browserMathRasterizer: MathRasterizer = async (svg, widthPx, heightPx) => {
  const withSize = svg.replace(/width="[^"]+"/, `width="${widthPx}px"`).replace(/height="[^"]+"/, `height="${heightPx}px"`)
  const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(withSize)))}`
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('Formel konnte nicht gerastert werden.'))
    i.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(widthPx)
  canvas.height = Math.ceil(heightPx)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}
