/**
 * Lerngruppe: Bundesland, Schulform, Jahrgang, Kursniveau – gemeinsame Regeln aller Programme
 * (Großprogramm 0.4, Aufräumen D2).
 *
 * Bis dahin stand in jedem Einstellungsschritt eine eigene Fassung derselben Folgerungen, und
 * sie gingen auseinander: Das Arbeitsblatt zog beim Wechsel des Landes Schulform, Jahrgang und
 * Kursniveau nach, die Klassenarbeit nur die Schulform – ein Jahrgang, den es an der neuen
 * Schulform nicht gibt, blieb stehen. Jetzt gilt überall dieselbe Regel.
 */
import type { CefrTable } from '@shared/types'
import { courseLevelOptions, gradeRange, schoolTypesForState } from '../modules/arbeitsblatt/didactics/schoolProfiles'

export interface Lerngruppe {
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  grade: number
  courseLevel?: string
}

/**
 * Nach einer Änderung an Land, Schulform oder Jahrgang: Schulform auf eine des Landes, Jahrgang
 * in den Bereich der Schulform, Kursniveau auf eines, das es dort gibt. Nur die Felder, die
 * sich ändern, kommen zurück.
 */
export function passeLerngruppeAn<T extends Lerngruppe>(table: CefrTable, next: T): Partial<Lerngruppe> {
  const out: Partial<Lerngruppe> = {}
  const types = schoolTypesForState(table, next.stateId)
  const schoolTypeId = types.some((t) => t.value === next.schoolTypeId) ? next.schoolTypeId : (types[0]?.value ?? 'gymnasium')
  if (schoolTypeId !== next.schoolTypeId) out.schoolTypeId = schoolTypeId
  const name = types.find((t) => t.value === schoolTypeId)?.label
  if (name && name !== next.schoolTypeName) out.schoolTypeName = name
  const range = gradeRange(table, next.stateId, schoolTypeId)
  const grade = Math.min(range.max, Math.max(range.min, next.grade))
  if (grade !== next.grade) out.grade = grade
  if (next.courseLevel !== undefined) {
    const courses = courseLevelOptions(next.stateId, schoolTypeId, grade)
    if (!courses || !courses.some((c) => c.value === next.courseLevel)) {
      if (next.courseLevel !== 'mixed') out.courseLevel = 'mixed'
    }
  }
  return out
}

/** Änderung plus Folgerungen in einem Schritt */
export function mitLerngruppe<T extends Lerngruppe>(table: CefrTable, alt: T, aenderung: Partial<T>): Partial<T> {
  const next = { ...alt, ...aenderung }
  return { ...aenderung, ...(passeLerngruppeAn(table, next) as Partial<T>) }
}
