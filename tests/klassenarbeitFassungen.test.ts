/**
 * Fassungen einer Klassenarbeit (A/B/C), hineingezogene Unterlagen und die Migration
 * gespeicherter Arbeiten – Paket 5 (25.09.2026).
 *
 * Anlass: Das Feld „Varianten (A/B)" stand im Formular, bewirkte aber nichts. Die Wachen hier
 * prüfen deshalb am ERGEBNIS der Erzeugung, nicht an einer Einstellung: Gibt es Fassung B
 * wirklich, ist sie gleichwertig (Punkte, Aufgabenzahl), läuft die Nachbesserung auch für sie,
 * und bleibt eine alte Arbeit mit einer Fassung unverändert?
 */
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '@shared/design'
import { generateExam, partPrompt } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import {
  bloeckeDerFassung,
  fassungsZahl,
  gleichePunkte,
  materialweg,
  mitBloecken,
  normalisiereArbeit,
  teileDerFassung,
  uebernimmMaterial
} from '../src/renderer/src/modules/klassenarbeit/model/fassungen'
import { examToWorksheet, examToWorksheetAlle } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { useKlassenarbeit } from '../src/renderer/src/modules/klassenarbeit/store'

const part = (formatId: string, patch: Partial<ExamPart> = {}): ExamPart => ({
  id: formatId,
  formatId,
  label: formatId,
  competence: 'Kompetenz',
  weight: 30,
  points: 21,
  minutes: 27,
  gradeGroup: formatId === 'en-writing' ? 'writing' : 'other',
  afbMix: { I: 30, II: 45, III: 25 },
  blocks: [],
  ...patch
})

const exam = (parts: ExamPart[], patch: Partial<Exam['meta']> = {}): Exam => ({
  version: 1,
  design: presetDesigns()[0],
  parts,
  createdAt: '2026-09-25',
  meta: {
    title: '2. Klassenarbeit',
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'Going abroad',
    content: 'simple past',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    schoolTypeName: 'Gymnasium',
    grade: 9,
    courseLevel: 'mixed',
    cefrLevel: 'B1',
    grammarTopic: '',
    vocab: [],
    infoBox: true,
    minutes: 90,
    points: 21,
    aids: 'einsprachiges Wörterbuch',
    variants: 1,
    gradeScale: false,
    separateWritingGrade: true,
    answerKey: true,
    answerKeyDetail: 'ausfuehrlich',
    teacherNote: '',
    ...patch
  }
})

const text = (id: string, body: string): WsBlock => ({ id, type: 'text', title: 'Text', body, lineNumbers: false, source: '', glossary: [] }) as WsBlock
const aufgabe = (id: string, points: number, instruction = '**Tick** the correct answer.'): WsBlock =>
  ({
    id,
    type: 'task',
    instruction,
    operator: 'tick',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 5,
    points,
    solution: 'a)',
    answer: { kind: 'multipleChoice', options: ['a', 'b'], correct: [0], lines: 0 },
    parts: []
  }) as unknown as WsBlock

/** Antwort der KI im Schema des Arbeitsblatts – ein Text und eine Aufgabe */
const antwort = (textBody: string, points = 3, instruction = '**Tick** the correct answer.') => ({
  blocks: [
    { outlineIndex: 0, type: 'text', title: 'Text', body: textBody, lineNumbers: true },
    {
      outlineIndex: 1,
      type: 'task',
      instruction,
      operator: 'tick',
      afb: 'I',
      solution: 'a)',
      points,
      answer: { kind: 'multipleChoice', options: ['a', 'b', 'c'], correct: [0] }
    }
  ]
})

describe('Migration gespeicherter Arbeiten', () => {
  it('lässt eine Arbeit mit einer Fassung unverändert – dasselbe Objekt', () => {
    const alt = exam([part('en-reading', { blocks: [aufgabe('t1', 3)] })])
    expect(normalisiereArbeit(alt)).toBe(alt)
    expect(fassungsZahl(alt)).toBe(1)
  })

  it('bringt eine Fassungszahl außerhalb 1–3 in den gültigen Bereich (das alte Feld ließ jede Zahl zu)', () => {
    expect(normalisiereArbeit(exam([], { variants: 7 })).meta.variants).toBe(3)
    expect(normalisiereArbeit(exam([], { variants: 0 })).meta.variants).toBe(1)
    expect(normalisiereArbeit(exam([], { variants: undefined as unknown as number })).meta.variants).toBe(1)
  })

  it('verwirft ein kaputtes Fassungsfeld und lässt Fassung A stehen', () => {
    const kaputt = exam([part('en-reading', { blocks: [aufgabe('t1', 3)], weitereFassungen: 'x' as unknown as WsBlock[][] })])
    const neu = normalisiereArbeit(kaputt)
    expect(neu.parts[0].weitereFassungen).toBeUndefined()
    expect(neu.parts[0].blocks).toHaveLength(1)
  })
})

