import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { klassenKurseSichern, vokabelnZuweisen, vokabelRoute } from '../src/server/vokabeln'
import { bekannteGrammatikFuer, lehrwerkAutomatisch, lehrwerkDerGrammatik } from '../src/server/grammatik'
import type { Anfrage } from '../src/server/http'

/*
 * Lehrwerk-Erkennung und Klassenkurse (09.10.2026, abgestimmt):
 *  - Klasse 10 am Gymnasium (G9) → „Green Line 6", ohne Unit; Vokabeln aus Band 5 zur Wiederholung verschieben nichts.
 *  - Bekannt = frühere Bände ganz + Freigegebenes des aktuellen Bands.
 *  - Kurse fester Klassen lassen sich nicht beenden oder löschen (nur spontane Gruppen).
 */
let lk: NutzerInfo
let ben: NutzerInfo
let kurs10a = ''
let g10a = ''

const gruppeAnlegen = (lehrkraftId: string, name: string, fach: string, mitglieder: string[]): string => {
  lerngruppenVon(lehrkraftId)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrkraftId, name, fach, '', JSON.stringify(mitglieder), new Date().toISOString())
  return id
}

async function rufe(n: NutzerInfo, pfad: string, koerper: Record<string, unknown> = {}): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = {
    writeHead: (c: number) => ((code = c), res),
    setHeader: () => res,
    end: (s: string) => void (text = s)
  }
  const k = {
    req: { method: 'POST', headers: { 'x-schulapps-token': 'probe' }, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await vokabelRoute('http://x')(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'k.band', name: 'Kai Band', rolle: 'lehrkraft', quelle: 'test' })
  ben = nutzerAnlegen({ benutzer: 'ben.probe', name: 'Ben Probe', rolle: 'schueler', quelle: 'lokal' })
  g10a = gruppeAnlegen(lk.id, '10a', 'Englisch', [ben.benutzer])
  klassenKurseSichern(lk.id)
  kurs10a = (datenbank().prepare('SELECT id FROM vok_zuweisungen WHERE lerngruppe_id = ?').get(g10a) as { id: string }).id
})

describe('Lehrwerk-Band einer Klasse', () => {
  it('ohne Vokabeln aus einem Lehrwerk: keine Reihe, also nichts erkannt', () => {
    expect(lehrwerkAutomatisch(g10a)).toBeNull()
  })
  it('Wiederholung aus Band 5 in Klasse 10: erkannt wird Band 6 – ohne Unit; bekannt ist Band 5, nicht Band 6', async () => {
    const r = await rufe(lk, `/server/vokabeln/${kurs10a}/woerter`, {
      titel: 'Green Line 5 - Unit 2 - Station 3',
      woerter: [{ id: 'b0-0', term: 'will have done', translation: 'wird getan haben' }],
      quelle: { lehrwerk: 'green-line-5', unit: 'Unit 2', abschnitte: ['Station 3'] }
    })
    expect(r.code).toBe(200)
    const auto = lehrwerkAutomatisch(g10a)
    expect(auto).toMatchObject({ buch: 'Green Line 6', grund: 'jahrgang' })
    const bekannt = bekannteGrammatikFuer(ben)
    expect(bekannt).toContain('en.verb.future_perfect')
    expect(bekannt).not.toContain('en.verb.future_present')
  })
  it('Freigegebenes aus Band 6 kommt dazu', async () => {
    const r = await rufe(lk, `/server/vokabeln/${kurs10a}/woerter`, {
      titel: 'Green Line 6 - Unit 1 - Station 3',
      woerter: [{ id: 'b0-0', term: 'timetable', translation: 'Fahrplan' }],
      quelle: { lehrwerk: 'green-line-6', unit: 'Unit 1', abschnitte: ['Station 3'] }
    })
    expect(r.code).toBe(200)
    expect(lehrwerkAutomatisch(g10a)?.buch).toBe('Green Line 6')
    expect(bekannteGrammatikFuer(ben)).toContain('en.verb.future_present')
    // Danach noch einmal Wiederholung aus Band 5: der Band bleibt
    await rufe(lk, `/server/vokabeln/${kurs10a}/woerter`, {
      titel: 'Green Line 5 - Unit 1 - Station 2',
      woerter: [{ id: 'b0-0', term: 'either … or', translation: 'entweder … oder' }],
      quelle: { lehrwerk: 'green-line-5', unit: 'Unit 1', abschnitte: ['Station 2'] }
    })
    expect(lehrwerkAutomatisch(g10a)?.buch).toBe('Green Line 6')
  })
  it('Grammatik ohne Lehrwerk-Angabe ordnet der Katalog ein (erste Einführung)', () => {
    const z = { info: JSON.stringify({ themen: ['en.verb.future_present'], teilformen: [] }) } as unknown as Parameters<typeof lehrwerkDerGrammatik>[0]
    // Zukunft mit Präsensformen: zuerst im (optionalen) Trailer 1 von Band 4 – Trailer zählen nur, wenn sonst nichts passt
    expect(lehrwerkDerGrammatik(z)).toEqual({ buch: 'Green Line 6', unit: 'Unit 1' })
    const mitLw = { info: JSON.stringify({ themen: [], teilformen: [], lehrwerk: { buch: 'green-line-2', unit: 'Unit 3' } }) } as unknown as Parameters<typeof lehrwerkDerGrammatik>[0]
    expect(lehrwerkDerGrammatik(mitLw)).toEqual({ buch: 'Green Line 2', unit: 'Unit 3' })
  })
})

describe('Kurse fester Klassen', () => {
  it('lassen sich weder beenden noch löschen – spontane Gruppen schon', async () => {
    const ende = await rufe(lk, `/server/vokabeln/${kurs10a}/status`, { status: 'beendet' })
    expect(ende.code).toBe(400)
    expect(String(ende.d.fehler)).toMatch(/festen Klasse/)
    const weg = await rufe(lk, `/server/vokabeln/${kurs10a}/loeschen`, {})
    expect(weg.code).toBe(400)
    expect(datenbank().prepare('SELECT 1 FROM vok_zuweisungen WHERE id = ?').get(kurs10a)).toBeTruthy()
    // Wieder öffnen bleibt erlaubt
    expect((await rufe(lk, `/server/vokabeln/${kurs10a}/status`, { status: 'offen' })).code).toBe(200)
    // Spontane Gruppe (QR-Code)
    const qr = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: '', schueler: [], titel: 'QR', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'a', term: 'a', translation: 'b' }], gaeste: true })
    expect((await rufe(lk, `/server/vokabeln/${qr}/status`, { status: 'beendet' })).code).toBe(200)
    expect((await rufe(lk, `/server/vokabeln/${qr}/loeschen`, {})).code).toBe(200)
  })
  it('ausdrücklich (Aufräumen) bzw. ohne Lerngruppe geht es', async () => {
    expect((await rufe(lk, `/server/vokabeln/${kurs10a}/loeschen`, { klassenkurs: true })).code).toBe(200)
  })
})
