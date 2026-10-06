/**
 * Zeichenflächen der Diagramm-Antwortform als SVG (26.09.2026) – gleiche Zeichnung für
 * Bildschirm, Druck, PDF und Word. Alle Maße in Millimetern (viewBox in mm), damit auf dem
 * Papier mit dem Lineal gearbeitet werden kann; Kästchenweite immer ganzzahlig.
 *
 * Arten:
 *  - koordinaten / mm: Koordinatensystem mit Karo- bzw. Millimeterraster, Achsen mit Pfeil,
 *    Zahlen und Beschriftung (mm: feines 1-mm-Raster unter 5-mm-Kästchen);
 *  - klima: Klimadiagramm (aus gridSvg.ts);
 *  - spannung: Verlaufskurve über Kategorien (Handlungsschritte) mit Stufen an der y-Achse;
 *  - schraegbild: Kavalierperspektive – x₂ nach rechts, x₃ nach oben, x₁ schräg nach vorn
 *    (45°, halbe Länge), wie im Mathematik-Schulbuch;
 *  - zeitleiste: Zeitachse mit Datumsmarken, wahlweise Abschnitte mit eigener Skala und
 *    Bruchzeichen, y-Achse mit Stufen (Eskalation), mehrere Stränge, vorgegebene Ereignisse;
 *    darunter ein feines Karoraster als Zeichenfläche.
 *
 * `frame` beschreibt die Abbildung Wert → Millimeter, damit die KI eine Musterlösung als
 * Skizze in dieselbe Fläche zeichnen kann (generation/solution.ts).
 */
import { datumText, datumZahl, sanitizeDiagram } from '../model/diagram'
import type { DiagramSpec, GridBlock, TimelineSection, TimelineSpec } from '../model/types'
import { AXIS, MEDIUM, STRONG, gridDrawing, line, num, plainGrid, round, svgWrap, text } from './gridSvg'

export interface DiagramFrame {
  /** Linke obere Ecke und Maße der Zeichenfläche in mm */
  left: number
  top: number
  width: number
  height: number
  /** Wertebereich, der auf die Fläche abgebildet wird (x nach rechts, y nach oben) */
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  /** Für die KI: wie Werte auf Millimeter abgebildet werden (Zeitleiste: je Abschnitt) */
  hinweis: string
}

export interface DiagramDrawing {
  svg: string
  widthMm: number
  heightMm: number
  frame: DiagramFrame
}

const steps = (min: number, max: number, step: number): number => Math.max(1, Math.round((max - min) / step))
const textWidthMm = (s: string, size: number): number => s.length * size * 0.55

