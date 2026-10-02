import { describe, expect, it } from 'vitest'
import { geste, radieren, wegkritzeln, type Strich } from '../src/renderer/src/modules/onlinetest/tinte'

/* Korrekturzeichen der Schreibfläche (02.10.2026) – Faustregeln über die Form des Strichs */
const linie = (x0: number, y0: number, x1: number, y1: number, n = 12): Strich =>
  Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)] as [number, number])

describe('Korrekturzeichen', () => {
  it('Zickzack ist Kritzeln', () => {
    const z: Strich = []
    for (let i = 0; i < 8; i++) z.push([100 + (i % 2) * 80, 40 + i * 3])
    expect(geste(z)).toBe('kritzeln')
  })
  it('flacher gerader Strich ist Durchstreichen', () => {
    expect(geste(linie(100, 50, 300, 54))).toBe('streichen')
  })
  it('∧ ist das Einfügezeichen', () => {
    expect(geste([...linie(200, 80, 220, 40, 6), ...linie(222, 42, 240, 80, 6)])).toBe('einfuegen')
  })
  it('geschlossener Bogen ist ein Kreis', () => {
    const k: Strich = Array.from({ length: 30 }, (_, i) => [300 + 60 * Math.cos((i / 29) * 2 * Math.PI), 60 + 30 * Math.sin((i / 29) * 2 * Math.PI)] as [number, number])
    expect(geste(k)).toBe('kreis')
  })
  it('gewöhnliche Schrift ist keine Geste', () => {
    // ein „l": senkrecht
    expect(geste(linie(100, 10, 102, 80))).toBeNull()
    // ein „c": offener Bogen
    const c: Strich = Array.from({ length: 12 }, (_, i) => [100 + 20 * Math.cos(0.8 + (i / 11) * 4.6), 50 + 20 * Math.sin(0.8 + (i / 11) * 4.6)] as [number, number])
    expect(geste(c)).toBeNull()
  })
  it('Kritzeln entfernt die Tinte darunter, Radieren was es berührt', () => {
    const a = linie(100, 40, 140, 80)
    const b = linie(400, 40, 440, 80)
    expect(wegkritzeln([a, b], linie(90, 50, 150, 70))).toEqual([b])
    expect(radieren([a, b], [[420, 60]])).toEqual([a])
  })
})
