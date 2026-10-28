import { describe, expect, it } from 'vitest'
import { bereitschaft, testWann } from '../src/shared/testVorbereitung'
import { linkRunde, neuerStand, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'

// Testvorbereitung der Lernenden (28.10.2026, abgestimmt mit der Lehrkraft)
describe('Bereitschaft', () => {
  it('sicher voll, im Aufbau halb, Grammatik wie zehn Wörter', () => {
    expect(bereitschaft({ vok: { sicher: 10, aufbau: 10, neu: 0, gesamt: 20 }, gram: [] })).toBeCloseTo(0.75)
    expect(bereitschaft({ vok: null, gram: [{ id: 'g', titel: 'G', sicher: 5, gesamt: 10 }] })).toBeCloseTo(0.5)
    expect(bereitschaft({ vok: null, gram: [] })).toBeNull()
  })
  it('Wann', () => {
    const jetzt = new Date(2026, 9, 28, 10).getTime()
    expect(testWann(new Date(2026, 9, 29, 8).getTime(), jetzt)).toBe('morgen')
    expect(testWann(new Date(2026, 9, 31, 8).getTime(), jetzt)).toBe('in 3 Tagen')
  })
})

describe('Vokabeln für den Test üben', () => {
  const v = (id: string, vorrang?: 'test'): Vokabel => ({ id, term: id, translation: id, ...(vorrang ? { vorrang } : {}) }) as Vokabel
  const jetzt = Date.now()
  it('zuerst Neues des Tests, dann das Unsichere – nie Wörter außerhalb des Tests', () => {
    const liste = [v('a', 'test'), v('b', 'test'), v('c')]
    // a und b schon gesehen, nicht fällig; c außerhalb des Tests
    const st: Record<string, WortStand> = {
      a: { ...neuerStand(), fach: 2, faellig: jetzt + 5 * 864e5, versuche: 3, falsch: 2, zuletzt: jetzt - 864e5 },
      b: { ...neuerStand(), fach: 1, faellig: jetzt + 864e5, versuche: 1, zuletzt: jetzt - 864e5 },
      c: { ...neuerStand(), fach: 1, faellig: jetzt + 864e5, versuche: 1, zuletzt: jetzt - 864e5 }
    }
    const r = linkRunde('test', liste, st, jetzt, 10)
    expect(r?.woerter.map((x) => x.id)).toEqual(['b', 'a'])
    expect(r?.freiwillig).toBe(true)
    const neu = linkRunde('test', [v('n', 'test'), ...liste], st, jetzt, 0)
    expect(neu?.woerter.map((x) => x.id)).toContain('n')
  })
})
