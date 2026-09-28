/**
 * `.schulpaket` – Material an Kolleginnen und Kollegen weitergeben (Großprogramm 0.4, F8).
 *
 * Ein ZIP mit `manifest.json`, je Material eine Datei `material/<n>.json` (der gespeicherte
 * Eintrag der Bibliothek, samt Name und Kennzahlen) und die vertonten Hörtexte `hoertexte/*.mp3`,
 * auf die das Material verweist. Beim Einlesen bekommt jedes Material eine NEUE Kennung – ein
 * Paket überschreibt nie etwas, auch nicht, wenn es zweimal eingelesen wird.
 *
 * Weitergabe nur als Datei (USB-Stick, E-Mail, Cloud-Ordner) – die App läuft auf dem eigenen
 * Rechner, einen Server zum Abholen gibt es nicht.
 *
 * Sicherheit: Nur die erwarteten Pfade werden gelesen (kein „../"), Größe und Anzahl sind
 * begrenzt (ZIP-Bomben), die Materialdateien müssen gültiges JSON mit Nutzlast sein.
 */
import { randomBytes } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from 'fflate'

export const PAKET_ARTEN = ['arbeitsblatt', 'vokabeltest', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'rueckmeldung', 'elternbrief'] as const
export type PaketArt = (typeof PAKET_ARTEN)[number]

export interface Ablageweg {
  get: (id: string) => Record<string, unknown>
  save: (input: { id: string; name: string; stats: Record<string, unknown>; payload: unknown; thumb?: string }) => { id: string }
}

export interface Manifest {
  app: 'schul-apps'
  typ: 'schulpaket'
  version: 1
  titel: string
  erstellt: string
  eintraege: { art: PaketArt; name: string; datei: string }[]
  hoertexte: string[]
}

const MP3 = /^[A-Za-z0-9_-]{1,80}\.mp3$/
const MAX_BYTES = 200 * 1024 * 1024
const MAX_EINTRAEGE = 200

/** Namen der Hörtexte, auf die ein Material verweist */
export const hoertexteIn = (payload: unknown): string[] => [
  ...new Set([...JSON.stringify(payload ?? null).matchAll(/([A-Za-z0-9_-]{1,80}\.mp3)/g)].map((m) => m[1]))
]

