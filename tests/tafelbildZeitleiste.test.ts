import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { FORMAT_IDS, formatInfo, type FormatId } from '../src/renderer/src/modules/tafelbild/formate'
import { setzeLayout } from '../src/renderer/src/modules/tafelbild/layout'
import { leeresTafelbild, type TafelbildMeta, type TbElement, type TbInhalt, type TbTafel } from '../src/renderer/src/modules/tafelbild/model'
import { inhaltAus, inhaltsProbleme, korrekturAnfrage, korrekturAus, zeitPositionen } from '../src/renderer/src/modules/tafelbild/prompt'
import { linienKonflikte, pruefeTafel, streckeDurch } from '../src/renderer/src/modules/tafelbild/pruefung'
import { kontextFuer, linienPunkte, tafelSvg } from '../src/renderer/src/modules/tafelbild/svg'
import { textBreite } from '../src/renderer/src/modules/tafelbild/textsatz'
import {
  achsenMass,
  kurzeZeit,
  markenLage,
  massstabPasst,
  ordneEreignisse,
  ordneFluss,
  ordneKreislauf,
  packe,
  zeitWert
} from '../src/renderer/src/modules/tafelbild/zeitleiste'
import { FLUSS, KREISLAUF, TABELLE } from './tafelbildBeispiele'

/*
 * Zeitleisten und Diagramme (Nachbesserung 30.09.2026) – Wunsch der Lehrkraft: „Die Texte und
 * Boxen werden z. B. unchronologisch und an falschen Stellen mit der Zeitleiste verbunden."
 *
 * Goldstandard: fünf Zeitleisten (Weimarer Republik, Französische Revolution, Lebenslauf,
 * Evolution in Millionen Jahren, Antike mit v. Chr.) – absichtlich UNGEORDNET geliefert, wie die KI
 * es tut – auf allen vier Formaten: Reihenfolge chronologisch, jeder Verbinder endet genau an SEINER
 * Marke, keine Überlappung, kein Verbinder kreuzt einen anderen oder läuft durch Kasten oder
 * Jahreszahl. Mit TAFELBILD_RENDER=<Ordner> entstehen die SVGs zum Ansehen.
 */

const meta = (o: Partial<TafelbildMeta> = {}): TafelbildMeta => ({ ...leeresTafelbild().meta, thema: 'Zeitleiste', ...o, varianten: { luecke: false, schritte: true, niveaus: false, merksatz: true } })

const lage = { x: -1, y: -1, w: -1, h: -1 }
const ev = (id: string, titel: string, zeit: string, punkte: string[] = [], o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  titel,
  punkte,
  rolle: 'ereignis',
  farbe: 'grund',
  symbol: '',
  zeit,
  niveau: 1,
  schritt: 2,
  lueckenWoerter: [],
  lage,
  ...o
})

const roh = (titel: string, knoten: Record<string, unknown>[], merksatz = ''): Record<string, unknown> => ({
  titel,
  struktur: 'zeitleiste',
  strukturGrund: 'Chronologie',
  impuls: '',
  knoten,
  beziehungen: [],
  aspekte: [],
  merksatz: { titel: 'Merke!', text: merksatz, lueckenWoerter: [] },
  hausaufgabe: '',
  zeichnungen: [],
  farbLegende: [],
  schritte: []
})

