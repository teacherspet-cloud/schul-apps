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
import type { GrammarAbweichung, GrammarTeilform } from './grammarRecherche'
import type { WorksheetMeta } from '../model/types'
import { CEFR_SCALE, cefrIndex, type CefrLevel } from '@shared/types'

export type { GrammarTopic, GrammarAbweichung, GrammarTeilform }
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
  return GRAMMAR_TOPICS.filter((t) => t.subject === query.subjectId && topicFits(t, query))
}

/**
 * Belegte Abweichung für Land, Schulform und Fremdsprachenfolge (Recherche 06.10.2026, grammarRecherche.ts) – die
 * spezifischste gewinnt: Land UND Schulform vor nur einem von beiden, mit passender Folge vor ohne Folge. Abweichungen
 * einzelner Teilformen zählen hier nicht.
 */
export function abweichungFuer(t: GrammarTopic, query: Pick<GrammarQuery, 'stateId' | 'schoolTypeId' | 'sequence' | 'grade'>): GrammarAbweichung | undefined {
  const stateId = query.stateId ?? ''
  const schoolTypeId = query.schoolTypeId ?? ''
  const sequence = query.sequence ?? defaultSequence(t.subject, query.grade)
  const passend = (t.abweichungen ?? []).filter(
    (a) =>
      !a.teilform &&
      (!a.laender.length || a.laender.includes(stateId)) &&
      (!a.schulformen.length || a.schulformen.includes(schoolTypeId)) &&
      (!a.folge || a.folge === sequence)
  )
  const wert = (a: GrammarAbweichung): number => (a.laender.length ? 2 : 0) + (a.schulformen.length ? 2 : 0) + (a.folge ? 1 : 0)
  return passend.sort((a, b) => wert(b) - wert(a))[0]
}

/** Stufenfenster eines Themas für die Lerngruppe auf ihrer Skala, oder null (im Plan dieser Schulform nicht genannt) */
function fenster(t: GrammarTopic, query: GrammarQuery, sequence: LanguageSequence): { start: number; end: number; belegt: boolean } | null {
  const a = abweichungFuer(t, { ...query, sequence })
  if (a?.entfaellt) return null
  if (a && a.from !== undefined) {
    // Mit Folge (3. FS, spät beginnend) zählt die Abweichung im Lernjahr DIESES Kurses – nicht umrechnen
    if (a.folge || t.scale !== 'lernjahr') return { start: a.from, end: a.to ?? a.from, belegt: true }
    return {
      start: topicStart({ ...t, from: a.from, lateStart: undefined }, sequence),
      end: topicStart({ ...t, from: a.to ?? a.from, lateStart: undefined }, sequence),
      belegt: true
    }
  }
  const start = t.scale === 'jahrgang' ? t.from : topicStart(t, sequence)
  const end = t.scale === 'jahrgang' ? t.to : topicStart({ ...t, from: t.to }, sequence)
  return { start, end, belegt: false }
}

/** Passt ein Thema zur Lerngruppe? */
export function topicFits(t: GrammarTopic, query: GrammarQuery): boolean {
  const { grade, schoolTypeId = '', stateId = '' } = query
  const sequence = query.sequence ?? defaultSequence(t.subject, grade)

  // DaZ: Was mehr als eine Stufe über dem Stand liegt, ist nicht verarbeitbar – das ist
  // eine Sperre, keine Sortierung. Ohne Diagnose zeigen wir alles.
  if (t.scale === 'erwerbsstufe') {
    const reached = query.acquisitionStage
    return reached === undefined || t.from <= reached + 1
  }

  const a = abweichungFuer(t, { ...query, sequence })
  // Nur eine GER-Stufe belegt (Hamburger Basisgrammatik): dann entscheidet das Niveau der Lerngruppe, sofern gewählt
  if (a?.niveau && a.from === undefined && !a.entfaellt && query.cefrLevel) return !ueberNiveau({ level: a.niveau }, query.cefrLevel)
  const f = fenster(t, query, sequence)
  if (!f) return false
  // Eine belegte Abweichung ersetzt die pauschale Verschiebung für Haupt-/Mittelschule
  const shift = !f.belegt && REDUCED.includes(schoolTypeId) ? 1 : 0
  const now = t.scale === 'jahrgang' ? grade : learningYear(grade, sequence, stateId)
  if (t.scale === 'lernjahr' && ueberNiveau(t, query.cefrLevel)) return false
  return now + 1 >= f.start + shift && now - 1 <= f.end + shift
}

/** Kurzer Hinweis, wenn für Land/Schulform eine belegte Abweichung gilt (Auswahl der Themen) */
export function abweichungsHinweis(t: GrammarTopic, query: GrammarQuery): string {
  const a = abweichungFuer(t, query)
  if (!a) return ''
  const wo = [a.laender.join('/'), a.folgeText].filter(Boolean).join(', ')
  const skala = t.scale === 'jahrgang' ? 'Jg.' : 'Lernjahr'
  const was = a.entfaellt
    ? 'im Lehrplan dieser Schulform nicht genannt'
    : a.from !== undefined
      ? `dort ${skala} ${a.to === undefined || a.from === a.to ? a.from : `${a.from}–${a.to}`}`
      : a.niveau
        ? `dort auf ${a.niveau}`
        : ''
  return [wo && `${wo}:`, was, a.nurErkennen ? '(nur erkennen)' : '', a.fakultativ ? '(Wahlinhalt)' : '', a.hinweis ? `– ${a.hinweis}` : '']
    .filter(Boolean)
    .join(' ')
}

