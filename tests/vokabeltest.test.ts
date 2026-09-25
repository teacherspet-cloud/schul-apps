import { blockHelp } from '../src/renderer/src/modules/vokabeltest/render/helpTexts'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { CefrTable, StructuredRequest } from '../src/shared/types'
import { buildCrossword, crosswordForm, scrambleWord } from '../src/renderer/src/modules/vokabeltest/generation/crossword'
import { distributeEvenly, planVariants, requestedCount } from '../src/renderer/src/modules/vokabeltest/generation/distribute'
import { defaultHeader, generateTest } from '../src/renderer/src/modules/vokabeltest/generation/generate'
import { checkBlock, containsWord } from '../src/renderer/src/modules/vokabeltest/generation/quality'
import { parseGapText } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { buildDocx } from '../src/renderer/src/modules/vokabeltest/export/docx'
import { parseDelimited } from '../src/renderer/src/modules/vokabeltest/input/parseTable'
import { blockPoints, variantPoints, wordBankFor } from '../src/renderer/src/modules/vokabeltest/model/blocks'
import { gradeOptions, suggestLevel } from '../src/renderer/src/modules/vokabeltest/model/cefr'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { TaskTypeId, TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'
import { TASK_TYPE_LIST } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { parseProjectFile, serializeProject } from '../src/renderer/src/modules/vokabeltest/project'
import { writeFileSync } from 'fs'
import { mockAi } from './mockAi'
import { passtZurSprache } from '../src/renderer/src/modules/vokabeltest/didactics/latein'

const WORDS: [string, string][] = [
  ['ladder', 'Leiter'],
  ['to explore', 'erkunden'],
  ['castle', 'Burg'],
  ['brave', 'mutig'],
  ['to borrow', 'ausleihen'],
  ['journey', 'Reise'],
  ['umbrella', 'Regenschirm'],
  ['to whisper', 'flüstern'],
  ['neighbour', 'Nachbar/in'],
  ['to be afraid of', 'Angst haben vor'],
  ['island', 'Insel'],
  ['guide', 'Führer/in'],
  ['map', 'Karte'],
  ['bridge', 'Brücke']
]

const vocab: VocabEntry[] = WORDS.map(([term, translation], i) => ({ id: `v${i}`, term, translation }))

function settings(patch: Partial<TestSettings> = {}): TestSettings {
  return {
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 6,
    level: 'A2',
    vocabCount: 9,
    variantCount: 2,
    variantMode: 'sameVocab',
    tasks: [
      { type: 'gapSentences', count: 3, pointsPerItem: 1 },
      { type: 'matchDefinitions', count: 3, pointsPerItem: 1 },
      { type: 'crossword', count: 3, pointsPerItem: 1 }
    ],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 42,
    ...patch
  }
}

describe('Verteilung auf Varianten', () => {
  it('fragt jede Vokabel pro Variante höchstens einmal ab', () => {
    const plans = planVariants(
      vocab,
      settings({
        variantMode: 'differentVocab',
        tasks: [
          { type: 'gapSentences', count: 5, pointsPerItem: 1 },
          { type: 'multipleChoice', count: 2, pointsPerItem: 1 }
        ]
      })
    )
    expect(plans).toHaveLength(2)
    for (const p of plans) {
      const ids = p.assignments.flatMap((a) => a.vocab.map((v) => v.id))
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toHaveLength(7)
    }
    const a = new Set(plans[0].assignments.flatMap((x) => x.vocab.map((v) => v.id)))
    const b = plans[1].assignments.flatMap((x) => x.vocab.map((v) => v.id))
    // Bei 14 Wörtern und 7 pro Variante überschneiden sich die Varianten nicht
    expect(b.filter((id) => a.has(id))).toHaveLength(0)
  })

  it('nutzt bei „gleiche Vokabeln" dieselbe Auswahl in allen Varianten', () => {
    const plans = planVariants(vocab, settings())
    const ids = (i: number) => plans[i].assignments.map((a) => a.vocab.map((v) => v.id).sort())
    expect(ids(1)).toEqual(ids(0))
  })

  it('ist mit gleichem Seed reproduzierbar', () => {
    expect(planVariants(vocab, settings())).toEqual(planVariants(vocab, settings()))
  })

  it('berücksichtigt Einschränkungen und meldet fehlende Wörter', () => {
    const plans = planVariants(vocab, settings({ tasks: [{ type: 'crossword', count: 20, pointsPerItem: 1 }] }))
    const a = plans[0].assignments[0]
    expect(a.vocab.every((v) => !v.term.includes(' ') || v.term.startsWith('to '))).toBe(true)
    expect(a.shortfall).toBeGreaterThan(0)
  })

  it('verteilt eine Gesamtzahl gleichmäßig', () => {
    const tasks = distributeEvenly(settings().tasks, 10)
    expect(requestedCount({ tasks })).toBe(10)
    // Kreuzworträtsel braucht mindestens 4 Wörter
    expect(tasks.map((t) => t.count)).toEqual([3, 3, 4])
  })
})

describe('Kreuzworträtsel', () => {
  it('platziert Wörter ohne Konflikte', () => {
    const words = ['LADDER', 'CASTLE', 'BRAVE', 'ISLAND', 'BRIDGE', 'JOURNEY'].map((w, i) => ({ id: String(i), word: w }))
    const layout = buildCrossword(words, createRng(1))
    expect(layout.placed.length).toBeGreaterThanOrEqual(5)
    const grid = new Map<string, string>()
    for (const p of layout.placed) {
      for (let i = 0; i < p.word.length; i++) {
        const r = p.row + (p.dir === 'down' ? i : 0)
        const c = p.col + (p.dir === 'across' ? i : 0)
        expect(r).toBeLessThan(layout.rows)
        expect(c).toBeLessThan(layout.cols)
        const k = `${r},${c}`
        if (grid.has(k)) expect(grid.get(k)).toBe(p.word[i])
        grid.set(k, p.word[i])
      }
    }
  })

  it('bereinigt Begriffe und mischt Buchstaben', () => {
    expect(crosswordForm('to explore')).toBe('EXPLORE')
    const s = scrambleWord('castle', createRng(3))
    expect(s).not.toBe('castle')
    expect([...s].sort().join('')).toBe([...'castle'].sort().join(''))
  })
})

describe('Qualitätsprüfung', () => {
  it('erkennt verratene Lösungen', () => {
    expect(containsWord('I climbed up the ladder.', 'ladder')).toBe(true)
    expect(containsWord('The ladders were long.', 'ladder')).toBe(false)
    const issues = checkBlock(
      {
        id: 'b',
        taskType: 'gapSentences',
        kind: 'gap',
        title: '',
        instruction: '',
        pointsPerItem: 1,
        wordBank: false,
        firstLetterHint: false,
        extraBankWords: [],
        items: [{ id: 'i', vocabId: 'v0', sentences: [{ before: 'The ladder is a', after: '.' }], answer: 'ladder' }]
      },
      [vocab[0], vocab[1]]
    )
    expect(issues.map((i) => i.message).join(' ')).toMatch(/steht bereits im Satz/)
    expect(issues.map((i) => i.message).join(' ')).toMatch(/Nicht abgefragt: to explore/)
  })
})

describe('Lückentext', () => {
  it('zerlegt Markierungen in Text und Lücken', () => {
    const parts = parseGapText(
      {
        text: 'We [[v1]] the [[v2]].',
        gaps: [
          { vocabId: 'v1', answer: 'explored' },
          { vocabId: 'v2', answer: 'castle' }
        ]
      },
      vocab,
      createRng(1)
    )
    expect(parts.map((p) => p.type)).toEqual(['text', 'gap', 'text', 'gap', 'text'])
    expect(parts[1]).toMatchObject({ answer: 'explored', bankWord: 'to explore' })
  })
})

describe('Tabellen einfügen', () => {
  it('liest Excel-Zwischenablage und Bindestrich-Listen', () => {
    expect(parseDelimited('Word\tGerman\nladder\tLeiter\nbrave\tmutig')).toMatchObject([
      { term: 'ladder', translation: 'Leiter' },
      { term: 'brave', translation: 'mutig' }
    ])
    expect(parseDelimited('to explore – erkunden\ncastle - Burg')).toMatchObject([
      { term: 'to explore', translation: 'erkunden' },
      { term: 'castle', translation: 'Burg' }
    ])
  })
})

describe('GER-Tabelle', () => {
  const table: CefrTable = {
    version: 1,
    states: [
      {
        id: 'NI',
        name: 'Niedersachsen',
        schoolTypes: [
          {
            id: 'gymnasium',
            name: 'Gymnasium',
            languages: [{ order: 1, startGrade: 5, grades: { '6': { level: 'A2', basis: 'Lehrplan' }, '5': { level: 'A1+', basis: 'interpoliert' } } }]
          }
        ]
      }
    ]
  }
  it('schlägt das Niveau zur Klasse vor', () => {
    expect(gradeOptions(table, 'NI', 'gymnasium', 1).map((g) => g.value)).toEqual(['5', '6'])
    expect(suggestLevel(table, 'NI', 'gymnasium', 1, 6)).toEqual({ level: 'A2', basis: 'Lehrplan' })
    expect(suggestLevel(table, 'NI', 'gymnasium', 2, 6)).toBeNull()
  })
})

describe('Generierung mit simulierter KI', () => {
  it('erstellt Varianten mit Punkten, Lösungen und Word-Datei', async () => {
    const calls: StructuredRequest[] = []
    const doc = await generateTest(vocab, settings(), defaultHeader('Testschule'), { ai: mockAi(calls), review: true })

    expect(doc.variants.map((v) => v.label)).toEqual(['A', 'B'])
    for (const v of doc.variants) {
      expect(v.blocks.map((b) => b.kind)).toEqual(['gap', 'match', 'crossword'])
      expect(variantPoints(v)).toBe(v.blocks.reduce((s, b) => s + blockPoints(b), 0))
    }
    const gap = doc.variants[0].blocks[0]
    expect(gap.kind === 'gap' && gap.items).toHaveLength(3)
    // Mindestens zwei überzählige Wörter im Wortkasten, Hinweis mit genauer Anzahl
    expect(wordBankFor(gap).length).toBeGreaterThanOrEqual(5)
    expect(blockHelp(gap, 'en').join(' ')).toMatch(/You do not need \d+ words\./)
    // Das Niveau steht im Systemprompt jeder Anfrage
    expect(calls.every((c) => c.system.includes('CEFR level: A2'))).toBe(true)
    expect(calls.some((c) => c.schemaName === 'review')).toBe(true)

    const bytes = await buildDocx(doc, { variantIds: doc.variants.map((v) => v.id), includeKey: true }, async () => ({ width: 100, height: 100 }))
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Vocabulary test')
    expect(xml).toContain('Test A')
    expect(xml).toContain('Test B')
    expect(xml).toContain('answer key')
    expect(xml).toContain('explanation number 0')
  })
})

describe('Alle Aufgabentypen', () => {
  /*
   * Nach Sprache getrennt: Die lateinischen Formate und die der modernen Fremdsprachen
   * kommen in der App nie zusammen in einem Test vor (siehe `didactics/latein.ts`). Sie in
   * einem Dokument zu mischen hieße, einen Fall zu prüfen, den es nicht gibt – und der
   * Wortvorrat der Prüfung reichte dann für keinen von beiden.
   */
  const typesFuer = (sprache: string): TaskTypeId[] =>
    TASK_TYPE_LIST.map((d) => d.id).filter((t): t is TaskTypeId => t !== 'pictureLabel' && t !== 'freeText' && passtZurSprache(t, sprache))
  const types = typesFuer('en')

  it('erzeugen gültige Blöcke ohne Prüfhinweise und lassen sich exportieren', async () => {
    const all = settings({
      variantCount: 1,
      tasks: types.map((type) => ({ type, count: 4, pointsPerItem: 1 }))
    })
    // Genug Vokabeln für alle Aufgaben: Liste mehrfach mit neuen IDs
    const big: VocabEntry[] = Array.from({ length: 6 }, (_, r) => vocab.map((v) => ({ ...v, id: `${v.id}r${r}`, term: v.term + 'abcdef'.slice(0, r) }))).flat()
    const doc = await generateTest(big, all, defaultHeader(''), { ai: mockAi(), review: false })
    const blocks = doc.variants[0].blocks
    expect(blocks.map((b) => b.taskType)).toEqual(types)
    for (const b of blocks) {
      if (b.kind === 'crossword') continue // Platzierung hängt von den Wörtern ab
      expect({ type: b.taskType, warnings: b.warnings }).toEqual({ type: b.taskType, warnings: [] })
    }

    const restored = parseProjectFile(new TextEncoder().encode(serializeProject(doc)))
    expect(restored).toEqual(doc)

    const bytes = await buildDocx(doc, { variantIds: [doc.variants[0].id], includeKey: true }, async () => ({ width: 1, height: 1 }))
    expect(bytes.length).toBeGreaterThan(5000)

    // Für den Oberflächentest: Beispielprojekt ablegen
    if (process.env.WRITE_FIXTURE) writeFileSync(process.env.WRITE_FIXTURE, serializeProject(doc))
  })

  it('erzeugen auch für Latein gültige Blöcke und lassen sich exportieren', async () => {
    const lateinTypen = typesFuer('la')
    const all = settings({
      targetLanguage: 'la',
      variantCount: 1,
      tasks: lateinTypen.map((type) => ({ type, count: 4, pointsPerItem: 1 }))
    })
    const big: VocabEntry[] = Array.from({ length: 6 }, (_, r) => vocab.map((v) => ({ ...v, id: `${v.id}r${r}`, term: v.term + 'abcdef'.slice(0, r) }))).flat()
    const doc = await generateTest(big, all, defaultHeader(''), { ai: mockAi(), review: false })
    const blocks = doc.variants[0].blocks
    expect(blocks.map((b) => b.taskType)).toEqual(lateinTypen)
    for (const b of blocks) {
      if (b.kind === 'crossword') continue
      expect({ type: b.taskType, warnings: b.warnings }).toEqual({ type: b.taskType, warnings: [] })
    }
    // Der Nennform-Block ist der eigentliche Latein-Vokabeltest – er muss Zeilen haben
    const nennform = blocks.find((b) => b.kind === 'latinForms')
    expect(nennform && nennform.kind === 'latinForms' ? nennform.items.length : 0).toBeGreaterThan(0)
    const bytes = await buildDocx(doc, { variantIds: [doc.variants[0].id], includeKey: true }, async () => ({ width: 1, height: 1 }))
    expect(bytes.length).toBeGreaterThan(5000)
  })
})
