import { describe, expect, it } from 'vitest'
import {
  aehnlichkeit,
  eigenstaendigkeit,
  eingabeAuffaellig,
  eingabeVerbuchen,
  farbeFuer,
  gesamtwert,
  gleicheAbgaben,
  korrektheit
} from '../src/shared/blattAuswertung'
import { kontrast } from '../src/renderer/src/modules/lernen/vtFarben'

describe('Auswertung freigegebener Blätter (05.10.2026)', () => {
  it('Eingaben: Tippen zählt einzeln, große Sprünge als eingefügt, Pausen nicht als Zeit', () => {
    let e = eingabeVerbuchen(undefined, '', 'D', 0)
    e = eingabeVerbuchen(e, 'D', 'Di', 400)
    e = eingabeVerbuchen(e, 'Di', 'Di' + 'x'.repeat(60), 300)
    e = eingabeVerbuchen(e, 'x', 'xy', 120_000)
    expect(e).toEqual({ g: 3, e: 60, ms: 700, n: 4 })
  })
  it('Auffällig: überwiegend eingefügt, unplausibel schnell', () => {
    expect(eingabeAuffaellig({ g: 10, e: 200, ms: 60_000, n: 3 }).map((a) => a.art)).toEqual(['eingefuegt'])
    expect(eingabeAuffaellig({ g: 300, e: 0, ms: 20_000, n: 300 }).map((a) => a.art)).toEqual(['schnell'])
    expect(eingabeAuffaellig({ g: 300, e: 0, ms: 180_000, n: 300 })).toEqual([])
  })
  it('Gleiche und ähnliche Abgaben, kurze Antworten zählen nicht', () => {
    const satz = 'Die Julikrise führte über Bündnisse und Ultimaten in wenigen Wochen zum Krieg.'
    expect(aehnlichkeit(satz, satz.toUpperCase())).toBe(1)
    const g = gleicheAbgaben({
      a: satz,
      b: satz.replace('.', '!'),
      c: 'Die Julikrise führte über Bündnisse und Ultimaten in wenigen Wochen leider zum Krieg.',
      d: 'Österreich-Ungarn stellte Serbien ein Ultimatum, Russland mobilisierte daraufhin.',
      e: '1914',
      f: '1914'
    })
    expect(g).toHaveLength(1)
    expect(g[0].personen.sort()).toEqual(['a', 'b', 'c'])
    expect(g[0].gleich).toBe(false)
  })
  it('Korrektheit, Eigenständigkeit, Gesamtwert', () => {
    expect(korrektheit([null, null])).toBeNull()
    expect(korrektheit(['gruen', 'gelb', null, 'rot'])).toBeCloseTo(0.375)
    expect(eigenstaendigkeit([[], [{ art: 'eingefuegt', text: '', gewicht: 1 }]], 2)).toBe(0.5)
    expect(gesamtwert(1, 1)).toBe(1)
    expect(gesamtwert(1, 0)).toBe(0.25)
    expect(gesamtwert(null, 1)).toBeNull()
  })
  it('Farbe stufenlos von Rot über Orange zu Grün – weiße Schrift bleibt lesbar', () => {
    const ton = (w: number): number => Number(/hsl\((\d+)/.exec(farbeFuer(w))![1])
    expect(ton(0)).toBe(0)
    expect(ton(0.5)).toBe(32)
    expect(ton(1)).toBe(130)
    expect(ton(0.25)).toBeGreaterThan(0)
    expect(ton(0.75)).toBeGreaterThan(32)
    for (let w = 0; w <= 1; w += 0.05) {
      const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(farbeFuer(w))!
      const hex = hslZuHex(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100)
      expect(kontrast('#ffffff', hex), `${w.toFixed(2)} ${hex}`).toBeGreaterThanOrEqual(3)
    }
  })
})

function hslZuHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): string => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

import { mitarbeitAus } from '../src/server/blattAuswertung'

describe('Mitarbeitsvorschlag der KI', () => {
  it('Kürzel werden wieder Namen, Unbekanntes fällt weg', () => {
    const aus = mitarbeitAus(
      {
        personen: [
          { kennung: 'S2', note: '-', begruendung: 'Gleich wie bei S1.', hilfen: ['Mit S1 vergleichen'] },
          { kennung: 'S9', note: '+', begruendung: 'x', hilfen: [] },
          { kennung: 'S1', note: 'sehr gut', begruendung: 'x', hilfen: [] }
        ]
      },
      [
        { id: 'a', name: 'Mia Probe' },
        { id: 'b', name: 'Tim Test' }
      ]
    )
    expect(aus).toEqual({ b: { note: '-', begruendung: 'Gleich wie bei Mia Probe.', hilfen: ['Mit Mia Probe vergleichen'] } })
  })
})
