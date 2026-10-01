import { readFileSync } from 'fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  auswahlHinweis,
  leseSeitenAngabe,
  markiereSeiten,
  neueNummern,
  schnellAuswahl,
  seitenMarken,
  seitenText,
  waehleSeitenImHtml
} from '../src/renderer/src/shared/export/seitenAuswahl'
import { buildWorksheetHtml } from '../src/renderer/src/modules/arbeitsblatt/render/printHtml'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { wordAuswahl } from '../src/renderer/src/modules/arbeitsblatt/export/wordSeiten'
import { layoutKey } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import type { PagePlan } from '../src/renderer/src/shared/render/paginate'
import { buildPrintHtml } from '../src/renderer/src/modules/vokabeltest/render/printHtml'
import { buildDocx, vtWordAuswahl } from '../src/renderer/src/modules/vokabeltest/export/docx'
import { parseProjectFile } from '../src/renderer/src/modules/vokabeltest/project'
import { briefHtml } from '../src/renderer/src/modules/elternbrief/ausgabe'
import { pdfMitSeiten } from '../src/shared/seitenPdf'
import { sampleWorksheet } from './worksheetExport.test'

/*
 * Seitenauswahl für Speichern und Drucken (01.10.2026, Wunsch der Lehrkraft): „Von 9 Seiten nur
 * 1–4 und 6 – dann soll unten Seite 1 von 5 stehen, nicht Seite 1 von 9."
 */

