import { describe, expect, it } from 'vitest'
import { falschschreibungen } from '../src/shared/vokabelFehler'

const alle = (wort: string, sprache = 'en'): string[] => {
  // Mit festem Zufall mehrfach ziehen – so kommen alle Regeln zum Zug
  const s = new Set<string>()
  for (let k = 0; k < 40; k++) {
    let x = k
    for (const f of falschschreibungen(wort, sprache, 30, () => (x = (x * 9301 + 49297) % 233280) / 233280, [])) s.add(f)
  }
  return [...s]
}

describe('Typische Falschschreibungen (03.10.2026)', () => {
  it('erzeugt die Beispiele der Lehrkraft', () => {
    const white = alle('white')
    for (const f of ['wite', 'whit', 'withe', 'wihte']) expect(white).toContain(f)
    const which = alle('which')
    for (const f of ['wich', 'whitch']) expect(which).toContain(f)
    expect(alle('with')).toEqual(expect.arrayContaining(['wiht', 'withe']))
    expect(alle('friend')).toContain('freind')
    expect(alle('receive')).toContain('recieve')
  })
  it('kennt deutsche Lautschrift-Fehler', () => {
    expect(alle('shop')).toContain('schop')
    expect(alle('very')).toContain('wery')
    expect(alle('this')).toContain('dis')
    expect(alle('letter')).toContain('leter')
  })
  it('nie die richtige Lösung, keine Dopplungen', () => {
    const f = falschschreibungen('white', 'en', 3)
    expect(f).not.toContain('white')
    expect(new Set(f).size).toBe(f.length)
    expect(falschschreibungen('which', 'en', 5, Math.random, ['witch'])).not.toContain('witch')
  })
  it('Französisch: Akzente und stumme Endungen', () => {
    const f = alle('école', 'fr')
    expect(f).toContain('ecole')
    expect(alle('beaucoup', 'fr')).toContain('bocoup')
  })
})
