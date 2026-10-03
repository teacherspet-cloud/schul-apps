import { describe, expect, it } from 'vitest'
import { bewerte, buchstaben, kernform, ohneAngaben } from '../src/shared/vokabeltrainer'

describe('Grammatik-Angaben gehören nicht zum Wort (03.10.2026)', () => {
  it('entfernt Angaben in eckigen und typische in runden Klammern', () => {
    expect(ohneAngaben('children [pl]')).toBe('children')
    expect(ohneAngaben('mouse (pl mice)')).toBe('mouse')
    expect(ohneAngaben('flat (BE)')).toBe('flat')
    expect(ohneAngaben('go [irr]')).toBe('go')
    expect(ohneAngaben('(to) play')).toBe('(to) play')
  })
  it('muss weder eingegeben noch gelegt werden', () => {
    expect(bewerte('children', 'children [pl]').urteil).toBe('richtig')
    expect(bewerte('mouse', 'mouse (pl mice)').urteil).toBe('richtig')
    expect(bewerte('children', 'children [pl]').richtig).toBe('children')
    expect(buchstaben('children [pl]').sort().join('')).toBe([...'children'].sort().join(''))
    expect(kernform('the sheep [pl]')).toBe('sheep')
  })
})

describe('Bewertung und neue Übungen (03.10.2026)', () => {
  it('die vollständige angeklickte Übersetzung zählt (Befund: richtig angeklickt, falsch gewertet)', async () => {
    const { bewerte } = await import('../src/shared/vokabeltrainer')
    expect(bewerte('welche, welcher, welches', 'welche, welcher, welches').urteil).toBe('richtig')
    expect(bewerte('weiß / hell', 'weiß / hell').urteil).toBe('richtig')
  })
  it('Falschschreibung in der Auswahl ist falsch, nicht „fast"', async () => {
    const { bewerte } = await import('../src/shared/vokabeltrainer')
    expect(bewerte('whit', 'white', true).urteil).toBe('falsch')
    expect(bewerte('white', 'white', true).urteil).toBe('richtig')
  })
  it('Auswahl in der Fremdsprache enthält das richtige Wort, Lückenmuster lässt den Anfang stehen', async () => {
    const { auswahlFsOptionen, lueckenMuster } = await import('../src/shared/vokabeltrainer')
    const { falschschreibungen } = await import('../src/shared/vokabelFehler')
    const liste = [
      { id: 'a', term: 'white', translation: 'weiß' },
      { id: 'b', term: 'which', translation: 'welche' }
    ]
    const o = auswahlFsOptionen(liste[0], liste, 'en', (w, n, v) => falschschreibungen(w, 'en', n, Math.random, v))
    expect(o).toContain('white')
    expect(o.length).toBe(4)
    expect(new Set(o).size).toBe(4)
    const m = lueckenMuster('white')
    expect(m[0]).toBe('w')
    expect(m).toContain('_')
    expect(m.length).toBe(5)
  })
})
