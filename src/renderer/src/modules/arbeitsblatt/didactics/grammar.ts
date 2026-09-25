/**
 * Grammatikarbeit: welches Thema für eine Lerngruppe in Frage kommt.
 *
 * Die Themen selbst stehen in `grammarTopics.ts` (erzeugt aus der Recherche). Hier steht, wie
 * daraus eine Auswahl wird.
 *
 * Der wichtigste Punkt, und der Grund für den Umbau gegenüber der früheren Fassung:
 * **Der Jahrgang allein sagt nichts.** Maßgeblich ist das LERNJAHR, und das hängt von der
 * Fremdsprachenfolge ab:
 * - Französisch als 2. Fremdsprache beginnt in Bayern und Baden-Württemberg in Klasse 6, in
 *   Nordrhein-Westfalen erst in Klasse 7. NRW hat bis zum Ende der Sekundarstufe I damit nur
 *   vier Lernjahre statt fünf und drängt zusammen, was Bayern streckt.
 * - Als 3. Fremdsprache verdichtet sich die Progression noch einmal deutlich: Ein Lernjahr
 *   der 3. Fremdsprache entspricht etwa zwei der 2. Fremdsprache.
 * - Spanisch als spät beginnende Fremdsprache hat eine eigene, gestraffte Progression; die
 *   Themen tragen dafür ein eigenes Lernjahr (`lateStart`).
 *
 * Deutsch läuft nach Jahrgang, nicht nach Lernjahr. DaZ läuft nach Erwerbsstufe – und dort
 * gilt eine Sperre statt einer Sortierung: Was mehr als eine Stufe über dem Stand der Lernenden
 * liegt, lässt sich nicht verarbeiten und wird deshalb nicht vorgeschlagen.
 */
import { GRAMMAR_TOPICS } from './grammarTopics'
import type { GrammarTopic } from './grammarTopics'
import type { WorksheetMeta } from '../model/types'

export type { GrammarTopic }
export { GRAMMAR_TOPICS }

/** Stellung der Sprache in der Fremdsprachenfolge – bestimmt, wann das 1. Lernjahr liegt. */
export type LanguageSequence = 'fs1' | 'fs2' | 'fs3' | 'spaet'

export interface LanguageSequenceInfo {
  value: LanguageSequence
  label: string
  description: string
}

export const LANGUAGE_SEQUENCES: LanguageSequenceInfo[] = [
  { value: 'fs1', label: '1. Fremdsprache', description: 'Beginn in Klasse 5 (in Berlin und Brandenburg in Klasse 3).' },
  { value: 'fs2', label: '2. Fremdsprache', description: 'Beginn in Klasse 6 oder 7, je nach Bundesland.' },
  { value: 'fs3', label: '3. Fremdsprache', description: 'Beginn in Klasse 8 oder 9; die Progression ist deutlich gestrafft.' },
  { value: 'spaet', label: 'Spät beginnend', description: 'Beginn in der Oberstufe; eigene, stark verdichtete Progression.' }
]

/** Übliche Anfangsjahrgänge. Länder weichen ab, deshalb ist die Folge in der App wählbar. */
const START_GRADE: Record<LanguageSequence, number> = { fs1: 5, fs2: 6, fs3: 8, spaet: 11 }

/** In Nordrhein-Westfalen beginnt die 2. Fremdsprache ein Jahr später als in Bayern und BW. */
const LATE_FS2_STATES = ['NW', 'NRW']

/**
 * Voreinstellung der Fremdsprachenfolge, solange die Lehrkraft nichts anderes wählt.
 * Englisch ist an fast allen Schulen die 1. Fremdsprache; Französisch und Latein sind
 * üblicherweise die zweite, Spanisch und Italienisch die zweite oder dritte.
 */
export function defaultSequence(subjectId: string, grade: number): LanguageSequence {
  if (subjectId === 'englisch') return 'fs1'
  if (subjectId === 'spanisch' || subjectId === 'italienisch') {
    if (grade >= 11) return 'spaet'
    return grade >= 8 ? 'fs3' : 'fs2'
  }
  return 'fs2'
}

