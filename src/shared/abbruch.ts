/**
 * Ein abgebrochener KI-Auftrag – kein Fehler.
 *
 * Anlass (25.09.2026): Material entsteht jetzt im Hintergrund, und jeder Auftrag lässt sich
 * abbrechen. Der Abbruch läuft durch dieselben Wege wie ein Fehler (die Anfrage endet ohne
 * Antwort). Als roter Fehler-Hinweis gemeldet, sähe es aus, als sei etwas kaputtgegangen –
 * dabei hat die Lehrkraft genau das gewollt.
 *
 * Über die Brücke zwischen Hauptprozess und Oberfläche kommt nur der Meldungstext an, keine
 * Fehlerklasse. Deshalb ist der Text selbst das Erkennungszeichen – gemeinsam für beide Seiten.
 */
export const ABBRUCH_MELDUNG = 'Der Auftrag wurde abgebrochen.'

export class AbbruchFehler extends Error {
  constructor() {
    super(ABBRUCH_MELDUNG)
    this.name = 'AbortError'
  }
}

/** Ist das ein Abbruch (und kein echter Fehler)? */
export function istAbbruch(e: unknown): boolean {
  if (e instanceof AbbruchFehler) return true
  if (e instanceof Error) return e.name === 'AbortError' || e.message === ABBRUCH_MELDUNG
  return e === ABBRUCH_MELDUNG
}
