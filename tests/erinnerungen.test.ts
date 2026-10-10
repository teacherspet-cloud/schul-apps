import { createECDH, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ausloeserWaehlen,
  berlin,
  berlinMs,
  istRuhezeit,
  nachrichtFuer,
  naechsterTermin,
  nutzlast,
  serieVon,
  STANDARD_WAHL,
  TEXTE,
  textBereinigt,
  wahlBereinigt,
  type ErinnerungsLage,
  type ErinnerungsWahl
} from '../src/shared/erinnerungen'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbankFuerTests, nutzerAendern, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { vokabelRoute } from '../src/server/vokabeln'
import { aktiveZahl, bearbeiten, durchlauf, erinnerungenRoute, geraeteVon, lesen, schreiben, versand } from '../src/server/erinnerungen'
import { beimAbmelden, type Anfrage } from '../src/server/http'
import { b64u, pushEntschluesseln, pushSenden } from '../src/server/webPush'

/*
 * Erinnerungen zum Üben (10.10.2026): Zeitregeln (Ruhezeiten, höchstens eine am Tag, Wochenrückblick ersetzt die
 * tägliche, Wochenende/Ferien), Wahl des Auslösers, Texte ohne Namen, Geräte (Aufräumen bei 410, Abmelden) und der
 * Ablauf über die Routen der Lehrkraft und der Lernenden.
 */
const wahl = (teil: Partial<ErinnerungsWahl> = {}): ErinnerungsWahl => ({ ...STANDARD_WAHL, an: true, ...teil })
// Mittwoch, 14.10.2026 (Sommerzeit), Sonntag 18.10., Montag 26.10. (Winterzeit)
const MI = '2026-10-14'
const um = (tag: string, h: number, m = 0): number => berlinMs(tag, h * 60 + m)

describe('Zeit in Deutschland', () => {
  it('Tag, Wochentag und Uhrzeit hin und zurück – auch über die Zeitumstellung', () => {
    expect(berlin(um(MI, 16))).toEqual({ tag: MI, wochentag: 3, minuten: 960 })
    expect(new Date(um(MI, 16)).toISOString()).toBe('2026-10-14T14:00:00.000Z')
    expect(new Date(um('2026-10-26', 16)).toISOString()).toBe('2026-10-26T15:00:00.000Z')
    expect(berlin(um('2026-10-18', 17)).wochentag).toBe(7)
  })
  it('Ruhezeiten: Schulzeit Mo–Fr 7:30–14:00, vor 7:00 und ab 20:00', () => {
    expect(istRuhezeit(um(MI, 10))).toBe(true)
    expect(istRuhezeit(um(MI, 7, 15))).toBe(false)
    expect(istRuhezeit(um(MI, 14))).toBe(false)
    expect(istRuhezeit(um(MI, 20))).toBe(true)
    expect(istRuhezeit(um(MI, 6, 30))).toBe(true)
    expect(istRuhezeit(um('2026-10-17', 10))).toBe(false)
  })
})

