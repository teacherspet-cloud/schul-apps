import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { fachHinzufuegen, lerngruppenVon } from '../src/server/onlinetest'
import {
  klassenKurseSichern,
  quelleBereinigt,
  quelleZusammen,
  sprachfaecherDerGruppe,
  ueberschriftVon,
  vokabelListenFuer,
  vokabelnZuweisen,
  vokabelRoute,
  zeile
} from '../src/server/vokabeln'
import { hoechsteUnit } from '../src/server/grammatik'
import { quelleText, quelleUnits } from '../src/shared/vokabelLaufbahn'
import { LEHRWERK_GRAMMATIK } from '../src/renderer/src/shared/lehrwerkGrammatik'
import type { Anfrage } from '../src/server/http'

/*
 * Sprachenlernen (08.10.2026, abgestimmt): mehrere Units in einem Kurs, ein Kurs je Klasse mit Fremdsprache (automatisch,
 * leer, für Lernende unsichtbar bis Inhalt da ist), Überschrift „6b - Englisch" ohne Jahr.
 */
describe('Herkunft mit mehreren Units', () => {
  it('bereinigt die neue Form: Units in Buchreihenfolge, höchste Unit und alle Abschnitte für ältere Leser', () => {
    const q = JSON.parse(
      quelleBereinigt({
        lehrwerk: 'green-line-1',
        units: [
          { unit: 'Unit 1', abschnitte: ['Station 1', 'Station 2'] },
          { unit: 'Unit 2', abschnitte: ['Station 1'] }
        ]
      })
    )
    expect(q).toEqual({
      lehrwerk: 'green-line-1',
      units: [
        { unit: 'Unit 1', abschnitte: ['Station 1', 'Station 2'] },
        { unit: 'Unit 2', abschnitte: ['Station 1'] }
      ],
      unit: 'Unit 2',
      abschnitte: ['Station 1', 'Station 2', 'Station 1']
    })
    expect(quelleUnits(q)).toHaveLength(2)
    expect(quelleText(q)).toBe('green-line-1 · Unit 1: Station 1, Station 2 · Unit 2: Station 1')
  })
  it('lässt die ältere Form (eine Unit) unverändert und erkennt sie als eine Unit', () => {
    const roh = { lehrwerk: 'green-line-1', unit: 'Unit 3', abschnitte: ['Station 2'] }
    expect(JSON.parse(quelleBereinigt(roh))).toEqual(roh)
    expect(quelleUnits(roh)).toEqual([{ unit: 'Unit 3', abschnitte: ['Station 2'] }])
    expect(quelleText(roh)).toBe('green-line-1 · Unit 3 · Station 2')
  })
  it('legt doppelte Units zusammen und verwirft Ungültiges', () => {
    const q = JSON.parse(
      quelleBereinigt({
        lehrwerk: 'gl',
        units: [
          { unit: 'Unit 1', abschnitte: ['A'] },
          { unit: '', abschnitte: ['X'] },
          { unit: 'Unit 1', abschnitte: ['A', 'B'] }
        ]
      })
    )
    expect(q).toEqual({ lehrwerk: 'gl', unit: 'Unit 1', abschnitte: ['A', 'B'] })
    expect(quelleBereinigt({ lehrwerk: 'Böse Kennung', unit: 'U', abschnitte: [] })).toBe('')
    expect(quelleBereinigt({ lehrwerk: 'gl', units: [] })).toBe('')
    expect(quelleBereinigt(null)).toBe('')
  })
  it('schreibt die Herkunft beim Hinzufügen fort (gleiches Lehrwerk: Units dazu, anderes: das neue gilt)', () => {
    const alt = quelleBereinigt({ lehrwerk: 'gl', unit: 'Unit 1', abschnitte: ['A'] })
    const neu = quelleBereinigt({ lehrwerk: 'gl', unit: 'Unit 2', abschnitte: ['B'] })
    expect(quelleUnits(JSON.parse(quelleZusammen(alt, neu))).map((u) => u.unit)).toEqual(['Unit 1', 'Unit 2'])
    expect(JSON.parse(quelleZusammen(alt, neu)).unit).toBe('Unit 2')
    const band2 = quelleBereinigt({ lehrwerk: 'gl2', unit: 'Unit 1', abschnitte: ['A'] })
    expect(quelleZusammen(alt, band2)).toBe(band2)
    expect(quelleZusammen(alt, '')).toBe(alt)
    expect(quelleZusammen('', neu)).toBe(neu)
  })
  it('höchste Unit für „bekannte Grammatik" berücksichtigt alle Units eines Kurses', () => {
    const units = Object.keys(LEHRWERK_GRAMMATIK['Green Line 1'])
    expect(units.length).toBeGreaterThanOrEqual(3)
    const mehrere = quelleBereinigt({
      lehrwerk: 'green-line-1-nds',
      units: [
        { unit: units[2], abschnitte: ['A'] },
        { unit: units[0], abschnitte: ['A'] }
      ]
    })
    // Auch wenn die höchste nicht die letzte ist: die höchste im Lehrwerk gewinnt
    expect(hoechsteUnit([mehrere])).toEqual({ buch: 'Green Line 1', unit: units[2] })
    expect(hoechsteUnit([quelleBereinigt({ lehrwerk: 'green-line-1-nds', unit: units[1], abschnitte: [] }), mehrere])).toEqual({
      buch: 'Green Line 1',
      unit: units[2]
    })
  })
})

