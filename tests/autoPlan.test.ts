import { describe, expect, it } from 'vitest'
import { assignPoints, fallbackTypes, normalizeTasks, planAutoTasks, vocabCountFor } from '../src/renderer/src/modules/vokabeltest/generation/autoPlan'
import { levelAtLeast } from '../src/renderer/src/shared/cefr'
import { TASK_TYPES } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import type { TaskSelection, TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

const settings = {
  targetLanguage: 'en',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  languageOrder: 1,
  grade: 6,
  level: 'A2',
  vocabCount: 0,
  variantCount: 1,
  variantMode: 'sameVocab',
  tasks: [],
  topic: '',
  pictureSource: 'none',
  answerKey: true,
  seed: 1
} as TestSettings
const letters = 'abcdefghijklmnopqrstuvwxyz'
// Nur Buchstaben: Formate wie Buchstabensalat und Kreuzworträtsel lassen Ziffern nicht zu
const vocab = (n: number): VocabEntry[] =>
  Array.from({ length: n }, (_, i) => {
    const term = `word${letters[i % 26]}${letters[Math.floor(i / 26) % 26]}`
    return { id: `v${i}`, term, translation: `Wort ${term}` }
  })
const total = (tasks: TaskSelection[]): number => tasks.reduce((s, t) => s + t.count * t.pointsPerItem, 0)
const count = (tasks: TaskSelection[]): number => tasks.reduce((s, t) => s + t.count, 0)

describe('Test automatisch erstellen', () => {
  it('fragt bei wenigen Punkten nur so viele Vokabeln ab, wie es Punkte gibt', () => {
    expect(vocabCountFor(10, 30)).toBe(10)
    expect(vocabCountFor(40, 12)).toBe(12)
  })

  it('verteilt Punkte so, dass die Vorgabe erreicht wird – offene Formate zählen mehr', () => {
    const tasks: TaskSelection[] = [
      { type: 'gapSentences', count: 6, pointsPerItem: 1 },
      { type: 'matchDefinitions', count: 4, pointsPerItem: 1 },
      { type: 'writeSentences', count: 2, pointsPerItem: 2 }
    ]
    const result = assignPoints(tasks, 20)
    expect(total(result)).toBe(20)
    const open = result.find((t) => t.type === 'writeSentences')!
    const closed = result.find((t) => t.type === 'gapSentences')!
    expect(open.pointsPerItem).toBeGreaterThan(closed.pointsPerItem)
    expect(result.every((t) => t.pointsPerItem >= 0.5 && (t.pointsPerItem * 2) % 1 === 0)).toBe(true)
  })

  it('hält Summe und Mindestanzahlen der Formate ein', () => {
    const tasks = normalizeTasks(
      [
        { type: 'gapSentences', count: 9 },
        { type: 'matchDefinitions', count: 1 },
        { type: 'categorize', count: 2 }
      ],
      10
    )
    expect(count(tasks)).toBe(10)
    for (const t of tasks) expect(t.count).toBeGreaterThanOrEqual(TASK_TYPES[t.type].minItems ?? 1)
  })

  it('übernimmt den Plan der KI und fällt bei Fehlern auf eine Regelauswahl zurück', async () => {
    const ai = async <T>(): Promise<T> =>
      ({
        tasks: [
          { type: 'gapSentences', count: 5, reason: 'Kontext' },
          { type: 'matchDefinitions', count: 5, reason: 'Bedeutung' }
        ]
      }) as T
    const planned = await planAutoTasks(vocab(14), settings, 15, ai)
    expect(planned.vocabCount).toBe(14)
    expect(count(planned.tasks)).toBe(14)
    expect(planned.tasks.map((t) => t.type).sort()).toEqual(['gapSentences', 'matchDefinitions'])
    expect(total(planned.tasks)).toBe(15)

    const failing = async <T>(): Promise<T> => {
      throw new Error('keine KI')
    }
    const fallback = await planAutoTasks(vocab(8), settings, 8, failing)
    expect(count(fallback.tasks)).toBe(8)
    expect(total(fallback.tasks)).toBe(8)
    expect(fallback.tasks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Der fertige Test hat genau die eingestellte Punktzahl', () => {
  it('trifft die Vorgabe bei jeder üblichen Punktzahl', async () => {
    const { planAutoTasks } = await import('../src/renderer/src/modules/vokabeltest/generation/autoPlan')
    // Ohne KI-Plan greift die Regelauswahl – auch die muss genau treffen
    const failing = async <T>(): Promise<T> => {
      throw new Error('keine KI im Test')
    }
    for (const points of [8, 10, 12, 15, 18, 20, 24, 25, 30, 36, 40, 50, 60]) {
      const { tasks, vocabCount } = await planAutoTasks(vocab(40), settings, points, failing as never)
      expect(total(tasks), `Vorgabe ${points}`).toBeCloseTo(points, 5)
      expect(count(tasks), `Vorgabe ${points}`).toBe(vocabCount)
    }
  })

  it('erzeugt Aufgaben, deren Punkte in Summe der Vorgabe entsprechen', async () => {
    const { generateTest, defaultHeader } = await import('../src/renderer/src/modules/vokabeltest/generation/generate')
    const { variantPoints } = await import('../src/renderer/src/modules/vokabeltest/model/blocks')
    const { mockAi } = await import('./mockAi')
    // Feste Zufallswerte: So kommt jede Formatmischung dran und der Lauf bleibt wiederholbar
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      for (const points of [12, 20, 30]) {
        const { tasks, vocabCount } = await planAutoTasks(vocab(30), settings, points, mockAi() as never, () => r)
        const run = { ...settings, tasks, vocabCount } as TestSettings
        const doc = await generateTest(vocab(30), run, defaultHeader(''), { ai: mockAi() as never, review: false, combined: false })
        expect(variantPoints(doc.variants[0]), `Vorgabe ${points}, Formate ${tasks.map((t) => t.type).join('+')}`).toBeCloseTo(points, 5)
      }
    }
  })
})

describe('Sparmodus bei der Testerstellung', () => {
  it('erstellt alle Aufgaben einer Variante in einer gemeinsamen Anfrage', async () => {
    const { generateTest, defaultHeader } = await import('../src/renderer/src/modules/vokabeltest/generation/generate')
    const calls: { schemaName: string; keys: string[] }[] = []
    const ai = async <T>(req: { schemaName: string; schema: Record<string, unknown> }): Promise<T> => {
      calls.push({ schemaName: req.schemaName, keys: Object.keys((req.schema.properties as object) ?? {}) })
      return {} as T
    }
    const run = {
      ...settings,
      variantCount: 2,
      tasks: [
        { type: 'gapSentences', count: 3, pointsPerItem: 1 },
        { type: 'matchDefinitions', count: 3, pointsPerItem: 1 }
      ]
    } as TestSettings
    const doc = await generateTest(vocab(6), run, defaultHeader(''), { ai: ai as never, review: false, combined: true })
    expect(doc.variants).toHaveLength(2)
    expect(doc.variants.every((v) => v.blocks.length === 2)).toBe(true)
    const combined = calls.filter((c) => c.schemaName === 'vocabulary_test')
    expect(combined).toHaveLength(2)
    expect(combined[0].keys).toEqual(['task1', 'task2'])
  })
})

describe('Überzählige Wörter und Vokabelanalyse', () => {
  it('ergänzt immer mindestens zwei überzählige Wörter und nennt die Anzahl', async () => {
    const { ensureExtraWords } = await import('../src/renderer/src/modules/vokabeltest/generation/taskTypes')
    const { notNeededText } = await import('../src/renderer/src/modules/vokabeltest/render/helpTexts')
    const { createRng } = await import('../src/renderer/src/modules/vokabeltest/model/random')
    const all = vocab(6)
    const ctx = { settings, languageName: 'English', rng: createRng(1), allVocab: all }
    const task = all.slice(0, 3)
    // KI liefert nur ein brauchbares Wort (eins ist doppelt mit einem Lösungswort) → aus der Liste auffüllen
    const extras = ensureExtraWords([task[1].term, 'river'], task, ctx)
    expect(extras.length).toBeGreaterThanOrEqual(2)
    expect(extras).toContain('river')
    expect(extras).not.toContain(task[1].term)
    expect(notNeededText(2, 'en')).toBe('You do not need 2 words.')
    expect(notNeededText(3, 'fr')).toContain('3 mots')
  })

  it('übernimmt Klassenstufe und Niveau aus der Analyse und hält sich an mögliche Klassen', async () => {
    const { suggestLevelFromVocab } = await import('../src/renderer/src/modules/vokabeltest/generation/autoPlan')
    const ai = async <T>(): Promise<T> => ({ grade: 12, level: 'B1', topic: 'Reisen', reason: 'Wortschatz zum Reisen' }) as T
    const grades = [5, 6, 7, 8, 9, 10].map((g) => ({ value: String(g), level: 'A2' as const }))
    const s = await suggestLevelFromVocab(vocab(10), 'Green Line 4 Unit 2', settings, grades, ai)
    expect(s).toEqual({ grade: 10, level: 'B1', topic: 'Reisen', reason: 'Wortschatz zum Reisen' })
  })
})

describe('Abwechslung bei der automatischen Formatwahl', () => {
  it('zieht nicht immer dieselben Formate', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) seen.add(fallbackTypes(settings, 16).join('+'))
    expect(seen.size).toBeGreaterThan(3)
  })

  it('mischt Wiedererkennen, Anwenden und Produzieren statt drei geschlossener Formate', () => {
    const closed = ['multipleChoice', 'matchDefinitions', 'oddOneOut', 'trueFalse', 'categorize', 'scrambled']
    for (let i = 0; i < 30; i++) {
      const picked = fallbackTypes({ level: 'B1' }, 16)
      expect(picked.every((t) => closed.includes(t))).toBe(false)
    }
  })

  it('wählt nur Formate, die das Niveau erlaubt, und hält die Mindestanzahl ein', () => {
    for (let i = 0; i < 30; i++) {
      const picked = fallbackTypes({ level: 'A1' }, 8)
      expect(new Set(picked).size).toBe(picked.length)
      for (const t of picked) {
        expect(levelAtLeast('A1', TASK_TYPES[t].minLevel)).toBe(true)
        expect(TASK_TYPES[t].minItems ?? 1).toBeLessThanOrEqual(4)
      }
    }
  })
})
