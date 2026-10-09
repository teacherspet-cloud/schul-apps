import { describe, expect, it } from 'vitest'
import { nachJahrGruppiert, nachLehrwerkGruppiert, passtSuche, tagMonat, vokabelKurzinfo } from '../src/renderer/src/modules/lernen/kurs/kursAnsicht'

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
