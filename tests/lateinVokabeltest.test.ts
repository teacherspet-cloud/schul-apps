import { describe, expect, it } from 'vitest'
import { istLatein, lateinRegeln, nennformLabel, NICHT_IN_LATEIN, NUR_LATEIN, passtZurSprache } from '../src/renderer/src/modules/vokabeltest/didactics/latein'
import { TASK_TYPES } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { systemPrompt } from '../src/renderer/src/modules/vokabeltest/generation/generate'
import { blockPoints, itemCount } from '../src/renderer/src/modules/vokabeltest/model/blocks'
import { LANGUAGES, type Block, type TestSettings, type VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * Vokabeltests im Fach Latein. Grundlage ist die Recherche vom 24.09.2026; die Belege stehen
 * in `didactics/latein.ts`. Entschieden mit der Lehrkraft am selben Tag:
 * alle vier Nennformen, nur Wortschatzformate (keine Grammatik), nur Lateinisch → Deutsch,
 * Teilpunkte für Form und Bedeutungen.
 */

const settings = (targetLanguage: string): TestSettings =>
  ({
    targetLanguage,
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 2,
    grade: 7,
    level: 'A1',
    vocabCount: 10,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  }) as TestSettings

describe('Latein ist als Zielsprache wählbar', () => {
  it('steht in der Sprachliste', () => {
    expect(LANGUAGES.map((l) => l.value)).toContain('la')
  })

  it('wird erkannt', () => {
    expect(istLatein('la')).toBe(true)
    expect(istLatein('en')).toBe(false)
  })
})

describe('Nennformen je Wortart', () => {
  /*
   * Aufbau des amtlichen Muster-Vokabeltests (Leitfaden Latein SH 2016, S. 25). Die Ansage
   * ist nötig: Bei „servus" wäre sonst unklar, ob Genitiv oder Akkusativ verlangt ist –
   * beides steht je nach Lehrwerk und Lernstand in der Liste.
   */
  const v = (wordClass: VocabEntry['wordClass']): VocabEntry => ({ id: 'x', term: 't', translation: 'ü', wordClass })

  it('fragt beim Substantiv Genitiv und Genus', () => {
    expect(nennformLabel(v('substantiv'))).toBe('Genitiv, Genus:')
  })

  it('fragt beim Verb die Stammformen', () => {
    expect(nennformLabel(v('verb'))).toBe('Stammformen:')
  })

  it('fragt beim Adjektiv die weiteren Endungen', () => {
    expect(nennformLabel(v('adjektiv'))).toBe('f., n.:')
  })

  it('fragt bei der Präposition den Kasus', () => {
    expect(nennformLabel(v('praeposition'))).toBe('mit Kasus:')
  })

  it('lässt die Spalte leer, wo es keine Nennform gibt', () => {
    // Im Mustertest steht bei quondam, neque, numquam, saepe ein Strich
    expect(nennformLabel(v('adverb'))).toBe('—')
    expect(nennformLabel(v(undefined))).toBe('—')
  })
})

describe('Welche Aufgabenarten es in Latein gibt', () => {
  it('bietet die lateinischen Formate nur in Latein an', () => {
    for (const id of NUR_LATEIN) {
      expect(passtZurSprache(id, 'la'), id).toBe(true)
      expect(passtZurSprache(id, 'en'), id).toBe(false)
    }
  })

  it('lässt in Latein weg, was aktiven Sprachgebrauch verlangt', () => {
    /*
     * „Latein ist keine Sprache, die Schülerinnen und Schüler aktiv beherrschen sollen"
     * (Leitfaden Latein SH 2016, S. 14). Dialog, eigene Sätze und Sprachmittlung haben im
     * Lateinunterricht keinen Ort – sie werden gar nicht erst angeboten.
     */
    for (const id of NICHT_IN_LATEIN) {
      expect(passtZurSprache(id, 'la'), id).toBe(false)
      expect(passtZurSprache(id, 'en'), id).toBe(true)
    }
  })

  it('enthält keine Grammatikaufgaben', () => {
    /*
     * „Grammatische Aufgaben sind nicht Teil des Vokabeltests" (ebd., S. 21). Formenbestimmung
     * und Konstruktionen gehören in den Grammatiktest – den es in dieser App bereits gibt.
     */
    const lateinFormate = NUR_LATEIN.map((id) => TASK_TYPES[id])
    for (const def of lateinFormate) {
      const text = `${def.label} ${def.description} ${def.defaultInstruction}`.toLowerCase()
      expect(text, def.id).not.toMatch(/aci|ablativus|participium|form bestimmen|formen bestimmen/)
    }
  })

  it('kennt zu jedem lateinischen Format eine Beschreibung', () => {
    for (const id of NUR_LATEIN) {
      expect(TASK_TYPES[id]?.label, id).toBeTruthy()
      expect(TASK_TYPES[id]?.description, id).toBeTruthy()
    }
  })
})

describe('Bewertung des Nennform-Blocks', () => {
  const block = {
    id: 'b',
    taskType: 'latinForms',
    title: 't',
    instruction: 'i',
    pointsPerItem: 2,
    kind: 'latinForms',
    pointsForm: 1,
    pointsMeaning: 1,
    items: [
      { id: '1', term: 'servus', formLabel: 'Genitiv, Genus:', form: 'servī m.', meanings: 'Sklave, Diener' },
      { id: '2', term: 'cantāre', formLabel: 'Stammformen:', form: 'cantō, cantāvī, cantātum', meanings: 'singen' }
    ]
  } as Block

  it('zählt jede Vokabel als eine Einheit', () => {
    expect(itemCount(block)).toBe(2)
  })

  it('vergibt Punkte für Form UND Bedeutungen getrennt', () => {
    /*
     * Wer alle Bedeutungen kann und nur das Genus vergisst, hat nicht nichts gewusst.
     * Eine landesweite Vorgabe gibt es nicht – Schleswig-Holstein überlässt die Gewichtung
     * ausdrücklich der Fachkonferenz, deshalb sind die Werte änderbar.
     */
    expect(blockPoints(block)).toBe(4)
  })
})

describe('Die Regeln stehen im Prompt', () => {
  it('nennt bei Latein die Besonderheiten', () => {
    const p = systemPrompt(settings('la'))
    expect(p).toContain('Lateinisch → Deutsch')
    expect(p).toContain('Stammformen')
    expect(p).toContain('KEINE Formenbestimmung')
    expect(p).toContain('ALLE im Lehrwerk üblichen Bedeutungen')
  })

  it('lässt sie bei den modernen Fremdsprachen weg', () => {
    expect(systemPrompt(settings('en'))).not.toContain('Lateinisch → Deutsch')
  })

  it('spricht bei Latein deutsch, bei Englisch englisch', () => {
    expect(systemPrompt(settings('la'))).toContain('Lateinlehrkraft')
    expect(systemPrompt(settings('en'))).toContain('experienced teacher')
  })

  it('verbietet ausdrücklich das aktive Formulieren auf Latein', () => {
    expect(lateinRegeln()).toContain('Keine Aufgabe verlangt, etwas auf Latein zu formulieren')
  })
})