/** Koordinatensystem – auch für Verlaufskurven (Kategorien, Stufen) und Millimeterpapier. */
function kartesisch(spec: DiagramSpec, widthMm: number): DiagramDrawing {
  const axes = spec.axes
  const kategorien = spec.kind === 'spannung' ? spec.xCategories : []
  const stufen = spec.kind === 'spannung' ? spec.yLevels : []
  const zahlen = axes.showNumbers && !stufen.length
  const padLeft = stufen.length ? Math.min(40, Math.max(...stufen.map((s) => textWidthMm(s, 2.8))) + 6) : zahlen ? 13 : 6
  const padRight = 6
  const padTop = axes.yLabel ? 8 : 5
  const padBottom = kategorien.length ? (kategorien.some((k) => k.length > 9) ? 20 : 11) : axes.xLabel || zahlen ? 11 : 5
  const cols = steps(axes.xMin, axes.xMax, axes.xStep)
  const rows = stufen.length ? stufen.length : steps(axes.yMin, axes.yMax, axes.yStep)
  const availW = widthMm - padLeft - padRight
  const availH = spec.heightMm - padTop - padBottom
  let cell = Math.max(3, Math.min(25, Math.floor(Math.min(availW / cols, availH / rows))))
  if (spec.kind === 'mm') cell = Math.max(5, Math.floor(cell / 5) * 5)
  const left = padLeft
  const top = padTop
  const gridW = cols * cell
  const gridH = rows * cell
  const right = left + gridW
  const bottom = top + gridH
  const height = round(padTop + gridH + padBottom)
  const yMin = stufen.length ? 0 : axes.yMin
  const yMax = stufen.length ? stufen.length : axes.yMax
  const xZero = yMin <= 0 && yMax >= 0 ? bottom - ((0 - yMin) / (yMax - yMin)) * gridH : bottom
  const yZero = axes.xMin <= 0 && axes.xMax >= 0 ? left + ((0 - axes.xMin) / (axes.xMax - axes.xMin)) * gridW : left

  const parts: string[] = []
  if (spec.kind === 'mm') parts.push(plainGrid(left, top, gridW, gridH, 1, true))
  else parts.push(plainGrid(left, top, gridW, gridH, cell, false))
  // Achsen mit Pfeilspitze
  parts.push(line(left, xZero, right + 3, xZero, AXIS, 0.4))
  parts.push(`<path d="M ${round(right + 3)} ${round(xZero)} l -1.8 -1.1 v 2.2 z" fill="${AXIS}"/>`)
  parts.push(line(yZero, bottom, yZero, top - 3, AXIS, 0.4))
  parts.push(`<path d="M ${round(yZero)} ${round(top - 3)} l -1.1 1.8 h 2.2 z" fill="${AXIS}"/>`)

  if (zahlen) {
    for (let i = 0; i <= cols; i++) {
      const value = axes.xMin + i * axes.xStep
      const cx = left + i * cell
      if (Math.abs(value) < 1e-9) continue
      parts.push(line(cx, xZero - 0.8, cx, xZero + 0.8, AXIS, 0.3))
      if (cell >= 5 || i % 2 === 0) parts.push(text(cx, xZero + 4, num(value), { size: 2.8 }))
    }
    for (let i = 0; i <= rows; i++) {
      const value = axes.yMin + i * axes.yStep
      const cy = bottom - i * cell
      if (Math.abs(value) < 1e-9) continue
      parts.push(line(yZero - 0.8, cy, yZero + 0.8, cy, AXIS, 0.3))
      if (cell >= 5 || i % 2 === 0) parts.push(text(yZero - 1.8, cy + 1, num(value), { anchor: 'end', size: 2.8 }))
    }
    parts.push(text(yZero - 1.8, xZero + 4, '0', { anchor: 'end', size: 2.8 }))
  }
  // Kategorien unter der x-Achse, mittig im Kästchen; lange schräg
  kategorien.forEach((k, i) => {
    const cx = left + (i + 0.5) * cell
    parts.push(line(cx, xZero - 0.8, cx, xZero + 0.8, AXIS, 0.3))
    if (k.length > 9) parts.push(text(cx + 1, xZero + 3.5, k, { anchor: 'end', size: 2.6, rotate: -35 }))
    else parts.push(text(cx, xZero + 4, k, { size: 2.7 }))
  })
  // Stufen an der y-Achse: Bänder mit gestrichelter Grenze, Beschriftung mittig im Band
  stufen.forEach((s, i) => {
    const cy = bottom - (i + 0.5) * cell
    parts.push(text(left - 1.8, cy + 1, s, { anchor: 'end', size: 2.8 }))
    if (i > 0)
      parts.push(
        `<line x1="${round(left)}" y1="${round(bottom - i * cell)}" x2="${round(right)}" y2="${round(bottom - i * cell)}" stroke="${STRONG}" stroke-width="0.25" stroke-dasharray="1.5 1"/>`
      )
  })
  if (axes.xLabel) parts.push(text(right + 3, kategorien.length ? bottom + padBottom - 1.5 : xZero + 8, axes.xLabel, { anchor: 'end', size: 3.2, bold: true }))
  if (axes.yLabel) parts.push(text(Math.max(3, yZero - 10), top - 4, axes.yLabel, { anchor: 'start', size: 3.2, bold: true }))

  const frame: DiagramFrame = {
    left,
    top,
    width: gridW,
    height: gridH,
    xMin: axes.xMin,
    xMax: axes.xMax,
    yMin,
    yMax,
    hinweis: stufen.length
      ? `x: ${kategorien.length ? `Kategorien ${kategorien.map((k, i) => `„${k}" bei ${round(left + (i + 0.5) * cell)} mm`).join(', ')}` : `${axes.xMin} bis ${axes.xMax}`}; y: Stufen ${stufen.map((s, i) => `„${s}" bei ${round(bottom - (i + 0.5) * cell)} mm`).join(', ')}`
      : `x = ${axes.xMin} bei ${left} mm bis x = ${axes.xMax} bei ${right} mm; y = ${yMin} bei ${bottom} mm (unten) bis y = ${yMax} bei ${top} mm (oben); 1 Kästchen = ${cell} mm`
  }
  // Nur so breit wie nötig – ein halb leerer Kasten über die ganze Seite sähe unfertig aus
  const breite = round(Math.min(widthMm, right + padRight + (axes.xLabel ? textWidthMm(axes.xLabel, 3.2) : 0) + 4))
  return { svg: svgWrap(breite, height, parts.join('')), widthMm: breite, heightMm: height, frame }
}

