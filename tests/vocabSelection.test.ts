import { describe, expect, it } from 'vitest'
import { planVariants } from '../src/renderer/src/modules/vokabeltest/generation/distribute'
import { toEntries } from '../src/renderer/src/modules/vokabeltest/input/importVocab'
import type { TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'
import { includedVocab, specialVocab } from '../src/renderer/src/modules/vokabeltest/model/vocab'

const entry = (term: string, patch: Partial<VocabEntry> = {}): VocabEntry => ({ id: term, term, translation: 'x', ...patch })

describe('Grau gedruckte Vokabeln und Vokabeln aus Kästen', () => {
  it('übernimmt die Kennzeichnung aus der KI-Erkennung und markiert alles außer den grauen', () => {
    const entries = toEntries({
      targetLanguage: 'en',
      entries: [
        { term: 'castle', translation: 'Burg', pos: 'noun', note: '', appearance: 'normal', inBox: false },
        { term: 'moat', translation: 'Burggraben', pos: '', note: '', appearance: 'grey', inBox: false },
        { term: 'knight', translation: 'Ritter', pos: '', note: '', appearance: 'normal', inBox: true },
        { term: ' ', translation: '', pos: '', note: '', appearance: 'normal', inBox: false }
      ]
    })
    // Grau gedruckte Vokabeln müssen die Schüler nicht lernen – alles andere ist markiert
    expect(entries.map((e) => [e.term, Boolean(e.grey), Boolean(e.inBox), e.include])).toEqual([
      ['castle', false, false, true],
      ['moat', true, false, false],
      ['knight', false, true, true]
    ])
    expect(includedVocab(entries).map((e) => e.term)).toEqual(['castle', 'knight'])
  })

  it('findet die gekennzeichneten Gruppen für die Auswahlleiste', () => {
    const list = [entry('castle'), entry('moat', { grey: true }), entry('knight', { inBox: true }), entry('drawbridge', { grey: true, inBox: true })]
    expect(specialVocab(list).grey.map((v) => v.term)).toEqual(['moat', 'drawbridge'])
    expect(specialVocab(list).box.map((v) => v.term)).toEqual(['knight', 'drawbridge'])
    // Nach dem Import ist alles markiert; abgewählt wird in der Liste
    expect(includedVocab(list)).toHaveLength(4)
    const ohneKasten = list.map((v) => (v.inBox ? { ...v, include: false } : v))
    expect(includedVocab(ohneKasten).map((v) => v.term)).toEqual(['castle', 'moat'])
  })

  it('nur markierte Vokabeln kommen in den Test', () => {
    const vocab = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'].map((t, i) => entry(t, i % 2 ? { include: false } : {}))
    const settings: TestSettings = {
      targetLanguage: 'en',
      stateId: 'NI',
      schoolTypeId: 'gymnasium',
      languageOrder: 1,
      grade: 6,
      level: 'A2',
      vocabCount: 6,
      variantCount: 2,
      variantMode: 'differentVocab',
      tasks: [{ type: 'gapSentences', count: 6, pointsPerItem: 1 }],
      topic: '',
      pictureSource: 'none',
      answerKey: true,
      seed: 3
    }
    const used = planVariants(vocab, settings).flatMap((p) => p.assignments.flatMap((a) => a.vocab.map((v) => v.term)))
    expect(new Set(used)).toEqual(new Set(['a1', 'c3', 'e5']))
  })
})
