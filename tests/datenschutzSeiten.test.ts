/**
 * Informationspflichten (22.10.2026, Prüfung des Schulträgers, Punkt 6): Datenschutzerklärung, Elternfassung und
 * Impressum entstehen aus der echten Einrichtung (Empfänger aus den freigegebenen Schlüsseln, Platzhalter für fehlende
 * Angaben), die Kurzfassung für Lernende erscheint einmal je Fassung. Ohne KI, ohne Netz.
 */
import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbankFuerTests, nutzerAnlegen, setzeServerGeheimnis, setzeServerWert, type NutzerInfo } from '../src/server/datenbank'
import type { Anfrage } from '../src/server/http'
import {
  bestaetigteFassung,
  datenschutzHtml,
  datenschutzRoute,
  elternHtml,
  empfaengerAus,
  impressumHtml,
  INFO_CSP,
  kenntnisMerken,
  rechtlichesVollstaendig,
  type SeitenStand
} from '../src/server/datenschutzSeiten'
import { anmeldeSeite } from '../src/server/seiten'
import {
  AUFSICHT_NIEDERSACHSEN,
  KURZFASSUNG_SCHUELER,
  kurzfassungVersion,
  kurzfassungZeigen,
  LEERE_ANGABEN,
  pruefeDatenschutzAngaben
} from '../src/shared/datenschutzInfo'

const stand = (s: Partial<SeitenStand> = {}): SeitenStand => ({ angaben: { ...LEERE_ANGABEN }, schule: null, freigegeben: [], iserv: true, ...s })

describe('Empfänger aus der Einrichtung', () => {
  it('nur freigegebene Dienste, KI vor Sprache und Bildern; IServ und lokale Modelle zählen nicht', () => {
    const e = empfaengerAus(['pixabay', 'elevenlabs', 'mistral', 'openai', 'iserv', 'lokal'])
    expect(e.map((x) => x.id)).toEqual(['mistral', 'openai', 'elevenlabs', 'pixabay'])
    expect(e.find((x) => x.id === 'openai')?.drittland).toBe(true)
    expect(e.find((x) => x.id === 'mistral')?.drittland).toBe(false)
    expect(e.find((x) => x.id === 'mistral')?.ort).toMatch(/EU/)
    expect(e.find((x) => x.id === 'elevenlabs')?.lernende).toBe(false)
  })
  it('eigener Endpunkt: Drittland offen', () => {
    expect(empfaengerAus(['eigener'])[0].drittland).toBeNull()
  })
})

