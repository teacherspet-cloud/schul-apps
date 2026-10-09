import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Anfrage } from '../src/server/http'
import type { NutzerInfo } from '../src/server/datenbank'

/*
 * „Mit IServ abgleichen" (09.10.2026): IServ-Konten, die es in IServ nicht mehr gibt, entfernen – gegen einen
 * nachgebauten IServ (Discovery, client_credentials-Token, IDM-API mit Seiten). Nie gegen den echten IServ.
 * Dazu: Suche in der Nutzerverwaltung und das Löschverbot für einzelne IServ-Konten.
 */

// Datenordner nur für diesen Test (Sicherung vor dem Abgleich) – vor dem Laden der Server-Module setzen
const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-abgleich-'))
process.env.SCHULAPPS_DATEN = ORDNER

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const db = await import('../src/server/datenbank')
const ab = await import('../src/server/iservAbgleich')
const { iservKennungAus } = await import('../src/server/anmeldung')
const { verwaltungsRoute } = await import('../src/server/verwaltung')
const { nutzerSuchen } = await import('../src/shared/nutzerSuche')

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

const AUSSTELLER = 'https://iserv.test'

interface Fake {
  konten: Record<string, unknown>[]
  art: 'hydra' | 'liste'
  proSeite: number
  tokenFehler?: { status: number; error: string }
  listeStatus?: number
  fremdeNaechste?: boolean
  anfragen: { url: string; init?: RequestInit }[]
}

function fakeIserv(konten: Record<string, unknown>[], mehr: Partial<Fake> = {}): Fake & { abruf: typeof fetch } {
  const f: Fake = { konten, art: 'hydra', proSeite: 2, anfragen: [], ...mehr }
  const abruf = (async (eingabe: string | URL, init?: RequestInit) => {
    const url = String(eingabe)
    f.anfragen.push({ url, init })
    if (url === `${AUSSTELLER}/.well-known/openid-configuration`)
      return new Response(
        JSON.stringify({
          issuer: AUSSTELLER,
          authorization_endpoint: `${AUSSTELLER}/iserv/auth/auth`,
          token_endpoint: `${AUSSTELLER}/iserv/auth/public/token`,
          userinfo_endpoint: `${AUSSTELLER}/iserv/auth/userinfo`,
          token_endpoint_auth_methods_supported: ['client_secret_post']
        })
      )
    if (url === `${AUSSTELLER}/iserv/auth/public/token`) {
      if (f.tokenFehler) return new Response(JSON.stringify({ error: f.tokenFehler.error }), { status: f.tokenFehler.status })
      return new Response(JSON.stringify({ access_token: 'app-token', token_type: 'Bearer', scope: 'iserv:idm:api-read' }))
    }
    const u = new URL(url)
    if (u.origin === AUSSTELLER && u.pathname === '/iserv/idm/api/v1/users') {
      if (f.listeStatus) return new Response('{}', { status: f.listeStatus })
      const kopf = (init?.headers ?? {}) as Record<string, string>
      if (kopf.authorization !== 'Bearer app-token') return new Response('{}', { status: 401 })
      const seite = Number(u.searchParams.get('page') ?? '1')
      const teil = f.konten.slice((seite - 1) * f.proSeite, seite * f.proSeite)
      if (f.art === 'liste') return new Response(JSON.stringify(teil))
      const letzte = Math.max(1, Math.ceil(f.konten.length / f.proSeite))
      const naechste = seite < letzte ? (f.fremdeNaechste ? `https://boese.test/iserv/idm/api/v1/users?page=${seite + 1}` : `/iserv/idm/api/v1/users?page=${seite + 1}`) : undefined
      return new Response(
        JSON.stringify({
          'hydra:member': teil,
          'hydra:totalItems': f.konten.length,
          'hydra:view': { '@id': `/iserv/idm/api/v1/users?page=${seite}`, ...(naechste ? { 'hydra:next': naechste } : {}) }
        })
      )
    }
    return new Response('nicht gefunden', { status: 404 })
  }) as typeof fetch
  return Object.assign(f, { abruf })
}

const iservKonto = (user: string, uuid = `uuid-${user}`, deleted = false): Record<string, unknown> => ({ uuid, user, firstname: 'X', lastname: 'Y', deleted })

function einrichten(): void {
  setzeSchluesselFuerTests(randomBytes(32))
  db.datenbankFuerTests()
  db.setzeServerWert('iserv', { aussteller: AUSSTELLER, clientId: 'cid', scopes: 'openid profile' })
  db.setzeServerGeheimnis('iserv-client', 'g+eh/eim')
}

