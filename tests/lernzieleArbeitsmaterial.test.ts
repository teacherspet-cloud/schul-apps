import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { presetDesigns } from '../src/shared/design'
import { generateOutline } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { bereinigeLernziele, lernzieleFormulieren } from '../src/renderer/src/modules/arbeitsblatt/generation/lernziele'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Outline } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { arbeitsmaterialAblage, arbeitsmaterialTeil, partPrompt, textgebunden } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'

/*
 * Zwei Wünsche der Lehrkraft vom 27.09.2026:
 * 1. Lernziele waren Blatt für Blatt dieselben Formeln – sie sollen sich in einer eigenen
 *    Anfrage aus der fertigen Gliederung ergeben, ohne Rückgriff auf frühere Blätter.
 * 2. Klassenarbeit: ein Kasten unter „Aufbau der Arbeit" für Material (Datei oder Webseite),
 *    das in der Arbeit verwendet wird – als Lesetext oder als Grundlage für Schreib- und Mediationsaufgaben.
 */

const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Julikrise 1914', grade: 9 }

const gliederung: Outline = {
  title: 'Wie wurde aus einer Krise ein Krieg?',
  learningGoals: ['Ich kann Quellen analysieren.'],
  minutes: 45,
  teacherNote: '',
  items: [
    { id: 'a', type: 'learningGoals', purpose: 'Lernziele', operator: '', socialForm: 'EA', answerKind: 'none' },
    { id: 'b', type: 'text', purpose: 'Rede Wilhelms II. zum Kriegsbeginn', operator: '', socialForm: 'EA', answerKind: 'none' },
    { id: 'c', type: 'task', purpose: 'Sprachliche Strategien der Rede untersuchen', afb: 'II', operator: 'Analysiere', socialForm: 'PA', answerKind: 'lines' },
    { id: 'd', type: 'selfCheck', purpose: 'Selbsteinschätzung', operator: '', socialForm: 'EA', answerKind: 'none' }
  ]
}

describe('Lernziele aus der Gliederung', () => {
  it('fragt die Lernziele eigens an – aus den geplanten Bausteinen, mit der Richtung der Lehrkraft, ohne frühere Blätter', async () => {
    const calls: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      return {
        learningGoals: [
          '- Ich kann anhand der Rede Wilhelms II. analysieren, wie Verantwortung sprachlich zurückgewiesen wird.',
          'Ich kann Quellen analysieren.'
        ]
      } as T
    }
    const ziele = await lernzieleFormulieren({ ...meta, learningGoals: 'Quellenkritik üben' }, gliederung, ai)
    expect(calls).toHaveLength(1)
    expect(calls[0].schemaName).toBe('lernziele')
    expect(calls[0].user).toContain('1. text: Rede Wilhelms II.')
    expect(calls[0].user).toContain('task – Analysiere (AFB II)')
    expect(calls[0].user).toContain('Richtung der Lehrkraft (nicht wörtlich übernehmen): Quellenkritik üben')
    expect(calls[0].user).not.toMatch(/frühere|vorherige/i)
    expect(calls[0].system).toContain('KEINE allgemeinen Kompetenzformeln')
    // Aufzählungszeichen weg, konkret formulierte Ziele bleiben
    expect(ziele).toEqual([
      'Ich kann anhand der Rede Wilhelms II. analysieren, wie Verantwortung sprachlich zurückgewiesen wird.',
      'Ich kann Quellen analysieren.'
    ])
  })

  it('fällt auf die Ziele der Gliederung zurück, wenn die Anfrage nichts Brauchbares liefert oder scheitert', async () => {
    const leer = async <T>(): Promise<T> => ({ learningGoals: [] }) as T
    expect(await lernzieleFormulieren(meta, gliederung, leer)).toEqual(['Ich kann Quellen analysieren.'])
    const kaputt = async <T>(): Promise<T> => {
      throw new Error('aus')
    }
    expect(await lernzieleFormulieren(meta, gliederung, kaputt)).toEqual(['Ich kann Quellen analysieren.'])
    // Ohne Bausteine keine Anfrage
    const calls: StructuredRequest[] = []
    await lernzieleFormulieren(meta, { ...gliederung, items: [] }, async <T>(req: StructuredRequest): Promise<T> => (calls.push(req), {} as T))
    expect(calls).toHaveLength(0)
  })

  it('bereinigt: Dubletten, leere Formeln, höchstens drei', () => {
    expect(bereinigeLernziele(['Ich kann das Thema verstehen.', 'Ich kann A.', 'ich kann a.', '2. Ich kann B.', 'Ich kann C.', 'Ich kann D.'])).toEqual([
      'Ich kann A.',
      'Ich kann B.',
      'Ich kann C.'
    ])
    expect(bereinigeLernziele(undefined)).toEqual([])
  })

  it('die Gliederung trägt am Ende die neu formulierten Ziele', async () => {
    const calls: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      if (req.schemaName === 'worksheet_outline')
        return { title: 'T', learningGoals: ['Ich kann Quellen analysieren.'], minutes: 45, teacherNote: '', items: gliederung.items } as T
      if (req.schemaName === 'lernziele')
        return { learningGoals: ['Ich kann anhand der Rede erklären, warum der Kaiser den Krieg als Verteidigung darstellt.'] } as T
      return {} as T
    }
    const outline = await generateOutline(meta, profileFromMeta(meta), [], ai, null)
    expect(calls.map((c) => c.schemaName)).toEqual(['worksheet_outline', 'lernziele'])
    expect(outline.learningGoals).toEqual(['Ich kann anhand der Rede erklären, warum der Kaiser den Krieg als Verteidigung darstellt.'])
  })
})

