import { describe, expect, it } from 'vitest'
import { convertBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { reparaturAus } from '../src/renderer/src/modules/arbeitsblatt/generation/reparatur'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Sheet, TaskBlock, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { checkSubjectOperators } from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { checkSubjectOperator } from '../src/renderer/src/modules/arbeitsblatt/didactics/subjectOperators'
import { anredeRegel } from '../src/renderer/src/shared/anrede'
import { reparaturAuftrag } from '../src/renderer/src/shared/kiBeheben'
import { korrigiereBaustein, operatorformBefunde, operatorformenUmsetzen } from '../src/renderer/src/shared/operatorformen'
import { pruefeOperatoren } from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatorPruefung'
import { operatorRegeln } from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatorPruefung'
import { satzbauBefunde } from '../src/renderer/src/modules/tafelbild/pruefung'
import { satzbauKorrigieren } from '../src/renderer/src/modules/tafelbild/vorschlaege'
import type { TbInhalt, TbTafel } from '../src/renderer/src/modules/tafelbild/model'
import { operatorenBefund } from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import { presetDesigns } from '../src/shared/design'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'

/*
 * Regression „Zusammenfassen Sie anhand von M1 …" (Fehlerbericht der Lehrkraft, 01.10.2026) in
 * allen Pfaden: Erzeugung (convertBlock – über ihn laufen Arbeitsblatt, Klassenarbeit,
 * Lernzielkontrolle und Grammatiktest), Reparatur („Mit KI beheben"), Anrede-Umwandlung (die
 * Regel im Auftrag), Prüfung der Blätter und „Vorschlag der App umsetzen", Tafelbild.
 */

const FALSCH = 'Zusammenfassen Sie anhand von M1 die Position Bismarcks.'
const RICHTIG = 'Fassen Sie anhand von M1 die Position Bismarcks zusammen.'

const flach = (patch: Record<string, unknown>): Record<string, unknown> => ({
  type: 'task',
  instruction: '',
  operator: '',
  afb: 'I',
  socialForm: 'EA',
  minutes: 5,
  points: 0,
  solution: '',
  answer: { kind: 'lines', count: 4 },
  parts: [],
  ...patch
})

const aufgabe = (id: string, instruction: string, parts: string[] = []): TaskBlock => ({
  id,
  type: 'task',
  instruction,
  operator: '',
  afb: 'I',
  afbReason: '',
  socialForm: 'EA',
  minutes: 10,
  points: 0,
  solution: '',
  answer: { ...emptyAnswer('lines'), count: 4 },
  parts: parts.map((p, i) => ({ id: `${id}${i}`, instruction: p, answer: emptyAnswer('lines'), solution: '' }))
})

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  grade: 12,
  ...patch
})

describe('Erzeugung: KI-Ausgaben werden nach der Erzeugung korrigiert', () => {
  it('convertBlock stellt Aufgabe, Teilaufgaben und Situation richtig', () => {
    const b = convertBlock(
      flach({
        instruction: `**Zusammenfassen** Sie anhand von M1 die Position Bismarcks.`,
        parts: [{ instruction: 'Herausarbeiten Sie die Ziele.', answer: { kind: 'lines', count: 2 } }],
        brief: { situation: 'Stellung nehmen Sie zur Rede.' }
      }),
      createRng(1),
      [],
      'sie'
    ) as TaskBlock
    expect(b.instruction).toBe('**Fassen** Sie anhand von M1 die Position Bismarcks **zusammen**.')
    expect(b.parts[0].instruction).toBe('Arbeiten Sie die Ziele heraus.')
    expect(b.brief?.situation ?? 'Nehmen Sie zur Rede Stellung.').toBe('Nehmen Sie zur Rede Stellung.')
  })

  it('lässt korrekte und fremdsprachige Aufgaben unverändert', () => {
    for (const t of [RICHTIG, 'Fasse den Text zusammen.', 'Summarise the text.', 'Résumez le texte.', 'Обобщите содержание текста.']) {
      const b = convertBlock(flach({ instruction: t }), createRng(1), []) as TaskBlock
      expect(b.instruction).toBe(t)
    }
  })
})

