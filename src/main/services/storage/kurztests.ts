// Lernzielkontrollen in der App speichern: je Kontrolle eine Datei plus ein kleines
// Verzeichnis für die Übersicht. Aufbau wie bei den Grammatiktests.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { SavedKurztest, SavedKurztestInput, SavedKurztestMeta } from '@shared/types'

function dir(): string {
  const d = join(app.getPath('userData'), 'lernzielkontrollen')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

const indexFile = (): string => join(dir(), 'index.json')

function checkId(id: string): string {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new Error('Ungültige Kennung einer Lernzielkontrolle.')
  return id
}

/** Schreibt erst in eine Hilfsdatei und benennt dann um – so bleibt bei einem Absturz die alte Fassung erhalten. */
function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

export function listKurztests(): SavedKurztestMeta[] {
  try {
    const list = JSON.parse(readFileSync(indexFile(), 'utf8')) as SavedKurztestMeta[]
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export function getKurztest(id: string): SavedKurztest {
  const file = join(dir(), `${checkId(id)}.json`)
  if (!existsSync(file)) throw new Error('Die Lernzielkontrolle wurde nicht gefunden.')
  return JSON.parse(readFileSync(file, 'utf8')) as SavedKurztest
}

export function saveKurztest(input: SavedKurztestInput): SavedKurztestMeta {
  const id = checkId(input.id)
  const name = input.name.trim() || 'Unbenannte Lernzielkontrolle'
  const now = new Date().toISOString()
  const list = listKurztests()
  const previous = list.find((t) => t.id === id)
  const meta: SavedKurztestMeta = { ...input.stats, id, name, createdAt: previous?.createdAt ?? now, updatedAt: now }
  writeAtomic(join(dir(), `${id}.json`), JSON.stringify({ ...meta, payload: input.payload } satisfies SavedKurztest))
  writeAtomic(indexFile(), JSON.stringify([meta, ...list.filter((t) => t.id !== id)], null, 1))
  return meta
}

export function deleteKurztest(id: string): SavedKurztestMeta[] {
  rmSync(join(dir(), `${checkId(id)}.json`), { force: true })
  const list = listKurztests().filter((t) => t.id !== id)
  writeAtomic(indexFile(), JSON.stringify(list, null, 1))
  return list
}
