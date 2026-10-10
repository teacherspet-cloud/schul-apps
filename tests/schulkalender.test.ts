import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  ersterSchultag,
  gesetzlicheFeiertage,
  istFerien,
  istFeiertag,
  istFerienZeit,
  istSchultag,
  kalenderHinweis,
  letzterSchultag,
  naechsterSchultagAb,
  ostersonntag,
  schuljahrText,
  schuljahrVon,
  schultagVorschlag,
  setzeSchulkalender,
  sommerferien,
  unterrichtsTage,
  type SchulkalenderDaten
} from '../src/shared/schulkalender'
import { serieVon } from '../src/shared/erinnerungen'
import { besteSerie } from '../src/shared/achievements'
import { wochenSerie } from '../src/shared/lernstand'
import { abschnittsTermine, naechsterSchultag, testterminNach } from '../src/shared/freigabePlan'
import { schuljahrVon as jahrgangSchuljahr } from '../src/shared/grammatikJahrgang'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbankFuerTests, leseServerProtokoll, setzeServerWert } from '../src/server/datenbank'
import {
  abrufNoetig,
  gespeicherterKalender,
  haeufigstesLand,
  kalenderAktualisieren,
  kalenderStand,
  leseFerienApi,
  leseKalenderDatei,
  leseOpenHolidays
} from '../src/server/schulkalender'

/*
 * Schulkalender (10.10.2026): Ferien/Feiertage Niedersachsen 2025–2027 aus echten Antworten der OpenHolidays API
 * (tests/fixtures/openholidays-ni.json) und von ferien-api.de (tests/fixtures/ferien-api-ni-2025.json). Kein Netz.
 */
const FIXTURE = join(__dirname, 'fixtures', 'openholidays-ni.json')
const roh = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { schulferien: unknown[]; feiertage: unknown[] }
const NI: SchulkalenderDaten = {
  land: 'NI',
  quelle: 'openholidays',
  abgerufen: '2026-10-10T06:00:00.000Z',
  ferien: leseOpenHolidays(roh.schulferien, 'NI'),
  feiertage: leseOpenHolidays(roh.feiertage, 'NI')
}

afterEach(() => setzeSchulkalender(null))

describe('Antworten lesen', () => {
  it('OpenHolidays: Ferien und Feiertage des Landes', () => {
    expect(NI.ferien).toHaveLength(15)
    expect(NI.ferien.find((f) => f.von === '2026-07-02')).toEqual({ von: '2026-07-02', bis: '2026-08-12', name: 'Sommerferien' })
    expect(NI.feiertage.map((f) => f.name)).toContain('Reformationstag')
    // Reformationstag gilt nicht in Bayern
    expect(leseOpenHolidays(roh.feiertage, 'BY').map((f) => f.name)).not.toContain('Reformationstag')
    // Nur Gruppen/Orte betreffende Einträge fallen weg
    const lokal = [{ startDate: '2026-06-01', endDate: '2026-06-01', name: [{ language: 'DE', text: 'Ort' }], regionalScope: 'Local', subdivisions: [{ code: 'DE-NI' }] }]
    expect(leseOpenHolidays(lokal, 'NI')).toEqual([])
    expect(() => leseOpenHolidays({ fehler: 1 }, 'NI')).toThrow()
  })
  it('ferien-api.de: Tage einschließlich, bewegliche Ferientage nicht', () => {
    const fa = leseFerienApi(JSON.parse(readFileSync(join(__dirname, 'fixtures', 'ferien-api-ni-2025.json'), 'utf8')), 'NI')
    expect(fa.find((f) => f.name === 'Sommerferien')).toEqual({ von: '2025-07-03', bis: '2025-08-13', name: 'Sommerferien' })
    expect(fa.some((f) => f.von === '2025-04-30')).toBe(false)
    // gleiche Sommerferien wie bei OpenHolidays
    expect(NI.ferien.find((f) => f.von === '2025-07-03')?.bis).toBe('2025-08-13')
    // ältere Schreibweise mit Uhrzeit
    expect(leseFerienApi([{ start: '2024-06-20T00:00Z', end: '2024-07-31T00:00Z', stateCode: 'NI', name: 'sommerferien niedersachsen 2024' }], 'NI')[0]).toEqual({
      von: '2024-06-20',
      bis: '2024-07-31',
      name: 'Sommerferien'
    })
  })
  it('Datei statt Netz (Browsertests)', () => {
    const d = leseKalenderDatei(FIXTURE)
    expect(d.land).toBe('NI')
    expect(d.quelle).toBe('datei')
    expect(d.ferien).toEqual(NI.ferien)
  })
})

