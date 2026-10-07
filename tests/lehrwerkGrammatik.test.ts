import { describe, expect, it } from 'vitest'
import { ALLE_KENNUNGEN, bekannteGrammatik, LEHRWERK_GRAMMATIK } from '../src/renderer/src/shared/lehrwerkGrammatik'
import { kapitelFolge, LEHRWERK_THEMEN } from '../src/renderer/src/shared/lehrwerkThemen'
import { GRAMMAR_TOPICS, teilformenFuer } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import { unitEintraege } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammatikAuswahl'
import { knownGrammarRulesDe, type KnownVocab } from '../src/renderer/src/shared/knownVocab'

/**
 * Grammatik der Green-Line-Bände je Station (Liste der Lehrkraft, Niedersachsen, 07.10.2026): Jede Zuordnung muss im
 * Katalog stehen, die Vorschläge sind sicher, und „bekannt" folgt Band, Unit und Station – Trailer sind optional.
 */

const en = GRAMMAR_TOPICS.filter((t) => t.subject === 'englisch')

describe('Zuordnung zum Katalog', () => {
  it('jedes Thema und jede Teilform gibt es', () => {
    const fehlt = ALLE_KENNUNGEN.filter((k) => {
      const [id, teil] = k.split('/')
      const t = en.find((x) => x.id === id)
      if (!t) return true
      return teil ? !teilformenFuer(t, { subjectId: 'englisch', grade: 10 }).some((x) => x.teil.id === teil) : false
    })
    expect(fehlt).toEqual([])
  })
  it('alle Kapitel der Liste gibt es in den Lehrwerksthemen (Trailer ergänzt)', () => {
    for (const [buch, k] of Object.entries(LEHRWERK_GRAMMATIK)) for (const name of Object.keys(k)) expect(kapitelFolge(buch)).toContain(name)
    expect(LEHRWERK_THEMEN['Green Line 2'].kapitel['Trailer 4'].grammatik).toBe('Ersatzformen der Modalverben')
  })
})

describe('Vorschläge je Unit', () => {
  it('Green Line 2, Unit 3: sicher, mit Station', () => {
    const e = unitEintraege('englisch', 'Green Line 2', 'Unit 3', 'nur')
    expect(e.map((x) => x.kapitel)).toEqual(['Unit 3 · Station 1', 'Unit 3 · Station 2', 'Unit 3 · Station 3', 'Unit 3 · Station 3'])
    expect(e.every((x) => x.sicher)).toBe(true)
    expect(e[0].ids).toEqual(['en.verb.present_perfect'])
    expect(e[0].teile).toContain('en.verb.present_perfect/bildung')
    expect(e[2].ids).toEqual(['en.verb.pp_vs_past'])
  })
  it('Australisches Englisch ist keine Katalog-Grammatik', () => {
    const e = unitEintraege('englisch', 'Green Line 5', 'Unit 1', 'nur')
    expect(e.find((x) => x.phrase === 'Australisches Englisch')?.sicher).toBe(false)
  })
})

describe('Bekannte Grammatik', () => {
  const stand = (buch: string, unit: string, abschnitt?: string, frueher: string[] = []) =>
    bekannteGrammatik(
      kapitelFolge(buch),
      buch,
      unit,
      abschnitt,
      frueher.map((b) => ({ buch: b, kapitel: kapitelFolge(b) }))
    )
  it('frühere Stationen bekannt, die gewählte und spätere neu', () => {
    const s = stand('Green Line 2', 'Unit 3', 'Station 2', ['Green Line 1'])
    const texte = (l: { text: string }[]) => l.map((p) => p.text)
    expect(texte(s.bekannt)).toContain('present perfect: Aussagen')
    expect(texte(s.bekannt)).toContain('going to-future: Aussagen, Fragen')
    expect(texte(s.bekannt)).toContain('Nomen und Artikel (a vs. an)')
    expect(texte(s.neu)).toEqual(['present perfect: Fragen', 'Vergleich: present perfect und simple past', 'Zusammensetzungen mit some und any'])
    expect(texte(s.spaeter)).toContain('will-future: Aussagen, Fragen')
  })
  it('Trailer gelten nicht als bekannt', () => {
    const s = stand('Green Line 3', 'Unit 1', 'Station 1', ['Green Line 1', 'Green Line 2'])
    const texte = s.bekannt.map((p) => p.text)
    expect(texte).not.toContain('Ersatzformen der Modalverben')
    expect(texte).not.toContain('going to-future')
    expect(texte).toContain('Question tags')
  })
  it('Regeln für die Prompts', () => {
    const known: KnownVocab = {
      words: ['dog'],
      total: 1,
      strict: true,
      source: 'Green Line 2',
      buch: 'Green Line 2',
      unit: 'Unit 4',
      abschnitt: 'Station 2',
      fruehereBaende: ['Green Line 1']
    }
    const r = knownGrammarRulesDe(known)
    expect(r).toContain('BEKANNTE GRAMMATIK (Green Line 2, Niedersachsen, vor Unit 4, Station 2)')
    expect(r).toContain('will-future')
    expect(r).toContain('Wird gerade eingeführt: Bedingungssätze Typ 1')
    expect(r).toMatch(/Noch nicht eingeführt.*Stützwörter one \/ ones/)
    expect(knownGrammarRulesDe({ ...known, buch: 'Access 1' })).toBe('')
  })
})
