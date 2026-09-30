/**
 * Beschriftungen für Richtig/Falsch-Aufgaben in der jeweiligen Sprache.
 *
 * Die Aufgabe steht in der Zielsprache – dann dürfen die Ankreuzfelder nicht deutsch
 * (oder bei Französisch englisch) beschriftet sein.
 */
const LABELS: Record<string, { yes: string; no: string }> = {
  de: { yes: 'richtig', no: 'falsch' },
  en: { yes: 'true', no: 'false' },
  fr: { yes: 'vrai', no: 'faux' },
  es: { yes: 'verdadero', no: 'falso' },
  it: { yes: 'vero', no: 'falso' },
  nl: { yes: 'waar', no: 'niet waar' },
  ru: { yes: 'верно', no: 'неверно' },
  // Schulfremdsprachen seit 30.09.2026 (@shared/faecher)
  pl: { yes: 'prawda', no: 'fałsz' },
  cs: { yes: 'pravda', no: 'nepravda' },
  pt: { yes: 'verdadeiro', no: 'falso' },
  tr: { yes: 'doğru', no: 'yanlış' },
  zh: { yes: '正确', no: '错误' },
  la: { yes: 'verum', no: 'falsum' }
}

/** Sprachcode → Beschriftung; unbekannte Sprachen fallen auf Deutsch zurück. */
export function trueFalseLabels(language: string | undefined): { yes: string; no: string } {
  return LABELS[(language ?? 'de').toLowerCase().slice(0, 2)] ?? LABELS.de
}
