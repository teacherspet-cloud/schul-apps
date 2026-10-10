import { describe, expect, it } from 'vitest'
import { bandGleich, grammatikNachLehrwerk, nachJahrGruppiert, nachLehrwerkGruppiert, passtSuche, tagMonat, vokabelKurzinfo } from '../src/renderer/src/modules/lernen/kurs/kursAnsicht'
import { stelleImLehrwerk } from '../src/shared/lehrwerkBand'

/*
 * Kursseite im Sprachenlernen (08.10.2026, abgestimmt): Kurzinfo im zugeklappten Kasten „Vokabeln", Grammatik nach
 * Schuljahren (neuestes oben, ohne Jahrgang zuletzt, Reihenfolge der Tabelle bleibt) und die Suche über Titel und Regeln.
 */
describe('Kurzinfo Vokabeln', () => {
  it('Wörter, Tagesziel, Zeitraum und Test', () => {
    const bis = new Date(2026, 11, 20, 23, 59).getTime()
    const test = new Date(2026, 10, 14, 8).getTime()
    expect(tagMonat(bis)).toBe('20.12.')
    expect(vokabelKurzinfo({ anzahl: 120, tagesziel: 10, bis, testTermin: test })).toBe('120 Wörter · 10 pro Tag · bis 20.12. · Test 14.11.')
    expect(vokabelKurzinfo({ anzahl: 1, bis: null, testTermin: null })).toBe('1 Wort · 10 pro Tag')
    expect(vokabelKurzinfo({ anzahl: 0, tagesziel: 5, bis, testTermin: null })).toBe('noch keine Vokabeln')
  })
})

describe('Grammatik nach Schuljahren', () => {
  it('Jahre absteigend, ohne Jahrgang zuletzt, Reihenfolge im Jahr bleibt', () => {
    const zeilen = [
      { t: 'b', j: 6 },
      { t: 'x', j: null },
      { t: 'a', j: 7 },
      { t: 'c', j: 6 },
      { t: 'y', j: undefined }
    ]
    const g = nachJahrGruppiert(zeilen, (z) => z.j)
    expect(g.map((x) => x.jahrgang)).toEqual([7, 6, null])
    expect(g[1].eintraege.map((x) => x.t)).toEqual(['b', 'c'])
    expect(g[2].eintraege.map((x) => x.t)).toEqual(['x', 'y'])
    expect(nachJahrGruppiert([], () => 5)).toEqual([])
  })
  it('Suche: alle Wörter, ohne Groß/klein, über mehrere Texte', () => {
    expect(passtSuche(['Simple past', 'Vergangenheit', undefined], '')).toBe(true)
    expect(passtSuche(['Simple past', 'Regelmäßige Verben'], 'PAST verben')).toBe(true)
    expect(passtSuche(['Simple past'], 'present')).toBe(false)
  })
})

describe('Grammatik nach Lehrwerk gliedern (09.10.2026)', () => {
  type G = { id: string; buch?: string; unit?: string; jahr?: number | null }
  const folge = (buch: string): string[] => (buch.startsWith('Green Line') ? ['Welcome back', 'Unit 1', 'Unit 2', 'Trailer 1', 'Unit 3'] : [])
  const gruppen = (z: G[]) =>
    nachLehrwerkGruppiert(
      z,
      (x) => (x.buch ? { buch: x.buch, unit: x.unit } : null),
      (x) => x.jahr,
      folge
    )
  it('neuester Band oben, darin die spätere Unit oben; ohne Lehrwerk nach Schuljahr darunter', () => {
    const g = gruppen([
      { id: 'a', buch: 'Green Line 5', unit: 'Unit 3' },
      { id: 'b', buch: 'Green Line 6', unit: 'Unit 1' },
      { id: 'c', buch: 'Green Line 6', unit: 'Unit 2' },
      { id: 'd', jahr: 9 },
      { id: 'e', jahr: null },
      { id: 'f', jahr: 10 },
      { id: 'g', buch: 'Green Line 6' },
      { id: 'h', buch: 'Green Line 6', unit: 'Trailer 1' }
    ])
    expect(g.map((x) => x.schluessel)).toEqual([
      'b:Green Line 6|Trailer 1',
      'b:Green Line 6|Unit 2',
      'b:Green Line 6|Unit 1',
      'b:Green Line 6|',
      'b:Green Line 5|Unit 3',
      'j:10',
      'j:9',
      'j:ohne'
    ])
  })
  it('Reihenfolge innerhalb einer Gruppe bleibt', () => {
    const g = gruppen([
      { id: '2', buch: 'Green Line 1', unit: 'Unit 1' },
      { id: '1', buch: 'Green Line 1', unit: 'Unit 1' }
    ])
    expect(g[0].eintraege.map((x) => x.id)).toEqual(['2', '1'])
  })
})

/*
 * Grammatik wie die Vokabeln (10.10.2026, Entscheidung der Lehrkraft): Band › Unit › Station, Späteres oben; was sich
 * nicht zuordnen lässt, unter der Unit, in der es freigegeben wurde. Befund 5b: Artikel, be, Kurzantworten unter „Year 5".
 */
