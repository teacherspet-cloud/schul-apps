import { describe, expect, it } from 'vitest'
import { checkStyle } from '../src/renderer/src/modules/arbeitsblatt/didactics/checks'
import {
  checkAfbBalance,
  checkClosure,
  checkInstructions,
  checkSubjectOperators,
  checkTaskMix
} from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { checkSubjectOperator, leadingOperator, subjectOperators } from '../src/renderer/src/modules/arbeitsblatt/didactics/subjectOperators'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Afb, AnswerKind, Sheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  grade: 9,
  ...patch
})

const task = (instruction: string, afb: Afb, kind: AnswerKind = 'lines', solution = 'Lösung'): WsBlock => ({
  id: Math.random().toString(36).slice(2),
  type: 'task',
  instruction,
  operator: '',
  afb,
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points: 0,
  solution,
  answer: { ...emptyAnswer(kind) },
  parts: []
})

const sheet = (blocks: WsBlock[]): Sheet => ({ id: 's', label: 'Arbeitsblatt', blocks })

describe('Operatoren je Fach', () => {
  it('erkennt den führenden Operator, auch mehrteilig', () => {
    expect(leadingOperator('**Nenne** drei Gründe.')).toBe('nenne')
    expect(leadingOperator('1. Beschreibe die Karikatur.')).toBe('beschreibe')
    expect(leadingOperator('Stellung nehmen zu der These')).toBe('stellung nehmen')
  })

  it('ordnet „vergleichen“ je Fach unterschiedlich zu', () => {
    expect(subjectOperators('geschichte')?.afb['vergleichen']).toBe('III')
    expect(subjectOperators('erdkunde')?.afb['vergleichen']).toBe('II')
    // Mathematik legt den Anforderungsbereich nicht am Operator fest
    expect(subjectOperators('mathematik')?.afb['berechnen']).toBeNull()
    // Fremdsprachen nutzen zielsprachliche Operatoren
    expect(subjectOperators('englisch', 'en')?.afb['outline']).toBeNull()
    expect(checkSubjectOperator('Outline the main problem.', 'englisch', 'en')).toMatchObject({ operator: 'outline', known: true })
  })

  it('meldet fachfremde Operatoren und falsche Anforderungsbereiche', () => {
    const warnings = checkSubjectOperators(
      sheet([task('Vergleiche die beiden Quellen.', 'II'), task('Rechne die Werte aus.', 'I'), task('Nenne zwei Gründe.', 'I')]),
      meta()
    )
    expect(warnings.some((w) => w.message.includes('„vergleichen“ gilt in Geschichte als Anforderungsbereich III'))).toBe(true)
    expect(warnings.some((w) => w.message.includes('„rechne“ steht nicht in der Operatorenliste'))).toBe(true)
  })
})

describe('Blattprüfungen', () => {
  it('prüft die Verteilung der Anforderungsbereiche nach der KMK-Regel', () => {
    const tooMuchThree = checkAfbBalance(sheet([task('Nenne …', 'I'), task('Beurteile …', 'III'), task('Bewerte …', 'III'), task('Erkläre …', 'II')]))
    expect(tooMuchThree.some((w) => w.message.includes('Schwerpunkt'))).toBe(true)
    const good = checkAfbBalance(
      sheet([task('Nenne …', 'I'), task('Nenne …', 'I'), task('Erkläre …', 'II'), task('Erkläre …', 'II'), task('Erkläre …', 'II'), task('Beurteile …', 'III')])
    )
    expect(good).toEqual([])
  })

  it('verlangt eine Ergebnissicherung', () => {
    expect(checkClosure(sheet([task('Nenne …', 'I'), task('Erkläre …', 'II')]))).toHaveLength(1)
    const withBox: WsBlock = { id: 'b', type: 'infoBox', variant: 'merke', title: 'Merke', body: 'Kern' }
    expect(checkClosure(sheet([task('Nenne …', 'I'), withBox]))).toEqual([])
    expect(checkClosure(sheet([task('Nenne …', 'I'), task('Fasse das Ergebnis in einem Satz zusammen.', 'II')]))).toEqual([])
  })

  it('verlangt verschiedene Aufgabenformate und kurze Arbeitsanweisungen', () => {
    const same = sheet([task('Nenne …', 'I'), task('Erkläre …', 'II'), task('Beurteile …', 'III')])
    expect(checkTaskMix(same).some((w) => w.message.includes('dieselbe Antwortform'))).toBe(true)
    const mixed = sheet([task('Nenne …', 'I', 'multipleChoice'), task('Erkläre …', 'II', 'lines')])
    expect(checkTaskMix(mixed)).toEqual([])
    const long = task(`Beschreibe ${'sehr '.repeat(30)}genau.`, 'I')
    expect(checkInstructions(sheet([long])).some((w) => w.message.includes('Wörtern'))).toBe(true)
    expect(checkInstructions(sheet([task('Nenne …', 'I', 'lines', '')])).some((w) => w.message.includes('keine Lösung'))).toBe(true)
  })
})

describe('Sprachlicher Stil', () => {
  it('meldet zu viel Passiv und zu viele Nominalisierungen', () => {
    const passive =
      'Der Versuch wird im Fachraum aufgebaut. Das Wasser wird in einem Becherglas langsam erhitzt. Die Temperatur wird jede Minute gemessen. Alle Werte werden in einer Tabelle notiert. Das Ergebnis wird anschließend in der Klasse besprochen. Die Auswertung wird von allen Gruppen gemeinsam durchgeführt.'
    expect(checkStyle(passive, 'Text').some((w) => w.message.includes('Passivsätze'))).toBe(true)
    const active =
      'Wir bauen den Versuch auf und erhitzen das Wasser. Dann messen wir die Temperatur und notieren jeden Wert. Am Ende besprechen wir das Ergebnis in der Gruppe und halten es fest. So sehen alle, was wir herausgefunden haben.'
    expect(checkStyle(active, 'Text')).toEqual([])
  })
})
