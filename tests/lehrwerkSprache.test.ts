import { describe, expect, it } from 'vitest'
import { lehrwerkAngaben } from '../src/shared/lehrwerkSprache'

/*
 * Befund der Lehrkraft (26.09.2026): „Green Line 1 - Unit 1, Station 2" stand ohne Fach in der
 * Bibliothek. Der Name verrät Sprache und Jahrgang – hier abgesichert.
 */
describe('Sprache und Jahrgang aus dem Lehrwerksnamen', () => {
  it('erkennt Green Line mit Band als Englisch der passenden Klasse', () => {
    expect(lehrwerkAngaben('Green Line 1 - Unit 1, Station 2')).toEqual({ language: 'en', grade: 5 })
    expect(lehrwerkAngaben('Green Line 3 – Unit 2')).toEqual({ language: 'en', grade: 7 })
    expect(lehrwerkAngaben('Green Line Transition')).toEqual({ language: 'en', grade: 11 })
    expect(lehrwerkAngaben('green line 5')).toEqual({ language: 'en', grade: 9 })
  })

  it('kennt die anderen Sprachen ohne Jahrgang', () => {
    expect(lehrwerkAngaben('Découvertes 2 – Leçon 3')).toEqual({ language: 'fr' })
    expect(lehrwerkAngaben('À plus 1')).toEqual({ language: 'fr' })
    expect(lehrwerkAngaben('¡Vamos! ¡Adelante! 2')).toEqual({ language: 'es' })
    expect(lehrwerkAngaben('Prima nova Lektion 4')).toEqual({ language: 'la' })
  })

  it('lässt unbekannte Namen offen', () => {
    expect(lehrwerkAngaben('Vokabeltest vom 12.09.2026')).toBeNull()
    expect(lehrwerkAngaben('')).toBeNull()
    expect(lehrwerkAngaben(undefined)).toBeNull()
  })
})
