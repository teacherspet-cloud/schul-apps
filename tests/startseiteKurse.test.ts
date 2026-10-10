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
  endetHinweis,
  hinweisKurz,
  kursZeilenTitel,
  problemHinweis
} from '../src/shared/startseiteKurse'
import { kursReiterDocId, sprachenlernenZiel } from '../src/renderer/src/modules/lernen/kurs/auftragsZiel'

/*
 * Startseite der Lehrkraft (10.10.2026): Anzahl je Karte am Smartphone, Karte „Termine & Vokabeltraining" mit jedem
 * laufenden Kurs (auch ohne Testtermin), knappen Hinweisen und Grammatik; Kasten „Meine Klassen" mit Klassen und Fächern.
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
  it('nennt Gruppe, Fach und den zuletzt freigeschalteten Abschnitt', () => {
    const teile = [
      { titel: 'Green Line 3 - Unit 1 - Check-in', anzahl: 10, zeit: jetzt - 20 * TAG },
      { titel: 'Green Line 3 - Unit 2 - Station 1', anzahl: 10, zeit: jetzt - 2 * TAG },
      // geplant – zählt noch nicht
      { titel: 'Green Line 3 - Unit 3 - Station 1', anzahl: 10, zeit: jetzt + 5 * TAG }
    ]
    expect(kursZeilenTitel('7b', 'Englisch', abschnittText(teile, 'Green Line 3', 'Unit 1', jetzt))).toBe('7b – Englisch · Green Line 3 Unit 2')
  })
  it('ohne Lehrwerk: Bände bzw. Name, ohne alles nur Gruppe und Fach', () => {
    expect(abschnittText([{ titel: 'Weather', anzahl: 5, zeit: 1 }], '', 'Weather', 10)).toBe('Weather')
    expect(abschnittText([], 'Green Line 1', 'x')).toBe('Green Line 1')
    expect(kursZeilenTitel('7b', 'Englisch', '')).toBe('7b – Englisch')
  })
})

describe('Knappe Hinweise', () => {
  it('ohne Namen, Termin steht schon oben', () => {
    expect(hinweisKurz('inaktiv', 5, '5 Lernende haben … : Ada, Ben')).toBe('5 Lernende seit 7 Tagen nicht geübt')
    expect(hinweisKurz('inaktiv', 1, 'x')).toBe('1 Lernende/r seit 7 Tagen nicht geübt')
    expect(hinweisKurz('schwach', 2, 'x')).toBe('2 Lernende unter 30 % sicher')
    expect(hinweisKurz('termin', undefined, 'Vokabeltest am …')).toBeNull()
    expect(hinweisKurz('leer', undefined, 'x')).toBe('Noch niemand im Kurs')
  })
  it('Problemwörter ab 3, Kursende in den nächsten 7 Tagen', () => {
    expect(problemHinweis(2)).toBeNull()
    expect(problemHinweis(12)).toMatchObject({ text: '12 Problemwörter', reiter: 'vokabeln' })
    const jetzt = Date.now()
    expect(endetHinweis(null, jetzt)).toBeNull()
    expect(endetHinweis(jetzt + 20 * TAG, jetzt)).toBeNull()
    expect(endetHinweis(jetzt + 3 * TAG, jetzt)).toMatchObject({ hinweis: 'endet', reiter: 'einstellungen' })
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

  it('liefert den laufenden Kurs ohne Termin mit „heute geübt" und knappen Hinweisen', () => {
    const d = startseiteDaten(lk.id)
    const k = d.kurse.find((x) => x.id === kurs)
    expect(k).toBeTruthy()
    expect(k!.titel).toBe('7b – Englisch · Green Line 3 Unit 2')
    expect(k!.testTermin).toBeNull()
    expect(k!.lernende).toBe(3)
    expect(k!.heute).toBe(1)
    expect(k!.sicher).toBe(0)
    // Ben und Cem haben in 7 Tagen nicht geübt – ohne Namen
    const inaktiv = k!.hinweise.find((h) => h.hinweis === 'inaktiv')
    expect(inaktiv?.text).toBe('2 Lernende seit 7 Tagen nicht geübt')
    expect(inaktiv?.reiter).toBe('lernende')
    expect(JSON.stringify(k!.hinweise)).not.toContain('ben.s')
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
