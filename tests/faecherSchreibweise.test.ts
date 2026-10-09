import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { fachSchreibweise } from '../src/shared/faecher'
import { faecherVereinheitlichen, wartungAusfuehren } from '../src/server/wartung'

/*
 * Fachnamen in der Schreibweise des Katalogs (08.10.2026, Befund der Lehrkraft in „Meine Klassen": ältere Lerngruppen
 * hießen „englisch" – gewählt, bevor es den Fächerkatalog gab). Anzeige und einmalige Wartung der Datenbank.
 */
describe('fachSchreibweise (rein)', () => {
  it('bringt Anzeigenamen in die Schreibweise des Katalogs', () => {
    expect(fachSchreibweise('englisch')).toBe('Englisch')
    expect(fachSchreibweise('ENGLISCH')).toBe('Englisch')
    expect(fachSchreibweise(' französisch ')).toBe('Französisch')
    expect(fachSchreibweise('Englisch')).toBe('Englisch')
  })
  it('macht aus Kennungen den Anzeigenamen', () => {
    expect(fachSchreibweise('werte-und-normen')).toBe('Werte und Normen')
    expect(fachSchreibweise('daz')).toBe('Deutsch als Zweitsprache (DaZ)')
  })
  it('behält den gewählten Landesnamen und korrigiert nur dessen Schreibweise', () => {
    expect(fachSchreibweise('erdkunde')).toBe('Erdkunde')
    expect(fachSchreibweise('Politik')).toBe('Politik')
    expect(fachSchreibweise('nawi')).toBe('NaWi')
  })
  it('lässt Unbekanntes, Leeres und „anderes" unverändert', () => {
    expect(fachSchreibweise('Förderunterricht')).toBe('Förderunterricht')
    expect(fachSchreibweise('')).toBe('')
    expect(fachSchreibweise('anderes')).toBe('anderes')
  })
})

/** Ausschnitt der Server-Tabellen – nur die Spalten, die die Wartung braucht */
function probeDb(): DatabaseSync {
  const d = new DatabaseSync(':memory:')
  d.exec(`
    CREATE TABLE lerngruppen (id TEXT PRIMARY KEY, name TEXT NOT NULL, fach TEXT NOT NULL DEFAULT '', mitglieder TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE vok_zuweisungen (id TEXT PRIMARY KEY, fach TEXT NOT NULL DEFAULT '');
    CREATE TABLE blatt_freigaben (id TEXT PRIMARY KEY, fach TEXT NOT NULL DEFAULT '');
    CREATE TABLE fach_freigaben (id TEXT PRIMARY KEY, fach TEXT NOT NULL);
    CREATE TABLE onlinetests (id TEXT PRIMARY KEY, einstellungen TEXT NOT NULL);
  `)
  const lg = d.prepare('INSERT INTO lerngruppen (id, name, fach) VALUES (?, ?, ?)')
  lg.run('g1', '5b', 'englisch')
  lg.run('g2', '5b', 'Geschichte')
  lg.run('g3', '6a', 'Förderunterricht')
  lg.run('g4', '6a', '')
  lg.run('g5', '7c', 'erdkunde')
  d.prepare('INSERT INTO vok_zuweisungen (id, fach) VALUES (?, ?)').run('v1', 'englisch')
  d.prepare('INSERT INTO blatt_freigaben (id, fach) VALUES (?, ?)').run('b1', 'ENGLISCH')
  // Fachschaft führt Kennungen – bleibt unberührt
  d.prepare('INSERT INTO fach_freigaben (id, fach) VALUES (?, ?)').run('f1', 'englisch')
  d.prepare('INSERT INTO onlinetests (id, einstellungen) VALUES (?, ?)').run('t1', JSON.stringify({ art: 'Lernzielkontrolle', fach: 'englisch', zeitMin: 45 }))
  d.prepare('INSERT INTO onlinetests (id, einstellungen) VALUES (?, ?)').run('t2', JSON.stringify({ zeitMin: 20 }))
  return d
}

const faecher = (d: DatabaseSync, tabelle: string): Record<string, string> =>
  Object.fromEntries((d.prepare(`SELECT id, fach FROM ${tabelle}`).all() as { id: string; fach: string }[]).map((z) => [z.id, z.fach]))

describe('Wartung: Fachnamen vereinheitlichen', () => {
  it('ändert nur, was der Katalog kennt, und fehlende Tabellen stören nicht', () => {
    const d = probeDb()
    expect(faecherVereinheitlichen(d)).toBe(5)
    expect(faecher(d, 'lerngruppen')).toEqual({ g1: 'Englisch', g2: 'Geschichte', g3: 'Förderunterricht', g4: '', g5: 'Erdkunde' })
    expect(faecher(d, 'vok_zuweisungen')).toEqual({ v1: 'Englisch' })
    expect(faecher(d, 'blatt_freigaben')).toEqual({ b1: 'Englisch' })
    expect(faecher(d, 'fach_freigaben')).toEqual({ f1: 'englisch' })
    const t1 = JSON.parse((d.prepare("SELECT einstellungen FROM onlinetests WHERE id = 't1'").get() as { einstellungen: string }).einstellungen)
    expect(t1).toEqual({ art: 'Lernzielkontrolle', fach: 'Englisch', zeitMin: 45 })
    // Ein zweiter Lauf ändert nichts mehr
    expect(faecherVereinheitlichen(d)).toBe(0)
  })

  it('läuft beim Start genau einmal', () => {
    const d = probeDb()
    wartungAusfuehren(d)
    expect(faecher(d, 'lerngruppen').g1).toBe('Englisch')
    const erledigt = (d.prepare('SELECT name FROM wartung ORDER BY name').all() as { name: string }[]).map((z) => z.name)
    expect(erledigt).toEqual([
      'abkuerzung-ton-2026-10-09',
      'abschnitte-teilen-2026-10-09',
      'codes-hmac-2026-10-08',
      'faecher-schreibweise-2026-10-08',
      'grammatik-je-thema-2026-10-08',
      'grammatik-klasse10-loeschen-2026-10-09',
      'klartext-reste-2026-10-08',
      'namen-korrigieren-2026-10-09',
      'rekorde-zeit-2026-10-08',
      'there-was-klasse5-2026-10-09'
    ])
    // Danach Eingetragenes bleibt beim nächsten Start, wie es ist (die Wartung ist erledigt)
    d.prepare("UPDATE lerngruppen SET fach = 'englisch' WHERE id = 'g1'").run()
    wartungAusfuehren(d)
    expect(faecher(d, 'lerngruppen').g1).toBe('englisch')
  })
})
