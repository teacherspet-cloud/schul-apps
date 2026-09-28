// Vokabeltests in der App speichern: je Test eine Datei (vollständige Vokabelliste, Einstellungen, Test) plus ein kleines Verzeichnis.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { writeAtomic } from './atomar'
import { join } from 'path'
import { SavedTest, SavedTestInput, SavedTestMeta } from '@shared/types'

function dir(): string {
  const d = join(app.getPath('userData'), 'vokabeltests')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

const indexFile = (): string => join(dir(), 'index.json')

function checkId(id: string): string {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new Error('Ungültige Test-ID.')
  return id
}

export function listTests(): SavedTestMeta[] {
  try {
    const list = JSON.parse(readFileSync(indexFile(), 'utf8')) as SavedTestMeta[]
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export function getTest(id: string): SavedTest {
  const file = join(dir(), `${checkId(id)}.json`)
  if (!existsSync(file)) throw new Error('Der Vokabeltest wurde nicht gefunden.')
  return JSON.parse(readFileSync(file, 'utf8')) as SavedTest
}

export function saveTest(input: SavedTestInput): SavedTestMeta {
  const id = checkId(input.id)
  const name = input.name.trim() || 'Unbenannter Vokabeltest'
  const now = new Date().toISOString()
  const list = listTests()
  const previous = list.find((t) => t.id === id)
  /*
   * Sprache und Jahrgang bleiben erhalten, wenn der neue Stand sie nicht kennt (26.09.2026).
   * Das automatische Sichern schickt die Kennzahlen des offenen Tests; hatte der beim Öffnen
   * seine Herkunft verloren, überschrieb es hier Sprache und Jahrgang mit „nichts".
   */
  const bewahrt: Partial<SavedTestMeta> = {
    ...(previous?.language && !input.stats.language ? { language: previous.language, subjectLabel: previous.subjectLabel } : {}),
    ...(previous?.grade && !input.stats.grade ? { grade: previous.grade } : {})
  }
  const meta: SavedTestMeta = { ...input.stats, ...bewahrt, id, name, createdAt: previous?.createdAt ?? now, updatedAt: now }
  writeAtomic(join(dir(), `${id}.json`), JSON.stringify({ ...meta, payload: input.payload } satisfies SavedTest))
  writeAtomic(indexFile(), JSON.stringify([meta, ...list.filter((t) => t.id !== id)], null, 1))
  return meta
}

export function deleteTest(id: string): SavedTestMeta[] {
  rmSync(join(dir(), `${checkId(id)}.json`), { force: true })
  const list = listTests().filter((t) => t.id !== id)
  writeAtomic(indexFile(), JSON.stringify(list, null, 1))
  return list
}
