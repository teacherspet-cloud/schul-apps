/**
 * Fassungen A–D für Grammatiktest und Lernzielkontrolle (06.10.2026, Vorbild Vokabeltest).
 *
 * Zwei Wege, eine weitere Fassung zu bekommen:
 *
 * - PARALLEL (Standard): andere Sätze und Beispiele bei gleichen Aufgabentypen, gleichen Punkten
 *   und gleicher Schwierigkeit – das schreibt die KI (Grammatiktest: EINE Anfrage für alle
 *   weiteren Fassungen; Lernzielkontrolle: wie bisher je Fassung).
 * - UMGESTELLT (ohne KI): dieselben Aufgaben, aber Antwortoptionen, Zuordnungen, Aussagen und –
 *   bei Einzelsätzen – die Items in anderer Reihenfolge. Das kostet nichts und ist sofort fertig;
 *   gegen Abschreiben hilft es weniger als andere Sätze, die Lehrkraft entscheidet.
 *
 * Die Reihenfolge der AUFGABEN bleibt immer gleich: Sie steigt vom Erkennen zum Bilden an, und
 * die Fassungen sollen gleichwertig sein.
 *
 * Nicht umgestellt wird, was sich nicht gefahrlos umstellen lässt: Tabellen (Konjugationsreihen
 * haben eine feste Folge) und Aufgaben, deren Lösungstext auf Positionen verweist („1 b, 2 a" –
 * nach dem Umstellen wäre er falsch). Lieber eine gleiche Aufgabe als eine falsche Lösung.
 */
import type { Answer, TaskBlock, TaskPart, WsBlock } from '../modules/arbeitsblatt/model/types'
import { createRng, shuffle, type Rng } from '../modules/vokabeltest/model/random'
import { mcSignatur } from './verstehen/blindprobe'

/** Mehr als A–D bietet auch der Vokabeltest im Alltag nicht an */
export const MAX_TESTFASSUNGEN = 4

export type FassungsArt = 'parallel' | 'umgestellt'

/** „A", „B", „C", „D" */
export const fassungsBuchstabe = (index: number): string => String.fromCharCode(65 + index)

/** Anzahl der Fassungen auf 1–4 begrenzen (alte Werte, kaputte Dateien) */
export const begrenzteFassungen = (n: unknown): number => {
  const z = Math.round(Number(n))
  return Number.isFinite(z) ? Math.min(MAX_TESTFASSUNGEN, Math.max(1, z)) : 1
}

/**
 * Verweist ein Lösungstext auf Positionen? („1. b", „a)", „2 – c", „3: true") – dann darf die
 * Aufgabe nicht umgestellt werden, sonst stimmte die Lösung nicht mehr.
 */
export function loesungMitPositionen(s: string | undefined): boolean {
  const t = (s ?? '').trim()
  if (!t) return false
  return /(^|[\s(;,/])(\d{1,2}|[a-hA-H])\s*[).:]\s*\S/m.test(t) || /\b\d{1,2}\s*[-–=]\s*[a-hA-H]\b/.test(t) || /^\s*\d{1,2}\s+\S/m.test(t)
}

/** Eine Umordnung, die sich von der bisherigen Folge unterscheidet (bei mindestens zwei Einträgen) */
function andereFolge(n: number, rng: Rng): number[] {
  const id = Array.from({ length: n }, (_, i) => i)
  if (n < 2) return id
  for (let versuch = 0; versuch < 6; versuch++) {
    const p = shuffle(id, rng)
    if (p.some((x, i) => x !== i)) return p
  }
  // Notfalls tauschen: Die ersten beiden wechseln
  return [1, 0, ...id.slice(2)]
}

/** Nummern am Zeilenanfang („1.", „(2)", „3)") nach dem Umstellen wieder fortlaufend */
const neuNummeriert = (zeilen: string[]): string[] => zeilen.map((z, i) => z.replace(/^(\s*\(?)(\d{1,2})([.)])/, (_, a: string, _n: string, c: string) => `${a}${i + 1}${c}`))

