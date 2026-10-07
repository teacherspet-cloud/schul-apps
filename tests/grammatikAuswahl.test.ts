/**
 * Grammatik-Themenauswahl (abgestimmt 06.10.2026, „Kombination"): Suche deutsch/englisch mit Synonymen, Filter,
 * Zuordnung der Lehrwerks-Grammatik je Unit zu Katalogthemen, Übernahme in die Auswahl ohne Formatwechsel.
 */
import { describe, expect, it } from 'vitest'
import { einfuehrungsNiveau, GRAMMAR_TOPICS } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import {
  alternativen,
  aufNiveau,
  fruehereBaende,
  grammatikKapitel,
  herkunftKarte,
  inStufe,
  lehrwerkeMitGrammatik,
  mitUnitAuswahl,
  normalisiere,
  ordneZu,
  passtZurSuche,
  sucheThemen,
  teilZaehler,
  unitEintraege,
  zerlegeGrammatik,
  ZUORDNUNG_KENNUNGEN
} from '../src/renderer/src/modules/arbeitsblatt/didactics/grammatikAuswahl'

const en = GRAMMAR_TOPICS.filter((t) => t.subject === 'englisch')
const thema = (id: string) => GRAMMAR_TOPICS.find((t) => t.id === id)!
const ids = (suche: string, liste = en) => sucheThemen(liste, suche).map((t) => t.id)

describe('Suche deutsch und englisch', () => {
  it('normalisiert Umlaute und Akzente', () => {
    expect(normalisiere('Präsens')).toBe('praesens')
    expect(normalisiere('présent')).toBe('present')
  })

  it('findet über Fachbegriff, deutschen Namen und Synonyme', () => {
    expect(ids('present perfect')[0]).toBe('en.verb.present_perfect')
    expect(ids('Perfekt')).toContain('en.verb.present_perfect')
    expect(ids('Passiv')).toContain('en.verb.passive_basic')
    expect(ids('passive')).toContain('en.verb.passive_basic')
    expect(ids('if-Satz')).toContain('en.cond.type1')
    expect(ids('Steigerung')).toContain('en.adj.comparison')
    expect(ids('comparative')).toContain('en.adj.comparison')
    expect(ids('Gerundium')).toContain('en.verb.gerund')
    expect(ids('reported speech')).toContain('en.reported.backshift')
    expect(ids('indirekte Rede')).toContain('en.reported.backshift')
    expect(ids('Relativsatz')).toContain('en.clause.relative_def')
  })

  it('sucht auch in Teilformen und verlangt jedes Wort', () => {
    // „unregelmäßig" steht nur als Teilform (simple past, Plural …)
    expect(ids('unregelmäßig')).toContain('en.verb.past_simple')
    expect(passtZurSuche(thema('en.verb.past_simple'), 'Vergangenheit Fragen')).toBe(true)
    expect(passtZurSuche(thema('en.noun.plural'), 'Vergangenheit Fragen')).toBe(false)
  })

  it('Namenstreffer stehen vor Teilform-/Synonymtreffern', () => {
    const r = ids('simple past')
    expect(r.indexOf('en.verb.past_simple')).toBeLessThan(r.indexOf('en.verb.used_to') === -1 ? Infinity : r.indexOf('en.verb.used_to'))
    expect(r[0]).toBe('en.verb.past_simple')
  })

  it('Wortanfang genügt für Synonyme', () => {
    expect(alternativen('steig')).toContain('comparison')
    expect(alternativen('Fragen')).toContain('question')
  })

  it('leere Suche lässt alles durch', () => {
    expect(sucheThemen(en, '  ')).toHaveLength(en.length)
  })
})

