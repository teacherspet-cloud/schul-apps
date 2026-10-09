import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Anfrage } from '../src/server/http'
import type { NutzerInfo } from '../src/server/datenbank'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/types'
import { ersteSchulFachfarben, mitSchulFachfarben, ohneFachfarben, pruefeFachfarben } from '../src/shared/schulFachfarben'
import { FACH_VORSCHLAG, fachFarbeAus } from '../src/renderer/src/shared/fachfarben'

/*
 * Fachfarben der Schule (09.10.2026): Am Server legt die Verwaltung sie für alle fest; Farbe der Schule vor dem
 * Vorschlag des Katalogs, eigene Farben der Lehrkraft zählen dort nicht mehr; nur Admins schreiben; einmalige
 * Übernahme der Farben des Admins. In der Exe (ohne Quelle) bleibt alles beim Alten.
 */

const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-fachfarben-'))
process.env.SCHULAPPS_DATEN = join(ORDNER, 'daten')
const userData = join(ORDNER, 'nutzer')
vi.mock('electron', () => ({ app: { getPath: () => userData } }))

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const db = await import('../src/server/datenbank')
const { fachfarbenRoute, leseSchulFachfarben, uebernimmFachfarbenEinmal, speichereSchulFachfarben } = await import('../src/server/fachfarben')
const { fachfarbeDerLehrkraft } = await import('../src/server/vokabeln')
const einstellungen = await import('../src/main/services/storage/settings')
const { alsNutzer } = await import('../src/server/http')
const { imNutzer } = await import('../src/server/kontext')

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

const neu = (patch: Partial<AppSettings> = {}): AppSettings => ({ ...structuredClone(DEFAULT_SETTINGS), ...patch })

describe('Farbe der Schule vor dem Vorschlag', () => {
  it('Schule > Vorschlag; eigene Farben gelten mit Schulfarben nicht mehr', () => {
    const s = mitSchulFachfarben(neu({ fachfarben: { englisch: '#111111', deutsch: '#222222' } }), { englisch: '#aa0000' })
    expect(fachFarbeAus('englisch', s.fachfarben)).toBe('#aa0000')
    // Deutsch: die Schule hat nichts festgelegt → Vorschlag des Katalogs, nicht die eigene Farbe
    expect(fachFarbeAus('deutsch', s.fachfarben)).toBe(FACH_VORSCHLAG.deutsch)
  })
  it('ohne Schulfarben (Exe) bleiben die eigenen', () => {
    const s = mitSchulFachfarben(neu({ fachfarben: { englisch: '#111111' } }), null)
    expect(fachFarbeAus('englisch', s.fachfarben)).toBe('#111111')
  })
  it('Prüfen, Weglassen, Übernahme', () => {
    expect(pruefeFachfarben({ englisch: '#AABBCC', deutsch: '' })).toEqual({ farben: { englisch: '#aabbcc' } })
    expect(pruefeFachfarben({ englisch: 'rot' })).toEqual({ fehler: expect.any(String) })
    expect(pruefeFachfarben({ 'a b': '#000000' })).toEqual({ fehler: expect.any(String) })
    expect(pruefeFachfarben(null)).toEqual({ fehler: expect.any(String) })
    expect(ohneFachfarben({ fachfarben: { englisch: '#000000' }, schoolName: 'X' })).toEqual({ schoolName: 'X' })
    expect(ersteSchulFachfarben({ englisch: '#123456', deutsch: '', kunst: 'kaputt' })).toEqual({ englisch: '#123456' })
  })
})

describe('Server: Rechte, Übernahme, Einstellungen der Lehrkräfte', () => {
  let admin: NutzerInfo
  let lehrkraft: NutzerInfo
  let schueler: NutzerInfo

  beforeEach(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    db.datenbankFuerTests()
    admin = db.nutzerAnlegen({ benutzer: 'admin.probe', name: 'Admin', rolle: 'admin', quelle: 'test' })
    lehrkraft = db.nutzerAnlegen({ benutzer: 'lehrkraft.probe', name: 'Lehrkraft', rolle: 'lehrkraft', quelle: 'test' })
    schueler = db.nutzerAnlegen({ benutzer: 'schueler.probe', name: 'Kind', rolle: 'schueler', quelle: 'test' })
  })
  afterEach(() => einstellungen.setzeFachfarbenQuelle(null))

  async function rufe(nutzer: NutzerInfo, methode: string, koerper: unknown = {}): Promise<{ code: number; d: Record<string, unknown> }> {
    let code = 0
    let text = ''
    const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
    const k = {
      req: { method: methode, headers: { 'x-schulapps-token': 'probe' }, socket: {} },
      res,
      url: new URL('http://x/server/fachfarben'),
      sitzung: { nutzer, kennung: 'probe' },
      ip: '',
      koerper: async () => koerper
    } as unknown as Anfrage
    expect(await fachfarbenRoute(k)).toBe(true)
    return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
  }

  it('übernimmt einmal die eigenen Farben des Admins', () => {
    imNutzer(alsNutzer(admin), () => einstellungen.setSettings({ fachfarben: { englisch: '#0055aa' } }))
    expect(uebernimmFachfarbenEinmal()).toBe(true)
    expect(leseSchulFachfarben()).toEqual({ englisch: '#0055aa' })
    // Danach nicht mehr – auch wenn der Admin seine eigenen ändert
    imNutzer(alsNutzer(admin), () => einstellungen.setSettings({ fachfarben: { englisch: '#ffffff' } }))
    expect(uebernimmFachfarbenEinmal()).toBe(false)
    expect(leseSchulFachfarben()).toEqual({ englisch: '#0055aa' })
  })

  it('nur Admins schreiben, Lehrkräfte lesen, Lernende nicht', async () => {
    expect((await rufe(admin, 'POST', { farben: { englisch: '#cc0000' } })).code).toBe(200)
    expect((await rufe(lehrkraft, 'POST', { farben: { englisch: '#00cc00' } })).code).toBe(403)
    expect((await rufe(admin, 'POST', { farben: { englisch: 'grün' } })).code).toBe(400)
    const gelesen = await rufe(lehrkraft, 'GET')
    expect(gelesen.code).toBe(200)
    expect(gelesen.d.farben).toEqual({ englisch: '#cc0000' })
    expect((await rufe(schueler, 'GET')).code).toBe(403)
  })

  it('Einstellungen der Lehrkraft liefern die Farben der Schule; eigene Änderungen greifen nicht', async () => {
    speichereSchulFachfarben({ englisch: '#cc0000' })
    einstellungen.setzeFachfarbenQuelle(leseSchulFachfarben)
    const s = imNutzer(alsNutzer(lehrkraft), () => einstellungen.setSettings({ fachfarben: { englisch: '#00ff00', deutsch: '#00ff00' } }))
    expect(s.fachfarben).toEqual({ englisch: '#cc0000' })
    expect(imNutzer(alsNutzer(lehrkraft), () => einstellungen.getSettings()).fachfarben).toEqual({ englisch: '#cc0000' })
    // Fachordner und Vokabeltraining der Lernenden
    expect(await fachfarbeDerLehrkraft({ fach: 'englisch', lehrkraft_id: lehrkraft.id } as Parameters<typeof fachfarbeDerLehrkraft>[0])).toBe('#cc0000')
    expect(await fachfarbeDerLehrkraft({ fach: 'deutsch', lehrkraft_id: lehrkraft.id } as Parameters<typeof fachfarbeDerLehrkraft>[0])).toBe(FACH_VORSCHLAG.deutsch)
  })
})
