import { Rng, shuffle } from '../model/random'

export interface CrosswordInput {
  id: string
  word: string
}

export interface PlacedWord {
  id: string
  word: string
  row: number
  col: number
  dir: 'across' | 'down'
  number: number
}

export interface CrosswordLayout {
  rows: number
  cols: number
  placed: PlacedWord[]
  unplaced: string[]
}

/** Schreibweise im Gitter: Großbuchstaben, ohne Leerzeichen, Artikel oder "to". */
export function crosswordForm(term: string): string {
  return term
    .replace(/^(to|a|an|the)\s+/i, '')
    .toLocaleUpperCase()
    .replace(/[^\p{L}]/gu, '')
}

export function isCrosswordWord(term: string): boolean {
  const cleaned = term.replace(/^(to|a|an|the)\s+/i, '').trim()
  return /^\p{L}{3,14}$/u.test(cleaned)
}

type Grid = Map<string, string>
const key = (r: number, c: number): string => `${r},${c}`

function canPlace(grid: Grid, word: string, row: number, col: number, dir: 'across' | 'down'): number {
  const dr = dir === 'down' ? 1 : 0
  const dc = dir === 'across' ? 1 : 0
  // Feld vor und nach dem Wort muss frei sein
  if (grid.has(key(row - dr, col - dc))) return -1
  if (grid.has(key(row + dr * word.length, col + dc * word.length))) return -1
  let crossings = 0
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i
    const c = col + dc * i
    const existing = grid.get(key(r, c))
    if (existing) {
      if (existing !== word[i]) return -1
      crossings++
    } else {
      // Keine parallelen Nachbarn an neuen Buchstaben
      if (grid.has(key(r + dc, c + dr)) || grid.has(key(r - dc, c - dr))) return -1
    }
  }
  return crossings
}

function attempt(words: CrosswordInput[], rng: Rng): { placed: Omit<PlacedWord, 'number'>[]; unplaced: string[] } {
  const grid: Grid = new Map()
  const placed: Omit<PlacedWord, 'number'>[] = []
  const unplaced: string[] = []
  const put = (w: CrosswordInput, row: number, col: number, dir: 'across' | 'down'): void => {
    for (let i = 0; i < w.word.length; i++) {
      grid.set(key(row + (dir === 'down' ? i : 0), col + (dir === 'across' ? i : 0)), w.word[i])
    }
    placed.push({ id: w.id, word: w.word, row, col, dir })
  }

  const [first, ...rest] = words
  put(first, 0, 0, rng() < 0.5 ? 'across' : 'down')

  let pending = rest
  // Mehrere Durchgänge, da Wörter später Anschlussmöglichkeiten bekommen können
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    const next: CrosswordInput[] = []
    for (const w of pending) {
      let best: { row: number; col: number; dir: 'across' | 'down'; score: number } | null = null
      for (const p of placed) {
        for (let i = 0; i < p.word.length; i++) {
          const pr = p.row + (p.dir === 'down' ? i : 0)
          const pc = p.col + (p.dir === 'across' ? i : 0)
          for (let j = 0; j < w.word.length; j++) {
            if (w.word[j] !== p.word[i]) continue
            const dir = p.dir === 'across' ? 'down' : 'across'
            const row = dir === 'down' ? pr - j : pr
            const col = dir === 'across' ? pc - j : pc
            const crossings = canPlace(grid, w.word, row, col, dir)
            if (crossings < 1) continue
            const score = crossings * 10 - spreadAfter(placed, w.word, row, col, dir) + rng()
            if (!best || score > best.score) best = { row, col, dir, score }
          }
        }
      }
      if (best) put(w, best.row, best.col, best.dir)
      else next.push(w)
    }
    pending = next
  }
  unplaced.push(...pending.map((w) => w.id))
  return { placed, unplaced }
}

function bounds(placed: Omit<PlacedWord, 'number'>[]) {
  let minR = Infinity
  let minC = Infinity
  let maxR = -Infinity
  let maxC = -Infinity
  for (const p of placed) {
    const endR = p.row + (p.dir === 'down' ? p.word.length - 1 : 0)
    const endC = p.col + (p.dir === 'across' ? p.word.length - 1 : 0)
    minR = Math.min(minR, p.row)
    minC = Math.min(minC, p.col)
    maxR = Math.max(maxR, endR)
    maxC = Math.max(maxC, endC)
  }
  return { minR, minC, maxR, maxC }
}

function spreadAfter(placed: Omit<PlacedWord, 'number'>[], word: string, row: number, col: number, dir: 'across' | 'down'): number {
  const b = bounds([...placed, { id: '', word, row, col, dir }])
  const h = b.maxR - b.minR + 1
  const w = b.maxC - b.minC + 1
  return Math.max(h, w) + Math.abs(h - w) * 0.5
}

/** Erstellt ein kompaktes Kreuzworträtsel; bei vielen Versuchen gewinnt das mit den meisten platzierten Wörtern. */
export function buildCrossword(inputs: CrosswordInput[], rng: Rng, attempts = 40): CrosswordLayout {
  const words = inputs.filter((w) => w.word.length >= 2)
  if (words.length === 0) return { rows: 0, cols: 0, placed: [], unplaced: inputs.map((i) => i.id) }

  let best: { placed: Omit<PlacedWord, 'number'>[]; unplaced: string[]; area: number } | null = null
  for (let a = 0; a < attempts; a++) {
    const order =
      a === 0 ? [...words].sort((x, y) => y.word.length - x.word.length) : shuffle(words, rng).sort((x, y) => y.word.length - x.word.length + (rng() - 0.5) * 4)
    const res = attempt(order, rng)
    const b = bounds(res.placed)
    const area = (b.maxR - b.minR + 1) * (b.maxC - b.minC + 1)
    if (!best || res.placed.length > best.placed.length || (res.placed.length === best.placed.length && area < best.area)) {
      best = { ...res, area }
    }
  }

  const { minR, minC, maxR, maxC } = bounds(best!.placed)
  const normalized = best!.placed.map((p) => ({ ...p, row: p.row - minR, col: p.col - minC }))

  // Nummerierung in Lesereihenfolge; gleiche Startzelle teilt sich die Nummer
  const starts = [...new Set(normalized.map((p) => key(p.row, p.col)))]
    .map((k) => k.split(',').map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const numberOf = new Map(starts.map(([r, c], i) => [key(r, c), i + 1]))

  const placed: PlacedWord[] = normalized
    .map((p) => ({ ...p, number: numberOf.get(key(p.row, p.col))! }))
    .sort((a, b) => a.number - b.number || (a.dir === 'across' ? -1 : 1))

  return {
    rows: maxR - minR + 1,
    cols: maxC - minC + 1,
    placed,
    unplaced: [...best!.unplaced, ...inputs.filter((w) => w.word.length < 2).map((w) => w.id)]
  }
}

/** Buchstabensalat, der garantiert nicht dem Original entspricht. */
export function scrambleWord(word: string, rng: Rng): string {
  const letters = word.toLocaleLowerCase().replace(/\s+/g, '').split('')
  if (new Set(letters).size < 2) return letters.join('')
  for (let i = 0; i < 20; i++) {
    const s = shuffle(letters, rng).join('')
    if (s !== letters.join('')) return s
  }
  return [...letters].reverse().join('')
}
