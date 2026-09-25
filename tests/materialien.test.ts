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

describe('Vokabeltests mit Fach und Jahrgang (Paket 7)', () => {
  const mitFach = vereinige({
    tests: [
      {
        id: 't2',
        name: 'Unit 3',
        createdAt: '',
        updatedAt: '2026-09-25T10:00:00Z',
        vocabCount: 12,
        includedCount: 10,
        hasTest: true,
        variantCount: 2,
        totalPoints: 20,
        language: 'fr',
        subjectLabel: 'Französisch',
        grade: 8
      }
    ],
    sheets: [],
    kurztests: [],
    grammarTests: [],
    exams: [],
    vokabellisten: [{ id: 'v2', name: 'Wörter Leçon 2', updatedAt: '2026-09-21T08:00:00Z', language: 'fr', entries: [] }]
  })
  it('die Suche findet Tests und Listen über Fach und Klasse', () => {
    expect(suche(mitFach, 'französisch klasse 8').map((m) => m.id)).toEqual(['t2'])
    expect(suche(mitFach, 'französisch').map((m) => m.id)).toEqual(['t2', 'v2'])
    expect(mitFach.find((m) => m.id === 't2')?.detail).toBe('Französisch · Klasse 8 · 12 Vokabeln')
  })
  it('ältere Tests ohne diese Angaben bleiben wie bisher', () => {
    expect(listen.find((m) => m.id === 't1')?.detail).toBe('30 Vokabeln · noch kein Test')
  })
})
