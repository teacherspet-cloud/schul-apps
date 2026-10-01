import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { presetDesigns } from '../src/shared/design'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, TextBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { suggestOutlineItem } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { OPERATOREN_BLOCK_ID } from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { arbeitsmaterialAblage, quellenangabenErmitteln } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examToWorksheet, operatorenStelle } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Befunde der Lehrkraft zur PDF „Test" (27.09.2026): Operatorenliste direkt unter die Aufgabe (01.10.2026 als Anhang am Ende, seit 01.10.2026 später auf der ersten Aufgabenseite),
 * keine Schreiblinien in der Sek II, vollständige Quellenangabe statt nackter Adresse, und der
 * Zauberstab der Gliederung nimmt einen Änderungswunsch an.
 */

const aufgabe = (instruction: string, kind: 'lines' | 'none' = 'lines'): TaskBlock => ({
  ...(newBlock('task') as TaskBlock),
  id: `t-${instruction.length}`,
  instruction,
  answer: { ...(newBlock('task') as TaskBlock).answer, kind }
})
const text = (): TextBlock => ({ ...(newBlock('text') as TextBlock), id: 'm1', title: 'Kritik', body: 'Ein Text.', source: 'https://a.de' })
const part = (blocks: (TaskBlock | TextBlock)[]): ExamPart =>
  ({
    id: 'p1',
    formatId: 'en-mediation',
    label: 'Mediation',
    competence: 'Sprachmittlung',
    minutes: 60,
    points: 0,
    weight: 100,
    contentShare: 40,
    blocks
  }) as ExamPart
