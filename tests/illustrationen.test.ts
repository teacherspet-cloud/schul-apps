import JSZip from 'jszip'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMaskottchen, maskottchenBild } from '../src/renderer/src/shared/maskottchenStore'
import { KEY_GREEN } from '../src/renderer/src/shared/imageCleanup'
import { buildDocx } from '../src/renderer/src/modules/vokabeltest/export/docx'
import { defaultHeader } from '../src/renderer/src/modules/vokabeltest/generation/generate'
import { TASK_TYPES } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { TestDocument, TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'
import { RenderContext, type RenderMode } from '../src/renderer/src/modules/vokabeltest/render/RenderContext'
import { vokabeltestFigur } from '../src/renderer/src/modules/vokabeltest/render/maskottchen'
import { TestPage } from '../src/renderer/src/modules/vokabeltest/render/TestPage'
import { useAppSettings } from '../src/renderer/src/shared/settingsStore'
import {
  illustrationenAktiv,
  platziereIllustrationen,
  platziereKopfUndSchluss,
  poseFuer
} from '../src/renderer/src/modules/arbeitsblatt/generation/illustrationen'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, Worksheet, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { MASKOTTCHEN_KEY_GREEN, MASKOTTCHEN_POSEN, maskottchenId, posePrompt, vorlagePrompt } from '../src/shared/maskottchen'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function blatt(grade: number, blocks: WsBlock[]): Worksheet {
  const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), grade, subjectId: 'mathematik', subjectLabel: 'Mathematik', topic: 'Brüche' }
  return { meta, design: {} as never, outline: null, sheets: [{ id: 's', label: 'Blatt', blocks }], sources: [] } as unknown as Worksheet
}

const aufgabe = (id: string, operator = 'Berechne', kind: 'lines' | 'grid' | 'diagram' = 'grid'): WsBlock => ({
  ...(newBlock('task') as TaskBlock),
  id,
  operator,
  instruction: `${operator} etwas.`,
  answer: { ...emptyAnswer(kind), count: 6 }
})

beforeEach(() => {
  useMaskottchen.setState({
    liste: [
      { id: 'pengu', name: 'Professor Pengu', beschreibung: 'Pinguin', quelle: 'ki', angelegt: '2026', vorlage: PNG, posen: { winkend: PNG, zeigend: PNG } }
    ],
    geladen: true
  })
  useAppSettings.setState((s) => ({ settings: { ...s.settings, illustrationen: { bisKlasse: 6, standardId: 'pengu' } } }))
})

describe('Maskottchen: neongrüner Grund (27.09.2026)', () => {
  it('verlangt für Vorlage und jede Pose das Chroma-Key-Grün der Freistellung – kein Weiß', () => {
    expect(MASKOTTCHEN_KEY_GREEN).toBe(KEY_GREEN)
    const vorlage = vorlagePrompt('ein Pinguin als Professor')
    expect(vorlage).toContain(KEY_GREEN)
    expect(vorlage).toContain('neongrün')
    expect(vorlage).not.toMatch(/weiß/i)
    for (const p of MASKOTTCHEN_POSEN) {
      const prompt = posePrompt('ein Pinguin mit Brille', p)
      expect(prompt).toContain(KEY_GREEN)
      expect(prompt).not.toMatch(/weiß/i)
      // Die Figur darf den Schlüsselton nicht tragen, sonst würde sie mit weggekeyt
      expect(prompt).toContain('enthält dieses Neongrün nicht')
    }
  })
})

describe('Maskottchen: Speicher und Posen', () => {
  it('kennt zwölf Posen mit eigenem Zweck', () => {
    expect(MASKOTTCHEN_POSEN).toHaveLength(12)
    expect(new Set(MASKOTTCHEN_POSEN.map((p) => p.id)).size).toBe(12)
    expect(posePrompt('ein Pinguin mit Brille', MASKOTTCHEN_POSEN[2])).toContain('ein Pinguin mit Brille')
    expect(maskottchenId('Professor Pengu')).toBe('professor-pengu')
    expect(maskottchenId('Fiona Füchsin')).toBe('fiona-fuechsin')
  })
  it('liefert die Pose, sonst „winkend", sonst die Vorlage – ohne Figur nichts', () => {
    expect(maskottchenBild('pengu', 'zeigend')).toBe(PNG)
    expect(maskottchenBild(undefined, 'denkend')).toBe(PNG)
    useMaskottchen.setState({ liste: [] })
    expect(maskottchenBild('pengu', 'zeigend')).toBeUndefined()
  })
})

