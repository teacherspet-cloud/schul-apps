/**
 * „Meine Klassen", Runde 2 (06.10.2026): IServ-Ablagestruktur aus dem Muster der Verwaltung, Standardsortierung der
 * Materialien, Ampelfarben. Rein (ohne Oberfläche).
 */
import { describe, expect, it } from 'vitest'
import { iservOrdnerFuer } from '../src/shared/iserv'
import { dateiName, iservPfadAus, schuljahr } from '../src/renderer/src/modules/meineklassen/klassenAblage'
import { ampel, standardFolge } from '../src/renderer/src/modules/meineklassen/MaterialListe'

describe('IServ-Ablage aus „Meine Klassen"', () => {
  it('Standard „Gruppen/Klasse {Klasse}/{Fach}" → Gruppen › Klasse 10b › Englisch', () => {
    expect(iservPfadAus('Gruppen/Klasse {Klasse}/{Fach}', '10b', 'Englisch')).toEqual(['Gruppen', 'Klasse 10b', 'Englisch'])
  })
  it('Rückwärtsstriche, Schuljahr, unzulässige Zeichen', () => {
    expect(iservPfadAus('Gruppen\\{Klasse}\\{Fach}\\{Schuljahr}', '5/6a', 'Deutsch', new Date('2026-10-06'))).toEqual(['Gruppen', '5-6a', 'Deutsch', '2026-27'])
    expect(schuljahr(new Date('2027-03-01'))).toBe('2026-27')
    expect(schuljahr(new Date('2027-08-02'))).toBe('2027-28')
  })
  it('fester Pfad geht vor Standardziel und Fach', () => {
    expect(iservOrdnerFuer('Home/Schulmaterial', { programm: 'arbeitsblatt', fach: 'Englisch', iservPfad: ['Gruppen', 'Klasse 10b', 'Englisch'] })).toEqual([
      'Gruppen',
      'Klasse 10b',
      'Englisch'
    ])
    expect(iservOrdnerFuer('Home/Schulmaterial', { programm: 'arbeitsblatt', fach: 'Englisch' })[0]).toBe('Home')
  })
  it('Dateinamen ohne verbotene Zeichen', () => expect(dateiName('Test: A/B?')).toBe('Test- A-B-'))
})

describe('Materialliste', () => {
  const e = (status: 'offen' | 'beendet', datum: number, frist: number | null) => ({ status, datum, frist })
  it('offen vor beendet; offen nach Frist, ohne Frist danach (neueste zuerst); beendet neueste zuerst', () => {
    const l = [e('beendet', 5, null), e('offen', 1, null), e('offen', 2, 30), e('offen', 3, 20), e('beendet', 9, null), e('offen', 4, null)]
    expect([...l].sort(standardFolge)).toEqual([
      e('offen', 3, 20),
      e('offen', 2, 30),
      e('offen', 4, null),
      e('offen', 1, null),
      e('beendet', 9, null),
      e('beendet', 5, null)
    ])
  })
  it('Ampel wie in der Lernenden-Tabelle', () => {
    expect([ampel(0), ampel(0.29), ampel(0.3), ampel(0.59), ampel(0.6), ampel(null)]).toEqual(['red', 'red', 'yellow', 'yellow', 'teal', 'gray'])
  })
})
