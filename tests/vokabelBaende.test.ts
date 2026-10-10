import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { geschuetzt } from '../src/server/feldschutz'
import { abschnitteEinordnen, abschnittStatistik, baendeVon, mitBaenden, nachBaenden, type KursTeil } from '../src/shared/kursAbschnitte'
import { baendeErgaenzen } from '../src/shared/vokabelBaende'
import type { BuchFuerTeilen } from '../src/shared/abschnitteTeilen'
import { kursAbschnitteTeilen } from '../src/shared/abschnitteTeilen'
import { alleLehrwerke, lehrwerkName } from '../src/server/wartungAbschnitteTeilen'
import { kandidaten, vokabelBaende } from '../src/server/wartungVokabelBaende'
import { teileNachBaenden } from '../src/renderer/src/modules/lernen/kurs/AbschnitteVerwalten'

/*
 * Mehrere Bände in einem Kurs (10.10.2026, Befund der Lehrkraft): Vokabeln aus Green Line 1 UND Green Line 2 in einem
 * Kurs – „Units", Wortliste und „Abschnitte und Stand der Lernenden" zeigten nur EINEN Band. Ursache: Abschnitte ohne
 * Lehrwerk-Kennung erbten den Band aus der Herkunft des Kurses, und die nennt nach dem Hinzufügen nur noch den neuesten.
 */
const buch = (id: string): BuchFuerTeilen => JSON.parse(readFileSync(`resources/lehrwerke/${id}.json`, 'utf8')) as BuchFuerTeilen
const GL1 = buch('green-line-1')
const GL2 = buch('green-line-2')

/** Wörter eines Lehrwerk-Abschnitts wie bei der Freigabe (VokabelQuelle.tsx) */
function woerterAus(b: BuchFuerTeilen, unit: string, abschnitt: string, praefix: string): { id: string; term: string; translation: string }[] {
  const s = b.units.find((u) => u.name === unit)!.sections.find((x) => x.name === abschnitt)!
  return s.entries.filter((e) => !e.explained && e.term && e.translation).map((e, i) => ({ id: `${praefix}${i}`, term: e.term, translation: e.translation }))
}

const GL1_U3_S1 = woerterAus(GL1, 'Unit 3', 'Station 1', 'a')
const GL1_U3_S2 = woerterAus(GL1, 'Unit 3', 'Station 2', 'b')
const GL2_U1_S1 = woerterAus(GL2, 'Unit 1', 'Station 1', 'c')
const WOERTER = [...GL1_U3_S1, ...GL1_U3_S2, ...GL2_U1_S1]
// Herkunft nach dem Hinzufügen von Green Line 2: nur noch der neueste Band (server/vokabeln.ts `quelleZusammen`)
const QUELLE = { lehrwerk: 'green-line-2', unit: 'Unit 1', abschnitte: ['Station 1'] }

/** Kurs der Klasse (Titel ohne Band): GL1-Abschnitte von vor dem 09.10.2026 ohne Kennung, GL2 mit */
const ALT: KursTeil[] = [
  { titel: 'Station 1', anzahl: GL1_U3_S1.length, zeit: 100 },
  { titel: 'Station 2', anzahl: GL1_U3_S2.length, zeit: 200 },
  { titel: 'Station 1', anzahl: GL2_U1_S1.length, zeit: 300, lehrwerk: 'green-line-2' }
]

