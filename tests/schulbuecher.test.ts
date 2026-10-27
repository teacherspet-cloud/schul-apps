import { describe, expect, it } from 'vitest'
import {
  bildUrlErlaubt,
  buchAusLehrwerk,
  buchBild,
  buchName,
  buecherBereinigt,
  buecherDesFachs,
  coverVonIsbn,
  faecherAbgeleitet,
  faecherBereinigt,
  isbn13,
  isbnGueltig,
  schulbuchBereinigt
} from '../src/shared/schulbuecher'

/*
 * Schulbücher und Fächer der Schule (27.10.2026, abgestimmt): Katalog je Fach, ISBN-Prüfung, Bilder nur von Verlags-Hosts,
 * Fächerliste aus den Daten der Schule, Erstbestand aus den Lehrwerksdateien.
 */
describe('ISBN', () => {
  it('prüft ISBN-13 und ISBN-10 und wandelt um', () => {
    expect(isbnGueltig('978-3-12-864010-5')).toBe(true)
    expect(isbnGueltig('9783128640105')).toBe(true)
    expect(isbnGueltig('978-3-12-864010-6')).toBe(false)
    expect(isbnGueltig('3-12-864010-2')).toBe(false)
    expect(isbnGueltig('0-306-40615-2')).toBe(true)
    expect(isbn13('0-306-40615-2')).toBe('9780306406157')
    expect(isbn13('12345')).toBe('')
  })
  it('Cover aus der ISBN: Klett über die bekannten Ausgaben, Cornelsen nach Muster, sonst nichts', () => {
    expect(coverVonIsbn('978-3-12-864010-5', 'Klett')).toContain('assets.klett.de')
    expect(coverVonIsbn('978-3-06-033311-2', 'Cornelsen')).toBe('https://static.cornelsen.de/media/9783060333112/9783060333112_COVER_STD_B110_X2.png')
    expect(coverVonIsbn('978-3-14-012345-6', 'Westermann')).toBe('')
  })
})

describe('Bild-Adressen', () => {
  it('nur https von Verlags-Hosts', () => {
    expect(bildUrlErlaubt('https://assets.klett.de/assets/x/Cover.jpg')).toBe(true)
    expect(bildUrlErlaubt('http://assets.klett.de/assets/x/Cover.jpg')).toBe(false)
    expect(bildUrlErlaubt('https://example.com/cover.jpg')).toBe(false)
    expect(bildUrlErlaubt('kein link')).toBe(false)
  })
  it('eigene Adresse geht vor, sonst ISBN', () => {
    expect(buchBild({ bild: 'https://www.westermann.de/x.jpg', isbn: '978-3-12-864010-5', verlag: 'Klett' })).toBe('https://www.westermann.de/x.jpg')
    expect(buchBild({ bild: 'https://example.com/x.jpg', isbn: '978-3-12-864010-5', verlag: 'Klett' })).toContain('assets.klett.de')
  })
})

describe('Bücher', () => {
  it('bereinigt Eingaben: Fach und Name nötig, Jahrgänge 1–13, fremde Bild-Hosts fallen weg', () => {
    expect(schulbuchBereinigt({ faecher: ['englisch'], reihe: '', band: '', titel: '' })).toBeNull()
    expect(schulbuchBereinigt({ faecher: ['unbekannt'], reihe: 'Green Line', band: '1' })).toBeNull()
    const b = schulbuchBereinigt({
      id: 'b-1',
      faecher: ['englisch', 'englisch', 'biologie'],
      reihe: '  Green  Line ',
      band: '1',
      jahrgaenge: [5, 5, 14, 0, '6'],
      isbn: '978-3-12-864010-5',
      bild: 'https://example.com/x.jpg',
      kapitel: ['Unit 1', '', 'Unit 2'],
      lehrwerkId: 'green-line-1',
      geaendert: { von: 'Lehrkraft', am: '2026-10-27T10:00:00Z' }
    })!
    expect(b).toMatchObject({
      id: 'b-1',
      faecher: ['englisch', 'biologie'],
      reihe: 'Green Line',
      jahrgaenge: [5, 6],
      bild: '',
      kapitel: ['Unit 1', 'Unit 2'],
      lehrwerkId: 'green-line-1'
    })
    expect(buchName(b)).toBe('Green Line 1')
    expect(buchName({ reihe: '', band: '', titel: 'Geschichte und Geschehen 2' })).toBe('Geschichte und Geschehen 2')
  })
  it('Liste: ungültige Kennungen und Doppelte fallen weg; Sortierung je Fach nach Reihe und Band', () => {
    const liste = buecherBereinigt([
      { id: 'b-2', faecher: ['englisch'], reihe: 'Green Line', band: '2' },
      { id: 'b-10', faecher: ['englisch'], reihe: 'Green Line', band: '10' },
      { id: 'b-2', faecher: ['englisch'], reihe: 'Green Line', band: '2' },
      { id: 'x', faecher: ['englisch'], reihe: 'Camden Town', band: '1' },
      { id: 'b-1', faecher: ['englisch', 'geschichte'], reihe: 'Green Line', band: '1' }
    ])
    expect(liste.map((b) => b.id)).toEqual(['b-2', 'b-10', 'b-1'])
    expect(buecherDesFachs(liste, 'englisch').map(buchName)).toEqual(['Green Line 1', 'Green Line 2', 'Green Line 10'])
    expect(buecherDesFachs(liste, 'geschichte').map(buchName)).toEqual(['Green Line 1'])
  })
  it('aus einem Lehrwerk entsteht ein Buch mit Fach, ISBN der bekannten Ausgabe und Verknüpfung', () => {
    const b = buchAusLehrwerk({
      id: 'green-line-1',
      name: 'Green Line 1',
      language: 'en',
      grade: 5,
      publisher: 'Klett',
      edition: 'Niedersachsen',
      reihe: 'Green Line',
      ausgabe: 'ab 2021',
      band: '1'
    })!
    expect(b).toMatchObject({
      id: 'lw-green-line-1',
      faecher: ['englisch'],
      reihe: 'Green Line',
      band: '1',
      jahrgaenge: [5],
      isbn: '978-3-12-864010-5',
      lehrwerkId: 'green-line-1'
    })
    expect(buchAusLehrwerk({ id: 'x', name: 'X', language: 'xx' })).toBeNull()
  })
})

describe('Fächer der Schule', () => {
  it('leitet aus Lerngruppen (Freitext), IServ, eigenen Fächern und Fachobleuten Katalogfächer ab – in Katalogreihenfolge', () => {
    const f = faecherAbgeleitet({
      lerngruppen: ['Englisch', 'Mathematik', 'Kunst AG', ''],
      iserv: ['geschichte'],
      eigene: ['deutsch', 'nix'],
      obleute: ['englisch']
    })
    expect(f).toContain('englisch')
    expect(f).toContain('mathematik')
    expect(f).toContain('geschichte')
    expect(f).toContain('deutsch')
    expect(f).not.toContain('nix')
    expect(f.indexOf('deutsch')).toBeLessThan(f.indexOf('englisch'))
    // Fächer der Katalogbücher zählen mit (ein neuer Server mit Green Line ist nicht leer)
    expect(faecherAbgeleitet({ lerngruppen: [], iserv: [], eigene: [], obleute: [], buecher: ['englisch', 'franzoesisch'] })).toEqual([
      'englisch',
      'franzoesisch'
    ])
  })
  it('bereinigt Listen auf Katalogfächer', () => {
    expect(faecherBereinigt(['englisch', 'unbekannt', 'englisch', 7])).toEqual(['englisch'])
  })
})
