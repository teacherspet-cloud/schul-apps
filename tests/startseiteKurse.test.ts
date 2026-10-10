import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { standSpeichern, vokabelnZuweisen } from '../src/server/vokabeln'
import { startseiteDaten, startseiteRoute } from '../src/server/startseite'
import type { Anfrage } from '../src/server/http'
import {
  abschnittText,
  anzahlAus,
  anzahlText,
  begrenzt,
  demnaechst,
  einheitText,
  haltepunktTermine,
  kursAbzeichen,
  kursKopf,
  tagKurz,
  testBaldText
} from '../src/shared/startseiteKurse'
import { kursReiterDocId, sprachenlernenZiel } from '../src/renderer/src/modules/lernen/kurs/auftragsZiel'

/*
 * Startseite der Lehrkraft (10.10.2026): Anzahl je Karte am Smartphone, Karte „Termine & Vokabeltraining" mit EINER Zeile
 * je laufendem Kurs (auch ohne Testtermin) und EINEM Abzeichen, darunter „Demnächst"; Kasten „Meine Klassen".
 */
const TAG = 86_400_000

describe('Anzahl je Karte', () => {
  it('liest nur erlaubte Werte, sonst 5', () => {
    expect(anzahlAus(null)).toBe(5)
    expect(anzahlAus('')).toBe(5)
    expect(anzahlAus('10')).toBe(10)
    expect(anzahlAus('0')).toBe(0)
    expect(anzahlAus('7')).toBe(5)
    expect(anzahlAus('abc')).toBe(5)
    expect(anzahlText(0)).toBe('alle')
    expect(anzahlText(20)).toBe('20')
  })
  it('kürzt, 0 = alle', () => {
    expect(begrenzt([1, 2, 3, 4, 5, 6], 5)).toEqual([1, 2, 3, 4, 5])
    expect(begrenzt([1, 2, 3], 0)).toEqual([1, 2, 3])
  })
})

describe('Kurszeile', () => {
  const jetzt = Date.UTC(2026, 9, 10)
  const teile = [
    { titel: 'Green Line 3 - Unit 1 - Check-in', anzahl: 10, zeit: jetzt - 20 * TAG },
    { titel: 'Green Line 3 - Unit 2 - Station 1', anzahl: 10, zeit: jetzt - 2 * TAG },
    // geplant – zählt noch nicht
    { titel: 'Green Line 3 - Unit 3 - Station 1', anzahl: 10, zeit: jetzt + 5 * TAG }
  ]
  it('nennt den zuletzt freigeschalteten Abschnitt, kurz nur die Unit', () => {
    expect(abschnittText(teile, 'Green Line 3', 'Unit 1', jetzt)).toBe('Green Line 3 Unit 2')
    expect(einheitText(teile, 'Green Line 3', 'Unit 1', jetzt)).toBe('Unit 2')
    expect(kursKopf('7b', 'Englisch')).toBe('7b · Englisch')
    expect(kursKopf('7b', '')).toBe('7b')
  })
  it('ohne Lehrwerk: Bände bzw. Name', () => {
    expect(abschnittText([{ titel: 'Weather', anzahl: 5, zeit: 1 }], '', 'Weather', 10)).toBe('Weather')
    expect(einheitText([{ titel: 'Weather', anzahl: 5, zeit: 1 }], '', 'Weather', 10)).toBe('Weather')
    expect(abschnittText([], 'Green Line 1', 'x')).toBe('Green Line 1')
  })
})

describe('Tage', () => {
  // Sa 10.10.2026, 10 Uhr deutscher Zeit
  const jetzt = Date.UTC(2026, 9, 10, 8)
  it('„Fr 16.10."', () => {
    expect(tagKurz('2026-10-16')).toBe('Fr 16.10.')
    expect(tagKurz('2026-11-03')).toBe('Di 03.11.')
  })
  it('Test bald: heute, morgen, Wochentag – nur bis 7 Tage', () => {
    expect(testBaldText(Date.UTC(2026, 9, 10, 20), jetzt)).toBe('Test heute')
    expect(testBaldText(Date.UTC(2026, 9, 11, 9), jetzt)).toBe('Test morgen')
    expect(testBaldText(Date.UTC(2026, 9, 16, 9), jetzt)).toBe('Test Fr')
    expect(testBaldText(Date.UTC(2026, 9, 17, 9), jetzt)).toBe('Test Sa')
    expect(testBaldText(Date.UTC(2026, 9, 18, 9), jetzt)).toBeNull()
    expect(testBaldText(Date.UTC(2026, 9, 9, 9), jetzt)).toBeNull()
    expect(testBaldText(null, jetzt)).toBeNull()
  })
})

