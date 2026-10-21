import { describe, expect, it } from 'vitest'
import { karteBereinigt, standText } from '../src/shared/sprechen/karten'
import {
  buchAbschnitte,
  fuellPlan,
  gruppiere,
  nachStand,
  nurImBereich,
  spaetesteBis,
  standBis,
  zufallsSet
} from '../src/renderer/src/modules/sprechpruefungen/stand'

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
  it('Ganzes Lehrwerk füllen: nur Buchabschnitte, nur was fehlt (3/4/4), volle Abschnitte entfallen', () => {
    const band = {
      name: 'Green Line 3',
      units: [
        { name: 'Unit 1', sections: abschnitte('Check-in', 'Station 1', 'Wortschatz', 'Exercise 10', 'Holiday words') },
        { name: 'Topic 1', sections: abschnitte('Spot on facts', 'Texts A', 'Identity development') }
      ]
    } as never
    expect(buchAbschnitte(band).map((x) => `${x.unit}|${x.abschnitt}`)).toEqual([
      'Unit 1|Check-in',
      'Unit 1|Station 1',
      'Topic 1|Spot on facts',
      'Topic 1|Texts A'
    ])
    const st = (abschnitt: string) => ({ band: 'Green Line 3', unit: 'Unit 1', abschnitt })
    const pool = [
      ...Array.from({ length: 3 }, () => ({ teil: 'interview', stand: st('Check-in') })),
      ...Array.from({ length: 4 }, () => ({ teil: 'monolog', stand: st('Check-in') })),
      ...Array.from({ length: 4 }, () => ({ teil: 'dialog', stand: st('Check-in') })),
      { teil: 'monolog', stand: st('Station 1') },
      // anderer Band und ganze Unit zählen nicht
      { teil: 'dialog', stand: { band: 'Green Line 2', unit: 'Unit 1', abschnitt: 'Station 1' } },
      { teil: 'dialog', stand: { band: 'Green Line 3', unit: 'Unit 1' } }
    ]
    const plan = fuellPlan(band, pool)
    expect(plan.filter((x) => x.unit === 'Unit 1').map((x) => `${x.abschnitt}|${x.teil}|${x.anzahl}`)).toEqual([
      'Station 1|interview|3',
      'Station 1|monolog|3',
      'Station 1|dialog|4'
    ])
    expect(plan.length).toBe(9)
  })
  it('Zufällige Kombination: bis zum Stand, zwei verschiedene Bildkarten, ohne Stand nur ersatzweise', () => {
    const ziel = { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 1' }
    const pool = [
      { id: 'i1', teil: 'interview', stand: { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Check-in' } },
      { id: 'i2', teil: 'interview', stand: { band: 'Green Line 3', unit: 'Unit 2' } },
      { id: 'i3', teil: 'interview', stand: undefined },
      { id: 'm1', teil: 'monolog', stand: { band: 'Green Line 2', unit: 'Unit 1' } },
      { id: 'm2', teil: 'monolog', stand: { band: 'Green Line 3', unit: 'Unit 1', abschnitt: 'Station 1' } },
      { id: 'd1', teil: 'dialog', stand: undefined }
    ]
    // immer das erste Element: i2 liegt nach dem Stand, i3 hat keinen
    const z = zufallsSet(pool, ziel, BAENDE, () => 0)
    expect(z).toEqual({ interview: 'i1', monologA: 'm1', monologB: 'm2', dialog: 'd1' })
    // immer das letzte: A und B bleiben verschieden
    const y = zufallsSet(pool, ziel, BAENDE, () => 0.999)
    expect(y.monologA).toBe('m2')
    expect(y.monologB).toBe('m1')
    expect(zufallsSet([], ziel, BAENDE, () => 0.5)).toEqual({ interview: null, monologA: null, monologB: null, dialog: null })
  })
  it('Prüfungsset: Karten außerhalb eines enger gewordenen Bereichs fallen aus der Auswahl', () => {
    const imBereich = new Set(['i1', 'm1'])
    expect(nurImBereich({ i: 'i1', a: 'm1', b: 'm2', d: null }, (id) => imBereich.has(id))).toEqual({ i: 'i1', a: 'm1', b: null, d: null })
  })
})
