/**
 * Fachfarben der Schule (09.10.2026, shared/schulFachfarben.ts).
 *
 *   GET  /server/fachfarben  – Farben der Schule (Lehrkräfte und Admins; Lernende bekommen ihre über /s/api/regal/farben)
 *   POST /server/fachfarben  – { farben: { fach: '#rrggbb' } } speichern (nur Admin, mit x-schulapps-token)
 *
 * Gespeichert in server_einstellungen unter 'fachfarben'. Ohne Eintrag gelten die Vorschläge des Katalogs. Einmalige
 * Übernahme beim Start bzw. beim ersten Lesen: Hat die Schule noch keine Farben, werden die eigenen Farben des ersten
 * Admins (aus seinen Einstellungen) zu den Farben der Schule.
 */
import { ersteSchulFachfarben, pruefeFachfarben } from '@shared/schulFachfarben'
import { eigeneFachfarben } from '../main/services/storage/settings'
import { alleNutzer, protokolliereServer, serverWert, setzeServerWert } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { imNutzer } from './kontext'

const SCHLUESSEL = 'fachfarben'

/** Farben der Schule; leer, solange nichts festgelegt ist (dann gelten die Vorschläge) */
export function leseSchulFachfarben(): Record<string, string> {
  const v = serverWert<Record<string, string> | null>(SCHLUESSEL, null)
  if (!v || typeof v !== 'object') return {}
  const p = pruefeFachfarben(v)
  return 'farben' in p ? p.farben : {}
}

export const schulFachfarbenFestgelegt = (): boolean => serverWert<unknown>(SCHLUESSEL, null) !== null

export function speichereSchulFachfarben(roh: unknown): { farben: Record<string, string> } | { fehler: string } {
  const p = pruefeFachfarben(roh)
  if ('fehler' in p) return p
  setzeServerWert(SCHLUESSEL, p.farben)
  return p
}

/**
 * Einmalige Übernahme: noch keine Farben der Schule → die eigenen Farben des ersten Admins (auch leer – dann gelten
 * die Vorschläge; danach wird nicht mehr übernommen). Ohne Admin bleibt es offen bis zum nächsten Versuch.
 */
export function uebernimmFachfarbenEinmal(): boolean {
  try {
    if (schulFachfarbenFestgelegt()) return false
    const admin = alleNutzer().find((n) => n.rolle === 'admin')
    if (!admin) return false
    const eigene = imNutzer(alsNutzer(admin), () => eigeneFachfarben())
    setzeServerWert(SCHLUESSEL, ersteSchulFachfarben(eigene))
    return true
  } catch {
    return false
  }
}

export async function fachfarbenRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (url.pathname !== '/server/fachfarben') return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  if (sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Kein Zugang.' }), true)
  if (req.method === 'GET') {
    uebernimmFachfarbenEinmal()
    return (json(res, 200, { farben: leseSchulFachfarben() }), true)
  }
  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  if (sitzung.nutzer.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
  const k0 = ((await k.koerper()) ?? {}) as Record<string, unknown>
  const r = speichereSchulFachfarben(k0.farben)
  if ('fehler' in r) return (json(res, 400, r), true)
  protokolliereServer('verwaltung', 'Fachfarben der Schule geändert', sitzung.nutzer.id)
  return (json(res, 200, r), true)
}