describe('Filter', () => {
  it('Lernjahr: Fenster des Themas, 3. Fremdsprache verdichtet', () => {
    const pp = thema('en.verb.present_perfect')
    expect(inStufe(pp, 2, { grade: 6, sequence: 'fs1' })).toBe(true)
    expect(inStufe(pp, 1, { grade: 5, sequence: 'fs1' })).toBe(false)
    // 3. FS: Lernjahr 2 → ceil(2/2) = 1
    expect(inStufe(pp, 1, { grade: 8, sequence: 'fs3' })).toBe(true)
  })

  it('GER: Einführungsniveau', () => {
    const mitNiveau = en.filter((t) => einfuehrungsNiveau(t.level))
    expect(mitNiveau.length).toBeGreaterThan(50)
    for (const t of mitNiveau) expect(aufNiveau(t, einfuehrungsNiveau(t.level)!)).toBe(true)
    const pp = thema('en.verb.past_perfect_prog')
    expect(aufNiveau(pp, 'A1')).toBe(false)
  })

  it('Zähler der Teilformen: ohne Einschränkung alle passenden', () => {
    const t = thema('en.verb.past_simple')
    const q = { subjectId: 'englisch', grade: 7, sequence: 'fs1' as const }
    const alle = teilZaehler(t, q, [])
    expect(alle.eingeschraenkt).toBe(false)
    expect(alle.gewaehlt).toBe(alle.passend)
    const zwei = teilZaehler(t, q, ['en.verb.past_simple/regelmaessig', 'en.verb.past_simple/fragen', 'en.noun.plural/regelmaessig'])
    expect(zwei).toMatchObject({ gewaehlt: 2, eingeschraenkt: true })
  })
})

