import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { entschluessle, passwortHash, passwortPruefen, setzeSchluesselFuerTests, verschluessle, zufallsPasswort } from '../src/server/geheim'
import { claimTexte, gruppenAus, LEHRKRAFT_MUSTER, rolleAus } from '../src/server/anmeldung'
import {
  datenbankFuerTests,
  nutzerAendern,
  nutzerAnlegen,
  serverGeheimnis,
  setzeServerGeheimnis,
  setzeServerWert,
  sitzungAnlegen,
  sitzungBeenden,
  sitzungPruefen
} from '../src/server/datenbank'
import { beschneideEinstellungen, SERVER_KANAELE } from '../src/server/freigaben'
import { freigegebenerSchluessel } from '../src/server/verwaltung'
import { imNutzer, aktuellerNutzer } from '../src/server/kontext'

/*
 * Schul-Apps-Server (02.10.2026): Verschlüsselung, Rollen aus IServ, Sitzungen, Freigaben.
 * Entscheidungen der Lehrkraft: nur Lehrkräfte (Rolle Lehrer + Format m.mustermann) und – für den
 * Onlinetest – Schülerinnen und Schüler; t.kornahrens ist Admin; Geheimnisse bleiben verschlüsselt.
 */
beforeEach(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
})

describe('Verschlüsselung', () => {
  it('AES-GCM: hin und zurück, jedes Mal anders, Manipulation fällt auf', () => {
    const a = verschluessle('sk-geheim')
    expect(a).not.toContain('sk-geheim')
    expect(verschluessle('sk-geheim')).not.toBe(a)
    expect(entschluessle(a)).toBe('sk-geheim')
    const kaputt = `v1:${Buffer.from(Buffer.from(a.slice(3), 'base64').map((b, i) => (i === 30 ? b ^ 1 : b))).toString('base64')}`
    expect(() => entschluessle(kaputt)).toThrow()
  })
  it('Passwörter nur als scrypt-Hash; Zufallspasswörter ohne verwechselbare Zeichen', () => {
    const h = passwortHash('richtig')
    expect(h).not.toContain('richtig')
    expect(passwortPruefen('richtig', h)).toBe(true)
    expect(passwortPruefen('falsch', h)).toBe(false)
    expect(zufallsPasswort()).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{14}$/)
  })
  it('Geheimnisse des Servers liegen verschlüsselt in der Datenbank', () => {
    setzeServerGeheimnis('iserv-client', 'abc123')
    expect(serverGeheimnis('iserv-client')).toBe('abc123')
  })
})

describe('Rollen aus IServ', () => {
  const lehrer = { roles: [{ id: 'ROLE_TEACHER', displayName: 'Lehrer' }] }
  it('Lehrkraft nur mit Rolle UND Benutzernamen im Format m.mustermann', () => {
    expect(rolleAus('m.mustermann', lehrer)).toBe('lehrkraft')
    expect(rolleAus('max.mustermann', lehrer)).toBeNull()
    expect(rolleAus('m.mustermann', { roles: ['Schüler'] })).toBe('schueler')
    expect(rolleAus('m.mustermann', {})).toBeNull()
    expect(LEHRKRAFT_MUSTER.test('a.meier-schulz')).toBe(true)
  })
  it('t.kornahrens ist Admin', () => {
    expect(rolleAus('t.kornahrens', { 'iserv:roles': ['Lehrer'] })).toBe('admin')
  })
  it('Claims als Texte oder Objekte; Gruppen mit Kennung und Name', () => {
    expect(claimTexte([{ id: 'x', displayName: 'Y' }, 'z'])).toEqual(['x', 'Y', 'z'])
    expect(gruppenAus({ 'iserv:groups': [{ act: '10a', name: 'Klasse 10a' }, 'fachschaft.englisch'] })).toEqual([
      { id: '10a', name: 'Klasse 10a' },
      { id: 'fachschaft.englisch', name: 'fachschaft.englisch' }
    ])
  })
})

