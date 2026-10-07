import { describe, expect, it } from 'vitest'
import { abgabenHtml } from '../src/renderer/src/modules/onlinetest/blattAnsicht'
import type { Variant } from '../src/renderer/src/modules/vokabeltest/model/types'

/* Kästchen-Aufgaben (07.10.2026): auch Zuordnen, Ankreuzen, Sortieren, richtig/falsch und Odd one out tragen ✓/✗ */
describe('Korrekturzeichen bei Kästchen-Aufgaben', () => {
  const basis = { title: '', instruction: '', pointsPerItem: 1 }
  const v = {
    id: 'A',
    label: 'A',
    blocks: [
      {
        ...basis,
        id: 'm',
        kind: 'match',
        taskType: 'collocations',
        left: [
          { id: 'l1', text: 'make', answerId: 'r1' },
          { id: 'l2', text: 'take', answerId: 'r2' }
        ],
        right: [
          { id: 'r1', text: 'a decision' },
          { id: 'r2', text: 'a photo' }
        ]
      },
      {
        ...basis,
        id: 'c',
        kind: 'choice',
        taskType: 'multipleChoice',
        items: [{ id: 'i1', before: 'He', after: 'home.', options: ['go', 'goes'], correct: 1 }]
      },
      {
        ...basis,
        id: 'k',
        kind: 'categorize',
        taskType: 'categorize',
        categories: [{ id: 'k1', name: 'Obst' }],
        words: [{ id: 'w1', text: 'apple', categoryId: 'k1' }]
      },
      {
        ...basis,
        id: 't',
        kind: 'trueFalse',
        taskType: 'trueFalse',
        askCorrection: false,
        items: [{ id: 's1', statement: 'Snow is hot.', isTrue: false, correction: '' }]
      },
      {
        ...basis,
        id: 'o',
        kind: 'oddOneOut',
        taskType: 'oddOneOut',
        askReason: false,
        items: [{ id: 'x1', words: ['cat', 'dog', 'car'], answer: 'car', reason: '' }]
      }
    ]
  } as unknown as Variant
  const bewertung = {
    'm.l1.a': { status: 'richtig', punkte: 1, quelle: 'regel' },
    'm.l2.a': { status: 'falsch', punkte: 0, quelle: 'regel' },
    'c.i1.a': { status: 'richtig', punkte: 1, quelle: 'regel' },
    'k.w1.a': { status: 'richtig', punkte: 1, quelle: 'regel' },
    't.s1.w': { status: 'falsch', punkte: 0, quelle: 'regel' },
    'o.x1.w': { status: 'richtig', punkte: 1, quelle: 'regel' }
  } as never
  const html = abgabenHtml({ header: { title: 'T' }, settings: { targetLanguage: 'en' }, fontSize: 12 } as never, [
    {
      variante: v,
      antworten: { 'm.l1.a': 'r1', 'm.l2.a': 'r1', 'c.i1.a': '1', 'k.w1.a': 'k1', 't.s1.w': 'true', 'o.x1.w': 'car' },
      bewertung,
      abgabe: { name: 'Mia', datum: '07.10.2026', punkte: 4, max: 6, note: null }
    }
  ])
  it('jede Einheit hat ihr anklickbares Zeichen', () => {
    for (const [e, z] of Object.entries({ 'm.l1.a': '✓', 'm.l2.a': '✗', 'c.i1.a': '✓', 'k.w1.a': '✓', 't.s1.w': '✗', 'o.x1.w': '✓' }))
      expect(html).toMatch(new RegExp(`data-einheit="${e.replace(/\./g, '.')}">${z}<`))
    expect(html).not.toContain('⟦')
  })
})
