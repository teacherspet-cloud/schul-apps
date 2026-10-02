import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnswerView } from '../src/renderer/src/modules/arbeitsblatt/render/Answers'
import { TabelleAnsicht } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/tabelle'
import { WsContext, type WsContextValue, type WsMode } from '../src/renderer/src/modules/arbeitsblatt/render/WsContext'
import { linienAbstandMm } from '../src/renderer/src/modules/arbeitsblatt/didactics/ageBands'
import {
  antwortRaumAnwenden,
  antwortRaumUebersicht,
  antwortTabellenMasse,
  hatFoerderbedarf,
  loesungsForm,
  regelLinien,
  regelSpalten,
  schreibRegel,
  zellenZeilen
} from '../src/renderer/src/modules/arbeitsblatt/didactics/schreibraum'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { reviewSheet } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { REVIEW_SCHEMA } from '../src/renderer/src/modules/arbeitsblatt/generation/schemas'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Answer, Sheet, TableBlock, TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Schreibraum der Antwortflächen (02.10.2026): Befund der Lehrkraft „Antwortfelder viel zu klein".
 * Regeln nach Jahrgang und erwarteter Lösung, Vorschläge der Prüfrunde nur vergrößernd, von Hand
 * Gezogenes geht immer vor.
 */

const ausfuell = (patch: Partial<Answer> = {}): Answer => ({
  ...emptyAnswer('tableFill'),
  headers: ['Begriff', 'Erklärung'],
  rows: [
    ['Fotosynthese', ''],
    ['Zellatmung', '']
  ],
  solutionRows: [
    ['', 'Pflanzen bauen mit Lichtenergie aus Kohlenstoffdioxid und Wasser Traubenzucker auf.'],
    ['', 'Abbau von Traubenzucker unter Sauerstoffverbrauch.']
  ],
  ...patch
})

const aufgabe = (answer: Answer, patch: Partial<TaskBlock> = {}): TaskBlock =>
  ({
    id: `t${Math.random()}`,
    type: 'task',
    instruction: 'Erkläre.',
    operator: 'erklären',
    afb: 'II',
    socialForm: 'EA',
    minutes: 5,
    parts: [],
    answer,
    solution: '',
    ...patch
  } as unknown as TaskBlock)

const blatt = (...blocks: TaskBlock[]): Sheet => ({ id: 's', label: 'Arbeitsblatt', blocks } as unknown as Sheet)

describe('Regeln nach Jahrgang', () => {
  it('Linienabstand folgt der Heftlineatur und wird mit Förderbedarf eine Stufe größer', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10, 11, 13].map((g) => linienAbstandMm(g))).toEqual([15, 15, 12, 10, 9.5, 9.5, 9, 9, 8.5, 8.5])
    expect(linienAbstandMm(4, true)).toBe(12)
    // Mit Förderbedarf nie unter 10 mm
    expect(linienAbstandMm(12, true)).toBe(10)
    expect(linienAbstandMm(1, true)).toBe(15)
  })

  it('Zellhöhe = Linie + Polster: Grundschule ~17 mm, Sek I ~11–12 mm, Sek II ~10 mm', () => {
    expect(schreibRegel(1).zelleMm).toBe(17.5)
    expect(schreibRegel(8).zelleMm).toBe(11.5)
    expect(schreibRegel(12).zelleMm).toBe(10)
    expect(schreibRegel(2).minWortZelleMm).toBe(45)
    expect(schreibRegel(8).minWortZelleMm).toBe(30)
  })

  it('Förderbedarf: Förderschule ja, hessische Förderstufe nein', () => {
    expect(hatFoerderbedarf({ schoolTypeId: 'foerderschule-lernen' })).toBe(true)
    expect(hatFoerderbedarf({ schoolTypeName: 'SBBZ Lernen (Förderschwerpunkt Lernen)' })).toBe(true)
    expect(hatFoerderbedarf({ schoolTypeName: 'Förderstufe' })).toBe(false)
    expect(hatFoerderbedarf({ schoolTypeName: 'Gymnasium' })).toBe(false)
  })
})

