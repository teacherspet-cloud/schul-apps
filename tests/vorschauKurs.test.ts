import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { KURS_VORSCHAU_KLASSE, kontoZumSchluessel, vorschauKonto, vorschauRoute, vorschauZielPruefen } from '../src/server/vorschau'
import { lernendeVon, vokabelListenFuer, vokabelnZuweisen, vokabelRoute, vokIstFuer, zeile } from '../src/server/vokabeln'
import type { Anfrage } from '../src/server/http'

/*
 * „Als Schüler ansehen" in Sprachenlernen (09.10.2026): Kurs der Klasse → Vorschaukonto der Klasse, spontane Gruppe →
 * Vorschaukonto „Sprachenlernen", das dem Kurs wie ein Gast beitritt; das Fenster landet gleich auf dem Kurs. Ziele nur
 * zu Inhalten der eigenen Lehrkraft; das Vorschaukonto steht in keiner Lernendenliste des Kurses.
 */
let lk: NutzerInfo
let andere: NutzerInfo
let mia: NutzerInfo
const k: Record<string, string> = {}
const g: Record<string, string> = {}

const gruppeAnlegen = (lehrkraftId: string, name: string, fach: string, mitglieder: string[]): string => {
  lerngruppenVon(lehrkraftId)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrkraftId, name, fach, '', JSON.stringify(mitglieder), new Date().toISOString())
  return id
}
const woerter = [
  { id: 'w1', term: 'cat', translation: 'Katze' },
  { id: 'w2', term: 'dog', translation: 'Hund' }
]

async function rufe(
  route: (k: Anfrage) => Promise<boolean>,
  n: NutzerInfo,
  methode: 'GET' | 'POST',
  pfad: string,
  koerper: Record<string, unknown> = {}
): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = {
    writeHead: (c: number) => ((code = c), res),
    setHeader: () => res,
    end: (s: string) => void (text = s)
  }
  const a = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await route(a)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}
const vorschau = vorschauRoute()

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'k.kurs', name: 'Kai Kurs', rolle: 'lehrkraft', quelle: 'test' })
  andere = nutzerAnlegen({ benutzer: 'a.andere', name: 'Ada Andere', rolle: 'lehrkraft', quelle: 'test' })
  mia = nutzerAnlegen({ benutzer: 'mia.probe', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
  g.a7 = gruppeAnlegen(lk.id, '7a', 'Englisch', [mia.benutzer])
  k.klasse = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: g.a7, schueler: [], titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter })
  k.spontan = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: '', schueler: [], titel: 'AG Englisch', sprache: 'en', fach: 'Englisch', woerter, gaeste: true })
  k.fremd = vokabelnZuweisen({ lehrkraftId: andere.id, lerngruppeId: '', schueler: [], titel: 'Fremd', sprache: 'en', fach: 'Englisch', woerter, gaeste: true })
})

describe('Ziel der Vorschau', () => {
  it('erlaubt nur die Startseite und Freigaben der eigenen Lehrkraft', () => {
    expect(vorschauZielPruefen(undefined, lk.id)).toBe('/s/')
    expect(vorschauZielPruefen('', lk.id)).toBe('/s/')
    expect(vorschauZielPruefen('/s/', lk.id)).toBe('/s/')
    expect(vorschauZielPruefen(`/s/v/${k.klasse}`, lk.id)).toBe(`/s/v/${k.klasse}`)
    expect(vorschauZielPruefen(`/s/v/${k.fremd}`, lk.id)).toBeNull()
    expect(vorschauZielPruefen('/s/v/gibtsnicht', lk.id)).toBeNull()
    for (const boese of ['https://boese.example/s/', '//boese.example', '/s/../server/x', `/s/v/${k.klasse}?x=1`, '/s/x/abc', '/server/vokabeln', 42])
      expect(vorschauZielPruefen(boese, lk.id)).toBeNull()
  })
  it('Klassen-Vorschau mit Ziel: Adresse führt auf den Kurs, fremde Ziele werden abgelehnt', async () => {
    const r = await rufe(vorschau, lk, 'POST', `/server/klassen/${g.a7}/vorschau`, { zustand: 'neu', ziel: `/s/v/${k.klasse}` })
    expect(r.code).toBe(200)
    expect(r.d.adresse).toContain(`&ziel=${encodeURIComponent(`/s/v/${k.klasse}`)}`)
    const ohne = await rufe(vorschau, lk, 'POST', `/server/klassen/${g.a7}/vorschau`, { zustand: 'neu' })
    expect(ohne.code).toBe(200)
    expect(ohne.d.adresse).not.toContain('ziel=')
    expect((await rufe(vorschau, lk, 'POST', `/server/klassen/${g.a7}/vorschau`, { ziel: `/s/v/${k.fremd}` })).code).toBe(400)
    expect((await rufe(vorschau, lk, 'POST', `/server/klassen/${g.a7}/vorschau`, { ziel: 'https://boese.example' })).code).toBe(400)
  })
})