describe('Grammatik nach Lehrwerk (Band › Unit › Station)', () => {
  type Z = { id: string; buch?: string; unit?: string; station?: string; zeit: number }
  const abschnitte = [
    { buch: 'Green Line 1', unit: 'Hello', name: 'Hello', zeit: 100, unitRang: 0 },
    { buch: 'Green Line 1', unit: 'Unit 1', name: 'Check-in, Station 1', zeit: 200, unitRang: 1, abschnittRang: 1 },
    { buch: 'Green Line 1', unit: 'Unit 1', name: 'Station 2', zeit: 300, unitRang: 1, abschnittRang: 2 },
    { buch: 'Green Line 1', unit: 'Unit 2', name: 'Station 1', zeit: 500, unitRang: 3, abschnittRang: 1 }
  ]
  const gliedern = (z: Z[], ab = abschnitte) =>
    grammatikNachLehrwerk(
      z,
      (x) => (x.buch ? { buch: x.buch, unit: x.unit, station: x.station } : null),
      (x) => x.zeit,
      ab
    )
  it('Band › Unit › Station, Späteres oben', () => {
    const g = gliedern([
      { id: 'a', buch: 'Green Line 1', unit: 'Unit 1', station: 'Station 1', zeit: 210 },
      { id: 'b', buch: 'Green Line 1', unit: 'Unit 1', station: 'Station 3', zeit: 220 },
      { id: 'c', buch: 'Green Line 1', unit: 'Unit 2', station: 'Station 1', zeit: 510 }
    ])
    expect(g.ohne).toEqual([])
    expect(g.baende.map((b) => b.buch)).toEqual(['Green Line 1'])
    expect(g.baende[0].units.map((u) => u.unit)).toEqual(['Unit 2', 'Unit 1'])
    expect(g.baende[0].units[1].stationen.map((s) => s.station)).toEqual(['Station 3', 'Station 1'])
  })
  it('ohne Stelle im Lehrwerk: unter der Unit, in der es freigegeben wurde (nicht nach Schuljahr)', () => {
    const g = gliedern([
      { id: 'artikel', zeit: 250 },
      { id: 'be', zeit: 320 },
      { id: 'vorher', zeit: 50 }
    ])
    expect(g.ohne).toEqual([])
    const u1 = g.baende[0].units.find((u) => u.unit === 'Unit 1')!
    expect(u1.stationen[0].station).toBe('')
    expect(u1.stationen[0].eintraege.map((x) => x.id)).toEqual(['artikel', 'be'])
    expect(g.baende[0].units.find((u) => u.unit === 'Hello')!.anzahl).toBe(1)
  })
  it('Wiederholung aus einem Band, den der Kurs nicht hat → Unit der Freigabe', () => {
    const ab = [{ buch: 'Green Line 3', unit: 'Unit 1', name: 'Station 1', zeit: 100, unitRang: 1 }]
    const g = gliedern([{ id: 'be', buch: 'Green Line 1', unit: 'Unit 1', station: 'Station 1', zeit: 150 }], ab)
    expect(g.baende.map((b) => b.buch)).toEqual(['Green Line 3'])
  })
  it('Kurs ohne Lehrwerk: Katalogstelle, sonst „Weitere"', () => {
    const g = gliedern([{ id: 'x', zeit: 1 }, { id: 'y', buch: 'Green Line 2', unit: 'Unit 1', zeit: 2 }], [])
    expect(g.ohne.map((x) => x.id)).toEqual(['x'])
    expect(g.baende[0].buch).toBe('Green Line 2')
  })
  it('neuester Band oben; Bandnamen wie bei den Vokabeln', () => {
    const ab = [
      { buch: 'Green Line 1', unit: 'Unit 4', name: 'Station 1', zeit: 100, unitRang: 5 },
      { buch: 'Green Line 2', unit: 'Unit 1', name: 'Station 1', zeit: 200, unitRang: 2 }
    ]
    const g = gliedern([{ id: 'a', buch: 'Green Line 1', unit: 'Unit 4', zeit: 1 }, { id: 'b', buch: 'Green Line 2', unit: 'Unit 1', zeit: 2 }], ab)
    expect(g.baende.map((b) => b.buch)).toEqual(['Green Line 2', 'Green Line 1'])
    expect(bandGleich('Green Line 1', 'Green Line 10')).toBe(false)
    expect(bandGleich('Green Line 1', 'green line 1 (Niedersachsen)')).toBe(true)
  })
  it('Katalog: Artikel, be und Kurzantworten gehören zu Green Line 1 Unit 1 – auch mit anderer Teilform', () => {
    expect(stelleImLehrwerk(['en.noun.articles'])).toEqual({ buch: 'Green Line 1', unit: 'Unit 1', station: 'Station 1' })
    expect(stelleImLehrwerk([], ['en.noun.articles/bestimmt'])).toEqual({ buch: 'Green Line 1', unit: 'Unit 1', station: 'Station 1' })
    expect(stelleImLehrwerk(['en.syn.short_answers/be'])).toMatchObject({ buch: 'Green Line 1', unit: 'Unit 1' })
    expect(stelleImLehrwerk([], ['en.verb.be_have/be-praesens'])).toMatchObject({ buch: 'Green Line 1', unit: 'Unit 1', station: 'Station 1' })
  })
})
