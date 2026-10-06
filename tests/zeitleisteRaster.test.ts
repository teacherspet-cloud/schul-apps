import { describe, expect, it } from 'vitest'
import { defaultDiagram } from '../src/renderer/src/modules/arbeitsblatt/model/diagram'
import { diagramDrawing } from '../src/renderer/src/modules/arbeitsblatt/render/diagramSvg'

/*
 * Zeitleisten auf den Gitternetzlinien (06.10.2026, Befund der Lehrkraft: nach dem Ändern von Höhe oder
 * Abstand lag eine Leiste auf einer Linie, die andere dazwischen). Raster: ab 0,5 mm alle 5 mm.
 */
const grundlinien = (svg: string): number[] =>
  [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*stroke-width="0\.45"/g)]
    .filter((m) => m[2] === m[4])
    .map((m) => Number(m[2]))
const aufGitter = (y: number): boolean => Math.abs(((y - 0.5) % 5) + 5) % 5 < 0.01 || Math.abs(((((y - 0.5) % 5) + 5) % 5) - 5) < 0.01

describe('Zeitleiste auf dem Raster', () => {
  for (const straenge of [['A', 'B'], ['A', 'B', 'C'], ['A', 'B', 'C', 'D'], []])
    for (const hoehe of [60, 70, 83, 97, 98, 102, 137, 180, 233]) {
      it(`${straenge.length || 1} Leiste(n), ${hoehe} mm: alle Grundlinien auf Gitterlinien`, () => {
        const d = defaultDiagram('zeitleiste')
        d.heightMm = hoehe
        d.timeline = { ...d.timeline, strands: straenge, yLevels: straenge.length ? [] : ['niedrig', 'mittel', 'hoch'], yLabel: hoehe % 2 ? 'Eskalation' : '' }
        const linien = grundlinien(diagramDrawing(d, 170).svg)
        expect(linien.length).toBeGreaterThan(0)
        for (const y of linien) expect(aufGitter(y), `y = ${y}`).toBe(true)
      })
    }
})
