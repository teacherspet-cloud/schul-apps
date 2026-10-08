import { describe, expect, it } from 'vitest'
import {
  ampelVon,
  bandVon,
  bereichVonKennung,
  bereichVonRegel,
  empfehlung,
  langeNichtGeuebt,
  lehrwerkStelle,
  reiheVon,
  stellenRang
} from '../src/shared/grammatikBereiche'
import { LEHRWERK_GRAMMATIK } from '../src/renderer/src/shared/lehrwerkGrammatik'
import { GRAMMAR_TOPICS } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'

/** Bereiche und Ampel für viele Grammatikregeln (08.10.2026, abgestimmt mit der Lehrkraft) */
describe('Bereich aus der Katalog-Kennung', () => {
  it('ordnet die Glieder der Sprachen zu', () => {
    expect(bereichVonKennung('en.verb.past_simple')).toBe('zeiten')
    expect(bereichVonKennung('en.verb.past_simple/fragen')).toBe('zeiten')
    expect(bereichVonKennung('en.syn.word_order')).toBe('satzbau')
    expect(bereichVonKennung('en.syn.indirect_questions')).toBe('satzbau')
    expect(bereichVonKennung('en.noun.articles/a-an')).toBe('nomen')
    expect(bereichVonKennung('en.pron.personal')).toBe('pronomen')
    expect(bereichVonKennung('en.adj.comparison')).toBe('adjektive')
    expect(bereichVonKennung('en.adv.manner')).toBe('adjektive')
    expect(bereichVonKennung('en.clause.relative_def')).toBe('nebensaetze')
    expect(bereichVonKennung('en.cond.type1')).toBe('bedingung')
    expect(bereichVonKennung('en.reported.statements')).toBe('rede')
    expect(bereichVonKennung('en.prep.basic')).toBe('praep')
    expect(bereichVonKennung('en.wf.prefixes')).toBe('wortbildung')
    expect(bereichVonKennung('en.var.ame')).toBe('weiteres')
    expect(bereichVonKennung('fr.syn.discours_indirect')).toBe('rede')
    expect(bereichVonKennung('fr.syn.sub_adverbiaux')).toBe('nebensaetze')
    expect(bereichVonKennung('fr.nom.partitif')).toBe('nomen')
    expect(bereichVonKennung('es.satz.bedingung_real')).toBe('bedingung')
    expect(bereichVonKennung('es.praep.por_para')).toBe('praep')
    expect(bereichVonKennung('it.syn.discorso_indiretto')).toBe('rede')
    expect(bereichVonKennung('it.syn.subordinate')).toBe('nebensaetze')
    expect(bereichVonKennung('la.form.subst_ao')).toBe('nomen')
    expect(bereichVonKennung('la.form.adj_3')).toBe('adjektive')
    expect(bereichVonKennung('la.form.pron_rel')).toBe('pronomen')
    expect(bereichVonKennung('la.form.perfekt')).toBe('zeiten')
    expect(bereichVonKennung('la.syn.aci')).toBe('satzbau')
    expect(bereichVonKennung('la.syn.oratio_obliqua')).toBe('rede')
    expect(bereichVonKennung('la.syn.konditional')).toBe('bedingung')
    expect(bereichVonKennung('de.wort.wortbildung')).toBe('wortbildung')
    expect(bereichVonKennung('')).toBe('weiteres')
    expect(bereichVonKennung('Simple past')).toBe('weiteres')
  })
  it('jede Katalog-Kennung bekommt einen Bereich, die großen Fächer kaum „Weiteres"', () => {
    const fremd = GRAMMAR_TOPICS.filter((t) => /^(en|fr|es|it|la)\./.test(t.id))
    const weiteres = fremd.filter((t) => bereichVonKennung(t.id) === 'weiteres')
    expect(weiteres.length / fremd.length).toBeLessThan(0.05)
  })
})

