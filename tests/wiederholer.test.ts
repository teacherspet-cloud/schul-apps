import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fehlendeAuffuellen, gleicheKlasse, istHinterher, wechselGrund, zuordnungWoerter } from '../src/shared/schuljahrWechsel'
import { setzeSchulkalender } from '../src/shared/schulkalender'
import { tagesRunde, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAendern, nutzerAnlegen, nutzerNachId, setzeServerWert, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { lernendeVon, standSpeichern, standVon, vokIstFuer, vokabelnZuweisen, zeile } from '../src/server/vokabeln'
import { grammatikAnlegen, grammatikFuer, infoBereinigt } from '../src/server/grammatik'
import { leseKalenderDatei } from '../src/server/schulkalender'
import { hinweisFuer, klassenwechselPruefen, nachsuchen, rueckgaengig, schuljahrPruefen } from '../src/server/schuljahrWechsel'
import { mitnahmeVon } from '../src/server/mitnahme'
import { sprachstandRoute } from '../src/server/sprachstand'
import type { Anfrage } from '../src/server/http'

/*
 * Wiederholer und Klassenwechsel (10.10.2026, Entscheidungen der Lehrkraft; server/mitnahme.ts):
 *  1. Fortschritt bleibt (nichts gelöscht),
 *  2. Freigaben = die der neuen Klasse (Einzel-Freigaben ruhen),
 *  3. später freigegebene, schon bekannte Wörter/Grammatik zählen sofort,
 *  4. wackelige Wörter aus Abschnitten, die die neue Klasse noch nicht hat, ruhen (nicht in der Tagesrunde),
 *  5. „Rückgängig" stellt die Freigaben wieder her.
 */

// Lehrwerke liest der Sprachstand über Electron-Pfade (hier ohne Lehrwerke)
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => `${process.cwd()}/nie-benutzt` } }))

describe('Regeln', () => {
  it('Zuordnung über Wort + Übersetzung, sonst über das Wort allein (eindeutig)', () => {
    const z = zuordnungWoerter(
      [
        { id: 'a', term: 'dog', translation: 'Hund' },
        { id: 'b', term: 'cat', translation: 'Katze' },
        { id: 'c', term: 'run', translation: 'rennen' }
      ],
      [
        { id: 'x', term: 'dog', translation: 'der Hund' },
        { id: 'y', term: 'Cat', translation: 'Katze' },
        { id: 'r1', term: 'run', translation: 'laufen' },
        { id: 'r2', term: 'run', translation: 'Lauf' }
      ]
    )
    expect([...z].sort()).toEqual([
      ['a', 'x'],
      ['b', 'y']
    ])
  })
  it('nur fehlende Einträge füllen – Vorhandenes bleibt', () => {
    const r = fehlendeAuffuellen(
      [{ eintraege: { a: { fach: 4, versuche: 8 }, b: { fach: 5, versuche: 9 }, c: { fach: 0, versuche: 0 } }, tage: ['2027-06-01'], zuordnung: new Map([['a', 'x'], ['b', 'y'], ['c', 'z']]) }],
      { eintraege: { y: { fach: 1, versuche: 2 } }, tage: ['2027-09-01'] }
    )
    expect(r.neu).toBe(1)
    expect(r.eintraege).toEqual({ x: { fach: 4, versuche: 8 }, y: { fach: 1, versuche: 2 } })
    expect(r.tage).toEqual(['2027-06-01', '2027-09-01'])
  })
  it('Grund, hinterher, gleiche Klasse', () => {
    expect(wechselGrund(8, 7)).toBe('wiederholung')
    expect(wechselGrund(7, 7)).toBe('wechsel')
    expect(wechselGrund(null, 7)).toBe('wechsel')
    expect(istHinterher(['a', 'b', 'c', 'd'], new Set())).toBe(false)
    expect(istHinterher(['a', 'b', 'c', 'd', 'e', 'f'], new Set(['a']))).toBe(true)
    expect(gleicheKlasse('7c', 'Klasse 7c')).toBe(true)
    expect(gleicheKlasse('7c Englisch', '7c')).toBe(true)
    expect(gleicheKlasse('7c', '7d')).toBe(false)
    expect(gleicheKlasse('7 Förder', '7c')).toBe(false)
  })
})

