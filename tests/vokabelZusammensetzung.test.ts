import { describe, expect, it } from 'vitest'
import { planeZusammensetzung, schwierigkeitNachKlasse, umfangFuer } from '../src/renderer/src/modules/vokabeltest/generation/autoPlan'
import type { TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * „Test einstellen" (29.09.2026, Wunsch der Lehrkraft): Die KI stellt die Aufgabentypen aus den
 * gewählten Vokabeln zusammen, standardmäßig 14–18 Vokabeln; die Klasse bestimmt die
 * Schwierigkeit der Formate mit.
 */
const woerter = (n: number): VocabEntry[] => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, term: `word${i}`, translation: `Wort${i}` }) as VocabEntry)
const einstellung = (over: Partial<TestSettings> = {}): TestSettings =>
  ({
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 6,
    level: 'A1',
    vocabCount: 16,
    variantCount: 2,
    variantMode: 'sameVocab',
    tasks: [],
    topic: '',
    pictureSource: 'auto',
    answerKey: true,
    seed: 1,
    ...over
  }) as TestSettings
const fest = (): number => 0.3

describe('Zusammensetzung beim Test einstellen', () => {
  it('Umfang 14–18, kürzere Listen ganz', () => {
    expect(umfangFuer(40)).toEqual({ min: 14, max: 18 })
    expect(umfangFuer(10)).toEqual({ min: 10, max: 10 })
  })

  it('übernimmt den KI-Plan, wenn er im Bereich liegt', async () => {
    let anfrage = ''
    const ai = (async (req: { user: string }) => {
      anfrage = req.user
      return {
        tasks: [
          { type: 'gapSentences', count: 7, reason: 'Verben im Kontext' },
          { type: 'multipleChoice', count: 5, reason: 'Wiedererkennen' },
          { type: 'matchDefinitions', count: 5, reason: 'Nomen' }
        ]
      }
    }) as never
    const plan = await planeZusammensetzung(woerter(30), einstellung(), ai, fest)
    expect(plan.vocabCount).toBe(17)
    expect(plan.tasks.map((t) => t.type)).toEqual(['gapSentences', 'multipleChoice', 'matchDefinitions'])
    expect(plan.reasons).toHaveLength(3)
    expect(anfrage).toMatch(/between 14 and 18/)
    expect(anfrage).toMatch(/Grade 6 \(A1\): young beginners/)
  })

  it('zieht zu große Pläne in den Bereich und plant ohne KI regelbasiert mit 16', async () => {
    const zuViel = (async () => ({ tasks: [{ type: 'gapSentences', count: 20, reason: '' }, { type: 'multipleChoice', count: 10, reason: '' }] })) as never
    expect((await planeZusammensetzung(woerter(40), einstellung(), zuViel, fest)).vocabCount).toBe(18)
    const ohne = await planeZusammensetzung(woerter(40), einstellung(), null, fest)
    expect(ohne.vocabCount).toBe(16)
    expect(ohne.tasks.length).toBeGreaterThan(1)
  })

  it('Schwierigkeit nach Klasse: Anfänger geschlossen, Oberstufe produktiv', () => {
    expect(schwierigkeitNachKlasse({ grade: 5, level: 'A1' })).toMatch(/closed recognition/)
    expect(schwierigkeitNachKlasse({ grade: 7, level: 'A2' })).toMatch(/guided productive/)
    expect(schwierigkeitNachKlasse({ grade: 10, level: 'B1' })).toMatch(/own production/)
  })
})
