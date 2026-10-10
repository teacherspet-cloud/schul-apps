import { describe, expect, it } from 'vitest'
import { hintergrundEntfernen } from '../src/renderer/src/shared/logoFreistellen'

// 5×5: weißer Rand, innen ein roter Ring mit weißer Mitte – Rand wird durchsichtig, die Mitte bleibt (10.10.2026)
function bild(): Uint8ClampedArray {
  const d = new Uint8ClampedArray(5 * 5 * 4)
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      const o = (y * 5 + x) * 4
      const ring = x >= 1 && x <= 3 && y >= 1 && y <= 3 && !(x === 2 && y === 2)
      d.set(ring ? [200, 20, 20, 255] : [255, 255, 255, 255], o)
    }
  return d
}
const alpha = (d: Uint8ClampedArray, x: number, y: number): number => d[(y * 5 + x) * 4 + 3]

describe('Schullogo freistellen', () => {
  it('heller Hintergrund vom Rand her durchsichtig, Weiß im Logo bleibt', () => {
    const d = bild()
    const n = hintergrundEntfernen(d, 5, 5)
    expect(n).toBe(16)
    expect(alpha(d, 0, 0)).toBe(0)
    expect(alpha(d, 4, 2)).toBe(0)
    expect(alpha(d, 1, 1)).toBe(255)
    expect(alpha(d, 2, 2)).toBe(255)
  })
})
