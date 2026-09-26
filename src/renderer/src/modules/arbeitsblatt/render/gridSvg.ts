/**
 * Gitternetze als SVG – gleiche Zeichnung für Bildschirm, Druck und Word.
 *
 * Alle Maße sind echte Millimeter (viewBox in mm), damit die Schülerinnen und Schüler
 * auf dem ausgedruckten Blatt mit dem Lineal arbeiten können. Die Kästchenweite ist
 * immer eine ganze Zahl in Millimetern; passt der gewünschte Wertebereich nicht,
 * wird das Gitternetz kleiner, nie die Kästchenweite krumm.
 */
import { MONTH_LETTERS, sanitizeAxes } from '../model/grid'
import type { GridAxes, GridBlock, GridKind } from '../model/types'

export interface GridDrawing {
  svg: string
  widthMm: number
  heightMm: number
}

export const FINE = '#ccd5dd'
export const MEDIUM = '#a8b4bf'
export const STRONG = '#7d8b97'
export const AXIS = '#333c44'
const LABEL = '#333c44'

export const round = (n: number): number => Math.round(n * 100) / 100

/** Zahl ohne überflüssige Nullen, mit deutschem Komma. */
export function num(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return String(r).replace('.', ',')
}

export function line(x1: number, y1: number, x2: number, y2: number, color: string, width: number): string {
  return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${color}" stroke-width="${width}"/>`
}

export function text(x: number, y: number, value: string, opts: { anchor?: string; size?: number; rotate?: number; bold?: boolean } = {}): string {
  const anchor = opts.anchor ?? 'middle'
  const size = opts.size ?? 3
  const transform = opts.rotate ? ` transform="rotate(${opts.rotate} ${round(x)} ${round(y)})"` : ''
  const weight = opts.bold ? ' font-weight="600"' : ''
  const safe = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<text x="${round(x)}" y="${round(y)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${LABEL}" text-anchor="${anchor}"${weight}${transform}>${safe}</text>`
}

/** Gleichmäßiges Kästchenraster (Karo oder Millimeterpapier). */
export function plainGrid(x: number, y: number, w: number, h: number, cell: number, fine: boolean): string {
  const parts: string[] = []
  const cols = Math.floor(w / cell)
  const rows = Math.floor(h / cell)
  for (let i = 0; i <= cols; i++) {
    const cx = x + i * cell
    // Millimeterpapier: jede 5. Linie kräftiger, jede 10. am kräftigsten
    const strong = fine && i % 10 === 0
    const medium = fine && i % 5 === 0
    parts.push(line(cx, y, cx, y + rows * cell, strong ? STRONG : medium ? MEDIUM : FINE, strong ? 0.28 : medium ? 0.2 : 0.12))
  }
  for (let i = 0; i <= rows; i++) {
    const cy = y + i * cell
    const strong = fine && i % 10 === 0
    const medium = fine && i % 5 === 0
    parts.push(line(x, cy, x + cols * cell, cy, strong ? STRONG : medium ? MEDIUM : FINE, strong ? 0.28 : medium ? 0.2 : 0.12))
  }
  return parts.join('')
}

export function svgWrap(widthMm: number, heightMm: number, body: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(widthMm)}mm" height="${round(heightMm)}mm"`,
    ` viewBox="0 0 ${round(widthMm)} ${round(heightMm)}">`,
    `<rect x="0" y="0" width="${round(widthMm)}" height="${round(heightMm)}" fill="#ffffff"/>`,
    body,
    '</svg>'
  ].join('')
}

/** Anzahl der Schritte auf einer Achse. */
const steps = (min: number, max: number, step: number): number => Math.max(1, Math.round((max - min) / step))

interface Frame {
  left: number
  top: number
  cell: number
  cols: number
  rows: number
}

