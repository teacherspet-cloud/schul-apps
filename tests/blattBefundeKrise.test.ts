import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { OnlineImageHit, StructuredRequest } from '../src/shared/types'
import type { ImageServices } from '../src/renderer/src/shared/imageChoice'
import type { Answer, ImageBlock, Sheet, TableBlock, TaskBlock, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { istAntworttabelle, tabellenZumAusfuellen } from '../src/renderer/src/modules/arbeitsblatt/generation/antworttabellen'
import { blattOhneFehlendeBilder, BILD_FEHLT, ohneBildVerweis } from '../src/renderer/src/modules/arbeitsblatt/generation/bildFehlt'
import { completeWorksheetImages } from '../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages'
import { aufgabenZumMaterial } from '../src/renderer/src/modules/arbeitsblatt/generation/finish'
import { scaffoldRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts/gestaltung'
import { convertOutline } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { wortspeicherArt } from '../src/renderer/src/modules/arbeitsblatt/didactics/language'
import {
  aufgabenNaheAmMaterial,
  checkMaterialAbstand,
  fernesMaterial,
  mitSeitenHinweisen,
  seitenJeBaustein
} from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import { bindeKurzeTabellen, paginate, tabelleZusammenhalten } from '../src/renderer/src/shared/render/paginate'
import { BlockInhalt } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/blockview'
import { AnswerView } from '../src/renderer/src/modules/arbeitsblatt/render/Answers'
import { WsContext, type WsContextValue } from '../src/renderer/src/modules/arbeitsblatt/render/WsContext'

/*
 * Befunde der Lehrkraft zu den Blättern der Reihe „Vom Krieg zur Krise" (Geschichte Kl. 9, 08.10.2026):
 * Suchauftrag statt Bild, Wortspeicher mit Artikel/Plural im Sachfach, leere Material-Tabellen, zerrissene kurze
 * Tabellen, Aufgabe drei Seiten hinter ihrem Material, Korrekturrand fehlte am Schreibraum.
 */

const task = (id: string, instruction: string, patch: Partial<TaskBlock> = {}): TaskBlock => ({
  id,
  type: 'task',
  instruction,
  operator: '',
  afbReason: '',
  socialForm: 'EA',
  answer: emptyAnswer('lines'),
  parts: [],
  solution: '',
  points: 2,
  minutes: 5,
  ...patch
})
const text = (id: string, ref?: string): WsBlock => ({ id, type: 'text', title: 'Quelle', body: 'Inhalt', ...(ref ? { ref } : {}) }) as WsBlock
const bild = (id: string, ref: string, patch: Partial<ImageBlock> = {}): ImageBlock => ({
  id,
  type: 'image',
  ref,
  caption: 'Karikatur zum Versailler Vertrag',
  description: 'Karikatur: Deutschland unter der Last der Reparationen',
  widthPercent: 60,
  ...patch
})
const tabelle = (id: string, rows: string[][], patch: Partial<TableBlock> = {}): TableBlock => ({
  id,
  type: 'table',
  title: 'Folgen des Krieges',
  headers: ['Bereich', 'Folge'],
  rows,
  ...patch
})
const blatt = (blocks: WsBlock[]): Sheet => ({ id: 's1', label: 'Arbeitsblatt', blocks })

describe('Leere Tabellen werden Ausfülltabellen', () => {
  it('erkennt Antworttabellen – leer oder nur mit Vorgaben in der ersten Spalte', () => {
    expect(istAntworttabelle(tabelle('t', [['', ''], ['', '']]))).toBe(true)
    expect(istAntworttabelle(tabelle('t', [['Politik', '___'], ['Wirtschaft', '']]))).toBe(true)
    expect(istAntworttabelle(tabelle('t', [['Politik', 'Republik'], ['Wirtschaft', '']]))).toBe(false)
  })

  it('gibt die Tabelle der Aufgabe als tableFill und nimmt den Verweis aus dem Text', () => {
    const s = blatt([text('m1', 'quelle'), task('a1', 'Fasse die Folgen aus M{quelle} in der Tabelle M{folgen} zusammen.'), tabelle('t1', [['', ''], ['', ''], ['', '']], { ref: 'folgen' })])
    const { sheet, warnungen } = tabellenZumAusfuellen(s)
    expect(sheet.blocks.map((b) => b.id)).toEqual(['m1', 'a1'])
    const a = sheet.blocks[1] as TaskBlock
    expect(a.answer.kind).toBe('tableFill')
    expect(a.answer.headers).toEqual(['Bereich', 'Folge'])
    expect(a.answer.rows).toEqual([
      ['', ''],
      ['', ''],
      ['', '']
    ])
    expect(a.instruction).toBe('Fasse die Folgen aus M{quelle} in der Tabelle zusammen.')
    expect(a.warnings?.[0]).toContain('Ausfülltabelle')
    expect(warnungen).toHaveLength(1)
  })

  it('setzt die Tabelle an die Teilaufgabe, die sie nennt, und behält Vorgaben der ersten Spalte', () => {
    const a = task('a1', 'Untersuche M{quelle}.', {
      parts: [
        { id: 'p1', instruction: 'Nenne den Anlass.', answer: emptyAnswer('lines'), solution: '' },
        { id: 'p2', instruction: 'Ordne die Folgen in M{folgen} ein.', answer: emptyAnswer('lines'), solution: '' }
      ]
    })
    const { sheet } = tabellenZumAusfuellen(blatt([text('m1', 'quelle'), a, tabelle('t1', [['Politik', ''], ['Wirtschaft', '']], { ref: 'folgen' })]))
    const neu = sheet.blocks.find((b) => b.id === 'a1') as TaskBlock
    expect(neu.parts[0].answer.kind).toBe('lines')
    expect(neu.parts[1].answer.kind).toBe('tableFill')
    expect(neu.parts[1].answer.rows).toEqual([
      ['Politik', ''],
      ['Wirtschaft', '']
    ])
    expect(neu.parts[1].instruction).toBe('Ordne die Folgen in die Tabelle ein.')
  })

  it('macht ohne passende Aufgabe eine eigene Aufgabe daraus und lässt Materialtabellen stehen', () => {
    const material = tabelle('t0', [['1919', 'Versailles']], { title: 'Daten' })
    const { sheet } = tabellenZumAusfuellen(blatt([material, text('m1'), tabelle('t1', [['', '']])]))
    expect(sheet.blocks[0]).toBe(material)
    const eigene = sheet.blocks[2] as TaskBlock
    expect(eigene.type).toBe('task')
    expect(eigene.instruction).toBe('Fülle die Tabelle „Folgen des Krieges" aus.')
    expect(eigene.answer.kind).toBe('tableFill')
  })

  it('schreibt die Ausfüllzellen als Schreibfelder (.ws-cell-empty) – im Druck und digital ausfüllbar', () => {
    const answer: Answer = { ...emptyAnswer('tableFill'), headers: ['A', 'B'], rows: [['x', '']], solutionRows: [['', '']] }
    const html = renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx() }, createElement(AnswerView, { answer })))
    expect(html).toContain('ws-cell-empty')
  })
})

