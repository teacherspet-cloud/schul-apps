import { describe, expect, it } from 'vitest'
import { pdfHtml, standardPdfWahl } from '../src/renderer/src/modules/tafelbild/ausgabe'
import { setzeUndPruefe } from '../src/renderer/src/modules/tafelbild/auftrag'
import { formatInfo } from '../src/renderer/src/modules/tafelbild/formate'
import { setzeLayout } from '../src/renderer/src/modules/tafelbild/layout'
import { leeresTafelbild, type TafelbildMeta, type TbInhalt } from '../src/renderer/src/modules/tafelbild/model'
import { inhaltAus } from '../src/renderer/src/modules/tafelbild/prompt'
import { pptxFolien } from '../src/renderer/src/modules/tafelbild/pptxFolien'
import { pruefeTafel } from '../src/renderer/src/modules/tafelbild/pruefung'
import { tafelSvg } from '../src/renderer/src/modules/tafelbild/svg'
import { zusammenfassen, zusammenfassPaar } from '../src/renderer/src/modules/tafelbild/vorschlaege'
import { ALLE, KREISLAUF, NETZ, ZEITLEISTE } from './tafelbildBeispiele'

/*
 * Tafelbilder, Nachbesserung (30.09.2026): Hefteintrag ohne Loch über dem Merksatz, Kreislauf als
 * Ring im Raster, Zeitleiste hochkant ohne Linien quer über die Kästen, Kreidetextur als Muster
 * (kleines PDF), automatische Kürzung bei zu kleiner Schrift und die Vorschläge der App dazu.
 */
const meta = (o: Partial<TafelbildMeta> = {}): TafelbildMeta => ({
  ...leeresTafelbild().meta,
  varianten: { luecke: true, schritte: true, niveaus: false, merksatz: true },
  ...o
})
const inhalt = (roh: unknown, m = meta()): TbInhalt => inhaltAus(roh, m)
const setze = (roh: unknown, f: Parameters<typeof setzeLayout>[1]) => setzeLayout(inhalt(roh), f, { regler: meta().regler, varianten: meta().varianten }).tafel

describe('Layout', () => {
  it('Hefteintrag: Merksatz rückt direkt unter den Inhalt – kein Loch mitten im Heft', () => {
    for (const [name, roh] of Object.entries(ALLE)) {
      const t = setze(roh, 'heft')
      const merk = t.elemente.find((e) => e.typ === 'merksatz')!
      const inhaltUnten = Math.max(
        ...t.elemente.filter((e) => e.typ !== 'verbinder' && e.typ !== 'merksatz' && e.titel !== 'Hausaufgabe').map((e) => e.y + e.h)
      )
      const luecke = (merk.y - inhaltUnten) * formatInfo('heft').hoehe
      expect(luecke, name).toBeGreaterThan(0)
      expect(luecke, name).toBeLessThan(formatInfo('heft').schrift.text * formatInfo('heft').hoehe * 2.5)
    }
  })

  it('Kreislauf quer: zwei Reihen im Raster, die Stationen nutzen die Breite des Hauptfelds', () => {
    const t = setze(KREISLAUF, 'klapptafel')
    const stationen = t.elemente.filter((e) => e.typ === 'kasten' && e.knoten)
    const reihen = new Set(stationen.map((e) => Math.round(e.y * 100)))
    expect(reihen.size).toBe(2)
    const links = Math.min(...stationen.map((e) => e.x))
    const rechts = Math.max(...stationen.map((e) => e.x + e.w))
    // Mitteltafel: 25 % … 75 % der Breite
    expect(rechts - links).toBeGreaterThan(0.44)
    // Der Ring schließt sich: vier Pfeile für vier Stationen
    expect(t.elemente.filter((e) => e.typ === 'verbinder').length).toBe(4)
  })

  it('Zeitleiste hochkant: Kästen auf Höhe ihrer Marke, Achse nur so lang wie die Kästen', () => {
    const t = setze(ZEITLEISTE, 'heft')
    const achse = t.elemente.find((e) => e.typ === 'diagramm')!
    const kaesten = t.elemente.filter((e) => e.typ === 'kasten')
    expect(achse.y).toBeCloseTo(Math.min(...kaesten.map((e) => e.y)), 5)
    expect(achse.y + achse.h).toBeCloseTo(Math.max(...kaesten.map((e) => e.y + e.h)), 5)
    // Die letzte Marke (1799) liegt unten – der Kasten „Napoleon" auch
    const napoleon = kaesten.find((e) => e.titel === 'Napoleon')!
    expect(napoleon.y + napoleon.h).toBeCloseTo(achse.y + achse.h, 5)
  })
})

