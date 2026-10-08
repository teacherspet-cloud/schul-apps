import { describe, expect, it } from 'vitest'
import { htmlAlsZeilen, kurzNamen, namenAusText } from '../src/shared/namenListe'

/** Lernende aus Klassenlisten eintragen (08.10.2026) */
describe('Namen aus Klassenlisten', () => {
  it('liest CSV mit Kopfzeile (Semikolon und Komma)', () => {
    expect(namenAusText('Nr;Nachname;Vorname;Klasse\n1;Müller;Anna;7b\n2;Schmidt;Ben;7b')).toEqual([
      { vorname: 'Anna', nachname: 'Müller' },
      { vorname: 'Ben', nachname: 'Schmidt' }
    ])
    expect(namenAusText('Vorname,Nachname\nAnna,Müller')).toEqual([{ vorname: 'Anna', nachname: 'Müller' }])
  })
  it('liest Listen ohne Kopfzeile: „Nachname, Vorname", „Vorname Nachname", nummeriert', () => {
    expect(namenAusText('Klasse 7b – Schuljahr 2026/27\n1. Müller, Anna\n2. Ben Schmidt\n3) Lea Marie Yilmaz')).toEqual([
      { vorname: 'Anna', nachname: 'Müller' },
      { vorname: 'Ben', nachname: 'Schmidt' },
      { vorname: 'Lea Marie', nachname: 'Yilmaz' }
    ])
  })
  it('liest schon gekürzte Listen ohne Kopfzeile („Vorname | A." und „Vorname A.")', () => {
    expect(namenAusText('Yara\tA.\nJonas\tB.\nMia K.')).toEqual([
      { vorname: 'Yara', nachname: 'A.' },
      { vorname: 'Jonas', nachname: 'B.' },
      { vorname: 'Mia', nachname: 'K.' }
    ])
    expect(kurzNamen(namenAusText('Yara\tA.\nJonas\tBe.'))).toEqual(['Yara A.', 'Jonas Be.'])
  })
  it('liest Word-Tabellen', () => {
    const html = '<table><tr><th>Name</th><th>Vorname</th></tr><tr><td>Müller</td><td>Anna</td></tr></table>'
    expect(namenAusText(htmlAlsZeilen(html))).toEqual([{ vorname: 'Anna', nachname: 'Müller' }])
  })
  it('kürzt zu „Vorname N." und unterscheidet Gleiche', () => {
    expect(
      kurzNamen([
        { vorname: 'Anna', nachname: 'Müller' },
        { vorname: 'Anna', nachname: 'Meier' },
        { vorname: 'Ben', nachname: 'Schmidt' },
        { vorname: 'ben', nachname: 'Schmidt' }
      ])
    ).toEqual(['Anna Mü.', 'Anna Me.', 'Ben S.'])
    expect(kurzNamen([{ vorname: 'Ben', nachname: 'Schmidt' }], ['Ben S.'])).toEqual([])
  })
})
