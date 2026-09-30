import { DOMParser } from '@xmldom/xmldom'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { pdfHtml, seitenFuer, standardPdfWahl } from '../src/renderer/src/modules/tafelbild/ausgabe'
import { setzeLayout } from '../src/renderer/src/modules/tafelbild/layout'
import { boardPlanAus, inhaltAusBoardPlan, insArbeitsblatt, texteAus } from '../src/renderer/src/modules/tafelbild/material'
import { leeresTafelbild, type Tafelbild } from '../src/renderer/src/modules/tafelbild/model'
import { pptxDatei } from '../src/renderer/src/modules/tafelbild/pptx'
import { inhaltAus } from '../src/renderer/src/modules/tafelbild/prompt'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { NETZ, FLUSS } from './tafelbildBeispiele'

/*
 * Tafelbilder (30.09.2026): Ausgaben erzeugen gültige Dateien (PDF-HTML, PowerPoint), das
 * Arbeitsblatt nimmt Tafelbilder auf und gibt seine eigenen her, Material aus der App wird Text.
 */
function tafelbild(): Tafelbild {
  const t = leeresTafelbild()
  t.meta.formate = ['klapptafel', 'heft']
  t.meta.varianten = { luecke: true, schritte: true, niveaus: true, merksatz: true }
  t.inhalt = inhaltAus(NETZ, t.meta)
  t.tafeln = t.meta.formate.map((f) => setzeLayout(t.inhalt!, f, { regler: t.meta.regler, varianten: t.meta.varianten }).tafel)
  return t
}

const xmlFehler = (xml: string): string[] => {
  const f: string[] = []
  new DOMParser({ errorHandler: { error: (m: string) => void f.push(m), fatalError: (m: string) => void f.push(m) } }).parseFromString(xml, 'text/xml')
  return f
}

describe('PDF', () => {
  it('je Format das Tafelbild, dazu ★/★★, Lückenfassung und Planungshilfe – Querformat für die Klapptafel', () => {
    const t = tafelbild()
    const w = standardPdfWahl(t)
    const seiten = seitenFuer(t, w)
    expect(seiten.filter((s) => s.o.luecke).length).toBe(4)
    expect(seiten.filter((s) => s.o.niveau === 1 && !s.o.luecke).length).toBe(2)
    const html = pdfHtml(t, w, 'Testschule')
    expect(html).toContain('@page quer')
    expect(html).toContain('class="seite quer"')
    expect(html).toContain('class="seite hoch"')
    expect(html).toContain('Planungshilfe')
    expect(html).toContain('Lösungen der Lückenfassung')
    expect(html).toContain('Dolchstoßlegende')
    expect((html.match(/<svg /g) ?? []).length).toBeGreaterThanOrEqual(seiten.length)
  })
})

describe('PowerPoint', () => {
  it('ist ein gültiges Paket: alle Teile vorhanden, jede XML wohlgeformt, Folien und Bilder verknüpft', () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    const datei = pptxDatei(
      [
        { png, breite: 1920, hoehe: 480, hintergrund: '#23402f', titel: 'Schritt 1 & <2>', beschreibung: 'Tafel "A"' },
        { png, breite: 1920, hoehe: 1080, hintergrund: '#ffffff', titel: 'Schritt 2', beschreibung: 'B' }
      ],
      'Weimar'
    )
    const z = unzipSync(datei)
    expect(Object.keys(z)[0]).toBe('[Content_Types].xml')
    for (const teil of [
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/theme/theme1.xml',
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
      'ppt/slides/_rels/slide2.xml.rels',
      'ppt/media/bild2.png',
      'docProps/core.xml'
    ])
      expect(z[teil], teil).toBeDefined()
    for (const [name, inhalt] of Object.entries(z)) if (name.endsWith('.xml') || name.endsWith('.rels')) expect(xmlFehler(strFromU8(inhalt)), name).toEqual([])
    const typen = strFromU8(z['[Content_Types].xml'])
    expect(typen).toContain('/ppt/slides/slide2.xml')
    const folie = strFromU8(z['ppt/slides/slide1.xml'])
    expect(folie).toContain('r:embed="rId2"')
    expect(folie).toContain('23402F')
    // Breites Bild: volle Folienbreite, mittig
    expect(folie).toContain('cx="12192000"')
    expect(strFromU8(z['ppt/presentation.xml'])).toContain('<p:sldId id="257" r:id="rId3"/>')
  })
})

describe('Arbeitsblatt', () => {
  const blatt = (): Worksheet =>
    ({
      version: 1,
      meta: {},
      design: {},
      outline: null,
      sheets: [{ id: 's1', label: 'Blatt', blocks: [] }],
      sources: [],
      createdAt: ''
    }) as unknown as Worksheet

  it('nimmt ein Tafelbild als Tafelbild der Lehrkraft und als Bild auf; gleiches Format wird ersetzt', () => {
    const t = tafelbild()
    const plan = boardPlanAus(t.inhalt!, t.tafeln[0])
    expect(plan.format).toBe('volltafel')
    expect(plan.title).toBe(t.inhalt!.titel)
    expect(plan.sections.some((s) => s.field === 'links')).toBe(true)
    let ws = insArbeitsblatt(blatt(), plan, { dataUrl: 'data:image/png;base64,AAA', titel: 'Weimar', luecke: true })
    ws = insArbeitsblatt(ws, plan)
    expect(ws.boards?.length).toBe(1)
    expect(ws.sheets[0].blocks).toHaveLength(1)
    expect(ws.sheets[0].blocks[0].type).toBe('image')
  })

  it('gibt sein Tafelbild ohne KI als Inhalt her (Fluss bleibt Fluss)', () => {
    const t = leeresTafelbild()
    const inhalt = inhaltAus(FLUSS, { ...t.meta, varianten: { ...t.meta.varianten, niveaus: false } })
    const plan = boardPlanAus(inhalt, setzeLayout(inhalt, 'whiteboard', { regler: t.meta.regler, varianten: t.meta.varianten }).tafel)
    const zurueck = inhaltAusBoardPlan(plan)
    expect(zurueck.struktur).toBe('fluss')
    expect(zurueck.knoten.map((k) => k.titel)).toEqual(inhalt.knoten.map((k) => k.titel))
    expect(zurueck.beziehungen.length).toBe(inhalt.knoten.length - 1)
    expect(zurueck.merksatz?.text).toBe(inhalt.merksatz?.text)
  })
})

describe('Material aus der App', () => {
  it('sammelt Texte ohne Bilder, Kennungen und Einstellungen', () => {
    const text = texteAus({
      id: 'abc123def',
      meta: { topic: 'Weimarer Republik', design: { font: 'Arial' } },
      sheets: [{ blocks: [{ type: 'text', text: '<p>Die Inflation 1923 traf den Mittelstand.</p>', image: { dataUrl: 'data:image/png;base64,AAAA' } }] }]
    })
    expect(text).toContain('Weimarer Republik')
    expect(text).toContain('Die Inflation 1923 traf den Mittelstand.')
    expect(text).not.toContain('data:')
    expect(text).not.toContain('Arial')
    expect(text).not.toContain('abc123def')
  })
})
