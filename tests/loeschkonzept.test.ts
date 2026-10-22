import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NutzerInfo } from '../src/server/datenbank'
import {
  abgangEntscheiden,
  einstellungBereinigen,
  freigabeLage,
  gastEntscheiden,
  LOESCH_STANDARD,
  massenSchutz,
  nachtlaufFaellig,
  TAG
} from '../src/server/loeschRegeln'

/*
 * Löschkonzept (23.10.2026, Prüfung des Schulträgers): Regeln mit festen Daten, Nachtlauf gegen eine Datenbank im
 * Speicher (Abgang, Aufschub, Gäste, Zeitfristen) und der Wiederherstellungstest der Nachtsicherung.
 */
const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-loeschkonzept-'))
process.env.SCHULAPPS_DATEN = ORDNER

const { setzeSchluesselFuerTests, verschluessle } = await import('../src/server/geheim')
const db = await import('../src/server/datenbank')
const lk = await import('../src/server/loeschkonzept')
const sich = await import('../src/server/sicherungen')
const { dateiZu } = await import('../src/server/shims/fs')
const { db: vokDb } = await import('../src/server/vokabeln')

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

const T0 = Date.parse('2027-03-01T03:30:00Z')
const e = LOESCH_STANDARD

describe('Regeln', () => {
  it('Abgang: Karenz, Vormerkung, Frist, Aufschub, Rückkehr', () => {
    expect(abgangEntscheiden({ gesehen: T0 - 119 * TAG, markiert: null }, e, T0)).toBe('aktiv')
    expect(abgangEntscheiden({ gesehen: T0 - 120 * TAG, markiert: null }, e, T0)).toBe('vormerken')
    expect(abgangEntscheiden({ gesehen: T0 - 140 * TAG, markiert: T0 - 29 * TAG }, e, T0)).toBe('vorgemerkt')
    expect(abgangEntscheiden({ gesehen: T0 - 160 * TAG, markiert: T0 - 30 * TAG }, e, T0)).toBe('loeschen')
    expect(abgangEntscheiden({ gesehen: T0 - 160 * TAG, markiert: T0 - 30 * TAG, aufschubBis: T0 + 60 * TAG }, e, T0)).toBe('vorgemerkt')
    expect(abgangEntscheiden({ gesehen: T0 - 1 * TAG, markiert: T0 - 10 * TAG }, e, T0)).toBe('zuruecknehmen')
  })
  it('Sommerferien (6 Wochen) lösen nichts aus', () => {
    expect(abgangEntscheiden({ gesehen: T0 - 45 * TAG, markiert: null }, e, T0)).toBe('aktiv')
  })
  it('Gäste: offene Freigabe hält, sonst ein Schuljahr nach dem Ende', () => {
    const offen = freigabeLage('offen', null, null, T0)
    const zu = freigabeLage('beendet', null, null, T0)
    const abgelaufen = freigabeLage('offen', T0 - 400 * TAG, null, T0)
    expect(offen.offen).toBe(true)
    expect(zu.offen).toBe(false)
    expect(abgelaufen).toEqual({ offen: false, ende: T0 - 400 * TAG })
    expect(gastEntscheiden({ wieLernende: false, freigaben: [offen, zu], gesehen: 0 }, e, T0)).toBe('behalten')
    expect(gastEntscheiden({ wieLernende: false, freigaben: [zu], gesehen: T0 - 300 * TAG }, e, T0)).toBe('behalten')
    expect(gastEntscheiden({ wieLernende: false, freigaben: [zu, abgelaufen], gesehen: T0 - 366 * TAG }, e, T0)).toBe('loeschen')
    expect(gastEntscheiden({ wieLernende: false, freigaben: [{ offen: false, ende: T0 - 100 * TAG }], gesehen: T0 - 500 * TAG }, e, T0)).toBe('behalten')
    expect(gastEntscheiden({ wieLernende: true, freigaben: [], gesehen: 0 }, e, T0)).toBe('wieLernende')
  })
  it('Einstellungen bleiben in ihren Grenzen; Massenschutz; Nachtfenster', () => {
    expect(einstellungBereinigen({ abgangTage: 5, fristTage: '45', protokollTage: 9999, an: false })).toMatchObject({ an: false, abgangTage: 60, fristTage: 45, protokollTage: 730 })
    expect(einstellungBereinigen(null)).toEqual(LOESCH_STANDARD)
    expect(massenSchutz(5, 10, 25)).toBe(false)
    expect(massenSchutz(30, 100, 25)).toBe(true)
    expect(massenSchutz(20, 100, 25)).toBe(false)
    expect(nachtlaufFaellig(T0, T0 - 21 * 36e5, 3)).toBe(true)
    expect(nachtlaufFaellig(T0, T0 - 2 * 36e5, 3)).toBe(false)
    expect(nachtlaufFaellig(T0, 0, 14)).toBe(false)
  })
})

