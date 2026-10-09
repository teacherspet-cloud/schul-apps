import { describe, expect, it } from 'vitest'
import { GESEHEN_MAX, gesehenErgaenzen, neueJeProgramm } from '../src/renderer/src/shared/fachschaftNeu'

/*
 * Neues von der Fachschaft (09.10.2026): seit das Menü „Daten und Material" entfallen ist, zählen Leiste und
 * Bibliothek die noch nicht angesehenen Freigaben je App.
 */
describe('neue Freigaben der Fachschaft je App', () => {
  const eintraege = [
    { id: 'a1', art: 'arbeitsblatt' },
    { id: 'a2', art: 'arbeitsblatt' },
    { id: 't1', art: 'tafelbild' },
    { id: 'e1', art: 'arbeitsblatt', eigen: true },
    { id: 'alt:k1', art: 'klassenarbeit' }
  ]

  it('zählt je Programm, eigenes Material nie', () => {
    expect(neueJeProgramm(eintraege, [])).toEqual({ arbeitsblatt: 2, tafelbild: 1, klassenarbeit: 1 })
  })

  it('angesehene Einträge zählen nicht mehr', () => {
    expect(neueJeProgramm(eintraege, ['a1', 'alt:k1'])).toEqual({ arbeitsblatt: 1, tafelbild: 1 })
    expect(neueJeProgramm(eintraege, ['a1', 'a2', 't1', 'alt:k1'])).toEqual({})
  })

  it('merkt Gesehenes ohne Doppelte und gedeckelt', () => {
    expect(gesehenErgaenzen(['a1'], ['a1', 'a2', 'a2'])).toEqual(['a1', 'a2'])
    expect(gesehenErgaenzen(['a1'], [])).toEqual(['a1'])
    const viele = Array.from({ length: GESEHEN_MAX }, (_, i) => `x${i}`)
    const neu = gesehenErgaenzen(viele, ['y'])
    expect(neu).toHaveLength(GESEHEN_MAX)
    expect(neu[0]).toBe('x1')
    expect(neu.at(-1)).toBe('y')
  })
})
