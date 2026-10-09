import { describe, expect, it } from 'vitest'
import {
  abschnitteEinordnen,
  abschnittStatistik,
  baendeText,
  baendeVon,
  buchAusKennung,
  kursName,
  nachUnits,
  type KursTeil
} from '../src/shared/kursAbschnitte'
import type { Vokabel, WortStand } from '../src/shared/vokabeltrainer'

/*
 * Vokabelkurs nach Abschnitten (09.10.2026, „Meine Klassen" → Reiter „Vokabeln"): Name nach Kurs statt nach den ersten
 * Abschnitten, Einordnung je Unit und Statistik je Abschnitt aus den Lernständen.
 */
const TAG = 86_400_000
const JETZT = Date.parse('2026-10-09T10:00:00Z')

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
const AUFBAU = stand({ fach: 1, versuche: 2 })

describe('Einordnung und Name', () => {
  const quelle = {
    lehrwerk: 'green-line-1',
    unit: 'Unit 2',
    abschnitte: [],
    units: [
      { unit: 'Unit 1', abschnitte: ['Check-in', 'Station 1', 'Station 2', 'Station 3'] },
      { unit: 'Unit 2', abschnitte: ['Station 1'] }
    ]
  }
  const teile = [
    { titel: 'Green Line 1 - Unit 1 - Check-in, Station 1, Station 2' },
    { titel: 'Station 3' },
    { titel: 'Station 1' },
    { titel: 'Weather' }
  ]
  it('ältere Erstfreigabe, Abschnitte ohne Unit (aus der Herkunft, in Buchreihenfolge), Liste', () => {
    expect(abschnitteEinordnen(teile, quelle)).toEqual([
      { buch: 'Green Line 1', unit: 'Unit 1', name: 'Check-in, Station 1, Station 2' },
      { unit: 'Unit 1', name: 'Station 3' },
      { unit: 'Unit 2', name: 'Station 1' },
      { unit: 'Unit 2', name: 'Weather' }
    ])
  })
  it('„Unit · Abschnitt" und mehrere Units in einem Teil', () => {
    expect(abschnitteEinordnen([{ titel: 'Unit 3 · Story' }, { titel: 'Green Line 2 - Unit 1: Check-in - Unit 2: Station 1' }], null)).toEqual([
      { unit: 'Unit 3', name: 'Story' },
      { buch: 'Green Line 2', unit: 'Unit 1', name: 'Unit 1: Check-in · Unit 2: Station 1' }
    ])
  })
  it('sprachneutral: Latein und Französisch mit eigenen Kapitelnamen', () => {
    const qLa = { lehrwerk: 'pontes', unit: 'Lektion 4', abschnitte: [], units: [{ unit: 'Lektion 3', abschnitte: ['Wortschatz'] }, { unit: 'Lektion 4', abschnitte: ['Wortschatz'] }] }
    const eLa = abschnitteEinordnen([{ titel: 'Pontes - Lektion 3 - Wortschatz' }, { titel: 'Wortschatz' }], qLa)
    expect(eLa.map((e) => e.unit)).toEqual(['Lektion 3', 'Lektion 4'])
    expect(kursName('Latein', baendeVon('Pontes - Lektion 3 - Wortschatz', eLa, qLa))).toBe('Vokabeln Latein · Pontes')
    const qFr = { lehrwerk: 'decouvertes-1', unit: 'Unité 2', abschnitte: ['Atelier A', 'Atelier B'] }
    const eFr = abschnitteEinordnen([{ titel: 'Atelier A' }, { titel: 'Atelier B' }], qFr)
    expect(eFr.map((e) => [e.unit, e.name])).toEqual([
      ['Unité 2', 'Atelier A'],
      ['Unité 2', 'Atelier B']
    ])
    expect(kursName('Französisch', baendeVon('Découvertes 1 - Unité 2 - Atelier A, Atelier B', eFr, qFr))).toBe('Vokabeln Französisch · Découvertes 1')
  })
  it('Listen ohne Lehrwerk: keine Unit, ein Bindestrich macht noch keinen Band', () => {
    expect(abschnitteEinordnen([{ titel: 'Weather - Wetter' }], null)).toEqual([{ unit: '', name: 'Weather - Wetter' }])
  })
  it('Kursname: Band aus dem Titel, mehrere Bände als Spanne', () => {
    const e = abschnitteEinordnen(teile, quelle)
    expect(kursName('Englisch', baendeVon('Green Line 1 - Unit 1: Check-in, Station 1, Station 2', e, quelle))).toBe('Vokabeln Englisch · Green Line 1')
    // Später Green Line 2 dazu: die Herkunft nennt nur noch den neuen Band
    const b = baendeVon('Green Line 1 - Unit 1 - Check-in', e, { lehrwerk: 'green-line-2-nds', unit: 'Unit 1', abschnitte: [] })
    expect(b).toEqual(['Green Line 1', 'Green Line 2'])
    expect(kursName('Englisch', b)).toBe('Vokabeln Englisch · Green Line 1–2')
    expect(kursName('Englisch', [])).toBe('Vokabeln Englisch')
    expect(baendeText(['Green Line 1', 'Lighthouse 2'])).toBe('Green Line 1 / Lighthouse 2')
    expect(buchAusKennung('green-line-3-nds')).toBe('Green Line 3')
  })
})