describe('Form der erwarteten Lösung', () => {
  it('Wort, Stichpunkte, Sätze', () => {
    expect(loesungsForm('').art).toBe('leer')
    expect(loesungsForm('Chlorophyll').art).toBe('wort')
    expect(loesungsForm('Licht, Wasser, Kohlenstoffdioxid').art).toBe('stichpunkte')
    expect(loesungsForm('- Licht\n- Wasser').punkte.length).toBe(2)
    const s = loesungsForm('Die Pflanze braucht Licht. Ohne Licht stirbt sie ab.')
    expect(s.art).toBe('saetze')
    expect(s.saetze).toBe(2)
  })

  it('ein Satz braucht in einer schmalen Zelle mehr Zeilen, in der Grundschule mehr als in Sek II', () => {
    const satz = 'Pflanzen bauen mit Lichtenergie aus Kohlenstoffdioxid und Wasser Traubenzucker auf.'
    expect(zellenZeilen(satz, 60, schreibRegel(8))).toBeGreaterThan(zellenZeilen(satz, 120, schreibRegel(8)))
    expect(zellenZeilen(satz, 60, schreibRegel(3))).toBeGreaterThan(zellenZeilen(satz, 60, schreibRegel(12)))
    expect(zellenZeilen('Chlorophyll', 60, schreibRegel(8))).toBe(1)
  })

  it('Schreiblinien: Begründungen bekommen mindestens die Linien des Altersbands', () => {
    expect(regelLinien('Ja.', 'begründen', schreibRegel(8))).toBe(5)
    expect(regelLinien('Ja.', 'nennen', schreibRegel(8))).toBeLessThan(5)
    expect(regelLinien('a; b; c', 'nennen', schreibRegel(8))).toBe(4)
  })
})

describe('Maße der Ausfülltabelle', () => {
  it('Regel: Schreibspalte breiter als die Vorgabenspalte, Ausfüllzeilen mehrzeilig hoch', () => {
    const regel = schreibRegel(8)
    const m = antwortTabellenMasse(ausfuell(), regel, 160)
    expect(m.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0)
    expect(m.colWidths[1]).toBeGreaterThan(m.colWidths[0])
    // Erklärung in ganzen Sätzen: mehr als eine Zeile
    expect(m.rowHeightsMm[0]).toBeGreaterThan(regel.zelleMm)
    expect(m.rowHeightsMm.every((h) => h >= regel.zelleMm)).toBe(true)
  })

  it('Zeilen ohne Ausfüllzelle bleiben so hoch wie ihr Inhalt', () => {
    const m = antwortTabellenMasse(
      ausfuell({
        rows: [
          ['a', 'b'],
          ['c', '']
        ],
        solutionRows: [[], ['', 'Wort']]
      }),
      schreibRegel(8)
    )
    expect(m.rowHeightsMm[0]).toBe(0)
    expect(m.rowHeightsMm[1]).toBe(11.5)
  })

  it('von Hand Gezogenes geht vor, der Vorschlag der Prüfrunde hebt nur an', () => {
    const regel = schreibRegel(8)
    const hand = antwortTabellenMasse(ausfuell({ colWidths: [30, 70], rowHeightsMm: [8, 0], headerHeightMm: 12 }), regel)
    expect(hand.colWidths).toEqual([30, 70])
    expect(hand.rowHeightsMm[0]).toBe(8)
    expect(hand.headerHeightMm).toBe(12)
    const ki = antwortTabellenMasse(ausfuell({ cellHeightMm: 60 }), regel)
    expect(ki.rowHeightsMm).toEqual([60, 60])
  })

  it('viele Spalten: keine schmaler als das Minimum', () => {
    const a = ausfuell({ headers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], rows: [['1', '', '', '', '', '', '', '']], solutionRows: [] })
    const w = regelSpalten(a, 160, schreibRegel(3))
    expect(Math.min(...w)).toBeGreaterThanOrEqual(8)
    expect(w.reduce((x, y) => x + y, 0)).toBeCloseTo(100, 0)
  })
})