describe('Sprachfächer einer Lerngruppe', () => {
  it('erkennt moderne und alte Fremdsprachen, nicht Deutsch, DaZ oder Sachfächer', () => {
    expect(sprachfaecherDerGruppe('Englisch')).toEqual([{ fach: 'Englisch', sprache: 'en', id: 'englisch' }])
    expect(sprachfaecherDerGruppe('englisch')).toEqual([{ fach: 'Englisch', sprache: 'en', id: 'englisch' }])
    expect(sprachfaecherDerGruppe('Latein')).toEqual([{ fach: 'Latein', sprache: 'la', id: 'latein' }])
    expect(sprachfaecherDerGruppe('Altgriechisch')[0]?.sprache).toBe('grc')
    expect(sprachfaecherDerGruppe('Englisch, Französisch').map((s) => s.sprache)).toEqual(['en', 'fr'])
    for (const f of ['Deutsch', 'Mathematik', 'Geschichte', '', 'Eigenes Fach']) expect(sprachfaecherDerGruppe(f)).toEqual([])
  })
})

let lk: NutzerInfo
let anna: NutzerInfo
const g: Record<string, string> = {}

const gruppeAnlegen = (lehrkraftId: string, name: string, fach: string, mitglieder: string[]): string => {
  lerngruppenVon(lehrkraftId)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrkraftId, name, fach, '', JSON.stringify(mitglieder), new Date().toISOString())
  return id
}

async function rufe(n: NutzerInfo, methode: 'GET' | 'POST', pfad: string, koerper: Record<string, unknown> = {}): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = {
    writeHead: (c: number) => ((code = c), res),
    setHeader: () => res,
    end: (s: string) => void (text = s)
  }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await vokabelRoute('http://x')(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

const kurseVon = (lehrkraftId: string): { id: string; lerngruppe_id: string; sprache: string; fach: string; woerter: string }[] =>
  datenbank().prepare("SELECT id, lerngruppe_id, sprache, fach, woerter FROM vok_zuweisungen WHERE lehrkraft_id = ? AND reihe = ''").all(lehrkraftId) as never

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'k.kurs', name: 'Kim Kurs', rolle: 'lehrkraft', quelle: 'test' })
  anna = nutzerAnlegen({ benutzer: 'anna.probe', name: 'Anna Probe', rolle: 'schueler', quelle: 'lokal' })
  g.en6b = gruppeAnlegen(lk.id, '6b', 'Englisch', [anna.benutzer])
  g.ma6b = gruppeAnlegen(lk.id, '6b', 'Mathematik', [anna.benutzer])
  g.la7a = gruppeAnlegen(lk.id, '7a', 'Latein', [])
  g.ge8c = gruppeAnlegen(lk.id, '8c', 'Geschichte', [])
  g.fr9d = gruppeAnlegen(lk.id, '9d', 'Französisch', [])
  g.ohne = gruppeAnlegen(lk.id, '5a', '', [])
  // 9d hat schon einen (älteren, beendeten) Kurs – zählt als vorhanden
  const alt = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: g.fr9d, schueler: [], titel: 'Unité 1', sprache: 'fr', fach: 'Französisch', woerter: [{ id: 'f', term: 'le chat', translation: 'die Katze' }] })
  datenbank().prepare("UPDATE vok_zuweisungen SET status = 'beendet' WHERE id = ?").run(alt)
})

