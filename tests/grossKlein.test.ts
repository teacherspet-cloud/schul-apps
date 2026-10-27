/** Groß-/Kleinschreibung automatisch in Blatt-Textfeldern (27.10.2026) */
import { describe, expect, it } from 'vitest'
import { amSatzanfang, grossAmSatzanfang } from '../src/shared/grossKlein'

describe('Groß am Satzanfang', () => {
  it('Feldanfang: der erste Buchstabe wird groß, auch nach Anführungszeichen', () => {
    expect(grossAmSatzanfang('d', 1)).toBe('D')
    expect(grossAmSatzanfang('  d', 3)).toBe('  D')
    expect(grossAmSatzanfang('„d', 2)).toBe('„D')
  })
  it('nach Satzzeichen mit Leerzeichen, nicht ohne', () => {
    expect(grossAmSatzanfang('Das ist gut. d', 14)).toBe('Das ist gut. D')
    expect(grossAmSatzanfang('Wirklich? j', 11)).toBe('Wirklich? J')
    expect(grossAmSatzanfang('Toll! s', 7)).toBe('Toll! S')
    expect(grossAmSatzanfang('Ende.d', 6)).toBeNull()
    expect(grossAmSatzanfang('ein Wort, d', 11)).toBeNull()
  })
  it('Zeilenanfang in Textflächen', () => {
    expect(grossAmSatzanfang('Erste Zeile\nz', 13)).toBe('Erste Zeile\nZ')
  })
  it('nicht nach Auslassung, Abkürzung, Einzelbuchstaben und Ordnungszahl', () => {
    expect(grossAmSatzanfang('Hm... d', 7)).toBeNull()
    expect(grossAmSatzanfang('Hm… d', 5)).toBeNull()
    expect(grossAmSatzanfang('z. B. d', 7)).toBeNull()
    expect(grossAmSatzanfang('bzw. d', 6)).toBeNull()
    expect(grossAmSatzanfang('Der 1. w', 8)).toBeNull()
    expect(amSatzanfang('e.g. ')).toBe(false)
  })
  it('nur ein eben getippter Kleinbuchstabe ändert sich – mitten im Wort, Großbuchstaben und Ziffern bleiben', () => {
    expect(grossAmSatzanfang('Da', 2)).toBeNull()
    expect(grossAmSatzanfang('D', 1)).toBeNull()
    expect(grossAmSatzanfang('3', 1)).toBeNull()
    // Schreibmarke mitten im Text: nur die Stelle davor zählt
    expect(grossAmSatzanfang('Hallo. d Welt', 8)).toBe('Hallo. D Welt')
  })
  it('Umlaute und ß', () => {
    expect(grossAmSatzanfang('ä', 1)).toBe('Ä')
    // ß hat keinen einzelnen Großbuchstaben – bleibt
    expect(grossAmSatzanfang('ß', 1)).toBeNull()
  })
})