describe('IServ-Benutzerliste über die IDM-API (nachgebaut)', () => {
  beforeAll(einrichten)

  it('holt ein Token per client_credentials (client_secret_post, Scope iserv:idm:api-read) und blättert über hydra:next', async () => {
    const f = fakeIserv([iservKonto('a.eins'), iservKonto('b.zwei'), iservKonto('c.drei'), iservKonto('d.vier', 'uuid-d', true), iservKonto('E.Fuenf')])
    const konten = await ab.iservKontenLaden(f.abruf)
    expect(konten.map((k) => k.benutzer)).toEqual(['a.eins', 'b.zwei', 'c.drei', 'e.fuenf'])
    const token = f.anfragen.find((a) => a.url.endsWith('/token'))!
    const form = new URLSearchParams(String(token.init?.body))
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('scope')).toBe('iserv:idm:api-read')
    expect(form.get('client_secret')).toBe('g+eh/eim')
    expect((token.init?.headers as Record<string, string>).authorization).toBeUndefined()
    expect(f.anfragen.filter((a) => a.url.includes('/idm/api/v1/users')).length).toBe(3)
  })

  it('blättert bei einer schlichten Liste mit ?page=, bis eine Seite leer ist', async () => {
    const f = fakeIserv([iservKonto('a.eins'), iservKonto('b.zwei'), iservKonto('c.drei')], { art: 'liste' })
    expect((await ab.iservKontenLaden(f.abruf)).length).toBe(3)
    expect(f.anfragen.filter((a) => a.url.includes('/idm/api/v1/users')).map((a) => new URL(a.url).searchParams.get('page'))).toEqual(['1', '2', '3'])
  })

  it('schickt das Token nie an eine fremde Adresse', async () => {
    const f = fakeIserv([iservKonto('a.eins'), iservKonto('b.zwei'), iservKonto('c.drei')], { fremdeNaechste: true })
    await expect(ab.iservKontenLaden(f.abruf)).rejects.toThrow(/fremde Adresse/)
    expect(f.anfragen.some((a) => a.url.startsWith('https://boese.test'))).toBe(false)
  })

  it('nennt den fehlenden Scope, wenn IServ ihn nicht freigibt', async () => {
    const f = fakeIserv([], { tokenFehler: { status: 400, error: 'invalid_scope' } })
    await expect(ab.iservKontenLaden(f.abruf)).rejects.toThrow(/iserv:idm:api-read.*Client Credentials/)
    const g = fakeIserv([iservKonto('a.eins')], { listeStatus: 403 })
    await expect(ab.iservKontenLaden(g.abruf)).rejects.toThrow(/iserv:idm:api-read/)
    const h = fakeIserv([iservKonto('a.eins')], { listeStatus: 500 })
    await expect(ab.iservKontenLaden(h.abruf)).rejects.toThrow(/nicht geliefert \(500\)/)
  })
})

describe('Abgleich planen (rein)', () => {
  const konto = (benutzer: string, mehr: Partial<NutzerInfo> = {}): NutzerInfo => ({
    id: `id-${benutzer}`,
    benutzer,
    name: benutzer,
    rolle: 'lehrkraft',
    quelle: 'iserv',
    gesperrt: false,
    eingerichtet: true,
    gruppen: [],
    erstellt: '',
    zuletzt: null,
    hatPasswort: false,
    passwortWechseln: false,
    ...mehr
  })
  const nutzer = [
    konto('a.da'),
    konto('b.weg'),
    konto('c.umbenannt'),
    konto('t.kornahrens', { rolle: 'admin' }),
    konto('x.admin', { rolle: 'admin' }),
    konto('ich.selbst'),
    konto('test.1', { quelle: 'test' }),
    konto('m.passwort', { quelle: 'lokal' }),
    ...Array.from({ length: 12 }, (_, i) => konto(`s.da${i}`, { rolle: 'schueler' }))
  ]
  const iserv = [{ uuid: 'u-a', benutzer: 'a.da' }, { uuid: 'u-c', benutzer: 'c.neu' }, ...Array.from({ length: 12 }, (_, i) => ({ uuid: `u-s${i}`, benutzer: `s.da${i}` }))]
  const kennungen = new Map([['id-c.umbenannt', 'u-c']])

  it('findet Konten über die Kennung oder den Benutzernamen und schützt Admins, das eigene Konto und Konten ohne IServ', () => {
    const p = ab.abgleichPlanen(nutzer, kennungen, iserv, 'id-ich.selbst', 20)
    expect(p.abbruch).toBeUndefined()
    expect(p.entfernen.map((x) => x.benutzer)).toEqual(['b.weg'])
    expect(p.geprueft).toBe(18)
  })

  it('bricht ab bei 0 Konten aus IServ und bei mehr als der Schwelle', () => {
    expect(ab.abgleichPlanen(nutzer, kennungen, [], 'id-ich.selbst', 20).abbruch).toMatch(/keine Konten/)
    const wenige = ab.abgleichPlanen(nutzer, kennungen, iserv.slice(0, 5), 'id-ich.selbst', 20)
    expect(wenige.abbruch).toMatch(/mehr als 20 %/)
    // Genau an der Grenze geht es noch: 1 von 5 = 20 %
    const fuenf = [konto('a'), konto('b'), konto('c'), konto('d'), konto('e')]
    const vier = ['a', 'b', 'c', 'd'].map((b) => ({ uuid: '', benutzer: b }))
    expect(ab.abgleichPlanen(fuenf, new Map(), vier, 'x', 20).abbruch).toBeUndefined()
    expect(ab.abgleichPlanen(fuenf, new Map(), vier.slice(0, 3), 'x', 20).abbruch).toMatch(/mehr als 20 %/)
  })
})

