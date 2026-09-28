import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'

/*
 * Befund der Lehrkraft vom 28.09.2026 (PDF „Mediation exam 4" aus Word): Das Kopfband reichte nur
 * über gut die Hälfte der Seite, „Klass e:" und „Datu m:" brachen um und standen deutsch in einer
 * Englischarbeit, die Situation stand hinter dem Auftrag, und „Seite 1 / 7" zählte das ganze
 * Dokument. Ursache der Breiten: Tabellen ohne Spaltenraster – Word setzt dann Standardbreiten.
 */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

async function word(): Promise<{ kopf: string; fuss: string; text: string }> {
  const aufgabe: TaskBlock = {
    ...(newBlock('task') as TaskBlock),
    id: 't1',
    instruction: '**Write** an email based on M1.',
    brief: { situation: 'You help organise a film evening.', audience: '', textType: '', purpose: '', words: 0, points: [], criteria: [] }
  }
  const part = {
    id: 'p1',
    formatId: 'en-mediation',
    label: 'Mediation',
    competence: 'Sprachmittlung',
    minutes: 60,
    points: 0,
    weight: 100,
    contentShare: 40,
    blocks: [aufgabe]
  } as ExamPart
  const design = presetDesigns().find((d) => d.header.layout === 'colorBand') ?? presetDesigns()[0]
  const exam = {
    version: 1,
    meta: {
      ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'englisch',
      subjectLabel: 'Englisch',
      topic: 'Macbeth',
      grade: 13,
      courseLevel: 'eA'
    },
    parts: [part],
    design,
    createdAt: ''
  } as unknown as Exam
  const ws = examToWorksheet(exam)
  const deps = {
    logo: PNG,
    schoolName: 'Gymnasium Wesermünde',
    sizer: async () => ({ width: 10, height: 10 }),
    raster: async () => PNG,
    sidebar: async () => PNG
  }
  const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: [ws.sheets[0].id], includeKey: false }, deps))
  const namen = Object.keys(zip.files)
  const lese = async (muster: RegExp): Promise<string> =>
    (await Promise.all(namen.filter((n) => muster.test(n)).map((n) => zip.file(n)!.async('string')))).join('\n')
  return { kopf: await lese(/^word\/header\d*\.xml$/), fuss: await lese(/^word\/footer\d*\.xml$/), text: await zip.file('word/document.xml')!.async('string') }
}

describe('Word-Kopf einer Englischarbeit', () => {
  it('Kopfband und Namenszeile haben ein Spaltenraster über die ganze Breite', async () => {
    const { kopf } = await word()
    const tabellen = [...kopf.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => m[0])
    expect(tabellen.length).toBeGreaterThanOrEqual(2)
    for (const t of tabellen) {
      const breite = Number(/<w:tblW [^>]*w:w="(\d+)"/.exec(t)?.[1])
      const raster = [...t.matchAll(/<w:gridCol w:w="(\d+)"/g)].reduce((a, m) => a + Number(m[1]), 0)
      expect(Math.abs(raster - breite), `Raster ${raster} ≠ Tabelle ${breite}`).toBeLessThan(20)
    }
  })

  it('beschriftet in der Sprache der Arbeit und zählt die Seiten des Blattes', async () => {
    const { kopf, fuss } = await word()
    expect(kopf).toContain('Class:')
    expect(kopf).toContain('Date:')
    expect(kopf).not.toContain('Klasse:')
    expect(kopf).toContain('Class 13')
    expect(fuss).toContain('Page ')
    expect(fuss).toContain('SECTIONPAGES')
  })

  it('stellt die Situation vor den Auftrag', async () => {
    const { text } = await word()
    expect(text.indexOf('You help organise')).toBeGreaterThan(-1)
    expect(text.indexOf('You help organise')).toBeLessThan(text.indexOf('an email based on M1'))
  })
})
