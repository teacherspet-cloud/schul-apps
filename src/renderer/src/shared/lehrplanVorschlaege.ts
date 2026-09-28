/**
 * Themenvorschläge aus dem Lehrplan für ein Eingabefeld „Thema" (Großprogramm 0.4).
 *
 * Bis dahin schlug die Klassenarbeit nur in Geschichte Themen vor (eine von Hand erfasste Liste
 * für wenige Länder). Jetzt kommen die Vorschläge für jedes Fach aus dem Themenkatalog: aus der
 * Lehrplandatei des Landes (resources/lehrplaene/<LAND>.json), wo es eine gibt, sonst aus den
 * mitgebrachten Themen. Gefiltert nach Schulform und Jahrgang, gruppiert nach Oberthema.
 */
import { useEffect, useState } from 'react'
import type { LehrplanDatei } from '@shared/lehrplan'
import { katalogFuer, ladeLehrplan } from './themenKatalog'

export interface VorschlagsGruppe {
  group: string
  items: string[]
}

/** Gruppen „Oberthema → Themen" für ein Autocomplete; leer, wenn nichts passt */
export function lehrplanVorschlaege(
  lehrplan: LehrplanDatei | null,
  fach: string,
  schulform: string | undefined,
  land: string,
  jahrgang: number
): VorschlagsGruppe[] {
  const themen = katalogFuer(fach, lehrplan, schulform, land).filter(
    (t) => t.quelle === 'lehrplan' && (!t.jahrgaenge?.length || t.jahrgaenge.includes(jahrgang))
  )
  const gruppen = new Map<string, Set<string>>()
  for (const t of themen) {
    const gruppe = t.pfad?.[0] ?? t.name
    const set = gruppen.get(gruppe) ?? new Set<string>()
    set.add(t.name)
    gruppen.set(gruppe, set)
  }
  // Ein Eintrag darf in einem Autocomplete nur einmal vorkommen – über alle Gruppen hinweg
  const gesehen = new Set<string>()
  const out: VorschlagsGruppe[] = []
  for (const [group, set] of gruppen) {
    const items = [...set].filter((x) => !gesehen.has(x))
    items.forEach((x) => gesehen.add(x))
    if (items.length) out.push({ group, items })
  }
  return out
}

/** Dasselbe als Hook: lädt die Lehrplandatei des Landes einmal und rechnet bei jeder Änderung neu */
export function useLehrplanVorschlaege(
  land: string,
  schulform: string | undefined,
  fach: string,
  jahrgang: number
): { gruppen: VorschlagsGruppe[]; ausDatei: boolean } {
  const [lehrplan, setLehrplan] = useState<LehrplanDatei | null>(null)
  useEffect(() => {
    let aktiv = true
    void ladeLehrplan(land).then((lp) => aktiv && setLehrplan(lp))
    return () => {
      aktiv = false
    }
  }, [land])
  const passend = lehrplan && lehrplan.stateId === land ? lehrplan : null
  return {
    gruppen: lehrplanVorschlaege(passend, fach, schulform, land, jahrgang),
    ausDatei: Boolean(passend?.eintraege.some((e) => e.fach === fach))
  }
}
