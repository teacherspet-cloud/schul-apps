import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { json_, standSpeichern, standVon, vokabelnDerGruppe, vokabelnZuweisen, vokabelRoute, zeile } from '../src/server/vokabeln'
import { klassenRoute } from '../src/server/klassen'
import { startseiteDaten } from '../src/server/startseite'
import { fachKennzahlen } from '../src/renderer/src/modules/meineklassen/FachKopf'
import { abschnittStatistik } from '../src/shared/kursAbschnitte'
import { problemWoerter, problemWoerterText, wackeltAktuell } from '../src/shared/problemWoerter'
import { neuerStand, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'
import type { Anfrage } from '../src/server/http'

/*
 * Problemwörter (10.10.2026, Befund der Lehrkraft: „Auf einen Blick" zeigte 5, die Kursseite 12, Handlungsbedarf und
 * Startseite rechneten „wackelig" noch anders): EINE Definition (shared/problemWoerter.ts) – dieselben Daten ergeben an
 * jeder Stelle dieselbe Zahl, auch nach „aus der Liste nehmen".
 */
const TAG = 86_400_000
const jetzt = Date.now()
let lk: NutzerInfo
const schueler: NutzerInfo[] = []
let gruppeId = ''
let kurs = ''
let woerter: Vokabel[] = []

async function rufe(route: (k: Anfrage) => Promise<boolean>, methode: 'GET' | 'POST', pfad: string, koerper: Record<string, unknown> = {}) {
  let code = 0
  let text = ''
  const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: lk, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await route(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

const stand = (o: Partial<WortStand>): WortStand => ({ ...neuerStand(), ...o })
const heute = new Date(jetzt).toISOString().slice(0, 10)

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'p.problem', name: 'Paula Problem', rolle: 'lehrkraft', quelle: 'test' })
  for (const b of ['ada.p', 'ben.p', 'cem.p']) schueler.push(nutzerAnlegen({ benutzer: b, name: b, rolle: 'schueler', quelle: 'lokal' }))
  lerngruppenVon(lk.id)
  gruppeId = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gruppeId, lk.id, '7c', 'Englisch', '', JSON.stringify(schueler.map((s) => s.benutzer)), new Date().toISOString())
  kurs = vokabelnZuweisen({
    lehrkraftId: lk.id,
    lerngruppeId: gruppeId,
    schueler: [],
    titel: 'Unit 1',
    sprache: 'en',
    fach: 'Englisch',
    woerter: Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
  })
  woerter = json_(zeile(kurs)!.woerter, [] as Vokabel[])
  const spaeter = jetzt + 5 * TAG
  // w0–w23: bei Ada und Ben aktuell wackelig (Fach 1, Fehler, gestern) → 24 Problemwörter
  // w24: Fehler, aber vor 30 Tagen zuletzt geübt; w25: Fehler, inzwischen gefestigt (Fach 4); w26: erst 2 Abfragen
  for (const s of schueler.slice(0, 2)) {
    const w: Record<string, WortStand> = {}
    for (const v of woerter.slice(0, 24)) w[v.id] = stand({ fach: 1, faellig: spaeter, versuche: 3, falsch: 1, zuletzt: jetzt - TAG })
    w.w24 = stand({ fach: 1, faellig: spaeter, versuche: 4, falsch: 2, zuletzt: jetzt - 30 * TAG })
    w.w25 = stand({ fach: 4, faellig: spaeter, versuche: 6, falsch: 2, zuletzt: jetzt - TAG })
    standSpeichern(kurs, s.id, { woerter: w, tage: [heute] })
  }
  standSpeichern(kurs, schueler[2].id, {
    woerter: { w26: stand({ fach: 1, faellig: spaeter, versuche: 2, falsch: 1, zuletzt: jetzt - TAG }) },
    tage: [heute]
  })
})

/** Alle Zahlen „Problemwörter" der Lehrkraft für diesen Kurs bzw. diese Klasse */
async function alleZahlen(): Promise<Record<string, number>> {
  const kursSeite = (await rufe(vokabelRoute('http://x'), 'GET', `/server/vokabeln/${kurs}`)).d as { problem: unknown[] }
  const klasse = (await rufe(klassenRoute(), 'GET', `/server/klassen/${gruppeId}`)).d
  const kv = (klasse.vokabeln as { id: string; problemZahl: number }[]).find((v) => v.id === kurs)!
  const start = startseiteDaten(lk.id, jetzt).kurse.find((k) => k.id === kurs)!
  const gruppe = vokabelnDerGruppe(lk.id, gruppeId, jetzt)
  return {
    // Kursseite: „Problemwörter der Lerngruppe (n)", „Nur Problemwörter (n)", ⚠
    kursseite: kursSeite.problem.length,
    // „Meine Klassen" › Auf einen Blick
    aufEinenBlick: fachKennzahlen(klasse as never, jetzt).vokabeln!.probleme,
    kursKarte: kv.problemZahl,
    // Handlungsbedarf/Vorschlag (früher „Wackelige Wörter")
    klasse: klasse.problemZahl as number,
    gruppe: gruppe.problemZahl,
    // Startseite: Abzeichen „n Problemwörter"
    startseite: Number(/^(\d+) Problemw/.exec(start.abzeichen.text)?.[1] ?? -1)
  }
}

