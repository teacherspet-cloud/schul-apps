/**
 * Vokabeln je Sprache am Server (10.10.2026, Option A; server/sprachstand.ts, server/wortliste.ts):
 *  - Befund „Mustermann": Kurs mit Green Line 5 (letztes Jahr) und Green Line 6 (dieses Jahr), die Herkunft des Kurses
 *    nennt noch Green Line 5 → Green Line 6 muss als aktueller Band „Green Line 6 · Klasse 10" erscheinen, nicht als
 *    „More words", die Abschnitte aufsteigend wie im Buch.
 *  - Tagesrunde: Abschnitte früherer Schuljahre bringen keine Pflicht-Neuwörter; wackelige Wörter daraus kommen mit
 *    Herkunft dazu; drei Tage vor einem Test nur der Teststoff.
 *  - Platzhalter-Band (¡Apúntate! ohne Wörter): kein Weg, nur die Kursliste.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { db, vokabelListenFuer, vokabelnZuweisen } from '../src/server/vokabeln'
import { sprachstandRoute, sprachStaende } from '../src/server/sprachstand'
import { doppeltePruefen, wortlisteFuer } from '../src/server/wortliste'
import type { Anfrage } from '../src/server/http'
import { neuerStand, TAG, type Vokabel } from '../src/shared/vokabeltrainer'

// Mitgelieferte Lehrwerke aus resources/lehrwerke (wie in der Entwicklung); eigene Importe gibt es hier nicht
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => `${process.cwd()}/nie-benutzt` } }))

const lehrwerk = (id: string): { units: { name: string; sections: { name: string; entries: { term: string; translation: string }[] }[] }[] } =>
  JSON.parse(readFileSync(`resources/lehrwerke/${id}.json`, 'utf8'))
const abschnitt = (id: string, unit: string, section: string): { term: string; translation: string }[] =>
  lehrwerk(id).units.find((u) => u.name === unit)!.sections.find((s) => s.name === section)!.entries

async function rufe(route: (k: Anfrage) => Promise<boolean>, n: NutzerInfo, methode: 'GET' | 'POST', pfad: string, koerper: Record<string, unknown> = {}) {
  let code = 0
  let text = ''
  const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await route(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

const LETZTES_JAHR = Date.UTC(2025, 10, 3)
let max: NutzerInfo
let kurs = ''
let gl5: Vokabel[] = []

describe('Vokabeln je Sprache am Server', () => {
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    const lk = nutzerAnlegen({ benutzer: 'm.lehr', name: 'Mia Lehr', rolle: 'lehrkraft', quelle: 'test' })
    max = nutzerAnlegen({ benutzer: 'max.mustermann', name: 'Max Mustermann', rolle: 'schueler', quelle: 'lokal' })
    lerngruppenVon(lk.id)
    const g = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(g, lk.id, '10a', 'Englisch', '', JSON.stringify([max.benutzer]), new Date().toISOString())
    const ein = abschnitt('green-line-5', 'Unit 1', 'Introduction')
    kurs = vokabelnZuweisen({
      lehrkraftId: lk.id,
      lerngruppeId: g,
      schueler: [],
      titel: 'Green Line 5 - Unit 1 - Introduction',
      sprache: 'en',
      fach: 'Englisch',
      woerter: ein.map((e, i) => ({ id: `w${i}`, ...e })),
      quelle: { lehrwerk: 'green-line-5', unit: 'Unit 1', abschnitte: ['Introduction'] }
    })
    // Dieses Jahr: Green Line 6 dazu – zuerst Station 1, dann Introduction (Freigabe NICHT in Buchreihenfolge);
    // die Herkunft des Kurses nennt weiter Green Line 5 (so stand es beim Befund)
    const s1 = abschnitt('green-line-6', 'Unit 1', 'Station 1')
    const intro = abschnitt('green-line-6', 'Unit 1', 'Introduction')
    gl5 = ein.map((e, i) => ({ id: `w${i}`, ...e }))
    const woerter = [...gl5, ...s1.map((e, i) => ({ id: `s${i}`, ...e })), ...intro.map((e, i) => ({ id: `i${i}`, ...e }))]
    const teile = [
      { titel: 'Green Line 5 - Unit 1 - Introduction', anzahl: ein.length, zeit: LETZTES_JAHR, lehrwerk: 'green-line-5' },
      { titel: 'Station 1', anzahl: s1.length, zeit: Date.now() - 2 * TAG, lehrwerk: 'green-line-6', unit: 'Unit 1' },
      { titel: 'Introduction', anzahl: intro.length, zeit: Date.now() - TAG, lehrwerk: 'green-line-6', unit: 'Unit 1' }
    ]
    db().prepare('UPDATE vok_zuweisungen SET woerter = ?, teile = ?, erstellt = ? WHERE id = ?').run(JSON.stringify(woerter), JSON.stringify(teile), new Date(LETZTES_JAHR).toISOString(), kurs)
  })

  it('Meine Bücher: Green Line 6 ist der aktuelle Band (nicht „More words"), Abschnitte aufsteigend', async () => {
    const w = await wortlisteFuer(max, 'Englisch')
    const akt = w.buecher!.find((b) => b.aktuell)!
    expect(akt.name).toBe('Green Line 6')
    expect(akt.klasse).toBe(10)
    expect(akt.gruppen.map((g) => g.titel)).toEqual(['Unit 1 · Introduction', 'Unit 1 · Station 1'])
    expect(akt.gruppen[0].unit).toBe('Unit 1')
    // Keine Green-Line-Wörter unter „Weitere Wörter"
    expect(w.gruppen.flatMap((g) => g.woerter).length).toBe(0)
    // Frühere Jahre: Green Line 1–5 ganz, mit Klasse und Schuljahr
    const frueher = w.buecher!.filter((b) => !b.aktuell)
    expect(frueher.map((b) => b.name)).toEqual(['Green Line 1', 'Green Line 2', 'Green Line 3', 'Green Line 4', 'Green Line 5'])
    expect(frueher.find((b) => b.name === 'Green Line 5')).toMatchObject({ klasse: 9, schuljahr: 2025 })
    expect(frueher[0]).toMatchObject({ klasse: 5, schuljahr: 2021 })
  })

  it('Sprachstand: „Green Line 6 · Klasse 10", Units mit Abschnitten, Runde nur mit Stoff dieses Jahres', async () => {
    const [s] = await sprachStaende(max)
    expect(s.fach).toBe('Englisch')
    expect(s.aktuell).toMatchObject({ name: 'Green Line 6', klasse: 10, abschnitte: 2, abschnitteKennen: 0, aktuelleUnit: 'Unit 1' })
    expect(s.aktuell!.units.map((u) => u.abschnitte.map((a) => a.name))).toEqual([['Introduction', 'Station 1']])
    expect(s.aktuell!.weitereUnits).toBeGreaterThan(0)
    expect(s.frueher.map((b) => b.name)).toContain('Green Line 5')
    // Neue Wörter nur aus diesem Schuljahr – Tagesziel 10
    expect(s.heute).toMatchObject({ anzahl: 10, alt: 0, pause: false })
    // Kurs ist nicht „alt" (er hat Abschnitte dieses Jahres); „heute offen" zählt nur sie
    const k = vokabelListenFuer(max).find((x) => x.id === kurs)!
    expect(k.alt).toBe(false)
    expect(k.uebersicht.heuteOffen).toBe(10)
  })

  it('Kasten der Sprache: ein wackeliges Wort aus Green Line 5 kommt mit Herkunft dazu; Antwort landet im Kurs', async () => {
    const st = { woerter: { w0: { ...neuerStand(), fach: 2, versuche: 3, falsch: 2, faellig: Date.now() - 5 * TAG, zuletzt: Date.now() - 6 * TAG } }, tage: [] }
    db()
      .prepare('INSERT INTO vok_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
      .run(kurs, max.id, JSON.stringify(st), Date.now())
    const route = sprachstandRoute()
    const l = await rufe(route, max, 'GET', '/s/api/vokabeln/liste?id=sp:en')
    expect(l.code).toBe(200)
    const woerter = l.d.woerter as Vokabel[]
    const alt = woerter.filter((v) => v.herkunft)
    expect(alt.map((v) => v.term)).toEqual([gl5[0].term])
    expect(alt[0].herkunft).toBe('aus Green Line 5 · Unit 1')
    // Keine weiteren Green-Line-5-Wörter (ohne Stand) in der Runde
    expect(woerter.filter((v) => gl5.some((g) => g.term === v.term)).length).toBe(1)
    const r = await rufe(route, max, 'POST', '/s/api/vokabeln/antwort', { id: 'sp:en', wortId: alt[0].id, uebung: 'auswahl', antwort: gl5[0].translation })
    expect(r.code).toBe(200)
    const [s] = await sprachStaende(max)
    expect(s.heute.alt).toBe(0) // richtig beantwortet → heute nicht mehr fällig
  })

  it('drei Tage vor einem Test: nur der Teststoff, kein Anteil früherer Bände', async () => {
    db().prepare('UPDATE vok_stand SET daten = ? WHERE zuweisung_id = ? AND schueler_id = ?').run(
      JSON.stringify({ woerter: { w1: { ...neuerStand(), fach: 2, versuche: 3, falsch: 2, faellig: Date.now() - 5 * TAG, zuletzt: Date.now() - 6 * TAG } }, tage: [] }),
      kurs,
      max.id
    )
    db().prepare('UPDATE vok_zuweisungen SET test_termin = ? WHERE id = ?').run(Date.now() + 2 * TAG, kurs)
    const [s] = await sprachStaende(max)
    expect(s.heute.pause).toBe(true)
    expect(s.heute.alt).toBe(0)
    db().prepare('UPDATE vok_zuweisungen SET test_termin = NULL WHERE id = ?').run(kurs)
    const [s2] = await sprachStaende(max)
    expect(s2.heute.alt).toBe(1)
  })

  it('früherer Band als Kasten (freiwillig, ohne Pflicht-Neuwörter)', async () => {
    const l = await rufe(sprachstandRoute(), max, 'GET', '/s/api/vokabeln/liste?id=bd:green-line-5')
    expect(l.code).toBe(200)
    expect(l.d.tagesziel).toBe(0)
    expect((l.d.woerter as Vokabel[]).length).toBeGreaterThan(500)
    // Der aktuelle Band ist kein „früherer"
    expect((await rufe(sprachstandRoute(), max, 'GET', '/s/api/vokabeln/liste?id=bd:green-line-6')).code).toBe(404)
  })

  it('Platzhalter-Band ohne Wörter: kein Weg, nur die Kursliste', async () => {
    const lk = nutzerAnlegen({ benutzer: 's.lehr', name: 'Sol Lehr', rolle: 'lehrkraft', quelle: 'test' })
    const ana = nutzerAnlegen({ benutzer: 'ana.probe', name: 'Ana Probe', rolle: 'schueler', quelle: 'lokal' })
    lerngruppenVon(lk.id)
    const g = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(g, lk.id, '7b', 'Spanisch', '', JSON.stringify([ana.benutzer]), new Date().toISOString())
    vokabelnZuweisen({
      lehrkraftId: lk.id,
      lerngruppeId: g,
      schueler: [],
      titel: '¡Apúntate! 1 - Unidad 1 - A',
      sprache: 'es',
      fach: 'Spanisch',
      woerter: [{ id: 'w1', term: 'hola', translation: 'hallo' }],
      quelle: { lehrwerk: 'apuntate-2016-1', unit: 'Unidad 1', abschnitte: ['A'] }
    })
    const [s] = await sprachStaende(ana)
    expect(s.nurKurse).toBe(true)
    expect(s.aktuell).toBeNull()
    const w = await wortlisteFuer(ana, 'Spanisch')
    expect(w.buecher).toEqual([])
    expect(w.gruppen.flatMap((x) => x.woerter.map((y) => y.term))).toEqual(['hola'])
  })

  it('Doppelte zählen: nur Zahlen, eine Protokollzeile nur bei Doppelten (ohne Namen)', () => {
    const letzte = (): string => String((datenbank().prepare('SELECT text FROM protokoll ORDER BY nr DESC LIMIT 1').get() as { text: string } | undefined)?.text ?? '')
    const r = doppeltePruefen('Test')
    if (r.doppelte) {
      expect(letzte()).toMatch(/^Doppelte Vokabeln \(Test\): \d+ in \d+ Kurs/)
      expect(letzte()).not.toMatch(/Mustermann|Probe/)
    } else expect(letzte()).not.toMatch(/^Doppelte Vokabeln \(Test\)/)
  })
})
