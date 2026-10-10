import { describe, expect, it } from 'vitest'
import { abschnittStelle, nachBaenden, nachUnits, unitZahl } from '../src/shared/kursAbschnitte'
import { abschnittsZeilen, auchRichtigAusText, problemLernende, wortPasst, wortSicherAnteile, zeilenFiltern } from '../src/shared/kursWoerter'
import type { WortStand } from '../src/shared/vokabeltrainer'

/*
 * Kasten „Abschnitte & Wörter" (10.10.2026): Units und Abschnitte absteigend wie im Buch, Wörter je Abschnitt, Stand der
 * Klasse je Wort, Problemwörter je Person, Suche.
 */
const TAG = 86_400_000
const JETZT = Date.parse('2026-10-10T10:00:00Z')
const stand = (x: Partial<WortStand>): WortStand => ({
  fach: 0,
  faellig: 0,
  frei: [],
  erkannt: 0,
  erkennenVersuche: 0,
  versuche: 0,
  falsch: 0,
  fehlerTexte: [],
  zuletzt: 0,
  ...x
})
const SICHER = stand({ fach: 3, frei: [JETZT - 10 * TAG, JETZT - 2 * TAG], versuche: 4 })

describe('Reihenfolge absteigend wie im Buch', () => {
  const z = (unit: string, name: string, zeit = 1, buch = 'Green Line 1') => ({ buch, unit, name, zeit })
  it('Unit 3 über Unit 2 über Unit 1, im Unit die späteren Abschnitte zuerst', () => {
    const g = nachUnits([
      z('Unit 1', 'Check-in'),
      z('Unit 1', 'Station 1'),
      z('Unit 1', 'Story'),
      z('Unit 2', 'Check-in'),
      z('Unit 2', 'Station 2'),
      z('Unit 3', 'Check-in'),
      z('Unit 3', 'Story')
    ])
    expect(g.map((u) => u.unit)).toEqual(['Unit 3', 'Unit 2', 'Unit 1'])
    expect(g[0].zeilen.map((x) => x.name)).toEqual(['Story', 'Check-in'])
    expect(g[2].zeilen.map((x) => x.name)).toEqual(['Story', 'Station 1', 'Check-in'])
  })
  it('auch wenn eine frühere Unit später freigegeben wurde', () => {
    const g = nachUnits([z('Unit 3', 'Check-in', 5), z('Unit 1', 'Check-in', 9)])
    expect(g.map((u) => u.unit)).toEqual(['Unit 3', 'Unit 1'])
  })
  it('Abschnitt in falscher Freigabe-Reihenfolge: Buchreihenfolge zählt', () => {
    const g = nachUnits([z('Unit 2', 'Story'), z('Unit 2', 'Check-in'), z('Unit 2', 'Station 1')])
    expect(g[0].zeilen.map((x) => x.name)).toEqual(['Story', 'Station 1', 'Check-in'])
  })
  it('Units ohne Zahl stehen hinter der Unit davor („Hello" unter Unit 1, „Media smart" zwischen 1 und 2)', () => {
    const g = nachUnits([z('Hello', 'Check-in'), z('Unit 1', 'Check-in'), z('Media smart', 'Wortschatz'), z('Unit 2', 'Station 1')])
    expect(g.map((u) => u.unit)).toEqual(['Unit 2', 'Media smart', 'Unit 1', 'Hello'])
  })
  it('unbekannte Abschnittsnamen: später freigegeben = weiter oben; ohne Unit ganz unten', () => {
    const g = nachUnits([z('', 'Weather'), z('Lección 1', 'A'), z('Lección 1', 'B'), z('Lección 2', 'A')])
    expect(g.map((u) => u.unit)).toEqual(['Lección 2', 'Lección 1', ''])
    expect(g[1].zeilen.map((x) => x.name)).toEqual(['B', 'A'])
  })
  it('Bände bleiben neuester zuerst', () => {
    const g = nachBaenden([z('Unit 1', 'Check-in', 1, 'Green Line 1'), z('Unit 1', 'Check-in', 2, 'Green Line 2'), z('Unit 4', 'Story', 3, 'Green Line 1')])
    expect(g.map((b) => b.buch)).toEqual(['Green Line 2', 'Green Line 1'])
    expect(g[1].units.map((u) => u.unit)).toEqual(['Unit 4', 'Unit 1'])
  })
  it('Hilfen: Unit-Zahl und Stelle im Buch', () => {
    expect(unitZahl('Unit 12')).toBe(12)
    expect(unitZahl('Hello')).toBeNull()
    expect(abschnittStelle('Check-in, Station 1')).toBe(abschnittStelle('Station 1'))
    expect(abschnittStelle('Story')).toBeGreaterThan(abschnittStelle('Station 3')!)
    expect(abschnittStelle('Weather')).toBeNull()
  })
})

