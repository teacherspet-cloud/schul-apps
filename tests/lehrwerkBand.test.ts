import { describe, expect, it } from 'vitest'
import { bandErkennen, bandFuerKlasse, bandRang, bekanntNachBand, istG9, reiheAus } from '../src/shared/lehrwerkBand'
import { abschnitteEinordnen, mitBaenden, nachBaenden } from '../src/shared/kursAbschnitte'
import { LEHRWERK_GRAMMATIK } from '../src/renderer/src/shared/lehrwerkGrammatik'

/*
 * Lehrwerk-Band einer Klasse (09.10.2026, abgestimmt): Band nach Jahrgang, Schulform und Land, ohne Unit; Wiederholung aus
 * älteren Bänden verschiebt nichts; bekannt = frühere Bände + Freigegebenes. Dazu die Sortierung der Abschnitte nach Band.
 */
const HEUTE = new Date('2026-10-09T10:00:00Z')
const NI_GYM = { land: 'NI', schulform: 'gymnasium' }

describe('Band nach Jahrgang, Schulform und Land', () => {
  it('Gymnasium Niedersachsen (G9): Klasse 5 → Band 1 … Klasse 10 → Band 6, dann Transition und Oberstufe', () => {
    expect([5, 6, 7, 8, 9, 10, 11, 12, 13].map((j) => bandFuerKlasse('Green Line', j, NI_GYM, HEUTE))).toEqual([
      'Green Line 1',
      'Green Line 2',
      'Green Line 3',
      'Green Line 4',
      'Green Line 5',
      'Green Line 6',
      'Green Line Transition',
      'Green Line Oberstufe',
      'Green Line Oberstufe'
    ])
  })
  it('G8-Länder eine Stufe früher: Klasse 10 → Transition', () => {
    expect(bandFuerKlasse('Green Line', 9, { land: 'BE', schulform: 'gymnasium' }, HEUTE)).toBe('Green Line 5')
    expect(bandFuerKlasse('Green Line', 10, { land: 'SN', schulform: 'gymnasium' }, HEUTE)).toBe('Green Line Transition')
    expect(bandFuerKlasse('Green Line', 11, { land: 'SN', schulform: 'gymnasium' }, HEUTE)).toBe('Green Line Oberstufe')
  })
  it('G9 im Aufbau (Baden-Württemberg, Saarland): nur die neuen Jahrgänge', () => {
    // Schuljahr 2026/27: Klasse 7 war 2024/25 in Klasse 5 → G9; Klasse 8 (2023/24) → noch G8
    expect(istG9('BW', 7, HEUTE)).toBe(true)
    expect(istG9('BW', 8, HEUTE)).toBe(false)
    expect(istG9('SL', 8, HEUTE)).toBe(true)
    expect(istG9('SL', 10, HEUTE)).toBe(false)
    expect(bandFuerKlasse('Green Line', 10, { land: 'BW', schulform: 'gymnasium' }, HEUTE)).toBe('Green Line Transition')
    expect(istG9('NI', 10, HEUTE)).toBe(true)
    expect(istG9(undefined, 10, HEUTE)).toBe(true)
  })
  it('Andere Schulformen: Klasse 5–10 → Band 1–6', () => {
    expect(bandFuerKlasse('Green Line', 10, { land: 'SN', schulform: 'oberschule' }, HEUTE)).toBe('Green Line 6')
    expect(bandFuerKlasse('Green Line', 7, { land: 'NI', schulform: 'realschule' }, HEUTE)).toBe('Green Line 3')
    expect(bandFuerKlasse('Green Line', 4, NI_GYM, HEUTE)).toBeNull()
  })
  it('Reihe und Rang', () => {
    expect(reiheAus('Green Line 6')).toBe('Green Line')
    expect(reiheAus('Green Line Transition')).toBe('Green Line')
    expect(bandRang('Green Line 6')).toBe(6)
    expect(bandRang('Green Line Transition')).toBeGreaterThan(6)
    expect(bandRang('Green Line Oberstufe')).toBeGreaterThan(bandRang('Green Line Transition'))
  })
})

describe('Band erkennen', () => {
  it('Klasse 10 am Gymnasium NI → Green Line 6 – auch wenn Vokabeln aus Band 5 zur Wiederholung dazukommen', () => {
    expect(bandErkennen({ jahrgang: 10, ort: NI_GYM, baende: ['Green Line 6', 'Green Line 5'] }, HEUTE)).toEqual({ buch: 'Green Line 6', grund: 'jahrgang' })
    expect(bandErkennen({ jahrgang: 10, ort: NI_GYM, baende: ['Green Line 5'] }, HEUTE)).toEqual({ buch: 'Green Line 6', grund: 'jahrgang' })
  })
  it('Reihe aus den üblichen Lehrwerken der Lehrkraft, wenn die Klasse noch keine Vokabeln hat', () => {
    expect(bandErkennen({ jahrgang: 7, ort: NI_GYM, baende: [], ueblich: ['Green Line 1'] }, HEUTE)?.buch).toBe('Green Line 3')
    expect(bandErkennen({ jahrgang: 7, ort: NI_GYM, baende: [] }, HEUTE)).toBeNull()
  })
  it('Ohne Jahrgang (QR-Gruppe): der höchste Band aus den Vokabeln', () => {
    expect(bandErkennen({ jahrgang: null, baende: ['Green Line 2', 'Green Line 3', 'Green Line 1'] }, HEUTE)).toEqual({ buch: 'Green Line 3', grund: 'vokabeln' })
    expect(bandErkennen({ jahrgang: null, baende: [] }, HEUTE)).toBeNull()
  })
})

