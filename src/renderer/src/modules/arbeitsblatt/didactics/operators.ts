import type { Afb } from './ageBands'

export type OperatorList = Record<Afb, string[]>

/** Grundschule: keine KMK-Liste, kindgerechte Handlungsverben (ab Kl. 3 erste Operatoren mit Satzanfang). */
export const PRIMARY_VERBS: OperatorList = {
  I: ['male', 'kreise ein', 'verbinde', 'kreuze an', 'trage ein', 'ergänze', 'rechne', 'markiere', 'schreibe ab'],
  II: ['ordne', 'erzähle', 'beschreibe', 'vergleiche'],
  III: ['begründe', 'überlege', 'finde eine eigene Lösung']
}

/** Sekundarstufe I (orientiert an KMK-Operatorenlisten, fachspezifische Zuordnung möglich). */
export const SEK1_OPERATORS: OperatorList = {
  I: ['nennen', 'beschreiben', 'wiedergeben', 'zusammenfassen', 'bestimmen', 'berechnen', 'zuordnen'],
  II: ['erklären', 'erläutern', 'begründen', 'vergleichen', 'einordnen', 'untersuchen', 'herausarbeiten', 'anwenden'],
  III: ['beurteilen', 'Stellung nehmen', 'bewerten', 'diskutieren', 'überprüfen', 'entwerfen', 'gestalten']
}

/** Zusätzliche Operatoren der Sekundarstufe II. */
export const SEK2_EXTRA: OperatorList = {
  I: ['skizzieren', 'darlegen'],
  II: ['analysieren', 'erschließen', 'in Beziehung setzen', 'nachweisen', 'ableiten'],
  III: ['erörtern', 'interpretieren', 'deuten', 'sich auseinandersetzen', 'entwickeln', 'reflektieren', 'beweisen', 'Hypothesen aufstellen']
}

export function operatorsFor(stage: 'primar' | 'sek1' | 'sek2', grade: number): OperatorList {
  if (stage === 'primar') {
    // Klasse 1–2: nur die einfachen Handlungsverben
    if (grade <= 2) return { I: PRIMARY_VERBS.I, II: ['ordne', 'erzähle'], III: ['überlege'] }
    return PRIMARY_VERBS
  }
  if (stage === 'sek1') return SEK1_OPERATORS
  return {
    I: [...SEK1_OPERATORS.I, ...SEK2_EXTRA.I],
    II: [...SEK1_OPERATORS.II, ...SEK2_EXTRA.II],
    III: [...SEK1_OPERATORS.III, ...SEK2_EXTRA.III]
  }
}

/** Operatoren, die für eine Stufe zu anspruchsvoll sind (für die automatische Prüfung). */
export function tooAdvancedOperators(stage: 'primar' | 'sek1' | 'sek2', grade: number): string[] {
  if (stage === 'sek2') return []
  const sek2Only = [...SEK2_EXTRA.I, ...SEK2_EXTRA.II, ...SEK2_EXTRA.III].filter((o) => !['entwickeln', 'Hypothesen aufstellen'].includes(o))
  if (stage === 'sek1') return grade <= 8 ? sek2Only : sek2Only.filter((o) => !['analysieren', 'interpretieren', 'deuten'].includes(o))
  return [...sek2Only, 'erläutern', 'beurteilen', 'bewerten', 'Stellung nehmen', 'diskutieren', 'herausarbeiten', 'untersuchen']
}
