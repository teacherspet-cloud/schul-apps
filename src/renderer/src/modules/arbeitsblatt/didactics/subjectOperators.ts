/**
 * Fachspezifische Operatoren nach den Operatorenlisten der Länder und den KMK-Prüfungsanforderungen.
 *
 * Wichtig: Die Zuordnung zum Anforderungsbereich ist fachabhängig. „vergleichen" gehört in Geschichte
 * zu AFB III, in Erdkunde, Kunst und Religion zu AFB II. In Mathematik und in den modernen Fremdsprachen
 * ist der Anforderungsbereich ausdrücklich NICHT am Operator festgemacht (dort steht null).
 */
import type { Afb } from '../model/types'

export interface SubjectOperators {
  /** Operator (klein geschrieben) → Anforderungsbereich, oder null, wenn im Fach nicht festgelegt */
  afb: Record<string, Afb | null>
  /** Operatoren stehen in der Zielsprache (moderne Fremdsprachen) */
  targetLanguage?: boolean
  note?: string
}

const list = (entries: [string, Afb | null][]): Record<string, Afb | null> => Object.fromEntries(entries)

const NATURWISSENSCHAFT: SubjectOperators = {
  afb: list([
    ['nennen', 'I'],
    ['angeben', 'I'],
    ['beschreiben', 'I'],
    ['benennen', 'I'],
    ['beschriften', 'I'],
    ['skizzieren', 'I'],
    ['zeichnen', 'I'],
    ['zusammenfassen', 'I'],
    ['berechnen', 'I'],
    ['auswerten', 'II'],
    ['analysieren', 'II'],
    ['erklären', 'II'],
    ['erläutern', 'II'],
    ['begründen', 'II'],
    ['vergleichen', 'II'],
    ['ordnen', 'II'],
    ['einordnen', 'II'],
    ['zuordnen', 'II'],
    ['untersuchen', 'II'],
    ['planen', 'II'],
    ['ableiten', 'II'],
    ['deuten', 'II'],
    ['aufstellen', 'II'],
    ['entwickeln', 'II'],
    ['anwenden', 'II'],
    ['bestimmen', 'II'],
    ['ermitteln', 'II'],
    ['prüfen', 'II'],
    ['beurteilen', 'III'],
    ['bewerten', 'III'],
    ['stellung nehmen', 'III'],
    ['erörtern', 'III'],
    ['diskutieren', 'III'],
    ['beweisen', 'III']
  ])
}

const KUENSTE: SubjectOperators = {
  afb: list([
    ['beschreiben', 'I'],
    ['wiedergeben', 'I'],
    ['untersuchen', 'I'],
    ['darstellen', 'I'],
    ['bestimmen', 'II'],
    ['vergleichen', 'II'],
    ['zusammenfassen', 'II'],
    ['analysieren', 'II'],
    ['erläutern', 'II'],
    ['skizzieren', 'II'],
    ['interpretieren', 'III'],
    ['beurteilen', 'III'],
    ['bewerten', 'III'],
    ['erörtern', 'III'],
    ['stellung nehmen', 'III'],
    ['diskutieren', 'III'],
    ['gestalten', 'III'],
    ['entwerfen', 'III']
  ])
}

const SPRACHEN: SubjectOperators = {
  afb: list([
    ['nennen', 'I'],
    ['wiedergeben', 'I'],
    ['beschreiben', 'I'],
    ['zusammenfassen', 'I'],
    ['einordnen', 'I'],
    ['erklären', 'II'],
    ['erschließen', 'II'],
    ['untersuchen', 'II'],
    ['analysieren', 'II'],
    ['charakterisieren', 'II'],
    ['vergleichen', 'II'],
    ['erläutern', 'II'],
    ['in beziehung setzen', 'II'],
    ['deuten', 'III'],
    ['interpretieren', 'III'],
    ['begründen', 'III'],
    ['beurteilen', 'III'],
    ['stellung nehmen', 'III'],
    ['erörtern', 'III'],
    ['gestalten', 'III'],
    ['verfassen', 'III']
  ])
}