describe('Kurze Tabellen bleiben beim Umbruch zusammen, lange wiederholen den Kopf', () => {
  it('kurz = höchstens 8 Zeilen oder höchstens ein Drittel der Seite', () => {
    expect(tabelleZusammenhalten(8, 500, 1000)).toBe(true)
    expect(tabelleZusammenhalten(12, 300, 1000)).toBe(true)
    expect(tabelleZusammenhalten(12, 500, 1000)).toBe(false)
    // größer als die Seite: immer teilen
    expect(tabelleZusammenhalten(3, 1200, 1000)).toBe(false)
  })

  it('setzt eine kurze Tabelle (ungeteilt gemessen) geschlossen auf die nächste Seite', () => {
    const plan = paginate(
      [
        { id: 'text', height: 800 },
        { id: 'tabelle', height: 300 }
      ],
      1000,
      1000
    )
    expect(plan.map((p) => p.items.map((i) => i.id))).toEqual([['text'], ['tabelle']])
  })

  it('bindet die Zeilen einer kurzen inneren Tabelle samt der Einheit mit dem Kopf', () => {
    const units = [40, 30, 30, 30, 30]
    // Einheit 0: Stellung der Teilaufgabe (darin der Tabellenkopf), 1–4: Tabellenzeilen
    const glue = bindeKurzeTabellen(units, [false, false, false, false, false], [{ von: 1, bis: 5 }], 1000)
    expect(glue).toEqual([true, true, true, true, false])
    const plan = paginate([{ id: 'vorher', height: 900 }, { id: 'aufgabe', height: 160, headHeight: 0, units, unitGlue: glue }], 1000, 1000)
    // nichts von der Tabelle bleibt unten auf Seite 1 zurück
    expect(plan[0].items.map((i) => i.id)).toEqual(['vorher'])
    expect(plan[1].items[0]).toMatchObject({ id: 'aufgabe', from: 0, to: 5 })
  })

  it('teilt eine lange Tabelle; das Folgestück zeigt die Kopfzeile erneut', () => {
    const rows = Array.from({ length: 20 }, (_, i) => [`Zeile ${i + 1}`, 'Wert'])
    const t = tabelle('t1', rows, { title: 'Chronik' })
    const html = renderToStaticMarkup(
      createElement(WsContext.Provider, { value: ctx({ materialNumbers: new Map([['t1', 'M2']]) }) }, createElement(BlockInhalt, { block: t, placed: { id: 't1', from: 12, to: 20, continued: true } }))
    )
    expect(html).toContain('<thead')
    expect(html).toContain('Bereich')
    expect(html).toContain('Fortsetzung')
    expect(html).not.toContain('Zeile 12<')
    expect(html).toContain('Zeile 13')
  })
})

