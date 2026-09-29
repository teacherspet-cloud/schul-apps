/**
 * Lokale Ablagen der Rückmeldung (29.09.2026): gemerkte Nachteilsausgleiche je Person und
 * Vorlagen für Bewertungstabellen. Beides bleibt auf diesem Rechner (main/services/storage/
 * dokumente.ts) und reist nicht im Schulpaket mit.
 */
import { newId } from '../vokabeltest/model/random'
import { GEDAECHTNIS_ID, type AusgleichGedaechtnis } from './nachteilsausgleich'
import type { Bewertungstabelle } from './model/types'

export async function ladeGedaechtnis(): Promise<AusgleichGedaechtnis> {
  try {
    const d = await window.api.nachteilsausgleiche.get(GEDAECHTNIS_ID)
    const p = d.payload as AusgleichGedaechtnis | undefined
    return p?.eintraege ? p : { eintraege: {} }
  } catch {
    // Noch nichts gemerkt
    return { eintraege: {} }
  }
}

export async function speichereGedaechtnis(g: AusgleichGedaechtnis): Promise<void> {
  await window.api.nachteilsausgleiche.save({
    id: GEDAECHTNIS_ID,
    name: 'Gemerkte Nachteilsausgleiche',
    stats: { personen: Object.keys(g.eintraege).length },
    payload: g
  })
}

export interface TabellenVorlage {
  id: string
  name: string
  kriterien: number
  updatedAt: string
}

export async function tabellenVorlagen(): Promise<TabellenVorlage[]> {
  const liste = await window.api.bewertungstabellen.list().catch(() => [])
  return liste.map((m) => ({ id: m.id, name: m.name, kriterien: Number(m.kriterien ?? 0), updatedAt: m.updatedAt }))
}

export async function ladeTabellenVorlage(id: string): Promise<Bewertungstabelle> {
  const d = await window.api.bewertungstabellen.get(id)
  return { ...(d.payload as Bewertungstabelle), vorlageId: id, entwurf: false }
}

/** Legt die Tabelle als Vorlage ab (überschreibt die eigene Vorlage, falls sie daher stammt) */
export async function speichereTabellenVorlage(t: Bewertungstabelle, name: string): Promise<string> {
  const id = t.vorlageId ?? newId()
  const { vorlageId: _v, entwurf: _e, ...rest } = t
  void _v
  void _e
  await window.api.bewertungstabellen.save({ id, name: name.trim() || t.titel, stats: { kriterien: t.kriterien.length }, payload: rest })
  return id
}

export async function loescheTabellenVorlage(id: string): Promise<void> {
  await window.api.bewertungstabellen.delete(id)
}
