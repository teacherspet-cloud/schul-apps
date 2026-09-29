/**
 * Russischer Numerus nach Zahlen (29.09.2026): 1 балл / 2 балла / 5 баллов – auf Schülerblättern
 * darf nach einer Zahl nie die falsche Form stehen.
 */
import { describe, expect, it } from 'vitest'
import { RU_BALL, RU_MINUTA, RU_SLOVO, russischPlural } from '@renderer/shared/russischPlural'
import { notNeededText } from '@renderer/modules/vokabeltest/render/helpTexts'

describe('russischPlural', () => {
  it('wählt die Form nach den letzten Ziffern', () => {
    const f = (n: number): string => `${n} ${russischPlural(n, RU_BALL)}`
    expect([0, 1, 2, 4, 5, 11, 12, 14, 20, 21, 22, 25, 101, 111, 112].map(f)).toEqual([
      '0 баллов',
      '1 балл',
      '2 балла',
      '4 балла',
      '5 баллов',
      '11 баллов',
      '12 баллов',
      '14 баллов',
      '20 баллов',
      '21 балл',
      '22 балла',
      '25 баллов',
      '101 балл',
      '111 баллов',
      '112 баллов'
    ])
    expect(russischPlural(45, RU_MINUTA)).toBe('минут')
    expect(russischPlural(90, RU_MINUTA)).toBe('минут')
    expect(russischPlural(342, RU_SLOVO)).toBe('слова')
    expect(russischPlural(2.5, RU_BALL)).toBe('балла')
  })

  it('stimmt im Wortkasten-Hinweis auch das Verb ab', () => {
    expect(notNeededText(1, 'ru')).toBe('1 слово тебе не понадобится.')
    expect(notNeededText(3, 'ru')).toBe('3 слова тебе не понадобятся.')
    expect(notNeededText(5, 'ru')).toBe('5 слов тебе не понадобятся.')
    expect(notNeededText(2, 'it')).toBe('Ci sono 2 parole in più.')
  })
})