describe('Schultage und Schuljahr (Niedersachsen 2025–2027)', () => {
  it('Ferien, Feiertage, Schultage', () => {
    expect(istFerien('2026-10-14', NI)?.name).toBe('Herbstferien')
    expect(istFeiertag('2026-10-03', NI)?.name).toBe('Tag der Deutschen Einheit')
    expect(istSchultag('2026-10-09', NI)).toBe(true)
    expect(istSchultag('2026-10-12', NI)).toBe(false)
    expect(istSchultag('2026-05-15', NI)).toBe(false) // Tag nach Himmelfahrt (landesweit frei)
    expect(istSchultag('2026-10-10', NI)).toBe(false) // Samstag
    expect(naechsterSchultagAb('2026-10-12', NI)).toBe('2026-10-26')
  })
  it('Grenzen der Schuljahre', () => {
    expect(sommerferien(NI).map((s) => s.von)).toEqual(['2025-07-03', '2026-07-02', '2027-07-08'])
    expect(ersterSchultag(2025, NI)).toBe('2025-08-14')
    expect(letzterSchultag(2025, NI)).toBe('2026-07-01')
    expect(ersterSchultag(2026, NI)).toBe('2026-08-13')
    expect(letzterSchultag(2026, NI)).toBe('2027-07-07')
    expect(ersterSchultag(2027, NI)).toBe('2027-08-19')
    expect(letzterSchultag(2027, NI)).toBeNull()
  })
  it('Schuljahr genau: Wechsel am ersten Schultag, Sommerferien gehören zum alten', () => {
    expect(schuljahrVon('2026-08-01', NI)).toBe(2025)
    expect(schuljahrVon('2026-08-12', NI)).toBe(2025)
    expect(schuljahrVon('2026-08-13', NI)).toBe(2026)
    expect(schuljahrVon('2027-08-18', NI)).toBe(2026)
    expect(schuljahrVon('2027-08-19', NI)).toBe(2027)
    // ohne Daten: 1. August
    expect(schuljahrVon('2026-08-01', null)).toBe(2026)
    expect(schuljahrVon('2026-07-31', null)).toBe(2025)
    // ohne Sommerferien des Jahres in den Daten: ebenfalls 1. August
    expect(schuljahrVon('2028-09-01', NI)).toBe(2028)
    expect(schuljahrText(2026)).toBe('2026/27')
    expect(schuljahrText(2026, '-')).toBe('2026-27')
  })
  it('gesetzte Daten gelten überall (grammatikJahrgang)', () => {
    const t = new Date(2026, 7, 10, 12).getTime()
    expect(jahrgangSchuljahr(t)).toBe(2026)
    setzeSchulkalender(NI)
    expect(jahrgangSchuljahr(t)).toBe(2025)
  })
})

describe('Gesetzliche Feiertage (Rückfall ohne Abruf)', () => {
  it('Ostern und Niedersachsen wie OpenHolidays', () => {
    expect(ostersonntag(2026)).toBe('2026-04-05')
    expect(ostersonntag(2027)).toBe('2027-03-28')
    const offiziell = NI.feiertage.filter((f) => f.von.startsWith('2026')).map((f) => `${f.von} ${f.name}`)
    const gerechnet = gesetzlicheFeiertage('NI', 2026).map((f) => `${f.von} ${f.name}`)
    expect(gerechnet).toEqual(offiziell)
  })
  it('Landesbesonderheiten', () => {
    const by = gesetzlicheFeiertage('BY', 2026).map((f) => f.name)
    expect(by).toContain('Fronleichnam')
    expect(by).toContain('Allerheiligen')
    expect(by).not.toContain('Reformationstag')
    expect(gesetzlicheFeiertage('SN', 2026).find((f) => f.name === 'Buß- und Bettag')?.von).toBe('2026-11-18')
    expect(gesetzlicheFeiertage('SN', 2027).find((f) => f.name === 'Buß- und Bettag')?.von).toBe('2027-11-17')
    expect(gesetzlicheFeiertage('BE', 2026).map((f) => f.name)).toContain('Internationaler Frauentag')
  })
})

