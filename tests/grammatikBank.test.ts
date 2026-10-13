import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  bankPaket,
  formVon,
  istMix,
  mixKennungen,
  mixSchluessel,
  regelIdVon,
  schluesselGueltig,
  unitSchluessel,
  unitVon,
  type BankAufgabe
} from '../src/shared/grammatikBank'
import { formAusTeilen, formBefund } from '../src/shared/grammatikSicher'
import { paketBereinigt, BANK_GRENZEN } from '../src/shared/grammatiktrainer'
import { grammatikHeute } from '../src/shared/grammatikVorrang'
import { grammatikProzent } from '../src/server/achievements'
import { grammatikAlleLoeschen } from '../src/server/wartungGrammatikAlle'
import { grammatikFormenImBand } from '../src/shared/auszeichnungenBand'
import type { WortStand } from '../src/shared/vokabeltrainer'

const aufgabe = (id: string, uebung: BankAufgabe['uebung']): BankAufgabe => ({
  id,
  art: 'luecke',
  regelId: '',
  anweisung: 'Setze ein.',
  satz: `She ___ (${id}).`,
  loesungen: ['goes'],
  uebung
})
const st = (erster: 'r' | 'f', nachFehler = false): WortStand =>
  ({ fach: 1, faellig: 0, versuche: 1, falsch: erster === 'f' ? 1 : 0, erster, nachFehler } as WortStand)

/** Je Kern-Übungsart n Aufgaben, Zusatz 2 */
const reihe = (n = 5): BankAufgabe[] => [
  ...['erkennen', 'bilden', 'anwenden'].flatMap((u) => Array.from({ length: n }, (_, i) => aufgabe(`${u[0]}${i}`, u as BankAufgabe['uebung']))),
  aufgabe('u0', 'unterscheiden'),
  aufgabe('f0', 'fehler')
]

describe('Aufgabenbank: Schlüssel', () => {
  it('Teilbereich, gemischt je Punkt und je Unit', () => {
    expect(formVon('en.verb.past_simple/fragen')).toBe('en.verb.past_simple')
    expect(formVon('en.verb.past_simple')).toBe('en.verb.past_simple')
    const m = mixSchluessel(['en.verb.past_simple', 'en.verb.past_progressive'])
    expect(m).toBe('mix:en.verb.past_progressive+en.verb.past_simple')
    expect(istMix(m) && formVon(m) === '').toBe(true)
    expect(mixKennungen(m)).toEqual(['en.verb.past_progressive', 'en.verb.past_simple'])
    const u = unitSchluessel('Green Line 2', 'Unit 3')
    expect(unitVon(u)).toEqual({ band: 'Green Line 2', unit: 'Unit 3' })
    for (const s of ['en.verb.past_simple/fragen', m, u]) expect(schluesselGueltig(s)).toBe(true)
    for (const s of ['', 'x', 'mix:', 'unit:ohneUnit', 42]) expect(schluesselGueltig(s)).toBe(false)
    // feste Regel-Kennung, gültig für paketBereinigt
    expect(regelIdVon(m)).toBe(regelIdVon(m))
    expect(regelIdVon(m)).toMatch(/^t[0-9a-z]{1,29}$/)
  })
  it('Paket aus der Bank: je Schlüssel eine Regel, Aufgaben nach Übungsart mit Stufe, Kennungen bleiben', () => {
    const p = bankPaket('Simple past', [
      {
        schluessel: 'en.verb.past_simple/fragen',
        regel: { titel: 'Fragen', erklaerung: 'Did …', beispiele: [] },
        aufgaben: [aufgabe('bx1', 'anwenden'), aufgabe('bx2', 'erkennen')]
      },
      { schluessel: 'en.verb.past_simple/verneinung', regel: { titel: 'Verneinung', erklaerung: '', beispiele: [] }, aufgaben: [] }
    ])
    expect(p.regeln).toHaveLength(1)
    expect(p.regeln[0].kennung).toBe('en.verb.past_simple/fragen')
    expect(p.aufgaben.map((a) => [a.id, a.uebung, a.stufe])).toEqual([
      ['bx2', 'erkennen', 1],
      ['bx1', 'anwenden', 3]
    ])
    // paketBereinigt lässt Übungsart und Regel-Kennung stehen, große Bank-Pakete passen
    const q = paketBereinigt(p, 'x', BANK_GRENZEN)
    expect(q.aufgaben.map((a) => a.uebung)).toEqual(['erkennen', 'anwenden'])
    expect(q.regeln[0].kennung).toBe('en.verb.past_simple/fragen')
  })
})