describe('Illustrationen: wann und wo', () => {
  it('gelten bis zur eingestellten Klasse; ausdrückliche Wahl am Blatt geht vor', () => {
    expect(illustrationenAktiv({ grade: 5 })).toBe(true)
    expect(illustrationenAktiv({ grade: 7 })).toBe(false)
    expect(illustrationenAktiv({ grade: 9, illustrationen: { an: true } })).toBe(true)
    expect(illustrationenAktiv({ grade: 3, illustrationen: { an: false } })).toBe(false)
    useMaskottchen.setState({ liste: [] })
    expect(illustrationenAktiv({ grade: 5 })).toBe(false)
  })

  it('wählt Posen nach dem Zweck des Bausteins', () => {
    const meta = { subjectId: 'mathematik' }
    expect(poseFuer({ ...newBlock('infoBox'), variant: 'merke' } as WsBlock, meta)).toBe('zeigend')
    expect(poseFuer({ ...newBlock('infoBox'), variant: 'regel' } as WsBlock, meta)).toBe('warnend')
    expect(poseFuer(aufgabe('a', 'Beurteile'), meta)).toBe('denkend')
    expect(poseFuer(aufgabe('b', 'Zeichne', 'diagram'), meta)).toBe('zeichnend')
    expect(poseFuer(aufgabe('c', 'Berechne', 'grid'), meta)).toBe('rechnend')
    expect(poseFuer(newBlock('text') as WsBlock, meta)).toBeNull()
  })

  it('setzt Gruß am Kopf, Figuren an Kästen und höchstens drei Aufgaben, Lob am Schluss', async () => {
    const ws = blatt(5, [
      newBlock('learningGoals') as WsBlock,
      { ...newBlock('infoBox'), id: 'merke', variant: 'merke' } as WsBlock,
      aufgabe('a1', 'Beurteile'),
      aufgabe('a2', 'Beurteile'),
      aufgabe('a3', 'Beurteile'),
      aufgabe('a4', 'Beurteile'),
      { ...newBlock('selfCheck'), id: 'check' } as WsBlock
    ])
    const neu = await platziereIllustrationen(ws)
    const b = neu.sheets[0].blocks
    expect(b[0].illustration?.pose).toBe('winkend')
    expect(b[0].illustration?.bubble).toBeTruthy()
    expect(b[1].illustration?.pose).toBe('zeigend')
    expect(b.filter((x) => x.type === 'task' && x.illustration).length).toBe(3)
    expect(b[6].illustration?.pose).toBe('jubelnd')
    // Ohne Maskottchen-Recht (Klasse 8) bleibt alles leer
    const alt = await platziereIllustrationen(blatt(8, [aufgabe('x')]))
    expect(alt.sheets[0].blocks.some((x) => x.illustration)).toBe(false)
  })

  it('Sprechblasentexte kommen von der KI, sonst feste Sätze', async () => {
    const ws = blatt(4, [newBlock('learningGoals') as WsBlock, aufgabe('a1')])
    const mitKi = await platziereIllustrationen(ws, {
      ai: async () => ({ gruss: 'Hallo, kleine Bruchrechner!', schluss: 'Klasse gemacht!', tipp: '' }) as never
    })
    expect(mitKi.sheets[0].blocks[0].illustration?.bubble).toBe('Hallo, kleine Bruchrechner!')
    expect(mitKi.sheets[0].blocks[1].illustration?.bubble).toBe('Klasse gemacht!')
    const ohne = await platziereIllustrationen(ws, {
      ai: async () => {
        throw new Error('aus')
      }
    })
    expect(ohne.sheets[0].blocks[0].illustration?.bubble).toBe('Hallo! Los geht’s.')
  })

  it('Arbeiten: nur Kopf (winkend) und Schluss (jubelnd), keine Sprechblasen', () => {
    const ws = platziereKopfUndSchluss(blatt(5, [newBlock('infoBox') as WsBlock, aufgabe('a1', 'Beurteile'), aufgabe('a2')]))
    const b = ws.sheets[0].blocks
    expect(b[0].illustration).toEqual({ maskottchenId: undefined, pose: 'winkend' }.maskottchenId === undefined ? { pose: 'winkend' } : b[0].illustration)
    expect(b[1].illustration).toBeUndefined()
    expect(b[2].illustration?.pose).toBe('jubelnd')
    expect(b[2].illustration?.bubble).toBeUndefined()
  })
})

