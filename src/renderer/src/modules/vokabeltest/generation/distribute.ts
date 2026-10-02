import { createRng, shuffle } from '../model/random'
import type { TaskSelection, TestSettings, VocabEntry } from '../model/types'
import { includedVocab } from '../model/vocab'
import { TASK_TYPES } from './taskTypes'

export interface TaskAssignment {
  task: TaskSelection
  vocab: VocabEntry[]
  /** Wie viele Vokabeln fehlten, weil keine passenden verfügbar waren */
  shortfall: number
}

export interface VariantPlan {
  label: string
  assignments: TaskAssignment[]
}

export const VARIANT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export function requestedCount(settings: Pick<TestSettings, 'tasks'>): number {
  return settings.tasks.filter((t) => TASK_TYPES[t.type].usesVocab).reduce((s, t) => s + t.count, 0)
}

/** Verteilt eine Gesamtzahl gleichmäßig auf die ausgewählten Aufgabentypen. */
export function distributeEvenly(tasks: TaskSelection[], total: number): TaskSelection[] {
  const vocabTasks = tasks.filter((t) => TASK_TYPES[t.type].usesVocab)
  if (vocabTasks.length === 0) return tasks
  const base = Math.floor(total / vocabTasks.length)
  let rest = total - base * vocabTasks.length
  const minOf = (t: TaskSelection): number => TASK_TYPES[t.type].minItems ?? 1
  const counts = vocabTasks.map(() => {
    const extra = rest > 0 ? 1 : 0
    rest -= extra
    return base + extra
  })
  // Mindestanzahlen einhalten und den Überschuss bei den größten Aufgaben wieder abziehen
  let excess = 0
  counts.forEach((c, i) => {
    const min = minOf(vocabTasks[i])
    if (c < min) {
      excess += min - c
      counts[i] = min
    }
  })
  while (excess > 0) {
    let largest = -1
    counts.forEach((c, i) => {
      if (c > minOf(vocabTasks[i]) && (largest < 0 || c > counts[largest])) largest = i
    })
    if (largest < 0) break
    counts[largest]--
    excess--
  }
  let k = 0
  return tasks.map((t) => (TASK_TYPES[t.type].usesVocab ? { ...t, count: counts[k++] } : t))
}

/**
 * Plant, welche Vokabeln in welcher Variante und Aufgabe abgefragt werden.
 * Jede Vokabel kommt pro Variante höchstens einmal vor.
 */
export function planVariants(vocab: VocabEntry[], settings: TestSettings): VariantPlan[] {
  const rng = createRng(settings.seed)
  const usable = includedVocab(vocab)
  const needed = Math.min(requestedCount(settings), usable.length)
  const pool = shuffle(usable, rng)

  const plans: VariantPlan[] = []
  for (let v = 0; v < settings.variantCount; v++) {
    let selection: VocabEntry[]
    if (settings.variantMode === 'sameVocab' || usable.length <= needed || v === 0) {
      selection = pool
    } else {
      selection = mitUeberschneidung(pool, plans, needed, rng)
    }
    const assignments = assign(selection, settings.tasks)
    if (settings.variantMode === 'sameVocab' && v > 0) {
      // Gleiche Vokabeln wie Variante A, aber gemischte Reihenfolge innerhalb der Aufgaben
      for (let i = 0; i < assignments.length; i++) {
        assignments[i] = { ...plans[0].assignments[i], vocab: shuffle(plans[0].assignments[i].vocab, rng) }
      }
    }
    plans.push({ label: VARIANT_LABELS[v] ?? String(v + 1), assignments })
  }
  return plans
}

/**
 * Anteil der Vokabeln einer weiteren Variante, der schon in einer früheren vorkam.
 *
 * Wunsch der Lehrkraft (02.10.2026): Bei „Unterschiedliche Vokabeln je Variante" sollen nicht
 * ALLE Vokabeln anders sein – „Test B darf durchaus auch Vokabeln haben, die auf Test A
 * abgeprüft werden, und Test C welche, die auf B und A geprüft werden". Vorher rotierte die
 * Auswahl lückenlos durch die Liste, die Varianten überschnitten sich nie. Faustregel: ein
 * Drittel gemeinsam. Reicht die Liste für den Rest nicht, wird es von selbst mehr.
 */
export const UEBERSCHNEIDUNG = 1 / 3

/** Reicht die Liste für unterschiedliche Varianten? Für Variante B muss mindestens ein Drittel neu sein. */
export const genugFuerVarianten = (vorhanden: number, abgefragt: number): boolean => abgefragt > 0 && vorhanden >= abgefragt + Math.ceil(abgefragt / 3)

/**
 * Auswahl für eine weitere Variante: ein Teil aus den bisherigen Varianten (zufällig über alle
 * verteilt), der Rest aus Wörtern, die noch keine Variante hatte. Dahinter der übrige Pool – die
 * Aufgaben mit Einschränkungen (Bilder, Rätsel) brauchen Ersatz, wenn ein Wort nicht passt.
 * Gemeinsame und neue Wörter werden gemischt, damit ein Wort aus A in B in einer anderen
 * Aufgabe landen kann.
 */
function mitUeberschneidung(pool: VocabEntry[], bisher: VariantPlan[], needed: number, rng: ReturnType<typeof createRng>): VocabEntry[] {
  const benutzt = new Set(bisher.flatMap((p) => p.assignments.flatMap((a) => a.vocab.map((x) => x.id))))
  const neu = pool.filter((x) => !benutzt.has(x.id))
  const alt = shuffle(
    pool.filter((x) => benutzt.has(x.id)),
    rng
  )
  const gemeinsam = Math.max(1, Math.round(needed * UEBERSCHNEIDUNG), needed - neu.length)
  const kern = shuffle([...alt.slice(0, gemeinsam), ...neu.slice(0, needed - Math.min(gemeinsam, alt.length))], rng)
  const drin = new Set(kern.map((x) => x.id))
  return [...kern, ...pool.filter((x) => !drin.has(x.id))]
}

function assign(selection: VocabEntry[], tasks: TaskSelection[]): TaskAssignment[] {
  const remaining = [...selection]
  const result = new Map<TaskSelection, TaskAssignment>()

  // Aufgaben mit Einschränkungen (Bilder, Kreuzworträtsel …) wählen zuerst
  const ordered = [...tasks].sort((a, b) => Number(Boolean(TASK_TYPES[b.type].accepts)) - Number(Boolean(TASK_TYPES[a.type].accepts)))
  for (const task of ordered) {
    const def = TASK_TYPES[task.type]
    if (!def.usesVocab) {
      result.set(task, { task, vocab: [], shortfall: 0 })
      continue
    }
    const picked: VocabEntry[] = []
    for (let i = 0; i < remaining.length && picked.length < task.count;) {
      if (!def.accepts || def.accepts(remaining[i])) {
        picked.push(remaining[i])
        remaining.splice(i, 1)
      } else i++
    }
    result.set(task, { task, vocab: picked, shortfall: task.count - picked.length })
  }
  return tasks.map((t) => result.get(t)!)
}