const arbeit = (over: Partial<Exam['meta']>, blocks: (TaskBlock | TextBlock)[]): Exam =>
  ({
    version: 1,
    meta: {
      ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'englisch',
      subjectLabel: 'Englisch',
      topic: 'Macbeth',
      grade: 13,
      courseLevel: 'eA',
      ...over
    },
    parts: [part(blocks)],
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

describe('Klausur: Operatoren unter der Aufgabe, keine Linien in der Sek II', () => {
  /*
   * 01.10.2026: Zwischen Sprachmittlungsaufgabe und M1 wirkte die Liste wie eine Hilfe zur Aufgabe
   * (Befund der Lehrkraft), danach stand sie als Anhang am Ende. Entscheidung der Lehrkraft (später):
   * die ganze Liste auf der ersten Aufgabenseite, kein Anhang mehr – aber nie zwischen Aufgabe und Material.
   */
  it('Sprachmittlung ohne Umbruch: die Liste steht vor dem Teil, nicht zwischen Aufgabe und M1 – kein Anhang', () => {
    const ws = examToWorksheet(arbeit({}, [aufgabe('**Write** an email based on M1.'), text()]))
    const bloecke = ws.sheets[0].blocks
    const ids = bloecke.map((b) => b.id)
    expect(ids).toContain(OPERATOREN_BLOCK_ID)
    expect(ids.indexOf(OPERATOREN_BLOCK_ID)).toBeLessThan(ids.indexOf('part-p1'))
    expect(ids).not.toContain('exam-operatoren-anhang')
    expect(bloecke.some((b) => b.type === 'divider' && /Appendix|Anhang/.test(b.title))).toBe(false)
  })

  it('Material auf eigener Seite: die Liste steht unten auf der Aufgabenseite, vor dem Umbruch', () => {
    const ws = examToWorksheet(arbeit({}, [aufgabe('**Write** an email based on M1.'), { ...text(), pageBreakBefore: true }]))
    const ids = ws.sheets[0].blocks.map((b) => b.id)
    expect(ids.indexOf(OPERATOREN_BLOCK_ID)).toBe(ids.indexOf('m1') - 1)
    expect(ids.indexOf(OPERATOREN_BLOCK_ID)).toBeGreaterThan(ids.indexOf('t-31'))
  })

  it('operatorenStelle: Text vor den Aufgaben → hinter den Aufgaben; ohne Aufgaben → am Ende', () => {
    const d = (id: string): WsBlock => ({ id, type: 'divider', title: id }) as WsBlock
    const t = (id: string): WsBlock => ({ ...(newBlock('task') as TaskBlock), id })
    const m = (id: string): WsBlock => ({ ...text(), id })
    expect(operatorenStelle([d('part-1'), m('m1'), t('a'), t('b'), m('m2'), t('c')])).toBe(4)
    expect(operatorenStelle([d('part-1'), t('a'), d('part-2'), m('m2')])).toBe(2)
    expect(operatorenStelle([d('part-1'), m('m1')])).toBe(2)
  })

  it('ab zwei Operatoren zweispaltig, die Quelle über die ganze Breite', async () => {
    const { kastenZeilen } = await import('../src/renderer/src/modules/arbeitsblatt/render/baustein/hilfen')
    expect(kastenZeilen(['- **a**: x', '- **b**: y', '- **c**: z', 'Source: NI'], 2)).toEqual([[0, 1], [2], [3]])
    expect(kastenZeilen(['- **a**: x', '- **b**: y'], undefined)).toEqual([[0], [1]])
  })

  it('Sek II: Schreibaufgaben bekommen keine Linien, Sek I behält sie', () => {
    const sek2 = examToWorksheet(arbeit({}, [aufgabe('**Write** an email.')]))
    expect((sek2.sheets[0].blocks.find((b) => b.type === 'task') as TaskBlock).answer.kind).toBe('none')
    const sek1 = examToWorksheet(arbeit({ grade: 8, courseLevel: undefined }, [aufgabe('**Write** an email.')]))
    expect((sek1.sheets[0].blocks.find((b) => b.type === 'task') as TaskBlock).answer.kind).toBe('lines')
  })
})

describe('Quellenangabe des Lehrkraft-Materials', () => {
  it('die KI liefert Urheber, Titel, Ort und Datum – die App ergänzt Fundort und Abrufdatum', async () => {
    const calls: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      return { urheber: 'Rudolf Worschech', titel: 'Kritik zu Macbeth', publikationsort: 'epd Film', datum: '15.10.2015' } as T
    }
    const quellen = await quellenangabenErmitteln(
      [
        {
          id: 'q1',
          fileName: 'Kritik zu Macbeth | epd Film',
          kind: 'web',
          url: 'https://www.epd-film.de/filmkritiken/macbeth',
          text: 'Schön ist wüst …',
          bilder: [],
          aktiv: true
        },
        { id: 'q2', fileName: 'Notizen.pdf', kind: 'pdf', text: 'Inhalt', bilder: [], aktiv: true }
      ],
      ai
    )
    expect(calls.length).toBe(1)
    expect(calls[0].schemaName).toBe('material_quellenangabe')
    expect(quellen[0].quellenangabe).toMatch(
      /^Rudolf Worschech, „Kritik zu Macbeth“, epd Film, 15\.10\.2015 Fundort: https:\/\/www\.epd-film\.de\/filmkritiken\/macbeth \(abgerufen am \d{2}\.\d{2}\.\d{4}\)/
    )
    expect(quellen[1].quellenangabe).toBeUndefined()
    // Beim zweiten Mal wird nichts mehr gefragt – die Angabe bleibt an der Quelle
    await quellenangabenErmitteln(quellen, ai)
    expect(calls.length).toBe(1)
    const e = arbeit({ arbeitsmaterial: quellen }, [])
    expect(arbeitsmaterialAblage(e)?.quellenangabe).toContain('Rudolf Worschech')
  })
})

describe('Zauberstab der Gliederung', () => {
  it('gibt den Änderungswunsch der Lehrkraft an die KI weiter', async () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Julikrise', grade: 9 }
    const outline = {
      title: 'Julikrise',
      learningGoals: [],
      items: [
        {
          id: 'i1',
          type: 'task' as const,
          purpose: 'Erkläre die Bündnisse.',
          afb: 'II' as const,
          operator: 'erklären',
          socialForm: 'EA' as const,
          answerKind: 'lines' as const
        }
      ]
    }
    const calls: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      return { purpose: 'Neu', operator: '' } as T
    }
    await suggestOutlineItem({ meta, sources: [] }, buildLearnerProfile(meta), outline as never, 0, ai, 'als Partnerarbeit mit Karte')
    expect(calls[0].user).toContain('ÄNDERUNGSWUNSCH der Lehrkraft (genau umsetzen')
    expect(calls[0].user).toContain('als Partnerarbeit mit Karte')
    expect(calls[0].user).toContain('Bisherige Beschreibung: Erkläre die Bündnisse.')
    await suggestOutlineItem({ meta, sources: [] }, buildLearnerProfile(meta), outline as never, 0, ai)
    expect(calls[1].user).not.toContain('ÄNDERUNGSWUNSCH')
  })
})
