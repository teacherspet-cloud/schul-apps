import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, nutzerNachBenutzer, setzeServerGeheimnis, setzeServerWert, type NutzerInfo } from '../src/server/datenbank'
import { anmeldeHaken, iservAnmeldeAdresse, iservRueckruf } from '../src/server/anmeldung'
import { lerngruppenVon, mitgliederVon, onlinetestZuruecksetzen, type Lerngruppe } from '../src/server/onlinetest'
import {
  ausgeblendeteKurse,
  erkanntVon,
  iservKursgruppenZuruecksetzen,
  kursAusblenden,
  kursEinblenden,
  kursInfoVon,
  kuerzelSetzen,
  linksVon,
  nachIservAnmeldung
} from '../src/server/iservKursgruppen'
import { verknuepfen } from '../src/server/kontoVerknuepfung'
import { db as vokDb } from '../src/server/vokabeln'
import { setzeSchulkalender } from '../src/shared/schulkalender'
import { leseKalenderDatei } from '../src/server/schulkalender'
import { hinweisFuer, nachsuchen, schuljahrPruefen, schuljahrWechselStarten } from '../src/server/schuljahrWechsel'

/*
 * Kurse aus IServ (10.10.2026): Anmeldung über einen nachgebauten IServ (nie den echten) mit Gruppen – die Lehrkraft
 * bekommt ihre Kurse als Lerngruppen mit genau den Lernenden der IServ-Gruppe, vorhandene werden verknüpft statt
 * verdoppelt, Ausgeblendetes entsteht nicht wieder, im neuen Schuljahr folgt der Kurs seiner Nachfolgegruppe.
 */

const AUSSTELLER = 'https://iserv.test'
const RUECKRUF = 'https://app.test/auth/rueckruf'

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

const SCHUELER = { 'iserv:roles': [{ id: 'ROLE_STUDENT' }] }
const LEHRER = { 'iserv:roles': [{ id: 'ROLE_TEACHER' }] }
const g = (name: string): { act: string; name: string } => ({ act: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name })
const lernende = (gruppe: Lerngruppe | undefined): string[] => (gruppe ? mitgliederVon(gruppe).map((n) => n.benutzer).sort() : [])
const nachName = (lk: NutzerInfo, name: string): Lerngruppe | undefined => lerngruppenVon(lk.id).find((x) => x.name === name)

const schueler = (benutzer: string, gruppen: string[]): Promise<NutzerInfo> =>
  iservAnmelden({ sub: `u-${benutzer}`, preferred_username: benutzer, name: benutzer, ...SCHUELER, 'iserv:groups': gruppen.map(g) })

let lk: NutzerInfo
const LK_GRUPPEN = ['Klasse 7b', 'FR 7 Kon', 'RE 7b/c Kon', 'EN 13 eA Kon', 'SN 7 Abc', 'Fachschaft Englisch']
const lehrkraftAnmelden = (gruppen = LK_GRUPPEN): Promise<NutzerInfo> =>
  iservAnmelden({ sub: 'u-kon', preferred_username: 't.kornahrens', name: 'T. Kornahrens', ...LEHRER, 'iserv:groups': gruppen.map(g) })

beforeAll(async () => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  onlinetestZuruecksetzen()
  iservKursgruppenZuruecksetzen()
  setzeServerWert('iserv', { aussteller: AUSSTELLER, clientId: 'cid', scopes: 'openid profile email roles groups iserv:roles iserv:groups' })
  setzeServerGeheimnis('iserv-client', 'geheim')
  anmeldeHaken.nachIserv = nachIservAnmeldung
  schuljahrWechselStarten()
  // Lernende melden sich zuerst an (bringen ihre Gruppen mit)
  await schueler('anna.a', ['Klasse 7b', 'FR 7 Kon', 'RE 7b/c Kon'])
  await schueler('ben.b', ['Klasse 7c', 'FR 7 Kon', 'WN 7 Abc'])
  await schueler('cem.c', ['Klasse 7b', 'SN 7 Abc', 'RE 7b/c Kon'])
  await schueler('dora.d', ['EN 13 eA Kon', 'DE 13 gA Xyz'])
  await schueler('emil.e', ['Klasse 7c', 'WN 7 Abc'])
})

