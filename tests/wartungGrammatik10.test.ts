import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { geschuetzt } from '../src/server/feldschutz'
import { grammatikKlasse10Loeschen, istKlasse10, LEHRKRAFT_10 } from '../src/server/wartungGrammatik10'

/*
 * Grammatik der 10. Klassen einer Lehrkraft löschen (09.10.2026) – gegen eine Test-Datenbank mit verschlüsselten
 * Gruppennamen: 10b weg (direkt und über den Kurs), 9a und andere Lehrkräfte bleiben.
 */
function probeDb(): DatabaseSync {
  const roh = new DatabaseSync(':memory:')
  roh.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE nutzer (id TEXT PRIMARY KEY, benutzer TEXT NOT NULL DEFAULT '', benutzer_v TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', quelle TEXT NOT NULL DEFAULT '');
    CREATE TABLE lerngruppen (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, mitglieder TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE vok_zuweisungen (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL DEFAULT '', lerngruppe_id TEXT NOT NULL DEFAULT '');
    CREATE TABLE vok_gaeste (zuweisung_id TEXT NOT NULL, nutzer_id TEXT NOT NULL, wieder TEXT NOT NULL DEFAULT '');
    CREATE TABLE gram_zuweisungen (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL, lerngruppe_id TEXT NOT NULL DEFAULT '', titel TEXT NOT NULL,
      paket TEXT NOT NULL, erstellt TEXT NOT NULL, vok_id TEXT NOT NULL DEFAULT '', info TEXT NOT NULL DEFAULT '');
    CREATE TABLE gram_stand (zuweisung_id TEXT NOT NULL REFERENCES gram_zuweisungen(id) ON DELETE CASCADE, schueler_id TEXT NOT NULL,
      daten TEXT NOT NULL, aktualisiert INTEGER NOT NULL, PRIMARY KEY (zuweisung_id, schueler_id));
    CREATE TABLE gram_gaeste (zuweisung_id TEXT NOT NULL REFERENCES gram_zuweisungen(id) ON DELETE CASCADE, nutzer_id TEXT NOT NULL,
      wieder TEXT NOT NULL, PRIMARY KEY (zuweisung_id, nutzer_id));
  `)
  const d = geschuetzt(roh)
  const L = LEHRKRAFT_10
  for (const [id, lk, name] of [
    ['g10b', L, '10b'],
    ['g9a', L, '9a'],
    ['g100', L, '100 Tage'],
    ['f10b', 'andere', '10b']
  ])
    d.prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name) VALUES (?, ?, ?)').run(id, lk, name)
  d.prepare('INSERT INTO vok_zuweisungen (id, lehrkraft_id, lerngruppe_id) VALUES (?, ?, ?)').run('kurs10b', L, 'g10b')
  const gram = d.prepare('INSERT INTO gram_zuweisungen (id, lehrkraft_id, lerngruppe_id, titel, paket, erstellt, vok_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const p = '{"thema":"x","regeln":[],"aufgaben":[]}'
  gram.run('a1', L, 'g10b', 'Passive', p, '2026-10-01', '')
  gram.run('a2', L, '', 'Reported speech', p, '2026-10-01', 'kurs10b')
  gram.run('a3', L, 'g9a', 'Simple past', p, '2026-10-01', '')
  gram.run('a4', L, 'g100', 'Gerund', p, '2026-10-01', '')
  gram.run('a5', 'andere', 'f10b', 'Passive', p, '2026-10-01', '')
  const st = d.prepare('INSERT INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
  st.run('a1', 's1', '{}', 1)
  st.run('a2', 's1', '{}', 1)
  st.run('a3', 's1', '{}', 1)
  // Gäste: g1 nur in a1 (Konto weg), g2 auch im Vokabelkurs (bleibt)
  for (const [id] of [['g1'], ['g2']]) d.prepare("INSERT INTO nutzer (id, name, quelle) VALUES (?, 'Gast', 'gast')").run(id)
  d.prepare('INSERT INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run('a1', 'g1', 'h')
  d.prepare('INSERT INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run('a1', 'g2', 'h')
  d.prepare('INSERT INTO vok_gaeste (zuweisung_id, nutzer_id) VALUES (?, ?)').run('kurs10b', 'g2')
  return d
}

const ids = (d: DatabaseSync, sql: string): string[] => (d.prepare(sql).all() as { id: string }[]).map((x) => x.id).sort()

describe('Grammatik der 10. Klassen löschen', () => {
  beforeEach(() => setzeSchluesselFuerTests(randomBytes(32)))

  it('10b (direkt und über den Kurs) weg, 9a, „100 Tage" und andere Lehrkräfte bleiben', () => {
    const d = probeDb()
    expect(grammatikKlasse10Loeschen(d)).toBe('2 Grammatiktrainings der 10. Klassen gelöscht (2 Lernstände, 1 Gastkonten)')
    expect(ids(d, 'SELECT id FROM gram_zuweisungen')).toEqual(['a3', 'a4', 'a5'])
    expect(ids(d, 'SELECT zuweisung_id AS id FROM gram_stand')).toEqual(['a3'])
    expect(ids(d, 'SELECT zuweisung_id AS id FROM gram_gaeste')).toEqual([])
    expect(ids(d, 'SELECT id FROM nutzer')).toEqual(['g2'])
    // Zweiter Lauf: nichts mehr
    expect(grammatikKlasse10Loeschen(d)).toMatch(/^0 Grammatiktrainings/)
  })
  it('Klassenname', () => {
    expect([istKlasse10('10b'), istKlasse10(' 10 a'), istKlasse10('100'), istKlasse10('9a'), istKlasse10('Kurs 10')]).toEqual([true, true, false, false, false])
  })
})
