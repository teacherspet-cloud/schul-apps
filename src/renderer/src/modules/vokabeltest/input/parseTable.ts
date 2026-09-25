import Papa from 'papaparse'
import { newId } from '../model/random'
import type { VocabEntry } from '../model/types'

/** Tabellen aus der Zwischenablage (Word/Excel) oder CSV: Spalte 1 = Wort, Spalte 2 = Übersetzung. */
export function parseDelimited(text: string): VocabEntry[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const delimiter = trimmed.includes('\t') ? '\t' : undefined
  const parsed = Papa.parse<string[]>(trimmed, { delimiter, skipEmptyLines: true })
  let rows = parsed.data
  // Einspaltige Zeilen mit „Wort - Übersetzung" oder „Wort = Übersetzung"
  if (rows.every((r) => r.length === 1)) {
    rows = rows.map((r) => r[0].split(/\s+[-–=:]\s+/))
  }
  return rowsToEntries(rows)
}

export function rowsToEntries(rows: string[][]): VocabEntry[] {
  const cleaned = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean))
  if (cleaned.length && /^(wort|word|englisch|english|vokabel|term)/i.test(cleaned[0][0] ?? '')) cleaned.shift()
  return cleaned
    .filter((r) => r[0])
    .map((r) => ({
      id: newId(),
      term: r[0],
      translation: r[1] ?? '',
      pos: r[2] || undefined,
      note: r[3] || undefined,
      // Eingefügte Vokabeln werden abgefragt; eine Tabelle kennt keinen Zusatzwortschatz (grau)
      include: true
    }))
}
