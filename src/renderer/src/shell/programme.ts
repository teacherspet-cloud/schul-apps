import { useMemo } from 'react'
import { siehtLehrwerkPflege } from '@shared/fachobleute'
import { modules, type SchulModule } from '../modules/registry'
import { useAppSettings } from '../shared/settingsStore'
import { sichtbareProgramme } from '../shared/programmSichtbarkeit'
import { appFreigegeben, serverIch } from '../shared/plattform'

/**
 * Die sichtbaren Programme in der Reihenfolge der Leiste (Paket 12) – für Leiste, Startseite,
 * Strg+1 … Strg+8 und „Neu in diesem Bereich". Alle Programme bleiben trotzdem geladen
 * (App.tsx): Ein Material eines ausgeblendeten Programms öffnet sich aus „Zuletzt bearbeitet"
 * oder der Suche weiterhin.
 */
export function useSichtbareProgramme(): SchulModule[] {
  const eigene = useAppSettings((s) => s.settings.eigeneFaecher)
  const anzeigen = useAppSettings((s) => s.settings.programmeAnzeigen)
  // Admins sehen immer alles (10.10.2026) – die Rolle steht beim Laden fest
  const admin = serverIch()?.rolle === 'admin'
  // Vokabellisten nur für Fachobleute eines Fachs mit Lehrwerken (13.10.2026: Fachobleute gibt es jetzt für alle Fächer)
  const fachobmann = siehtLehrwerkPflege('lehrkraft', serverIch()?.fachobmann)
  // App-Freigaben (23.10.2026): nicht freigegebene Apps erscheinen nirgends – steht beim Laden fest wie die Rolle
  return useMemo(
    () => sichtbareProgramme(modules.filter((m) => appFreigegeben(m.id)), eigene, anzeigen, { admin, fachobmann }),
    [eigene, anzeigen, admin, fachobmann]
  )
}
