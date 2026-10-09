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

/** Angaben der Schule (einmal je Sitzung geladen; `neu` lädt erneut, etwa nach dem Speichern in der Verwaltung) */
export function ladeServerSchule(neu = false): Promise<ServerSchule | null> {
  if (!aufServer()) return Promise.resolve(null)
  if (!geladen || neu)
    geladen = fetch('/server/schule', { headers: { 'x-schulapps-token': 'server' } })
      .then((r) => (r.ok ? (r.json() as Promise<ServerSchule>) : null))
      .catch(() => null)
  return geladen
}
