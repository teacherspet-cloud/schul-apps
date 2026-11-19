// Worterklärungen bleiben bei ihren Zeilen (19.11.2026, Befund „Welcome to my home!": Erklärungen allein auf Seite 2)
import { describe, expect, it } from 'vitest'
import { bindeWorterklaerungen, paginate, VERDICHTEN_MIN } from '../src/renderer/src/shared/render/paginate'

// 15 Textzeilen à 22 px, Ziffern in Zeile 12 (Index 11), dann die Worterklärungen (50 px) samt Wortzahl (20 px Fuß)
const zeilen = Array.from({ length: 15 }, () => 22)
const units = [...zeilen, 50]
const hatZiffer = units.map((_, k) => k === 11)

describe('Worterklärungen binden', () => {
  it('bindet die Zeilen ab der ersten Ziffer bis zu den Erklärungen', () => {
    const g = bindeWorterklaerungen(units, hatZiffer, [], 1000)
    expect(g.map((x, k) => (x ? k : -1)).filter((k) => k >= 0)).toEqual([11, 12, 13, 14])
  })

  it('ohne Ziffer und bei langer Bindung: höchstens eine halbe Seite, mindestens die letzte Zeile', () => {
    expect(bindeWorterklaerungen(units, units.map(() => false), [], 1000).filter(Boolean).length).toBe(1)
    const frueh = units.map((_, k) => k === 1)
    const g = bindeWorterklaerungen(units, frueh, [], 200)
    const von = g.findIndex(Boolean)
    expect(units.slice(von).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100)
    expect(g[units.length - 2]).toBe(true)
  })

  it('Befund: passen nur die Zeilen, wandern Zeilen 12–15 mit den Erklärungen – nie die Erklärungen allein', () => {
    const item = { id: 'm1', height: 30 + 15 * 22 + 50 + 20, headHeight: 30, footHeight: 20, units, unitLines: units.map((_, k) => (k < 15 ? 1 : 0)) }
    const platz = 30 + 15 * 22 + 30 // alle Zeilen passen, Erklärungen + Wortzahl nicht
    const ohne = paginate([item], platz, 1000)
    expect(ohne[1].items[0]).toMatchObject({ from: 15, to: 16 }) // bisher: Erklärungen allein auf Seite 2
    const mit = paginate([{ ...item, unitGlue: bindeWorterklaerungen(units, hatZiffer, [], 1000) }], platz, 1000)
    expect(mit[0].items[0]).toMatchObject({ from: 0, to: 11 })
    expect(mit[1].items[0]).toMatchObject({ from: 11, to: 16 })
  })
})

describe('Seite leicht verdichten statt Text zerreißen', () => {
  const text = { id: 'm1', height: 30 + 15 * 22 + 50 + 20, headHeight: 30, footHeight: 20, units, unitLines: units.map((_, k) => (k < 15 ? 1 : 0)) }
  const davor = { id: 'kasten', height: 300 }
  it('fehlt wenig: ganzer Text auf Seite 1, Seite verkleinert, das Folgende auf Seite 2', () => {
    const platz = 300 + 430 - 40 // 40 px zu wenig
    const p = paginate([davor, { ...text, verdichtbar: true }, { id: 'a1', height: 100 }], platz, 1000)
    expect(p[0].items.map((i) => i.id)).toEqual(['kasten', 'm1'])
    expect(p[0].items[1]).toMatchObject({ from: 0, to: 16 })
    expect(p[0].massstab).toBeGreaterThanOrEqual(VERDICHTEN_MIN)
    expect(p[0].massstab).toBeLessThan(1)
    expect(p[1].items.map((i) => i.id)).toEqual(['a1'])
  })
  it('fehlt viel: wird wie bisher geteilt, keine Verkleinerung', () => {
    const p = paginate([davor, { ...text, verdichtbar: true, unitGlue: bindeWorterklaerungen(units, hatZiffer, [], 1000) }], 300 + 200, 1000)
    expect(p[0].massstab).toBeUndefined()
    expect(p[1].items[0]).toMatchObject({ id: 'm1', continued: true })
  })
  it('ohne verdichtbar (Aufgaben, Tabellen): nie verkleinert', () => {
    const p = paginate([davor, text], 300 + 430 - 40, 1000)
    expect(p[0].massstab).toBeUndefined()
  })
})
