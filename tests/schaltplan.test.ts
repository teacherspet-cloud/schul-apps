import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StructuredRequest } from '../src/shared/types'
import { checkImages } from '../src/renderer/src/modules/arbeitsblatt/didactics/imageDesign'
import { abgleichMitBeschreibung, istSchaltplan, schaltplanAusBeschreibung, schaltplanBild, zeichneSchaltplan } from '../src/renderer/src/modules/arbeitsblatt/generation/schaltplan'
import { completeWorksheetImages } from '../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { ImageBlock, TaskBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { ImageLabelLayer } from '../src/renderer/src/modules/arbeitsblatt/render/ImageLabels'
import { beschriftetesBildSvg } from '../src/renderer/src/modules/arbeitsblatt/render/beschriftungSvg'
import { imageSizeFromDataUrl } from '../src/renderer/src/shared/imageSize'
import { analysiereKreis, leseSchaltplan, type Baum } from '../src/renderer/src/modules/arbeitsblatt/render/schaltplanNetz'
import {
  sanitizeSchaltplan,
  schaltplanBreiteProzent,
  schaltplanEinrasten,
  schaltplanZeichnen,
  STRICH_MM,
  svgAusDataUrl,
  verwaisteBeschriftungen,
  type Kasten,
  type SchaltplanSpec
} from '../src/renderer/src/modules/arbeitsblatt/render/schaltplanSvg'
import type { ImageServices } from '../src/renderer/src/shared/imageChoice'

/*
 * Wache für gezeichnete Schaltpläne (30.09.2026, 2. Fassung).
 * Rückmeldung der Lehrkraft (Physik): „Die Schaltzeichnungen kann man nicht erkennen. Die neue Art,
 * die Bilder zu generieren, ist unzuverlässig (und zu klein)." Nachgestellt: Bild neben der Aufgabe
 * 13 mm breit, unbekannte Bauteile (Diode, Klingel, Taster, Wechselschalter) stumm verworfen,
 * keine Prüfung auf geschlossene Kreise, bei leerer Antwort fremde Bilder aus der Bildsuche.
 */

const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'physik', subjectLabel: 'Physik', topic: 'Wann leuchtet die Lampe?', grade: 5 }

const T = (id: string, art: string, von: string, nach: string, beschriftung = '', leer = false, extra: Record<string, unknown> = {}) => ({ id, art, von, nach, beschriftung, leer, ...extra })

// ---------- Goldstandard: typische Schaltungen Klasse 5–10 ----------

