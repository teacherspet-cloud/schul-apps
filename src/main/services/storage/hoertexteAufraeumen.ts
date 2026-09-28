/**
 * Verwaiste Hörtexte aufräumen (27.09.2026, Großprogramm 0.4, Paket Verlässlichkeit).
 *
 * Vertonte Hörtexte liegen als MP3 unter `userData/hoertexte`. Wird das Material gelöscht oder
 * neu vertont, blieb die alte Datei für immer liegen. Jetzt findet die App MP3-Dateien, auf die
 * kein gespeichertes Material mehr verweist. Gelöscht wird nur, was älter als sieben Tage ist –
 * ein frisch vertontes, aber noch nicht gesichertes Blatt hält seine Datei nur im Speicher – und
 * nur auf Knopfdruck der Lehrkraft.
 */
import { app } from 'electron'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'

const MATERIAL = ['arbeitsblaetter', 'klassenarbeiten', 'lernzielkontrollen', 'grammatiktests', 'vokabeltests']
const SIEBEN_TAGE = 7 * 24 * 60 * 60 * 1000

export interface Verwaist {
  dateien: string[]
  bytes: number
}

export function verwaisteHoertexte(wurzel = app.getPath('userData'), jetzt = Date.now()): Verwaist {
  const dir = join(wurzel, 'hoertexte')
  if (!existsSync(dir)) return { dateien: [], bytes: 0 }
  // Alle Verweise sammeln: Die MP3-Namen stehen wörtlich in den gespeicherten Materialien
  const verwiesen = new Set<string>()
  for (const ordner of MATERIAL) {
    const pfad = join(wurzel, ordner)
    if (!existsSync(pfad)) continue
    for (const f of readdirSync(pfad)) {
      if (!f.endsWith('.json')) continue
      const text = readFileSync(join(pfad, f), 'utf8')
      for (const m of text.matchAll(/([A-Za-z0-9_-]{1,80}\.mp3)/g)) verwiesen.add(m[1])
    }
  }
  const dateien: string[] = []
  let bytes = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.mp3') || verwiesen.has(f)) continue
    const st = statSync(join(dir, f))
    if (jetzt - st.mtimeMs < SIEBEN_TAGE) continue
    dateien.push(f)
    bytes += st.size
  }
  return { dateien, bytes }
}

export function raeumeHoertexteAuf(wurzel = app.getPath('userData')): Verwaist {
  const v = verwaisteHoertexte(wurzel)
  for (const f of v.dateien) rmSync(join(wurzel, 'hoertexte', f), { force: true })
  return v
}
