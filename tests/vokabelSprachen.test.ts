import { describe, expect, it } from 'vitest'
import { LANGUAGES, type LatinFormsBlock, type TaskTypeId, type TestSettings, type VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'
import { TASK_TYPE_LIST, TASK_TYPES, type GenContext } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { systemPrompt } from '../src/renderer/src/modules/vokabeltest/generation/generate'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import { aufgabenLabel, istAlteSprache, NUR_LATEIN, passtZurSprache } from '../src/renderer/src/modules/vokabeltest/didactics/latein'
import { erkenneGriechischeWortart, mitGriechischerNennform } from '../src/renderer/src/modules/vokabeltest/didactics/griechisch'
import { mitLesung } from '../src/renderer/src/modules/vokabeltest/didactics/sprachAufgaben'
import { formVorwissen } from '../src/renderer/src/modules/vokabeltest/didactics/formVorwissen'
import { aufgabenText, kopfTexte, zuordnungsKoepfe } from '../src/renderer/src/modules/vokabeltest/render/aufgabenTexte'
import { blockHelp, hilfeText, HILFE_SPRACHEN, notNeededText, type HelpKey } from '../src/renderer/src/modules/vokabeltest/render/helpTexts'
import { aufgabenFuer } from '../src/renderer/src/modules/vokabeltest/model/grundeinstellungen'
import { betaCodeZuGriechisch, diakritikonSetzen, griechischUmschrift, pinyinAusZahlen, ZEICHEN } from '../src/renderer/src/shared/sonderzeichen'
import { istRtl, schriftFamilie, wordSchrift } from '../src/renderer/src/shared/sprachSchrift'
import { KOPF_LABELS, KOPF_SPRACHEN, wortzahlText, zaehleWoerter } from '../src/renderer/src/shared/kopfSprache'
import { trueFalseLabels } from '../src/renderer/src/shared/trueFalseLabels'
import { continuedNote } from '../src/renderer/src/shared/continuedNote'
import { exampleNote } from '../src/renderer/src/shared/exampleNote'
import { evidenceInstruction } from '../src/renderer/src/shared/evidenceInstruction'
import { SPRACH_FAECHER, programmSichtbar, PROGRAMM_FAECHER } from '../src/renderer/src/shared/programmSichtbarkeit'
import { FACH_ZU_SPRACHE } from '../src/shared/faecher'

/*
 * Vokabeltest und Vokabellisten für Griechisch und die neuen Schulsprachen (30.09.2026):
 * wählbar, Hinweise/Anweisungen/Kopf in der Zielsprache (nicht deutsch, nicht englisch),
 * sprachbesondere Aufgaben, Griechisch nach dem Latein-Sonderweg mit Nennformen, Sonderzeichen.
 * Die zielsprachigen Texte sind nicht muttersprachlich geprüft – recherche/sprachtexte-2026-09-30.md.
 */

const NEUE = ['pl', 'cs', 'pt', 'tr', 'zh', 'ja', 'ar', 'da', 'el'] as const
const MODERN = ['nl', 'ru', ...NEUE] as const

const settings = (targetLanguage: string, extra: Partial<TestSettings> = {}): TestSettings =>
  ({
    targetLanguage,
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 2,
    grade: 8,
    level: 'A2',
    vocabCount: 10,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1,
    ...extra
  }) as TestSettings

const ctx = (s: TestSettings, allVocab: VocabEntry[] = []): GenContext => ({ settings: s, languageName: 'x', rng: createRng(1), allVocab })

const HILFE_KEYS: HelpKey[] = [
  'useEachOnce',
  'extraWords',
  'changeForm',
  'firstLetter',
  'matchLetters',
  'matchExtra',
  'choiceOne',
  'wrongWord',
  'twoSentences',
  'wordFormation',
  'pictureBank',
  'scramble',
  'crossword',
  'categorize',
  'mindmap',
  'wordFamily',
  'oddOneOut',
  'gapNumbers'
]

describe('Programme wählbar', () => {
  it('jede neue Sprache und Griechisch stehen im Vokabeltest und in den Vokabellisten', () => {
    const codes = LANGUAGES.map((l) => l.value)
    for (const c of [...MODERN, 'grc']) expect(codes, c).toContain(c)
    for (const c of [...MODERN, 'grc']) {
      const fach = FACH_ZU_SPRACHE[c]
      expect(fach, c).toBeTruthy()
      expect(SPRACH_FAECHER as readonly string[], c).toContain(fach)
      // Wer nur dieses Fach unterrichtet, sieht Vokabeltest und Vokabellisten
      expect(programmSichtbar('vokabeltest', PROGRAMM_FAECHER.vokabeltest, [fach], {}), c).toBe(true)
      expect(programmSichtbar('vokabelliste', PROGRAMM_FAECHER.vokabelliste, [fach], {}), c).toBe(true)
    }
  })

  it('jede Sprache hat voreingestellte Aufgaben, die zu ihr passen', () => {
    for (const c of [...MODERN, 'grc']) {
      const tasks = aufgabenFuer(c, 12)
      expect(tasks.length, c).toBeGreaterThan(0)
      for (const t of tasks) expect(passtZurSprache(t.type, c), `${c}: ${t.type}`).toBe(true)
    }
  })
})

describe('Hinweistexte in der Zielsprache', () => {
  it('gibt es für jede neue Sprache – weder deutsch noch englisch', () => {
    for (const c of NEUE) {
      expect(HILFE_SPRACHEN, c).toContain(c)
      for (const k of HILFE_KEYS) {
        const t = hilfeText(k, c)
        expect(t, `${c}/${k}`).toBeTruthy()
        expect(t, `${c}/${k} englisch`).not.toBe(hilfeText(k, 'en'))
        expect(t, `${c}/${k} deutsch`).not.toBe(hilfeText(k, 'la'))
      }
    }
  })

  it('Latein und Griechisch bekommen deutsche Hinweise (vorher englisch)', () => {
    expect(hilfeText('useEachOnce', 'grc')).toBe('Jedes Wort aus dem Kasten wird nur einmal verwendet.')
    expect(hilfeText('useEachOnce', 'la')).toBe(hilfeText('useEachOnce', 'grc'))
    expect(notNeededText(2, 'grc')).toBe('2 Wörter werden nicht gebraucht.')
  })

  it('beugt die Zahl der überzähligen Wörter richtig', () => {
    expect(notNeededText(1, 'pl')).toBe('1 wyraz nie będzie potrzebny.')
    expect(notNeededText(2, 'pl')).toBe('2 wyrazy nie będą potrzebne.')
    expect(notNeededText(5, 'pl')).toBe('5 wyrazów nie będzie potrzebnych.')
    expect(notNeededText(12, 'pl')).toBe('12 wyrazów nie będzie potrzebnych.')
    expect(notNeededText(22, 'pl')).toBe('22 wyrazy nie będą potrzebne.')
    expect(notNeededText(1, 'cs')).toBe('1 slovo nebudeš potřebovat.')
    expect(notNeededText(3, 'cs')).toBe('3 slova nebudeš potřebovat.')
    expect(notNeededText(5, 'cs')).toBe('5 slov nebudeš potřebovat.')
    expect(notNeededText(3, 'tr')).toBe('3 kelimeye ihtiyacın yok.')
    expect(notNeededText(3, 'ru')).toBe('3 слова тебе не понадобятся.')
    // Arabisch umgeht die Zählregeln (Dual, 3–10, ab 11)
    expect(notNeededText(2, 'ar')).toContain(': 2')
    for (const c of NEUE) expect(notNeededText(2, c), c).not.toBe(notNeededText(2, 'en'))
  })

  it('der Hinweis am Block steht in der Testsprache', () => {
    const block = {
      id: 'b',
      taskType: 'gapSentences',
      title: '',
      instruction: '',
      pointsPerItem: 1,
      kind: 'gap',
      items: [{ id: 'i', sentences: [{ before: 'a', after: 'b' }], answer: 'x', bankWord: 'x' }],
      wordBank: true,
      firstLetterHint: false,
      extraBankWords: ['y', 'z']
    } as const
    expect(blockHelp(block as never, 'cs').join(' ')).toContain('Každé slovo z rámečku')
    expect(blockHelp(block as never, 'zh').join(' ')).toContain('框中的每个词语')
  })
})

describe('Überschriften, Anweisungen und Kopf in der Zielsprache', () => {
  it('jede Aufgabe, die es in der Sprache gibt, hat feste Texte – nicht englisch', () => {
    for (const c of MODERN) {
      for (const def of TASK_TYPE_LIST) {
        // Abkürzungen (09.10.2026) setzen Überschrift und Anweisung im Erzeuger selbst (taskTypes.ts ABK_TITEL/ABK_ANWEISUNG)
        if (def.id === 'freeText' || def.id === 'irregularVerbs' || def.id === 'abbreviations' || NUR_LATEIN.includes(def.id) || !passtZurSprache(def.id, c)) continue
        const t = aufgabenText(def.id, c)
        expect(t, `${c}: ${def.id}`).toBeDefined()
        expect(t!.title, `${c}: ${def.id}`).not.toBe(def.defaultTitle)
        expect(t!.instruction, `${c}: ${def.id}`).not.toBe(def.defaultInstruction)
      }
    }
  })

  it('in den neuen Sprachen gilt die geprüfte Anweisung, nicht die der KI', () => {
    const vocab: VocabEntry[] = [{ id: 'v1', term: 'dom', translation: 'Haus' }]
    const b = TASK_TYPES.gapSentences.build(vocab, { instruction: 'KI-Text', items: [] }, ctx(settings('pl')))
    expect(b.title).toBe('Uzupełnij luki')
    expect(b.instruction).toBe('Uzupełnij zdania odpowiednimi wyrazami.')
    // Englisch bleibt bei der KI-Anweisung
    const e = TASK_TYPES.gapSentences.build(vocab, { instruction: 'Complete it.', items: [] }, ctx(settings('en')))
    expect(e.instruction).toBe('Complete it.')
    expect(e.title).toBe('Fill in the gaps')
  })

  it('Testkopf je Sprache – nicht englisch; Latein/Griechisch deutsch', () => {
    const en = kopfTexte('en')
    for (const c of NEUE) {
      const k = kopfTexte(c)
      expect(k.title, c).not.toBe(en.title)
      expect(k.name, c).not.toBe('Name:')
      expect(k.loesung, c).not.toBe(en.loesung)
      expect(zuordnungsKoepfe(c), c).not.toEqual(zuordnungsKoepfe('en'))
    }
    expect(kopfTexte('grc').title).toBe('Vokabeltest')
    expect(kopfTexte('tr').gruppe('A')).toBe('A Grubu')
    expect(kopfTexte('pl').gruppe('B')).toBe('Grupa B')
  })

  it('Schriftregeln für die KI stehen im Systemprompt', () => {
    expect(systemPrompt(settings('zh'))).toMatch(/simplified characters/)
    expect(systemPrompt(settings('zh'))).toMatch(/tone marks/)
    expect(systemPrompt(settings('tr'))).toMatch(/vowel harmony/)
    expect(systemPrompt(settings('ar'))).toMatch(/right to left/)
  })
})

describe('Sprachbesondere Aufgaben', () => {
  it('gibt es nur in ihren Sprachen', () => {
    const erwartet: [TaskTypeId, string[]][] = [
      ['readingForms', ['zh', 'ja']],
      ['readingMatch', ['zh', 'ja']],
      ['aspectPairs', ['ru', 'pl', 'cs']],
      ['caseForms', ['ru', 'pl', 'cs', 'tr', 'el']],
      ['arabicRoots', ['ar']]
    ]
    for (const [id, sprachen] of erwartet)
      for (const l of LANGUAGES) expect(passtZurSprache(id, l.value), `${id}/${l.value}`).toBe(sprachen.includes(l.value))
  })

  it('keine Buchstabenrätsel in Schriftzeichen und arabischer Schrift', () => {
    for (const c of ['zh', 'ja', 'ar']) {
      expect(passtZurSprache('crossword', c)).toBe(false)
      expect(passtZurSprache('scrambled', c)).toBe(false)
    }
    expect(passtZurSprache('crossword', 'pl')).toBe(true)
  })

  it('Chinesisch: Zeichen – Pinyin – Bedeutung aus der Liste, ohne KI', () => {
    const vocab: VocabEntry[] = [
      { id: 'a', term: '你好', translation: 'hallo', pos: 'nǐ hǎo' },
      { id: 'b', term: '学校 (xuéxiào)', translation: 'Schule' }
    ]
    expect(mitLesung(vocab[1], 'zh')).toMatchObject({ term: '学校', lesung: 'xuéxiào' })
    expect(TASK_TYPES.readingForms.needsAi!(vocab, ctx(settings('zh')))).toBe(false)
    const b = TASK_TYPES.readingForms.build(vocab, {}, ctx(settings('zh'))) as LatinFormsBlock
    expect(b.items.map((i) => [i.term, i.formLabel, i.form, i.meanings])).toEqual([
      ['你好', 'Pinyin:', 'nǐ hǎo', 'hallo'],
      ['学校', 'Pinyin:', 'xuéxiào', 'Schule']
    ])
    expect(b.title).toBe('写出拼音和意思')
    const m = TASK_TYPES.readingMatch.build(vocab, {}, ctx(settings('zh'), vocab))
    expect(m.kind).toBe('match')
    if (m.kind === 'match') expect(m.right.map((r) => r.text).sort()).toEqual(['nǐ hǎo – hallo', 'xuéxiào – Schule'])
  })

  it('Russisch: Aspektpaare mit russischer Beschriftung', () => {
    const vocab: VocabEntry[] = [{ id: 'd', term: 'делать', translation: 'machen', pos: 'Verb' }]
    expect(TASK_TYPES.aspectPairs.accepts!(vocab[0])).toBe(true)
    const b = TASK_TYPES.aspectPairs.build(vocab, { items: [{ vocabId: 'd', partner: 'сделать' }] }, ctx(settings('ru'))) as LatinFormsBlock
    expect(b.items[0]).toMatchObject({ term: 'делать', formLabel: 'Видовая пара:', form: 'сделать' })
    expect(b.title).toBe('Видовые пары')
  })
})

describe('Griechisch nach dem Latein-Sonderweg', () => {
  it('ist eine alte Sprache: deutsche Anweisungen, keine Sprechformate', () => {
    expect(istAlteSprache('grc')).toBe(true)
    expect(passtZurSprache('latinForms', 'grc')).toBe(true)
    expect(passtZurSprache('dialogue', 'grc')).toBe(false)
    expect(passtZurSprache('writeSentences', 'grc')).toBe(false)
    expect(passtZurSprache('latinForms', 'el')).toBe(false)
    expect(aufgabenLabel(TASK_TYPES.latinForms, 'grc')).toBe('Nennform und Bedeutungen (Griechisch)')
    expect(systemPrompt(settings('grc'))).toMatch(/Griechischlehrkraft/)
    expect(systemPrompt(settings('grc'))).toMatch(/polytonisch/)
  })

  it('erkennt die Nennformen der Lehrwerke', () => {
    expect(mitGriechischerNennform({ id: '1', term: 'ὁ λόγος, τοῦ λόγου', translation: 'Wort' })).toMatchObject({
      term: 'ὁ λόγος',
      nennform: 'τοῦ λόγου',
      wordClass: 'substantiv'
    })
    expect(mitGriechischerNennform({ id: '2', term: 'λόγος', translation: 'Wort', pos: '-ου ὁ' }).wordClass).toBe('substantiv')
    expect(mitGriechischerNennform({ id: '3', term: 'παιδεύω', translation: 'erziehen', pos: 'παιδεύσω, ἐπαίδευσα' }).wordClass).toBe('verb')
    expect(mitGriechischerNennform({ id: '4', term: 'ἀγαθός, -ή, -όν', translation: 'gut' })).toMatchObject({ term: 'ἀγαθός', nennform: '-ή, -όν', wordClass: 'adjektiv' })
    expect(erkenneGriechischeWortart('+ Dat.', 'ἐν')).toBe('praeposition')
    expect(erkenneGriechischeWortart('Adv.', 'εὖ')).toBe('adverb')
  })

  it('Nennform-Test: Artikel statt Genus, Akzente und Spiritus unverändert, Umschrift auf Wunsch', () => {
    const vocab: VocabEntry[] = [
      { id: '1', term: 'ὁ λόγος', translation: 'Wort, Rede', pos: 'τοῦ λόγου' },
      { id: '2', term: 'ἡ ψυχή', translation: 'Seele', pos: 'τῆς ψυχῆς' }
    ]
    const b = TASK_TYPES.latinForms.build(vocab, {}, ctx(settings('grc', { umschrift: true }))) as LatinFormsBlock
    expect(b.items[0]).toMatchObject({ term: 'ὁ λόγος', formLabel: 'Genitiv, Artikel:', form: 'τοῦ λόγου', meanings: 'Wort, Rede', transliteration: 'ho logos' })
    expect(b.items[1].transliteration).toBe('hē psychē')
    expect(b.instruction).toBe('Ergänze zu jeder Vokabel die verlangte Form und alle Bedeutungen.')
    // Zerlegte Eingabe (Buchstabe + kombinierendes Zeichen) wird zu vorkomponierten Zeichen
    const zerlegt = 'ὁ λόγος'.normalize('NFD')
    expect(mitGriechischerNennform({ id: 'z', term: zerlegt, translation: 'x' }).term).toBe('ὁ λόγος')
    // Ohne Umschrift keine
    const ohne = TASK_TYPES.latinForms.build(vocab, {}, ctx(settings('grc'))) as LatinFormsBlock
    expect(ohne.items[0].transliteration).toBeUndefined()
  })

  it('Umschrift nach der üblichen Transliteration', () => {
    expect(griechischUmschrift('οὐρανός')).toBe('uranos')
    expect(griechischUmschrift('ἄγγελος')).toBe('angelos')
    expect(griechischUmschrift('ῥήτωρ')).toBe('rhētōr')
    expect(griechischUmschrift('εὑρίσκω')).toBe('heuriskō')
    expect(griechischUmschrift('τῷ')).toBe('tōi')
    expect(griechischUmschrift('Ὅμηρος')).toBe('Homēros')
  })

  it('Vorwissen nach Lernjahr aus der Grammatiktabelle wie bei Latein', () => {
    const v = formVorwissen({ targetLanguage: 'grc', grade: 9, languageOrder: 3, stateId: 'NI', level: 'A1' })
    expect(v.fach).toBe('griechisch')
    expect(v.quelle).toBe('tabelle')
    expect(v.bekannt.length + v.vielleicht.length + v.nochNicht.length).toBeGreaterThan(0)
  })
})

describe('Sonderzeichen und Schrift', () => {
  it('Beta-Code → polytones Griechisch (NFC, Schluss-Sigma)', () => {
    expect(betaCodeZuGriechisch('o( lo/gos')).toBe('ὁ λόγος')
    expect(betaCodeZuGriechisch('*)aqh=nai')).toBe('Ἀθῆναι')
    expect(betaCodeZuGriechisch('tw=|')).toBe('τῷ')
    expect(diakritikonSetzen('λογο', '́')).toBe('λογό')
    expect(diakritikonSetzen('ο', '̔')).toBe('ὁ')
  })

  it('Pinyin: Tonzahlen → Tonzeichen nach der amtlichen Regel', () => {
    expect(pinyinAusZahlen('ni3 hao3')).toBe('nǐ hǎo')
    expect(pinyinAusZahlen('xue2sheng5')).toBe('xuésheng')
    expect(pinyinAusZahlen('lv4')).toBe('lǜ')
    expect(pinyinAusZahlen('gui4 liu2 dou1')).toBe('guì liú dōu')
  })

  it('jede neue Sprache hat eine Zeichenleiste; Schrift und Richtung für Druck und Word', () => {
    for (const c of [...NEUE, 'ru', 'grc']) expect(ZEICHEN[c]?.length, c).toBeGreaterThan(0)
    expect(istRtl('ar')).toBe(true)
    expect(istRtl('he')).toBe(false)
    expect(schriftFamilie('grc')).toMatch(/Palatino Linotype/)
    expect(wordSchrift('zh')).toMatchObject({ wordArt: 'eastAsia' })
    expect(wordSchrift('ar')).toMatchObject({ wordArt: 'cs' })
  })
})

describe('Arbeitsblatt-Sprachhilfen für alle neuen Sprachen', () => {
  it('Name/Klasse/Datum, Seite, richtig/falsch, Fortsetzung, Beispiel – nicht deutsch', () => {
    for (const c of ['nl', ...NEUE]) {
      expect(KOPF_SPRACHEN, c).toContain(c)
      expect(KOPF_LABELS[c as keyof typeof KOPF_LABELS].name, c).not.toBe('Name:')
      expect(trueFalseLabels(c), c).not.toEqual(trueFalseLabels('de'))
      expect(continuedNote(c, 3), c).not.toBe(continuedNote('de', 3))
      expect(exampleNote(c), c).not.toBe(exampleNote('de'))
      expect(evidenceInstruction(c).instruction, c).not.toBe(evidenceInstruction('de').instruction)
      expect(evidenceInstruction(c).sourced, c).toBe(false)
    }
  })

  it('Wortzahl mit richtigem Numerus', () => {
    expect(wortzahlText(341, 'pl')).toBe('341 słów')
    expect(wortzahlText(342, 'pl')).toBe('342 słowa')
    expect(wortzahlText(3, 'cs')).toBe('3 slova')
    expect(wortzahlText(25, 'cs')).toBe('25 slov')
    expect(wortzahlText(341, 'ru')).toBe('341 слово')
    expect(wortzahlText(12, 'tr')).toBe('12 kelime')
    expect(wortzahlText(1, 'de')).toBe('1 Wort')
    expect(wortzahlText(120, 'ar')).toBe('عدد الكلمات: 120')
    // Chinesisch zählt Schriftzeichen
    expect(zaehleWoerter('我是学生。', 'zh')).toBe(4)
    expect(wortzahlText(4, 'zh')).toBe('4字')
  })
})
