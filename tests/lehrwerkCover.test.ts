import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    for (const a of COVER_AUSGABEN)
      expect(a.url).toMatch(
        a.verlag === 'Klett'
          ? /^https:\/\/assets\.klett\.de\/assets\/[0-9a-f]+\/[\w-]+_2469_200\.jpg$/
          : /^https:\/\/static\.cornelsen\.de\/media\/\d{13}\/\d{13}_COVER_STD_B110_X2\.png$/
      )
    for (const a of COVER_AUSGABEN) expect(['Klett', 'Cornelsen']).toContain(a.verlag)
    const baende = new Set(COVER_AUSGABEN.map((a) => `${a.reihe}|${a.band}`))
    for (const rb of baende) expect(COVER_AUSGABEN.some((a) => `${a.reihe}|${a.band}` === rb && a.allgemein)).toBe(true)
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

// Französisch und Spanisch (10.10.2026): Cover für die Platzhalter-Lehrwerke vom 09.10.2026
const isbnGueltig = (isbn: string): boolean => {
  const z = isbn.replace(/-/g, '')
  if (!/^97[89]\d{10}$/.test(z)) return false
  const summe = [...z].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0)
  return summe % 10 === 0
}

const ORDNER = join(__dirname, '..', 'resources', 'lehrwerke')
const platzhalter = readdirSync(ORDNER)
  .filter((f) => /^(apuntate-20(16|24)|decouvertes-(serie-jaune|2020))-\d\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(ORDNER, f), 'utf-8')) as { id: string; name: string; reihe: string; ausgabe: string; band: string; stateId?: string })

const ERWARTET: Record<string, string | null> = {
  'decouvertes-serie-jaune-1': '978-3-12-622011-8',
  'decouvertes-serie-jaune-2': '978-3-12-622021-7',
  'decouvertes-serie-jaune-3': '978-3-12-622031-6',
  'decouvertes-serie-jaune-4': '978-3-12-622041-5',
  'decouvertes-serie-jaune-5': '978-3-12-622051-4',
  'decouvertes-2020-1': '978-3-12-624011-6',
  'decouvertes-2020-2': '978-3-12-624021-5',
  'decouvertes-2020-3': '978-3-12-624031-4',
  'decouvertes-2020-4': '978-3-12-624041-3',
  'decouvertes-2020-5': '978-3-12-624051-2',
  'apuntate-2016-1': '978-3-06-024837-7',
  'apuntate-2016-2': '978-3-06-121118-9',
  'apuntate-2016-3': '978-3-06-121196-7',
  'apuntate-2016-4': '978-3-06-121197-4',
  'apuntate-2016-5': '978-3-06-121198-1',
  'apuntate-2024-1': '978-3-06-122987-0',
  'apuntate-2024-2': '978-3-06-123052-4',
  'apuntate-2024-3': '978-3-06-123053-1',
  'apuntate-2024-4': '978-3-06-123054-8',
  // Band 5 der Ausgabe 2024 ist noch nicht erschienen → Ersatzkachel, nicht das Cover der Ausgabe 2016
  'apuntate-2024-5': null
}

describe('Cover Découvertes und ¡Apúntate!', () => {
  it('alle Platzhalter-Bände gefunden', () => {
    expect(platzhalter.map((p) => p.id).sort()).toEqual(Object.keys(ERWARTET).sort())
  })

  it('jeder Platzhalter-Band bekommt sein Cover – mit und ohne Land der Lerngruppe', () => {
    for (const p of platzhalter) {
      const band = { name: p.name, reihe: p.reihe, band: p.band, ausgabe: p.ausgabe, stateId: p.stateId }
      for (const land of [undefined, 'NI', 'BY', 'NW'])
        expect(coverAusgabe(band, land)?.isbn ?? null, `${p.id} / ${land}`).toBe(ERWARTET[p.id])
    }
  })

  it('nur über den Namen (Bandgruppe): längste Reihe gewinnt, Akzente und „¡" egal', () => {
    expect(coverAusgabe({ name: 'Découvertes Série jaune 3' })?.isbn).toBe('978-3-12-622031-6')
    expect(coverAusgabe({ name: 'Découvertes 3' })?.isbn).toBe('978-3-12-624031-4')
    expect(coverAusgabe({ name: 'Decouvertes Serie jaune 2' })?.isbn).toBe('978-3-12-622021-7')
    expect(coverAusgabe({ name: '¡Apúntate! 5' }, 'NI')?.isbn).toBe('978-3-06-121198-1')
    expect(coverAusgabe({ name: 'Apuntate 1' }, 'NI')?.isbn).toBe('978-3-06-122987-0')
    expect(bandKuerzel({ name: '¡Apúntate! 5', reihe: '¡Apúntate!', band: '5', ausgabe: 'ab 2024' })).toBe('5')
  })

  it('gültige ISBN, Bundesländer, Verlagsadresse', () => {
    for (const a of COVER_AUSGABEN) {
      expect(isbnGueltig(a.isbn), a.isbn).toBe(true)
      expect(a.laender.length).toBeGreaterThan(0)
      if (a.verlag === 'Cornelsen') {
        expect(a.isbn).toMatch(/^978-3-06-/)
        expect(a.url).toContain(a.isbn.replace(/-/g, ''))
      } else expect(a.isbn).toMatch(/^978-3-12-/)
    }
  })
})
