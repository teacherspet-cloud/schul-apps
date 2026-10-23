import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * Mitarbeitsnote mit Bewertungsspur (23.10.2026, Nachprüfung des Schulträgers): Die Lehrkraft legt die Note in der
 * Auswertung ausdrücklich fest („Note übernehmen / ändern"); jede Entscheidung kommt in die Spur – bestätigt (wie der
 * KI-Vorschlag), geändert (anders) oder lehrkraft (ohne Vorschlag). Ohne KI, ohne Netz.
 */
vi.mock('../src/server/druck', () => ({
  materialAusBlatt: async () => '',
  seitenMitTinte: async () => [],
  pdfOhneSkripte: async () => new Uint8Array()
}))

import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { blaetterRoute, mitarbeitQuelle } from '../src/server/arbeitsblaetter'
import { spurVon } from '../src/server/bewertungSpur'
import type { Anfrage, Aufruf } from '../src/server/http'

let lk: NutzerInfo
let fremd: NutzerInfo
let mia: NutzerInfo
let ben: NutzerInfo
let gruppe = ''
const aufruf: Aufruf = async () => undefined
const blaetter = blaetterRoute(aufruf, 'http://x')

async function rufe(n: NutzerInfo, methode: 'GET' | 'POST', pfad: string, koerper: Record<string, unknown> = {}): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, write: () => true, on: () => res, end: (s: string) => void (text = s) }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await blaetter(k)
  return { code, d: JSON.parse(text.trim() || '{}') as Record<string, unknown> }
}

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'l.note', name: 'Lea Note', rolle: 'lehrkraft', quelle: 'test' })
  fremd = nutzerAnlegen({ benutzer: 'l.fremd', name: 'Fritz Fremd', rolle: 'lehrkraft', quelle: 'test' })
  mia = nutzerAnlegen({ benutzer: 'mia.note', name: 'Mia Note', rolle: 'schueler', quelle: 'lokal' })
  ben = nutzerAnlegen({ benutzer: 'ben.note', name: 'Ben Note', rolle: 'schueler', quelle: 'lokal' })
  lerngruppenVon(lk.id)
  gruppe = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gruppe, lk.id, '7b', 'Deutsch', '', JSON.stringify([mia.benutzer, ben.benutzer]), new Date().toISOString())
})

describe('mitarbeitQuelle', () => {
  it('bestätigt, geändert, selbst festgelegt', () => {
    expect(mitarbeitQuelle('+', '+')).toBe('bestaetigt')
    expect(mitarbeitQuelle('+', '0')).toBe('geaendert')
    expect(mitarbeitQuelle(undefined, '--')).toBe('lehrkraft')
  })
})

describe('POST /server/blaetter/<id>/mitarbeit-note', () => {
  it('schreibt die Entscheidung in die Spur und speichert sie bei der Auswertung', async () => {
    const f = await rufe(lk, 'POST', '/server/blaetter/freigeben', {
      titel: 'Gedicht',
      html: '<div class="ws-page"><div class="ws-task"><span class="ws-task-num">1</span><p class="ws-task-instruction">Deute.</p></div></div>',
      aufgaben: [{ nr: 1, anweisung: 'Deute.', erwartung: 'x' }],
      rueckmeldung: {
        version: 1,
        meta: { title: 'G', subjectId: 'deutsch', subjectLabel: 'Deutsch', grade: 7, anrede: 'du', schwerpunkt: '' },
        grundlage: { art: 'frei', titel: 'G', aufgaben: 'Deute.', erwartung: 'x' },
        abgaben: [],
        createdAt: new Date().toISOString()
      },
      lerngruppeId: gruppe,
      schueler: [],
      einstellungen: { feedback: false }
    })
    expect(f.code).toBe(200)
    const id = String(f.d.id)
    // KI-Vorschlag für Mia liegt vor (wie nach „Mitarbeit einschätzen"), für Ben nicht
    datenbank()
      .prepare('UPDATE blatt_freigaben SET auswertung = ? WHERE id = ?')
      .run(JSON.stringify({ strenge: 'normal', zeit: 1, personen: { [mia.id]: { note: '+', begruendung: 'arbeitet mit', hilfen: [] } } }), id)

    expect((await rufe(lk, 'POST', `/server/blaetter/${id}/mitarbeit-note`, { schueler: mia.id, note: '+' })).code).toBe(200)
    expect((await rufe(lk, 'POST', `/server/blaetter/${id}/mitarbeit-note`, { schueler: mia.id, note: '0' })).code).toBe(200)
    const b = await rufe(lk, 'POST', `/server/blaetter/${id}/mitarbeit-note`, { schueler: ben.id, note: '-' })
    expect(b.code).toBe(200)

    const spurMia = spurVon({ lehrkraftId: lk.id, art: 'mitarbeit', bezugId: id, schuelerId: mia.id })
    expect(spurMia.map((x) => x.quelle)).toEqual(['bestaetigt', 'geaendert'])
    expect(spurMia[1].kiVorschlag).toMatchObject({ note: '+' })
    expect(spurMia[1].entscheidung).toEqual({ note: '0' })
    const spurBen = spurVon({ lehrkraftId: lk.id, art: 'mitarbeit', bezugId: id, schuelerId: ben.id })
    expect(spurBen.map((x) => x.quelle)).toEqual(['lehrkraft'])
    expect(spurBen[0].kiVorschlag).toBeUndefined()

    // Auswertung liefert die Entscheidung mit; der KI-Vorschlag bleibt daneben stehen
    const a = await rufe(lk, 'GET', `/server/blaetter/${id}/auswertung`)
    expect((a.d.entschieden as Record<string, { note: string; quelle: string }>)[mia.id]).toMatchObject({ note: '0', quelle: 'geaendert' })
    expect((a.d.mitarbeit as Record<string, { note: string }>)[mia.id].note).toBe('+')

    // Verlauf für die Lehrkraft
    const v = await rufe(lk, 'GET', `/server/blaetter/${id}/spur?schueler=${mia.id}`)
    expect((v.d.eintraege as unknown[]).length).toBe(2)

    // Ungültige Note, fremde Lehrkraft: nichts geschrieben
    expect((await rufe(lk, 'POST', `/server/blaetter/${id}/mitarbeit-note`, { schueler: mia.id, note: '1' })).code).toBe(400)
    expect((await rufe(fremd, 'POST', `/server/blaetter/${id}/mitarbeit-note`, { schueler: mia.id, note: '++' })).code).toBe(404)
    expect(spurVon({ lehrkraftId: lk.id, art: 'mitarbeit', bezugId: id, schuelerId: mia.id })).toHaveLength(2)
  })
})
