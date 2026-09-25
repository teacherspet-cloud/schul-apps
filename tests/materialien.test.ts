import { describe, expect, it } from 'vitest'
import { neueste, suche, vereinige } from '../src/renderer/src/shell/materialien'

/*
 * Startseite: „Zuletzt bearbeitet" und Suche über die Materialien aller Programme
 * (Wunsch der Lehrkraft, 25.09.2026).
 */
const listen = vereinige({
  tests: [
    {
      id: 't1',
      name: 'Green Line 2 – Unit 3',
      createdAt: '',
      updatedAt: '2026-09-20T10:00:00Z',
      vocabCount: 30,
      includedCount: 20,
      hasTest: false,
      variantCount: 0,
      totalPoints: 0
    }
  ],
  sheets: [
    {
      id: 's1',
      name: 'Photosynthese',
      createdAt: '',
      updatedAt: '2026-09-24T08:00:00Z',
      subjectId: 'biologie',
      subjectLabel: 'Biologie',
      topic: 'Photosynthese',
      grade: 7,
      schoolTypeName: 'Gymnasium',
      sheetCount: 2,
      hasBoard: false
    }
  ],
  kurztests: [
    {
      id: 'k1',
      name: 'Stegreifaufgabe Weimar',
      createdAt: '',
      updatedAt: '2026-09-22T08:00:00Z',
      subjectLabel: 'Geschichte',
      grade: 9,
      thema: 'Weimarer Republik',
      bezeichnung: 'Stegreifaufgabe',
      stateId: 'BY',
      taskCount: 0,
      points: 0,
      minutes: 20,
      varianten: 1
    }
  ],
  grammarTests: [],
  exams: [
    {
      id: 'e1',
      name: '2. Klassenarbeit',
      createdAt: '',
      updatedAt: '2026-09-25T08:00:00Z',
      subjectLabel: 'Englisch',
      grade: 7,
      topic: 'Present Perfect',
      partCount: 3,
      hasTasks: true,
      minutes: 45
    }
  ],
  vokabellisten: [{ id: 'v1', name: 'Wörter Unit 1', updatedAt: '2026-09-21T08:00:00Z', entries: [] }]
})

describe('Materialien der Startseite', () => {
  it('ordnet alle Programme nach dem letzten Bearbeiten', () => {
    expect(neueste(listen, 3).map((m) => m.id)).toEqual(['e1', 's1', 'k1'])
  })

  it('kennzeichnet Entwürfe wie die jeweilige Bibliothek', () => {
    const entwurf = Object.fromEntries(listen.map((m) => [m.id, m.entwurf]))
    expect(entwurf).toEqual({ t1: true, s1: false, k1: true, e1: false, v1: false })
  })

  it('sucht über Name, Thema und Fach, alle Wörter in beliebiger Reihenfolge', () => {
    expect(suche(listen, 'present englisch').map((m) => m.id)).toEqual(['e1'])
    expect(suche(listen, 'WEIMARER')).toHaveLength(1)
    expect(suche(listen, 'klasse 7').map((m) => m.id)).toEqual(['e1', 's1'])
    expect(suche(listen, 'mathematik')).toHaveLength(0)
    expect(suche(listen, '   ')).toHaveLength(0)
  })
})
