/**
 * Gymnasialer Bildungsgang (G8/G9) und die Frage „gehört dieser Jahrgang zur Sek II?"
 *
 * ANLASS: Die Anrede der Lernenden (Paket 8b, Regel der Lehrkraft: Sek II siezen) hing an
 * `stageForGrade`, und das setzt die Oberstufe pauschal ab Klasse 11 an. In G8 ist Klasse 10
 * am Gymnasium aber schon die Einführungsphase der gymnasialen Oberstufe (KMK-Vereinbarung zur
 * Gestaltung der gymnasialen Oberstufe: bei zwölf Jahren bis zum Abitur liegt die
 * Einführungsphase in Jahrgangsstufe 10). Dort wurde geduzt.
 *
 * WARUM NICHT `stageForGrade` SELBST: Die übrigen Stufenregeln, die dort ablesen, gelten in der
 * Einführungsphase fachlich NICHT voll – Abitur-Operatorenliste als Maßstab (operators.ts),
 * Klausur mit Originalquellen und gleichen Fassungen (Klassenarbeit `upperSecondary`),
 * Hörtext-Regeln der Abiturprüfung (audioRules). Die Einführungsphase führt an diese Anforderungen
 * erst heran, und in mehreren G8-Ländern schließt Klasse 10 zugleich die Sek I ab (Berlin und
 * Brandenburg: Prüfungen zum mittleren Schulabschluss auch am Gymnasium). Würde `stageForGrade`
 * G8-fähig, bekäme eine zehnte Klasse in Berlin Abiturklausuren. Die Anrede dagegen folgt der
 * Schulorganisation: Wer in der Oberstufe ist, wird gesiezt. Deshalb diese eigene, eng benannte
 * Funktion – NUR für die Anrede.
 *
 * WELCHER BILDUNGSGANG: grundsätzlich der des Landes (states.ts). Wo das nicht eindeutig ist –
 * Länder im Übergang zu G9, Schulen mit eigener Wahl (einzelne G8-Gymnasien in Hessen oder
 * Schleswig-Holstein, Thüringer Gemeinschaftsschulen mit Abitur nach Klasse 12) –, gilt die
 * Einstellung der Lehrkraft für ihre eigene Schule (Einstellungen › Schule, `defaults.abiturNach`).
 * Andere Schulformen mit gymnasialer Oberstufe (Gesamtschulen, Gemeinschaftsschulen,
 * Stadtteilschulen …) führen in neun Jahren zum Abitur; ihre Oberstufe beginnt mit Klasse 11.
 */
import { schuljahrVon } from '@shared/schulkalender'
import { stateInfo } from './states'

export type Bildungsgang = 'G8' | 'G9'

/** Einstellung der Lehrkraft für die eigene Schule: 'land' = wie im Land üblich */
export interface BildungsgangEinstellung {
  stateId: string
  schoolTypeId: string
  abiturNach?: 'land' | Bildungsgang
}

/*
 * Wie bei den Fachfarben (shared/fachfarben.ts): Die Einstellung wird beim Laden und bei jeder
 * Änderung hier hinterlegt, weil die Anrede auch außerhalb von React bestimmt wird (Aufträge,
 * Druck, Word-Export).
 */
let eingestellt: BildungsgangEinstellung | null = null

export function merkeBildungsgang(werte: BildungsgangEinstellung | null | undefined): void {
  eingestellt = werte ?? null
}

/** Schuljahr (Beginn), das heute läuft: Schulkalender (erster Schultag nach den Sommerferien), sonst ab August */
export const laufendesSchuljahr = (heute: Date = new Date()): number => schuljahrVon(heute)

/**
 * Bildungsgang des Gymnasiums für einen Jahrgang – oder null für andere Schulformen.
 *
 * In Ländern mit „G9 im Aufbau" entscheidet der Jahrgang: G9 gilt erst ab dem Jahrgang, der im
 * Schuljahr `g9ErsterJahrgang5` in Klasse 5 war; die Klassen darüber gehen noch den G8-Weg.
 */
export function gymnasialerBildungsgang(
  grade: number,
  schoolTypeId: string,
  stateId: string,
  einstellung: BildungsgangEinstellung | null = eingestellt,
  heute: Date = new Date()
): Bildungsgang | null {
  const eigeneSchule = einstellung && einstellung.stateId === stateId && einstellung.schoolTypeId === schoolTypeId
  if (eigeneSchule && einstellung.abiturNach && einstellung.abiturNach !== 'land') return einstellung.abiturNach
  if (schoolTypeId !== 'gymnasium') return null
  const land = stateInfo(stateId)
  if (land.gymnasium !== 'G9 im Aufbau') return land.gymnasium
  if (!land.g9ErsterJahrgang5) return 'G9'
  const jahrInKlasse5 = laufendesSchuljahr(heute) - (grade - 5)
  return jahrInKlasse5 >= land.g9ErsterJahrgang5 ? 'G9' : 'G8'
}

/**
 * Gehört der Jahrgang zur Sekundarstufe II? Nur für die ANREDE (siehe oben, warum nicht
 * `stageForGrade`): ab Klasse 11 immer, Klasse 10 nur im G8-Gymnasium (Einführungsphase).
 */
export function gehoertZurSekII(
  grade: number,
  schoolTypeId: string,
  stateId: string,
  einstellung: BildungsgangEinstellung | null = eingestellt,
  heute: Date = new Date()
): boolean {
  if (schoolTypeId === 'grundschule') return false
  if (grade >= 11) return true
  return grade === 10 && gymnasialerBildungsgang(grade, schoolTypeId, stateId, einstellung, heute) === 'G8'
}
