import { describe, expect, it } from 'vitest'
import { ohneLaengenHinweis } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { describeBlock } from '../src/renderer/src/modules/vokabeltest/generation/quality'
import type { GapBlock } from '../src/renderer/src/modules/vokabeltest/model/types'

/* Befunde der Lehrkraft (23.10.2026): falscher Prüfhinweis „no word box" und keine Buchstabenzahl für Lernende */
describe('Lückensätze ohne Wortkasten', () => {
  const block = {
    id: 'b',
    taskType: 'gapSentences',
    kind: 'gap',
    title: 'Fill in the gaps',
    instruction: 'Complete the sentences with fitting words.',
    pointsPerItem: 1,
    wordBank: false,
    firstLetterHint: true,
    extraBankWords: [],
    items: [{ id: '1', sentences: [{ before: 'The', after: 'barked loudly.' }], answer: 'dog' }]
  } as unknown as GapBlock
  it('die Prüfung sieht den Anfangsbuchstaben ohne Länge und weiß, dass es keinen Wortkasten gibt', () => {
    const t = describeBlock(block)
    expect(t).toContain('The d… barked loudly.')
    expect(t).toContain('NO word box')
    expect(t).not.toContain('first letter given')
  })
  it('KI-Längenhinweise fallen weg', () => {
    expect(ohneLaengenHinweis('The c _ _ _ _ is red.')).toBe('The is red.')
    expect(ohneLaengenHinweis('I like (5 letters) apples')).toBe('I like apples')
    expect(ohneLaengenHinweis('He was very ____ .')).toBe('He was very .')
    expect(ohneLaengenHinweis('my_name and snake_case')).toBe('my_name and snake_case')
  })
})
