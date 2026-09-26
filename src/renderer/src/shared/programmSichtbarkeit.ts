/**
 * Welche Programme zu den eigenen Fächern passen – und welche deshalb ausgeblendet werden
 * (Paket 12, Wunsch der Lehrkraft vom 26.09.2026).
 *
 * Eine Geschichts- und Mathematiklehrkraft braucht weder Vokabeltest noch Grammatiktest;
 * die Symbole standen trotzdem in der Leiste, auf der Startseite und unter Strg+1 … Strg+6.
 * Jetzt wählt die Lehrkraft in den Einstellungen (Reiter „Schule") und im
 * Einrichtungsassistenten ihre Fächer, und nur die passenden Programme bleiben sichtbar.
 *
 * Regeln (abgestimmt):
 * - Keine Fächer gewählt → alles sichtbar. Wer die Frage überspringt, verliert nichts.
 * - Vokabeltest, Vokabellisten und Grammatiktest gibt es für die Fremdsprachen, Latein und
 *   Deutsch als Zweitsprache; die Klassenarbeit für die Fächer, die das Modul kann; Arbeitsblatt
 *   und Lernzielkontrolle für alle.
 * - Jedes Programm lässt sich unter „Programme anzeigen" einzeln wieder einblenden (oder
 *   ausblenden). Die eigene Wahl geht der Regel vor.
 * - Ausgeblendet heißt NICHT gesperrt: Materialien des Programms erscheinen weiter in
 *   „Zuletzt bearbeitet", in der Suche und in den Themenbereichen, und ein Klick darauf öffnet
 *   das Programm trotzdem (navigation.ts fragt die Sichtbarkeit nicht ab). Sonst läge
 *   vorhandenes Material plötzlich unerreichbar da.
 *
 * Diese Datei kennt weder React noch die Programme selbst – registry.ts übernimmt die
 * Zuordnung von hier, die Tests (tests/programmSichtbarkeit.test.ts) prüfen sie ohne Oberfläche.
 */

/** Fächer, in denen Vokabeln und Grammatik geprüft werden (Kennungen aus arbeitsblatt/model/subjects.ts) */
export const SPRACH_FAECHER = ['englisch', 'franzoesisch', 'spanisch', 'italienisch', 'latein', 'daz'] as const

/** Fächer, die die Klassenarbeit kann (klassenarbeit/model/types.ts, `ExamSubjectId`) */
export const KLASSENARBEIT_FAECHER = ['englisch', 'geschichte'] as const

/** 'alle' = jedes Fach; sonst die Fachkennungen, für die das Programm gedacht ist */
export type ProgrammFaecher = 'alle' | readonly string[]

/**
 * Die Zuordnung Programm ↔ Fächer – in der Reihenfolge der Leiste (Wunsch der Lehrkraft vom
 * 26.09.2026): Arbeitsblätter, Vokabeltest, Grammatiktest, Lernzielkontrollen,
 * Klassenarbeiten, Vokabellisten. registry.ts ordnet die Programme genauso.
 */
export const PROGRAMM_FAECHER: Record<string, ProgrammFaecher> = {
  arbeitsblatt: 'alle',
  vokabeltest: SPRACH_FAECHER,
  grammatiktest: SPRACH_FAECHER,
  lernzielkontrolle: 'alle',
  klassenarbeit: KLASSENARBEIT_FAECHER,
  vokabelliste: SPRACH_FAECHER
}

/** Reihenfolge der Programme überall (Leiste, Startseite, Strg+1 …, Themenbereiche, Einstellungen) */
export const PROGRAMM_REIHENFOLGE = Object.keys(PROGRAMM_FAECHER)

/** Passt das Programm zu mindestens einem der eigenen Fächer? Ohne eigene Fächer passt alles. */
export function programmPasst(faecher: ProgrammFaecher | undefined, eigene: readonly string[] | undefined): boolean {
  if (!eigene?.length || !faecher || faecher === 'alle') return true
  return faecher.some((f) => eigene.includes(f))
}

/**
 * Ist das Programm sichtbar? Die eigene Wahl unter „Programme anzeigen" (`anzeigen[id]`)
 * geht der Regel vor – in beide Richtungen.
 */
export function programmSichtbar(
  id: string,
  faecher: ProgrammFaecher | undefined,
  eigene: readonly string[] | undefined,
  anzeigen: Record<string, boolean | null> | undefined
): boolean {
  const wahl = anzeigen?.[id]
  if (typeof wahl === 'boolean') return wahl
  return programmPasst(faecher, eigene)
}

/** Die sichtbaren Programme in ihrer Reihenfolge – für Leiste, Startseite und Strg+1 … Strg+6 */
export function sichtbareProgramme<T extends { id: string; faecher?: ProgrammFaecher }>(
  programme: readonly T[],
  eigene: readonly string[] | undefined,
  anzeigen: Record<string, boolean | null> | undefined
): T[] {
  return programme.filter((p) => programmSichtbar(p.id, p.faecher, eigene, anzeigen))
}
