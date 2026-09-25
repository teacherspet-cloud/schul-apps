import { describe, expect, it } from 'vitest'
import { answerItems, taskItems } from '../src/renderer/src/modules/arbeitsblatt/model/items'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { partPrompt } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Answer, TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'

const answer = (kind: Answer['kind'], patch: Partial<Answer> = {}): Answer => ({ ...emptyAnswer(kind), ...patch })

const task = (a: Answer, parts: { answer: Answer }[] = []): TaskBlock => ({
  id: 't1',
  type: 'task',
  instruction: 'Bearbeite …',
  operator: '',
  afbReason: '',
  socialForm: 'EA',
  answer: a,
  parts: parts.map((p, i) => ({ id: `p${i}`, instruction: '', answer: p.answer, solution: '' })),
  solution: '',
  points: 0,
  minutes: 5
})

describe('Zahl der Items einer Aufgabe', () => {
  it('zählt jede Lücke eines Lückentextes', () => {
    expect(answerItems(answer('gapText', { gapText: 'He [[has]] been [[here]] since [[2019]].' }))).toBe(3)
  })

  it('zählt jede Richtig-Falsch-Aussage', () => {
    expect(
      answerItems(
        answer('trueFalse', {
          statements: [
            { text: 'a', isTrue: true },
            { text: 'b', isTrue: false }
          ]
        })
      )
    ).toBe(2)
  })

  it('zählt beim Zuordnen die linke Seite – die überzähligen rechts sind Ablenker', () => {
    expect(answerItems(answer('matching', { left: ['a', 'b', 'c'], right: ['1', '2', '3', '4'], pairs: [0, 1, 2] }))).toBe(3)
  })

  it('zählt bei einer Tabelle die leeren Zellen', () => {
    expect(
      answerItems(
        answer('tableFill', {
          headers: ['Wer', 'Was'],
          rows: [
            ['Anna', ''],
            ['', '']
          ]
        })
      )
    ).toBe(3)
  })

  it('wertet eine Multiple-Choice-Frage als EIN Item, nicht als eines je Möglichkeit', () => {
    // Sonst stünde bei einer Frage mit vier Möglichkeiten „4 Items" – und die Punkte stimmten nicht
    expect(answerItems(answer('multipleChoice', { options: ['a', 'b', 'c', 'd'], correct: [0] }))).toBe(1)
  })

  it('wertet eine Reihenfolge als Ganzes', () => {
    expect(answerItems(answer('ordering', { items: ['a', 'b', 'c'] }))).toBe(1)
  })

  it('zählt Teilaufgaben zusammen', () => {
    const t = task(answer('none'), [
      { answer: answer('trueFalse', { statements: [{ text: 'a', isTrue: true }] }) },
      { answer: answer('gapText', { gapText: '[[x]] und [[y]]' }) }
    ])
    expect(taskItems(t)).toBe(3)
  })

  it('zählt ohne Antwortbereich nichts', () => {
    expect(answerItems(answer('none'))).toBe(0)
  })
})

describe('Klassenarbeit: Items bestimmen die Punkte des Teils', () => {
  const exam = (part: Partial<ExamPart>): Exam => ({
    version: 1,
    design: { id: 'd', name: 'x' } as Exam['design'],
    createdAt: '',
    meta: { ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'), topic: 'Growing up' },
    parts: [
      {
        id: 'p1',
        formatId: 'en-listening',
        label: 'Listening comprehension',
        competence: 'Hörverstehen',
        weight: 100,
        points: 8,
        minutes: 20,
        gradeGroup: 'other',
        afbMix: { I: 30, II: 45, III: 25 },
        blocks: [],
        ...part
      }
    ]
  })

  it('gibt die vorgegebene Zahl an die KI weiter', () => {
    const e = exam({ items: 8, points: 8 })
    expect(partPrompt(e, e.parts[0], 1)).toMatch(/GENAU 8 Items/)
    expect(partPrompt(e, e.parts[0], 1)).toMatch(/ein Punkt je Item/)
  })

  it('bleibt ohne Vorgabe bei der freien Verteilung', () => {
    const e = exam({})
    expect(partPrompt(e, e.parts[0], 1)).not.toMatch(/GENAU \d+ Items/)
    expect(partPrompt(e, e.parts[0], 1)).toMatch(/Verteile sie auf die Items/)
  })
})
