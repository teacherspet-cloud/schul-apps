import { describe, expect, it } from 'vitest'
import { bandNummer, jahrgangAusBand, jahrgangDerFreigabe, schuljahrVon, unitStelle } from '../src/shared/grammatikJahrgang'
import { istOffen, nachJahrgaengen } from '../src/renderer/src/modules/lernen/regal/grammatikJahrgaenge'
import { jahrgangName, roemisch } from '../src/renderer/src/modules/lernen/regal/beschriftung'

/*
 * Grammatik-Register nach Schuljahren (08.10.2026, abgestimmt mit der Lehrkraft): Jahrgang aus dem Lehrwerk-Band, sonst
 * der Klasse beim Freigeben; neuestes Jahr oben und offen; Überschriften in der Fremdsprache mit deutscher Zählung.
 */
describe('Jahrgang einer Grammatik', () => {
  it('Faustregel Band → Klasse: Englisch ab 5, zweite Fremdsprachen ab 6', () => {
    expect(bandNummer('Green Line 2')).toBe(2)
    expect(bandNummer('Découvertes Série jaune 3')).toBe(3)
    expect(bandNummer('Pontes')).toBeNull()
    expect(jahrgangAusBand('Green Line 1', 'en')).toBe(5)
    expect(jahrgangAusBand('Green Line 4', 'en')).toBe(8)
    expect(jahrgangAusBand('Découvertes 1', 'fr')).toBe(6)
    expect(jahrgangAusBand('Campus 2', 'la')).toBe(7)
    expect(jahrgangAusBand('Green Line 1', 'nl')).toBeNull()
  })
  it('Reihenfolge der Quellen: Grammatik-Band, Kurs-Lehrwerk, Klasse beim Freigeben, Lerngruppe, heutige Klasse zurückgerechnet', () => {
    expect(jahrgangDerFreigabe({ sprache: 'en', grammatikBand: 'Green Line 2', buchJahrgang: 5, freigabeKlasse: 7 })).toBe(6)
    expect(jahrgangDerFreigabe({ sprache: 'en', buchJahrgang: 5, buchBand: '3', freigabeKlasse: 7 })).toBe(5)
    expect(jahrgangDerFreigabe({ sprache: 'en', buchBand: 'Green Line 3', freigabeKlasse: 7 })).toBe(7)
    expect(jahrgangDerFreigabe({ sprache: 'en', freigabeKlasse: 7, gruppenKlasse: 6 })).toBe(7)
    expect(jahrgangDerFreigabe({ sprache: 'en', gruppenKlasse: 6 })).toBe(6)
    // Heute Klasse 7 (Oktober 2026), freigegeben im Juni 2026 (Schuljahr davor) → 6; im September 2026 → 7
    const jetzt = Date.parse('2026-10-08T10:00:00Z')
    expect(jahrgangDerFreigabe({ sprache: 'en', heutigeKlasse: 7, erstellt: Date.parse('2026-06-20T10:00:00Z'), jetzt })).toBe(6)
    expect(jahrgangDerFreigabe({ sprache: 'en', heutigeKlasse: 7, erstellt: Date.parse('2026-09-01T10:00:00Z'), jetzt })).toBe(7)
    expect(jahrgangDerFreigabe({ sprache: 'en' })).toBeNull()
  })
  it('Schuljahr wechselt am 1. August', () => {
    expect(schuljahrVon(Date.parse('2026-07-31T12:00:00Z'))).toBe(2025)
    expect(schuljahrVon(Date.parse('2026-08-01T12:00:00Z'))).toBe(2026)
  })
  it('Stelle im Lehrwerk', () => {
    expect(unitStelle('Unit 3')).toBe(3)
    expect(unitStelle('Welcome back')).toBe(0)
    expect(unitStelle('Unit 2', ['Welcome back', 'Unit 1', 'Unit 2'])).toBe(2)
    expect(unitStelle('')).toBeNull()
  })
})

describe('Register nach Schuljahren', () => {
  const k = (titel: string, jahrgang: number | null, stelle: number | null = null) => ({ titel, jahrgang, stelle })
  it('neuestes Jahr oben, nur Jahre mit Inhalt, im Jahr nach Unit, dann Titel; ohne Jahrgang zuletzt', () => {
    const g = nachJahrgaengen([k('Simple past', 6, 2), k('Das Verb be', 5, 1), k('Artikel', 5, 1), k('Plural', 5, 3), k('Frei', null), k('Going to', 6, 1)])
    expect(g.map((x) => x.jahrgang)).toEqual([6, 5, null])
    expect(g[0].eintraege.map((x) => x.titel)).toEqual(['Going to', 'Simple past'])
    expect(g[1].eintraege.map((x) => x.titel)).toEqual(['Artikel', 'Das Verb be', 'Plural'])
  })
  it('nur das neueste Jahr offen, Gemerktes gilt, beim Suchen alles offen', () => {
    const g = nachJahrgaengen([k('A', 6), k('B', 5)])
    expect([0, 1].map((i) => istOffen(g, i, {}, false))).toEqual([true, false])
    expect([0, 1].map((i) => istOffen(g, i, { '6': false, '5': true }, false))).toEqual([false, true])
    expect([0, 1].map((i) => istOffen(g, i, { '6': false }, true))).toEqual([true, true])
  })
  it('Überschriften in der Fremdsprache, deutsche Zählung', () => {
    expect(jahrgangName('Englisch', 6)).toBe('Year 6')
    expect(jahrgangName('Französisch', 7)).toBe('Classe 7')
    expect(jahrgangName('Spanisch', 8)).toBe('Curso 8')
    expect(jahrgangName('Italienisch', 9)).toBe('Classe 9')
    expect(jahrgangName('Latein', 6)).toBe('Classis VI')
    expect(jahrgangName('Russisch', 10)).toBe('Класс 10')
    expect(jahrgangName('Niederländisch', 6)).toBe('Klasse 6')
    expect(jahrgangName('Deutsch', 5)).toBe('Klasse 5')
    expect([4, 9, 12, 13].map(roemisch)).toEqual(['IV', 'IX', 'XII', 'XIII'])
  })
})
