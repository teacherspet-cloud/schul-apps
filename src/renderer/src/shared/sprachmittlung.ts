/**
 * Sprachmittlung: In welcher Sprache steht das Ergebnis? (23.10.2026, Wunsch der Lehrkraft: „Eine
 * Mediationsaufgabe für das Fach Englisch benötigt das Ergebnis in der Regel auf Englisch (aktuell
 * wird hier noch Deutsch als Standard genommen). Passe es auch für die anderen Fremdsprachen an.")
 *
 * Regelfall in Klassenarbeiten und im Abitur: deutscher Ausgangstext → Ergebnis in der Zielsprache.
 * Deutsch nur, wenn die Aufgabe es ausdrücklich verlangt („auf Deutsch", „into German") oder der
 * Ausgangstext fremdsprachig ist und der Adressat nur Deutsch versteht. Eine einzige Quelle für
 * Rückmeldung, Arbeitsblatt-Lösungen und die Übernahme von Klassenarbeiten.
 */

/** Aufgabe sieht nach Sprachmittlung aus (Richtung unbekannt) */
export const SPRACHMITTLUNG = /sprachmittlung|\bmediation\b|m[ée]diation|mediaci[oó]n|mediazione|медиаци|\bmediate\b/i

/** Regel für KI-Anfragen, die Erwartungshorizont oder Musterlösung einer Sprachmittlung schreiben */
export function sprachmittlungsRegel(fach: string): string {
  const ziel = fach || 'der Zielsprache'
  return (
    `- SPRACHMITTLUNG (Mediation): Das Ergebnis steht im Regelfall auf ${ziel} (deutscher Ausgangstext → ${ziel}). Deutsch nur, wenn die Aufgabe es ausdrücklich verlangt ` +
    `(„auf Deutsch", „into German") oder der Ausgangstext fremdsprachig ist und der Adressat nur Deutsch versteht. ` +
    `Erwartete Inhalte als Beispielformulierungen und jede Musterlösung der Sprachmittlung daher auf ${ziel}; Kriterien und Hinweise an die Lehrkraft bleiben auf Deutsch.`
  )
}
