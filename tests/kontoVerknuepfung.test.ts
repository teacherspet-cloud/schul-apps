import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import {
  datenbank,
  datenbankFuerTests,
  nutzerAnlegen,
  nutzerLoeschen,
  nutzerNachBenutzer,
  nutzerNachId,
  setzeServerGeheimnis,
  setzeServerWert,
  type NutzerInfo
} from '../src/server/datenbank'
import { iservAnmeldeAdresse, iservRueckruf } from '../src/server/anmeldung'
import { lerngruppe, lerngruppenVon, onlinetestZuruecksetzen } from '../src/server/onlinetest'
import {
  alleVerknuepfungen,
  gastFuerIserv,
  klassenAus,
  namenVarianten,
  namePasst,
  verknuepfen,
  vorschlaegeFuer
} from '../src/server/kontoVerknuepfung'
import { kontoVerknuepfungRoute } from '../src/server/kontoVerknuepfungRoute'
import { abgleichPlanen } from '../src/server/iservAbgleich'
import type { Anfrage } from '../src/server/http'

/*
 * Gastkonto (Code/QR) ↔ IServ (09.10.2026): erste IServ-Anmeldung landet im bisherigen Gastkonto der Klasse – eindeutig
 * automatisch, mehrdeutig oder ohne Klasse als Vorschlag an die Lehrkraft. Gegen einen nachgebauten IServ, nie den echten.
 */

const AUSSTELLER = 'https://iserv.test'
const RUECKRUF = 'https://app.test/auth/rueckruf'

/** Eine IServ-Anmeldung mit diesen Angaben durchspielen (Discovery, Token, id_token, userinfo – alles nachgebaut) */
async function iservAnmelden(claims: Record<string, unknown>): Promise<NutzerInfo> {
  let nonce = ''
  const abruf = (async (eingabe: string | URL) => {
    const url = String(eingabe)
    if (url.endsWith('/.well-known/openid-configuration'))
      return new Response(
        JSON.stringify({
          issuer: AUSSTELLER,
          authorization_endpoint: `${AUSSTELLER}/iserv/auth/auth`,
          token_endpoint: `${AUSSTELLER}/iserv/auth/public/token`,
          userinfo_endpoint: `${AUSSTELLER}/iserv/auth/userinfo`,
          token_endpoint_auth_methods_supported: ['client_secret_post']
        })
      )
    if (url.endsWith('/token')) {
      const idt = `x.${Buffer.from(JSON.stringify({ nonce, aud: 'cid', sub: claims.sub })).toString('base64url')}.y`
      return new Response(JSON.stringify({ access_token: 'a', id_token: idt }))
    }
    if (url.endsWith('/userinfo')) return new Response(JSON.stringify(claims))
    return new Response('', { status: 404 })
  }) as typeof fetch
  const { adresse, state } = await iservAnmeldeAdresse(RUECKRUF, '/', abruf)
  nonce = new URL(adresse).searchParams.get('nonce') ?? ''
  return (await iservRueckruf(RUECKRUF, state, 'code', abruf)).nutzer
}

const SCHUELER = { 'iserv:roles': [{ id: 'ROLE_STUDENT', displayName: 'Schüler' }] }
const KLASSE_10B = { 'iserv:groups': [{ act: 'klasse.10b', name: 'Klasse 10b' }] }

let lk: NutzerInfo
let fremdeLk: NutzerInfo
let gruppe10b = ''
let gruppe7a = ''

const gruppeAnlegen = (lehrkraftId: string, name: string, mitglieder: string[]): string => {
  lerngruppenVon(lehrkraftId)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrkraftId, name, 'Englisch', '', JSON.stringify(mitglieder), new Date().toISOString())
  return id
}
const gast = (benutzer: string, name: string): NutzerInfo => nutzerAnlegen({ benutzer, name, rolle: 'schueler', quelle: 'gast' })

beforeEach(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  onlinetestZuruecksetzen()
  setzeServerWert('iserv', { aussteller: AUSSTELLER, clientId: 'cid', scopes: 'openid profile email roles groups iserv:roles iserv:groups' })
  setzeServerGeheimnis('iserv-client', 'geheim')
  lk = nutzerAnlegen({ benutzer: 'k.klasse', name: 'Kai Klasse', rolle: 'lehrkraft', quelle: 'iserv' })
  fremdeLk = nutzerAnlegen({ benutzer: 'f.fremd', name: 'Fe Fremd', rolle: 'lehrkraft', quelle: 'iserv' })
  gast('gast-jil', 'Jil V.')
  gast('gast-jan', 'Jan V.')
  gast('gast-mia7', 'Jil V.') // gleicher Name, andere Klasse
  gruppe10b = gruppeAnlegen(lk.id, '10b', ['gast-jil', 'gast-jan'])
  gruppe7a = gruppeAnlegen(fremdeLk.id, '7a', ['gast-mia7'])
})

