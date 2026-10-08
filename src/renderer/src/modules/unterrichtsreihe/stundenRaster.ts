/**
 * Stundenraster bearbeiten (08.10.2026): Stunden hinzufügen, verschieben und entfernen, ohne dass die
 * Zuordnung der Schritte (`Schritt.stunde`, 0-basierter Index in `Reihe.stunden`) verrutscht. Wird vom
 * Editor und vom Fenster „Mit KI planen" gemeinsam genutzt – beide ändern denselben Stand der Reihe.
 */
import type { Reihe, StundenArt } from '@shared/reihe'

/** Mit Stundenverläufen (Planungsreihe, 08.10.2026): `verlauf` wandert mit seiner Stunde mit */
export type StundenPatch = Pick<Reihe, 'stunden' | 'schritte'> & Pick<Partial<Reihe>, 'verlauf'>
type MitStunden = Pick<Reihe, 'stunden' | 'schritte'> & Pick<Partial<Reihe>, 'verlauf'>

/** Verläufe neu zuordnen: `neu(alterIndex)` = neuer Index bzw. null (Stunde entfällt) */
function verlaufUmziehen(r: MitStunden, neu: (alt: number) => number | null): Pick<Partial<Reihe>, 'verlauf'> {
  if (!r.verlauf) return {}
  const aus: NonNullable<Reihe['verlauf']> = {}
  for (const [k, v] of Object.entries(r.verlauf)) {
    const n = neu(Number(k))
    if (n !== null) aus[String(n)] = v
  }
  return { verlauf: aus }
}

/** Schritte, die in Stunde `i` liegen */
export const schritteInStunde = (r: Pick<Reihe, 'schritte'>, i: number): number => r.schritte.filter((s) => s.stunde === i).length

/** Stunde der Art `art` hinten anhängen */
export const stundeAnhaengen = (r: MitStunden, art: StundenArt): StundenPatch => ({
  stunden: [...(r.stunden ?? []), art],
  schritte: r.schritte
})

/** Stunde `von` an die Stelle `nach` verschieben; die Schritte wandern mit ihrer Stunde mit */
export const stundeVerschieben = (r: MitStunden, von: number, nach: number): StundenPatch => {
  const alt = r.stunden ?? []
  if (von === nach || von < 0 || von >= alt.length || nach < 0 || nach >= alt.length) return { stunden: alt, schritte: r.schritte }
  // Reihenfolge der alten Indizes nach dem Verschieben
  const ordnung = alt.map((_, k) => k)
  const [weg] = ordnung.splice(von, 1)
  ordnung.splice(nach, 0, weg)
  const neuIndex = new Map(ordnung.map((altK, neuK) => [altK, neuK]))
  return {
    stunden: ordnung.map((k) => alt[k]),
    schritte: r.schritte.map((s) => (s.stunde !== undefined && neuIndex.has(s.stunde) ? { ...s, stunde: neuIndex.get(s.stunde) } : s)),
    ...verlaufUmziehen(r, (k) => neuIndex.get(k) ?? null)
  }
}

/** Stunde `i` entfernen; ihre Schritte verlieren die Stundenangabe, spätere rücken eine Stunde vor */
export const stundeEntfernen = (r: MitStunden, i: number): StundenPatch => ({
  stunden: (r.stunden ?? []).filter((_, k) => k !== i),
  schritte: r.schritte.map((s) => {
    if (s.stunde === undefined || s.stunde < i) return s
    if (s.stunde === i) return { ...s, stunde: undefined }
    return { ...s, stunde: s.stunde - 1 }
  }),
  ...verlaufUmziehen(r, (k) => (k === i ? null : k > i ? k - 1 : k))
})
