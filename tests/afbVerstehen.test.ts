import { describe, expect, it } from 'vitest'
import { comprehensionRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { checkReceptiveAfb } from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Afb, Sheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 9,
  skillFocus: 'listening',
  ...patch
})

const task = (afb: Afb, skill: 'listening' | 'reading' = 'listening'): WsBlock => ({
  id: `t-${afb}`,
  type: 'task',
  instruction: '**Tick** the correct answer.',
  operator: 'tick',
  afb,
  afbReason: '',
  socialForm: 'EA',
  answer: emptyAnswer('multipleChoice'),
  parts: [],
  solution: 'a)',
  points: 0,
  minutes: 5,
  skill
})

const sheet = (blocks: WsBlock[]): Sheet => ({ id: 's1', label: 'Arbeitsblatt', blocks })

/*
 * Grundlage: Recherche in den amtlichen Quellen. Eine Zuordnung „Format → Anforderungsbereich"
 * existiert dort nicht und wäre sachlich falsch (KMK 2012; abitur.nrw: „Grundsätzlich können
 * sich alle Operatoren auf alle drei Anforderungsbereiche beziehen."). Belegt ist die
 * Obergrenze: rezeptive Teile liegen in AFB I und II (IQB, Hamburg).
 */
describe('Anforderungsbereiche beim Hör- und Leseverstehen', () => {
  it('sagt der KI, dass es keine feste Zuordnung Format zu Bereich gibt', () => {
    const rules = comprehensionRules(meta())
    expect(rules).toMatch(/NICHT am Antwortformat/)
    expect(rules).toMatch(/Ankreuzaufgabe ist AFB I.*AFB II/s)
  })

  it('schließt AFB III bei Verstehensaufgaben aus', () => {
    expect(comprehensionRules(meta())).toMatch(/KEINE Verstehensaufgabe bekommt AFB III/)
  })

  it('meldet eine als AFB III eingestufte Höraufgabe', () => {
    const treffer = checkReceptiveAfb(sheet([task('III')]), meta())
    expect(treffer).toHaveLength(1)
    expect(treffer[0].message).toMatch(/AFB I und II/)
  })

  it('lässt AFB I und II unbeanstandet – auch bei einer Ankreuzaufgabe', () => {
    // Die Beschwerde war „tick bekommt AFB II". Das ist zulässig, wenn erschlossen werden muss.
    expect(checkReceptiveAfb(sheet([task('I'), task('II')]), meta())).toHaveLength(0)
  })

  it('greift nicht bei Blättern ohne Verstehens-Schwerpunkt', () => {
    expect(checkReceptiveAfb(sheet([task('III')]), meta({ skillFocus: 'writing' }))).toHaveLength(0)
  })

  it('gilt auch für das Leseverstehen', () => {
    expect(checkReceptiveAfb(sheet([task('III', 'reading')]), meta({ skillFocus: 'reading' }))).toHaveLength(1)
  })
})
