import type { CefrLevel } from '@shared/types'

export interface VocabEntry {
  id: string
  term: string
  translation: string
  pos?: string
  note?: string
  /** Ergebnis der KI-Analyse (für Bild-/Rätselaufgaben) */
  depictable?: boolean
  imageKeywords?: string[]
  /** Kurze englische Bildidee für genau diese Bedeutung (z. B. „a flying bat, the animal“) */
  imageHint?: string
  /** In der Vorlage grau bzw. unauffälliger gedruckt (oft passiver Wortschatz) */
  grey?: boolean
  /** In der Vorlage in einem Kasten (z. B. Info- oder Wortfeld-Kasten) */
  inBox?: boolean
  /** Wird im Test abgefragt (fehlt = ja) – gehört zum Test, nicht zur gespeicherten Liste */
  include?: boolean
  /**
   * LATEIN: Wortart und Nennform.
   *
   * Eine lateinische Vokabel ist ohne ihr „grammatisches Beiwerk" unvollständig – der
   * amtliche Muster-Vokabeltest (Leitfaden Latein SH 2016, S. 25) fragt es Spalte für Spalte
   * mit ab. Welche Form verlangt wird, hängt an der Wortart, deshalb beides zusammen.
   *
   * `nennform` steht so, wie das Lehrwerk sie druckt: „servī m.", „cantō, cantāvī, cantātum",
   * „-a, -um", „+ Abl.". In den Anfangslektionen geben manche Lehrwerke statt des Genitivs
   * den Akkusativ an (belegt für Pontes) – deshalb ein freies Feld und keine Zerlegung.
   */
  wordClass?: LatinWordClass
  nennform?: string
}

/** Wortarten, für die es im Lateinischen eine eigene Nennform gibt. */
export type LatinWordClass = 'substantiv' | 'verb' | 'adjektiv' | 'praeposition' | 'pronomen' | 'adverb' | 'sonstiges'

export interface ImageRef {
  dataUrl: string
  source: 'openmoji' | 'own' | 'openverse' | 'pixabay' | 'wikimedia' | 'clipart' | 'ai'
  credit?: string
}

export type TaskTypeId =
  | 'gapSentences'
  | 'gapText'
  | 'dialogue'
  | 'matchDefinitions'
  | 'writeDefinitions'
  | 'pictureLabel'
  | 'multipleChoice'
  | 'synonymsAntonyms'
  | 'wordFormation'
  | 'collocations'
  | 'oddOneOut'
  | 'categorize'
  | 'mindmap'
  | 'wordFamily'
  | 'writeSentences'
  | 'mediation'
  | 'crossword'
  | 'scrambled'
  | 'wrongWord'
  | 'twoSentences'
  | 'trueFalse'
  | 'freeText'
  // Latein (siehe `didactics/latein.ts`)
  | 'latinForms'
  | 'latinLoanWords'
  | 'latinWordFormation'
  | 'latinContext'

// ---------- Blöcke (eine Aufgabe im Test) ----------

interface BlockBase {
  id: string
  taskType: TaskTypeId
  title: string
  instruction: string
  pointsPerItem: number
  /** Hinweise aus der Qualitätsprüfung, nur im Editor sichtbar */
  warnings?: string[]
  /** Automatische Hinweiszeile für Schüler anzeigen (Standard: ja) */
  showHelp?: boolean
}

/** Satz mit Lücke: before ___ after. Mehrere Sätze pro Item für „ein Wort passt in beide Sätze". */
export interface GapSentence {
  before: string
  after: string
}

export interface GapItem {
  id: string
  vocabId?: string
  sentences: GapSentence[]
  answer: string
  /** Hinweis in Klammern, z. B. Stammwort bei Wortbildung oder falsches Wort */
  hint?: string
  /** Wort für den Wortkasten (Grundform) */
  bankWord?: string
  /** Anfangsbuchstabe nur für dieses Item vorgeben (z. B. weil es sonst mehrdeutig wäre) */
  firstLetter?: boolean
}

export interface GapBlock extends BlockBase {
  kind: 'gap'
  items: GapItem[]
  wordBank: boolean
  firstLetterHint: boolean
  extraBankWords: string[]
}

