/**
 * Gemeinsame Ablage für die Bibliotheken der neuen Programme (Großprogramm 0.4: Rückmeldung,
 * Elternbrief): je Dokument eine Datei, dazu ein kleines Verzeichnis für die Übersicht – wie
 * bei Klassenarbeiten (storage/exams.ts), aber einmal geschrieben statt je Programm kopiert.
 * Absturzsicher über `writeAtomic`.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { loescheDatei, writeAtomic } from './atomar'

export interface DokumentMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  [feld: string]: unknown
}

export interface DokumentEingabe {
  id: string
  name: string
  stats: Record<string, unknown>
  payload: unknown
}

export interface Ablage {
  list: () => DokumentMeta[]
  get: (id: string) => DokumentMeta & { payload: unknown }
  save: (input: DokumentEingabe) => DokumentMeta
  delete: (id: string) => DokumentMeta[]
}

export function erzeugeAblage(ordner: string, bezeichnung: string, wurzel: () => string = () => app.getPath('userData')): Ablage {
  const dir = (): string => {
    const d = join(wurzel(), ordner)
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
    return d
  }
  const indexFile = (): string => join(dir(), 'index.json')
  const checkId = (id: string): string => {
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new Error(`Ungültige Kennung (${bezeichnung}).`)
    return id
  }
  const list = (): DokumentMeta[] => {
    try {
      return (JSON.parse(readFileSync(indexFile(), 'utf8')) as DokumentMeta[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    } catch {
      return []
    }
  }
  return {
    list,
    get: (id) => {
      const file = join(dir(), `${checkId(id)}.json`)
      if (!existsSync(file)) throw new Error(`${bezeichnung} wurde nicht gefunden.`)
      return JSON.parse(readFileSync(file, 'utf8')) as DokumentMeta & { payload: unknown }
    },
    save: (input) => {
      const id = checkId(input.id)
      const name = String(input.name ?? '').trim() || `Unbenannt (${bezeichnung})`
      const now = new Date().toISOString()
      const alle = list()
      const vorher = alle.find((t) => t.id === id)
      const meta: DokumentMeta = { ...(input.stats ?? {}), id, name, createdAt: vorher?.createdAt ?? now, updatedAt: now }
      writeAtomic(join(dir(), `${id}.json`), JSON.stringify({ ...meta, payload: input.payload }))
      writeAtomic(indexFile(), JSON.stringify([meta, ...alle.filter((t) => t.id !== id)], null, 1))
      return meta
    },
    delete: (id) => {
      loescheDatei(join(dir(), `${checkId(id)}.json`))
      const rest = list().filter((t) => t.id !== id)
      writeAtomic(indexFile(), JSON.stringify(rest, null, 1))
      return rest
    }
  }
}

/** Die Ablagen der neuen Programme – Ordnernamen stehen auch in wartung.ts (Sicherung) */
export const ABLAGEN = {
  rueckmeldungen: erzeugeAblage('rueckmeldungen', 'Rückmeldung'),
  elternbriefe: erzeugeAblage('elternbriefe', 'Elternbrief'),
  // Tafelbilder (30.09.2026)
  tafelbilder: erzeugeAblage('tafelbilder', 'Tafelbild'),
  // Rückmeldung (29.09.2026): Vorlagen für Bewertungstabellen und die lokal gemerkten Nachteilsausgleiche
  bewertungstabellen: erzeugeAblage('bewertungstabellen', 'Bewertungstabelle'),
  nachteilsausgleiche: erzeugeAblage('nachteilsausgleiche', 'Nachteilsausgleich')
}