/**
 * Lernjahr aus Jahrgang und Fremdsprachenfolge.
 * Mindestens 1 – wer vor dem üblichen Beginn arbeitet, bekommt die Themen des ersten Jahres.
 */
export function learningYear(grade: number, sequence: LanguageSequence, stateId = ''): number {
  let start = START_GRADE[sequence]
  if (sequence === 'fs2' && LATE_FS2_STATES.includes(stateId)) start += 1
  return Math.max(1, grade - start + 1)
}

/** Fächer, für die ein Grammatik-Schwerpunkt angeboten wird */
export const GRAMMAR_SUBJECTS = ['englisch', 'franzoesisch', 'spanisch', 'italienisch', 'latein', 'deutsch', 'daz']

export const hasGrammar = (subjectId: string): boolean => GRAMMAR_SUBJECTS.includes(subjectId)

/** Fächer, bei denen die Fremdsprachenfolge über das Lernjahr entscheidet */
export const needsSequence = (subjectId: string): boolean => ['englisch', 'franzoesisch', 'spanisch', 'italienisch', 'latein'].includes(subjectId)

/** Übungsformate, die die Recherche je Thema empfiehlt. */
export const GRAMMAR_FORMATS: { id: string; label: string; open: boolean }[] = [
  { id: 'luecke', label: 'Lückentext im Zusammenhang', open: false },
  { id: 'zuordnen', label: 'Zuordnen', open: false },
  { id: 'multiplechoice', label: 'Auswahl (Ankreuzen)', open: false },
  { id: 'formenbestimmen', label: 'Formen bestimmen', open: false },
  { id: 'tabelle', label: 'Raster oder Formentabelle', open: false },
  { id: 'markieren', label: 'Im Text markieren', open: false },
  { id: 'sortieren', label: 'Sortieren und ordnen', open: false },
  { id: 'umformen', label: 'Umformen', open: false },
  { id: 'satzbildung', label: 'Sätze bilden', open: true },
  { id: 'satzanalyse', label: 'Satz erschließen', open: true },
  { id: 'fehlerkorrektur', label: 'Fehler finden und begründen', open: true },
  { id: 'uebersetzen', label: 'Übersetzen oder Sprachmitteln', open: true },
  { id: 'chunks', label: 'Wendungen anwenden', open: true },
  { id: 'freieanwendung', label: 'Freie Anwendung', open: true }
]

export const grammarFormatLabel = (id: string): string => GRAMMAR_FORMATS.find((f) => f.id === id)?.label ?? id

/** Schulformen, an denen die Progression später einsetzt */
const REDUCED = ['hauptschule', 'mittelschule', 'werkrealschule', 'foerderschule-lernen']

export interface GrammarQuery {
  subjectId: string
  grade: number
  schoolTypeId?: string
  stateId?: string
  sequence?: LanguageSequence
  /** DaZ: erreichte Erwerbsstufe (0–6) */
  acquisitionStage?: number
}

/** Stufe, an der ein Thema für diese Lerngruppe gemessen wird. */
export function topicStart(topic: GrammarTopic, sequence: LanguageSequence): number {
  // Spanisch spät beginnend: eigene, gestraffte Progression
  if (sequence === 'spaet' && topic.lateStart) return topic.lateStart
  // 3. Fremdsprache: rund zwei Lernjahre der 2. Fremdsprache in einem
  if (sequence === 'fs3' && topic.scale === 'lernjahr') return Math.ceil(topic.from / 2)
  return topic.from
}

/**
 * Themen, die für Fach, Jahrgang und Schulform in Frage kommen.
 *
 * Ein Jahr Spielraum nach oben und unten, damit Wiederholung und Vorgriff möglich bleiben.
 * Die Auswahl ist eine Orientierung – die Lehrkraft kann jedes Thema wählen, die Liste zeigt
 * nur, was zum Zeitpunkt üblich ist.
 */