const GOLD: { name: string; roh: unknown; knoten: number; arten: string[] }[] = [
  { name: 'einfacher Stromkreis', knoten: 0, arten: ['batterie', 'lampe', 'schalter_geschlossen'], roh: { kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n', 'Batterie'), T('L1', 'lampe', 'p', 'a', 'Lampe'), T('S1', 'schalter_geschlossen', 'a', 'n', 'Schalter')] }] } },
  {
    name: 'offen / geschlossen',
    knoten: 0,
    arten: ['batterie', 'lampe', 'schalter_offen', 'batterie', 'lampe', 'schalter_geschlossen'],
    roh: {
      kreise: [
        { titel: 'A: Schalter offen', bauteile: [T('B1', 'batterie', 'p', 'n', 'Batterie', true), T('L1', 'lampe', 'p', 'a', 'Lampe', true), T('W1', 'leitung', 'a', 'b', 'Leitungen', true), T('S1', 'schalter_offen', 'b', 'n', 'Unterbrechung', true)] },
        { titel: 'B: Schalter geschlossen', bauteile: [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'a'), T('S1', 'schalter_geschlossen', 'a', 'n', 'Schalter', true)] }
      ]
    }
  },
  { name: 'Reihenschaltung', knoten: 0, arten: ['batterie', 'schalter_geschlossen', 'lampe', 'lampe'], roh: { kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n', 'Batterie'), T('S1', 'schalter_geschlossen', 'p', 'a', 'Schalter'), T('L1', 'lampe', 'a', 'b', 'Lampe 1'), T('L2', 'lampe', 'b', 'n', 'Lampe 2')] }] } },
  { name: 'Parallelschaltung', knoten: 2, arten: ['batterie', 'schalter_geschlossen', 'lampe', 'lampe'], roh: { kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n', 'Batterie'), T('S1', 'schalter_geschlossen', 'p', 'a', 'Schalter'), T('L1', 'lampe', 'a', 'n', 'Lampe 1'), T('L2', 'lampe', 'a', 'n', 'Lampe 2')] }] } },
  { name: 'UND-Schaltung', knoten: 0, arten: ['batterie', 'schalter_offen', 'schalter_geschlossen', 'lampe'], roh: { kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n'), T('S1', 'schalter_offen', 'p', 'a', 'S1'), T('S2', 'schalter_geschlossen', 'a', 'b', 'S2'), T('L1', 'lampe', 'b', 'n', 'Lampe')] }] } },
  { name: 'ODER-Schaltung', knoten: 2, arten: ['batterie', 'schalter_offen', 'schalter_geschlossen', 'lampe'], roh: { kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n'), T('S1', 'schalter_offen', 'p', 'a', 'S1'), T('S2', 'schalter_geschlossen', 'p', 'a', 'S2'), T('L1', 'lampe', 'a', 'n', 'Lampe')] }] } },
  {
    name: 'Wechselschaltung',
    knoten: 0,
    arten: ['batterie', 'wechselschalter', 'wechselschalter', 'lampe'],
    roh: {
      kreise: [
        {
          bauteile: [
            T('B1', 'batterie', 'p', 'n', 'Batterie'),
            T('W1', 'wechselschalter', 'p', 'x', 'Wechselschalter 1', false, { nach2: 'y', stellung: '1' }),
            T('W2', 'wechselschalter', 'q', 'x', 'Wechselschalter 2', false, { nach2: 'y', stellung: '2' }),
            T('L1', 'lampe', 'q', 'n', 'Lampe')
          ]
        }
      ]
    }
  },
  {
    name: 'Strom- und Spannungsmessung',
    knoten: 2,
    arten: ['batterie', 'schalter_geschlossen', 'amperemeter', 'lampe', 'voltmeter'],
    roh: {
      kreise: [
        {
          bauteile: [
            T('B1', 'batterie', 'p', 'n', 'Batterie'),
            T('S1', 'schalter_geschlossen', 'p', 'a', 'Schalter'),
            T('A1', 'amperemeter', 'a', 'b', 'Strommessgerät'),
            T('L1', 'lampe', 'b', 'n', 'Lampe'),
            T('V1', 'voltmeter', 'b', 'n', 'Spannungsmessgerät')
          ]
        }
      ]
    }
  },
  {
    name: 'Widerstände mit Messgeräten',
    knoten: 2,
    arten: ['batterie', 'widerstand', 'widerstand', 'voltmeter', 'amperemeter'],
    roh: { kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n', 'Netzgerät'), T('R1', 'widerstand', 'p', 'a', 'R1'), T('R2', 'widerstand', 'a', 'b', 'R2'), T('V1', 'voltmeter', 'a', 'b', 'U2'), T('A1', 'amperemeter', 'b', 'n', 'I')] }] }
  },
  {
    name: 'LED und Diode',
    knoten: 0,
    arten: ['batterie', 'widerstand', 'led', 'batterie', 'lampe', 'diode'],
    roh: {
      kreise: [
        { titel: 'A: Durchlassrichtung', bauteile: [T('B1', 'batterie', 'p', 'n'), T('R1', 'widerstand', 'p', 'a', 'Vorwiderstand'), T('D1', 'led', 'a', 'n', 'LED')] },
        { titel: 'B: Sperrrichtung', bauteile: [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'a', 'Lampe'), T('D1', 'diode', 'n', 'a', 'Diode')] }
      ]
    }
  },
  { name: 'Motor mit Sicherung', knoten: 0, arten: ['batterie', 'sicherung', 'motor', 'schalter_offen'], roh: { kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n', 'Batterie'), T('F1', 'sicherung', 'p', 'a', 'Sicherung'), T('M1', 'motor', 'a', 'b', 'Motor'), T('S1', 'schalter_offen', 'b', 'n', 'Schalter')] }] } },
  { name: 'Klingel mit Taster', knoten: 2, arten: ['batterie', 'taster', 'klingel', 'lampe'], roh: { kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n', 'Batterie'), T('S1', 'taster', 'p', 'a', 'Klingelknopf'), T('K1', 'klingel', 'a', 'n', 'Klingel'), T('L1', 'lampe', 'a', 'n', 'Kontrolllampe')] }] } }
]

const spec = (roh: unknown): SchaltplanSpec => {
  const s = sanitizeSchaltplan(roh)
  expect(s).toBeTruthy()
  return s!
}

const ueberlappen = (a: Kasten, b: Kasten, rand = 0): boolean => a.x0 < b.x1 - rand && b.x0 < a.x1 - rand && a.y0 < b.y1 - rand && b.y0 < a.y1 - rand
type P = { x: number; y: number }
/** Schneidet die (achsparallele) Strecke das Innere des Kastens? */
const durch = ([a, b]: [P, P], k: Kasten, rand: number): boolean => {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return x0 < k.x1 - rand && x1 > k.x0 + rand && y0 < k.y1 - rand && y1 > k.y0 + rand
}
const gleichP = (a: P, b: P): boolean => Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02
/** Liegt p im Inneren der Strecke c–d (nicht an einem Ende)? */
const aufStrecke = (p: P, [c, d]: [P, P]): boolean =>
  !gleichP(p, c) &&
  !gleichP(p, d) &&
  ((Math.abs(c.x - d.x) < 0.01 && Math.abs(p.x - c.x) < 0.02 && p.y > Math.min(c.y, d.y) && p.y < Math.max(c.y, d.y)) ||
    (Math.abs(c.y - d.y) < 0.01 && Math.abs(p.y - c.y) < 0.02 && p.x > Math.min(c.x, d.x) && p.x < Math.max(c.x, d.x)))

describe('Schaltplan: Netzliste lesen', () => {
  it('erkennt Schaltpläne, aber nicht Fotos von Versuchsaufbauten', () => {
    expect(istSchaltplan({ caption: 'M1 Offener und geschlossener Stromkreis', description: 'Zwei einfache Stromkreise mit Batterie, Lampe und Schalter' })).toBe(true)
    expect(istSchaltplan({ caption: 'Treppenhaus', description: 'Wechselschaltung mit zwei Wechselschaltern' })).toBe(true)
    expect(istSchaltplan({ caption: 'Versuch', description: 'Foto eines Stromkreises auf dem Experimentiertisch' })).toBe(false)
    expect(istSchaltplan({ caption: 'Rotfuchs', description: 'Ein Fuchs im Wald' })).toBe(false)
  })

  it('verwirft Unbekanntes nicht stumm, sondern meldet es für die Korrektur', () => {
    const g = leseSchaltplan({ kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n'), T('X1', 'fluxkompensator', 'p', 'a'), T('L1', 'lampe', 'a', 'n')] }] })
    expect(g.fehler.join(' ')).toContain('unbekannte Bauteilart „fluxkompensator"')
    expect(leseSchaltplan({ kreise: [] }).spec).toBeNull()
    expect(leseSchaltplan(null).fehler.length).toBeGreaterThan(0)
    // Mehr als zwei Schaltkreise werden nicht abgeschnitten, sondern gemeldet
    const drei = [1, 2, 3].map(() => ({ bauteile: [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'n')] }))
    expect(leseSchaltplan({ kreise: drei }).fehler.join(' ')).toContain('Höchstens 2 Schaltkreise')
  })

  it('liest gespeicherte Pläne der alten Form (oben/unten/Zweige) als Netzliste', () => {
    const s = spec({
      kreise: [{ quelle: { beschriftung: 'Batterie' }, oben: [{ art: 'schalter_geschlossen' }], unten: [], zweige: [{ bauteile: [{ art: 'lampe', beschriftung: 'L1' }] }, { bauteile: [{ art: 'lampe' }] }] }]
    })
    expect(s.version).toBe(2)
    const a = analysiereKreis(s.kreise[0])
    expect(a.fehler).toEqual([])
    expect(a.baum?.t).toBe('reihe')
    expect(schaltplanZeichnen(s).svg).toContain('<svg')
  })
})

describe('Schaltplan: elektrische Prüfung', () => {
  const pruefe = (bauteile: unknown[], opts = {}) => analysiereKreis(spec({ kreise: [{ bauteile }] }).kreise[0], opts)
  const form = (b: Baum): string => (b.t === 'teil' ? b.b.id : b.t === 'wechsel' ? `W(${b.s1.id},${b.s2.id})` : `${b.t === 'reihe' ? 'R' : 'P'}[${b.k.map(form).join(',')}]`)

  it('zerlegt Reihe, Parallel und Wechselschaltung in einen Baum vom Plus- zum Minuspol', () => {
    expect(form(analysiereKreis(spec(GOLD[2].roh).kreise[0]).baum!)).toBe('R[S1,L1,L2]')
    expect(form(analysiereKreis(spec(GOLD[3].roh).kreise[0]).baum!)).toBe('R[S1,P[L1,L2]]')
    expect(form(analysiereKreis(spec(GOLD[5].roh).kreise[0]).baum!)).toBe('R[P[S1,S2],L1]')
    expect(form(analysiereKreis(spec(GOLD[6].roh).kreise[0]).baum!)).toBe('R[W(W1,W2),L1]')
    // Spannungsmessgerät als letzter Zweig – das gemessene Bauteil bleibt auf der Leitung
    expect(form(analysiereKreis(spec(GOLD[7].roh).kreise[0]).baum!)).toBe('R[S1,A1,P[L1,V1]]')
  })

  it('offenes Ende, nicht verbundenes Bauteil, fehlende Batterie', () => {
    expect(pruefe([T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'a'), T('S1', 'schalter_offen', 'a', 'b')]).fehler.join(' ')).toMatch(/freien Anschluss/)
    expect(pruefe([T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'n'), T('L2', 'lampe', 'x', 'y'), T('L3', 'lampe', 'x', 'y')]).fehler.join(' ')).toMatch(/L2.*nicht mit dem Stromkreis/)
    expect(pruefe([T('L1', 'lampe', 'p', 'n'), T('L2', 'lampe', 'p', 'n')]).fehler.join(' ')).toMatch(/Batterie/)
  })

  it('Kurzschluss und Spannungsmesser in Reihe – außer die Beschreibung will genau das', () => {
    const kurz = [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'n'), T('S1', 'schalter_geschlossen', 'p', 'n')]
    expect(pruefe(kurz).fehler.join(' ')).toMatch(/schließt es kurz/)
    expect(pruefe(kurz, { kurzschlussErlaubt: true }).fehler).toEqual([])
    expect(pruefe([T('B1', 'batterie', 'p', 'n'), T('S1', 'schalter_geschlossen', 'p', 'n')]).fehler.join(' ')).toMatch(/kein Verbraucher/)
    const reihe = [T('B1', 'batterie', 'p', 'n'), T('V1', 'voltmeter', 'p', 'a'), T('L1', 'lampe', 'a', 'n')]
    expect(pruefe(reihe).fehler.join(' ')).toMatch(/V1.*in Reihe/)
    expect(pruefe(reihe, { fehlschaltungErlaubt: true }).fehler).toEqual([])
    // ODER mit beiden Schaltern geschlossen ist kein Kurzschluss
    expect(pruefe([T('B1', 'batterie', 'p', 'n'), T('S1', 'schalter_geschlossen', 'p', 'a'), T('S2', 'schalter_geschlossen', 'p', 'a'), T('L1', 'lampe', 'a', 'n')]).fehler).toEqual([])
  })

  it('Brückenschaltung und Wechselschalter ohne Gegenstück: zu komplex, klare Meldung, kein Bild', () => {
    const teile = [T('B1', 'batterie', 'p', 'n'), T('R1', 'widerstand', 'p', 'a'), T('R2', 'widerstand', 'p', 'b'), T('R3', 'widerstand', 'a', 'n'), T('R4', 'widerstand', 'b', 'n'), T('R5', 'widerstand', 'a', 'b')]
    const bruecke = pruefe(teile)
    expect(bruecke.zuKomplex).toBe(true)
    expect(bruecke.fehler.join(' ')).toMatch(/nicht in Reihen- und Parallelschaltungen zerlegen/)
    const allein = pruefe([T('B1', 'batterie', 'p', 'n'), T('W1', 'wechselschalter', 'p', 'x', '', false, { nach2: 'y' }), T('L1', 'lampe', 'x', 'n'), T('L2', 'lampe', 'y', 'n')])
    expect(allein.zuKomplex).toBe(true)
    const z = schaltplanZeichnen(spec({ kreise: [{ bauteile: teile }] }))
    expect(z.svg).toBe('')
    expect(z.zuKomplex).toBe(true)
  })
})

describe('Schaltplan: Goldstandard-Zeichnungen (Geometrie in mm)', () => {
  for (const g of GOLD) {
    describe(g.name, () => {
      const s = spec(g.roh)
      const z = schaltplanZeichnen(s)
      const geo = z.geometrie
      const prozent = schaltplanBreiteProzent(z)
      const massstab = (170 * prozent) / 100 / z.breite

      it('wird gezeichnet – alle Bauteile, in DIN-Zeichen, deterministisch', () => {
        expect(z.fehler).toEqual([])
        expect(z.svg).toContain('<svg')
        expect(geo.symbole.map((x) => x.art).sort()).toEqual([...g.arten].sort())
        expect(schaltplanZeichnen(s).svg).toBe(z.svg)
      })

      it('groß genug: Druckbreite ≥ 120 mm oder 1,4-fache Originalgröße, Zeichen ≥ 8 mm, Strich ≥ 0,5 mm', () => {
        expect(massstab).toBeGreaterThanOrEqual(0.99)
        expect((170 * prozent) / 100).toBeGreaterThanOrEqual(Math.min(120, z.breite * 1.39))
        expect(z.hoehe * massstab).toBeLessThanOrEqual(110.5)
        expect(STRICH_MM * massstab).toBeGreaterThanOrEqual(0.5)
        for (const x of geo.symbole.filter((x) => ['lampe', 'amperemeter', 'voltmeter', 'motor', 'klingel'].includes(x.art))) {
          expect((x.kasten.x1 - x.kasten.x0) * massstab, x.key).toBeGreaterThanOrEqual(8)
        }
        for (const x of geo.symbole.filter((x) => ['widerstand', 'schalter_offen', 'schalter_geschlossen', 'taster'].includes(x.art))) {
          expect(Math.max(x.kasten.x1 - x.kasten.x0, x.kasten.y1 - x.kasten.y0) * massstab, x.key).toBeGreaterThanOrEqual(10)
        }
        expect(z.svg).toContain(`stroke-width="${STRICH_MM}"`)
      })

      it('nichts überlappt: Zeichen, Beschriftungen, Titel – und alles liegt im Bild', () => {
        const kaesten = [...geo.symbole.map((x) => ({ k: x.kasten, n: x.key })), ...geo.schilder.map((x) => ({ k: x.kasten, n: `Schild ${x.text}` })), ...geo.titel.map((k, i) => ({ k, n: `Titel ${i}` }))]
        const treffer: string[] = []
        for (let i = 0; i < kaesten.length; i++) for (let j = i + 1; j < kaesten.length; j++) if (ueberlappen(kaesten[i].k, kaesten[j].k, 0.05)) treffer.push(`${kaesten[i].n} × ${kaesten[j].n}`)
        expect(treffer).toEqual([])
        for (const { k, n } of kaesten) {
          expect(k.x0, n).toBeGreaterThanOrEqual(0)
          expect(k.y0, n).toBeGreaterThanOrEqual(0)
          expect(k.x1, n).toBeLessThanOrEqual(z.breite)
          expect(k.y1, n).toBeLessThanOrEqual(z.hoehe)
        }
      })

      it('Leitungen: rechtwinklig, jedes Ende verbunden, keine durch ein Zeichen oder eine Beschriftung', () => {
        const enden = geo.draehte.flatMap(([a, b]) => [a, b])
        const klemmen = geo.symbole.flatMap((x) => x.klemmen)
        const offen: P[] = []
        for (const [a, b] of geo.draehte) {
          expect(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01).toBe(true)
          for (const p of [a, b]) {
            const anDraht = enden.filter((q) => gleichP(p, q)).length >= 2 || geo.draehte.some((d) => aufStrecke(p, d))
            if (!anDraht && !klemmen.some((k) => gleichP(p, k))) offen.push(p)
          }
        }
        expect(offen).toEqual([])
        for (const d of geo.draehte) {
          for (const x of geo.symbole.filter((x) => x.art !== 'wechselschalter')) expect(durch(d, x.kasten, 0.3), `Leitung durch ${x.key}`).toBe(false)
          for (const x of geo.schilder) expect(durch(d, x.kasten, 0.05), `Leitung durch Schild ${x.text}`).toBe(false)
        }
      })

      it(`Knotenpunkte nur an echten Verzweigungen (${g.knoten})`, () => {
        expect(geo.knoten).toHaveLength(g.knoten)
        expect((z.svg.match(/r="0.9"/g) ?? []).length).toBe(g.knoten)
      })

      it('jede Beschriftung steht am Bauteil, im Bild, mit Richtung', () => {
        const mitText = s.kreise.flatMap((k) => k.bauteile).filter((b) => b.beschriftung)
        expect(z.labels).toHaveLength(mitText.length)
        for (const l of z.labels) {
          expect(l.inline).toBeTruthy()
          expect(l.x).toBeGreaterThanOrEqual(0)
          expect(l.x).toBeLessThanOrEqual(100)
          expect(l.y).toBeGreaterThanOrEqual(0)
          expect(l.y).toBeLessThanOrEqual(100)
        }
        expect(verwaisteBeschriftungen(s, z.labels)).toEqual([])
      })
    })
  }

  it('Batterie: langer Strich (Pluspol) oben', () => {
    const z = schaltplanZeichnen(spec(GOLD[0].roh))
    const b1 = z.geometrie.symbole.find((x) => x.art === 'batterie')!
    const waagerecht = [...z.svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"(\/>| stroke-width="([\d.]+)")/g)]
      .map((m) => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]), dick: Boolean(m[6]) }))
      .filter((l) => l.y1 === l.y2 && Math.abs(l.y1 - b1.mitte.y) < 3)
    const lang = waagerecht.find((l) => !l.dick && Math.abs(l.x2 - l.x1 - 10) < 0.01)!
    const kurz = waagerecht.find((l) => l.dick)!
    expect(lang.y1).toBeLessThan(kurz.y1)
  })

  it('zu viel für ein Blatt: kein verkleinertes Bild, sondern eine Meldung', () => {
    const lampen = Array.from({ length: 11 }, (_, i) => T(`L${i}`, 'lampe', i ? `k${i}` : 'p', i === 10 ? 'n' : `k${i + 1}`, `Spannungsmessgerät Nr. ${i}`))
    const z = schaltplanZeichnen(spec({ kreise: [{ bauteile: [T('B1', 'batterie', 'p', 'n'), ...lampen] }] }))
    expect(z.svg).toBe('')
    expect(z.fehler.join(' ')).toMatch(/nicht mehr gut erkennbar/)
  })
})

describe('Schaltplan: Beschriftung am Bauteil und Word', () => {
  const s = spec(GOLD[1].roh)
  const bild = schaltplanBild(s)!

  it('Schülerblatt: leere Linien ohne Lösungstext im Markup, keine Randspalten; Lösung zeigt den Text', () => {
    const html = (showAnswers: boolean): string =>
      renderToStaticMarkup(
        createElement(ImageLabelLayer, { labels: bild.labels, showAnswers, widthMm: (170 * bild.widthPercent) / 100, imageDataUrl: bild.dataUrl, children: createElement('img', { src: bild.dataUrl }) })
      )
    const schueler = html(false)
    expect(schueler).not.toContain('ws-imglabel-col')
    expect(schueler).not.toContain('Unterbrechung')
    expect((schueler.match(/ws-imglabel-inline/g) ?? []).length).toBe(bild.labels.length)
    expect(schueler).toContain('font-size:10.5pt')
    expect(html(true)).toContain('Unterbrechung')
  })

  it('Word: Beschriftungen stehen im gerasterten Bild – Linien auf dem Schülerblatt, Text in der Lösung', () => {
    expect(svgAusDataUrl(bild.dataUrl)).toContain('<svg')
    const groesse = imageSizeFromDataUrl(bild.dataUrl)!
    const breiteMm = (170 * bild.widthPercent) / 100
    const schueler = beschriftetesBildSvg({ dataUrl: bild.dataUrl, groesse, labels: bild.labels, mitLoesung: false, breiteMm }).svg
    const loesung = beschriftetesBildSvg({ dataUrl: bild.dataUrl, groesse, labels: bild.labels, mitLoesung: true, breiteMm }).svg
    expect(schueler).not.toContain('Unterbrechung')
    expect((schueler.match(/stroke-width="0.25"/g) ?? []).length).toBe(bild.labels.filter((l) => l.blank).length)
    expect(loesung).toContain('>Unterbrechung</text>')
    // Keine Randspalten, keine Punkte: die Schilder stehen am Bauteil
    expect(loesung).not.toContain('<circle')
  })

  it('An Bauteil einrasten: ein verrutschter Punkt springt auf den Rand des nächsten Bauteils', () => {
    const groesse = imageSizeFromDataUrl(bild.dataUrl)
    const lampe = bild.labels.find((l) => l.id.endsWith(':L1'))!
    const p = schaltplanEinrasten(s, groesse, { x: lampe.x + 2, y: lampe.y + 3 })!
    expect(verwaisteBeschriftungen(s, [{ ...lampe, x: p.x, y: p.y }], groesse)).toEqual([])
    expect(verwaisteBeschriftungen(s, [{ ...lampe, x: 50, y: 97 }], groesse)).toHaveLength(1)
  })
})

// ---------- Ablauf beim Erstellen ----------

const M1_ROH = { nichtDarstellbar: '', ...(GOLD[1].roh as object) }

const bild = (patch: Partial<ImageBlock> = {}): ImageBlock => ({
  id: 'm1',
  type: 'image',
  ref: 'stromkreise',
  description: 'Zwei Schaltpläne nebeneinander: links ein offener Stromkreis mit Batterie, Lampe und geöffnetem Schalter, rechts derselbe Stromkreis mit geschlossenem Schalter.',
  caption: 'Offener und geschlossener Stromkreis',
  widthPercent: 45,
  side: 'right',
  search: 'open closed circuit diagram',
  role: 'material',
  fn: 'organisation',
  // So hatte die KI die Punkte geschätzt – ohne das Bild zu kennen
  labels: [
    { id: 'a', text: 'Leitungen', x: 22, y: 18, blank: true },
    { id: 'b', text: 'Lampe', x: 22, y: 42, blank: true }
  ],
  ...patch
})

const aufgabe = (labels: string[]): TaskBlock =>
  ({
    id: 't1',
    type: 'task',
    instruction: '**Benenne** anhand von M{stromkreise} die Bauteile und die Unterbrechung.',
    operator: 'benennen',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    answer: { ...emptyAnswer('labels'), count: labels.length, labels },
    parts: [],
    solution: 'Batterie, Leitungen, Schalter, Lampe; beim offenen Schalter besteht eine Unterbrechung.',
    points: 0,
    minutes: 8
  }) as TaskBlock

/** KI-Attrappe: liefert nacheinander die Antworten der Liste (die letzte wiederholt sich) */
const ki =
  (calls: StructuredRequest[], ...antworten: unknown[]) =>
  async <R>(req: StructuredRequest): Promise<R> => {
    calls.push(req)
    if (req.schemaName === 'schaltplan') {
      const n = calls.filter((c) => c.schemaName === 'schaltplan').length
      return (antworten.length ? antworten[Math.min(n, antworten.length) - 1] : M1_ROH) as R
    }
    return { choices: [] } as R
  }

const keineSuche = (gesucht: string[]): ImageServices => ({
  searchOpenMoji: async () => [],
  openMojiPng: async (hex) => `data:image/png;base64,${hex}`,
  search: async (q) => (gesucht.push(q), []),
  fetchImage: async (url) => `data:image/jpeg;base64,${url}`,
  normalize: async (d) => d
})

describe('Schaltplan beim Erstellen: geprüft, korrigiert, gezeichnet', () => {
  it('die KI bekommt Beschreibung, Netzlisten-Regeln und die Begriffe der Aufgabe', async () => {
    const calls: StructuredRequest[] = []
    const erg = await schaltplanAusBeschreibung(bild(), meta, ki(calls), ['Batterie', 'Leitungen', 'Lampe', 'Unterbrechung', 'Schalter'])
    expect(erg.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].schemaName).toBe('schaltplan')
    expect(calls[0].user).toContain('offener Stromkreis')
    expect(calls[0].system).toContain('NETZLISTE')
    expect(calls[0].system).toContain('„Batterie", „Leitungen"')
  })

  it('fehlerhafte Antwort: gezielte Korrekturanfrage mit den Mängeln, dann gezeichnet', async () => {
    const calls: StructuredRequest[] = []
    const offen = { nichtDarstellbar: '', kreise: [{ titel: '', bauteile: [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'a'), T('S1', 'schalter_offen', 'a', 'b')] }] }
    const gut = { nichtDarstellbar: '', kreise: [{ titel: '', bauteile: [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'a'), T('S1', 'schalter_offen', 'a', 'n')] }] }
    const erg = await schaltplanAusBeschreibung({ caption: 'Offener Stromkreis', description: 'Batterie, Lampe und offener Schalter' }, meta, ki(calls, offen, gut))
    expect(erg.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1].user).toContain('Deine bisherige Antwort')
    expect(calls[1].user).toMatch(/S1.*freien Anschluss/)
  })

  it('Beschreibung nennt zwei Lampen, die Antwort hat eine: Korrekturanfrage', async () => {
    const calls: StructuredRequest[] = []
    const eine = { nichtDarstellbar: '', kreise: [{ titel: '', bauteile: [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'n')] }] }
    const zwei = { nichtDarstellbar: '', kreise: [{ titel: '', bauteile: [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'a'), T('L2', 'lampe', 'a', 'n')] }] }
    const erg = await schaltplanAusBeschreibung({ caption: 'Reihenschaltung', description: 'Reihenschaltung aus Batterie und zwei Lampen' }, meta, ki(calls, eine, zwei))
    expect(erg.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1].user).toContain('2 × Lampe')
  })

  it('Abgleich: nur ausdrückliche Zustände, keine Bedingungen („wenn … geschlossen")', () => {
    expect(abgleichMitBeschreibung(spec(GOLD[4].roh), 'UND-Schaltung: Die Lampe leuchtet nur, wenn beide Schalter geschlossen sind.')).toEqual([])
    const einfach = spec(GOLD[0].roh)
    expect(abgleichMitBeschreibung(einfach, 'Stromkreis mit geöffnetem Schalter').join(' ')).toMatch(/offenen Schalter/)
    expect(abgleichMitBeschreibung(einfach, 'Stromkreis mit Batterie, Lampe und Schalter, ohne Motor')).toEqual([])
    expect(abgleichMitBeschreibung(einfach, 'Stromkreis mit Klingel').join(' ')).toMatch(/Klingel/)
  })

  it('bleibt der Plan fehlerhaft: kein Bild, keine Bildsuche, klare Meldung', async () => {
    const calls: StructuredRequest[] = []
    const gesucht: string[] = []
    const kaputt = { nichtDarstellbar: '', kreise: [{ titel: '', bauteile: [T('B1', 'batterie', 'p', 'n'), T('L1', 'lampe', 'p', 'a')] }] }
    const b = bild()
    const t = aufgabe(['Batterie', 'Lampe'])
    const stats = await completeWorksheetImages([b, t] as WsBlock[], meta, {
      ai: ki(calls, kaputt),
      services: keineSuche(gesucht),
      generateImage: async () => 'data:image/png;base64,KI',
      variants: (q) => [q]
    })
    expect(calls.filter((c) => c.schemaName === 'schaltplan')).toHaveLength(3)
    expect(gesucht).toEqual([])
    expect(b.image).toBeUndefined()
    expect(b.labels).toBeUndefined()
    expect(stats.missing).toBe(1)
    expect(b.warnings?.join(' ')).toMatch(/Schaltplan nicht gezeichnet.*freien Anschluss/)
    expect(t.answer.kind).toBe('labels')
  })

  it('„nicht darstellbar": sofort klare Meldung statt eines falschen Bildes', async () => {
    const calls: StructuredRequest[] = []
    const b = bild({ description: 'Schaltplan eines Transistorverstärkers' })
    const erg = await zeichneSchaltplan([b], [b], meta, ki(calls, { nichtDarstellbar: 'Transistoren gibt es nicht als Bauteilart.', kreise: [] }))
    expect(erg).toBe('abgelehnt')
    expect(calls).toHaveLength(1)
    expect(b.image).toBeUndefined()
    expect(b.warnings?.[0]).toMatch(/zu komplex.*Transistoren/)
  })

  it('M1: Begriffe der Aufgabe wandern als leere Linien an die Bauteile; das Bild steht groß und nicht neben der Aufgabe', async () => {
    const b = bild()
    const t = aufgabe(['Batterie', 'Leitungen', 'Schalter', 'Lampe', 'Unterbrechung'])
    const erg = await zeichneSchaltplan([b], [b, t], meta, ki([]))
    expect(erg).toBe('gezeichnet')
    expect(b.image?.dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(b.image?.source).toBe('own')
    expect(b.schaltplan?.kreise).toHaveLength(2)
    expect(b.side).toBe('none')
    expect((170 * b.widthPercent) / 100).toBeGreaterThanOrEqual(120)
    expect(b.labels?.every((l) => l.id.startsWith('sp-') && l.inline)).toBe(true)
    expect(t.answer.kind).toBe('none')
    expect(t.instruction).toContain('(Linien an M{stromkreise})')
    const befunde = checkImages({ id: 's', label: 'Blatt', blocks: [b, t] } as never, meta)
    expect(befunde.filter((f) => /Beschriftungspunkt|Doppelter Beschriftungsweg|Schaltplan wird/.test(f.message))).toEqual([])
  })

  it('passt ein Begriff zu keinem Bauteil, bleibt die Liste der Aufgabe – und das Bild ohne Beschriftung', async () => {
    const b = bild()
    const t = aufgabe(['Batterie', 'Lampe', 'Glühwendel'])
    await zeichneSchaltplan([b], [b, t], meta, ki([]))
    expect(b.labels).toBeUndefined()
    expect(b.image).toBeTruthy()
    expect(t.answer.kind).toBe('labels')
    expect(b.warnings?.[0]).toContain('ohne Beschriftung')
  })

  it('in der Bild-Pipeline: kein Archiv, kein KI-Bild – der Schaltplan wird gezeichnet', async () => {
    const gesucht: string[] = []
    const erzeugt: string[] = []
    const b = bild()
    const t = aufgabe(['Batterie', 'Leitungen', 'Schalter', 'Lampe', 'Unterbrechung'])
    const stats = await completeWorksheetImages([b, t] as WsBlock[], meta, {
      ai: ki([]),
      services: keineSuche(gesucht),
      generateImage: async (p) => (erzeugt.push(p), 'data:image/png;base64,KI'),
      variants: (q) => [q]
    })
    expect(stats.gezeichnet).toBe(1)
    expect(gesucht).toEqual([])
    expect(erzeugt).toEqual([])
    expect(b.schaltplan).toBeTruthy()
  })

  it('ohne Schaltplan-Bezug bleiben geschätzte Punkte auf einem gefundenen Bild – mit Bitte um Prüfung', async () => {
    const b = bild({ description: 'Foto eines Stromkreises mit Glühlampe auf dem Experimentiertisch', caption: 'Versuchsaufbau' })
    await completeWorksheetImages([b] as WsBlock[], meta, {
      ai: ki([]),
      services: keineSuche([]),
      generateImage: async () => 'data:image/png;base64,KI',
      variants: (q) => [q]
    })
    expect(b.labels).toHaveLength(2)
    expect(b.warnings?.join(' ')).toContain('vor der Bildwahl geschätzt')
  })
})

describe('Schaltplan: Prüfungen am Blatt', () => {
  const s = spec(GOLD[1].roh)
  const gezeichnet = (patch: Partial<ImageBlock> = {}): ImageBlock => {
    const b = schaltplanBild(s)!
    return bild({ schaltplan: s, image: { dataUrl: b.dataUrl, source: 'own' }, labels: b.labels, widthPercent: b.widthPercent, side: 'none', ...patch })
  }

  it('zu klein gedruckt (neben der Aufgabe oder schmal): Hinweis mit nötiger Breite', () => {
    const neben = checkImages({ id: 's', label: 'Blatt', blocks: [gezeichnet({ side: 'right' })] } as never, meta)
    expect(neben.find((f) => f.message.includes('verkleinert'))?.message).toMatch(/nicht neben der Aufgabe/)
    const schmal = checkImages({ id: 's', label: 'Blatt', blocks: [gezeichnet({ widthPercent: 50 })] } as never, meta)
    expect(schmal.some((f) => /Schaltplan wird auf \d+ % verkleinert/.test(f.message))).toBe(true)
    expect(checkImages({ id: 's', label: 'Blatt', blocks: [gezeichnet()] } as never, meta).some((f) => f.message.includes('verkleinert'))).toBe(false)
  })

  it('ein Punkt, der an keinem Bauteil sitzt, wird gemeldet', () => {
    const b = gezeichnet()
    b.labels = [...b.labels!, { id: 'x', text: 'Widerstand', x: 50, y: 50 }]
    const befunde = checkImages({ id: 's', label: 'Blatt', blocks: [b] } as never, meta)
    expect(befunde.find((f) => f.message.includes('auf kein Bauteil'))?.message).toContain('„Widerstand"')
  })

  it('leere Linien am Bild UND nummerierte Linien in der Aufgabe = doppelter Beschriftungsweg', () => {
    const befunde = checkImages({ id: 's', label: 'Blatt', blocks: [bild(), aufgabe(['Batterie', 'Lampe'])] } as never, meta)
    expect(befunde.some((f) => f.message.startsWith('Doppelter Beschriftungsweg'))).toBe(true)
  })
})
