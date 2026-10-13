/**
 * Vorgaben der Fächer am Server (13.10.2026, abgestimmt; Regeln in shared/fachvorgaben.ts).
 *
 *   GET  /server/fachvorgaben            → { vorgaben: { fach: FachVorgaben }, darf: [fach] }  (alle Lehrkräfte)
 *   POST /server/fachvorgaben {fach, vorgaben}  ganze Vorgaben eines Fachs ersetzen – Admin oder Fachobleute des Fachs
 *
 * Gespeichert in server_einstellungen unter 'fachvorgaben'. Die Vorgaben sind Standards: Wer persönlich etwas anderes
 * eingestellt hat, behält es (Notenschlüssel, Problemwort-Stufe, Erinnerungen je Kurs).
 */
import { alleVorgabenBereinigt, darfFachVorgaben, vorgabenBereinigt, type AlleFachVorgaben, type FachVorgaben } from '../shared/fachvorgaben'
import { FAECHER, fachVon } from '../shared/faecher'
import { protokolliereServer, serverWert, setzeServerWert } from './datenbank'
import { fachobmannFaecher } from './fachobleute'
import { json, type Anfrage } from './http'

const SCHLUESSEL = 'fachvorgaben'

let merk: { v: AlleFachVorgaben; zeit: number } | null = null

/** Alle Vorgaben (kurz zwischengespeichert – viele Stellen fragen je Anfrage) */
export function alleFachVorgaben(): AlleFachVorgaben {
  if (merk && Date.now() - merk.zeit < 5_000) return merk.v
  const v = alleVorgabenBereinigt(serverWert<unknown>(SCHLUESSEL, {}))
  merk = { v, zeit: Date.now() }
  return v
}

/** Vorgaben eines Fachs (Kennung oder Name, „Englisch" → englisch) */
export const fachVorgaben = (fach: string | null | undefined): FachVorgaben | undefined => {
  if (!fach) return undefined
  const id = fachVon(fach)?.id ?? FAECHER.find((f) => f.label.toLowerCase() === fach.trim().toLowerCase())?.id
  return id ? alleFachVorgaben()[id] : undefined
}

export function setzeFachVorgaben(fach: string, roh: unknown, von: string): FachVorgaben {
  const alle = { ...alleFachVorgaben() }
  const v = { ...vorgabenBereinigt(roh), geaendert: { von, am: new Date().toISOString() } }
  alle[fach] = v
  setzeServerWert(SCHLUESSEL, alle)
  merk = null
  return v
}

export function fachvorgabenRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (url.pathname !== '/server/fachvorgaben') return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer
    if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const obmann = fachobmannFaecher(ich.id)
    if (req.method === 'GET') {
      const darf = ich.rolle === 'admin' ? FAECHER.map((f) => f.id) : obmann
      return json(res, 200, { vorgaben: alleFachVorgaben(), darf }), true
    }
    if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
    if (typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    const k0 = ((await k.koerper()) ?? {}) as Record<string, unknown>
    const fach = String(k0.fach ?? '')
    if (!fachVon(fach)) return json(res, 400, { fehler: 'Unbekanntes Fach.' }), true
    if (!darfFachVorgaben(ich.rolle, obmann, fach)) return json(res, 403, { fehler: 'Nur Admins und die Fachobleute des Fachs.' }), true
    const v = setzeFachVorgaben(fach, k0.vorgaben, ich.name || ich.benutzer)
    protokolliereServer('verwaltung', `Vorgaben des Fachs ${fachVon(fach)?.label ?? fach} geändert`, ich.id)
    return json(res, 200, { vorgaben: v }), true
  }
}

/**
 * Erinnerungen in einem Kurs angeboten? Eigene Wahl der Lehrkraft ('an'/'aus'), sonst die Vorgabe des Fachs, sonst an
 * (Vorgabe seit 10.10.2026).
 */
export const erinnerungenAngeboten = (z: { erinnerungen?: string | null; fach?: string | null }): boolean =>
  z.erinnerungen === 'an' || (z.erinnerungen !== 'aus' && fachVorgaben(z.fach)?.erinnerungen !== 'aus')