describe('Aufgabenbank: „sicher" (13.10.2026)', () => {
  it('Teilbereich sicher: Erkennen, Bilden, Anwenden je ≥ 80 % beim ersten Versuch, je mindestens 5; Zusatz zählt nicht', () => {
    const a = reihe()
    const alle = Object.fromEntries(a.map((x) => [x.id, st(x.uebung === 'fehler' || x.uebung === 'unterscheiden' ? 'f' : 'r')]))
    expect(formBefund(a, alle).ampel).toBe('sicher')
    // Bilden nur 3 von 5 richtig (60 %) → nicht sicher, obwohl zusammen 87 %
    const bilden = { ...alle, b0: st('f'), b1: st('f') }
    expect(formBefund(a, bilden).ampel).toBe('aufbau')
    // Anwenden erst 4 bearbeitet → zu wenig
    const { a4: _weg, ...ohne } = alle
    void _weg
    expect(formBefund(a, ohne).ampel).toBe('wenig')
  })
  it('zurückgestuft erst ab 2 offenen späteren Fehlern', () => {
    const a = reihe()
    const alle = Object.fromEntries(a.map((x) => [x.id, st('r')]))
    expect(formBefund(a, { ...alle, e0: st('r', true) }).ampel).toBe('sicher')
    expect(formBefund(a, { ...alle, e0: st('r', true), b0: st('r', true) }).ampel).toBe('aufbau')
  })
  it('Schwäche: Kernaufgaben zusammen unter 60 %', () => {
    const a = reihe()
    const alle = Object.fromEntries(a.map((x, i) => [x.id, st(i % 2 ? 'r' : 'f')]))
    expect(formBefund(a, alle).ampel).toBe('schwaeche')
  })
  it('Form sicher: mindestens 80 % der Teilbereiche sicher und keiner schwach', () => {
    expect(formAusTeilen(['sicher', 'sicher', 'sicher', 'sicher', 'aufbau'])).toBe('sicher')
    expect(formAusTeilen(['sicher', 'sicher', 'sicher', 'aufbau', 'aufbau'])).toBe('aufbau')
    expect(formAusTeilen(['sicher', 'sicher', 'sicher', 'sicher', 'schwaeche'])).toBe('schwaeche')
    expect(formAusTeilen(['wenig', 'wenig'])).toBe('wenig')
    expect(formAusTeilen([])).toBe('wenig')
  })
  it('Tagesreihenfolge: Teilbereiche der Reihe nach, darin erst Erkennen, dann Bilden', () => {
    const p = bankPaket('x', [
      { schluessel: 'en.a/x', regel: { titel: 'A', erklaerung: 'a', beispiele: [] }, aufgaben: [aufgabe('ba', 'bilden'), aufgabe('ea', 'erkennen')] },
      { schluessel: 'en.a/y', regel: { titel: 'B', erklaerung: 'b', beispiele: [] }, aufgaben: [aufgabe('eb', 'erkennen')] }
    ])
    expect(grammatikHeute(p, {}, { erstellt: 0, jetzt: 1e12 })).toEqual(['ea', 'ba', 'eb'])
  })
})

describe('Aufgabenbank: Medaille „Grammatik" in Prozent des Bands', () => {
  it('zur Hälfte sichere Formen, zur Hälfte gelöste Kern-Aufgaben', () => {
    const kern = (): Record<string, number> => ({ 'en.a': 30, 'en.b': 30, 'en.c': 40 })
    const band = { formen: ['en.a', 'en.b', 'en.c', 'en.d'], grammatik: 4 }
    // 1 von 4 Formen sicher (12,5 %) + 50 von 100 Kern-Aufgaben (25 %) = 37 %
    expect(grammatikProzent({ formen: { 'en.a': 'sicher', 'en.b': 'aufbau' }, geloest: { 'en.a': 30, 'en.b': 20 } }, band, 'en', kern)).toBe(37)
    // Alles sicher und gelöst → 100 (Meister)
    expect(
      grammatikProzent(
        { formen: { 'en.a': 'sicher', 'en.b': 'sicher', 'en.c': 'sicher', 'en.d': 'sicher' }, geloest: { 'en.a': 30, 'en.b': 30, 'en.c': 40 } },
        band,
        'en',
        kern
      )
    ).toBe(100)
    // Formen außerhalb des Bands zählen nicht; ohne Bank-Daten 0
    expect(grammatikProzent({ formen: { 'en.x': 'sicher' }, geloest: { 'en.x': 99 } }, band, 'en', kern)).toBe(0)
    expect(grammatikProzent(undefined, band, 'en', kern)).toBe(0)
  })
  it('Formen eines Green-Line-Bands: Themen ohne Wiederholungen', () => {
    const f = grammatikFormenImBand('Green Line 1')
    expect(f.length).toBeGreaterThan(5)
    expect(f.every((k) => !k.includes('/'))).toBe(true)
    expect(grammatikFormenImBand('Unbekannt')).toEqual([])
  })
})