describe('Fassungsmodell', () => {
  it('liest und setzt die Bausteine je Fassung, der Aufbau bleibt gemeinsam', () => {
    const p = mitBloecken(part('en-reading', { blocks: [aufgabe('a', 3)] }), 1, [aufgabe('b', 3)])
    const e = exam([p])
    expect(fassungsZahl(e)).toBe(2)
    expect(bloeckeDerFassung(p, 0)[0].id).toBe('a')
    expect(bloeckeDerFassung(p, 1)[0].id).toBe('b')
    expect(teileDerFassung(e, 1)[0].points).toBe(21)
  })

  it('übernimmt Hörtexte und Quellen, schreibt aber Lesetexte der Sek I neu', () => {
    expect(materialweg(exam([]), part('en-listening'))).toBe('gleich')
    expect(materialweg(exam([], { subjectId: 'geschichte', subjectLabel: 'Geschichte' }), part('ge-source'))).toBe('gleich')
    expect(materialweg(exam([]), part('en-reading'))).toBe('parallel')
    expect(materialweg(exam([]), part('en-writing'))).toBe('parallel')
    // Oberstufe: kein KI-Material – dieselbe Originalquelle für alle Fassungen
    expect(materialweg(exam([], { grade: 12 }), part('en-reading'))).toBe('gleich')
  })

  it('setzt neue Aufgaben an die Stellen der alten, das Material behält seine id', () => {
    const vorlage = [text('m1', 'Hörtext'), aufgabe('a1', 2), aufgabe('a2', 4)]
    const neu = uebernimmMaterial(vorlage, [text('x', 'soll nicht rein'), aufgabe('b1', 1), aufgabe('b2', 1)])
    expect(neu.map((b) => b.id)).toEqual(['m1', 'b1', 'b2'])
  })

  it('gibt jeder Aufgabe die Punkte ihres Gegenstücks – oder meldet eine abweichende Zahl', () => {
    const b = [aufgabe('b1', 1), aufgabe('b2', 9)]
    expect(gleichePunkte([aufgabe('a1', 2), aufgabe('a2', 4)], b)).toBeNull()
    expect(b.map((x) => (x as { points: number }).points)).toEqual([2, 4])
    expect(gleichePunkte([aufgabe('a1', 2)], b)).toContain('2 statt 1 Aufgaben')
  })
})

describe('Erzeugung mit Fassungen (simulierte KI)', () => {
  it('erzeugt je Teil Fassung A und ein gleichwertiges Gegenstück B', async () => {
    const anfragen: string[] = []
    const fakeAi = async <T>(req: { user: string }): Promise<T> => {
      anfragen.push(req.user)
      const b = req.user.includes('PARALLELFASSUNG B')
      return antwort(b ? 'Text of version B.' : 'Text of version A.', b ? 7 : 3) as T
    }
    const e = exam([part('en-reading'), part('en-writing', { points: 0, weight: 70, contentShare: 40 })], { variants: 2 })
    const r = await generateExam(e, fakeAi, () => undefined)
    // Je Teil zwei Anfragen: A, dann B mit A als Vorlage
    expect(anfragen).toHaveLength(4)
    expect(anfragen[1]).toContain('PARALLELFASSUNG B')
    expect(anfragen[1]).toContain('VORLAGE – FASSUNG A')
    expect(anfragen[1]).toContain('Operator „tick", AFB I,')
    expect(fassungsZahl(r)).toBe(2)
    const b = r.parts[0].weitereFassungen![0]
    expect(b.find((x) => x.type === 'text')).toMatchObject({ body: 'Text of version B.' })
    // Gleiche Punkte je Aufgabe wie in Fassung A
    const punkte = (l: WsBlock[]) => l.filter((x) => x.type === 'task').map((x) => (x as { points: number }).points)
    expect(punkte(b)).toEqual(punkte(r.parts[0].blocks))
    // Anzeige: Fassung B trägt ihren Gruppenbuchstaben, „alle" hat ein Blatt je Fassung
    const wsB = examToWorksheet(r, 1)
    expect(wsB.sheets[0].blocks[0]).toMatchObject({ type: 'infoBox' })
    expect((wsB.sheets[0].blocks[0] as { title: string }).title).toContain('Group B')
    expect(wsB.sheets[0].blocks.some((x) => x.type === 'text' && x.body === 'Text of version B.')).toBe(true)
    expect(examToWorksheetAlle(r).sheets.map((s) => s.id)).toEqual(['exam', 'exam-b'])
  })

  it('bleibt bei einer Fassung beim bisherigen Weg – keine weiteren Anfragen, kein Fassungsfeld', async () => {
    let n = 0
    const fakeAi = async <T>(): Promise<T> => {
      n++
      return antwort('Text.') as T
    }
    const r = await generateExam(exam([part('en-reading')]), fakeAi, () => undefined)
    expect(n).toBe(1)
    expect('weitereFassungen' in r.parts[0]).toBe(false)
    expect(examToWorksheet(r).sheets[0].id).toBe('exam')
  })

  it('bessert auch Fassung B nach und behält dabei den gemeinsamen Hörtext', async () => {
    /*
     * Getrennte Erzeugungswege: Die Prüfkette lief bis 25.09.2026 nur über die eine Fassung.
     * Hier verweist die Aufgabe in B auf ein Material „M5", das es nicht gibt – das muss die
     * Nachbesserung für B auslösen, und danach muss B denselben Hörtext haben wie A.
     */
    const audio = { outlineIndex: 0, type: 'audio', title: 'Growing up', body: 'Anna: I grew up in Leeds.', plays: 2, speakers: [{ name: 'Anna' }] }
    const task = (instruction: string) => ({
      outlineIndex: 1,
      type: 'task',
      instruction,
      operator: 'tick',
      afb: 'I',
      skill: 'listening',
      solution: 'Leeds',
      points: 3,
      answer: { kind: 'multipleChoice', options: ['Leeds', 'Hull'], correct: [0] }
    })
    const anfragen: string[] = []
    const fakeAi = async <T>(req: { user: string }): Promise<T> => {
      anfragen.push(req.user)
      if (req.user.includes('Behebe diese Mängel')) return { blocks: [task('**Tick** the right town.')] } as T
      if (req.user.includes('PARALLELFASSUNG B')) return { blocks: [task('**Tick** the correct answer in M5.')] } as T
      return { blocks: [audio, task('**Tick** the correct answer.')] } as T
    }
    const r = await generateExam(exam([part('en-listening')], { variants: 2 }), fakeAi, () => undefined)
    expect(anfragen.some((u) => u.includes('Behebe diese Mängel'))).toBe(true)
    expect(r.meta.teacherNote).toContain('Fassung B, Teil 1 nachgebessert')
    const a = r.parts[0].blocks
    const b = r.parts[0].weitereFassungen![0]
    const hoerA = a.find((x) => x.type === 'audio')!
    const hoerB = b.find((x) => x.type === 'audio')!
    expect(hoerB.id).toBe(hoerA.id)
    // Die Höraufgaben in B sind dem (gemeinsamen) Hörtext zugeordnet
    const aufgabenB = b.filter((x) => x.type === 'task') as { audioId?: string; instruction: string }[]
    expect(aufgabenB).toHaveLength(1)
    expect(aufgabenB[0].instruction).toContain('right town')
    expect(aufgabenB[0].audioId).toBe(hoerA.id)
  })
})

