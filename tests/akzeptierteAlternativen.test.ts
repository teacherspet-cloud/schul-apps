import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  abweichendeWoerter,
  akzeptiertSchluessel,
  alternativenFuerLoesung,
  entfernen,
  merken,
  schonAkzeptiertMarkieren,
  SCHON_AKZEPTIERT_ART,
  treffer,
  zuruecknehmen,
  type AkzeptiertListe
} from '../src/renderer/src/modules/onlinetest/akzeptiert'
import { bewerte, onlineFassung, zuEntscheiden, type EinheitBewertung } from '../src/renderer/src/modules/onlinetest/kern'
import type { Block, TestDocument, Variant } from '../src/renderer/src/modules/vokabeltest/model/types'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { akzeptierteListe, alternativeEntfernen, beimUrteil, schonAkzeptierteMarkieren } from '../src/server/akzeptierteAlternativen'
import { akzeptierteLaden, akzeptierteVon } from '../src/renderer/src/modules/onlinetest/akzeptiertSpeicher'
import { buildPrintHtml } from '../src/renderer/src/modules/vokabeltest/render/printHtml'

/*
 * Bereits akzeptierte Alternativen (10.10.2026): Akzeptiert die Lehrkraft im Onlinetest eine laut Lösung falsche Antwort,
 * wird sie gemerkt (je Lehrkraft, Sprache, Lösungswort – ohne Person), steht im Lösungsblatt und kommt in späteren
 * Onlinetests nach „Zu entscheiden" statt automatisch richtig zu sein.
 */
const liste = vi.hoisted(() => ({ wert: {} as Record<string, unknown> }))
vi.mock('../src/renderer/src/modules/onlinetest/serverApi', () => ({
  holen: async () => ({ liste: liste.wert }),
  senden: async () => ({ liste: liste.wert })
}))

const basis = { title: 'T', instruction: 'Do it.', pointsPerItem: 1 }
const variante: Variant = {
  id: 'A',
  label: 'A',
  blocks: [
    {
      id: 'b-gap',
      kind: 'gap',
      taskType: 'gapSentences',
      ...basis,
      items: [{ id: 'g1', sentences: [{ before: 'I drink tea from a', after: '.' }], answer: 'cup' }],
      wordBank: false,
      firstLetterHint: false,
      extraBankWords: []
    } as Block,
    { id: 'b-pic', kind: 'picture', taskType: 'gapSentences', ...basis, items: [{ id: 'p1', answer: 'a pen', imageKeywords: [] }], wordBank: false, columns: 3 } as Block,
    {
      id: 'b-choice',
      kind: 'choice',
      taskType: 'gapSentences',
      ...basis,
      items: [{ id: 'c1', before: 'She', after: 'home.', options: ['go', 'goes'], correct: 1 }]
    } as Block
  ]
}
const f = onlineFassung(variante)
const feld = (aufgabe: string): string => f.einheiten.find((e) => e.aufgabe === aufgabe)!.felder[0]
const einheit = (aufgabe: string) => f.einheiten.find((e) => e.aufgabe === aufgabe)!

