/**
 * Problemwörter eines Vokabelkurses (10.10.2026) – EINE Definition für alle Stellen der Lehrkraft: „Auf einen Blick"
 * in „Meine Klassen" (FachKopf), Kursseite („Problemwörter der Lerngruppe", ⚠ und „Nur Problemwörter" in
 * „Abschnitte & Wörter", schwierigste Wörter je Abschnitt), Handlungsbedarf/Vorschlag (früher „Wackelige Wörter")
 * und das Abzeichen „n Problemwörter" der Startseite.
 *
 * Vorher rechneten vier Stellen verschieden (Lehrkraft: oben „5 Problemwörter", unten 12): oben die ersten 5 einer
 * Liste, auf der Kursseite die ersten 12 ohne von der Lehrkraft Ausgeblendete, im Handlungsbedarf/auf der Startseite
 * „wackelig" mit eigener Regel (Fach 1–2, kürzlich, höchstens 20 über alle Kurse). „Wackelig" und „Problemwort"
 * meinten dasselbe – jetzt ein Begriff („Problemwörter") und eine Zahl.
 *
 * Neue Regel (12.10.2026, abgestimmt mit der Lehrkraft – die alte Regel „ein wackelndes Kind genügt" machte die Listen
 * zu lang): Ein Wort ist ein Problemwort, wenn
 *  1. es bei genügend Kindern aktuell wackelt (Fach 1–2, mit Fehlern, in den letzten 14 Tagen geübt): mindestens
 *     `minKinder` – in kleinen Kursen genügt der Anteil `anteil` der Kinder, die das Wort geübt haben – UND
 *  2. die Fehlerquote des Kurses bei diesem Wort mindestens `minQuote` beträgt, bei mindestens `minVersuche` Abfragen.
 * Die Schwellen hängen an der „Empfindlichkeit" (Stufe 1–5): Standard je Lehrkraft (Einstellungen), je Kurs im Pop-up
 * änderbar. Stufe 3 ist die abgestimmte Grundeinstellung (2 Kinder bzw. 20 %, Quote 30 %, 6 Abfragen); Stufe 5 entspricht
 * etwa der früheren Regel. Die Zwischenstufen sind Faustregeln.
 * Von der Lehrkraft „aus der Liste genommene" Wörter zählen nicht, bis neue Fehler dazukommen.
 * Reihenfolge: bei den meisten Kindern aktuell wackelig → am häufigsten falsch → höchste Fehlerquote.
 * Die Zahl ist immer die ganze Liste; wo nur ein Teil gezeigt wird, steht „20 von N".
 */
import type { Vokabel, WortStand } from './vokabeltrainer'

const TAG = 86_400_000
/** Mindestzahl Abfragen über alle Lernenden in der lockersten Stufe (frühere feste Regel) */
export const PROBLEM_MIN_VERSUCHE = 3

/** Empfindlichkeit 1 („nur deutliche Probleme") … 5 („schon kleine Unsicherheiten") */
export type ProblemStufe = 1 | 2 | 3 | 4 | 5
export const PROBLEM_STUFE_STANDARD: ProblemStufe = 3
export const PROBLEM_STUFEN: ProblemStufe[] = [1, 2, 3, 4, 5]
export interface ProblemSchwellen {
  minKinder: number
  /** Anteil der übenden Kinder, der in kleinen Kursen genügt */
  anteil: number
  minQuote: number
  minVersuche: number
}
export const PROBLEM_SCHWELLEN: Record<ProblemStufe, ProblemSchwellen> = {
  1: { minKinder: 4, anteil: 0.35, minQuote: 0.45, minVersuche: 10 },
  2: { minKinder: 3, anteil: 0.25, minQuote: 0.375, minVersuche: 8 },
  3: { minKinder: 2, anteil: 0.2, minQuote: 0.3, minVersuche: 6 },
  4: { minKinder: 2, anteil: 0.1, minQuote: 0.2, minVersuche: 4 },
  5: { minKinder: 1, anteil: 0, minQuote: 0, minVersuche: PROBLEM_MIN_VERSUCHE }
}
export const PROBLEM_STUFE_NAME: Record<ProblemStufe, string> = {
  1: 'nur deutliche Probleme',
  2: 'eher deutliche Probleme',
  3: 'ausgewogen (Standard)',
  4: 'auch leichtere Unsicherheiten',
  5: 'schon kleine Unsicherheiten'
}
/** Gültige Stufe aus beliebigem Wert (sonst `ersatz`) */
export const problemStufe = (x: unknown, ersatz: ProblemStufe = PROBLEM_STUFE_STANDARD): ProblemStufe =>
  PROBLEM_STUFEN.includes(Number(x) as ProblemStufe) ? (Number(x) as ProblemStufe) : ersatz
/** Wie viele aktuell wackelnde Kinder nötig sind, wenn `uebende` Kinder das Wort geübt haben */
export function noetigeKinder(sw: ProblemSchwellen, uebende: number): number {
  return Math.max(1, Math.min(sw.minKinder, Math.ceil(sw.anteil * uebende) || 1))
}
/** „Aktuell": in so vielen Tagen zuletzt geübt */
export const PROBLEM_AKTUELL_TAGE = 14

