import { describe, expect, it } from 'vitest'
import { nachJahrGruppiert, passtSuche, tagMonat, vokabelKurzinfo } from '../src/renderer/src/modules/lernen/kurs/kursAnsicht'

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