describe('Aufgabe nah am Material', () => {
  // Seite 1: M1 (quelle), Seite 2: M2 + Aufgabe 1, Seite 3: Aufgabe 2 (nur M1)
  const blocks = (): WsBlock[] => [
    text('m1', 'quelle'),
    task('a0', 'Nenne drei Forderungen aus M{quelle}.'),
    text('m2', 'rede'),
    task('a1', 'Erkläre die Absicht der Rede M{rede}.'),
    task('a2', 'Beurteile die Forderungen in M{quelle}.'),
    { id: 'sc', type: 'scaffold', variant: 'tipp', title: 'Tipp zu Aufgabe 3', items: ['Denke an …'] } as WsBlock
  ]
  const plaene = [{ items: [{ id: 'm1' }, { id: 'a0' }] }, { items: [{ id: 'm2' }, { id: 'a1' }] }, { items: [{ id: 'a2' }, { id: 'sc' }] }].map((p) => ({ ...p, overflow: false }))

  it('findet Verweise auf Material zwei oder mehr Seiten davor und meldet sie', () => {
    const seiten = seitenJeBaustein(plaene)
    expect(fernesMaterial(blocks(), seiten)).toEqual([{ aufgabeId: 'a2', materialId: 'm1', nummer: 'M1', seite: 0 }])
    expect(checkMaterialAbstand(blatt(blocks()), seiten)[0].message).toContain('Seite 1')
  })

  it('rückt die Aufgabe samt Hilfe hinter das Material und zählt Verweise um', () => {
    const { sheet, umgestellt } = aufgabenNaheAmMaterial(blatt(blocks()), seitenJeBaustein(plaene))
    expect(sheet.blocks.map((b) => b.id)).toEqual(['m1', 'a0', 'a2', 'sc', 'm2', 'a1'])
    // „Tipp zu Aufgabe 3" → die Aufgabe ist jetzt Nummer 2
    expect(JSON.stringify(sheet.blocks[3])).toContain('Tipp zu Aufgabe 2')
    expect(umgestellt[0]).toContain('direkt hinter M1')
  })

  it('auch im erzeugten Blatt (gemessene Seitenaufteilung)', () => {
    const ws = { sheets: [blatt(blocks())] } as unknown as Parameters<typeof aufgabenZumMaterial>[0]
    expect(aufgabenZumMaterial(ws, () => plaene)).toHaveLength(1)
    expect(ws.sheets[0].blocks[2].id).toBe('a2')
  })

  it('lässt aufbauende Aufgaben stehen und nennt in der Anzeige die Seite', () => {
    const b = blocks()
    ;(b[4] as TaskBlock).instruction = 'Beurteile mithilfe deiner Ergebnisse die Forderungen in M{quelle}.'
    const seiten = seitenJeBaustein(plaene)
    expect(aufgabenNaheAmMaterial(blatt(b), seiten).umgestellt).toEqual([])
    // Anzeige: Nummern aufgelöst
    const anzeige = blatt(b.map((x) => (x.type === 'task' ? { ...x, instruction: x.instruction.replace('M{quelle}', 'M1').replace('M{rede}', 'M2') } : x)))
    const mit = mitSeitenHinweisen(anzeige, seiten)
    expect((mit.blocks[4] as TaskBlock).instruction).toBe('Beurteile mithilfe deiner Ergebnisse die Forderungen in M1 (S. 1).')
    expect((mit.blocks[1] as TaskBlock).instruction).toBe('Nenne drei Forderungen aus M1.')
  })
})

