import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { FORMAT_IDS, formatInfo, kontrast, PALETTEN } from '../src/renderer/src/modules/tafelbild/formate'
import { parseFunktion } from '../src/renderer/src/modules/tafelbild/funktion'
import { jahrAus, schneidet, setzeLayout } from '../src/renderer/src/modules/tafelbild/layout'
import { leeresTafelbild, normalisiere, worte, type TafelbildMeta, type TbInhalt } from '../src/renderer/src/modules/tafelbild/model'
import { elementAus, inhaltAnfrage, inhaltAus, kuerzenAus } from '../src/renderer/src/modules/tafelbild/prompt'
import { pruefeTafel } from '../src/renderer/src/modules/tafelbild/pruefung'
import { tafelSvg } from '../src/renderer/src/modules/tafelbild/svg'
import { umbrechen } from '../src/renderer/src/modules/tafelbild/textsatz'
import { LUECKE, lueckenText, sichtbareElemente, wortspeicher } from '../src/renderer/src/modules/tafelbild/varianten'
import { ALLE, FLUSS, NETZ, TABELLE } from './tafelbildBeispiele'

/*
 * Programm „Tafelbilder" (30.09.2026): Modell, deterministisches Layout ohne Überlappung,
 * Mindestschrift je Format, Prompt-Regeln aus der Recherche, Varianten, SVG gültig.
 */
const meta = (o: Partial<TafelbildMeta> = {}): TafelbildMeta => ({ ...leeresTafelbild().meta, thema: 'Weimarer Republik', ...o, varianten: { luecke: true, schritte: true, niveaus: true, merksatz: true, ...(o.varianten ?? {}) } })

const inhalt = (roh: unknown, m = meta()): TbInhalt => inhaltAus(roh, m)

function wohlgeformt(svg: string): boolean {
  const fehler: string[] = []
  new DOMParser({ errorHandler: { error: (m: string) => void fehler.push(m), fatalError: (m: string) => void fehler.push(m) } }).parseFromString(svg, 'image/svg+xml')
  if (fehler.length) console.log(fehler.slice(0, 3))
  return fehler.length === 0
}

describe('Modell', () => {
  it('ein leeres Tafelbild hat Lerngruppe, Formate und Regler; normalisiere ergänzt Fehlendes', () => {
    const t = leeresTafelbild({ grade: 5, schoolTypeName: 'Oberschule' })
    expect(t.meta.regler.sprache).toBe('einfach')
    expect(t.meta.regler.stil).toBe('ausformuliert')
    expect(leeresTafelbild({ grade: 12 }).meta.regler.sprache).toBe('fach')
    const n = normalisiere({ ...t, meta: { ...t.meta, formate: [] as never[], varianten: undefined as never } })
    expect(n.meta.formate.length).toBeGreaterThan(0)
    expect(n.meta.varianten.merksatz).toBe(true)
  })
  it('zählt Wörter ohne Stichpunktzeichen', () => {
    expect(worte('• Versailler Vertrag\n• Inflation 1923')).toBe(4)
  })
})

