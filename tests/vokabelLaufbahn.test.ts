import { describe, expect, it } from 'vitest'
import { abschnitteAus, fehlenBis, leiter, quelleAusTitel, reiheVon, type Buch } from '../src/shared/vokabelLaufbahn'

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