// Absichtlich durcheinander – so wie die KI Ereignisse oft liefert
export const GOLD: Record<string, Record<string, unknown>> = {
  weimar: roh(
    'Wie verlief die Weimarer Republik?',
    [
      ev('w5', 'Hitlerputsch', '9. November 1923', ['Putschversuch in München']),
      ev('w1', 'Novemberrevolution', '9. November 1918', ['Ausrufung der Republik']),
      ev('w7', 'Weltwirtschaftskrise', '1929', ['Massenarbeitslosigkeit']),
      ev('w3', 'Kapp-Putsch', 'März 1920', ['Generalstreik']),
      ev('w2', 'Weimarer Verfassung', '11. August 1919', ['Artikel 48']),
      ev('w8', 'Ernennung Hitlers', '30. Januar 1933', ['Ende der Republik']),
      ev('w4', 'Hyperinflation', '1923', ['Geld wertlos']),
      ev('w6', 'Hindenburg Präsident', '1925', ['Kaiserzeit-General'])
    ],
    'Die Republik scheiterte an Krisen und Gegnern.'
  ),
  revolution: roh('Wie verlief die Französische Revolution?', [
    ev('r4', 'Erklärung der Menschenrechte', '26. August 1789'),
    ev('r7', 'Staatsstreich Napoleons', '9. November 1799'),
    ev('r1', 'Generalstände', '5. Mai 1789'),
    ev('r5', 'Verfassung', '1791', ['konstitutionelle Monarchie']),
    ev('r2', 'Sturm auf die Bastille', '14. Juli 1789'),
    ev('r6', 'Terrorherrschaft', '1793–1794', ['Robespierre']),
    ev('r3', 'Ballhausschwur', '20. Juni 1789')
  ]),
  lebenslauf: roh('Welche Stationen prägten Einsteins Leben?', [
    ev('l3', 'Wunderjahr', '1905', ['Relativitätstheorie']),
    ev('l1', 'Geburt in Ulm', '1879'),
    ev('l6', 'Emigration in die USA', '1933'),
    ev('l2', 'Studium in Zürich', '1896'),
    ev('l5', 'Nobelpreis', '1921'),
    ev('l4', 'Allgemeine Relativitätstheorie', '1915'),
    ev('l7', 'Tod in Princeton', '1955')
  ]),
  evolution: roh('Wie entwickelte sich das Leben?', [
    ev('e4', 'Erste Dinosaurier', 'vor 230 Mio. Jahren'),
    ev('e1', 'Erste Zellen', 'vor 3,5 Mrd. Jahren'),
    ev('e6', 'Erste Menschen (Homo)', 'vor 2,5 Mio. Jahren'),
    ev('e2', 'Kambrische Explosion', 'vor 540 Mio. Jahren'),
    ev('e5', 'Aussterben der Dinosaurier', 'vor 66 Mio. Jahren'),
    ev('e3', 'Landpflanzen', 'vor 470 Mio. Jahren'),
    ev('e7', 'Homo sapiens', 'vor 300.000 Jahren')
  ]),
  antike: roh('Wie entstand das Römische Reich?', [
    ev('a4', 'Ermordung Caesars', '44 v. Chr.'),
    ev('a1', 'Erste Olympische Spiele', '776 v. Chr.'),
    ev('a6', 'Ende Westroms', '476 n. Chr.'),
    ev('a2', 'Gründung Roms (Sage)', '753 v. Chr.'),
    ev('a5', 'Tod des Augustus', '14 n. Chr.'),
    ev('a3', 'Römische Republik', '509 v. Chr.')
  ])
}

const ERWARTET: Record<string, string[]> = {
  weimar: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'],
  revolution: ['r1', 'r3', 'r2', 'r4', 'r5', 'r6', 'r7'],
  lebenslauf: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'],
  evolution: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'],
  antike: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']
}

const RENDER = process.env.TAFELBILD_RENDER

describe('Datum lesen', () => {
  it('versteht Jahr, Tagesdatum, Monat, v. Chr., Jahrhundert, Jahrtausend, Jahrzehnt und Erdzeitalter', () => {
    expect(zeitWert('1918')).toBe(1918)
    expect(Math.trunc(zeitWert('9. November 1918')!)).toBe(1918)
    expect(zeitWert('9. November 1918')!).toBeGreaterThan(zeitWert('1918')!)
    expect(Math.trunc(zeitWert('28.6.1914')!)).toBe(1914)
    expect(Math.trunc(zeitWert('1914-06-28')!)).toBe(1914)
    expect(zeitWert('Juli 1914')!).toBeLessThan(zeitWert('August 1914')!)
    expect(Math.trunc(zeitWert('Juli 1914 – 1918')!)).toBe(1914)
    expect(zeitWert('1789–1799')).toBe(1789)
    expect(zeitWert('44 v. Chr.')).toBe(-44)
    expect(zeitWert('um 3000 v. Chr.')).toBe(-3000)
    expect(zeitWert('15. Jh.')).toBe(1450)
    expect(zeitWert('Ende des 5. Jh. v. Chr.')).toBe(-410)
    expect(zeitWert('3. Jahrtausend v. Chr.')).toBe(-2500)
    expect(zeitWert('1920er Jahre')).toBe(1925)
    expect(zeitWert('vor 66 Mio. Jahren')).toBe(-66e6)
    expect(zeitWert('vor 3,5 Mrd. Jahren')).toBe(-3.5e9)
    expect(zeitWert('vor 10.000 Jahren')).toBe(-10000)
    expect(zeitWert('mit 6 Jahren (1996)')).toBe(1996)
    // Tag und Monat ohne Jahr sind keine lesbare Zeit (vorher: Jahr 14)
    expect(zeitWert('14. Juli')).toBeNull()
    expect(zeitWert('Steinzeit')).toBeNull()
    expect(zeitWert('')).toBeNull()
  })

  it('kürzt lange Angaben für die Achse', () => {
    expect(kurzeZeit('9. November 1918')).toBe('9.11.1918')
    expect(kurzeZeit('November 1918')).toBe('Nov. 1918')
    expect(kurzeZeit('Mai 1789')).toBe('Mai 1789')
    expect(kurzeZeit('44 v. Chr.')).toBe('44 v. Chr.')
  })
})