describe('Seitenangaben lesen', () => {
  it('versteht Bereiche, Einzelseiten, Gedankenstriche, Leerzeichen und offene Enden', () => {
    expect(leseSeitenAngabe('1-4, 6', 9)).toEqual({ ok: true, seiten: [1, 2, 3, 4, 6] })
    expect(leseSeitenAngabe(' 1 – 4 ,6 ', 9)).toEqual({ ok: true, seiten: [1, 2, 3, 4, 6] })
    expect(leseSeitenAngabe('1—2; 5', 9)).toEqual({ ok: true, seiten: [1, 2, 5] })
    expect(leseSeitenAngabe('6-', 9)).toEqual({ ok: true, seiten: [6, 7, 8, 9] })
    expect(leseSeitenAngabe('-3', 9)).toEqual({ ok: true, seiten: [1, 2, 3] })
    expect(leseSeitenAngabe('1 3 5', 9)).toEqual({ ok: true, seiten: [1, 3, 5] })
    expect(leseSeitenAngabe('2 bis 4', 9)).toEqual({ ok: true, seiten: [2, 3, 4] })
    // Doppelte und ungeordnete Angaben: gedruckt wird in der Reihenfolge des Dokuments
    expect(leseSeitenAngabe('6, 1-3, 2', 9)).toEqual({ ok: true, seiten: [1, 2, 3, 6] })
  })

  it('meldet ungültige Angaben verständlich', () => {
    const fehler = (eingabe: string, n = 9): string => {
      const r = leseSeitenAngabe(eingabe, n)
      return r.ok ? '' : r.fehler
    }
    expect(fehler('')).toMatch(/Keine Seite/)
    expect(fehler('abc')).toMatch(/„abc" ist keine Seitenangabe/)
    expect(fehler('0-2')).toMatch(/Seite 0 gibt es nicht/)
    expect(fehler('2-12')).toMatch(/Seite 12 gibt es nicht – das Dokument hat 9 Seiten/)
    expect(fehler('5-3')).toMatch(/verdreht – gemeint ist wohl „3-5"/)
    expect(fehler('2', 1)).toMatch(/nur eine Seite/)
    expect(fehler('-')).toMatch(/keine Seitenangabe/)
  })

  it('schreibt eine Auswahl kurz zurück', () => {
    expect(seitenText([1, 2, 3, 4, 6])).toBe('1-4, 6')
    expect(seitenText([6, 1, 2])).toBe('1, 2, 6')
    expect(seitenText([])).toBe('')
    expect(auswahlHinweis([1, 2, 3, 4, 6], 9)).toMatch(/5 von 9 Seiten \(1-4, 6\)\. Die Seitenzahlen werden für die Auswahl neu gezählt/)
    expect(auswahlHinweis([1, 2], 2)).toBe('Alle 2 Seiten.')
  })
})

/** Ein schlichtes Dokument mit Marken: n Seiten mit „Seite X / n" */
const dokument = (n: number, gruppe = 'a', teil = 'blatt'): string =>
  Array.from(
    { length: n },
    (_, i) =>
      `<div class="seite" data-sa-seite="${teil}" data-sa-gruppe="${gruppe}"><p>Inhalt ${i + 1}</p><footer><span data-sa-zahl="">Seite <span data-sa-nr="">${i + 1}</span> / <span data-sa-von="">${n}</span></span></footer></div>`
  ).join('\n')

/** Die Fußzeilen eines HTML als Text */
const fusszeilen = (html: string): string[] => [...html.matchAll(/<span data-sa-zahl="">(.*?)<\/span><\/footer>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))

describe('Seiten wählen und neu zählen', () => {
  it('9 Seiten → „1-4, 6": fünf Seiten, Seite 1 / 5 … 5 / 5', () => {
    const html = `<!doctype html><html><head><style>.a > .b {}</style></head><body>${dokument(9)}</body></html>`
    const neu = waehleSeitenImHtml(html, [1, 2, 3, 4, 6])
    expect(seitenMarken(neu)).toHaveLength(5)
    expect(fusszeilen(neu)).toEqual(['Seite 1 / 5', 'Seite 2 / 5', 'Seite 3 / 5', 'Seite 4 / 5', 'Seite 5 / 5'])
    // Seite 6 ist jetzt die fünfte; Seite 5 fehlt
    expect(neu).toContain('Inhalt 6')
    expect(neu).not.toContain('Inhalt 5<')
    expect(neu).toContain('<style>.a > .b {}</style>')
  })

  it('zählt je Gruppe getrennt (Schüler- und Lösungsteil) und lässt bei einer Seite die Zahl weg', () => {
    const html = `<body>${dokument(4, 'blatt')}${dokument(3, 'loesung', 'loesung')}</body>`
    const neu = waehleSeitenImHtml(html, [2, 3, 6])
    expect(fusszeilen(neu)).toEqual(['Seite 1 / 2', 'Seite 2 / 2', ''])
    expect(neueNummern(seitenMarken(html), [2, 3, 6])).toEqual(
      new Map([
        [2, { nr: 1, von: 2 }],
        [3, { nr: 2, von: 2 }],
        [6, { nr: 1, von: 1 }]
      ])
    )
  })

  it('verschachtelte Seiten (Vorschauen im Deckblatt) zählen nicht mit, das Deckblatt behält ihre Zahlen', () => {
    const vorschau = '<div class="mini"><span data-sa-zahl="">Seite <span data-sa-nr="">2</span> / <span data-sa-von="">9</span></span></div>'
    const deckblatt = `<div class="ws-page" data-sa-seite="deckblatt" data-sa-gruppe="deckblatt"><div><div>${vorschau}</div></div></div>`
    const html = `<body>${deckblatt}${dokument(3)}</body>`
    expect(seitenMarken(html).map((m) => [m.teil, m.nummeriert])).toEqual([
      ['deckblatt', false],
      ['blatt', true],
      ['blatt', true],
      ['blatt', true]
    ])
    const neu = waehleSeitenImHtml(html, [1, 3, 4])
    expect(neu).toContain(vorschau)
    expect(fusszeilen(neu)).toEqual(['Seite 1 / 2', 'Seite 2 / 2'])
  })

  it('ohne Marken bleibt das HTML unverändert (dann wird im PDF geschnitten)', () => {
    const html = '<body><section class="seite">A</section><section class="seite">B</section></body>'
    expect(seitenMarken(html)).toEqual([])
    expect(waehleSeitenImHtml(html, [1])).toBe(html)
  })

  it('markiert die obersten Elemente eines Stücks', () => {
    const stueck = '<div class="ws-page" style="a:b"><div>x</div></div>\n<div class="ws-page"><img src="a"/></div>'
    const neu = markiereSeiten(stueck, (i) => ({ teil: i ? 'material' : 'blatt', gruppe: 's1:blatt', index: i + 1 }))
    expect(seitenMarken(neu).map((m) => [m.teil, m.gruppe, m.index])).toEqual([
      ['blatt', 's1:blatt', 1],
      ['material', 's1:blatt', 2]
    ])
    expect(neu).toContain('<div class="ws-page" style="a:b" data-sa-seite="blatt" data-sa-gruppe="s1:blatt" data-sa-index="1">')
  })
})

describe('Schnellauswahl', () => {
  it('bietet je Dokument nur, was es gibt', () => {
    expect(schnellAuswahl(['blatt', 'blatt']).map((s) => s.id)).toEqual(['alle'])
    const ab = schnellAuswahl(['deckblatt', 'blatt', 'blatt', 'material', 'loesung', 'loesung'], { aktuelleSeite: 3 })
    expect(ab.map((s) => [s.id, s.seiten])).toEqual([
      ['alle', [1, 2, 3, 4, 5, 6]],
      ['blatt', [2, 3]],
      ['loesung', [5, 6]],
      ['material', [4]],
      ['deckblatt', [1]],
      ['aktuell', [3]]
    ])
    expect(ab.find((s) => s.id === 'loesung')!.label).toBe('Nur Lösungen')
    expect(schnellAuswahl(['blatt', 'loesung'], { loesungsBegriff: 'Erwartungshorizont' })[2].label).toBe('Nur Erwartungshorizont')
    // Tafelbild mit Planungshilfe: „Nur Tafelbild" lohnt sich
    expect(schnellAuswahl(['tafel', 'tafel', 'planung']).map((s) => s.id)).toEqual(['alle', 'tafel'])
  })
})

/** 9 Seiten Aufteilung für das Beispielblatt: je Seite ein, zwei Bausteine */
function neunSeiten(): { ws: ReturnType<typeof sampleWorksheet>; layouts: Map<string, PagePlan[]> } {
  const ws = sampleWorksheet()
  // Seitenzahl im Fuß rechts, damit sie gezählt werden kann
  const f = ws.design.footer
  if (![f.left, f.center, f.right].includes('pageNumber')) ws.design.footer = { ...f, right: 'pageNumber' }
  ws.design.footer.show = true
  const ids = ws.sheets[0].blocks.filter((b) => !b.free).map((b) => b.id)
  const plans: PagePlan[] = Array.from({ length: 9 }, () => ({ items: [], overflow: false }))
  ids.forEach((id, i) => plans[Math.min(8, Math.floor((i * 9) / ids.length))].items.push({ id }))
  return { ws, layouts: new Map([[layoutKey('sheet-1', false), plans]]) }
}

describe('Arbeitsblatt: Seitenauswahl im Druck-HTML und in Word', () => {
  it('trägt Marken je Seite; „1-4, 6" ergibt fünf Seiten mit Seite 1 / 5 … 5 / 5', () => {
    const { ws, layouts } = neunSeiten()
    const html = buildWorksheetHtml(ws, layouts, { sheetIds: ['sheet-1'], includeKey: false }, null, '')
    const marken = seitenMarken(html)
    // 9 Seiten + Schlussseiten (Hilfekarten, Bildnachweise …)
    expect(marken.length).toBeGreaterThanOrEqual(9)
    expect(marken.slice(0, 9).every((m) => m.teil === 'blatt' && m.gruppe === 'sheet-1:blatt')).toBe(true)
    const alt = [...html.matchAll(/data-sa-zahl="">(.*?)<\/span><\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
    expect(alt[0]).toBe(`Seite 1 / ${marken.length}`)
    const neu = waehleSeitenImHtml(html, [1, 2, 3, 4, 6])
    expect(seitenMarken(neu)).toHaveLength(5)
    const zahlen = [...neu.matchAll(/data-sa-zahl="">(.*?)<\/span><\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
    expect(zahlen).toEqual(['Seite 1 / 5', 'Seite 2 / 5', 'Seite 3 / 5', 'Seite 4 / 5', 'Seite 5 / 5'])
  })

  it('Schlussseiten sind „Material" bzw. Teil des Blatts; Lösungen zählen für sich', () => {
    const { ws, layouts } = neunSeiten()
    const html = buildWorksheetHtml(ws, layouts, { sheetIds: ['sheet-1'], includeKey: true }, null, '')
    const marken = seitenMarken(html)
    expect(marken.some((m) => m.art === 'hilfekarten' && m.teil === 'material')).toBe(true)
    expect(marken.some((m) => m.teil === 'loesung' && m.gruppe === 'sheet-1:loesung')).toBe(true)
    const ids = schnellAuswahl(marken.map((m) => m.teil)).map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['alle', 'blatt', 'loesung', 'material']))
  })

  it('Word bekommt nur die Inhalte der gewählten Seiten', async () => {
    const { ws, layouts } = neunSeiten()
    const html = buildWorksheetHtml(ws, layouts, { sheetIds: ['sheet-1'], includeKey: false }, null, '')
    const marken = seitenMarken(html)
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const deps = { logo: null, schoolName: 'Musterschule', sizer: async () => ({ width: 10, height: 10 }), raster: async () => png, sidebar: async () => png }
    const plan = layouts.get(layoutKey('sheet-1', false))!
    const wahl = wordAuswahl(ws, layouts, [marken[0]])
    expect([...wahl.blaetter.get('sheet-1:blatt')!.bausteine].sort()).toEqual(plan[0].items.map((i) => i.id).sort())
    const text = async (bytes: Uint8Array): Promise<string> => (await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '')
    const ganz = await text(await buildWorksheetDocx(ws, { sheetIds: ['sheet-1'], includeKey: false }, deps))
    const teil = await text(await buildWorksheetDocx(ws, { sheetIds: ['sheet-1'], includeKey: false, seiten: wahl }, deps))
    expect(ganz).toContain('Traubenzucker')
    expect(teil.length).toBeLessThan(ganz.length)
    // Hilfekarten stehen nicht auf Seite 1
    expect(ganz).toContain('Tipp- und Hilfekarten')
    expect(teil).not.toContain('Tipp- und Hilfekarten')
  })
})

describe('Vokabeltest: Marken und Word-Auswahl', () => {
  it('nummeriert je Variante und wählt in Word nur die Aufgaben der gewählten Seiten', async () => {
    const doc = parseProjectFile(readFileSync('tests/fixtures/beispiel.vokabeltest'))
    const v = doc.variants[0]
    // Zwei Seiten: erste Hälfte der Aufgaben, zweite Hälfte
    const haelfte = Math.ceil(v.blocks.length / 2)
    const seiten = [v.blocks.slice(0, haelfte), v.blocks.slice(haelfte)].map((bs) => ({ items: bs.map((b) => ({ id: b.id })), overflow: false }))
    const layouts = { student: new Map([[v.id, { pages: seiten, fontSize: 11, compact: false }]]), key: new Map() } as never
    const html = buildPrintHtml(doc, { variantIds: [v.id], includeKey: false }, layouts)
    const marken = seitenMarken(html)
    expect(marken).toHaveLength(2)
    expect(html).toContain('<span data-sa-nr="">1</span> / <span data-sa-von="">2</span>')
    const nurZwei = waehleSeitenImHtml(html, [2])
    expect(seitenMarken(nurZwei)).toHaveLength(1)
    // Eine Seite allein trägt keine Zahl
    expect(nurZwei).not.toContain('data-sa-nr')
    const wahl = vtWordAuswahl(doc, layouts, [marken[1]])
    expect([...wahl.get(`${v.id}:blatt`)!]).toEqual(v.blocks.slice(haelfte).map((b) => b.id))
    const bytes = await buildDocx(doc, { variantIds: [v.id], includeKey: false, layouts, auswahl: wahl }, async () => ({ width: 1, height: 1 }))
    expect(bytes.length).toBeGreaterThan(3000)
  })
})

describe('Programme ohne Seitenzahlen', () => {
  it('Elternbrief: je Fassung eine Seite mit Marke, ohne Zahl', () => {
    const brief = {
      meta: { absender: 'Frau Muster', datum: '2026-10-01' },
      text: { betreff: 'Ausflug', anrede: 'Liebe Eltern,', absaetze: ['Text'], gruss: 'Viele Grüße', vermerk: '' },
      uebersetzungen: [{ code: 'tr', text: { betreff: 'Gezi', anrede: 'Sevgili', absaetze: ['Metin'], gruss: 'Selamlar', vermerk: 'Makine' } }]
    } as never
    const html = briefHtml(brief, { schule: 'Musterschule', logo: null })
    expect(seitenMarken(html).map((m) => [m.teil, m.art, m.nummeriert])).toEqual([
      ['brief', 'de', false],
      ['brief', 'tr', false]
    ])
    // Nur die Übersetzung
    expect(briefHtml(brief, { schule: 'Musterschule', logo: null }, ['tr'])).not.toContain('Liebe Eltern')
  })

  it('schneidet im fertigen PDF genau die gewählten Seiten aus', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const quelle = await PDFDocument.create()
    for (let i = 0; i < 9; i++) quelle.addPage([100 + i, 100])
    const bytes = await quelle.save()
    const neu = await PDFDocument.load(await pdfMitSeiten(bytes, [1, 2, 3, 4, 6]))
    expect(neu.getPageCount()).toBe(5)
    expect(neu.getPages().map((p) => p.getWidth())).toEqual([100, 101, 102, 103, 105])
  })
})