describe('Serien pausieren in den Ferien', () => {
  // Do/Fr vor den Herbstferien (12.–24.10.2026), dann Montag danach
  const tage = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-26']
  it('Tagesserie (Erinnerungen)', () => {
    expect(serieVon(tage, '2026-10-26', (t) => istFerienZeit(t, NI))).toBe(4)
    expect(serieVon(tage, '2026-10-26', () => false)).toBe(1)
    // in den Ferien geübt: zählt dazu
    expect(serieVon([...tage, '2026-10-15'], '2026-10-26', (t) => istFerienZeit(t, NI))).toBe(5)
    // ein Schultag ohne Übung beendet sie weiterhin
    expect(serieVon(['2026-10-26', '2026-10-28'], '2026-10-28', (t) => istFerienZeit(t, NI))).toBe(1)
    setzeSchulkalender(NI)
    expect(serieVon(tage, '2026-10-26')).toBe(4)
  })
  it('beste Serie (Achievements)', () => {
    expect(besteSerie(tage, (t) => istFerienZeit(t, NI))).toBe(4)
    expect(besteSerie(tage, () => false)).toBe(3)
  })
  it('Wochenserie (Startseite): Ferienwochen sind keine Lücke', () => {
    const vorher = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-05', '2026-10-06', '2026-10-07']
    const nachher = ['2026-10-26', '2026-10-27', '2026-10-28']
    const jetzt = Date.parse('2026-10-29T12:00:00Z')
    expect(wochenSerie([...vorher, ...nachher], jetzt, 3, (t) => istFerienZeit(t, NI)).serie).toBe(3)
    expect(wochenSerie([...vorher, ...nachher], jetzt, 3, () => false).serie).toBe(1)
  })
})

describe('Vorschläge und Hinweise', () => {
  it('Freischalten, Abschnitte und Test rücken aus den Ferien', () => {
    setzeSchulkalender(NI)
    const fr = new Date(2026, 9, 9, 15, 0) // Freitag vor den Herbstferien
    const d = naechsterSchultag(fr)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 26, 7, 30])
    const t = abschnittsTermine(new Date(2026, 9, 5, 7, 30).getTime(), 3, 7).map((x) => new Date(x).getDate())
    expect(t).toEqual([5, 26, 26])
    const test = new Date(testterminNach(new Date(2026, 9, 5, 7, 30).getTime(), 7))
    expect([test.getMonth() + 1, test.getDate(), test.getHours()]).toEqual([10, 26, 8])
  })
  it('Beginn nach den Ferien, Ende davor', () => {
    expect(schultagVorschlag('2026-10-14', 'nach', NI)).toBe('2026-10-26')
    expect(schultagVorschlag('2026-10-14', 'vor', NI)).toBe('2026-10-09')
    expect(schultagVorschlag('2026-10-08', 'vor', NI)).toBe('2026-10-08')
  })
  it('Hinweise für Datumsfelder (Elternbrief, Fristen)', () => {
    expect(kalenderHinweis('2026-10-14', NI)).toEqual({ art: 'ferien', text: 'Der 14.10.2026 liegt in den Herbstferien (12.10.–24.10.2026).' })
    expect(kalenderHinweis('2026-10-03', NI)?.art).toBe('feiertag')
    expect(kalenderHinweis('2026-10-08', NI)).toBeNull()
    expect(kalenderHinweis('2026-10-14', null)).toBeNull()
  })
  it('Stundentermine einer Reihe überspringen Ferien und Feiertage', () => {
    expect(unterrichtsTage('2026-10-05', [1, 4], 4, NI)).toEqual(['2026-10-05', '2026-10-08', '2026-10-26', '2026-10-29'])
    // Reformationstag 2027 ist ein Sonntag; Feiertag an einem Montag: Ostermontag 2027-03-29 (in den Osterferien)
    expect(unterrichtsTage('2026-12-21', [1, 3], 3, NI)).toEqual(['2026-12-21', '2027-01-11', '2027-01-13'])
    expect(unterrichtsTage('2026-10-05', [], 3, NI)).toEqual([])
  })
})