describe('Ereignisse ordnen und Marken setzen', () => {
  for (const [name, r] of Object.entries(GOLD))
    it(`${name}: chronologisch, gleiche Zeit = eine Marke`, () => {
      const i = inhaltAus(r, meta())
      expect(i.knoten.map((k) => k.id)).toEqual(ERWARTET[name])
      // Der Aufbau folgt der Zeit
      const s = i.knoten.map((k) => k.schritt)
      expect([...s].sort((a, b) => a - b)).toEqual(s)
    })

  it('ohne Datum bleibt ein Ereignis hinter seinem Vorgänger in der Reihenfolge der KI', () => {
    const k = (id: string, zeit: string): never => ({ id, titel: id, punkte: [], rolle: 'ereignis', farbe: 'grund', zeit, niveau: 1, schritt: 1, lueckenWoerter: [] }) as never
    expect(ordneEreignisse([k('b', '1920'), k('c', ''), k('a', '1910')]).map((e) => e.knoten.id)).toEqual(['a', 'b', 'c'])
  })

  it('maßstabsgerecht, wenn die Abstände es erlauben; sonst gleichabständig', () => {
    expect(massstabPasst([1918, 1919, 1920, 1923, 1925, 1929, 1933])).toBe(true)
    expect(massstabPasst([1879, 1896, 1905, 1915, 1921, 1933, 1955])).toBe(true)
    // Monate 1789 neben 1799, Erdzeitalter, Antike: gleichabständig
    expect(massstabPasst(GOLD.revolution.knoten ? (GOLD.revolution.knoten as { zeit: string }[]).map((k) => zeitWert(k.zeit)!) : [])).toBe(false)
    expect(massstabPasst((GOLD.evolution.knoten as { zeit: string }[]).map((k) => zeitWert(k.zeit)!))).toBe(false)
    const { marken, art } = markenLage(ordneEreignisse(inhaltAus(GOLD.antike, meta()).knoten), 'gleich')
    expect(art).toBe('gleich')
    expect(marken.map((m) => m.t)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    const m = markenLage(ordneEreignisse(inhaltAus(GOLD.lebenslauf, meta()).knoten), 'massstab')
    expect(m.marken[1].t).toBeCloseTo((1896 - 1879) / (1955 - 1879), 6)
  })

  it('packt Kästen in Reihenfolge ohne Überlappung in den Bereich', () => {
    const a = packe([10, 12, 14, 90], [20, 20, 20, 20], 0, 100, 2)
    expect(a[0]).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i - 1] + 22 - 1e-9)
    expect(a[3] + 20).toBeLessThanOrEqual(100 + 1e-9)
  })

  it('Zeitstrahl als Zeichnung: chronologisch, mit Maßstab bzw. gleichmäßig', () => {
    const z = zeitPositionen([
      { label: 'Ende', wert: '1933', x: 0 },
      { label: 'Gründung', wert: '1919', x: 0 },
      { label: 'Inflation', wert: '1923', x: 0 }
    ])
    expect(z.map((x) => x.label)).toEqual(['Gründung', 'Inflation', 'Ende'])
    expect(z[1].x).toBeCloseTo(4 / 14, 6)
  })
})

/** Rechteck der Jahreszahl an Marke i (wie im SVG gezeichnet) */
function beschriftungen(t: TbTafel, achse: TbElement): { i: number; r: { x: number; y: number; w: number; h: number } }[] {
  const f = formatInfo(t.format)
  const d = achse.diagramm!
  const m = achsenMass(d, achse.x * f.breite, achse.y * f.hoehe, achse.w * f.breite, achse.h * f.hoehe, (achse.schrift ?? 0) * f.hoehe, t.schrift)
  const g = m.g
  return d.eintraege.map((e, i) => {
    const t0 = m.a0 + (m.quer ? e.x! : e.y!) * (m.a1 - m.a0)
    if (m.quer) {
      const w = textBreite(e.wert ?? '', g * 0.85, t.schrift) * 1.06
      const oben = m.seiten[i] < 0
      return { i, r: { x: t0 - w / 2, y: oben ? m.linie - g * 0.55 - g * 0.85 * 1.25 : m.linie + g * 0.5, w, h: g * 0.85 * 1.1 } }
    }
    const links = m.seiten[i] < 0
    const platz = links ? m.linie - g * 0.6 - achse.x * f.breite : achse.x * f.breite + achse.w * f.breite - m.linie - g * 0.6
    const gl = Math.max(g * 0.5, Math.min(g * 0.85, (g * 0.85 * platz) / Math.max(1, textBreite(e.wert ?? '', g * 0.85, t.schrift))))
    const w = Math.min(platz, textBreite(e.wert ?? '', gl, t.schrift) * 1.06)
    return { i, r: { x: links ? m.linie - g * 0.6 - w : m.linie + g * 0.6, y: t0 - gl * 0.55, w, h: gl * 1.1 } }
  })
}