// ---------- Vokabeltest: Kopf- und Schlussfigur (27.09.2026)

function vokabeltest(grade: number, header: Partial<TestDocument['header']> = {}): TestDocument {
  const woerter: VocabEntry[] = [
    { id: 'e1', term: 'to explore', translation: 'erkunden', include: true },
    { id: 'e2', term: 'journey', translation: 'Reise', include: true }
  ]
  const settings: TestSettings = {
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade,
    level: 'A1',
    vocabCount: 2,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [{ type: 'writeSentences', count: 2, pointsPerItem: 2 }],
    topic: 'Travelling',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  }
  const block = TASK_TYPES.writeSentences.build(
    woerter,
    { instruction: 'Write a sentence with each word.', items: woerter.map((w) => ({ vocabId: w.id, prompt: w.term, modelAnswer: `I like ${w.term}.` })) },
    { settings, languageName: 'English', rng: createRng(1), allVocab: woerter } as never
  )
  return {
    version: 1,
    header: { ...defaultHeader(''), ...header },
    settings,
    vocab: woerter,
    variants: [{ id: 'v1', label: 'A', blocks: [block] }],
    fontSize: 11,
    createdAt: '2026-09-27T00:00:00.000Z'
  }
}

const seite = (doc: TestDocument, mode: RenderMode = 'print'): string =>
  renderToStaticMarkup(createElement(RenderContext.Provider, { value: { mode, language: 'en' } }, createElement(TestPage, { doc, variant: doc.variants[0] })))

describe('Vokabeltest: Kopf- und Schlussfigur', () => {
  it('Klasse 5: winkend im Kopf, jubelnd am Schluss – nur auf dem Schülerblatt', () => {
    const html = seite(vokabeltest(5))
    expect(html).toContain('vt-header vt-header-illu')
    expect(html).toContain('vt-illu vt-illu-kopf')
    expect(html).toContain('vt-illu vt-illu-schluss')
    expect(html.match(/vt-illu-(kopf|schluss)/g)).toHaveLength(2)
    // Im Lösungsteil lenkt eine Figur nur ab
    const key = seite(vokabeltest(5), 'key')
    expect(key).not.toContain('vt-illu')
    expect(key).not.toContain('vt-header-illu')
  })

  it('Klasse 9 von selbst ohne Figur; ausdrücklich eingeschaltet mit, ausgeschaltet ohne', () => {
    expect(seite(vokabeltest(9))).not.toContain('vt-illu')
    expect(seite(vokabeltest(9, { illustrationen: { an: true } }))).toContain('vt-illu-kopf')
    expect(seite(vokabeltest(5, { illustrationen: { an: false } }))).not.toContain('vt-illu')
    // Gewählte Figur
    expect(vokabeltestFigur(vokabeltest(5, { illustrationen: { maskottchenId: 'pengu' } }))).toEqual({ maskottchenId: 'pengu' })
    // Ohne angelegte Figur nie – leere Rahmen gibt es nicht
    useMaskottchen.setState({ liste: [] })
    expect(vokabeltestFigur(vokabeltest(5))).toBeNull()
    expect(seite(vokabeltest(5))).not.toContain('vt-illu')
  })

  it('Word: dieselben beiden Bilder im Schülerblatt, keines im Lösungsblatt', async () => {
    const sizer = async (): Promise<{ width: number; height: number }> => ({ width: 1, height: 1 })
    const bilder = async (doc: TestDocument, includeKey: boolean, keyOnly = false): Promise<number> => {
      const zip = await JSZip.loadAsync(await buildDocx(doc, { variantIds: ['v1'], includeKey, keyOnly }, sizer))
      return Object.keys(zip.files).filter((n) => n.startsWith('word/media/')).length
    }
    expect(await bilder(vokabeltest(5), false)).toBe(2)
    expect(await bilder(vokabeltest(5), true, true)).toBe(0)
    expect(await bilder(vokabeltest(9), false)).toBe(0)
  })
})
