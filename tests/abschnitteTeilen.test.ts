import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { geschuetzt } from '../src/server/feldschutz'
import { abschnitteImTitel, kursAbschnitteTeilen, teilAufteilen, type BuchFuerTeilen } from '../src/shared/abschnitteTeilen'
import { abschnitteTeilen, buchSync } from '../src/server/wartungAbschnitteTeilen'
import { wartungAusfuehren } from '../src/server/wartung'

/*
 * Zusammengefasste Vokabel-Abschnitte teilen (09.10.2026): Befund 5b – ein Abschnitt „Unit 1: Check-in, Station 1,
 * Station 2" aus Green Line 1 wird zu drei Abschnitten mit ihren Wörtern; Kennungen, Zeit und Lernstand bleiben.
 */
const GL1 = JSON.parse(readFileSync('resources/lehrwerke/green-line-1.json', 'utf8')) as BuchFuerTeilen & {
  units: { name: string; sections: { name: string; entries: { term: string; translation: string; explained?: boolean }[] }[] }[]
}
const ABSCHNITTE = ['Check-in', 'Station 1', 'Station 2']

/** Wörter wie bei der Erstfreigabe (VokabelQuelle.tsx): Kennung b<Abschnitt>-<Nr>, Doppeltes übersprungen */
function erstfreigabe(): { id: string; term: string; translation: string }[] {
  const unit = GL1.units.find((u) => u.name === 'Unit 1')!
  const da = new Set<string>()
  return unit.sections
    .filter((s) => ABSCHNITTE.includes(s.name))
    .flatMap((s, si) =>
      s.entries
        .filter((e) => !e.explained && e.term && e.translation)
        .map((e, i) => ({ id: `b${si}-${i}`, term: e.term, translation: e.translation }))
    )
    .filter((w) => {
      const k = `${w.term.trim().toLowerCase()}|${w.translation.trim().toLowerCase()}`
      if (da.has(k)) return false
      da.add(k)
      return true
    })
}
const zahlen = (): number[] => {
  const w = erstfreigabe()
  return [0, 1, 2].map((si) => w.filter((x) => x.id.startsWith(`b${si}-`)).length)
}

describe('Abschnitte im Titel', () => {
  it('erkennt alle Titelformen', () => {
    const p = (t: string, q?: object) => abschnitteImTitel(t, GL1, q)?.map((x) => `${x.unit}/${x.abschnitt}`)
    expect(p('Green Line 1 - Unit 1 - Check-in, Station 1, Station 2')).toEqual(['Unit 1/Check-in', 'Unit 1/Station 1', 'Unit 1/Station 2'])
    expect(p('Unit 1: Check-in, Station 1, Station 2')).toEqual(['Unit 1/Check-in', 'Unit 1/Station 1', 'Unit 1/Station 2'])
    expect(p('Green Line 1 - Hello: Station 3 - Unit 1: Check-in')).toEqual(['Hello/Station 3', 'Unit 1/Check-in'])
    expect(p('Unit 1 · Station 1')).toEqual(['Unit 1/Station 1'])
    expect(p('Check-in, Station 1', { lehrwerk: 'green-line-1', unit: 'Unit 1', abschnitte: ['Check-in', 'Station 1'] })).toEqual([
      'Unit 1/Check-in',
      'Unit 1/Station 1'
    ])
    expect(p('Green Line 1 - Unit 9 - Check-in, Station 1')).toBeUndefined()
    expect(p('Weather, Seasons')).toBeUndefined()
  })
})

