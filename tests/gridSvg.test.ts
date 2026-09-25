import { describe, expect, it } from 'vitest'
import { defaultAxes, gridDefaults, sanitizeAxes } from '../src/renderer/src/modules/arbeitsblatt/model/grid'
import { gridDrawing } from '../src/renderer/src/modules/arbeitsblatt/render/gridSvg'
import { qrSvg } from '../src/renderer/src/modules/arbeitsblatt/render/qr'
import type { GridBlock, GridKind } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const block = (kind: GridKind, patch: Partial<GridBlock> = {}): GridBlock => ({
  id: 'g',
  type: 'grid',
  kind,
  title: '',
  caption: '',
  ...gridDefaults(kind),
  axes: defaultAxes(kind),
  ...patch
})

/** Zählt die Linien im SVG */
const lines = (svg: string): number => (svg.match(/<line /g) ?? []).length

describe('Gitternetze', () => {
  it('zeichnet Karoraster mit ganzen Millimetern', () => {
    const d = gridDrawing(block('karo'), 170)
    expect(d.widthMm).toBe(170)
    // 60 mm hoch, 5-mm-Kästchen → 12 Reihen; die Höhe bleibt ein Vielfaches der Kästchenweite
    expect(d.heightMm).toBeCloseTo(12 * 5 + 0.6)
    expect(lines(d.svg)).toBe(34 + 13) // 33 Spalten + 12 Reihen, jeweils eine Linie mehr
    expect(d.svg).toContain('width="170mm"')
  })

  it('betont beim Millimeterpapier jede fünfte und zehnte Linie', () => {
    const d = gridDrawing(block('mm', { heightMm: 50 }), 100)
    // Millimeterpapier hat drei Strichstärken
    expect(d.svg).toContain('stroke-width="0.12"')
    expect(d.svg).toContain('stroke-width="0.2"')
    expect(d.svg).toContain('stroke-width="0.28"')
  })

  it('beschriftet das Koordinatensystem und zeichnet Achsen mit Pfeil', () => {
    const b = block('koordinaten', { axes: { ...defaultAxes('koordinaten'), xLabel: 'Zeit t in s', yLabel: 'Weg s in m', xMax: 10, yMax: 8 } })
    const d = gridDrawing(b, 170)
    expect(d.svg).toContain('Zeit t in s')
    expect(d.svg).toContain('Weg s in m')
    // zwei Pfeilspitzen als Pfad
    expect((d.svg.match(/<path /g) ?? []).length).toBe(2)
    // Die Höhe passt sich den Kästchen an und bleibt unter der Vorgabe
    expect(d.heightMm).toBeLessThanOrEqual(b.heightMm)
  })

  it('zeichnet das Klimadiagramm mit zwölf Monaten und zwei Achsen', () => {
    const d = gridDrawing(block('klima'), 170)
    for (const m of ['J', 'F', 'M', 'A', 'S', 'O', 'N', 'D']) expect(d.svg).toContain(`>${m}</text>`)
    expect(d.svg).toContain('Temperatur in °C')
    expect(d.svg).toContain('Niederschlag in mm')
    // Niederschlag im Verhältnis 1 : 2 zur Temperatur (Walter/Lieth): 40 °C ↔ 80 mm
    expect(d.svg).toContain('>80</text>')
  })

  it('hält die Niederschlagsachse im Verhältnis 1 : 2', () => {
    const axes = sanitizeAxes({ ...defaultAxes('klima'), yMin: 0, yMax: 30, yStep: 5, y2Min: 0, y2Max: 90, y2Step: 45 }, 'klima')
    expect(axes.y2Min).toBe(0)
    expect(axes.y2Max).toBe(60)
    expect(axes.y2Step).toBe(10)
  })

  it('fängt unbrauchbare Achsenwerte der KI ab', () => {
    const axes = sanitizeAxes({ ...defaultAxes('koordinaten'), xMin: 0, xMax: 0, yMin: 0, yMax: 100, yStep: 0 }, 'koordinaten')
    expect(axes.xMax).toBeGreaterThan(axes.xMin)
    expect(axes.yStep).toBeGreaterThan(0)
    expect((axes.yMax - axes.yMin) / axes.yStep).toBeLessThanOrEqual(40)
  })

  it('erzeugt einen QR-Code als SVG', () => {
    const svg = qrSvg('https://example.org/hoertext.mp3', 22)
    expect(svg).toContain('width="22mm"')
    expect(svg).toMatch(/<path d="M\d+ \d+h\d+v1h-\d+z/)
  })
})
