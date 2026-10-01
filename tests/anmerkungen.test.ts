import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import type { TextBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { BlockInhalt } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/blockview'
import { WsContext, type WsContextValue } from '../src/renderer/src/modules/arbeitsblatt/render/WsContext'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { anmerkungenVon } from '../src/renderer/src/modules/arbeitsblatt/didactics/anmerkungen'

/*
 * Fußnoten und Worthilfen mit HOCHGESTELLTEN Ziffern (01.10.2026) – Bildschirm/Druck (dieselbe
 * Darstellung) und Word. Auch alte Blätter ohne Marken bekommen die Ziffern, ohne Klick.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }

const ctx = (patch: Partial<WsContextValue> = {}): WsContextValue => ({
  mode: 'print',
  taskNumbers: new Map(),
  materialNumbers: new Map([['m1', 'M1']]),
  showStars: false,
  taskStyle: { numberStyle: 'circle', showSocialFormIcons: false },
  ...patch
})

const text = (patch: Partial<TextBlock> = {}): TextBlock => ({
  ...(newBlock('text') as TextBlock),
  id: 'm1',
  title: 'Shakespeare today',
  body: 'We must preserve[^f1] the old plays.\n\nThey are more relevant than ever, and the theatre is full.',
  lineNumbers: true,
  fussnoten: [{ id: 'f1', wort: 'to preserve', text: 'to keep sth. as it is' }],
  glossary: [{ term: 'theatre', explanation: 'Theater' }],
  ...patch
})

/** Gesetztes HTML ohne die Hüll-<span> des Textformats – so lässt sich „Wort<sup>1</sup>" prüfen */
const zeige = (b: TextBlock, patch: Partial<WsContextValue> = {}, placed?: Parameters<typeof BlockInhalt>[0]['placed']): string =>
  renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx(patch) }, createElement(BlockInhalt, { block: b, placed }))).replace(
    /<\/?span(?: class="(?:rt rt-inline |)")?>/g,
    ''
  )

/** Ein Arbeitsblatt aus der Fixtur (gespeichert wie aus der Bibliothek) */
const ausDatei = (name: string): Worksheet => JSON.parse(readFileSync(`tests/fixtures/${name}`, 'utf8')).worksheet as Worksheet

async function wordXml(ws: Worksheet): Promise<string> {
  const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: [ws.sheets[0].id], includeKey: false }, deps))
  return zip.file('word/document.xml')!.async('string')
}

/** Text eines Word-Laufs, der hochgestellt ist */
const hochgestellteLaeufe = (xml: string): string[] =>
  [...xml.matchAll(/<w:r>(?:(?!<\/w:r>).)*?<w:vertAlign w:val="superscript"\/>(?:(?!<\/w:r>).)*?<w:t[^>]*>([^<]*)<\/w:t>/gs)].map((m) => m[1])

describe('Bildschirm und Druck: hochgestellte Ziffern im Text und vor der Anmerkung', () => {
  it('Fußnote und Worthilfe: <sup> im Text, dieselbe Ziffer vor der Anmerkung', () => {
    const html = zeige(text())
    expect(html).toContain('preserve<sup>1</sup>')
    expect(html).toContain('theatre<sup>2</sup>')
    expect(html).toMatch(/<sup class="ws-anmerkung-nr">1<\/sup> <b>to preserve<\/b>: to keep sth\. as it is/)
    expect(html).toMatch(/<sup class="ws-anmerkung-nr">2<\/sup> <b>theatre<\/b>: Theater/)
    // keine Marke im Rohformat sichtbar
    expect(html).not.toContain('[^f1]')
  })

  it('geteilter Text: die Ziffern bleiben gleich, die Anmerkungen stehen am Ende des Folgestücks', () => {
    const b = text()
    const erstes = zeige(b, {}, { id: 'm1', from: 0, to: 1 })
    const zweites = zeige(b, {}, { id: 'm1', from: 1, to: 3, continued: true })
    expect(erstes).toContain('preserve<sup>1</sup>')
    expect(erstes).not.toContain('ws-anmerkung-nr')
    expect(zweites).toContain('theatre<sup>2</sup>')
    expect(zweites).toContain('<sup class="ws-anmerkung-nr">1</sup>')
    expect(zweites).toContain('<sup class="ws-anmerkung-nr">2</sup>')
  })

  it('zählt nach einer Änderung neu', () => {
    const b = text({ body: 'They are more relevant than ever, and the theatre is full. We must preserve[^f1] the old plays.' })
    const html = zeige(b)
    expect(html).toContain('theatre<sup>1</sup>')
    expect(html).toContain('preserve<sup>2</sup>')
  })

  it('Lücken aus dem Menü: Linie auf dem Blatt, Lösung im Lösungsteil', () => {
    const b = text({ body: 'We must [[preserve]] the old plays.', fussnoten: [], glossary: [] })
    expect(zeige(b)).toContain('class="ws-gap "')
    expect(zeige(b, { mode: 'key' })).toContain('ws-gap ws-gap-key">preserve')
  })
})

