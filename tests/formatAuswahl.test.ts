import { describe, expect, it } from 'vitest'
import {
  anGleichverteilungBinden,
  formateMerken,
  formatHinderung,
  formatListe,
  gemerkteFormate,
  gleichVerteilen,
  vorauswahlFormate
} from '../src/renderer/src/modules/vokabeltest/generation/formatAuswahl'
import { planAutoTasks } from '../src/renderer/src/modules/vokabeltest/generation/autoPlan'
import type { TaskSelection, TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

// Formatwahl beim „Test automatisch erstellen" (10.10.2026)
const klasse = (grade: number, level: TestSettings['level'], targetLanguage = 'en'): TestSettings =>
  ({
    targetLanguage,
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade,
    level,
    vocabCount: 0,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  }) as TestSettings
const letters = 'abcdefghijklmnopqrstuvwxyz'
const vocab = (n: number): VocabEntry[] =>
  Array.from({ length: n }, (_, i) => ({ id: `v${i}`, term: `word${letters[i % 26]}${letters[Math.floor(i / 26) % 26]}`, translation: `Wort ${i}` }))
const count = (tasks: { count: number }[]): number => tasks.reduce((s, t) => s + t.count, 0)
const punkte = (tasks: TaskSelection[]): number => tasks.reduce((s, t) => s + t.count * t.pointsPerItem, 0)

describe('Eignung der Aufgabenformate nach Klasse und Niveau', () => {
  it('graut Mediation, Kollokationen, Wortbildung und Wörter erklären in Klasse 5 (A1) aus – mit Hinweis', () => {
    const liste = formatListe(klasse(5, 'A1'))
    for (const id of ['mediation', 'collocations', 'wordFormation', 'writeDefinitions'] as const) {
      const f = liste.find((x) => x.id === id)!
      expect(f.geeignet, id).toBe(false)
      expect(f.hinweis).toBe('ab B1 / Kl. 8')
    }
    for (const id of ['pictureLabel', 'scrambled', 'trueFalse', 'gapSentences', 'multipleChoice', 'matchDefinitions'] as const) {
      expect(liste.find((x) => x.id === id)?.geeignet, id).toBe(true)
    }
  })

  it('verlangt Niveau UND Klasse; ab B1 in Klasse 9 passt Mediation', () => {
    expect(formatHinderung('mediation', klasse(9, 'B1'))).toBeNull()
    expect(formatHinderung('mediation', klasse(7, 'B1'))).toBe('ab B1 / Kl. 8')
    expect(formatHinderung('mediation', klasse(9, 'A2'))).toBe('ab B1 / Kl. 8')
    expect(formatHinderung('synonymsAntonyms', klasse(6, 'A2'))).toBe('ab A2 / Kl. 7')
  })

  it('listet alle Formate der Sprache wie „Test einstellen" – Latein ohne Mediation, mit Nennformen', () => {
    const en = formatListe(klasse(7, 'A2')).map((f) => f.id)
    expect(en).toContain('crossword')
    expect(en).not.toContain('freeText')
    expect(en).not.toContain('latinForms')
    const la = formatListe(klasse(7, 'A1', 'la')).map((f) => f.id)
    expect(la).toContain('latinForms')
    expect(la).not.toContain('mediation')
  })
})

describe('Vorauswahl', () => {
  it('wählt für A1/Klasse 5 Lückensätze, Bilder beschriften, Multiple Choice und Erklärungen zuordnen', () => {
    expect(vorauswahlFormate(klasse(5, 'A1'))).toEqual(['gapSentences', 'pictureLabel', 'multipleChoice', 'matchDefinitions'])
  })

  it('wählt drei bis vier geeignete Formate auf jeder Stufe', () => {
    for (const [g, l, s] of [
      [5, 'A1', 'en'],
      [7, 'A2', 'en'],
      [10, 'B1+', 'en'],
      [6, 'A1', 'la'],
      [8, 'A1', 'fr'],
      [9, 'A2', 'ru']
    ] as const) {
      const wahl = vorauswahlFormate(klasse(g, l, s))
      expect(wahl.length, `${s} ${g} ${l}`).toBeGreaterThanOrEqual(3)
      expect(wahl.length).toBeLessThanOrEqual(4)
      for (const id of wahl) expect(formatHinderung(id, klasse(g, l, s)), id).toBeNull()
    }
  })

  it('merkt sich die letzte Auswahl je Klasse und Niveau', () => {
    const speicher = new Map<string, string>()
    globalThis.localStorage = {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => void speicher.set(k, v)
    } as Storage
    expect(gemerkteFormate(klasse(5, 'A1'))).toBeNull()
    formateMerken(klasse(5, 'A1'), ['gapSentences', 'scrambled'])
    expect(gemerkteFormate(klasse(5, 'A1'))).toEqual(['gapSentences', 'scrambled'])
    expect(gemerkteFormate(klasse(6, 'A1'))).toBeNull()
  })
})

describe('Gleichmäßige Verteilung auf die gewählten Formate', () => {
  it('verteilt gleichmäßig und hält Summe und Mindestanzahlen ein', () => {
    expect(gleichVerteilen(['gapSentences', 'multipleChoice', 'matchDefinitions'], 20).map((t) => t.count)).toEqual([7, 7, 6])
    const knapp = gleichVerteilen(['gapSentences', 'categorize', 'matchDefinitions', 'multipleChoice'], 5)
    expect(count(knapp)).toBe(5)
  })

  it('lässt die KI nur wenig von der Gleichverteilung abweichen', () => {
    const formate = ['gapSentences', 'multipleChoice', 'matchDefinitions', 'pictureLabel'] as const
    const gebunden = anGleichverteilungBinden(
      [
        { type: 'gapSentences', count: 14 },
        { type: 'pictureLabel', count: 6 }
      ],
      [...formate],
      20
    )
    expect(count(gebunden)).toBe(20)
    expect(gebunden.map((t) => t.type)).toEqual([...formate])
    for (const t of gebunden) expect(Math.abs(t.count - 5)).toBeLessThanOrEqual(1)
  })

  it('nutzt beim Erstellen nur die gewählten Formate – auch ohne KI', async () => {
    const failing = async <T>(): Promise<T> => {
      throw new Error('keine KI im Test')
    }
    const { tasks, vocabCount } = await planAutoTasks(vocab(30), klasse(5, 'A1'), 20, failing as never, undefined, ['gapSentences', 'scrambled', 'trueFalse'])
    expect(tasks.map((t) => t.type).sort()).toEqual(['gapSentences', 'scrambled', 'trueFalse'])
    expect(count(tasks)).toBe(vocabCount)
    expect(punkte(tasks)).toBeCloseTo(20, 5)
    const ki = async <T>(): Promise<T> => ({ tasks: [{ type: 'gapSentences', count: 20, reason: '' }] }) as T
    const mitKi = await planAutoTasks(vocab(30), klasse(5, 'A1'), 20, ki, undefined, ['gapSentences', 'scrambled', 'trueFalse'])
    expect(mitKi.tasks).toHaveLength(3)
    for (const t of mitKi.tasks) expect(Math.abs(t.count - 20 / 3)).toBeLessThanOrEqual(3)
  })
})
