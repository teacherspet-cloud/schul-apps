import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import type { DiktatBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { BlockInhalt } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/blockview'
import { WsContext, type WsContextValue } from '../src/renderer/src/modules/arbeitsblatt/render/WsContext'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { niederschrift } from '../src/renderer/src/modules/arbeitsblatt/didactics/diktat'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }
const ctx = (mode: WsContextValue['mode']): WsContextValue => ({
  mode,
  taskNumbers: new Map(),
  materialNumbers: new Map(),
  showStars: false,
  taskStyle: { numberStyle: 'circle', showSocialFormIcons: false }
})
const diktat = (form: DiktatBlock['form']): DiktatBlock => ({
  id: 'd1',
  type: 'diktat',
  title: 'Im Zoo',
  form,
  text: 'Im Zoo / gibt es viele Tiere. / Der große Löwe / schläft im Gras.',
  phaenomene: ['s-Laute'],
  zielwoerter: ['große'],
  kommasDiktiert: false,
  zaehlart: 'isb',
  sechsAbProzent: 10
})
const zeige = (b: DiktatBlock, mode: WsContextValue['mode']): string =>
  renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx(mode) }, createElement(BlockInhalt, { block: b })))

describe('Diktat auf Blatt und in Word (26.11.2026)', () => {
  it('klassisch: Schülerblatt ohne Text, Lösungsteil mit Lehrkraftblatt', () => {
    expect(zeige(diktat('klassisch'), 'print')).toBe('')
    const l = zeige(diktat('klassisch'), 'key')
    expect(l).toContain('Ablauf beim Vorlesen')
    expect(l).toContain('Notenvorschlag')
    expect(l).toMatch(/<strong[^>]*>große<\/strong>|<b>große<\/b>/)
  })
  it('Laufdiktat: Streifen auf dem Schülerblatt', () => {
    const s = zeige(diktat('laufdiktat'), 'print')
    expect(s).toContain('Laufzettel')
    expect(s.match(/ws-diktat-streifen-eins/g)).toHaveLength(2)
  })
  it('Word: Lehrkraftblatt im Lösungsteil, Schülerblatt ohne Diktattext', async () => {
    const basis = JSON.parse(readFileSync('tests/fixtures/beispiel.arbeitsblatt', 'utf8')).worksheet as Worksheet
    const d = diktat('klassisch')
    const ws: Worksheet = { ...basis, sheets: [{ ...basis.sheets[0], blocks: [d, niederschrift(d)] }] }
    const xml = async (includeKey: boolean): Promise<string> =>
      (await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: [ws.sheets[0].id], includeKey }, deps))).file('word/document.xml')!.async('string')
    expect(await xml(false)).not.toContain('Löwe')
    expect(await xml(true)).toContain('Ablauf beim Vorlesen')
  })
})
