import { describe, expect, it } from 'vitest'

/*
 * Unregelmäßige Verben in drei Programmen (30.09.2026): Grammatiktest (Modus mit Gruppe A/B),
 * Arbeitsblatt (von der App angehängt) und Vokabeltest (Aufgabentyp mit Tabelle) – alle mit
 * demselben Erzeuger aus shared/verben.
 */
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { generateVerbTest, testPrompt } from '../src/renderer/src/modules/grammatiktest/generation/generateTest'
import { testToWorksheet } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { testTopicLine } from '../src/renderer/src/modules/grammatiktest/library'
import { testingRules } from '../src/renderer/src/modules/grammatiktest/model/testRules'
import { testPoints, type GrammarTest } from '../src/renderer/src/modules/grammatiktest/model/types'
import { neueVerbAufgabe } from '../src/renderer/src/shared/verben/quellen'
import { fuegeVorSchlussEin, mitVerbAufgabe } from '../src/renderer/src/modules/arbeitsblatt/generation/verbAufgabe'
import { TASK_TYPES } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { passtZurSprache } from '../src/renderer/src/modules/vokabeltest/didactics/latein'
import { blockPoints } from '../src/renderer/src/modules/vokabeltest/model/blocks'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const design = { id: 'd', name: 'Standard', header: {}, page: {}, tasks: {} } as never

function verbTest(fassungen: 1 | 2 | 3 | 4): GrammarTest {
  const t = newTest(design, 'NW', 'gymnasium', 'Gymnasium')
  const verben = { ...neueVerbAufgabe('en', 3, 11), quelle: 'lehrwerk' as const, listeId: 'green-line-3', listenName: 'Green Line 3', formate: ['tabelle' as const, 'auswahl' as const] }
  return { ...t, meta: { ...t.meta, grade: 7, modus: 'verben', verben, fassungen } }
}

describe('Grammatiktest „Unregelmäßige Verben"', () => {
  it('erzeugt ohne KI Gruppe A und B mit Tabellenformat, Punkte je Form', async () => {
    const t = verbTest(2)
    const r = await generateVerbTest(t, null)
    expect(r.blocks.some((b) => b.type === 'task' && b.answer.kind === 'tableFill')).toBe(true)
    expect(r.weitereFassungen).toHaveLength(1)
    const fertig: GrammarTest = { ...t, blocks: r.blocks, weitereFassungen: r.weitereFassungen }
    const ws = testToWorksheet(fertig)
    expect(ws.sheets.map((s) => s.label)).toEqual(['Gruppe A', 'Gruppe B'])
    const tabelle = r.blocks.find((b) => b.type === 'task' && b.answer.kind === 'tableFill')
    if (tabelle?.type !== 'task') throw new Error('Tabelle erwartet')
    const luecken = tabelle.answer.rows.flat().filter((c) => !c).length
    expect(tabelle.points).toBe(luecken)
    expect(testPoints(fertig)).toBe(r.blocks.reduce((n, b) => n + (b.type === 'task' ? b.points : 0), 0))
    // Der Kopfkasten nennt Gruppe und Liste
    const kopf = ws.sheets[1].blocks[0]
    expect(kopf.type === 'infoBox' && kopf.body).toContain('Group B')
    expect(kopf.type === 'infoBox' && kopf.body).toContain('Irregular verbs (Green Line 3)')
    expect(testTopicLine(fertig)).toBe('Unregelmäßige Verben (Green Line 3)')
    // Der Lösungsteil bekommt den Bewertungshinweis
    expect(r.blocks.at(-1)).toMatchObject({ type: 'infoBox', nurLoesung: true })
  })

  it('bis Gruppe D (06.10.2026): vier Fassungen, je ein Blatt; alte Gruppe B wird weiter gelesen', async () => {
    const t = verbTest(4)
    const r = await generateVerbTest(t, null)
    expect(r.weitereFassungen).toHaveLength(3)
    const ws = testToWorksheet({ ...t, blocks: r.blocks, weitereFassungen: r.weitereFassungen })
    expect(ws.sheets.map((s) => s.label)).toEqual(['Gruppe A', 'Gruppe B', 'Gruppe C', 'Gruppe D'])
    // Gespeichert vor 06.10.2026: Gruppe B im alten Feld
    const alt = testToWorksheet({ ...t, blocks: r.blocks, blocksB: r.weitereFassungen![0] })
    expect(alt.sheets.map((s) => s.label)).toEqual(['Gruppe A', 'Gruppe B'])
  })

  it('Zauberstab und Kreis arbeiten mit der Liste als verbindlicher Vorgabe', () => {
    const p = testPrompt(verbTest(1))
    expect(p).toContain('VERBINDLICH')
    expect(p).toContain('infinitive | simple past | past participle | German')
  })

  it('warnt in Niedersachsen vor der reinen Formenabfrage', () => {
    const t = verbTest(1)
    const ni = testingRules({ ...t.meta, stateId: 'NI' })
    expect(ni.some((r) => r.severity === 'wichtig' && /Formenabfrage/.test(r.text))).toBe(true)
    // Keine Regel mit „einbetten": Der Schalter gilt bei den Verben nicht
    expect(ni.some((r) => r.aktion === 'einbetten')).toBe(false)
    const kontext = testingRules({ ...t.meta, stateId: 'NI', verben: { ...t.meta.verben!, formate: ['lueckensatz'] } })
    expect(kontext).toEqual([])
  })
})

