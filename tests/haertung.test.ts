import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Anfrage } from '../src/server/http'
import type { NutzerInfo } from '../src/server/datenbank'

/*
 * Härtung (23.10.2026, Prüfung des Schulträgers, Punkt 9): Sicherheits-Kopfzeilen, Notzugang standardmäßig aus,
 * Admin-Rollen in der Verwaltung, Bremse für unbekannte Codes.
 */
const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-haertung-'))
process.env.SCHULAPPS_DATEN = ORDNER

const { setzeSchluesselFuerTests, passwortHash } = await import('../src/server/geheim')
const db = await import('../src/server/datenbank')
const { notzugangAn, passwortAnmeldung, ADMIN_BENUTZER } = await import('../src/server/anmeldung')
const { adminAenderungPruefen, adminRollenRoute } = await import('../src/server/adminRollen')
const { verwaltungsRoute } = await import('../src/server/verwaltung')
const kp = await import('../src/server/sicherheitsKoepfe')
const cb = await import('../src/server/codeBremse')

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

describe('Sicherheits-Kopfzeilen', () => {
  it('HSTS nur über HTTPS, ein Jahr mit Subdomains, ohne preload', () => {
    const an = kp.allgemeineKoepfe(true)
    expect(an['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
    expect(an['strict-transport-security']).not.toContain('preload')
    expect(kp.allgemeineKoepfe(false)['strict-transport-security']).toBeUndefined()
    expect(kp.ueberHttps({ tls: { cert: 'a', key: 'b' }, adresse: 'http://localhost:1' })).toBe(true)
    expect(kp.ueberHttps({ adresse: 'https://www.meineschulapps.de' })).toBe(true)
    expect(kp.ueberHttps({ adresse: 'http://localhost:8443' })).toBe(false)
  })
  it('die bisherigen Kopfzeilen bleiben, dazu Permissions-Policy und CORP', () => {
    const k = kp.allgemeineKoepfe(false)
    expect(k['x-content-type-options']).toBe('nosniff')
    expect(k['x-frame-options']).toBe('SAMEORIGIN')
    expect(k['referrer-policy']).toBe('same-origin')
    expect(k['cross-origin-resource-policy']).toBe('same-site')
    const pp = k['permissions-policy']
    expect(pp).toContain('camera=(self)')
    expect(pp).toContain('microphone=(self)')
    expect(pp).toContain('geolocation=()')
    expect(pp).toContain('payment=()')
    expect(pp).toContain('usb=()')
  })
  it('Programmseite: CSP enger als das meta-Tag, COOP same-origin', () => {
    const k = kp.programmSeitenKoepfe()
    expect(k['cross-origin-opener-policy']).toBe('same-origin')
    const csp = Object.fromEntries(
      k['content-security-policy'].split(';').map((t) => {
        const [name, ...werte] = t.trim().split(/\s+/)
        return [name, werte]
      })
    ) as Record<string, string[]>
    expect(csp['frame-ancestors']).toEqual(["'self'"])
    expect(csp['script-src']).toEqual(["'self'"])
    expect(csp['img-src']).not.toContain('https:')
    expect(csp['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://api.openverse.org', 'https://upload.wikimedia.org', 'https://cdn.pixabay.com']))
    expect(csp['connect-src']).toContain('wss:')
    expect(csp['connect-src']).not.toContain('ws:')
    expect(csp['object-src']).toEqual(["'none'"])
  })
  it('das meta-Tag der Oberfläche bleibt (PC- und iPad-App laden die Seite lokal) und erlaubt alles, was die Kopfzeile erlaubt', () => {
    const html = readFileSync(join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8')
    const meta = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(meta).toContain("default-src 'self'")
    const metaTeile = Object.fromEntries(meta.split(';').map((t) => [t.trim().split(/\s+/)[0], t.trim().split(/\s+/).slice(1)])) as Record<string, string[]>
    for (const t of kp.APP_CSP.split(';')) {
      const [name, ...werte] = t.trim().split(/\s+/)
      const erlaubt = metaTeile[name] ?? metaTeile['default-src']
      if (!erlaubt || ['frame-ancestors', 'object-src', 'base-uri', 'form-action'].includes(name)) continue
      // Jede Quelle der Kopfzeile muss auch das meta-Tag zulassen (sonst bräche die Seite im Browser)
      for (const w of werte) expect(erlaubt.includes(w) || (w.startsWith('https://') && erlaubt.includes('https:')) || (w === 'wss:' && erlaubt.includes('ws:')), `${name} ${w}`).toBe(true)
    }
  })
})

describe('Notzugang', () => {
  let admin: NutzerInfo
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    db.datenbankFuerTests()
    admin = db.nutzerAnlegen({ benutzer: ADMIN_BENUTZER, name: 'Admin', rolle: 'admin', quelle: 'notzugang', passwortHash: passwortHash('geheim-passwort-1') })
  })
  afterEach(() => {
    delete process.env.SCHULAPPS_NOTZUGANG_ERZWINGEN
  })

  it('ist ohne Einstellung aus – die Anmeldung mit Passwort scheitert', async () => {
    expect(notzugangAn()).toBe(false)
    await expect(passwortAnmeldung(ADMIN_BENUTZER, 'geheim-passwort-1', '10.0.0.1')).rejects.toThrow(/stimmen nicht/)
  })
  it('geht an, wenn die Verwaltung ihn einschaltet (mit Protokolleintrag)', async () => {
    let code = 0
    const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: () => undefined }
    const k = {
      req: { method: 'POST', headers: { 'x-schulapps-token': 'probe' }, socket: {} },
      res,
      url: new URL('http://x/server/verwaltung/notzugang'),
      sitzung: { nutzer: admin, kennung: 'probe' },
      ip: '',
      koerper: async () => ({ an: true })
    } as unknown as Anfrage
    await verwaltungsRoute(k)
    expect(code).toBe(200)
    expect(notzugangAn()).toBe(true)
    expect(db.leseServerProtokoll(20).some((e) => /Notzugang an/.test(JSON.stringify(e)))).toBe(true)
    expect((await passwortAnmeldung(ADMIN_BENUTZER, 'geheim-passwort-1', '10.0.0.2')).id).toBe(admin.id)
    db.setzeServerWert('notzugang', false)
    expect(notzugangAn()).toBe(false)
  })
  it('SCHULAPPS_NOTZUGANG_ERZWINGEN=1 schaltet ihn auch gegen die Einstellung ein (Wiederherstellung, e2e)', async () => {
    db.setzeServerWert('notzugang', false)
    process.env.SCHULAPPS_NOTZUGANG_ERZWINGEN = '1'
    expect(notzugangAn()).toBe(true)
    expect((await passwortAnmeldung(ADMIN_BENUTZER, 'geheim-passwort-1', '10.0.0.3')).id).toBe(admin.id)
    process.env.SCHULAPPS_NOTZUGANG_ERZWINGEN = '0'
    expect(notzugangAn()).toBe(false)
  })
  it('Testkonten melden sich weiter mit Passwort an, auch wenn der Notzugang aus ist', async () => {
    db.nutzerAnlegen({ benutzer: 'test.1', name: 'Testkonto 1', rolle: 'lehrkraft', quelle: 'test', passwortHash: passwortHash('test-passwort-1') })
    expect(notzugangAn()).toBe(false)
    expect((await passwortAnmeldung('test.1', 'test-passwort-1', '10.0.0.4')).benutzer).toBe('test.1')
  })
})

