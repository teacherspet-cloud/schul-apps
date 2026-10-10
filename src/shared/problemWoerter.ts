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
 * Ein Wort ist ein Problemwort, wenn
 *  1. über alle Lernenden des Kurses mindestens 3 Abfragen vorliegen und mindestens eine davon falsch war, und
 *  2. es bei mindestens einem Kind noch aktuell wackelt: Fach 1–2, mit Fehlern, in den letzten 14 Tagen geübt.
 *     (Wer das Wort inzwischen gefestigt hat oder seit zwei Wochen nicht mehr geübt hat, macht es nicht mehr zum Problem.)
 * Von der Lehrkraft „aus der Liste genommene" Wörter zählen nicht, bis neue Fehler dazukommen.
 * Reihenfolge: bei den meisten Kindern aktuell wackelig → am häufigsten falsch → höchste Fehlerquote.
 * Die Zahl ist immer die ganze Liste; wo nur ein Teil gezeigt wird, steht „20 von N".
 */
import type { Vokabel, WortStand } from './vokabeltrainer'

const TAG = 86_400_000
/** Mindestzahl Abfragen über alle Lernenden */
export const PROBLEM_MIN_VERSUCHE = 3
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
  jetzt = Date.now()
): ProblemWort[] {
  const liste: ProblemWort[] = []
  for (const v of woerter) {
    let versuche = 0
    let falsch = 0
    let betroffen = 0
    const texte = new Map<string, number>()
    for (const st of staende) {
      const s = st[v.id]
      if (!s) continue
      versuche += s.versuche
      falsch += s.falsch
      if (wackeltAktuell(s, jetzt)) betroffen++
      for (const t of s.fehlerTexte ?? []) texte.set(t, (texte.get(t) ?? 0) + 1)
    }
    if (versuche < PROBLEM_MIN_VERSUCHE || falsch <= 0 || betroffen <= 0) continue
    liste.push({
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
  liste.sort((a, b) => b.betroffen - a.betroffen || b.falsch - a.falsch || b.quote - a.quote)
  return ausgeblendetFiltern(liste, ausgeblendet).sichtbar
}

/** Einheitliche Beschriftung: „1 Problemwort", „12 Problemwörter"; gekürzte Liste „20 von 34 Problemwörtern" */
export function problemWoerterText(n: number, gezeigt?: number): string {
  if (gezeigt !== undefined && gezeigt < n) return `${gezeigt} von ${n} Problemwörtern`
  return `${n} ${n === 1 ? 'Problemwort' : 'Problemwörter'}`
}
