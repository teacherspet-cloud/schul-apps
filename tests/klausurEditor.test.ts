import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { materialBausteine } from '../src/renderer/src/modules/arbeitsblatt/generation/originalmaterial'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, TextBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { arbeitsmaterialAblage, schreibvorgabenRegeln, worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { examStats } from '../src/renderer/src/modules/klassenarbeit/library'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examHeadBlock, examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'

/*
 * Befunde der Lehrkraft vom 27.09.2026 zu Klassenarbeiten und Klausuren:
 * 1. Im 13. Jahrgang standen Formhinweise („Use an appropriate salutation …") und Notizen bei der
 *    Schreibaufgabe – zu viel Hilfe in einer Leistungssituation.
 * 2. Die Quellenangabe stand doppelt („Quelle: Quelle: https://…").
 * 3. Der Kopfkasten war nicht bearbeitbar.
 * 4. Kein Korrektur- und Notizrand.
 * 5. Überthema der übrigen Programme erreichte die Themenbereiche nicht.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const part = (formatId: string, blocks: ExamPart['blocks'] = []): ExamPart =>
  ({ id: `p-${formatId}`, formatId, label: formatId, competence: 'Schreiben', minutes: 45, points: 0, weight: 100, contentShare: 60, blocks }) as ExamPart
const arbeit = (patch: Partial<Exam['meta']> = {}, parts: ExamPart[] = []): Exam =>
  ({
    version: 1,
    meta: {
      ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'englisch',
      subjectLabel: 'Englisch',
      topic: 'Macbeth on film',
      grade: 13,
      courseLevel: 'eA',
      ...patch
    },
    parts,
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

describe('Oberstufe: keine Schreibhilfen', () => {
  it('der Auftrag verbietet Formhinweise und Notizentabellen, in der Sek I nicht', () => {
    expect(schreibvorgabenRegeln(arbeit(), part('en-writing'))).toContain('brief.form und brief.notes bleiben LEER')
    expect(schreibvorgabenRegeln(arbeit({ grade: 8, courseLevel: undefined }), part('en-writing'))).not.toContain('bleiben LEER')
  })

  it('das Blatt der Klausur blendet Formhinweise und Notizen aus – Sek I zeigt sie', async () => {
    const aufgabe: TaskBlock = {
      ...(newBlock('task') as TaskBlock),
      id: 't1',
      instruction: 'Write an email.',
      brief: {
        situation: 'You are …',
        audience: 'A British student',
        textType: 'Email',
        purpose: 'To inform',
        words: 250,
        points: ['Outline how the film …', 'Explain how …'],
        form: ['Use an appropriate salutation and closing.', 'Organise the email in clear paragraphs.'],
        notes: [{ title: 'The film', items: ['dark visuals'], prompts: ['Your view: …'] }],
        criteria: []
      }
    }
    // Mit eingeschalteten Hilfen für Lernende – ohne sie stehen Rahmenzeile und Inhaltspunkte nur im Erwartungshorizont (01.10.2026)
    const oberstufe = arbeit({ lernhilfen: true }, [part('en-writing', [aufgabe])])
    expect(worksheetMetaFor(oberstufe).ohneSchreibhilfen).toBe(true)
    expect(worksheetMetaFor(arbeit({ grade: 8, courseLevel: undefined })).ohneSchreibhilfen).toBe(false)
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }
    const xml = async (e: Exam): Promise<string> => {
      const ws = examToWorksheet(e)
      const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: [ws.sheets[0].id], includeKey: false }, deps))
      return zip.file('word/document.xml')!.async('string')
    }
    const klausur = await xml(oberstufe)
    expect(klausur).toContain('Outline how the film')
    expect(klausur).not.toContain('appropriate salutation')
    expect(klausur).not.toContain('dark visuals')
    const sekI = await xml(arbeit({ grade: 8, courseLevel: undefined, lernhilfen: true }, [part('en-writing', [aufgabe])]))
    expect(sekI).toContain('appropriate salutation')
    // Rahmenzeile „Adressat · Textsorte · Zweck": bearbeitbar und abschaltbar (27.09.2026)
    expect(klausur).toContain('A British student · Email · To inform')
    // Leere Inhaltspunkte erzeugen keinen Aufzählungspunkt (27.09.2026)
    const leer = await xml(arbeit({ lernhilfen: true }, [part('en-writing', [{ ...aufgabe, brief: { ...aufgabe.brief!, points: ['', 'Explain how …', ' '] } }])]))
    expect((leer.match(/<w:numPr>/g) ?? []).length).toBe(1)
    const ohneRahmen = await xml(arbeit({ lernhilfen: true }, [part('en-writing', [{ ...aufgabe, brief: { ...aufgabe.brief!, frameHidden: true } }])]))
    expect(ohneRahmen).not.toContain('A British student · Email')
    expect(ohneRahmen).toContain('Outline how the film')
    // Voreinstellung der Klassenarbeit: keine Hilfen für Lernende auf dem Schülerblatt
    const standard = await xml(arbeit({}, [part('en-writing', [aufgabe])]))
    expect(standard).not.toContain('Outline how the film')
    expect(standard).not.toContain('A British student · Email')
    expect(standard).toContain('Write an email.')
  })
})

describe('Quellenangabe, Kopfkasten, Ränder, Überthema', () => {
  it('schreibt „Quelle:" nicht doppelt', () => {
    const material = {
      titel: 'Filmkritik',
      urheber: '',
      url: 'https://www.epd-film.de/x',
      text: 'Text',
      quellenangabe: 'Quelle: https://www.epd-film.de/x',
      hinweis: '',
      protokoll: [],
      wortlautGeprueft: true
    }
    const text = materialBausteine(material, { subjectId: 'englisch' }, () => 'id').find((b) => b.type === 'text') as TextBlock
    expect(text.source).toBe('https://www.epd-film.de/x')
    const eigenes = arbeitsmaterialAblage(
      arbeit({ arbeitsmaterial: [{ id: 'q', fileName: 'Kritik.pdf', kind: 'pdf', text: 'Inhalt', bilder: [], aktiv: true, url: 'https://a.de/k' }] })
    )
    expect(eigenes?.quellenangabe).toBe('https://a.de/k')
  })

  it('der Kopfkasten nimmt einen eigenen Wortlaut an und wird sonst berechnet', () => {
    const berechnet = examHeadBlock(arbeit({ minutes: 90 }))
    expect(berechnet?.type === 'infoBox' && berechnet.body).toContain('90')
    const eigen = examHeadBlock(arbeit({ minutes: 90, kopfText: '- Eigener Hinweis' }))
    expect(eigen?.type === 'infoBox' && eigen.body).toBe('- Eigener Hinweis')
  })

  it('Korrektur- und Notizrand erreichen das Blatt', () => {
    const meta = worksheetMetaFor(arbeit({ correctionMargin: true, notesMargin: true }))
    expect(meta.correctionMargin).toBe(true)
    expect(meta.notesMargin).toBe(true)
    expect(worksheetMetaFor(arbeit()).notesMargin).toBeUndefined()
  })

  it('die Bibliothek der Klassenarbeit gibt das Überthema weiter', () => {
    expect(examStats(arbeit({ ueberthema: 'Shakespeare' })).ueberthema).toBe('Shakespeare')
    expect(examStats(arbeit({ ueberthema: 'Shakespeare', ueberthemaAus: true })).ueberthema).toBeUndefined()
    expect(examStats(arbeit()).ueberthema).toBeUndefined()
  })
})
