import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * Nicht angefertigte Tests nach 24 h löschen (30.10.2026, Auftrag der Lehrkraft): Vokabeltest ohne Test, Grammatiktest
 * und Lernzielkontrolle ohne Aufgaben, Klassenarbeit ohne Aufgaben – gezählt ab der letzten Änderung.
 */
const ordner = mkdtempSync(join(tmpdir(), 'entwuerfe-'))
vi.mock('electron', () => ({ app: { getPath: () => join(ordner, 'nutzer') } }))

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const { datenbankFuerTests, nutzerAnlegen } = await import('../src/server/datenbank')
const { entwuerfeAufraeumen, alterEntwurf } = await import('../src/server/entwuerfe')
const { saveTest, listTests } = await import('../src/main/services/storage/vocabTests')
const { saveGrammarTest, listGrammarTests } = await import('../src/main/services/storage/grammarTests')
const { saveExam, listExams } = await import('../src/main/services/storage/exams')

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  nutzerAnlegen({ benutzer: 'l.lehrer', name: 'Lena Lehrer', rolle: 'lehrkraft', quelle: 'test' })
})
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

const vok = (hasTest: boolean) => ({ vocabCount: 3, includedCount: 3, hasTest, variantCount: hasTest ? 1 : 0, totalPoints: 0 })

describe('Entwürfe aufräumen', () => {
  it('Frist ab der letzten Änderung', () => {
    const jetzt = Date.parse('2026-10-30T12:00:00Z')
    expect(alterEntwurf({ createdAt: '', updatedAt: '2026-10-29T11:59:00Z' }, true, jetzt)).toBe(true)
    expect(alterEntwurf({ createdAt: '', updatedAt: '2026-10-29T12:30:00Z' }, true, jetzt)).toBe(false)
    expect(alterEntwurf({ createdAt: '', updatedAt: '2026-10-01T00:00:00Z' }, false, jetzt)).toBe(false)
  })

  it('löscht alte leere Entwürfe, behält angefertigte und frische', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T08:00:00Z'))
    saveTest({ id: 'leer-alt', name: 'Leer alt', stats: vok(false), payload: {} })
    saveTest({ id: 'fertig-alt', name: 'Fertig alt', stats: vok(true), payload: {} })
    saveGrammarTest({ id: 'gram-leer', name: 'G leer', stats: { subjectLabel: 'Englisch', grade: 7, topics: '', taskCount: 0, points: 0, minutes: 0, graded: false }, payload: {} })
    saveExam({ id: 'ka-fertig', name: 'KA', stats: { subjectLabel: 'Englisch', grade: 9, topic: '', partCount: 2, hasTasks: true, minutes: 90 }, payload: {} })
    vi.setSystemTime(new Date('2026-10-30T07:00:00Z'))
    saveTest({ id: 'leer-neu', name: 'Leer neu', stats: vok(false), payload: {} })
    vi.useRealTimers()
    const z = entwuerfeAufraeumen(Date.parse('2026-10-30T08:00:00Z'))
    expect(z).toEqual({ Vokabeltest: 1, Grammatiktest: 1 })
    expect(listTests().map((t) => t.id).sort()).toEqual(['fertig-alt', 'leer-neu'])
    expect(listGrammarTests()).toEqual([])
    expect(listExams().map((t) => t.id)).toEqual(['ka-fertig'])
  })
})
