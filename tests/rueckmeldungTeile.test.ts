import { describe, expect, it } from 'vitest'
import { boegenHtml } from '../src/renderer/src/modules/rueckmeldung/ausgabe'
import { bogenAnfrage, bogenAus, bogenSchema } from '../src/renderer/src/modules/rueckmeldung/generation'
import type { Abgabe, Rueckmeldung, RueckmeldungMeta } from '../src/renderer/src/modules/rueckmeldung/model/types'
import {
  gesamtAusTeilen,
  teilAnteil,
  teileAusArbeit,
  teileAusKi,
  teilZeilenFuerBogen,
  type BewertungsTeil
} from '../src/renderer/src/modules/rueckmeldung/teilbewertung'
import { aufgabeAus } from '../src/renderer/src/modules/rueckmeldung/aufgabeAusMaterial'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'

/*
 * Bewertung nach Teilen (29.09.2026, Wunsch der Lehrkraft): Schreib- und Sprachmittlungsaufgaben
 * in den Fremdsprachen getrennt nach Inhalt und Sprache (in der Regel 40 : 60), ganze Arbeiten
 * nach Prozent oder Punkten, Gewichte vom Material gehen vor.
 */
const meta = (over: Partial<RueckmeldungMeta> = {}): RueckmeldungMeta => ({
  title: '',
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 8,
  stateId: 'NW',
  schoolTypeId: 'gymnasium',
  schoolTypeName: 'Gymnasium',
  anrede: 'du',
  schwerpunkt: '',
  formen: ['schriftlich', 'tipps'],
  einstufung: 'noteTendenz',
  ebene: 'gesamt',
  ...over
})

const teile: BewertungsTeil[] = [
  { id: 't1', titel: 'Reading', art: 'sonstig', gewicht: 40, punkte: 20, quelle: 'material' },
  { id: 't2', titel: 'Writing', art: 'schreiben', gewicht: 60, punkte: 30, inhalt: 40, quelle: 'material' }
]

const doc = (over: Partial<Rueckmeldung['grundlage']> = {}, m: Partial<RueckmeldungMeta> = {}): Rueckmeldung => ({
  version: 1,
  meta: meta(m),
  grundlage: { art: 'frei', titel: 'Class test', aufgaben: 'A Reading … B Write an email …', teile, verrechnung: 'prozent', ...over },
  abgaben: [],
  createdAt: ''
})
const abgabe: Abgabe = { id: 'a1', kuerzel: 'S1', name: '', dateiname: 'x', text: `Dear Tom, ${'thank you for your letter about the school trip to London and the museum visit. '.repeat(6)}Best wishes`, bilder: [] }

describe('Rechnen', () => {
  it('Schreiben: Inhalt und Sprache nach dem Inhaltsanteil', () => {
    expect(teilAnteil(teile[1], { teilId: 't2', inhalt: 80, sprache: 50 })).toBe(62)
  })

  it('Gesamt nach Prozent oder Punkten; Teile ohne Wertung zählen nicht', () => {
    const w = [
      { teilId: 't1', anteil: 50 },
      { teilId: 't2', inhalt: 80, sprache: 50 }
    ]
    expect(gesamtAusTeilen(teile, w, 'prozent')?.anteil).toBe(57)
    expect(gesamtAusTeilen(teile, w, 'punkte')).toMatchObject({ anteil: 57, moeglich: 50 })
    expect(gesamtAusTeilen(teile, [w[1]], 'prozent')?.anteil).toBe(62)
    expect(gesamtAusTeilen(teile, [], 'prozent')).toBeNull()
  })
})

describe('Teile erkennen', () => {
  it('aus der Klassenarbeit: Schreiben mit Inhaltsanteil, Gewicht und Punkte', () => {
    const exam = {
      meta: { subjectId: 'englisch' },
      parts: [
        { id: 'p1', formatId: 'en-reading', label: 'Reading', weight: 40, points: 20 },
        { id: 'p2', formatId: 'en-writing', label: 'Writing', weight: 60, points: 30, contentShare: 40 },
        { id: 'p3', formatId: 'en-mediation', label: '', weight: 0, points: 10 }
      ]
    } as unknown as Exam
    const { teile: t, verrechnung } = teileAusArbeit(exam)
    expect(verrechnung).toBe('prozent')
    expect(t.map((x) => x.art)).toEqual(['sonstig', 'schreiben', 'sprachmittlung'])
    expect(t[1]).toMatchObject({ gewicht: 60, punkte: 30, inhalt: 40, quelle: 'klassenarbeit' })
    expect(t[2].inhalt).toBe(40)
  })

  it('aus dem Material: Angaben dort gehen vor, sonst 40 : 60 als Voreinstellung', () => {
    const k = { stateId: 'NW', grade: 8, schoolTypeId: 'gymnasium' }
    const e = teileAusKi(
      [
        { titel: 'Part A: Listening', art: 'sonstig', gewichtProzent: 30, punkte: 0, inhaltProzent: 0 },
        { titel: 'Part B: Writing', art: 'schreiben', gewichtProzent: 70, punkte: 0, inhaltProzent: 50 }
      ],
      k
    )!
    expect(e.verrechnung).toBe('prozent')
    expect(e.teile[1]).toMatchObject({ inhalt: 50, gewicht: 70, quelle: 'material' })
    const ohne = teileAusKi([{ titel: 'Write an email', art: 'schreiben', gewichtProzent: 0, punkte: 0, inhaltProzent: 0 }], k)!
    expect(ohne.teile[0]).toMatchObject({ inhalt: 40, gewicht: 100, quelle: 'vorgabe' })
    const punkte = teileAusKi(
      [
        { titel: 'A', art: 'sonstig', punkte: 15 },
        { titel: 'B', art: 'sprachmittlung', punkte: 25 }
      ],
      k
    )!
    expect(punkte.verrechnung).toBe('punkte')
    expect(teileAusKi([], k)).toBeNull()
  })

  it('die Aufgabe aus Dateien bringt die Teile als Rohdaten mit', () => {
    expect(aufgabeAus({ aufgaben: 'x', teile: [{ titel: 'Writing' }] }).teile).toEqual([{ titel: 'Writing' }])
  })
})

