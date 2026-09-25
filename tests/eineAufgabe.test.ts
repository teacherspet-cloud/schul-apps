import { describe, expect, it } from 'vitest'
import { comprehensionRules, skillFocusPrompt, systemPrompt, taskCountRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const hoeren = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 7,
  skillFocus: 'listening',
  audioAi: true,
  ...patch
})

/**
 * Gemeldeter Fall: „Zahl der Aufgaben = 1", und es entstanden trotzdem mehrere Aufgaben
 * zu einem Hörtext. Ursache war kein fehlendes Feld, sondern ein Übergewicht: Vier weitere
 * Stellen im Auftrag verlangten gleichzeitig mehr als eine Aufgabe.
 */
describe('Eine vorgegebene Aufgabenzahl schlägt alle anderen Regeln', () => {
  it('lässt den Hörverstehens-Schwerpunkt keine 2–3 Aufgaben mehr fordern', () => {
    const text = skillFocusPrompt(hoeren({ taskCount: 1 }))
    expect(text).toMatch(/GENAU EINE Aufgabe/)
    expect(text).not.toMatch(/2–3 Aufgaben/)
  })

  it('streicht die zusätzliche Vorentlastungsaufgabe', () => {
    // Sie hätte als zweite Aufgabe gezählt – der Hinweis vor dem Hören steht im Hörtext-Baustein
    expect(skillFocusPrompt(hoeren({ taskCount: 1 }))).not.toMatch(/Vorentlastung/)
    expect(skillFocusPrompt(hoeren({ taskCount: 3 }))).not.toMatch(/Vorentlastung/)
  })

  it('setzt auch eine größere Zahl durch', () => {
    expect(skillFocusPrompt(hoeren({ taskCount: 4 }))).toMatch(/GENAU 4 Aufgaben/)
  })

  it('verlangt bei einer Aufgabe keine zwei Formate und keine Sicherungsaufgabe', () => {
    const m = hoeren({ taskCount: 1 })
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(prompt).not.toMatch(/Mindestens zwei verschiedene Aufgabenformate/)
    expect(prompt).not.toMatch(/letzte oder vorletzte Aufgabe sichert/)
  })

  it('verlangt bei einer Aufgabe keine Mischung aus geschlossenem und halboffenem Format', () => {
    const rules = comprehensionRules(hoeren({ taskCount: 1 }))
    expect(rules).not.toMatch(/Mische ein geschlossenes/)
    expect(rules).toMatch(/Wähle EINES/i)
  })

  it('lässt ohne Vorgabe alles wie bisher', () => {
    const m = hoeren()
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(skillFocusPrompt(m)).toMatch(/2–3 Aufgaben/)
    expect(skillFocusPrompt(m)).toMatch(/Vorentlastung/)
    expect(prompt).toMatch(/Mindestens zwei verschiedene Aufgabenformate/)
    expect(prompt).toMatch(/letzte oder vorletzte Aufgabe sichert/)
    expect(comprehensionRules(m)).toMatch(/Mische ein geschlossenes/)
  })

  it('sagt es im Systemauftrag an genau einer Stelle – ohne Gegenrede', () => {
    const m = hoeren({ taskCount: 1 })
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(taskCountRules(m, profileFromMeta(m))).toMatch(/GENAU 1 Aufgaben/)
    expect(prompt).not.toMatch(/2–3 Aufgaben/)
    expect(prompt).not.toMatch(/Mindestens zwei verschiedene Aufgabenformate/)
    expect(prompt).not.toMatch(/Mische ein geschlossenes/)
  })
})

describe('Gewählte Aufgabenformate werden verbindlich verlangt', () => {
  const lesen = (formats: string[], patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    grade: 8,
    skillFocus: 'reading',
    comprehensionFormats: formats,
    ...patch
  })

  it('verlangt bei EINEM gewählten Format, dass es das einzige ist', () => {
    // Gemeldet: „Multiple Choice" gewählt, kam aber nicht zuverlässig aufs Blatt
    expect(comprehensionRules(lesen(['multiple-choice']))).toMatch(/AUSSCHLIESSLICH dieses eine Format/)
  })

  it('verlangt bei mehreren, dass JEDES vorkommt', () => {
    const rules = comprehensionRules(lesen(['multiple-choice', 'true-false']))
    expect(rules).toMatch(/JEDES dieser 2 Formate kommt mindestens einmal vor/)
    expect(rules).toMatch(/andere Formate sind nicht erlaubt/)
  })
})
