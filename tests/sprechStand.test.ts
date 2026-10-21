import { describe, expect, it } from 'vitest'
import { karteBereinigt, standText } from '../src/shared/sprechen/karten'
import { gruppiere, nachStand, spaetesteBis, standBis } from '../src/renderer/src/modules/sprechpruefungen/stand'

/* Lehrwerk-Stand der Sprechkarten (21.10.2026, Wunsch der Lehrkraft: nachvollziehbar, bis wohin ein Pool reicht) */
const abschnitte = (...n: string[]) => n.map((name) => ({ name, entryCount: 0 }))
const BAENDE = [
  { name: 'Green Line 2', units: [{ name: 'Unit 1', sections: abschnitte('Station 1', 'Station 2') }] },
  {
    name: 'Green Line 3',
    units: [
      { name: 'Unit 1', sections: abschnitte('Check-in', 'Station 1', 'Station 2') },
      { name: 'Unit 2', sections: abschnitte('Station 1') }
    ]
  }
] as never

describe('Lehrwerk-Stand der Sprechkarten', () => {
  it('bleibt beim Bereinigen erhalten, ohne Band oder Unit fällt er weg', () => {
    const roh = { art: 'interview', thema: 'You', fragen: ['a?', 'b?', 'c?'] }
    expect(karteBereinigt({ ...roh, stand: { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 2' } }, 'x')?.stand).toEqual({
      band: 'Green Line 3',
      unit: 'Unit 1',
      abschnitt: 'Station 2'
    })
    expect(karteBereinigt({ ...roh, stand: { band: 'Green Line 3' } }, 'x')?.stand).toBeUndefined()
    expect(standText({ band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 2' })).toBe('bis Green Line 3 › Unit 1 › Station 2')
  })
  it('sortiert in Buchfolge: Band, Unit, Abschnitt; ganze Unit nach ihren Abschnitten, ohne Stand zuletzt', () => {
    const l = [
      undefined,
      { band: 'Green Line 3', unit: 'Unit 2' },
      { band: 'Green Line 3', unit: 'Unit 1' },
      { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 2' },
      { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Check-in' },
      { band: 'Green Line 2', unit: 'Unit 1', abschnitt: 'Station 2' }
    ]
    expect([...l].sort((x, y) => nachStand(x, y, BAENDE)).map((s) => standText(s))).toEqual([
      'bis Green Line 2 › Unit 1 › Station 2',
      'bis Green Line 3 › Unit 1 › Check-in',
      'bis Green Line 3 › Unit 1 › Station 2',
      'bis Green Line 3 › Unit 1',
      'bis Green Line 3 › Unit 2',
      ''
    ])
  })
  it('bis zum Stand: frühere Bände und Abschnitte ja, spätere nein; ganze Unit = ihr Ende; ohne Stand immer', () => {
    const ziel = { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 1' }
    expect(standBis({ band: 'Green Line 2', unit: 'Unit 1' }, ziel, BAENDE)).toBe(true)
    expect(standBis({ band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Check-in' }, ziel, BAENDE)).toBe(true)
    expect(standBis({ band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 1' }, ziel, BAENDE)).toBe(true)
    expect(standBis({ band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 2' }, ziel, BAENDE)).toBe(false)
    expect(standBis({ band: 'Green Line 3', unit: 'Unit 1' }, ziel, BAENDE)).toBe(false)
    expect(standBis({ band: 'Green Line 3', unit: 'Unit 1' }, { band: 'Green Line 3', unit: 'Unit 1' }, BAENDE)).toBe(true)
    expect(standBis({ band: 'Green Line 3', unit: 'Unit 2' }, { band: 'Green Line 3', unit: 'Unit 1' }, BAENDE)).toBe(false)
    expect(standBis(undefined, ziel, BAENDE)).toBe(true)
    expect(standBis({ band: 'Green Line 3', unit: 'Unit 2' }, undefined, BAENDE)).toBe(true)
  })
  it('Gruppen Band › Unit in Buchfolge, innen nach Abschnitt, ohne Stand zuletzt; spätester Treffer zuerst', () => {
    const l = [
      { id: 'a', stand: { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 2' } },
      { id: 'b', stand: undefined },
      { id: 'c', stand: { band: 'Green Line 2', unit: 'Unit 1' } },
      { id: 'd', stand: { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Check-in' } }
    ]
    expect(gruppiere(l, (x) => x.stand, BAENDE).map((g) => [g.titel, g.eintraege.map((x) => x.id).join('')])).toEqual([
      ['Green Line 2 › Unit 1', 'c'],
      ['Green Line 3 › Unit 1', 'da'],
      ['Ohne Lehrwerk-Stand', 'b']
    ])
    const ziel = { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 1' }
    expect(spaetesteBis(l, (x) => x.stand, ziel, BAENDE).map((x) => x.id)).toEqual(['d', 'c', 'b'])
  })
})