describe('Fehlendes Bild: Block heraus, Aufgaben angepasst', () => {
  it('nimmt den Verweis aus Aufzählungen und Klammern', () => {
    expect(ohneBildVerweis('Vergleiche M{quelle} und M{karikatur}.', 'karikatur')).toBe('Vergleiche M{quelle}.')
    expect(ohneBildVerweis('Vergleiche M{karikatur} und M{quelle}.', 'karikatur')).toBe('Vergleiche M{quelle}.')
    expect(ohneBildVerweis('Erkläre die Lage (M{karikatur}).', 'karikatur')).toBe('Erkläre die Lage.')
    expect(ohneBildVerweis('Beschreibe M{karikatur}.', 'karikatur')).toBe('Beschreibe M{karikatur}.')
  })

  it('streicht Aufgaben, die nur mit dem Bild lösbar sind, samt Hilfe und zählt um', () => {
    const s = blatt([
      text('m1', 'quelle'),
      bild('b1', 'karikatur'),
      task('a1', 'Beschreibe die Karikatur M{karikatur}.'),
      { id: 'h1', type: 'scaffold', variant: 'tipp', title: 'Tipp', items: ['Achte auf die Figuren.'] } as WsBlock,
      task('a2', 'Vergleiche M{quelle} und M{karikatur}.'),
      task('a3', 'Erläutere, wie Aufgabe 3 an Aufgabe 2 anschließt.', {
        parts: [
          { id: 'p1', instruction: 'Deute die Symbole in M{karikatur}.', answer: emptyAnswer('lines'), solution: '' },
          { id: 'p2', instruction: 'Nenne zwei Folgen.', answer: emptyAnswer('lines'), solution: '' }
        ]
      })
    ])
    const { sheet, bericht } = blattOhneFehlendeBilder(s)
    expect(sheet.blocks.map((b) => b.id)).toEqual(['m1', 'a2', 'a3'])
    expect((sheet.blocks[1] as TaskBlock).instruction).toBe('Vergleiche M{quelle}.')
    expect((sheet.blocks[1] as TaskBlock).warnings?.[0]).toContain(BILD_FEHLT)
    const a3 = sheet.blocks[2] as TaskBlock
    expect(a3.parts.map((p) => p.id)).toEqual(['p2'])
    // „Aufgabe 3/2" → neu gezählt (die alte Aufgabe 1 entfiel)
    expect(a3.instruction).toBe('Erläutere, wie Aufgabe 2 an Aufgabe 1 anschließt.')
    expect(bericht).toMatchObject({ entfernt: 1, angepasst: 2, gestrichen: 1 })
    expect(bericht.hinweise.join('\n')).toContain('Aufgabe 1 entfiel')
  })

  it('lässt aus einer Bildreihe nur die gefundenen Bilder stehen', () => {
    const reihe = bild('g1', 'bilder', {
      items: [
        { id: 'i1', caption: 'Plakat', description: 'Wahlplakat', image: { dataUrl: 'x', source: 'wikimedia', credit: 'c' } },
        { id: 'i2', caption: 'Foto', description: 'Foto' }
      ]
    })
    const { sheet } = blattOhneFehlendeBilder(blatt([reihe]))
    expect((sheet.blocks[0] as ImageBlock).items?.map((i) => i.id)).toEqual(['i1'])
  })

  it('zeigt Lernenden keinen Suchauftrag, der Lehrkraft im Editor „Bild fehlt" mit Suchknopf', () => {
    const b = bild('b1', 'karikatur')
    const zeige = (mode: WsContextValue['mode']) =>
      renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx({ mode, actions: { pickImage: () => undefined } }) }, createElement(BlockInhalt, { block: b })))
    expect(zeige('print')).toBe('')
    expect(zeige('measure')).toBe('')
    expect(zeige('key')).toBe('')
    const editor = zeige('edit')
    expect(editor).toContain('Bild fehlt')
    expect(editor).toContain('Bild suchen')
  })

  it('sucht in Geschichte einmal in freien Archiven, bevor das Bild fehlt', async () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Versailles', grade: 9 } as WorksheetMeta
    const log: string[] = []
    const hit = (id: string, source: OnlineImageHit['source']): OnlineImageHit => ({ id, title: 'Karikatur 1919', thumbnail: `https://t/${id}`, url: `https://u/${id}`, creator: 'Museum', license: 'PDM', source })
    const services: ImageServices = {
      searchOpenMoji: async () => [],
      openMojiPng: async () => '',
      search: async (q, source) => (log.push(`${source}:${q}`), source === 'openverse' ? [hit('o1', 'openverse')] : []),
      fetchImage: async (url) => `data:image/jpeg;base64,${url}`,
      normalize: async (d) => d
    }
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      const entries = [...req.user.matchAll(/- id="([^"]+)": (.*)\n {2}Kandidaten: (.*)/g)]
      return { choices: entries.map(([, id, , c]) => ({ id, image: Number(/Bild (\d+)/.exec(c)![1]), fit: 'brauchbar', reason: 'Kernmotiv' })) } as T
    }
    const b = bild('b1', 'karikatur', { search: 'Versailles caricature' })
    const stats = await completeWorksheetImages([b], meta, { ai, services, variants: (q) => [q] })
    expect(log.some((l) => l.startsWith('openverse:'))).toBe(true)
    expect(b.image?.source).toBe('openverse')
    expect(b.warnings?.[0]).toContain('freien Archiv')
    expect(stats.web).toBe(1)
  })
})