describe('Arbeitsblatt: die App hängt die Verb-Aufgaben an', () => {
  it('vor Hilfsblatt und Selbsteinschätzung, in jedes Blatt', async () => {
    const a = { ...neueVerbAufgabe('en', 2, 5), formate: ['tabelle' as const] }
    const ws = {
      meta: { subjectId: 'englisch', grade: 6, stateId: 'NI', schoolTypeId: 'gymnasium', verbAufgabe: a },
      sheets: [
        { id: 's1', label: 'A', blocks: [{ id: 't', type: 'text', title: '', body: 'x' }, { id: 'p', type: 'phrases' }] },
        { id: 's2', label: 'B', blocks: [{ id: 't2', type: 'text', title: '', body: 'y' }] }
      ]
    } as unknown as Worksheet
    const neu = await mitVerbAufgabe(ws, async () => {
      throw new Error('keine KI nötig')
    })
    expect(neu.sheets[0].blocks.map((b) => b.type)).toEqual(['text', 'task', 'infoBox', 'phrases'])
    expect(neu.sheets[1].blocks.map((b) => b.type)).toEqual(['text', 'task', 'infoBox'])
    // Eigene Kennungen je Blatt
    expect(neu.sheets[0].blocks[1].id).not.toBe(neu.sheets[1].blocks[1].id)
    expect(fuegeVorSchlussEin({ id: 'x', label: '', blocks: [] }, []).blocks).toEqual([])
  })
})

describe('Vokabeltest: Aufgabentyp „Unregelmäßige Verben"', () => {
  const settings = (patch: Partial<TestSettings> = {}): TestSettings =>
    ({
      targetLanguage: 'en',
      stateId: 'NI',
      schoolTypeId: 'gymnasium',
      languageOrder: 1,
      grade: 7,
      level: 'A2',
      vocabCount: 10,
      variantCount: 1,
      variantMode: 'sameVocab',
      tasks: [{ type: 'irregularVerbs', count: 0, pointsPerItem: 1 }],
      topic: '',
      pictureSource: 'none',
      answerKey: true,
      seed: 1,
      ...patch
    }) as TestSettings
  const vok = (term: string): VocabEntry => ({ id: term, term, translation: '' })

  it('nimmt ohne Einstellung die unregelmäßigen Verben der Vokabelliste', () => {
    const block = TASK_TYPES.irregularVerbs.build([], {}, { settings: settings(), languageName: 'English', rng: createRng(3), allVocab: [vok('to go'), vok('to write'), vok('table')] })
    expect(block.kind).toBe('verbTable')
    if (block.kind !== 'verbTable') return
    expect(block.rows.map((r) => r.cells.concat(r.solution).find((c) => ['go', 'write'].includes(c))).sort()).toEqual(['go', 'write'])
    expect(blockPoints(block)).toBe(block.rows.reduce((n, r) => n + r.cells.filter((c) => !c).length, 0))
  })

  it('nimmt die eingestellte Liste und warnt, wenn die Vergangenheit noch nicht eingeführt ist', () => {
    const a = { ...neueVerbAufgabe('en', 1, 9), formate: ['tabelle' as const], vorgabe: 'inf' }
    const block = TASK_TYPES.irregularVerbs.build([], {}, { settings: settings({ grade: 5, verbAufgabe: a }), languageName: 'English', rng: createRng(1), allVocab: [] })
    expect(block.kind).toBe('verbTable')
    expect(block.warnings?.join(' ')).toMatch(/Vergangenheitsformen/)
    const spaeter = TASK_TYPES.irregularVerbs.build([], {}, { settings: settings({ grade: 8, verbAufgabe: a }), languageName: 'English', rng: createRng(1), allVocab: [] })
    expect(spaeter.warnings ?? []).toEqual([])
  })

  it('gibt es nur in Sprachen mit Verbliste', () => {
    expect(passtZurSprache('irregularVerbs', 'en')).toBe(true)
    expect(passtZurSprache('irregularVerbs', 'la')).toBe(true)
    expect(passtZurSprache('irregularVerbs', 'nl')).toBe(false)
  })
})