describe('Anmeldung über IServ', () => {
  it('Lernende: Klasse und Kurse erkannt (verschlüsselt gespeichert)', () => {
    const a = erkanntVon(nutzerNachBenutzer('anna.a')!.id)!
    expect(a.klasse).toBe('7b')
    expect(a.kurse.map((k) => [k.fachId, k.jahrgang, k.kuerzel])).toEqual([
      ['franzoesisch', 7, 'Kon'],
      ['religion', 7, 'Kon']
    ])
    expect(erkanntVon(nutzerNachBenutzer('ben.b')!.id)!.kurse.map((k) => k.fachId)).toEqual(['franzoesisch', 'werte-und-normen'])
    // Gespeichert verschlüsselt (feldschutz.ts; „AS x" liest am Entschlüsseln vorbei)
    const roh = datenbank().prepare('SELECT daten AS x FROM iserv_erkannt').all() as { x: string }[]
    expect(roh.length).toBe(5)
    expect(roh.every((z) => String(z.x).startsWith('v1:'))).toBe(true)
  })

  it('Lehrkraft: eigene Kurse als Lerngruppen mit genau den Lernenden der IServ-Gruppe', async () => {
    lk = await lehrkraftAnmelden()
    const namen = lerngruppenVon(lk.id).map((x) => `${x.name}|${x.fach}`).sort()
    expect(namen).toEqual(['Englisch 13 eA (Kon)|Englisch', 'Französisch 7 (Kon)|Französisch', 'Religion 7b/c (Kon)|Religion'])
    expect(lernende(nachName(lk, 'Französisch 7 (Kon)'))).toEqual(['anna.a', 'ben.b'])
    expect(lernende(nachName(lk, 'Religion 7b/c (Kon)'))).toEqual(['anna.a', 'cem.c'])
    expect(lernende(nachName(lk, 'Englisch 13 eA (Kon)'))).toEqual(['dora.d'])
    expect(erkanntVon(lk.id)?.kuerzel).toBe('Kon')
    // Fremdsprache: Kurs in „Sprachenlernen" für die Kursgruppe
    const fr = nachName(lk, 'Französisch 7 (Kon)')!
    const kurse = vokDb().prepare('SELECT sprache FROM vok_zuweisungen WHERE lerngruppe_id = ?').all(fr.id) as { sprache: string }[]
    expect(kurse.map((k) => k.sprache)).toEqual(['fr'])
    // Erkannt-Angabe für „Meine Klassen"
    expect(kursInfoVon(lk.id).get(fr.id)).toMatchObject({ roh: 'FR 7 Kon', art: 'angelegt' })
    const links = datenbank().prepare('SELECT daten AS x FROM iserv_kursgruppen').all() as { x: string }[]
    expect(links.length).toBe(3)
    expect(links.every((z) => String(z.x).startsWith('v1:'))).toBe(true)
  })

  it('wer später kommt, ist gleich dabei; zweite Anmeldung legt nichts doppelt an', async () => {
    await schueler('fritz.f', ['Klasse 7d', 'FR 7 Kon'])
    expect(lernende(nachName(lk, 'Französisch 7 (Kon)'))).toEqual(['anna.a', 'ben.b', 'fritz.f'])
    await lehrkraftAnmelden()
    expect(lerngruppenVon(lk.id)).toHaveLength(3)
  })

  it('Gastkonto mit IServ-Anmeldung wird in seine Kurse eingetragen', async () => {
    const gast = nutzerAnlegen({ benutzer: 'gast-gina', name: 'Gina G.', rolle: 'schueler', quelle: 'gast' })
    verknuepfen(gast.id, { benutzer: 'gina.g', sub: 'u-gina.g' })
    await schueler('gina.g', ['Klasse 7b', 'FR 7 Kon'])
    expect(lernende(nachName(lk, 'Französisch 7 (Kon)'))).toContain('gast-gina')
    expect(lernende(nachName(lk, 'Religion 7b/c (Kon)'))).not.toContain('gast-gina')
  })

  it('vorhandene Lerngruppe (≥ 80 % gleiche Lernende) wird verknüpft, nicht verändert', async () => {
    const kollege = nutzerAnlegen({ benutzer: 'a.abel', name: 'A. Abel', rolle: 'lehrkraft', quelle: 'iserv' })
    lerngruppenVon(kollege.id)
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('wn-hand', kollege.id, 'Mein WN-Kurs', 'Werte und Normen', '', JSON.stringify(['ben.b', 'emil.e']), new Date().toISOString())
    await iservAnmelden({ sub: 'u-abel', preferred_username: 'a.abel', ...LEHRER, 'iserv:groups': ['SN 7 Abc', 'WN 7 Abc', 'FR 7 Kon'].map(g) })
    const gruppen = lerngruppenVon(kollege.id)
    expect(gruppen.map((x) => x.name).sort()).toEqual(['Mein WN-Kurs', 'Spanisch 7 (Abc)'])
    expect(gruppen.find((x) => x.id === 'wn-hand')).toMatchObject({ name: 'Mein WN-Kurs', iserv_gruppe: '', mitglieder: ['ben.b', 'emil.e'] })
    expect(linksVon(kollege.id).find((l) => l.lerngruppeId === 'wn-hand')).toMatchObject({ art: 'verknuepft', grund: 'mitglieder' })
    expect(lernende(gruppen.find((x) => x.name === 'Spanisch 7 (Abc)'))).toEqual(['cem.c'])
  })

  it('ausgeblendet bzw. gelöscht entsteht nicht wieder; einblenden holt es zurück', async () => {
    const en = nachName(lk, 'Englisch 13 eA (Kon)')!
    expect(kursAusblenden(lk.id, en.id, 0)).toBe('geloescht')
    await lehrkraftAnmelden()
    expect(nachName(lk, 'Englisch 13 eA (Kon)')).toBeUndefined()
    const aus = ausgeblendeteKurse(lk.id)
    expect(aus).toEqual([expect.objectContaining({ name: 'Englisch 13 eA (Kon)', roh: 'EN 13 eA Kon', geloescht: true })])
    expect(kursEinblenden(lk.id, aus[0].id)).toBe(true)
    expect(lernende(nachName(lk, 'Englisch 13 eA (Kon)'))).toEqual(['dora.d'])
    // Von Hand gelöschte Kursgruppe ebenso
    const re = nachName(lk, 'Religion 7b/c (Kon)')!
    datenbank().prepare('DELETE FROM lerngruppen WHERE id = ?').run(re.id)
    await lehrkraftAnmelden()
    expect(nachName(lk, 'Religion 7b/c (Kon)')).toBeUndefined()
  })

  it('eingestelltes Kürzel: fremde Kurse bleiben außen vor', async () => {
    kuerzelSetzen(lk.id, 'Abc')
    // Jetzt gilt „SN 7 Abc" als eigener Kurs
    expect(nachName(lk, 'Spanisch 7 (Abc)')).toBeDefined()
    expect(() => kuerzelSetzen(lk.id, 'K!')).toThrow()
    kuerzelSetzen(lk.id, '')
    expect(erkanntVon(lk.id)?.kuerzel).toBe('Kon')
  })
})