describe('Statistik je Abschnitt', () => {
  const woerter: Vokabel[] = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, term: `t${i}`, translation: `ü${i}` }))
  // Abschnitt A (4 Wörter, vor 20 Tagen), B (6 Wörter, vor 3 Tagen)
  const teile: KursTeil[] = [
    { titel: 'Station 1', anzahl: 4, zeit: JETZT - 20 * TAG },
    { titel: 'Station 2', anzahl: 6, zeit: JETZT - 3 * TAG }
  ]
  const einordnung = [
    { unit: 'Unit 1', name: 'Station 1' },
    { unit: 'Unit 2', name: 'Station 2' }
  ]
  const staende: Record<string, WortStand>[] = [
    // Mia: A ganz sicher, B zur Hälfte im Aufbau
    { w0: SICHER, w1: SICHER, w2: SICHER, w3: SICHER, w4: AUFBAU, w5: AUFBAU, w6: AUFBAU },
    // Ben: A ein Wort sicher (25 % → Schwierigkeiten), w1 oft falsch
    { w0: SICHER, w1: stand({ fach: 1, versuche: 5, falsch: 4 }) },
    // Ela: nichts geübt
    {}
  ]
  const r = abschnittStatistik(teile, woerter, staende, einordnung, JETZT)
  it('Wörter, Anteile über alle Lernenden, je Person', () => {
    expect(r.map((a) => [a.unit, a.name, a.woerter])).toEqual([
      ['Unit 1', 'Station 1', 4],
      ['Unit 2', 'Station 2', 6]
    ])
    // A: 12 Plätze – sicher 5, im Aufbau 1, neu 6
    expect([r[0].sicher, r[0].aufbau, r[0].neu]).toEqual([5 / 12, 1 / 12, 6 / 12])
    expect(r[0].jeLernende).toEqual([
      [1, 0],
      [0.25, 0.25],
      [0, 0]
    ])
    expect(r[1].jeLernende[0]).toEqual([0, 0.5])
  })
  it('Schwierigkeiten erst nach 14 Tagen, schwierigste Wörter ab drei Versuchen', () => {
    expect(r[0].schwach).toBe(2)
    expect(r[1].schwach).toBeNull()
    // über alle Lernenden: Mia 4 Versuche ohne Fehler, Ben 5 mit 4 Fehlern
    expect(r[0].probleme).toEqual([{ term: 't1', translation: 'ü1', quote: 4 / 9 }])
  })
  it('passen die Zahlen nicht genau, nimmt der letzte Abschnitt den Rest', () => {
    const x = abschnittStatistik([{ titel: 'A', anzahl: 3, zeit: 0 }, { titel: 'B', anzahl: 3, zeit: 0 }], woerter, [], [], JETZT)
    expect(x.map((a) => a.woerter)).toEqual([3, 7])
    expect(x[0].name).toBe('A')
  })
  it('Gruppen: neueste Unit zuerst', () => {
    expect(nachUnits(r).map((g) => g.unit)).toEqual(['Unit 2', 'Unit 1'])
  })
  it('schnell genug für 30 Lernende × 500 Wörter', () => {
    const viele: Vokabel[] = Array.from({ length: 500 }, (_, i) => ({ id: `v${i}`, term: `t${i}`, translation: `ü${i}` }))
    const t = Array.from({ length: 25 }, (_, i) => ({ titel: `S${i}`, anzahl: 20, zeit: JETZT - (30 - i) * TAG }))
    const st = Array.from({ length: 30 }, () => Object.fromEntries(viele.filter((_, i) => i % 3).map((v) => [v.id, i2(v.id)])))
    function i2(id: string): WortStand {
      return Number(id.slice(1)) % 2 ? SICHER : AUFBAU
    }
    const start = performance.now()
    const s = abschnittStatistik(t, viele, st, [], JETZT)
    expect(s).toHaveLength(25)
    expect(performance.now() - start).toBeLessThan(200)
  })
})
