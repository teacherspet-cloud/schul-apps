import { describe, expect, it } from 'vitest'
import { abschnitteAus, fehlenBis, leiter, quelleAusTitel, reiheVon, stationStand, wegUnits, type Buch } from '../src/shared/vokabelLaufbahn'

const buch: Buch = {
  id: 'green-line-2',
  name: 'Green Line 2',
  language: 'en',
  reihe: 'Green Line',
  band: '2',
  edition: 'Niedersachsen',
  units: [
    {
      name: 'Unit 1',
      sections: [1, 2, 3].map((n) => ({
        name: `Station ${n}`,
        entries: Array.from({ length: 10 }, (_, i) => ({ term: `w${n}${i}`, translation: `u${n}${i}` }))
      }))
    },
    {
      name: 'Unit 2',
      sections: [1, 2].map((n) => ({ name: `Station ${n}`, entries: Array.from({ length: 5 }, (_, i) => ({ term: `v${n}${i}`, translation: `x${n}${i}` })) }))
    }
  ]
}

describe('Vokabelweg (03.10.2026)', () => {
  const ab = abschnitteAus(buch)
  it('Abschnitte in Buchreihenfolge mit stabilen Wort-Kennungen', () => {
    expect(ab.map((a) => `${a.unit}/${a.section}`)).toEqual([
      'Unit 1/Station 1',
      'Unit 1/Station 2',
      'Unit 1/Station 3',
      'Unit 2/Station 1',
      'Unit 2/Station 2'
    ])
    expect(ab[1].woerter[3].id).toBe('b:green-line-2:0:1:3')
  })
  it('frei bis zum zuletzt zugewiesenen Abschnitt; dahinter schaltet erst Lernen frei', () => {
    const l = leiter(ab, new Set([ab[1].key]), () => 0)
    expect(l.map((s) => s.frei)).toEqual([true, true, false, false, false])
    expect(l[0].grund).toBe('klasse')
    expect(l[1].grund).toBe('zugewiesen')
    expect(l[0].aktuell).toBe(true)
  })
  it('80 % ab Fach 2 schalten den nächsten Abschnitt frei – Kette bis Bandende', () => {
    const anteile: Record<string, number> = { [ab[1].key]: 0.8, [ab[2].key]: 0.9 }
    const l = leiter(ab, new Set([ab[1].key]), (k) => anteile[k] ?? 0)
    expect(l.map((s) => s.frei)).toEqual([true, true, true, true, false])
    expect(l[2].grund).toBe('gelernt')
    expect(l[3].grund).toBe('gelernt')
    expect(l.find((s) => s.aktuell)?.section).toBe('Station 1')
    expect(fehlenBis({ woerter: 10, anteil: 0.5 })).toBe(3)
  })
  it('ohne Zuweisung ist nur der erste Abschnitt frei', () => {
    expect(leiter(ab, new Set(), () => 0).map((s) => s.frei)).toEqual([true, false, false, false, false])
  })
  it('Herkunft aus älteren Titeln, Reihe über die Bände', () => {
    expect(quelleAusTitel('Green Line 2 - Unit 1 - Station 1, Station 2', [{ id: 'green-line-2', name: 'Green Line 2' }])).toEqual({
      lehrwerk: 'green-line-2',
      unit: 'Unit 1',
      abschnitte: ['Station 1', 'Station 2']
    })
    expect(quelleAusTitel('Weather words', [{ id: 'green-line-2', name: 'Green Line 2' }])).toBeNull()
    expect(reiheVon(buch)).toBe(reiheVon({ ...buch, name: 'Green Line 3' }))
  })
})

describe('Fortschrittspfad „Mein Vokabelweg" (09.10.2026)', () => {
  const ab = abschnitteAus(buch)
  it('Stufen: offen → gelernt (alle einmal kennengelernt) → abgeschlossen (80 % ab Fach 2)', () => {
    expect(stationStand({ gesamt: 15, kennengelernt: 0, fach2plus: 0 })).toEqual({ stufe: 'offen', fuellung: 0 })
    expect(stationStand({ gesamt: 15, kennengelernt: 12, fach2plus: 9 }).stufe).toBe('offen')
    expect(stationStand({ gesamt: 15, kennengelernt: 15, fach2plus: 3 }).stufe).toBe('gelernt')
    expect(stationStand({ gesamt: 15, kennengelernt: 15, fach2plus: 12 })).toEqual({ stufe: 'abgeschlossen', fuellung: 1 })
    // Abgeschlossen auch ohne jedes Wort kennengelernt – dieselbe Regel wie das Freischalten
    expect(stationStand({ gesamt: 10, kennengelernt: 8, fach2plus: 8 }).stufe).toBe('abgeschlossen')
    expect(stationStand({ gesamt: 10, kennengelernt: 10, fach2plus: 7 }).stufe).toBe('gelernt')
    expect(stationStand({ gesamt: 0, kennengelernt: 0, fach2plus: 0 }).stufe).toBe('offen')
  })
  it('das Wegstück füllt sich anteilig und wächst mit jedem Schritt', () => {
    const f = (k: number, s: number): number => stationStand({ gesamt: 10, kennengelernt: k, fach2plus: s }).fuellung
    expect(f(5, 0)).toBeCloseTo(0.25)
    expect(f(10, 0)).toBeCloseTo(0.5)
    expect(f(10, 4)).toBeCloseTo(0.75)
    expect(f(10, 7)).toBeLessThan(1)
    expect(f(3, 0)).toBeLessThan(f(6, 0))
    expect(f(10, 2)).toBeLessThan(f(10, 5))
  })
  it('Units: abgeschlossene zusammengeklappt, die Figur am aktuellen Abschnitt, spätere gedimmt', () => {
    const anteile: Record<string, number> = { [ab[0].key]: 1, [ab[1].key]: 0.9, [ab[2].key]: 0.8 }
    const st = leiter(ab, new Set([ab[0].key]), (k) => anteile[k] ?? 0).map((s) => ({
      ...s,
      kennengelernt: s.key === ab[3].key ? 5 : Math.round((anteile[s.key] ?? 0) * s.woerter),
      fach2plus: Math.round((anteile[s.key] ?? 0) * s.woerter)
    }))
    const { units, figur } = wegUnits(st)
    expect(units.map((u) => [u.unit, u.lage])).toEqual([
      ['Unit 1', 'fertig'],
      ['Unit 2', 'aktuell']
    ])
    expect(figur).toBe(3)
    expect(units[1].stufen.map((x) => x.stufe)).toEqual(['gelernt', 'offen'])
  })
  it('spätere Units gedimmt; ist alles Freie abgeschlossen, steht die Figur am letzten freien Abschnitt', () => {
    const a = wegUnits(leiter(ab, new Set(), () => 0))
    expect(a.figur).toBe(0)
    expect(a.units.map((u) => u.lage)).toEqual(['aktuell', 'spaeter'])
    const b = wegUnits(leiter(ab, new Set(), () => 1))
    expect(b.figur).toBe(4)
    expect(b.units.map((u) => u.lage)).toEqual(['fertig', 'aktuell'])
  })
})
