// Automatische Testplanung: passende Aufgabenformate für die markierten Vokabeln wählen und eine Punktvorgabe einhalten.
import { CEFR_SCALE } from '@shared/types'
import { levelAtLeast } from '../../../shared/cefr'
import { enumOf, int, obj, str, arr } from '../../../shared/aiSchema'
import type { TaskSelection, TaskTypeId, TestSettings, VocabEntry } from '../model/types'
import { distributeEvenly } from './distribute'
import { AiCall, systemPrompt } from './generate'
import { TASK_TYPE_LIST, TASK_TYPES } from './taskTypes'

/** Formate, die für einen automatisch erstellten Test in Frage kommen (ohne Kreuzworträtsel/Freitext). */
const AUTO_CANDIDATES: TaskTypeId[] = [
  'gapSentences',
  'matchDefinitions',
  'multipleChoice',
  'gapText',
  'dialogue',
  'pictureLabel',
  'synonymsAntonyms',
  'collocations',
  'wordFormation',
  'oddOneOut',
  'categorize',
  'mindmap',
  'wordFamily',
  'writeDefinitions',
  'writeSentences',
  'mediation',
  'scrambled',
  'wrongWord',
  'twoSentences',
  'trueFalse'
]

export function availableAutoTypes(settings: Pick<TestSettings, 'level'>): TaskTypeId[] {
  return AUTO_CANDIDATES.filter((id) => TASK_TYPES[id] && levelAtLeast(settings.level, TASK_TYPES[id].minLevel))
}

/** Wie viele Vokabeln abgefragt werden: bei wenig Punkten nur so viele wie Punkte (1 Punkt je Vokabel). */
export function vocabCountFor(totalPoints: number, available: number): number {
  return Math.max(1, Math.min(available, Math.floor(totalPoints)))
}

/**
 * Punkte je Item so festlegen, dass die Summe möglichst genau der Vorgabe entspricht.
 * Offene Formate (Standardpunkte 2) bekommen dabei mehr Punkte als geschlossene.
 */