describe('Sitzungen', () => {
  it('nur der Hash wird gespeichert; Abmelden beendet; gesperrt = keine Sitzung', () => {
    const n = nutzerAnlegen({ benutzer: 'm.mustermann', name: 'Max Mustermann', rolle: 'lehrkraft', quelle: 'iserv' })
    const s = sitzungAnlegen(n.id, n.rolle)
    expect(sitzungPruefen(s.cookie)?.nutzer.benutzer).toBe('m.mustermann')
    expect(sitzungPruefen(s.cookie + 'x')).toBeNull()
    nutzerAendern(n.id, { gesperrt: true })
    expect(sitzungPruefen(s.cookie)).toBeNull()
    nutzerAendern(n.id, { gesperrt: false })
    sitzungBeenden(s.cookie)
    expect(sitzungPruefen(s.cookie)).toBeNull()
  })
  it('Schüler-Sitzungen laufen nach 12 Stunden ab, Lehrkräfte nach 180 Tagen', () => {
    const l = nutzerAnlegen({ benutzer: 'a.b', name: 'A', rolle: 'lehrkraft', quelle: 'iserv' })
    const sch = nutzerAnlegen({ benutzer: 'kim.k', name: 'K', rolle: 'schueler', quelle: 'iserv' })
    expect(sitzungAnlegen(l.id, l.rolle).laeuftAb - Date.now()).toBeGreaterThan(170 * 864e5)
    expect(sitzungAnlegen(sch.id, sch.rolle).laeuftAb - Date.now()).toBeLessThanOrEqual(12 * 36e5)
  })
})

describe('Freigaben', () => {
  it('Programme starten, Netzzugang, Wartung, IServ-WebDAV und Dateien des Servers bleiben gesperrt', () => {
    for (const k of ['lan:start', 'wartung:zuruecksetzen', 'iserv:verbinden', 'iserv:laden', 'files:open', 'files:save', 'export:print', 'ai:install', 'paket:oeffnen'])
      expect(SERVER_KANAELE.has(k), k).toBe(false)
    for (const k of ['secrets:set', 'sheets:delete', 'ai:login-start', 'ai:structured', 'export:preview']) expect(SERVER_KANAELE.has(k), k).toBe(true)
  })
  it('Einstellungen: keine Programmpfade, kein Netzzugang, kein IServ, kein Zertifikat', () => {
    const r = beschneideEinstellungen({ schoolName: 'X', lan: { pin: '1' }, iserv: {}, ai: { cliPaths: { openai: 'C:/böse.exe' }, textProvider: 'openai' }, briefkopf: { zertifikat: 'x', ort: 'Y' } }) as Record<string, unknown>
    expect(r).toEqual({ schoolName: 'X', ai: { textProvider: 'openai' }, briefkopf: { ort: 'Y' } })
  })
  it('freigegebene Schlüssel nur, wenn der Admin sie für alle freigibt; Abos nie', () => {
    setzeServerGeheimnis('schluessel:openai', 'sk-admin')
    expect(freigegebenerSchluessel('openai')).toBeUndefined()
    setzeServerWert('freigaben', { openai: true })
    expect(freigegebenerSchluessel('openai')).toBe('sk-admin')
    expect(freigegebenerSchluessel('iserv')).toBeUndefined()
  })
})

describe('Nutzerkontext', () => {
  it('trägt den Nutzer durch await hindurch – und nur innerhalb', async () => {
    const n = { id: 'abcdef123456', benutzer: 'a.b', name: 'A', rolle: 'lehrkraft' as const, quelle: 'iserv' as const }
    const gesehen = await imNutzer(n, async () => {
      await new Promise((r) => setTimeout(r, 5))
      return aktuellerNutzer()?.benutzer
    })
    expect(gesehen).toBe('a.b')
    expect(aktuellerNutzer()).toBeUndefined()
  })
})