describe('Admin-Rollen', () => {
  let fest: NutzerInfo
  let lk: NutzerInfo
  let lk2: NutzerInfo
  let sus: NutzerInfo

  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    db.datenbankFuerTests()
    fest = db.nutzerAnlegen({ benutzer: ADMIN_BENUTZER, name: 'Admin', rolle: 'admin', quelle: 'iserv' })
    lk = db.nutzerAnlegen({ benutzer: 'm.mueller', name: 'Maria Müller', rolle: 'lehrkraft', quelle: 'iserv' })
    lk2 = db.nutzerAnlegen({ benutzer: 'k.klein', name: 'Karl Klein', rolle: 'lehrkraft', quelle: 'lokal' })
    sus = db.nutzerAnlegen({ benutzer: 's.schmidt', name: 'Sam Schmidt', rolle: 'schueler', quelle: 'iserv' })
  })

  async function rufe(wer: NutzerInfo, pfad: string, koerper: Record<string, unknown> = {}, methode = 'POST'): Promise<{ code: number; d: Record<string, unknown> }> {
    let code = 0
    let text = ''
    const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
    const k = {
      req: { method: methode, headers: { 'x-schulapps-token': 'probe' }, socket: {} },
      res,
      url: new URL(`http://x${pfad}`),
      sitzung: { nutzer: db.nutzerNachId(wer.id)!, kennung: 'probe' },
      ip: '',
      koerper: async () => koerper
    } as unknown as Anfrage
    if (!(await adminRollenRoute(k))) await verwaltungsRoute(k)
    return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
  }
  const rolle = (n: NutzerInfo): string => db.nutzerNachId(n.id)!.rolle

  it('nur Admins sehen und ändern die Admin-Liste', async () => {
    expect((await rufe(lk, '/server/verwaltung/admins', {}, 'GET')).code).toBe(403)
    expect((await rufe(lk, '/server/verwaltung/admin-vergeben', { id: lk.id })).code).toBe(403)
    const r = await rufe(fest, '/server/verwaltung/admins', {}, 'GET')
    expect(r.code).toBe(200)
    expect((r.d.admins as { benutzer: string; fest: boolean }[]).map((a) => [a.benutzer, a.fest])).toEqual([[ADMIN_BENUTZER, true]])
    expect((r.d.lehrkraefte as { benutzer: string }[]).map((a) => a.benutzer).sort()).toEqual(['k.klein', 'm.mueller'])
  })
  it('vergibt die Admin-Rolle nur an Lehrkraft-Konten und protokolliert sie', async () => {
    expect((await rufe(fest, '/server/verwaltung/admin-vergeben', { id: sus.id })).code).toBe(400)
    expect(rolle(sus)).toBe('schueler')
    const r = await rufe(fest, '/server/verwaltung/admin-vergeben', { id: lk.id })
    expect(r.code).toBe(200)
    expect(rolle(lk)).toBe('admin')
    // Ohne Benutzernamen, nur mit Kennung (23.10.2026, Nachprüfung des Schulträgers)
    expect(db.leseServerProtokoll(20).some((e) => JSON.stringify(e).includes(`Admin-Rolle vergeben (Konto ${lk.id})`))).toBe(true)
    expect(db.leseServerProtokoll(20).some((e) => JSON.stringify(e).includes('m.mueller'))).toBe(false)
    // Der neue Admin darf die Verwaltung nutzen
    expect((await rufe(lk, '/server/verwaltung/admins', {}, 'GET')).code).toBe(200)
  })
  it('der fest eingetragene Admin bleibt Admin', async () => {
    const r = await rufe(lk, '/server/verwaltung/admin-entziehen', { id: fest.id })
    expect(r.code).toBe(400)
    expect(String(r.d.fehler)).toMatch(/fest eingetragen/)
    expect(rolle(fest)).toBe('admin')
    // auch nicht über „Konto geändert"
    expect((await rufe(lk, '/server/verwaltung/nutzer', { id: fest.id, rolle: 'lehrkraft' })).code).toBe(400)
    expect(rolle(fest)).toBe('admin')
  })
  it('entzieht weitere Admins, auch sich selbst – aber nie den letzten aktiven Admin', async () => {
    // Der feste Admin ist gesperrt: dann ist m.mueller der letzte aktive Admin
    db.nutzerAendern(fest.id, { gesperrt: true })
    const letzter = await rufe(lk, '/server/verwaltung/admin-entziehen', { id: lk.id })
    expect(letzter.code).toBe(400)
    expect(String(letzter.d.fehler)).toMatch(/letzte Admin/)
    expect(adminAenderungPruefen(db.nutzerNachId(lk.id)!, { gesperrt: true })).toMatch(/letzte Admin/)
    expect(rolle(lk)).toBe('admin')
    db.nutzerAendern(fest.id, { gesperrt: false })
    // Mit zwei aktiven Admins geht es – auch für das eigene Konto
    expect((await rufe(fest, '/server/verwaltung/admin-vergeben', { id: lk2.id })).code).toBe(200)
    expect((await rufe(lk2, '/server/verwaltung/admin-entziehen', { id: lk2.id })).code).toBe(200)
    expect(rolle(lk2)).toBe('lehrkraft')
    expect((await rufe(fest, '/server/verwaltung/admin-entziehen', { id: lk.id })).code).toBe(200)
    expect(rolle(lk)).toBe('lehrkraft')
    expect(db.leseServerProtokoll(30).some((e) => JSON.stringify(e).includes(`Admin-Rolle entzogen (Konto ${lk.id})`))).toBe(true)
  })
  it('„Konto geändert" macht kein Schülerkonto zum Admin', async () => {
    expect((await rufe(fest, '/server/verwaltung/nutzer', { id: sus.id, rolle: 'admin' })).code).toBe(400)
    expect(rolle(sus)).toBe('schueler')
  })
})