describe('Datenschutzerklärung', () => {
  it('ohne Angaben: Platzhalter, Prüfkästen, Aufsicht Niedersachsen, keine KI der Schule', () => {
    const h = datenschutzHtml(stand())
    expect(h).toContain('[von der Schule einzutragen: Name der Schulleitung]')
    expect(h).toContain('[von der Schule einzutragen: Kontakt der/des Datenschutzbeauftragten]')
    expect(h).toContain('[von der Schule einzutragen: Betreiber bzw. technische Ansprechperson]')
    expect(h).toContain('data-pruefen')
    expect(h).toContain('Prinzenstraße 5, 30159 Hannover')
    expect(h).toContain('data-keine-ki')
    expect(h).not.toContain('data-empfaenger-id=')
    // Pflichtinhalte
    for (const t of ['§ 31 Niedersächsisches Schulgesetz', 'Art. 6 Abs. 1 lit. e', 'Art. 22 DSGVO', 'Art. 77 DSGVO', 'Art. 21 DSGVO', '§ 25 Abs. 2 Nr. 2 TDDDG', 'Art. 50 KI-Verordnung'])
      expect(h).toContain(t)
    for (const t of ['Arbeitsblätter', 'Onlinetests', 'Vokabeln', 'Grammatik', 'Unterrichtsreihen', 'Rückmeldebogen', 'Sprechtraining', 'Erinnerungen (Push)', 'Elternbriefe'])
      expect(h).toContain(t)
    expect(h).toMatch(/Krisenhinweise: 30 Tage/)
    expect(h).toMatch(/14 Tage auf dem Server/)
    expect(h).toMatch(/OpenAI \(USA\)/)
    expect(h).toContain('data-drittland-hinweis')
    expect(h).toContain('über IServ')
    expect(h).not.toContain('<script')
  })
  it('Empfänger folgen den Freigaben', () => {
    const h = datenschutzHtml(stand({ freigegeben: ['anthropic', 'ionos'] }))
    expect(h).toContain('data-empfaenger-id="anthropic"')
    expect(h).toContain('data-empfaenger-id="ionos"')
    expect(h).not.toContain('data-empfaenger-id="openai"')
    expect(h).toContain('IONOS AI Model Hub (DE)')
    // Anthropic in den USA → Drittland-Marke
    expect(h).toMatch(/data-empfaenger-id="anthropic">.*?data-drittland/)
    expect(h).not.toMatch(/data-empfaenger-id="ionos">[^\n]*?data-drittland(?![-])/)
  })
  it('Angaben der Schule, Rückfall auf die Schul-Einrichtung, geprüft blendet die Prüfkästen aus, alles maskiert', () => {
    const angaben = pruefeDatenschutzAngaben({
      verantwortlich: 'Dr. Erika Muster, Schulleiterin',
      datenschutzbeauftragte: 'dsb@schule.example\nTel. 0511 123',
      betreiber: '<b>Technik</b> GmbH',
      geprueft: true,
      freitext: 'Beschluss der Gesamtkonferenz vom 01.10.2026'
    })
    const h = datenschutzHtml(
      stand({ angaben, schule: { name: 'IGS Beispielstadt', strasse: 'Schulweg 1', plz: '30159', ort: 'Hannover', telefon: '0511 1', email: 'info@igs.example' } })
    )
    expect(h).toContain('IGS Beispielstadt')
    expect(h).toContain('Schulweg 1<br>30159 Hannover')
    expect(h).toContain('dsb@schule.example<br>Tel. 0511 123')
    expect(h).toContain('&lt;b&gt;Technik&lt;/b&gt; GmbH')
    expect(h).not.toContain('data-pruefen')
    expect(h).not.toContain('data-platzhalter')
    expect(h).toContain('data-freitext')
  })
  it('Elternfassung und Impressum', () => {
    const e = elternHtml(stand({ freigegeben: ['openai'] }))
    expect(e).toContain('Informationen für Eltern')
    expect(e).toContain('Als PDF speichern')
    expect(e).toContain('@media print')
    expect(e).toContain('OpenAI')
    const i = impressumHtml(stand())
    expect(i).toContain('§ 18 Abs. 2 MStV')
    expect(i).toContain('[von der Schule einzutragen: Name der Schulleitung]')
    expect(i).toContain('[von der Schule einzutragen: Telefon und E-Mail der Schule]')
  })
})

// Anmeldeseite (25.10.2026, Wunsch der Lehrkraft): Verweise erst, wenn die Angaben vollständig sind
describe('Rechtsseiten vollständig', () => {
  const voll = (): SeitenStand =>
    stand({
      angaben: {
        ...LEERE_ANGABEN,
        verantwortlich: 'OStD’ Erika Muster, Schulleiterin',
        datenschutzbeauftragte: 'Datenschutz-Team, datenschutz@schule.example',
        betreiber: 'IT-Team der Schule, it@schule.example',
        geprueft: true
      },
      schule: { name: 'Gymnasium Musterstadt', strasse: 'Schulstraße 1', plz: '30159', ort: 'Hannover', telefon: '0511 123456', email: 'info@schule.example' }
    })
  it('ohne Angaben unvollständig, mit allen Pflichtangaben und Prüfung vollständig', () => {
    expect(rechtlichesVollstaendig(stand())).toBe(false)
    expect(rechtlichesVollstaendig(voll())).toBe(true)
  })
  it('ohne Prüfung oder ohne Telefon/E-Mail der Schule noch nicht', () => {
    const ohnePruefung = voll()
    ohnePruefung.angaben.geprueft = false
    expect(rechtlichesVollstaendig(ohnePruefung)).toBe(false)
    const ohneKontakt = voll()
    ohneKontakt.schule = { ...ohneKontakt.schule!, telefon: '', email: '' }
    expect(rechtlichesVollstaendig(ohneKontakt)).toBe(false)
    const ohneLeitung = voll()
    ohneLeitung.angaben.verantwortlich = ''
    expect(rechtlichesVollstaendig(ohneLeitung)).toBe(false)
  })
  it('Anmeldeseite zeigt die Verweise nur bei vollständigen Angaben', () => {
    const o = { iserv: true, notzugang: true, fehler: '', ziel: '/' }
    expect(anmeldeSeite({ ...o, rechtliches: false })).not.toContain('data-rechtliches')
    expect(anmeldeSeite({ ...o, rechtliches: false })).not.toContain('/impressum')
    expect(anmeldeSeite({ ...o, rechtliches: true })).toContain('data-rechtliches')
    expect(anmeldeSeite(o)).toContain('data-rechtliches')
  })
})

