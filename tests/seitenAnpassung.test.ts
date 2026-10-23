import { describe, expect, it } from 'vitest'
import {
  aenderungen,
  bilderVerkleinern,
  bildMindestbreite,
  designMit,
  mindestSchrift,
  stufen
} from '../src/renderer/src/modules/arbeitsblatt/didactics/seitenAnpassung'
import type { DesignTemplate } from '../src/shared/design'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/* „Auf weniger Seiten bringen" (23.10.2026): Reihenfolge, Grenzen, Bilder, gleiche Regeln für alle Fassungen */
const design = (page: Partial<DesignTemplate['page']>): DesignTemplate =>
  ({
    page: { marginMm: 20, fontFamily: 'Arial', baseFontPt: 11.5, autoFontSize: false, accentColor: '#000', holePunchMargin: false, lineHeight: 1.35, ...page }
  } as DesignTemplate)
const meta = (x: Partial<WorksheetMeta>): WorksheetMeta => ({ grade: 8, languageMode: 'standard', schoolTypeId: 'gymnasium', ...x } as WorksheetMeta)

describe('Stellschrauben', () => {
  it('erst Zeilenabstand, dann Rand, dann Bilder, dann Schrift in halben Punkten bis 10 pt', () => {
    const l = stufen({ meta: meta({}), design: design({}) }, true)
    expect(l[0]).toEqual({ lineHeight: 1.25, marginMm: 20, fontPt: 11.5, bilder: false })
    expect(l[1]).toEqual({ lineHeight: 1.25, marginMm: 15, fontPt: 11.5, bilder: false })
    expect(l[2].bilder).toBe(true)
    expect(l.slice(3).map((s) => s.fontPt)).toEqual([11, 10.5, 10])
  })
  it('Klasse 5/6, einfache Sprache und Förderschule: nicht unter 12 pt', () => {
    expect(mindestSchrift(meta({ grade: 6 }))).toBe(12)
    expect(mindestSchrift(meta({ languageMode: 'simple' } as Partial<WorksheetMeta>))).toBe(12)
    expect(mindestSchrift(meta({ schoolTypeId: 'foerderschule-lernen' }))).toBe(12)
    const l = stufen({ meta: meta({ grade: 5 }), design: design({ baseFontPt: 12 }) }, false)
    expect(l.every((s) => s.fontPt >= 12 && s.lineHeight >= 1.3)).toBe(true)
  })
  it('nichts wird größer, schon kleine Werte bleiben', () => {
    const l = stufen({ meta: meta({}), design: design({ baseFontPt: 9, lineHeight: 1.1, marginMm: 10 }) }, false)
    expect(l).toEqual([])
  })
  it('Design mit fester Schrift; Änderungen lesbar', () => {
    const d = designMit(design({ autoFontSize: true }), { lineHeight: 1.25, marginMm: 15, fontPt: 11, bilder: false })
    expect(d.page).toMatchObject({ autoFontSize: false, baseFontPt: 11, lineHeight: 1.25, marginMm: 15 })
    expect(aenderungen({ fontPt: 11.5, lineHeight: 1.35, marginMm: 20 }, { lineHeight: 1.25, marginMm: 15, fontPt: 11, bilder: true }, 2)).toEqual([
      'Schrift 11,5 → 11 pt',
      'Zeilenabstand 1,35 → 1,25',
      'Seitenrand 20 → 15 mm',
      '2 Bilder etwas kleiner (nicht unter die Mindestgröße)'
    ])
  })
})

describe('Bilder', () => {
  it('ordnende und seitliche Bilder bleiben, andere nie unter ihre Mindestbreite', () => {
    expect(bildMindestbreite({ fn: 'organisation', widthPercent: 100 })).toBeNull()
    expect(bildMindestbreite({ side: 'left', widthPercent: 45 })).toBeNull()
    expect(bildMindestbreite({ role: 'motivation', widthPercent: 35 })).toBe(25)
  })
  it('gilt in allen Fassungen gleich (ganzes Dokument)', () => {
    const doc = {
      sheets: [
        {
          blocks: [
            { type: 'image', fn: 'repraesentation', widthPercent: 80 },
            { type: 'image', fn: 'organisation', widthPercent: 100 }
          ]
        },
        { blocks: [{ type: 'image', fn: 'repraesentation', widthPercent: 80 }] }
      ]
    }
    const r = bilderVerkleinern(doc)
    expect(r.anzahl).toBe(2)
    expect(r.doc.sheets[0].blocks.map((b) => b.widthPercent)).toEqual([60, 100])
    expect(r.doc.sheets[1].blocks[0].widthPercent).toBe(60)
    expect(doc.sheets[0].blocks[0].widthPercent).toBe(80)
  })
})
