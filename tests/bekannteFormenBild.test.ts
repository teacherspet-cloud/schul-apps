/**
 * Bekannte Wortformen und eindeutige Bilder (10.10.2026, Befunde der Lehrkraft, Klasse 5 Englisch, Green Line 1):
 *  - „(e.g. plural, past tense)" im Hinweis, obwohl das simple past erst in Klasse 6 kommt;
 *  - „to give" und „to bring" mit fast gleichem Bild in derselben Bildaufgabe; Alternativen zum Bild („auch richtig").
 * Ohne echte KI – die Bildprüfung läuft mit einer Attrappe.
 */
import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import {
  bekannteFormen,
  formAenderung,
  formenDerEinstellungen,
  formenRegel,
  formenRegelFuerFach,
  formHinweisText,
  ohneUnbekannteFormen
} from '../src/renderer/src/shared/bekannteFormen'
import type { KnownVocab } from '../src/renderer/src/shared/knownVocab'
import { bildAuswahl, bildVerwechselbar, bildVorpruefung, spielBildWoerter } from '../src/shared/bildEindeutig'
import { blockHelp } from '../src/renderer/src/modules/vokabeltest/render/helpTexts'
import { analyzeVocab, bildAnalyseUebernehmen } from '../src/renderer/src/modules/vokabeltest/generation/generate'
import { bildAuchRichtig, TASK_TYPES, type GenContext } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { GapBlock, PictureBlock, TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'
import { onlineFassung, vergleiche } from '../src/renderer/src/modules/onlinetest/kern'

const known = (buch: string, unit: string): KnownVocab => ({ words: [], total: 0, strict: true, source: buch, buch, unit })
const en = (jahrgang: number, k?: KnownVocab) => bekannteFormen({ sprache: 'en', jahrgang, bundesland: 'NI', known: k })

const settings = (grade = 5): TestSettings =>
  ({
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gym',
    languageOrder: 1,
    grade,
    level: 'A1',
    vocabCount: 10,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [{ type: 'pictureLabel', count: 4, pointsPerItem: 1 }],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  }) as TestSettings

describe('bekannteFormen', () => {
  it('Klasse 5 ohne Lehrwerk: Plural, simple present, -ing, Besitz-’s – kein past tense', () => {
    const f = en(5)
    expect(f.bekannt).toEqual(expect.arrayContaining(['plural', 'present', 'ing', 'possessive']))
    expect(f.bekannt).not.toContain('past')
    expect(f.nochNicht).toEqual(expect.arrayContaining(['past', 'perfect', 'comparison', 'future']))
    expect(f.quelle).toBe('jahrgang')
  })

  it('Klasse 6 kennt das simple past (Green Line 2, Welcome back/Unit 1)', () => {
    expect(en(6).bekannt).toContain('past')
    expect(en(6).nochNicht).toContain('perfect')
  })

  it('Lehrwerk-Stand ist genauer als der Jahrgang', () => {
    const u2 = en(5, known('Green Line 1', 'Unit 2'))
    expect(u2.quelle).toBe('lehrwerk')
    expect(u2.bekannt).toEqual(expect.arrayContaining(['plural', 'present', 'possessive']))
    expect(u2.bekannt).not.toContain('ing')
    expect(u2.bekannt).not.toContain('past')
    expect(en(6, known('Green Line 2', 'Unit 1')).bekannt).toContain('past')
    expect(en(6, known('Green Line 2', 'Unit 1')).bekannt).not.toContain('comparison')
  })

  it('Hinweiszeile nennt nur bekannte Formen', () => {
    const t5 = formHinweisText('en', en(5))
    expect(t5).toMatch(/^You may have to change the form of the word \(e\.g\. plural/)
    expect(t5).not.toMatch(/past/)
    // In der Aufgabe vorkommende Form hat Vorrang – aber nur, wenn bekannt
    expect(formHinweisText('en', en(5), ['past', 'plural'])).toBe('You may have to change the form of the word (e.g. plural).')
    expect(formHinweisText('en', en(7), ['past'])).toBe('You may have to change the form of the word (e.g. past tense).')
    // Nichts Passendes → keine Klammer
    expect(formHinweisText('en', { ...en(5), bekannt: [] })).toBe('You may have to change the form of the word.')
    expect(formHinweisText('de', bekannteFormen({ sprache: 'la', jahrgang: 7, fremdsprachenfolge: 2 }))).toMatch(/^Manchmal muss die Form des Wortes angepasst werden/)
  })

  it('blockHelp: Beispiele aus den Lücken, ohne Vergangenheit in Klasse 5', () => {
    const block: GapBlock = {
      id: 'x',
      taskType: 'gapSentences',
      kind: 'gap',
      title: '',
      instruction: '',
      pointsPerItem: 1,
      wordBank: true,
      firstLetterHint: false,
      extraBankWords: [],
      items: [
        { id: '1', sentences: [{ before: 'I have two', after: '.' }], answer: 'dogs', bankWord: 'dog' },
        { id: '2', sentences: [{ before: 'She', after: 'football.' }], answer: 'plays', bankWord: 'to play' }
      ]
    }
    const hilfe = blockHelp(block, 'en', formenDerEinstellungen(settings(5))).join(' ')
    expect(hilfe).toContain('(e.g. plural, he/she/it + -s)')
    expect(hilfe).not.toMatch(/past/)
    // Ohne Angaben zur Klasse: keine Beispiele
    expect(blockHelp(block, 'en').join(' ')).toContain('You may have to change the form of the word.')
  })

  it('Formänderung erkennen', () => {
    expect(formAenderung('dog', 'dogs')).toBe('plural')
    expect(formAenderung('to play', 'plays', 'verb')).toBe('present')
    expect(formAenderung('swim', 'swimming')).toBe('ing')
    expect(formAenderung('go', 'went')).toBe('past')
    expect(formAenderung('play', 'played')).toBe('past')
    expect(formAenderung('big', 'bigger')).toBe('comparison')
    expect(formAenderung('child', 'children')).toBe('plural')
    expect(formAenderung('dog', 'dog')).toBeNull()
  })

  it('Regel für die KI und bereinigte KI-Anweisung', () => {
    const r = formenRegel(en(5))
    expect(r).toContain('Never require')
    expect(r).toMatch(/past tense/)
    expect(r).toMatch(/Only require word forms the class already knows: plural of nouns/)
    expect(formenRegel({ ...en(5), nochNicht: [] })).toBe('')
    expect(ohneUnbekannteFormen('Complete the sentences. You may have to change the form of the word (e.g. plural, past tense).', en(5))).toBe(
      'Complete the sentences. You may have to change the form of the word (e.g. plural).'
    )
    expect(ohneUnbekannteFormen('Complete the text. Use the simple past.', en(5))).toBe('Complete the text.')
    expect(ohneUnbekannteFormen('Complete the text (e.g. past tense).', en(7))).toBe('Complete the text (e.g. past tense).')
  })

  it('Arbeitsblatt/Klassenarbeit: deutsche Regel nur für Fremdsprachen', () => {
    const r = formenRegelFuerFach({ subjectLabel: 'Englisch', grade: 5, stateId: 'NI' })
    expect(r).toContain('BEKANNTE WORTFORMEN')
    expect(r).toMatch(/Niemals verlangen: .*Vergangenheit/)
    expect(formenRegelFuerFach({ subjectLabel: 'Geschichte', grade: 5, stateId: 'NI' })).toBe('')
  })
})

const w = (id: string, term: string, translation: string, pos = ''): VocabEntry => ({ id, term, translation, pos })

describe('Eindeutige Bilder', () => {
  it('Vorprüfung: Verben mit verwechselbarem Bild, Verwandtschaft, Abstraktes, Adjektive', () => {
    expect(bildVorpruefung({ term: 'to give', translation: 'geben' }).ok).toBe(false)
    expect(bildVorpruefung({ term: 'to bring', translation: 'bringen' }).ok).toBe(false)
    expect(bildVorpruefung({ term: 'brother', translation: 'Bruder' }).ok).toBe(false)
    expect(bildVorpruefung({ term: 'idea', translation: 'Idee' }).ok).toBe(false)
    expect(bildVorpruefung({ term: 'happy', translation: 'glücklich', pos: 'adj' }).ok).toBe(false)
    expect(bildVorpruefung({ term: 'red', translation: 'rot', pos: 'adj' }).ok).toBe(true)
    expect(bildVorpruefung({ term: 'ladder', translation: 'Leiter' }).ok).toBe(true)
    expect(bildVorpruefung({ term: 'to swim', translation: 'schwimmen' })).toEqual({ ok: true })
    // Über die deutsche Bedeutung auch in anderen Sprachen
    expect(bildVorpruefung({ term: 'donner', translation: 'geben' }, 'fr').ok).toBe(false)
  })

  it('verwechselbare Paare stehen nie zusammen (give/bring, cup/mug, pen/pencil, gleiches Bild)', () => {
    expect(bildVerwechselbar({ term: 'to give', translation: 'geben' }, { term: 'to bring', translation: 'bringen' })).toBe(true)
    expect(bildVerwechselbar({ term: 'cup', translation: 'Tasse' }, { term: 'mug', translation: 'Becher' })).toBe(true)
    expect(bildVerwechselbar({ term: 'pen', translation: 'Stift' }, { term: 'pencil', translation: 'Bleistift' })).toBe(true)
    expect(bildVerwechselbar({ term: 'dog', translation: 'Hund' }, { term: 'cat', translation: 'Katze' })).toBe(false)
    expect(bildVerwechselbar({ term: 'dog', translation: 'Hund', bild: 'x' }, { term: 'puppy', translation: 'Welpe', bild: 'x' })).toBe(true)
    const auswahl = bildAuswahl([w('1', 'cup', 'Tasse'), w('2', 'mug', 'Becher'), w('3', 'dog', 'Hund'), w('4', 'to give', 'geben')])
    expect(auswahl.map((x) => x.term)).toEqual(['cup', 'dog'])
    // Spiele: gleiche Medienbank-Bilder bzw. give/bring nicht beide
    const spiel = spielBildWoerter([
      { id: 'a', term: 'to give', translation: 'geben', bild: 'g' },
      { id: 'b', term: 'to bring', translation: 'bringen', bild: 'g' },
      { id: 'c', term: 'pen', translation: 'Stift', bild: 'p1' },
      { id: 'd', term: 'pencil', translation: 'Bleistift', bild: 'p2' },
      { id: 'e', term: 'dog', translation: 'Hund', bild: 'h' }
    ])
    expect(spiel.map((x) => x.id)).toEqual(['c', 'e'])
  })

  it('KI-Prüfung (Attrappe): Schwelle, Vorprüfung, gemeldete Verwechslungen, Alternativen ohne Listenwörter', async () => {
    const vocab = [
      w('cat', 'cat', 'Katze', 'noun'),
      w('dog', 'dog', 'Hund', 'noun'),
      w('give', 'to give', 'geben', 'verb'),
      w('bring', 'to bring', 'bringen', 'verb'),
      w('hat', 'hat', 'Hut', 'noun'),
      w('cap', 'cap', 'Mütze', 'noun'),
      w('lamp', 'lamp', 'Lampe', 'noun')
    ]
    const anfragen: StructuredRequest[] = []
    const ai = async <T,>(req: StructuredRequest): Promise<T> => {
      anfragen.push(req)
      return {
        entries: [
          { id: 'cat', depictable: true, confidence: 95, confusableWith: [], alternatives: ['kitty', 'a cat', 'dog'], imageKeywords: ['cat'], picture: 'a cat', pos: 'noun' },
          { id: 'dog', depictable: true, confidence: 95, confusableWith: [], alternatives: [], imageKeywords: ['dog'], picture: 'a dog', pos: 'noun' },
          // Die KI hält „give" für zeigbar – die Vorprüfung nicht
          { id: 'give', depictable: true, confidence: 90, confusableWith: ['bring'], alternatives: ['to hand'], imageKeywords: ['give'], picture: 'a boy handing a girl a book', pos: 'verb' },
          { id: 'bring', depictable: true, confidence: 90, confusableWith: ['give'], alternatives: [], imageKeywords: ['bring'], picture: 'a boy handing a girl a book', pos: 'verb' },
          { id: 'hat', depictable: true, confidence: 90, confusableWith: ['cap'], alternatives: [], imageKeywords: ['hat'], picture: 'a hat', pos: 'noun' },
          { id: 'cap', depictable: true, confidence: 85, confusableWith: [], alternatives: [], imageKeywords: ['cap'], picture: 'a cap', pos: 'noun' },
          // Zu unsicher
          { id: 'lamp', depictable: true, confidence: 60, confusableWith: [], alternatives: [], imageKeywords: ['lamp'], picture: 'a lamp', pos: 'noun' }
        ]
      } as T
    }
    const out = await analyzeVocab(vocab, settings(5), ai)
    const by = new Map(out.map((v) => [v.id, v]))
    expect(anfragen[0].user).toMatch(/Compare the depicted scenes of ALL words/)
    expect(anfragen[0].user).toMatch(/to give \| German: geben \| \(not depictable/)
    expect(by.get('cat')!.depictable).toBe(true)
    expect(by.get('cat')!.bildAlternativen).toEqual(['kitty'])
    expect(by.get('give')!.depictable).toBe(false)
    expect(by.get('bring')!.depictable).toBe(false)
    expect(by.get('lamp')!.depictable).toBe(false)
    // Verwechslung gilt in beiden Richtungen, auch wenn die KI sie nur bei einem Wort meldet
    expect(by.get('hat')!.bildKonflikte).toEqual(['cap'])
    expect(by.get('cap')!.bildKonflikte).toEqual(['hat'])
    // Bildaufgabe: hat und cap nicht zusammen
    const def = TASK_TYPES.pictureLabel
    const kandidaten = out.filter((v) => def.accepts!(v))
    expect(kandidaten.map((v) => v.id)).toEqual(['cat', 'dog', 'hat', 'cap'])
    const gewaehlt: VocabEntry[] = []
    for (const v of kandidaten) if (def.vertraegtSich!(v, gewaehlt, 'en')) gewaehlt.push(v)
    expect(gewaehlt.map((v) => v.id)).toEqual(['cat', 'dog', 'hat'])
  })

  it('ältere KI-Antwort ohne Sicherheit: Entscheidung der KI zählt, Vorprüfung trotzdem', () => {
    const out = bildAnalyseUebernehmen(
      [w('a', 'ladder', 'Leiter'), w('b', 'to give', 'geben')],
      [
        { id: 'a', depictable: true, imageKeywords: ['ladder'] },
        { id: 'b', depictable: true, imageKeywords: ['give'] }
      ],
      'en'
    )
    expect(out.map((v) => v.depictable)).toEqual([true, false])
  })

  it('Alternativen: im Bild-Item, im Lösungsblatt-Datenstand und in der automatischen Wertung', () => {
    const vocab = [
      { ...w('cup', 'cup', 'Tasse', 'noun'), depictable: true, bildAlternativen: ['teacup', 'mug'] },
      { ...w('mug', 'mug', 'Becher', 'noun'), depictable: true },
      { ...w('dog', 'dog', 'Hund', 'noun'), depictable: true, auchRichtig: ['doggy'] }
    ]
    // „mug" ist ein anderes Wort der Aufgabe → nie „auch richtig" zu cup
    expect(bildAuchRichtig(vocab[0], vocab)).toEqual(['teacup'])
    expect(bildAuchRichtig(vocab[0], [vocab[0]])).toEqual(['teacup', 'mug'])
    const ctx: GenContext = { settings: settings(5), languageName: 'English', rng: createRng(1), allVocab: vocab }
    const block = TASK_TYPES.pictureLabel.build([vocab[0], vocab[2]], {}, ctx) as PictureBlock
    // mug ist in DIESER Aufgabe nicht abgefragt → darf als Alternative zählen
    expect(block.items.map((i) => i.auchRichtig)).toEqual([['teacup', 'mug'], ['doggy']])
    const mitMug = TASK_TYPES.pictureLabel.build([vocab[0], vocab[1]], {}, ctx) as PictureBlock
    expect(mitMug.items[0].auchRichtig).toEqual(['teacup'])
    const fassung = onlineFassung({ id: 'v', label: 'A', blocks: [block] })
    const loesung = Object.values(fassung.loesungen)[0] as { werte: string[]; artikelFrei?: boolean }
    expect(loesung.werte).toEqual(['cup', 'teacup', 'mug'])
    expect(vergleiche('teacup', loesung.werte, true)).toBe('richtig')
    expect(vergleiche('a teacup', loesung.werte, true)).toBe('richtig')
    expect(vergleiche('cat', loesung.werte, true)).toBe('falsch')
  })
})
