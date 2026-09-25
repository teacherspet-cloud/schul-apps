/**
 * Wohin beim Speichern das Tafelbild gehört.
 *
 * Gemeldet von der Lehrkraft (24.09.2026): „Wenn ich die Schüleraufgaben mit Material
 * speichere ist das Tafelbild dort mit dran, wenn es ausgewählt ist."
 *
 * Das Tafelbild ist Material der Lehrkraft – es nimmt die Ergebnisse der Stunde vorweg. In
 * der Datei, die die Klasse bekommt, hat es nichts zu suchen. Es wandert deshalb dorthin,
 * wo ohnehin nur die Lehrkraft hinsieht: hinter die Lösungen. Gibt es keine Lösungen,
 * bekommt es eine eigene Datei.
 *
 * Beim Drucken entsteht nur ein Stapel Papier und keine zweite Datei – dort bleibt es am
 * Ende des Ausdrucks, den die Lehrkraft ohnehin selbst sortiert.
 */
export type Loesungswahl = 'none' | 'append' | 'separate'
export type Ausgabeart = 'pdf' | 'docx' | 'print'

export interface TafelbildZiel {
  /** an die Datei mit den Schülerseiten (nur, wenn dort ohnehin schon Lösungen stehen) */
  hauptdokument: boolean
  /** in die getrennte Lösungsdatei */
  loesungsdatei: boolean
  /** als eigene Datei „… - Tafelbild" */
  eigeneDatei: boolean
}

export function tafelbildZiel(opts: { tafelbild: boolean; blaetter: number; loesungen: Loesungswahl; ausgabe: Ausgabeart }): TafelbildZiel {
  const aus: TafelbildZiel = { hauptdokument: false, loesungsdatei: false, eigeneDatei: false }
  if (!opts.tafelbild) return aus
  // Ohne gewählte Arbeitsblätter IST das Tafelbild das Dokument
  if (opts.blaetter === 0) return { ...aus, hauptdokument: true }
  if (opts.ausgabe === 'print') return { ...aus, hauptdokument: true }
  if (opts.loesungen === 'append') return { ...aus, hauptdokument: true }
  if (opts.loesungen === 'separate') return { ...aus, loesungsdatei: true }
  return { ...aus, eigeneDatei: true }
}

/** Was im Speichern-Dialog unter dem Häkchen steht, damit die Lehrkraft die Datei später wiederfindet. */
export function tafelbildHinweis(opts: { blaetter: number; loesungen: Loesungswahl; ausgabe: Ausgabeart }): string | undefined {
  if (opts.blaetter === 0) return undefined
  if (opts.ausgabe === 'print') return 'Wird am Ende des Ausdrucks ausgegeben.'
  if (opts.loesungen === 'append') return 'Wird hinter die Lösungsseiten gehängt.'
  if (opts.loesungen === 'separate') return 'Kommt in die Lösungsdatei, nicht in die Schülerdatei.'
  return 'Wird als eigene Datei gespeichert – du wirst danach ein zweites Mal nach dem Speicherort gefragt.'
}
