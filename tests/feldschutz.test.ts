import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { alleNutzer, datenbank, datenbankFuerTests, nutzerAendern, nutzerAnlegen, nutzerNachBenutzer } from '../src/server/datenbank'
import { kennung, migriere, planFuer } from '../src/server/feldschutz'

/* Personenbezogenes nur verschlüsselt in der Datenbank (02.10.2026) */
describe('Feldschutz', () => {
  beforeEach(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
  })
  // Rohzugriff an der Hülle vorbei: SELECT über eine Abfrage ohne sensible Tabelle im Text geht nicht –
  // darum über sqlite_master/rowid lesen und prüfen, dass kein Klartext drinsteht
  const roh = (sql: string): Record<string, unknown>[] => {
    const d = datenbank() as unknown as { prepare: (s: string) => { all: () => unknown[] } }
    return d.prepare(sql).all() as Record<string, unknown>[]
  }

  it('Nutzer: Name und Benutzername nur verschlüsselt, Suche geht weiter', () => {
    nutzerAnlegen({ benutzer: 'mia.probe', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal', gruppen: [{ id: 'klasse:6b', name: '6b' }] })
    const z = roh('SELECT benutzer AS b, benutzer_v AS bv, name AS n, gruppen AS g FROM nutzer')[0]
    expect(String(z.b)).toBe(kennung('mia.probe'))
    expect(JSON.stringify(z)).not.toMatch(/Mia Probe|mia\.probe|klasse:6b/)
    expect(String(z.n).startsWith('v1:') && String(z.bv).startsWith('v1:') && String(z.g).startsWith('v1:')).toBe(true)
    const n = nutzerNachBenutzer('Mia.Probe')
    expect(n?.name).toBe('Mia Probe')
    expect(n?.benutzer).toBe('mia.probe')
    expect(n?.gruppen[0].id).toBe('klasse:6b')
    nutzerAendern(n!.id, { name: 'Mia Pröbe' })
    expect(alleNutzer()[0].name).toBe('Mia Pröbe')
    expect(String(roh('SELECT name AS n FROM nutzer')[0].n).startsWith('v1:')).toBe(true)
  })

  it('Antworten in anderen Tabellen: INSERT/UPDATE verschlüsselt, Lesen entschlüsselt, BLOBs auch', () => {
    const d = datenbank()
    d.exec('CREATE TABLE IF NOT EXISTS teilnahmen (id TEXT PRIMARY KEY, antworten TEXT, bewertung TEXT)')
    d.exec('CREATE TABLE IF NOT EXISTS onlinetest_tinte (id TEXT, png BLOB, text TEXT)')
    d.prepare("INSERT INTO teilnahmen (id, antworten, bewertung) VALUES (?, ?, '{}')").run('t1', '{"f1":"Ich heiße Mia"}')
    d.prepare('UPDATE teilnahmen SET bewertung = ? WHERE id = ?').run('{"a":1}', 't1')
    d.prepare('INSERT OR REPLACE INTO onlinetest_tinte (id, png, text) VALUES (?, ?, ?)').run('t1', Buffer.from('PNGDATA'), 'Mia')
    const r0 = roh('SELECT antworten AS x, bewertung AS y FROM teilnahmen')[0]
    expect(String(r0.x).startsWith('v1:') && String(r0.y).startsWith('v1:')).toBe(true)
    const z = d.prepare('SELECT * FROM teilnahmen WHERE id = ?').get('t1') as Record<string, string>
    expect(z.antworten).toBe('{"f1":"Ich heiße Mia"}')
    expect(z.bewertung).toBe('{"a":1}')
    const t = d.prepare('SELECT png, text FROM onlinetest_tinte').get() as { png: Uint8Array; text: string }
    expect(Buffer.from(t.png).toString()).toBe('PNGDATA')
    expect(t.text).toBe('Mia')
  })

  it('Altdaten werden umgeschrieben', () => {
    const d = datenbank()
    d.exec('CREATE TABLE IF NOT EXISTS feedback_abgaben (id TEXT, fassungen TEXT); INSERT INTO feedback_abgaben VALUES (\'x\', \'[{"text":"Lena"}]\')')
    // Der erste Zugriff über die Hülle schreibt um
    expect((d.prepare('SELECT fassungen FROM feedback_abgaben').get() as { fassungen: string }).fassungen).toContain('Lena')
    migriere(d as never, 'feedback_abgaben')
    expect(String(roh('SELECT fassungen AS f FROM feedback_abgaben')[0].f).startsWith('v1:')).toBe(true)
  })

  it('Plan: Platzhalter den Spalten zuordnen', () => {
    expect(planFuer("INSERT INTO blatt_abgaben (a, antworten, tinte, x) VALUES (?, ?, ?, 'y')")?.art).toEqual([null, 'zu', 'zu'])
    expect(planFuer('UPDATE blatt_abgaben SET antworten = ?, abgaben = ? WHERE freigabe_id = ?')?.art).toEqual(['zu', null, null])
    expect(planFuer('SELECT passwort_hash FROM nutzer WHERE benutzer = ?')?.art).toEqual(['kennung'])
    expect(planFuer('SELECT * FROM onlinetests WHERE id = ?')).toBeNull()
  })
})
