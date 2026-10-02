import JSZip from 'jszip'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { linieMmFuerMeta } from '../src/renderer/src/modules/arbeitsblatt/didactics/schreibraum'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Answer, SelfCheckBlock, TaskBlock, Worksheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { AnswerView } from '../src/renderer/src/modules/arbeitsblatt/render/Answers'
import { BlockInhalt } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/blockview'
import { PageFrame } from '../src/renderer/src/modules/arbeitsblatt/render/PageFrame'
import { contextFor, pageInfoFor } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { eigeneBreiten, zugUebernehmen } from '../src/renderer/src/modules/arbeitsblatt/render/tabelleMasse'
import { WsContext, type WsContextValue, type WsMode } from '../src/renderer/src/modules/arbeitsblatt/render/WsContext'

/*
 * 02.10.2026 – offene Punkte der Lehrkraft:
 * 1. Schreiblinien nach Jahrgang (--ws-linie, Auffüllung, Schreibraum, Word) aus EINER Regel.
 * 2. Richtig/Falsch, Zuordnung, Fragenreihe und Selbsteinschätzung von Hand größer ziehen.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'biologie',
  subjectLabel: 'Biologie',
  topic: 'Zelle',
  grade: 8,
  ...patch
})

const blatt = (blocks: WsBlock[], m: Partial<WorksheetMeta> = {}): Worksheet =>
  ({
    version: 1,
    meta: meta(m),
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks }],
    sources: [],
    design: presetDesigns()[0],
    createdAt: ''
  } as unknown as Worksheet)

const ctx = (mode: WsMode, patch: Partial<WsContextValue> = {}): WsContextValue => ({
  mode,
  taskNumbers: new Map(),
  showStars: false,
  taskStyle: { numberStyle: 'circle', showSocialFormIcons: false },
  contentWidthMm: 170,
  update: () => undefined,
  ...patch
})
const zeige = (el: React.ReactElement, c: WsContextValue): string => renderToStaticMarkup(createElement(WsContext.Provider, { value: c }, el))

const docxXml = async (ws: Worksheet, key = false): Promise<string> => {
  const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }
  const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: ['s1'], includeKey: key }, deps))
  return zip.file('word/document.xml')!.async('string')
}

const aufgabe = (answer: Answer, patch: Partial<TaskBlock> = {}): TaskBlock => ({ ...(newBlock('task') as TaskBlock), id: 'a1', answer, ...patch })

describe('Schreiblinien nach Jahrgang', () => {
  it('eine Regel für alle Wege: Grundschule groß, Sek I 9 mm, Sek II 8,5 mm, Förderbedarf und Leichte Sprache größer', () => {
    expect(linieMmFuerMeta(meta({ grade: 2 }))).toBe(15)
    expect(linieMmFuerMeta(meta({ grade: 8 }))).toBe(9)
    expect(linieMmFuerMeta(meta({ grade: 12 }))).toBe(8.5)
    expect(linieMmFuerMeta(meta({ grade: 12, schoolTypeId: 'foerderschule-lernen' }))).toBe(10)
    expect(linieMmFuerMeta(meta({ grade: 8, languageMode: 'simple' }))).toBe(10)
    expect(linieMmFuerMeta(undefined)).toBe(8.5)
  })

  it('die Seite trägt --ws-linie, der Kontext dieselbe Regel', () => {
    const ws = blatt([], { grade: 3 })
    const html = renderToStaticMarkup(createElement(PageFrame, { info: pageInfoFor(ws, ws.sheets[0], null, '', false), page: 1, pages: 1 }))
    expect(html).toContain('--ws-linie:12mm')
    expect(contextFor(ws, ws.sheets[0], 'print').schreibRegel?.linieMm).toBe(12)
  })

  it('linierter Schreibraum: Linien je Einheit nach dem Linienabstand der Lerngruppe', () => {
    const raum = { ...(newBlock('workspace') as WsBlock), kind: 'lines', heightMm: 45, label: '' } as WsBlock
    const ws = blatt([raum], { grade: 1 })
    const html = zeige(createElement(BlockInhalt, { block: raum }), contextFor(ws, ws.sheets[0], 'print'))
    // 45 mm bei 15-mm-Linien = drei Linien
    expect(html.match(/data-unit/g)?.length).toBe(3)
    expect(html).toContain('height:15mm')
  })

  it('Word: Schreiblinien genau so hoch wie im Blatt', async () => {
    const xml = await docxXml(blatt([aufgabe({ ...emptyAnswer('lines'), count: 3 })], { grade: 2 }))
    // 15 mm = 851 Twips
    expect(xml).toMatch(/w:line="851" w:lineRule="exact"/)
  })
})

describe('Maße von Hand übernehmen', () => {
  it('eigene Breiten nur bei passender Spaltenzahl, ein Zug je Geste', () => {
    expect(eigeneBreiten({ colWidths: [2, 1, 1] }, 3)).toEqual([50, 25, 25])
    expect(eigeneBreiten({ colWidths: [50, 50] }, 3)).toBeUndefined()
    expect(eigeneBreiten(undefined, 3)).toBeUndefined()
    const d: { colWidths?: number[]; rowHeightsMm?: number[]; headerHeightMm?: number } = {}
    zugUebernehmen(d, { art: 'zeile', index: 1, hoeheMm: 20 }, 3)
    expect(d.rowHeightsMm).toEqual([0, 20, 0])
    zugUebernehmen(d, { art: 'zeile', index: 1, hoeheMm: 0 }, 3)
    expect(d.rowHeightsMm).toBeUndefined()
    zugUebernehmen(d, { art: 'kopf', index: 0, hoeheMm: 12 }, 3)
    zugUebernehmen(d, { art: 'spalte', index: 0, colWidths: [60, 20, 20] }, 3)
    expect(d).toEqual({ headerHeightMm: 12, colWidths: [60, 20, 20] })
  })
})

describe('Richtig/Falsch, Zuordnung, Fragenreihe, Selbsteinschätzung ziehbar', () => {
  const rf = (patch: Partial<Answer> = {}): Answer => ({
    ...emptyAnswer('trueFalse'),
    statements: [
      { text: 'Zellen haben einen Kern.', isTrue: false },
      { text: 'Pflanzenzellen haben eine Zellwand.', isTrue: true }
    ],
    ...patch
  })
  const zu = (patch: Partial<Answer> = {}): Answer => ({
    ...emptyAnswer('matching'),
    left: ['Kern', 'Wand'],
    right: ['Steuerung', 'Stütze'],
    pairs: [0, 1],
    ...patch
  })

  it('Griffe im Editor und in der Lösungsansicht, nicht im Druck; ohne Maße wie bisher', () => {
    for (const a of [rf(), zu()]) {
      expect(zeige(createElement(AnswerView, { answer: a, onChange: () => undefined }), ctx('edit'))).toContain('ws-zeilen-griff')
      expect(zeige(createElement(AnswerView, { answer: a, onChange: () => undefined }), ctx('keyEdit'))).toContain('ws-spalten-griff')
      const druck = zeige(createElement(AnswerView, { answer: a }), ctx('print'))
      expect(druck).not.toContain('ws-zeilen-griff')
      expect(druck).not.toContain('table-layout')
    }
  })

  it('gezogene Maße stehen in Spalten und Zeilen', () => {
    const html = zeige(createElement(AnswerView, { answer: rf({ colWidths: [70, 15, 15], rowHeightsMm: [0, 20], headerHeightMm: 10 }) }), ctx('print'))
    expect(html).toContain('table-layout:fixed')
    expect(html).toContain('<col style="width:70%"/>')
    expect(html).toContain('height:20mm')
    expect(html).toContain('height:10mm')
    const z = zeige(createElement(AnswerView, { answer: zu({ colWidths: [10, 50, 40], rowHeightsMm: [15] }) }), ctx('print'))
    expect(z).toContain('<col style="width:50%"/>')
    expect(z).toContain('height:15mm')
  })

  it('Fragenreihe: Maße an der Aufgabe (mcGitter)', () => {
    const mc = (i: number) => ({
      id: `p${i}`,
      instruction: `Frage ${i}`,
      answer: { ...emptyAnswer('multipleChoice'), options: ['ja', 'nein'], correct: [0] },
      solution: ''
    })
    const t = aufgabe(emptyAnswer('none'), { parts: [mc(1), mc(2), mc(3), mc(4)], mcGitter: { colWidths: [30, 70], rowHeightsMm: [25] } })
    const edit = zeige(createElement(BlockInhalt, { block: t }), ctx('edit'))
    expect(edit).toContain('ws-mc-grid ws-table-ziehbar')
    expect(edit).toContain('<col style="width:30%"/>')
    expect(edit).toContain('height:25mm')
    expect(edit).toContain('ws-spalten-griff')
    expect(zeige(createElement(BlockInhalt, { block: t }), ctx('print'))).not.toContain('griff')
  })

  it('Selbsteinschätzung: Maße am Baustein', () => {
    const sc = { ...(newBlock('selfCheck') as SelfCheckBlock), statements: ['Ich kann …', 'Ich weiß …'], colWidths: [55, 15, 15, 15], rowHeightsMm: [18] }
    const edit = zeige(createElement(BlockInhalt, { block: sc }), ctx('edit'))
    expect(edit).toContain('ws-table-ziehbar')
    expect(edit).toContain('<col style="width:55%"/>')
    expect(edit).toContain('height:18mm')
    expect(edit.match(/ws-spalten-griff/g)?.length).toBe(9)
  })

  it('Word übernimmt die Maße', async () => {
    const sc = { ...(newBlock('selfCheck') as SelfCheckBlock), id: 'sc', statements: ['Ich kann …'], colWidths: [70, 10, 10, 10], rowHeightsMm: [20] }
    const xml = await docxXml(blatt([aufgabe(rf({ colWidths: [60, 20, 20], rowHeightsMm: [0, 30] })), sc]))
    const tabellen = xml.split('<w:tbl>').slice(1)
    const spalten = (t: string): number[] => [...t.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => Number(m[1]))
    const tf = spalten(tabellen[0])
    expect(tf[0] / tf[1]).toBeCloseTo(3, 0)
    // 30 mm ≈ 1701 Twips, 20 mm ≈ 1134 Twips
    expect(tabellen[0]).toMatch(/<w:trHeight w:val="170\d" w:hRule="atLeast"/)
    const s = spalten(tabellen[1])
    expect(s[0] / s[1]).toBeCloseTo(7, 0)
    expect(tabellen[1]).toMatch(/<w:trHeight w:val="113\d" w:hRule="atLeast"/)
  })
})
