import type { Block, TestDocument, Variant } from './types'

/** Anzahl der bewerteten Einheiten eines Blocks. */
export function itemCount(block: Block): number {
  switch (block.kind) {
    case 'gap':
    case 'choice':
    case 'open':
    case 'trueFalse':
    case 'oddOneOut':
    case 'picture':
    case 'scramble':
    case 'mindmap':
      return block.items.length
    case 'gapText':
      // Zweiter Teil einer zweiteiligen Wendung zählt nicht extra
      return block.parts.filter((p) => p.type === 'gap' && !p.folge).length
    case 'match':
      return block.left.length
    case 'categorize':
      return block.words.length
    case 'crossword':
      return block.entries.length
    case 'latinForms':
      return block.items.length
    // Je auszufüllende Form ein Punkt
    case 'verbTable':
      return block.rows.reduce((n, r) => n + r.cells.filter((c) => !c).length, 0)
    case 'freeText':
      return 0
  }
}

export function blockPoints(block: Block): number {
  if (block.kind === 'freeText') return block.pointsPerItem
  /*
   * LATEIN: Form und Bedeutungen werden GETRENNT bepunktet.
   *
   * „Für eine korrekte Lösung müssen jeweils alle Bedeutungen und notwendige grammatische
   * Angaben genannt werden" (Leitfaden Latein SH 2016, S. 21). Wer die Bedeutungen kann und
   * nur das Genus vergisst, hat nicht nichts gewusst – mit Teilpunkten lässt sich das
   * abbilden, mit einer Ja/Nein-Wertung nicht.
   */
  if (block.kind === 'latinForms') return block.items.length * (block.pointsForm + block.pointsMeaning)
  return itemCount(block) * block.pointsPerItem
}

export function variantPoints(variant: Variant): number {
  return variant.blocks.reduce((sum, b) => sum + blockPoints(b), 0)
}

export function formatPoints(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1).replace('.', ',')
}

/**
 * Arbeitsanweisung passend zum Blatt (06.10.2026, Befund der Lehrkraft: „with words and phrases from the box", obwohl
 * kein Kasten auf dem Blatt steht). Die Anweisung stammt oft von der KI oder einer Vorlage mit Kasten; ob er gedruckt
 * wird, entscheidet `wordBank` (Niveau, Einstellung der Lehrkraft). Ohne Kasten fällt der Verweis darauf weg –
 * in allen Testsprachen.
 */
const KASTEN_VERWEISE: RegExp[] = [
  /\s*\((?:see|use)\s+the\s+box\)/gi,
  /\s+(?:from|in|using)\s+the\s+(?:word\s+)?box/gi,
  /\s+(?:aus\s+dem|im|mit\s+dem)\s+(?:Wort)?kasten/gi,
  /\s+(?:de|dans)\s+(?:l['’]encadré|la\s+boîte|la\s+liste)/gi,
  /\s+(?:del|en\s+el)\s+(?:recuadro|cuadro)/gi,
  /\s+(?:dal|nel)\s+riquadro/gi
]
export function hatWortkasten(block: Block): boolean {
  if (!('wordBank' in block)) return true
  return Boolean(block.wordBank) && wordBankFor(block).length > 0
}
export function anweisungFuer(block: Block): string {
  const a = block.instruction ?? ''
  if (!a || hatWortkasten(block)) return a
  let s = a
  for (const r of KASTEN_VERWEISE) s = s.replace(r, '')
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
}

/** Alphabetisch sortierter Wortkasten (keine Reihenfolge-Hinweise auf die Lösung). */
export function wordBankFor(block: Block): string[] {
  let words: string[] = []
  if (block.kind === 'gap') {
    words = [...block.items.map((i) => i.bankWord || i.answer), ...block.extraBankWords]
  } else if (block.kind === 'gapText') {
    words = [...block.parts.flatMap((p) => (p.type === 'gap' ? [p.bankWord || p.answer] : [])), ...block.extraBankWords]
  } else if (block.kind === 'picture') {
    words = [...block.items.map((i) => i.answer), ...(block.extraBankWords ?? [])]
  }
  return [...new Set(words.filter(Boolean))].sort((a, b) => stripArticle(a).localeCompare(stripArticle(b), undefined, { sensitivity: 'base' }))
}

function stripArticle(s: string): string {
  return s.replace(/^(to|a|an|the|le|la|les|l'|un|une|el|los|las)\s+/i, '')
}

export function letter(index: number): string {
  return String.fromCharCode(97 + index)
}

export function firstLetterOf(answer: string): string {
  return answer.trim().charAt(0)
}

export function cloneDocument(doc: TestDocument): TestDocument {
  return structuredClone(doc)
}

/** Wie viele Wörter im Wortkasten bzw. in der rechten Spalte nicht gebraucht werden. */
export function unneededWordCount(block: Block): number {
  if (block.kind === 'match') return Math.max(0, block.right.length - block.left.length)
  if (block.kind === 'gap' || block.kind === 'gapText' || block.kind === 'picture') {
    if (!block.wordBank) return 0
    const needed =
      block.kind === 'gap'
        ? block.items.map((i) => i.bankWord || i.answer)
        : block.kind === 'gapText'
          ? block.parts.flatMap((p) => (p.type === 'gap' ? [p.bankWord || p.answer] : []))
          : block.items.map((i) => i.answer)
    return Math.max(0, wordBankFor(block).length - new Set(needed.filter(Boolean)).size)
  }
  return 0
}
