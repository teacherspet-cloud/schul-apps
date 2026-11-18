/**
 * Zahl oder Spanne für „Zahl der Aufgaben" und „Fragen zum Text" (18.11.2026, Wunsch der Lehrkraft: „5-10" eingeben).
 *
 * Gespeichert wie die Seitenzahl (`pages`/`pagesBis`): die Untergrenze im bisherigen Feld (`taskCount`, `itemCount`),
 * die Obergrenze daneben (`taskCountBis`, `itemCountBis`). Fehlt die Obergrenze oder ist sie nicht größer, gilt die
 * Zahl genau – ältere Blätter behalten so ihre Vorgabe.
 */
import type { WorksheetMeta } from '../model/types'

export interface Spanne {
  min: number
  max: number
}

const HOECHSTENS = 30

/** Untergrenze und Obergrenze → Spanne (null = keine Vorgabe) */
export function spanneVon(von?: number, bis?: number): Spanne | null {
  const min = Math.round(Number(von) || 0)
  if (min <= 0) return null
  const max = Math.round(Number(bis) || 0)
  return { min, max: max > min ? max : min }
}

export const istSpanne = (s: Spanne | null): boolean => Boolean(s && s.max > s.min)

/** „6" bzw. „5–10" */
export const spanneText = (s: Spanne): string => (s.max > s.min ? `${s.min}–${s.max}` : `${s.min}`)

/**
 * Eingabe lesen: „6", „5-10", „5–10", „5 - 10", „5 bis 10". Leer → null (keine Vorgabe); unlesbar → undefined.
 * Vertauschte Grenzen werden gedreht, gleiche Grenzen ergeben eine genaue Zahl.
 */
export function leseSpanne(eingabe: string): Spanne | null | undefined {
  const t = eingabe.trim()
  if (!t) return null
  const m = /^(\d{1,2})\s*(?:(?:-|–|—|bis)\s*(\d{1,2}))?$/i.exec(t)
  if (!m) return undefined
  let a = Number(m[1])
  let b = m[2] ? Number(m[2]) : a
  if (a > b) [a, b] = [b, a]
  if (a <= 0) return b > 0 ? { min: 1, max: Math.min(b, HOECHSTENS) } : null
  return { min: Math.min(a, HOECHSTENS), max: Math.min(b, HOECHSTENS) }
}

export const aufgabenSpanne = (meta: Pick<WorksheetMeta, 'taskCount' | 'taskCountBis'>): Spanne | null => spanneVon(meta.taskCount, meta.taskCountBis)
export const fragenSpanne = (meta: Pick<WorksheetMeta, 'itemCount' | 'itemCountBis'>): Spanne | null => spanneVon(meta.itemCount, meta.itemCountBis)

/** Felder für `patch` aus einer gelesenen Spanne */
export const aufgabenFelder = (s: Spanne | null): Pick<WorksheetMeta, 'taskCount' | 'taskCountBis'> => ({
  taskCount: s?.min ?? 0,
  taskCountBis: s && s.max > s.min ? s.max : undefined
})
export const fragenFelder = (s: Spanne | null): Pick<WorksheetMeta, 'itemCount' | 'itemCountBis'> => ({
  itemCount: s?.min ?? 0,
  itemCountBis: s && s.max > s.min ? s.max : undefined
})

/** Für die KI: „GENAU 6" bzw. „ZWISCHEN 5 UND 10" */
export const spanneAuftrag = (s: Spanne): string => (s.max > s.min ? `ZWISCHEN ${s.min} UND ${s.max}` : `GENAU ${s.min}`)
