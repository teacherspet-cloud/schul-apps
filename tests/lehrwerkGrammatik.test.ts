import { describe, expect, it } from 'vitest'
import { ALLE_KENNUNGEN, bekannteGrammatik, fruehereBaendeDerReihe, LEHRWERK_GRAMMATIK } from '../src/renderer/src/shared/lehrwerkGrammatik'
import { stelleImBand } from '../src/shared/lehrwerkBand'
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
  it('Australisches Englisch ist keine Grammatikform mehr (19.10.2026)', () => {
    const e = unitEintraege('englisch', 'Green Line 5', 'Unit 1', 'nur')
    expect(e.some((x) => x.phrase === 'Australisches Englisch')).toBe(false)
    expect(e.length).toBeGreaterThan(0)
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

/*
 * Green Line Transition (21.10.2026, Wunsch der Lehrkraft): Bundesausgabe ab 2024 mit den Grammatikabschnitten A–E
 * (G1–G18) als Station unter ihrem Topic; Ausgabe ab 2018 je Topic unter „Spot on language". Die beiden Ausgaben gelten
 * füreinander nicht als früherer Band.
 */
describe('Green Line Transition', () => {
  it('ab 2024: A–E unter Topic 1–5, G1–G18 in Buchreihenfolge', () => {
    const band = LEHRWERK_GRAMMATIK['Green Line Transition']
    expect(Object.entries(band).map(([k, st]) => `${k}: ${Object.keys(st).join()}`)).toEqual([
      'Topic 1: A Talking about the present and the past',
      'Topic 2: B Talking about conditions, consequences and modality',
      'Topic 3: C Linking ideas',
      'Topic 4: D Talking about the future',
      'Topic 5: E Shifting focus'
    ])
    const g = Object.values(band).flatMap((st) =>
      Object.values(st)
        .flat()
        .map((p) => p.text.split(' ')[0])
    )
    expect(g).toEqual(Array.from({ length: 18 }, (_, i) => `G${i + 1}`))
  })
  it('frühere Bände: Green Line 1–6, nicht die andere Transition-Ausgabe', () => {
    const baende = ['Green Line 1', 'Green Line 2', 'Green Line 3', 'Green Line 4', 'Green Line 5', 'Green Line 6']
    expect(fruehereBaendeDerReihe('Green Line Transition')).toEqual(baende)
    expect(fruehereBaendeDerReihe('Green Line Transition (Ausgabe 2018)')).toEqual(baende)
  })
  it('Spaltsätze stehen im Band unter Topic 5, Abschnitt E', () => {
    expect(stelleImBand('Green Line Transition', ['en.focus.cleft'])).toEqual({ unit: 'Topic 5', station: 'E Shifting focus' })
    expect(stelleImBand('green-line-transition-ausgabe-2018', ['en.verb.gerund'])).toEqual({ unit: 'Topic 3', station: 'Spot on language' })
    expect(stelleImBand('Green Line Transition (Ausgabe 2018)', ['en.verb.gerund'])).toEqual({ unit: 'Topic 3', station: 'Spot on language' })
  })
})
