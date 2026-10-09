/**
 * Fachfarben der Schule (09.10.2026, Entscheidung der Lehrkraft).
 *
 * Am Server legt die Verwaltung die Fachfarben für ALLE fest („Schule & Daten" › Schule › Fachfarben, gespeichert in
 * server_einstellungen unter 'fachfarben'). Lehrkräfte ändern sie nicht mehr; ihre Materialien, die Fachordner der
 * Lernenden und „Meine Klassen" zeigen die Farben der Schule – fehlt ein Fach, gilt der Vorschlag des Katalogs
 * (renderer/shared/fachfarben.ts). Einmalige Übernahme: Hat die Schule noch keine Farben, werden die eigenen Farben
 * des (ersten) Admins zu den Farben der Schule. In der Exe ohne Server bleibt alles wie bisher (eigene Farben).
 */
import type { AppSettings, DeepPartial } from './types'

const HEX = /^#[0-9a-f]{6}$/i

/** Nur Fachkennungen mit gültiger Farbe (#rrggbb); '' = Vorschlag des Katalogs, wird weggelassen */
export function pruefeFachfarben(roh: unknown): { farben: Record<string, string> } | { fehler: string } {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return { fehler: 'Die Fachfarben fehlen.' }
  const farben: Record<string, string> = {}
  const eintraege = Object.entries(roh as Record<string, unknown>)
  if (eintraege.length > 200) return { fehler: 'Zu viele Fächer.' }
  for (const [fach, farbe] of eintraege) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(fach)) return { fehler: `Unbekannte Fachkennung „${fach.slice(0, 40)}“.` }
    if (farbe === '' || farbe === null || farbe === undefined) continue
    if (typeof farbe !== 'string' || !HEX.test(farbe)) return { fehler: `Ungültige Farbe für „${fach}“.` }
    farben[fach] = farbe.toLowerCase()
  }
  return { farben }
}

/** Die Einstellungen mit den Farben der Schule (null = keine Schulfarben: unverändert, wie in der Exe) */
export function mitSchulFachfarben(s: AppSettings, schul: Record<string, string> | null | undefined): AppSettings {
  if (!schul) return s
  return { ...s, fachfarben: { ...schul } }
}

/** Eine Änderung der Lehrkraft ohne Fachfarben (am Server ändert sie nur die Verwaltung) */
export function ohneFachfarben(patch: DeepPartial<AppSettings>): DeepPartial<AppSettings> {
  if (!patch || typeof patch !== 'object' || !('fachfarben' in patch)) return patch
  const { fachfarben: _f, ...rest } = patch
  return rest
}

/** Erste Farben der Schule aus den eigenen Farben des Admins (nur gültige, ohne „Vorschlag") */
export function ersteSchulFachfarben(eigene: Record<string, string> | null | undefined): Record<string, string> {
  const p = pruefeFachfarben(Object.fromEntries(Object.entries(eigene ?? {}).filter(([, f]) => typeof f === 'string' && HEX.test(f))))
  return 'farben' in p ? p.farben : {}
}
