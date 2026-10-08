import { describe, expect, it } from 'vitest'
import type { Schritt } from '../src/shared/reihe'
import { schritteInStunde, stundeAnhaengen, stundeEntfernen, stundeVerschieben } from '../src/renderer/src/modules/unterrichtsreihe/stundenRaster'

const s = (id: string, stunde?: number): Schritt => ({ id, stunde }) as unknown as Schritt

describe('Stundenraster bearbeiten (08.10.2026)', () => {
  const r = { stunden: ['einzel', 'doppel', 'einzel'] as const, schritte: [s('a', 0), s('b', 1), s('c', 2), s('d')] }
  const reihe = { stunden: [...r.stunden], schritte: r.schritte }

  it('hängt Stunden hinten an', () => {
    expect(stundeAnhaengen({ stunden: undefined, schritte: [] }, 'doppel').stunden).toEqual(['doppel'])
    expect(stundeAnhaengen(reihe, 'einzel').stunden).toEqual(['einzel', 'doppel', 'einzel', 'einzel'])
  })

  it('verschiebt Stunden samt ihren Schritten', () => {
    const p = stundeVerschieben(reihe, 0, 2)
    expect(p.stunden).toEqual(['doppel', 'einzel', 'einzel'])
    expect(p.schritte.map((x) => [x.id, x.stunde])).toEqual([
      ['a', 2],
      ['b', 0],
      ['c', 1],
      ['d', undefined]
    ])
    expect(stundeVerschieben(reihe, 1, 0).stunden).toEqual(['doppel', 'einzel', 'einzel'])
    expect(stundeVerschieben(reihe, 0, 5).stunden).toEqual(reihe.stunden)
  })

  it('entfernt Stunden, spätere rücken vor', () => {
    expect(schritteInStunde(reihe, 1)).toBe(1)
    const p = stundeEntfernen(reihe, 1)
    expect(p.stunden).toEqual(['einzel', 'einzel'])
    expect(p.schritte.map((x) => [x.id, x.stunde])).toEqual([
      ['a', 0],
      ['b', undefined],
      ['c', 1],
      ['d', undefined]
    ])
  })
})