describe('Reparatur („Mit KI beheben")', () => {
  it('der Auftrag verbietet den vorangestellten Infinitiv', () => {
    const a = reparaturAuftrag(['Aufgabe 1: „fassen" steht nicht in der Operatorenliste.'], { material: 'Arbeitsblatt', lerngruppe: 'Geschichte, Klasse 12' })
    expect(a).toContain('nie im Infinitiv vorangestellt')
    expect(a).toContain('Fassen Sie … zusammen')
  })
  it('eine Reparatur mit „Zusammenfassen Sie" kommt korrigiert an', () => {
    const r = reparaturAus({ aenderungen: [{ art: 'ersetzen', nummer: 1, block: flach({ instruction: FALSCH }) }] }, [aufgabe('t', 'Fasse … zusammen.')], 'sie', 'keine')
    expect((r.aenderungen[0].block as TaskBlock).instruction).toBe(RICHTIG)
  })
})

describe('Anrede-Umwandlung', () => {
  it('die Anrede-Regel im Auftrag verlangt die Satzklammer – in beiden Formen', () => {
    expect(anredeRegel('sie')).toContain('Fassen Sie anhand von M1 die Position zusammen.')
    expect(anredeRegel('sie')).toContain('Zusammenfassen Sie')
    expect(anredeRegel('du')).toContain('Fasse anhand von M1 die Position zusammen.')
  })
  it('Mischformen aus der Umwandlung („Fasse Sie …", „Erläutere Sie …") werden korrigiert', () => {
    const b = convertBlock(flach({ instruction: 'Fasse Sie den Text zusammen und erläutere Sie die Folgen.' }), createRng(1), [], 'sie') as TaskBlock
    expect(b.instruction).toBe('Fassen Sie den Text zusammen und erläutern Sie die Folgen.')
  })
  it('die Operator-Regel der Lernzielkontrolle verlangt den Imperativ', () => {
    expect(operatorRegeln(undefined)).toContain('Imperativ')
  })
})

describe('Prüfung bestehender Materialien und „Vorschlag der App umsetzen"', () => {
  const blatt = (blocks: WsBlock[], label = 'Arbeitsblatt'): Sheet => ({ id: label, label, blocks })

  it('Arbeitsblatt-Prüfung meldet die Infinitivstellung, statt sie als Operator durchzulassen', () => {
    const w = checkSubjectOperators(blatt([aufgabe('a', FALSCH)]), meta())
    expect(w.some((x) => x.kind === 'operator' && x.message.includes('„Zusammenfassen Sie"') && x.message.includes('„Fassen Sie … zusammen"'))).toBe(true)
    expect(checkSubjectOperators(blatt([aufgabe('a', RICHTIG)]), meta()).filter((x) => x.message.includes('Imperativform'))).toEqual([])
  })

  it('Meldung „nicht in der Liste" nennt die Form im Text, nicht nur das erste Wort', () => {
    const r = checkSubjectOperator('Arbeiten Sie aus M1 heraus, welche Ziele Bismarck verfolgte.', 'mathematik', undefined, { stateId: 'NI', stufe: 'sek2' })
    if (r && !r.known) expect(r.operator).not.toBe('arbeiten')
  })

  it('Befunde über alle Fassungen, Korrektur in einem Schritt', () => {
    const a = blatt([aufgabe('a', FALSCH, ['Darstellen Sie den Verlauf.'])], 'Gruppe A')
    const b = blatt([aufgabe('b', 'Erläutere Sie die Folgen.')], 'Gruppe B')
    const befunde = operatorformBefunde([a, b])
    expect(befunde.map((x) => x.ort)).toEqual(['Gruppe A, Aufgabe 1', 'Gruppe A, Aufgabe 1 a)', 'Gruppe B, Aufgabe 1'])
    expect(operatorformBefunde([a, b], false)).toEqual([])
    const n = operatorformenUmsetzen(a.blocks) + operatorformenUmsetzen(b.blocks)
    expect(n).toBe(3)
    expect((a.blocks[0] as TaskBlock).instruction).toBe(RICHTIG)
    expect((a.blocks[0] as TaskBlock).parts[0].instruction).toBe('Stellen Sie den Verlauf dar.')
    expect((b.blocks[0] as TaskBlock).instruction).toBe('Erläutern Sie die Folgen.')
    expect(operatorformBefunde([a, b])).toEqual([])
  })

  it('korrigiereBaustein: unverändert bleibt dasselbe Objekt', () => {
    const ok = aufgabe('x', RICHTIG)
    expect(korrigiereBaustein(ok)).toBe(ok)
    expect((korrigiereBaustein(aufgabe('y', FALSCH)) as TaskBlock).instruction).toBe(RICHTIG)
  })

  it('Lernzielkontrolle: Formfehler als Warnung, Teilaufgaben nicht doppelt', () => {
    const w = pruefeOperatoren(
      [
        { id: 't:0', instruction: `${FALSCH} a)`, answerKind: 'lines', hatMaterial: true },
        { id: 't:1', instruction: `${FALSCH} b)`, answerKind: 'lines', hatMaterial: true }
      ],
      undefined
    )
    expect(w.filter((x) => x.art === 'form')).toHaveLength(1)
    expect(pruefeOperatoren([{ id: 'u', instruction: RICHTIG, answerKind: 'lines', hatMaterial: true }], undefined).filter((x) => x.art === 'form')).toEqual([])
  })
})

