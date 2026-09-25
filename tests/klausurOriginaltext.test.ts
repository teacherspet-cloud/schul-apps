import { describe, expect, it } from 'vitest'
import { brauchtOriginaltext, fehlenderTextBaustein, quellenSprache } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { presetDesigns } from '@shared/design'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'

/*
 * Vorgabe der Lehrkraft (24.09.2026): „Beachte, dass für die Sek II immer Originalquellen
 * benutzt werden müssen und keine KI generierten Materialien verwendet werden dürfen."
 * Dazu die Entscheidung vom selben Tag: Ein Arbeitsblatt darf auf einen gekennzeichneten
 * Autorentext ausweichen, eine KLAUSUR nicht – und wenn für einen Teil nichts gefunden wird,
 * bleibt nur DIESER Teil offen, nicht die ganze Arbeit.
 */
const teil = (formatId: string): ExamPart => ({
  id: formatId,
  formatId,
  label: formatId,
  competence: 'Kompetenz',
  weight: 30,
  points: 21,
  minutes: 27,
  gradeGroup: 'other',
  afbMix: { I: 30, II: 45, III: 25 },
  blocks: []
})

const arbeit = (grade: number, subjectId: Exam['meta']['subjectId'] = 'englisch'): Exam => ({
  version: 1,
  design: presetDesigns()[0],
  parts: [],
  createdAt: '2026-09-24',
  meta: {
    title: 'Klausur',
    subjectId,
    subjectLabel: subjectId === 'geschichte' ? 'Geschichte' : 'Englisch',
    topic: 'Migration',
    content: '',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    schoolTypeName: 'Gymnasium',
    grade,
    courseLevel: 'mixed',
    cefrLevel: 'B2',
    grammarTopic: '',
    vocab: [],
    infoBox: true,
    minutes: 90,
    points: 60,
    aids: '',
    variants: 1,
    gradeScale: true,
    separateWritingGrade: true,
    answerKey: true,
    answerKeyDetail: 'ausfuehrlich',
    teacherNote: ''
  }
})

describe('Welche Klausurteile Originalmaterial brauchen', () => {
  it('beschafft für Quellenanalyse, Quellenvergleich, Leseverstehen und Sprachmittlung', () => {
    // Umfang, den die Lehrkraft am 24.09.2026 gewählt hat
    for (const format of ['ge-source', 'ge-comparison', 'en-reading', 'en-mediation']) {
      expect(brauchtOriginaltext(arbeit(12), teil(format)), format).toBe(true)
    }
  })

  it('beschafft nichts für Grammatik- und Wortschatzteile', () => {
    /*
     * Deren Text ist zwar auch ein Text, aber ein konstruierter Übungstext mit gezielt
     * gesetzten Lücken. Eine Originalquelle wäre dort nicht nur unnötig, sondern unbrauchbar.
     */
    for (const format of ['en-grammar', 'en-language']) {
      expect(brauchtOriginaltext(arbeit(12), teil(format)), format).toBe(false)
    }
  })

  it('beschafft nichts für Hörverstehen und Schreiben', () => {
    for (const format of ['en-listening', 'en-writing', 'ge-knowledge']) {
      expect(brauchtOriginaltext(arbeit(12), teil(format)), format).toBe(false)
    }
  })

  it('greift nur in der Oberstufe', () => {
    // In der Sekundarstufe I bleibt es beim bisherigen Weg
    expect(brauchtOriginaltext(arbeit(9), teil('en-reading'))).toBe(false)
    expect(brauchtOriginaltext(arbeit(11), teil('en-reading'))).toBe(true)
  })
})

describe('Sprache des gesuchten Textes', () => {
  it('sucht in der Zielsprache des Fachs', () => {
    expect(quellenSprache('englisch')).toBe('en')
    expect(quellenSprache('franzoesisch')).toBe('fr')
    expect(quellenSprache('latein')).toBe('la')
  })

  it('sucht in den übrigen Fächern auf Deutsch', () => {
    expect(quellenSprache('geschichte')).toBe('de')
    expect(quellenSprache('politik')).toBe('de')
  })
})

describe('Wenn für einen Teil kein Originaltext gefunden wird', () => {
  const baustein = fehlenderTextBaustein(teil('en-reading'), 'Geprüft und verworfen: Register, zu kurz.')

  it('bleibt der Teil sichtbar und erklärt sich selbst', () => {
    /*
     * Ein leerer Teil ohne Erklärung wäre von einem Fehler der App nicht zu unterscheiden.
     * Die Lehrkraft muss lesen können, wonach gesucht und was verworfen wurde.
     */
    expect(baustein.type).toBe('infoBox')
    const text = baustein.type === 'infoBox' ? baustein.body : ''
    expect(text).toContain('kein geeigneter Originaltext')
    expect(text).toContain('Register')
  })

  it('nennt den Grund, warum nichts Erfundenes eingesetzt wurde', () => {
    const text = baustein.type === 'infoBox' ? baustein.body : ''
    expect(text).toContain('darf kein von einer KI erfundenes Material verwendet werden')
  })

  it('sagt, was die Lehrkraft nun tun kann', () => {
    const text = baustein.type === 'infoBox' ? baustein.body : ''
    expect(text).toContain('eigenen Text')
  })

  it('trägt eine Warnung, damit der Teil nicht übersehen wird', () => {
    expect(baustein.warnings?.join(' ')).toContain('unvollstaendig')
  })
})