describe('Nachtlauf', () => {
  const alt = (id: string, tage: number, jetzt = T0): void => {
    const z = new Date(jetzt - tage * TAG).toISOString()
    db.datenbank().prepare('UPDATE nutzer SET erstellt = ?, zuletzt = ? WHERE id = ?').run(z, z, id)
  }
  let weg: NutzerInfo, inIserv: NutzerInfo, aktiv: NutzerInfo, aufschub: NutzerInfo, lehrkraft: NutzerInfo
  let gastAlt: NutzerInfo, gastOffen: NutzerInfo

  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    db.datenbankFuerTests()
    weg = db.nutzerAnlegen({ benutzer: 'weg.ist', name: 'Weg Ist', rolle: 'schueler', quelle: 'iserv' })
    inIserv = db.nutzerAnlegen({ benutzer: 'noch.da', name: 'Noch Da', rolle: 'schueler', quelle: 'iserv' })
    aktiv = db.nutzerAnlegen({ benutzer: 'aktiv.kind', name: 'Aktiv Kind', rolle: 'schueler', quelle: 'iserv' })
    aufschub = db.nutzerAnlegen({ benutzer: 'auf.schub', name: 'Auf Schub', rolle: 'schueler', quelle: 'lokal' })
    lehrkraft = db.nutzerAnlegen({ benutzer: 'a.alt', name: 'A. Alt', rolle: 'lehrkraft', quelle: 'iserv' })
    gastAlt = db.nutzerAnlegen({ benutzer: 'gast-alt0001', name: 'Gast A.', rolle: 'schueler', quelle: 'gast' })
    gastOffen = db.nutzerAnlegen({ benutzer: 'gast-offen001', name: 'Gast O.', rolle: 'schueler', quelle: 'gast' })
    alt(weg.id, 200)
    alt(inIserv.id, 200)
    alt(aktiv.id, 10)
    alt(aufschub.id, 200)
    alt(lehrkraft.id, 300)
    alt(gastAlt.id, 400)
    alt(gastOffen.id, 400)
    const v = vokDb()
    v.prepare("INSERT INTO vok_zuweisungen (id, lehrkraft_id, titel, woerter, status, erstellt) VALUES ('z-zu', ?, 'T', '[]', 'beendet', 'x')").run(lehrkraft.id)
    v.prepare("INSERT INTO vok_zuweisungen (id, lehrkraft_id, titel, woerter, status, erstellt) VALUES ('z-offen', ?, 'T', '[]', 'offen', 'x')").run(lehrkraft.id)
    v.prepare("INSERT INTO vok_gaeste (zuweisung_id, nutzer_id, wieder) VALUES ('z-zu', ?, 'x')").run(gastAlt.id)
    v.prepare("INSERT INTO vok_gaeste (zuweisung_id, nutzer_id, wieder) VALUES ('z-offen', ?, 'x')").run(gastOffen.id)
    // Zeitfristen
    const d = db.datenbank()
    d.exec('CREATE TABLE IF NOT EXISTS krisen_hinweise (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL, schueler_id TEXT NOT NULL, quelle TEXT NOT NULL, zeit INTEGER NOT NULL, gesehen INTEGER)')
    d.prepare("INSERT INTO krisen_hinweise (id, lehrkraft_id, schueler_id, quelle, zeit) VALUES ('k-alt', 'l', 's', 'q', ?)").run(T0 - 31 * TAG)
    d.prepare("INSERT INTO krisen_hinweise (id, lehrkraft_id, schueler_id, quelle, zeit) VALUES ('k-neu', 'l', 's', 'q', ?)").run(T0 - 2 * TAG)
    d.prepare('INSERT INTO protokoll (zeit, nutzer_id, art, text) VALUES (?, NULL, ?, ?)').run(new Date(T0 - 181 * TAG).toISOString(), 'test', 'alt')
    d.prepare('INSERT INTO protokoll (zeit, nutzer_id, art, text) VALUES (?, NULL, ?, ?)').run(new Date(T0 - 10 * TAG).toISOString(), 'test', 'neu')
  })

  const liste = async (): Promise<{ uuid: string; benutzer: string }[]> => [{ uuid: '', benutzer: 'noch.da' }]

  it('merkt Abgegangene vor, nicht wer in IServ steht; Zeitfristen und alte Gäste gehen sofort', async () => {
    const s = await lk.loeschLauf('hand', T0, liste)
    const ids = lk.vorgemerkteListe().map((x) => x.id)
    expect(ids.sort()).toEqual([weg.id, aufschub.id].sort())
    expect(s.zahlen).toMatchObject({ vorgemerkt: 2, geloescht: 0, gaeste: 1, krisen: 1, protokoll: 1 })
    expect(s.iserv?.anzahl).toBe(1)
    expect(db.nutzerNachId(gastAlt.id)).toBeNull()
    expect(db.nutzerNachId(gastOffen.id)).not.toBeNull()
    const d = db.datenbank()
    expect(d.prepare("SELECT id FROM krisen_hinweise").all()).toEqual([{ id: 'k-neu' }])
    expect(db.leseServerProtokoll(100).some((z) => z.text === 'alt')).toBe(false)
    expect(db.leseServerProtokoll(100).some((z) => /Löschkonzept \(hand\): 2 vorgemerkt/.test(z.text))).toBe(true)
    // Lehrkräfte nur gelistet
    expect(lk.abgegangeneLehrkraefte(T0).map((x) => x.id)).toEqual([lehrkraft.id])
  })

  it('löscht nach der Frist – außer aufgeschoben', async () => {
    expect(lk.aufschieben(aufschub.id, T0 + 1 * TAG)).toBe(true)
    const s = await lk.loeschLauf('hand', T0 + 31 * TAG, liste)
    expect(s.zahlen.geloescht).toBe(1)
    expect(db.nutzerNachId(weg.id)).toBeNull()
    expect(db.nutzerNachId(aufschub.id)).not.toBeNull()
    expect(db.nutzerNachId(inIserv.id)).not.toBeNull()
    expect(db.nutzerNachId(lehrkraft.id)).not.toBeNull()
  })

  it('wer wiederkommt, fällt aus der Liste', async () => {
    db.datenbank().prepare('UPDATE nutzer SET zuletzt = ? WHERE id = ?').run(new Date(T0 + 40 * TAG).toISOString(), aufschub.id)
    const s = await lk.loeschLauf('hand', T0 + 41 * TAG, liste)
    expect(s.zahlen.zurueck).toBe(1)
    expect(lk.vorgemerkteListe()).toEqual([])
  })

  it('Massenschutz: zu viele auf einmal → niemand vorgemerkt', async () => {
    for (let i = 0; i < 8; i++) alt(db.nutzerAnlegen({ benutzer: `viel.${i}`, name: `Viel ${i}`, rolle: 'schueler', quelle: 'iserv' }).id, 300, T0 + 41 * TAG)
    const s = await lk.loeschLauf('hand', T0 + 42 * TAG, liste)
    expect(s.warnung).toMatch(/Abgebrochen/)
    expect(lk.vorgemerkteListe()).toEqual([])
  })
  it('ohne aktuelle IServ-Liste wird niemand als abgegangen vorgemerkt (23.10.2026)', async () => {
    const n = db.nutzerAnlegen({ benutzer: 'ohne.liste', name: 'Ohne Liste', rolle: 'schueler', quelle: 'iserv' })
    alt(n.id, 300, T0 + 43 * TAG)
    const s = await lk.loeschLauf('hand', T0 + 43 * TAG, async () => {
      throw new Error('IDM nicht freigegeben')
    })
    expect(s.warnung).toMatch(/Keine aktuelle IServ-Benutzerliste/)
    expect(lk.vorgemerkteListe().map((x) => x.id)).not.toContain(n.id)
    expect(db.nutzerNachId(n.id)).not.toBeNull()
  })
})