describe('Kreidetextur', () => {
  it('als gekacheltes Muster statt Filter; im PDF ohne Körnung (sonst ein seitengroßes Rasterbild)', () => {
    const t = setze(NETZ, 'klapptafel')
    const svg = tafelSvg(t)
    expect(svg).not.toContain('<filter')
    expect(svg).toContain('<pattern id=')
    const tb = leeresTafelbild()
    tb.inhalt = inhalt(NETZ)
    tb.meta.formate = ['klapptafel', 'heft']
    tb.tafeln = [t, setze(NETZ, 'heft')]
    const html = pdfHtml(tb, standardPdfWahl(tb))
    expect(html).not.toContain('<filter')
    expect(html).not.toContain('<pattern')
    // Karopapier als ein Linienpfad
    expect(html).not.toContain('-karo')
  })
})

describe('PowerPoint-Bilder', () => {
  it('jedes Bild (Hintergrund, Zeichnung, Symbol) hat eine viewBox ab 0 0 – sonst verzerrt die Umrechnung ins PNG', async () => {
    const tb = leeresTafelbild()
    tb.meta.formate = ['whiteboard', 'klapptafel']
    tb.inhalt = inhalt(NETZ)
    tb.tafeln = [setze(NETZ, 'whiteboard'), setze(NETZ, 'klapptafel')]
    const svgs: string[] = []
    await pptxFolien(tb, tb.meta.formate, false, async (svg) => {
      svgs.push(svg)
      return new Uint8Array([1])
    })
    expect(svgs.length).toBeGreaterThan(3)
    for (const svg of svgs) {
      const m = /viewBox="0 0 ([\d.]+) ([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg)
      expect(m, svg.slice(0, 120)).not.toBeNull()
      expect(Number(m![1])).toBeCloseTo(Number(m![3]), 1)
    }
  })
})

describe('Schrift unter der Empfehlung', () => {
  it('meldet EINEN Befund mit den Vorschlägen der App (Text kürzen, Elemente zusammenfassen)', () => {
    const i = inhalt(NETZ)
    const t = setzeLayout(i, 'whiteboard', { regler: meta().regler, varianten: meta().varianten }).tafel
    const b = pruefeTafel(t, { grade: 7, regler: meta().regler, inhalt: i }).filter((x) => x.art === 'schrift' && x.vorschlaege)
    expect(b).toHaveLength(1)
    expect(b[0].vorschlaege).toEqual(['kiKuerzen', 'zusammenfassen'])
    expect(b[0].elemente!.length).toBeGreaterThan(0)
  })

  it('beim Erzeugen kürzt die KI einmal automatisch – die Kästen mit zu kleiner Schrift', async () => {
    const m = meta({ formate: ['whiteboard'] })
    const i = inhalt(NETZ, m)
    const anfragen: { schemaName?: string; user: string }[] = []
    const k = {
      melde: () => undefined,
      bild: async () => '',
      ai: async <T>(a: { schemaName?: string; user: string }): Promise<T> => {
        anfragen.push(a)
        return { knoten: i.knoten.filter((x) => x.rolle !== 'zentrum').map((x) => ({ id: x.id, titel: x.titel, punkte: x.punkte.slice(0, 1) })) } as T
      }
    }
    const e = await setzeUndPruefe(i, m, k as never)
    expect(anfragen).toHaveLength(1)
    expect(anfragen[0].schemaName).toBe('tafelbild_kuerzen')
    expect(e.inhalt.knoten.find((x) => x.id === 'k5')!.punkte).toEqual(['Demokratie ohne Demokraten'])
  })

  it('Elemente zusammenfassen: die zwei kürzesten benachbarten Aspekte werden ein Kasten, Beziehungen ziehen mit', () => {
    const i = inhalt(NETZ)
    const [a, b] = zusammenfassPaar(i)!
    const neu = zusammenfassen(i)!
    expect(neu.knoten).toHaveLength(i.knoten.length - 1)
    const k = neu.knoten.find((x) => x.id === a.id)!
    expect(k.titel).toBe(`${a.titel} / ${b.titel}`)
    expect(k.punkte).toEqual([...a.punkte, ...b.punkte])
    expect(neu.beziehungen.every((x) => x.von !== b.id && x.nach !== b.id && x.von !== x.nach)).toBe(true)
    // Abläufe und Zeitleisten bleiben getrennt
    expect(zusammenfassPaar(inhalt(ZEITLEISTE))).toBeNull()
    expect(zusammenfassPaar(inhalt(KREISLAUF))).toBeNull()
  })
})