export const SUBJECT_OPERATORS: Record<string, SubjectOperators> = {
  geschichte: {
    afb: list([
      ['nennen', 'I'],
      ['aufzählen', 'I'],
      ['beschreiben', 'I'],
      ['zusammenfassen', 'I'],
      ['wiedergeben', 'I'],
      ['darlegen', 'I'],
      ['analysieren', 'II'],
      ['untersuchen', 'II'],
      ['einordnen', 'II'],
      ['erklären', 'II'],
      ['erläutern', 'II'],
      ['herausarbeiten', 'II'],
      ['charakterisieren', 'II'],
      ['gegenüberstellen', 'II'],
      ['nachweisen', 'II'],
      ['widerlegen', 'II'],
      ['beurteilen', 'III'],
      ['bewerten', 'III'],
      ['stellung nehmen', 'III'],
      ['erörtern', 'III'],
      ['diskutieren', 'III'],
      ['überprüfen', 'III'],
      ['vergleichen', 'III'],
      ['entwickeln', 'III']
    ]),
    note: 'In Geschichte zählt „vergleichen" zum Anforderungsbereich III; „beurteilen" meint ein Sachurteil, „bewerten" ein Werturteil mit offengelegten Maßstäben.'
  },
  politik: {
    afb: list([
      ['nennen', 'I'],
      ['beschreiben', 'I'],
      ['zusammenfassen', 'I'],
      ['wiedergeben', 'I'],
      ['analysieren', 'II'],
      ['erklären', 'II'],
      ['erläutern', 'II'],
      ['herausarbeiten', 'II'],
      ['einordnen', 'II'],
      ['vergleichen', 'II'],
      ['beurteilen', 'III'],
      ['bewerten', 'III'],
      ['stellung nehmen', 'III'],
      ['erörtern', 'III'],
      ['diskutieren', 'III'],
      ['entwickeln', 'III']
    ])
  },
  erdkunde: {
    afb: list([
      ['nennen', 'I'],
      ['benennen', 'I'],
      ['beschreiben', 'I'],
      ['darstellen', 'I'],
      ['aufzeigen', 'I'],
      ['wiedergeben', 'I'],
      ['ermitteln', 'I'],
      ['gliedern', 'I'],
      ['analysieren', 'II'],
      ['charakterisieren', 'II'],
      ['einordnen', 'II'],
      ['zuordnen', 'II'],
      ['erklären', 'II'],
      ['erläutern', 'II'],
      ['herausarbeiten', 'II'],
      ['vergleichen', 'II'],
      ['erstellen', 'II'],
      ['begründen', 'III'],
      ['beurteilen', 'III'],
      ['bewerten', 'III'],
      ['entwickeln', 'III'],
      ['erörtern', 'III'],
      ['diskutieren', 'III'],
      ['stellung nehmen', 'III'],
      ['überprüfen', 'III']
    ])
  },
  religion: {
    afb: list([
      ['wiedergeben', 'I'],
      ['nennen', 'I'],
      ['zusammenfassen', 'I'],
      ['beschreiben', 'I'],
      ['erarbeiten', 'II'],
      ['erläutern', 'II'],
      ['herausarbeiten', 'II'],
      ['einordnen', 'II'],
      ['vergleichen', 'II'],
      ['konkretisieren', 'II'],
      ['entfalten', 'II'],
      ['analysieren', 'II'],
      ['beurteilen', 'III'],
      ['bewerten', 'III'],
      ['stellung nehmen', 'III'],
      ['erörtern', 'III'],
      ['entwickeln', 'III'],
      ['entwerfen', 'III'],
      ['überprüfen', 'III'],
      ['in beziehung setzen', 'III']
    ])
  },
  /*
   * Werte und Normen hat eine eigene Operatorenliste, die sich von der des
   * Religionsunterrichts unterscheidet: Sie kennt „einen Argumentationsgang wiedergeben",
   * „debattieren" und „reflektieren", die dort fehlen.
   * Quelle: Kerncurriculum Werte und Normen, Sekundarbereich I, Niedersachsen, Anhang
   * „Operatoren" (selbst ausgelesen, 23.09.2026).
   */
  'werte-und-normen': {
    afb: list([
      ['benennen', 'I'],
      ['beschreiben', 'I'],
      ['darstellen', 'I'],
      ['skizzieren', 'I'],
      ['wiedergeben', 'I'],
      ['zusammenfassen', 'I'],
      ['analysieren', 'II'],
      ['untersuchen', 'II'],
      ['vergleichen', 'II'],
      ['gegenüberstellen', 'II'],
      ['einordnen', 'II'],
      ['sich auseinandersetzen', 'II'],
      ['erklären', 'II'],
      ['herausarbeiten', 'II'],
      ['einen argumentationsgang wiedergeben', 'II'],
      ['erläutern', 'II'],
      ['in beziehung setzen', 'II'],
      ['belegen', 'II'],
      ['nachweisen', 'II'],
      ['beurteilen', 'III'],
      ['erörtern', 'III'],
      ['diskutieren', 'III'],
      ['reflektieren', 'III'],
      ['begründen', 'III'],
      ['entwickeln', 'III'],
      ['prüfen', 'III'],
      ['stellung nehmen', 'III'],
      ['debattieren', null],
      ['gestalten', null],
      ['entwerfen', null]
    ]),
    note: 'Für die neuen Prüfungsformen nennt das Kerncurriculum „debattieren" und „gestalten/entwerfen"; beide können laut Quelle alle drei Anforderungsbereiche umfassen.'
  },
  mathematik: {
    afb: list([
      ['angeben', null],
      ['nennen', null],
      ['berechnen', null],
      ['bestimmen', null],
      ['ermitteln', null],
      ['beschreiben', null],
      ['begründen', null],
      ['nachweisen', null],
      ['zeigen', null],
      ['beurteilen', null],
      ['entscheiden', null],
      ['erläutern', null],
      ['deuten', null],
      ['interpretieren', null],
      ['untersuchen', null],
      ['skizzieren', null],
      ['zeichnen', null],
      ['beweisen', null]
    ]),
    note: 'In Mathematik hängt der Anforderungsbereich nicht am Operator, sondern an der Komplexität der Aufgabe.'
  },
  biologie: NATURWISSENSCHAFT,
  chemie: NATURWISSENSCHAFT,
  physik: NATURWISSENSCHAFT,
  informatik: NATURWISSENSCHAFT,
  sachunterricht: NATURWISSENSCHAFT,
  kunst: KUENSTE,
  musik: KUENSTE,
  deutsch: SPRACHEN,
  latein: SPRACHEN,
  daz: SPRACHEN
}