describe('Abschnitt teilen (Green Line 1, 5b)', () => {
  it('teilt in Buchreihenfolge, Kennungen und Zeit bleiben', () => {
    const woerter = erstfreigabe()
    const teil = { titel: 'Green Line 1 - Unit 1 - Check-in, Station 1, Station 2', anzahl: woerter.length, zeit: 123, ab: 456 }
    const r = teilAufteilen(teil, woerter, GL1)!
    expect(r.teile.map((t) => t.titel)).toEqual(['Unit 1 · Check-in', 'Unit 1 · Station 1', 'Unit 1 · Station 2'])
    expect(r.teile.map((t) => t.anzahl)).toEqual(zahlen())
    expect(r.teile.every((t) => t.zeit === 123 && t.ab === 456)).toBe(true)
    expect(r.woerter.map((w) => w.id).sort()).toEqual(woerter.map((w) => w.id).sort())
  })

  it('ordnet ohne Kennungs-Hinweis über Begriff und Übersetzung zu, Unbekanntes bleibt im ersten Teil', () => {
    const woerter = erstfreigabe()
      .reverse()
      .map((w, i) => ({ ...w, id: `w${i}` }))
    woerter.push({ id: 'eigen', term: 'my own word', translation: 'mein eigenes Wort' })
    const r = teilAufteilen({ titel: 'Unit 1: Check-in, Station 1, Station 2', anzahl: woerter.length, zeit: 1 }, woerter, GL1)!
    const n = zahlen()
    expect(r.teile.map((t) => t.anzahl)).toEqual([n[0] + 1, n[1], n[2]])
    expect(r.woerter.slice(0, n[0] + 1).some((w) => w.id === 'eigen')).toBe(true)
  })

  it('teilt im ganzen Kurs nur zusammengefasste Abschnitte und hält die übrigen Bereiche fest', () => {
    const erst = erstfreigabe()
    const spaeter = [
      { id: 'x1', term: 'one', translation: 'eins' },
      { id: 'x2', term: 'two', translation: 'zwei' }
    ]
    const teile = [
      { titel: 'Green Line 1 - Unit 1 - Check-in, Station 1, Station 2', anzahl: erst.length, zeit: 10 },
      { titel: 'Station 3', anzahl: 2, zeit: 20 }
    ]
    const r = kursAbschnitteTeilen(teile, [...erst, ...spaeter], { lehrwerk: 'green-line-1' }, () => GL1)!
    expect(r.geteilt).toBe(1)
    expect(r.teile.map((t) => t.titel)).toEqual(['Unit 1 · Check-in', 'Unit 1 · Station 1', 'Unit 1 · Station 2', 'Station 3'])
    expect(r.woerter.slice(-2).map((w) => w.id)).toEqual(['x1', 'x2'])
    // Zweiter Lauf: nichts mehr zu teilen
    expect(kursAbschnitteTeilen(r.teile, r.woerter, { lehrwerk: 'green-line-1' }, () => GL1)).toBeNull()
  })

  it('teilt nicht, wenn das Lehrwerk nicht passt', () => {
    const woerter = [
      { id: 'a', term: 'foo', translation: 'bar' },
      { id: 'b', term: 'baz', translation: 'qux' }
    ]
    expect(teilAufteilen({ titel: 'Unit 1: Check-in, Station 1', anzahl: 2, zeit: 1 }, woerter, GL1)).toBeNull()
  })

  it('findet das Lehrwerk der Herkunft oder über den Band im Titel', () => {
    expect(buchSync('green-line-1', '')?.name).toBe('Green Line 1')
    expect(buchSync('green-line-2', 'Green Line 1')?.name).toBe('Green Line 1')
    expect(buchSync('', 'Gibt es nicht 9')).toBeNull()
  })
})