export interface ProblemWort {
  id: string
  term: string
  translation: string
  example?: string
  versuche: number
  falsch: number
  quote: number
  /** Lernende, bei denen das Wort gerade wackelt */
  betroffen: number
  /** Häufigste Falschantworten (höchstens 3) */
  typisch: string[]
}

/** Wackelt das Wort bei dieser Person gerade? (Fach 1–2, Fehler, in den letzten 14 Tagen geübt) */
export function wackeltAktuell(w: WortStand | undefined, jetzt = Date.now()): boolean {
  return Boolean(w && w.fach >= 1 && w.fach <= 2 && w.falsch > 0 && jetzt - (w.zuletzt || 0) < PROBLEM_AKTUELL_TAGE * TAG)
}

/**
 * „Aus der Liste nehmen" (08.10.2026): ein Eintrag bleibt verborgen, solange seine Fehlerzahl nicht über die beim
 * Entfernen gemerkte steigt. Gibt die sichtbaren Einträge und die noch gültige Merkliste zurück.
 */
export function ausgeblendetFiltern<T extends { id: string; falsch: number }>(
  liste: T[],
  gemerkt: Record<string, number>
): { sichtbar: T[]; gueltig: Record<string, number> } {
  const gueltig: Record<string, number> = {}
  const sichtbar: T[] = []
  for (const p of liste) {
    const n = gemerkt[p.id]
    if (typeof n === 'number' && p.falsch <= n) gueltig[p.id] = n
    else sichtbar.push(p)
  }
  return { sichtbar, gueltig }
}

/** Alle Problemwörter (ohne Ausgeblendete, ohne Grenze), wichtigste zuerst – Kandidaten ohne Ausblenden: `ausgeblendet = {}` */
export function problemWoerter(
  woerter: (Pick<Vokabel, 'id' | 'term' | 'translation'> & { example?: string })[],
  staende: Record<string, WortStand>[],
  ausgeblendet: Record<string, number> = {},
  jetzt = Date.now(),
  stufe: ProblemStufe = PROBLEM_STUFE_STANDARD
): ProblemWort[] {
  return problemWoerterJeStufe(woerter, staende, ausgeblendet, jetzt)[stufe]
}

/**
 * Problemwörter für alle fünf Stufen auf einmal (12.10.2026): Der Regler im Pop-up zeigt beim Schieben sofort, wie viele
 * Wörter jede Stufe ergäbe – ohne neue Anfrage. Die Stufen sind geschachtelt (lockerere enthalten die strengeren).
 */
export function problemWoerterJeStufe(
  woerter: (Pick<Vokabel, 'id' | 'term' | 'translation'> & { example?: string })[],
  staende: Record<string, WortStand>[],
  ausgeblendet: Record<string, number> = {},
  jetzt = Date.now()
): Record<ProblemStufe, ProblemWort[]> {
  const kandidaten: (ProblemWort & { uebende: number })[] = []
  for (const v of woerter) {
    let versuche = 0
    let falsch = 0
    let betroffen = 0
    let uebende = 0
    const texte = new Map<string, number>()
    for (const st of staende) {
      const s = st[v.id]
      if (!s) continue
      if (s.versuche > 0) uebende++
      versuche += s.versuche
      falsch += s.falsch
      if (wackeltAktuell(s, jetzt)) betroffen++
      for (const t of s.fehlerTexte ?? []) texte.set(t, (texte.get(t) ?? 0) + 1)
    }
    if (versuche < PROBLEM_MIN_VERSUCHE || falsch <= 0 || betroffen <= 0) continue
    kandidaten.push({
      uebende,
      id: v.id,
      term: v.term,
      translation: v.translation,
      ...(v.example ? { example: v.example } : {}),
      versuche,
      falsch,
      quote: falsch / versuche,
      betroffen,
      typisch: [...texte.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t)
    })
  }
  kandidaten.sort((a, b) => b.betroffen - a.betroffen || b.falsch - a.falsch || b.quote - a.quote)
  const sichtbar = ausgeblendetFiltern(kandidaten, ausgeblendet).sichtbar
  const aus = {} as Record<ProblemStufe, ProblemWort[]>
  for (const st of PROBLEM_STUFEN) {
    const sw = PROBLEM_SCHWELLEN[st]
    aus[st] = sichtbar
      .filter((p) => p.versuche >= sw.minVersuche && p.quote >= sw.minQuote && p.betroffen >= noetigeKinder(sw, p.uebende))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ uebende, ...p }) => p)
  }
  return aus
}

/** Einheitliche Beschriftung: „1 Problemwort", „12 Problemwörter"; gekürzte Liste „20 von 34 Problemwörtern" */
export function problemWoerterText(n: number, gezeigt?: number): string {
  if (gezeigt !== undefined && gezeigt < n) return `${gezeigt} von ${n} Problemwörtern`
  return `${n} ${n === 1 ? 'Problemwort' : 'Problemwörter'}`
}