/** Zielsprachliche Operatoren der modernen Fremdsprachen (ohne feste Zuordnung zum Anforderungsbereich) */
export const FOREIGN_LANGUAGE_OPERATORS = [
  'analyse',
  'assess',
  'comment on',
  'compare',
  'describe',
  'discuss',
  'evaluate',
  'examine',
  'explain',
  'illustrate',
  'interpret',
  'outline',
  'point out',
  'present',
  'state',
  'summarize',
  'sum up',
  'write',
  'complete',
  'fill in',
  'list',
  'match',
  'name',
  'tick'
]

const FOREIGN: SubjectOperators = {
  afb: Object.fromEntries(FOREIGN_LANGUAGE_OPERATORS.map((o) => [o, null])),
  targetLanguage: true,
  note: 'In den modernen Fremdsprachen stehen die Operatoren in der Zielsprache; der Anforderungsbereich ergibt sich aus der Aufgabe.'
}

/** Operatorenliste des Fachs – für die KI-Vorgabe und die automatische Prüfung. */
export function subjectOperators(subjectId: string, foreignLanguage?: string): SubjectOperators | null {
  if (foreignLanguage) return FOREIGN
  return SUBJECT_OPERATORS[subjectId] ?? null
}

/** Mehrteilige Operatoren, die aus zwei Wörtern bestehen */
const TWO_WORD = ['stellung nehmen', 'in beziehung', 'comment on', 'point out', 'sum up', 'fill in']

/** Erster Operator einer Arbeitsanweisung (ohne Auszeichnungen wie **fett**). */
export function leadingOperator(instruction: string): string {
  const words = instruction
    .replace(/\*\*/g, '')
    .replace(/^[\s\d.)]+/, '')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:!?„“"]/g, '').toLowerCase())
  const two = words.slice(0, 2).join(' ')
  if (TWO_WORD.some((t) => two.startsWith(t))) return two === 'in beziehung' ? 'in beziehung setzen' : two
  return words[0] ?? ''
}

/** Wortstamm: „vergleiche" trifft auf „vergleichen", „beschreibt" auf „beschreiben". */
function stem(word: string): string {
  return word.replace(/(est|en|et|st|e|t)$/, '')
}

function matchStem(operator: string, known: string[]): string | undefined {
  const s = stem(operator)
  return s.length >= 4 ? known.find((k) => stem(k) === s) : undefined
}

/** Passt der Operator zum Fach? Liefert den erwarteten Anforderungsbereich, falls das Fach ihn festlegt. */
export function checkSubjectOperator(
  instruction: string,
  subjectId: string,
  foreignLanguage?: string
): { operator: string; listed: string | null; known: boolean; afb: Afb | null } | null {
  const ops = subjectOperators(subjectId, foreignLanguage)
  if (!ops) return null
  const operator = leadingOperator(instruction)
  if (!operator) return null
  const match = operator in ops.afb ? operator : matchStem(operator, Object.keys(ops.afb))
  return { operator, listed: match ?? null, known: Boolean(match), afb: match ? ops.afb[match] : null }
}