describe('Goldstandard: Zeitleisten auf allen Formaten', () => {
  for (const [name, r] of Object.entries(GOLD))
    for (const format of FORMAT_IDS)
      it(`${name} auf ${format}: chronologisch, Verbinder an der richtigen Marke, keine Überschneidung`, () => {
        const m = meta()
        const i: TbInhalt = inhaltAus(r, m)
        const { tafel } = setzeLayout(i, format as FormatId, { regler: m.regler, varianten: m.varianten })
        if (RENDER) {
          mkdirSync(RENDER, { recursive: true })
          writeFileSync(join(RENDER, `zeitleiste-${name}-${format}.svg`), tafelSvg(tafel, { ohneTextur: true }))
        }
        const k = kontextFuer(tafel)
        const alle = new Map(tafel.elemente.map((e) => [e.id, e]))
        const achse = tafel.elemente.find((e) => e.diagramm?.art === 'zeitstrahl')!
        expect(achse).toBeTruthy()
        const quer = achse.w * k.W >= achse.h * k.H
        const verbinder = tafel.elemente.filter((e) => e.typ === 'verbinder')
        expect(verbinder).toHaveLength(i.knoten.length)
        // Jeder Verbinder endet an SEINER Marke: die Beschriftung der Marke ist das Datum seines Ereignisses
        const lagen: number[] = []
        for (const kn of i.knoten) {
          const kasten = tafel.elemente.find((e) => e.knoten === kn.id && e.typ === 'kasten')!
          const v = verbinder.find((x) => x.von === kasten.id)!
          expect(v.nach).toBe(achse.id)
          expect(achse.diagramm!.eintraege[v.marke!].wert).toBe(kurzeZeit(kn.zeit!))
          const l = linienPunkte(k, v, alle)!
          const a = achsenMass(achse.diagramm!, achse.x * k.W, achse.y * k.H, achse.w * k.W, achse.h * k.H, (achse.schrift ?? 0) * k.H, k.schrift)
          // Ende genau auf der Achsenlinie
          expect(Math.abs((quer ? l.b.y : l.b.x) - a.linie)).toBeLessThan(0.5)
          lagen.push(quer ? l.b.x : l.b.y)
        }
        // Chronologisch: die Marken folgen der Zeit (gleiche Zeit = gleiche Marke)
        for (let j = 1; j < lagen.length; j++) expect(lagen[j]).toBeGreaterThanOrEqual(lagen[j - 1] - 1e-6)
        // Keine Überlappung, nichts über den Rand, keine Kreuzung, kein Verbinder durch einen Kasten
        const b = pruefeTafel(tafel, { grade: 7, regler: m.regler, inhalt: i })
        expect(b.filter((x) => x.art === 'ueberlappung' || x.art === 'rand').map((x) => x.text)).toEqual([])
        expect(linienKonflikte(tafel).map((x) => x.text)).toEqual([])
        // Kein Verbinder läuft durch eine Jahreszahl
        for (const s of beschriftungen(tafel, achse))
          for (const v of verbinder) {
            const l = linienPunkte(k, v, alle)!
            if (v.marke === s.i) continue
            expect(streckeDurch(l.a, l.b, s.r, 0), `${name}/${format}: Verbinder durch „${achse.diagramm!.eintraege[s.i].wert}"`).toBe(false)
          }
        // Jahreszahlen überdecken sich nicht
        const r2 = beschriftungen(tafel, achse)
        for (let x = 0; x < r2.length; x++)
          for (let y = x + 1; y < r2.length; y++) {
            const p = r2[x].r
            const q = r2[y].r
            const ueber = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
            expect(ueber, `${name}/${format}: Jahreszahlen ${x} und ${y} überdecken sich`).toBe(false)
          }
      })
})