describe('EIN Abzeichen je Kurs', () => {
  const jetzt = Date.UTC(2026, 9, 10, 8)
  const basis = { testTermin: null, inaktiv: [] as string[], problem: 0, lernende: 3 }
  it('Test bald vor allem anderen', () => {
    const a = kursAbzeichen({ testTermin: Date.UTC(2026, 9, 16, 9), inaktiv: ['a', 'b'], problem: 12, lernende: 3 }, jetzt)
    expect(a).toMatchObject({ art: 'test', text: 'Test Fr', reiter: 'vokabeln' })
  })
  it('Test erst in 2 Wochen zählt nicht – dann „nicht geübt" vor Problemwörtern', () => {
    const a = kursAbzeichen({ testTermin: jetzt + 14 * TAG, inaktiv: ['a', 'b'], problem: 12, lernende: 3 }, jetzt)
    expect(a).toMatchObject({ art: 'inaktiv', text: '2 nicht geübt', reiter: 'lernende', ids: ['a', 'b'] })
  })
  it('Problemwörter erst ab 3, sonst ✓', () => {
    expect(kursAbzeichen({ ...basis, problem: 3 }, jetzt)).toMatchObject({ art: 'problem', text: '3 Problemwörter', reiter: 'vokabeln' })
    expect(kursAbzeichen({ ...basis, problem: 2 }, jetzt)).toMatchObject({ art: 'ok', text: '✓' })
    expect(kursAbzeichen(basis, jetzt).reiter).toBeUndefined()
  })
  it('ohne Lernende kein ✓, sondern „leer"', () => {
    expect(kursAbzeichen({ ...basis, lernende: 0 }, jetzt)).toMatchObject({ art: 'leer', reiter: 'lernende' })
  })
})

describe('Demnächst', () => {
  const jetzt = Date.UTC(2026, 9, 10, 8)
  it('Haltepunkte bekommen den Tag ihrer Stunde, freigegebene fallen weg', () => {
    const schritt = (id: string, stunde?: number): Record<string, unknown> => ({
      id,
      titel: id,
      lernziele: [],
      rolle: 'pflicht',
      halt: { art: 'freigabe' },
      ...(stunde !== undefined ? { stunde } : {})
    })
    const r = {
      schritte: [schritt('A', 1), schritt('B'), schritt('C', 0), { id: 'x', titel: 'x', lernziele: [], rolle: 'pflicht' }],
      stunden: ['einzel', 'einzel'],
      // Montag und Donnerstag ab Mo 2.11.2026 (ohne Kalenderdaten: jeder Wochentag ist Schultag)
      stundenTermine: { beginn: '2026-11-02', tage: [1, 4] }
    } as unknown as Parameters<typeof haltepunktTermine>[0]
    expect(haltepunktTermine(r, ['C'])).toEqual([
      { titel: 'A', tag: '2026-11-05' },
      { titel: 'B', tag: null }
    ])
    expect(haltepunktTermine({ ...r, stundenTermine: undefined })[0]).toEqual({ titel: 'A', tag: null })
  })
  it('zeitlich geordnet, nur heute und später, Tests vor Haltepunkten am selben Tag, ohne Datum am Ende', () => {
    const kurse = [
      { id: 'k1', gruppe: '7b', einheit: 'Unit 2', testTermin: Date.UTC(2026, 9, 16, 9) },
      { id: 'k2', gruppe: '8a', einheit: 'Unit 4', testTermin: Date.UTC(2026, 9, 8, 9) },
      { id: 'k3', gruppe: '6c', einheit: '', testTermin: Date.UTC(2026, 9, 10, 18) },
      { id: 'k4', gruppe: '5a', einheit: 'Unit 1', testTermin: null }
    ]
    const reihen = [
      {
        zid: 'z1',
        gruppe: '9c',
        halteTermine: [
          { titel: 'Julikrise', tag: '2026-10-16' },
          { titel: 'Vorbei', tag: '2026-10-01' },
          { titel: 'Offen', tag: null }
        ]
      },
      { zid: 'z2', gruppe: '10a', halteTermine: [{ titel: 'Weimar', tag: '2026-10-13' }] },
      { zid: 'z3', gruppe: '7a' }
    ]
    const d = demnaechst(kurse, reihen, jetzt)
    expect(d.map((e) => `${e.tag} ${e.text}`)).toEqual([
      '2026-10-10 Vokabeltest 6c',
      '2026-10-13 Haltepunkt „Weimar" (10a)',
      '2026-10-16 Vokabeltest 7b – Unit 2',
      '2026-10-16 Haltepunkt „Julikrise" (9c)',
      'null Haltepunkt „Offen" (9c)'
    ])
    expect(d[0]).toMatchObject({ art: 'test', ziel: 'k3' })
    expect(d[1]).toMatchObject({ art: 'halt', ziel: 'z2' })
  })
})