describe('Wartung abschnitte-teilen-2026-10-09', () => {
  beforeEach(() => setzeSchluesselFuerTests(randomBytes(32)))

  function probeDb(): { d: DatabaseSync; roh: DatabaseSync } {
    const roh = new DatabaseSync(':memory:')
    roh.exec(`CREATE TABLE vok_zuweisungen (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL DEFAULT '', titel TEXT NOT NULL,
      woerter TEXT NOT NULL, erstellt TEXT NOT NULL, quelle TEXT NOT NULL DEFAULT '', teile TEXT NOT NULL DEFAULT '');
      CREATE TABLE vok_stand (zuweisung_id TEXT NOT NULL, schueler_id TEXT NOT NULL, daten TEXT NOT NULL);`)
    const d = geschuetzt(roh)
    const neu = d.prepare('INSERT INTO vok_zuweisungen (id, lehrkraft_id, titel, woerter, erstellt, quelle, teile) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const q = JSON.stringify({ lehrwerk: 'green-line-1', unit: 'Unit 1', abschnitte: ABSCHNITTE })
    // 5b: ohne `teile` – der Titel-Teil fasst drei Abschnitte zusammen
    neu.run('k5b', 'lk', 'Green Line 1 - Unit 1 - Check-in, Station 1, Station 2', JSON.stringify(erstfreigabe()), '2026-09-01T08:00:00.000Z', q, '')
    // Eigene Liste ohne Herkunft – bleibt
    neu.run('eigen', 'lk', 'Weather, Seasons', JSON.stringify([{ id: 'a', term: 'rain', translation: 'Regen' }, { id: 'b', term: 'sun', translation: 'Sonne' }]), '2026-09-01', '', '')
    d.prepare('INSERT INTO vok_stand (zuweisung_id, schueler_id, daten) VALUES (?, ?, ?)').run('k5b', 's1', JSON.stringify({ woerter: { 'b1-0': { fach: 3 } }, tage: [] }))
    return { d, roh }
  }

  it('teilt den Kurs der 5b, Lernstand und Kennungen bleiben, zweiter Lauf ändert nichts', () => {
    const { d } = probeDb()
    expect(abschnitteTeilen(d)).toBe('1 Kurse mit zusammengefassten Abschnitten geteilt (2 Abschnitte mehr)')
    const z = d.prepare("SELECT woerter, teile FROM vok_zuweisungen WHERE id = 'k5b'").get() as { woerter: string; teile: string }
    const teile = JSON.parse(z.teile) as { titel: string; anzahl: number; zeit: number }[]
    expect(teile.map((t) => t.titel)).toEqual(['Unit 1 · Check-in', 'Unit 1 · Station 1', 'Unit 1 · Station 2'])
    expect(teile.map((t) => t.anzahl)).toEqual(zahlen())
    expect(teile.every((t) => t.zeit === Date.parse('2026-09-01T08:00:00.000Z'))).toBe(true)
    const ids = (JSON.parse(z.woerter) as { id: string }[]).map((w) => w.id)
    expect(ids.sort()).toEqual(erstfreigabe().map((w) => w.id).sort())
    expect(JSON.parse((d.prepare("SELECT daten FROM vok_stand WHERE zuweisung_id = 'k5b'").get() as { daten: string }).daten).woerter['b1-0'].fach).toBe(3)
    expect((d.prepare("SELECT teile FROM vok_zuweisungen WHERE id = 'eigen'").get() as { teile: string }).teile).toBe('')
    expect(abschnitteTeilen(d)).toMatch(/^0 Kurse/)
  })

  it('verträgt schlanke Datenbanken und läuft beim Start genau einmal', () => {
    const leer = geschuetzt(new DatabaseSync(':memory:'))
    expect(abschnitteTeilen(leer)).toBe('keine Kurse – nichts geändert')
    const schlank = new DatabaseSync(':memory:')
    schlank.exec('CREATE TABLE vok_zuweisungen (id TEXT PRIMARY KEY, lerngruppe_id TEXT)')
    expect(abschnitteTeilen(geschuetzt(schlank))).toMatch(/fehlt – nichts geändert/)
    const { d } = probeDb()
    wartungAusfuehren(d)
    expect(d.prepare("SELECT 1 FROM wartung WHERE name = 'abschnitte-teilen-2026-10-09'").get()).toBeTruthy()
    expect(JSON.parse((d.prepare("SELECT teile FROM vok_zuweisungen WHERE id = 'k5b'").get() as { teile: string }).teile)).toHaveLength(3)
  })
})