describe('Antwort der KI', () => {
  it('bereinigt Knoten, Beziehungen, Lückenwörter und Symbole', () => {
    const i = inhalt({ ...NETZ, knoten: [...NETZ.knoten, { ...NETZ.knoten[1], id: 'k2' }], beziehungen: [...NETZ.beziehungen, { von: 'k1', nach: 'x9', beschriftung: '', art: 'pfeil' }] })
    expect(new Set(i.knoten.map((k) => k.id)).size).toBe(i.knoten.length)
    expect(i.beziehungen.every((b) => i.knoten.some((k) => k.id === b.nach))).toBe(true)
    expect(i.knoten[1].symbol).toBe('blitz')
    expect(i.knoten[1].lueckenWoerter).toEqual(['Dolchstoßlegende'])
    expect(i.merksatz?.lueckenWoerter).toEqual(['Ursachen'])
    expect(i.zeichnungen[0].diagramm?.art).toBe('zeitstrahl')
  })
  it('hält die gewählte Struktur ein, auch wenn die KI anders wählt', () => {
    expect(inhalt(NETZ, meta({ struktur: 'fluss' })).struktur).toBe('fluss')
  })
  it('ohne Lückenfassung und ohne Niveaus: keine Lückenwörter, alles Niveau 1', () => {
    const i = inhalt(NETZ, meta({ varianten: { luecke: false, schritte: true, niveaus: false, merksatz: true } }))
    expect(i.knoten.every((k) => !k.lueckenWoerter.length && k.niveau === 1)).toBe(true)
  })
  it('ohne Zeichnungen: keine Symbole, keine Zeichnungen', () => {
    const i = inhalt(NETZ, meta({ regler: { ...meta().regler, zeichnungen: 0 } }))
    expect(i.zeichnungen).toEqual([])
    expect(i.knoten.some((k) => k.symbol)).toBe(false)
  })
  it('ohne Knoten ist es ein Fehler', () => {
    expect(() => inhalt({ ...NETZ, knoten: [] })).toThrow()
  })
  it('kürzen ersetzt Punkte, Lückenwörter bleiben nur, wenn sie noch vorkommen', () => {
    const i = inhalt(NETZ)
    const k = kuerzenAus({ knoten: [{ id: 'k2', titel: 'Politik', punkte: ['Versailles'] }] }, i)
    expect(k.knoten[1].punkte).toEqual(['Versailles'])
    expect(k.knoten[1].lueckenWoerter).toEqual([])
  })
  it('ein überarbeitetes Element behält nur passende Lückenwörter', () => {
    const e = elementAus({ titel: 'Wirtschaft', text: '• Hyperinflation', lueckenWoerter: ['Hyperinflation', 'Börse'], symbol: 'geld', tex: '', prompt: '', mitDiagramm: false, diagramm: {} }, {
      id: 'x',
      typ: 'kasten',
      x: 0,
      y: 0,
      w: 0.1,
      h: 0.1,
      text: '',
      farbe: 'grund',
      schritt: 1
    })
    expect(e.lueckenWoerter).toEqual(['Hyperinflation'])
    expect(e.symbol).toBe('geld')
  })
})

describe('Prompt-Regeln aus der Recherche', () => {
  const a = inhaltAnfrage(meta({ operatoren: ['erläutern', 'beurteilen'] }), [{ name: 'Quelle.pdf', text: 'Text über Versailles' }], [])
  it('Systemauftrag: Leitfrage, Reduktion, Farben mit fester Bedeutung, Rot/Grün nie allein, Pfeilbedeutung, Merksatz', () => {
    for (const s of ['Leitfrage', 'Reduktion', 'FESTER Bedeutung', 'EINZIGE Unterscheidungsmerkmal', 'Folge/führt zu', 'Merksatz']) expect(a.system).toContain(s)
    expect(a.system).toContain('FACH GESELLSCHAFT')
  })
  it('Auftrag: Textmenge, Detailgrad, Sprache, Material, Operatoren, Lücken, Schritte, Niveaus', () => {
    expect(a.user).toMatch(/höchstens etwa \d+ Wörter/)
    for (const s of ['DETAILGRAD', 'SPRACHE', 'MATERIAL DER LEHRKRAFT', 'Versailles', 'erläutern, beurteilen', 'LÜCKENTAFELBILD', 'SCHRITTWEISER AUFBAU', 'DIFFERENZIERUNG']) expect(a.user).toContain(s)
    expect(a.schemaName).toBe('tafelbild_inhalt')
  })
  it('Foto-Übernahme verlangt wörtliche Übertragung und Lage', () => {
    const f = inhaltAnfrage(meta({ modus: 'foto' }), [], ['data:image/png;base64,AAA'])
    expect(f.user).toContain('FOTOGRAFIERTE TAFELBILD')
    expect(f.images?.length).toBe(1)
  })
  it('die engste Tafel bestimmt die Textmenge', () => {
    const nurHeft = inhaltAnfrage(meta({ formate: ['heft'] }), [], [])
    const mitTafel = inhaltAnfrage(meta({ formate: ['heft', 'flipchart'] }), [], [])
    const zahl = (s: string): number => Number(/höchstens etwa (\d+) Wörter/.exec(s)?.[1])
    expect(zahl(mitTafel.user)).toBeLessThan(zahl(nurHeft.user))
  })
})