describe('Wörter je Abschnitt', () => {
  const W = Array.from({ length: 5 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
  const teile = [
    { titel: 'Unit 1 · Check-in', anzahl: 2, zeit: 1, buch: 'Green Line 1', unit: 'Unit 1' },
    { titel: 'Unit 1 · Station 1', anzahl: 2, zeit: 2, buch: 'Green Line 1', unit: 'Unit 1' }
  ]
  it('Bereiche nach Anzahl, der letzte nimmt den Rest; Name aus dem Titel', () => {
    const z = abschnittsZeilen(teile, W, null)
    expect(z.map((x) => [x.name, x.woerter.map((v) => v.id)])).toEqual([
      ['Check-in', ['w0', 'w1']],
      ['Station 1', ['w2', 'w3', 'w4']]
    ])
    expect(z[1].stat).toBeUndefined()
  })
  it('Statistik nur, wenn sie zu den Abschnitten passt', () => {
    const st = [
      { name: 'Check-in', unit: 'Unit 1', buch: 'Green Line 1' },
      { name: 'Station 1', unit: 'Unit 1', buch: 'Green Line 1' }
    ]
    expect(abschnittsZeilen(teile, W, null, st)[0].stat).toBe(st[0])
    expect(abschnittsZeilen(teile, W, null, st.slice(1))[0].stat).toBeUndefined()
  })
  it('ohne Abschnitte: ein Abschnitt mit allen Wörtern', () => {
    expect(abschnittsZeilen([], W, null).map((x) => x.woerter.length)).toEqual([5])
  })
  it('Suche und „Nur Problemwörter"', () => {
    const z = abschnittsZeilen(teile, [...W.slice(0, 4), { id: 'w4', term: 'café', translation: 'Café', auchRichtig: ['coffee shop'] }], null)
    expect(zeilenFiltern(z, 'cafe', null).map((x) => x.woerter.map((v) => v.id))).toEqual([['w4']])
    expect(zeilenFiltern(z, 'COFFEE', null)[0].woerter[0].id).toBe('w4')
    expect(zeilenFiltern(z, 'station', null).map((x) => x.woerter.length)).toEqual([3])
    expect(zeilenFiltern(z, '', new Set(['w1'])).map((x) => [x.name, x.woerter.map((v) => v.id)])).toEqual([['Check-in', ['w1']]])
    expect(zeilenFiltern(z, 'nichts', null)).toEqual([])
    expect(zeilenFiltern(z, '', null)).toBe(z)
    expect(wortPasst({ term: 'Straße', translation: 'street' }, 'STRASSE')).toBe(false)
    expect(wortPasst({ term: 'Straße', translation: 'street' }, 'straß')).toBe(true)
  })
})

describe('Stand der Klasse je Wort', () => {
  it('Anteil sicher über alle Lernenden', () => {
    const r = wortSicherAnteile([{ id: 'a' }, { id: 'b' }], [{ a: SICHER }, { a: SICHER, b: SICHER }, {}])
    expect(r).toEqual({ a: 0.67, b: 0.33 })
    expect(wortSicherAnteile([{ id: 'a' }], [])).toEqual({})
  })
  it('Problemwort: wer Fehler hat, meiste zuerst', () => {
    const r = problemLernende(['a'], [
      { name: 'Ben', stand: { a: stand({ falsch: 1, versuche: 3 }) } },
      { name: 'Mia', stand: { a: stand({ falsch: 4, versuche: 5 }) } },
      { name: 'Ali', stand: { a: stand({ versuche: 2 }) } },
      { name: 'Ida', stand: {} }
    ])
    expect(r.a).toEqual([
      { name: 'Mia', falsch: 4, versuche: 5 },
      { name: 'Ben', falsch: 1, versuche: 3 }
    ])
  })
  it('„auch richtig" aus dem Feld: Semikolon, ohne Leeres und Doppeltes', () => {
    expect(auchRichtigAusText(' to go; ; To go;to walk, stroll ')).toEqual(['to go', 'to walk, stroll'])
  })
})
