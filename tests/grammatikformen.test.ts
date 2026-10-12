import { afterEach, describe, expect, it } from 'vitest'
import {
  fruehereBaendeDerReihe,
  istUeberlagert,
  LEHRWERK_GRAMMATIK,
  LEHRWERK_GRAMMATIK_EINGEBAUT,
  wendeGrammatikAn,
  type LehrwerkGrammatikEintrag
} from '../src/renderer/src/shared/lehrwerkGrammatik'
import { kapitelThema } from '../src/renderer/src/shared/lehrwerkThemen'
import { bekanntNachStand } from '../src/shared/zeitformSperre'
import {
  kennungGueltig,
  kennungLabel,
  ordneBand,
  pruefeVorschlaege,
  uebernimmVorschlaege,
  verschiebe,
  type BuchGliederung
} from '../src/renderer/src/modules/grammatikformen/grammatikformen'

/* App „Grammatikformen" (12.10.2026): Bearbeitungen überlagern die eingebaute Liste; KI-Vorschläge nur dazu */

afterEach(() => wendeGrammatikAn([]))

const eintrag = (buch: string, kapitel: LehrwerkGrammatikEintrag['kapitel'], sprache = 'en'): LehrwerkGrammatikEintrag => ({
  lehrwerkId: buch.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  buch,
  sprache,
  kapitel
})

describe('Überlagerung der eingebauten Liste', () => {
  it('ersetzt die Grammatik eines Bands, andere Bände und die Reihenfolge bleiben', () => {
    const vorher = Object.keys(LEHRWERK_GRAMMATIK)
    wendeGrammatikAn([eintrag('Green Line 1', { 'Unit 1': { 'Station 1': [{ text: 'Artikel', t: ['en.noun.articles/a-an'] }] } })])
    expect(Object.keys(LEHRWERK_GRAMMATIK)).toEqual(vorher)
    expect(Object.keys(LEHRWERK_GRAMMATIK['Green Line 1'])).toEqual(['Unit 1'])
    expect(LEHRWERK_GRAMMATIK['Green Line 2']).toEqual(LEHRWERK_GRAMMATIK_EINGEBAUT['Green Line 2'])
    expect(istUeberlagert('Green Line 1')).toBe(true)
    // Themen-Tabelle (Vorwissen, Planung) liest die überlagerte Fassung
    expect(kapitelThema('Green Line 1', 'Unit 1')?.grammatik).toBe('Artikel')
    // Unit 2 ohne Bearbeitung: wieder der Stand der Planungsmuster, nicht die Liste
    expect(kapitelThema('Green Line 1', 'Unit 2')?.grammatik).not.toMatch(/Besitzangaben/)
  })

  it('leere Liste stellt die eingebaute Fassung wieder her (auch in der Themen-Tabelle)', () => {
    wendeGrammatikAn([eintrag('Green Line 1', {})])
    wendeGrammatikAn([])
    expect(LEHRWERK_GRAMMATIK['Green Line 1']).toEqual(LEHRWERK_GRAMMATIK_EINGEBAUT['Green Line 1'])
    expect(istUeberlagert('Green Line 1')).toBe(false)
    expect(kapitelThema('Green Line 1', 'Unit 2')?.grammatik).toMatch(/Besitzangaben/)
  })

  it('neue Lehrwerke kommen dahinter; frühere Bände nur aus derselben Reihe', () => {
    wendeGrammatikAn([
      eintrag('Découvertes 2', { 'Unité 1': { '': [{ text: 'passé composé', t: [] }] } }, 'fr'),
      eintrag('Découvertes 1', { 'Unité 1': { '': [{ text: 'Artikel', t: [] }] } }, 'fr')
    ])
    const keys = Object.keys(LEHRWERK_GRAMMATIK)
    expect(keys.slice(-2)).toEqual(['Découvertes 1', 'Découvertes 2'])
    expect(fruehereBaendeDerReihe('Découvertes 2')).toEqual(['Découvertes 1'])
    expect(fruehereBaendeDerReihe('Green Line 3')).toEqual(['Green Line 1', 'Green Line 2'])
    // Englisch nach Jahrgang bleibt Green Line (Klasse 6 = Green Line 2) – Französisch zählt nicht mit
    expect(bekanntNachStand(undefined, 11).every((k) => k.startsWith('en.'))).toBe(true)
  })

  it('unbrauchbare Einträge werden übergangen', () => {
    wendeGrammatikAn([{ lehrwerkId: 'x', buch: '', sprache: 'en', kapitel: {} }, { foo: 1 } as unknown as LehrwerkGrammatikEintrag])
    expect(LEHRWERK_GRAMMATIK).toEqual(LEHRWERK_GRAMMATIK_EINGEBAUT)
  })
})