/**
 * Stellt eine Antwortform um. Gibt zurück, ob sich etwas geändert hat.
 * `items`: Lückentext aus Einzelsätzen darf in der Satzfolge umgestellt werden.
 */
function stelleAntwortUm(a: Answer, rng: Rng, items: boolean): boolean {
  switch (a.kind) {
    case 'multipleChoice': {
      if (a.options.length < 2) return false
      const p = andereFolge(a.options.length, rng)
      a.options = p.map((i) => a.options[i])
      a.correct = a.correct.map((c) => p.indexOf(c)).sort((x, y) => x - y)
      return true
    }
    case 'matching': {
      if (a.left.length < 2 && a.right.length < 2) return false
      const pl = andereFolge(a.left.length, rng)
      const pr = andereFolge(a.right.length, rng)
      const pairs = pl.map((i) => a.pairs[i])
      a.left = pl.map((i) => a.left[i])
      a.right = pr.map((i) => a.right[i])
      a.pairs = pairs.map((r) => (typeof r === 'number' && r >= 0 ? pr.indexOf(r) : r))
      return true
    }
    case 'trueFalse': {
      if (a.statements.length < 2) return false
      const p = andereFolge(a.statements.length, rng)
      a.statements = p.map((i) => a.statements[i])
      return true
    }
    case 'ordering': {
      if (a.items.length < 2) return false
      const bisher = a.displayOrder?.length === a.items.length ? a.displayOrder : a.items.map((_, i) => i)
      // Eine andere Anzeige-Reihenfolge – die richtige Folge (items) bleibt
      let neu = shuffle(bisher, rng)
      for (let v = 0; v < 6 && neu.every((x, i) => x === bisher[i]); v++) neu = shuffle(bisher, rng)
      a.displayOrder = neu
      return neu.some((x, i) => x !== bisher[i])
    }
    case 'gapText': {
      if (!items) return false
      const zeilen = a.gapText.split('\n')
      // Nur eine Reihe von Einzelsätzen, jede Zeile mit Lücke – ein Fließtext bleibt, wie er ist
      if (zeilen.length < 3 || !zeilen.every((z) => z.trim() && z.includes('[['))) return false
      const p = andereFolge(zeilen.length, rng)
      a.gapText = neuNummeriert(p.map((i) => zeilen[i])).join('\n')
      return true
    }
    default:
      return false
  }
}

/**
 * Eine Aufgabe umstellen (an Ort und Stelle). `items` = Einzelsätze und Teilaufgaben dürfen die
 * Reihenfolge wechseln (nicht bei einem eingebetteten Test: Dort folgen sie dem Text).
 */
export function stelleAufgabeUm(t: TaskBlock, rng: Rng, items: boolean): boolean {
  if (loesungMitPositionen(t.solution)) return false
  const geprueft = t.mcBlindprobe !== undefined && t.mcBlindprobe === mcSignatur(t)
  let geaendert = false
  if (items && t.parts.length >= 2 && t.parts.every((p) => !loesungMitPositionen(p.solution))) {
    const p = andereFolge(t.parts.length, rng)
    t.parts = p.map((i) => t.parts[i])
    geaendert = true
  }
  for (const teil of t.parts) if (!loesungMitPositionen(teil.solution) && stelleAntwortUm(teil.answer, rng, items)) geaendert = true
  if (stelleAntwortUm(t.answer, rng, items)) geaendert = true
  // Die Blindprobe hängt am Inhalt, nicht an der Reihenfolge – eine geprüfte Aufgabe bleibt geprüft
  if (geprueft) t.mcBlindprobe = mcSignatur(t)
  return geaendert
}

/**
 * Neue Kennungen für eine weitere Fassung: aus „t1" wird „t1-b". Sonst bearbeitete die Lehrkraft
 * in Fassung B denselben Baustein wie in A. Materialverweise (M{kennung}) bleiben gültig, weil
 * ein Material ohne eigene Kennung seine alte als `ref` mitnimmt; Hör- und Filmbezüge ziehen mit.
 */