describe('Sprung in den Kurs mit Reiter', () => {
  it('kursr:<reiter>:<id>', () => {
    expect(sprachenlernenZiel(kursReiterDocId('k1', 'lernende'))).toEqual({ art: 'kurs', id: 'k1', reiter: 'lernende' })
    expect(sprachenlernenZiel('kursr:quatsch:k1')).toEqual({ art: 'kurs', id: 'k1' })
    expect(sprachenlernenZiel('k1')).toEqual({ art: 'kurs', id: 'k1' })
  })
})

describe('Server: GET /server/startseite', () => {
  let lk: NutzerInfo
  const schueler: NutzerInfo[] = []
  let gruppeId = ''
  let kurs = ''
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    lk = nutzerAnlegen({ benutzer: 's.start', name: 'Sina Start', rolle: 'lehrkraft', quelle: 'test' })
    for (const b of ['ada.s', 'ben.s', 'cem.s']) schueler.push(nutzerAnlegen({ benutzer: b, name: b, rolle: 'schueler', quelle: 'lokal' }))
    lerngruppenVon(lk.id)
    gruppeId = randomBytes(6).toString('hex')
    const einfuegen = datenbank().prepare(
      'INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    einfuegen.run(gruppeId, lk.id, '7b', 'Englisch', '', JSON.stringify(schueler.map((s) => s.benutzer)), new Date().toISOString())
    einfuegen.run(randomBytes(6).toString('hex'), lk.id, '7b', 'Geschichte', '', JSON.stringify(schueler.map((s) => s.benutzer)), new Date().toISOString())
    // Kurs OHNE Testtermin (Befund: fehlte auf der Startseite)
    kurs = vokabelnZuweisen({
      lehrkraftId: lk.id,
      lerngruppeId: gruppeId,
      schueler: [],
      titel: 'Green Line 3 - Unit 2 - Station 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: ['dog', 'cat', 'bird'].map((t, i) => ({ id: `w${i}`, term: t, translation: `T${i}` }))
    })
    // Ada hat heute geübt
    standSpeichern(kurs, schueler[0].id, { woerter: {}, tage: [new Date().toISOString().slice(0, 10)] })
  })

  it('liefert den laufenden Kurs ohne Termin mit EINEM Abzeichen („n nicht geübt", ohne Namen)', () => {
    const d = startseiteDaten(lk.id)
    const k = d.kurse.find((x) => x.id === kurs)
    expect(k).toBeTruthy()
    expect(k!.gruppe).toBe('7b')
    expect(k!.fach).toBe('Englisch')
    expect(k!.abschnitt).toBe('Green Line 3 Unit 2')
    expect(k!.einheit).toBe('Unit 2')
    expect(k!.testTermin).toBeNull()
    expect(k!.lernende).toBe(3)
    expect(k!.sicher).toBe(0)
    // Ben und Cem haben in 7 Tagen nicht geübt – ohne Namen
    expect(k!.abzeichen).toMatchObject({ art: 'inaktiv', text: '2 nicht geübt', reiter: 'lernende' })
    expect(k!.abzeichen.ids).toHaveLength(2)
    expect(JSON.stringify(k)).not.toContain('ben.s')
    expect(k).not.toHaveProperty('hinweise')
    expect(k).not.toHaveProperty('grammatik')
  })

  it('Klassen mit ihren Fächern für den Kasten „Meine Klassen"', () => {
    const d = startseiteDaten(lk.id)
    const kl = d.klassen.find((x) => x.name === '7b')
    expect(kl?.faecher.map((f) => f.fach).sort()).toEqual(['Englisch', 'Geschichte'])
  })

  it('Route: nur Lehrkräfte', async () => {
    const rufe = async (nutzer: NutzerInfo): Promise<number> => {
      let code = 0
      const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: () => undefined }
      await startseiteRoute()({
        req: { method: 'GET', headers: {}, socket: {} },
        res,
        url: new URL('http://x/server/startseite'),
        sitzung: { nutzer, kennung: 'probe' },
        ip: '',
        koerper: async () => ({})
      } as unknown as Anfrage)
      return code
    }
    expect(await rufe(lk)).toBe(200)
    expect(await rufe(schueler[0])).toBe(403)
  })
})