describe('Normalisierung und Liste', () => {
  it('Schlüssel ohne Groß-/Kleinschreibung, Satzzeichen, Leerraum und Artikel/„to"', () => {
    expect(akzeptiertSchluessel('  The Mug. ')).toBe('mug')
    expect(akzeptiertSchluessel('to reward')).toBe('reward')
    expect(akzeptiertSchluessel('rosā')).toBe('rosa')
  })
  it('merken zählt hoch, gleiche Schreibung (normalisiert) ist dieselbe Alternative; zurücknehmen und entfernen', () => {
    let l: AkzeptiertListe = {}
    l = merken(l, 'cup', 'mug', '2026-10-10T08:00:00Z')
    l = merken(l, 'Cup', ' Mug.', '2026-10-11T08:00:00Z')
    expect(l.cup.alternativen).toEqual([{ text: 'mug', anzahl: 2, zuletzt: '2026-10-11T08:00:00Z' }])
    expect(treffer(l, 'cup', 'a MUG')?.anzahl).toBe(2)
    // Nur Groß-/Kleinschreibung bzw. dieselbe Lösung: nichts zu merken
    expect(merken(l, 'cup', 'Cup')).toBe(l)
    l = zuruecknehmen(l, 'cup', 'mug')
    expect(l.cup.alternativen[0].anzahl).toBe(1)
    expect(entfernen(l, 'cup', 'mug')).toEqual({})
  })
  it('nur Wort-Abweichungen zählen – leeres Feld, falsche Auswahl oder freie Felder nicht', () => {
    expect(abweichendeWoerter(f, einheit('b-gap'), { [feld('b-gap')]: 'mug' })).toEqual([{ feld: feld('b-gap'), wort: 'cup', antwort: 'mug' }])
    expect(abweichendeWoerter(f, einheit('b-gap'), { [feld('b-gap')]: 'cup' })).toEqual([])
    expect(abweichendeWoerter(f, einheit('b-gap'), {})).toBeNull()
    expect(abweichendeWoerter(f, einheit('b-choice'), { [feld('b-choice')]: '0' })).toBeNull()
  })
})

describe('Lösungsblatt', () => {
  const l = merken(merken(merken({}, 'cup', 'mug'), 'cup', 'beaker'), 'cup', 'mug')
  it('nennt die Alternativen (häufigste zuerst), ohne Lösung und „auch richtig"', () => {
    expect(alternativenFuerLoesung(l, 'cup')).toEqual(['mug', 'beaker'])
    expect(alternativenFuerLoesung(l, 'cup', ['beaker'])).toEqual(['mug'])
    expect(alternativenFuerLoesung(l, 'pen')).toEqual([])
    expect(alternativenFuerLoesung(undefined, 'cup')).toEqual([])
  })

  describe('Druckfassung (Server verbunden)', () => {
    beforeAll(() => {
      ;(globalThis as { window?: unknown }).window = { __schulappsServer: true, addEventListener: () => undefined }
    })
    afterAll(() => {
      delete (globalThis as { window?: unknown }).window
    })
    it('Lösungsblatt zeigt „Schon einmal als richtig akzeptiert", das Schülerblatt nicht', async () => {
      liste.wert = merken(merken({}, 'cup', 'mug'), 'pen', 'biro')
      akzeptierteLaden('en')
      await vi.waitFor(() => expect(akzeptierteVon('en')).toBeTruthy())
      const doc = {
        version: 1,
        header: { title: 'Test', showName: true, showDate: true, showClass: false, showSchool: false, schoolName: '', showVariant: false, showPoints: true, showGrade: false, subtitle: '' },
        settings: { targetLanguage: 'en', grade: 7, level: 'A2', tasks: [], topic: '', pictureSource: 'none', answerKey: true, seed: 1 },
        vocab: [],
        variants: [variante],
        fontSize: 11,
        createdAt: '2026-10-10'
      } as unknown as TestDocument
      const loesung = buildPrintHtml(doc, { variantIds: ['A'], includeKey: false, keyOnly: true } as never)
      expect(loesung).toContain('Schon einmal als richtig akzeptiert: mug')
      expect(loesung).toContain('Schon einmal als richtig akzeptiert: biro')
      const blatt = buildPrintHtml(doc, { variantIds: ['A'], includeKey: false, keyOnly: false } as never)
      expect(blatt).not.toContain('Schon einmal als richtig akzeptiert')
    })
  })
})

describe('Später im Onlinetest: nach „Zu entscheiden" mit Vermerk', () => {
  it('gleiche Antwort → nicht richtig, sondern zu entscheiden; andere falsche Antwort bleibt falsch', () => {
    const l = merken(merken({}, 'cup', 'mug'), 'cup', 'mug')
    const antworten = { [feld('b-gap')]: 'Mug', [feld('b-pic')]: 'pencil' }
    const b = schonAkzeptiertMarkieren(f, antworten, bewerte(f, antworten), l)
    const gap = b[einheit('b-gap').id]
    expect(gap).toMatchObject({ status: 'falsch', punkte: 0, pruefen: 'sinnvoll', kiGeprueft: true, schonAkzeptiert: 2, fehlerArt: SCHON_AKZEPTIERT_ART })
    expect(gap.hinweis).toContain('Wurde schon einmal als richtig akzeptiert (2×)')
    expect(b[einheit('b-pic').id].pruefen).toBeUndefined()
    expect(zuEntscheiden(b)).toBe(1)
  })
})