describe('Klassenarbeit: Material für die Arbeit', () => {
  const part = (formatId: string): ExamPart =>
    ({ id: `p-${formatId}`, formatId, label: formatId, competence: 'Lesen', minutes: 20, points: 10, weight: 50 }) as ExamPart
  const exam = (arbeitsmaterial?: Exam['meta']['arbeitsmaterial']): Exam =>
    ({
      version: 1,
      meta: {
        ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'),
        subjectId: 'englisch',
        subjectLabel: 'Englisch',
        topic: 'School trips',
        grade: 8,
        arbeitsmaterial
      },
      parts: [],
      design: presetDesigns()[0],
      createdAt: ''
    }) as unknown as Exam
  const quelle = {
    id: 'q1',
    fileName: 'Artikel.pdf',
    kind: 'pdf' as const,
    text: 'Last year our class travelled to Singapore. The trip …',
    bilder: [],
    aktiv: true
  }

  it('wird bei textgebundenen Teilen wörtlich eingesetzt, bei Schreibteilen als Grundlage genannt', () => {
    const e = exam([quelle, { ...quelle, id: 'q2', fileName: 'Webseite', url: 'https://example.org/trip', kind: 'web', text: 'Second source.' }])
    expect(textgebunden(part('en-reading'))).toBe(true)
    expect(textgebunden(part('en-writing'))).toBe(false)
    const ablage = arbeitsmaterialAblage(e)
    expect(ablage).toMatchObject({
      titel: 'Artikel',
      text: 'Last year our class travelled to Singapore. The trip …',
      quellenangabe: 'Material der Lehrkraft: Artikel.pdf',
      wortlautGeprueft: true
    })
    const lesen = arbeitsmaterialTeil(e, part('en-reading'))
    expect(lesen).toContain('setzt die App als Lesetext dieses Teils wörtlich ein')
    expect(lesen).toContain('--- Webseite (https://example.org/trip) ---')
    const schreiben = arbeitsmaterialTeil(e, part('en-writing'))
    expect(schreiben).toContain('baut auf dem Material auf')
    expect(schreiben).toContain('Second source.')
    // Der Teilauftrag trägt den Abschnitt
    expect(partPrompt(e, part('en-writing'), 1)).toContain('MATERIAL FÜR DIE ARBEIT')
  })

  it('ohne Material oder mit abgewähltem Material ändert sich nichts', () => {
    expect(arbeitsmaterialAblage(exam())).toBeNull()
    expect(arbeitsmaterialTeil(exam(), part('en-reading'))).toBe('')
    expect(arbeitsmaterialAblage(exam([{ ...quelle, aktiv: false }]))).toBeNull()
    expect(partPrompt(exam(), part('en-reading'), 1)).not.toContain('MATERIAL FÜR DIE ARBEIT')
  })
})
