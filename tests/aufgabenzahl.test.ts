import { describe, expect, it } from 'vitest'
import { comprehensionRules, listeningTextRules, systemPrompt, taskCountRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { checkTaskCount } from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Sheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 8,
  ...patch
})

const task = (id: string): WsBlock => ({
  id,
  type: 'task',
  instruction: 'Beschreibe …',
  operator: 'Beschreibe',
  afb: 'II',
  afbReason: '',
  socialForm: 'EA',
  answer: emptyAnswer('lines'),
  parts: [],
  solution: 'Lösung',
  points: 0,
  minutes: 5
})

const sheet = (n: number): Sheet => ({ id: 's1', label: 'Arbeitsblatt', blocks: Array.from({ length: n }, (_, i) => task(`t${i}`)) })

describe('Zahl der Aufgaben', () => {
  it('nennt ohne Vorgabe den Richtwert als Spanne', () => {
    const m = meta()
    const rules = taskCountRules(m, profileFromMeta(m))
    // Ohne Seitenvorgabe (Paket 7) steht „etwa“ davor – die Seitenzahl legt die KI dann selbst fest
    expect(rules).toMatch(/Plane (etwa )?\d+–\d+ Aufgaben/)
    // „GENAU EINE Aufgabe" steht dort ohnehin für Sprachmittlung und Schreiben – gemeint ist
    // hier nur, dass keine feste Gesamtzahl vorgegeben wird
    expect(rules).not.toMatch(/GENAU \d+ Aufgaben/)
  })

  it('macht eine eingetragene Zahl verbindlich', () => {
    // Sonst hätte das Feld keinen Zweck: Wer sechs bestellt, will sechs.
    const m = meta({ taskCount: 6 })
    const rules = taskCountRules(m, profileFromMeta(m))
    expect(rules).toMatch(/GENAU 6 Aufgaben/)
    expect(rules).not.toMatch(/Plane \d+–\d+/)
  })

  it('erreicht wirklich den Systemauftrag', () => {
    const m = meta({ taskCount: 4 })
    expect(systemPrompt(m, profileFromMeta(m))).toMatch(/GENAU 4 Aufgaben/)
  })

  it('lässt die übrigen Regeln zur Aufgabenqualität stehen', () => {
    const m = meta({ taskCount: 6 })
    expect(taskCountRules(m, profileFromMeta(m))).toMatch(/vollständigen Denkschritt/)
  })

  it('ändert nichts an Blättern mit genau einer Aufgabe (Schreiben, Sprachmittlung)', () => {
    const m = meta({ skillFocus: 'writing', taskCount: 6 })
    expect(taskCountRules(m, profileFromMeta(m))).toMatch(/GENAU EINE Aufgabe/)
  })
})

describe('Prüfung gegen die Vorgabe', () => {
  it('meldet zu wenige und zu viele Aufgaben', () => {
    const m = meta({ taskCount: 5 })
    expect(checkTaskCount(sheet(3), m, profileFromMeta(m))[0].message).toMatch(/3 Aufgaben, vorgegeben waren 5/)
    expect(checkTaskCount(sheet(7), m, profileFromMeta(m))[0].message).toMatch(/7 Aufgaben, vorgegeben waren 5/)
  })

  it('schweigt, wenn die Zahl stimmt', () => {
    const m = meta({ taskCount: 5 })
    expect(checkTaskCount(sheet(5), m, profileFromMeta(m)).filter((w) => w.message.includes('vorgegeben'))).toHaveLength(0)
  })

  it('prüft ohne Vorgabe weiterhin gegen den Richtwert', () => {
    // Die Vorgabe ersetzt den Richtwert, sie ergänzt ihn nicht – sonst gäbe es zwei Meldungen
    const m = meta()
    const viele = checkTaskCount(sheet(30), m, profileFromMeta(m))
    expect(viele.some((w) => w.message.includes('kleinschrittig'))).toBe(true)
    const mitVorgabe = checkTaskCount(sheet(30), meta({ taskCount: 30 }), profileFromMeta(m))
    expect(mitVorgabe.some((w) => w.message.includes('kleinschrittig'))).toBe(false)
  })
})

describe('Zahl der Fragen zum Text', () => {
  it('nennt ohne Vorgabe die Spanne des Niveaus', () => {
    const rules = listeningTextRules(meta({ skillFocus: 'listening', audioAi: true, cefrLevel: 'A2' }))
    expect(rules).toMatch(/\d+ bis \d+ Items/)
  })

  it('macht eine eingetragene Zahl verbindlich – je Hörtext', () => {
    const rules = listeningTextRules(meta({ skillFocus: 'listening', audioAi: true, itemCount: 7 }))
    expect(rules).toMatch(/GENAU 7 Items zu JEDEM Hörtext/)
  })

  it('gilt auch für das Leseverstehen', () => {
    const rules = comprehensionRules(meta({ skillFocus: 'reading', itemCount: 9 }))
    expect(rules).toMatch(/GENAU 9 Items je Text/)
  })

  it('bleibt bei Verstehensaufgaben ohne Vorgabe stumm', () => {
    expect(comprehensionRules(meta({ skillFocus: 'reading' }))).not.toMatch(/GENAU/)
  })
})
