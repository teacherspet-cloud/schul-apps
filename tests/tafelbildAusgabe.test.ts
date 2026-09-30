import { DOMParser } from '@xmldom/xmldom'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { pdfHtml, seitenFuer, standardPdfWahl } from '../src/renderer/src/modules/tafelbild/ausgabe'
import { setzeLayout } from '../src/renderer/src/modules/tafelbild/layout'
import { boardPlanAus, inhaltAusBoardPlan, insArbeitsblatt, texteAus } from '../src/renderer/src/modules/tafelbild/material'
import { leeresTafelbild, type Tafelbild } from '../src/renderer/src/modules/tafelbild/model'
import type { FormatId } from '../src/renderer/src/modules/tafelbild/formate'
import { pptxDatei } from '../src/renderer/src/modules/tafelbild/pptx'
import { pptxFolien } from '../src/renderer/src/modules/tafelbild/pptxFolien'
import { inhaltAus } from '../src/renderer/src/modules/tafelbild/prompt'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { FLUSS, NETZ, TABELLE } from './tafelbildBeispiele'

/*
 * Tafelbilder (30.09.2026): Ausgaben erzeugen gültige Dateien (PDF-HTML, PowerPoint mit bearbeitbaren
 * Formen und Sprechernotizen), das Arbeitsblatt nimmt Tafelbilder auf und gibt seine eigenen her,
 * Material aus der App wird Text.
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
  // Bilder ohne DOM: ein winziges PNG genügt für den Aufbau des Pakets
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
  const folienVon = async (roh: unknown, formate: FormatId[] = ['klapptafel', 'heft']): Promise<{ t: Tafelbild; z: Record<string, Uint8Array> }> => {
    const t = leeresTafelbild()
    t.meta.formate = formate
    t.meta.varianten = { luecke: true, schritte: true, niveaus: false, merksatz: true }
    t.inhalt = inhaltAus(roh, t.meta)
    t.tafeln = formate.map((f) => setzeLayout(t.inhalt!, f, { regler: t.meta.regler, varianten: t.meta.varianten }).tafel)
    const folien = await pptxFolien(t, formate, true, async () => png)
    return { t, z: unzipSync(pptxDatei(folien, 'Weimar & <Test>')) }
  }
  const text = (z: Record<string, Uint8Array>, name: string): string => strFromU8(z[name])

  it('ist ein gültiges Paket: alle Teile vorhanden, jede XML wohlgeformt, jede Beziehung zeigt auf einen vorhandenen Teil', async () => {
    const { z } = await folienVon(NETZ)
    expect(Object.keys(z)[0]).toBe('[Content_Types].xml')
    for (const teil of [
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/notesMasters/notesMaster1.xml',
      'ppt/theme/theme2.xml',
      'ppt/slides/slide1.xml',
      'ppt/notesSlides/notesSlide1.xml',
      'docProps/core.xml'
    ])
      expect(z[teil], teil).toBeDefined()
    for (const [name, inhalt] of Object.entries(z)) if (name.endsWith('.xml') || name.endsWith('.rels')) expect(xmlFehler(strFromU8(inhalt)), name).toEqual([])
    // Beziehungen: jedes Ziel existiert, jeder Folien-/Notizteil steht im Inhaltsverzeichnis
    const typen = text(z, '[Content_Types].xml')
    for (const name of Object.keys(z).filter((n) => n.endsWith('.rels'))) {
      const basis = name.replace(/_rels\/[^/]*\.rels$/, '')
      for (const [, ziel] of text(z, name).matchAll(/Target="([^"]+)"/g)) {
        const pfad: string[] = []
        for (const x of `${basis}${ziel}`.split('/')) x === '..' ? pfad.pop() : x && pfad.push(x)
        expect(z[pfad.join('/')], `${name} → ${ziel}`).toBeDefined()
      }
    }
    for (const name of Object.keys(z).filter((n) => /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(n))) expect(typen).toContain(`/${name}`)
    expect(text(z, 'docProps/core.xml')).toContain('Weimar &amp; &lt;Test&gt;')
  })

  it('Folien sind bearbeitbar: Kästen als Textfelder mit Rahmen, Verbinder angeschlossen, Titel als Folientitel, Tafel als Hintergrund', async () => {
    const { z } = await folienVon(NETZ)
    const n = Object.keys(z).filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x)).length
    const letzte = text(z, 'ppt/slides/slide5.xml')
    // Aufbau: 5 Schritte + Lückenfassung je Format
    expect(n).toBe(12)
    expect(letzte).toContain('<a:t>Politik</a:t>')
    expect(letzte).toContain('<a:t>Versailler Vertrag</a:t>')
    expect(letzte).toContain('<a:buChar char="•"/>')
    expect(letzte).toContain('prst="roundRect"')
    expect(letzte).toContain('cmpd="dbl"')
    expect(letzte).toMatch(/<p:cxnSp>.*<a:stCxn id="\d+" idx="\d"\/><a:endCxn id="\d+" idx="\d"\/>/)
    expect(letzte).toContain('<p:ph type="title"/>')
    expect(letzte).toContain('<a:t>Warum scheiterte die Weimarer Republik?</a:t>')
    expect(letzte).toContain('typeface="Segoe Print"')
    expect(letzte).toMatch(/<p:bg><p:bgPr><a:blipFill/)
    // Bilder nur für Zeichnungen, jedes mit Alternativtext
    const bilder = [...letzte.matchAll(/<p:pic><p:nvPicPr><p:cNvPr id="\d+" name="[^"]*"( descr="([^"]*)")?/g)]
    expect(bilder.length).toBeGreaterThan(0)
    for (const b of bilder) expect((b[2] ?? '').length, b[0]).toBeGreaterThan(3)
    // Schritt 1 zeigt weniger als der letzte Schritt
    expect(text(z, 'ppt/slides/slide1.xml')).not.toContain('<a:t>Gesellschaft</a:t>')
    // Hefteintrag: Gelb auf Weiß als Textmarker
    expect(text(z, 'ppt/slides/slide11.xml')).toContain('<a:highlight><a:srgbClr val="FFF27A"/></a:highlight>')
    // Lückenfassung mit Lücken und Wortspeicher
    const luecke = text(z, 'ppt/slides/slide6.xml')
    expect(luecke).toContain('__________')
    expect(luecke).toContain('Wortspeicher:')
    // Hintergrund der Tafel nur einmal je Format abgelegt
    expect(Object.keys(z).filter((x) => x.startsWith('ppt/media/')).length).toBeLessThan(n)
  })

  it('Sprechernotizen: Schritt, Phase, Impulsfrage, Merksatz, Lösungen der Lücken', async () => {
    const { z } = await folienVon(NETZ)
    const eins = text(z, 'ppt/notesSlides/notesSlide1.xml')
    expect(eins).toContain('Schritt 1 von 5')
    expect(eins).toContain('Phase: Einstieg')
    expect(eins).toContain('Impulsfrage: Leitfrage')
    expect(eins).toContain('Merksatz: Die Weimarer Republik scheiterte')
    expect(eins).toContain('Lösungen der Lücken:')
    expect(eins).toContain('Dolchstoßlegende')
    expect(text(z, 'ppt/notesSlides/notesSlide6.xml')).toContain('Lückenfassung')
  })

  it('Tabelle als echte Tabelle ohne Tabellenformat', async () => {
    const { z } = await folienVon(TABELLE, ['whiteboard'])
    const folie = text(z, 'ppt/slides/slide3.xml')
    expect(folie).toContain('<a:tbl>')
    expect(folie).toContain('{2D5ABB26-0587-4C30-8999-92F81FD0307C}')
    expect(folie).toContain('<a:t>Chloroplasten</a:t>')
    expect((folie.match(/<a:gridCol /g) ?? []).length).toBe(3)
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