export function mitNeuenKennungen(blocks: WsBlock[], suffix: string): WsBlock[] {
  const neu = new Map(blocks.map((b) => [b.id, `${b.id}-${suffix}`]))
  return blocks.map((b) => {
    const k = structuredClone(b) as WsBlock
    if (k.type !== 'task' && !k.ref) k.ref = b.id
    k.id = neu.get(b.id)!
    delete k.versions
    delete k.versionIndex
    if (k.type === 'task') {
      if (k.audioId && neu.has(k.audioId)) k.audioId = neu.get(k.audioId)
      if (k.videoId && neu.has(k.videoId)) k.videoId = neu.get(k.videoId)
      k.parts = k.parts.map((p: TaskPart) => ({ ...p, id: `${p.id}-${suffix}` }))
      if (k.example) k.example = { ...k.example, id: `${k.example.id}-${suffix}` }
    }
    return k
  })
}

/**
 * Fassung Nr. `index` (1 = B …) ohne KI aus Fassung A: neue Kennungen, Aufgaben umgestellt.
 * `geaendert` = Zahl der Aufgaben, die sich tatsächlich unterscheiden – 0 heißt: B gleicht A.
 */
export function umgestellteFassung(a: WsBlock[], index: number, opts: { items: boolean; seed?: number }): { bloecke: WsBlock[]; geaendert: number } {
  const rng = createRng((opts.seed ?? 20261006) + 7919 * index)
  const bloecke = mitNeuenKennungen(a, fassungsBuchstabe(index).toLowerCase())
  let geaendert = 0
  for (const b of bloecke) if (b.type === 'task' && stelleAufgabeUm(b, rng, opts.items)) geaendert++
  return { bloecke, geaendert }
}

/** Alle weiteren Fassungen (B …) ohne KI */
export function umgestellteFassungen(a: WsBlock[], anzahl: number, opts: { items: boolean; seed?: number }): { fassungen: WsBlock[][]; hinweise: string[] } {
  const fassungen: WsBlock[][] = []
  const hinweise: string[] = []
  for (let i = 1; i < anzahl; i++) {
    const r = umgestellteFassung(a, i, opts)
    fassungen.push(r.bloecke)
    if (!r.geaendert) hinweise.push(`Fassung ${fassungsBuchstabe(i)} gleicht Fassung A: Keine Aufgabe ließ sich gefahrlos umstellen.`)
  }
  return { fassungen, hinweise }
}

/**
 * Passt eine Parallelfassung der KI zu Fassung A? Gleich viele Aufgaben, je Stelle dieselbe
 * Antwortform. Gibt den Befund zurück oder null.
 */
export function abweichungZuA(a: WsBlock[], f: WsBlock[]): string | null {
  const ta = a.filter((b): b is TaskBlock => b.type === 'task')
  const tf = f.filter((b): b is TaskBlock => b.type === 'task')
  if (ta.length !== tf.length) return `${tf.length} statt ${ta.length} Aufgaben`
  const i = ta.findIndex((t, k) => t.answer.kind !== tf[k].answer.kind || t.parts.length !== tf[k].parts.length)
  return i >= 0 ? `Aufgabe ${i + 1} hat eine andere Antwortform` : null
}

/** Gleiche Punkte und – wo die KI sie nicht nennt – dieselbe Stolperstelle wie das Gegenstück in A */
export function wieA(a: WsBlock[], f: WsBlock[]): void {
  const ta = a.filter((b): b is TaskBlock => b.type === 'task')
  const tf = f.filter((b): b is TaskBlock => b.type === 'task')
  tf.forEach((t, i) => {
    const vorlage = ta[i]
    if (!vorlage) return
    t.points = vorlage.points
    if (!t.grammar && vorlage.grammar) t.grammar = { ...vorlage.grammar }
  })
}
