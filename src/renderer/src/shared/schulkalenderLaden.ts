/**
 * Schulkalender in der Oberfläche (10.10.2026, shared/schulkalender.ts, src/server/schulkalender.ts): Auf dem Server
 * einmal je Sitzung laden und für alle Rechnungen setzen (Schuljahr, Vorschläge, Hinweise an Datumsfeldern, Stunden-
 * termine). Am PC und auf dem iPad gibt es keine Daten – dort gelten die alten Regeln (Schuljahr ab 1. August, nur das
 * Wochenende ist frei).
 */
import { useSyncExternalStore } from 'react'
import { schulkalender, setzeSchulkalender, type SchulkalenderDaten } from '@shared/schulkalender'
import { aufServer } from './plattform'

const hoerer = new Set<() => void>()
let geladen: Promise<SchulkalenderDaten | null> | null = null

export function ladeSchulkalender(neu = false): Promise<SchulkalenderDaten | null> {
  if (!aufServer()) return Promise.resolve(null)
  if (!geladen || neu)
    geladen = fetch('/server/schulkalender', { headers: { 'x-schulapps-token': 'server' } })
      .then((r) => (r.ok ? (r.json() as Promise<{ daten: SchulkalenderDaten | null }>) : { daten: null }))
      .then((d) => {
        setzeSchulkalender(d.daten ?? null)
        for (const h of hoerer) h()
        return d.daten ?? null
      })
      .catch(() => null)
  return geladen
}

/** Neu zeichnen, sobald der Kalender da ist */
export function useSchulkalender(): SchulkalenderDaten | null {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h)
      return () => void hoerer.delete(h)
    },
    schulkalender,
    schulkalender
  )
}
