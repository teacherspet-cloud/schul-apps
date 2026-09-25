// Vokabeltests in der App speichern: je Test eine Datei (vollständige Vokabelliste, Einstellungen, Test) plus ein kleines Verzeichnis.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
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

/** Schreibt erst in eine Hilfsdatei und benennt dann um – so bleibt bei einem Absturz die alte Fassung erhalten. */
function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
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
  const meta: SavedTestMeta = { ...input.stats, id, name, createdAt: previous?.createdAt ?? now, updatedAt: now }
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
