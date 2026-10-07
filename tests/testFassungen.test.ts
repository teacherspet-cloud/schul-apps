import { describe, expect, it, vi } from 'vitest'

/*
 * Fassungen A–D für Grammatiktest und Lernzielkontrolle (06.10.2026): umgestellt ohne KI,
 * parallel mit EINER Anfrage für alle weiteren Fassungen, alte Gruppe B weiter lesbar.
 */
import {
  abweichungZuA,
  begrenzteFassungen,
  loesungMitPositionen,
  mitNeuenKennungen,
  umgestellteFassung,
  umgestellteFassungen
} from '../src/renderer/src/shared/testFassungen'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Answer, TaskBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { alleTestBloecke, fassungsListe, mitFassungen, testFassungen, type GrammarTest } from '../src/renderer/src/modules/grammatiktest/model/types'
import { fassungenAuftrag, generateTestFassungen } from '../src/renderer/src/modules/grammatiktest/generation/generateTest'
import { testToWorksheet } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { testStats } from '../src/renderer/src/modules/grammatiktest/library'
import { setzeBlindprobe } from '../src/renderer/src/shared/verstehen/blindprobe'

const design = { id: 'd', name: 'Standard', header: {}, page: {}, tasks: {} } as never

const aufgabe = (id: string, answer: Partial<Answer> & { kind: Answer['kind'] }, extra: Partial<TaskBlock> = {}): TaskBlock => ({
  id,
  type: 'task',
  instruction: 'Ergänze.',
  operator: '',
  afbReason: '',
  socialForm: 'EA',
  answer: { ...emptyAnswer(answer.kind), ...answer },
  parts: [],
  solution: '',
  points: 4,
  minutes: 3,
  grammar: { topicId: 'en.verb.past_simple', error: 'ed vergessen' },
  ...extra
})

const text: WsBlock = { id: 'mat', type: 'text', title: 'A day out', body: 'Yesterday we went to the zoo.', lineNumbers: false, source: '', glossary: [] } as WsBlock

const vorlage = (): WsBlock[] => [
  text,
  aufgabe('mc', { kind: 'multipleChoice', options: ['went', 'goed', 'gone', 'going'], correct: [0] }, { instruction: 'Wähle in M{mat} die richtige Form.' }),
  aufgabe('zu', { kind: 'matching', left: ['go', 'see', 'eat'], right: ['saw', 'ate', 'went', 'seen'], pairs: [2, 0, 1] }),
  aufgabe('wf', { kind: 'trueFalse', statements: [{ text: 'a', isTrue: true }, { text: 'b', isTrue: false }, { text: 'c', isTrue: true }] }),
  aufgabe('ord', { kind: 'ordering', items: ['I', 'went', 'home'], displayOrder: [0, 1, 2] }),
  aufgabe('lt', { kind: 'gapText', gapText: '1. I [[went]] home.\n2. She [[saw]] a dog.\n3. We [[ate]] cake.' }),
  aufgabe('tab', { kind: 'tableFill', headers: ['Inf', 'Past'], rows: [['go', ''], ['see', '']], solutionRows: [['', 'went'], ['', 'saw']] })
]

const task = (bloecke: WsBlock[], id: string): TaskBlock => bloecke.find((b) => b.id === id) as TaskBlock