export function assignPoints(tasks: TaskSelection[], totalPoints: number): TaskSelection[] {
  const active = tasks.filter((t) => t.count > 0 && TASK_TYPES[t.type].usesVocab)
  const weight = active.reduce((s, t) => s + t.count * Math.max(0.5, TASK_TYPES[t.type].defaultPoints), 0)
  if (!weight) return tasks
  const factor = totalPoints / weight
  const half = (x: number): number => Math.max(0.5, Math.round(x * 2) / 2)
  const ideal = active.map((t) => Math.max(0.5, TASK_TYPES[t.type].defaultPoints) * factor)
  const points = new Map(active.map((t, i) => [t.type, half(ideal[i])]))
  const sum = (): number => active.reduce((s, t) => s + t.count * points.get(t.type)!, 0)

  // Bei wenigen Aufgaben alle Kombinationen halber Punkte prüfen: genaue Summe, möglichst nah an der Gewichtung
  if (active.length <= 5) {
    const options = active.map((_, i) => {
      const center = half(ideal[i])
      return [-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map((d) => center + d).filter((p) => p >= 0.5)
    })
    let bestCombo: number[] | null = null
    let bestCost = Infinity
    const choose = (i: number, combo: number[], total: number): void => {
      if (i === active.length) {
        if (Math.abs(total - totalPoints) > 0.001) return
        const cost = combo.reduce((s, p, k) => s + active[k].count * (p - ideal[k]) ** 2, 0)
        if (cost < bestCost) {
          bestCost = cost
          bestCombo = [...combo]
        }
        return
      }
      for (const p of options[i]) choose(i + 1, [...combo, p], total + active[i].count * p)
    }
    choose(0, [], 0)
    if (bestCombo) {
      const combo: number[] = bestCombo
      active.forEach((t, i) => points.set(t.type, combo[i]))
      return tasks.map((t) => (points.has(t.type) ? { ...t, pointsPerItem: points.get(t.type)! } : t))
    }
  }

  // In halben Punkten nachjustieren, ohne über das Ziel hinauszuschießen
  for (let guard = 0; guard < 200; guard++) {
    const diff = totalPoints - sum()
    if (Math.abs(diff) < 0.01) break
    const step = diff > 0 ? 0.5 : -0.5
    const candidates = active
      .filter((t) => Math.abs(step * t.count) <= Math.abs(diff) + 0.001 && points.get(t.type)! + step >= 0.5)
      .sort((a, b) => b.count - a.count)
    if (!candidates.length) break
    const t = candidates[0]
    points.set(t.type, points.get(t.type)! + step)
  }
  return tasks.map((t) => (points.has(t.type) ? { ...t, pointsPerItem: points.get(t.type)! } : t))
}

/**
 * Didaktische Gruppen der Formate. Ein brauchbarer Test mischt sie: erst wiedererkennen,
 * dann im Kontext anwenden, zuletzt selbst produzieren (Nation 2001; Schmitt 2010).
 */
const AUTO_GROUPS = {
  erkennen: ['multipleChoice', 'matchDefinitions', 'oddOneOut', 'trueFalse', 'categorize', 'scrambled'],
  anwenden: ['gapSentences', 'gapText', 'dialogue', 'collocations', 'wordFormation', 'wrongWord'],
  produzieren: ['writeSentences', 'writeDefinitions', 'mediation', 'twoSentences', 'synonymsAntonyms', 'wordFamily', 'mindmap']
} satisfies Record<string, TaskTypeId[]>

type AutoGroup = keyof typeof AUTO_GROUPS

/**
 * Welche Gruppen ein Test dieses Niveaus enthalten soll.
 * Auf niedrigen Stufen überwiegt das Wiedererkennen, ab B1 kommt eigenes Formulieren dazu.
 */
function groupMix(level: TestSettings['level'], wanted: number): AutoGroup[] {
  const order: AutoGroup[] = levelAtLeast(level, 'B1')
    ? ['anwenden', 'produzieren', 'erkennen', 'produzieren', 'anwenden']
    : levelAtLeast(level, 'A2')
      ? ['anwenden', 'erkennen', 'anwenden', 'produzieren', 'erkennen']
      : ['erkennen', 'anwenden', 'erkennen', 'anwenden', 'erkennen']
  return order.slice(0, wanted)
}

/** Wie viele Aufgaben zu so vielen Vokabeln passen. */
const taskCountFor = (count: number): number => (count < 6 ? 2 : count < 12 ? 3 : 4)

/**
 * Regelbasierte Auswahl – auch dann, wenn die KI-Planung nicht klappt.
 *
 * Aus jeder vorgesehenen Gruppe wird zufällig ein Format gezogen, damit nicht jeder Test
 * dieselben drei Aufgaben hat. Formate, deren Mindestanzahl bei dieser Vokabelzahl nicht
 * erreicht würde, bleiben außen vor; „Bilder beschriften" braucht abbildbare Nomen und wird
 * nur von der KI-Planung vorgeschlagen.
 */
export function fallbackTypes(settings: Pick<TestSettings, 'level'>, count: number, rnd: () => number = Math.random): TaskTypeId[] {
  const wanted = taskCountFor(count)
  const perTask = Math.floor(count / wanted)
  const allowed = new Set(availableAutoTypes(settings).filter((t) => t !== 'pictureLabel' && (TASK_TYPES[t].minItems ?? 1) <= perTask))
  const picked: TaskTypeId[] = []
  const draw = (pool: TaskTypeId[]): void => {
    const free = pool.filter((t) => allowed.has(t) && !picked.includes(t))
    if (free.length) picked.push(free[Math.min(free.length - 1, Math.floor(rnd() * free.length))])
  }
  for (const group of groupMix(settings.level, wanted)) draw(AUTO_GROUPS[group])
  // War eine Gruppe auf diesem Niveau leer, mit irgendeinem erlaubten Format auffüllen
  while (picked.length < wanted && picked.length < allowed.size) draw([...allowed])
  return picked
}

/** Mindestanzahlen einhalten: zu kleine Aufgaben entfernen und die Vokabeln neu verteilen. */
export function normalizeTasks(types: { type: TaskTypeId; count: number }[], total: number): TaskSelection[] {
  let list = types.filter((t) => TASK_TYPES[t.type]?.usesVocab)
  if (!list.length) return []
  // Summe auf die Vokabelzahl bringen
  const toSelection = (items: { type: TaskTypeId; count: number }[]): TaskSelection[] =>
    items.map((t) => ({ type: t.type, count: Math.max(0, Math.round(t.count)), pointsPerItem: TASK_TYPES[t.type].defaultPoints }))
  let tasks = toSelection(list)
  const sum = tasks.reduce((s, t) => s + t.count, 0)
  if (sum !== total || tasks.some((t) => t.count < (TASK_TYPES[t.type].minItems ?? 1))) {
    // Anteile beibehalten, Rundungsfehler beim größten Posten ausgleichen
    const scale = sum > 0 ? total / sum : 0
    tasks = tasks.map((t) => ({ ...t, count: Math.floor(t.count * scale) }))
    list = tasks
    let rest = total - tasks.reduce((s, t) => s + t.count, 0)
    for (let i = 0; rest > 0 && tasks.length; i = (i + 1) % tasks.length, rest--) tasks[i].count++
  }
  // Aufgaben unter der Mindestanzahl streichen
  while (tasks.length > 1 && tasks.some((t) => t.count < (TASK_TYPES[t.type].minItems ?? 1))) {
    tasks = tasks.filter((t) => t.count >= (TASK_TYPES[t.type].minItems ?? 1) || tasks.every((x) => x.count < (TASK_TYPES[x.type].minItems ?? 1)))
    tasks = distributeEvenly(tasks, total)
    if (tasks.every((t) => t.count < (TASK_TYPES[t.type].minItems ?? 1))) break
  }
  return tasks.filter((t) => t.count > 0)
}

const PLAN_SCHEMA = obj({
  tasks: arr(
    obj({
      type: enumOf(AUTO_CANDIDATES),
      count: int('Number of tested words in this task'),
      reason: str('Short reason in German')
    })
  )
})

/**
 * Lässt die KI passende Aufgabenformate wählen (Wortarten, Wendungen, Niveau, Abwechslung)
 * und verteilt die Vokabeln darauf. Bei Problemen greift eine regelbasierte Auswahl.
 */
export async function planAutoTasks(
  vocab: VocabEntry[],
  settings: TestSettings,
  totalPoints: number,
  ai: AiCall,
  /** Zufallsquelle für die Formatauswahl – im Test austauschbar */
  rnd: () => number = Math.random
): Promise<{ tasks: TaskSelection[]; vocabCount: number; reasons: string[] }> {
  const vocabCount = vocabCountFor(totalPoints, vocab.length)
  const allowed = availableAutoTypes(settings)
  // Gezogener Vorschlag: Ohne ihn wählt die KI fast immer dieselben drei Formate.
  const suggested = fallbackTypes(settings, vocabCount, rnd)
  let planned: { type: TaskTypeId; count: number }[] = []
  let reasons: string[] = []
  try {
    const res = await ai<{ tasks: { type: TaskTypeId; count: number; reason: string }[] }>({
      system: systemPrompt(settings),
      user: [
        `Plan a vocabulary test for the following ${vocab.length} words. Exactly ${vocabCount} words will be tested in total.`,
        'Choose 2 to 5 varied, suitable, context-based task formats and decide how many words each task tests. The counts must add up exactly to ' +
          `${vocabCount}.`,
        'Consider parts of speech and the kind of expressions (single words, phrases, verbs, adjectives), the CEFR level and variety for students.',
        suggested.length
          ? `Start from this mix, which was drawn for variety so that not every test looks the same: ${suggested.join(', ')}. Keep a format only if the words really suit it; otherwise replace it with another suitable format of a similar kind (recognition / use in context / own production).`
          : '',
        `The test must mix formats: at level ${settings.level} do not use three closed recognition formats in a row.`,
        '- Closed formats (matching, multiple choice, gap sentences) suit lower levels; open writing tasks only in moderation.',
        '- pictureLabel only if at least 3 of the words are concrete, clearly depictable nouns.',
        '- categorize needs at least 4 words that form clear word fields; synonymsAntonyms and collocations need words that have them.',
        `Minimum words per task: ${allowed.map((id) => `${id}=${TASK_TYPES[id].minItems ?? 1}`).join(', ')}.`,
        'Available formats:',
        ...allowed.map((id) => `- ${id}: ${TASK_TYPES[id].label} – ${TASK_TYPES[id].description}`),
        '',
        'Words:',
        ...vocab.map((v) => `- ${v.term} (${v.translation}${v.pos ? `, ${v.pos}` : ''})`)
      ]
        .filter(Boolean)
        .join('\n'),
      schemaName: 'testplan',
      schema: PLAN_SCHEMA
    })
    planned = res.tasks.filter((t) => allowed.includes(t.type) && t.count > 0)
    reasons = res.tasks.map((t) => `${TASK_TYPES[t.type]?.label ?? t.type}: ${t.reason}`)
  } catch {
    planned = []
  }
  // Doppelte Formate zusammenfassen
  const merged = new Map<TaskTypeId, number>()
  for (const t of planned) merged.set(t.type, (merged.get(t.type) ?? 0) + t.count)
  let tasks = normalizeTasks(
    [...merged].map(([type, count]) => ({ type, count })),
    vocabCount
  )
  if (!tasks.length || tasks.reduce((s, t) => s + t.count, 0) !== vocabCount) {
    const types = fallbackTypes(settings, vocabCount, rnd)
    tasks = normalizeTasks(
      distributeEvenly(
        types.map((type) => ({ type, count: 0, pointsPerItem: 1 })),
        vocabCount
      ),
      vocabCount
    )
    reasons = []
  }
  return { tasks: fitPoints(tasks, totalPoints), vocabCount, reasons }
}

const pointSum = (tasks: TaskSelection[]): number => tasks.reduce((s, t) => s + t.count * t.pointsPerItem, 0)

/**
 * Punkte verteilen; lässt sich die Vorgabe mit halben Punkten nicht genau treffen (z. B. 14 Items, 15 Punkte),
 * werden einzelne Vokabeln zwischen den Aufgaben verschoben, bis die Summe passt.
 */
export function fitPoints(tasks: TaskSelection[], totalPoints: number): TaskSelection[] {
  let best = assignPoints(tasks, totalPoints)
  if (Math.abs(pointSum(best) - totalPoints) < 0.01) return best
  const minOf = (t: TaskSelection): number => TASK_TYPES[t.type].minItems ?? 1
  for (let shift = 1; shift <= 3; shift++) {
    for (let from = 0; from < tasks.length; from++) {
      for (let to = 0; to < tasks.length; to++) {
        if (from === to || tasks[from].count - shift < minOf(tasks[from])) continue
        const moved = tasks.map((t, i) => ({ ...t, count: t.count + (i === to ? shift : i === from ? -shift : 0) }))
        const candidate = assignPoints(moved, totalPoints)
        if (Math.abs(pointSum(candidate) - totalPoints) < Math.abs(pointSum(best) - totalPoints)) best = candidate
        if (Math.abs(pointSum(best) - totalPoints) < 0.01) return best
      }
    }
  }
  return best
}

export { TASK_TYPE_LIST }

// ---------- Vokabelanalyse: Klassenstufe, Niveau und Thema vorschlagen ----------

export interface VocabLevelSuggestion {
  grade: number
  level: TestSettings['level']
  topic: string
  reason: string
}

const LEVEL_SCHEMA = obj({
  grade: int('Most likely school grade (class) for which these words are taught'),
  level: enumOf([...CEFR_SCALE]),
  topic: str('Short topic area of the words in German, e.g. „Reisen und Urlaub", or empty'),
  reason: str('One short sentence in German explaining the estimate')
})

/**
 * Schätzt, für welche Klassenstufe und welches GER-Niveau eine Vokabelliste gedacht ist
 * (Wortschatz, Wortarten, Wendungen, ggf. Lehrwerksname), und schlägt einen Themenbereich vor.
 */
export async function suggestLevelFromVocab(
  vocab: VocabEntry[],
  listName: string,
  settings: Pick<TestSettings, 'targetLanguage' | 'stateId' | 'schoolTypeId' | 'languageOrder'>,
  grades: { value: string; level: TestSettings['level'] }[],
  ai: AiCall
): Promise<VocabLevelSuggestion | null> {
  if (vocab.length < 2) return null
  const words = vocab.slice(0, 80)
  const res = await ai<VocabLevelSuggestion>({
    system:
      'You are an experienced foreign-language teacher at German schools. You estimate for which grade and CEFR level a vocabulary list was made. Answer only in the requested JSON format.',
    user: [
      `Target language code: ${settings.targetLanguage}; learned as ${settings.languageOrder}. foreign language; federal state ${settings.stateId}; school type ${settings.schoolTypeId}.`,
      listName.trim() ? `Name of the list (may contain the textbook and unit, e.g. "Green Line 5" = 5th year of learning): ${listName.trim()}` : '',
      grades.length
        ? `Possible grades with the CEFR target level at the end of that school year: ${grades.map((g) => `grade ${g.value} = ${g.level}`).join(', ')}. Choose one of these grades.`
        : 'Choose a grade between 1 and 13.',
      'Consider word difficulty, frequency, abstractness, phrases and grammar. The level is the level of the tasks for this list (usually the level of that grade during the school year).',
      `Words (${vocab.length}${vocab.length > words.length ? `, first ${words.length} shown` : ''}):`,
      ...words.map((v) => `- ${v.term} (${v.translation})`)
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'vocab_level',
    schema: LEVEL_SCHEMA
  })
  if (!res) return null
  const validGrades = grades.map((g) => Number(g.value))
  let grade = Math.round(Number(res.grade)) || 0
  if (validGrades.length && !validGrades.includes(grade)) {
    grade = validGrades.reduce((best, g) => (Math.abs(g - grade) < Math.abs(best - grade) ? g : best), validGrades[0])
  }
  const level = (CEFR_SCALE as readonly string[]).includes(res.level) ? res.level : (grades.find((g) => Number(g.value) === grade)?.level ?? 'A2')
  return { grade: grade || 6, level, topic: (res.topic ?? '').trim(), reason: (res.reason ?? '').trim() }
}