/** Kästchenweite als ganze Millimeterzahl, sodass der Wertebereich in die Fläche passt. */
function frameFor(axes: GridAxes, widthMm: number, heightMm: number, padLeft: number, padRight: number, padTop: number, padBottom: number): Frame {
  const cols = steps(axes.xMin, axes.xMax, axes.xStep)
  const rows = steps(axes.yMin, axes.yMax, axes.yStep)
  const availW = widthMm - padLeft - padRight
  const availH = heightMm - padTop - padBottom
  const cell = Math.max(2, Math.min(20, Math.floor(Math.min(availW / cols, availH / rows))))
  return { left: padLeft, top: padTop, cell, cols, rows }
}

/** Koordinatensystem mit Achsen, Teilstrichen und Beschriftung. */
function coordinates(block: GridBlock, axes: GridAxes, widthMm: number): GridDrawing {
  const padLeft = axes.showNumbers ? 13 : 4
  const padRight = 6
  const padTop = 6
  const padBottom = axes.xLabel || axes.showNumbers ? 11 : 4
  const f = frameFor(axes, widthMm, block.heightMm, padLeft, padRight, padTop, padBottom)
  const gridW = f.cols * f.cell
  const gridH = f.rows * f.cell
  const height = padTop + gridH + padBottom
  const right = f.left + gridW
  const bottom = f.top + gridH
  // Lage der Achsen: Nulllinie, falls sie im Bild liegt, sonst am Rand
  const xZero = axes.yMin <= 0 && axes.yMax >= 0 ? bottom - ((0 - axes.yMin) / (axes.yMax - axes.yMin)) * gridH : bottom
  const yZero = axes.xMin <= 0 && axes.xMax >= 0 ? f.left + ((0 - axes.xMin) / (axes.xMax - axes.xMin)) * gridW : f.left

  const parts: string[] = [plainGrid(f.left, f.top, gridW, gridH, f.cell, false)]
  // Achsen mit Pfeilspitze
  parts.push(line(f.left, xZero, right + 3, xZero, AXIS, 0.4))
  parts.push(`<path d="M ${round(right + 3)} ${round(xZero)} l -1.8 -1.1 v 2.2 z" fill="${AXIS}"/>`)
  parts.push(line(yZero, bottom, yZero, f.top - 3, AXIS, 0.4))
  parts.push(`<path d="M ${round(yZero)} ${round(f.top - 3)} l -1.1 1.8 h 2.2 z" fill="${AXIS}"/>`)

  if (axes.showNumbers) {
    for (let i = 0; i <= f.cols; i++) {
      const value = axes.xMin + i * axes.xStep
      const cx = f.left + i * f.cell
      if (Math.abs(value) < 1e-9) continue
      parts.push(line(cx, xZero - 0.8, cx, xZero + 0.8, AXIS, 0.3))
      // Bei engen Kästchen nur jede zweite Zahl schreiben
      if (f.cell >= 5 || i % 2 === 0) parts.push(text(cx, xZero + 4, num(value), { size: 2.8 }))
    }
    for (let i = 0; i <= f.rows; i++) {
      const value = axes.yMin + i * axes.yStep
      const cy = bottom - i * f.cell
      if (Math.abs(value) < 1e-9) continue
      parts.push(line(yZero - 0.8, cy, yZero + 0.8, cy, AXIS, 0.3))
      if (f.cell >= 5 || i % 2 === 0) parts.push(text(yZero - 1.8, cy + 1, num(value), { anchor: 'end', size: 2.8 }))
    }
    parts.push(text(yZero - 1.8, xZero + 4, '0', { anchor: 'end', size: 2.8 }))
  }
  if (axes.xLabel) parts.push(text(right + 3, xZero + 8, axes.xLabel, { anchor: 'end', size: 3.2, bold: true }))
  if (axes.yLabel) parts.push(text(3.2, f.top - 3.5, axes.yLabel, { anchor: 'start', size: 3.2, bold: true }))
  return { svg: svgWrap(widthMm, height, parts.join('')), widthMm, heightMm: height }
}

