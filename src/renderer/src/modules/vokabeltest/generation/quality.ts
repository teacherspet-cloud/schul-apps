import { letter } from '../model/blocks'
import type { Block, VocabEntry } from '../model/types'
import { hatArtikel, wortartAusForm, wortartVon } from './wortart'

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
export function checkBlock(
  block: Block,
  expectedVocab: VocabEntry[],
  /** Testsprache – für die Formprüfung der Ablenker (02.10.2026); ohne sie entfällt diese Prüfung */
  sprache?: string,
  /** Ganze Vokabelliste – Ablenker aus der Liste haben dort ihre Wortart */
  liste: VocabEntry[] = expectedVocab
): Issue[] {
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
      // Synonyme/Gegenteile (02.10.2026): Gegenteile müssen wirklich vorkommen (die Anweisung passt sich an)
      if (block.taskType === 'synonymsAntonyms') {
        const befund = synonymMischung(block.left.map((l) => l.relation))
        if (befund) issues.push({ message: befund })
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
        if (correct !== undefined && sprache) {
          const v = it.vocabId ? vocabById.get(it.vocabId) : undefined
          for (const m of ablenkerBefunde(it.options, it.correct, sprache, v, liste)) issues.push({ item: i + 1, message: m })
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
    case 'mindmap': {
      if (!block.topic.trim()) issues.push({ message: 'Der Oberbegriff der Mindmap fehlt.' })
      if (block.items.length < 3) issues.push({ message: 'Zu wenige Wörter für eine Mindmap.' })
      // Form mit Oberbegriffen (02.10.2026): Ohne mindestens zwei Oberbegriffe wird die Mindmap offen gedruckt
      if (block.variante === 'oberbegriffe') {
        const aeste = (block.branches ?? []).filter((b) => b.label.trim())
        if (aeste.length < 2) {
          issues.push({
            message: 'Keine brauchbaren Oberbegriffe für die Äste – die Mindmap erscheint ganz offen. Bitte neu erzeugen oder Oberbegriffe eintragen.'
          })
        } else {
          if (aeste.length > 5) issues.push({ message: `${aeste.length} Äste – mehr als fünf werden unübersichtlich.` })
          const ohne = block.items.filter((i) => !aeste.some((b) => b.id === i.branchId))
          if (ohne.length) issues.push({ message: `Keinem Oberbegriff zugeordnet: ${ohne.map((i) => i.answer).join(', ')}` })
          const leer = aeste.filter((b) => !block.items.some((i) => i.branchId === b.id))
          if (leer.length) issues.push({ message: `Ast ohne Wörter: ${leer.map((b) => b.label).join(', ')}` })
          const verraten = aeste.filter((b) => block.items.some((i) => containsWord(b.label, i.answer)))
          if (verraten.length) issues.push({ message: `Der Oberbegriff „${verraten[0].label}" enthält ein gesuchtes Wort.` })
        }
      }
      coverage(block.items.map((i) => i.vocabId))
      break
    }
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

/**
 * Synonyme/Gegenteile (02.10.2026): Bei mindestens drei Paaren soll mindestens ein Drittel
 * Gegenteile sein (`mindestGegenteile`). Nur Gegenteile ist kein Fehler – dann fragt die
 * Anweisung nach entgegengesetzter Bedeutung. Ohne Angaben (ältere Blöcke) keine Meldung.
 */
export function synonymMischung(relationen: (string | undefined)[]): string | null {
  const n = relationen.length
  if (n < 3 || relationen.some((r) => r !== '=' && r !== '≠')) return null
  const gegenteile = relationen.filter((r) => r === '≠').length
  const min = Math.ceil(n / 3)
  if (gegenteile >= min) return null
  return gegenteile === 0
    ? `Nur Synonyme, keine Gegenteile – die Anweisung fragt deshalb nur nach gleicher Bedeutung. Verlangt sind mindestens ${min} Gegenteile (≠), soweit die Wörter welche haben.`
    : `Nur ${gegenteile} von ${n} Paaren sind Gegenteile (≠) – verlangt sind mindestens ${min}, soweit die Wörter welche haben.`
}

/*
 * Ablenker bei Multiple Choice (02.10.2026, Befund der Lehrkraft): Ein Ablenker darf nicht schon
 * an seiner Form als falsch erkennbar sein. Ohne KI prüfbar ist nur das Äußerliche: Artikel bzw.
 * „to" bei einigen Optionen und nicht bei anderen, eine -ing-Form neben Formen ohne, und eine
 * andere Wortart laut Vokabelliste. Bedeutung und Plausibilität prüft die KI (generate.ts).
 */
export function ablenkerBefunde(options: string[], correct: number, sprache: string, vocab: VocabEntry | undefined, liste: VocabEntry[] = []): string[] {
  const loesung = options[correct]
  if (loesung === undefined) return []
  const ablenker = options.filter((_, i) => i !== correct)
  const out: string[] = []
  const mitArtikel = (o: string): boolean => hatArtikel(o, sprache)
  if (ablenker.some((o) => mitArtikel(o) !== mitArtikel(loesung))) {
    out.push('Ablenker an der Form erkennbar: Der Artikel steht nicht bei allen Antwortmöglichkeiten gleich.')
  }
  if (sprache === 'en') {
    const mitTo = (o: string): boolean => /^to\s+\S/i.test(o.trim())
    if (ablenker.some((o) => mitTo(o) !== mitTo(loesung))) out.push('Ablenker an der Form erkennbar: „to" steht nicht bei allen Antwortmöglichkeiten.')
    const ing = (o: string): boolean => /\p{L}{2,}ing$/u.test(o.trim())
    const verb = vocab ? wortartVon(vocab, sprache) === 'verb' : false
    if (verb && ing(loesung) && ablenker.some((o) => !ing(o)))
      out.push('Ablenker an der Form erkennbar: Die Lösung ist eine -ing-Form, nicht alle Ablenker sind es.')
  }
  // Wortart: Ablenker, die Wörter der Liste sind, haben dort eine bekannte Wortart; sonst zählt die Form
  const art = vocab ? wortartVon(vocab, sprache) : undefined
  if (art) {
    const ohneVorsatz = (t: string): string => norm(t).replace(/^(to|a|an|the)\s+/, '')
    const fremd = ablenker.filter((o) => {
      const eintrag = liste.find((x) => norm(x.term) === norm(o) || ohneVorsatz(x.term) === norm(o))
      const a = eintrag ? wortartVon(eintrag, sprache) : wortartAusForm(o, sprache)
      return a !== undefined && a !== art
    })
    if (fremd.length) out.push(`Ablenker in anderer Wortart als die Lösung: ${fremd.join(', ')}`)
  }
  return out
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
    case 'mindmap': {
      lines.push(`Mind map topic: ${block.topic}`)
      const aeste = (block.branches ?? []).filter((b) => b.label.trim())
      if (block.variante === 'oberbegriffe' && aeste.length) {
        // Die Oberbegriffe stehen auf dem Blatt – die Prüfung soll sehen, ob jedes Wort eindeutig zu einem Ast gehört
        lines.push('(Branch labels are given on the sheet; students write each word on the twigs of the matching branch.)')
        for (const b of aeste) {
          const woerter = block.items.filter((i) => i.branchId === b.id).map((i) => i.answer)
          lines.push(`Branch "${b.label}": ${woerter.join(', ')}`)
        }
      } else {
        lines.push('(Open mind map: students organise the words themselves.)')
        block.items.forEach((it, i) => lines.push(`${i + 1}. ${it.answer}`))
      }
      break
    }
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
