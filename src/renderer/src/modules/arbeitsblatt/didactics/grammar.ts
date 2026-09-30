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
import { CEFR_SCALE, cefrIndex, type CefrLevel } from '@shared/types'

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
 * Englisch ist an fast allen Schulen die 1. Fremdsprache; Französisch, Latein und Russisch sind
 * üblicherweise die zweite, Spanisch und Italienisch die zweite oder dritte, Griechisch die dritte.
 */
export function defaultSequence(subjectId: string, grade: number): LanguageSequence {
  if (subjectId === 'englisch') return 'fs1'
  // Chinesisch und Portugiesisch werden wie Spanisch und Italienisch oft als 3. oder spät beginnende Fremdsprache gelernt (Faustregel)
  if (['spanisch', 'italienisch', 'chinesisch', 'portugiesisch'].includes(subjectId)) {
    if (grade >= 11) return 'spaet'
    return grade >= 8 ? 'fs3' : 'fs2'
  }
  // Griechisch ist fast überall 3. Fremdsprache ab Klasse 8 (Bayern, Baden-Württemberg, NRW)
  if (subjectId === 'griechisch') return grade >= 8 ? 'fs3' : 'fs2'
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

/**
 * Fächer, für die ein Grammatik-Schwerpunkt angeboten wird. Seit 30.09.2026 auch die neuen
 * Schulfremdsprachen (Themen in grammarTopicsNeueSprachen.ts).
 */
export const NEUE_SCHULSPRACHEN = ['niederlaendisch', 'polnisch', 'tschechisch', 'portugiesisch', 'tuerkisch', 'chinesisch']

export const GRAMMAR_SUBJECTS = [
  'englisch',
  'franzoesisch',
  'spanisch',
  'italienisch',
  'russisch',
  'latein',
  'griechisch',
  'deutsch',
  'daz',
  ...NEUE_SCHULSPRACHEN
]

export const hasGrammar = (subjectId: string): boolean => GRAMMAR_SUBJECTS.includes(subjectId)

/** Fächer, bei denen die Fremdsprachenfolge über das Lernjahr entscheidet */
export const needsSequence = (subjectId: string): boolean =>
  ['englisch', 'franzoesisch', 'spanisch', 'italienisch', 'russisch', 'latein', 'griechisch', ...NEUE_SCHULSPRACHEN].includes(subjectId)

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
  /**
   * Gewähltes GER-Niveau der Lerngruppe (Fremdsprachen). Themen, die erst auf einem höheren
   * Niveau eingeführt werden, fallen weg – siehe `einfuehrungsNiveau`.
   */
  cefrLevel?: CefrLevel
}

/**
 * Das GER-Niveau, auf dem ein Thema eingeführt wird: das NIEDRIGSTE in seiner Stufenangabe
 * („A2/B1" → A2, „A1→B1" → A1). null bei Angaben ohne GER-Niveau (Latein „Lehrbuch", Deutsch
 * „Sek I").
 */
export function einfuehrungsNiveau(level: string): CefrLevel | null {
  const treffer = level.match(/Pre-A1|[ABC][12]\+?/g) ?? []
  const stufen = treffer.filter((x) => (CEFR_SCALE as readonly string[]).includes(x)) as CefrLevel[]
  if (!stufen.length) return null
  return stufen.reduce<CefrLevel>((a, b) => (cefrIndex(b) < cefrIndex(a) ? b : a), stufen[0])
}

/**
 * Liegt die Einführung eines Themas über dem gewählten Niveau? (Ohne GER-Angabe: nein)
 *
 * SPIELRAUM eine Teilstufe (A1 → bis A1+, A1+ → bis A2, A2 → bis A2+): Das Niveau der
 * Niveautabelle ist das ZIEL am Ende des Schuljahres, die Stufenangabe der Themen die
 * Ersteinführung laut Lehrplänen und Lehrwerken. Mit dieser Teilstufe fallen in Klasse 5 (A1)
 * die Themen mit „A2" und „A2/B1" weg, während Klasse 6 (A1+) Perfekt und Steigerung (A2) behält.
 * FAUSTREGEL, an den Daten der Grammatiktabelle geprüft (tests/grammatikNiveau.test.ts).
 */
export function ueberNiveau(topic: Pick<GrammarTopic, 'level'>, cefrLevel: CefrLevel | undefined): boolean {
  const n = einfuehrungsNiveau(topic.level)
  return Boolean(cefrLevel && n && cefrIndex(n) > cefrIndex(cefrLevel) + 1)
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
 *
 * NIVEAU (Befund der Lehrkraft vom 26.09.2026): Der Spielraum nach oben holte in Klasse 5 bei
 * gewähltem A1 Themen des 2. Lernjahres mit „A2/B1" in die Liste – das Niveau zählte gar nicht.
 * Ist ein GER-Niveau gewählt, fallen deshalb Themen weg, die erst darüber eingeführt werden.
 * Der Vorgriff bleibt innerhalb des Niveaus möglich; wer mehr will, schaltet „Alle Themen des
 * Fachs" ein.
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
    if (t.scale === 'lernjahr' && ueberNiveau(t, query.cefrLevel)) return false
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
    acquisitionStage: meta.acquisitionStage,
    cefrLevel: meta.cefrLevel || undefined
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
