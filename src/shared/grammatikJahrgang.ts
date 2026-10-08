/**
 * Jahrgang einer Grammatik-Freigabe (08.10.2026, abgestimmt mit der Lehrkraft): Im Ordner der Lernenden steht die
 * Grammatik nach Schuljahren („Year 6", „Year 5" …). Der Jahrgang kommt der Reihe nach aus
 *  1. dem Lehrwerk-Band der Grammatik (Angaben der Freigabe, z. B. „Green Line 1");
 *  2. dem Lehrwerk des Kurses (Band mit Jahrgang aus den Lehrwerksdaten, sonst die Bandnummer);
 *  3. der Klasse beim Freigeben (Angabe im Freigabe-Dialog, sonst Name der Lerngruppe);
 *  4. der heutigen Klasse der Person, zurückgerechnet auf das Schuljahr der Freigabe (Wechsel am 1. August).
 *
 * Faustregel Band → Jahrgang (es gibt keine Tabelle in den Lehrwerksdaten): Band 1 steht am Anfang der Fremdsprache in
 * der weiterführenden Schule – Englisch ab Klasse 5 (Green Line 1 = Klasse 5), zweite Fremdsprachen (Französisch,
 * Spanisch, Latein, Italienisch, Russisch) ab Klasse 6. Band n = Startklasse + n − 1.
 */

/** Klasse, in der Band 1 einer Sprache üblicherweise beginnt (Faustregel, Niedersachsen/G9) */
export const STARTKLASSE: Record<string, number> = { en: 5, fr: 6, es: 6, la: 6, it: 6, ru: 6 }

/** Nummer des Bandes aus seinem Namen bzw. seiner Bandangabe („Green Line 2" → 2, „Band 3" → 3) */
export function bandNummer(name: string | undefined | null): number | null {
  const m = /(\d{1,2})(?!.*\d)/.exec(String(name ?? ''))
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n >= 1 && n <= 9 ? n : null
}

/** Jahrgang aus einem Band nach der Faustregel (null ohne Bandnummer oder bei unbekannter Sprache) */
export function jahrgangAusBand(band: string | undefined | null, sprache: string): number | null {
  const n = bandNummer(band)
  const start = STARTKLASSE[sprache.trim().toLowerCase()]
  if (!n || !start) return null
  const j = start + n - 1
  return j >= 1 && j <= 13 ? j : null
}

/** Beginn-Jahr des Schuljahres zu einem Zeitpunkt (Wechsel am 1. August) */
export function schuljahrVon(ms: number): number {
  const d = new Date(ms)
  return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1
}

const gueltig = (j: number | null | undefined): j is number => typeof j === 'number' && Number.isFinite(j) && j >= 1 && j <= 13

/** Jahrgang aus den gesammelten Angaben – in der Reihenfolge oben */
export function jahrgangDerFreigabe(a: {
  sprache: string
  /** Band der Grammatikliste aus den Angaben der Freigabe („Green Line 1") */
  grammatikBand?: string
  /** Jahrgang des Kurs-Lehrwerks laut Lehrwerksdaten */
  buchJahrgang?: number | null
  /** Band bzw. Name des Kurs-Lehrwerks */
  buchBand?: string
  /** Klasse beim Freigeben (Freigabe-Dialog) */
  freigabeKlasse?: number | null
  /** Name der Lerngruppe („5b") */
  gruppenKlasse?: number | null
  /** Heutige Klasse der Person und die Zeiten für die Rückrechnung */
  heutigeKlasse?: number | null
  erstellt?: number
  jetzt?: number
}): number | null {
  const ausBand = jahrgangAusBand(a.grammatikBand, a.sprache)
  if (gueltig(ausBand)) return ausBand
  if (gueltig(a.buchJahrgang)) return a.buchJahrgang
  const ausBuch = jahrgangAusBand(a.buchBand, a.sprache)
  if (gueltig(ausBuch)) return ausBuch
  if (gueltig(a.freigabeKlasse)) return a.freigabeKlasse
  if (gueltig(a.gruppenKlasse)) return a.gruppenKlasse
  if (gueltig(a.heutigeKlasse)) {
    const zurueck = a.erstellt ? Math.max(0, schuljahrVon(a.jetzt ?? Date.now()) - schuljahrVon(a.erstellt)) : 0
    const j = a.heutigeKlasse - zurueck
    return gueltig(j) ? j : null
  }
  return null
}

/** Stelle im Lehrwerk für die Reihenfolge innerhalb eines Jahrgangs („Unit 3" → 3, „Welcome back" → 0) */
export function unitStelle(unit: string | undefined | null, reihenfolge?: string[]): number | null {
  if (!unit) return null
  const i = reihenfolge?.indexOf(unit) ?? -1
  if (i >= 0) return i
  const m = /(\d{1,2})/.exec(unit)
  return m ? Number(m[1]) : /welcome|start|intro/i.test(unit) ? 0 : null
}
