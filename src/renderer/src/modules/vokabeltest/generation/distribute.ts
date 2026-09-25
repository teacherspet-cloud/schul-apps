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
    if (settings.variantMode === 'sameVocab' || usable.length <= needed) {
      selection = pool
    } else {
      // Rotierende Auswahl: jede Variante beginnt an einer anderen Stelle des gemischten Pools
      const offset = (v * needed) % pool.length
      selection = [...pool.slice(offset), ...pool.slice(0, offset)]
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
