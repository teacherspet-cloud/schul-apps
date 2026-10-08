import { describe, expect, it } from 'vitest'
import { ohneKlasse } from '../src/shared/ohneKlasse'

describe('ohneKlasse', () => {
  it('entfernt die Klasse vorn', () => {
    expect(ohneKlasse('10b - Englisch')).toBe('Englisch')
    expect(ohneKlasse('6 - Französisch')).toBe('Französisch')
    expect(ohneKlasse('Q1 – Englisch')).toBe('Englisch')
    expect(ohneKlasse('Klasse 9a: Latein')).toBe('Latein')
    expect(ohneKlasse('5bc - Englisch')).toBe('Englisch')
  })
  it('lässt andere Titel stehen', () => {
    expect(ohneKlasse('Englisch')).toBe('Englisch')
    expect(ohneKlasse('Unit 3 - Words')).toBe('Unit 3 - Words')
    expect(ohneKlasse('Simple past')).toBe('Simple past')
    expect(ohneKlasse('10b - ')).toBe('10b - ')
  })
})
