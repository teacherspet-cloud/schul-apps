// Import von Schulbuch-Vokabellisten (CSV/Excel): Lehrwerk → Unit → Abschnitt (Check-in, Station 1 …) → Vokabeln.
import Papa from 'papaparse'
import type { Textbook, TextbookEntry } from '@shared/types'

export type ColumnRole = 'book' | 'volume' | 'grade' | 'unit' | 'section' | 'term' | 'translation' | 'pos' | 'note' | 'page' | 'grey'

export const COLUMN_ROLES: { value: ColumnRole; label: string; required?: boolean }[] = [
  { value: 'book', label: 'Lehrwerk (z. B. Green Line)' },
  { value: 'volume', label: 'Band (z. B. 1)' },
  { value: 'grade', label: 'Jahrgang/Klasse' },
  { value: 'unit', label: 'Unit/Kapitel', required: true },
  { value: 'section', label: 'Abschnitt (Station, Check-in …)' },
  { value: 'term', label: 'Vokabel (Fremdsprache)', required: true },
  { value: 'translation', label: 'Deutsch', required: true },
  { value: 'pos', label: 'Wortart' },
  { value: 'note', label: 'Beispiel/Hinweis' },
  { value: 'page', label: 'Seite' },
  { value: 'grey', label: 'Passiver Wortschatz (ja/nein)' }
]

export type ColumnMap = Partial<Record<ColumnRole, number>>

const PATTERNS: [ColumnRole, RegExp][] = [
  ['book', /^(lehrwerk|schulbuch|buch|book|reihe|titel|textbook)$/i],
  ['volume', /^(band|bd\.?|volume|vol\.?|teil)$/i],
  ['grade', /^(jahrgang|jahrgangsstufe|klasse|klassenstufe|jg\.?|grade|year)$/i],
  ['unit', /^(unit|units|kapitel|lektion|chapter|lesson|module|modul|unité|unite|unidad|unità|lektion\/unit)$/i],
  ['section', /^(abschnitt|unterabschnitt|station|teil der unit|section|part|bereich|subsection|sequenz|étape|etape|paso|topic|teilbereich)$/i],
  [
    'term',
    /^(englisch|english|französisch|franzosisch|french|spanisch|spanish|italienisch|italian|latein|latin|fremdsprache|vokabel|wort|word|term|en|fr|es|it|la|lemma)$/i
  ],
  ['translation', /^(deutsch|german|übersetzung|ubersetzung|bedeutung|translation|meaning|de)$/i],
  ['pos', /^(wortart|pos|part of speech|word class)$/i],
  ['note', /^(beispiel|beispielsatz|example|hinweis|bemerkung|anmerkung|note|notes|kontext|context)$/i],
  ['page', /^(seite|s\.|page|p\.)$/i],
  ['grey', /^(passiv|passiver wortschatz|grau|fakultativ|optional|lernwortschatz\?)$/i]
]

const LANGUAGE_BY_HEADER: [RegExp, string][] = [
  [/^(englisch|english|en)$/i, 'en'],
  [/^(französisch|franzosisch|french|fr)$/i, 'fr'],
  [/^(spanisch|spanish|es)$/i, 'es'],
  [/^(italienisch|italian|it)$/i, 'it'],
  [/^(latein|latin|la)$/i, 'la']
]

const LANGUAGE_BY_BOOK: [RegExp, string][] = [
  [/green line|red line|blue line|orange line|english g|access|camden town|lighthouse|highlight|notting hill|context|let's go|playway|sally|bumblebee/i, 'en'],
  [/découvertes|decouvertes|à plus|a plus|tous ensemble|cours intensif|on y va|parcours|horizons/i, 'fr'],
  [/apúntate|apuntate|encuentros|a[_ ]tope|línea amarilla|linea amarilla|puente|arriba|vía rápida|via rapida|todo claro|punto de vista/i, 'es'],
  [/ponte|al dente|in piazza|ecco|tutto chiaro/i, 'it'],
  [/prima|pontes|campus|cursus|adeamus|felix|roma|actio|agite|via mea|lumina/i, 'la']
]

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ')

/** Deutsche Excel-CSV-Dateien sind oft Windows-1252-kodiert. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export function parseCsvRows(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: 'greedy' })
  return parsed.data.map((r) => r.map((c) => (c == null ? '' : String(c))))
}

/** Spalten anhand der Überschriften erkennen. */
export function detectColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {}
  header.forEach((h, i) => {
    const label = norm(h).replace(/[:*]$/, '')
    for (const [role, re] of PATTERNS) {
      if (map[role] === undefined && re.test(label)) {
        map[role] = i
        return
      }
    }
  })
  return map
}

