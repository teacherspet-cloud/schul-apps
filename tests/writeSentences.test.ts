import { describe, expect, it } from 'vitest'
import { mitSituation, ohneBeispielHinweis, TASK_TYPES } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * „Write sentences" (Lehrkraft, 02.10.2026): Situation und Beispiel helfen am Gymnasium zu sehr –
 * dort nur das Wort. Haupt- und Realschule behalten die Vorgabe; integrierte Schulformen nach
 * Kursniveau (ohne Angabe: mit Vorgabe).
 */
describe('Write sentences nach Schulform', () => {
  it('mit Situation nur außerhalb des Gymnasiums', () => {
    expect(mitSituation({ schoolTypeId: 'gymnasium', stateId: 'NI' })).toBe(false)
    expect(mitSituation({ schoolTypeId: 'realschule', stateId: 'NI' })).toBe(true)
    expect(mitSituation({ schoolTypeId: 'hauptschule', stateId: 'NI' })).toBe(true)
    expect(mitSituation({ schoolTypeId: 'gesamtschule', stateId: 'NW' })).toBe(true)
    expect(mitSituation({ schoolTypeId: 'gesamtschule', stateId: 'NW', kursniveau: 'E' })).toBe(false)
  })

  it('Hinweise auf Beispiele fallen aus der Anweisung', () => {
    expect(ohneBeispielHinweis('Write a sentence with each word. These examples show one possible answer.')).toBe('Write a sentence with each word.')
    expect(ohneBeispielHinweis('Write a sentence with each word, e.g. about your holiday. Show that you know what it means.')).toBe('Show that you know what it means.')
  })

  it('am Gymnasium steht nur das Wort, an der Realschule die Situation', () => {
    const vocab: VocabEntry[] = [{ id: 'v1', term: 'to explore', translation: 'erkunden' } as VocabEntry]
    const daten = { instruction: 'Write a sentence with each word. These examples show one possible answer.', items: [{ vocabId: 'v1', prompt: 'to explore – your last holiday', modelAnswer: 'We explored the old town.' }] }
    const settings = (schoolTypeId: string): TestSettings => ({ targetLanguage: 'fr', stateId: 'NI', schoolTypeId, grade: 8, tasks: [] }) as unknown as TestSettings
    const ctx = (schoolTypeId: string) => ({ settings: settings(schoolTypeId), languageName: 'French', rng: createRng(1), allVocab: vocab })
    const gym = TASK_TYPES.writeSentences.build(vocab, daten, ctx('gymnasium')) as { instruction: string; items: { prompt: string; modelAnswer: string }[] }
    expect(gym.items[0].prompt).toBe('to explore')
    expect(gym.items[0].modelAnswer).toBe('We explored the old town.')
    expect(gym.instruction).not.toMatch(/example|possible answer/i)
    const real = TASK_TYPES.writeSentences.build(vocab, daten, ctx('realschule')) as { items: { prompt: string }[] }
    expect(real.items[0].prompt).toBe('to explore – your last holiday')
    expect(TASK_TYPES.writeSentences.prompt!(vocab, ctx('gymnasium'))).toContain('ONLY the word')
  })
})
