/**
 * Reine Hilfen der Bibliotheken („Meine Arbeitsblätter", „Meine Vokabeltests" …).
 *
 * Getrennt von den Komponenten (components/Bibliothek.tsx), damit sie ohne Oberfläche
 * prüfbar sind (tests/bibliothek.test.ts).
 */

/**
 * Passt ein Eintrag zur Suche? Jedes eingegebene Wort muss in einem der Felder vorkommen –
 * „englisch 7 unit 2" findet also die Liste zu Unit 2 in Klasse 7 im Fach Englisch, egal in
 * welcher Reihenfolge getippt wird. Groß-/Kleinschreibung zählt nicht. Wie die Suche der
 * Startseite (shell/materialien.ts), damit beide gleich antworten.
 */
export function passtZurSuche(felder: (string | number | null | undefined)[], eingabe: string): boolean {
  const woerter = eingabe.toLocaleLowerCase('de').split(/\s+/).filter(Boolean)
  if (!woerter.length) return true
  const text = felder
    .filter((f) => f !== null && f !== undefined && f !== '')
    .join(' ')
    .toLocaleLowerCase('de')
  return woerter.every((w) => text.includes(w))
}

/** Name einer Kopie: „Bruchrechnen (Kopie)" – eine zweite Kopie der Kopie heißt „… (Kopie 2)". */
export function kopieName(name: string): string {
  const m = /^(.*) \(Kopie(?: (\d+))?\)$/.exec(name)
  if (!m) return `${name} (Kopie)`
  return `${m[1]} (Kopie ${m[2] ? Number(m[2]) + 1 : 2})`
}
