/**
 * Fachobleute (12.10.2026, Wunsch der Lehrkraft): Der Admin ernennt in „Schule & Daten" je Fach eine oder mehrere
 * Lehrkräfte zur Fachobfrau bzw. zum Fachobmann (eine Lehrkraft kann es für mehrere Fächer sein). Sie pflegen die
 * GEMEINSAMEN Lehrwerke ihres Fachs – Vokabellisten und Grammatikformen – wie bis dahin nur der Admin.
 *
 * Regeln (eine Quelle für Server, Hauptprozess und Oberfläche):
 *  - Admin: darf alles.
 *  - Fachobfrau/-mann: darf gemeinsame Lehrwerke der eigenen Fächer bearbeiten (Fach aus der Sprache des Lehrwerks,
 *    shared/faecher.ts: en → englisch).
 *  - übrige Lehrkräfte und Lernende: nur lesen.
 *  - Am PC ohne Server gibt es nur EINE Lehrkraft – sie gilt als berechtigt (rolle.ts liefert dort 'admin').
 * Die Medienbank (Bilder/Ton erzeugen) bleibt beim Admin.
 */
import { FACH_ZU_SPRACHE, fachVon } from './faecher'

/** Fach eines Lehrwerks aus seiner Sprache („en" → „englisch"); unbekannt: die Sprache selbst */
export const fachDerSprache = (sprache: string): string => FACH_ZU_SPRACHE[sprache] ?? sprache

/** Gültige, eindeutige Fachkennungen (nur Fächer des Katalogs) */
export function pruefeFaecher(roh: unknown): string[] {
  if (!Array.isArray(roh)) return []
  return [...new Set(roh.filter((f): f is string => typeof f === 'string' && Boolean(fachVon(f))))].sort()
}

/** Darf diese Person gemeinsame Lehrwerke dieser Sprache bearbeiten? */
export function darfLehrwerkFach(rolle: string | undefined, obmannFaecher: readonly string[] | undefined, sprache: string): boolean {
  if (rolle === 'admin') return true
  if (rolle !== 'lehrkraft') return false
  return Boolean(obmannFaecher?.includes(fachDerSprache(sprache)))
}

/** Sieht die Person die Apps „Vokabellisten" und „Grammatikformen"? Admin oder Fachobfrau/-mann irgendeines Fachs */
export const siehtLehrwerkPflege = (rolle: string | undefined, obmannFaecher: readonly string[] | undefined): boolean =>
  rolle === 'admin' || (rolle === 'lehrkraft' && Boolean(obmannFaecher?.length))