export type TeilformStatus = 'bilden' | 'erkennen' | 'spaeter'

/**
 * Teilformen eines Themas für die Lerngruppe: selbst bilden, nur erkennen oder erst später. Maßstab ist das Lernjahr
 * (bzw. der Jahrgang) – bei einer belegten Abweichung des Themas um dieselbe Spanne verschoben –, dazu das GER-Niveau
 * der Lerngruppe (eine Teilstufe Spielraum wie bei den Themen) und Abweichungen einzelner Teilformen.
 */
export function teilformenFuer(t: GrammarTopic, query: GrammarQuery): { teil: GrammarTeilform; status: TeilformStatus; hinweis?: string }[] {
  const teile = t.teilformen ?? []
  if (!teile.length) return []
  const sequence = query.sequence ?? defaultSequence(t.subject, query.grade)
  if (t.scale === 'erwerbsstufe') {
    const r = query.acquisitionStage
    return teile.map((teil) => ({ teil, status: r === undefined || teil.from <= r + 1 ? (teil.nurErkennen ? 'erkennen' : 'bilden') : 'spaeter' }))
  }
  const f = fenster(t, query, sequence)
  const basis = t.scale === 'jahrgang' ? t.from : topicStart(t, sequence)
  const versatz = f ? f.start - basis : 0
  const now = t.scale === 'jahrgang' ? query.grade : learningYear(query.grade, sequence, query.stateId ?? '')
  const shift = f && !f.belegt && REDUCED.includes(query.schoolTypeId ?? '') ? 1 : 0
  return teile.map((teil) => {
    const eigene = (t.abweichungen ?? []).find(
      (a) =>
        a.teilform === teil.id &&
        (!a.laender.length || a.laender.includes(query.stateId ?? '')) &&
        (!a.schulformen.length || a.schulformen.includes(query.schoolTypeId ?? '')) &&
        (!a.folge || a.folge === sequence)
    )
    if (eigene?.entfaellt) return { teil, status: 'spaeter' as const, hinweis: 'im Lehrplan dieser Schulform nicht genannt' }
    const von =
      eigene?.from !== undefined
        ? eigene.from
        : t.scale === 'jahrgang'
          ? teil.from + versatz
          : topicStart({ ...t, from: teil.from, lateStart: undefined }, sequence) + versatz
    if (now < von + shift) return { teil, status: 'spaeter' as const }
    const ueber = t.scale === 'lernjahr' && teil.bilden && query.cefrLevel ? ueberNiveau({ level: teil.bilden }, query.cefrLevel) : false
    const erkennen = teil.nurErkennen || eigene?.nurErkennen || ueber
    return { teil, status: erkennen ? ('erkennen' as const) : ('bilden' as const) }
  })
}

/**
 * Teilformen als Auftrag an die KI (Arbeitsblatt, Grammatiktest, Grammatiktraining): was gebildet, was nur erkannt
 * werden soll und was noch nicht vorkommt. `gewaehlt` = Kennungen „thema/teilform" der Lehrkraft; leer = alle passenden.
 */
export function teilformenAuftrag(topics: GrammarTopic[], query: GrammarQuery, gewaehlt: string[] = []): string {
  const zeilen: string[] = []
  for (const t of topics) {
    const liste = teilformenFuer(t, query)
    if (!liste.length) continue
    const eigene = gewaehlt.filter((g) => g.startsWith(`${t.id}/`))
    const im = (x: { teil: GrammarTeilform }): boolean => !eigene.length || eigene.includes(`${t.id}/${x.teil.id}`)
    const name = (x: { teil: GrammarTeilform }): string => `${x.teil.label}${x.teil.term ? ` (${x.teil.term})` : ''}`
    const bilden = liste.filter((x) => x.status === 'bilden' && im(x))
    const erkennen = liste.filter((x) => x.status === 'erkennen' && im(x))
    const spaeter = liste.filter((x) => x.status === 'spaeter' || !im(x))
    zeilen.push(
      `TEILFORMEN – ${t.label}${eigene.length ? ' (von der Lehrkraft ausgewählt)' : ''}:`,
      bilden.length ? `- selbst bilden: ${bilden.map(name).join('; ')}` : '',
      erkennen.length ? `- nur erkennen (keine Produktionsaufgabe dazu): ${erkennen.map(name).join('; ')}` : '',
      spaeter.length ? `- NICHT verwenden (${eigene.length ? 'nicht gewählt oder ' : ''}erst später): ${spaeter.map(name).join('; ')}` : '',
      ...[...bilden, ...erkennen]
        .filter((x) => x.teil.fehler)
        .slice(0, 6)
        .map((x) => `- Stolperstelle ${x.teil.label}: ${x.teil.fehler}`)
    )
  }
  return zeilen.filter(Boolean).join('\n')
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

/** Lerngruppe eines Blattes als Anfrage an den Katalog */
export const grammarQueryForMeta = (meta: WorksheetMeta): GrammarQuery => ({
  subjectId: meta.subjectId,
  grade: meta.grade,
  schoolTypeId: meta.schoolTypeId,
  stateId: meta.stateId,
  sequence: sequenceOf(meta),
  acquisitionStage: meta.acquisitionStage,
  cefrLevel: meta.cefrLevel || undefined
})

/** Bequemer Aufruf aus einem Arbeitsblatt heraus. */
export const grammarTopicsForMeta = (meta: WorksheetMeta): GrammarTopic[] => grammarTopicsFor(grammarQueryForMeta(meta))

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