describe('Vorschau eines Kurses aus Sprachenlernen', () => {
  it('Kurs einer Klasse: Vorschaukonto der Klasse, Fenster gleich auf dem Kurs', async () => {
    const r = await rufe(vorschau, lk, 'POST', `/server/vorschau/kurs/${k.klasse}`, { zustand: 'fleissig' })
    expect(r.code).toBe(200)
    expect(r.d.klasse).toBe('7a')
    expect(r.d.ziel).toBe(`/s/v/${k.klasse}`)
    const konto = kontoZumSchluessel(String(r.d.schluessel), lk)!
    expect(konto.id).toBe(vorschauKonto(lk.id, '7a').id)
    expect(vokIstFuer(zeile(k.klasse)!, konto)).toBe(true)
  })
  it('spontane Gruppe: Vorschaukonto „Sprachenlernen" tritt wie ein Gast bei – auch nach dem Zurücksetzen', async () => {
    const r = await rufe(vorschau, lk, 'POST', `/server/vorschau/kurs/${k.spontan}`, { zustand: 'erfolgreich' })
    expect(r.code).toBe(200)
    expect(r.d.klasse).toBe(KURS_VORSCHAU_KLASSE)
    expect(r.d.adresse).toContain(`&ziel=${encodeURIComponent(`/s/v/${k.spontan}`)}`)
    const konto = kontoZumSchluessel(String(r.d.schluessel), lk)!
    expect(konto.quelle).toBe('vorschau')
    expect(vokIstFuer(zeile(k.spontan)!, konto)).toBe(true)
    expect(vokabelListenFuer(konto).map((v) => v.id)).toContain(k.spontan)
    // Beispiel-Lernstand auch für den gerade beigetretenen Kurs
    expect(datenbank().prepare('SELECT 1 FROM vok_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(k.spontan, konto.id)).toBeTruthy()
    // Zurücksetzen aus dem Streifen: Lernstand weg, Kurs bleibt sichtbar
    const z = await rufe(vorschau, lk, 'POST', '/server/vorschau/zuruecksetzen', { schluessel: r.d.schluessel, zustand: 'neu' })
    expect(z.code).toBe(200)
    expect(datenbank().prepare('SELECT 1 FROM vok_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(k.spontan, konto.id)).toBeFalsy()
    expect(vokIstFuer(zeile(k.spontan)!, konto)).toBe(true)
    // „Stand behalten" öffnet dasselbe Konto ohne neuen Beitritt
    const b = await rufe(vorschau, lk, 'POST', `/server/vorschau/kurs/${k.spontan}`, {})
    expect(kontoZumSchluessel(String(b.d.schluessel), lk)!.id).toBe(konto.id)
  })
  it('das Vorschaukonto zählt nie: nicht in den Lernenden, Codes oder der Kursansicht der Lehrkraft', async () => {
    const konto = vorschauKonto(lk.id, KURS_VORSCHAU_KLASSE)
    for (const id of [k.spontan, k.klasse]) {
      expect(lernendeVon(zeile(id)!).some((n) => n.id === konto.id || n.quelle === 'vorschau')).toBe(false)
      const kurs = await rufe(vokabelRoute('http://x'), lk, 'GET', `/server/vokabeln/${id}`)
      expect(kurs.code).toBe(200)
      const lernende = kurs.d.lernende as { id: string; name: string }[]
      expect(lernende.some((l) => l.name === 'Musterschüler')).toBe(false)
    }
    const kurs = await rufe(vokabelRoute('http://x'), lk, 'GET', `/server/vokabeln/${k.klasse}`)
    expect((kurs.d.lernende as { id: string }[]).map((l) => l.id)).toEqual([mia.id])
  })
  it('nur eigene Kurse und nur für Lehrkräfte', async () => {
    expect((await rufe(vorschau, lk, 'POST', `/server/vorschau/kurs/${k.fremd}`, { zustand: 'neu' })).code).toBe(404)
    expect((await rufe(vorschau, lk, 'POST', '/server/vorschau/kurs/gibtsnicht', { zustand: 'neu' })).code).toBe(404)
    expect((await rufe(vorschau, mia, 'POST', `/server/vorschau/kurs/${k.spontan}`, { zustand: 'neu' })).code).toBe(403)
    // Kein Beitritt zum fremden Kurs
    expect(datenbank().prepare('SELECT 1 FROM vok_gaeste WHERE zuweisung_id = ?').get(k.fremd)).toBeFalsy()
  })
})
