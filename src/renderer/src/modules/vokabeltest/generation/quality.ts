import { letter } from '../model/blocks'
import type { Block, VocabEntry } from '../model/types'

export interface Issue {
  item?: number
  message: string
}

const norm = (s: string): string => s.toLocaleLowerCase().trim()

/** Kommt das Wort (als ganzes Wort) im Text vor? */
export function containsWord(text: string, word: string): boolean {
  const w = norm(word).replace(/^(to|a|an|the)\s+/, '')
  if (!w) return false
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, 'iu').test(text)
}

/** Lokale, kostenlose Prüfungen direkt nach der Generierung. */
export function checkBlock(block: Block, expectedVocab: VocabEntry[]): Issue[] {
  const issues: Issue[] = []
  const vocabById = new Map(expectedVocab.map((v) => [v.id, v]))

  // Doppelte Wörter im Wortkasten machen die Zuordnung zu den Lücken mehrdeutig
  if (block.kind === 'gap' || block.kind === 'gapText' || block.kind === 'picture') {
    const bank =
      block.kind === 'gap'
        ? block.items.map((i) => i.bankWord || i.answer)
        : block.kind === 'gapText'
          ? block.parts.flatMap((p) => (p.type === 'gap' ? [p.bankWord || p.answer] : []))
          : block.items.map((i) => i.answer)
    const dup = bank.filter((w, i) => bank.findIndex((x) => norm(x) === norm(w)) !== i)
    if (dup.length) issues.push({ message: `Das Wort „${dup[0]}" wird mehrfach gesucht – Schüler können die Lücken nicht eindeutig zuordnen.` })
  }

  const coverage = (ids: (string | undefined)[]): void => {
    const missing = expectedVocab.filter((v) => !ids.includes(v.id))
    if (missing.length) issues.push({ message: `Nicht abgefragt: ${missing.map((m) => m.term).join(', ')}` })
  }

  switch (block.kind) {
    case 'gap':
      block.items.forEach((it, i) => {
        if (!it.answer.trim()) issues.push({ item: i + 1, message: 'Lösung fehlt.' })
        for (const s of it.sentences) {
          if (!`${s.before}${s.after}`.trim()) issues.push({ item: i + 1, message: 'Satz ist leer.' })
          if (containsWord(`${s.before} ${s.after}`, it.answer)) {
            issues.push({ item: i + 1, message: `Die Lösung „${it.answer}" steht bereits im Satz.` })
          }
        }
      })
      coverage(block.items.map((i) => i.vocabId))
      break
    case 'gapText': {
      const gaps = block.parts.filter((p) => p.type === 'gap')
      const text = block.parts.map((p) => (p.type === 'text' ? p.text : ' ')).join('')
      gaps.forEach((g, i) => {
        if (g.type === 'gap' && containsWord(text, g.answer)) {
          issues.push({ item: i + 1, message: `Die Lösung „${g.answer}" steht bereits im Text.` })
        }
      })
      coverage(gaps.map((g) => (g.type === 'gap' ? g.vocabId : undefined)))
      break
    }
    case 'match':
      block.left.forEach((l, i) => {
        const v = l.vocabId ? vocabById.get(l.vocabId) : undefined
        const answer = block.right.find((r) => r.id === l.answerId)
        if (!answer) issues.push({ item: i + 1, message: 'Zuordnung fehlt.' })
        if (block.taskType === 'matchDefinitions' && v && containsWord(l.text, v.term)) {
          issues.push({ item: i + 1, message: `Die Erklärung enthält das gesuchte Wort „${v.term}".` })
        }
      })
      if (new Set(block.right.map((r) => norm(r.text))).size !== block.right.length) {
        issues.push({ message: 'Auswahlwörter kommen doppelt vor.' })
      }
      coverage(block.left.map((l) => l.vocabId))
      break
    case 'choice':
      block.items.forEach((it, i) => {
        if (it.options.length < 3) issues.push({ item: i + 1, message: 'Zu wenige Antwortmöglichkeiten.' })
        if (new Set(it.options.map(norm)).size !== it.options.length) {
          issues.push({ item: i + 1, message: 'Antwortmöglichkeiten doppelt.' })
        }
        const correct = it.options[it.correct]
        if (correct === undefined) issues.push({ item: i + 1, message: 'Richtige Antwort fehlt.' })
        else if (containsWord(`${it.before} ${it.after}`, correct)) {
          issues.push({ item: i + 1, message: `Die Lösung „${correct}" steht bereits im Satz.` })
        }
      })
      coverage(block.items.map((i) => i.vocabId))
      break
    case 'open':
      coverage(block.items.map((i) => i.vocabId))
      break
    case 'trueFalse':
      block.items.forEach((it, i) => {
        if (!it.isTrue && !it.correction.trim()) issues.push({ item: i + 1, message: 'Korrektur für falsche Aussage fehlt.' })
      })
      coverage(block.items.map((i) => i.vocabId))
      break
    case 'oddOneOut':
      block.items.forEach((it, i) => {
        if (!it.words.some((w) => norm(w) === norm(it.answer))) {
          issues.push({ item: i + 1, message: 'Das „odd" Wort ist nicht in der Reihe enthalten.' })
        }
      })
      coverage(block.items.map((i) => i.vocabId))
      break
    case 'categorize':
      if (block.categories.length < 2) issues.push({ message: 'Weniger als zwei Kategorien.' })
      coverage(block.words.map((w) => w.vocabId))
      break
    case 'mindmap':
      if (!block.topic.trim()) issues.push({ message: 'Der Oberbegriff der Mindmap fehlt.' })
      if (block.items.length < 3) issues.push({ message: 'Zu wenige Äste für eine Mindmap.' })
      coverage(block.items.map((i) => i.vocabId))
      break
    case 'crossword':
      if (block.unplaced.length) issues.push({ message: `Passten nicht ins Rätsel: ${block.unplaced.join(', ')}` })
      block.entries.forEach((e) => {
        if (!e.clue.trim()) issues.push({ item: e.number, message: `Hinweis zu ${e.answer} fehlt.` })
        else if (containsWord(e.clue, e.answer)) issues.push({ item: e.number, message: `Hinweis verrät das Wort ${e.answer}.` })
      })
      break
    case 'scramble':
      block.items.forEach((it, i) => {
        if (containsWord(it.hint, it.answer)) issues.push({ item: i + 1, message: 'Der Hinweissatz verrät das Wort.' })
      })
      break
    case 'picture': {
      block.items.forEach((it, i) => {
        if (!it.image) issues.push({ item: i + 1, message: `Kein Bild für „${it.answer}" gefunden, bitte auswählen.` })
      })
      // Gleiche Bilder für verschiedene Wörter wären für Schüler nicht unterscheidbar
      const seen = new Map<string, number>()
      block.items.forEach((it, i) => {
        if (!it.image) return
        const first = seen.get(it.image.dataUrl)
        if (first !== undefined) issues.push({ item: i + 1, message: `Gleiches Bild wie Nr. ${first + 1} – bitte ein anderes Bild wählen.` })
        else seen.set(it.image.dataUrl, i)
      })
      break
    }
    case 'freeText':
      break
  }
  return issues
}

