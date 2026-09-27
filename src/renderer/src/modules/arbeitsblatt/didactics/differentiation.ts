/**
 * Binnendifferenzierung (Fundamentum/Additum, gestufte Lernhilfen nach Leisen/Stäudel,
 * Sächsischer Leitfaden Binnendifferenzierung).
 */

export type Stars = 1 | 2 | 3

export const STAR_LABELS: Record<Stars, string> = { 1: '★', 2: '★★', 3: '★★★' }

export const DIFFERENTIATION_PRINCIPLES = [
  'Alle Niveaustufen haben dasselbe Lernziel, dasselbe Thema, dasselbe Material und dasselbe Layout; die Kernaufgabe ist in allen Stufen enthalten.',
  'Unterscheide die Stufen in mindestens zwei Dimensionen (Hilfen, Offenheit, Komplexität, Abstraktion, Textmenge), nicht nur in der Menge.',
  'Gleiches Material heißt nicht gleicher Wortlaut: Umfang, Zahl der Merkmale und deren Reihenfolge dürfen sich zwischen den Stufen unterscheiden. Bei Vergleichsmaterial stehen die Merkmale nie in derselben Reihenfolge wie beim Vergleichsgegenstand.'
]

/*
 * Die Regeln je Stufe stehen seit dem 27.09.2026 in `didactics/schwierigkeit.ts` (`stufenRegeln`):
 * Welche Stufe ★, ★★ und das einzelne Blatt haben, wählt die Lehrkraft – vorher war ★ immer
 * grundlegend und ★★ immer mittel.
 */

/** Regeln für ein Blatt mit ★-markierten Aufgaben (alle Stufen auf einem Blatt). */
export const COMBINED_RULES = [
  'Erstelle ein gemeinsames Blatt: Pflichtaufgaben (Fundamentum) für alle zuerst, danach mit ★★ und ★★★ markierte Zusatzaufgaben (Additum) mit steigender Offenheit und Komplexität.',
  'Das Fundamentum darf sich nicht auf Anforderungsbereich I beschränken, sondern muss auch ein einfaches Sach- oder Werturteil ermöglichen.'
]

/*
 * Die Entscheidung über deutsche Entsprechungen im Hilfsblatt steht in
 * `didactics/phraseRules.ts`. Sie hing hier allein an den ★-Stufen – ein Blatt ohne
 * Differenzierung bekam deshalb IMMER Übersetzungen, auch in Jahrgang 13 auf erhöhtem
 * Niveau (gemeldet am 25.09.2026). Jetzt zählen Jahrgang und Niveau mit.
 */
