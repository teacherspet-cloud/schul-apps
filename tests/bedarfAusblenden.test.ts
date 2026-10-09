/**
 * Handlungsbedarf ausblenden (09.10.2026): Ein Eintrag bleibt verborgen, solange die Lage gleich bleibt oder besser wird;
 * er kommt wieder bei mehr Betroffenen, neuem Termin, höherer Zahl, anderer Art oder anderem Text. Rein, ohne Datenbank.
 */
import { describe, expect, it } from 'vitest'
import { bedarfAufteilen, bedarfWiederSichtbar, vokabelBedarf, type Bedarf, type Merkmal } from '../src/server/klassen'

const TAG = 86_400_000
const jetzt = Date.parse('2026-10-08T12:00:00Z')
const tagVor = (n: number): string => new Date(jetzt - n * TAG).toISOString().slice(0, 10)
const lernende = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Ben' },
  { id: 'c', name: 'Cem' }
]
const kurs = (testTermin: number | null = null) => ({
  id: 'k1',
  titel: '5b - Englisch',
  fach: 'Englisch',
  testTermin,
  sicherSchnitt: 0.4,
  ersterTag: tagVor(3),
  reifeWoerter: 0
})
const vok = (inaktiv: string[], termin: number | null = null): Bedarf =>
  vokabelBedarf(
    [kurs(termin)],
    Object.fromEntries(lernende.map((l) => [l.id, { reifSicher: 0, reifGesamt: 0, zuletzt: inaktiv.includes(l.id) ? null : tagVor(0) }])),
    lernende,
    'Englisch',
    jetzt
  )!

describe('Handlungsbedarf ausblenden', () => {
  it('Merkmal der Vokabeln: nur Kennungen, keine Namen', () => {
    const b = vok(['a', 'b'])
    expect(b.schluessel).toBe('vokabeln')
    expect(b.merkmal).toEqual({ art: 'inaktiv', termin: null, ids: ['i:a', 'i:b'] })
    expect(JSON.stringify(b.merkmal)).not.toMatch(/Ada|Ben/)
  })

  it('bleibt verborgen bei gleicher oder besserer Lage', () => {
    const alt = vok(['a', 'b']).merkmal
    expect(bedarfWiederSichtbar(alt, vok(['a', 'b']).merkmal)).toBe(false)
    expect(bedarfWiederSichtbar(alt, vok(['a']).merkmal)).toBe(false)
    expect(bedarfWiederSichtbar({ art: 'entscheiden', zahl: 5 }, { art: 'entscheiden', zahl: 3 })).toBe(false)
  })

  it('kommt wieder bei mehr Betroffenen, neuem Termin, höherer Zahl, anderer Art oder anderem Text', () => {
    const alt = vok(['a']).merkmal
    expect(bedarfWiederSichtbar(alt, vok(['a', 'c']).merkmal)).toBe(true)
    expect(bedarfWiederSichtbar(alt, vok(['a'], jetzt + 3 * TAG).merkmal)).toBe(true)
    const mitTermin = vok(['a'], jetzt + 3 * TAG).merkmal
    expect(bedarfWiederSichtbar(mitTermin, vok(['a'], jetzt + 3 * TAG).merkmal)).toBe(false)
    expect(bedarfWiederSichtbar(mitTermin, vok(['a'], jetzt + 5 * TAG).merkmal)).toBe(true)
    expect(bedarfWiederSichtbar({ art: 'entscheiden', zahl: 2 }, { art: 'entscheiden', zahl: 3 })).toBe(true)
    expect(bedarfWiederSichtbar({ art: 'inaktiv' }, { art: 'foerdern' })).toBe(true)
    expect(bedarfWiederSichtbar({ art: 'reihe', text: 'x1' }, { art: 'reihe', text: 'x2' })).toBe(true)
  })

  it('teilt auf, Ausgeblendetes zählt nicht, überholte Merkmale gelten als veraltet', () => {
    const test: Bedarf = { art: 'entscheiden', text: '„Test": 2 Antworten zu prüfen', schluessel: 'test:t1', merkmal: { art: 'entscheiden', zahl: 2 } }
    const v = vok(['a', 'c'])
    const gemerkt = new Map<string, Merkmal>([
      ['test:t1', { art: 'entscheiden', zahl: 2 }],
      ['vokabeln', { art: 'inaktiv', termin: null, ids: ['i:a'] }],
      ['blatt:weg:frist', { art: 'blatt', zahl: 1 }]
    ])
    const r = bedarfAufteilen([test, v], gemerkt)
    expect(r.sichtbar.map((b) => b.schluessel)).toEqual(['vokabeln'])
    expect(r.ausgeblendet.map((b) => b.schluessel)).toEqual(['test:t1'])
    expect(r.veraltet.sort()).toEqual(['blatt:weg:frist', 'vokabeln'])
  })
})
