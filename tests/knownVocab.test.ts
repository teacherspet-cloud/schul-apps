import { describe, expect, it } from 'vitest'
import type { Textbook, TextbookMeta } from '../src/shared/types'
import { collectKnownVocab, earlierVolumes, knownVocabRules, knownVocabRulesDe, seriesName, wordsBefore } from '../src/renderer/src/shared/knownVocab'

const book = (id: string, name: string, grade: number, units: [string, string, string[]][]): Textbook => ({
  id,
  name,
  language: 'en',
  grade,
  importedAt: '2026-01-01T00:00:00.000Z',
  units: Object.entries(
    units.reduce<Record<string, [string, string[]][]>>((acc, [unit, section, words]) => {
      acc[unit] = [...(acc[unit] ?? []), [section, words]]
      return acc
    }, {})
  ).map(([unit, sections]) => ({
    name: unit,
    sections: sections.map(([name, words]) => ({ name, entries: words.map((w) => ({ term: w, translation: `${w} auf Deutsch` })) }))
  }))
})

const meta = (b: Textbook): TextbookMeta => ({
  id: b.id,
  name: b.name,
  language: b.language,
  grade: b.grade,
  units: b.units.map((u) => ({ name: u.name, sections: u.sections.map((s) => ({ name: s.name, marks: [s.entries.length] })) })),
  entryCount: b.units.reduce((n, u) => n + u.sections.reduce((m, s) => m + s.entries.length, 0), 0)
})

const gl1 = book('gl1', 'Green Line 1', 5, [
  ['Welcome', 'Check-in', ['hello', 'goodbye']],
  ['Unit 1', 'Station 1', ['classroom', 'ruler']],
  ['Unit 1', 'Station 2', ['pencil']],
  ['Unit 2', 'Station 1', ['garden']]
])
const gl2 = book('gl2', 'Green Line 2', 6, [
  ['Unit 1', 'Station 1', ['holiday', 'beach']],
  ['Unit 2', 'Station 1', ['museum']]
])

describe('Wortschatz vorheriger Units und Bände', () => {
  it('erkennt Bände derselben Reihe unabhängig von der Bandbezeichnung', () => {
    expect(seriesName('Green Line 3')).toBe('Green Line')
    expect(seriesName('Green Line Transition')).toBe('Green Line')
    expect(seriesName('Découvertes 2')).toBe('Découvertes')
  })

  it('nimmt nur frühere Bände derselben Reihe und Sprache', () => {
    const french = { ...meta(gl1), id: 'dec1', name: 'Découvertes 1', language: 'fr' }
    const earlier = earlierVolumes([meta(gl1), meta(gl2), french], meta(gl2))
    expect(earlier.map((b) => b.id)).toEqual(['gl1'])
  })

  it('zählt im Band nur, was vor den gewählten Abschnitten steht', () => {
    expect(wordsBefore(gl1, 'Unit 1', ['Station 2'])).toEqual(['hello', 'goodbye', 'classroom', 'ruler'])
    expect(wordsBefore(gl1, 'Unit 2', ['Station 1'])).toEqual(['hello', 'goodbye', 'classroom', 'ruler', 'pencil'])
    // Ohne gewählten Abschnitt gilt die ganze Unit als behandelt
    expect(wordsBefore(gl1, 'Welcome', [])).toEqual(['hello', 'goodbye'])
  })

  it('nimmt die früheren Bände dazu und ist bis Klasse 7 verbindlich', async () => {
    const load = async (id: string): Promise<Textbook> => [gl1, gl2].find((b) => b.id === id)!
    const known = await collectKnownVocab(gl2, 'Unit 2', ['Station 1'], 6, [meta(gl1), meta(gl2)], load)
    expect(known?.words).toEqual(['hello', 'goodbye', 'classroom', 'ruler', 'pencil', 'garden', 'holiday', 'beach'])
    expect(known?.strict).toBe(true)
    expect(known?.source).toContain('Green Line 1 bis Green Line 2')
  })

  it('ist ab Klasse 8 nur noch eine Orientierung', async () => {
    const load = async (): Promise<Textbook> => gl1
    const known = await collectKnownVocab(gl2, 'Unit 2', ['Station 1'], 8, [meta(gl2)], load)
    expect(known?.strict).toBe(false)
    expect(knownVocabRulesDe(known)).toContain('Bleibe möglichst in diesem Wortschatz')
    expect(knownVocabRules(known).join(' ')).not.toContain('ONLY vocabulary')
  })

  it('schreibt bei jüngeren Klassen eine klare Grenze in den Prompt', async () => {
    // Am Anfang von Band 2 ist nur der Wortschatz von Band 1 bekannt
    const load = async (): Promise<Textbook> => gl1
    const known = await collectKnownVocab(gl2, 'Unit 1', ['Station 1'], 6, [meta(gl1), meta(gl2)], load)
    expect(knownVocabRules(known).join(' ')).toContain('ONLY vocabulary')
    expect(knownVocabRulesDe(known)).toContain('formuliere den Satz um')
  })

  it('bleibt ohne Vorwissen still', async () => {
    const load = async (): Promise<Textbook> => gl1
    expect(await collectKnownVocab(gl1, 'Welcome', ['Check-in'], 5, [meta(gl1)], load)).toBeNull()
    expect(knownVocabRules(null)).toEqual([])
    expect(knownVocabRulesDe(null)).toBe('')
  })
})
