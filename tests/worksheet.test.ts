import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { presetDesigns } from '../src/shared/design'
import { convertAnswer } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { generateOutline, generateWorksheet, localChecks } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { paginate } from '../src/renderer/src/modules/arbeitsblatt/render/paginate'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Sheet, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'

const emptyAnswer = {
  kind: 'lines',
  count: 3,
  heightMm: 0,
  gapText: '',
  left: [],
  right: [],
  pairs: [],
  options: [],
  correct: [],
  statements: [],
  items: [],
  headers: [],
  rows: [],
  solutionRows: [],
  labels: []
}
const flat = (patch: Record<string, unknown>) => ({
  outlineIndex: 0,
  type: 'task',
  stars: 0,
  title: '',
  body: '',
  variant: '',
  items: [],
  lineNumbers: false,
  source: '',
  glossary: [],
  imageDescription: '',
  sourceImageIndex: -1,
  instruction: '',
  operator: '',
  afb: '',
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points: 0,
  solution: '',
  answer: emptyAnswer,
  parts: [],
  headers: [],
  rows: [],
  heightMm: 0,
  ...patch
})

function mockAi(calls: StructuredRequest[]) {
  return async <T>(req: StructuredRequest): Promise<T> => {
    calls.push(req)
    const level = /Diese Fassung ist (★+)/.exec(req.user)?.[1]?.length ?? 0
    const responses: Record<string, unknown> = {
      worksheet_outline: {
        title: 'Der Igel',
        learningGoals: ['Ich kann beschreiben, wie der Igel überwintert.'],
        minutes: 30,
        teacherNote: '',
        items: [
          { type: 'learningGoals', purpose: 'Lernziele', afb: '', operator: '', socialForm: 'EA', stars: 0, answerKind: 'none' },
          { type: 'text', purpose: 'Sachtext Winterschlaf', afb: '', operator: '', socialForm: 'EA', stars: 0, answerKind: 'none' },
          { type: 'task', purpose: 'Informationen entnehmen', afb: 'I', operator: 'nennen', socialForm: 'EA', stars: 0, answerKind: 'lines' },
          { type: 'task', purpose: 'Winterschlaf erklären', afb: 'II', operator: 'erklären', socialForm: 'PA', stars: 0, answerKind: 'gapText' }
        ]
      },
      worksheet: {
        blocks: [
          flat({ type: 'learningGoals', title: 'Das lernst du', items: ['Ich kann den Winterschlaf beschreiben.'] }),
          flat({
            outlineIndex: 1,
            type: 'text',
            title: 'Der Igel im Winter',
            body: 'Der Igel schläft im Winter.\n\nEr frisst vorher viel.',
            lineNumbers: true
          }),
          flat({ outlineIndex: 2, instruction: '**Nenne** zwei Dinge, die der Igel frisst.', operator: 'nennen', afb: 'I', solution: 'Käfer, Würmer' }),
          flat({
            outlineIndex: 3,
            instruction: '**Erkläre** den Winterschlaf.',
            operator: 'erklären',
            afb: 'II',
            socialForm: 'PA',
            solution: 'siehe Lücken',
            answer: { ...emptyAnswer, kind: 'gapText', gapText: 'Im Winter gibt es kaum [[Nahrung]].' }
          }),
          ...(level === 1
            ? [flat({ outlineIndex: -1, type: 'scaffold', variant: 'wortspeicher', title: 'Wortspeicher', items: ['die Nahrung', 'der Käfer'] })]
            : [])
        ]
      },
      worksheet_review: {
        problems: [
          { blockNumber: 3, severity: 'hoch', problem: 'Lösung unvollständig.' },
          { blockNumber: 2, severity: 'mittel', problem: 'Quelle ergänzen.' }
        ]
      },
      worksheet_block: {
        block: flat({ instruction: '**Nenne** zwei Nahrungsmittel des Igels.', operator: 'nennen', afb: 'I', solution: 'Käfer, Würmer, Schnecken' })
      }
    }
    if (!(req.schemaName in responses)) throw new Error(`Keine Mock-Antwort für ${req.schemaName}`)
    return responses[req.schemaName] as T
  }
}

function worksheet(patch: Partial<Worksheet['meta']> = {}): Worksheet {
  return {
    version: 1,
    meta: {
      ...defaultMeta('NI', 'grundschule', 'Grundschule'),
      subjectId: 'sachunterricht',
      subjectLabel: 'Sachunterricht',
      topic: 'Igel',
      grade: 3,
      ...patch
    },
    design: presetDesigns()[0],
    outline: null,
    sheets: [],
    sources: [],
    createdAt: ''
  }
}