/** Kavalierperspektive: x₂ rechts, x₃ oben, x₁ schräg nach vorn-links (45°, halbe Länge). */
function schraegbild(spec: DiagramSpec, widthMm: number): DiagramDrawing {
  const axes = spec.axes
  const z = spec.z
  const xSteps = steps(axes.xMin, axes.xMax, axes.xStep)
  const ySteps = steps(axes.yMin, axes.yMax, axes.yStep)
  const zSteps = steps(z.min, z.max, z.step)
  const k = 0.5 * Math.SQRT1_2 // Anteil einer Tiefeneinheit in x- und y-Richtung
  const padLeft = 12
  const padRight = 8
  const padTop = 8
  const padBottom = 10
  const availW = widthMm - padLeft - padRight
  const availH = spec.heightMm - padTop - padBottom
  const cell = Math.max(4, Math.min(20, Math.floor(Math.min(availW / (xSteps + zSteps * k), availH / (ySteps + zSteps * k)))))
  const zLen = zSteps * cell * 0.5
  const ox = padLeft + zSteps * cell * k
  const oy = padTop + ySteps * cell
  const xLen = xSteps * cell
  const yLen = ySteps * cell
  const height = round(padTop + yLen + zSteps * cell * k + padBottom)
  const gridW = Math.floor((widthMm - 1) / 5) * 5
  const gridH = Math.floor((height - 1) / 5) * 5
  const parts: string[] = [plainGrid(0.5, 0.5, gridW, gridH, 5, false)]
  const fx = ox - zLen * Math.SQRT1_2
  const fy = oy + zLen * Math.SQRT1_2
  // Achsen
  parts.push(line(ox, oy, ox + xLen + 3, oy, AXIS, 0.4), `<path d="M ${round(ox + xLen + 3)} ${round(oy)} l -1.8 -1.1 v 2.2 z" fill="${AXIS}"/>`)
  parts.push(line(ox, oy, ox, oy - yLen - 3, AXIS, 0.4), `<path d="M ${round(ox)} ${round(oy - yLen - 3)} l -1.1 1.8 h 2.2 z" fill="${AXIS}"/>`)
  parts.push(line(ox, oy, fx - 2.1, fy + 2.1, AXIS, 0.4), `<path d="M ${round(fx - 2.1)} ${round(fy + 2.1)} l 2.1 0 l -1.5 -1.5 z" fill="${AXIS}"/>`)
  // Teilstriche
  for (let i = 1; i <= xSteps; i++) {
    const cx = ox + i * cell
    parts.push(line(cx, oy - 0.8, cx, oy + 0.8, AXIS, 0.3))
    if (cell >= 6 || i % 2 === 0) parts.push(text(cx, oy + 4, num(axes.xMin + i * axes.xStep), { size: 2.6 }))
  }
  for (let i = 1; i <= ySteps; i++) {
    const cy = oy - i * cell
    parts.push(line(ox - 0.8, cy, ox + 0.8, cy, AXIS, 0.3))
    if (cell >= 6 || i % 2 === 0) parts.push(text(ox - 1.8, cy + 1, num(axes.yMin + i * axes.yStep), { anchor: 'end', size: 2.6 }))
  }
  for (let i = 1; i <= zSteps; i++) {
    const t = i * cell * 0.5 * Math.SQRT1_2
    const px = ox - t
    const py = oy + t
    parts.push(line(px - 0.6, py - 0.6, px + 0.6, py + 0.6, AXIS, 0.3))
    if (i % 2 === 0 || zSteps <= 6) parts.push(text(px - 1.5, py + 1.2, num(z.min + i * z.step), { anchor: 'end', size: 2.4 }))
  }
  parts.push(text(ox + xLen + 3, oy - 2, axes.xLabel || 'x₂', { anchor: 'end', size: 3.2, bold: true }))
  parts.push(text(ox + 2, oy - yLen - 3, axes.yLabel || 'x₃', { anchor: 'start', size: 3.2, bold: true }))
  parts.push(text(fx - 3, fy + 4.5, z.label || 'x₁', { anchor: 'start', size: 3.2, bold: true }))
  const frame: DiagramFrame = {
    left: ox,
    top: oy - yLen,
    width: xLen,
    height: yLen,
    xMin: axes.xMin,
    xMax: axes.xMax,
    yMin: axes.yMin,
    yMax: axes.yMax,
    hinweis: `Ursprung bei (${round(ox)} mm, ${round(oy)} mm); ${axes.xLabel || 'x₂'} nach rechts, 1 Einheit = ${cell} mm; ${axes.yLabel || 'x₃'} nach oben, 1 Einheit = ${cell} mm; ${z.label || 'x₁'} schräg nach unten links (45°), 1 Einheit = ${round(cell * 0.5)} mm`
  }
  const breite = round(Math.min(widthMm, ox + xLen + padRight + 8))
  return { svg: svgWrap(breite, height, parts.join('')), widthMm: breite, heightMm: height, frame }
}

