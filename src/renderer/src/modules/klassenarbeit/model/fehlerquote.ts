/**
 * Fehlerquote der Übersetzung in Latein und Griechisch (29.09.2026, Wunsch der Lehrkraft:
 * „Übersetzung (Fehlerquote) + Begleitaufgaben (Punkte)").
 *
 * Grundlage (recherche/klassenarbeiten-faecher-neu-2026-09-29.md, Abschnitt 2):
 * - Fehlerquote = Fehlerzahl × 100 / Wortzahl des lateinischen bzw. griechischen Textes.
 * - Grenze für „ausreichend": höchstens 10 Fehler je 100 Wörter (EPA, NRW-Oberstufe, Berlin),
 *   in Niedersachsen 15 (Sek I und II). Sonst entscheidet die Fachkonferenz.
 * - Halbe, ganze und Doppelfehler; Folge- und Wiederholungsfehler werden nicht eigens gezählt.
 * Die Abstufung der übrigen Noten legt keine Vorschrift landesweit fest – hier linear bis zur
 * Grenze für „ausreichend" (vier gleiche Stufen), „mangelhaft" bis zum Anderthalbfachen.
 * Das ist ein RICHTWERT; der Schlüssel ist in der Arbeit änderbar.
 */

export interface Fehlerquote {
  /** Wortzahl des Übersetzungstextes */
  woerter: number
  /** Fehler je 100 Wörter, bis zu denen „ausreichend" gilt */
  grenzeAusreichend: number
}

/** Grenze für „ausreichend" nach Land (NI 15, sonst 10) */
export const grenzeFuerLand = (stateId: string): number => (stateId === 'NI' ? 15 : 10)

/** Wörter je 45 Minuten Übersetzungszeit als Richtwert (Lehrbuchphase NI 40–70, Lektüre 60 je Zeitstunde) */
export const woerterRichtwert = (grade: number, minuten: number, griechisch = false): number => {
  const jeStunde = grade <= 8 ? 70 : griechisch ? 65 : 60
  return Math.max(20, Math.round((jeStunde * minuten) / 60 / 5) * 5)
}

export interface FehlerStufe {
  note: number
  /** Höchstzahl der Fehler (ganze Fehler, halbe zählen 0,5) */
  bis: number
}

/** Fehlerschlüssel: Note 1–5 mit der jeweils höchsten Fehlerzahl; darüber Note 6 */
export function fehlerSchluessel(q: Fehlerquote): FehlerStufe[] {
  const g = (Math.max(1, q.grenzeAusreichend) * Math.max(1, q.woerter)) / 100
  // Auf halbe Fehler abrunden – die Grenze gilt „höchstens"
  const halb = (x: number): number => Math.floor(x * 2) / 2
  return [
    { note: 1, bis: halb(g / 4) },
    { note: 2, bis: halb(g / 2) },
    { note: 3, bis: halb((g * 3) / 4) },
    { note: 4, bis: halb(g) },
    { note: 5, bis: halb(g * 1.5) }
  ]
}

/** Einzeilige Fassung für Kopf und Erwartungshorizont: „1 bis 1,5 F. · 2 bis 3 F. · …" */
export function fehlerZeile(q: Fehlerquote): string {
  const zahl = (n: number): string => String(n).replace('.', ',')
  return `${fehlerSchluessel(q)
    .map((s) => `${s.note} bis ${zahl(s.bis)} F.`)
    .join(' · ')} · darüber 6 (${q.woerter} Wörter, „ausreichend" bis ${q.grenzeAusreichend} Fehler je 100 Wörter)`
}

/** Note zu einer Fehlerzahl */
export function noteFuerFehler(fehler: number, q: Fehlerquote): number {
  return fehlerSchluessel(q).find((s) => fehler <= s.bis)?.note ?? 6
}