describe('Seitenumbruch', () => {
  it('verteilt Bausteine und teilt lange Texte an Absätzen', () => {
    const pages = paginate(
      [
        { id: 'a', height: 300 },
        { id: 'text', height: 900, headHeight: 40, units: [200, 200, 200, 200, 60], unitLines: [8, 8, 8, 8, 2] },
        { id: 'b', height: 300 }
      ],
      1000,
      1100
    )
    expect(pages).toHaveLength(2)
    expect(pages[0].items).toEqual([{ id: 'a' }, { id: 'text', from: 0, to: 3, lineStart: 0, lineCount: 24, continued: false }])
    expect(pages[1].items[0]).toEqual({ id: 'text', from: 3, to: 5, lineStart: 24, lineCount: 10, continued: true })
    expect(pages[1].items[1]).toEqual({ id: 'b' })
  })

  it('Material bleibt zusammen, ohne eine fast leere Seite zu hinterlassen', () => {
    const text = { id: 'text', height: 700, headHeight: 40, units: [165, 165, 165, 165], unitLines: [7, 7, 7, 7], keepTogether: true }
    // Beginnt in der unteren Seitenhälfte → ganz auf die nächste Seite
    const low = paginate([{ id: 'a', height: 700 }, text], 1000, 1000)
    expect(low.map((p) => p.items.map((i) => i.id))).toEqual([['a'], ['text']])
    expect(low[1].items[0].continued).toBeFalsy()
    // Beginnt oben auf der Seite → wird geteilt statt die Seite fast leer zu lassen
    const high = paginate(
      [
        { id: 'a', height: 150 },
        { ...text, height: 1000, units: [240, 240, 240, 240] }
      ],
      1000,
      1000
    )
    expect(high[0].items.map((i) => i.id)).toEqual(['a', 'text'])
    expect(high[1].items[0]).toMatchObject({ id: 'text', continued: true })
  })

  it('Überschriften bleiben beim folgenden Baustein, zu große Bausteine werden markiert', () => {
    const pages = paginate(
      [
        { id: 'x', height: 900 },
        { id: 'h', height: 50, keepWithNext: true },
        { id: 'big', height: 1500 }
      ],
      1000,
      1000
    )
    expect(pages.map((p) => p.items.map((i) => i.id))).toEqual([['x'], ['h'], ['big']])
    expect(pages[2].overflow).toBe(true)
  })
})

describe('Antworten übernehmen', () => {
  it('mischt Zuordnungen und Auswahlantworten, Lösungen bleiben korrekt', () => {
    const rng = createRng(7)
    const m = convertAnswer(
      { ...emptyAnswer, kind: 'matching', left: ['Igel', 'Maus', 'Eule'], right: ['Stacheln', 'Schwanz', 'Federn', 'Flossen'], pairs: [0, 1, 2] },
      rng
    )
    expect(m.left.map((l, i) => `${l}-${m.right[m.pairs[i]]}`)).toEqual(['Igel-Stacheln', 'Maus-Schwanz', 'Eule-Federn'])
    const mc = convertAnswer({ ...emptyAnswer, kind: 'multipleChoice', options: ['a', 'b', 'c', 'd'], correct: [2] }, rng)
    expect(mc.options[mc.correct[0]]).toBe('c')
    const o = convertAnswer({ ...emptyAnswer, kind: 'ordering', items: ['1', '2', '3'] }, rng)
    expect(o.displayOrder).not.toEqual([0, 1, 2])
  })
})

