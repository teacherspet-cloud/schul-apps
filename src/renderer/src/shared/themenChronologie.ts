/**
 * Themenbereiche in der Reihenfolge des Unterrichts (07.10.2026, Wunsch der Lehrkraft): „Inhalte der 5. Klasse vor
 * Inhalten der 6. Klasse, Inhalte vom Anfang der 6. Klasse vor Inhalten, die erst im Laufe der 6. Klasse behandelt
 * werden" – mit alphabetischer Sortierung als Rückfall. Vorher standen die Bereiche in der Reihenfolge ihres Anlegens
 * (Green Line 5, Green Line 1, Green Line 6).
 *
 * Woher die Zeit kommt, der Reihe nach:
 *  1. Ein Lehrwerk-Band („Green Line 1") – Klasse des Bandes, am Anfang des Schuljahres.
 *  2. Ein Kapitel unter einem Band („Unit 2: At home") – Klasse des Bandes, Stelle des Kapitels im Buch.
 *  3. Sonst die Jahrgänge der Materialien darin (auch in Unterbereichen): der kleinste zählt – dort beginnt das Thema.
 * Ohne Angabe kommen die Bereiche danach, alphabetisch.
 */
import type { Themenbereich } from '@shared/themen'
import { kapitelFolge } from './lehrwerkThemen'

export interface Zeitpunkt {
  klasse: number
  /** Stelle im Schuljahr, 0 = Anfang, 1 = Ende */
  stelle: number
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Beginnt der Name mit dem Kapitel („Unit 1: A new school" ↔ „Unit 1", aber nicht „Unit 10")? */
const istKapitel = (name: string, kapitel: string): boolean => {
  const n = norm(name)
  const k = norm(kapitel)
  return n === k || (n.startsWith(k) && !/[0-9a-z]/.test(n.charAt(k.length)))
}

/**
 * Zeitpunkt eines Bereichs. `baende`: Name des Bandes → Klasse (aus den Lehrwerken), `jahrgaengeIn`: Jahrgänge der
 * Materialien im Bereich und seinen Unterbereichen.
 */
export function zeitpunktVon(
  b: Themenbereich,
  alle: Themenbereich[],
  baende: Record<string, number>,
  jahrgaengeIn: (id: string) => number[]
): Zeitpunkt | null {
  const band = (name: string): string | undefined => Object.keys(baende).find((x) => norm(x) === norm(name))
  const eigenerBand = band(b.name)
  if (eigenerBand) return { klasse: baende[eigenerBand], stelle: 0 }
  // Unter einem Band: Stelle des Kapitels im Buch
  for (let e = b.elternId ? alle.find((x) => x.id === b.elternId) : undefined; e; e = e.elternId ? alle.find((x) => x.id === e!.elternId) : undefined) {
    const eb = band(e.name)
    if (!eb) continue
    const kapitel = kapitelFolge(eb)
    const i = kapitel.findIndex((k) => istKapitel(b.name, k))
    if (i >= 0) return { klasse: baende[eb], stelle: (i + 1) / (kapitel.length + 1) }
    break
  }
  const j = jahrgaengeIn(b.id).filter((x) => x > 0)
  return j.length ? { klasse: Math.min(...j), stelle: 0.5 } : null
}

/** Geschwister chronologisch, gleiche Zeit und ohne Angabe alphabetisch */
export function chronologisch<T extends Themenbereich>(liste: T[], zeit: (b: T) => Zeitpunkt | null): T[] {
  const z = new Map(liste.map((b) => [b.id, zeit(b)]))
  return [...liste].sort((a, b) => {
    const za = z.get(a.id)
    const zb = z.get(b.id)
    if (za && zb && (za.klasse !== zb.klasse || za.stelle !== zb.stelle)) return za.klasse - zb.klasse || za.stelle - zb.stelle
    if (za && !zb) return -1
    if (!za && zb) return 1
    return a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' })
  })
}