describe('Angaben prüfen', () => {
  it('Vorgaben für Aufsicht und Hosting, Steuerzeichen raus, Grenzen', () => {
    const a = pruefeDatenschutzAngaben({ aufsicht: '  ', verantwortlich: 'A\u0007B', freitext: 'x'.repeat(9000), schuleName: 'Zeile 1\nZeile 2', geprueft: 'ja' })
    expect(a.aufsicht).toBe(AUFSICHT_NIEDERSACHSEN)
    expect(a.hosting).toMatch(/STRATO/)
    expect(a.verantwortlich).toBe('A B')
    expect(a.freitext.length).toBe(4000)
    expect(a.schuleName).toBe('Zeile 1 Zeile 2')
    expect(a.geprueft).toBe(false)
  })
})

describe('Kurzfassung für Lernende', () => {
  const aktuell = kurzfassungVersion()
  const schueler = { angemeldet: true, rolle: 'schueler', quelle: 'iserv' }
  it('6–10 kurze Sätze mit „du"', () => {
    expect(KURZFASSUNG_SCHUELER.length).toBeGreaterThanOrEqual(6)
    expect(KURZFASSUNG_SCHUELER.length).toBeLessThanOrEqual(10)
    expect(KURZFASSUNG_SCHUELER.join(' ')).toMatch(/\b(du|deine?)\b/)
    expect(KURZFASSUNG_SCHUELER.join(' ')).toMatch(/OpenAI/)
  })
  it('Fassung ändert sich mit dem Text', () => {
    expect(kurzfassungVersion(['a'])).not.toBe(kurzfassungVersion(['b']))
    expect(kurzfassungVersion()).toBe(aktuell)
  })
  it('zeigen: einmal je Fassung, nicht für Lehrkräfte, Vorschau, Onlinetest, Browsertests', () => {
    expect(kurzfassungZeigen({ ich: schueler, pfad: '/s/', bestaetigt: null, aktuell })).toBe(true)
    expect(kurzfassungZeigen({ ich: { ...schueler, quelle: 'gast' }, pfad: '/s/b/abc12345', bestaetigt: null, aktuell })).toBe(true)
    expect(kurzfassungZeigen({ ich: schueler, pfad: '/s/', bestaetigt: aktuell, aktuell })).toBe(false)
    expect(kurzfassungZeigen({ ich: schueler, pfad: '/s/', bestaetigt: 'k1-alt', aktuell })).toBe(true)
    expect(kurzfassungZeigen({ ich: schueler, pfad: '/s/', bestaetigt: undefined, aktuell })).toBe(false)
    expect(kurzfassungZeigen({ ich: { ...schueler, rolle: 'lehrkraft' }, pfad: '/s/', bestaetigt: null, aktuell })).toBe(false)
    expect(kurzfassungZeigen({ ich: { ...schueler, vorschau: true }, pfad: '/s/', bestaetigt: null, aktuell })).toBe(false)
    expect(kurzfassungZeigen({ ich: schueler, pfad: '/s/t/ABC123', bestaetigt: null, aktuell })).toBe(false)
    expect(kurzfassungZeigen({ ich: { angemeldet: false }, pfad: '/s/', bestaetigt: null, aktuell })).toBe(false)
    expect(kurzfassungZeigen({ ich: schueler, pfad: '/s/', bestaetigt: null, aktuell, automatisiert: true })).toBe(false)
    expect(kurzfassungZeigen({ ich: schueler, pfad: '/s/', bestaetigt: null, aktuell, automatisiert: true, e2e: true })).toBe(true)
  })
})

// ---------------------------------------------------------------- Server: Kenntnisnahme und Route

