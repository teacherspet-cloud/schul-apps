import { readSheet } from 'read-excel-file/browser'
import type { StructuredRequest } from '@shared/types'
import { arr, bool, enumOf, obj, str } from '../../../shared/aiSchema'
import { extractContent } from '../../../shared/files/extractContent'
import { newId } from '../model/random'
import type { VocabEntry } from '../model/types'
import { parseDelimited, rowsToEntries } from './parseTable'

type AiCall = <T>(req: StructuredRequest) => Promise<T>

const EXTRACT_SCHEMA = obj({
  entries: arr(
    obj({
      term: str('Word or phrase in the foreign language exactly as printed (including "to" for verbs, articles, irregular forms in brackets)'),
      translation: str('German translation(s) as printed'),
      pos: str('Word class if printed or obvious (noun, verb, adjective, adverb, phrase …), otherwise empty'),
      note: str('Example sentence or remark belonging to the entry, otherwise empty'),
      appearance: enumOf(['normal', 'grey']),
      inBox: bool(
        'true if the entry is printed inside a separate box, frame or shaded panel (e.g. info box, word field box, "Tipp" box) instead of the main vocabulary list'
      )
    })
  ),
  targetLanguage: str('ISO code of the foreign language, e.g. en, fr, es')
})

const EXTRACT_SYSTEM =
  'You extract vocabulary lists from German school materials (textbook vocabulary pages, worksheets, handwritten lists). ' +
  'Read all entries in reading order. Keep foreign word and German translation together even if they are in separate columns or lines. ' +
  'Ignore page numbers, headings, unit titles, phonetic transcriptions and pictures. Do not invent entries. Correct obvious OCR-like errors only if you are sure.\n' +
  'Also extract vocabulary that is printed less prominently and vocabulary inside boxes, and mark it:\n' +
  '- appearance "grey": the foreign word is printed in grey, light, pale or otherwise noticeably less prominent type than the main entries (textbooks often use this for passive or optional vocabulary). Otherwise "normal".\n' +
  '- inBox true: the entry stands inside a separate box, frame or shaded panel (e.g. info box, word field, "Tipp" or grammar box) rather than in the main list.\n' +
  'Judge appearance and boxes from the page images when they are provided; if you cannot see the layout, use "normal" and false.'

interface ExtractResult {
  entries: { term: string; translation: string; pos: string; note: string; appearance?: string; inBox?: boolean }[]
  targetLanguage: string
}

export function toEntries(res: ExtractResult): VocabEntry[] {
  return res.entries
    .filter((e) => e.term.trim())
    .map((e) => ({
      id: newId(),
      term: e.term.trim(),
      translation: e.translation.trim(),
      pos: e.pos.trim() || undefined,
      note: e.note.trim() || undefined,
      ...(e.appearance === 'grey' ? { grey: true } : {}),
      ...(e.inBox ? { inBox: true } : {}),
      // Markiert ist alles außer den grau gedruckten Vokabeln
      include: e.appearance !== 'grey'
    }))
}

export type ImportProgress = (message: string) => void

/** Liest Vokabeln aus einer beliebigen unterstützten Datei. */
export async function importVocabFromFile(file: File, ai: AiCall, onProgress: ImportProgress): Promise<VocabEntry[]> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
    return parseDelimited(await file.text())
  }
  if (name.endsWith('.xlsx')) {
    const rows = await readSheet(file)
    return rowsToEntries(rows.map((r) => r.map((c) => (c == null ? '' : String(c)))))
  }

  // PDF-Seiten auch mit Textebene als Bilder mitschicken, damit graue Schrift und Kästen erkennbar sind
  const content = await extractContent(file, onProgress, { maxPages: 12, renderPages: true, maxRenderedPages: 6 })
  onProgress(content.pageImages.length ? 'Texterkennung und Layout-Prüfung laufen …' : 'Vokabeln werden erkannt …')
  const source =
    content.kind === 'docx'
      ? 'this Word document (converted to HTML; colours are not visible, tables or framed paragraphs may be boxes)'
      : content.kind === 'pdf' && content.text
        ? 'this PDF text (" | " separates text fragments on the same line); use the attached page images to judge grey print and boxes'
        : content.kind === 'pdf'
          ? 'these scanned pages'
          : 'this image'
  return toEntries(
    await ai<ExtractResult>({
      system: EXTRACT_SYSTEM,
      user: `Extract the vocabulary list from ${source}.${content.text ? `\n\n${content.text}` : ''}`,
      images: content.pageImages.length ? content.pageImages : undefined,
      schemaName: 'vocab_list',
      schema: EXTRACT_SCHEMA
    })
  )
}
