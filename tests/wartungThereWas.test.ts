import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { geschuetzt } from '../src/server/feldschutz'
import { hatThereWas, thereWasEntfernen } from '../src/server/wartungThereWas'
import { wartungAusfuehren } from '../src/server/wartung'
import type { GrammatikAufgabe, GrammatikPaket } from '../src/shared/grammatiktrainer'

/*
 * Einmalige Bereinigung (09.10.2026): „There was / There were" aus „There is / There are" in Klasse 5 entfernen –
 * gegen eine Test-Datenbank mit verschlüsselten Feldern (geschützter Zugang wie beim Start).
 */
const A = (id: string, x: Partial<GrammatikAufgabe>): GrammatikAufgabe => ({ id, art: 'luecke', regelId: 'r1', anweisung: 'Setze ein.', satz: '', loesungen: [], ...x })
const AUFGABEN: GrammatikAufgabe[] = [
  A('a1', { satz: 'There ___ a cat in the garden.', loesungen: ['is'] }),
  A('a2', { satz: 'There ___ a storm last night.', loesungen: ['was'] }),
  A('a3', { art: 'umformen', satz: 'There are two dogs.', loesungen: ['There were two dogs.'] }),
  A('a4', { art: 'satzbau', teile: ['Were', 'there', 'any', 'shops?'], loesungen: ['Were there any shops?'] }),
  A('a5', { satz: 'There ___ three chairs.', loesungen: ['are'] }),
  A('a6', { art: 'fehler', satz: 'THERE WAS a bike.', fehlerWort: 'WAS', loesungen: ['is'] })
]
const PAKET: GrammatikPaket = {
  thema: 'There is / There are',
  regeln: [{ id: 'r1', titel: 'there is / are', erklaerung: 'Es gibt.', beispiele: ['There is a desk.', 'There was a storm.'] }],
  aufgaben: AUFGABEN
}

function probeDb(): { d: DatabaseSync; roh: DatabaseSync } {
  const roh = new DatabaseSync(':memory:')
  roh.exec(`
    CREATE TABLE gram_zuweisungen (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL, lerngruppe_id TEXT NOT NULL DEFAULT '',
      schueler TEXT NOT NULL DEFAULT '[]', titel TEXT NOT NULL, fach TEXT NOT NULL DEFAULT '', sprache TEXT NOT NULL DEFAULT '',
      thema TEXT NOT NULL DEFAULT '', paket TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'offen', erstellt TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '', bis INTEGER, vok_id TEXT NOT NULL DEFAULT '', art TEXT NOT NULL DEFAULT '',
      info TEXT NOT NULL DEFAULT '', problem_aus TEXT NOT NULL DEFAULT '');
    CREATE TABLE lerngruppen (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, mitglieder TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE vok_zuweisungen (id TEXT PRIMARY KEY, lerngruppe_id TEXT NOT NULL DEFAULT '');
    CREATE TABLE nutzer (id TEXT PRIMARY KEY, benutzer TEXT NOT NULL DEFAULT '', benutzer_v TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', quelle TEXT NOT NULL DEFAULT '');
  `)
  const d = geschuetzt(roh)
  d.prepare('INSERT INTO lerngruppen (id, name) VALUES (?, ?)').run('grp5b', '5b')
  d.prepare('INSERT INTO lerngruppen (id, name) VALUES (?, ?)').run('grp7a', '7a')
  d.prepare('INSERT INTO vok_zuweisungen (id, lerngruppe_id) VALUES (?, ?)').run('kurs5', 'grp5b')
  const neu = d.prepare(
    'INSERT INTO gram_zuweisungen (id, lehrkraft_id, lerngruppe_id, titel, thema, paket, erstellt, vok_id, info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const p = JSON.stringify(PAKET)
  // 1. Kurs der 5b (Lerngruppe nur über den Kurs), Jahrgang stand irrtümlich auf 6 – Thema per Katalogkennung
  neu.run('g1', 'l1', '', 'There is / There are', 'There is / There are', p, '2026-10-08', 'kurs5', JSON.stringify({ themen: ['en.verb.there_is'], jahrgang: 6 }))
  // 2. Jahrgang 5 ohne Lerngruppe, Thema nur am Titel
  neu.run('g2', 'l1', '', 'There is/are', 'There is/are', p, '2026-10-08', '', JSON.stringify({ themen: [], jahrgang: 5 }))
  // 3. Klasse 7 – bleibt
  neu.run('g3', 'l1', 'grp7a', 'There is / There are', 'There is / There are', p, '2026-10-08', '', JSON.stringify({ themen: ['en.verb.there_is'], jahrgang: 7 }))
  // 4. Anderes Thema in Klasse 5 – bleibt
  neu.run('g4', 'l1', 'grp5b', 'Simple past', 'Simple past', JSON.stringify({ ...PAKET, thema: 'Simple past' }), '2026-10-08', '', JSON.stringify({ themen: ['en.verb.past_simple'], jahrgang: 5 }))
  return { d, roh }
}

const paketVon = (d: DatabaseSync, id: string): GrammatikPaket =>
  JSON.parse((d.prepare('SELECT paket FROM gram_zuweisungen WHERE id = ?').get(id) as { paket: string }).paket) as GrammatikPaket

describe('There was/were aus Klasse 5 entfernen', () => {
  beforeEach(() => setzeSchluesselFuerTests(randomBytes(32)))

  it('erkennt Satz, Lösung, eingesetzte Lösung, Teile und Fragen – Groß/Klein egal', () => {
    expect(AUFGABEN.map((a) => hatThereWas(a))).toEqual([false, true, true, true, false, true])
  })

  it('entfernt nur dort, behält die übrigen Kennungen, verschlüsselt bleibt verschlüsselt', () => {
    const { d, roh } = probeDb()
    expect(thereWasEntfernen(d)).toBe('8 Aufgaben mit „there was/were" aus 2 Paketen „There is / There are" (Klasse 5) entfernt')
    for (const id of ['g1', 'g2']) {
      const p = paketVon(d, id)
      expect(p.aufgaben.map((a) => a.id)).toEqual(['a1', 'a5'])
      expect(p.regeln[0].beispiele).toEqual(['There is a desk.'])
    }
    expect(paketVon(d, 'g3').aufgaben).toHaveLength(6)
    expect(paketVon(d, 'g4').aufgaben).toHaveLength(6)
    // Im Speicher weiter verschlüsselt
    expect((roh.prepare("SELECT paket FROM gram_zuweisungen WHERE id = 'g1'").get() as { paket: string }).paket.startsWith('v1:')).toBe(true)
    // Zweiter Lauf: nichts mehr
    expect(thereWasEntfernen(d)).toMatch(/^0 Aufgaben .* aus 0 Paketen/)
  })

  it('läuft beim Start genau einmal', () => {
    const { d } = probeDb()
    wartungAusfuehren(d)
    expect(d.prepare("SELECT 1 FROM wartung WHERE name = 'there-was-klasse5-2026-10-09'").get()).toBeTruthy()
    expect(paketVon(d, 'g1').aufgaben).toHaveLength(2)
  })
})
