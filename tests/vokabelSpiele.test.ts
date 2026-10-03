import { describe, expect, it } from 'vitest'
import { gitterform, istRekord, spielWoerter, suchselGitter, suchselZellen } from '../src/shared/vokabelSpiele'
import { neuerStand } from '../src/shared/vokabeltrainer'

describe('Vokabelspiele (03.10.2026)', () => {
  it('Suchsel: alle Wörter stehen im Gitter, jede Zelle gefüllt', () => {
    const w = ['WEATHER', 'SUNNY', 'CLOUD', 'RAIN', 'WIND'].map((wort, i) => ({ id: `w${i}`, wort }))
    const g = suchselGitter(w)
    expect(g.zellen.every((c) => c.length === 1)).toBe(true)
    expect(g.woerter.length).toBe(5)
    for (const x of g.woerter)
      expect(
        suchselZellen(x)
          .map((z) => g.zellen[z])
          .join('')
      ).toBe(x.wort)
  })
  it('Gitterform ohne Artikel, Angaben und Leerzeichen', () => {
    expect(gitterform('the children [pl]')).toBe('CHILDREN')
    expect(gitterform('(to) go shopping')).toBe('TOGOSHOPPING'.replace(/^TO/, ''))
  })
  it('gespielt wird mit gelernten Wörtern, bei zu wenigen auch mit den übrigen', () => {
    const liste = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, term: `t${i}`, translation: `u${i}` }))
    const gelernt = { w0: { ...neuerStand(), fach: 2 }, w1: { ...neuerStand(), fach: 1 } }
    expect(spielWoerter(liste, gelernt).length).toBe(6)
    expect(
      spielWoerter(liste, gelernt)
        .slice(0, 2)
        .map((v) => v.id)
    ).toEqual(['w0', 'w1'])
  })
  it('Rekord: Züge/Sekunden kleiner, Treffer größer', () => {
    expect(istRekord('memory', 9, 12)).toBe(true)
    expect(istRekord('memory', 14, 12)).toBe(false)
    expect(istRekord('blitz', 20, 15)).toBe(true)
    expect(istRekord('blitz', 3, undefined)).toBe(true)
  })
})
