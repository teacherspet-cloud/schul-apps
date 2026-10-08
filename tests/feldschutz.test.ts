import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { alleNutzer, datenbank, datenbankFuerTests, leseServerProtokoll, nutzerAendern, nutzerAnlegen, nutzerNachBenutzer, protokolliereServer } from '../src/server/datenbank'
import { codePruefwert, codePruefwertAusAlt, kennung, migriere, planFuer, SENSIBEL, von, zu } from '../src/server/feldschutz'
import { createHash } from 'node:crypto'
import { codePruefwerteUmstellen } from '../src/server/wartung'

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

  it('INSERT … ON CONFLICT: auch der letzte Wert wird verschlüsselt (08.10.2026)', () => {
    expect(planFuer('INSERT INTO rekord_buch (nutzer_id, daten) VALUES (?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET daten = excluded.daten')?.art).toEqual([null, 'zu'])
    expect(planFuer('INSERT INTO achievements (nutzer_id, daten) VALUES (?, ?) ON CONFLICT (nutzer_id) DO UPDATE SET daten = ?')?.art).toEqual([null, 'zu', 'zu'])
    expect(planFuer('INSERT INTO blatt_abgaben (a, antworten) VALUES (?, ?) ON CONFLICT(a, b) DO NOTHING')?.art).toEqual([null, 'zu'])
  })

  it('jede Spalte in SENSIBEL: INSERT und UPDATE verschlüsselt, Lesen entschlüsselt (08.10.2026)', () => {
    const d = datenbank()
    for (const [tabelle, spalten] of Object.entries(SENSIBEL)) {
      if (tabelle === 'nutzer') continue
      d.exec(`DROP TABLE IF EXISTS ${tabelle}`)
      d.exec(`CREATE TABLE ${tabelle} (id TEXT, ${spalten.map((x) => `${x}`).join(', ')})`)
      const klar = spalten.map((x) => `Lena Probe ${tabelle}.${x}`)
      d.prepare(`INSERT INTO ${tabelle} (id, ${spalten.join(', ')}) VALUES (?, ${spalten.map(() => '?').join(', ')})`).run('z1', ...klar)
      const r0 = roh(`SELECT ${spalten.map((x) => `${x} AS r_${x}`).join(', ')} FROM ${tabelle}`)[0]
      for (const x of spalten) expect(String(r0[`r_${x}`]), `${tabelle}.${x}`).toMatch(/^v1:/)
      expect(JSON.stringify(r0)).not.toContain('Lena')
      const z = d.prepare(`SELECT * FROM ${tabelle} WHERE id = ?`).get('z1') as Record<string, unknown>
      spalten.forEach((x, i) => expect(z[x]).toBe(klar[i]))
      d.prepare(`UPDATE ${tabelle} SET ${spalten[0]} = ? WHERE id = ?`).run('Neu Lena', 'z1')
      expect(String(roh(`SELECT ${spalten[0]} AS r FROM ${tabelle}`)[0].r)).toMatch(/^v1:/)
    }
  })

  it('nutzer_darstellung: INSERT … ON CONFLICT DO UPDATE verschlüsselt beim Anlegen und beim Ändern', () => {
    const d = datenbank()
    d.exec('CREATE TABLE IF NOT EXISTS nutzer_darstellung (nutzer_id TEXT PRIMARY KEY, daten TEXT NOT NULL)')
    const sql = 'INSERT INTO nutzer_darstellung (nutzer_id, daten) VALUES (?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET daten = excluded.daten'
    d.prepare(sql).run('n1', '{"leseschrift":true}')
    d.prepare(sql).run('n1', '{"leseschrift":false}')
    const r = roh('SELECT daten AS x FROM nutzer_darstellung')
    expect(r).toHaveLength(1)
    expect(String(r[0].x)).toMatch(/^v1:/)
    expect((d.prepare('SELECT daten FROM nutzer_darstellung WHERE nutzer_id = ?').get('n1') as { daten: string }).daten).toBe('{"leseschrift":false}')
  })

  it('Prüfprotokoll: Text verschlüsselt, die Ansicht der Verwaltung liest Klartext', () => {
    protokolliereServer('anmeldung', 'Anmeldung von Lena Probe', 'n1')
    expect(String(roh('SELECT text AS t FROM protokoll')[0].t)).toMatch(/^v1:/)
    expect(leseServerProtokoll()[0].text).toBe('Anmeldung von Lena Probe')
  })

  it('Altbestand im Prüfprotokoll wird beim Start umgeschrieben', () => {
    const d = datenbank()
    d.exec("INSERT INTO protokoll (zeit, nutzer_id, art, text) VALUES ('t', NULL, 'x', 'Klartext Lena')")
    migriere(d as never, 'protokoll')
    expect(String(roh('SELECT text AS t FROM protokoll')[0].t)).toMatch(/^v1:/)
  })

  it('Zahlen in sensiblen Spalten kommen als Zahl zurück; Klartext mit „v1:" bleibt lesbar', () => {
    expect(von(zu(3))).toBe(3)
    expect(von(zu(0))).toBe(0)
    expect(von('v1: kein Chiffrat')).toBe('v1: kein Chiffrat')
    const d = datenbank()
    d.exec('CREATE TABLE IF NOT EXISTS teilnahmen (id TEXT, verlassen INTEGER NOT NULL DEFAULT 0, grund TEXT)')
    d.prepare('INSERT INTO teilnahmen (id, verlassen, grund) VALUES (?, ?, ?)').run('t1', 1, 'zeit')
    expect(String(roh('SELECT verlassen AS v FROM teilnahmen')[0].v)).toMatch(/^v1:/)
    const z = d.prepare('SELECT verlassen, grund FROM teilnahmen').get() as { verlassen: number; grund: string }
    expect(z).toEqual({ verlassen: 1, grund: 'zeit' })
  })

  it('fail closed: eine Anweisung, die sensible Spalten am Feldschutz vorbei schriebe, wirft', () => {
    const d = datenbank()
    d.exec('CREATE TABLE IF NOT EXISTS reihen (id TEXT, titel TEXT, daten TEXT, veroeffentlicht TEXT)')
    expect(() => d.prepare("UPDATE reihen SET daten = daten || ? WHERE id = ?")).toThrow(/Feldschutz/)
    expect(() => d.prepare('INSERT INTO reihen SELECT * FROM reihen')).toThrow(/Feldschutz/)
    expect(() => d.prepare('UPDATE reihen SET veroeffentlicht = daten WHERE id = ?')).not.toThrow()
  })

  it('Code-Prüfwerte: HMAC statt SHA-256; Altwerte werden ohne den Code umgestellt', () => {
    const alt = createHash('sha256').update('AB12CD').digest('hex')
    expect(codePruefwert('ab-12 cd')).toBe(codePruefwertAusAlt(alt))
    expect(codePruefwert('AB12CD')).toMatch(/^h2:[0-9a-f]{64}$/)
    expect(codePruefwert('AB12CD')).not.toContain(alt)
    expect(codePruefwertAusAlt('')).toBe('')
    const d = datenbank()
    d.exec('CREATE TABLE IF NOT EXISTS vok_gaeste (zuweisung_id TEXT, nutzer_id TEXT, wieder TEXT, code_v TEXT, anmelde TEXT)')
    d.exec('CREATE TABLE IF NOT EXISTS gram_gaeste (zuweisung_id TEXT, nutzer_id TEXT, wieder TEXT)')
    d.prepare('INSERT INTO vok_gaeste (zuweisung_id, nutzer_id, wieder, code_v, anmelde) VALUES (?, ?, ?, ?, ?)').run('z', 'n', alt, 'AB12CD', alt)
    d.prepare('INSERT INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run('z', 'n', alt)
    expect(codePruefwerteUmstellen(d)).toBe(3)
    expect(codePruefwerteUmstellen(d)).toBe(0)
    const g = d.prepare('SELECT wieder, anmelde FROM vok_gaeste').get() as { wieder: string; anmelde: string }
    expect(g.wieder).toBe(codePruefwert('AB12CD'))
    expect(g.anmelde).toBe(codePruefwert('AB12CD'))
    expect((d.prepare('SELECT wieder FROM gram_gaeste').get() as { wieder: string }).wieder).toBe(codePruefwert('AB12CD'))
  })
})