export type TextPart = { type: 'text'; text: string } | { type: 'gap'; id: string; answer: string; bankWord?: string; vocabId?: string; firstLetter?: boolean }

export interface GapTextBlock extends BlockBase {
  kind: 'gapText'
  parts: TextPart[]
  wordBank: boolean
  firstLetterHint: boolean
  extraBankWords: string[]
}

export interface MatchLeft {
  id: string
  vocabId?: string
  text: string
  answerId: string
}

export interface MatchBlock extends BlockBase {
  kind: 'match'
  leftLabel: string
  rightLabel: string
  left: MatchLeft[]
  right: { id: string; text: string }[]
}

export interface ChoiceItem {
  id: string
  vocabId?: string
  before: string
  after: string
  options: string[]
  correct: number
}

export interface ChoiceBlock extends BlockBase {
  kind: 'choice'
  items: ChoiceItem[]
}

export interface OpenItem {
  id: string
  vocabId?: string
  prompt: string
  modelAnswer: string
  lines: number
}

export interface OpenBlock extends BlockBase {
  kind: 'open'
  items: OpenItem[]
}

/**
 * LATEIN: eine Zeile des Muster-Vokabeltests.
 *
 * Aufbau nach dem Leitfaden Latein SH 2016, S. 25: Die Vokabel steht da, die Lernenden
 * ergänzen die verlangte Form und ALLE Bedeutungen. `formLabel` sagt, welche Form gemeint
 * ist („Genitiv:", „Stammformen:", „f./n.:", „m. Kasus:") – ohne diese Ansage wüsste man bei
 * einem Substantiv nicht, ob Genitiv oder Akkusativ gefragt ist.
 */
export interface LatinFormItem {
  id: string
  vocabId?: string
  term: string
  formLabel: string
  form: string
  meanings: string
}

export interface LatinFormsBlock extends BlockBase {
  kind: 'latinForms'
  items: LatinFormItem[]
  /** Punkte für die Form und für die Bedeutungen getrennt – siehe `didactics/latein.ts` */
  pointsForm: number
  pointsMeaning: number
}

export interface TrueFalseItem {
  id: string
  vocabId?: string
  statement: string
  isTrue: boolean
  correction: string
}

export interface TrueFalseBlock extends BlockBase {
  kind: 'trueFalse'
  items: TrueFalseItem[]
  askCorrection: boolean
}

export interface OddOneOutItem {
  id: string
  vocabId?: string
  words: string[]
  answer: string
  reason: string
}

export interface OddOneOutBlock extends BlockBase {
  kind: 'oddOneOut'
  items: OddOneOutItem[]
  askReason: boolean
}

export interface CategorizeBlock extends BlockBase {
  kind: 'categorize'
  categories: { id: string; name: string }[]
  words: { id: string; vocabId?: string; text: string; categoryId: string }[]
}

/**
 * Mindmap: In der Mitte steht ein Oberbegriff (z. B. „School things"), ringsum leere
 * Äste, in die die Lernenden die gelernten Vokabeln eintragen.
 */
export interface MindmapBlock extends BlockBase {
  kind: 'mindmap'
  topic: string
  /** Erwartete Wörter – zugleich die Zahl der leeren Äste */
  items: { id: string; vocabId?: string; answer: string }[]
}

export interface PictureItem {
  id: string
  vocabId?: string
  answer: string
  image?: ImageRef
  imageKeywords: string[]
}

export interface PictureBlock extends BlockBase {
  kind: 'picture'
  items: PictureItem[]
  wordBank: boolean
  /** Überzählige Wörter im Wortkasten (ohne Bild) */
  extraBankWords?: string[]
  columns: number
}

export interface ScrambleItem {
  id: string
  vocabId?: string
  hint: string
  scrambled: string
  answer: string
}

export interface ScrambleBlock extends BlockBase {
  kind: 'scramble'
  items: ScrambleItem[]
}

export interface CrosswordEntry {
  id: string
  vocabId?: string
  answer: string
  clue: string
  row: number
  col: number
  dir: 'across' | 'down'
  number: number
}

