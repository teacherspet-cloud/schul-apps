/**
 * Zeichenflächen tragen nur einen Auftrag (03.10.2026, Befund der Lehrkraft zur Zeitleiste:
 * „Ordne die Ereignisse aus M1 auf der Zeitleiste und erkläre anhand ihrer Abfolge, wie sich die
 * militärische Lage veränderte" – eine doppelte Aufgabenstellung: Auf der Zeitleiste ist kein Platz
 * für die Erklärung, und die nächste Aufgabe verlangte fast dasselbe. Das Feedback bemängelte dann
 * die fehlende Erklärung.)
 *
 * Bei einer Aufgabe mit Zeichenfläche (Zeitleiste, Diagramm, Schrägbild …) fällt deshalb ein
 * angehängter Schreibauftrag („… und erkläre/begründe/beschreibe …") weg. Zeichnen, Eintragen,
 * Markieren und Beschriften bleiben.
 */
const SCHREIB_OPERATOREN = [
  'erkläre',
  'erklärt',
  'erklären Sie',
  'erläutere',
  'erläutert',
  'begründe',
  'begründet',
  'beschreibe',
  'beschreibt',
  'beurteile',
  'beurteilt',
  'bewerte',
  'bewertet',
  'deute',
  'interpretiere',
  'vergleiche',
  'analysiere',
  'nimm Stellung',
  'diskutiere',
  'formuliere',
  'fasse',
  'explain',
  'describe',
  'justify',
  'evaluate',
  'assess',
  'compare',
  'discuss',
  'expliquez',
  'explique',
  'décris',
  'explica',
  'describe'
]

const MUSTER = new RegExp(
  `\\s*(?:,\\s*|\\s+)(?:und|sowie|and|et|y)\\s+(?:dann\\s+|anschließend\\s+|then\\s+)?(?:${SCHREIB_OPERATOREN.join('|')})\\b[\\s\\S]*$`,
  'iu'
)

/** Schreibauftrag hinter dem Zeichenauftrag abschneiden; der Satz endet dann mit Punkt */
export function nurZeichenauftrag(anweisung: string): string {
  const m = MUSTER.exec(anweisung)
  if (!m || m.index < 12) return anweisung
  return `${anweisung.slice(0, m.index).replace(/[\s,;:]+$/, '')}.`
}