describe('Vorschläge der Prüfrunde anwenden', () => {
  it('vergrößert Linien, Zellhöhe und setzt Spaltenbreiten – mit Hinweis für die Lehrkraft', () => {
    const s = blatt(aufgabe({ ...emptyAnswer('lines'), count: 2 }), aufgabe(ausfuell()))
    const neu = antwortRaumAnwenden(
      s,
      [
        { blockNumber: 1, part: 0, lines: 6, cellHeightMm: 0, colWidths: [], reason: 'Begründung braucht Platz.' },
        { blockNumber: 2, part: 0, lines: 0, cellHeightMm: 25, colWidths: [25, 75], reason: 'Erklärungen in Sätzen.' }
      ],
      schreibRegel(8)
    )
    const a1 = (neu.blocks[0] as TaskBlock).answer
    const a2 = (neu.blocks[1] as TaskBlock).answer
    expect(a1.count).toBe(6)
    expect(a2.cellHeightMm).toBe(25)
    expect(a2.colWidths).toEqual([25, 75])
    expect(neu.blocks[0].warnings?.[0]).toMatch(/^\[Schreibraum\].*Begründung/)
    // Das Original bleibt unverändert
    expect((s.blocks[0] as TaskBlock).answer.count).toBe(2)
  })

  it('verkleinert nie, übergeht von Hand gesetzte Spalten und unpassende Vorschläge', () => {
    const s = blatt(aufgabe({ ...emptyAnswer('lines'), count: 8 }), aufgabe(ausfuell({ colWidths: [50, 50], cellHeightMm: 30 })))
    const neu = antwortRaumAnwenden(
      s,
      [
        { blockNumber: 1, part: 0, lines: 3, cellHeightMm: 0, colWidths: [], reason: '' },
        { blockNumber: 2, part: 0, lines: 0, cellHeightMm: 20, colWidths: [20, 80], reason: '' },
        { blockNumber: 2, part: 0, lines: 0, cellHeightMm: 0, colWidths: [10, 20, 70], reason: '' },
        { blockNumber: 9, part: 0, lines: 9, cellHeightMm: 0, colWidths: [], reason: '' },
        { blockNumber: 1, part: 3, lines: 9, cellHeightMm: 0, colWidths: [], reason: '' }
      ],
      schreibRegel(8)
    )
    expect(neu).toBe(s)
  })

  it('Teilaufgaben werden über part angesprochen', () => {
    const t = aufgabe(emptyAnswer('none'), {
      parts: [
        { id: 'a', instruction: 'a', answer: { ...emptyAnswer('lines'), count: 1 }, solution: '' },
        { id: 'b', instruction: 'b', answer: { ...emptyAnswer('lines'), count: 1 }, solution: '' }
      ]
    } as Partial<TaskBlock>)
    const neu = antwortRaumAnwenden(blatt(t), [{ blockNumber: 1, part: 2, lines: 4, cellHeightMm: 0, colWidths: [], reason: 'x' }], schreibRegel(8))
    const parts = (neu.blocks[0] as TaskBlock).parts
    expect(parts.map((p) => p.answer.count)).toEqual([1, 4])
  })

  it('Regel: zu wenige Schreiblinien für eine Begründung werden angehoben, höchstens verdoppelt', () => {
    const s = blatt(aufgabe({ ...emptyAnswer('lines'), count: 2 }, { operator: 'begründen', solution: 'Weil es so ist.' }))
    const neu = antwortRaumAnwenden(s, [], schreibRegel(8))
    expect((neu.blocks[0] as TaskBlock).answer.count).toBe(4)
    // Ohne Vorschläge der KI auch kein Hinweis
    expect(neu.blocks[0].warnings ?? []).toEqual([])
  })

  it('die Übersicht nennt die aktuellen Maße', () => {
    const text = antwortRaumUebersicht(blatt(aufgabe({ ...emptyAnswer('lines'), count: 2 }), aufgabe(ausfuell())), schreibRegel(8))
    expect(text).toMatch(/\(1\) Schreiblinien: 2 × 9 mm/)
    expect(text).toMatch(/\(2\) Ausfülltabelle, 2 Spalten/)
  })
})

