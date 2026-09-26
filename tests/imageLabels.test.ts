import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { imageSizeFromDataUrl } from '../src/renderer/src/shared/imageSize'
import { estimateLines, imageHeightMmFor, layoutImageLabels } from '../src/renderer/src/modules/arbeitsblatt/render/imageLabelLayout'
import { ImageLabelLayer } from '../src/renderer/src/modules/arbeitsblatt/render/ImageLabels'
import type { ImageLabel } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/*
 * Die Beschriftungen aus dem Blatt der Lehrkraft (26.09.2026, „Strahlung aus Atomkernen", M1):
 * „Strahlungsquelle" und „Betastrahlung" liegen beide bei 50 % – ihre Schilder lagen deckend
 * übereinander, „Papier" (14 %) und „Alphastrahlung" (22 %) berührten sich.
 */
const M1: ImageLabel[] = [
  { id: 'a', text: 'Strahlungsquelle', x: 9, y: 50 },
  { id: 'b', text: 'Alphastrahlung', x: 30, y: 22 },
  { id: 'c', text: 'Betastrahlung', x: 46, y: 50 },
  { id: 'd', text: 'Gammastrahlung', x: 68, y: 78 },
  { id: 'e', text: 'Papier', x: 35, y: 14 },
  { id: 'f', text: 'Aluminium', x: 58, y: 42 },
  { id: 'g', text: 'Blei', x: 80, y: 70 }
]

/** Überschneiden sich zwei gesetzte Schilder derselben Seite? */
function ueberschneidungen(labels: ImageLabel[], imageHeightMm: number): string[] {
  const p = layoutImageLabels(labels, { imageHeightMm })
  const out: string[] = []
  const alle = [...p.values()]
  for (let i = 0; i < alle.length; i++)
    for (let j = i + 1; j < alle.length; j++) {
      const a = alle[i]
      const b = alle[j]
      if (a.side !== b.side) continue
      const abstand = Math.abs(a.top - b.top)
      if (abstand < a.heightPct / 2 + b.heightPct / 2) out.push(`${a.id}/${b.id}`)
    }
  return out
}

describe('Bildmaße aus der data:-Adresse', () => {
  it('liest PNG-Kopf und SVG-viewBox', () => {
    expect(imageSizeFromDataUrl(PNG_1PX)).toEqual({ width: 1, height: 1 })
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"></svg>').toString('base64')}`
    expect(imageSizeFromDataUrl(svg)).toEqual({ width: 400, height: 300 })
    expect(imageSizeFromDataUrl('data:text/plain;base64,aGFsbG8=')).toBeNull()
    expect(imageSizeFromDataUrl(undefined)).toBeNull()
  })

  it('leitet die Bildhöhe aus Blockbreite und Seitenverhältnis ab', () => {
    // 170 mm Block, 2 × 26 mm Spalten → 118 mm Bild; 4:3 → 88,5 mm
    expect(imageHeightMmFor(170, 26, { width: 400, height: 300 })).toBeCloseTo(88.5, 1)
    expect(imageHeightMmFor(170, 26, null)).toBeCloseTo(88.5, 1)
  })
})

describe('Setzer für Bildbeschriftungen', () => {
  it('schätzt Zeilen durch Umbruch an Leerzeichen', () => {
    expect(estimateLines('Blei', 15)).toBe(1)
    expect(estimateLines('Strahlungsquelle', 15)).toBe(1)
    expect(estimateLines('Kern der Zelle mit Membran', 15)).toBe(2)
  })

  it('lässt Schilder auf gleicher Höhe nicht mehr übereinanderliegen (M1 der Lehrkraft)', () => {
    const p = layoutImageLabels(M1, { imageHeightMm: 80 })
    expect(ueberschneidungen(M1, 80)).toEqual([])
    // „Strahlungsquelle" (Punkt weiter links) bleibt oben, „Betastrahlung" rückt darunter
    expect(p.get('a')!.top).toBeLessThan(p.get('c')!.top)
    expect(p.get('c')!.top - p.get('a')!.top).toBeGreaterThanOrEqual(p.get('a')!.heightPct / 2 + p.get('c')!.heightPct / 2)
    // Alle bleiben im Bild
    for (const s of p.values()) {
      expect(s.top - s.heightPct / 2).toBeGreaterThanOrEqual(-0.01)
      expect(s.top + s.heightPct / 2).toBeLessThanOrEqual(100.01)
    }
  })

  it('verschiebt so wenig wie nötig: freie Schilder bleiben auf Punkthöhe', () => {
    const p = layoutImageLabels(M1, { imageHeightMm: 80 })
    expect(p.get('g')!.top).toBe(70) // Blei stört niemanden
    expect(p.get('d')!.top).toBe(78) // Gammastrahlung auch nicht
  })

  it('verlagert Schilder auf die andere Seite, wenn eine Seite überfüllt ist', () => {
    const viele: ImageLabel[] = Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, text: `Teil ${i + 1}`, x: 40 - i, y: 10 + i * 9 }))
    // Kleines Bild (30 mm): neun Schilder à ~4,8 mm passen nicht auf eine Seite
    const p = layoutImageLabels(viele, { imageHeightMm: 30 })
    expect([...p.values()].some((s) => s.side === 'right')).toBe(true)
    expect(ueberschneidungen(viele, 30)).toEqual([])
  })

  it('feste Seitenangaben werden nicht verlagert', () => {
    const fest: ImageLabel[] = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, text: `Teil ${i + 1}`, x: 45, y: 20 + i * 10, side: 'left' }))
    const p = layoutImageLabels(fest, { imageHeightMm: 25 })
    expect([...p.values()].every((s) => s.side === 'left')).toBe(true)
  })

  it('setzt im Markup Schilder und geknickte Linien (Druck ohne Skript)', () => {
    const html = renderToStaticMarkup(createElement(ImageLabelLayer, { labels: M1, showAnswers: false, widthMm: 102, imageDataUrl: PNG_1PX, children: createElement('img', { src: PNG_1PX }) }))
    expect(html).toContain('ws-imglabel-lines')
    expect((html.match(/<polyline/g) ?? []).length).toBe(7)
    expect(html).toContain('Strahlungsquelle')
    expect(html).toContain('Betastrahlung')
    // Die beiden 50-%-Schilder stehen auf verschiedenen Höhen
    const tops = [...html.matchAll(/ws-imglabel-box" style="top:([\d.]+)%"/g)].map((m) => Number(m[1]))
    expect(new Set(tops.map((t) => t.toFixed(1))).size).toBe(tops.length)
  })
})