describe('Namen und Klassen vergleichen', () => {
  it('„Jil v." passt auf jil.von.bargen (Nachname samt „von"), Umlaute und Bindestriche egal', () => {
    expect(namePasst('Jil v.', namenVarianten({}, 'jil.von.bargen'))).toBe(true)
    expect(namePasst('Jil V.', namenVarianten({ given_name: 'Jil', family_name: 'von Bargen' }, 'x'))).toBe(true)
    expect(namePasst('Jil B.', namenVarianten({}, 'jil.von.bargen'))).toBe(false)
    expect(namePasst('Jülie M.', namenVarianten({}, 'juelie.mueller'))).toBe(true)
    expect(namePasst('Jülie Mü.', namenVarianten({}, 'juelie.mueller'))).toBe(true)
    expect(namePasst('Anna-Lena K.', namenVarianten({}, 'anna-lena.kraus'))).toBe(true)
    expect(namePasst('Anna K.', namenVarianten({}, 'anna-lena.kraus'))).toBe(true)
    expect(namePasst('Lena K.', namenVarianten({}, 'anna-lena.kraus'))).toBe(false)
  })
  it('erkennt die Klasse aus IServ-Gruppen', () => {
    expect(klassenAus([{ id: 'klasse.10b', name: 'Klasse 10b' }]).has('10b')).toBe(true)
    expect(klassenAus([{ id: 'x', name: '10b-englisch' }]).has('10b')).toBe(true)
  })
})