describe('umgestellte Fassung (ohne KI)', () => {
  it('stellt Optionen, Zuordnungen, Aussagen und Reihenfolgen um – die Lösungen bleiben richtig', () => {
    const a = vorlage()
    const { bloecke, geaendert } = umgestellteFassung(a, 1, { items: true })
    expect(geaendert).toBeGreaterThanOrEqual(5)

    const mc = task(bloecke, 'mc-b').answer
    expect([...mc.options].sort()).toEqual(['goed', 'going', 'gone', 'went'])
    expect(mc.options).not.toEqual(['went', 'goed', 'gone', 'going'])
    expect(mc.correct.map((i) => mc.options[i])).toEqual(['went'])

    const zu = task(bloecke, 'zu-b').answer
    const paare = Object.fromEntries(zu.left.map((l, i) => [l, zu.right[zu.pairs[i]]]))
    expect(paare).toEqual({ go: 'went', see: 'saw', eat: 'ate' })

    const wf = task(bloecke, 'wf-b').answer
    expect(Object.fromEntries(wf.statements.map((s) => [s.text, s.isTrue]))).toEqual({ a: true, b: false, c: true })

    const ord = task(bloecke, 'ord-b').answer
    expect(ord.items).toEqual(['I', 'went', 'home'])
    expect(ord.displayOrder).not.toEqual([0, 1, 2])

    // Einzelsätze: neue Folge, Nummern wieder fortlaufend
    const lt = task(bloecke, 'lt-b').answer.gapText.split('\n')
    expect(lt.map((z) => z.slice(0, 2))).toEqual(['1.', '2.', '3.'])
    expect(lt.map((z) => z.slice(3)).sort()).toEqual(['I [[went]] home.', 'She [[saw]] a dog.', 'We [[ate]] cake.'])

    // Tabellen bleiben, wie sie sind
    expect(task(bloecke, 'tab-b').answer.rows).toEqual([['go', ''], ['see', '']])
    // Punkte und Stolperstellen gleich, Fassung A unberührt
    expect(task(bloecke, 'mc-b').points).toBe(4)
    expect(task(bloecke, 'mc-b').grammar).toEqual({ topicId: 'en.verb.past_simple', error: 'ed vergessen' })
    expect(task(a, 'mc').answer.options).toEqual(['went', 'goed', 'gone', 'going'])
  })

  it('neue Kennungen je Fassung; der Materialverweis bleibt gültig', () => {
    const r = umgestellteFassungen(vorlage(), 4, { items: true })
    expect(r.fassungen).toHaveLength(3)
    const ids = [vorlage(), ...r.fassungen].flat().map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    const mat = r.fassungen[2].find((b) => b.type === 'text')!
    expect(mat.id).toBe('mat-d')
    // Die Aufgabe verweist weiter auf M{mat} – das Material trägt die alte Kennung als ref
    expect(mat.ref).toBe('mat')
    expect(task(r.fassungen[2], 'mc-d').instruction).toContain('M{mat}')
  })

  it('eingebettet: keine Umstellung der Sätze im Text', () => {
    const { bloecke } = umgestellteFassung(vorlage(), 1, { items: false })
    expect(task(bloecke, 'lt-b').answer.gapText).toBe('1. I [[went]] home.\n2. She [[saw]] a dog.\n3. We [[ate]] cake.')
  })

  it('Lösungstexte mit Positionen werden nicht umgestellt – lieber gleich als falsch', () => {
    expect(loesungMitPositionen('1 c, 2 a, 3 b')).toBe(true)
    expect(loesungMitPositionen('a) went')).toBe(true)
    expect(loesungMitPositionen('went, saw, ate')).toBe(false)
    const a = [aufgabe('mc', { kind: 'multipleChoice', options: ['x', 'y', 'z'], correct: [1] }, { solution: 'b) y' })]
    const r = umgestellteFassungen(a, 2, { items: true })
    expect(task(r.fassungen[0], 'mc-b').answer.options).toEqual(['x', 'y', 'z'])
    expect(r.hinweise[0]).toMatch(/gleicht Fassung A/)
  })

  it('gleich viele Fassungen wie gewählt, höchstens vier', () => {
    expect(begrenzteFassungen(7)).toBe(4)
    expect(begrenzteFassungen(0)).toBe(1)
    expect(begrenzteFassungen('x')).toBe(1)
    expect(mitNeuenKennungen([text], 'c')[0].id).toBe('mat-c')
  })
})

