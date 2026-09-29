import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { KLASSENARBEIT_FAECHER as SICHTBAR_FAECHER } from '../src/renderer/src/shared/programmSichtbarkeit'
import { operatorenBlock } from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { translateAids } from '../src/renderer/src/modules/klassenarbeit/model/aids'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import {
  fachDerArbeit,
  formatArt,
  formatIdFuer,
  inhaltsanteil,
  istFremdsprache,
  KLASSENARBEIT_FAECHER,
  sprachfolge
} from '../src/renderer/src/modules/klassenarbeit/model/faecher'
import { EXAM_FORMATS, formatById, formatsFor, suggestParts } from '../src/renderer/src/modules/klassenarbeit/model/formats'
import type { Exam, ExamPart, ExamSubjectId } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examHeadBlock, examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'

/*
 * Klassenarbeit in Französisch, Spanisch, Deutsch, Politik und Erdkunde (Großprogramm 0.4,
 * Phase G). Die Fächer sagen über ihr Profil, was sie sind; die Programmteile fragen danach.
 */
// Seit 29.09.2026 alle Fächer (Wunsch der Lehrkraft: Klassenarbeiten in allen Fächern)
const FAECHER: ExamSubjectId[] = ['englisch', 'franzoesisch', 'spanisch', 'deutsch', 'geschichte', 'politik', 'erdkunde', 'italienisch', 'russisch', 'latein', 'griechisch', 'mathematik', 'informatik', 'biologie', 'chemie', 'physik', 'technik', 'wirtschaft', 'religion', 'ethik', 'philosophie', 'werte-und-normen', 'musik', 'kunst']

