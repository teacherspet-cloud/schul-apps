import { describe, expect, it } from 'vitest'
import { defaultWorksheetName, worksheetStats } from '../src/renderer/src/modules/arbeitsblatt/library'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { presetDesigns } from '../src/shared/design'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'

describe('Arbeitsblatt-Bibliothek', () => {
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