describe('Layout', () => {
  for (const [name, roh] of Object.entries(ALLE)) {
    for (const format of FORMAT_IDS) {
      it(`${name} auf ${format}: keine Überlappung, nichts über den Rand, Schrift nie unter der Notfallschrift`, () => {
        const i = inhalt(roh)
        const m = meta()
        const { tafel, ueberlauf } = setzeLayout(i, format, { regler: m.regler, varianten: m.varianten })
        const b = pruefeTafel(tafel, { grade: 7, regler: m.regler, inhalt: i })
        expect(b.filter((x) => x.art === 'ueberlappung' || x.art === 'rand').map((x) => x.text)).toEqual([])
        const f = formatInfo(format)
        for (const e of tafel.elemente.filter((x) => x.typ === 'kasten' || x.typ === 'merksatz')) {
          expect(e.schrift!).toBeGreaterThanOrEqual(f.schrift.notfall * 0.999)
          // Unter der empfohlenen Schrift nur mit Befund
          if (e.schrift! < f.schrift.min * 0.999) expect(ueberlauf.length).toBeGreaterThan(0)
        }
        // Überschrift vorhanden
        expect(tafel.elemente[0].typ).toBe('text')
        expect(wohlgeformt(tafelSvg(tafel))).toBe(true)
      })
    }
  }

  it('ist deterministisch (gleiche Lage bei gleichem Inhalt)', () => {
    const i = inhalt(NETZ)
    const a = setzeLayout(i, 'klapptafel', { regler: meta().regler, varianten: meta().varianten }).tafel.elemente.map((e) => [e.typ, e.x, e.y, e.w, e.h])
    const b = setzeLayout(i, 'klapptafel', { regler: meta().regler, varianten: meta().varianten }).tafel.elemente.map((e) => [e.typ, e.x, e.y, e.w, e.h])
    expect(a).toEqual(b)
  })

  it('Klapptafel: Merksatz auf dem rechten Flügel, Impuls auf dem linken, Ergebnis in der Mitte', () => {
    const i = inhalt(NETZ)
    const { tafel } = setzeLayout(i, 'klapptafel', { regler: meta().regler, varianten: meta().varianten })
    const merk = tafel.elemente.find((e) => e.typ === 'merksatz')!
    expect(merk.x).toBeGreaterThanOrEqual(0.75)
    const impuls = tafel.elemente.find((e) => e.titel === 'Impuls')!
    expect(impuls.x + impuls.w).toBeLessThanOrEqual(0.25)
    for (const e of tafel.elemente.filter((x) => x.knoten)) {
      expect(e.x).toBeGreaterThanOrEqual(0.25)
      expect(e.x + e.w).toBeLessThanOrEqual(0.75)
    }
  })

  it('Tabelle wird zur Tabelle mit Aspekten, Zeitleiste hat einen Zeitstrahl mit konstantem Maßstab', () => {
    const t = setzeLayout(inhalt(TABELLE), 'whiteboard', { regler: meta().regler, varianten: meta().varianten }).tafel
    expect(t.elemente.some((e) => e.diagramm?.art === 'tabelle' && e.diagramm.zeilen?.length === 3)).toBe(true)
    const z = setzeLayout(inhalt(ALLE.zeitleiste), 'klapptafel', { regler: meta().regler, varianten: meta().varianten }).tafel
    const achse = z.elemente.find((e) => e.diagramm?.art === 'zeitstrahl')!
    const xs = achse.diagramm!.eintraege.map((e) => e.x!)
    // Eine Marke je Zeitpunkt (zweimal 1789 = eine Marke): 1789 → 0, 1799 → 1, 1791 → 0,2
    expect(xs).toHaveLength(4)
    expect(xs[0]).toBe(0)
    expect(xs[xs.length - 1]).toBe(1)
    expect(xs[1]).toBeCloseTo(0.2, 5)
    expect(jahrAus('44 v. Chr.')).toBe(-44)
    expect(jahrAus('15. Jh.')).toBe(1450)
  })

  it('Fluss: Pfeile folgen den Beziehungen; Schritte lückenlos', () => {
    const t = setzeLayout(inhalt(FLUSS), 'flipchart', { regler: meta().regler, varianten: meta().varianten }).tafel
    const pfeile = t.elemente.filter((e) => e.typ === 'verbinder')
    expect(pfeile.length).toBe(3)
    expect(pfeile[1].text).toBe('kühlt ab')
    const schritte = [...new Set(t.elemente.map((e) => e.schritt))].sort((a, b) => a - b)
    expect(schritte).toEqual(Array.from({ length: schritte.length }, (_, i) => i + 1))
  })

  it('viel zu viel Text: nie Überlappung, sondern verkleinert mit Befund', () => {
    const lang = { ...NETZ, knoten: NETZ.knoten.map((k) => ({ ...k, punkte: Array(6).fill('ein sehr langer Stichpunkt mit vielen überflüssigen Wörtern darin') })) }
    const i = inhalt(lang)
    const r = setzeLayout(i, 'whiteboard', { regler: meta().regler, varianten: meta().varianten })
    const b = pruefeTafel(r.tafel, { grade: 7, regler: meta().regler, inhalt: i })
    expect(b.some((x) => x.art === 'text' && x.schwer)).toBe(true)
    expect(b.filter((x) => x.art === 'ueberlappung' || x.art === 'rand')).toEqual([])
    expect(r.ueberlauf.some((t) => /kürzen/i.test(t))).toBe(true)
  })
})