const arbeit = (subjectId: ExamSubjectId, over: Partial<Exam['meta']> = {}, parts: ExamPart[] = []): Exam =>
  ({
    version: 1,
    meta: { ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'), subjectId, subjectLabel: fachDerArbeit(subjectId).label, topic: 'Thema', grade: 8, ...over },
    parts,
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

describe('Fachprofil', () => {
  it('kennt alle Fächer, die Programmsichtbarkeit dieselben', () => {
    expect(KLASSENARBEIT_FAECHER.map((f) => f.id)).toEqual(FAECHER)
    expect([...SICHTBAR_FAECHER].sort()).toEqual([...FAECHER].sort())
  })

  it('Fremdsprachen: Formatarten über alle Sprachen', () => {
    expect(formatArt('fr-writing')).toBe('writing')
    expect(formatArt('es-mediation')).toBe('mediation')
    expect(formatArt('en-listening')).toBe('listening')
    expect(formatArt('ge-source')).toBeNull()
    expect(formatArt('de-textanalyse')).toBeNull()
    expect(formatIdFuer('spanisch', 'reading')).toBe('es-reading')
    expect(istFremdsprache('franzoesisch') && !istFremdsprache('deutsch')).toBe(true)
  })

  it('Fremdsprachenfolge: Englisch 1., Französisch/Spanisch nach Angabe (fehlt = 2.)', () => {
    expect(sprachfolge({ subjectId: 'englisch', languageOrder: 3 })).toBe(1)
    expect(sprachfolge({ subjectId: 'franzoesisch' })).toBe(2)
    expect(sprachfolge({ subjectId: 'spanisch', languageOrder: 3 })).toBe(3)
    expect(worksheetMetaFor(arbeit('spanisch', { languageOrder: 3 })).languageOrder).toBe(3)
  })

  it('Deutsch bewertet Inhalt und Darstellung 70 : 30, die Fremdsprachen Inhalt und Sprache 40 : 60', () => {
    expect(inhaltsanteil('deutsch')).toBe(70)
    expect(inhaltsanteil('franzoesisch')).toBe(40)
  })
})

describe('Formate und Vorschlag', () => {
  it('jedes Fach hat in Klasse 8 und 12 Formate, alle Kennungen eindeutig', () => {
    for (const f of FAECHER) {
      expect(formatsFor(f, 8).length, f).toBeGreaterThan(2)
      expect(formatsFor(f, 12).length, f).toBeGreaterThan(2)
    }
    const ids = EXAM_FORMATS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('Französisch und Spanisch haben alle Teile des Englischen, Beschriftung in der Zielsprache, Beginn frühestens Klasse 6', () => {
    for (const art of ['listening', 'reading', 'mediation', 'writing', 'language', 'grammar', 'speaking']) {
      expect(formatById(`fr-${art}`)?.subject).toBe('franzoesisch')
      expect(formatById(`es-${art}`)?.subject).toBe('spanisch')
    }
    expect(formatById('fr-writing')?.label).toBe('Production écrite')
    expect(formatById('es-reading')?.label).toBe('Comprensión lectora')
    expect(formatsFor('franzoesisch', 5)).toEqual([])
    expect(formatById('es-mediation')?.grades[0]).toBe(7)
  })

  it('der Vorschlag passt zu jedem Fach: Anteile 100 %, Minuten wie vorgegeben, eigene Formate', () => {
    for (const f of FAECHER)
      for (const grade of [6, 8, 11]) {
        const teile = suggestParts(f, grade, 60, 90)
        expect(teile.length, `${f} ${grade}`).toBeGreaterThan(0)
        expect(
          teile.reduce((n, t) => n + t.weight, 0),
          `${f} ${grade}`
        ).toBe(100)
        expect(
          teile.reduce((n, t) => n + t.minutes, 0),
          `${f} ${grade}`
        ).toBe(90)
        for (const t of teile) expect(formatById(t.formatId)?.subject, t.formatId).toBe(f)
      }
    // Fremdsprachen: Schreibteil mit eigener Note, Deutsch und Sachfächer: Punkte verteilt
    const fr = suggestParts('franzoesisch', 8, 60, 90)
    expect(fr.find((t) => t.gradeGroup === 'writing')?.formatId).toBe('fr-writing')
    expect(suggestParts('politik', 9, 60, 90).reduce((n, t) => n + t.points, 0)).toBe(60)
    expect(suggestParts('deutsch', 8, 60, 90)[0].contentShare).toBe(70)
  })
})

describe('Kopf und Anlage', () => {
  const aufgabe = (instruction: string): TaskBlock => ({ ...(newBlock('task') as TaskBlock), id: 't1', instruction, operator: '', parts: [] })
  const teil = (formatId: string): ExamPart =>
    ({
      id: 'p1',
      formatId,
      label: formatById(formatId)!.label,
      competence: 'x',
      minutes: 45,
      points: 20,
      weight: 100,
      gradeGroup: 'other',
      blocks: [aufgabe('**Analyse** the text.')]
    }) as ExamPart

  it('der Kopf einer Französischarbeit ist französisch, einer Spanischarbeit spanisch', () => {
    const fr = examHeadBlock(arbeit('franzoesisch', { infoBox: true, aids: 'zweisprachiges Wörterbuch' } as never, [teil('fr-reading')]))!
    expect(fr.type === 'infoBox' && fr.body).toMatch(/Durée : \d+ minutes/)
    expect(fr.type === 'infoBox' && fr.body).toMatch(/un dictionnaire bilingue/)
    const es = examToWorksheet(arbeit('spanisch', {}, [teil('es-reading')]))
    expect(es.meta.title).toBe('Examen')
    expect(es.meta.labelLanguage).toBe('es')
    expect(es.sheets[0].blocks.some((b) => b.type === 'divider' && /^Parte 1: Comprensión lectora \(20 puntos\)/.test(b.title ?? ''))).toBe(true)
  })

  it('Deutsch- und Politikarbeiten bleiben deutsch', () => {
    const de = examToWorksheet(arbeit('politik', {}, [teil('pol-text')]))
    expect(de.meta.title).toBe('Klassenarbeit Politik')
    expect(de.meta.labelLanguage).toBe('de')
  })

  it('Hilfsmittel auf Französisch und Spanisch; Unbekanntes bleibt stehen', () => {
    expect(translateAids('einsprachiges Wörterbuch, Atlas', 'fr')).toBe('un dictionnaire unilingue, un atlas')
    expect(translateAids('Vokabelheft, eigener Zettel', 'es')).toBe('tu cuaderno de vocabulario, eigener Zettel')
  })

  it('Operatorenliste der Oberstufe auch für Französisch (Sachsen-Anhalt, amtliche Liste des Landes)', () => {
    const e = arbeit('franzoesisch', { stateId: 'ST', grade: 12, operatorenliste: true } as never, [
      { ...teil('fr-writing'), blocks: [aufgabe('**Analysez** le texte.')] } as ExamPart
    ])
    const b = operatorenBlock(e)
    expect(b?.type).toBe('infoBox')
    if (b?.type === 'infoBox') {
      expect(b.body).toMatch(/\*\*analyser\*\*/)
      expect(b.body).toMatch(/Source: /)
    }
  })
})
