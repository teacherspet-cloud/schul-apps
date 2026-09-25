/**
 * Zuletzt getroffene Auswahl je Programm merken.
 *
 * Lehrkräfte arbeiten meist in denselben Fächern und Lerngruppen. Beim nächsten Mal soll
 * deshalb dastehen, was zuletzt gewählt war – Fach, Bundesland, Schulform, Jahrgang –
 * statt der allgemeinen Vorgabe (sonst steht bei einer Englischlehrkraft immer wieder
 * „Biologie"). Geändert werden kann alles weiterhin frei.
 */

export interface LastChoice {
  subjectId?: string
  stateId?: string
  schoolTypeId?: string
  schoolTypeName?: string
  grade?: number
  courseLevel?: string
  languageOrder?: number
  cefrLevel?: string
  /** Vokabeltest: Zielsprache */
  targetLanguage?: string
}

const key = (app: string): string => `schul-apps-zuletzt-${app}`

export function loadLastChoice(app: string): LastChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(key(app)) ?? 'null')
    return saved && typeof saved === 'object' ? (saved as LastChoice) : {}
  } catch {
    return {}
  }
}

/** Merkt die Auswahl; leere Felder überschreiben nichts. */
export function saveLastChoice(app: string, choice: LastChoice): void {
  try {
    const clean = Object.fromEntries(Object.entries(choice).filter(([, v]) => v !== undefined && v !== ''))
    localStorage.setItem(key(app), JSON.stringify({ ...loadLastChoice(app), ...clean }))
  } catch {
    // ohne lokalen Speicher gilt weiterhin die Vorgabe aus den Einstellungen
  }
}