describe('Speicher auf dem Server (je Lehrkraft, ohne Person, verschlüsselt)', () => {
  let lk: NutzerInfo
  let andere: NutzerInfo
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    lk = nutzerAnlegen({ benutzer: 'l.lehrer', name: 'Lars Lehrer', rolle: 'lehrkraft', quelle: 'test' })
    andere = nutzerAnlegen({ benutzer: 'a.andere', name: 'Anna Andere', rolle: 'lehrkraft', quelle: 'test' })
  })

  it('akzeptieren merkt, umentscheiden nimmt zurück, doppeltes Akzeptieren zählt nicht doppelt', () => {
    const antworten = { [feld('b-gap')]: 'mug' }
    const e = einheit('b-gap')
    const vorher = bewerte(f, antworten)[e.id]
    const ja: EinheitBewertung = { status: 'richtig', punkte: 1, quelle: 'lehrkraft', pruefen: 'sinnvoll' }
    const b1 = beimUrteil(lk.id, 'en', f, e, antworten, vorher, ja)
    expect(b1.alsAlternativeGemerkt).toBe(true)
    expect(akzeptierteListe(lk.id, 'en').cup.alternativen).toMatchObject([{ text: 'mug', anzahl: 1 }])
    // Noch einmal ✓ auf dieselbe Abgabe: keine zweite Zählung
    const b2 = beimUrteil(lk.id, 'en', f, e, antworten, b1, { ...ja })
    expect(akzeptierteListe(lk.id, 'en').cup.alternativen[0].anzahl).toBe(1)
    // Umentschieden ✗: zurückgenommen
    const b3 = beimUrteil(lk.id, 'en', f, e, antworten, b2, { status: 'falsch', punkte: 0, quelle: 'lehrkraft' })
    expect(b3.alsAlternativeGemerkt).toBeUndefined()
    expect(akzeptierteListe(lk.id, 'en')).toEqual({})
    // Richtige Antwort akzeptiert: nichts zu merken; andere Testart (ohne Sprache): nichts
    beimUrteil(lk.id, 'en', f, e, { [feld('b-gap')]: 'cup' }, undefined, ja)
    beimUrteil(lk.id, '', f, e, antworten, vorher, ja)
    expect(akzeptierteListe(lk.id, 'en')).toEqual({})
  })

  it('nur für die eigene Lehrkraft und Sprache; Abgabe danach kommt nach „Zu entscheiden"; entfernen', () => {
    const antworten = { [feld('b-gap')]: 'mug' }
    const e = einheit('b-gap')
    beimUrteil(lk.id, 'en', f, e, antworten, bewerte(f, antworten)[e.id], { status: 'richtig', punkte: 1, quelle: 'lehrkraft' })
    expect(akzeptierteListe(andere.id, 'en')).toEqual({})
    expect(akzeptierteListe(lk.id, 'fr')).toEqual({})
    const spaeter = schonAkzeptierteMarkieren(lk.id, 'en', f, antworten, bewerte(f, antworten))
    expect(spaeter[e.id]).toMatchObject({ status: 'falsch', pruefen: 'sinnvoll', schonAkzeptiert: 1 })
    expect(schonAkzeptierteMarkieren(andere.id, 'en', f, antworten, bewerte(f, antworten))[e.id].pruefen).toBeUndefined()
    expect(alternativeEntfernen(lk.id, 'en', 'cup', 'mug')).toEqual({})
    expect(akzeptierteListe(lk.id, 'en')).toEqual({})
  })
})