// ---------------------------------------------------------------- Mit Datenbank

const ERSTER_SCHULTAG_2027 = '2027-08-19'
const JETZT = Date.parse('2027-08-19T06:00:00Z')
const HEUTE = Date.now()
const keineSicherung = (): void => undefined
const TIERE = ['dog', 'cat', 'bird', 'fish', 'horse', 'mouse']
const UEBERSETZT: Record<string, string> = { dog: 'Hund', cat: 'Katze', bird: 'Vogel', fish: 'Fisch', horse: 'Pferd', mouse: 'Maus', apple: 'Apfel', pear: 'Birne' }
const wort = (t: string, id: string): Vokabel => ({ id, term: t, translation: UEBERSETZT[t] })
const st = (fach: number, o: Partial<WortStand> = {}): WortStand => ({
  fach,
  faellig: 0,
  frei: [],
  erkannt: 0,
  erkennenVersuche: 0,
  versuche: Math.max(1, fach * 2),
  falsch: 0,
  fehlerTexte: [],
  zuletzt: HEUTE - 2 * 864e5,
  erstmals: HEUTE - 60 * 864e5,
  ...o
})

let lk: NutzerInfo
let lk2: NutzerInfo
const s: Record<string, NutzerInfo> = {}
const g: Record<string, string> = {}
const k: Record<string, string> = {}

const gruppe = (lehrer: NutzerInfo, name: string, iserv = '', mitglieder: string[] = [], erstellt = new Date().toISOString()): string => {
  lerngruppenVon(lehrer.id)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrer.id, name, 'Englisch', iserv, JSON.stringify(mitglieder), erstellt)
  return id
}
const kurs = (lehrer: NutzerInfo, gruppeId: string, woerter: Vokabel[], schueler: string[] = []): string =>
  vokabelnZuweisen({ lehrkraftId: lehrer.id, lerngruppeId: gruppeId, schueler, titel: 'Englisch', sprache: 'en', fach: 'Englisch', woerter })
const paket = (id: string) => ({
  thema: 'Simple past',
  regeln: [],
  aufgaben: [{ id, art: 'luecke' as const, regelId: 'r', anweisung: 'Setze ein.', satz: 'She ___ home.', vorgabe: '(go)', loesungen: ['went'] }]
})
const gram = (lehrer: NutzerInfo, gruppeId: string, vokId: string, aufgabe: string, art = 'x', schueler: string[] = []): string =>
  grammatikAnlegen({ lehrkraftId: lehrer.id, lerngruppeId: gruppeId, schueler, titel: 'Simple past', fach: 'Englisch', sprache: 'en', paket: paket(aufgabe), code: false, bis: null, vokId, art, info: infoBereinigt({}) })[0]