/** Marken eines Abschnitts: Werte in der Einheit des Abschnitts. */
function marken(s: TimelineSection): { a: number; b: number; werte: number[] } {
  const a = datumZahl(s.from, s.unit) ?? 0
  const b = datumZahl(s.to, s.unit) ?? a + 1
  const werte: number[] = []
  for (let v = a; v <= b + 1e-9 && werte.length <= 60; v += s.step) werte.push(v)
  // Der Endpunkt bekommt immer eine Marke – auch wenn die Schrittweite nicht aufgeht
  if (werte[werte.length - 1] < b - s.step * 0.05) werte.push(b)
  return { a, b, werte }
}

/**
 * Zeitleiste – Abschnitte, Stufen, Stränge, Ereignisse, Karoraster als Zeichenfläche.
 * `raster = false`: fertige Material-Zeitleiste (27.09.2026) – ohne Karo, das nur Rauschen wäre.
 * `extraTop`: zusätzlicher Platz über der obersten Stufe, wenn Beschriftungen dort sonst nicht
 * unterkommen (die Zeichnung wird um so viel höher; siehe Beschriftungen unten).
 */
function zeitleiste(spec: DiagramSpec, widthMm: number, raster = true, extraTop = 0): DiagramDrawing {
  const t: TimelineSpec = spec.timeline
  const abschnitte: TimelineSection[] = t.sections.length ? t.sections : [{ from: t.from, to: t.to, unit: t.unit, step: t.step }]
  const straenge = t.strands.length > 1 ? t.strands : []
  const stufen = straenge.length ? [] : t.yLevels
  const linksText = straenge.length ? straenge : stufen
  const padLeft = linksText.length ? Math.min(45, Math.max(...linksText.map((s) => textWidthMm(s, 2.8))) + 6) : t.yLabel ? 8 : 5
  const padRight = 7
  const padTop = (t.yLabel ? 11 : 7) + extraTop
  const padBottom = 11
  const height = spec.heightMm + extraTop
  const availW = widthMm - padLeft - padRight
  const availH = height - padTop - padBottom
  const gridW = Math.floor((widthMm - 1) / 5) * 5
  const gridH = Math.floor((height - 1) / 5) * 5
  const parts: string[] = raster ? [plainGrid(0.5, 0.5, gridW, gridH, 5, false)] : []

  // Abschnitte: Breite nach Zahl der Marken, mindestens 22 mm, dazwischen 5 mm für das Bruchzeichen
  const luecke = 5
  const infos = abschnitte.map(marken)
  const summe = infos.reduce((s, i) => s + i.werte.length, 0)
  const nutzbar = availW - luecke * (abschnitte.length - 1)
  let breiten = infos.map((i) => Math.max(22, (i.werte.length / summe) * nutzbar))
  const gesamt = breiten.reduce((a, b) => a + b, 0)
  if (gesamt > nutzbar) breiten = breiten.map((b) => (b / gesamt) * nutzbar)
  const segLeft: number[] = []
  let x = padLeft
  for (const b of breiten) {
    segLeft.push(x)
    x += b + luecke
  }
  const right = padLeft + nutzbar + luecke * (abschnitte.length - 1)

  // Grundlinien: je Strang eine, sonst eine unten (mit Stufen darüber)
  const lanes = straenge.length ? straenge.length : 1
  const laneH = availH / lanes
  /*
   * Auf den Gitternetzlinien (06.10.2026, Befund der Lehrkraft: nach dem Ändern von Höhe oder Abstand lag eine
   * Leiste auf einer Linie, die andere dazwischen). Das Raster beginnt bei 0,5 mm und hat 5 mm Kästchen – jede
   * Grundlinie rastet auf die nächste Gitterlinie ein, Stufen darüber in ganzen Kästchen.
   */
  const amRaster = (y: number): number => 0.5 + Math.round((y - 0.5) / 5) * 5
  const baseline = (i: number): number =>
    amRaster(straenge.length ? padTop + (i + 1) * laneH - 9 : padTop + availH - (stufen.length ? 4 : Math.max(4, availH / 2 - 8)))
  const kaestchen = (h: number): number => Math.max(5, Math.floor(h / 5) * 5)
  const xVon = (wert: number, seg: number): number => {
    const i = infos[seg]
    return segLeft[seg] + ((wert - i.a) / Math.max(1e-9, i.b - i.a)) * breiten[seg]
  }

  for (let l = 0; l < lanes; l++) {
    const by = baseline(l)
    if (straenge.length) parts.push(text(padLeft - 2, by + 1, straenge[l], { anchor: 'end', size: 2.8, bold: true }))
    for (let s = 0; s < abschnitte.length; s++) {
      const a = abschnitte[s]
      const info = infos[s]
      const x0 = segLeft[s]
      const x1 = x0 + breiten[s]
      parts.push(line(x0, by, s === abschnitte.length - 1 ? x1 + 3 : x1, by, AXIS, 0.45))
      /*
       * Skala für das freigegebene Blatt (06.10.2026): Verbindungslinien rasten jahresgenau ein und zeigen das Jahr
       * (onlinetest/BlattAusfuellen.tsx). Unsichtbar – Wert am Anfang|am Ende|Einheit|mit Jahr.
       */
      // Jede Grundlinie (auch jeder Strang) bekommt die Skala
      parts.push(
        `<line x1="${round(x0)}" y1="${round(by)}" x2="${round(x1)}" y2="${round(by)}" stroke="none" data-skala="${info.a}|${info.b}|${a.unit}|${a.unit === 'day' && Math.abs(info.b - info.a) > 300 ? 1 : 0}"/>`
      )
      if (s === abschnitte.length - 1) parts.push(`<path d="M ${round(x1 + 3)} ${round(by)} l -1.8 -1.1 v 2.2 z" fill="${AXIS}"/>`)
      // Bruchzeichen zwischen den Abschnitten
      if (s > 0) {
        const bx = x0 - luecke / 2
        parts.push(line(bx - 1.2, by + 1.6, bx + 0.2, by - 1.6, AXIS, 0.4), line(bx - 0.2, by + 1.6, bx + 1.2, by - 1.6, AXIS, 0.4))
      }
      const mmProMarke = breiten[s] / Math.max(1, info.werte.length - 1)
      const jahre = a.unit === 'day' && Math.abs(info.b - info.a) > 300
      // Nur so viele Beschriftungen, wie nebeneinander passen (Textbreite geschätzt)
      const textBreite = Math.max(...info.werte.map((w) => textWidthMm(datumText(w, a.unit, jahre), 2.6))) + 2
      const jede = Math.max(1, Math.ceil(textBreite / Math.max(1, mmProMarke)))
      const letzte = info.werte.length - 1
      const beschriftet = (k: number): boolean => {
        if (k === letzte) return true
        if (k % jede !== 0) return false
        // Die vorletzte Beschriftung weicht dem Endpunkt, wenn beide nicht nebeneinander passen
        return xVon(info.werte[letzte], s) - xVon(info.werte[k], s) >= textBreite
      }
      info.werte.forEach((w, k) => {
        const cx = xVon(w, s)
        parts.push(line(cx, by - 1.2, cx, by + 1.2, AXIS, 0.3))
        // Beschriftung nur auf der untersten Linie
        if (l !== lanes - 1 || !beschriftet(k)) return
        const wort = datumText(w, a.unit, jahre)
        // Nach einem Bruchzeichen nicht denselben Wert noch einmal beschriften
        if (k === 0 && s > 0 && wort === datumText(infos[s - 1].werte[infos[s - 1].werte.length - 1], abschnitte[s - 1].unit, jahre)) return
        // Am linken und rechten Bildrand einrücken statt abschneiden
        const anchor = cx - textWidthMm(wort, 2.6) / 2 < 1 ? 'start' : cx + textWidthMm(wort, 2.6) / 2 > widthMm - 1 ? 'end' : 'middle'
        parts.push(text(anchor === 'start' ? cx - 1 : anchor === 'end' ? cx + 1 : cx, by + 4.6, wort, { size: 2.6, anchor }))
      })
    }
  }
  // Stufen der y-Achse (Eskalation): gestrichelte Linien über der Grundlinie, Achse mit Pfeil
  if (stufen.length || t.yLabel) {
    const by = baseline(0)
    const bandH = stufen.length ? kaestchen(Math.min(12, (by - padTop - 2) / stufen.length)) : 0
    parts.push(line(padLeft, by, padLeft, padTop - 1, AXIS, 0.4), `<path d="M ${round(padLeft)} ${round(padTop - 1)} l -1.1 1.8 h 2.2 z" fill="${AXIS}"/>`)
    stufen.forEach((s, i) => {
      const cy = by - (i + 1) * bandH
      parts.push(
        `<line x1="${round(padLeft)}" y1="${round(cy)}" x2="${round(right)}" y2="${round(cy)}" stroke="${MEDIUM}" stroke-width="0.25" stroke-dasharray="1.5 1"/>`
      )
      parts.push(text(padLeft - 1.8, cy + 1, s, { anchor: 'end', size: 2.7 }))
    })
    // Ganz oben, damit der Platz darunter (extraTop) für Beschriftungen frei bleibt
    if (t.yLabel) parts.push(text(padLeft + 2.5, Math.min(padTop - 4, 6), t.yLabel, { anchor: 'start', size: 3, bold: true }))
  }
  // Vorgegebene Ereignisse
  const stufenY = (level: number | undefined, by: number): number => {
    if (level === undefined || !stufen.length) return by
    const bandH = kaestchen(Math.min(12, (by - padTop - 2) / stufen.length))
    return by - (level + 1) * bandH
  }
  /*
   * Beschriftungen ohne Überlagerung (27.09.2026): Bei einer Material-Zeitleiste liegen
   * Ereignisse oft dicht (1., 3., 4. August 1914). Jede Beschriftung sucht sich – abwechselnd
   * über und unter dem Punkt – die erste Zeile, in der sie keine schon gesetzte überdeckt;
   * rückt sie dafür vom Punkt weg, führt eine dünne Linie zum Punkt. Am linken und rechten
   * Rand rückt der Text ein, statt abgeschnitten zu werden.
   */
  const SCHRIFT = 2.5
  const ZEILE = 3.3
  /* Obergrenze für Beschriftungen: unter der Achsenbeschriftung bzw. am Blattrand */
  const obenGrenze = t.yLabel ? 8 : 0.5
  const gesetzt: { x0: number; x1: number; y0: number; y1: number }[] = []
  // Kleine Toleranz gegen Gleitkommareste (28.300000000000004 > 28.3 wäre sonst „überdeckt")
  const frei = (x0: number, x1: number, y0: number, y1: number): boolean =>
    !gesetzt.some((g) => x0 < g.x1 + 1 - 1e-6 && x1 > g.x0 - 1 + 1e-6 && y0 < g.y1 + 0.6 - 1e-6 && y1 > g.y0 - 0.6 + 1e-6)
  let ohnePlatz = false
  const ereignisse = t.events
    .map((e, n) => {
      const seg = abschnitte.findIndex((a) => {
        const v = datumZahl(e.date, a.unit)
        const i = infos[abschnitte.indexOf(a)]
        return v !== null && v >= i.a - 1e-9 && v <= i.b + 1e-9
      })
      if (seg < 0) return null
      const v = datumZahl(e.date, abschnitte[seg].unit) ?? infos[seg].a
      const cx = xVon(v, seg)
      const by = baseline(Math.min(lanes - 1, e.strand ?? 0))
      return { e, n, cx, by, cy: stufenY(e.level, by) }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => a.cx - b.cx || a.n - b.n)
  // Die Punkte selbst sind belegt – keine Beschriftung läuft durch einen Punkt (auch nicht durch den eines anderen Ereignisses)
  for (const p of ereignisse) gesetzt.push({ x0: p.cx - 1.6, x1: p.cx + 1.6, y0: p.cy - 1.6, y1: p.cy + 1.6 })
  for (const { e, n, cx, by, cy } of ereignisse) {
    parts.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="1.2" fill="${AXIS}"/>`)
    if (cy !== by) parts.push(line(cx, cy, cx, by, STRONG, 0.25))
    const breite = textWidthMm(e.text, SCHRIFT)
    const anchor = cx - breite / 2 < padLeft - 2 ? 'start' : cx + breite / 2 > widthMm - 1.5 ? 'end' : 'middle'
    const tx = anchor === 'start' ? Math.max(1, cx - 1.5) : anchor === 'end' ? Math.min(widthMm - 1, cx + 1.5) : cx
    const x0 = anchor === 'start' ? tx : anchor === 'end' ? tx - breite : tx - breite / 2
    const x1 = x0 + breite
    // Unter der Grundlinie erst unter den Datumsmarken; über dem Punkt nur, wenn Platz bis zum Rand ist
    const untenStart = cy === by ? by + 9 : cy + 4.8
    const obenStart = cy - 2.6
    const bevorzugtOben = n % 2 === 0 || cy === by
    let platz: { ty: number; oben: boolean } | null = null
    for (let zeile = 0; zeile < 6 && !platz; zeile++) {
      for (const oben of bevorzugtOben ? [true, false] : [false, true]) {
        const ty = oben ? obenStart - zeile * ZEILE : untenStart + zeile * ZEILE
        if (oben && ty - SCHRIFT < obenGrenze) continue
        if (!oben && ty > height - 1) continue
        if (frei(x0, x1, ty - SCHRIFT, ty + 0.6)) {
          platz = { ty, oben }
          break
        }
      }
    }
    if (!platz) ohnePlatz = true
    const ty = platz?.ty ?? (bevorzugtOben && obenStart - SCHRIFT >= obenGrenze ? obenStart : untenStart)
    gesetzt.push({ x0, x1, y0: ty - SCHRIFT, y1: ty + 0.6 })
    // Weggerückt: dünne Führungslinie vom Punkt zur Beschriftung
    if (platz && ((platz.oben && ty < obenStart - 0.1) || (!platz.oben && ty > untenStart + 0.1))) {
      parts.push(line(cx, platz.oben ? cy - 1.4 : cy === by ? by + 7 : cy + 1.4, cx, platz.oben ? ty + 0.8 : ty - SCHRIFT - 0.2, STRONG, 0.25))
    }
    parts.push(text(tx, ty, e.text, { size: SCHRIFT, anchor }))
  }
  /*
   * Fand eine Beschriftung keinen Platz (dichte Ereignisse auf der obersten Stufe, wie die
   * Kriegserklärungen vom 1., 3. und 4. August 1914), bekommt die Zeichnung oben mehr Raum
   * und wird noch einmal gesetzt – höchstens fünf Zeilen mehr.
   */
  if (ohnePlatz && extraTop < 5 * ZEILE - 0.1) return zeitleiste(spec, widthMm, raster, extraTop + ZEILE)

  const frame: DiagramFrame = {
    left: padLeft,
    top: padTop,
    width: right - padLeft,
    height: availH,
    xMin: infos[0].a,
    xMax: infos[infos.length - 1].b,
    yMin: 0,
    yMax: stufen.length,
    hinweis: [
      ...abschnitte.map(
        (a, s) => `Abschnitt ${s + 1}: ${a.from} bei ${round(segLeft[s])} mm bis ${a.to} bei ${round(segLeft[s] + breiten[s])} mm (Einheit ${a.unit}, linear)`
      ),
      straenge.length
        ? `Stränge (Grundlinien): ${straenge.map((s, i) => `„${s}" bei y = ${round(baseline(i))} mm`).join(', ')}`
        : `Grundlinie bei y = ${round(baseline(0))} mm`,
      stufen.length ? `Stufen von unten nach oben: ${stufen.map((s, i) => `„${s}" bei y = ${round(stufenY(i, baseline(0)))} mm`).join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('; ')
  }
  return { svg: svgWrap(widthMm, height, parts.join('')), widthMm, heightMm: height, frame }
}

/** Zeichnet die Fläche einer Diagramm-Antwort in der angegebenen Breite. */
export function diagramDrawing(roh: DiagramSpec | undefined, widthMm: number, opts: { raster?: boolean } = {}): DiagramDrawing {
  const spec = sanitizeDiagram(roh)
  const width = Math.max(60, widthMm)
  if (spec.kind === 'klima') {
    const block = { id: '', type: 'grid', kind: 'klima', title: '', caption: '', heightMm: spec.heightMm, cellMm: 5, axes: spec.axes } as GridBlock
    const g = gridDrawing(block, width)
    return {
      ...g,
      frame: {
        left: 15,
        top: 7,
        width: g.widthMm - 32,
        height: g.heightMm - 19,
        xMin: 0,
        xMax: 12,
        yMin: spec.axes.yMin,
        yMax: spec.axes.yMax,
        hinweis: `Klimadiagramm: Monate Januar bis Dezember von links nach rechts zwischen ${15} mm und ${round(g.widthMm - 17)} mm; Temperatur ${spec.axes.yMin} °C unten (${round(g.heightMm - 12)} mm) bis ${spec.axes.yMax} °C oben (7 mm); Niederschlag rechts im Verhältnis 1 : 2`
      }
    }
  }
  if (spec.kind === 'schraegbild') return schraegbild(spec, width)
  if (spec.kind === 'zeitleiste') return zeitleiste(spec, width, opts.raster !== false)
  return kartesisch(spec, width)
}

/** SVG als data:-URL für <img>. */
export function diagramDataUrl(drawing: DiagramDrawing): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(drawing.svg)}`
}