describe('Alte Blätter (Bibliothek/Datei) ohne Marken – ohne Klick umgestellt', () => {
  it('Worthilfen des Beispielblatts bekommen ihre Ziffer am Wort', () => {
    const ws = ausDatei('beispiel.arbeitsblatt')
    const b = ws.sheets[0].blocks.find((x) => x.type === 'text') as TextBlock
    expect(b.body).not.toMatch(/\^\{|\[\^/)
    const html = zeige(b, { materialNumbers: new Map([[b.id, 'M1']]) })
    expect(html).toContain('Spaltöffnungen<sup>1</sup>')
    expect(html).toContain('<sup class="ws-anmerkung-nr">1</sup> <b>Spaltöffnung</b>')
  })

  it('alte Kennzeichnungen „(1)", „[2]", „¹", „*" werden zu hochgestellten Ziffern – idempotent', () => {
    const ws = ausDatei('alt-annotationen.arbeitsblatt')
    const b = ws.sheets[0].blocks.find((x) => x.id === 'b2alt') as TextBlock
    const html = zeige(b)
    expect(html).toContain('preserve<sup>1</sup> the old trees')
    expect(html).toContain('leaves<sup>2</sup> turn')
    expect(html).toContain('soil<sup>3</sup> needs')
    expect(html).toContain('roots<sup>4</sup> grow')
    expect(html).not.toMatch(/\(1\)|\[2\]|¹|roots\*/)
    expect(html).toContain('<sup class="ws-anmerkung-nr">4</sup> <b>roots</b>: Wurzeln')
    // Gespeicherte Daten bleiben unverändert (keine stille Umschreibung); zweimal gerechnet = gleiches Ergebnis
    expect(b.body).toContain('preserve (1)')
    expect(anmerkungenVon(b).anzeige).toBe(anmerkungenVon(b).anzeige)
  })
})

describe('Word: echter hochgestellter Lauf im Text und vor der Anmerkung', () => {
  it('neue Fußnote und Worthilfe', async () => {
    const ws = ausDatei('beispiel.arbeitsblatt')
    ws.sheets[0].blocks = [text()]
    const xml = await wordXml(ws)
    const hoch = hochgestellteLaeufe(xml)
    // im Text 1 und 2, vor den Anmerkungen wieder 1 und 2
    expect(hoch.filter((t) => t === '1')).toHaveLength(2)
    expect(hoch.filter((t) => t === '2')).toHaveLength(2)
    expect(xml).not.toContain('[^f1]')
    expect(xml).not.toContain('^{')
    const textStelle = xml.indexOf('preserve')
    const anmerkung = xml.indexOf('to keep sth. as it is')
    expect(textStelle).toBeGreaterThan(-1)
    expect(anmerkung).toBeGreaterThan(textStelle)
  })

  it('altes Blatt aus der Datei: Ziffern in Word ohne Bearbeitung', async () => {
    const ws = ausDatei('alt-annotationen.arbeitsblatt')
    const xml = await wordXml(ws)
    const hoch = hochgestellteLaeufe(xml)
    for (const n of ['1', '2', '3', '4']) expect(hoch).toContain(n)
    expect(xml).not.toMatch(/preserve \(1\)|leaves\[2\]|roots\*/)
  })
})
