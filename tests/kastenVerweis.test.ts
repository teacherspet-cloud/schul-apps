import { describe, expect, it } from 'vitest'
import { anweisungFuer } from '../src/renderer/src/modules/vokabeltest/model/blocks'
import type { Block } from '../src/renderer/src/modules/vokabeltest/model/types'

/* „from the box" ohne Kasten (06.10.2026) */
const gap = (instruction: string, wordBank: boolean): Block =>
  ({
    kind: 'gap',
    instruction,
    wordBank,
    items: [{ id: 'i', vocabId: 'v', before: 'I', answer: 'run', after: '.', bankWord: 'run' }],
    extraBankWords: []
  }) as unknown as Block

describe('Arbeitsanweisung passend zum Wortkasten', () => {
  it('ohne Kasten fällt der Verweis weg – Englisch, Deutsch, Französisch, Spanisch', () => {
    expect(anweisungFuer(gap('Complete the dialogue with words and phrases from the box.', false))).toBe('Complete the dialogue with words and phrases.')
    expect(anweisungFuer(gap('Fill in the gaps. Use the words in the box.', false))).toBe('Fill in the gaps. Use the words.')
    expect(anweisungFuer(gap('Ergänze die Sätze mit den Wörtern aus dem Kasten.', false))).toBe('Ergänze die Sätze mit den Wörtern.')
    expect(anweisungFuer(gap("Complète avec les mots de l'encadré.", false))).toBe('Complète avec les mots.')
    expect(anweisungFuer(gap('Completa con las palabras del recuadro.', false))).toBe('Completa con las palabras.')
  })
  it('mit Kasten bleibt die Anweisung unverändert', () => {
    expect(anweisungFuer(gap('Complete the dialogue with words from the box.', true))).toBe('Complete the dialogue with words from the box.')
  })
})
