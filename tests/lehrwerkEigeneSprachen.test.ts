import { describe, expect, it } from 'vitest'
import { nachEigenenFaechern } from '../src/renderer/src/modules/vokabeltest/steps/TextbookPicker'

/* Befund der Lehrkraft (23.10.2026): Im Vokabeltest standen Lehrwerke von Sprachen, die sie nicht unterrichtet. */
describe('Lehrwerke nach den eigenen Fächern', () => {
  const buecher = [{ id: 'gl', language: 'en' }, { id: 'dec', language: 'fr' }, { id: 'pontes', language: 'la' }]
  it('nur die eigenen Sprachen, die Sprache der Lerngruppe immer dabei', () => {
    expect(nachEigenenFaechern(buecher, undefined, ['englisch', 'geschichte']).map((b) => b.id)).toEqual(['gl'])
    expect(nachEigenenFaechern(buecher, 'fr', ['englisch']).map((b) => b.id)).toEqual(['gl', 'dec'])
  })
  it('ohne Fächer oder ohne Treffer: alle', () => {
    expect(nachEigenenFaechern(buecher, undefined, [])).toHaveLength(3)
    expect(nachEigenenFaechern(buecher, undefined, ['mathematik'])).toHaveLength(3)
  })
})