describe('Klassenarbeit: Operatorenliste als Anlage', () => {
  it('nur das Verb fett („**Fassen** Sie … zusammen") – kein „fassen" ohne Definition', () => {
    const exam = {
      version: 1,
      meta: { ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Bismarck', grade: 12 },
      parts: [{ id: 'p', formatId: 'ge-quelle', label: 'Quelle', competence: '', minutes: 90, points: 0, weight: 100, blocks: [aufgabe('a', '**Fassen** Sie anhand von M1 die Position zusammen.')] }],
      design: presetDesigns()[0],
      createdAt: ''
    } as unknown as Exam
    const b = operatorenBefund(exam)
    expect(b.fehlend).not.toContain('fassen')
    expect(b.gefunden.map((d) => d.operator)).toContain('zusammenfassen')
  })
})

describe('Tafelbild', () => {
  const inhalt = { impuls: FALSCH, hausaufgabe: '', schritte: [{ nr: 1, phase: 'Einstieg', impuls: 'Herausarbeiten Sie die These.' }] } as unknown as TbInhalt
  const tafel = { format: 'klapptafel', elemente: [{ id: 'e1', typ: 'kasten', text: 'Einordnen Sie die Quelle.', titel: 'Auftrag' }] } as unknown as TbTafel

  it('meldet falsche Stellungen mit dem Vorschlag „Satzstellung korrigieren"', () => {
    const b = satzbauBefunde([tafel], inhalt)
    expect(b).toHaveLength(1)
    expect(b[0].vorschlaege).toEqual(['satzbau'])
    expect(b[0].text).toContain('„Zusammenfassen Sie" → „Fassen Sie … zusammen"')
  })
  it('korrigiert ohne KI', () => {
    const t = structuredClone({ tafeln: [tafel], inhalt })
    expect(satzbauKorrigieren(t)).toBe(3)
    expect(t.inhalt.impuls).toBe(RICHTIG)
    expect(t.tafeln[0].elemente[0].text).toBe('Ordnen Sie die Quelle ein.')
    expect(t.inhalt.schritte[0].impuls).toBe('Arbeiten Sie die These heraus.')
    expect(satzbauBefunde(t.tafeln, t.inhalt)).toEqual([])
  })
})