describe('Prüfrunde liefert Schreibraum im selben Auftrag', () => {
  it('Schema hat answerSpace; reviewSheet gibt die Vorschläge zurück und fragt nach dem Schreibraum', async () => {
    expect(Object.keys((REVIEW_SCHEMA as { properties: object }).properties)).toEqual(['problems', 'answerSpace'])
    const prompts: string[] = []
    const ai = (async (req: { user: string }) => {
      prompts.push(req.user)
      return { problems: [], answerSpace: [{ blockNumber: 1, part: 0, lines: 5, cellHeightMm: 0, colWidths: [], reason: 'zu knapp' }] }
    }) as never
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'biologie', subjectLabel: 'Biologie', topic: 'Fotosynthese', grade: 8 }
    const profil = buildLearnerProfile(meta)
    const res = await reviewSheet({ meta }, blatt(aufgabe({ ...emptyAnswer('lines'), count: 2 })), profil, ai)
    expect(res.answerSpace).toHaveLength(1)
    expect(prompts[0]).toMatch(/SCHREIBRAUM/)
    expect(prompts[0]).toMatch(/Linienabstand 9 mm/)
    // Ältere Antworten ohne das Feld
    const alt = await reviewSheet({ meta }, blatt(), profil, (async () => ({ problems: [] })) as never)
    expect(alt.answerSpace).toEqual([])
  })
})

describe('Darstellung mit Griffen', () => {
  const ctx = (mode: WsMode, jahrgang = 8): WsContextValue => ({
    mode,
    taskNumbers: new Map(),
    showStars: false,
    taskStyle: { numberStyle: 'circle', showSocialFormIcons: false },
    contentWidthMm: 170,
    update: () => undefined,
    lerngruppeText: { fach: 'Biologie', fachId: 'biologie', jahrgang, schulform: 'Gymnasium', thema: 'x', anrede: 'du', aufgabenSprache: 'de' } as never
  })
  const zeige = (el: React.ReactElement, c: WsContextValue): string => renderToStaticMarkup(createElement(WsContext.Provider, { value: c }, el))

  it('Ausfülltabelle: Spaltenbreiten und Zeilenhöhen nach Regel, Griffe nur im Editor', () => {
    const a = ausfuell()
    const edit = zeige(createElement(AnswerView, { answer: a, onChange: () => undefined }), ctx('edit'))
    expect(edit).toMatch(/<col style="width:\d/)
    expect(edit).toMatch(/<tr style="height:\d+(\.\d)?mm"/)
    expect(edit).toContain('ws-spalten-griff')
    expect(edit).toContain('ws-zeilen-griff')
    expect(zeige(createElement(AnswerView, { answer: a, onChange: () => undefined }), ctx('keyEdit'))).toContain('ws-zeilen-griff')
    const druck = zeige(createElement(AnswerView, { answer: a }), ctx('print'))
    expect(druck).not.toContain('ws-zeilen-griff')
    // Grundschule: höhere Zeilen als Oberstufe
    const hoehe = (html: string): number => Number(html.match(/<tr style="height:([\d.]+)mm"/)?.[1])
    expect(hoehe(zeige(createElement(AnswerView, { answer: a }), ctx('print', 3)))).toBeGreaterThan(hoehe(druck))
  })

  it('Tabelle als Baustein: Spaltengriffe auch in Zellen ohne Kopfzeile, auch in der Lösungsansicht', () => {
    const t = { id: 't', type: 'table', title: '', headers: [], rows: [['a', 'b']] } as unknown as TableBlock
    const html = zeige(createElement(TabelleAnsicht, { block: t }), ctx('keyEdit'))
    expect(html.match(/ws-spalten-griff/g)?.length).toBe(2)
    expect(html).toContain('ws-table-ziehbar')
  })
})