describe('Bogen', () => {
  it('Anfrage und Schema fragen je Teil nach Inhalt/Sprache; Gesamt rechnet die App', () => {
    const r = doc()
    const anfrage = bogenAnfrage(r, abgabe, 'sys')
    expect(anfrage.user).toMatch(/\[t2\] Writing \(60 %; Inhalt 40 %, Sprache 60 %\)/)
    expect(anfrage.user).toMatch(/GETRENNT/)
    const felder = (bogenSchema(r, abgabe) as { properties: Record<string, unknown> }).properties
    expect(Object.keys(felder)).toContain('teile')
    expect(Object.keys(felder)).not.toContain('gesamt')
    const b = bogenAus(
      {
        staerken: ['a'],
        schritte: ['b'],
        kriterien: [],
        teile: [
          { id: 't1', anteil: 50, inhalt: 0, sprache: 0, begruendung: '' },
          { id: '[t2]', inhalt: 80, sprache: 50, anteil: 0, begruendung: 'gut gegliedert' }
        ]
      },
      r,
      abgabe,
      { zeichen: [], schwellen: [91, 78, 64, 50, 25, 0] }
    )
    expect(b.teile).toHaveLength(2)
    expect(b.gesamt?.anteil).toBe(57)
    expect(b.gesamt?.begruendung).toMatch(/Writing: Inhalt 80 %, Sprache 50 %/)
  })

  it('ohne Einstufung: keine Werte, aber Inhalt und Sprache getrennt ansprechen', () => {
    const r = doc({}, { einstufung: 'keine' })
    expect(Object.keys((bogenSchema(r, abgabe) as { properties: Record<string, unknown> }).properties)).not.toContain('teile')
    expect(bogenAnfrage(r, abgabe, 'sys').user).toMatch(/GETRENNT/)
  })

  it('der Ausdruck zeigt die Teile nur mit bestätigter Einstufung', () => {
    const w = [
      { teilId: 't1', anteil: 50 },
      { teilId: 't2', inhalt: 80, sprache: 50 }
    ]
    expect(teilZeilenFuerBogen(teile, w)).toEqual(['Reading (40 %): 50 %', 'Writing (60 %): Inhalt 80 % · Sprache 50 %'])
    const r = doc()
    const bogen = { staerken: [], schritte: [], kriterien: [], teile: w }
    r.abgaben = [{ ...abgabe, bogen: { ...bogen, gesamt: { anteil: 57, wert: '3', bestaetigt: true } } }]
    expect(boegenHtml(r, r.abgaben)).toMatch(/<td class="z">80 %<\/td><td class="z">50 %<\/td>/)
    r.abgaben = [{ ...abgabe, bogen: { ...bogen, gesamt: { anteil: 57, wert: '3' } } }]
    expect(boegenHtml(r, r.abgaben)).not.toMatch(/Inhalt 80 %/)
  })
})

describe('Voreinstellung Inhalt : Sprache nach Land (Recherche 29.09.2026)', () => {
  it('40 : 60 als Regel, belegte Abweichungen in der Sek I', async () => {
    const { inhaltVorgabe } = await import('../src/renderer/src/modules/rueckmeldung/teilbewertung')
    expect(inhaltVorgabe('NW', 8, 'schreiben').inhalt).toBe(40)
    expect(inhaltVorgabe('SL', 6, 'schreiben').inhalt).toBe(25)
    expect(inhaltVorgabe('SL', 9, 'schreiben').inhalt).toBe(40)
    expect(inhaltVorgabe('ST', 6, 'schreiben').inhalt).toBe(50)
    expect(inhaltVorgabe('BY', 10, 'schreiben', 'realschule').inhalt).toBe(23)
    expect(inhaltVorgabe('BB', 7, 'sprachmittlung').inhalt).toBe(40)
  })
})
