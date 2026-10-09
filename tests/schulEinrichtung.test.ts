import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Anfrage } from '../src/server/http'
import type { NutzerInfo } from '../src/server/datenbank'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/types'
import {
  eigeneSchulwahl,
  mitSchulRueckfall,
  ohneSchuldaten,
  pruefeSchule,
  schulVorbelegung,
  vorSchulAenderung,
  type SchulEinrichtung
} from '../src/shared/schulEinrichtung'

/*
 * Schul-Einrichtung des Servers (09.10.2026): Prüfen und Speichern (nur Admin), Vorbelegen der Lehrkraft-Einstellungen
 * (nur Leeres) und der Rückfall auf Bundesland/Schulform der Schule, solange die Lehrkraft keine eigenen gewählt hat.
 */

const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-schule-'))
process.env.SCHULAPPS_DATEN = join(ORDNER, 'daten')
const userData = join(ORDNER, 'nutzer')
vi.mock('electron', () => ({ app: { getPath: () => userData } }))

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const db = await import('../src/server/datenbank')
const { leseSchule, leseSchulLogo, pruefeLogo, schuleRoute, setzeSchulLogo, speichereSchule } = await import('../src/server/schule')
const einstellungen = await import('../src/main/services/storage/settings')

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

const SCHULE: SchulEinrichtung = {
  name: 'Lessing-Gymnasium',
  stateId: 'HB',
  schulformen: ['gymnasium', 'oberschule'],
  strasse: 'Schulstraße 1',
  plz: '27568',
  ort: 'Bremerhaven',
  telefon: '0471 123456',
  email: 'sekretariat@lessing.de'
}
const neu = (patch: Partial<AppSettings> = {}): AppSettings => ({ ...structuredClone(DEFAULT_SETTINGS), ...patch })
// Kleinstes gültiges PNG (1×1)
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('Prüfen der Eingaben', () => {
  it('nimmt Gültiges bereinigt an', () => {
    const r = pruefeSchule({ ...SCHULE, name: '  Lessing-\nGymnasium  ', stateId: 'hb', schulformen: ['gymnasium', 'gymnasium', 'oberschule'] })
    expect('schule' in r && r.schule).toMatchObject({ name: 'Lessing- Gymnasium', stateId: 'HB', schulformen: ['gymnasium', 'oberschule'] })
  })
  it('lehnt Fehlendes und Ungültiges ab', () => {
    expect(pruefeSchule({ ...SCHULE, name: '' })).toEqual({ fehler: expect.stringMatching(/Namen/) })
    expect(pruefeSchule({ ...SCHULE, stateId: 'XX' })).toEqual({ fehler: expect.stringMatching(/Bundesland/) })
    expect(pruefeSchule({ ...SCHULE, schulformen: [] })).toEqual({ fehler: expect.stringMatching(/Schulform/) })
    // Werkrealschule gibt es in Bremen nicht
    expect(pruefeSchule({ ...SCHULE, schulformen: ['werkrealschule'] })).toEqual({ fehler: expect.stringMatching(/gibt es in diesem Bundesland nicht/) })
    expect(pruefeSchule({ ...SCHULE, plz: '1234' })).toEqual({ fehler: expect.stringMatching(/Postleitzahl/) })
    expect(pruefeSchule({ ...SCHULE, telefon: '0471<script>' })).toEqual({ fehler: expect.stringMatching(/Telefon/) })
    expect(pruefeSchule({ ...SCHULE, email: 'kein-at' })).toEqual({ fehler: expect.stringMatching(/E-Mail/) })
    expect(pruefeSchule(null)).toEqual({ fehler: expect.any(String) })
  })
  it('Logo: nur PNG, höchstens 1 MB', () => {
    expect(pruefeLogo(PNG)).toHaveProperty('daten')
    expect(pruefeLogo('data:image/jpeg;base64,AAAA')).toEqual({ fehler: expect.stringMatching(/PNG/) })
    expect(pruefeLogo(`data:image/png;base64,${Buffer.from('kein png, aber lang genug für den Kopf').toString('base64')}`)).toEqual({
      fehler: expect.stringMatching(/kein gültiges PNG/)
    })
    expect(pruefeLogo(`data:image/png;base64,${Buffer.alloc(1024 * 1024 + 10).toString('base64')}`)).toEqual({ fehler: expect.stringMatching(/zu groß/) })
  })
})

