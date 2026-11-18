import { describe, expect, it } from 'vitest'
import { partPrompt, worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { pruefeEinFormatJeText } from '../src/renderer/src/modules/klassenarbeit/generation/einFormatJeText'
import { teilFormate, vorgabeFormate } from '../src/renderer/src/modules/klassenarbeit/model/verstehensFormate'
import { comprehensionRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { presetDesigns } from '@shared/design'

/** Klassenarbeit (18.11.2026, Vorgabe der Lehrkraft): je Hör-/Lesetext nur EIN Aufgabenformat */
const teil = (formatId: string, patch: Partial<ExamPart> = {}): ExamPart => ({
  id: formatId,
  formatId,
  label: formatId,
  competence: 'Kompetenz',
  weight: 30,
  points: 20,
  minutes: 25,
  gradeGroup: 'other',
  afbMix: { I: 50, II: 50, III: 0 },
  blocks: [],
  ...patch
})
const arbeit = (parts: ExamPart[], grade = 8): Exam => ({
  version: 1,
  design: presetDesigns()[0],
  parts,
  createdAt: '2026-11-18',
  meta: {
    title: 'Klassenarbeit',
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'School life',
    content: '',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    schoolTypeName: 'Gymnasium',
    grade,
    courseLevel: 'mixed',
    cefrLevel: 'A2',
    grammarTopic: '',
    vocab: [],
    infoBox: true,
    minutes: 90,
    points: 40,
    aids: '',
    variants: 1,
    gradeScale: true,
    separateWritingGrade: true,
    answerKey: true,
    answerKeyDetail: 'ausfuehrlich',
    teacherNote: ''
  }
})

describe('Ein Aufgabenformat je Hör-/Lesetext (Klassenarbeit)', () => {
  it('Vorgabe 2 Formate, höchstens 3', () => {
    expect(vorgabeFormate('en-listening', 8)).toHaveLength(2)
    expect(teilFormate({ formatId: 'en-reading', formats: ['a', 'b', 'c', 'd'] }, 8)).toEqual(['a', 'b', 'c'])
    expect(teilFormate({ formatId: 'en-reading', formats: ['a', 'b'] }, 8, true)).toEqual(['a'])
  })

  it('Hörverstehen: so viele Hörtexte wie Formate, Regel im Auftrag', () => {
    const p = teil('en-listening', { formats: ['multiple-choice', 'matching-speakers'] })
    const e = arbeit([p])
    const meta = worksheetMetaFor(e, p)
    expect(meta.audioCount).toBe(2)
    expect(meta.einFormatJeText).toBe(true)
    const regeln = comprehensionRules(meta)
    expect(regeln).toMatch(/JEDER Text bekommt GENAU EIN Aufgabenformat/)
    expect(regeln).not.toMatch(/JEDES dieser 2 Formate kommt mindestens einmal vor/)
    expect(partPrompt(e, p, 1)).toMatch(/2 Hörtexte – je einen für jedes Aufgabenformat/)
  })

  it('Leseverstehen: zwei Lesetexte, genug Bausteine', () => {
    const p = teil('en-reading', { formats: ['multiple-choice', 'true-false-evidence'] })
    const text = partPrompt(arbeit([p]), p, 1)
    expect(text).toMatch(/2 Lesetexte/)
    expect(text).toMatch(/höchstens 5 Bausteine/)
  })

  it('Arbeitsblatt bleibt bei mehreren Formaten je Text', () => {
    const regeln = comprehensionRules({ ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', grade: 8, skillFocus: 'reading', comprehensionFormats: ['multiple-choice', 'sequencing'] })
    expect(regeln).toMatch(/JEDES dieser 2 Formate kommt mindestens einmal vor/)
  })

  it('Prüfung findet gemischte Formate an einem Text', () => {
    const aufgabe = (id: string, kind: string, audioId?: string): WsBlock =>
      ({ id, type: 'task', instruction: 'x', answer: { kind }, parts: [], skill: audioId ? 'listening' : 'reading', ...(audioId ? { audioId } : {}) }) as unknown as WsBlock
    const lesen = (id: string): WsBlock => ({ id, type: 'text', title: id, body: '…' }) as unknown as WsBlock
    // Ein Text, zwei Formate → Befund
    expect(pruefeEinFormatJeText([lesen('M1'), aufgabe('a', 'multipleChoice'), aufgabe('b', 'matching')])).toHaveLength(1)
    // Zwei Texte, je ein Format → in Ordnung
    expect(pruefeEinFormatJeText([lesen('M1'), aufgabe('a', 'multipleChoice'), lesen('M2'), aufgabe('b', 'matching')])).toHaveLength(0)
    // Hörtexte über audioId
    expect(pruefeEinFormatJeText([aufgabe('a', 'multipleChoice', 'h1'), aufgabe('b', 'gapText', 'h1')])[0]?.severity).toBe('hoch')
  })
})