describe('Bekannt = frühere Bände + Freigegebenes', () => {
  const alle = (b: string, k: string): string[] => Object.values(LEHRWERK_GRAMMATIK[b][k]).flatMap((l) => l.flatMap((p) => p.t))
  it('Band 2 ohne Freigaben: Band 1 ganz, aus Band 2 nichts', () => {
    const bekannt = new Set(bekanntNachBand('Green Line 2'))
    for (const t of alle('Green Line 1', 'Unit 1')) expect(bekannt.has(t)).toBe(true)
    const nurBand2 = alle('Green Line 2', 'Unit 2').filter((t) => !Object.keys(LEHRWERK_GRAMMATIK['Green Line 1']).some((k) => alle('Green Line 1', k).includes(t)))
    expect(nurBand2.length).toBeGreaterThan(0)
    for (const t of nurBand2) expect(bekannt.has(t)).toBe(false)
  })
  it('Freigegebene Unit des aktuellen Bands kommt dazu – nur bis zum freigegebenen Abschnitt', () => {
    const u1 = LEHRWERK_GRAMMATIK['Green Line 1']['Unit 1']
    const ohne = new Set(bekanntNachBand('Green Line 1'))
    expect(ohne.size).toBe(0)
    const bisStation1 = new Set(bekanntNachBand('Green Line 1', [{ buch: 'Green Line 1', unit: 'Unit 1', abschnitte: ['Station 1'] }]))
    for (const t of u1['Station 1'].flatMap((p) => p.t)) expect(bisStation1.has(t)).toBe(true)
    expect(bisStation1.has('en.verb.modals_basic/can')).toBe(false)
    const ganz = new Set(bekanntNachBand('Green Line 1', [{ buch: 'green-line-1', unit: 'Unit 1', abschnitte: [] }]))
    expect(ganz.has('en.verb.modals_basic/can')).toBe(true)
  })
  it('Transition: alle Bände der Liste gelten als früher', () => {
    const t = new Set(bekanntNachBand('Green Line Transition'))
    for (const t6 of alle('Green Line 6', 'Unit 1')) expect(t.has(t6)).toBe(true)
  })
  it('Fremde Reihe ohne Grammatikliste: nur Freigegebenes (hier nichts)', () => {
    expect(bekanntNachBand('Découvertes 2')).toEqual([])
  })
})

describe('Abschnitte nach Band sortieren', () => {
  it('Band je Abschnitt: aus dem Titel, aus der Kennung, sonst vom Abschnitt davor', () => {
    const teile = [
      { titel: 'Green Line 5 - Unit 4 - Station 1' },
      { titel: 'Station 2' },
      { titel: 'Unit 1 · Check-in', lehrwerk: 'green-line-6' },
      { titel: 'Unit 1 · Station 1', lehrwerk: 'green-line-6' },
      { titel: 'Weather' }
    ]
    const e = mitBaenden(teile, abschnitteEinordnen(teile, { lehrwerk: 'green-line-6', unit: 'Unit 1', abschnitte: ['Check-in', 'Station 1'] }), null)
    expect(e.map((x) => x.buch)).toEqual(['Green Line 5', 'Green Line 5', 'Green Line 6', 'Green Line 6', 'Green Line 6'])
  })
  it('Ganze Unit in einem Teil („Green Line 1 - Unit 3"): Band und Unit aus dem Titel', () => {
    const teile = [{ titel: 'Green Line 1 - Unit 3' }]
    const e = mitBaenden(teile, abschnitteEinordnen(teile, { lehrwerk: 'green-line-1', unit: 'Unit 3', abschnitte: ['Station 1'] }), {
      lehrwerk: 'green-line-1'
    })
    expect([e[0].buch, e[0].unit]).toEqual(['Green Line 1', 'Unit 3'])
  })
  it('Eigene Liste ohne Unit erbt keinen Band', () => {
    const teile = [{ titel: 'Weather' }, { titel: 'Station 1', lehrwerk: 'green-line-1' }]
    const e = mitBaenden(teile, abschnitteEinordnen(teile, { lehrwerk: 'green-line-1', unit: 'Unit 1', abschnitte: ['Station 1'] }), {
      lehrwerk: 'green-line-1'
    })
    expect(e.map((x) => x.buch ?? '')).toEqual(['', 'Green Line 1'])
  })
  it('Neuester Band oben, ohne Band unten; im Band die neueste Unit zuerst', () => {
    const z = [
      { buch: 'Green Line 5', unit: 'Unit 4', zeit: 300 },
      { buch: 'Green Line 6', unit: 'Unit 1', zeit: 100 },
      { buch: 'Green Line 6', unit: 'Unit 2', zeit: 200 },
      { buch: '', unit: '', zeit: 400 },
      { buch: 'Green Line 4', unit: 'Unit 6', zeit: 50 }
    ]
    const g = nachBaenden(z)
    expect(g.map((x) => x.buch)).toEqual(['Green Line 6', 'Green Line 5', 'Green Line 4', ''])
    expect(g[0].units.map((u) => u.unit)).toEqual(['Unit 2', 'Unit 1'])
  })
  it('Gleichzeitig freigegebene Units: die spätere oben', () => {
    const g = nachBaenden([
      { buch: 'Green Line 6', unit: 'Unit 1', zeit: 5 },
      { buch: 'Green Line 6', unit: 'Unit 2', zeit: 5 }
    ])
    expect(g[0].units.map((u) => u.unit)).toEqual(['Unit 2', 'Unit 1'])
  })
  it('Gleichnamige Units verschiedener Bände bleiben getrennt', () => {
    const g = nachBaenden([
      { buch: 'Green Line 5', unit: 'Unit 1', zeit: 1 },
      { buch: 'Green Line 6', unit: 'Unit 1', zeit: 2 }
    ])
    expect(g).toHaveLength(2)
    expect(g.every((x) => x.units.length === 1)).toBe(true)
  })
})