describe('Abruf am Server', () => {
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    setzeServerWert('schule', { name: 'Testschule', stateId: 'NI', schulformen: ['gymnasium'], strasse: '', plz: '', ort: '', telefon: '', email: '' })
  })
  const antwort = (wert: unknown, status = 200): Response => new Response(JSON.stringify(wert), { status, headers: { 'content-type': 'application/json' } })
  const jetzt = Date.parse('2026-10-10T06:00:00Z')

  it('OpenHolidays zuerst; danach frisch genug', async () => {
    const urls: string[] = []
    const abruf = (async (u: string) => {
      urls.push(String(u))
      return antwort(String(u).includes('SchoolHolidays') ? roh.schulferien : roh.feiertage)
    }) as unknown as typeof fetch
    const d = await kalenderAktualisieren({ abruf, jetzt, datei: '' })
    expect(d?.quelle).toBe('openholidays')
    expect(urls[0]).toContain('subdivisionCode=DE-NI')
    expect(urls[0]).toContain('validFrom=2025-07-01')
    expect(urls[0]).toContain('validTo=2028-06-29')
    expect(gespeicherterKalender()?.ferien).toHaveLength(15)
    expect(abrufNoetig(gespeicherterKalender(), 'NI', jetzt + 864e5)).toBe(false)
    expect(abrufNoetig(gespeicherterKalender(), 'NI', jetzt + 8 * 864e5)).toBe(true)
    expect(abrufNoetig(gespeicherterKalender(), 'HB', jetzt)).toBe(true)
  })
  it('Fehler: letzte gute Daten bleiben, ein Protokolleintrag je Fehlerserie', async () => {
    const vorher = leseServerProtokoll(500).filter((p) => p.art === 'schulkalender').length
    const kaputt = (async () => antwort({}, 503)) as unknown as typeof fetch
    await kalenderAktualisieren({ abruf: kaputt, jetzt, erzwingen: true, datei: '' })
    await kalenderAktualisieren({ abruf: kaputt, jetzt, erzwingen: true, datei: '' })
    expect(gespeicherterKalender()?.quelle).toBe('openholidays')
    expect(kalenderStand()?.ok).toBe(false)
    expect(leseServerProtokoll(500).filter((p) => p.art === 'schulkalender').length).toBe(vorher + 1)
  })
  it('Rückfall ferien-api.de, aber nur mit den Sommerferien des laufenden Schuljahres', async () => {
    const fa = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'ferien-api-ni-2025.json'), 'utf8')) as unknown[]
    // Wie am 10.10.2026: 2026 und später leer → unvollständig, bisherige Daten bleiben
    const leer = (async (u: string) => (String(u).includes('openholidays') ? antwort({}, 500) : antwort(String(u).endsWith('/2025') ? fa : []))) as unknown as typeof fetch
    await kalenderAktualisieren({ abruf: leer, jetzt, erzwingen: true, datei: '' })
    expect(gespeicherterKalender()?.quelle).toBe('openholidays')
    // Ein Jahr früher (Schuljahr 2025/26) reichen die Daten: Feiertage dann selbst gerechnet
    const d = await kalenderAktualisieren({ abruf: leer, jetzt: Date.parse('2025-10-10T06:00:00Z'), erzwingen: true, datei: '' })
    expect(d?.quelle).toBe('ferien-api')
    expect(d?.feiertage.some((f) => f.name === 'Reformationstag' && f.von === '2025-10-31')).toBe(true)
  })
  it('Land der Lehrkräfte als Rückfall: das häufigste', () => {
    expect(haeufigstesLand(['NI', 'HB', 'NI', null, 'XX'])).toBe('NI')
    expect(haeufigstesLand([])).toBeNull()
  })
})
