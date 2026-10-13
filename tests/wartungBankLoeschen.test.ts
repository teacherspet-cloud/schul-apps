import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { grammatikBankLoeschen } from '../src/server/wartungBankLoeschen'

/* Bank leeren (13.10.2026, von der Lehrkraft gewünscht): Bank, Regelkarten und die Kurs-Trainings daraus – andere bleiben */
describe('grammatikBankLoeschen', () => {
  it('löscht Bank und Bank-Trainings samt Lernstand, lässt andere Grammatik stehen', () => {
    const d = new DatabaseSync(':memory:')
    d.exec(`CREATE TABLE server_einstellungen (schluessel TEXT PRIMARY KEY, wert TEXT);
      CREATE TABLE gram_zuweisungen (id TEXT PRIMARY KEY, info TEXT);
      CREATE TABLE gram_stand (zuweisung_id TEXT, schueler_id TEXT);
      CREATE TABLE gram_gaeste (zuweisung_id TEXT, nutzer_id TEXT);
      CREATE TABLE gram_bank (id TEXT PRIMARY KEY);
      CREATE TABLE gram_bank_regel (schluessel TEXT PRIMARY KEY);`)
    d.prepare('INSERT INTO gram_zuweisungen VALUES (?, ?)').run('z1', JSON.stringify({ bank: ['en.a/x'] }))
    d.prepare('INSERT INTO gram_zuweisungen VALUES (?, ?)').run('z2', JSON.stringify({ themen: ['en.a'] }))
    d.prepare('INSERT INTO gram_stand VALUES (?, ?)').run('z1', 's1')
    d.prepare('INSERT INTO gram_stand VALUES (?, ?)').run('z2', 's1')
    d.prepare('INSERT INTO gram_bank VALUES (?)').run('b1')
    d.prepare('INSERT INTO gram_bank_regel VALUES (?)').run('en.a/x')
    expect(grammatikBankLoeschen(d)).toBe('1 Bank-Aufgaben und 1 Regelkarten gelöscht, 1 Kurs-Trainings aus der Bank (1 Lernstände)')
    expect(d.prepare('SELECT id FROM gram_zuweisungen').all()).toEqual([{ id: 'z2' }])
    expect(d.prepare('SELECT zuweisung_id FROM gram_stand').all()).toEqual([{ zuweisung_id: 'z2' }])
    expect(Number((d.prepare('SELECT COUNT(*) n FROM gram_bank').get() as { n: number }).n)).toBe(0)
    expect(
      Number(JSON.parse((d.prepare("SELECT wert FROM server_einstellungen WHERE schluessel = 'grammatik-bank-geleert'").get() as { wert: string }).wert))
    ).toBeGreaterThan(0)
  })
})
