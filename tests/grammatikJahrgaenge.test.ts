import { describe, expect, it } from 'vitest'
import { bandNummer, jahrgangAusBand, jahrgangDerFreigabe, schuljahrVon, unitStelle } from '../src/shared/grammatikJahrgang'
import { stelleImBand, stelleImLehrwerk } from '../src/shared/lehrwerkBand'
import { formVon, mixKennungen, mixSchluessel } from '../src/shared/grammatikBank'
import { unitsMitGrammatik } from '../src/renderer/src/modules/lernen/kurs/kursAnsicht'
import { istOffen, nachJahrgaengen, nachUnits, teilOffen } from '../src/renderer/src/modules/lernen/regal/grammatikJahrgaenge'
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

describe('Grammatik im Jahr nach Unit › Station (17.10.2026)', () => {
  const e = (titel: string, unit?: string, station?: string, extra = false) => ({
    titel,
    ...(unit ? { buch: 'Green Line 1', unit, ...(station ? { station } : {}) } : {}),
    extra
  })
  it('Späteres oben: Unit 2 über Unit 1, Station 3 über Station 1; Extra oben, Unbekanntes unter „Weitere"', () => {
    const r = nachUnits(
      [
        e('A', 'Unit 1', 'Station 1'),
        e('B', 'Unit 1', 'Station 3'),
        e('C', 'Unit 2', 'Station 1'),
        e('D', 'Unit 1', 'Station 2'),
        e('Frei'),
        e('Extra', undefined, undefined, true)
      ],
      () => []
    )
    expect(r.extras.map((x) => x.titel)).toEqual(['Extra'])
    expect(r.units.map((u) => u.name)).toEqual(['Unit 2', 'Unit 1'])
    expect(r.units[1].stationen.map((s) => s.station)).toEqual(['Station 3', 'Station 2', 'Station 1'])
    expect(r.weitere.map((x) => x.titel)).toEqual(['Frei'])
  })
  it('oberste Unit bzw. Station offen, sonst gemerkt; beim Suchen alles offen', () => {
    expect(teilOffen('x', 0, {}, false)).toBe(true)
    expect(teilOffen('x', 1, {}, false)).toBe(false)
    expect(teilOffen('x', 0, { x: false }, false)).toBe(false)
    expect(teilOffen('x', 1, {}, true)).toBe(true)
  })
})

describe('Stelle der Grammatik im Band (17.10.2026)', () => {
  it('Einführung im Lehrwerk statt der Unit der Freigabe', () => {
    expect(stelleImBand('Green Line 1', ['en.verb.there_is/praesens'])).toEqual({ unit: 'Unit 1', station: 'Station 2' })
    expect(stelleImBand('Green Line 1', ['en.verb.be_have/be-kurzformen'])).toEqual({ unit: 'Unit 1', station: 'Station 1' })
    expect(stelleImBand('Green Line 1', ['en.verb.passive'])).toBeNull()
    expect(stelleImBand('Unbekanntes Buch 1', ['en.verb.there_is/praesens'])).toBeNull()
  })
})

describe('Units mit Grammatik (17.10.2026)', () => {
  const g = (id: string, unit?: string, station?: string, buch = 'Green Line 1') => ({ id, titel: id, buch, unit, station, aufgaben: 10, bearbeitet: 0.5, sicher: 0.2 })
  const folge = () => ['Unit 1', 'Unit 2', 'Unit 3']
  it('Grammatik hinter den Vokabeln derselben Station, Units nur mit Grammatik an ihrer Stelle im Buch', () => {
    const baende = [
      {
        buch: 'Green Line 1',
        units: [
          { unit: 'Unit 3', zeilen: [{ name: 'Station 1' }] },
          { unit: 'Unit 1', zeilen: [{ name: 'Station 2' }, { name: 'Station 1' }] }
        ]
      }
    ]
    const r = unitsMitGrammatik(baende, [g('there', 'Unit 1', 'Station 2'), g('be', 'Unit 1', 'Station 1'), g('genitiv', 'Unit 2', 'Station 1'), g('frei', undefined, undefined, '')], folge)
    expect(r.map((b) => b.buch)).toEqual(['Green Line 1', ''])
    expect(r[0].units.map((u) => u.unit)).toEqual(['Unit 3', 'Unit 2', 'Unit 1'])
    expect(r[0].units[2].zeilen.map((z) => (z.art === 'vok' ? z.z.name : z.g.id))).toEqual(['Station 2', 'there', 'Station 1', 'be'])
    expect(r[1].units[0].gram.map((x) => x.id)).toEqual(['frei'])
  })
})

describe('Gemischte Übungen aus der Aufgabenbank (17.10.2026)', () => {
  it('Stelle aus den gemischten Formen', () => {
    const stelle = (k: string) => {
      const ks = mixKennungen(k)
      return stelleImLehrwerk([...new Set(ks.map(formVon))], ks.filter((x) => x.includes('/')))
    }
    expect(stelle(mixSchluessel(['en.verb.there_is/praesens', 'en.verb.there_is/fragen']))).toEqual({ buch: 'Green Line 1', unit: 'Unit 1', station: 'Station 2' })
    expect(stelle(mixSchluessel(['en.verb.be_have/be-kurzformen', 'en.verb.be_have/be-praesens']))).toEqual({ buch: 'Green Line 1', unit: 'Unit 1', station: 'Station 1' })
  })
})
