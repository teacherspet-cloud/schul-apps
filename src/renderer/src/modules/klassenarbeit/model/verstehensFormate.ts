/**
 * Aufgabenformate eines Hör- bzw. Leseverstehensteils der Klassenarbeit (18.11.2026, Vorgabe der Lehrkraft):
 * Je Hör-/Lesetext darf nur EIN Aufgabenformat vorkommen; für jedes weitere Format ist ein neuer Text nötig.
 * Darum gilt: Zahl der Formate = Zahl der Texte. Vorgabe 2 Formate (vorher 3 auf einem Text), damit die Arbeit
 * nicht zu lang wird; höchstens 3 (so viele Hörtexte schreibt die App je Teil).
 * Mit beschafftem Originaltext (Oberstufe) gibt es nur einen Text – dann nur das erste Format.
 */
import { defaultComprehensionFormats } from '../../arbeitsblatt/didactics/comprehensionFormats'
import { formatArt } from './faecher'

export const VERSTEHEN_FORMATE_VORGABE = 2
export const VERSTEHEN_FORMATE_MAX = 3

export const istVerstehensteil = (formatId: string): boolean => ['listening', 'reading'].includes(formatArt(formatId) ?? '')

export function vorgabeFormate(formatId: string, grade: number): string[] {
  return defaultComprehensionFormats(formatArt(formatId) === 'listening' ? 'listening' : 'reading', grade).slice(0, VERSTEHEN_FORMATE_VORGABE)
}

/** Formate des Teils in Textreihenfolge (Text 1 → Format 1 …); leer, wenn der Teil kein Verstehensteil ist */
export function teilFormate(part: { formatId: string; formats?: string[] }, grade: number, nurEinText = false): string[] {
  if (!istVerstehensteil(part.formatId)) return part.formats ?? []
  const alle = part.formats?.length ? part.formats : vorgabeFormate(part.formatId, grade)
  return alle.slice(0, nurEinText ? 1 : VERSTEHEN_FORMATE_MAX)
}
