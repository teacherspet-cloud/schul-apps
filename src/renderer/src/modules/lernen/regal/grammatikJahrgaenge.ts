/**
 * Grammatik-Register nach Schuljahren (08.10.2026, abgestimmt mit der Lehrkraft): Gruppen je Jahrgang (vom Server,
 * shared/grammatikJahrgang.ts), das neueste Jahr oben, nur Jahre mit Inhalt; im Jahr nach Stelle im Lehrwerk (Unit),
 * dann Titel. Ohne bekannten Jahrgang ganz unten. Auf- und Zuklappen gilt je Sitzung (je Fach).
 */
import { offenLesen, offenMerken } from '../../../shared/sitzung'
import { grammatikNachLehrwerk } from '../kurs/kursAnsicht'

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

export interface UnitGruppe<T> {
  /** Schlüssel für „offen/zu" (je Jahr eindeutig) */
  schluessel: string
  /** Überschrift („Unit 2"; mit Band, wenn das Jahr mehrere Bände hat) */
  name: string
  /** Stationen, die neueste oben; station '' = in der Unit ohne bekannte Station */
  stationen: { station: string; eintraege: T[] }[]
  anzahl: number
}

type MitStelle = MitJahrgang & { buch?: string; unit?: string; station?: string; extra?: boolean }

/**
 * Im Jahr nach Lehrwerk (17.10.2026, abgestimmt mit der Lehrkraft): Unit › Station wie auf der Kursseite der Lehrkraft
 * (kurs/kursAnsicht.ts `grammatikNachLehrwerk`) – Späteres oben (Unit 2 über Unit 1, Station 3 über Station 1). „Extra
 * für dich" bleibt ganz oben; was keiner Unit zugeordnet ist, steht unten unter „Weitere".
 */
export function nachUnits<T extends MitStelle>(
  eintraege: T[],
  unitFolge: (buch: string) => string[]
): { extras: T[]; units: UnitGruppe<T>[]; weitere: T[] } {
  const extras = eintraege.filter((x) => x.extra)
  const { baende, ohne } = grammatikNachLehrwerk(
    eintraege.filter((x) => !x.extra),
    (x) => (x.buch ? { buch: x.buch, unit: x.unit, station: x.station } : null),
    () => 0,
    [],
    unitFolge
  )
  const mehrere = baende.length > 1
  const weitere = [...ohne]
  const units: UnitGruppe<T>[] = []
  for (const b of baende)
    for (const u of b.units) {
      if (!u.unit) {
        weitere.push(...u.stationen.flatMap((s) => s.eintraege))
        continue
      }
      units.push({ schluessel: u.schluessel, name: mehrere ? `${b.buch} · ${u.unit}` : u.unit, stationen: u.stationen, anzahl: u.anzahl })
    }
  return { extras, units, weitere }
}

/** Unit bzw. Station offen? Gemerkt, sonst die oberste (Index 0); beim Suchen alles offen */
export function teilOffen(schluessel: string, index: number, gemerkt: Record<string, boolean>, sucht: boolean): boolean {
  if (sucht) return true
  return schluessel in gemerkt ? gemerkt[schluessel] : index === 0
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
