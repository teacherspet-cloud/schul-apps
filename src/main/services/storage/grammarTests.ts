// Grammatiktests in der App speichern: je Test eine Datei plus ein kleines Verzeichnis für die Übersicht.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { loescheDatei, writeAtomic } from './atomar'
import { join } from 'path'
import { SavedGrammarTest, SavedGrammarTestInput, SavedGrammarTestMeta } from '@shared/types'

function dir(): string {
  const d = join(app.getPath('userData'), 'grammatiktests')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

const indexFile = (): string => join(dir(), 'index.json')

function checkId(id: string): string {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new Error('Ungültige Grammatiktest-ID.')
  return id
}

export function listGrammarTests(): SavedGrammarTestMeta[] {
  try {
    const list = JSON.parse(readFileSync(indexFile(), 'utf8')) as SavedGrammarTestMeta[]
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export function getGrammarTest(id: string): SavedGrammarTest {
  const file = join(dir(), `${checkId(id)}.json`)
  if (!existsSync(file)) throw new Error('Der Grammatiktest wurde nicht gefunden.')
  return JSON.parse(readFileSync(file, 'utf8')) as SavedGrammarTest
}

export function saveGrammarTest(input: SavedGrammarTestInput): SavedGrammarTestMeta {
  const id = checkId(input.id)
  const name = input.name.trim() || 'Unbenannter Grammatiktest'
  const now = new Date().toISOString()
  const list = listGrammarTests()
  const previous = list.find((t) => t.id === id)
  const meta: SavedGrammarTestMeta = { ...input.stats, id, name, createdAt: previous?.createdAt ?? now, updatedAt: now }
  writeAtomic(join(dir(), `${id}.json`), JSON.stringify({ ...meta, payload: input.payload } satisfies SavedGrammarTest))
  writeAtomic(indexFile(), JSON.stringify([meta, ...list.filter((t) => t.id !== id)], null, 1))
  return meta
}

export function deleteGrammarTest(id: string): SavedGrammarTestMeta[] {
  loescheDatei(join(dir(), `${checkId(id)}.json`))
  const list = listGrammarTests().filter((t) => t.id !== id)
  writeAtomic(indexFile(), JSON.stringify(list, null, 1))
  return list
}