describe('Vorbelegen: nur Leeres wird gefüllt', () => {
  it('leere Einstellungen bekommen alles', () => {
    const p = schulVorbelegung(neu(), SCHULE)
    expect(p).toEqual({
      schoolName: 'Lessing-Gymnasium',
      defaults: { stateId: 'HB', schoolTypeId: 'gymnasium' },
      briefkopf: { strasse: 'Schulstraße 1', plz: '27568', ort: 'Bremerhaven', telefon: '0471 123456', email: 'sekretariat@lessing.de' }
    })
  })
  it('vorhandene Angaben bleiben', () => {
    const s = neu({ schoolName: 'Meine Schule', defaults: { ...DEFAULT_SETTINGS.defaults, stateId: 'BY', schoolTypeId: 'realschule' }, briefkopf: { ort: 'München', lehrkraft: 'Frau M.' } })
    const p = schulVorbelegung(s, SCHULE)
    expect(p?.schoolName).toBeUndefined()
    expect(p?.defaults).toBeUndefined()
    expect(p?.briefkopf).toMatchObject({ ort: 'München', lehrkraft: 'Frau M.', strasse: 'Schulstraße 1' })
    // Selbst gewählte Kombination ohne Schulnamen bleibt ebenso
    expect(schulVorbelegung(neu({ defaults: { ...DEFAULT_SETTINGS.defaults, stateId: 'BY', schoolTypeId: 'realschule' } }), SCHULE)?.defaults).toBeUndefined()
    expect(schulVorbelegung(neu({ schulwahlEigen: true }), SCHULE)?.defaults).toBeUndefined()
  })
  it('zweite Schulform der Schule bleibt, wenn sie schon steht', () => {
    expect(schulVorbelegung(neu({ defaults: { ...DEFAULT_SETTINGS.defaults, stateId: 'HB', schoolTypeId: 'oberschule' } }), SCHULE)?.defaults).toEqual({
      stateId: 'HB',
      schoolTypeId: 'oberschule'
    })
  })
  it('nichts zu tun: null; ohne Schule: null', () => {
    const voll = neu({ schoolName: 'X', briefkopf: { strasse: 'a', plz: '1', ort: 'b', telefon: '2', email: 'c' } })
    expect(schulVorbelegung(voll, SCHULE)).toBeNull()
    expect(schulVorbelegung(neu(), null)).toBeNull()
    expect(schulVorbelegung(neu(), { ...SCHULE, name: '' })).toBeNull()
  })
  it('ohneSchuldaten erkennt Lehrkräfte ohne Schulname und Anschrift', () => {
    expect(ohneSchuldaten(neu())).toBe(true)
    expect(ohneSchuldaten(neu({ briefkopf: { lehrkraft: 'Frau M.' } }))).toBe(true)
    expect(ohneSchuldaten(neu({ schoolName: 'X' }))).toBe(false)
    expect(ohneSchuldaten(neu({ briefkopf: { ort: 'Bremen' } }))).toBe(false)
  })
})

describe('Rückfall auf die Schule', () => {
  it('ohne eigene Wahl gelten Bundesland und erste Schulform der Schule', () => {
    expect(eigeneSchulwahl(neu())).toBe(false)
    expect(mitSchulRueckfall(neu(), SCHULE).defaults).toMatchObject({ stateId: 'HB', schoolTypeId: 'gymnasium' })
  })
  it('eigene Wahl geht vor', () => {
    for (const s of [
      neu({ schoolName: 'X' }),
      neu({ schulwahlEigen: true }),
      neu({ defaults: { ...DEFAULT_SETTINGS.defaults, stateId: 'BY' } })
    ])
      expect(mitSchulRueckfall(s, SCHULE).defaults.stateId).toBe(s.defaults.stateId)
  })
  it('ohne Schule bleibt alles', () => {
    expect(mitSchulRueckfall(neu(), null).defaults.stateId).toBe('NI')
  })
  it('erste eigene Schulangabe schreibt fest, was zu sehen war', () => {
    const vorher = vorSchulAenderung(neu(), { schoolName: 'Lessing' }, SCHULE)
    expect(vorher.defaults).toMatchObject({ stateId: 'HB', schoolTypeId: 'gymnasium' })
    expect(vorher.schulwahlEigen).toBe(true)
    // Andere Änderungen lassen alles unberührt
    expect(vorSchulAenderung(neu(), { showSchool: false }, SCHULE).schulwahlEigen).toBeUndefined()
  })
})

