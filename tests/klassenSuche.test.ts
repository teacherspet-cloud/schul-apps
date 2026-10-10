import { describe, expect, it } from 'vitest'
import { klasseAusGruppen, klasseTrifft, lernendeSuchen, nameTrifft, stichwortArten, type SuchPerson } from '../src/shared/klassenSuche'

/*
 * Suche in „Meine Klassen" (10.10.2026, Entscheidung der Lehrkraft): Klassen und Lernende, Namen ohne Rücksicht auf
 * Akzente und Groß-/Kleinschreibung, Stichwörter zum Handlungsbedarf, Lernende der aktuellen Klasse zuerst.
 */
const person = (id: string, name: string, klasse: string, probleme: SuchPerson['probleme'] = [], suchName?: string): SuchPerson => ({
  id,
  name,
  ...(suchName !== undefined ? { suchName } : {}),
  klasse,
  faecher: ['Englisch'],
  gruppen: [{ id: `g${klasse}`, name: klasse, fach: 'Englisch' }],
  probleme
})
const ALLE = [
  person('1', 'Jil v.', '7b'),
  person('2', 'Zoë M.', '8a', ['inaktiv']),
  person('3', 'Mia K.', '8a', ['schwach']),
  person('4', 'Mia S.', '7b', ['foerdern']),
  // Ohne Anzeigenamen: Benutzername wird angezeigt, aber nie durchsucht
  person('5', 'max.mustermann', '7b', [], '')
]

describe('Namen', () => {
  it('Teilstück, Akzente und Groß-/Kleinschreibung egal', () => {
    expect(nameTrifft('Jil v.', 'jil')).toBe(true)
    expect(nameTrifft('Zoë M.', 'zoe')).toBe(true)
    expect(nameTrifft('Mia K.', 'mia k')).toBe(true)
    expect(nameTrifft('Mia K.', 'mia s')).toBe(false)
    expect(lernendeSuchen(ALLE, 'MIA').map((p) => p.name)).toEqual(['Mia K.', 'Mia S.'])
  })

  it('kein Treffer über den Benutzernamen, mindestens 2 Zeichen', () => {
    expect(lernendeSuchen(ALLE, 'mustermann')).toEqual([])
    expect(lernendeSuchen(ALLE, 'm')).toEqual([])
  })

  it('in einer Klasse ihre Lernenden zuerst', () => {
    expect(lernendeSuchen(ALLE, 'mia', '7b').map((p) => p.name)).toEqual(['Mia S.', 'Mia K.'])
  })
})

describe('Stichwörter zum Handlungsbedarf', () => {
  it('erkennt die Arten', () => {
    expect([...(stichwortArten('nicht geübt') ?? [])]).toEqual(['inaktiv'])
    expect([...(stichwortArten('Inaktiv') ?? [])]).toEqual(['inaktiv'])
    expect([...(stichwortArten('wackelig') ?? [])]).toEqual(['schwach'])
    expect([...(stichwortArten('Problemwörter') ?? [])]).toEqual(['schwach'])
    expect([...(stichwortArten('Fördern') ?? [])]).toEqual(['foerdern'])
    expect(new Set(stichwortArten('Handlungsbedarf'))).toEqual(new Set(['inaktiv', 'schwach', 'foerdern']))
    expect(stichwortArten('mia')).toBeNull()
  })

  it('findet Lernende mit passendem Eintrag', () => {
    expect(lernendeSuchen(ALLE, 'nicht geübt').map((p) => [p.name, p.grund])).toEqual([['Zoë M.', 'stichwort']])
    expect(lernendeSuchen(ALLE, 'wackelig').map((p) => p.name)).toEqual(['Mia K.'])
    expect(lernendeSuchen(ALLE, 'handlungsbedarf').map((p) => p.name)).toEqual(['Mia K.', 'Mia S.', 'Zoë M.'])
  })
})

describe('Klassen', () => {
  it('Name und Fach', () => {
    expect(klasseTrifft({ name: '7b', faecher: ['Englisch', 'Französisch'] }, '7b fran')).toBe(true)
    expect(klasseTrifft({ name: '7b', faecher: ['Englisch'] }, 'franz')).toBe(false)
    expect(klasseAusGruppen([{ name: 'FR 7 Kon' }, { name: '7b' }])).toBe('7b')
    expect(klasseAusGruppen([{ name: 'FR 7 Kon' }])).toBe('FR 7 Kon')
  })
})