describe('Wiederherstellungstest der Nachtsicherung', () => {
  const entpackt = (name: string, zeilen: number, erwartet: number): string => {
    const o = join(sich.sicherungsOrdner(ORDNER), `${sich.PRUEF_VORSILBE}${name}`)
    mkdirSync(join(o, 'nutzer', 'abc123'), { recursive: true })
    const d = new DatabaseSync(join(o, 'schulapps.db'))
    d.exec('CREATE TABLE nutzer (id TEXT, name TEXT)')
    for (let i = 0; i < zeilen; i++) d.prepare('INSERT INTO nutzer VALUES (?, ?)').run(`n${i}`, verschluessle(`Name ${i}`))
    d.close()
    writeFileSync(join(o, 'inhalt.json'), JSON.stringify({ tabellen: { nutzer: erwartet } }))
    writeFileSync(join(o, 'nutzer', 'abc123', 'einstellungen.json'), dateiZu(Buffer.from('{"a":1}')))
    writeFileSync(join(o, 'bereit.json'), JSON.stringify({ archiv: `${name}.sicherung.tar`, dateien: { erwartet: 4, gefunden: 4 } }))
    return o
  }

  it('bestanden: integrity_check, Zeilen wie im Inhalt, Stichproben entschlüsselt; Ordner wird entfernt', () => {
    db.datenbankFuerTests()
    const o = entpackt('gut', 3, 3)
    const [e] = sich.pruefungenAbarbeiten(ORDNER)
    expect(e.ok).toBe(true)
    expect(e.integritaet).toBe('ok')
    expect(e.entschluesselt).toEqual({ geprueft: 4, ok: 4 })
    expect(existsSync(o)).toBe(false)
    expect(JSON.parse(readFileSync(join(ORDNER, 'sicherungen', 'stand-pruefung.json'), 'utf8')).ok).toBe(true)
    expect(db.leseServerProtokoll(5)[0].text).toMatch(/Wiederherstellungstest bestanden/)
  })

  it('fehlgeschlagen: andere Zeilenzahl oder falscher Hauptschlüssel → rot', () => {
    entpackt('falsch', 3, 5)
    expect(sich.pruefungenAbarbeiten(ORDNER)[0]).toMatchObject({ ok: false, abweichungen: [{ tabelle: 'nutzer', erwartet: 5, gefunden: 3 }] })
    entpackt('schluessel', 2, 2)
    setzeSchluesselFuerTests(randomBytes(32))
    const e = sich.pruefungenAbarbeiten(ORDNER)[0]
    expect(e.ok).toBe(false)
    expect(e.meldung).toMatch(/Hauptschlüssel/)
    expect(sich.sicherungAussen(ORDNER).ampel.pruefung).toBe('fehler')
  })

  it('Ampel: ohne Nachtstand rot, ohne Abholung gelb', () => {
    const a = sich.sicherungAussen(ORDNER)
    expect(a.ampel.nacht).toBe('fehler')
    expect(a.ampel.abgeholt).toBe('warnung')
    writeFileSync(join(ORDNER, 'sicherungen', 'stand-nacht.json'), JSON.stringify({ zeit: new Date().toISOString(), ok: true, archiv: 'x', groesse: 1, verfahren: 'openssl', meldung: '' }))
    expect(sich.sicherungAussen(ORDNER).ampel.nacht).toBe('ok')
  })
})