describe('Problemwörter: eine Definition, eine Zahl', () => {
  it('Definition: mindestens 3 Abfragen mit Fehlern und bei einem Kind aktuell wackelig', () => {
    const staende = schueler.map((s) => standVon(kurs, s.id).woerter)
    const p = problemWoerter(woerter, staende, {}, jetzt)
    expect(p.length).toBe(24)
    expect(p.map((x) => x.id)).not.toEqual(expect.arrayContaining(['w24']))
    expect(p.some((x) => ['w24', 'w25', 'w26'].includes(x.id))).toBe(false)
    expect(p[0]).toMatchObject({ versuche: 6, falsch: 2, betroffen: 2 })
    expect(wackeltAktuell(stand({ fach: 2, falsch: 1, zuletzt: jetzt - 13 * TAG }), jetzt)).toBe(true)
    expect(wackeltAktuell(stand({ fach: 3, falsch: 1, zuletzt: jetzt }), jetzt)).toBe(false)
    // Abschnitts-Übersicht: dieselben Wörter (die wichtigsten 5)
    const ab = abschnittStatistik([{ titel: 'Unit 1', anzahl: 30, zeit: jetzt }], woerter, staende, [], jetzt)
    expect(ab[0].probleme.map((x) => x.term)).toEqual(p.slice(0, 5).map((x) => x.term))
  })

  it('Kursseite, Auf einen Blick, Kurs-Karte, Handlungsbedarf und Startseite zeigen dieselbe Zahl', async () => {
    const z = await alleZahlen()
    expect(z).toEqual({ kursseite: 24, aufEinenBlick: 24, kursKarte: 24, klasse: 24, gruppe: 24, startseite: 24 })
    const klasse = (await rufe(klassenRoute(), 'GET', `/server/klassen/${gruppeId}`)).d
    // Vorschlag zeigt höchstens 20 – dann ausdrücklich „20 von 24"
    expect((klasse.wackelig as unknown[]).length).toBe(20)
    const v = (klasse.vorschlaege as { art: string; titel: string; text: string }[]).find((x) => x.art === 'vokabeln')!
    expect(v.titel).toMatch(/^Problemwörter – /)
    expect(v.text).toMatch(/^20 von 24 Problemwörtern/)
  })

  it('„Aus der Liste nehmen" wirkt überall gleich', async () => {
    expect((await rufe(vokabelRoute('http://x'), 'POST', `/server/vokabeln/${kurs}/problem-aus`, { id: 'w0' })).code).toBe(200)
    expect(await alleZahlen()).toEqual({ kursseite: 23, aufEinenBlick: 23, kursKarte: 23, klasse: 23, gruppe: 23, startseite: 23 })
  })

  it('Beschriftung', () => {
    expect(problemWoerterText(1)).toBe('1 Problemwort')
    expect(problemWoerterText(12)).toBe('12 Problemwörter')
    expect(problemWoerterText(24, 20)).toBe('20 von 24 Problemwörtern')
    expect(problemWoerterText(5, 5)).toBe('5 Problemwörter')
  })
})

/*
 * Empfindlichkeit (12.10.2026, abgestimmt mit der Lehrkraft): Standard = ≥ 2 Kinder (bzw. 20 % der Übenden) aktuell
 * unsicher UND Kursquote ≥ 30 % bei ≥ 6 Abfragen; Stufe 5 ≈ frühere Regel (ein Kind genügt).
 */
describe('Problemwörter je Empfindlichkeit', () => {
  const w = [{ id: 'w1', term: 'cat', translation: 'Katze' }]
  const wackelnd = stand({ fach: 1, versuche: 3, falsch: 2, zuletzt: jetzt - TAG })
  const sicher = stand({ fach: 4, versuche: 3, falsch: 0, zuletzt: jetzt - TAG })
  it('ein einzelnes wackelndes Kind reicht nur auf der lockersten Stufe', async () => {
    const { problemWoerterJeStufe } = await import('../src/shared/problemWoerter')
    const staende = [{ w1: wackelnd }, ...Array.from({ length: 9 }, () => ({ w1: sicher }))]
    const je = problemWoerterJeStufe(w, staende, {}, jetzt)
    expect(je[5]).toHaveLength(1)
    expect(je[3]).toHaveLength(0)
    expect(problemWoerter(w, staende, {}, jetzt)).toHaveLength(0)
  })
  it('zwei wackelnde Kinder mit hoher Quote zählen im Standard', async () => {
    const { problemWoerterJeStufe } = await import('../src/shared/problemWoerter')
    const staende = [{ w1: wackelnd }, { w1: wackelnd }, { w1: sicher }]
    const je = problemWoerterJeStufe(w, staende, {}, jetzt)
    expect(je[3]).toHaveLength(1)
    // strengste Stufe verlangt 4 Kinder bzw. 35 % (hier 2 von 3 übenden = genug Anteil) und Quote ≥ 45 %
    expect(je[1].length).toBeLessThanOrEqual(je[3].length)
  })
  it('die Stufen sind geschachtelt', async () => {
    const { problemWoerterJeStufe, PROBLEM_STUFEN } = await import('../src/shared/problemWoerter')
    const staende = [{ w1: wackelnd }, { w1: wackelnd }, { w1: wackelnd }, { w1: sicher }]
    const je = problemWoerterJeStufe(w, staende, {}, jetzt)
    for (let i = 1; i < PROBLEM_STUFEN.length; i++) expect(je[PROBLEM_STUFEN[i]].length).toBeGreaterThanOrEqual(je[PROBLEM_STUFEN[i - 1]].length)
  })
})
