import { describe, expect, it } from 'vitest'
import { genugFuerVarianten, planVariants } from '../src/renderer/src/modules/vokabeltest/generation/distribute'
import { fuerTest, ohneHinweise } from '../src/renderer/src/modules/vokabeltest/model/vocab'
import type { TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * Befunde der Lehrkraft (02.10.2026): Bei „Unterschiedliche Vokabeln je Variante" dürfen sich die
 * Varianten überschneiden, und Klammer-Hinweise („[no pl]") gehören weder auf den Test noch in
 * die Lösung.
 */

const liste = (n: number): VocabEntry[] => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, term: `word${i}`, translation: `Wort${i}`, include: true }))

const einstellungen = (variantCount: number, count: number): TestSettings =>
  ({
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 7,
    level: 'A2',
    vocabCount: count,
    variantCount,
    variantMode: 'differentVocab',
    tasks: [{ type: 'gapSentences', count, pointsPerItem: 1 }],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 7
  }) as TestSettings

const ids = (p: ReturnType<typeof planVariants>[number]): string[] => p.assignments.flatMap((a) => a.vocab.map((v) => v.id))

describe('Unterschiedliche Vokabeln je Variante – mit Überschneidung', () => {
  it('B teilt etwa ein Drittel mit A, C teilt Wörter mit A und B, jede Variante hat neue', () => {
    const [a, b, c] = planVariants(liste(40), einstellungen(3, 12))
    const inA = new Set(ids(a))
    const inAB = new Set([...ids(a), ...ids(b)])
    const gemeinsamB = ids(b).filter((x) => inA.has(x)).length
    expect(ids(b)).toHaveLength(12)
    expect(gemeinsamB).toBeGreaterThanOrEqual(3)
    expect(gemeinsamB).toBeLessThanOrEqual(6)
    expect(ids(c).filter((x) => inAB.has(x)).length).toBeGreaterThanOrEqual(3)
    expect(ids(c).some((x) => !inAB.has(x))).toBe(true)
    // innerhalb einer Variante kommt kein Wort doppelt vor
    for (const p of [a, b, c]) expect(new Set(ids(p)).size).toBe(ids(p).length)
  })

  it('bei knapper Liste wächst die Überschneidung von selbst; die Freigabe braucht ein Drittel neue Wörter', () => {
    const [a, b] = planVariants(liste(15), einstellungen(2, 12))
    expect(ids(b)).toHaveLength(12)
    expect(ids(b).filter((x) => !ids(a).includes(x))).toHaveLength(3)
    expect(genugFuerVarianten(16, 12)).toBe(true)
    expect(genugFuerVarianten(15, 12)).toBe(false)
  })
})

describe('Klammer-Hinweise der Wortliste', () => {
  it('fallen aus Wort und Übersetzung weg und wandern in die Notiz für die KI', () => {
    expect(ohneHinweise('information [no pl]').text).toBe('information')
    expect(ohneHinweise('(to) look [infml]').text).toBe('(to) look')
    expect(ohneHinweise('[pl]').text).toBe('[pl]')
    const [v] = fuerTest([{ id: 'x', term: 'information [no pl]', translation: 'Pfund [Währung]', include: true }])
    expect(v.term).toBe('information')
    expect(v.translation).toBe('Pfund')
    expect(v.note).toMatch(/no pl; Währung/)
  })
})
