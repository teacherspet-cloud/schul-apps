// Arbeitsblätter in der App speichern: je Blatt eine Datei plus ein kleines Verzeichnis (für die Ordneransicht).
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { SavedWorksheet, SavedWorksheetInput, SavedWorksheetMeta } from '@shared/types'

function dir(): string {
  const d = join(app.getPath('userData'), 'arbeitsblaetter')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

const indexFile = (): string => join(dir(), 'index.json')

function checkId(id: string): string {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new Error('Ungültige Arbeitsblatt-ID.')
  return id
}

/** Schreibt erst in eine Hilfsdatei und benennt dann um – so bleibt bei einem Absturz die alte Fassung erhalten. */
function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

export function listWorksheets(): SavedWorksheetMeta[] {
  try {
    const list = JSON.parse(readFileSync(indexFile(), 'utf8')) as SavedWorksheetMeta[]
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export function getWorksheet(id: string): SavedWorksheet {
  const file = join(dir(), `${checkId(id)}.json`)
  if (!existsSync(file)) throw new Error('Das Arbeitsblatt wurde nicht gefunden.')
  return JSON.parse(readFileSync(file, 'utf8')) as SavedWorksheet
}

export function saveWorksheet(input: SavedWorksheetInput): SavedWorksheetMeta {
  const id = checkId(input.id)
  const name = input.name.trim() || 'Unbenanntes Arbeitsblatt'
  const now = new Date().toISOString()
  const list = listWorksheets()
  const previous = list.find((t) => t.id === id)
  const meta: SavedWorksheetMeta = { ...input.stats, id, name, thumb: input.thumb ?? previous?.thumb, createdAt: previous?.createdAt ?? now, updatedAt: now }
  writeAtomic(join(dir(), `${id}.json`), JSON.stringify({ ...meta, payload: input.payload } satisfies SavedWorksheet))
  writeAtomic(indexFile(), JSON.stringify([meta, ...list.filter((t) => t.id !== id)], null, 1))
  return meta
}

export function deleteWorksheet(id: string): SavedWorksheetMeta[] {
  rmSync(join(dir(), `${checkId(id)}.json`), { force: true })
  const list = listWorksheets().filter((t) => t.id !== id)
  writeAtomic(indexFile(), JSON.stringify(list, null, 1))
  return list
}