export function hasHeader(header: string[]): boolean {
  const m = detectColumns(header)
  return m.term !== undefined || m.translation !== undefined || m.unit !== undefined
}

export function guessLanguage(header: string[], map: ColumnMap, bookNames: string[]): string | undefined {
  const termHeader = map.term !== undefined ? norm(header[map.term] ?? '') : ''
  for (const [re, lang] of LANGUAGE_BY_HEADER) if (re.test(termHeader)) return lang
  for (const name of bookNames) for (const [re, lang] of LANGUAGE_BY_BOOK) if (re.test(name)) return lang
  return undefined
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70) || 'lehrwerk'
  )
}

const truthy = (v: string): boolean => /^(ja|j|x|yes|y|1|true|wahr|passiv|grau)$/i.test(v.trim())

/** Unit-Namen vereinheitlichen: „1“ → „Unit 1“ */
function unitName(v: string): string {
  const t = norm(v)
  return /^\d+[a-z]?$/i.test(t) ? `Unit ${t}` : t
}

export interface BuildOptions {
  /** Name, falls die Datei keine Lehrwerk-Spalte hat */
  bookName?: string
  language?: string
}

/**
 * Baut aus den Zeilen Lehrwerke. Leere Zellen in Lehrwerk/Band/Unit/Abschnitt übernehmen den Wert der Zeile darüber
 * (verbundene Zellen aus Excel). Die Reihenfolge der Datei bleibt erhalten.
 */
export function buildTextbooks(rows: string[][], map: ColumnMap, opts: BuildOptions = {}): Textbook[] {
  const books = new Map<string, Textbook>()
  const cell = (row: string[], role: ColumnRole): string => (map[role] !== undefined ? norm(row[map[role]!] ?? '') : '')
  let last = { book: '', volume: '', grade: '', unit: '', section: '' }
  const now = new Date().toISOString()

  for (const row of rows) {
    const term = cell(row, 'term')
    const translation = cell(row, 'translation')
    const current = {
      book: cell(row, 'book') || last.book,
      volume: cell(row, 'volume') || last.volume,
      grade: cell(row, 'grade') || last.grade,
      unit: cell(row, 'unit') || last.unit,
      section: cell(row, 'section') || (cell(row, 'unit') && cell(row, 'unit') !== last.unit ? '' : last.section)
    }
    // Neues Lehrwerk: Unit/Abschnitt nicht aus dem vorherigen übernehmen
    if (current.book !== last.book && !cell(row, 'unit')) current.unit = ''
    last = current
    if (!term) continue

    const baseName = current.book || opts.bookName?.trim() || 'Lehrwerk'
    const name =
      current.volume && !new RegExp(`\\b${current.volume.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(baseName) ? `${baseName} ${current.volume}` : baseName
    const id = slug(name)
    let book = books.get(id)
    if (!book) {
      const grade = Number.parseInt(current.grade, 10)
      book = { id, name, language: opts.language ?? 'en', ...(Number.isFinite(grade) ? { grade } : {}), units: [], importedAt: now }
      books.set(id, book)
    }
    const uName = unitName(current.unit) || 'Ohne Unit'
    let unit = book.units.find((u) => u.name === uName)
    if (!unit) book.units.push((unit = { name: uName, sections: [] }))
    const sName = current.section || 'Gesamte Unit'
    let section = unit.sections.find((s) => s.name === sName)
    if (!section) unit.sections.push((section = { name: sName, entries: [] }))

    const entry: TextbookEntry = { term, translation }
    const pos = cell(row, 'pos')
    const note = cell(row, 'note')
    const page = cell(row, 'page')
    if (pos) entry.pos = pos
    if (note) entry.note = note
    if (page) entry.page = page
    if (map.grey !== undefined && truthy(cell(row, 'grey'))) entry.grey = true
    section.entries.push(entry)
  }
  return [...books.values()]
}
