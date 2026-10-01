/**
 * „Aufgabe 3 (Fortsetzung)" – der Hinweis auf dem Folgestück einer geteilten Aufgabe.
 *
 * Er steht in der Sprache des Faches, nicht auf Deutsch: Auf einem englischen Arbeitsblatt
 * heißt es „Task 3 (continued)". Gewünscht von der Lehrkraft am 24.09.2026.
 *
 * Gewählt ist jeweils das Wort, das die Lehrwerke des Faches für eine Aufgabe benutzen –
 * im Englischen „Task", nicht „Exercise": „Exercise" meint dort eher die Übung zur Form,
 * „Task" die Arbeitsaufgabe, um die es auf diesen Blättern geht.
 */
const HINWEISE: Record<string, (nummer: number) => string> = {
  de: (n) => `Aufgabe ${n} (Fortsetzung)`,
  en: (n) => `Task ${n} (continued)`,
  fr: (n) => `Exercice ${n} (suite)`,
  es: (n) => `Tarea ${n} (continuación)`,
  it: (n) => `Esercizio ${n} (continua)`,
  nl: (n) => `Opdracht ${n} (vervolg)`,
  ru: (n) => `Задание ${n} (продолжение)`,
  // Schulfremdsprachen seit 30.09.2026 (@shared/faecher)
  pl: (n) => `Zadanie ${n} (ciąg dalszy)`,
  cs: (n) => `Úloha ${n} (pokračování)`,
  pt: (n) => `Tarefa ${n} (continuação)`,
  tr: (n) => `Görev ${n} (devamı)`,
  zh: (n) => `练习 ${n}（续）`,
  ja: (n) => `問題 ${n}（続き）`,
  ar: (n) => `التمرين ${n} (تابع)`,
  da: (n) => `Opgave ${n} (fortsat)`,
  el: (n) => `Άσκηση ${n} (συνέχεια)`,
  // Latein: Die Arbeitsanweisungen stehen deutsch, der Hinweis deshalb auch
  la: (n) => `Aufgabe ${n} (Fortsetzung)`
}

/** Sprachcode → Hinweis; unbekannte Sprachen fallen auf Deutsch zurück. */
export function continuedNote(language: string | undefined, nummer: number): string {
  return (HINWEISE[(language ?? 'de').toLowerCase().slice(0, 2)] ?? HINWEISE.de)(nummer)
}

/** Nur der Zusatz „(Fortsetzung)" in der Sprache des Faches */
const ZUSATZ: Record<string, string> = {
  de: '(Fortsetzung)',
  en: '(continued)',
  fr: '(suite)',
  es: '(continuación)',
  it: '(continua)',
  nl: '(vervolg)',
  ru: '(продолжение)',
  pl: '(ciąg dalszy)',
  cs: '(pokračování)',
  pt: '(continuação)',
  tr: '(devamı)',
  zh: '（续）',
  ja: '（続き）',
  ar: '(تابع)',
  da: '(fortsat)',
  el: '(συνέχεια)',
  la: '(Fortsetzung)'
}

/**
 * „M2 (Fortsetzung)", „Merke (Fortsetzung)" – derselbe Hinweis für jeden anderen geteilten
 * Baustein (01.10.2026, Wunsch der Lehrkraft: überall einheitlich). Ohne Bezeichnung steht nur
 * der Zusatz.
 */
export function continuedLabel(language: string | undefined, bezeichnung: string): string {
  const zusatz = ZUSATZ[(language ?? 'de').toLowerCase().slice(0, 2)] ?? ZUSATZ.de
  const name = bezeichnung.trim()
  if (!name) return zusatz
  return /^[（]/.test(zusatz) ? `${name}${zusatz}` : `${name} ${zusatz}`
}