describe('Wartung 13.10.2026: alle Grammatik-Trainings löschen', () => {
  it('Trainings, Lernstände, Code-Beitritte und verwaiste Gastkonten', () => {
    const d = new DatabaseSync(':memory:')
    d.exec(`CREATE TABLE nutzer (id TEXT PRIMARY KEY, quelle TEXT);
      CREATE TABLE gram_zuweisungen (id TEXT PRIMARY KEY, lehrkraft_id TEXT);
      CREATE TABLE gram_stand (zuweisung_id TEXT, schueler_id TEXT);
      CREATE TABLE gram_gaeste (zuweisung_id TEXT, nutzer_id TEXT);
      CREATE TABLE vok_gaeste (zuweisung_id TEXT, nutzer_id TEXT);
      INSERT INTO nutzer VALUES ('g1', 'gast'), ('g2', 'gast'), ('s1', 'iserv');
      INSERT INTO gram_zuweisungen VALUES ('z1', 'l'), ('z2', 'l');
      INSERT INTO gram_stand VALUES ('z1', 's1'), ('z2', 'g1');
      INSERT INTO gram_gaeste VALUES ('z1', 'g1'), ('z2', 'g2');
      INSERT INTO vok_gaeste VALUES ('v1', 'g2');`)
    expect(grammatikAlleLoeschen(d)).toBe('2 Grammatiktrainings gelöscht (2 Lernstände, 1 Gastkonten)')
    expect(d.prepare('SELECT COUNT(*) AS n FROM gram_zuweisungen').get()).toEqual({ n: 0 })
    expect(
      d
        .prepare('SELECT id FROM nutzer ORDER BY id')
        .all()
        .map((x) => (x as { id: string }).id)
    ).toEqual(['g2', 's1'])
  })
})

