/*
 * Schulbuch-Vokabeln: mitgelieferte Lehrwerke (resources/lehrwerke) und von der Lehrkraft importierte (userData/lehrwerke).
 *
 * Gemeinsame Datenbank am Server (05.10.2026, Wunsch der Lehrkraft): „Die Green-Line-Lehrwerke, die schon
 * vorhanden sind, sollen als eine gemeinsame Datenbank dienen. Lehrkräfte sollen diese nicht bearbeiten
 * können (nur Admins)." Am Server gilt deshalb:
 *  - Mitgelieferte Lehrwerke sind GEMEINSAM. Was ein Admin daran ändert, liegt EINMAL für alle in
 *    <DATEN>/lehrwerke und ersetzt die mitgelieferte Fassung; „Änderungen verwerfen" (löschen) stellt sie wieder her.
 *  - Lehrkräfte lesen sie nur; eigene Fassungen gemeinsamer Lehrwerke (aus der Zeit davor) zählen nicht mehr.
 *  - Selbst importierte Lehrwerke bleiben die eigenen und frei bearbeitbar.
 * In der Exe bleibt es wie bisher (eine Person, eigene Fassung im eigenen Ordner).
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { MARK_BOX, MARK_EXPLAINED, MARK_GREY } from '@shared/types'
import type { Textbook, TextbookMeta } from '@shared/types'
import { resourcePath } from './paths'
import { loescheDatei } from './atomar'
import { mitReihe } from '@shared/lehrwerkReihe'
import { aufServer, istAdmin } from '../rolle'

/** Gemeinsame (vom Admin bearbeitete) Fassungen am Server */
function gemeinsamDir(): string {
  const d = join(process.env.SCHULAPPS_DATEN || './server-daten', 'lehrwerke')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

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

/** Mitgelieferte, am Server mit den gemeinsamen Fassungen des Admins */
function gemeinsameBooks(): Textbook[] {
  const mit = readBooks(resourcePath('lehrwerke'), true)
  if (!aufServer()) return mit
  const geaendert = readBooks(gemeinsamDir(), true)
  const ids = new Set(geaendert.map((b) => b.id))
  return [...mit.filter((b) => !ids.has(b.id)), ...geaendert]
}

/**
 * Exe: eigene Importe ersetzen mitgelieferte Lehrwerke mit derselben ID. Server: gemeinsame Lehrwerke haben
 * Vorrang – eigene Fassungen mit ihrer ID werden nicht mehr gelesen.
 */
function allBooks(): Textbook[] {
  const gemeinsam = gemeinsameBooks()
  const own = readBooks(userDir(), false)
  if (aufServer()) {
    const ids = new Set(gemeinsam.map((b) => b.id))
    return [...gemeinsam, ...own.filter((b) => !ids.has(b.id))]
  }
  const ownIds = new Set(own.map((b) => b.id))
  return [...gemeinsam.filter((b) => !ownIds.has(b.id)), ...own]
}

/** Ist das ein gemeinsames Lehrwerk (am Server nur für Admins änderbar)? */
const istGemeinsam = (id: string): boolean => aufServer() && gemeinsameBooks().some((b) => b.id === id)

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

/** Speichert importierte Lehrwerke (gleiche ID wird ersetzt); gemeinsame am Server nur als Admin, für alle. */
export function saveTextbooks(books: Textbook[]): TextbookMeta[] {
  for (const b of books) {
    const gemeinsam = istGemeinsam(checkId(b.id))
    if (gemeinsam && !istAdmin()) throw new Error('Die gemeinsamen Lehrwerke dürfen nur Admins bearbeiten.')
    const file = join(gemeinsam ? gemeinsamDir() : userDir(), `${checkId(b.id)}.json`)
    const { builtIn: _ignored, ...data } = b
    void _ignored
    writeFileSync(`${file}.tmp`, JSON.stringify(data), 'utf8')
    renameSync(`${file}.tmp`, file)
  }
  return listTextbooks()
}

export function deleteTextbook(id: string): TextbookMeta[] {
  if (istGemeinsam(checkId(id))) {
    // Gemeinsam: die Änderungen des Admins verwerfen → wieder die mitgelieferte Fassung
    if (!istAdmin()) throw new Error('Die gemeinsamen Lehrwerke dürfen nur Admins bearbeiten.')
    loescheDatei(join(gemeinsamDir(), `${id}.json`))
    return listTextbooks()
  }
  loescheDatei(join(userDir(), `${checkId(id)}.json`))
  return listTextbooks()
}