describe('Hineingezogene Unterlagen', () => {
  const quelle = (patch = {}) => ({
    id: 'q1',
    fileName: 'tafelbild.pdf',
    kind: 'pdf' as const,
    text: 'Past progressive: was/were + -ing',
    bilder: ['data:image/png;base64,AAA'],
    aktiv: true,
    ...patch
  })

  it('stehen im Auftrag jedes Teils; ausgeschaltete nicht', () => {
    expect(partPrompt(exam([], { materialQuellen: [quelle()] }), part('en-reading'), 1)).toContain('Past progressive: was/were + -ing')
    expect(partPrompt(exam([], { materialQuellen: [quelle({ aktiv: false })] }), part('en-reading'), 1)).not.toContain('Past progressive')
  })

  it('gehen als Bild an die KI – in jeder Anfrage, auch für Fassung B', async () => {
    const bilder: number[] = []
    const fakeAi = async <T>(req: { images?: string[] }): Promise<T> => {
      bilder.push(req.images?.length ?? 0)
      return antwort('Text.') as T
    }
    await generateExam(exam([part('en-reading')], { variants: 2, materialQuellen: [quelle()] }), fakeAi, () => undefined)
    expect(bilder).toEqual([1, 1])
  })
})

describe('Rückgängig bei Umbauten der Teile (seit Paket 1, hier nachgeprüft)', () => {
  it('holt die Teile nach einem Fachwechsel mit Strg+Z zurück', () => {
    const s = useKlassenarbeit.getState()
    s.reset()
    s.setExam(exam([part('en-reading'), part('en-writing')]))
    useKlassenarbeit.getState().update((d) => {
      d.meta.subjectId = 'geschichte'
      d.parts = []
    })
    expect(useKlassenarbeit.getState().exam!.parts).toHaveLength(0)
    useKlassenarbeit.getState().undo()
    expect(useKlassenarbeit.getState().exam!.parts).toHaveLength(2)
    expect(useKlassenarbeit.getState().exam!.meta.subjectId).toBe('englisch')
  })

  it('zeigt nach Rückgängig wieder Fassung A, wenn es die gewählte Fassung nicht mehr gibt', () => {
    const s = useKlassenarbeit.getState()
    s.reset()
    s.setExam(exam([part('en-reading', { blocks: [aufgabe('a', 3)] })]))
    useKlassenarbeit.getState().update((d) => {
      d.parts[0] = mitBloecken(d.parts[0], 1, [aufgabe('b', 3)])
    })
    useKlassenarbeit.getState().setFassung(1)
    useKlassenarbeit.getState().undo()
    expect(useKlassenarbeit.getState().fassung).toBe(0)
  })
})