describe('Aufgabenbank: Stufen und Namen (13.10.2026)', () => {
  it('Stufen nach Schulform', async () => {
    const { stufenFuerSchulform } = await import('../src/shared/grammatikBank')
    expect(stufenFuerSchulform('gymnasium')).toEqual(['m', 'a'])
    expect(stufenFuerSchulform('hauptschule')).toEqual(['g'])
    expect(stufenFuerSchulform('oberschule')).toEqual(['g', 'm'])
    expect(stufenFuerSchulform('integrierte-gesamtschule')).toEqual(['g', 'm'])
    expect(stufenFuerSchulform('')).toEqual(['g', 'm', 'a'])
  })
  it('Paket nur mit den Stufen des Kurses, darin vom Leichten zum Schweren', () => {
    const e = {
      schluessel: 'en.a/x',
      regel: { titel: 'A', erklaerung: 'a', beispiele: [] },
      aufgaben: [{ ...aufgabe('b1', 'erkennen'), niveau: 'a' as const }, { ...aufgabe('b2', 'erkennen'), niveau: 'g' as const }, aufgabe('b3', 'erkennen')]
    }
    expect(bankPaket('x', [e], ['g', 'm']).aufgaben.map((a) => a.id)).toEqual(['b2', 'b3'])
    expect(bankPaket('x', [e]).aufgaben.map((a) => a.id)).toEqual(['b2', 'b3', 'b1'])
  })
  it('Dopplungen: gleicher Satz mit gleicher Lösung zählt einmal – auch gegen die Bank (13.10.2026)', async () => {
    const { aufgabeKern, ohneDoppelte } = await import('../src/shared/grammatikBank')
    const a = { ...aufgabe('x1', 'bilden'), satz: 'She ___ to school.', loesungen: ['goes'] }
    const b = { ...aufgabe('x2', 'anwenden'), satz: 'she  ___ to school', loesungen: ['Goes'] }
    const c = { ...aufgabe('x3', 'bilden'), satz: 'She ___ to school.', loesungen: ['went'] }
    expect(aufgabeKern(a)).toBe(aufgabeKern(b))
    expect(ohneDoppelte([a, b, c]).map((x) => x.id)).toEqual(['x1', 'x3'])
    expect(ohneDoppelte([b, c], new Set([aufgabeKern(a)])).map((x) => x.id)).toEqual(['x3'])
  })
  it('Förderreserve: Gymnasium übt mittel/anspruchsvoll, grundlegend nur bei Schwierigkeiten (13.10.2026)', async () => {
    const { foerderAusReserve } = await import('../src/shared/grammatikVorrang')
    const e = {
      schluessel: 'en.a/x',
      regel: { titel: 'A', erklaerung: 'a', beispiele: [] },
      aufgaben: [
        aufgabe('m1', 'bilden'),
        aufgabe('m2', 'bilden'),
        ...['g1', 'g2', 'g3', 'g4'].map((id) => ({ ...aufgabe(id, 'bilden'), niveau: 'g' as const })),
        { ...aufgabe('g5', 'erkennen'), niveau: 'g' as const }
      ]
    }
    const p = bankPaket('x', [e], ['m', 'a'])
    expect(p.aufgaben.map((a) => a.id)).toEqual(['m1', 'm2'])
    expect(p.reserve?.map((a) => a.id)).toEqual(['g1', 'g2', 'g3', 'g4', 'g5'])
    expect(bankPaket('x', [e], ['g', 'm']).reserve).toBeUndefined()
    const st = (versuche: number, falsch: number): WortStand =>
      ({ fach: 1, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche, falsch, fehlerTexte: [], zuletzt: 0 } as WortStand)
    // Ohne Schwierigkeiten: keine Reserve
    expect(foerderAusReserve(p, { m1: st(3, 0) })).toEqual([])
    // Zwei Fehler bei 50 %: drei grundlegende Aufgaben derselben Übungsart (nicht „erkennen")
    expect(foerderAusReserve(p, { m1: st(2, 1), m2: st(2, 1) })).toEqual(['g1', 'g2', 'g3'])
    // Drei davon geschafft: Hilfe getan
    expect(foerderAusReserve(p, { m1: st(2, 1), m2: st(2, 1), g1: st(1, 0), g2: st(1, 0), g3: st(1, 0) })).toEqual([])
    // grammatikHeute nimmt sie vor die neuen
    expect(grammatikHeute(p, { m1: st(2, 1), m2: st(2, 1) }, { erstellt: 0 }).slice(-3)).toEqual(['g1', 'g2', 'g3'])
  })
  it('Namen der Teilbereiche sind für sich verständlich', async () => {
    const { teilKurzname, kennungLabel } = await import('../src/renderer/src/modules/grammatikformen/grammatikformen')
    expect(teilKurzname('en.syn.short_answers/be')).toMatch(/^Kurzantworten.*: mit be$/)
    expect(teilKurzname('en.verb.be_have/be-fragen', true)).toContain(': ')
    for (const k of ['la.syn.begehrsaetze', 'la.syn.verba_timendi']) expect(kennungLabel(k)).not.toMatch(/siehe la\./)
  })
  it('Lehrplan: Einführungsjahrgang je Land und Schulform', async () => {
    const { GRAMMAR_TOPICS, einfuehrungsStufe } = await import('../src/renderer/src/modules/arbeitsblatt/didactics/grammar')
    const t = GRAMMAR_TOPICS.find((x) => x.subject === 'deutsch')!
    const n = einfuehrungsStufe(t, { subjectId: 'deutsch', stateId: 'NI', schoolTypeId: 'gymnasium' })
    expect(n === null || (n >= 1 && n <= 13)).toBe(true)
    const la = GRAMMAR_TOPICS.filter((x) => x.subject === 'latein').map((x) =>
      einfuehrungsStufe(x, { subjectId: 'latein', stateId: 'NI', schoolTypeId: 'gymnasium' })
    )
    expect(la.filter((x) => x !== null).every((x) => x! >= 1 && x! <= 7)).toBe(true)
  })
})
