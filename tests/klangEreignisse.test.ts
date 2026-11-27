import { describe, expect, it } from 'vitest'
import type { BBlock } from '../src/shared/klassenspiel/kern'
import { klangAusBloecken } from '../src/renderer/src/modules/lernen/klassenspiel/klangEreignisse'

const berg = (lager: number, anteil: number, hinweis?: string): BBlock => ({ typ: 'berg', lager, von: 3, anteil, quote: null, zielQuote: 0.7, namen: [], hinweis })
const team = (wert: number) => ({ name: 't', symbol: '', farbe: 'red', wert, ziel: 10, n: 2 }) as never
const bahnen = (w: number[], seil = false): BBlock => ({ typ: 'bahnen', teams: w.map(team), seil })
const karte = (teams: (number | null)[]): BBlock => ({ typ: 'karte', spalten: 2, felder: teams.map((t) => ({ sterne: 1, team: t })), teams: [] })
const arten = (a: BBlock, b: BBlock) => klangAusBloecken([a], [b]).map((k) => k.art)

describe('Klänge aus dem Stand der Klassenspiele', () => {
  it('Expedition: Schritt, Lager, Gipfel, Sturm', () => {
    expect(arten(berg(0, 0.1), berg(0, 0.2))).toEqual(['schritt'])
    expect(arten(berg(0, 0.9), berg(1, 0))).toEqual(['etappe'])
    expect(arten(berg(2, 0.9), berg(3, 0))).toEqual(['rekord'])
    expect(arten(berg(1, 0.2), berg(1, 0.2, 'Sturm'))).toEqual(['gebremst'])
    expect(arten(berg(1, 0.2, 'Sturm'), berg(1, 0.2, 'Sturm'))).toEqual([])
  })
  it('Rennen: Schritt, Führungswechsel, Ziel; Tauziehen: still (27.11.2026)', () => {
    expect(arten(bahnen([2, 3]), bahnen([3, 3]))).toEqual(['schritt'])
    expect(arten(bahnen([3, 2]), bahnen([3, 4]))).toEqual(['schritt', 'fuehrung'])
    expect(arten(bahnen([9, 2]), bahnen([10, 2]))).toEqual(['schritt', 'rekord'])
    expect(arten(bahnen([2, 3], true), bahnen([3, 3], true))).toEqual([])
    expect(arten(bahnen([3, 2], true), bahnen([3, 4], true))).toEqual([])
  })
  it('Gebiet: erobert und gestohlen', () => {
    expect(arten(karte([null, 0]), karte([1, 0]))).toEqual(['erobert'])
    expect(arten(karte([null, 0]), karte([1, 1]))).toEqual(['gestohlen'])
    expect(arten(karte([1, 0]), karte([1, 0]))).toEqual([])
  })
})
