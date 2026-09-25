/**
 * Wortschatz, den eine Lerngruppe schon kennt.
 *
 * Aufgaben, Texte und Klassenarbeiten dürfen nicht mit Wörtern arbeiten, die im Lehrwerk erst
 * später vorkommen – sonst scheitern die Schülerinnen und Schüler an Wörtern, die gar nicht
 * geprüft werden sollen. Bekannt ist alles, was im gewählten Band vor den gewählten Abschnitten
 * steht, dazu alle früheren Bände derselben Reihe.
 *
 * Bis Klasse 7 gilt das streng: Die Lehrwerke sind dort eng am Wortschatz gebaut, und die
 * Lernenden haben kaum Ausweichmöglichkeiten. Ab Klasse 8 ist es eine Orientierung – in der
 * Mittel- und Oberstufe kommt Wortschatz aus vielen Quellen dazu (KMK-Bildungsstandards;
 * Nation 2001 zum Zusammenhang von Textabdeckung und Verstehen).
 */
import type { Textbook, TextbookMeta } from '@shared/types'

/** Ab dieser Klasse ist der Lehrwerkswortschatz nur noch eine Orientierung. */
export const STRICT_UP_TO_GRADE = 7

/** So viele Wörter gehen höchstens in einen Prompt – die zuletzt gelernten zuerst. */
export const KNOWN_WORD_LIMIT = 400

export interface KnownVocab {
  /** Zuletzt gelernte Wörter (gekürzt auf KNOWN_WORD_LIMIT) */
  words: string[]
  /** Wie viele Wörter insgesamt bekannt sind, vor dem Kürzen */
  total: number
  /** true = nur dieser Wortschatz ist erlaubt; false = Orientierung */
  strict: boolean
  /** Woher der Wortschatz stammt, für Prompt und Anzeige: „Green Line 1–2 bis Unit 3“ */
  source: string
  /** Band und Unit der Auswahl – daraus liest die App die Themen früherer Units (lehrwerkThemen.ts) */
  buch?: string
  unit?: string
  /** Frühere Bände derselben Reihe, ältester zuerst */
  fruehereBaende?: string[]
}

/** Bandbezeichnung abtrennen: „Green Line 3“ und „Green Line Transition“ gehören zu „Green Line“. */
export function seriesName(name: string): string {
  return name
    .replace(/\s*[–-]\s*(Band|Volume)\b.*$/i, '')
    .replace(/\s+(\d+|[IVX]+|Transition|Oberstufe|Einführungsphase|Qualifikationsphase)\s*$/i, '')
    .trim()
}

/** Bände derselben Reihe, die vor diesem Band unterrichtet werden. */
export function earlierVolumes<T extends { id: string; name: string; language: string; grade?: number }>(
  books: T[],
  book: Pick<T, 'id' | 'name' | 'language' | 'grade'>
): T[] {
  const series = seriesName(book.name)
  const grade = book.grade
  if (grade === undefined) return []
  return books
    .filter((b) => b.id !== book.id && b.language === book.language && seriesName(b.name) === series && b.grade !== undefined && b.grade < grade)
    .sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0))
}

/** Alle Wörter eines Bandes in Lehrwerksreihenfolge. */
export function allWords(book: Textbook): string[] {
  return book.units.flatMap((u) => u.sections.flatMap((s) => s.entries.map((e) => e.term)))
}

/**
 * Wörter, die im Band vor der Auswahl stehen: alle früheren Units vollständig und aus der
 * gewählten Unit die Abschnitte vor dem ersten gewählten.
 */
export function wordsBefore(book: Textbook, unitName: string, sectionNames: string[]): string[] {
  const unitIndex = book.units.findIndex((u) => u.name === unitName)
  if (unitIndex < 0) return allWords(book)
  const unit = book.units[unitIndex]
  const first = unit.sections.findIndex((s) => sectionNames.includes(s.name))
  const upTo = first < 0 ? unit.sections.length : first
  return [
    ...book.units.slice(0, unitIndex).flatMap((u) => u.sections.flatMap((s) => s.entries.map((e) => e.term))),
    ...unit.sections.slice(0, upTo).flatMap((s) => s.entries.map((e) => e.term))
  ]
}

