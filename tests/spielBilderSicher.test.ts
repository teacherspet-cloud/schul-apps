import { describe, expect, it } from 'vitest'
import { spielBildWoerter } from '../src/shared/bildEindeutig'

describe('Bilderspiele nur mit sicheren Bildern (26.11.2026, Befund „Wort → Bild")', () => {
  const w = (id: string, term: string, translation: string, extra: Record<string, unknown> = {}) => ({ id, term, translation, bild: `/medien/${id}.webp`, ...extra })
  it('lässt vermutete Bilder und nicht abbildbare Wörter weg', () => {
    const liste = [
      w('1', 'dog', 'Hund'),
      w('2', 'bat', 'Schläger', { bildUngesichert: true }),
      w('3', 'idea', 'Idee'),
      w('4', 'brother', 'Bruder'),
      w('5', 'apple', 'Apfel')
    ]
    expect(spielBildWoerter(liste).map((x) => x.term)).toEqual(['dog', 'apple'])
  })
})