describe('Prüfung', () => {
  it('meldet Überlappung, zu viele Farben und Rot/Grün ohne Symbol', () => {
    const i = inhalt(NETZ)
    const { tafel } = setzeLayout(i, 'whiteboard', { regler: meta().regler, varianten: meta().varianten })
    const kaesten = tafel.elemente.filter((e) => e.typ === 'kasten')
    kaesten[2].x = kaesten[1].x
    kaesten[2].y = kaesten[1].y
    kaesten[1].farbe = 'rot'
    kaesten[1].symbol = undefined
    kaesten[2].farbe = 'gruen'
    kaesten[2].symbol = undefined
    kaesten[3].farbe = 'orange'
    const b = pruefeTafel(tafel, { grade: 7, regler: meta().regler, inhalt: i })
    expect(b.some((x) => x.art === 'ueberlappung')).toBe(true)
    expect(b.some((x) => x.art === 'farbe' && /Farben/.test(x.text))).toBe(true)
    expect(b.some((x) => x.art === 'kontrast' && /Rot und Grün/.test(x.text))).toBe(true)
  })
  it('alle Farben aller Paletten haben genug Kontrast zum Grund (Gelb auf Weiß nur als Marker)', () => {
    for (const p of Object.values(PALETTEN)) for (const [n, c] of Object.entries(p.farben)) if (!(n === 'gelb' && p.marker)) expect(kontrast(c, p.hintergrund)).toBeGreaterThanOrEqual(4.5)
  })
  it('schneidet erkennt Überlappung', () => {
    expect(schneidet({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(schneidet({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 10, h: 10 })).toBe(false)
  })
})

describe('Varianten', () => {
  it('Lücken sind gleich lang und ersetzen ganze Wörter', () => {
    expect(lueckenText('Die Inflation 1923 und die Inflationsrate', ['Inflation'])).toBe(`Die ${LUECKE} 1923 und die Inflationsrate`)
    expect(lueckenText('Artikel 48 (Notverordnung)', ['Notverordnung', 'Artikel 48'])).toBe(`${LUECKE} (${LUECKE})`)
  })
  it('Niveaus und Schritte blenden Elemente aus; Verbinder nur mit beiden Enden', () => {
    const i = inhalt(NETZ)
    const { tafel } = setzeLayout(i, 'klapptafel', { regler: meta().regler, varianten: meta().varianten })
    const alle = tafel.elemente.length
    const stern1 = sichtbareElemente(tafel, { niveau: 1 })
    expect(stern1.length).toBeLessThan(alle)
    expect(stern1.some((e) => e.typ === 'merksatz')).toBe(true)
    const ids = new Set(stern1.map((e) => e.id))
    for (const v of stern1.filter((e) => e.typ === 'verbinder')) expect(ids.has(v.von!) && ids.has(v.nach!)).toBe(true)
    expect(sichtbareElemente(tafel, { schritt: 1 }).length).toBeLessThan(sichtbareElemente(tafel, { schritt: 3 }).length)
  })
  it('Wortspeicher enthält die Lückenwörter alphabetisch; das SVG zeigt ihn unter der Tafel', () => {
    const i = inhalt(NETZ)
    const { tafel } = setzeLayout(i, 'heft', { regler: meta().regler, varianten: meta().varianten })
    expect(wortspeicher(tafel, { luecke: true })).toEqual(['Dolchstoßlegende', 'Ursachen'])
    const svg = tafelSvg(tafel, { luecke: true, wortspeicher: true })
    expect(svg).toContain('Wortspeicher')
    expect(svg).toContain(LUECKE)
    expect(svg).not.toContain('>• Dolchstoßlegende<')
    expect(wohlgeformt(svg)).toBe(true)
  })
})

describe('Textsatz und Funktionen', () => {
  it('bricht um und trennt überlange Wörter', () => {
    const z = umbrechen('Donaudampfschifffahrtsgesellschaftskapitän fährt', 200, 40, 'druck')
    expect(z.length).toBeGreaterThan(1)
    expect(z.every((x) => x.length > 0)).toBe(true)
  })
  it('wertet Funktionsterme sicher aus', () => {
    expect(parseFunktion('0.5x^2 - 1')!(2)).toBeCloseTo(1)
    expect(parseFunktion('f(x) = 2·x + 1')!(3)).toBe(7)
    expect(parseFunktion('sin(pi/2)')!(0)).toBeCloseTo(1)
    expect(parseFunktion('x²')!(3)).toBe(9)
    expect(parseFunktion('alert(1)')).toBeNull()
  })
})
