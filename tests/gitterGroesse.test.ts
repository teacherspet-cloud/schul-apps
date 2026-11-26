import { describe, expect, it } from 'vitest'
import { diagramDrawing } from '../src/renderer/src/modules/arbeitsblatt/render/diagramSvg'

const spec = (heightMm: number, xMin: number, xMax: number, yMin: number, yMax: number, step = 15) => ({
  kind: 'koordinaten',
  heightMm,
  axes: { xLabel: 'westliche Länge', yLabel: 'nördliche Breite', y2Label: '', xMin, xMax, xStep: step, yMin, yMax, yStep: step, y2Min: 0, y2Max: 0, y2Step: 0, showNumbers: false, months: false },
  z: { label: '', min: 0, max: 6, step: 1 },
  xCategories: [],
  yLevels: [],
  timeline: { unit: 'year', from: '1900', to: '1950', step: 10, sections: [], yLabel: '', yLevels: [], strands: [], events: [] }
})

describe('Koordinatensystem: Kästchen groß genug zum Eintragen (26.11.2026)', () => {
  it('Befund Gradnetz 4c: 16 × 12 Kästchen bei 70 mm Höhe werden nicht mehr 4 mm klein', () => {
    const d = diagramDrawing(spec(70, -3120, -2880, 2400, 2580) as never, 170)
    expect(d.frame!.width / 16).toBeGreaterThanOrEqual(7)
    expect(d.heightMm).toBeGreaterThan(90)
  })
  it('die Breite bleibt die Grenze', () => {
    const d = diagramDrawing(spec(70, 0, 40, 0, 10, 1) as never, 170)
    expect(d.frame!.width).toBeLessThanOrEqual(170)
  })
})
