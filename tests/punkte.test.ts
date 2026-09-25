/**
 * Punkte der KI auf dem gemeinsamen Umwandlungsweg – Paket 6 (25.09.2026).
 *
 * Anlass: `convertBlock` setzte bei Aufgaben fest `points: 0`. LZK und Klassenarbeit verlangen
 * von der KI aber Punkte je Aufgabe – sie gingen verloren, und die LZK verteilte dann nur noch
 * nach Teilaufgaben. Die Wachen prüfen je Modul, was aus den Punkten wird: übernommen (LZK),
 * auf den Teil gebracht (Klassenarbeit, Fassung B wie A), wieder 0 (Arbeitsblatt).
 */
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '@shared/design'
import { convertBlock, punkteOf } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { ohnePunkte } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import { generateKurztest } from '../src/renderer/src/modules/lernzielkontrolle/generation/generateKurztest'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import { punkteAufTeil, teilNachUeberarbeitung } from '../src/renderer/src/modules/klassenarbeit/model/fassungen'
import { skalierePunkte } from '../src/renderer/src/shared/punkte'
import { kurztestToWorksheetAlle } from '../src/renderer/src/modules/lernzielkontrolle/render/kurztestWorksheet'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import { pageInfoFor } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { kopfTitel } from '../src/renderer/src/modules/arbeitsblatt/render/PageFrame'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const rohAufgabe = (points: unknown, teile = 0) => ({
  type: 'task',
  instruction: '**Berechne.**',
  operator: 'berechnen',
  afb: 'I',
  solution: '4',
  points,
  answer: { kind: 'lines', lines: 2 },
  parts: Array.from({ length: teile }, (_, i) => ({ instruction: `${i} + 1`, answer: { kind: 'lines' }, solution: '' }))
})

type Aufgabe = Extract<WsBlock, { type: 'task' }>
const aufgabe = (id: string, points: number): WsBlock => ({ ...(convertBlock(rohAufgabe(points), createRng(1), []) as Aufgabe), id })
const text = (id: string, body: string): WsBlock => ({ id, type: 'text', title: 'Text', body, lineNumbers: false, source: '', glossary: [] }) as WsBlock
const punkte = (blocks: WsBlock[]): number[] => blocks.filter((b): b is Aufgabe => b.type === 'task').map((b) => b.points)

describe('Umwandlung', () => {
  it('übernimmt die Punkte der KI – ganzzahlig und nie negativ', () => {
    expect((convertBlock(rohAufgabe(5), createRng(1), []) as Aufgabe).points).toBe(5)
    expect(punkteOf(2.6)).toBe(3)
    expect(punkteOf(-3)).toBe(0)
    expect(punkteOf('x')).toBe(0)
    expect(punkteOf(undefined)).toBe(0)
  })

  it('Arbeitsblatt: bleibt bei 0, auch wenn die KI Punkte schickt', () => {
    expect((ohnePunkte(convertBlock(rohAufgabe(4), createRng(1), [])) as Aufgabe).points).toBe(0)
    // Beim Überarbeiten bleiben von Hand vergebene Punkte stehen
    expect((ohnePunkte(convertBlock(rohAufgabe(4), createRng(1), []), 2) as Aufgabe).points).toBe(2)
  })
})

describe('Lernzielkontrolle', () => {
  const test = () => emptyKurztest('NI', 'gymnasium', 'Gymnasium')

  it('übernimmt die Punkte der KI statt nach Teilaufgaben zu verteilen', async () => {
    const t = test()
    t.meta.bewertung = { punkteAufBlatt: true, schluessel: 'standard' }
    const ai = async <T>(): Promise<T> => ({ blocks: [rohAufgabe(6, 1), rohAufgabe(2, 3)] }) as T
    const blocks = await generateKurztest(t, '', ai as never)
    // Nach Teilaufgaben wären es 1 und 3 gewesen
    expect(punkte(blocks)).toEqual([6, 2])
  })

  it('verteilt nur dann nach Teilaufgaben, wenn wirklich keine Punkte kamen', async () => {
    const t = test()
    t.meta.bewertung = { punkteAufBlatt: true, schluessel: 'standard' }
    const ai = async <T>(): Promise<T> => ({ blocks: [rohAufgabe(0, 2), rohAufgabe(undefined, 3)] }) as T
    expect(punkte(await generateKurztest(t, '', ai as never))).toEqual([2, 3])
  })

  it('setzt ohne Punkte auf dem Blatt alles auf 0', async () => {
    const t = test()
    t.meta.bewertung = { punkteAufBlatt: false, schluessel: 'keiner' }
    const ai = async <T>(): Promise<T> => ({ blocks: [rohAufgabe(6)] }) as T
    expect(punkte(await generateKurztest(t, '', ai as never))).toEqual([0])
  })
})

