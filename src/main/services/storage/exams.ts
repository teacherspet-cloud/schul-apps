// Klassenarbeiten in der App speichern: je Arbeit eine Datei plus ein kleines Verzeichnis für die Übersicht.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { writeAtomic } from './atomar'
import { join } from 'path'
import { SavedExam, SavedExamInput, SavedExamMeta } from '@shared/types'

function dir(): string {
  const d = join(app.getPath('userData'), 'klassenarbeiten')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

const indexFile = (): string => join(dir(), 'index.json')

function checkId(id: string): string {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new Error('Ungültige Klassenarbeit-ID.')
  return id
}

export function listExams(): SavedExamMeta[] {
  try {
    const list = JSON.parse(readFileSync(indexFile(), 'utf8')) as SavedExamMeta[]
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export function getExam(id: string): SavedExam {
  const file = join(dir(), `${checkId(id)}.json`)
  if (!existsSync(file)) throw new Error('Die Klassenarbeit wurde nicht gefunden.')
  return JSON.parse(readFileSync(file, 'utf8')) as SavedExam
}

export function saveExam(input: SavedExamInput): SavedExamMeta {
  const id = checkId(input.id)
  const name = input.name.trim() || 'Unbenannte Klassenarbeit'
  const now = new Date().toISOString()
  const list = listExams()
  const previous = list.find((t) => t.id === id)
  const meta: SavedExamMeta = { ...input.stats, id, name, createdAt: previous?.createdAt ?? now, updatedAt: now }
  writeAtomic(join(dir(), `${id}.json`), JSON.stringify({ ...meta, payload: input.payload } satisfies SavedExam))
  writeAtomic(indexFile(), JSON.stringify([meta, ...list.filter((t) => t.id !== id)], null, 1))
  return meta
}

export function deleteExam(id: string): SavedExamMeta[] {
  rmSync(join(dir(), `${checkId(id)}.json`), { force: true })
  const list = listExams().filter((t) => t.id !== id)
  writeAtomic(indexFile(), JSON.stringify(list, null, 1))
  return list
}
