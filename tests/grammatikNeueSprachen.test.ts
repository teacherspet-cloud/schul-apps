/**
 * Grammatiktest für die neuen Schulfremdsprachen (30.09.2026): Niederländisch, Polnisch,
 * Tschechisch, Portugiesisch, Türkisch, Chinesisch – Grundprogression je 15–30 Themen nach
 * Lernjahr und GER, jedes Thema mit Beleg bzw. „Faustregel".
 */
import { describe, expect, it } from 'vitest'
import { cefrIndex, type CefrLevel } from '../src/shared/types'
import {
  einfuehrungsNiveau,
  GRAMMAR_SUBJECTS,
  GRAMMAR_TOPICS,
  grammarTopicsFor,
  hasGrammar,
  NEUE_SCHULSPRACHEN,
  needsSequence,
  ueberNiveau
} from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import { GRAMMATIK_FAECHER, programmPasst, PROGRAMM_FAECHER } from '../src/renderer/src/shared/programmSichtbarkeit'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { SPRACHREGELN, testPrompt } from '../src/renderer/src/modules/grammatiktest/generation/generateTest'
import type { GrammarTestMeta } from '../src/renderer/src/modules/grammatiktest/model/types'

/**
 * Höchstes Einführungsniveau je Lernjahr (Skala der 2. Fremdsprache): Lernjahr 1 ≙ A1(+),
 * 2 ≙ A2, 3 ≙ A2+, 4 ≙ B1, 5 ≙ B1+, 6 ≙ B2 – kein Thema darf früher liegen, als sein Niveau erlaubt.
 */
const HOECHSTES_NIVEAU: Record<number, CefrLevel> = { 1: 'A1+', 2: 'A2', 3: 'A2+', 4: 'B1', 5: 'B1+', 6: 'B2' }

const themen = (fach: string) => GRAMMAR_TOPICS.filter((t) => t.subject === fach)

describe('Neue Schulfremdsprachen im Grammatiktest', () => {
  it('sind wählbar: Themenliste, Fremdsprachenfolge und Programmsichtbarkeit', () => {
    for (const fach of NEUE_SCHULSPRACHEN) {
      expect(hasGrammar(fach), fach).toBe(true)
      expect(needsSequence(fach), fach).toBe(true)
      expect(GRAMMAR_SUBJECTS).toContain(fach)
      expect(GRAMMATIK_FAECHER as readonly string[]).toContain(fach)
      expect(programmPasst(PROGRAMM_FAECHER.grammatiktest, [fach]), fach).toBe(true)
    }
  })

  it('je Sprache 15–30 Themen, jedes mit Beleg oder Kennzeichnung „Faustregel"', () => {
    for (const fach of NEUE_SCHULSPRACHEN) {
      const liste = themen(fach)
      expect(liste.length, fach).toBeGreaterThanOrEqual(15)
      expect(liste.length, fach).toBeLessThanOrEqual(30)
      for (const t of liste) {
        expect(t.source?.trim(), t.id).toBeTruthy()
        expect(t.scale, t.id).toBe('lernjahr')
        expect(einfuehrungsNiveau(t.level), t.id).not.toBeNull()
      }
      expect(liste.every((t) => /Faustregel|Lehrplan|Rahmenlehrplan/.test(t.source!))).toBe(true)
    }
  })

  it('Progression plausibel: kein Thema über dem GER-Niveau seines Lernjahrs, Beginn im 1. Lernjahr', () => {
    for (const fach of NEUE_SCHULSPRACHEN) {
      const liste = themen(fach)
      for (const t of liste) {
        const n = einfuehrungsNiveau(t.level)!
        expect(cefrIndex(n) <= cefrIndex(HOECHSTES_NIVEAU[Math.min(t.from, 6)]), `${t.id}: ${t.level} im ${t.from}. Lernjahr`).toBe(true)
      }
      // Grundprogression: mehrere Themen im 1. Lernjahr, dazu Themen ab dem 3. Lernjahr
      expect(liste.filter((t) => t.from === 1).length, fach).toBeGreaterThanOrEqual(5)
      expect(
        liste.some((t) => t.from >= 3),
        fach
      ).toBe(true)
    }
  })

  it('Klasse 7, 2. Fremdsprache, A1: nur A1-Themen des Anfangs, keine B1-Themen', () => {
    for (const fach of NEUE_SCHULSPRACHEN) {
      const liste = grammarTopicsFor({ subjectId: fach, grade: 7, stateId: 'BY', schoolTypeId: 'gymnasium', sequence: 'fs2', cefrLevel: 'A1' })
      expect(liste.length, fach).toBeGreaterThan(3)
      expect(
        liste.filter((t) => ueberNiveau(t, 'A1')),
        fach
      ).toEqual([])
      expect(
        liste.some((t) => einfuehrungsNiveau(t.level) === 'B1'),
        fach
      ).toBe(false)
    }
  })

  it('Beispiele in der Zielsprache mit ihrer Schrift', () => {
    const beispiele = (fach: string) =>
      themen(fach)
        .flatMap((t) => t.examples ?? [])
        .join(' ')
    expect(beispiele('chinesisch')).toMatch(/[一-鿿]/)
    // Pinyin mit Tonzeichen
    expect(beispiele('chinesisch')).toMatch(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/)
    expect(beispiele('polnisch')).toMatch(/[ąćęłńóśźż]/)
    expect(beispiele('tschechisch')).toMatch(/[čďěňřšťůž]/)
    expect(beispiele('tuerkisch')).toMatch(/[çğışöü]/)
    expect(beispiele('portugiesisch')).toMatch(/[ãõçáéíóúâêô]/)
  })

  it('der KI-Auftrag nennt Schrift- und Varietätsregeln der Sprache', () => {
    const t0 = newTest({ id: 'd', name: 'Standard', header: {}, page: {}, tasks: {} } as never, 'BY', 'gymnasium', 'Gymnasium')
    const auftrag = (fach: string, topics: string[]) =>
      testPrompt({ ...t0, meta: { ...t0.meta, subjectId: fach, subjectLabel: fach, grade: 8, languageOrder: 2, cefrLevel: 'A2', topics } as GrammarTestMeta })
    const zh = auftrag('chinesisch', ['zh.asp.le'])
    expect(zh).toContain('Pinyin')
    expect(zh).toContain('Kurzzeichen')
    expect(zh).toContain('了')
    expect(auftrag('tuerkisch', ['tr.nom.cogul'])).toContain('Vokalharmonie')
    expect(auftrag('portugiesisch', ['pt.verb.ser_estar'])).toContain('europäisches Portugiesisch')
    for (const fach of NEUE_SCHULSPRACHEN) expect(SPRACHREGELN[fach]?.length, fach).toBeGreaterThan(0)
  })
})
