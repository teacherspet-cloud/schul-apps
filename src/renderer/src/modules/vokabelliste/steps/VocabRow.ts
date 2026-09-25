import type { TabellenZeile } from '../../vokabeltest/steps/VokabelTabelle'

/**
 * Eine Zeile im Listen- oder Schulbuch-Editor; `id` nur für die Bearbeitung in der Tabelle.
 *
 * Die Tabelle selbst ist seit Paket 7 die gemeinsame `VokabelTabelle` (vokabeltest/steps) –
 * vorher gab es hier eine eigene mit anderem Verhalten.
 */
export interface VocabRow extends TabellenZeile {
  /** Seite im Schulbuch */
  page?: string
  /** Trägt eine Erklärung statt einer Übersetzung (im Buch farbig) */
  explained?: boolean
}
