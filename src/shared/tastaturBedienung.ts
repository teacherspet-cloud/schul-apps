/**
 * Tastaturbedienung für Zeiger-Bedienelemente (22.10.2026, Prüfung des Schulträgers, Punkt 12 – Barrierefreiheit,
 * WCAG 2.1 AA 2.1.1 „Tastatur“). Ohne React-Abhängigkeit, damit die Regeln in vitest prüfbar sind.
 *
 *  - `alsKnopf(fn)`: Ein anklickbares div/Td/Card wird per Tab erreichbar und mit Enter/Leertaste ausgelöst.
 *  - `pfeilVersatz(taste, umschalt)`: Pfeiltasten verschieben ein Objekt (10 px, mit Umschalt 1 px fein) –
 *    die Tastatur-Alternative zum Ziehen (Kästchen auf dem Online-Arbeitsblatt).
 */

/** Minimaler Ausschnitt eines Tastaturereignisses (React oder DOM). */
export interface TastenEreignis {
  key: string
  shiftKey?: boolean
  target?: unknown
  currentTarget?: unknown
  preventDefault: () => void
}

/** Löst Enter oder Leertaste die Aktion aus? */
export function istAusloeseTaste(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}

/** Eigenschaften für ein Nicht-Knopf-Element, das wie ein Knopf bedient werden soll. */
export function alsKnopf(
  aktion: () => void,
  aus = false
): { role: 'button'; tabIndex: number; 'aria-disabled'?: boolean; onKeyDown: (e: TastenEreignis) => void } {
  return {
    role: 'button',
    tabIndex: aus ? -1 : 0,
    ...(aus ? { 'aria-disabled': true } : {}),
    onKeyDown: (e: TastenEreignis) => {
      if (aus || !istAusloeseTaste(e.key)) return
      // Tasten in einem inneren Knopf/Feld gehören diesem (z. B. Symbol-Knopf in einer Karte)
      if (e.target !== undefined && e.currentTarget !== undefined && e.target !== e.currentTarget) return
      e.preventDefault()
      aktion()
    }
  }
}

/** Versatz für Pfeiltasten: 10 px je Druck, mit Umschalt 1 px. Andere Tasten: null. */
export function pfeilVersatz(key: string, umschalt = false): { dx: number; dy: number } | null {
  const s = umschalt ? 1 : 10
  switch (key) {
    case 'ArrowLeft':
      return { dx: -s, dy: 0 }
    case 'ArrowRight':
      return { dx: s, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -s }
    case 'ArrowDown':
      return { dx: 0, dy: s }
    default:
      return null
  }
}