/** Kompakte Textfassung eines Blocks für die KI-Prüfung. */
export function describeBlock(block: Block): string {
  const lines: string[] = [`Task: ${block.title}`, `Instruction: ${block.instruction}`]
  switch (block.kind) {
    case 'gap':
      block.items.forEach((it, i) =>
        lines.push(
          `${i + 1}. ${it.sentences.map((s) => `${s.before} ___${it.hint ? ` (${it.hint})` : ''} ${s.after}`).join(' / ')}  → answer: ${it.answer}${block.firstLetterHint || it.firstLetter ? ' (first letter given)' : ''}`
        )
      )
      if (block.wordBank) lines.push(`(Students get a word box: ${[...block.items.map((i) => i.bankWord || i.answer), ...block.extraBankWords].join(', ')})`)
      else lines.push('(No word box.)')
      break
    case 'gapText': {
      let n = 0
      lines.push(block.parts.map((p) => (p.type === 'text' ? p.text : `(${++n}) ___[answer: ${p.answer}]`)).join(''))
      break
    }
    case 'match':
      block.left.forEach((l, i) => {
        const idx = block.right.findIndex((r) => r.id === l.answerId)
        lines.push(`${i + 1}. ${l.text}  → answer: ${letter(idx)}`)
      })
      block.right.forEach((r, i) => lines.push(`${letter(i)}) ${r.text}`))
      break
    case 'choice':
      block.items.forEach((it, i) =>
        lines.push(`${i + 1}. ${it.before} ___ ${it.after}  options: ${it.options.join(' | ')}  → answer: ${it.options[it.correct]}`)
      )
      break
    case 'open':
      block.items.forEach((it, i) => lines.push(`${i + 1}. ${it.prompt}  → model answer: ${it.modelAnswer}`))
      break
    case 'trueFalse':
      block.items.forEach((it, i) => lines.push(`${i + 1}. ${it.statement}  → ${it.isTrue ? 'true' : `false; correction: ${it.correction}`}`))
      break
    case 'oddOneOut':
      block.items.forEach((it, i) => lines.push(`${i + 1}. ${it.words.join(', ')}  → odd one: ${it.answer} (${it.reason})`))
      break
    case 'mindmap':
      lines.push(`Mind map topic: ${block.topic}`)
      block.items.forEach((it, i) => lines.push(`${i + 1}. ${it.answer}`))
      break
    case 'categorize':
      lines.push(`Categories: ${block.categories.map((c) => c.name).join(', ')}`)
      block.words.forEach((w, i) => lines.push(`${i + 1}. ${w.text} → ${block.categories.find((c) => c.id === w.categoryId)?.name}`))
      break
    case 'crossword':
      block.entries.forEach((e) => lines.push(`${e.number} ${e.dir}: ${e.clue}  → ${e.answer}`))
      break
    case 'scramble':
      block.items.forEach((it, i) => lines.push(`${i + 1}. ${it.scrambled} – hint: ${it.hint}  → ${it.answer}`))
      break
    case 'picture':
      block.items.forEach((it, i) => lines.push(`${i + 1}. picture of: ${it.answer}`))
      break
    case 'freeText':
      lines.push(block.text)
      break
  }
  return lines.join('\n')
}