describe('Erste IServ-Anmeldung', () => {
  it('eindeutig in der Klasse: verbindet „Jil v." mit jil.von.bargen (10b) automatisch – ein Konto, zwei Wege', async () => {
    const jil = nutzerNachBenutzer('gast-jil')!
    const n = await iservAnmelden({ sub: 'UUID-JIL', preferred_username: 'jil.von.bargen', given_name: 'Jil', family_name: 'von Bargen', name: 'Jil von Bargen', ...SCHUELER, ...KLASSE_10B })
    expect(n.id).toBe(jil.id)
    expect(n.quelle).toBe('gast')
    // Kein zweites Konto, Name und Benutzer (Code-Anmeldung) des Gastes unverändert
    expect(nutzerNachBenutzer('jil.von.bargen')).toBeNull()
    expect(nutzerNachId(jil.id)).toMatchObject({ benutzer: 'gast-jil', name: 'Jil V.', quelle: 'gast' })
    expect(alleVerknuepfungen()).toEqual([{ nutzerId: jil.id, benutzer: 'jil.von.bargen', sub: 'uuid-jil' }])
    // Suchschlüssel ist ein HMAC, nicht der Benutzername
    expect(JSON.stringify(datenbank().prepare('SELECT benutzer_k FROM konto_iserv').all())).not.toContain('jil')
    // Zweite Anmeldung (auch nach Umbenennung in IServ, gleiche Kennung) → dasselbe Konto
    expect((await iservAnmelden({ sub: 'uuid-jil', preferred_username: 'jil.vonbargen', ...SCHUELER, ...KLASSE_10B })).id).toBe(jil.id)
    expect(gastFuerIserv({ benutzer: 'jil.vonbargen', sub: '' })?.id).toBe(jil.id)
    // Aufräumen von Freigaben löscht den verbundenen Gast nicht
    expect(nutzerLoeschen(jil.id)).toBe(false)
    expect(nutzerNachId(jil.id)).not.toBeNull()
  })

  it('nie für Lehrkräfte und nie an einen schon verbundenen Gast', async () => {
    const l = await iservAnmelden({ sub: 'u-l', preferred_username: 'j.vogel', given_name: 'Jil', family_name: 'Vogel', 'iserv:roles': ['ROLE_TEACHER'], ...KLASSE_10B })
    expect(l.quelle).toBe('iserv')
    expect(l.rolle).toBe('lehrkraft')
    const jil = nutzerNachBenutzer('gast-jil')!
    verknuepfen(jil.id, { benutzer: 'jil.von.bargen', sub: 'u-jil' })
    const zweite = await iservAnmelden({ sub: 'u-vogel', preferred_username: 'jil.vogel', ...SCHUELER, ...KLASSE_10B })
    expect(zweite.quelle).toBe('iserv')
    expect(zweite.id).not.toBe(jil.id)
    expect(vorschlaegeFuer(gruppe10b, lk.id)).toEqual([])
  })

  it('mehrdeutig: IServ-Konto + Vorschläge; Zusammenführen übernimmt die Daten (Gast gewinnt bei Doppeltem)', async () => {
    gast('gast-jil2', 'Jil V.')
    datenbank().prepare('UPDATE lerngruppen SET mitglieder = ? WHERE id = ?').run(JSON.stringify(['gast-jil', 'gast-jan', 'gast-jil2']), gruppe10b)
    const neu = await iservAnmelden({ sub: 'u-jil', preferred_username: 'jil.von.bargen', ...SCHUELER, ...KLASSE_10B })
    expect(neu.quelle).toBe('iserv')
    const v = vorschlaegeFuer(gruppe10b, lk.id)
    expect(v.map((x) => x.gastName)).toEqual(['Jil V.', 'Jil V.'])
    expect(vorschlaegeFuer(gruppe7a, fremdeLk.id)).toEqual([]) // andere Klasse: kein Vorschlag
    // Daten beider Konten (eigene Tabelle mit Fremdschlüssel wie vok_stand)
    datenbank().exec('CREATE TABLE IF NOT EXISTS probe_stand (schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE, teil TEXT NOT NULL, stand TEXT NOT NULL, PRIMARY KEY (schueler_id, teil))')
    const jil = nutzerNachBenutzer('gast-jil')!
    const st = datenbank().prepare('INSERT INTO probe_stand (schueler_id, teil, stand) VALUES (?, ?, ?)')
    st.run(jil.id, 'a', 'vom Gast')
    st.run(neu.id, 'a', 'vom IServ-Konto')
    st.run(neu.id, 'b', 'nur IServ-Konto')
    // Nur die Lehrkraft der Klasse
    expect((await rufe(fremdeLk, gruppe10b, 'iserv-zusammenfuehren', { iservId: neu.id, gastId: jil.id })).code).toBe(404)
    expect((await rufe(lk, gruppe10b, 'iserv-zusammenfuehren', { iservId: neu.id, gastId: jil.id })).code).toBe(200)
    expect(nutzerNachId(neu.id)).toBeNull()
    const zeilen = datenbank().prepare('SELECT teil, stand FROM probe_stand WHERE schueler_id = ? ORDER BY teil').all(jil.id)
    expect(zeilen).toEqual([
      { teil: 'a', stand: 'vom Gast' },
      { teil: 'b', stand: 'nur IServ-Konto' }
    ])
    expect(vorschlaegeFuer(gruppe10b, lk.id)).toEqual([])
    // Danach führt IServ ins Gastkonto
    expect((await iservAnmelden({ sub: 'u-jil', preferred_username: 'jil.von.bargen', ...SCHUELER, ...KLASSE_10B })).id).toBe(jil.id)
  })

  it('ohne Klassenangabe: nie automatisch, sondern Vorschlag; Ignorieren blendet ihn aus', async () => {
    const neu = await iservAnmelden({ sub: 'u-jan', preferred_username: 'jan.voss', ...SCHUELER })
    expect(neu.quelle).toBe('iserv')
    const v = vorschlaegeFuer(gruppe10b, lk.id)
    expect(v.map((x) => x.gastName)).toEqual(['Jan V.'])
    expect((await rufe(lk, gruppe10b, 'iserv-vorschlaege', {}, 'GET')).d.vorschlaege).toHaveLength(1)
    expect((await rufe(lk, gruppe10b, 'iserv-ignorieren', { iservId: neu.id, gastId: v[0].gastId })).code).toBe(200)
    expect(vorschlaegeFuer(gruppe10b, lk.id)).toEqual([])
    expect(nutzerNachId(neu.id)).not.toBeNull()
    expect(lerngruppe(gruppe10b)?.mitglieder).toEqual(['gast-jil', 'gast-jan'])
  })
})

describe('IServ-Abgleich mit verbundenen Gästen', () => {
  it('fehlt die Person in IServ, wird nur die Verknüpfung gelöst – das Konto bleibt', () => {
    const jil = nutzerNachBenutzer('gast-jil')!
    const p = abgleichPlanen(
      [lk, fremdeLk, jil],
      new Map(),
      [
        { uuid: '', benutzer: 'k.klasse' },
        { uuid: '', benutzer: 'f.fremd' },
        ...Array.from({ length: 10 }, (_, i) => ({ uuid: '', benutzer: `x${i}` }))
      ],
      lk.id,
      50,
      [{ nutzerId: jil.id, benutzer: 'jil.von.bargen', sub: 'u-jil' }]
    )
    expect(p.entfernen).toEqual([])
    expect(p.loesen.map((x) => x.id)).toEqual([jil.id])
  })
})

async function rufe(n: NutzerInfo, gruppeId: string, was: string, koerper: Record<string, unknown>, methode = 'POST'): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x/server/klassen/${gruppeId}/${was}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await kontoVerknuepfungRoute()(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}