describe('Nächster Termin', () => {
  it('Vorgabe 16:00, höchstens eine am Tag', () => {
    expect(naechsterTermin(wahl(), '', um(MI, 9))).toEqual({ ms: um(MI, 16), tag: MI, art: 'tag' })
    expect(naechsterTermin(wahl(), MI, um(MI, 9))?.tag).toBe('2026-10-15')
    expect(naechsterTermin(wahl({ an: false }), '', um(MI, 9))).toBeNull()
  })
  it('nie in der Schulzeit, nie ab 20:00, nie vor 7:00', () => {
    expect(naechsterTermin(wahl({ zeit: '09:00' }), '', um(MI, 6))?.ms).toBe(um(MI, 14))
    expect(naechsterTermin(wahl({ zeit: '07:00' }), '', um(MI, 6))?.ms).toBe(um(MI, 7))
    expect(naechsterTermin(wahl({ zeit: '21:30' }), '', um(MI, 6))?.ms).toBe(um(MI, 19, 30))
    expect(naechsterTermin(wahl({ zeit: '05:00' }), '', um('2026-10-17', 4))?.ms).toBe(um('2026-10-17', 7))
    // Samstag: keine Schule – 9:00 bleibt 9:00
    expect(naechsterTermin(wahl({ zeit: '09:00' }), '', um('2026-10-17', 6))?.ms).toBe(um('2026-10-17', 9))
  })
  it('verpasst (Neustart): kurz danach nachholen, später erst morgen – nie in die Schulzeit hinein', () => {
    expect(naechsterTermin(wahl(), '', um(MI, 17, 30))?.ms).toBe(um(MI, 17, 30))
    expect(naechsterTermin(wahl(), '', um(MI, 18, 30))?.ms).toBe(um('2026-10-15', 16))
    expect(naechsterTermin(wahl({ zeit: '07:00' }), '', um(MI, 7, 45))?.tag).toBe('2026-10-15')
  })
  it('Sonntag: Wochenrückblick um 17:00 statt der täglichen; ohne Rückblick die tägliche', () => {
    expect(naechsterTermin(wahl({ zeit: '10:00' }), '2026-10-17', um('2026-10-17', 20))).toEqual({ ms: um('2026-10-18', 17), tag: '2026-10-18', art: 'woche' })
    const ohne = wahl({ zeit: '10:00', ausloeser: { ...STANDARD_WAHL.ausloeser, woche: false } })
    expect(naechsterTermin(ohne, '2026-10-17', um('2026-10-17', 20))).toEqual({ ms: um('2026-10-18', 10), tag: '2026-10-18', art: 'tag' })
  })
  it('Wochenende abwählbar, Ferien-Pause (bis zu einem Tag)', () => {
    const werktags = wahl({ tage: [1, 2, 3, 4, 5] })
    expect(naechsterTermin(werktags, '2026-10-16', um('2026-10-16', 20))?.tag).toBe('2026-10-19')
    expect(naechsterTermin(wahl({ ferien: true, ferienBis: '2026-10-20' }), '', um(MI, 9))?.tag).toBe('2026-10-21')
    expect(naechsterTermin(wahl({ ferien: true }), '', um(MI, 9))).toBeNull()
    expect(naechsterTermin(wahl({ ausloeser: { tagesziel: false, serie: false, neu: false, woche: true } }), '', um(MI, 9))?.tag).toBe('2026-10-18')
  })
})