describe('Bände je Abschnitt', () => {
  it('Befund: ohne Kennung fallen ältere Abschnitte in den neuesten Band', () => {
    const e = mitBaenden(ALT, abschnitteEinordnen(ALT, QUELLE), QUELLE, 'Englisch')
    expect(new Set(e.map((x) => x.buch))).toEqual(new Set(['Green Line 2']))
  })

  it('Kennung (und Unit) je Abschnitt: beide Bände, neuester zuerst', () => {
    const neu = baendeErgaenzen(ALT, WOERTER, [GL1, GL2])!
    expect(neu.map((t) => t.lehrwerk)).toEqual(['green-line-1', 'green-line-1', 'green-line-2'])
    expect(neu.slice(0, 2).map((t) => t.unit)).toEqual(['Unit 3', 'Unit 3'])
    const e = mitBaenden(neu, abschnitteEinordnen(neu, QUELLE), QUELLE, 'Englisch')
    expect(e.map((x) => `${x.buch}|${x.unit}|${x.name}`)).toEqual([
      'Green Line 1|Unit 3|Station 1',
      'Green Line 1|Unit 3|Station 2',
      'Green Line 2|Unit 1|Station 1'
    ])
    const statistik = abschnittStatistik(neu, WOERTER, [], e, 1000)
    const gruppen = nachBaenden(statistik)
    expect(gruppen.map((g) => g.buch)).toEqual(['Green Line 2', 'Green Line 1'])
    expect(gruppen[1].units.map((u) => [u.unit, u.zeilen.length])).toEqual([['Unit 3', 2]])
    // Kursname nennt beide Bände
    expect(baendeVon('Englisch', e, QUELLE)).toEqual(['Green Line 1', 'Green Line 2'])
    // Wortliste („X Wörter") je Band: neuester oben, Stellen der Abschnitte bleiben
    const liste = teileNachBaenden(neu.map((t, i) => ({ ...t, buch: e[i].buch, unit: e[i].unit })))
    expect(liste.map((b) => [b.buch, b.zeilen.map((z) => z.i), b.units])).toEqual([
      ['Green Line 2', [2], 1],
      ['Green Line 1', [0, 1], 1]
    ])
  })

  it('Band im Titel, eigene Liste und nichts Passendes', () => {
    const t = [
      { titel: 'Green Line 1 - Unit 1 - Check-in', anzahl: 1, zeit: 1 },
      { titel: 'Weather', anzahl: 2, zeit: 2 }
    ]
    const w = [
      { id: 'x', term: 'hello', translation: 'hallo' },
      { id: 'y', term: 'qwertz', translation: 'asdf' },
      { id: 'z', term: 'yxcv', translation: 'bnm' }
    ]
    const neu = baendeErgaenzen<{ titel: string; anzahl: number; zeit: number; lehrwerk?: string }, (typeof w)[number]>(t, w, [GL1, GL2])!
    expect(neu.map((x) => x.lehrwerk)).toEqual(['green-line-1', undefined])
    expect(baendeErgaenzen(neu, w, [GL1, GL2])).toBeNull()
  })

  it('Namen der Lehrwerke aus den Dateien – auch Platzhalter', () => {
    expect(lehrwerkName('green-line-2')).toBe('Green Line 2')
    expect(lehrwerkName('apuntate-2016-1')).toBe('¡Apúntate! 1')
    expect(lehrwerkName('gibt-es-nicht-9')).toBe('')
    const teile = [
      { titel: 'Lección 1', anzahl: 1, zeit: 1, lehrwerk: 'apuntate-2016-1' },
      { titel: 'Lección 1', anzahl: 1, zeit: 2, lehrwerk: 'apuntate-2016-2' }
    ]
    const e = mitBaenden(teile, abschnitteEinordnen(teile, null), null, '', lehrwerkName)
    // ohne erkannte Unit: der Band kommt aus der Kennung
    expect(e.map((x) => x.buch)).toEqual(['¡Apúntate! 1', '¡Apúntate! 2'])
    expect(nachBaenden(abschnittStatistik(teile, [{ id: 'a', term: 'a', translation: 'a' }, { id: 'b', term: 'b', translation: 'b' }], [], e)).map((g) => g.buch)).toEqual([
      '¡Apúntate! 2',
      '¡Apúntate! 1'
    ])
  })

  it('Geteilte Abschnitte behalten ihr Lehrwerk', () => {
    const w = [...woerterAus(GL1, 'Unit 1', 'Check-in', 'p'), ...woerterAus(GL1, 'Unit 1', 'Station 1', 'q')]
    const r = kursAbschnitteTeilen([{ titel: 'Green Line 1 - Unit 1 - Check-in, Station 1', anzahl: w.length, zeit: 1 }], w, { lehrwerk: 'green-line-1' }, () => GL1)!
    expect(r.teile.map((t) => [(t as { lehrwerk?: string }).lehrwerk, t.titel])).toEqual([
      ['green-line-1', 'Unit 1 · Check-in'],
      ['green-line-1', 'Unit 1 · Station 1']
    ])
  })

  it('Kandidaten: die Reihe der Herkunft', () => {
    const ids = kandidaten(alleLehrwerke(), QUELLE, []).map((b) => b.id)
    expect(ids).toContain('green-line-1')
    expect(ids).toContain('green-line-2')
    expect(ids.some((i) => i?.startsWith('decouvertes'))).toBe(false)
  })
})

describe('Wartung vokabel-baende-2026-10-10', () => {
  beforeEach(() => setzeSchluesselFuerTests(randomBytes(32)))

  it('trägt die Bände nach, zweiter Lauf ändert nichts', () => {
    const roh = new DatabaseSync(':memory:')
    roh.exec(`CREATE TABLE vok_zuweisungen (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL DEFAULT '', titel TEXT NOT NULL,
      woerter TEXT NOT NULL, erstellt TEXT NOT NULL, quelle TEXT NOT NULL DEFAULT '', teile TEXT NOT NULL DEFAULT '')`)
    const d = geschuetzt(roh)
    const neu = d.prepare('INSERT INTO vok_zuweisungen (id, lehrkraft_id, titel, woerter, erstellt, quelle, teile) VALUES (?, ?, ?, ?, ?, ?, ?)')
    neu.run('k6b', 'lk', 'Englisch', JSON.stringify(WOERTER), '2026-09-01', JSON.stringify(QUELLE), JSON.stringify(ALT))
    neu.run('eigen', 'lk', 'Weather', JSON.stringify([{ id: 'a', term: 'rain', translation: 'Regen' }]), '2026-09-01', '', '')
    expect(vokabelBaende(d)).toBe('2 Abschnitte in 1 Kursen mit Band versehen')
    const teile = JSON.parse((d.prepare("SELECT teile FROM vok_zuweisungen WHERE id = 'k6b'").get() as { teile: string }).teile) as KursTeil[]
    expect(teile.map((t) => t.lehrwerk)).toEqual(['green-line-1', 'green-line-1', 'green-line-2'])
    expect((d.prepare("SELECT teile FROM vok_zuweisungen WHERE id = 'eigen'").get() as { teile: string }).teile).toBe('')
    expect(vokabelBaende(d)).toMatch(/^0 Abschnitte/)
  })
})
