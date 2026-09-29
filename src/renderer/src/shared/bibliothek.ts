/**
 * Reine Hilfen der Bibliotheken („Meine Arbeitsblätter", „Meine Vokabeltests" …).
 *
 * Getrennt von den Komponenten (components/Bibliothek.tsx), damit sie ohne Oberfläche
 * prüfbar sind (tests/bibliothek.test.ts).
 */
import { merkeGeloescht, sichereAlles } from './autosave'

/**
 * Ein Dokument aus der Bibliothek löschen – so, dass es gelöscht BLEIBT.
 *
 * Anlass (29.09.2026): „Löschen klappt oft erst beim zweiten Mal – beim ersten verschwindet
 * es, nach dem Neustart ist es wieder da." Zwei Wege legten das gelöschte Dokument neu an:
 *
 * - War es gerade im Programm offen, bekam es nur eine neue Kennung und blieb mit Inhalt
 *   stehen. Das automatische Sichern sah „neues Dokument mit Inhalt, noch nie gesichert" und
 *   legte es 200 ms später unter der neuen Kennung wieder in die Bibliothek. Die Liste zeigte
 *   den Stand vom Löschen, erst nach dem Neustart tauchte es wieder auf. Jetzt wird das offene
 *   Dokument beim Löschen geschlossen (`geloescht`).
 * - Eine noch anstehende Sicherung oder das Ergebnis eines Hintergrund-Auftrags kam NACH dem
 *   Löschen an und schrieb die Datei zurück. Jetzt wird Anstehendes vorher ausgeführt, und die
 *   Kennung gilt für den Rest der Sitzung als gelöscht (autosave.ts, `istGeloescht`).
 */
export async function loescheDokument<M>(
  loeschen: (id: string) => Promise<M[]>,
  id: string,
  opts: { offeneId: () => string | null; geloescht?: () => void }
): Promise<M[]> {
  // Anstehendes zuerst – sonst landete eine wartende Sicherung dieses Dokuments nach dem Löschen
  await sichereAlles()
  const rest = await loeschen(id)
  merkeGeloescht(id)
  if (opts.offeneId() === id) opts.geloescht?.()
  return rest
}

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