describe('Wortspeicher je Fach', () => {
  const meta = (subjectId: string, languageMode: WorksheetMeta['languageMode'] = 'standard'): WorksheetMeta =>
    ({ ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId, languageMode }) as WorksheetMeta
  it('Sachfach auf Deutsch: Fachbegriffe mit kurzer Erklärung, keine Artikel-/Plurallisten', () => {
    const r = scaffoldRules(meta('geschichte'))
    expect(r).toContain('Fachbegriffe mit kurzer Erklärung')
    expect(r).not.toContain('Wortspeicher mit Artikel und Pluralform')
    expect(wortspeicherArt(meta('deutsch'))).toBe('fachbegriffe')
  })
  it('Fremdsprache, DaZ und sprachsensibler Modus: mit Artikel und Plural', () => {
    expect(scaffoldRules(meta('englisch'))).toContain('Wortspeicher mit Artikel und Pluralform')
    expect(wortspeicherArt(meta('daz'))).toBe('grammatisch')
    expect(wortspeicherArt(meta('geschichte', 'sensitive'))).toBe('grammatisch')
    expect(wortspeicherArt(meta('biologie', 'dazA2'))).toBe('grammatisch')
  })
})

describe('Korrekturrand an allen Schreiblinien', () => {
  const raum = (kind: 'lines' | 'grid'): WsBlock => ({ id: 'w1', type: 'workspace', kind, heightMm: 34, label: '' })
  const zeige = (b: WsBlock, correctionMargin: boolean) =>
    renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx({ correctionMargin }) }, createElement(BlockInhalt, { block: b })))
  it('setzt den Rand auch am linierten Schreibraum', () => {
    expect(zeige(raum('lines'), true)).toContain('ws-lines-rand')
    expect(zeige(raum('lines'), false)).not.toContain('ws-lines-rand')
    // Kästchen bleiben ohne Rand (Rechnung, Zeichnung)
    expect(zeige(raum('grid'), true)).not.toContain('ws-lines-rand')
  })
  it('und an den Schreiblinien einer Antwort', () => {
    const html = renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx({ correctionMargin: true }) }, createElement(AnswerView, { answer: emptyAnswer('lines') })))
    expect(html).toContain('ws-lines-rand')
  })
})

describe('Schrittweise freischalten – Vorschlag der KI in der Gliederung', () => {
  it('übernimmt Entscheidung und Grund', () => {
    const o = convertOutline({ title: 'T', learningGoals: [], minutes: 45, teacherNote: '', items: [], schrittweise: true, schrittweiseGrund: 'Aufgaben 1–3 bauen an M1 aufeinander auf.' })
    expect(o.schrittweise).toBe(true)
    expect(o.schrittweiseGrund).toContain('aufeinander')
    expect(convertOutline({ items: [] }).schrittweise).toBeUndefined()
  })
})

function ctx(patch: Partial<WsContextValue> = {}): WsContextValue {
  return {
    mode: 'print',
    taskNumbers: new Map(),
    materialNumbers: new Map(),
    showStars: false,
    taskStyle: { numberStyle: 'circle', showSocialFormIcons: false },
    ...patch
  } as WsContextValue
}