describe('Bereich einer Regel', () => {
  it('ohne Kennung: Weiteres; eine Kennung: deren Bereich', () => {
    expect(bereichVonRegel('Simple past', [])).toBe('weiteres')
    expect(bereichVonRegel('Irgendwas', ['en.pron.personal'])).toBe('pronomen')
  })
  it('mehrere Bereiche: nach Wörtern des Titels', () => {
    const k = ['en.verb.past_simple', 'en.adv.frequency']
    expect(bereichVonRegel('Simple past: Fragen', k)).toBe('zeiten')
    expect(bereichVonRegel('Adverbs of frequency', k)).toBe('adjektive')
    expect(bereichVonRegel('Häufigkeit', k, (x) => (x === 'en.adv.frequency' ? ['Häufigkeitsadverbien', 'Häufigkeit'] : []))).toBe('adjektive')
  })
})

describe('Ampel und Empfehlung', () => {
  it('Schwellen wie der Server', () => {
    expect(ampelVon({ versuche: 4, quote: 0 })).toBe('wenig')
    expect(ampelVon({ versuche: 5, quote: 0.59 })).toBe('schwaeche')
    expect(ampelVon({ versuche: 5, quote: 0.6 })).toBe('aufbau')
    expect(ampelVon({ versuche: 8, quote: 0.9, fach: 2 })).toBe('aufbau')
    expect(ampelVon({ versuche: 8, quote: 0.9, fach: 3 })).toBe('sicher')
    expect(ampelVon({ versuche: 8, quote: 0.9 })).toBe('sicher')
  })
  it('Fördern hat Vorrang, dann Fordern, sonst erst mehr üben', () => {
    const s = { versuche: 6, quote: 0.3 }
    const g = { versuche: 9, quote: 0.95, fach: 4 }
    expect(empfehlung([s, s, g])).toMatchObject({ art: 'foerder', schwaechen: 2, staerken: 1 })
    expect(empfehlung([s, s]).text).toBe('2 Schwächen')
    expect(empfehlung([g, g, g])).toMatchObject({ art: 'forder', text: '3 Stärken, keine Schwäche' })
    expect(empfehlung([{ versuche: 2, quote: 1 }])).toMatchObject({ art: null, text: 'erst mehr üben' })
    expect(empfehlung([{ versuche: 6, quote: 0.7 }]).art).toBeNull()
  })
  it('seit drei Wochen nicht geübt', () => {
    const jetzt = Date.UTC(2026, 9, 8)
    expect(langeNichtGeuebt(jetzt - 22 * 864e5, jetzt)).toBe(true)
    expect(langeNichtGeuebt(jetzt - 20 * 864e5, jetzt)).toBe(false)
    expect(langeNichtGeuebt(undefined, jetzt)).toBe(false)
  })
})

describe('Lehrwerk-Stelle', () => {
  it('Band aus der Kennung des Kurses und die Reihe', () => {
    expect(bandVon('green-line-2-nds', LEHRWERK_GRAMMATIK)).toBe('Green Line 2')
    expect(reiheVon('Green Line 3', LEHRWERK_GRAMMATIK)[0]).toBe('Green Line 1')
  })
  it('erste Einführung in der Reihe, frühere Bände zuerst', () => {
    const s = lehrwerkStelle(['en.verb.be_have'], 'Green Line 3', LEHRWERK_GRAMMATIK)
    expect(s).toMatchObject({ buch: 'Green Line 1', unit: 'Unit 1' })
    expect(lehrwerkStelle(['en.noun.articles/a-an'], 'Green Line 1', LEHRWERK_GRAMMATIK)?.unit).toBe('Unit 1')
    expect(lehrwerkStelle(['xx.gibt.es_nicht'], 'Green Line 1', LEHRWERK_GRAMMATIK)).toBeNull()
    expect(lehrwerkStelle(['en.verb.be_have'], undefined, LEHRWERK_GRAMMATIK)).toBeNull()
    const a = lehrwerkStelle(['en.verb.present_simple'], 'Green Line 1', LEHRWERK_GRAMMATIK)!
    expect(a.rang).toBeGreaterThan(s!.rang)
    expect(stellenRang(a.buch, a.unit, LEHRWERK_GRAMMATIK)).toBe(a.rang)
  })
})
