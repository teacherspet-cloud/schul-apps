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
