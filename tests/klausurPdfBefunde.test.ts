import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { presetDesigns } from '../src/shared/design'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, TextBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { suggestOutlineItem } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { OPERATOREN_ANHANG_ID, OPERATOREN_BLOCK_ID } from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { arbeitsmaterialAblage, quellenangabenErmitteln } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'

/*
 * Befunde der Lehrkraft zur PDF „Test" (27.09.2026): Operatorenliste direkt unter die Aufgabe (seit 01.10.2026 als Anhang am Ende),
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
   * (Befund der Lehrkraft). Jetzt steht sie als eigener Anhang mit Überschrift am Ende der Arbeit.
   */
  it('die Operatorenliste steht als Anhang am Ende der Arbeit – nicht zwischen Aufgabe und Material', () => {
    const ws = examToWorksheet(arbeit({}, [aufgabe('**Write** an email based on M1.'), text()]))
    const bloecke = ws.sheets[0].blocks
    const ids = bloecke.map((b) => b.id)
    expect(ids.slice(-2)).toEqual([OPERATOREN_ANHANG_ID, OPERATOREN_BLOCK_ID])
    expect(ids.indexOf(OPERATOREN_BLOCK_ID)).toBeGreaterThan(ids.indexOf('m1'))
    const anhang = bloecke[bloecke.length - 2]
    expect(anhang.type === 'divider' && anhang.title).toBe('Appendix')
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
