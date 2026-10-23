/**
 * Schul-Einrichtung des Servers in der Oberfläche (09.10.2026, shared/schulEinrichtung.ts, src/server/schule.ts).
 * Nur auf dem Server; am PC und auf dem iPad gibt es keine (null).
 */
import type { SchulEinrichtung } from '@shared/schulEinrichtung'
import { aufServer } from './plattform'

export interface ServerSchule {
  schule: SchulEinrichtung | null
  logo: string | null
}

let geladen: Promise<ServerSchule | null> | null = null

/** Kurzer Fingerabdruck eines Logos (data:-URL) – um zu erkennen, ob die Schule es geändert hat; '' = kein Logo */
export function logoFingerabdruck(logo: string | null | undefined): string {
  if (!logo) return ''
  let h = 5381
  for (let i = 0; i < logo.length; i++) h = ((h << 5) + h + logo.charCodeAt(i)) | 0
  return `${logo.length.toString(36)}-${(h >>> 0).toString(36)}`
}

/** Angaben der Schule (einmal je Sitzung geladen; `neu` lädt erneut, etwa nach dem Speichern in der Verwaltung) */
export function ladeServerSchule(neu = false): Promise<ServerSchule | null> {
  if (!aufServer()) return Promise.resolve(null)
  if (!geladen || neu)
    geladen = fetch('/server/schule', { headers: { 'x-schulapps-token': 'server' } })
      .then((r) => (r.ok ? (r.json() as Promise<ServerSchule>) : null))
      .catch(() => null)
  return geladen
}