/** Klimadiagramm: zwölf Monate, links Temperatur, rechts Niederschlag im Verhältnis 1 : 2. */
function climate(block: GridBlock, axes: GridAxes, widthMm: number): GridDrawing {
  const padLeft = 15
  const padRight = 17
  const padTop = 7
  const padBottom = 12
  const f = frameFor(axes, widthMm, block.heightMm, padLeft, padRight, padTop, padBottom)
  const gridW = f.cols * f.cell
  const gridH = f.rows * f.cell
  const height = padTop + gridH + padBottom
  const right = f.left + gridW
  const bottom = f.top + gridH
  const parts: string[] = [plainGrid(f.left, f.top, gridW, gridH, f.cell, false)]

  // Waagerechte Linien an den beschrifteten Werten kräftiger
  for (let i = 0; i <= f.rows; i++) {
    const cy = bottom - i * f.cell
    const value = axes.yMin + i * axes.yStep
    const zero = Math.abs(value) < 1e-9
    parts.push(line(f.left, cy, right, cy, zero ? AXIS : MEDIUM, zero ? 0.4 : 0.2))
    parts.push(text(f.left - 1.8, cy + 1, num(value), { anchor: 'end', size: 2.8 }))
    const precip = axes.y2Min + i * axes.y2Step
    if (precip >= 0) parts.push(text(right + 1.8, cy + 1, num(precip), { anchor: 'start', size: 2.8 }))
  }
  // Senkrechte Achsen und Monate
  parts.push(line(f.left, f.top, f.left, bottom, AXIS, 0.4))
  parts.push(line(right, f.top, right, bottom, AXIS, 0.4))
  for (let i = 0; i < 12; i++) {
    const cx = f.left + (i + 0.5) * f.cell
    parts.push(text(cx, bottom + 4, MONTH_LETTERS[i], { size: 3 }))
  }
  parts.push(text(f.left, f.top - 2.5, axes.yLabel || 'Temperatur in °C', { anchor: 'start', size: 3, bold: true }))
  parts.push(text(right, f.top - 2.5, axes.y2Label || 'Niederschlag in mm', { anchor: 'end', size: 3, bold: true }))
  parts.push(text((f.left + right) / 2, bottom + 9.5, axes.xLabel || 'Monat', { size: 3 }))
  return { svg: svgWrap(widthMm, height, parts.join('')), widthMm, heightMm: height }
}

/** Zeichnet das Gitternetz eines Bausteins in der angegebenen Breite. */
export function gridDrawing(block: GridBlock, widthMm: number): GridDrawing {
  const kind: GridKind = block.kind
  const axes = sanitizeAxes(block.axes, kind)
  const width = Math.max(40, widthMm)
  if (kind === 'koordinaten') return coordinates(block, axes, width)
  if (kind === 'klima') return climate(block, axes, width)
  const cell = kind === 'mm' ? 1 : Math.max(2, Math.round(block.cellMm || 5))
  const height = Math.max(cell * 4, block.heightMm)
  // Breite ist eine feste Grenze (Satzspiegel), die Höhe nur ein Wunsch – deshalb dort runden
  const cols = Math.floor((width - 0.6) / cell)
  const rows = Math.max(1, Math.round((height - 0.6) / cell))
  const body = [
    plainGrid(0.3, 0.3, cols * cell, rows * cell, cell, kind === 'mm'),
    `<rect x="0.3" y="0.3" width="${round(cols * cell)}" height="${round(rows * cell)}" fill="none" stroke="${STRONG}" stroke-width="0.3"/>`
  ].join('')
  return { svg: svgWrap(width, rows * cell + 0.6, body), widthMm: width, heightMm: rows * cell + 0.6 }
}

/** SVG als data:-URL für <img>. */
export function gridDataUrl(drawing: GridDrawing): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(drawing.svg)}`
}