export function paketBauen(
  titel: string,
  auswahl: { art: PaketArt; id: string }[],
  wege: Record<PaketArt, Ablageweg>,
  /** Pfad eines Hörtextes im eigenen Ordner (geprüft), null = ungültiger Name */
  hoertextPfad: (name: string) => string | null,
  jetzt = new Date()
): Uint8Array {
  if (!auswahl.length) throw new Error('Es ist kein Material ausgewählt.')
  const dateien: Record<string, Uint8Array> = {}
  const eintraege: Manifest['eintraege'] = []
  const audio = new Set<string>()
  auswahl.forEach(({ art, id }, i) => {
    if (!PAKET_ARTEN.includes(art)) throw new Error(`Unbekannte Materialart: ${art}`)
    const eintrag = wege[art].get(id)
    const datei = `material/${i + 1}.json`
    dateien[datei] = strToU8(JSON.stringify(eintrag))
    eintraege.push({ art, name: String(eintrag.name ?? ''), datei })
    for (const n of hoertexteIn(eintrag.payload)) audio.add(n)
  })
  const hoertexte: string[] = []
  for (const n of audio) {
    const pfad = MP3.test(n) ? hoertextPfad(n) : null
    if (pfad && existsSync(pfad)) {
      dateien[`hoertexte/${n}`] = new Uint8Array(readFileSync(pfad))
      hoertexte.push(n)
    }
  }
  const manifest: Manifest = { app: 'schul-apps', typ: 'schulpaket', version: 1, titel, erstellt: jetzt.toISOString(), eintraege, hoertexte }
  dateien['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1))
  return zipSync(dateien, { level: 6 })
}

/** Liest und prüft ein Paket – wirft mit verständlicher Meldung, wenn etwas nicht stimmt */
export function paketLesen(daten: Uint8Array): { manifest: Manifest; dateien: Unzipped } {
  if (daten.byteLength > MAX_BYTES) throw new Error('Das Paket ist zu groß (höchstens 200 MB).')
  let dateien: Unzipped
  let gesamt = 0
  try {
    dateien = unzipSync(daten, {
      filter: (f) => {
        gesamt += f.originalSize
        if (gesamt > MAX_BYTES) throw new Error('Das Paket ist entpackt zu groß.')
        return f.name === 'manifest.json' || /^material\/\d{1,4}\.json$/.test(f.name) || (f.name.startsWith('hoertexte/') && MP3.test(f.name.slice(10)))
      }
    })
  } catch (e) {
    throw new Error(e instanceof Error && /zu groß/.test(e.message) ? e.message : 'Die Datei ist kein gültiges Schulpaket.')
  }
  if (!dateien['manifest.json']) throw new Error('Die Datei ist kein gültiges Schulpaket.')
  let manifest: Manifest
  try {
    manifest = JSON.parse(strFromU8(dateien['manifest.json'])) as Manifest
  } catch {
    throw new Error('Die Datei ist kein gültiges Schulpaket.')
  }
  if (manifest?.typ !== 'schulpaket' || manifest.version !== 1 || !Array.isArray(manifest.eintraege)) throw new Error('Die Datei ist kein gültiges Schulpaket.')
  if (manifest.eintraege.length > MAX_EINTRAEGE) throw new Error('Das Paket enthält zu viele Materialien.')
  for (const e of manifest.eintraege) {
    if (!PAKET_ARTEN.includes(e.art) || !dateien[e.datei]) throw new Error('Das Paket ist unvollständig.')
  }
  return { manifest, dateien }
}

export interface PaketVorschau {
  titel: string
  erstellt: string
  eintraege: { art: PaketArt; name: string }[]
  hoertexte: number
}

export const paketVorschau = (daten: Uint8Array): PaketVorschau => {
  const { manifest } = paketLesen(daten)
  return {
    titel: manifest.titel,
    erstellt: manifest.erstellt,
    eintraege: manifest.eintraege.map((e) => ({ art: e.art, name: e.name })),
    hoertexte: manifest.hoertexte?.length ?? 0
  }
}

const neueId = (): string => randomBytes(9).toString('base64url')

/** Liest das Paket ein: neue Kennungen, Hörtexte in den eigenen Ordner (vorhandene bleiben) */
export function paketEinlesen(
  daten: Uint8Array,
  wege: Record<PaketArt, Ablageweg>,
  hoertextSchreiben: (name: string, daten: Uint8Array) => void
): { art: PaketArt; id: string; name: string }[] {
  const { manifest, dateien } = paketLesen(daten)
  for (const [pfad, inhalt] of Object.entries(dateien)) if (pfad.startsWith('hoertexte/')) hoertextSchreiben(pfad.slice(10), inhalt)
  const neu: { art: PaketArt; id: string; name: string }[] = []
  for (const e of manifest.eintraege) {
    let roh: Record<string, unknown> | null = null
    try {
      roh = JSON.parse(strFromU8(dateien[e.datei])) as Record<string, unknown>
    } catch {
      roh = null
    }
    if (!roh || typeof roh !== 'object' || !('payload' in roh)) throw new Error(`„${e.name}" ist beschädigt.`)
    const { id: _alt, name, createdAt: _c, updatedAt: _u, payload, thumb, ...stats } = roh
    const id = neueId()
    wege[e.art].save({ id, name: String(name ?? e.name), stats, payload, ...(typeof thumb === 'string' ? { thumb } : {}) })
    neu.push({ art: e.art, id, name: String(name ?? e.name) })
  }
  return neu
}
