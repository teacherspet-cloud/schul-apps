/**
 * Binnendifferenzierung (Fundamentum/Additum, gestufte Lernhilfen nach Leisen/Stäudel,
 * Sächsischer Leitfaden Binnendifferenzierung).
 */

export type Stars = 1 | 2 | 3

export const STAR_LABELS: Record<Stars, string> = { 1: '★ grundlegend', 2: '★★ mittel', 3: '★★★ erweitert' }

export const DIFFERENTIATION_PRINCIPLES = [
  'Alle Niveaustufen haben dasselbe Lernziel, dasselbe Thema, dasselbe Material und dasselbe Layout; die Kernaufgabe ist in allen Stufen enthalten.',
  'Unterscheide die Stufen in mindestens zwei Dimensionen (Hilfen, Offenheit, Komplexität, Abstraktion, Textmenge), nicht nur in der Menge.',
  'Gleiches Material heißt nicht gleicher Wortlaut: Umfang, Zahl der Merkmale und deren Reihenfolge dürfen sich zwischen den Stufen unterscheiden. Bei Vergleichsmaterial stehen die Merkmale nie in derselben Reihenfolge wie beim Vergleichsgegenstand.'
]

export const LEVEL_RULES: Record<Stars, string[]> = {
  1: [
    'Niveau ★ (grundlegend): geschlossene oder halboffene Formate, Anforderungsbereich I bis Einstieg II.',
    'Gib ein gelöstes Beispiel, einen Wortspeicher und Satzanfänge vor; zerlege Aufgaben in vorgegebene Teilschritte.',
    'Kürzere Texte, konkrete bzw. bildliche Darstellung; ergänze gestufte Hilfekarten (1. Aufgabe in eigenen Worten, 2. Denkanstoß, 3. Fachwissen, 4. Lösungsbeispiel).'
  ],
  2: [
    'Niveau ★★ (mittel): halboffene Formate mit Schwerpunkt Anforderungsbereich II.',
    'Hilfen nur als optionaler Tipp-Kasten, mittlere Textlänge, Wechsel von bildlicher zu symbolischer Darstellung.'
  ],
  3: [
    'Niveau ★★★ (erweitert): offene Formate, Anforderungsbereich II–III mit Transfer, Begründung und Bewertung.',
    'Keine vorgegebenen Teilschritte, Fachsprache, mehrere Lösungswege zulassen; ergänze eine Knobel- oder Forscheraufgabe.'
  ]
}

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