describe('Validierung der KI-Antwort', () => {
  it('fehlendes oder unlesbares Datum, Jahr im Titel passt nicht: Korrekturanfrage mit genau diesen Fehlern', () => {
    const r = roh('Test', [ev('a', 'Kriegsbeginn 1914', '1918'), ev('b', 'Revolution', ''), ev('c', 'Sturm', '14. Juli')])
    const i = inhaltAus(r, meta())
    const p = inhaltsProbleme(i)
    expect(p.map((x) => x.knoten).sort()).toEqual(['a', 'b', 'c'])
    const a = korrekturAnfrage(meta(), i, p)
    expect(a.schemaName).toBe('tafelbild_korrektur')
    expect(a.user).toContain('kein Datum')
    expect(a.user).toContain('ZEITLEISTE')
    const neu = korrekturAus({ knoten: [{ id: 'a', titel: '', zeit: '1914', punkte: [] }, { id: 'b', titel: '', zeit: '9. November 1918', punkte: [] }, { id: 'c', titel: '', zeit: '14. Juli 1789', punkte: [] }] }, i)
    expect(inhaltsProbleme(neu)).toEqual([])
    expect(neu.knoten.map((k) => k.id)).toEqual(['c', 'a', 'b'])
  })

  it('Tabelle: jede Spalte genau ein Eintrag je Aspekt, sonst Korrektur; Aspektname am Anfang fällt weg', () => {
    const t = structuredClone(TABELLE) as Record<string, unknown>
    const kn = t.knoten as { punkte: string[] }[]
    const aspekte = t.aspekte as string[]
    kn[0].punkte = kn[0].punkte.slice(0, aspekte.length - 1)
    kn[1].punkte = kn[1].punkte.map((p, j) => `${aspekte[j]}: ${p}`)
    const i = inhaltAus(t, meta({ struktur: 'tabelle' }))
    expect(inhaltsProbleme(i).length).toBe(1)
    expect(i.knoten[1].punkte.every((p, j) => !p.startsWith(`${aspekte[j]}:`))).toBe(true)
    const a = korrekturAnfrage(meta(), i, inhaltsProbleme(i))
    expect(a.user).toContain(`GENAU ${aspekte.length} Einträge`)
  })
})

describe('Kreislauf und Flussdiagramm: Reihenfolge nach den Pfeilen', () => {
  const k = (id: string): never => ({ id, titel: id, punkte: [], rolle: 'schritt', farbe: 'grund', niveau: 1, schritt: 1, lueckenWoerter: [] }) as never
  const b = (von: string, nach: string): never => ({ von, nach, beschriftung: '', art: 'pfeil' }) as never
  it('Kreislauf folgt dem Ring der Beziehungen', () => {
    expect(ordneKreislauf([k('a'), k('c'), k('b'), k('d')], [b('a', 'b'), b('b', 'c'), b('c', 'd'), b('d', 'a')]).map((x) => (x as { id: string }).id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('Fluss topologisch: kein Pfeil zurück', () => {
    expect(ordneFluss([k('c'), k('a'), k('b')], [b('a', 'b'), b('b', 'c')]).map((x) => (x as { id: string }).id)).toEqual(['a', 'b', 'c'])
  })
  for (const format of FORMAT_IDS)
    for (const [name, beispiel] of [
      ['fluss', FLUSS],
      ['kreislauf', KREISLAUF]
    ] as const)
      it(`${name} auf ${format}: keine kreuzenden Pfeile, kein Pfeil durch einen Kasten`, () => {
        const m = meta()
        // Knoten durcheinander – die Pfeile bestimmen die Reihenfolge
        const r = structuredClone(beispiel) as Record<string, unknown>
        r.knoten = [...(r.knoten as unknown[])].reverse()
        if (name === 'kreislauf')
          r.beziehungen = [
            { von: 'k1', nach: 'k2', beschriftung: '', art: 'pfeil' },
            { von: 'k2', nach: 'k3', beschriftung: '', art: 'pfeil' },
            { von: 'k3', nach: 'k4', beschriftung: '', art: 'pfeil' },
            { von: 'k4', nach: 'k1', beschriftung: '', art: 'pfeil' }
          ]
        const i = inhaltAus(r, m)
        expect(i.knoten.map((x) => x.id)).toEqual(['k1', 'k2', 'k3', 'k4'])
        const { tafel } = setzeLayout(i, format, { regler: m.regler, varianten: m.varianten })
        if (RENDER) writeFileSync(join(RENDER, `${name}-${format}.svg`), tafelSvg(tafel, { ohneTextur: true }))
        expect(linienKonflikte(tafel).map((x) => x.text)).toEqual([])
      })
})