describe('Auslöser und Texte', () => {
  const lage = (teil: Partial<ErinnerungsLage> = {}): ErinnerungsLage => ({
    kurse: 1,
    heuteGeuebt: false,
    offen: 12,
    offenZiel: '/s/v/k1',
    serie: 0,
    neu: null,
    termin: null,
    woche: { tage: 3, abzeichen: 1, offen: 12 },
    ...teil
  })
  it('Reihenfolge: Serie in Gefahr, dann Neues, dann Tagesrunde; ohne angebotenen Kurs nichts', () => {
    expect(ausloeserWaehlen(wahl(), lage(), 'tag')).toBe('tagesziel')
    expect(ausloeserWaehlen(wahl(), lage({ serie: 4 }), 'tag')).toBe('serie')
    expect(ausloeserWaehlen(wahl(), lage({ serie: 4, heuteGeuebt: true }), 'tag')).toBe('tagesziel')
    expect(ausloeserWaehlen(wahl(), lage({ serie: 2 }), 'tag')).toBe('tagesziel')
    expect(ausloeserWaehlen(wahl(), lage({ neu: { art: 'vokabeln', ziel: '/s/v/k2' } }), 'tag')).toBe('neu')
    expect(ausloeserWaehlen(wahl(), lage({ termin: { ziel: '/s/v/k1', schluessel: 'k1:t:1', art: 'test' } }), 'tag')).toBe('neu')
    expect(ausloeserWaehlen(wahl(), lage({ offen: 0, heuteGeuebt: true }), 'tag')).toBeNull()
    expect(ausloeserWaehlen(wahl(), lage({ kurse: 0 }), 'tag')).toBeNull()
    expect(ausloeserWaehlen(wahl(), lage(), 'woche')).toBe('woche')
    expect(ausloeserWaehlen(wahl({ ausloeser: { ...STANDARD_WAHL.ausloeser, tagesziel: false } }), lage(), 'tag')).toBeNull()
  })
  it('Serie: Tage in Folge bis heute bzw. gestern', () => {
    expect(serieVon(['2026-10-11', '2026-10-12', '2026-10-13'], MI)).toBe(3)
    expect(serieVon(['2026-10-12', '2026-10-13', MI], MI)).toBe(3)
    expect(serieVon(['2026-10-11', '2026-10-13'], MI)).toBe(1)
    expect(serieVon([], MI)).toBe(0)
  })
  it('Texte: abwechselnd, freundlich, auf Deutsch und Englisch; Ziel nur im Schülerbereich', () => {
    const a = nachrichtFuer('tagesziel', wahl(), lage(), () => 0.0)
    const b = nachrichtFuer('tagesziel', wahl(), lage(), () => 0.0, a.nr)
    expect(a.text).not.toBe(b.text)
    expect(a.ziel).toBe('/s/v/k1')
    expect(nachrichtFuer('serie', wahl(), lage({ serie: 5 }), () => 0).text).toMatch(/5 Tage.*Tag 6/)
    const en = nachrichtFuer('tagesziel', wahl({ sprache: 'en' }), lage(), () => 0.3)
    expect(TEXTE.en.tagesziel.text.map((t) => t.replace('{n}', '12'))).toContain(en.text)
    expect(nachrichtFuer('woche', wahl(), lage(), () => 0).text).toMatch(/^Diese Woche: 3 Übungstage · 1 neues Abzeichen\. Für nächste Woche warten 12 Wörter\.$/)
    expect(nachrichtFuer('woche', wahl({ sprache: 'en' }), lage({ woche: { tage: 1, abzeichen: 0, offen: 0 } }), () => 0).text).toBe('This week: 1 day of practice. Well done!')
    expect(nachrichtFuer('neu', wahl(), lage({ neu: { art: 'grammatik', ziel: '/s/g/g1' } }), () => 0).text).toMatch(/Grammatik/)
    expect(nachrichtFuer('tagesziel', wahl(), lage({ offenZiel: 'https://boese.de/' }), () => 0).ziel).toBe('/s/')
    // Kein Druck, kein schlechtes Gewissen
    const alle = JSON.stringify(TEXTE)
    expect(alle).not.toMatch(/vergessen|schon wieder|verlierst|enttäusch|musst|forgot|lose your|disappoint|must /i)
  })
  it('eigener Text: nur einfacher Text, begrenzt; ersetzt den Text der Tagesrunde', () => {
    expect(textBereinigt('  <b>Los</b>\n\tgeht\u0000s  ')).toBe('b Los /b geht s')
    expect(textBereinigt('x'.repeat(300))).toHaveLength(120)
    expect(nachrichtFuer('tagesziel', wahl({ text: 'Vokabeln, dann Fußball!' }), lage(), () => 0).text).toBe('Vokabeln, dann Fußball!')
    expect(wahlBereinigt({ an: 'ja', zeit: '25:00', tage: [0, 3, 3, 9, 1], text: '<x>', sprache: 'fr', ausloeser: { serie: false } })).toEqual({
      ...STANDARD_WAHL,
      tage: [1, 3],
      ausloeser: { tagesziel: true, serie: false, neu: true, woche: true },
      text: 'x'
    })
  })
  it('Inhalt der Nachricht: Titel, Text, Ziel, Sprache – sonst nichts', () => {
    const n = JSON.parse(nutzlast(nachrichtFuer('tagesziel', wahl(), lage(), () => 0)))
    expect(Object.keys(n).sort()).toEqual(['b', 'l', 't', 'tag', 'u'])
  })
})

