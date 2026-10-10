import { describe, expect, it } from 'vitest'
import {
  abschnitteDesTeils,
  ALT_JE_RUNDE,
  altWoerterWaehlen,
  bandMedaille,
  baendeNachJahren,
  freieAbschnitte,
  naechsteMedaille,
  nachUnitsImBuch,
  prozent,
  rundenWoerter,
  testPause,
  vergessensRisiko,
  zahlenAus,
  type AltKandidat
} from '../src/shared/sprachstand'
import { linkRunde, neuerStand, rundenGrenze, tagesRunde, TAG, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'
import type { Buch } from '../src/shared/vokabelLaufbahn'

const JETZT = Date.UTC(2026, 9, 10, 10)
const st = (x: Partial<WortStand>): WortStand => ({ ...neuerStand(), ...x })
const v = (id: string, term = id): Vokabel => ({ id, term, translation: `${term}-de` })

describe('Zahlen: eine Bedeutung von Fortschritt', () => {
  it('kennengelernt = im Aufbau + sicher', () => {
    const z = zahlenAus(['neu', 'neu', 'aufbau', 'sicher', 'sicher'])
    expect(z).toEqual({ gesamt: 5, neu: 2, aufbau: 1, sicher: 2, kennengelernt: 3 })
    expect(prozent(z.kennengelernt, z.gesamt)).toBe(60)
    expect(prozent(0, 0)).toBe(0)
  })
  it('Units fassen ihre Abschnitte zusammen (Buchreihenfolge bleibt)', () => {
    const u = nachUnitsImBuch([
      { key: 'a', unit: 'Unit 1', name: 'Check-in', zahlen: zahlenAus(['neu', 'sicher']) },
      { key: 'b', unit: 'Unit 1', name: 'Station 1', zahlen: zahlenAus(['aufbau']) },
      { key: 'c', unit: 'Unit 2', name: 'Check-in', zahlen: zahlenAus(['neu']) }
    ])
    expect(u.map((x) => [x.unit, x.abschnitte.map((a) => a.name), x.zahlen.gesamt])).toEqual([
      ['Unit 1', ['Check-in', 'Station 1'], 3],
      ['Unit 2', ['Check-in'], 1]
    ])
  })
})

describe('Medaillen je Band', () => {
  it('Bronze ab 50 %, Silber ab 70 %, Gold ab 85 % sicher', () => {
    expect(bandMedaille({ gesamt: 100, sicher: 49 })).toBeNull()
    expect(bandMedaille({ gesamt: 100, sicher: 50 })).toBe('bronze')
    expect(bandMedaille({ gesamt: 100, sicher: 69 })).toBe('bronze')
    expect(bandMedaille({ gesamt: 100, sicher: 70 })).toBe('silber')
    expect(bandMedaille({ gesamt: 100, sicher: 84 })).toBe('silber')
    expect(bandMedaille({ gesamt: 100, sicher: 85 })).toBe('gold')
    expect(bandMedaille({ gesamt: 0, sicher: 0 })).toBeNull()
  })
  it('kennengelernt zählt nicht für die Medaille (nur sicher)', () => {
    const z = zahlenAus([...Array(9).fill('aufbau'), 'sicher'])
    expect(z.kennengelernt).toBe(10)
    expect(bandMedaille(z)).toBeNull()
  })
  it('nächste Stufe und wie viele Wörter fehlen', () => {
    expect(naechsteMedaille({ gesamt: 200, sicher: 90 })).toEqual({ medaille: 'bronze', fehlen: 10 })
    expect(naechsteMedaille({ gesamt: 200, sicher: 100 })).toEqual({ medaille: 'silber', fehlen: 40 })
    expect(naechsteMedaille({ gesamt: 200, sicher: 170 })).toBeNull()
  })
})

describe('Bände nach Schuljahren', () => {
  const GL = (n: number, jahre: number[] = []) => ({ id: `gl${n}`, rang: n + 4, grade: n + 4, jahre })
  it('aktuell = höchster Band mit Freigabe in diesem Schuljahr; frühere mit Klasse und Schuljahr', () => {
    const r = baendeNachJahren([GL(1), GL(2, [2025]), GL(3, [2026]), GL(4), GL(5)], 2026, 7)
    expect(r.aktuell).toEqual({ id: 'gl3', schuljahr: 2026, klasse: 7 })
    expect(r.frueher).toEqual([
      { id: 'gl1', schuljahr: 2024, klasse: 5 },
      { id: 'gl2', schuljahr: 2025, klasse: 6 }
    ])
  })
  it('spätere Bände ohne Freigabe erscheinen nicht', () => {
    const r = baendeNachJahren([GL(3, [2026]), GL(4), GL(5)], 2026, 7)
    expect(r.frueher).toEqual([])
  })
  it('ohne Freigabe in diesem Schuljahr (Jahresbeginn): kein aktueller Band, letztes Jahr ist „früher"', () => {
    const r = baendeNachJahren([GL(1), GL(2, [2025])], 2026, 7)
    expect(r.aktuell).toBeNull()
    expect(r.frueher.map((b) => b.id)).toEqual(['gl1', 'gl2'])
  })
  it('Wiederholer: derselbe Band letztes und dieses Jahr – er ist aktuell, nicht früher', () => {
    const r = baendeNachJahren([GL(2, [2025, 2026]), GL(1)], 2026, 6)
    expect(r.aktuell?.id).toBe('gl2')
    expect(r.frueher.map((b) => b.id)).toEqual(['gl1'])
  })
  it('Mustermann: Klasse 10 mit Green Line 6 → „Green Line 6 · Klasse 10", Bände 1–5 früher', () => {
    const r = baendeNachJahren([1, 2, 3, 4, 5].map((n) => GL(n)).concat(GL(6, [2026])), 2026, 10)
    expect(r.aktuell).toEqual({ id: 'gl6', schuljahr: 2026, klasse: 10 })
    expect(r.frueher.map((b) => `${b.id}:${b.klasse}:${b.schuljahr}`)).toEqual(['gl1:5:2021', 'gl2:6:2022', 'gl3:7:2023', 'gl4:8:2024', 'gl5:9:2025'])
  })
})

describe('Abschnitte eines Kurs-Teils', () => {
  it('eine Unit mit mehreren Abschnitten', () => {
    expect(abschnitteDesTeils({ unit: 'Unit 1', name: 'Check-in, Station 1' })).toEqual([
      { unit: 'Unit 1', abschnitt: 'Check-in' },
      { unit: 'Unit 1', abschnitt: 'Station 1' }
    ])
  })
  it('mehrere Units in einem Teil', () => {
    expect(abschnitteDesTeils({ unit: 'Unit 1', name: 'Unit 1: Story · Unit 2: Check-in, Station 1' })).toEqual([
      { unit: 'Unit 1', abschnitt: 'Story' },
      { unit: 'Unit 2', abschnitt: 'Check-in' },
      { unit: 'Unit 2', abschnitt: 'Station 1' }
    ])
  })
  it('ohne Unit (eigene Liste): nichts im Buch', () => {
    expect(abschnitteDesTeils({ unit: '', name: 'Weather' })).toEqual([])
  })
  const buch: Buch = {
    id: 'gl6',
    name: 'Green Line 6',
    language: 'en',
    units: [
      { name: 'Unit 1', sections: ['Check-in', 'Station 1', 'Station 2'].map((n) => ({ name: n, entries: [{ term: `${n}-w`, translation: 'x' }] })) },
      { name: 'Unit 2', sections: ['Check-in'].map((n) => ({ name: n, entries: [{ term: `u2-${n}`, translation: 'x' }] })) }
    ]
  }
  it('freigegebene Abschnitte aufsteigend wie im Buch – egal in welcher Reihenfolge freigegeben', () => {
    const frei = new Set(['unit 2\u0001check-in', 'unit 1\u0001station 2', 'unit 1\u0001check-in'])
    expect(freieAbschnitte(buch, frei).map((a) => `${a.unit} · ${a.section}`)).toEqual(['Unit 1 · Check-in', 'Unit 1 · Station 2', 'Unit 2 · Check-in'])
  })
  it('Platzhalter-Band ohne Wörter: kein Weg (dann nur die Kursliste)', () => {
    expect(freieAbschnitte({ id: 'apuntate-1', name: '¡Apúntate! 1', language: 'es', units: [] }, new Set(['unit 1\u0001a']))).toEqual([])
  })
})

describe('Tagesrunde einer Sprache', () => {
  const alt = (n: number, x: Partial<WortStand>): AltKandidat => ({ v: v(`alt${n}`), st: st(x), herkunft: `aus Green Line 1 · Unit ${n}` })
  const faelligAlt = (n: number, tageUeber: number, falsch = 0): AltKandidat =>
    alt(n, { fach: 2, versuche: 4, falsch, faellig: JETZT - tageUeber * TAG, zuletzt: JETZT - (tageUeber + 3) * TAG })
  it('Vergessensrisiko: neu, nicht fällig und Langzeit-sicher sind keine Kandidaten', () => {
    expect(vergessensRisiko(undefined, JETZT)).toBe(0)
    expect(vergessensRisiko(st({ fach: 3, versuche: 3, faellig: JETZT + TAG }), JETZT)).toBe(0)
    expect(vergessensRisiko(st({ fach: 2, versuche: 3, faellig: JETZT - TAG }), JETZT)).toBeGreaterThan(0)
  })
  it('höchstens 2–3 frühere Wörter je Runde, die riskantesten zuerst, mit Herkunft', () => {
    const kandidaten = [faelligAlt(1, 1), faelligAlt(2, 30, 3), faelligAlt(3, 10), faelligAlt(4, 5, 1), faelligAlt(5, 2)]
    const r = rundenWoerter([v('a'), v('b')], kandidaten, { jetzt: JETZT })
    expect(r.alt.length).toBe(ALT_JE_RUNDE)
    expect(r.alt[0]).toBe('alt2')
    expect(r.woerter.length).toBe(2 + ALT_JE_RUNDE)
    expect(r.woerter.find((x) => x.id === 'alt2')?.herkunft).toBe('aus Green Line 1 · Unit 2')
    expect(r.woerter.filter((x) => !x.herkunft).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('gleicher Begriff wie im aktuellen Stoff kommt nicht doppelt', () => {
    const r = rundenWoerter([v('dog')], [{ ...faelligAlt(1, 5), v: v('x1', 'dog') }], { jetzt: JETZT })
    expect(r.alt).toEqual([])
  })
  it('drei Tage vor einem Test: kein Anteil früherer Bände, nur der Teststoff', () => {
    expect(testPause([JETZT + 2 * TAG], JETZT)).toBe(true)
    expect(testPause([JETZT + 3 * TAG], JETZT)).toBe(true)
    expect(testPause([JETZT + 4 * TAG], JETZT)).toBe(false)
    expect(testPause([JETZT - 3 * TAG, null], JETZT)).toBe(false)
    const r = rundenWoerter([v('a'), v('b'), v('c')], [faelligAlt(1, 9)], { test: new Set(['a', 'c']), jetzt: JETZT })
    expect(r.pause).toBe(true)
    expect(r.woerter.map((x) => x.id)).toEqual(['a', 'c'])
    expect(r.alt).toEqual([])
  })
  it('eine Zahl überall: die Runde hat höchstens das Tagesziel (mindestens 10), weitere Fällige zählen als „extra"', () => {
    const liste = Array.from({ length: 60 }, (_, i) => v(`w${i}`))
    const staende: Record<string, WortStand> = {}
    // 40 fällige Wiederholungen, 20 neue
    for (let i = 0; i < 40; i++) staende[`w${i}`] = st({ fach: 2, versuche: 2, faellig: JETZT - TAG, zuletzt: JETZT - 3 * TAG })
    const r = tagesRunde(liste, staende, JETZT, 10)
    expect(r.woerter.length).toBe(10)
    expect(r.extra).toBe(30)
    expect(rundenGrenze(20)).toBe(20)
    expect(rundenGrenze(3)).toBe(10)
    // Die Startseite (linkRunde „runde") startet genau den ersten Schritt dieser Runde
    expect(linkRunde('runde', liste, staende, JETZT, 10)?.woerter.map((x) => x.id)).toEqual(r.woerter.map((x) => x.id))
  })
  it('„Noch nicht gelernte Wörter lernen" (Link-Übung „neu"): die nächsten zehn neuen, ohne Pflicht', () => {
    const liste = Array.from({ length: 30 }, (_, i) => v(`n${i}`))
    const r = linkRunde('neu', liste, {}, JETZT, 0)
    expect(r?.woerter.length).toBe(10)
    expect(r?.freiwillig).toBe(false)
  })
  it('Wörter früherer Bände erscheinen nicht als Pflicht (altWoerterWaehlen braucht einen Stand)', () => {
    expect(altWoerterWaehlen([{ v: v('neu1'), st: undefined, herkunft: 'x' }], JETZT)).toEqual([])
  })
})
