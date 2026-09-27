import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { TableBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import {
  hatMasse,
  spaltenBreiten,
  spalteVerschieben,
  tabellenBreite,
  zeilenHoehe,
  zeilenHoehen
} from '../src/renderer/src/modules/arbeitsblatt/render/tabelleMasse'

/*
 * Tabellenmaße von Hand (27.09.2026): Spalten breiter/schmaler, Zeilen höher/niedriger ziehen;
 * Prozent und Millimeter, damit Bildschirm, Druck und Word dasselbe zeigen.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const tabelle = (patch: Partial<TableBlock> = {}): TableBlock =>
  ({
    id: 't',
    type: 'table',
    title: 'Übersicht',
    headers: ['A', 'B', 'C'],
    rows: [
      ['1', '2', '3'],
      ['4', '5', '6']
    ],
    ...patch
  }) as TableBlock

describe('Spaltenbreiten und Zeilenhöhen', () => {
  it('ohne Vorgabe sind alle Spalten gleich breit; Vorgaben werden auf 100 % gebracht', () => {
    expect(spaltenBreiten(tabelle())).toEqual([100 / 3, 100 / 3, 100 / 3])
    expect(spaltenBreiten(tabelle({ colWidths: [2, 1, 1] }))).toEqual([50, 25, 25])
    // Passt die Liste nicht zur Spaltenzahl, gilt wieder die Gleichverteilung
    expect(spaltenBreiten(tabelle({ colWidths: [50, 50] }))).toEqual([100 / 3, 100 / 3, 100 / 3])
  })

  it('eine Spalte breiter ziehen nimmt es der Nachbarin – keine wird schmaler als das Minimum', () => {
    expect(spalteVerschieben([40, 30, 30], 0, 10)).toEqual([50, 20, 30])
    expect(spalteVerschieben([40, 30, 30], 0, 40)).toEqual([62, 8, 30])
    expect(spalteVerschieben([40, 30, 30], 1, -50)).toEqual([40, 8, 52])
    expect(spalteVerschieben([40, 30, 30], 2, 10)).toEqual([40, 30, 30])
    expect(spalteVerschieben([40, 30, 30], 0, 10).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('Zeilenhöhen und Tabellenbreite sind begrenzt', () => {
    expect(zeilenHoehe(3)).toBe(0)
    expect(zeilenHoehe(12.3)).toBe(12.5)
    expect(zeilenHoehe(500)).toBe(200)
    expect(tabellenBreite(10)).toBe(30)
    expect(tabellenBreite(140)).toBe(100)
    expect(zeilenHoehen(tabelle({ rowHeightsMm: [20] }))).toEqual([20, 0])
    expect(hatMasse(tabelle())).toBe(false)
    expect(hatMasse(tabelle({ rowHeightsMm: [0, 0] }))).toBe(false)
    expect(hatMasse(tabelle({ widthPercent: 80 }))).toBe(true)
  })

  it('Word übernimmt Spaltenbreiten, Zeilenhöhen und Tabellenbreite', async () => {
    const ws = {
      version: 1,
      meta: { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'mathematik', subjectLabel: 'Mathematik', topic: 'Potenzen', grade: 9 },
      sheets: [
        { id: 's1', label: 'Arbeitsblatt', blocks: [tabelle({ colWidths: [60, 20, 20], rowHeightsMm: [20, 0], headerHeightMm: 12, widthPercent: 80 })] }
      ],
      sources: [],
      design: presetDesigns()[0],
      createdAt: ''
    } as unknown as Worksheet
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }
    const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: ['s1'], includeKey: false }, deps))
    const xml = await zip.file('word/document.xml')!.async('string')
    const breiten = [...xml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => Number(m[1]))
    expect(breiten.length).toBe(3)
    expect(breiten[0] / breiten[1]).toBeCloseTo(3, 0)
    // 20 mm ≈ 1134 Twips, 12 mm ≈ 680 Twips
    expect(xml).toMatch(/<w:trHeight w:val="113\d" w:hRule="atLeast"/)
    expect(xml).toMatch(/<w:trHeight w:val="68\d" w:hRule="atLeast"/)
    const tblW = Number(xml.match(/<w:tblW [^>]*w:w="(\d+)"/)?.[1])
    const summe = breiten.reduce((a, b) => a + b, 0)
    expect(Math.abs(tblW - summe)).toBeLessThan(10)
  })
})
