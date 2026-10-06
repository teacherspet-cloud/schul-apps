import { describe, expect, it } from 'vitest'
import { bewerte, buchstaben, mitLeerzeichen } from '../src/shared/vokabeltrainer'

/* Buchstabenkacheln mit Leerzeichen (06.10.2026, Befund: „to bring about" ergab „bringabout") */
describe('Buchstaben legen mit Leerzeichen', () => {
  it('Kacheln ohne Leerzeichen, gelegtes Wort mit Leerzeichen an der richtigen Stelle', () => {
    const k = buchstaben('to bring about', () => 0.5)
    expect(k.includes(' ')).toBe(false)
    expect(mitLeerzeichen('to bring about', 'bring')).toBe('bring')
    expect(mitLeerzeichen('to bring about', 'bringa')).toBe('bring a')
    const ganz = mitLeerzeichen('to bring about', 'bringabout')
    expect(ganz).toBe('bring about')
    expect(bewerte(ganz, 'to bring about').urteil).toBe('richtig')
  })
  it('Wörter ohne Leerzeichen unverändert', () => {
    expect(mitLeerzeichen('house', 'house')).toBe('house')
  })
})
