import { describe, expect, it } from 'vitest'
import type { GapBlock, TestSettings, VocabEntry, Variant } from '../src/renderer/src/modules/vokabeltest/model/types'
import { TASK_TYPES, type GenContext } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import { bewerte as onlineBewerte, onlineFassung } from '../src/renderer/src/modules/onlinetest/kern'

/* Aufgabe „Abkürzungen auflösen" im Vokabeltest (09.10.2026): ohne KI, Lösung = ganzer Eintrag, Onlinetest-Prüfung */

const settings = (extra: Partial<TestSettings> = {}): TestSettings =>
  ({
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 9,
    level: 'B1',
    vocabCount: 10,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [{ type: 'abbreviations', count: 3, pointsPerItem: 1 }],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1,
    ...extra
  }) as TestSettings
const ctx = (s: TestSettings = settings()): GenContext => ({ settings: s, languageName: 'English', rng: createRng(7), allVocab: [] })
const v = (id: string, term: string, translation = 'x'): VocabEntry => ({ id, term, translation })

describe('Vokabeltest: Abkürzungen auflösen', () => {
  const def = TASK_TYPES.abbreviations
  const vocab = [v('a', 'YA (= young adults)', 'Jugend-'), v('b', 'TV (= television)', 'Fernsehen'), v('c', 'GCSE (= General Certificate of Secondary Education)')]

  it('nimmt nur Einträge mit Abkürzungs-Paar und braucht keine KI', () => {
    expect(def.schema).toBeUndefined()
    expect(def.accepts!(v('x', 'house'))).toBe(false)
    expect(def.accepts!(v('x', 'PC'))).toBe(false)
    expect(def.accepts!(v('x', 'YA (= young adults)'))).toBe(true)
  })

  it('abwechselnd auflösen und kürzen; „nur auflösen" bleibt auflösen', () => {
    const b = def.build(vocab, {}, ctx()) as GapBlock
    expect(b.kind).toBe('gap')
    expect(b.title).toBe('Abbreviations')
    expect(b.items.map((i) => [i.sentences[0].before, i.answer, i.sentences[0].after])).toEqual([
      ['YA = ', 'young adults', ''],
      ['', 'TV', ' = television'],
      ['GCSE = ', 'General Certificate of Secondary Education', '']
    ])
    expect((def.build(vocab, {}, ctx(settings({ targetLanguage: 'fr' }))) as GapBlock).instruction).toContain('abréviation')
  })

  it('Onlinetest: die gefragte Seite zählt', () => {
    const b = def.build(vocab.slice(0, 1), {}, ctx()) as GapBlock
    const f = onlineFassung({ id: 'v', label: 'A', blocks: [b] } as Variant)
    const feld = Object.keys(f.loesungen)[0]
    expect(Object.values(onlineBewerte(f, { [feld]: 'young adults' }))[0].status).toBe('richtig')
    expect(Object.values(onlineBewerte(f, { [feld]: 'old people' }))[0].status).toBe('falsch')
  })
})