export interface CrosswordBlock extends BlockBase {
  kind: 'crossword'
  rows: number
  cols: number
  entries: CrosswordEntry[]
  /** Begriffe, die nicht ins Gitter passten */
  unplaced: string[]
}

export interface FreeTextBlock extends BlockBase {
  kind: 'freeText'
  text: string
  lines: number
}

export type Block =
  | GapBlock
  | GapTextBlock
  | MatchBlock
  | ChoiceBlock
  | OpenBlock
  | TrueFalseBlock
  | OddOneOutBlock
  | CategorizeBlock
  | MindmapBlock
  | PictureBlock
  | ScrambleBlock
  | CrosswordBlock
  | FreeTextBlock
  | LatinFormsBlock

export type BlockKind = Block['kind']

// ---------- Test ----------

export interface Variant {
  id: string
  label: string
  blocks: Block[]
}

export interface TestHeader {
  title: string
  showName: boolean
  showDate: boolean
  showClass: boolean
  showSchool: boolean
  schoolName: string
  showVariant: boolean
  showPoints: boolean
  showGrade: boolean
  subtitle: string
  /**
   * „Schwarz statt Fachfarbe" (Paket 10a): true = Kopflinie und Aufgabennummern schwarz wie
   * bisher. Fehlt = Fachfarbe der Sprache (Englisch, Französisch …) aus den Einstellungen.
   */
  vorlagenfarbe?: boolean
  /**
   * Überthema im Kopf (Paket 11, shared/ueberthema.ts), z. B. „Englisch › Unit 3": eigener
   * Eintrag, abgeschaltet und – nur zum Anzeigen – der Themenbereich bzw. die Unit der Liste.
   */
  ueberthema?: string
  ueberthemaAus?: boolean
  themenbereich?: string
}

export interface TaskSelection {
  type: TaskTypeId
  count: number
  pointsPerItem: number
}

export interface TestSettings {
  targetLanguage: string
  stateId: string
  schoolTypeId: string
  languageOrder: number
  grade: number
  level: CefrLevel
  vocabCount: number
  variantCount: number
  variantMode: 'sameVocab' | 'differentVocab'
  tasks: TaskSelection[]
  topic: string
  /** auto = Piktogramme und Cliparts, von der KI geprüft, sonst KI-Clipart */
  pictureSource: 'auto' | 'openmoji' | 'ai' | 'none'
  /**
   * Wortkasten bei „Bilder beschriften": Die Wörter stehen als Hilfe dabei.
   * Fehlt = aus – am Gymnasium sollen die Lernenden die Wörter selbst abrufen.
   */
  pictureWordBank?: boolean
  answerKey: boolean
  seed: number
  /** Vorgabe zur Seitenzahl je Testvariante (Schülerblatt) */
  pageLimit?: PageLimit
}

export interface PageLimit {
  /**
   * auto = so viele Seiten wie nötig, max = höchstens, exact = genau, range = von–bis
   * (Paket 7, Wunsch der Lehrkraft: „2–3 Seiten")
   */
  mode: 'auto' | 'max' | 'exact' | 'range'
  /** Seitenzahl bzw. bei „range" die Obergrenze */
  pages: number
  /** Nur bei „range": die Untergrenze */
  pagesMin?: number
}

export interface TestDocument {
  version: 1
  header: TestHeader
  settings: TestSettings
  vocab: VocabEntry[]
  variants: Variant[]
  fontSize: number
  createdAt: string
}

export const LANGUAGES: { value: string; label: string; english: string }[] = [
  { value: 'en', label: 'Englisch', english: 'English' },
  { value: 'fr', label: 'Französisch', english: 'French' },
  { value: 'es', label: 'Spanisch', english: 'Spanish' },
  { value: 'it', label: 'Italienisch', english: 'Italian' },
  { value: 'nl', label: 'Niederländisch', english: 'Dutch' },
  { value: 'ru', label: 'Russisch', english: 'Russian' },
  /*
   * Latein arbeitet anders als die modernen Fremdsprachen: nur Lateinisch → Deutsch, keine
   * Sprech- und Schreibformate, dafür Nennformen, Wortbildung und Sprachvergleich.
   * Siehe `didactics/latein.ts`.
   */
  { value: 'la', label: 'Latein', english: 'Latin' }
]
