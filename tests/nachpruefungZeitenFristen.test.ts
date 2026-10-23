/**
 * Nachprüfung des Schulträgers (23.10.2026), Punkte 4, 5, 7 und 8 (Code):
 *  - keine Arbeitszeiten für Lehrkräfte (nur Datum/Status: Sprechtraining, Reihen, Hilfsfunktionen),
 *  - Aufsichtsvermerke im Onlinetest nach 30 Tagen nur als Zahl je Art,
 *  - Prüffrist für Datenpannen, ehrlicher Stand der Nachtsicherung, Einzelsicherungen nach 14 Tagen,
 *  - COOP für jede Antwort, security.txt (RFC 9116) und robots.txt.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-nachpruefung-'))
process.env.SCHULAPPS_DATEN = ORDNER

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const db = await import('../src/server/datenbank')
const zeit = await import('../src/server/ohneUhrzeit')
const sp = await import('../src/server/sprechen')
const { standOhneZeit } = await import('../src/server/reihen')
const ot = await import('../src/server/onlinetest')
const { pruefFaellig, PRUEF_MS } = await import('../src/shared/datenpanne')
const sich = await import('../src/server/sicherungen')
const kp = await import('../src/server/sicherheitsKoepfe')
const ot2 = await import('../src/server/oeffentlicheTexte')

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  db.datenbankFuerTests()
})

const TAG = 864e5

describe('Keine Arbeitszeiten für Lehrkräfte', () => {
  it('Hilfsfunktionen: nur der Tag', () => {
    const ms = new Date(2026, 9, 21, 14, 37, 12).getTime()
    expect(zeit.nurTag(ms)).toBe('2026-10-21')
    expect(zeit.nurTag(new Date(ms).toISOString())).toBe('2026-10-21')
    expect(zeit.nurTag(0)).toBe('')
    expect(zeit.nurTag(undefined)).toBe('')
    expect(zeit.tagesBeginn(ms)).toBe(new Date(2026, 9, 21).getTime())
    expect(zeit.tagesBeginn(0)).toBe(0)
    expect(zeit.verlaufOhneZeit({ '1': [{ text: 'gut', einschaetzung: 'sicher', zeit: ms }] })).toEqual({ '1': [{ text: 'gut', einschaetzung: 'sicher' }] })
  })

  it('Sprechtraining: Übungen mit Datum, ohne Minuten und Uhrzeit; Kontingent nur ja/nein', () => {
    const lk = db.nutzerAnlegen({ benutzer: 'l.sprech', name: 'L. Sprech', rolle: 'lehrkraft', quelle: 'iserv' })
    const kind = db.nutzerAnlegen({ benutzer: 'k.sprech', name: 'K. Sprech', rolle: 'schueler', quelle: 'iserv' })
    // Tabellen anlegen (lazy) und eine Freigabe mit 10 Minuten je Woche
    sp.ueberblick('vk', lk.id)
    const jetzt = Date.now()
    const d = db.datenbank()
    d.prepare("INSERT INTO sprech_freigaben (id, lehrkraft_id, vok_id, teile, bis, einstellungen, status, erstellt) VALUES ('f1', ?, 'vk', '[\"interview\"]', ?, ?, 'offen', 'x')").run(
      lk.id,
      jetzt + 7 * TAG,
      JSON.stringify({ minutenWoche: 10 })
    )
    const u = { zeit: jetzt - 1000, teil: 'interview', modus: 'ueben', minuten: 12, wertung: { fluessig: 3 }, punkte: 3, staerke: 's', tipps: [], ausspracheUnsicher: false, sitzung: 'sx' }
    d.prepare("INSERT INTO sprech_stand (freigabe_id, schueler_id, daten, aktualisiert) VALUES ('f1', ?, ?, 1)").run(kind.id, JSON.stringify({ uebungen: [u] }))
    d.prepare("INSERT INTO sprech_vorfaelle (id, freigabe_id, schueler_id, art, satz, zeit) VALUES ('v1', 'f1', ?, 'umgehung', 'x', ?)").run(kind.id, jetzt)
    const r = sp.ueberblick('vk', lk.id, jetzt)
    const p = r.personen.find((x) => x.id === kind.id)!
    expect(p.kontingentErreicht).toBe(true)
    expect(p.uebungen).toHaveLength(1)
    expect(p.uebungen[0].datum).toBe(zeit.nurTag(u.zeit))
    expect(p.uebungen[0]).not.toHaveProperty('zeit')
    expect(p.uebungen[0]).not.toHaveProperty('minuten')
    expect(p.uebungen[0]).not.toHaveProperty('sitzung')
    expect(p.vorfaelle[0]).toEqual({ art: 'umgehung', satz: 'x', datum: zeit.nurTag(jetzt), freigabe: 'f1' })
    expect(JSON.stringify(r.personen)).not.toMatch(/"zeit"|"minuten"/)
  })

  it('Reihen: Stand für die Lehrkraft ohne Zeitstempel', () => {
    const s = standOhneZeit({
      schritte: { a: { eingereicht: 1, zeit: 5, ki: { einschaetzungen: ['x'], zeit: 6 }, diagnose: { prozent: 50, zeit: 7 }, bewertung: { text: 't', geschafft: true, zeit: 8 } } },
      hilfe: { zeit: 9, schritt: 'a', text: 'Hilfe' },
      fragen: [{ schritt: 'a', text: 'Frage', zeit: 10, antwort: 'ja', antwortZeit: 11 }]
    })
    expect(JSON.stringify(s)).not.toMatch(/[Zz]eit"/)
    expect(s.schritte.a.eingereicht).toBe(1)
    expect(s.schritte.a.diagnose?.prozent).toBe(50)
    expect(s.hilfe?.text).toBe('Hilfe')
    expect(s.fragen?.[0].antwort).toBe('ja')
  })
})

describe('Aufsichtsvermerke im Onlinetest', () => {
  it('„markieren" ist keine Vorfallart mehr', () => {
    expect((ot.VORFALL_ARTEN as readonly string[]).includes('markieren')).toBe(false)
  })
  it('verdichtet zu einer Zeile je Art (Anzahl, Gesamtdauer, ohne Uhrzeit und Zusatz)', () => {
    expect(
      ot.vorfaelleVerdichten([
        { art: 'verlassen', zeit: 1, dauer: 10 },
        { art: 'verlassen', zeit: 2, dauer: 5 },
        { art: 'uebersetzt', zeit: 3, info: 'Sprache de' },
        { art: 'verlassen', zeit: 0, anzahl: 2, dauer: 1 }
      ])
    ).toEqual([
      { art: 'verlassen', zeit: 0, anzahl: 4, dauer: 16 },
      { art: 'uebersetzt', zeit: 0, anzahl: 1 }
    ])
  })
  it('Nachtlauf: nach 30 Tagen seit Testende verdichtet, jüngere bleiben ausführlich', () => {
    ot.aufsichtVerdichten()
    const d = db.datenbank()
    const lk = db.nutzerAnlegen({ benutzer: 'l.test', name: 'L. Test', rolle: 'lehrkraft', quelle: 'iserv' })
    const kind = db.nutzerAnlegen({ benutzer: 'k.test', name: 'K. Test', rolle: 'schueler', quelle: 'iserv' })
    const jetzt = Date.now()
    const test = (id: string, beendet: number) =>
      d
        .prepare("INSERT INTO onlinetests (id, lehrkraft_id, titel, code, fassungen, einstellungen, status, erstellt, beendet) VALUES (?, ?, 't', ?, '[]', '{}', 'beendet', 'x', ?)")
        .run(id, lk.id, id.toUpperCase(), new Date(beendet).toISOString())
    test('alt', jetzt - 31 * TAG)
    test('neu', jetzt - 5 * TAG)
    const vorfaelle = JSON.stringify([
      { art: 'verlassen', zeit: jetzt - 40 * TAG, dauer: 20 },
      { art: 'kopieren', zeit: jetzt - 40 * TAG }
    ])
    for (const [id, t] of [
      ['t-alt', 'alt'],
      ['t-neu', 'neu']
    ])
      d.prepare("INSERT INTO teilnahmen (id, test_id, schueler_id, variante, geheim, beginn, ende, abgabe, vorfaelle) VALUES (?, ?, ?, 0, 'g', 1, 2, 3, ?)").run(
        id,
        t,
        kind.id,
        vorfaelle
      )
    expect(ot.aufsichtVerdichten(jetzt)).toBe(1)
    const lies = (id: string) => JSON.parse((d.prepare('SELECT vorfaelle FROM teilnahmen WHERE id = ?').get(id) as { vorfaelle: string }).vorfaelle)
    expect(lies('t-alt')).toEqual([
      { art: 'verlassen', zeit: 0, anzahl: 1, dauer: 20 },
      { art: 'kopieren', zeit: 0, anzahl: 1 }
    ])
    expect(lies('t-neu')).toHaveLength(2)
    expect(lies('t-neu')[0].zeit).toBeGreaterThan(0)
    // zweiter Lauf ändert nichts mehr
    expect(ot.aufsichtVerdichten(jetzt)).toBe(0)
  })
})

describe('Datenpannen: Prüffrist', () => {
  it('nach mehr als drei Jahren seit dem Abschluss zur Prüfung vorgelegt, offene nie', () => {
    const jetzt = Date.now()
    expect(pruefFaellig({ abgeschlossen: jetzt - PRUEF_MS - TAG }, jetzt)).toBe(true)
    expect(pruefFaellig({ abgeschlossen: jetzt - PRUEF_MS + TAG }, jetzt)).toBe(false)
    expect(pruefFaellig({}, jetzt)).toBe(false)
  })
})

describe('Sicherung: ehrlicher Stand und 14 Tage', () => {
  it('Ampel rot ohne Kopie für den PC – auch wenn ein älteres Skript „ok" meldete', () => {
    mkdirSync(join(ORDNER, 'sicherungen'), { recursive: true })
    const stand = (x: object) => writeFileSync(join(ORDNER, 'sicherungen', 'stand-nacht.json'), JSON.stringify({ zeit: new Date().toISOString(), groesse: 1, meldung: '', ...x }))
    stand({ ok: false, archiv: '', verfahren: '', meldung: 'Kein öffentlicher Schlüssel' })
    expect(sich.sicherungAussen(ORDNER).ampel.nacht).toBe('fehler')
    stand({ ok: true, archiv: '', verfahren: '' })
    expect(sich.sicherungAussen(ORDNER).ampel.nacht).toBe('fehler')
    stand({ ok: true, archiv: 'a.sicherung.tar', verfahren: 'age' })
    expect(sich.sicherungAussen(ORDNER).ampel.nacht).toBe('ok')
  })
  it('Einzelsicherungen (sicherung-vor-*.db) und Vor-Update-Kopien (vor-*.db) nach 14 Tagen gelöscht', () => {
    const alt = (Date.now() - 15 * TAG) / 1000
    const datei = (p: string, a: boolean) => (writeFileSync(p, 'x'), a && utimesSync(p, alt, alt))
    datei(join(ORDNER, 'sicherung-vor-iserv-abgleich-2026-10-01.db'), true)
    datei(join(ORDNER, 'sicherung-vor-schuljahreswechsel-2026-10-20.db'), false)
    datei(join(ORDNER, 'sicherungen', 'vor-0.4.1.db'), true)
    datei(join(ORDNER, 'sicherungen', 'schulapps-alt.db.gz'), true)
    expect(sich.alteEinzelsicherungenLoeschen(ORDNER)).toBe(2)
    expect(existsSync(join(ORDNER, 'sicherung-vor-iserv-abgleich-2026-10-01.db'))).toBe(false)
    expect(existsSync(join(ORDNER, 'sicherung-vor-schuljahreswechsel-2026-10-20.db'))).toBe(true)
    expect(existsSync(join(ORDNER, 'sicherungen', 'vor-0.4.1.db'))).toBe(false)
    // die gepackten Sicherungen räumt sicherungenAufraeumen ab (die neuesten 14) – hier unberührt
    expect(existsSync(join(ORDNER, 'sicherungen', 'schulapps-alt.db.gz'))).toBe(true)
  })
})

describe('Öffentliche Kopfzeilen und Textdateien', () => {
  it('COOP same-origin für jede Antwort (auch Anmeldeseite und öffentliche Seiten)', () => {
    expect(kp.allgemeineKoepfe(false)['cross-origin-opener-policy']).toBe('same-origin')
    expect(kp.allgemeineKoepfe(true)['cross-origin-opener-policy']).toBe('same-origin')
  })
  it('security.txt nach RFC 9116: Kontakt aus den Angaben, Ablauf in einem Jahr, Sprachen, Canonical', () => {
    db.setzeServerWert('datenschutz-angaben', { betreiber: 'IT-Team\nE-Mail: technik@schule.example' })
    const t = ot2.securityTxt('https://www.meineschulapps.de/', new Date('2026-10-23T10:00:00Z'))
    expect(t).toContain('Contact: mailto:technik@schule.example')
    expect(t).toContain('Expires: 2027-10-23T00:00:00Z')
    expect(t).toContain('Preferred-Languages: de, en')
    expect(t).toContain('Canonical: https://www.meineschulapps.de/.well-known/security.txt')
    db.setzeServerWert('datenschutz-angaben', null)
    expect(ot2.securityTxt('https://x.example')).toMatch(/Contact: (mailto:|https:\/\/x\.example\/impressum)/)
  })
  it('robots.txt: nur Datenschutz und Impressum, sonst nichts', () => {
    expect(ot2.ROBOTS_TXT).toContain('Disallow: /')
    expect(ot2.ROBOTS_TXT).toContain('Allow: /datenschutz')
    expect(ot2.ROBOTS_TXT).toContain('Allow: /impressum')
  })
  it('Route liefert beide ohne Anmeldung als Text', async () => {
    const route = ot2.oeffentlicheTexteRoute('https://x.example')
    const aufruf = async (pfad: string) => {
      let kopf: Record<string, string> = {}
      let text = ''
      const res = { writeHead: (_c: number, k: Record<string, string>) => ((kopf = k), res), end: (t?: string) => void (text = t ?? '') }
      const ok = await route({ req: { method: 'GET', headers: {} }, res, url: new URL(`http://x${pfad}`), sitzung: null } as never)
      return { ok, kopf, text }
    }
    const s = await aufruf('/.well-known/security.txt')
    expect(s.ok).toBe(true)
    expect(s.kopf['content-type']).toMatch(/^text\/plain/)
    expect(s.text).toContain('Expires:')
    expect((await aufruf('/robots.txt')).text).toContain('User-agent: *')
    expect((await aufruf('/irgendwas')).ok).toBe(false)
  })
})
