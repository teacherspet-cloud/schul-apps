// Schulbuch-Vokabeln: mitgelieferte Lehrwerke (resources/lehrwerke) und von der Lehrkraft importierte (userData/lehrwerke).
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { MARK_BOX, MARK_EXPLAINED, MARK_GREY } from '@shared/types'
import type { Textbook, TextbookMeta } from '@shared/types'
import { resourcePath } from './paths'
import { mitReihe } from '@shared/lehrwerkReihe'

function userDir(): string {
  const d = join(app.getPath('userData'), 'lehrwerke')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function checkId(id: string): string {
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(id)) throw new Error('Ungültige Lehrwerk-ID.')
  return id
}

function readBooks(dir: string, builtIn: boolean): Textbook[] {
  if (!existsSync(dir)) return []
  const books: Textbook[] = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    try {
      const book = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Textbook
      // Reihe und Band fehlen bei älteren und importierten Lehrwerken: aus dem Namen ableiten (Paket 15)
      if (book?.id && Array.isArray(book.units)) books.push(mitReihe({ ...book, builtIn }))
    } catch {
      // beschädigte Datei überspringen
    }
  }
  return books
}

/** Eigene Importe ersetzen mitgelieferte Lehrwerke mit derselben ID. */
function allBooks(): Textbook[] {
  const own = readBooks(userDir(), false)
  const ownIds = new Set(own.map((b) => b.id))
  return [...readBooks(resourcePath('lehrwerke'), true).filter((b) => !ownIds.has(b.id)), ...own]
}

export function toMeta(b: Textbook): TextbookMeta {
  return {
    id: b.id,
    name: b.name,
    language: b.language,
    grade: b.grade,
    stateId: b.stateId,
    schoolTypeId: b.schoolTypeId,
    builtIn: b.builtIn,
    publisher: b.publisher,
    edition: b.edition,
    reihe: b.reihe,
    ausgabe: b.ausgabe,
    band: b.band,
    units: b.units.map((u) => ({
      name: u.name,
      sections: u.sections.map((s) => {
        const marks = new Array(8).fill(0)
        for (const e of s.entries) {
          marks[(e.inBox ? MARK_BOX : 0) | (e.grey ? MARK_GREY : 0) | (e.explained ? MARK_EXPLAINED : 0)]++
        }
        return { name: s.name, marks }
      })
    })),
    entryCount: b.units.reduce((n, u) => n + u.sections.reduce((m, s) => m + s.entries.length, 0), 0)
  }
}

const collator = new Intl.Collator('de', { numeric: true })

export function listTextbooks(): TextbookMeta[] {
  return allBooks()
    .map(toMeta)
    .sort((a, b) => a.language.localeCompare(b.language) || collator.compare(a.name, b.name))
}

export function getTextbook(id: string): Textbook {
  const book = allBooks().find((b) => b.id === checkId(id))
  if (!book) throw new Error('Das Lehrwerk wurde nicht gefunden.')
  return book
}

/** Speichert importierte Lehrwerke (gleiche ID wird ersetzt). */
export function saveTextbooks(books: Textbook[]): TextbookMeta[] {
  for (const b of books) {
    const file = join(userDir(), `${checkId(b.id)}.json`)
    const { builtIn: _ignored, ...data } = b
    void _ignored
    writeFileSync(`${file}.tmp`, JSON.stringify(data), 'utf8')
    renameSync(`${file}.tmp`, file)
  }
  return listTextbooks()
}

export function deleteTextbook(id: string): TextbookMeta[] {
  rmSync(join(userDir(), `${checkId(id)}.json`), { force: true })
  return listTextbooks()
}
