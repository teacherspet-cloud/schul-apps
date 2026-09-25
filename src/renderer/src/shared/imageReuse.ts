/**
 * Dasselbe Bild auf Arbeitsblatt und Klassenarbeit.
 *
 * Grund ist ein ungewöhnlich klarer Befund: Schneider, Nebel, Beege & Rey (2020) fanden in vier
 * Experimenten BEIDE Effekte gleichzeitig. Wer ein Bild nur in der Lernphase sah, schnitt
 * schlechter ab – der bekannte Schaden ablenkender Bilder. Wer dasselbe Bild in der Lern- UND
 * in der Abfragephase sah, lernte MEHR als die Gruppe ganz ohne Bilder: Das Bild wirkt dann als
 * Abrufhilfe. Entscheidend sind die Wiedererkennbarkeit des Motivs und seine Verbindung zum
 * Lerninhalt.
 *
 * Praktisch heißt das: Taucht in der Klassenarbeit das Bild wieder auf, das schon auf dem
 * Übungsblatt stand, kehrt sich das Vorzeichen um – selbst bei einem Bild, das für sich genommen
 * nur schmückt. Nebenbei spart die Wiederverwendung Bildsuche und erzeugte Bilder.
 *
 * Die Zuordnung läuft über den Bildbedarf (Suchwörter bzw. Beschreibung), nicht über den
 * Baustein: Derselbe Bedarf auf zwei Blättern soll dasselbe Bild bekommen.
 */
import type { ImageRef } from '../modules/arbeitsblatt/model/types'

/**
 * Kennung eines Bildbedarfs.
 * Gleiche Form wie die Gruppierung in worksheetImages – damit trifft die Wiederverwendung
 * genau dann, wenn auch die Bildsuche denselben Bedarf gesehen hätte.
 */
export const imageNeedKey = (description: string, search?: string, original?: boolean): string =>
  `${original ? 'Q' : ''}|${(search || description || '').trim().toLowerCase()}`

export interface ReusableImage {
  key: string
  image: ImageRef
  /** Woher das Bild stammt – für den Hinweis an die Lehrkraft */
  from: string
}

interface BlockLike {
  type: string
  description?: string
  search?: string
  original?: boolean
  image?: ImageRef
  items?: { description: string; search?: string; image?: ImageRef }[]
}

/** Alle Bilder eines gespeicherten Blattes, nach Bildbedarf geschlüsselt. */
export function collectReusable(blocks: BlockLike[], from: string): ReusableImage[] {
  const out: ReusableImage[] = []
  for (const b of blocks) {
    if (b.type !== 'image') continue
    if (b.image?.dataUrl) out.push({ key: imageNeedKey(b.description ?? '', b.search, b.original), image: b.image, from })
    for (const item of b.items ?? []) {
      if (item.image?.dataUrl) out.push({ key: imageNeedKey(item.description, item.search), image: item.image, from })
    }
  }
  return out
}

/**
 * Nachschlagewerk aus mehreren Blättern. Bei gleichem Bedarf gewinnt das zuerst genannte
 * Blatt – die Aufrufer übergeben die Blätter in der Reihenfolge ihrer Nähe zum Thema.
 */
export function reusePool(sheets: { blocks: BlockLike[]; name: string }[]): Map<string, ReusableImage> {
  const pool = new Map<string, ReusableImage>()
  for (const sheet of sheets) {
    for (const entry of collectReusable(sheet.blocks, sheet.name)) {
      if (!pool.has(entry.key)) pool.set(entry.key, entry)
    }
  }
  return pool
}

/**
 * Passendes Bild aus dem Vorrat.
 * Erst der genaue Bedarf, dann eine deutliche Überschneidung der Suchwörter – ein Bild, das nur
 * ungefähr passt, wäre als Abrufhilfe wertlos und als Material falsch.
 */
export function findReusable(pool: Map<string, ReusableImage>, description: string, search?: string, original?: boolean): ReusableImage | undefined {
  const key = imageNeedKey(description, search, original)
  const exact = pool.get(key)
  if (exact) return exact

  const wanted = words(key)
  if (wanted.length < 2) return undefined
  let best: { entry: ReusableImage; score: number } | undefined
  for (const entry of pool.values()) {
    // Originalquelle und gewöhnliches Bild sind nicht austauschbar
    if (entry.key.startsWith('Q') !== Boolean(original)) continue
    const have = words(entry.key)
    const shared = wanted.filter((w) => have.includes(w)).length
    const score = shared / Math.max(wanted.length, have.length)
    if (score >= 0.6 && (!best || score > best.score)) best = { entry, score }
  }
  return best?.entry
}

const words = (key: string): string[] =>
  key
    .replace(/^Q?\|/, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2)