describe('Bremse für unbekannte Codes', () => {
  beforeEach(() => cb.codeBremseVergessen())

  function anfrage(pfad: string, ip: string, methode = 'GET'): { k: Anfrage; status: () => number; fertig: (status: number) => void } {
    let code = 0
    const auf: (() => void)[] = []
    const res = {
      statusCode: 200,
      writeHead: (c: number) => ((code = c), res),
      setHeader: () => res,
      end: () => undefined,
      on: (ereignis: string, f: () => void) => (ereignis === 'finish' && auf.push(f), res)
    }
    const k = { req: { method: methode, headers: {} }, res, url: new URL(`http://x${pfad}`), ip, sitzung: null } as unknown as Anfrage
    return {
      k,
      status: () => code,
      fertig: (s: number) => {
        res.statusCode = s
        for (const f of auf) f()
      }
    }
  }
  /** Eine Abfrage durchlaufen lassen: gesperrt → 429, sonst Antwort mit `status` */
  function frage(pfad: string, ip: string, status: number, methode = 'GET'): number {
    const a = anfrage(pfad, ip, methode)
    if (cb.codeBremseAnfrage(a.k)) return a.status()
    a.fertig(status)
    return status
  }

  it(`sperrt eine Adresse nach ${cb.CODE_MAX} verschiedenen unbekannten Codes für 10 Minuten`, () => {
    for (let i = 0; i < cb.CODE_MAX; i++) expect(frage(`/s/api/blatt/zugang?code=X${i}`, '1.2.3.4', 404)).toBe(404)
    // jetzt auch gültige Codes und andere Arten: 429
    expect(frage('/s/api/blatt/zugang?code=GUT', '1.2.3.4', 200)).toBe(429)
    expect(frage('/s/api/vokabeln/gast', '1.2.3.4', 200, 'POST')).toBe(429)
    // andere Adresse unberührt
    expect(frage('/s/api/blatt/zugang?code=GUT', '5.6.7.8', 200)).toBe(200)
    expect(cb.codeGesperrt('1.2.3.4', Date.now() + cb.CODE_SPERRE_MS + 1)).toBe(false)
  })
  it('zählt nur Fehlgriffe, je Code einmal – richtige Codes nie (Schul-NAT)', () => {
    for (let i = 0; i < 200; i++) frage('/s/api/aufgabe/zugang?code=RICHTIG', '9.9.9.9', 200)
    // derselbe falsche Code viele Male: zählt einmal
    for (let i = 0; i < 100; i++) frage('/s/api/reihe/zugang?code=TIPPFEHLER', '9.9.9.9', 404)
    expect(cb.codeGesperrt('9.9.9.9')).toBe(false)
  })
  it('„Mit Code öffnen" fragt alle Arten ab: gefunden bei einer späteren Art → kein Fehlgriff', () => {
    for (let i = 0; i < cb.CODE_MAX + 5; i++) {
      const code = `B${i}`
      // Aufgabe unbekannt, Arbeitsblatt gefunden
      frage(`/s/api/aufgabe/zugang?code=${code}`, '7.7.7.7', 404)
      frage(`/s/api/blatt/zugang?code=${code}`, '7.7.7.7', 200)
    }
    expect(cb.codeGesperrt('7.7.7.7')).toBe(false)
  })
  it('Onlinetest /s/api/zugang meldet selbst (immer 200, bekannt: false zählt)', () => {
    for (let i = 0; i < cb.CODE_MAX; i++) {
      expect(frage(`/s/api/zugang?code=T${i}`, '3.3.3.3', 200)).toBe(200)
      cb.codeErgebnis('3.3.3.3', `T${i}`, false)
    }
    expect(frage('/s/api/zugang?code=T0', '3.3.3.3', 200)).toBe(429)
  })
  it('Wiedereinstieg mit falschem persönlichem Code (403) zählt, andere Wege bleiben unberührt', () => {
    for (let i = 0; i < cb.CODE_MAX; i++) frage('/s/api/vokabeln/wieder', '4.4.4.4', 403, 'POST')
    expect(cb.codeGesperrt('4.4.4.4')).toBe(true)
    // kein Code-Weg: nie gebremst
    const a = anfrage('/s/api/tests', '4.4.4.4')
    expect(cb.codeBremseAnfrage(a.k)).toBe(false)
  })
})
