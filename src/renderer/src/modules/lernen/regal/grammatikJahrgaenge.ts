/**
 * Grammatik-Register nach Schuljahren (08.10.2026, abgestimmt mit der Lehrkraft): Gruppen je Jahrgang (vom Server,
 * shared/grammatikJahrgang.ts), das neueste Jahr oben, nur Jahre mit Inhalt; im Jahr nach Stelle im Lehrwerk (Unit),
 * dann Titel. Ohne bekannten Jahrgang ganz unten. Auf- und Zuklappen gilt je Sitzung (je Fach).
 */
import { offenLesen, offenMerken } from '../../../shared/sitzung'

export interface JahrgangsGruppe<T> {
  /** null = ohne bekannten Jahrgang */
  jahrgang: number | null
  eintraege: T[]
}

type MitJahrgang = { titel: string; jahrgang?: number | null; stelle?: number | null }

export function nachJahrgaengen<T extends MitJahrgang>(liste: T[]): JahrgangsGruppe<T>[] {
  const gruppen = new Map<number | null, T[]>()
  for (const x of liste) {
    const j = typeof x.jahrgang === 'number' ? x.jahrgang : null
    gruppen.set(j, [...(gruppen.get(j) ?? []), x])
  }
  const stelle = (x: T): number => (typeof x.stelle === 'number' ? x.stelle : Number.POSITIVE_INFINITY)
  return [...gruppen.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
    .map(([jahrgang, eintraege]) => ({
      jahrgang,
      eintraege: [...eintraege].sort((a, b) => stelle(a) - stelle(b) || a.titel.localeCompare(b.titel, 'de', { numeric: true }))
    }))
}

/** Offen? Gemerkt, sonst nur das neueste Jahr (erste Gruppe); beim Suchen alles offen */
export function istOffen(gruppen: JahrgangsGruppe<unknown>[], i: number, gemerkt: Record<string, boolean>, sucht: boolean): boolean {
  if (sucht) return true
  const k = String(gruppen[i]?.jahrgang ?? 'ohne')
  return k in gemerkt ? gemerkt[k] : i === 0
}

const SCHLUESSEL = (fach: string): string => `sa-ordner-jahrgaenge-${fach}`

/** Gemerkt für die Sitzung (shared/sitzung.ts, 09.10.2026): nach einer neuen Anmeldung wieder nur das neueste Jahr offen */
export function ladeOffen(fach: string): Record<string, boolean> {
  return offenLesen<Record<string, boolean>>(SCHLUESSEL(fach)) ?? {}
}
export function speichereOffen(fach: string, offen: Record<string, boolean>): void {
  offenMerken(SCHLUESSEL(fach), offen)
}