const gramStand = (kurs: string, sid: string): { aufgaben: Record<string, WortStand> } | null => {
  const z = datenbank().prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(kurs, sid) as { daten: string } | undefined
  return z ? JSON.parse(z.daten) : null
}
const standRoh = (kurs: string, sid: string): string | null =>
  (datenbank().prepare('SELECT daten FROM vok_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(kurs, sid) as { daten: string } | undefined)?.daten ?? null

async function tagesKasten(n: NutzerInfo): Promise<{ woerter: Vokabel[]; staende: Record<string, WortStand> }> {
  let text = ''
  const res = { writeHead: () => res, setHeader: () => res, end: (x: string) => void (text = x) }
  const anfrage = {
    req: { method: 'GET', headers: {}, socket: {} },
    res,
    url: new URL('http://x/s/api/vokabeln/liste?id=sp:en'),
    sitzung: { nutzer: nutzerNachId(n.id), kennung: 'probe' },
    ip: '',
    koerper: async () => ({})
  } as unknown as Anfrage
  await sprachstandRoute()(anfrage)
  return JSON.parse(text || '{}')
}
const begriffe = (woerter: Vokabel[]): string[] => woerter.map((v) => v.term).sort()

describe('Wiederholer und Klassenwechsel am Server', () => {
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    setzeSchulkalender(leseKalenderDatei(join(__dirname, 'fixtures', 'openholidays-ni.json')))
    setzeServerWert('schule', { name: 'Testschule', stateId: 'NI', schulformen: ['gymnasium'], strasse: '', plz: '', ort: '', telefon: '', email: '' })
    lk = nutzerAnlegen({ benutzer: 'l.lehrer', name: 'Lea Lehrer', rolle: 'lehrkraft', quelle: 'test' })
    lk2 = nutzerAnlegen({ benutzer: 'k.kollege', name: 'Kai Kollege', rolle: 'lehrkraft', quelle: 'test' })
    const neu = (b: string, gruppen: { id: string; name: string }[] = []): NutzerInfo =>
      (s[b] = nutzerAnlegen({ benutzer: b, name: b, rolle: 'schueler', quelle: 'iserv', gruppen }))
    for (const b of ['s.a', 's.b', 's.c', 's.rita']) neu(b, [{ id: 'iserv-7a', name: 'Klasse 7a' }])
    neu('s.tom', [{ id: 'klasse:7c', name: '7c' }])
    neu('s.uwe', [{ id: 'klasse:7c', name: '7c' }])
    // Rita (wiederholt die 7): Klasse 7a mit IServ, ihre Einzel-Freigabe, ein Förder-Extra, Grammatik der Klasse
    g.a7 = gruppe(lk, '7a', 'iserv-7a')
    k.a7 = kurs(lk, g.a7, TIERE.map((t, i) => wort(t, `w${i}`)))
    k.rita = kurs(lk, '', [wort('apple', 'e0')], ['s.rita'])
    k.ga7 = gram(lk, g.a7, k.a7, 'g1')
    k.extra = gram(lk, g.a7, k.a7, 'f1', 'foerder', ['s.rita'])
    standSpeichern(k.a7, s['s.rita'].id, {
      woerter: { w0: st(3), w1: st(2), w2: st(1, { falsch: 2, versuche: 3, zuletzt: HEUTE - 864e5 }), w3: st(4), w4: st(2), w5: st(2) },
      tage: ['2027-06-30']
    })
    standSpeichern(k.rita, s['s.rita'].id, { woerter: { e0: st(1, { falsch: 1, versuche: 2 }) }, tage: ['2027-07-01'] })
    datenbank()
      .prepare('INSERT INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
      .run(k.ga7, s['s.rita'].id, JSON.stringify({ aufgaben: { g1: st(4) }, tage: ['2027-07-01'] }), 1)
    // Ihre neue Klasse 7b (andere Lehrkraft, in den Sommerferien angelegt): bisher nur dog und cat
    g.b7 = gruppe(lk2, '7b', 'iserv-7b', [], '2027-07-20T10:00:00.000Z')
    k.b7 = kurs(lk2, g.b7, [wort('dog', 'y0'), wort('cat', 'y1')])
    // Tom und Uwe: 7c aus der Klassenliste; die 7d hinkt hinterher (nur dog)
    g.c7 = gruppe(lk, '7c', 'klasse:7c')
    k.c7 = kurs(lk, g.c7, TIERE.map((t, i) => wort(t, `c${i}`)))
    k.tom = kurs(lk, '', [wort('pear', 'p0')], ['s.tom'])
    g.d7 = gruppe(lk2, '7d', 'klasse:7d')
    k.d7 = kurs(lk2, g.d7, [wort('dog', 'd0')])
    const alle = Object.fromEntries(TIERE.map((_, i) => [`c${i}`, st(2)]))
    standSpeichern(k.c7, s['s.tom'].id, { woerter: alle, tage: ['2026-10-01'] })
    standSpeichern(k.c7, s['s.uwe'].id, { woerter: alle, tage: ['2026-10-01'] })
    standSpeichern(k.tom, s['s.tom'].id, { woerter: { p0: st(2) }, tage: ['2026-10-01'] })
  })

  it('Wechsel mitten im Jahr (Klassenliste) in eine Klasse, die hinterher ist: Freigaben der neuen Klasse, Stand kommt mit', () => {
    // Ohne Wechsel: nichts
    expect(klassenwechselPruefen(s['s.tom'], { sofort: true })).toBe(0)
    nutzerAendern(s['s.tom'].id, { gruppen: [{ id: 'klasse:7d', name: '7d' }] })
    const tom = nutzerNachId(s['s.tom'].id)!
    expect(klassenwechselPruefen(tom, { sofort: true })).toBe(1)
    const m = mitnahmeVon(tom.id)!
    expect(m.wechsel).toMatchObject([{ von: g.c7, nach: g.d7, grund: 'wechsel', zurueckgesetzt: true }])
    // Einzel-Freigabe ruht (nicht gelöscht), der Stand darin bleibt
    expect(vokIstFuer(zeile(k.tom)!, tom)).toBe(false)
    expect(lernendeVon(zeile(k.tom)!).map((n) => n.id)).toEqual([])
    expect(standVon(k.tom, tom.id).woerter.p0.fach).toBe(2)
    // In der neuen Klasse zählt der mitgebrachte Stand
    expect(standVon(k.d7, tom.id).woerter.d0?.fach).toBe(2)
    // Nur einmal
    expect(klassenwechselPruefen(tom, { sofort: true })).toBe(0)
  })

  it('kein Klassenwechsel: dieselbe Klasse in einer neuen Lerngruppe', () => {
    gruppe(lk2, 'Klasse 7c', '', ['s.uwe'])
    nutzerAendern(s['s.uwe'].id, { gruppen: [] })
    expect(klassenwechselPruefen(nutzerNachId(s['s.uwe'].id)!, { sofort: true })).toBe(0)
    expect(mitnahmeVon(s['s.uwe'].id)).toBeNull()
  })

  it('Wiederholer beim Schuljahreswechsel: Fortschritt bleibt, Freigaben auf den Stand der Klasse', () => {
    expect(schuljahrPruefen('2026-10-10', { sichern: keineSicherung, jetzt: Date.parse('2026-10-10T06:00:00Z') }).art).toBe('eingerichtet')
    expect(schuljahrPruefen(ERSTER_SCHULTAG_2027, { sichern: keineSicherung, jetzt: JETZT }).art).toBe('gewechselt')
    const rita0 = { a7: standRoh(k.a7, s['s.rita'].id), rita: standRoh(k.rita, s['s.rita'].id), ga7: gramStand(k.ga7, s['s.rita'].id) }
    for (const b of ['s.a', 's.b', 's.c']) nutzerAendern(s[b].id, { gruppen: [{ id: 'iserv-8a', name: 'Klasse 8a' }] })
    nutzerAendern(s['s.rita'].id, { gruppen: [{ id: 'iserv-7b', name: 'Klasse 7b' }] })
    const rita = nutzerNachId(s['s.rita'].id)!
    expect(nachsuchen(JETZT + 864e5)).toMatchObject({ gefunden: 1 })
    // 1. Fortschritt bleibt – alle bisherigen Stände unverändert
    expect(standRoh(k.a7, rita.id)).toBe(rita0.a7)
    expect(standRoh(k.rita, rita.id)).toBe(rita0.rita)
    expect(gramStand(k.ga7, rita.id)).toEqual(rita0.ga7)
    // 2. Einzel-Freigabe und Förder-Extra ruhen
    expect(vokIstFuer(zeile(k.rita)!, rita)).toBe(false)
    expect(grammatikFuer(rita).map((x) => x.id)).not.toContain(k.extra)
    expect(mitnahmeVon(rita.id)?.ruhend.map((r) => r.kurs).sort()).toEqual([k.rita, k.extra].sort())
    // Kurs der neuen Klasse: bekannte Wörter mit ihrem Stand
    const b7 = standVon(k.b7, rita.id).woerter
    expect([b7.y0?.fach, b7.y1?.fach]).toEqual([3, 2])
    // Hinweis für die Lehrkraft der bisherigen Klasse
    const h = hinweisFuer(lk.id, JETZT + 864e5)!
    expect(h).toMatchObject({ zurueckgesetzt: 1, ruhend: 2 })
    expect(h.eintraege.find((e) => e.alt === '7a')).toMatchObject({ wiederholer: 1 })
    // Kein zweites Mal über die Erkennung an der Person
    expect(klassenwechselPruefen(rita, { sofort: true })).toBe(0)
  })

  it('wackelige Wörter aus noch nicht freigegebenen Abschnitten ruhen (nicht in der Tagesrunde)', async () => {
    const rita = nutzerNachId(s['s.rita'].id)!
    const kasten = await tagesKasten(rita)
    // Nur, was die neue Klasse freigegeben hat: dog, cat – nicht bird (wackelig), nicht apple (ruhende Einzel-Freigabe)
    expect(begriffe(kasten.woerter)).toEqual(['cat', 'dog'])
    const runde = tagesRunde(kasten.woerter, kasten.staende, HEUTE)
    expect(runde.woerter.map((v) => v.term)).not.toContain('bird')
    expect(runde.woerter.map((v) => v.term)).not.toContain('apple')
  })

  it('später freigegebene Wörter und Grammatik, die sie schon kennt, zählen sofort', async () => {
    const rita = nutzerNachId(s['s.rita'].id)!
    // Die 7b gibt bird und fish frei (neue Kennungen, Lehrkraft der 7b)
    const z = zeile(k.b7)!
    const woerter = [...JSON.parse(z.woerter), wort('bird', 'y2'), wort('fish', 'y3')]
    datenbank().prepare('UPDATE vok_zuweisungen SET woerter = ?, teile = ? WHERE id = ?').run(JSON.stringify(woerter), '', k.b7)
    const b7 = standVon(k.b7, rita.id).woerter
    expect(b7.y2).toMatchObject({ fach: 1, falsch: 2 })
    expect(b7.y3?.fach).toBe(4)
    // Jetzt freigegeben: bird gehört in ihre Runde (wackelig), horse/mouse ruhen weiter
    const kasten = await tagesKasten(rita)
    expect(begriffe(kasten.woerter)).toEqual(['bird', 'cat', 'dog', 'fish'])
    expect(kasten.staende[kasten.woerter.find((v) => v.term === 'bird')!.id]?.fach).toBe(1)
    // Grammatik: die 7b gibt dasselbe Thema frei – die Aufgabe kennt sie schon
    const gb7 = gram(lk2, g.b7, k.b7, 'h1')
    const gb = grammatikFuer(rita).find((x) => x.id === gb7)!
    expect(gb.uebersicht.unbearbeitet).toBe(0)
    expect(gramStand(gb7, rita.id)?.aufgaben.h1?.fach).toBe(4)
  })

  it('„Rückgängig" stellt die bisherigen Freigaben wieder her und erkennt den Wechsel nicht neu', () => {
    const rita = nutzerNachId(s['s.rita'].id)!
    expect(rueckgaengig(lk.id, JETZT + 3 * 864e5)).toMatchObject({ ok: true })
    expect(vokIstFuer(zeile(k.rita)!, rita)).toBe(true)
    expect(lernendeVon(zeile(k.rita)!).map((n) => n.id)).toEqual([rita.id])
    expect(grammatikFuer(rita).map((x) => x.id)).toContain(k.extra)
    const m = mitnahmeVon(rita.id)!
    expect(m.ruhend).toEqual([])
    expect(m.vok).toEqual([])
    expect(m.wechsel[0]).toMatchObject({ von: g.a7, zurueckgenommen: true })
    // Ihr Stand in den eigenen Kursen ist unberührt
    expect(standVon(k.a7, rita.id).woerter.w0.fach).toBe(3)
    expect(klassenwechselPruefen(rita, { sofort: true })).toBe(0)
    // Toms Wechsel (nicht Teil des Schuljahreswechsels) bleibt
    expect(mitnahmeVon(s['s.tom'].id)?.ruhend).toHaveLength(1)
  })
})
