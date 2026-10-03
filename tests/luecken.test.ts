import { describe, expect, it } from 'vitest'
import { lueckentextOhneDoppelte, mitOptionalem, ohneDoppelte, optionalesInLoesung, teileVon } from '../src/shared/luecken'

/* Lücken (02.10.2026): zweiteilige Wendungen, doppelte Wörter an der Lücke */
describe('Lücken', () => {
  it('teilt mehrteilige Lösungen', () => {
    expect(teileVon('not only … but (also)')).toEqual(['not only', 'but (also)'])
    expect(teileVon('either ... or')).toEqual(['either', 'or'])
    expect(teileVon('to reward')).toEqual(['to reward'])
  })
  it('kennt optionale Teile in Klammern', () => {
    expect(mitOptionalem('but (also)')).toEqual(['but also', 'but'])
    expect(mitOptionalem('reward')).toEqual(['reward'])
  })
  it('nimmt Doppeltes an der Lücke aus der Lösung', () => {
    expect(ohneDoppelte('She wanted to', 'to reward', 'her.').loesung).toBe('reward')
    expect(ohneDoppelte('He is a', 'a teacher', 'at our school.').loesung).toBe('teacher')
    expect(ohneDoppelte('Please', 'look after', 'after the baby.').loesung).toBe('look')
    expect(ohneDoppelte('I go to', 'school', 'every day.').loesung).toBe('school')
    // Nie die ganze Lösung entfernen
    expect(ohneDoppelte('to', 'to', '').loesung).toBe('to')
  })
  it('bereinigt Lückentexte mit [[Lösung]]', () => {
    expect(lueckentextOhneDoppelte('She wanted to [[to reward]] her. I go to [[school]].')).toBe('She wanted to [[reward]] her. I go to [[school]].')
  })
})

import { lueckenSatz, parseGapText } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import { bewerte, onlineFassung, summe } from '../src/renderer/src/modules/onlinetest/kern'
import { blockPoints } from '../src/renderer/src/modules/vokabeltest/model/blocks'
import type { Block, Variant, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

describe('Lücken im Vokabeltest', () => {
  it('Lückensatz: doppeltes „to" weg, zweiteilige Wendung mit Mittelteil', () => {
    expect(lueckenSatz('She wanted to', 'to reward', 'her.', '').answer).toBe('reward')
    const z = lueckenSatz('The club', 'not only … but also', 'collected old books.', 'sold cards')
    expect(z.sentences[0].mitte).toBe('sold cards')
    expect(z.answer).toBe('not only … but also')
  })
  it('Lückentext: dieselbe Vokabel zweimal = zwei Teile, ein Punkt', () => {
    const vocab: VocabEntry[] = [{ id: 'v1', term: 'not only … but also', translation: 'nicht nur … sondern auch' } as VocabEntry]
    const parts = parseGapText(
      { text: 'The club [[v1]] sold cards [[v1]] collected books.', gaps: [{ vocabId: 'v1', answer: 'not only … but (also)' }] },
      vocab,
      createRng(1)
    )
    const gaps = parts.filter((p) => p.type === 'gap') as { answer: string; folge?: boolean }[]
    expect(gaps.map((g) => g.answer)).toEqual(['not only', 'but (also)'])
    expect(gaps[1].folge).toBe(true)
    const block = {
      id: 'b',
      kind: 'gapText',
      taskType: 'gapText',
      title: 'T',
      instruction: 'I',
      pointsPerItem: 1,
      parts,
      wordBank: false,
      firstLetterHint: false,
      extraBankWords: []
    } as unknown as Block
    expect(blockPoints(block)).toBe(1)
  })
  it('Onlinetest: zwei Felder, „(also)" optional, Wiederholung des Vorworts nicht falsch', () => {
    const v: Variant = {
      id: 'A',
      label: 'A',
      blocks: [
        {
          id: 'b',
          kind: 'gap',
          taskType: 'gapSentences',
          title: 'T',
          instruction: 'I',
          pointsPerItem: 1,
          wordBank: false,
          firstLetterHint: false,
          extraBankWords: [],
          items: [
            { id: 'z', sentences: [{ before: 'The club', mitte: 'sold cards', after: 'collected books.' }], answer: 'not only … but (also)' },
            { id: 't', sentences: [{ before: 'She wanted to', after: 'her.' }], answer: 'reward' }
          ]
        } as unknown as Block
      ]
    }
    const f = onlineFassung(v)
    expect(f.einheiten.length).toBe(2)
    const b = bewerte(f, { 'b.z.a': 'not only', 'b.z.b': 'but', 'b.t.a': 'to reward' })
    expect(summe(b)).toBe(2)
    expect(summe(bewerte(f, { 'b.z.a': 'not only', 'b.z.b': '', 'b.t.a': 'reward' }))).toBe(1)
  })
})

describe('Optionaler Teil der Vokabel an der Lücke (03.10.2026)', () => {
  it('„lots (of)" + „___ of books": „of" aus dem Satz in die Lösung', () => {
    expect(optionalesInLoesung('Mia: Yes, and there are', 'lots (of)', ' of books there.')).toEqual({
      vor: 'Mia: Yes, and there are',
      loesung: 'lots of',
      nach: ' books there.'
    })
    const s = lueckenSatz('Mia: Yes, and there are', 'lots (of)', 'of books there.')
    expect(s.answer).toBe('lots of')
    expect(s.sentences[0].after).toBe('books there.')
  })
  it('vorne: „to ___" mit „(to) go" → Lösung „to go"', () => {
    const o = optionalesInLoesung('I want to', '(to) go', 'home.')
    expect(o).toEqual({ vor: 'I want ', loesung: 'to go', nach: 'home.' })
  })
  it('ohne passenden Nachbarn bleibt alles, wie es ist', () => {
    expect(optionalesInLoesung('There are', 'lots (of)', 'apples.')).toEqual({ vor: 'There are', loesung: 'lots (of)', nach: 'apples.' })
    expect(optionalesInLoesung('He is', 'often', 'late.')).toEqual({ vor: 'He is', loesung: 'often', nach: 'late.' })
    // „of" nur als ganzes Wort – „offer" bleibt
    expect(optionalesInLoesung('a', 'lots (of)', 'offer').loesung).toBe('lots (of)')
  })
})
