import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { ChoiceBlock, MatchBlock, MindmapBlock, TestDocument, TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'
import { ensureExtraWords, mindestGegenteile, synonymArt, TASK_TYPES, type GenContext } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import { mindmapAeste, mindmapLage, mindmapSvg, mindmapVariante, MM_MASSE } from '../src/renderer/src/modules/vokabeltest/render/mindmapLayout'
import { ablenkerBefunde, checkBlock, describeBlock, synonymMischung } from '../src/renderer/src/modules/vokabeltest/generation/quality'
import { ersatzWoerter, wortartAusPos, wortartVon } from '../src/renderer/src/modules/vokabeltest/generation/wortart'
import {
  MINDMAP_ANWEISUNGEN,
  MINDMAP_SPRACHEN,
  mindmapAnweisung,
  SYNONYM_SPRACHEN,
  synonymTexte
} from '../src/renderer/src/modules/vokabeltest/render/aufgabenTexte'
import { buildDocx } from '../src/renderer/src/modules/vokabeltest/export/docx'
import { itemCount } from '../src/renderer/src/modules/vokabeltest/model/blocks'

/*
 * Befunde der Lehrkraft zum Vokabeltest (02.10.2026): echte Mindmap (beide Formen), Synonyme
 * UND Gegenteile mit passender Anweisung, Ablenker nicht an Wortart/Form erkennbar.
 */

const settings = (extra: Partial<TestSettings> = {}): TestSettings =>
  ({
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 7,
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
  } as TestSettings)

const ctx = (s: TestSettings = settings(), allVocab: VocabEntry[] = []): GenContext => ({ settings: s, languageName: 'English', rng: createRng(7), allVocab })

const woerter = ['beach', 'hotel', 'to swim', 'to dive', 'sunny', 'crowded', 'island', 'to relax']
const vocab: VocabEntry[] = woerter.map((term, i) => ({ id: `v${i}`, term, translation: `Wort ${i}` }))

/** Ein alter Mindmap-Block (bis 01.10.2026): nur Thema und Wörter */
const alterBlock = (n: number): MindmapBlock => ({
  id: 'b1',
  taskType: 'mindmap',
  title: 'Mind map',
  instruction: 'Write the words you have learned about this topic into the empty branches.',
  pointsPerItem: 1,
  kind: 'mindmap',
  topic: 'Holidays',
  items: vocab.slice(0, n).map((v, i) => ({ id: `i${i}`, vocabId: v.id, answer: v.term }))
})

const ueberlappen = (a: { x: number; y: number; b: number; h: number }, b: { x: number; y: number; b: number; h: number }): boolean =>
  a.x < b.x + b.b && b.x < a.x + a.b && a.y < b.y + b.h && b.y < a.y + a.h

describe('Mindmap', () => {
  it('liest alte Blöcke (nur Thema + Wörter) als offene Mindmap mit allen Wörtern', () => {
    for (const n of [4, 6, 8]) {
      const block = alterBlock(n)
      expect(mindmapVariante(block)).toBe('offen')
      const aeste = mindmapAeste(block)
      expect(aeste.length).toBeGreaterThanOrEqual(3)
      expect(aeste.length).toBeLessThanOrEqual(5)
      expect(aeste.every((a) => !a.vorgegeben && a.label === '' && a.zweige >= 2)).toBe(true)
      // Kein Wort geht verloren, und jedes hat im Lösungsteil eine Linie
      expect(aeste.flatMap((a) => a.woerter.map((w) => w.answer)).sort()).toEqual(block.items.map((i) => i.answer).sort())
      expect(aeste.every((a) => a.woerter.length <= a.zweige)).toBe(true)
      expect(itemCount(block)).toBe(n)
    }
  })

  it('legt Äste und Schreiblinien überschneidungsfrei und groß genug an', () => {
    const lage = mindmapLage(mindmapAeste(alterBlock(8)))
    const kaesten = [lage.mitte, ...lage.aeste.flatMap((a) => [a.label, ...a.zweige])]
    for (const z of lage.aeste.flatMap((a) => a.zweige)) {
      expect(z.b).toBeGreaterThanOrEqual(35)
      expect(z.h).toBeGreaterThanOrEqual(9)
    }
    for (const k of kaesten) {
      expect(k.x).toBeGreaterThanOrEqual(0)
      expect(k.x + k.b).toBeLessThanOrEqual(MM_MASSE.breite + 0.01)
      expect(k.y).toBeGreaterThanOrEqual(0)
      expect(k.y + k.h).toBeLessThanOrEqual(lage.hoehe + 0.01)
    }
    for (let i = 0; i < kaesten.length; i++) for (let j = i + 1; j < kaesten.length; j++) expect(ueberlappen(kaesten[i], kaesten[j])).toBe(false)
    // Äste auf beiden Seiten, Höhe für eine A4-Seite vernünftig
    expect(new Set(lage.aeste.map((a) => a.seite)).size).toBe(2)
    expect(lage.hoehe).toBeLessThan(150)
  })

  const kiAntwort = {
    instruction: 'egal',
    topic: 'Holidays',
    categories: [
      { name: 'Places', vocabIds: ['v0', 'v1', 'v6'] },
      { name: 'Activities', vocabIds: ['v2', 'v3', 'v7'] },
      { name: 'Adjectives', vocabIds: ['v4', 'v5'] }
    ]
  }

  it('baut die Form „mit Oberbegriffen": je Ast so viele Linien wie Wörter, optional ein freier Ast', () => {
    const block = TASK_TYPES.mindmap.build(vocab, kiAntwort, ctx(settings({ mindmapFreierAst: true }))) as MindmapBlock
    expect(block.variante).toBe('oberbegriffe')
    expect(block.branches?.map((b) => b.label)).toEqual(['Places', 'Activities', 'Adjectives'])
    expect(block.items).toHaveLength(8)
    expect(block.items.every((i) => block.branches!.some((b) => b.id === i.branchId))).toBe(true)
    expect(block.instruction).toBe(mindmapAnweisung('en', 'oberbegriffe'))
    const aeste = mindmapAeste(block)
    expect(aeste.map((a) => a.zweige)).toEqual([3, 3, 2, 2])
    expect(aeste[3]).toMatchObject({ frei: true, vorgegeben: false, woerter: [] })
    // Der freie Ast zählt nicht zu den Punkten
    expect(itemCount(block)).toBe(8)
    expect(checkBlock(block, vocab, 'en')).toEqual([])
    expect(describeBlock(block)).toContain('Branch "Places": beach, hotel, island')
  })

  it('baut die offene Form: leere Äste gleicher Länge, Oberbegriffe nur als Lösungsvorschlag', () => {
    const block = TASK_TYPES.mindmap.build(vocab, kiAntwort, ctx(settings({ mindmapVariante: 'offen', mindmapFreierAst: true }))) as MindmapBlock
    expect(block.variante).toBe('offen')
    expect(block.freierAst).toBe(false)
    expect(block.instruction).toBe(mindmapAnweisung('en', 'offen'))
    const aeste = mindmapAeste(block)
    expect(aeste.every((a) => !a.vorgegeben)).toBe(true)
    expect(new Set(aeste.map((a) => a.zweige)).size).toBe(1)
    expect(aeste.map((a) => a.label)).toEqual(['Places', 'Activities', 'Adjectives'])
  })

  it('meldet fehlende Oberbegriffe und Wörter ohne Ast', () => {
    const ohne = TASK_TYPES.mindmap.build(vocab, { topic: 'Holidays', words: vocab.map((v) => ({ vocabId: v.id })) }, ctx()) as MindmapBlock
    expect(ohne.items).toHaveLength(8)
    expect(
      checkBlock(ohne, vocab)
        .map((i) => i.message)
        .join(' ')
    ).toContain('Keine brauchbaren Oberbegriffe')
    // Gezeichnet wird dann offen statt mit leeren Oberbegriff-Kästen
    expect(mindmapVariante(ohne)).toBe('offen')
    const teil = TASK_TYPES.mindmap.build(vocab, { ...kiAntwort, categories: kiAntwort.categories.slice(0, 2) }, ctx()) as MindmapBlock
    expect(
      checkBlock(teil, vocab)
        .map((i) => i.message)
        .join(' ')
    ).toContain('Keinem Oberbegriff zugeordnet: sunny, crowded')
    // Im Bild gehen sie trotzdem nicht verloren
    expect(mindmapAeste(teil).flatMap((a) => a.woerter)).toHaveLength(8)
  })

  it('zeichnet für Word ein SVG mit Thema, Oberbegriffen und (im Lösungsteil) den Wörtern', () => {
    const block = TASK_TYPES.mindmap.build(vocab, { ...kiAntwort, topic: 'Sun & <sea>' }, ctx()) as MindmapBlock
    const blatt = mindmapSvg(block, false)
    expect(blatt).toContain('Sun &amp; &lt;sea&gt;')
    expect(blatt).toContain('Places')
    expect(blatt).not.toContain('island')
    expect(mindmapSvg(block, true)).toContain('island')
  })

  it('Word-Export ohne Zeichenfläche: Tabelle mit Oberbegriffen und Lösungen', async () => {
    const block = TASK_TYPES.mindmap.build(vocab, kiAntwort, ctx()) as MindmapBlock
    const doc: TestDocument = {
      version: 1,
      header: {
        title: 'Vocabulary test',
        showName: true,
        showDate: true,
        showClass: true,
        showSchool: false,
        schoolName: '',
        showVariant: false,
        showPoints: true,
        showGrade: false,
        subtitle: ''
      },
      settings: settings(),
      vocab,
      variants: [{ id: 'v', label: 'A', blocks: [block, { ...alterBlock(6), id: 'b2' }] }],
      fontSize: 12,
      createdAt: ''
    }
    const zip = await JSZip.loadAsync(await buildDocx(doc, { variantIds: ['v'], includeKey: true }, async () => ({ width: 1, height: 1 })))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Holidays')
    expect(xml).toContain('Activities')
    expect(xml).toContain('to relax')
  })

  it('hat Anweisungen für beide Formen in allen Sprachen; frühere Fassungen werden erkannt', () => {
    for (const s of MINDMAP_SPRACHEN) {
      expect(mindmapAnweisung(s, 'oberbegriffe'), s).not.toBe(mindmapAnweisung(s, 'offen'))
    }
    expect(mindmapAnweisung('la', 'offen')).toContain('Überschrift')
    expect(mindmapAnweisung('la', 'offen', true)).toContain('Schreiben Sie')
    expect(MINDMAP_ANWEISUNGEN).toContain(alterBlock(4).instruction)
  })
})

describe('Synonyme und Gegenteile', () => {
  const paare = (rel: string[]) => ({ pairs: rel.map((r, i) => ({ vocabId: `v${i}`, partner: `partner${i}`, relation: r })), extraWords: ['lamp', 'cloud'] })

  it('verlangt im Prompt mindestens ein Drittel Gegenteile', () => {
    expect(mindestGegenteile(2)).toBe(0)
    expect(mindestGegenteile(3)).toBe(1)
    expect(mindestGegenteile(6)).toBe(2)
    expect(mindestGegenteile(7)).toBe(3)
    expect(TASK_TYPES.synonymsAntonyms.prompt!(vocab.slice(0, 6), ctx())).toContain('at least 2 of the 6 pairs must be antonyms')
  })

  it('richtet Anweisung, Überschrift und Zeichen am Wort nach den tatsächlichen Beziehungen', () => {
    const gemischt = TASK_TYPES.synonymsAntonyms.build(vocab, paare(['=', '≠', '=', '≠']), ctx()) as MatchBlock
    expect(gemischt.instruction).toContain('(=)')
    expect(gemischt.instruction).toContain('(≠)')
    expect(gemischt.left.every((l) => / \((=|≠)\)$/.test(l.text))).toBe(true)

    const gleich = TASK_TYPES.synonymsAntonyms.build(vocab, paare(['=', '=', '=']), ctx()) as MatchBlock
    expect(gleich.instruction).toBe('Match each word with a word that has the same meaning.')
    expect(gleich.title).toBe('Synonyms')
    expect(gleich.left.some((l) => l.text.includes('('))).toBe(false)

    const gegenteil = TASK_TYPES.synonymsAntonyms.build(vocab, paare(['≠', '≠', '≠']), ctx(settings({ targetLanguage: 'fr' }))) as MatchBlock
    expect(gegenteil.instruction).toBe('Associe chaque mot à un mot de sens contraire.')
    expect(gegenteil.rightLabel).toBe('Contraires')
    expect(gegenteil.leftLabel).toBe('Mots')
  })

  it('hält die drei Fassungen in allen Sprachen auseinander', () => {
    for (const s of [...SYNONYM_SPRACHEN, 'la']) {
      const g = synonymTexte(s, 'gemischt')
      const gl = synonymTexte(s, 'gleich')
      const ge = synonymTexte(s, 'gegenteil')
      expect(new Set([g.instruction, gl.instruction, ge.instruction]).size, s).toBe(3)
      // Nur die gemischte Fassung erklärt die Zeichen = und ≠
      expect(g.instruction, s).toMatch(/=.*≠/)
      expect(gl.instruction + ge.instruction, s).not.toMatch(/[=≠]/)
      expect(gl.rightLabel, s).not.toBe(ge.rightLabel)
    }
  })

  it('meldet zu wenige Gegenteile – nur Gegenteile sind in Ordnung', () => {
    expect(synonymArt(['=', '='])).toBe('gleich')
    expect(synonymArt(['≠'])).toBe('gegenteil')
    expect(synonymArt(['=', '≠'])).toBe('gemischt')
    expect(synonymMischung(['=', '=', '=', '=', '=', '='])).toContain('Nur Synonyme')
    expect(synonymMischung(['=', '=', '=', '=', '=', '≠'])).toContain('Nur 1 von 6')
    expect(synonymMischung(['=', '=', '=', '=', '≠', '≠'])).toBeNull()
    expect(synonymMischung(['≠', '≠', '≠'])).toBeNull()
    expect(synonymMischung(['=', '='])).toBeNull()
    // Ältere Blöcke ohne Angabe: keine Meldung
    expect(synonymMischung([undefined, undefined, undefined])).toBeNull()
    const block = TASK_TYPES.synonymsAntonyms.build(vocab, paare(['=', '=', '=']), ctx()) as MatchBlock
    expect(
      checkBlock(block, vocab.slice(0, 3))
        .map((i) => i.message)
        .join(' ')
    ).toContain('Nur Synonyme')
  })
})

describe('Ablenker', () => {
  const choice = (options: string[], vocabId = 'v2'): ChoiceBlock => ({
    id: 'c',
    taskType: 'multipleChoice',
    title: '',
    instruction: '',
    pointsPerItem: 1,
    kind: 'choice',
    items: [{ id: 'i', vocabId, before: 'We want to', after: 'in the sea.', options, correct: 0 }]
  })

  it('verlangt im Prompt gleiche Wortart und Form ohne widersprüchliches „oder"', () => {
    const p = TASK_TYPES.multipleChoice.prompt!(vocab.slice(0, 2), ctx(settings(), vocab))
    expect(p).toContain('SAME word class')
    expect(p).toContain('SAME form')
    expect(p).not.toContain('or words of the same word class')
    expect(TASK_TYPES.latinContext.prompt!(vocab.slice(0, 1), ctx(settings({ targetLanguage: 'la' })))).toContain('derselben Wortart und Form')
  })

  it('erkennt Ablenker, die schon an Artikel, „to", -ing oder Wortart scheitern', () => {
    expect(ablenkerBefunde(['le pain', 'pomme', 'le lait', 'le riz'], 0, 'fr', undefined)).toHaveLength(1)
    expect(ablenkerBefunde(['to swim', 'dive', 'to run', 'to sing'], 0, 'en', undefined).join(' ')).toContain('„to"')
    const swim: VocabEntry = { id: 'v2', term: 'to swim', translation: 'schwimmen' }
    expect(ablenkerBefunde(['swimming', 'diving', 'run', 'relaxing'], 0, 'en', swim).join(' ')).toContain('-ing')
    // „beach" ist in der Liste ein Nomen (Artikel fehlt, aber pos sagt es), „sunny" ein Adjektiv
    const liste: VocabEntry[] = [
      swim,
      { id: 'x', term: 'beach', translation: 'Strand', pos: 'noun' },
      { id: 'y', term: 'dive', translation: 'tauchen', pos: 'verb' }
    ]
    expect(ablenkerBefunde(['swim', 'beach', 'dive', 'careful'], 0, 'en', swim, liste).join(' ')).toContain('beach, careful')
    // Saubere Ablenker: gleiche Form und Wortart
    expect(ablenkerBefunde(['swim', 'dive', 'run', 'climb'], 0, 'en', swim, liste)).toEqual([])
    expect(ablenkerBefunde(['swimming', 'diving', 'running', 'climbing'], 0, 'en', swim, liste)).toEqual([])
    // Die Wortart steht in der ganzen Liste, nicht nur bei den Wörtern dieser Aufgabe
    expect(
      checkBlock(choice(['swim', 'beach', 'dive', 'climb']), [swim], 'en', liste)
        .map((i) => i.message)
        .join(' ')
    ).toContain('anderer Wortart')
    // Ohne Sprache (ältere Aufrufe) keine Formprüfung
    expect(checkBlock(choice(['swim', 'beach', 'dive', 'climb']), [swim], undefined, liste)).toEqual([])
  })

  it('liest Wortarten aus der Liste und aus der Form', () => {
    expect(wortartAusPos('adj.')).toBe('adj')
    expect(wortartAusPos('Adverb')).toBe('adv')
    expect(wortartAusPos('v.')).toBe('verb')
    expect(wortartAusPos('Substantiv')).toBe('noun')
    expect(wortartAusPos('существительное')).toBe('noun')
    expect(wortartVon({ id: 'a', term: 'to swim', translation: '' }, 'en')).toBe('verb')
    expect(wortartVon({ id: 'a', term: 'la plage', translation: '' }, 'fr')).toBe('noun')
    expect(wortartVon({ id: 'a', term: 'nager', translation: '' }, 'fr')).toBe('verb')
    expect(wortartVon({ id: 'a', term: 'beach', translation: '' }, 'en')).toBeUndefined()
  })

  it('füllt den Wortkasten nur mit Ersatzwörtern der passenden Wortart', () => {
    const verben: VocabEntry[] = [
      { id: 'a', term: 'to swim', translation: '' },
      { id: 'b', term: 'to dive', translation: '' }
    ]
    expect(ersatzWoerter(verben, 'en').every((w) => w.startsWith('to '))).toBe(true)
    const nomenFr: VocabEntry[] = [{ id: 'a', term: 'la plage', translation: '' }]
    expect(ersatzWoerter(nomenFr, 'fr')).toContain('le jardin')
    expect(ersatzWoerter([{ id: 'a', term: 'plage', translation: '', pos: 'nom' }], 'fr')).toContain('jardin')
    // Russische Adjektive: keine passende Reserve → lieber keine Ersatzwörter
    expect(ersatzWoerter([{ id: 'a', term: 'красивый', translation: '', pos: 'adj.' }], 'ru')).toEqual([])
    // Ohne bekannte Wortart wie bisher Nomen
    expect(ersatzWoerter([{ id: 'a', term: 'beach', translation: '' }], 'en')).toContain('window')
    const extras = ensureExtraWords([], verben, ctx(settings(), verben))
    expect(extras.length).toBeGreaterThanOrEqual(2)
    expect(extras.every((w) => w.startsWith('to '))).toBe(true)
  })
})