export function grammarTopicsFor(query: GrammarQuery): GrammarTopic[] {
  const { subjectId, grade, schoolTypeId = '', stateId = '' } = query
  const sequence = query.sequence ?? defaultSequence(subjectId, grade)
  const shift = REDUCED.includes(schoolTypeId) ? 1 : 0

  return GRAMMAR_TOPICS.filter((t) => {
    if (t.subject !== subjectId) return false

    // DaZ: Was mehr als eine Stufe über dem Stand liegt, ist nicht verarbeitbar – das ist
    // eine Sperre, keine Sortierung. Ohne Diagnose zeigen wir alles.
    if (t.scale === 'erwerbsstufe') {
      const reached = query.acquisitionStage
      return reached === undefined || t.from <= reached + 1
    }

    const start = t.scale === 'jahrgang' ? t.from : topicStart(t, sequence)
    const end = t.scale === 'jahrgang' ? t.to : topicStart({ ...t, from: t.to }, sequence)
    const now = t.scale === 'jahrgang' ? grade : learningYear(grade, sequence, stateId)
    return now + 1 >= start + shift && now - 1 <= end + shift
  })
}

/**
 * Fremdsprachenfolge eines Blattes.
 *
 * Sie wird NICHT gesondert erfragt: Das Blatt trägt die Stellung der Sprache längst in
 * `languageOrder` (1., 2. oder 3. Fremdsprache), und daraus ergibt sich das Lernjahr. Nur den
 * spät beginnenden Fall kann `languageOrder` nicht ausdrücken – dafür gibt es den Schalter
 * `lateStartLanguage`.
 */
export function sequenceOf(meta: Pick<WorksheetMeta, 'languageOrder' | 'lateStartLanguage'>): LanguageSequence {
  if (meta.lateStartLanguage) return 'spaet'
  if (meta.languageOrder >= 3) return 'fs3'
  if (meta.languageOrder === 2) return 'fs2'
  return 'fs1'
}

/** Bequemer Aufruf aus einem Arbeitsblatt heraus. */
export const grammarTopicsForMeta = (meta: WorksheetMeta): GrammarTopic[] =>
  grammarTopicsFor({
    subjectId: meta.subjectId,
    grade: meta.grade,
    schoolTypeId: meta.schoolTypeId,
    stateId: meta.stateId,
    sequence: sequenceOf(meta),
    acquisitionStage: meta.acquisitionStage
  })

/** Klammerzusätze und Mehrfachnennungen abschneiden: „simple past (regular …)" → „simple past" */
const core = (label: string): string =>
  label
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .split(/,| vs\.| und | and /)[0]
    .trim()

/**
 * Findet ein Thema anhand der Eingabe – egal ob aus der Liste gewählt, deutsch benannt
 * oder frei getippt („simple past" trifft auch „simple past (regular and irregular)").
 */
export function findGrammarTopic(subjectId: string, input: string): GrammarTopic | undefined {
  const needle = core(input)
  if (!needle) return undefined
  const mine = GRAMMAR_TOPICS.filter((t) => t.subject === subjectId)
  const exact = input.trim().toLowerCase()
  return (
    mine.find((t) => t.id === exact || t.label.toLowerCase() === exact || t.term.toLowerCase() === exact) ??
    mine.find((t) => core(t.term) === needle || core(t.label) === needle) ??
    mine.find((t) => core(t.term).includes(needle) || core(t.label).includes(needle))
  )
}

/** Themen, die die Lehrkraft für dieses Blatt gewählt hat. */
export function chosenGrammarTopics(meta: WorksheetMeta): GrammarTopic[] {
  const ids = meta.grammarTopics ?? []
  const found = ids.map((id) => GRAMMAR_TOPICS.find((t) => t.id === id)).filter((t): t is GrammarTopic => Boolean(t))
  if (found.length) return found
  // Ältere Blätter haben nur den frei getippten Namen
  const single = findGrammarTopic(meta.subjectId, meta.grammarTopic ?? '')
  return single ? [single] : []
}