// ---------------------------------------------------------------- Server

async function rufe(
  route: (k: Anfrage) => Promise<boolean>,
  n: NutzerInfo,
  methode: 'GET' | 'POST',
  pfad: string,
  koerper: Record<string, unknown> = {},
  kennung = 'sitzung-1'
): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await route(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

describe('Erinnerungen auf dem Server', () => {
  let lk: NutzerInfo
  let lena: NutzerInfo
  let kurs = ''
  const vok = vokabelRoute('http://x')
  const ein = erinnerungenRoute('https://schule.example')
  const ua = createECDH('prime256v1')
  ua.generateKeys()
  const auth = randomBytes(16)
  let empfang: Server
  let port = 0
  const angekommen: Buffer[] = []
  let antwort = 201
  const abo = (pfad = 'a'): Record<string, unknown> => ({ endpoint: `http://127.0.0.1:${port}/push/${pfad}`, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } })

  beforeAll(async () => {
    process.env.SCHULAPPS_PUSH_LOKAL = '1'
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    lk = nutzerAnlegen({ benutzer: 'l.lehrer', name: 'Lars Lehrer', rolle: 'lehrkraft', quelle: 'test' })
    lena = nutzerAnlegen({ benutzer: 'lena.probe', name: 'Lena Probe', rolle: 'schueler', quelle: 'lokal' })
    empfang = createServer((req, res) => {
      const teile: Buffer[] = []
      req.on('data', (d: Buffer) => teile.push(d))
      req.on('end', () => {
        angekommen.push(Buffer.concat(teile))
        res.writeHead(antwort).end()
      })
    })
    await new Promise<void>((ok) => empfang.listen(0, '127.0.0.1', () => ok()))
    port = (empfang.address() as { port: number }).port
    const woerter = ['dog', 'cat', 'bird'].map((t, i) => ({ id: `w${i}`, term: t, translation: `T${i}` }))
    kurs = String((await rufe(vok, lk, 'POST', '/server/vokabeln/freigeben', { titel: 'Englisch', sprache: 'en', fach: 'Englisch', woerter, schueler: [lena.benutzer] })).d.id)
  })
  afterAll(() => empfang?.close())

  it('ohne Angebot der Lehrkraft: nichts anzumelden', async () => {
    expect(kurs).toBeTruthy()
    const g = await rufe(ein, lena, 'GET', '/s/api/erinnerungen')
    expect(g.d.angeboten).toBe(false)
    expect(g.d.schluessel).toBeUndefined()
    expect((await rufe(ein, lena, 'POST', '/s/api/erinnerungen/geraet', { abo: abo() })).code).toBe(403)
  })

  it('Lehrkraft bietet an, Lernende melden ein Gerät an; die Lehrkraft sieht nur die Zahl', async () => {
    expect((await rufe(vok, lk, 'POST', `/server/vokabeln/${kurs}/erinnerungen`, { an: true })).code).toBe(200)
    const g = await rufe(ein, lena, 'GET', '/s/api/erinnerungen')
    expect(g.d.angeboten).toBe(true)
    expect(String(g.d.schluessel)).toMatch(/^B[\w-]{86}$/)
    expect((g.d.wahl as ErinnerungsWahl).an).toBe(false)
    expect((await rufe(ein, lena, 'POST', '/s/api/erinnerungen/geraet', { abo: { ...abo(), endpoint: 'https://intern.example/x' } })).code).toBe(400)
    expect((await rufe(ein, lena, 'POST', '/s/api/erinnerungen/geraet', { abo: abo() })).code).toBe(200)
    expect((await rufe(ein, lena, 'POST', '/s/api/erinnerungen/wahl', { wahl: { ...STANDARD_WAHL, an: true } })).code).toBe(200)
    expect((await rufe(ein, lena, 'POST', '/s/api/erinnerungen/geraet-pruefen', { endpoint: abo().endpoint })).d.registriert).toBe(true)
    const d = (await rufe(vok, lk, 'GET', `/server/vokabeln/${kurs}`)).d
    expect(d.erinnerungen).toBe(true)
    expect(d.erinnerungenAktiv).toBe(1)
    expect(aktiveZahl([lena.id, lk.id])).toBe(1)
  })

  it('Test-Benachrichtigung: verschlüsselt beim Push-Dienst, mit den Schlüsseln des Geräts lesbar, ohne Namen', async () => {
    angekommen.length = 0
    const r = await rufe(ein, lena, 'POST', '/s/api/erinnerungen/test')
    expect(r.d).toEqual({ gesendet: 1, geraete: 1 })
    expect(angekommen).toHaveLength(1)
    expect(angekommen[0].toString('latin1')).not.toContain('Erinnerungen')
    const klar = pushEntschluesseln(angekommen[0], ua.getPrivateKey(), auth).toString()
    const n = JSON.parse(klar)
    expect(n.t).toBe('Erinnerungen sind an')
    expect(klar).not.toMatch(/Lena|Probe|lena\.probe|Lars|Lehrer/)
    expect(klar).not.toContain(lena.id)
    expect((await rufe(ein, lena, 'POST', '/s/api/erinnerungen/test')).code).toBe(429)
  })

  it('Zeitplaner: um 16:00 die Tagesrunde (einmal), Neues, Wochenrückblick am Sonntag', async () => {
    // Echte Zeit liegt vor dem 14.10.: eingeschaltet am Morgen des 14.10.
    const g = lesen(lena.id)
    g.zustand = { erledigt: '', neuSeit: um(MI, 6), termine: [], letzte: {} }
    schreiben(lena.id, g, um(MI, 6))
    angekommen.length = 0
    expect(await bearbeiten(lena.id, um(MI, 15))).toBe('spaeter')
    expect(await durchlauf(um(MI, 16, 2))).toBe(1)
    expect(angekommen).toHaveLength(1)
    const n = JSON.parse(pushEntschluesseln(angekommen[0], ua.getPrivateKey(), auth).toString())
    expect(TEXTE.de.tagesziel.titel).toContain(n.t)
    expect(n.u).toBe(`/s/v/${kurs}`)
    expect(JSON.stringify(n)).not.toMatch(/Lena|Probe/)
    // Am selben Tag nichts mehr
    expect(await durchlauf(um(MI, 18))).toBe(0)
    expect(angekommen).toHaveLength(1)
    // Neues seit der letzten Meldung: am nächsten Tag
    const g2 = lesen(lena.id)
    g2.zustand.neuSeit = 0
    schreiben(lena.id, g2, um(MI, 20))
    expect(await bearbeiten(lena.id, um('2026-10-15', 16, 1))).toBe('gesendet')
    const n2 = JSON.parse(pushEntschluesseln(angekommen[1], ua.getPrivateKey(), auth).toString())
    expect(TEXTE.de.neu.titel).toContain(n2.t)
    expect(lesen(lena.id).zustand.neuSeit).toBe(um('2026-10-15', 16, 1))
    // Sonntag 17:00: Wochenrückblick (ersetzt die tägliche)
    const g3 = lesen(lena.id)
    g3.zustand.erledigt = '2026-10-17'
    schreiben(lena.id, g3, um('2026-10-17', 20))
    expect(await bearbeiten(lena.id, um('2026-10-18', 17, 1))).toBe('gesendet')
    const n3 = JSON.parse(pushEntschluesseln(angekommen[2], ua.getPrivateKey(), auth).toString())
    expect(TEXTE.de.woche.titel).toContain(n3.t)
    expect(n3.u).toBe('/s/')
  })

  it('zieht die Lehrkraft das Angebot zurück, kommt nichts mehr', async () => {
    await rufe(vok, lk, 'POST', `/server/vokabeln/${kurs}/erinnerungen`, { an: false })
    const g = lesen(lena.id)
    g.zustand.erledigt = ''
    schreiben(lena.id, g, um('2026-10-19', 6))
    const vorher = angekommen.length
    expect(await bearbeiten(lena.id, um('2026-10-19', 16, 1))).toBe('nichts')
    expect(angekommen).toHaveLength(vorher)
    expect((await rufe(vok, lk, 'GET', `/server/vokabeln/${kurs}`)).d.erinnerungen).toBe(false)
    await rufe(vok, lk, 'POST', `/server/vokabeln/${kurs}/erinnerungen`, { an: true })
  })

  it('erloschene Anmeldung (410) wird entfernt; Abmelden entfernt die Geräte dieser Sitzung', async () => {
    const echt = versand.senden
    expect(geraeteVon(lena.id)).toHaveLength(1)
    antwort = 410
    await rufe(ein, lena, 'POST', '/s/api/erinnerungen/test').catch(() => undefined)
    // Sperre der Test-Benachrichtigung umgehen: direkt über den Versand
    versand.senden = (z, t, v, k) => pushSenden(z, t, v, k, { lokal: true })
    const g = lesen(lena.id)
    g.zustand.erledigt = ''
    g.zustand.neuSeit = 0
    schreiben(lena.id, g, um('2026-10-20', 6))
    expect(await bearbeiten(lena.id, um('2026-10-20', 16, 1))).toBe('gesendet')
    expect(geraeteVon(lena.id)).toHaveLength(0)
    expect(aktiveZahl([lena.id])).toBe(0)
    versand.senden = echt
    antwort = 201
    // Zwei Geräte aus zwei Sitzungen; Abmelden der ersten nimmt nur deren Gerät
    await rufe(ein, lena, 'POST', '/s/api/erinnerungen/geraet', { abo: abo('a') }, 'sitzung-a')
    await rufe(ein, lena, 'POST', '/s/api/erinnerungen/geraet', { abo: abo('b') }, 'sitzung-b')
    expect(geraeteVon(lena.id)).toHaveLength(2)
    for (const f of beimAbmelden) f(lena.id, 'sitzung-a')
    expect(geraeteVon(lena.id).map((x) => x.endpoint)).toEqual([abo('b').endpoint])
    await rufe(ein, lena, 'POST', '/s/api/erinnerungen/geraet-entfernen', { endpoint: abo('b').endpoint })
    expect(geraeteVon(lena.id)).toHaveLength(0)
  })

  it('gesperrtes Konto: Geräte weg, ausgeschaltet', async () => {
    await rufe(ein, lena, 'POST', '/s/api/erinnerungen/geraet', { abo: abo('c') })
    nutzerAendern(lena.id, { gesperrt: true })
    expect(await bearbeiten(lena.id, um('2026-10-21', 16, 1))).toBe('aus')
    expect(geraeteVon(lena.id)).toHaveLength(0)
    expect(lesen(lena.id).wahl.an).toBe(false)
    nutzerAendern(lena.id, { gesperrt: false })
  })

  it('Lehrkräfte und die Musterschüler-Vorschau: keine Erinnerungen', async () => {
    expect((await rufe(ein, lk, 'GET', '/s/api/erinnerungen')).code).toBe(403)
    const vorschau = { ...lena, quelle: 'vorschau' } as NutzerInfo
    expect((await rufe(ein, vorschau, 'GET', '/s/api/erinnerungen')).d.vorschau).toBe(true)
    expect((await rufe(ein, vorschau, 'POST', '/s/api/erinnerungen/wahl', { wahl: { an: true } })).code).toBe(403)
  })
})