describe('Arbeitsblatt mit simulierter KI', () => {
  it('Gliederung nutzt das Lerngruppen-Profil', async () => {
    const calls: StructuredRequest[] = []
    const ws = worksheet()
    const outline = await generateOutline(ws.meta, profileFromMeta(ws.meta), [], mockAi(calls))
    expect(outline.items).toHaveLength(4)
    expect(outline.items[3]).toMatchObject({ afb: 'II', operator: 'erklären', socialForm: 'PA', answerKind: 'gapText' })
    expect(calls[0].system).toContain('Klasse 3, Grundschule in Niedersachsen')
    expect(calls[0].system).toContain('Zitiere keine Lehrplanstellen')
    expect(calls[0].system).toContain('Handlungsverben')
  })

  it('erzeugt getrennte Niveaufassungen, korrigiert schwere Probleme und prüft lokal', async () => {
    const calls: StructuredRequest[] = []
    const base = worksheet({ differentiation: { levels: 2, mode: 'separate' } })
    const profile = profileFromMeta(base.meta)
    base.outline = await generateOutline(base.meta, profile, [], mockAi(calls))
    const result = await generateWorksheet(base, profile, { ai: mockAi(calls), review: true })

    expect(result.sheets.map((s) => s.stars)).toEqual([1, 2])
    expect(calls.filter((c) => c.schemaName === 'worksheet').map((c) => /Diese Fassung ist (★+)/.exec(c.user)?.[1])).toEqual(['★', '★★'])
    const easy = result.sheets[0]
    // Baustein 3 wurde nach der Prüfung neu erzeugt
    const task = easy.blocks[2]
    expect(task.type === 'task' && task.solution).toBe('Käfer, Würmer, Schnecken')
    // mittlerer Hinweis bleibt als Warnung sichtbar
    expect(easy.blocks[1].warnings?.join(' ')).toContain('Quelle ergänzen')
    // Niveau ★ hat einen Wortspeicher, ★★ nicht → Warnung nur bei fehlenden Hilfen in ★
    expect(easy.blocks.some((b) => b.type === 'scaffold')).toBe(true)
    // Lückentext bleibt erhalten
    const gap = easy.blocks[3]
    expect(gap.type === 'task' && gap.answer.gapText).toContain('[[Nahrung]]')
  })

  it('lokale Prüfung meldet zu schwere Operatoren und fehlende Lösungen', () => {
    const ws = worksheet()
    const profile = profileFromMeta(ws.meta)
    const sheet: Sheet = {
      id: 's',
      label: 'x',
      stars: 1 as const,
      blocks: [
        {
          id: 't',
          type: 'task' as const,
          instruction: '**Erörtere** die Haltung von Igeln.',
          operator: 'erörtern',
          afb: 'III' as const,
          afbReason: '',
          socialForm: 'EA' as const,
          answer: convertAnswer(emptyAnswer, createRng(1)),
          parts: [],
          solution: '',
          points: 0,
          minutes: 5
        }
      ]
    }
    const sheetWarnings = localChecks(sheet, profile)
    expect(sheet.blocks[0].warnings!.join(' ')).toContain('Erörtern'.toLowerCase().slice(0, 3))
    expect(sheet.blocks[0].warnings!.join(' ')).toContain('Lösung fehlt')
    expect(sheetWarnings.map((w) => w.message).join(' ')).toContain('keine Hilfen')
  })
})

describe('Gleichmäßige Verteilung auf genau N Seiten', () => {
  it('verteilt Blöcke gleichmäßig und meldet zu viel Inhalt', async () => {
    const { paginateSpread } = await import('../src/renderer/src/shared/render/paginate')
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, height: 100 }))
    const three = paginateSpread(items, 1000, 1000, 3)!
    expect(three.map((p) => p.items.length)).toEqual([2, 2, 2])
    expect(paginateSpread(items, 250, 250, 2)).toBeNull()
  })
})

describe('Sparmodus Arbeitsblatt', () => {
  it('formuliert jede Niveaustufe in genau einer Anfrage aus, ohne Prüfrunde', async () => {
    const calls: StructuredRequest[] = []
    const base = worksheet({ differentiation: { levels: 2, mode: 'separate' } })
    const profile = profileFromMeta(base.meta)
    base.outline = await generateOutline(base.meta, profile, [], mockAi(calls))
    const result = await generateWorksheet(base, profile, { ai: mockAi(calls), review: true, combined: true })
    expect(result.sheets.map((s) => s.stars)).toEqual([1, 2])
    expect(result.sheets.every((s) => s.blocks.length >= 4)).toBe(true)
    const names = calls.map((c) => c.schemaName)
    expect(names.filter((n) => n === 'worksheet')).toHaveLength(2)
    expect(names).not.toContain('worksheet_review')
    expect(names).not.toContain('worksheet_block')
  })
})

describe('Entwürfe je Baustein', () => {
  it('hängt KI-Überarbeitungen als Entwurf an und wechselt ohne Verlust eigener Änderungen', async () => {
    const { addVersion, switchVersion, versionInfo } = await import('../src/renderer/src/modules/arbeitsblatt/model/versions')
    const original = { id: 'b1', type: 'text', title: 'Original', body: 'A', lineNumbers: false, source: '', glossary: [] } as const
    const v2 = addVersion({ ...original, body: 'A (von Hand geändert)' } as never, { ...original, id: 'neu', body: 'B' } as never)
    expect(v2.id).toBe('b1')
    expect(versionInfo(v2)).toEqual({ count: 2, current: 2 })
    expect((v2 as { body: string }).body).toBe('B')
    const back = switchVersion(v2, 0)
    expect((back as { body: string }).body).toBe('A (von Hand geändert)')
    expect(versionInfo(back)).toEqual({ count: 2, current: 1 })
    const again = switchVersion({ ...(back as object), body: 'A2' } as never, 1)
    expect((again as { body: string }).body).toBe('B')
    expect((switchVersion(again, 0) as { body: string }).body).toBe('A2')
  })
})

