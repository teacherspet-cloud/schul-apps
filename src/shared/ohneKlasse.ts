/**
 * Titel für Lernende ohne Klasse (08.10.2026, Wunsch der Lehrkraft): Kurse heißen bei der Lehrkraft „10b - Englisch",
 * Lernende sehen nur „Englisch". Entfernt eine Klassenangabe vorn (10b, 6, Q1, EF, Jg. 7, Klasse 9a) samt Trennzeichen.
 */
const KLASSE_VORN = /^\s*(?:\d{1,2}\s?[a-zäöü]{0,3}\d?|[QE]\d|EF|Jg\.?\s?\d{1,2}|Klasse\s?\d{1,2}\s?[a-zäöü]{0,3})\s*[-–—:·|]\s*(?=\S)/i

export function ohneKlasse(titel: string): string {
  if (!KLASSE_VORN.test(titel)) return titel
  return titel.replace(KLASSE_VORN, '').trim() || titel
}