describe('Grammatiktest: Fassungen A–D', () => {
  const grundtest = (patch: Partial<GrammarTest['meta']> = {}): GrammarTest => {
    const t = newTest(design, 'NI', 'gymnasium', 'Gymnasium')
    return { ...t, meta: { ...t.meta, topics: ['en.verb.past_simple'], embedded: false, ...patch }, blocks: vorlage() }
  }

  it('umgestellt: keine KI-Anfrage', async () => {
    setzeBlindprobe(false)
    const ai = vi.fn()
    const f = await generateTestFassungen(grundtest({ fassungen: 3, fassungsArt: 'umgestellt' }), vorlage(), ai as never)
    expect(ai).not.toHaveBeenCalled()
    expect(f).toHaveLength(2)
  })

  it('parallel: EINE Anfrage für alle weiteren Fassungen; Punkte aus A, ungleichwertige Fassung wird ersetzt', async () => {
    setzeBlindprobe(false)
    const roh = (instruction: string): Record<string, unknown> => ({
      type: 'task',
      instruction,
      answer: { kind: 'lines', count: 1 },
      parts: [],
      solution: 'x',
      grammarTopicId: 'en.verb.past_simple',
      grammarError: 'ed vergessen'
    })
    const a: WsBlock[] = [aufgabe('t1', { kind: 'lines', count: 1 }, { points: 3 }), aufgabe('t2', { kind: 'lines', count: 1 }, { points: 5 })]
    const ai = vi.fn().mockResolvedValue({
      fassungen: [
        { blocks: [roh('B1'), roh('B2')] },
        // C hat eine Aufgabe zu wenig → umgestellte Fassung A mit Hinweis
        { blocks: [roh('C1')] },
        { blocks: [roh('D1'), roh('D2')] }
      ]
    })
    const f = await generateTestFassungen(grundtest({ fassungen: 4 }), a, ai)
    expect(ai).toHaveBeenCalledTimes(1)
    expect(f).toHaveLength(3)
    expect(f[0].map((b) => (b as TaskBlock).points)).toEqual([3, 5])
    expect((f[0][0] as TaskBlock).instruction).toBe('B1')
    expect((f[1][0] as TaskBlock).warnings?.[0]).toMatch(/Fassung C: Die KI lieferte keine gleichwertige Parallelfassung \(1 statt 2 Aufgaben\)/)
    expect((f[2][1] as TaskBlock).instruction).toBe('D2')
    expect(abweichungZuA(a, f[2])).toBeNull()
  })

  it('der Auftrag nennt Vorlage, Zahl der Fassungen und Buchstaben', () => {
    const p = fassungenAuftrag(grundtest({ fassungen: 3 }), vorlage(), 3)
    expect(p).toContain('PARALLELFASSUNGEN B, C')
    expect(p).toContain('genau 2 Einträge')
    expect(p).toContain('VORLAGE – FASSUNG A')
  })

  it('Blätter, Kopfkasten und Übersicht je Fassung; alte Gruppe B wird beim Ändern übernommen', () => {
    const t = mitFassungen(grundtest({ fassungen: 3 }), umgestellteFassungen(vorlage(), 3, { items: true }).fassungen.reduce((l, f) => [...l, f], [vorlage()]))
    const ws = testToWorksheet(t)
    expect(ws.sheets.map((s) => s.label)).toEqual(['Gruppe A', 'Gruppe B', 'Gruppe C'])
    expect(ws.sheets[2].blocks[0].id).toBe('test-head-c')
    expect(testStats(t).varianten).toBe(3)
    expect(alleTestBloecke(t)).toHaveLength(21)

    const alt: GrammarTest = { ...grundtest(), blocksB: umgestellteFassung(vorlage(), 1, { items: true }).bloecke }
    expect(testFassungen(alt)).toHaveLength(2)
    const entwurf = structuredClone(alt)
    fassungsListe(entwurf, 1).pop()
    expect(entwurf.blocksB).toBeUndefined()
    expect(entwurf.weitereFassungen?.[0]).toHaveLength(6)
  })
})
