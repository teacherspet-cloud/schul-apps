/**
 * Vokabeln – Paket 7 (Entscheidungen der Lehrkraft, 25.09.2026).
 *
 * - EINE Regel für graue Wörter auf allen Wegen: Zusatzwortschatz (im Buch grau) wird
 *   übernommen, gekennzeichnet und standardmäßig NICHT abgefragt. Vorher fiel er beim
 *   Schulbuch weg und wurde bei „Test automatisch erstellen“ mit abgefragt.
 * - Die Abfrage-Wahl (`include`) gehört zum Test, nicht in die gespeicherte Liste; alte Listen
 *   mit gespeichertem `include` werden beim Laden so behandelt, als fehlte es.
 * - Beide Wege zum Test (manuell, automatisch) haben dieselben Grundeinstellungen.
 * - Tests speichern Fach und Jahrgang für Suche und „Zuletzt bearbeitet“.
 */
import { describe, expect, it } from 'vitest'
import type { Textbook } from '@shared/types'
import { alsListenEintrag, ausListe, includedVocab, standardAbfrage } from '../src/renderer/src/modules/vokabeltest/model/vocab'
import { NO_MARKS, textbookEntries } from '../src/renderer/src/modules/vokabeltest/steps/TextbookPicker'
import { grundEinstellungen, STANDARD_VARIANTEN } from '../src/renderer/src/modules/vokabeltest/model/grundeinstellungen'
import { statsVon } from '../src/renderer/src/modules/vokabeltest/library'

const buch = {
  id: 'b',
  name: 'Testbuch',
  language: 'en',
  units: [
    {
      name: 'Unit 1',
      sections: [
        {
          name: 'A',
          entries: [
            { term: 'house', translation: 'Haus' },
            { term: 'shed', translation: 'Schuppen', grey: true },
            { term: 'seven', translation: 'sieben', inBox: true }
          ]
        }
      ]
    }
  ]
} as unknown as Textbook

describe('Zusatzwortschatz (im Buch grau): übernommen, gekennzeichnet, nicht abgefragt', () => {
  it('Schulbuch: graue Wörter kommen mit, sind gekennzeichnet und nicht abgefragt', () => {
    const e = textbookEntries(buch, 'Unit 1', ['A'], { ...NO_MARKS, grey: true })
    expect(e.map((x) => x.term)).toEqual(['house', 'shed'])
    expect(e.find((x) => x.term === 'shed')).toMatchObject({ grey: true, include: false })
    expect(includedVocab(e).map((x) => x.term)).toEqual(['house'])
  })
  it('gespeicherte Liste: graue Wörter nicht abgefragt – ein altes gespeichertes include zählt nicht', () => {
    const e = ausListe([
      { term: 'house', translation: 'Haus', include: false },
      { term: 'shed', translation: 'Schuppen', grey: true, include: true },
      { term: ' ', translation: '' }
    ])
    expect(e).toHaveLength(2)
    expect(e.map((x) => [x.term, x.include])).toEqual([
      ['house', true],
      ['shed', false]
    ])
    expect(e.every((x) => x.id)).toBe(true)
  })
  it('die Regel selbst', () => {
    expect(standardAbfrage({ grey: true })).toBe(false)
    expect(standardAbfrage({})).toBe(true)
  })
})

describe('Listen speichern keine Abfrage-Wahl', () => {
  it('alsListenEintrag lässt include und leere Felder weg, behält die Kennzeichen', () => {
    expect(alsListenEintrag({ term: ' shed ', translation: 'Schuppen', pos: '', note: 'S. 3', grey: true, inBox: false, include: false })).toEqual({
      term: 'shed',
      translation: 'Schuppen',
      note: 'S. 3',
      grey: true
    })
  })
})

describe('Beide Wege zum Test mit denselben Grundeinstellungen', () => {
  const app = { defaults: { stateId: 'NI', schoolTypeId: 'gymnasium', targetLanguage: 'en' } } as never
  const table = { version: 1, states: [] } as never
  it('zwei Varianten, Herkunft der Liste geht vor', () => {
    const s = grundEinstellungen(app, table, { language: 'fr', stateId: 'BY' }, 20)
    expect(s.variantCount).toBe(STANDARD_VARIANTEN)
    expect(s.variantCount).toBe(2)
    expect(s.targetLanguage).toBe('fr')
    expect(s.stateId).toBe('BY')
    expect(s.vocabCount).toBe(16) // Standardumfang 14–18 (29.09.2026)
    expect(s.pageLimit?.mode).toBe('auto')
  })
  it('Latein beginnt mit der Nennform-Aufgabe', () => {
    expect(grundEinstellungen(app, table, { language: 'la' }, 6).tasks.map((t) => t.type)).toContain('latinForms')
  })
})

describe('Tests speichern Fach und Jahrgang', () => {
  it('aus den Einstellungen, sonst aus der Herkunft der Liste', () => {
    const vocab = [{ id: '1', term: 'a', translation: 'b' }]
    expect(statsVon({ vocab, settings: null, doc: null }, { bookName: 'X', language: 'es', grade: 9 })).toMatchObject({
      language: 'es',
      subjectLabel: 'Spanisch',
      grade: 9
    })
    const ohne = statsVon({ vocab, settings: null, doc: null })
    expect('language' in ohne || 'grade' in ohne).toBe(false)
  })
})
