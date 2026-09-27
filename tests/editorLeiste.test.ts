import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { EXAM_FILTER, parseExamFile, serializeExam } from '../src/renderer/src/modules/klassenarbeit/project'
import { useKlassenarbeit } from '../src/renderer/src/modules/klassenarbeit/store'
import { GRAMMATIKTEST_FILTER, parseGrammarTestFile, serializeGrammarTest } from '../src/renderer/src/modules/grammatiktest/project'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { worksheetMetaForTest } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { KURZTEST_FILTER, parseKurztestFile, serializeKurztest } from '../src/renderer/src/modules/lernzielkontrolle/project'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import { kurztestToWorksheet } from '../src/renderer/src/modules/lernzielkontrolle/render/kurztestWorksheet'
import { useLernzielkontrolle } from '../src/renderer/src/modules/lernzielkontrolle/store'
import { useGrammatiktest } from '../src/renderer/src/modules/grammatiktest/store'

/*
 * Eine Werkzeugleiste für alle Programme (27.09.2026, shared/components/EditorLeiste.tsx):
 * Die Blattoptionen des Arbeitsblatts (Schulangaben, Ränder, KI-Test) erreichen auch Klassenarbeit,
 * Lernzielkontrolle und Grammatiktest, und jedes Programm hat eine weitergebbare Datei.
 */

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)

const arbeit = (): Exam =>
  ({
    version: 1,
    meta: { ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', topic: 'Going abroad', grade: 9 },
    parts: [],
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

describe('Blattoptionen erreichen das Blatt', () => {
  it('Klassenarbeit: Schulangaben und KI-Test gehen in die Blatt-Angaben', () => {
    const e = arbeit()
    e.meta.showSchool = false
    e.meta.aiCanary = true
    e.meta.aiCanaryWords = 'Nordlicht'
    const meta = worksheetMetaFor(e)
    expect(meta.showSchool).toBe(false)
    expect(meta.aiCanary).toBe(true)
    expect(meta.aiCanaryWords).toBe('Nordlicht')
  })

  it('Lernzielkontrolle und Grammatiktest: Ränder, Schulangaben, KI-Test', () => {
    const k = emptyKurztest('NI', 'gymnasium', 'Gymnasium')
    k.meta.correctionMargin = true
    k.meta.notesMargin = true
    k.meta.showSchool = false
    k.meta.aiCanary = true
    k.meta.aiCanaryWords = 'Nordlicht'
    const ws = kurztestToWorksheet(k, 0, [])
    expect(ws.meta.correctionMargin).toBe(true)
    expect(ws.meta.notesMargin).toBe(true)
    expect(ws.meta.showSchool).toBe(false)
    expect(ws.meta.aiCanary).toBe(true)
    const g = newTest(presetDesigns()[0], 'NI', 'gymnasium', 'Gymnasium')
    g.meta.correctionMargin = true
    g.meta.aiCanary = true
    g.meta.aiCanaryWords = 'Nordlicht'
    const m = worksheetMetaForTest(g)
    expect(m.correctionMargin).toBe(true)
    expect(m.aiCanary).toBe(true)
    expect(m.aiCanaryWords).toBe('Nordlicht')
  })
})

describe('Weitergebbare Dateien', () => {
  it('Klassenarbeit: hin und zurück, fremde Dateien werden abgelehnt', () => {
    const e = arbeit()
    const zurueck = parseExamFile(bytes(serializeExam(e)))
    expect(zurueck.meta.topic).toBe('Going abroad')
    expect(EXAM_FILTER[0].extensions).toEqual(['klassenarbeit'])
    expect(() => parseExamFile(bytes('kein json'))).toThrow(/Klassenarbeit-Datei/)
    expect(() => parseExamFile(bytes(JSON.stringify({ type: 'arbeitsblatt', worksheet: { sheets: [] } })))).toThrow(/Klassenarbeit-Datei/)
  })

  it('Lernzielkontrolle und Grammatiktest ebenso', () => {
    const k = emptyKurztest('NI', 'gymnasium', 'Gymnasium')
    expect(parseKurztestFile(bytes(serializeKurztest(k))).varianten.length).toBe(k.varianten.length)
    expect(KURZTEST_FILTER[0].extensions).toEqual(['lernzielkontrolle'])
    expect(() => parseKurztestFile(bytes(serializeExam(arbeit())))).toThrow(/Lernzielkontrolle-Datei/)
    const g = newTest(presetDesigns()[0], 'NI', 'gymnasium', 'Gymnasium')
    expect(parseGrammarTestFile(bytes(serializeGrammarTest(g))).meta.stateId).toBe('NI')
    expect(GRAMMATIKTEST_FILTER[0].extensions).toEqual(['grammatiktest'])
    expect(() => parseGrammarTestFile(bytes(serializeKurztest(k)))).toThrow(/Grammatiktest-Datei/)
  })

  it('aus einer Datei geladen: neues Dokument, noch nicht gesichert, Name leer', () => {
    useKlassenarbeit.getState().loadFromFile(arbeit())
    const ka = useKlassenarbeit.getState()
    expect(ka.savedAt).toBeNull()
    expect(ka.docName).toBe('')
    expect(ka.exam?.meta.topic).toBe('Going abroad')
    useKlassenarbeit.getState().setDocName('Meine Arbeit')
    expect(useKlassenarbeit.getState().docName).toBe('Meine Arbeit')
    useLernzielkontrolle.getState().loadFromFile(emptyKurztest('NI', 'gymnasium', 'Gymnasium'))
    expect(useLernzielkontrolle.getState().savedAt).toBeNull()
    useGrammatiktest.getState().loadFromFile(newTest(presetDesigns()[0], 'NI', 'gymnasium', 'Gymnasium'))
    expect(useGrammatiktest.getState().savedAt).toBeNull()
    useGrammatiktest.getState().setDocName('Test 1')
    expect(useGrammatiktest.getState().docName).toBe('Test 1')
  })
})