describe('Kurse für die eigenen Klassen', () => {
  it('legt je Klasse mit Fremdsprache einen leeren Kurs an – idempotent', () => {
    expect(klassenKurseSichern(lk.id)).toBe(2)
    const kurse = kurseVon(lk.id)
    const en = kurse.filter((k) => k.lerngruppe_id === g.en6b)
    const la = kurse.filter((k) => k.lerngruppe_id === g.la7a)
    expect(en).toHaveLength(1)
    expect(en[0]).toMatchObject({ sprache: 'en', fach: 'Englisch' })
    expect(JSON.parse(en[0].woerter)).toEqual([])
    expect(la).toHaveLength(1)
    expect(la[0]).toMatchObject({ sprache: 'la', fach: 'Latein' })
    expect(kurse.filter((k) => [g.ma6b, g.ge8c, g.ohne].includes(k.lerngruppe_id))).toHaveLength(0)
    expect(kurse.filter((k) => k.lerngruppe_id === g.fr9d)).toHaveLength(1)
    // Zweiter und dritter Aufruf: nichts Neues
    expect(klassenKurseSichern(lk.id)).toBe(0)
    expect(klassenKurseSichern(lk.id)).toBe(0)
    expect(kurseVon(lk.id)).toHaveLength(kurse.length)
  })
  it('Überschrift „6b - Englisch" ohne Jahr, Klassenname live aus der Lerngruppe, eigene Überschrift bleibt', () => {
    const id = kurseVon(lk.id).find((k) => k.lerngruppe_id === g.en6b)!.id
    expect(ueberschriftVon(zeile(id)!)).toBe('6b - Englisch')
    datenbank().prepare('UPDATE lerngruppen SET name = ? WHERE id = ?').run('7b', g.en6b)
    expect(ueberschriftVon(zeile(id)!)).toBe('7b - Englisch')
    datenbank().prepare('UPDATE lerngruppen SET name = ? WHERE id = ?').run('6b', g.en6b)
    expect(ueberschriftVon({ ueberschrift: 'Mein Kurs', lerngruppe_id: g.en6b, fach: 'Englisch', erstellt: '2025-01-01T00:00:00Z' })).toBe('Mein Kurs')
    expect(ueberschriftVon({ ueberschrift: '', lerngruppe_id: '', fach: 'Englisch', erstellt: '2025-01-01T00:00:00Z' })).toBe('Englisch')
    expect(ueberschriftVon({ ueberschrift: '', lerngruppe_id: '', fach: '', titel: 'Weather' })).toBe('Weather')
  })
  it('Lernende sehen den leeren Kurs nicht', () => {
    expect(vokabelListenFuer(anna)).toEqual([])
  })
  it('„Neuer Kurs" für die Klasse füllt den leeren Kurs (mehrere Units, Abschnitte als Teile) – danach sehen ihn die Lernenden', async () => {
    const leer = kurseVon(lk.id).find((k) => k.lerngruppe_id === g.en6b)!.id
    const r = await rufe(lk, 'POST', '/server/vokabeln/freigeben', {
      lerngruppeId: g.en6b,
      titel: 'Green Line 1 - Unit 1: Station 1 - Unit 2: Station 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: [
        { id: 'b0-0', term: 'dog', translation: 'Hund' },
        { id: 'b0-1', term: 'cat', translation: 'Katze' },
        { id: 'b1-0', term: 'house', translation: 'Haus' }
      ],
      quelle: {
        lehrwerk: 'green-line-1',
        units: [
          { unit: 'Unit 1', abschnitte: ['Station 1'] },
          { unit: 'Unit 2', abschnitte: ['Station 1'] }
        ],
        unit: 'Unit 2',
        abschnitte: ['Station 1', 'Station 1']
      },
      teile: [
        { titel: 'Unit 1 · Station 1', anzahl: 2 },
        { titel: 'Unit 2 · Station 1', anzahl: 1 }
      ]
    })
    expect(r.code).toBe(200)
    expect(r.d.id).toBe(leer)
    expect(kurseVon(lk.id).filter((k) => k.lerngruppe_id === g.en6b)).toHaveLength(1)
    const d = (await rufe(lk, 'GET', `/server/vokabeln/${leer}`)).d as {
      woerter: { term: string }[]
      teile: { titel: string; anzahl: number }[]
      quelle: { units: { unit: string }[]; unit: string }
      ueberschrift: string
    }
    expect(d.woerter.map((w) => w.term)).toEqual(['dog', 'cat', 'house'])
    expect(d.teile.map((t) => [t.titel, t.anzahl])).toEqual([
      ['Unit 1 · Station 1', 2],
      ['Unit 2 · Station 1', 1]
    ])
    expect(d.quelle.units.map((u) => u.unit)).toEqual(['Unit 1', 'Unit 2'])
    expect(d.quelle.unit).toBe('Unit 2')
    expect(d.ueberschrift).toBe('6b - Englisch')
    const sicht = vokabelListenFuer(anna)
    expect(sicht.map((v) => [v.id, v.titel])).toEqual([[leer, '6b - Englisch']])
    // Ein zweiter neuer Kurs (der Klassenkurs ist nicht mehr leer) entsteht daneben
    const r2 = await rufe(lk, 'POST', '/server/vokabeln/freigeben', { lerngruppeId: g.en6b, titel: 'Extra', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'x', term: 'tree', translation: 'Baum' }] })
    expect(r2.d.id).not.toBe(leer)
  })
  it('weitere Units beim Hinzufügen: Herkunft und Abschnitte werden fortgeschrieben', async () => {
    const id = kurseVon(lk.id).find((k) => k.lerngruppe_id === g.la7a)!.id
    const r = await rufe(lk, 'POST', `/server/vokabeln/${id}/woerter`, {
      titel: 'prima - Lektion 1: A - Lektion 2: A',
      woerter: [
        { id: 'b0-0', term: 'amicus', translation: 'Freund' },
        { id: 'b1-0', term: 'villa', translation: 'Landhaus' }
      ],
      quelle: { lehrwerk: 'prima', units: [{ unit: 'Lektion 1', abschnitte: ['A'] }, { unit: 'Lektion 2', abschnitte: ['A'] }] },
      teile: [
        { titel: 'Lektion 1 · A', anzahl: 1 },
        { titel: 'Lektion 2 · A', anzahl: 1 }
      ]
    })
    expect(r.d.neu).toBe(2)
    const d = (await rufe(lk, 'GET', `/server/vokabeln/${id}`)).d as { teile: { titel: string; anzahl: number }[]; quelle: { units: { unit: string }[] } }
    // Der leere Kurs hatte keinen eigenen Teil – nur die zwei neuen Abschnitte
    expect(d.teile.map((t) => [t.titel, t.anzahl])).toEqual([
      ['Lektion 1 · A', 1],
      ['Lektion 2 · A', 1]
    ])
    expect(d.quelle.units.map((u) => u.unit)).toEqual(['Lektion 1', 'Lektion 2'])
    await rufe(lk, 'POST', `/server/vokabeln/${id}/woerter`, {
      titel: 'prima - Lektion 3 - B',
      woerter: [{ id: 'b0-0', term: 'servus', translation: 'Sklave' }],
      quelle: { lehrwerk: 'prima', unit: 'Lektion 3', abschnitte: ['B'] }
    })
    const d2 = (await rufe(lk, 'GET', `/server/vokabeln/${id}`)).d as { quelle: { units: { unit: string }[]; unit: string }; woerter: unknown[] }
    expect(d2.quelle.units.map((u) => u.unit)).toEqual(['Lektion 1', 'Lektion 2', 'Lektion 3'])
    expect(d2.quelle.unit).toBe('Lektion 3')
    expect(d2.woerter).toHaveLength(3)
  })
  it('neues Fach in „Meine Klassen" legt gleich den Kurs an (Haken), ohne Doppelte', () => {
    const vorher = kurseVon(lk.id).length
    const neu = fachHinzufuegen(lk.id, g.ohne, 'Spanisch')
    expect(neu).toBe(g.ohne)
    const es = kurseVon(lk.id).filter((k) => k.lerngruppe_id === g.ohne)
    expect(es).toHaveLength(1)
    expect(es[0]).toMatchObject({ sprache: 'es', fach: 'Spanisch' })
    expect(kurseVon(lk.id)).toHaveLength(vorher + 1)
    // Gleiche Klasse, weiteres Fach (eigene Lerngruppe gleichen Namens): Englisch für 5a
    const en5a = fachHinzufuegen(lk.id, g.ohne, 'Englisch')
    expect(kurseVon(lk.id).filter((k) => k.lerngruppe_id === en5a && k.sprache === 'en')).toHaveLength(1)
    expect(klassenKurseSichern(lk.id)).toBe(0)
  })
})
