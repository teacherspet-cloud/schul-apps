import { describe, expect, it } from 'vitest'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { presetDesigns } from '../src/shared/design'
import type { TextBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { quellenAnhang } from '../src/renderer/src/modules/arbeitsblatt/render/quellenAnhang'
import { buildWorksheetHtml } from '../src/renderer/src/modules/arbeitsblatt/render/printHtml'

/* Quellenanhang (05.10.2026): letzte Seite „Quellen und Urheberrecht" im eduki-Stil */
const blatt = (quellenanhang: boolean): Worksheet => {
  const quelle = {
    ...(newBlock('text') as TextBlock),
    id: 'q',
    title: 'Tagebuch aus dem Stellungskrieg',
    sourceHeader: { author: 'Louis Barthas', textType: 'Tagebuch', date: '1916', found: 'Barthas, Les carnets de guerre, 1978, S. 210' }
  }
  const eigen = { ...(newBlock('text') as TextBlock), id: 'e', title: 'Verfassertext', source: '' }
  return {
    version: 1,
    meta: { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), title: 'Verdun', quellenanhang },
    design: presetDesigns()[0],
    outline: null,
    sheets: [{ id: 's', label: '', stars: 1, blocks: [quelle, eigen] }],
    sources: [],
    createdAt: new Date().toISOString()
  } as unknown as Worksheet
}

describe('Quellenanhang', () => {
  it('Abschnitte: Texte mit Materialkopf bzw. „Eigene Darstellung", Schrift, KI, Nutzungshinweis ohne Personennamen', () => {
    const ws = blatt(true)
    const a = quellenAnhang(ws, ws.sheets[0], 'Gymnasium Musterstadt', new Date('2026-10-05'))
    const titel = a.map((x) => x.titel)
    expect(titel).toEqual(expect.arrayContaining(['Texte', 'Schriftart', 'Künstliche Intelligenz', 'Nutzungshinweis']))
    const texte = a.find((x) => x.titel === 'Texte')!.zeilen
    expect(texte[0].label).toBe('M1 – Tagebuch aus dem Stellungskrieg')
    expect(texte[0].text).toContain('Louis Barthas, Tagebuch, 1916')
    expect(texte[0].text).toContain('Les carnets de guerre')
    expect(texte[1].text).toBe('Eigene Darstellung')
    expect(a.find((x) => x.titel === 'Nutzungshinweis')!.zeilen[0].label).toBe('© 2026 Gymnasium Musterstadt')
  })
  it('Druck: Seite nur mit der Option', () => {
    const mit = buildWorksheetHtml(blatt(true), new Map(), { sheetIds: ['s'], includeKey: false }, null, 'Schule')
    const ohne = buildWorksheetHtml(blatt(false), new Map(), { sheetIds: ['s'], includeKey: false }, null, 'Schule')
    expect(mit).toContain('Quellen und Urheberrecht')
    expect(ohne).not.toContain('Quellen und Urheberrecht')
  })
})