const buch: BuchGliederung = {
  units: [
    { name: 'Unit 1', sections: [{ name: 'Check-in' }, { name: 'Station 1' }, { name: 'Station 2' }, { name: 'Unit task' }] },
    { name: 'Unit 2', sections: [{ name: 'Station 1' }] }
  ]
}

describe('KI-Vorschläge prüfen und übernehmen', () => {
  const band = { 'Unit 1': { 'Station 1': [{ text: 'simple past', t: ['en.verb.past_simple'] }] } }

  it('Kennungen gegen den Katalog, Units/Abschnitte gegen das Buch, Doppeltes erkannt', () => {
    expect(kennungGueltig('en.verb.past_simple', 'englisch')).toBe(true)
    expect(kennungGueltig('en.verb.be_have/be-praesens', 'englisch')).toBe(true)
    expect(kennungGueltig('en.verb.erfunden', 'englisch')).toBe(false)
    expect(kennungGueltig('en.verb.past_simple', 'franzoesisch')).toBe(false)
    expect(kennungLabel('en.verb.be_have/be-praesens')).toContain(':')
    const v = pruefeVorschlaege(
      {
        vorschlaege: [
          { unit: 'unit 1', abschnitt: 'Station 2', text: 'be', kennungen: ['en.verb.be_have/be-praesens', 'en.quatsch'], fundstelle: 'S. 20' },
          { unit: 'Unit 1', abschnitt: 'Station 1', text: '', kennungen: ['en.verb.past_simple'], fundstelle: 'S. 22' },
          { unit: 'Unit 9', abschnitt: 'Station 1', text: 'x', kennungen: ['en.verb.past_simple'], fundstelle: '' },
          { unit: 'Unit 1', abschnitt: 'Unit task', text: 'y', kennungen: ['en.verb.past_simple'], fundstelle: '' },
          { unit: 'Unit 2', abschnitt: 'ganze Unit', text: 'z', kennungen: [], fundstelle: '' }
        ]
      },
      buch,
      band,
      'englisch'
    )
    expect(v.map((x) => x.status)).toEqual(['neu', 'vorhanden', 'unklar', 'neu', 'unklar'])
    expect(v[0]).toMatchObject({ unit: 'Unit 1', abschnitt: 'Station 2', t: ['en.verb.be_have/be-praesens'], verworfen: ['en.quatsch'], gewaehlt: true })
    // „Unit task" ist ein Abschnitt, nicht „die ganze Unit"
    expect(v[3].abschnitt).toBe('Unit task')
    expect(v[4].abschnitt).toBe('')
    expect(v.filter((x) => x.gewaehlt).length).toBe(2)
  })

  it('übernimmt nur Angehaktes, nur dazu und ohne Doppeltes – bestehende Einträge bleiben', () => {
    const v = pruefeVorschlaege(
      {
        vorschlaege: [
          { unit: 'Unit 1', abschnitt: 'Station 1', text: 'be', kennungen: ['en.verb.be_have/be-praesens'], fundstelle: '' },
          { unit: 'Unit 2', abschnitt: 'Station 1', text: 'past', kennungen: ['en.verb.past_simple'], fundstelle: '' }
        ]
      },
      buch,
      band,
      'englisch'
    )
    v[1].gewaehlt = false
    const r = uebernimmVorschlaege(band, [...v, v[0]], buch)
    expect(r.zahl).toBe(1)
    expect(r.band['Unit 1']['Station 1'].map((p) => p.text)).toEqual(['simple past', 'be'])
    expect(r.band['Unit 2']).toBeUndefined()
    // Das Original bleibt unverändert
    expect(band['Unit 1']['Station 1']).toHaveLength(1)
  })

  it('ordnet nach dem Buch, entfernt Leeres, verschiebt Punkte', () => {
    const o = ordneBand(
      {
        'Unit 2': { 'Station 1': [{ text: 'b', t: [] }] },
        'Unit 1': { 'Station 2': [{ text: 'c', t: [] }], '': [{ text: 'a', t: ['x', 'x'] }], 'Station 1': [] },
        Trailer: { '': [{ text: 't', t: [] }] }
      },
      buch
    )
    expect(Object.keys(o)).toEqual(['Unit 1', 'Unit 2', 'Trailer'])
    expect(Object.keys(o['Unit 1'])).toEqual(['', 'Station 2'])
    expect(o['Unit 1'][''][0].t).toEqual(['x'])
    const l = [
      { text: '1', t: [] },
      { text: '2', t: [] }
    ]
    expect(verschiebe(l, 0, 1).map((p) => p.text)).toEqual(['2', '1'])
    expect(verschiebe(l, 0, -1)).toBe(l)
  })
})