describe('Lehrwerk-Grammatik je Unit', () => {
  it('Zuordnungstabelle nennt nur vorhandene Themen und Teilformen', () => {
    for (const z of ZUORDNUNG_KENNUNGEN) {
      for (const id of z.ids) expect(thema(id), id).toBeDefined()
      for (const teil of z.teile)
        expect(
          thema(z.ids[0]).teilformen?.some((x) => x.id === teil),
          `${z.ids[0]}/${teil}`
        ).toBe(true)
    }
  })

  it('jede Grammatikangabe der Green-Line-Bände ist sicher oder als Vorschlag zugeordnet', () => {
    // Seit 07.10.2026 je Station fest zugeordnet (lehrwerkGrammatik.ts); nur „Australisches Englisch" ist keine Grammatik
    for (const buch of lehrwerkeMitGrammatik())
      for (const kap of grammatikKapitel(buch))
        for (const e of unitEintraege('englisch', buch, kap, 'nur'))
          if (e.phrase !== 'Australisches Englisch') expect(e.ids.length, `${buch} ${kap}: ${e.phrase}`).toBeGreaterThan(0)
  })

  it('Kommas in Klammern trennen nicht', () => {
    expect(zerlegeGrammatik('simple past (Aussagen, Verneinung, Fragen)')).toEqual(['simple past (Aussagen, Verneinung, Fragen)'])
    expect(zerlegeGrammatik('going to-Futur, Steigerung der Adjektive')).toEqual(['going to-Futur', 'Steigerung der Adjektive'])
  })

  it('ordnet typische Angaben richtig zu', () => {
    expect(ordneZu('englisch', 'going to-Futur')).toMatchObject({ ids: ['en.verb.going_to'], sicher: true })
    expect(ordneZu('englisch', 'if-Satz Typ 1–3').ids).toEqual(['en.cond.type1', 'en.cond.type2', 'en.cond.type3'])
    expect(ordneZu('englisch', 'simple present: Fragen und Verneinung mit do/does')).toMatchObject({
      ids: ['en.verb.present_simple'],
      teile: ['en.verb.present_simple/verneinung', 'en.verb.present_simple/fragen']
    })
    // Passiv: in Band 3 die Grundzeiten, in Band 5 nicht eindeutig
    expect(ordneZu('englisch', 'Passiv', 'Green Line 3')).toMatchObject({ ids: ['en.verb.passive_basic'], sicher: true })
    expect(ordneZu('englisch', 'Passiv', 'Green Line 5').sicher).toBe(false)
  })

  it('Unsicheres wird nicht selbst gewählt', () => {
    expect(ordneZu('englisch', 'Bindewörter').sicher).toBe(false)
    expect(ordneZu('englisch', 'Wiederholung der Zeiten').sicher).toBe(false)
    // Unbekannte Angabe: nur Vorschläge aus der Suche
    expect(ordneZu('englisch', 'Konjunktiv').sicher).toBe(false)
  })

  it('„Nur Unit" und „Alles bis Unit"', () => {
    const nur = unitEintraege('englisch', 'Green Line 2', 'Unit 2', 'nur')
    expect(nur.map((e) => e.phrase)).toEqual(['going to-future: Aussagen, Fragen', 'Steigerung von Adjektiven'])
    const bis = unitEintraege('englisch', 'Green Line 2', 'Unit 2', 'bis')
    expect(bis.map((e) => e.kapitel)).toEqual(['Welcome back', 'Unit 1 · Station 1', 'Unit 1 · Station 3', 'Unit 2 · Station 1', 'Unit 2 · Station 2'])
    const mitBand1 = unitEintraege('englisch', 'Green Line 2', 'Unit 2', 'bis', fruehereBaende('Green Line 2'))
    expect(mitBand1.some((e) => e.band === 'Green Line 1')).toBe(true)
    expect(unitEintraege('englisch', 'Green Line 2', 'Unit 9', 'nur')).toEqual([])
  })

  it('frühere Bände derselben Reihe', () => {
    expect(fruehereBaende('Green Line 3')).toEqual(['Green Line 1', 'Green Line 2'])
    expect(fruehereBaende('Green Line Transition')).toEqual([])
  })

  it('Übernahme: nur Sicheres, nichts abwählen, Teilformen nur wo die Unit sie nennt', () => {
    const gl1 = unitEintraege('englisch', 'Green Line 1', 'Unit 3', 'bis')
    const r = mitUnitAuswahl(gl1, ['en.adj.comparison'], [])
    expect(r.themen).toContain('en.adj.comparison')
    expect(r.themen).toContain('en.verb.present_simple')
    expect(r.themen).toContain('en.verb.there_is')
    // simple present: Unit 2 (Aussagen) + Unit 3 (Fragen, Kurzantworten, Verneinung) → genau diese Teilformen
    expect(r.teilformen.filter((k) => k.startsWith('en.verb.present_simple/')).sort()).toEqual(
      ['bejahung', 'fragen', 'kurzantworten', 'schreibung', 'verneinung'].map((x) => `en.verb.present_simple/${x}`)
    )
    // Personalpronomen: Unit 1 Subjektformen, Unit 2 Objektformen → beide Teilformen
    expect(r.teilformen.filter((k) => k.startsWith('en.pron.personal/')).sort()).toEqual(['en.pron.personal/objekt', 'en.pron.personal/subjekt'])
    // Possessivbegleiter ganz → ohne Einschränkung
    expect(r.themen).toContain('en.pron.possessive_det')
    expect(r.teilformen.some((k) => k.startsWith('en.pron.possessive_det/'))).toBe(false)
    // Schon gewählt ohne Einschränkung bleibt ohne Einschränkung
    const schon = mitUnitAuswahl(gl1, ['en.verb.present_simple'], [])
    expect(schon.teilformen.some((k) => k.startsWith('en.verb.present_simple/'))).toBe(false)
  })

  it('unsichere Einträge kommen nicht in die Auswahl', () => {
    // Ohne Liste der Lehrkraft (Green Line 2, Unit 5 hatte früher nur die Klett-Angabe): über die Zuordnungstabelle
    expect(ordneZu('englisch', 'Modalverben').sicher).toBe(false)
    const gl5u1 = unitEintraege('englisch', 'Green Line 5', 'Unit 1', 'nur')
    const r = mitUnitAuswahl(gl5u1, [], [])
    expect(r.themen).not.toContain('Australisches Englisch')
    expect(r.themen).toContain('en.focus.emphasis')
  })

  it('Herkunft: aktueller Band vor früheren', () => {
    const k = herkunftKarte('englisch', 'Green Line 3', fruehereBaende('Green Line 3'))
    expect(k.get('en.verb.pp_vs_past')).toBe('Unit 1 · Station 2')
    expect(k.get('en.verb.going_to')).toBe('Green Line 2, Unit 2 · Station 1')
  })
})