/**
 * Stellt den bekannten Wortschatz zu einer Lehrwerksauswahl zusammen.
 *
 * `load` holt einen Band vollständig (window.api.textbooks.get). Frühere Bände werden nur
 * geladen, solange das Wortlimit noch nicht erreicht ist – bei Green Line 6 sind das sonst
 * über 8000 Wörter, von denen ohnehin nur die letzten in den Prompt passen.
 */
export async function collectKnownVocab(
  book: Textbook,
  unitName: string,
  sectionNames: string[],
  grade: number,
  books: TextbookMeta[],
  load: (id: string) => Promise<Textbook>
): Promise<KnownVocab | null> {
  const own = wordsBefore(book, unitName, sectionNames)
  const earlier = earlierVolumes(books, book)
  let words = own
  let total = own.length
  // Von hinten nach vorn: der zuletzt gelernte Wortschatz ist der wichtigste
  for (const meta of [...earlier].reverse()) {
    total += meta.entryCount ?? 0
    if (words.length >= KNOWN_WORD_LIMIT) continue
    try {
      words = [...allWords(await load(meta.id)), ...words]
    } catch {
      // Band nicht lesbar – dann eben ohne ihn
    }
  }
  const unique = [...new Set(words.filter((w) => w.trim()))]
  if (!unique.length) return null
  const volumes = [...earlier.map((b) => b.name), book.name]
  return {
    words: unique.slice(-KNOWN_WORD_LIMIT),
    total: Math.max(unique.length, total),
    strict: grade <= STRICT_UP_TO_GRADE,
    source: `${volumes.length > 1 ? `${volumes[0]} bis ${volumes[volumes.length - 1]}` : volumes[0]}, bis ${unitName}`,
    buch: book.name,
    unit: unitName,
    fruehereBaende: earlier.map((b) => b.name)
  }
}

/**
 * Regelsätze für die KI-Prompts (englisch wie die übrigen Vorgaben).
 * Sie stehen in den Aufgaben-Prompts von Vokabeltest, Arbeitsblatt und Klassenarbeit.
 */
export function knownVocabRules(known: KnownVocab | null | undefined): string[] {
  if (!known || !known.words.length) return []
  const list = known.words.join(', ')
  const shown = known.words.length < known.total ? `the ${known.words.length} most recently learned of them are listed here` : 'here is the complete list'
  return known.strict
    ? [
        `The class works with ${known.source}. Apart from the words being practised, use ONLY vocabulary the class has already met there (${shown}), plus numbers, names and the most basic function words.`,
        `Known vocabulary: ${list}`,
        'If you need a word that is not part of this vocabulary, rewrite the sentence instead.'
      ]
    : [
        `The class works with ${known.source}. Build on the vocabulary already met there (${shown}); go beyond it only where the content requires it.`,
        `Known vocabulary: ${list}`
      ]
}

/** Dieselben Regeln auf Deutsch – die Prompts für Klassenarbeit und Arbeitsblatt sind deutsch. */
export function knownVocabRulesDe(known: KnownVocab | null | undefined): string {
  if (!known || !known.words.length) return ''
  const shown = known.words.length < known.total ? `die ${known.words.length} zuletzt gelernten davon` : 'vollständig'
  return [
    `BEKANNTER WORTSCHATZ (${known.source}, ${shown}):`,
    known.words.join(', '),
    known.strict
      ? '- Verwende außerhalb der geprüften Wörter nur diesen Wortschatz, dazu Zahlen, Namen und die einfachsten Funktionswörter.'
      : '- Bleibe möglichst in diesem Wortschatz; darüber hinaus nur, wenn der Inhalt es verlangt.',
    known.strict ? '- Brauchst du ein Wort, das nicht dazugehört, formuliere den Satz um.' : ''
  ]
    .filter(Boolean)
    .join('\n')
}
