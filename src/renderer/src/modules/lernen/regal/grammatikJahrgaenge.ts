/**
 * Grammatik-Register nach Schuljahren (08.10.2026, abgestimmt mit der Lehrkraft): Gruppen je Jahrgang (vom Server,
 * shared/grammatikJahrgang.ts), das neueste Jahr oben, nur Jahre mit Inhalt; im Jahr nach Stelle im Lehrwerk (Unit),
 * dann Titel. Ohne bekannten Jahrgang ganz unten. Auf- und Zuklappen merkt sich das Gerät (je Fach).
 */

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

export function ladeOffen(fach: string): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SCHLUESSEL(fach)) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}
export function speichereOffen(fach: string, offen: Record<string, boolean>): void {
  try {
    localStorage.setItem(SCHLUESSEL(fach), JSON.stringify(offen))
  } catch {
    /* privat oder voll: dann nur bis zum Neuladen */
  }
}
