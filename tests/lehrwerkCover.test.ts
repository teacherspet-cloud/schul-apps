import { describe, expect, it } from 'vitest'
import { bandFarbe, bandKuerzel, COVER_AUSGABEN, coverAusgabe } from '../src/shared/lehrwerkCover'

// Cover der Schulbuch-Bände (09.10.2026): Ausgabe nach Bundesland, Rückfall auf die allgemeine Ausgabe
const nds = (band: string) => ({ name: `Green Line ${band}`, reihe: 'Green Line', band, ausgabe: 'ab 2021', stateId: 'NI' })

describe('coverAusgabe', () => {
  it('Niedersachsen-Bände der App: Ausgabe ab 2021, Bände 5 und 6 in der G9-Fassung', () => {
    expect(coverAusgabe(nds('1'))?.isbn).toBe('978-3-12-864010-5')
    expect(coverAusgabe(nds('4'))?.isbn).toBe('978-3-12-864040-2')
    expect(coverAusgabe(nds('5'))?.isbn).toBe('978-3-12-874050-8')
    expect(coverAusgabe(nds('6'))?.isbn).toBe('978-3-12-874060-7')
    expect(coverAusgabe(nds('Transition'))?.isbn).toBe('978-3-12-834260-3')
  })

  it('das Land des Bands geht dem der Lerngruppe vor', () => {
    expect(coverAusgabe(nds('1'), 'BY')?.ausgabe).toBe('Ausgabe ab 2021')
  })

  it('Band ohne Land: Ausgabe des Lands der Lerngruppe', () => {
    const b = { name: 'Green Line 1' }
    expect(coverAusgabe(b, 'BY')?.isbn).toBe('978-3-12-803010-4')
    expect(coverAusgabe(b, 'BW')?.isbn).toBe('978-3-12-875010-1')
    expect(coverAusgabe({ name: 'Green Line Transition' }, 'BY')?.isbn).toBe('978-3-12-834370-9')
    expect(coverAusgabe({ name: 'Green Line Oberstufe' }, 'NW')?.isbn).toBe('978-3-12-550002-0')
  })

  it('das Jahr der Lehrwerk-Angabe entscheidet unter den Ausgaben eines Lands', () => {
    expect(coverAusgabe({ name: 'Green Line 2', ausgabe: 'ab 2019' }, 'NW')?.isbn).toBe('978-3-12-835020-2')
    expect(coverAusgabe({ name: 'Green Line 2', ausgabe: 'ab 2021' }, 'NW')?.isbn).toBe('978-3-12-864020-4')
    expect(coverAusgabe({ name: 'Green Line 3', ausgabe: 'Ausgabe Baden-Württemberg ab 2016' }, 'BW')?.isbn).toBe('978-3-12-834130-9')
  })

  it('ohne passendes Land: allgemeine Ausgabe', () => {
    expect(coverAusgabe({ name: 'Green Line 3' })?.isbn).toBe('978-3-12-864030-3')
    expect(coverAusgabe({ name: 'Green Line 6' }, 'XX')?.isbn).toBe('978-3-12-874060-7')
  })

  it('unbekannte Reihe oder unbekannter Band → kein Cover', () => {
    expect(coverAusgabe({ name: 'Access 1' }, 'NI')).toBeNull()
    expect(coverAusgabe({ name: 'Green Line 9' }, 'NI')).toBeNull()
  })

  it('nur Adressen beim Verlag, jede Reihe/Band mit allgemeiner Ausgabe', () => {
    for (const a of COVER_AUSGABEN) expect(a.url).toMatch(/^https:\/\/assets\.klett\.de\/assets\/[0-9a-f]+\/[\w-]+\.jpg$/)
    const baende = new Set(COVER_AUSGABEN.map((a) => a.band))
    for (const band of baende) expect(COVER_AUSGABEN.some((a) => a.band === band && a.allgemein)).toBe(true)
  })
})

describe('Ersatzkachel', () => {
  it('Kürzel und Farbe', () => {
    expect(bandKuerzel(nds('3'))).toBe('3')
    expect(bandKuerzel({ name: 'Green Line Transition' })).toBe('T')
    expect(bandFarbe(nds('1'))).toBe('green')
    expect(typeof bandFarbe({ name: 'Découvertes 1' })).toBe('string')
  })
})
