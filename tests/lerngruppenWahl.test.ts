// Lerngruppen-Auswahl in Freigabe-Dialogen (25.10.2026): gleiche Klassennamen tragen ihr Fach, das passende Fach steht vorn
import { describe, expect, it } from 'vitest'
import { gruppenAuswahl, gruppenVorwahl } from '../src/renderer/src/shared/lerngruppenWahl'

const gruppen = [
  { id: 'a', name: '9c', fach: 'Deutsch' },
  { id: 'b', name: '9c', fach: 'Geschichte' },
  { id: 'c', name: '7a', fach: 'Geschichte' },
  { id: 'd', name: 'AG Chor' }
]

describe('Lerngruppen-Auswahl', () => {
  it('ohne Fachbezug: nur doppelte Namen bekommen das Fach', () => {
    expect(gruppenAuswahl(gruppen).map((e) => e.label)).toEqual(['9c · Deutsch', '9c · Geschichte', '7a', 'AG Chor'])
  })
  it('mit Fach des Materials: passende Gruppen vorn und unverändert, andere mit Fach', () => {
    expect(gruppenAuswahl(gruppen, 'Geschichte').map((e) => e.label)).toEqual(['9c · Geschichte', '7a', '9c · Deutsch', 'AG Chor'])
    expect(gruppenVorwahl(gruppen, 'Geschichte')).toBe('b')
    expect(gruppenVorwahl(gruppen, 'Musik')).toBeNull()
  })
  it('ältere Server ohne Fach: Namen wie bisher', () => {
    expect(
      gruppenAuswahl(
        [
          { id: 'x', name: '9c' },
          { id: 'y', name: '9c' }
        ],
        'Deutsch'
      ).map((e) => e.label)
    ).toEqual(['9c', '9c'])
  })
})
