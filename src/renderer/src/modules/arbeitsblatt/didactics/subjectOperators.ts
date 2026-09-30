/**
 * Fachspezifische Operatoren nach den Operatorenlisten der Länder und den KMK-Prüfungsanforderungen.
 *
 * Wichtig: Die Zuordnung zum Anforderungsbereich ist fachabhängig. „vergleichen" gehört in Geschichte
 * zu AFB III, in Erdkunde, Kunst und Religion zu AFB II. In Mathematik und in den modernen Fremdsprachen
 * ist der Anforderungsbereich ausdrücklich NICHT am Operator festgemacht (dort steht null).
 */
import { ersterOperator, pruefeAnweisung, type ErkennungsSprache } from '@shared/operatoren/erkennung'
import { operatorenAuswahl } from '@shared/operatoren/zugriff'
import type { Afb } from '../model/types'

export interface SubjectOperators {
  /** Operator (klein geschrieben) → Anforderungsbereich, oder null, wenn im Fach nicht festgelegt */
  afb: Record<string, Afb | null>
  /** Operatoren stehen in der Zielsprache (moderne Fremdsprachen) */
  targetLanguage?: boolean
  /** Diese Operatoren nennt die KI-Vorgabe (sonst alle aus `afb`) – z. B. nur die du-Form */
  zeigen?: string[]
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

/**
 * Operatoren der romanischen Sprachen in der Befehlsform, wie sie in Aufgaben stehen (Praxislauf
 * 28.09.2026: Die französische Klassenarbeit bekam „**Write** un e-mail", weil es nur die
 * englische Liste gab). Erste Form = Anrede mit „tu", zweite = „vous"/„vosotros"/„voi" – die
 * Prüfung erkennt beide, die KI-Vorgabe nennt die erste.
 */
const ROMANISCHE_OPERATOREN: Record<'fr' | 'es' | 'it', [string, string][]> = {
  fr: [
    ['analyse', 'analysez'],
    ['caractérise', 'caractérisez'],
    ['commente', 'commentez'],
    ['compare', 'comparez'],
    ['décris', 'décrivez'],
    ['discute', 'discutez'],
    ['évalue', 'évaluez'],
    ['examine', 'examinez'],
    ['explique', 'expliquez'],
    ['expose', 'exposez'],
    ['illustre', 'illustrez'],
    ['interprète', 'interprétez'],
    ['justifie', 'justifiez'],
    ['présente', 'présentez'],
    ['relève', 'relevez'],
    ['résume', 'résumez'],
    ['rédige', 'rédigez'],
    ['écris', 'écrivez'],
    ['raconte', 'racontez'],
    ['réponds', 'répondez'],
    ['complète', 'complétez'],
    ['relie', 'reliez'],
    ['nomme', 'nommez'],
    ['coche', 'cochez'],
    ['indique', 'indiquez'],
    ['énumère', 'énumérez'],
    ['souligne', 'soulignez'],
    ['choisis', 'choisissez'],
    ['donne', 'donnez']
  ],
  es: [
    ['analiza', 'analizad'],
    ['caracteriza', 'caracterizad'],
    ['comenta', 'comentad'],
    ['compara', 'comparad'],
    ['describe', 'describid'],
    ['discute', 'discutid'],
    ['evalúa', 'evaluad'],
    ['examina', 'examinad'],
    ['explica', 'explicad'],
    ['expón', 'exponed'],
    ['ilustra', 'ilustrad'],
    ['interpreta', 'interpretad'],
    ['justifica', 'justificad'],
    ['presenta', 'presentad'],
    ['señala', 'señalad'],
    ['resume', 'resumid'],
    ['redacta', 'redactad'],
    ['escribe', 'escribid'],
    ['cuenta', 'contad'],
    ['responde', 'responded'],
    ['completa', 'completad'],
    ['relaciona', 'relacionad'],
    ['nombra', 'nombrad'],
    ['marca', 'marcad'],
    ['indica', 'indicad'],
    ['enumera', 'enumerad'],
    ['subraya', 'subrayad'],
    ['elige', 'elegid'],
    ['da', 'dad']
  ],
  it: [
    ['analizza', 'analizzate'],
    ['caratterizza', 'caratterizzate'],
    ['commenta', 'commentate'],
    ['confronta', 'confrontate'],
    ['descrivi', 'descrivete'],
    ['discuti', 'discutete'],
    ['valuta', 'valutate'],
    ['esamina', 'esaminate'],
    ['spiega', 'spiegate'],
    ['illustra', 'illustrate'],
    ['interpreta', 'interpretate'],
    ['giustifica', 'giustificate'],
    ['presenta', 'presentate'],
    ['riassumi', 'riassumete'],
    ['scrivi', 'scrivete'],
    ['racconta', 'raccontate'],
    ['rispondi', 'rispondete'],
    ['completa', 'completate'],
    ['abbina', 'abbinate'],
    ['nomina', 'nominate'],
    ['segna', 'segnate'],
    ['indica', 'indicate'],
    ['elenca', 'elencate'],
    ['sottolinea', 'sottolineate'],
    ['scegli', 'scegliete']
  ]
}

const HINWEIS_ZIELSPRACHE = 'In den modernen Fremdsprachen stehen die Operatoren in der Zielsprache; der Anforderungsbereich ergibt sich aus der Aufgabe.'

const FOREIGN: SubjectOperators = {
  afb: Object.fromEntries(FOREIGN_LANGUAGE_OPERATORS.map((o) => [o, null])),
  targetLanguage: true,
  note: HINWEIS_ZIELSPRACHE
}

const ROMANISCH: Record<string, SubjectOperators> = Object.fromEntries(
  Object.entries(ROMANISCHE_OPERATOREN).map(([sprache, paare]) => [
    sprache,
    {
      // Nur die erste Form steht in der Vorgabe (`zeigen`), erkannt werden beide
      afb: Object.fromEntries(
        paare.flatMap(([du, ihr]) => [
          [du, null],
          [ihr, null]
        ])
      ),
      zeigen: paare.map(([du]) => du),
      targetLanguage: true,
      note: `${HINWEIS_ZIELSPRACHE} Die Operatoren stehen in der Befehlsform am Anfang der Aufgabe (${sprache === 'fr' ? '„Décris …", „Rédige …"' : sprache === 'es' ? '„Describe …", „Redacta …"' : '„Descrivi …", „Scrivi …"'}); in der Oberstufe ist auch die Höflichkeits- bzw. Pluralform üblich.`
    }
  ])
)

/** Operatorenliste des Fachs – für die KI-Vorgabe und die automatische Prüfung. */
export function subjectOperators(subjectId: string, foreignLanguage?: string): SubjectOperators | null {
  if (foreignLanguage) return ROMANISCH[foreignLanguage] ?? FOREIGN
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

export interface OperatorKontext {
  stateId: string
  stufe: 'sek1' | 'sek2'
  schulform?: string
}

export interface OperatorPruefung {
  /** Das erste Wort der Anweisung (für Meldungen) */
  operator: string
  /** Der erkannte Listeneintrag */
  listed: string | null
  known: boolean
  afb: Afb | null
  /** Nächstliegender Operator der Liste, wenn der verwendete dort nicht steht */
  vorschlag?: string | null
  /** Fundstelle, wenn gegen die Landesliste geprüft wurde */
  landesliste?: string
}

/**
 * Passt der Operator zum Fach? Liefert den erwarteten Anforderungsbereich, falls die Liste ihn festlegt.
 *
 * Seit 30.09.2026 über die gemeinsame Erkennung (`@shared/operatoren/erkennung`): Sie-Form,
 * ihr-Form und trennbare Verben („Arbeiten Sie … heraus") zählen. Mit `kontext` wird gegen die
 * Liste DES LANDES für genau diese Stufe geprüft – ein Verb ist dann nur Operator, wenn es dort
 * steht; ohne Landesliste gegen die fachübliche Liste.
 */
export function checkSubjectOperator(instruction: string, subjectId: string, foreignLanguage?: string, kontext?: OperatorKontext): OperatorPruefung | null {
  const ops = subjectOperators(subjectId, foreignLanguage)
  const sprache = (foreignLanguage ?? 'de') as ErkennungsSprache
  const auswahl = kontext
    ? operatorenAuswahl({ stateId: kontext.stateId, fach: subjectId, stufe: kontext.stufe, schulform: kontext.schulform, nurLand: true, sprache })
    : null
  const land = auswahl && !auswahl.stufeAbweichend && auswahl.sprache === sprache ? auswahl : null
  if (!ops && !land) return null
  const operator = leadingOperator(instruction)
  if (!operator) return null
  if (land) {
    const b = pruefeAnweisung(instruction, land.operatoren, { sprache })
    if (b.art === 'operator') {
      const def = land.operatoren[b.treffer[0].index]
      // Nur ein eindeutiger Anforderungsbereich der Landesliste wird geprüft
      const afb = def?.afb === 'I' || def?.afb === 'II' || def?.afb === 'III' ? def.afb : null
      return { operator, listed: b.treffer[0].operator, known: true, afb, landesliste: land.quelle }
    }
    return { operator, listed: null, known: false, afb: null, vorschlag: b.art === 'fremd' ? b.vorschlag : null, landesliste: land.quelle }
  }
  const namen = Object.keys(ops!.afb)
  const treffer = ersterOperator(instruction, namen, { sprache })
  if (treffer) return { operator, listed: treffer.operator, known: true, afb: ops!.afb[treffer.operator] }
  // Rückfall: das erste Wort über den Stamm (bisheriges Verhalten)
  const match = operator in ops!.afb ? operator : matchStem(operator, namen)
  if (match) return { operator, listed: match, known: true, afb: ops!.afb[match] }
  const b = pruefeAnweisung(instruction, namen, { sprache })
  return { operator, listed: null, known: false, afb: null, vorschlag: b.art === 'fremd' ? b.vorschlag : null }
}
