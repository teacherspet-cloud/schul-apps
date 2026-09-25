import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { normalizeImage, readFileAsDataUrl } from '../util'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface ExtractedContent {
  fileName: string
  kind: 'pdf' | 'docx' | 'image' | 'text'
  /** Text der Datei; bei Word-Dateien HTML (Tabellen bleiben erhalten) */
  text: string
  format: 'plain' | 'html'
  /** Seiten als Bilder (gescannte PDFs) bzw. das Bild selbst – für die KI-Bildanalyse */
  pageImages: string[]
  /** Anzahl Seiten im Original (PDF) */
  pageCount: number
  /** Seiten, die gelesen wurden (1-basiert) */
  pagesRead: number[]
}

export type ProgressFn = (message: string) => void

export interface ExtractOptions {
  /** Welche PDF-Seiten gelesen werden sollen (1-basiert); Standard: alle bis maxPages */
  pages?: number[]
  maxPages?: number
  /** Höchstzahl gerenderter Seiten bei gescannten PDFs */
  maxRenderedPages?: number
  /** Seiten auch bei vorhandener Textebene als Bilder mitliefern (z. B. um Schriftfarbe und Kästen zu erkennen) */
  renderPages?: boolean
}

export const MATERIAL_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]

/** Liest Text und ggf. Seitenbilder aus PDF, Word, Bild oder Textdatei. */
export async function extractContent(file: File, onProgress: ProgressFn = () => {}, opts: ExtractOptions = {}): Promise<ExtractedContent> {
  const name = file.name.toLowerCase()
  const base = { fileName: file.name, pageImages: [] as string[], pageCount: 1, pagesRead: [1] }

  if (name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.tsv') || file.type === 'text/plain') {
    return { ...base, kind: 'text', text: await file.text(), format: 'plain' }
  }
  if (name.endsWith('.docx')) {
    onProgress('Word-Datei wird gelesen …')
    const html = await window.api.files.docxToHtml(new Uint8Array(await file.arrayBuffer()))
    return { ...base, kind: 'docx', text: html, format: 'html' }
  }
  if (name.endsWith('.pdf')) return extractPdf(file, onProgress, opts)
  if (file.type.startsWith('image/')) {
    onProgress('Bild wird vorbereitet …')
    const dataUrl = await normalizeImage(await readFileAsDataUrl(file), 2000, 'jpeg')
    return { ...base, kind: 'image', text: '', format: 'plain', pageImages: [dataUrl] }
  }
  throw new Error(`Dateityp von „${file.name}" wird nicht unterstützt.`)
}

async function extractPdf(file: File, onProgress: ProgressFn, opts: ExtractOptions): Promise<ExtractedContent> {
  onProgress('PDF wird geöffnet …')
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const maxPages = opts.maxPages ?? 30
  const pages = (opts.pages ?? Array.from({ length: pdf.numPages }, (_, i) => i + 1)).filter((p) => p >= 1 && p <= pdf.numPages).slice(0, maxPages)

  // 1. Versuch: Textebene (digitale PDFs)
  let text = ''
  for (const p of pages) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    let lastY: number | null = null
    text += `--- Seite ${p} ---\n`
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = item.transform[5]
      text += lastY !== null && Math.abs(y - lastY) > 2 ? '\n' : ' | '
      text += item.str
      lastY = y
    }
    text += '\n\n'
  }

  const result: ExtractedContent = {
    fileName: file.name,
    kind: 'pdf',
    text: '',
    format: 'plain',
    pageImages: [],
    pageCount: pdf.numPages,
    pagesRead: pages
  }
  if (text.replace(/---.*---|[\s|]/g, '').length > 80) {
    if (!opts.renderPages) return { ...result, text }
    const rendered = pages.slice(0, opts.maxRenderedPages ?? 6)
    for (const p of rendered) {
      onProgress(`Seite ${p} wird für die Layout-Erkennung gerendert …`)
      result.pageImages.push(await renderPdfPage(pdf, p))
    }
    return { ...result, text }
  }

  // 2. Versuch: gescannte PDFs als Bilder
  const rendered = pages.slice(0, opts.maxRenderedPages ?? 6)
  for (const p of rendered) {
    onProgress(`Seite ${p} wird gerendert …`)
    result.pageImages.push(await renderPdfPage(pdf, p))
  }
  return { ...result, pagesRead: rendered }
}

async function renderPdfPage(pdf: pdfjs.PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport }).promise
  return normalizeImage(canvas.toDataURL('image/png'), 2000, 'jpeg')
}