describe('Klassenarbeit', () => {
  it('skaliert auf die Punkte des Teils und erhält die Gewichtung', () => {
    const blocks = [aufgabe('a', 2), aufgabe('b', 4), text('m', 'Material')]
    punkteAufTeil(blocks, 12)
    expect(punkte(blocks)).toEqual([4, 8])
  })

  it('trifft die Summe auch bei krummen Verhältnissen genau', () => {
    const blocks = [aufgabe('a', 1), aufgabe('b', 1), aufgabe('c', 1)]
    punkteAufTeil(blocks, 10)
    expect(punkte(blocks).reduce((s, p) => s + p, 0)).toBe(10)
  })

  it('lässt einen Teil ohne Punktvorgabe, wie die KI ihn bepunktet hat', () => {
    const blocks = [aufgabe('a', 3)]
    punkteAufTeil(blocks, 0)
    expect(punkte(blocks)).toEqual([3])
  })

  it('rechnet mit derselben Hilfe wie die LZK', () => {
    const a = [aufgabe('a', 1), aufgabe('b', 3)] as Aufgabe[]
    skalierePunkte(a, 8)
    expect(a.map((x) => x.points)).toEqual([2, 6])
  })

  const part = (patch: Partial<ExamPart> = {}): ExamPart => ({
    id: 'p',
    formatId: 'en-listening',
    label: 'Listening',
    competence: '',
    weight: 30,
    points: 10,
    minutes: 20,
    gradeGroup: 'other',
    afbMix: { I: 30, II: 45, III: 25 },
    blocks: [],
    ...patch
  })
  const exam = (parts: ExamPart[]): Exam =>
    ({
      version: 1,
      design: presetDesigns()[0],
      parts,
      createdAt: '2026-09-25',
      meta: { subjectId: 'englisch', grade: 9, schoolTypeId: 'gymnasium', variants: 2 }
    }) as unknown as Exam

  it('zieht beim Überarbeiten von Fassung A das gemeinsame Material in Fassung B mit', () => {
    const p = part({ blocks: [text('h', 'Alter Hörtext'), aufgabe('a1', 5)], weitereFassungen: [[text('h', 'Alter Hörtext'), aufgabe('b1', 5)]] })
    const neu = teilNachUeberarbeitung(exam([p]), p, 0, [text('h2', 'Neuer Hörtext'), aufgabe('a2', 3)])
    const b = neu.weitereFassungen![0]
    expect(b.find((x) => x.type === 'text')).toMatchObject({ id: 'h2', body: 'Neuer Hörtext' })
    expect(b.find((x) => x.type === 'task')!.id).toBe('b1')
    // Punkte: A auf die 10 des Teils, B wie A
    expect(punkte(neu.blocks)).toEqual([10])
    expect(punkte(b)).toEqual([10])
    // Der alte Stand im Store bleibt unberührt (Rückgängig)
    expect(punkte(p.weitereFassungen![0])).toEqual([5])
  })

  it('behält beim Überarbeiten von Fassung B deren Material und gibt ihr die Punkte von A', () => {
    const p = part({ blocks: [text('h', 'Hörtext'), aufgabe('a1', 10)], weitereFassungen: [[text('h', 'Hörtext'), aufgabe('b1', 10)]] })
    const neu = teilNachUeberarbeitung(exam([p]), p, 1, [text('x', 'soll nicht rein'), aufgabe('b2', 4)])
    const b = neu.weitereFassungen![0]
    expect(b.map((x) => x.id)).toEqual(['h', 'b2'])
    expect(punkte(b)).toEqual([10])
    expect(neu.blocks).toBe(p.blocks)
  })
})

/*
 * Weitere Reste aus Paket 5: Kopfzeilen bei mehreren Fassungen und im Lösungsteil.
 */
describe('Kopfzeilen', () => {
  it('LZK „alle Fassungen": jedes Blatt nennt seine eigene Gruppe', () => {
    const t = emptyKurztest('NI', 'gymnasium', 'Gymnasium')
    t.varianten = [
      { id: 'a', label: 'A', blocks: [] },
      { id: 'b', label: 'B', blocks: [] }
    ] as never
    const ws = kurztestToWorksheetAlle(t)
    const kopf = ws.sheets.map((s) => pageInfoFor(ws, s, null, '', false).design.header.customText)
    expect(kopf[0]).toContain('Gruppe A')
    expect(kopf[1]).toContain('Gruppe B')
    expect(kopf[1]).not.toContain('Gruppe A')
  })

  it('Lösungsteil: „Erwartungshorizont" in der Klassenarbeit, sonst „Lösungen"', () => {
    const e = {
      version: 1,
      design: presetDesigns()[0],
      parts: [],
      createdAt: '',
      meta: { title: 'English test', subjectId: 'englisch', grade: 9 }
    } as unknown as Exam
    expect(kopfTitel(examToWorksheet(e).meta, true)).toBe('English test – Erwartungshorizont')
    expect(kopfTitel({ title: 'Brüche' } as never, true)).toBe('Brüche – Lösungen')
    expect(kopfTitel({ title: 'Brüche' } as never, false)).toBe('Brüche')
  })
})
