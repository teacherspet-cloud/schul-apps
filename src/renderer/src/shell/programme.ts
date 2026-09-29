import { useMemo } from 'react'
import { modules, type SchulModule } from '../modules/registry'
import { useAppSettings } from '../shared/settingsStore'
import { sichtbareProgramme } from '../shared/programmSichtbarkeit'

/**
 * Die sichtbaren Programme in der Reihenfolge der Leiste (Paket 12) – für Leiste, Startseite,
 * Strg+1 … Strg+8 und „Neu in diesem Bereich". Alle Programme bleiben trotzdem geladen
 * (App.tsx): Ein Material eines ausgeblendeten Programms öffnet sich aus „Zuletzt bearbeitet"
 * oder der Suche weiterhin.
 */
export function useSichtbareProgramme(): SchulModule[] {
  const eigene = useAppSettings((s) => s.settings.eigeneFaecher)
  const anzeigen = useAppSettings((s) => s.settings.programmeAnzeigen)
  return useMemo(() => sichtbareProgramme(modules, eigene, anzeigen), [eigene, anzeigen])
}
