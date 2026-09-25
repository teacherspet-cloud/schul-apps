/**
 * Arbeitsteilige Filmbeobachtung: aus einem Blatt werden beim Drucken Gruppenfassungen.
 *
 * Belegt empfohlen und aus gutem Grund: „Verteilen Sie unterschiedliche Sehaufträge an
 * kleine Gruppen, so dass die Aufmerksamkeit auf nicht zu viele einzelne Aspekte gestreut
 * wird“ (VISION KINO); kinofenster.de nennt als Alternative zu ein bis zwei Aspekten für
 * alle ausdrücklich das Verteilen auf Gruppen, „um die Schüler/-innen nicht zu überfordern“.
 *
 * Die Fassungen sind echte Blätter – so tragen Seitenumbruch, Auswahl beim Drucken und der
 * Word-Export ohne Sonderweg. Die BAUSTEIN-KENNUNGEN bleiben dabei absichtlich gleich: Der
 * Editor gibt eine Änderung an alle Blätter weiter, die denselben Baustein enthalten. Wer
 * einen Tippfehler im gemeinsamen Material verbessert, verbessert ihn damit in allen
 * Fassungen; die gruppeneigene Aufgabe steht nur in einer und bleibt dort.
 *
 * Gleiches Layout, gleiches Lernziel, gleiche Reihenfolge – unterschiedlich ist nur der
 * Beobachtungsauftrag. Am Blatt soll niemand ablesen können, dass er etwas anderes bekommen
 * hat als der Nachbar.
 */
import type { Sheet, WsBlock } from '../model/types'

/** Die vorkommenden Beobachtergruppen, in der Reihenfolge des Blattes. */
export function observerGroupsOf(sheet: Sheet): string[] {
  const seen: string[] = []
  for (const b of sheet.blocks) {
    if (b.type !== 'task' || !b.observerGroup) continue
    if (!seen.includes(b.observerGroup)) seen.push(b.observerGroup)
  }
  return seen.sort((a, b) => a.localeCompare(b, 'de'))
}

/** Gehört der Baustein in die Fassung dieser Gruppe? Alles ohne Gruppe gilt für alle. */
const forGroup = (block: WsBlock, group: string): boolean => block.type !== 'task' || !block.observerGroup || block.observerGroup === group

/**
 * Ein Blatt, aus dem Gruppenfassungen entstehen, wird zu mehreren.
 * Ohne Gruppen bleibt es unverändert – dann gibt es nichts zu verteilen.
 */
export function expandObserverGroups(sheets: Sheet[]): Sheet[] {
  return sheets.flatMap((sheet) => {
    const groups = observerGroupsOf(sheet)
    if (groups.length < 2) return [sheet]
    return groups.map((group) => ({
      ...sheet,
      id: `${sheet.id}:${group}`,
      label: `${sheet.label} · Gruppe ${group}`,
      observerGroup: group,
      blocks: sheet.blocks.filter((b) => forGroup(b, group))
    }))
  })
}