describe('Neues Schuljahr', () => {
  it('Kursgruppe wartet auf ihre IServ-Nachfolgegruppe und folgt ihr (Jahrgang + 1 im Namen), ohne Zwilling', async () => {
    setzeSchulkalender(leseKalenderDatei(join(__dirname, 'fixtures', 'openholidays-ni.json')))
    setzeServerWert('schule', { name: 'Testschule', stateId: 'NI', schulformen: ['gymnasium'], strasse: '', plz: '', ort: '', telefon: '', email: '' })
    const fr = nachName(lk, 'Französisch 7 (Kon)')!
    const kursId = (vokDb().prepare('SELECT id FROM vok_zuweisungen WHERE lerngruppe_id = ?').get(fr.id) as { id: string }).id
    expect(schuljahrPruefen('2026-10-10', { sichern: () => undefined, jetzt: Date.parse('2026-10-10T06:00:00Z') }).art).toBe('eingerichtet')
    const jetzt = Date.parse('2027-08-19T06:00:00Z')
    expect(schuljahrPruefen('2027-08-19', { sichern: () => undefined, jetzt }).art).toBe('gewechselt')
    expect(hinweisFuer(lk.id, jetzt)!.eintraege.find((e) => e.alt === 'Französisch 7 (Kon)')).toMatchObject({ art: 'wartet' })
    // Die Lehrkraft meldet sich zuerst mit der neuen Gruppe an: kein zweiter Kurs „Französisch 8"
    await lehrkraftAnmelden(['Klasse 8b', 'FR 8 Kon', 'EN 13 eA Kon'])
    expect(lerngruppenVon(lk.id).filter((x) => x.fach === 'Französisch')).toHaveLength(1)
    for (const b of ['anna.a', 'ben.b', 'fritz.f']) await schueler(b, ['Klasse 8b', 'FR 8 Kon'])
    expect(nachsuchen(jetzt + 864e5).gefunden).toBeGreaterThanOrEqual(1)
    const neu = lerngruppenVon(lk.id).find((x) => x.id === fr.id)!
    expect(neu).toMatchObject({ name: 'Französisch 8 (Kon)', iserv_gruppe: 'fr-8-kon' })
    expect(lernende(neu)).toEqual(['anna.a', 'ben.b', 'fritz.f', 'gast-gina'])
    // Kurs und Lernstand hängen weiter an derselben Lerngruppe
    expect((vokDb().prepare('SELECT lerngruppe_id FROM vok_zuweisungen WHERE id = ?').get(kursId) as { lerngruppe_id: string }).lerngruppe_id).toBe(fr.id)
    expect(linksVon(lk.id).find((l) => l.lerngruppeId === fr.id)).toMatchObject({ iservId: 'fr-8-kon', roh: 'FR 8 Kon' })
    // Erneute Anmeldung: weiter nur eine Französisch-Gruppe
    await lehrkraftAnmelden(['Klasse 8b', 'FR 8 Kon'])
    expect(lerngruppenVon(lk.id).filter((x) => x.fach === 'Französisch')).toHaveLength(1)
  })
})
