import { describe, expect, it } from 'vitest'
import type { SavedWorksheetMeta } from '../src/shared/types'
import { buildFolders, folderOf } from '../src/renderer/src/modules/arbeitsblatt/steps/WorksheetLibrary'
import { defaultWorksheetName, worksheetStats } from '../src/renderer/src/modules/arbeitsblatt/library'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { presetDesigns } from '../src/shared/design'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const sheet = (patch: Partial<SavedWorksheetMeta>): SavedWorksheetMeta => ({
  id: Math.random().toString(36).slice(2),
  name: 'Blatt',
  subjectId: 'biologie',
  subjectLabel: 'Biologie',
  topic: 'Zellen',
  grade: 7,
  schoolTypeName: 'Gymnasium',
  sheetCount: 1,
  hasBoard: false,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  ...patch
})

describe('Arbeitsblatt-Bibliothek', () => {
  it('sortiert Jahrgangsordner nach Zahl und Themenordner alphabetisch', () => {
    const sheets = [sheet({ grade: 10, topic: 'Vulkane' }), sheet({ grade: 7, topic: 'Atmung' }), sheet({ grade: 9, topic: 'Ökosysteme' })]
    expect(buildFolders(sheets, 'grade').map((f) => f.name)).toEqual(['Klasse 7', 'Klasse 9', 'Klasse 10'])
    expect(buildFolders(sheets, 'topic').map((f) => f.name)).toEqual(['Atmung', 'Ökosysteme', 'Vulkane'])
  })

  it('legt Blätter mit gleichem Thema in einen Ordner, neuestes zuerst', () => {
    const folders = buildFolders(
      [
        sheet({ topic: 'Zellen', name: 'alt', updatedAt: '2026-08-01T10:00:00.000Z' }),
        sheet({ topic: 'Zellen', name: 'neu', updatedAt: '2026-09-10T10:00:00.000Z' }),
        sheet({ topic: 'Blut', name: 'anderes' })
      ],
      'topic'
    )
    expect(folders.map((f) => f.name)).toEqual(['Blut', 'Zellen'])
    expect(folders[1].sheets.map((s) => s.name)).toEqual(['neu', 'alt'])
    expect(folderOf(sheet({ topic: '' }), 'topic')).toBe('Ohne Thema')
  })

  it('merkt sich Fach, Jahrgang, Thema und Tafelbild für die Ordner', () => {
    const ws: Worksheet = {
      version: 1,
      meta: {
        ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
        subjectId: 'erdkunde',
        subjectLabel: 'Erdkunde',
        topic: ' Vulkane ',
        title: 'Feuerberge',
        grade: 7
      },
      design: presetDesigns()[0],
      outline: null,
      sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks: [] }],
      sources: [],
      createdAt: '',
      board: { title: 'T', layout: 'flow', sections: [], conclusion: '', steps: [] }
    }
    expect(worksheetStats(ws)).toMatchObject({ subjectId: 'erdkunde', topic: 'Vulkane', grade: 7, sheetCount: 1, hasBoard: true })
    expect(defaultWorksheetName(ws)).toBe('Feuerberge')
  })
})
