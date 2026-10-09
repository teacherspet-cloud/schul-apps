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

describe('Reiter-Namen für mehrere Kurse', () => {
  it('gleiche Titel: eigener Kursname, sonst Nummer', async () => {
    const { kursReiterNamen, ohneKlassenname } = await import('../src/shared/ohneKlasse')
    expect(ohneKlassenname('Wackelige Wörter – 6b - Englisch', '6b')).toBe('Wackelige Wörter – Englisch')
    expect(ohneKlassenname('6b Englisch', '6b')).toBe('6b Englisch')
    expect(ohneKlassenname('Englisch', '6b')).toBe('Englisch')
    expect(kursReiterNamen([{ titel: 'Englisch', name: 'Englisch' }, { titel: 'Englisch', name: 'Wackelige Wörter – Englisch' }])).toEqual(['Englisch', 'Wackelige Wörter – Englisch'])
    expect(kursReiterNamen([{ titel: 'Englisch' }, { titel: 'Englisch' }])).toEqual(['Englisch (1)', 'Englisch (2)'])
    expect(kursReiterNamen([{ titel: 'Englisch' }, { titel: 'Französisch' }])).toEqual(['Englisch', 'Französisch'])
  })
})