describe('Server: Speichern, Logo, Rechte und Rückfall in den Einstellungen', () => {
  let admin: NutzerInfo
  let lehrkraft: NutzerInfo
  let schueler: NutzerInfo

  beforeEach(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    db.datenbankFuerTests()
    admin = db.nutzerAnlegen({ benutzer: 'admin.probe', name: 'Admin', rolle: 'admin', quelle: 'test' })
    lehrkraft = db.nutzerAnlegen({ benutzer: 'lehrkraft.probe', name: 'Lehrkraft', rolle: 'lehrkraft', quelle: 'test' })
    schueler = db.nutzerAnlegen({ benutzer: 'schueler.probe', name: 'Kind', rolle: 'schueler', quelle: 'test' })
    setzeSchulLogo(null)
  })

  async function rufe(nutzer: NutzerInfo, methode: string, pfad: string, koerper: unknown = {}): Promise<{ code: number; d: Record<string, unknown> }> {
    let code = 0
    let text = ''
    const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
    const k = {
      req: { method: methode, headers: { 'x-schulapps-token': 'probe' }, socket: {} },
      res,
      url: new URL(`http://x${pfad}`),
      sitzung: { nutzer, kennung: 'probe' },
      ip: '',
      koerper: async () => koerper
    } as unknown as Anfrage
    expect(await schuleRoute(k)).toBe(true)
    return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
  }

  it('speichert geprüft in server_einstellungen, liest sie wieder', () => {
    expect(leseSchule()).toBeNull()
    expect(speichereSchule({ ...SCHULE, plz: 'abc' })).toEqual({ fehler: expect.any(String) })
    expect(leseSchule()).toBeNull()
    expect(speichereSchule(SCHULE)).toHaveProperty('schule')
    expect(leseSchule()).toMatchObject({ ...SCHULE, logo: false })
  })

  it('Logo als Datei; Entfernen löscht sie', () => {
    expect(setzeSchulLogo('data:image/gif;base64,AAAA')).toEqual({ fehler: expect.any(String) })
    expect(setzeSchulLogo(PNG)).toEqual({ ok: true })
    expect(leseSchulLogo()).toBe(PNG)
    expect(leseSchule()?.logo).toBe(true)
    // Ohne Namen gilt die Schule noch nicht als eingerichtet
    expect(leseSchule()?.name).toBe('')
    setzeSchulLogo(null)
    expect(leseSchulLogo()).toBeNull()
  })

  it('Lehrkräfte lesen, nur Admins ändern, Lernende sehen nichts', async () => {
    expect((await rufe(admin, 'POST', '/server/schule', SCHULE)).code).toBe(200)
    expect((await rufe(admin, 'POST', '/server/schule/logo', { logo: PNG })).code).toBe(200)
    const gelesen = await rufe(lehrkraft, 'GET', '/server/schule')
    expect(gelesen.code).toBe(200)
    expect(gelesen.d.schule).toMatchObject({ name: 'Lessing-Gymnasium', logo: true })
    expect(gelesen.d.logo).toBe(PNG)
    expect((await rufe(lehrkraft, 'POST', '/server/schule', { ...SCHULE, name: 'Andere' })).code).toBe(403)
    expect((await rufe(lehrkraft, 'POST', '/server/schule/logo', { logo: null })).code).toBe(403)
    expect((await rufe(schueler, 'GET', '/server/schule')).code).toBe(403)
    expect(leseSchule()?.name).toBe('Lessing-Gymnasium')
    const falsch = await rufe(admin, 'POST', '/server/schule', { ...SCHULE, email: 'x' })
    expect(falsch.code).toBe(400)
    expect(falsch.d.fehler).toMatch(/E-Mail/)
  })

  it('Einstellungen der Lehrkraft: Rückfall, ohne ihn zu speichern; erste eigene Angabe schreibt fest', () => {
    speichereSchule(SCHULE)
    einstellungen.setzeSchulRueckfall(leseSchule)
    try {
      rmSync(userData, { recursive: true, force: true })
      expect(einstellungen.getSettings().defaults).toMatchObject({ stateId: 'HB', schoolTypeId: 'gymnasium' })
      // Eine andere Änderung speichert den Rückfall nicht mit – ändert die Verwaltung die Schule, folgt die Lehrkraft
      einstellungen.setSettings({ showSchool: false })
      expect(einstellungen.readJson<AppSettings>('settings.json', DEFAULT_SETTINGS).defaults.stateId).toBe('NI')
      speichereSchule({ ...SCHULE, stateId: 'NI', schulformen: ['oberschule'] })
      expect(einstellungen.getSettings().defaults).toMatchObject({ stateId: 'NI', schoolTypeId: 'oberschule' })
      // Schulname eingetragen: Was zu sehen war, bleibt – auch wenn die Verwaltung später etwas anderes einträgt
      einstellungen.setSettings({ schoolName: 'Eigene Schule' })
      speichereSchule(SCHULE)
      expect(einstellungen.getSettings().defaults).toMatchObject({ stateId: 'NI', schoolTypeId: 'oberschule' })
      expect(einstellungen.getSettings().schulwahlEigen).toBe(true)
    } finally {
      einstellungen.setzeSchulRueckfall(null)
    }
  })
})