describe('Tafelbild', () => {
  it('vergleicht die Aufgaben aller Niveaustufen und liefert ein bereinigtes Tafelbild', async () => {
    const { generateBoard } = await import('../src/renderer/src/modules/arbeitsblatt/generation/board')
    const calls: StructuredRequest[] = []
    const base = worksheet({ differentiation: { levels: 2, mode: 'separate' } })
    const profile = profileFromMeta(base.meta)
    base.outline = await generateOutline(base.meta, profile, [], mockAi(calls))
    const ws = await generateWorksheet(base, profile, { ai: mockAi(calls), review: false, combined: true })
    let request: StructuredRequest | null = null
    const board = await generateBoard(ws, profile, async <T>(req: StructuredRequest) => {
      request = req
      return {
        title: 'Wie überwintert der Igel?',
        layout: 'unbekannt',
        sections: [
          { heading: 'Nahrung', points: [' Käfer ', '', 'Würmer'], fromTasks: 'Aufgabe 1' },
          { heading: '', points: [], fromTasks: '' },
          { heading: 'Winterschlaf', points: ['wenig Nahrung → Energie sparen'], fromTasks: 'Aufgabe 2' }
        ],
        conclusion: 'Der Igel hält Winterschlaf, weil es im Winter kaum Nahrung gibt.',
        steps: [{ phase: 'Aufgabe 1 vergleichen', impulse: 'Was frisst der Igel?', expected: 'Käfer, Würmer' }]
      } as T
    })
    expect(request!.schemaName).toBe('worksheet_board')
    expect(request!.user).toContain('Aufgabe 1:')
    expect(request!.user).toContain('Aufgabe 2:')
    expect(request!.user).toContain('=== Fassung')
    expect(request!.user).toContain('(★★★)')
    expect(board.layout).toBe('columns')
    expect(board.sections).toHaveLength(2)
    expect(board.sections[0].points).toEqual(['Käfer', 'Würmer'])
    expect(board.steps).toHaveLength(1)
  })
})

describe('Sparmodus prüft trotzdem auf Brauchbarkeit', () => {
  /** KI, die ein Blatt mit einem Verweis auf ein Material liefert, das es nicht gibt. */
  const brokenAi =
    (calls: StructuredRequest[]) =>
    async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      // Die Nachbesserung eines einzelnen Bausteins schlägt fehl – der Befund bleibt als Hinweis
      if (req.schemaName === 'worksheet_block') throw new Error('nicht verfügbar')
      return {
        blocks: [
          flat({ type: 'text', title: 'Der Igel im Winter', body: 'Der Igel schläft im Winter.', lineNumbers: false }),
          flat({ instruction: '**Nenne** anhand von M3 zwei Dinge.', operator: 'nennen', afb: 'I', solution: 'Käfer' })
        ]
      } as T
    }

  it('meldet im Sparmodus einen Verweis auf ein Material, das es nicht gibt', async () => {
    // Der Sparmodus spart die KI-PRÜFRUNDE – nicht die Prüfung auf Brauchbarkeit.
    // Ein Blatt mit totem Materialverweis spart kein Kontingent, es kostet Unterrichtszeit.
    const calls: StructuredRequest[] = []
    const ws = worksheet()
    const profile = profileFromMeta(ws.meta)
    ws.outline = await generateOutline(ws.meta, profile, [], mockAi([]))
    const result = await generateWorksheet(ws, profile, { ai: brokenAi(calls), review: false, combined: true })
    const warnings = result.sheets[0].blocks.flatMap((b) => b.warnings ?? []).join(' ')
    expect(warnings).toContain('M3')
    // Der Befund muss die didaktische Prüfung überleben – sie räumt nur ihre eigenen Hinweise weg
    expect(warnings).toContain('[Vollständigkeit]')
  })

  it('kostet keine zusätzliche Anfrage, wenn das Blatt in Ordnung ist', async () => {
    const calls: StructuredRequest[] = []
    const ws = worksheet()
    const profile = profileFromMeta(ws.meta)
    ws.outline = await generateOutline(ws.meta, profile, [], mockAi([]))
    await generateWorksheet(ws, profile, { ai: mockAi(calls), review: false, combined: true })
    // Genau eine Anfrage je Niveaufassung – keine Nachbesserung ohne Befund
    expect(calls.filter((c) => c.schemaName === 'worksheet')).toHaveLength(1)
    expect(calls.filter((c) => c.schemaName === 'worksheet_block')).toHaveLength(0)
  })
})