describe('Kennung des IServ-Kontos bei der Anmeldung', () => {
  beforeAll(einrichten)
  it('nimmt iserv:uuid vor uuid vor sub und speichert sie verschlüsselt', () => {
    expect(iservKennungAus({ sub: 'S', uuid: 'U', 'iserv:uuid': 'IU' })).toBe('iu')
    expect(iservKennungAus({ sub: 'Sub-1' })).toBe('sub-1')
    expect(iservKennungAus({})).toBe('')
    const n = db.nutzerAnlegen({ benutzer: 'k.kennung', name: 'Kim Kennung', rolle: 'lehrkraft', quelle: 'iserv' })
    db.nutzerAendern(n.id, { iservSub: 'abc-123' })
    expect(db.iservKennungen().get(n.id)).toBe('abc-123')
  })
})

describe('Verwaltung: Suche, Löschverbot und Abgleich in zwei Schritten', () => {
  let admin: NutzerInfo
  const ids: Record<string, string> = {}

  async function rufe(pfad: string, koerper: Record<string, unknown> = {}): Promise<{ code: number; d: Record<string, unknown> }> {
    let code = 0
    let text = ''
    const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
    const k = {
      req: { method: 'POST', headers: { 'x-schulapps-token': 'probe' }, socket: {} },
      res,
      url: new URL(`http://x${pfad}`),
      sitzung: { nutzer: admin, kennung: 'probe' },
      ip: '',
      koerper: async () => koerper
    } as unknown as Anfrage
    await verwaltungsRoute(k)
    return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
  }

  let fake: ReturnType<typeof fakeIserv>
  const alleIserv = (): Record<string, unknown>[] => [
    iservKonto('t.kornahrens'),
    ...Array.from({ length: 10 }, (_, i) => iservKonto(`l.lehrer${i}`)),
    iservKonto('s.schueler')
  ]

  beforeEach(() => {
    einrichten()
    admin = db.nutzerAnlegen({ benutzer: 't.kornahrens', name: 'Admin', rolle: 'admin', quelle: 'iserv' })
    for (let i = 0; i < 10; i++) ids[`l${i}`] = db.nutzerAnlegen({ benutzer: `l.lehrer${i}`, name: `Lehrer ${i}`, rolle: 'lehrkraft', quelle: 'iserv' }).id
    ids.schueler = db.nutzerAnlegen({ benutzer: 's.schueler', name: 'Sam Schüler', rolle: 'schueler', quelle: 'iserv' }).id
    ids.wegL = db.nutzerAnlegen({ benutzer: 'w.weg', name: 'Wanda Weg', rolle: 'lehrkraft', quelle: 'iserv' }).id
    ids.wegS = db.nutzerAnlegen({ benutzer: 'v.verzogen', name: 'Vera Verzogen', rolle: 'schueler', quelle: 'iserv' }).id
    ids.test = db.nutzerAnlegen({ benutzer: 'test.1', name: 'Testkonto', rolle: 'lehrkraft', quelle: 'test' }).id
    ids.lokal = db.nutzerAnlegen({ benutzer: 'p.passwort', name: 'Pia Passwort', rolle: 'schueler', quelle: 'lokal' }).id
    ids.vorschau = db.nutzerAnlegen({ benutzer: 'vorschau-x', name: 'Vorschau', rolle: 'schueler', quelle: 'vorschau' }).id
    ids.adminZwei = db.nutzerAnlegen({ benutzer: 'z.zweitadmin', name: 'Zweiter Admin', rolle: 'admin', quelle: 'iserv' }).id
    fake = fakeIserv(alleIserv())
    vi.stubGlobal('fetch', fake.abruf)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sucht ab 2 Zeichen nach Name, Benutzername, Rolle und Anmeldeart, höchstens 50 Treffer', () => {
    const alle = db.alleNutzer().map((n) => ({ ...n, klasse: '' }))
    expect(nutzerSuchen(alle, 'w').gesamt).toBe(0)
    expect(nutzerSuchen(alle, 'wanda').treffer.map((n) => n.benutzer)).toEqual(['w.weg'])
    expect(nutzerSuchen(alle, 'Schüler').treffer.map((n) => n.benutzer).sort()).toEqual(['p.passwort', 's.schueler', 'v.verzogen'])
    expect(nutzerSuchen(alle, 'schueler passwort').treffer.map((n) => n.benutzer)).toEqual(['p.passwort'])
    expect(nutzerSuchen(alle, 'testkonto').treffer.map((n) => n.benutzer)).toEqual(['test.1'])
    const viele = Array.from({ length: 80 }, (_, i) => ({ benutzer: `m.m${i}`, name: 'Max', rolle: 'lehrkraft', quelle: 'iserv' }))
    const r = nutzerSuchen(viele, 'max')
    expect(r.treffer.length).toBe(50)
    expect(r.gesamt).toBe(80)
  })

  it('lehnt das Löschen einzelner IServ-Konten ab, andere Konten gehen weiter', async () => {
    const a = await rufe('/server/verwaltung/nutzer-loeschen', { id: ids.wegL })
    expect(a.code).toBe(400)
    expect(String(a.d.fehler)).toMatch(/IServ/)
    expect(db.nutzerNachId(ids.wegL)).not.toBeNull()
    expect((await rufe('/server/verwaltung/nutzer-loeschen', { id: ids.test })).code).toBe(200)
    expect(db.nutzerNachId(ids.test)).toBeNull()
  })

  it('Prüfen zeigt nur – Entfernen braucht Bestätigung und Kennung, prüft erneut und sichert vorher', async () => {
    const p = await rufe('/server/verwaltung/iserv-abgleich-pruefen', {})
    expect(p.code).toBe(200)
    const entfernen = p.d.entfernen as { id: string; name: string; zuletzt: string | null }[]
    expect(entfernen.map((x) => x.name).sort()).toEqual(['Vera Verzogen', 'Wanda Weg'])
    expect(p.d.geprueft).toBe(15)
    expect(typeof p.d.kennung).toBe('string')
    // Nichts gelöscht
    expect(db.nutzerNachId(ids.wegL)).not.toBeNull()
    expect(db.nutzerNachId(ids.wegS)).not.toBeNull()
    // Ohne Bestätigung oder mit falscher Kennung: nichts
    expect((await rufe('/server/verwaltung/iserv-abgleich-entfernen', { kennung: p.d.kennung })).code).toBe(400)
    expect((await rufe('/server/verwaltung/iserv-abgleich-entfernen', { kennung: 'falsch', bestaetigt: true })).code).toBe(409)
    expect(db.nutzerNachId(ids.wegL)).not.toBeNull()
    // Eine alte Sicherung liegt schon da – danach bleibt nur die neue
    writeFileSync(join(ORDNER, 'sicherung-vor-iserv-abgleich-alt.db'), 'alt')
    // Zwischen Prüfen und Entfernen taucht Wanda wieder in IServ auf: sie bleibt
    fake.konten.push(iservKonto('w.weg'))
    const e = await rufe('/server/verwaltung/iserv-abgleich-entfernen', { kennung: p.d.kennung, bestaetigt: true })
    expect(e.code).toBe(200)
    expect(e.d.entfernt).toBe(1)
    expect(db.nutzerNachId(ids.wegS)).toBeNull()
    expect(db.nutzerNachId(ids.wegL)).not.toBeNull()
    // Alle anderen bleiben: Admins, Konten ohne IServ, Vorschau
    for (const k of ['test', 'lokal', 'vorschau', 'adminZwei', 'schueler', 'l0']) expect(db.nutzerNachId(ids[k])).not.toBeNull()
    expect(db.nutzerNachId(admin.id)).not.toBeNull()
    // Sicherung: genau eine
    const sicherungen = readdirSync(ORDNER).filter((f) => f.startsWith('sicherung-vor-iserv-abgleich-'))
    expect(sicherungen).toEqual([e.d.sicherung])
    expect(existsSync(join(ORDNER, String(e.d.sicherung)))).toBe(true)
    // Protokoll nur mit Zahlen
    const prot = db.leseServerProtokoll(20).map((z) => z.text).join('\n')
    expect(prot).toMatch(/IServ-Abgleich: 1 Konten entfernt/)
    expect(prot).not.toMatch(/Vera|Verzogen|v\.verzogen|Wanda/)
    // Die Kennung gilt nur einmal
    expect((await rufe('/server/verwaltung/iserv-abgleich-entfernen', { kennung: p.d.kennung, bestaetigt: true })).code).toBe(409)
  })

  it('bricht ohne Löschen ab: mehr als 20 %, keine Konten, Fehler der API, fehlender Scope', async () => {
    fake.konten.splice(3)
    const viel = await rufe('/server/verwaltung/iserv-abgleich-pruefen', {})
    expect(viel.code).toBe(200)
    expect(String(viel.d.abbruch)).toMatch(/mehr als 20 %/)
    expect(viel.d.kennung).toBe('')
    // Höhere Schwelle (einstellbar): dann ginge es
    const erlaubt = await rufe('/server/verwaltung/iserv-abgleich-pruefen', { schwelle: 100 })
    expect(erlaubt.d.abbruch).toBeUndefined()
    expect(db.serverWert('iserv-abgleich-schwelle', 0)).toBe(100)
    // … aber wird IServ vor dem Entfernen leer, passiert nichts
    fake.konten.splice(0)
    const leer = await rufe('/server/verwaltung/iserv-abgleich-entfernen', { kennung: erlaubt.d.kennung, bestaetigt: true })
    expect(leer.code).toBe(409)
    expect(String(leer.d.fehler)).toMatch(/keine Konten/)
    db.setzeServerWert('iserv-abgleich-schwelle', 20)
    fake.listeStatus = 500
    const fehler = await rufe('/server/verwaltung/iserv-abgleich-pruefen', {})
    expect(fehler.code).toBe(400)
    expect(String(fehler.d.fehler)).toMatch(/500/)
    fake.listeStatus = undefined
    fake.tokenFehler = { status: 400, error: 'invalid_scope' }
    const scope = await rufe('/server/verwaltung/iserv-abgleich-pruefen', {})
    expect(scope.code).toBe(400)
    expect(String(scope.d.fehler)).toMatch(/iserv:idm:api-read/)
    expect(db.alleNutzer(true).length).toBe(18)
  })

  it('Gastkonto mit IServ-Anmeldung: fehlt die Person in IServ, wird nur die Verknüpfung gelöst – Konto und Code bleiben', async () => {
    const { verknuepfen, alleVerknuepfungen } = await import('../src/server/kontoVerknuepfung')
    const jil = db.nutzerAnlegen({ benutzer: 'gast-jil', name: 'Jil V.', rolle: 'schueler', quelle: 'gast' })
    const jan = db.nutzerAnlegen({ benutzer: 'gast-jan', name: 'Jan V.', rolle: 'schueler', quelle: 'gast' })
    verknuepfen(jil.id, { benutzer: 'jil.von.bargen', sub: 'uuid-jil' })
    verknuepfen(jan.id, { benutzer: 'jan.alt', sub: 'uuid-s.schueler' }) // über die Kennung gefunden
    const p = await rufe('/server/verwaltung/iserv-abgleich-pruefen', {})
    expect(p.code).toBe(200)
    expect((p.d.loesen as { id: string }[]).map((x) => x.id)).toEqual([jil.id])
    expect(p.d.verknuepft).toBe(2)
    const e = await rufe('/server/verwaltung/iserv-abgleich-entfernen', { kennung: p.d.kennung, bestaetigt: true })
    expect(e.code).toBe(200)
    expect(e.d.geloest).toBe(1)
    expect(db.nutzerNachId(jil.id)).toMatchObject({ quelle: 'gast', name: 'Jil V.' })
    expect(alleVerknuepfungen().map((v) => v.nutzerId)).toEqual([jan.id])
  })
})
