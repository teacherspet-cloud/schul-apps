import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import type { TextBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { anmerkungenImStueck, anmerkungenJeAbsatz, anmerkungsArt, hatAnmerkungen } from '../src/renderer/src/modules/arbeitsblatt/didactics/anmerkungen'
import { paginate, type MeasuredItem } from '../src/renderer/src/shared/render/paginate'
import { contextFor, fussnotenDerSeite, pageInfoFor, SheetPages } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { worksheetMetaForKurztest } from '../src/renderer/src/modules/lernzielkontrolle/render/kurztestWorksheet'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import { worksheetMetaForTest } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { presetDesigns } from '@shared/design'

/*
 * Fußnoten oder Endnoten (01.10.2026, Blattoptionen): Fußnoten stehen unten auf der Seite ihres
 * Worts, der Seitenumbruch hält den Platz frei; Endnoten wie bisher am Ende des Materials. Die
 * Zählung beginnt je Material bei 1 – auch in Word (eigene Fußnotenzeichen).
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }

const text = (id: string, patch: Partial<TextBlock> = {}): TextBlock => ({
  ...(newBlock('text') as TextBlock),
  id,
  title: 'Shakespeare today',
  body: 'We must preserve[^f1] the old plays.\n\nThey are more relevant than ever.\n\nThe theatre is full every night.',
  fussnoten: [{ id: 'f1', wort: 'to preserve', text: 'to keep sth. as it is' }],
  glossary: [
    { term: 'theatre', explanation: 'Theater' },
    { term: 'audience', explanation: 'Publikum' }
  ],
  ...patch
})

const ausDatei = (name: string): Worksheet => JSON.parse(readFileSync(`tests/fixtures/${name}`, 'utf8')).worksheet as Worksheet

describe('Anmerkungen je Absatz und je Stück', () => {
  it('ordnet jede Ziffer dem Absatz ihres Worts zu; ohne Stelle im Text → letztes Stück', () => {
    const j = anmerkungenJeAbsatz(text('m1'))
    expect(j.absaetze).toEqual([[1], [], [2]])
    // „audience" kommt im Text nicht vor
    expect(j.rest).toEqual([3])
    expect(anmerkungenImStueck(text('m1'), 0, 1).map((a) => a.nr)).toEqual([1])
    expect(anmerkungenImStueck(text('m1'), 1, 2).map((a) => a.nr)).toEqual([])
    expect(anmerkungenImStueck(text('m1'), 1, 3).map((a) => a.nr)).toEqual([2, 3])
  })

  it('Zählung beginnt je Material bei 1 – zwei Materialien auf einer Seite', () => {
    const m1 = text('m1')
    const m2 = text('m2', { body: 'The audience loves the theatre.', fussnoten: [] })
    const byId = new Map<string, TextBlock>([
      ['m1', m1],
      ['m2', m2]
    ])
    const gruppen = fussnotenDerSeite({ items: [{ id: 'm1', from: 2, to: 3, continued: true }, { id: 'm2' }], overflow: false }, byId)
    expect(gruppen.map((g) => [g.block.id, g.anmerkungen.map((a) => a.nr)])).toEqual([
      ['m1', [2, 3]],
      ['m2', [1, 2]]
    ])
  })

  it('Wahl nur, wenn ein Material Anmerkungen hat; Vorgabe Endnoten', () => {
    expect(hatAnmerkungen([text('m1')])).toBe(true)
    expect(hatAnmerkungen([text('m1', { body: 'Nothing here.', fussnoten: [], glossary: [] })])).toBe(false)
    expect(anmerkungsArt({})).toBe('endnoten')
    expect(anmerkungsArt({ anmerkungen: 'fussnoten' })).toBe('fussnoten')
  })
})

describe('Seitenumbruch hält Platz für Fußnoten frei', () => {
  const item = (noteUnits?: number[]): MeasuredItem => ({
    id: 't',
    height: 300,
    headHeight: 0,
    units: [100, 100, 100],
    ...(noteUnits ? { noteUnits, noteRule: 10 } : {})
  })

  it('Endnoten (ohne Fußnotenhöhen): wie bisher', () => {
    const p = paginate([item()], 250, 1000)
    expect(p[0].items[0]).toMatchObject({ from: 0, to: 2 })
  })

  it('Fußnote passt nicht mehr: die Einheit mit dem Wort wandert auf die nächste Seite', () => {
    // 100 + 100 + Fußnote 50 + Linie 10 = 260 > 250
    const p = paginate([item([0, 50, 0])], 250, 1000)
    expect(p[0].items[0]).toMatchObject({ from: 0, to: 1 })
    expect(p[1].items[0]).toMatchObject({ from: 1, to: 3 })
  })

  it('passt sie, bleibt alles auf der Seite – die Linie zählt nur einmal je Seite', () => {
    const p = paginate([item([0, 20, 0])], 250, 1000)
    expect(p[0].items[0]).toMatchObject({ from: 0, to: 2 })
    // zwei Bausteine mit Fußnoten auf einer Seite: 2 × (100 + 20) + 1 × Linie = 250
    const zwei = paginate(
      [
        { id: 'a', height: 100, noteUnits: [20], noteRule: 10 },
        { id: 'b', height: 100, noteUnits: [20], noteRule: 10 }
      ],
      250,
      250
    )
    expect(zwei).toHaveLength(1)
  })

  it('ungeteilter Baustein samt Fußnoten zu groß: auf die nächste Seite', () => {
    const p = paginate(
      [
        { id: 'a', height: 150 },
        { id: 'b', height: 80, noteUnits: [30], noteRule: 10 }
      ],
      250,
      250
    )
    expect(p.map((s) => s.items.map((i) => i.id))).toEqual([['a'], ['b']])
  })
})

describe('Darstellung: Fußnoten unten auf der Seite, Endnoten am Ende des Materials', () => {
  const blatt = (art?: 'fussnoten' | 'endnoten'): Worksheet => {
    const ws = ausDatei('beispiel.arbeitsblatt')
    ws.meta.anmerkungen = art
    ws.sheets[0].blocks = [text('m1')]
    return ws
  }
  const setze = (ws: Worksheet): string => {
    const sheet = ws.sheets[0]
    // Bei Endnoten ist die Liste eine eigene Einheit hinter den drei Absätzen
    const bis = ws.meta.anmerkungen === 'fussnoten' ? 3 : 4
    const plans = [
      { items: [{ id: 'm1', from: 0, to: 1, lineStart: 0, lineCount: 1 }], overflow: false },
      { items: [{ id: 'm1', from: 1, to: bis, lineStart: 1, lineCount: 2, continued: true }], overflow: false }
    ]
    return renderToStaticMarkup(
      createElement(SheetPages, { ws, sheet, plans, info: pageInfoFor(ws, sheet, null, '', false), context: contextFor(ws, sheet, 'print') })
    )
  }

  it('Fußnoten: jede Seite zeigt nur die Anmerkungen ihrer Wörter, keine Liste im Material', () => {
    const html = setze(blatt('fussnoten'))
    const seiten = html.split('class="ws-page"').slice(1)
    expect(seiten).toHaveLength(2)
    expect(html).not.toContain('ws-glossary')
    expect(seiten[0]).toContain('data-fussnoten-seite')
    expect(seiten[0]).toMatch(/data-fn-nr="1"/)
    expect(seiten[0]).not.toMatch(/data-fn-nr="2"/)
    expect(seiten[1]).toMatch(/data-fn-nr="2"/)
    expect(seiten[1]).toMatch(/data-fn-nr="3"/)
    expect(seiten[1]).not.toMatch(/data-fn-nr="1"/)
    // Ziffer im Text bleibt
    expect(seiten[0]).toMatch(/preserve(?:<\/span><span>)?<sup>1<\/sup>/)
  })

  it('Endnoten: unverändert – Liste am Ende des Materials, kein Fußnotenbereich', () => {
    const html = setze(blatt())
    expect(html).not.toContain('data-fussnoten-seite')
    const seiten = html.split('class="ws-page"').slice(1)
    expect(seiten[0]).not.toContain('ws-glossary')
    expect(seiten[1]).toContain('ws-glossary')
  })
})

describe('Die Wahl wird gespeichert und gilt in allen Programmen', () => {
  it('Arbeitsblatt: im Dokument gespeichert, im Kontext der Darstellung', () => {
    const ws = ausDatei('beispiel.arbeitsblatt')
    ws.meta.anmerkungen = 'fussnoten'
    const wieder = JSON.parse(JSON.stringify({ worksheet: ws })).worksheet as Worksheet
    expect(wieder.meta.anmerkungen).toBe('fussnoten')
    expect(contextFor(wieder, wieder.sheets[0], 'print').anmerkungsArt).toBe('fussnoten')
    expect(contextFor(ausDatei('beispiel.arbeitsblatt'), wieder.sheets[0], 'print').anmerkungsArt).toBe('endnoten')
  })

  it('Klassenarbeit, Lernzielkontrolle und Grammatiktest reichen sie an das Blatt weiter', () => {
    const exam = { version: 1, meta: { ...defaultExamMeta('NW', 'gymnasium', 'Gymnasium'), anmerkungen: 'fussnoten' }, parts: [] } as unknown as Exam
    expect(worksheetMetaFor(exam).anmerkungen).toBe('fussnoten')
    const lzk = emptyKurztest('NW', 'gymnasium', 'Gymnasium')
    lzk.meta.anmerkungen = 'fussnoten'
    expect(worksheetMetaForKurztest(lzk).anmerkungen).toBe('fussnoten')
    const gt = newTest(presetDesigns()[0], 'NW', 'gymnasium', 'Gymnasium')
    gt.meta.anmerkungen = 'fussnoten'
    expect(worksheetMetaForTest(gt).anmerkungen).toBe('fussnoten')
  })
})

describe('Word', () => {
  const word = async (art?: 'fussnoten' | 'endnoten'): Promise<{ doc: string; noten?: string }> => {
    const ws = ausDatei('beispiel.arbeitsblatt')
    ws.meta.anmerkungen = art
    ws.sheets[0].blocks = [text('m1'), text('m2', { body: 'The theatre is old.', fussnoten: [] })]
    const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: [ws.sheets[0].id], includeKey: false }, deps))
    return { doc: await zip.file('word/document.xml')!.async('string'), noten: await zip.file('word/footnotes.xml')?.async('string') }
  }

  it('Fußnoten: echte Word-Fußnoten mit eigenem Zeichen, je Material ab 1', async () => {
    const { doc, noten } = await word('fussnoten')
    const verweise = [...doc.matchAll(/<w:footnoteReference w:customMarkFollows="1" w:id="(\d+)"\/><w:t xml:space="preserve">(\d+)<\/w:t>/g)].map((m) => m[2])
    // M1: preserve¹, theatre²; M2: theatre¹ – „audience" (ohne Stelle) bleibt in der Liste unter M1
    expect(verweise).toEqual(['1', '2', '1'])
    expect(noten).toBeDefined()
    expect(noten).toContain('to keep sth. as it is')
    expect(noten).toContain('Theater')
    // In den eigenen Fußnoten steht das Zeichen statt der automatischen Nummer (die Trenner -1/0 legt docx an)
    for (const m of noten!.matchAll(/<w:footnote w:id="(\d+)">([\s\S]*?)<\/w:footnote>/g)) expect(m[2]).not.toContain('<w:footnoteRef/>')
    expect(doc).not.toContain('to keep sth. as it is')
    expect(doc).toContain('Publikum')
  })

  it('Endnoten: keine Word-Fußnoten, Liste unter dem Material wie bisher', async () => {
    const { doc, noten } = await word()
    expect(doc).not.toContain('w:footnoteReference')
    expect(doc).toContain('to keep sth. as it is')
    expect(noten ?? '').not.toContain('to keep sth. as it is')
  })
})