async function rufe(
  n: NutzerInfo | null,
  methode: 'GET' | 'POST',
  pfad: string,
  koerper: Record<string, unknown> = {},
  mitKopf = true
): Promise<{ code: number; text: string; kopf: Record<string, string>; erledigt: boolean }> {
  let code = 0
  let text = ''
  let kopf: Record<string, string> = {}
  const res = {
    writeHead: (c: number, h?: Record<string, string>) => ((code = c), (kopf = h ?? {}), res),
    setHeader: () => res,
    end: (s?: string) => void (text = s ?? '')
  }
  const k = {
    req: { method: methode, headers: methode === 'POST' && mitKopf ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: n ? { nutzer: n, kennung: 'probe' } : null,
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  const erledigt = await datenschutzRoute()(k)
  return { code, text, kopf, erledigt }
}

describe('Datenschutz am Server', () => {
  let kind: NutzerInfo
  let gast: NutzerInfo
  let admin: NutzerInfo
  let lehrkraft: NutzerInfo
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    kind = nutzerAnlegen({ benutzer: 'kim.probe', name: 'Kim Probe', rolle: 'schueler', quelle: 'iserv' })
    gast = nutzerAnlegen({ benutzer: 'gast-1', name: 'Lou', rolle: 'schueler', quelle: 'gast' })
    admin = nutzerAnlegen({ benutzer: 'ad.min', name: 'Ad Min', rolle: 'admin', quelle: 'lokal' })
    lehrkraft = nutzerAnlegen({ benutzer: 'le.hr', name: 'Le Hr', rolle: 'lehrkraft', quelle: 'lokal' })
  })

  it('Kenntnisnahme je Konto und Gast, nur die aktuelle Fassung', () => {
    expect(bestaetigteFassung(kind.id)).toBeNull()
    expect(kenntnisMerken(kind.id, 'k1-alt')).toBe(false)
    expect(bestaetigteFassung(kind.id)).toBeNull()
    expect(kenntnisMerken(kind.id, kurzfassungVersion())).toBe(true)
    expect(bestaetigteFassung(kind.id)).toBe(kurzfassungVersion())
    expect(bestaetigteFassung(gast.id)).toBeNull()
  })

  it('öffentliche Seiten ohne Anmeldung, strenge CSP ohne Skript; Empfänger aus den Freigaben', async () => {
    setzeServerGeheimnis('schluessel:mistral', 'probe-schluessel')
    setzeServerGeheimnis('schluessel:openai', 'probe-schluessel')
    // OpenAI hinterlegt, aber nicht für alle freigegeben → kein Empfänger
    setzeServerWert('freigaben', { mistral: true, openai: false, anthropic: true })
    const r = await rufe(null, 'GET', '/datenschutz')
    expect(r.erledigt).toBe(true)
    expect(r.code).toBe(200)
    expect(r.kopf['content-security-policy']).toBe(INFO_CSP)
    expect(INFO_CSP).toContain("script-src 'none'")
    expect(r.text).toContain('data-empfaenger-id="mistral"')
    expect(r.text).not.toContain('data-empfaenger-id="openai"')
    // Anthropic freigegeben, aber ohne Schlüssel → kein Empfänger
    expect(r.text).not.toContain('data-empfaenger-id="anthropic"')
    for (const p of ['/datenschutz/eltern', '/impressum']) expect((await rufe(null, 'GET', p)).code).toBe(200)
    expect((await rufe(null, 'GET', '/anderes')).erledigt).toBe(false)
  })

  it('Kurzfassung per Weg: lesen, bestätigen (nur mit Kopfzeile), Gast eigenes Konto', async () => {
    const g = await rufe(gast, 'GET', '/s/api/datenschutz/kurz')
    const d = JSON.parse(g.text) as { version: string; saetze: string[]; bestaetigt: string | null }
    expect(d.bestaetigt).toBeNull()
    expect(d.saetze).toEqual(KURZFASSUNG_SCHUELER)
    expect((await rufe(gast, 'POST', '/s/api/datenschutz/kurz', { version: d.version }, false)).code).toBe(403)
    expect((await rufe(gast, 'POST', '/s/api/datenschutz/kurz', { version: 'k1-alt' })).code).toBe(409)
    expect((await rufe(gast, 'POST', '/s/api/datenschutz/kurz', { version: d.version })).code).toBe(200)
    expect(bestaetigteFassung(gast.id)).toBe(d.version)
    expect((await rufe(null, 'GET', '/s/api/datenschutz/kurz')).code).toBe(401)
  })

  it('Angaben: lesen Lehrkräfte, speichern nur Admins; erscheinen auf der Seite', async () => {
    expect((await rufe(kind, 'GET', '/server/datenschutz')).code).toBe(403)
    expect((await rufe(lehrkraft, 'GET', '/server/datenschutz')).code).toBe(200)
    expect((await rufe(lehrkraft, 'POST', '/server/datenschutz', { verantwortlich: 'X' })).code).toBe(403)
    const s = await rufe(admin, 'POST', '/server/datenschutz', { verantwortlich: 'Dr. Erika Muster', aufsicht: '' })
    expect(s.code).toBe(200)
    const angaben = (JSON.parse(s.text) as { angaben: { aufsicht: string } }).angaben
    expect(angaben.aufsicht).toBe(AUFSICHT_NIEDERSACHSEN)
    const seite = await rufe(null, 'GET', '/impressum')
    expect(seite.text).toContain('Dr. Erika Muster')
    expect(seite.text).toContain('Angaben der Schule zuletzt geändert')
  })
})
