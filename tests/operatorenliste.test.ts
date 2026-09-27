import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import {
  amtlicheListe,
  operatorAusAnweisung,
  operatorenBefund,
  operatorenBlock,
  operatorenDerArbeit,
  operatorenlisteAktiv,
  OPERATOREN_BLOCK_ID
} from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'

/*
 * Operatorenliste als Anlage der Klausur (27.09.2026): Niedersachsen verlangt, dass Lernende der
 * Sek II die Operatoren zur Klausur erhalten. Der Baustein listet die verwendeten Operatoren mit
 * der AMTLICHEN Definition des Landes – nichts anderes.
 */

const aufgabe = (instruction: string, teile: string[] = []): TaskBlock => ({
  ...(newBlock('task') as TaskBlock),
  id: `t-${instruction.slice(2, 8)}`,
  instruction,
  operator: '',
  parts: teile.map((p, i) => ({ id: `p${i}`, instruction: p, answer: { kind: 'lines', lines: 3 } as never, solution: '' }))
})
const part = (blocks: TaskBlock[]): ExamPart =>
  ({ id: 'p1', formatId: 'en-writing', label: 'Writing', competence: 'Schreiben', minutes: 45, points: 0, weight: 100, contentShare: 60, blocks }) as ExamPart
const arbeit = (over: Partial<Exam['meta']>, blocks: TaskBlock[]): Exam =>
  ({
    version: 1,
    meta: {
      ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'englisch',
      subjectLabel: 'Englisch',
      topic: 'Macbeth',
      grade: 13,
      courseLevel: 'eA',
      ...over
    },
    parts: [part(blocks)],
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

describe('Operatoren aus den Aufgaben', () => {
  it('liest den fett gesetzten Operator, auch aus Teilaufgaben, ohne Dubletten', () => {
    expect(operatorAusAnweisung('**Outline** the main ideas.')).toBe('Outline')
    expect(operatorAusAnweisung('Outline the main ideas.')).toBe('')
    const e = arbeit({}, [aufgabe('**Outline** the review.', ['**Analyse** the tone.', '**analyse** the imagery.']), aufgabe('**Comment** on the ending.')])
    expect(operatorenDerArbeit(e)).toEqual(['outline', 'analyse', 'comment'])
  })

  it('Sek II von selbst, Sek I nur per Schalter', () => {
    expect(operatorenlisteAktiv(arbeit({}, []))).toBe(true)
    expect(operatorenlisteAktiv(arbeit({ grade: 8, courseLevel: undefined }, []))).toBe(false)
    expect(operatorenlisteAktiv(arbeit({ grade: 8, courseLevel: undefined, operatorenliste: true }, []))).toBe(true)
    expect(operatorenlisteAktiv(arbeit({ operatorenliste: false }, []))).toBe(false)
  })

  it('ohne amtliche Liste des Landes gibt es keinen Baustein, aber einen Befund für die Lehrkraft', () => {
    const e = arbeit({ stateId: 'XX' }, [aufgabe('**Outline** the review.')])
    expect(amtlicheListe('XX', 'englisch')).toBeNull()
    expect(operatorenBlock(e)).toBeNull()
    expect(operatorenBefund(e).fehlend).toEqual(['outline'])
    expect(examToWorksheet(e).sheets[0].blocks.some((b) => b.id === OPERATOREN_BLOCK_ID)).toBe(false)
  })

  it('Niedersachsen, Englisch: verwendete Operatoren mit amtlichem Wortlaut, Arbeitsanweisungen ohne Eintrag', () => {
    const e = arbeit({}, [
      aufgabe('**Tick** the correct answer.'),
      aufgabe('**Outline** the review.', ['**Comment on** the ending.']),
      aufgabe('**Write** an email.')
    ])
    const b = operatorenBefund(e)
    expect(b.fehlend).toEqual([])
    expect(b.gefunden.map((d) => d.operator)).toEqual(['outline', 'comment on', 'write'])
    const block = operatorenBlock(e)
    expect(block?.type).toBe('infoBox')
    expect(block && block.type === 'infoBox' ? block.body : '').toContain('**outline** (level I): give the main features')
    expect(block && block.type === 'infoBox' ? block.body : '').toContain('Stand 1. Februar 2024')
    const ws = examToWorksheet(e)
    expect(ws.sheets[0].blocks[ws.sheets[0].blocks.length - 1].id).toBe(OPERATOREN_BLOCK_ID)
    // Unbekannter Operator: nicht auf dem Blatt, aber im Befund
    expect(operatorenBefund(arbeit({}, [aufgabe('**Rewrite** the text.')])).fehlend).toEqual(['rewrite'])
  })

  it('Niedersachsen, Geschichte: Imperative und hinterlegte Formen treffen die Infinitive', () => {
    const e = arbeit({ subjectId: 'geschichte', subjectLabel: 'Geschichte' }, [
      aufgabe('**Analysiere** die Rede.', ['**Erläutere** den Kontext.']),
      aufgabe('**Nimm Stellung** zur These.'),
      aufgabe('**Setze** die Quellen **in Beziehung**.')
    ])
    const b = operatorenBefund(e)
    expect(b.gefunden.map((d) => d.operator)).toEqual(['analysieren', 'erläutern', 'Stellung nehmen'])
    expect(b.fehlend).toEqual(['setze'])
    expect(operatorenBlock(e) && (operatorenBlock(e) as { body: string }).body).toContain('**Stellung nehmen** (AFB III)')
  })
})
