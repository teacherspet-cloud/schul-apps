/**
 * Hinweis auf das gelöste Beispiel, der an die Arbeitsanweisung tritt.
 *
 * In den Prüfungsformaten steht dieser Satz ausdrücklich dabei – Cambridge schreibt „There
 * is one example.", der Modellsatz des Goethe-Instituts nennt die Nummer 0 als gelöstes
 * Beispiel. Ohne den Hinweis sieht der Punkt 0 wie eine vergessene erste Aufgabe aus, und
 * genau das verwirrt: Man beginnt zu rechnen, statt zu lesen.
 *
 * Der Satz wird beim Anzeigen ERGÄNZT und nicht in die gespeicherte Arbeitsanweisung
 * geschrieben. Wird das Beispiel entfernt, verschwindet er von selbst mit; ein Satz, der im
 * Text stünde, bliebe dagegen stehen und müsste eigens gesucht werden.
 *
 * Die Sprache folgt dem Fach: Eine englische Aufgabe darf den Hinweis nicht deutsch tragen.
 */
const NOTES: Record<string, string> = {
  de: 'Ein Beispiel (0) ist vorgegeben.',
  en: 'There is one example.',
  fr: 'Il y a un exemple.',
  es: 'Hay un ejemplo.',
  it: "C'è un esempio.",
  nl: 'Er is één voorbeeld.',
  ru: 'Дан один пример.',
  // Schulfremdsprachen seit 30.09.2026 (@shared/faecher)
  pl: 'Podano jeden przykład.',
  cs: 'Jeden příklad je uveden.',
  pt: 'Há um exemplo.',
  tr: 'Bir örnek verilmiştir.',
  zh: '已给出一个例子。',
  la: 'Exemplum unum datum est.'
}

/** Sprachcode → Hinweis; unbekannte Sprachen fallen auf Deutsch zurück. */
export function exampleNote(language: string | undefined): string {
  return NOTES[(language ?? 'de').toLowerCase().slice(0, 2)] ?? NOTES.de
}
