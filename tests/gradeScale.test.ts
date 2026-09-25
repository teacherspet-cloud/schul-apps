import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  gradeBoundaries,
  gradeForPoints,
  gradeScaleLine,
  gradeScaleRows,
  normalizeThresholds,
  roundHalfUp
} from '../src/renderer/src/shared/gradeScale'

describe('Runden', () => {
  it('rundet ab ,5 aufwärts', () => {
    // Die Vorgabe der Lehrkraft: 14,49 = 14 · 14,5 = 15
    expect(roundHalfUp(14.49)).toBe(14)
    expect(roundHalfUp(14.5)).toBe(15)
    expect(roundHalfUp(14.51)).toBe(15)
    expect(roundHalfUp(0)).toBe(0)
  })

  it('lässt sich von Fließkommaresten nicht täuschen', () => {
    // 0,78 × 50 ergibt in Gleitkomma 39,000000000000004
    expect(roundHalfUp(0.78 * 50)).toBe(39)
    // Ein Rest knapp unter ,5 darf nicht aufrunden
    expect(roundHalfUp(4.4999999)).toBe(4)
  })
})

describe('Voreingestellter Schlüssel', () => {
  it('entspricht der Vorgabe der Lehrkraft', () => {
    expect(DEFAULT_THRESHOLDS).toEqual([91, 78, 64, 50, 25, 0])
  })

  it('rechnet die Prozente in Punkte um', () => {
    // 20 Punkte: 91 % = 18,2 → 18 · 50 % = 10 · 25 % = 5
    const b = gradeBoundaries(20)
    expect(b.map((x) => x.fromPoints)).toEqual([18, 16, 13, 10, 5, 0])
  })

  it('rundet die Schwelle bei krummen Punktzahlen kaufmännisch', () => {
    // 21 Punkte: 50 % = 10,5 → 11
    expect(gradeBoundaries(21)[3].fromPoints).toBe(11)
    // 91 % von 21 = 19,11 → 19
    expect(gradeBoundaries(21)[0].fromPoints).toBe(19)
  })

  it('gibt zu jeder Punktzahl eine Note', () => {
    expect(gradeForPoints(20, 20).grade).toBe(1)
    expect(gradeForPoints(10, 20).grade).toBe(4)
    expect(gradeForPoints(0, 20).grade).toBe(6)
  })
})

describe('Eigene Schwellen', () => {
  it('übernimmt gesetzte Werte', () => {
    expect(gradeBoundaries(100, [95, 80, 65, 50, 25, 0])[0].fromPoints).toBe(95)
  })

  it('erzwingt eine absteigende Reihenfolge', () => {
    // Eine bessere Note darf nie eine niedrigere Schwelle haben als eine schlechtere
    const fixed = normalizeThresholds([50, 80, 65, 40, 25, 0])
    expect(fixed).toEqual([50, 50, 50, 40, 25, 0])
  })

  it('setzt die Sechs immer auf null, damit keine Punktzahl ohne Note bleibt', () => {
    expect(normalizeThresholds([91, 78, 64, 50, 25, 10])[5]).toBe(0)
  })

  it('fällt bei unbrauchbaren Angaben auf die Voreinstellung zurück', () => {
    expect(normalizeThresholds([])).toEqual(DEFAULT_THRESHOLDS)
    expect(normalizeThresholds([1, 2, 3])).toEqual(DEFAULT_THRESHOLDS)
    expect(normalizeThresholds([NaN, 78, 64, 50, 25, 0])).toEqual(DEFAULT_THRESHOLDS)
  })
})

describe('Darstellung', () => {
  it('schreibt eine Zeile ohne die Sechs', () => {
    const line = gradeScaleLine(20)
    expect(line).toContain('1 ab 18')
    expect(line).not.toContain('6 ab')
  })

  it('gibt für das Lösungsblatt Spannen aus', () => {
    const rows = gradeScaleRows(20)
    expect(rows[0].grade).toContain('1')
    expect(rows[0].range).toBe('18 – 20')
    expect(rows[0].percent).toBe('ab 91 %')
    expect(rows[5].range).toBe('0 – 4')
  })

  it('verträgt sehr kleine Punktzahlen ohne unsinnige Spannen', () => {
    for (const row of gradeScaleRows(3)) expect(row.range).not.toContain('-1')
  })
})
