import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { filterModels } from '../src/main/services/ai/catalog'
import { generateBlock } from '../src/renderer/src/modules/vokabeltest/generation/generate'
import { checkBlock } from '../src/renderer/src/modules/vokabeltest/generation/quality'
import { GenContext } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { GapBlock, TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'
import { blockHelp } from '../src/renderer/src/modules/vokabeltest/render/helpTexts'
import { mockAi } from './mockAi'

describe('Modellliste der Anbieter', () => {
  it('OpenAI: nur passende Textmodelle, neuestes Flaggschiff empfohlen', () => {
    const raw = [
      'gpt-5.5',
      'gpt-5.4-mini',
      'gpt-6',
      'gpt-6-2026-08-01',
      'gpt-4o-audio-preview',
      'text-embedding-3-large',
      'gpt-image-2',
      'dall-e-2',
      'o4-mini',
      'gpt-5.5-chat-latest'
    ].map((id, i) => ({ id, created: 1000 + i }))
    const text = filterModels('openai', 'text', raw)
    expect(text.map((m) => m.id).sort()).toEqual(['gpt-5.4-mini', 'gpt-5.5', 'gpt-6', 'o4-mini'])
    expect(text[0]).toMatchObject({ id: 'gpt-6', recommended: true })
    expect(filterModels('openai', 'image', raw).map((m) => m.id)).toEqual(['gpt-image-2'])
  })

  it('Anthropic: Modelle ohne Bildeingabe fallen weg, neuestes Opus empfohlen', () => {
    const raw = [
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', created: 1, meta: { imageInput: true, structuredOutputs: true } },
      { id: 'claude-opus-5', label: 'Claude Opus 5', created: 3, meta: { imageInput: true, structuredOutputs: true } },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', created: 4, meta: { imageInput: true, structuredOutputs: true } },
      { id: 'claude-textonly', created: 5, meta: { imageInput: false } }
    ]
    const text = filterModels('anthropic', 'text', raw)
    expect(text.map((m) => m.id)).toEqual(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'])
    expect(text[0].label).toContain('Claude Opus 5')
    expect(filterModels('anthropic', 'image', raw)).toEqual([])
  })

  it('Google: Gemini-Textmodelle und Imagen-Bildmodelle', () => {
    const gen = { actions: ['generateContent'] }
    const raw = [
      { id: 'gemini-2.5-pro', meta: gen },
      { id: 'gemini-3.0-pro-preview', meta: gen },
      { id: 'gemini-3.0-pro', meta: gen },
      { id: 'gemini-3.0-flash', meta: gen },
      { id: 'gemini-2.5-flash-image', meta: gen },
      { id: 'text-embedding-004', meta: { actions: ['embedContent'] } },
      { id: 'imagen-4.0-generate-001', meta: { actions: ['predict'] } }
    ]
    const text = filterModels('google', 'text', raw)
    expect(text[0]).toMatchObject({ id: 'gemini-3.0-pro', recommended: true })
    expect(text.map((m) => m.id)).not.toContain('gemini-2.5-flash-image')
    expect(
      filterModels('google', 'image', raw)
        .map((m) => m.id)
        .sort()
    ).toEqual(['gemini-2.5-flash-image', 'imagen-4.0-generate-001'])
  })

  // Befund der Lehrkraft (27.10.2026): Google führt die 2.5er-Modelle noch in der Liste, gibt sie neuen Konten aber nicht
  // mehr frei – empfohlen wird das neueste stabile Modell, nicht das neueste stabile „Pro"
  it('Google: das neueste stabile Modell ist empfohlen, auch wenn es kein „Pro" ist', () => {
    const gen = { actions: ['generateContent'] }
    const raw = [
      { id: 'gemini-2.5-pro', meta: gen },
      { id: 'gemini-2.5-flash', meta: gen },
      { id: 'gemini-3.1-pro-preview', meta: gen },
      { id: 'gemini-3.8-flash', meta: gen },
      { id: 'gemini-3.8-flash-lite', meta: gen },
      { id: 'gemini-4-argon', meta: gen },
      { id: 'gemini-3.1-flash-image', meta: gen }
    ]
    const text = filterModels('google', 'text', raw)
    expect(text[0]).toMatchObject({ id: 'gemini-4-argon', recommended: true })
    expect(filterModels('google', 'image', raw)[0]).toMatchObject({ id: 'gemini-3.1-flash-image', recommended: true })
  })
})

const vocab: VocabEntry[] = [
  { id: 'a', term: 'to explore', translation: 'erkunden' },
  { id: 'b', term: 'castle', translation: 'Burg' },
  { id: 'c', term: 'brave', translation: 'mutig' }
]

function ctx(level: TestSettings['level']): GenContext {
  const settings: TestSettings = {
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 8,
    level,
    vocabCount: 3,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [{ type: 'gapSentences', count: 3, pointsPerItem: 1 }],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  }
  return { settings, languageName: 'English', rng: createRng(1), allVocab: vocab }
}

describe('Eindeutigkeit für Schüler', () => {
  it('Hinweiszeilen erklären Wortkasten, Formänderung und Anfangsbuchstaben', () => {
    const block: GapBlock = {
      id: 'x',
      taskType: 'gapSentences',
      kind: 'gap',
      title: '',
      instruction: '',
      pointsPerItem: 1,
      wordBank: true,
      firstLetterHint: false,
      extraBankWords: ['river'],
      items: [
        { id: '1', sentences: [{ before: 'We', after: 'the city.' }], answer: 'explored', bankWord: 'to explore', firstLetter: true },
        { id: '2', sentences: [{ before: 'An old', after: '.' }], answer: 'castle', bankWord: 'castle' }
      ]
    }
    const help = blockHelp(block, 'en').join(' ')
    expect(help).toContain('Use each word from the box only once.')
    expect(help).toContain('You do not need one word.')
    expect(help).toContain('change the form')
    expect(help).toContain('first letter')
    expect(blockHelp(block, 'fr').join(' ')).toContain('une seule fois')
    expect(blockHelp({ ...block, showHelp: false }, 'en')).toEqual([])
  })

  it('ohne Wortkasten ist der Anfangsbuchstabe voreingestellt', async () => {
    const b1 = await generateBlock('gapSentences', vocab, ctx('A2'), { ai: mockAi(), review: false })
    const b2 = await generateBlock('gapSentences', vocab, ctx('B2'), { ai: mockAi(), review: false })
    expect(b1).toMatchObject({ wordBank: true, firstLetterHint: false })
    expect(b2).toMatchObject({ wordBank: false, firstLetterHint: true })
  })

  // Ohne Wortkasten: Was mehrdeutig bleibt, bekommt den Anfangsbuchstaben (B1: keine Wortkästen)
  it('bleibt eine Lücke ohne Wortkasten nach der Korrektur mehrdeutig, wird der Anfangsbuchstabe ergänzt', async () => {
    const base = mockAi()
    let reviews = 0
    const calls: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      if (req.schemaName === 'review') {
        reviews++
        return { problems: [{ itemNumber: 2, problem: '"brave" would also fit.' }] } as T
      }
      return base<T>(req)
    }
    const block = (await generateBlock('gapSentences', vocab, ctx('B1'), { ai, review: true })) as GapBlock
    expect(block.wordBank).toBe(false)
    expect(reviews).toBe(2)
    // Die Wortliste wird der Prüfung mitgegeben
    expect(calls.find((c) => c.schemaName === 'review')!.user).toContain('Words tested in this task: to explore, castle, brave')
    expect(block.items[1].firstLetter).toBe(true)
    expect(block.items[0].firstLetter).toBeUndefined()
    expect(block.warnings?.join(' ')).toContain('Anfangsbuchstabe als Hilfe ergänzt')
    expect(calls.some((c) => c.schemaName === 'luecken_alternativen')).toBe(false)
  })

  // Mit Wortkasten (23.10.2026, abgestimmt): passende andere Wörter des Kastens gelten als „auch richtig“, kein Anfangsbuchstabe
  it('mit Wortkasten: weitere passende Wörter als „auch richtig“ statt Anfangsbuchstabe', async () => {
    const base = mockAi()
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      if (req.schemaName === 'review') return { problems: [{ itemNumber: 2, problem: '"brave" would also fit.' }] } as T
      if (req.schemaName === 'luecken_alternativen') return { gaps: [{ itemNumber: 2, alsoCorrect: ['brave', 'castle', 'to explore', 'wizard'] }] } as T
      return base<T>(req)
    }
    const block = (await generateBlock('gapSentences', vocab, ctx('A2'), { ai, review: true })) as GapBlock
    expect(block.wordBank).toBe(true)
    expect(block.items[1].firstLetter).toBeUndefined()
    const auch = block.items[1].auchRichtig ?? []
    expect(auch.length).toBeGreaterThan(0)
    expect(auch).not.toContain('wizard')
    expect(auch).not.toContain(block.items[1].answer)
    expect(block.warnings?.join(' ')).toContain('auch')
    expect(block.warnings?.join(' ')).not.toContain('would also fit')
  })

  it('doppelt gesuchte Wörter werden gemeldet', () => {
    const block: GapBlock = {
      id: 'x',
      taskType: 'gapSentences',
      kind: 'gap',
      title: '',
      instruction: '',
      pointsPerItem: 1,
      wordBank: true,
      firstLetterHint: false,
      extraBankWords: [],
      items: [
        { id: '1', vocabId: 'b', sentences: [{ before: 'A', after: '.' }], answer: 'castle', bankWord: 'castle' },
        { id: '2', vocabId: 'b', sentences: [{ before: 'The', after: '.' }], answer: 'castle', bankWord: 'Castle' }
      ]
    }
    expect(
      checkBlock(block, [vocab[1]])
        .map((i) => i.message)
        .join(' ')
    ).toContain('mehrfach gesucht')
  })
})

describe('Druckvorschau: Seitenbereich', () => {
  it('liest Bereiche und lehnt ungültige Eingaben ab', async () => {
    const { parsePageRanges } = await import('../src/renderer/src/shared/printRanges')
    expect(parsePageRanges('1-2, 4', 5)).toEqual([
      { from: 1, to: 2 },
      { from: 4, to: 4 }
    ])
    expect(parsePageRanges('3–5', 5)).toEqual([{ from: 3, to: 5 }])
    expect(parsePageRanges('0-2', 5)).toBeNull()
    expect(parsePageRanges('2-7', 5)).toBeNull()
    expect(parsePageRanges('abc', 5)).toBeNull()
  })
})
