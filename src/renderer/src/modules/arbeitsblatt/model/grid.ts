/**
 * Voreinstellungen für Gitternetze.
 *
 * Maßstäbe folgen dem, was auf Papier üblich ist: Karo 5 mm wie im Rechenheft,
 * Millimeterpapier 1 mm mit betonten Linien alle 5 und 10 mm. Beim Klimadiagramm
 * gilt die Regel von Walter und Lieth: 10 °C entsprechen 20 mm Niederschlag (1 : 2).
 */
import type { GridAxes, GridKind } from './types'

export const GRID_KINDS: { value: GridKind; label: string; hint: string }[] = [
  { value: 'karo', label: 'Karoraster (5 mm)', hint: 'Skizzen, Rechnungen, einfache Diagramme' },
  { value: 'mm', label: 'Millimeterpapier', hint: 'Messreihen genau auftragen (Physik, Chemie)' },
  { value: 'koordinaten', label: 'Koordinatensystem', hint: 'Graphen zeichnen, Wertepaare eintragen' },
  { value: 'klima', label: 'Klimadiagramm', hint: 'Temperatur und Niederschlag über zwölf Monate' }
]

const EMPTY: GridAxes = {
  xLabel: '',
  yLabel: '',
  y2Label: '',
  xMin: 0,
  xMax: 10,
  xStep: 1,
  yMin: 0,
  yMax: 10,
  yStep: 1,
  y2Min: 0,
  y2Max: 0,
  y2Step: 0,
  showNumbers: true,
  months: false
}

export function defaultAxes(kind: GridKind): GridAxes {
  if (kind === 'koordinaten') return { ...EMPTY, xLabel: 'x', yLabel: 'y' }
  if (kind === 'klima') {
    return {
      ...EMPTY,
      xLabel: 'Monat',
      yLabel: 'Temperatur in °C',
      y2Label: 'Niederschlag in mm',
      xMin: 0,
      xMax: 12,
      xStep: 1,
      yMin: -10,
      yMax: 40,
      yStep: 10,
      y2Min: -20,
      y2Max: 80,
      y2Step: 20,
      months: true
    }
  }
  return { ...EMPTY, showNumbers: false }
}

/** Kästchenweite und Höhe, mit denen ein neues Gitternetz angelegt wird. */
export function gridDefaults(kind: GridKind): { cellMm: number; heightMm: number } {
  if (kind === 'mm') return { cellMm: 1, heightMm: 80 }
  if (kind === 'klima') return { cellMm: 5, heightMm: 75 }
  if (kind === 'koordinaten') return { cellMm: 5, heightMm: 80 }
  return { cellMm: 5, heightMm: 60 }
}

export const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Sinnvolle Werte erzwingen, damit ein Gitternetz der KI nicht unbrauchbar wird. */
export function sanitizeAxes(axes: GridAxes, kind: GridKind): GridAxes {
  const base = defaultAxes(kind)
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const out: GridAxes = {
    ...base,
    ...axes,
    xMin: num(axes.xMin, base.xMin),
    xMax: num(axes.xMax, base.xMax),
    xStep: num(axes.xStep, base.xStep),
    yMin: num(axes.yMin, base.yMin),
    yMax: num(axes.yMax, base.yMax),
    yStep: num(axes.yStep, base.yStep),
    y2Min: num(axes.y2Min, base.y2Min),
    y2Max: num(axes.y2Max, base.y2Max),
    y2Step: num(axes.y2Step, base.y2Step)
  }
  if (out.xMax <= out.xMin) out.xMax = out.xMin + Math.max(1, base.xMax - base.xMin)
  if (out.yMax <= out.yMin) out.yMax = out.yMin + Math.max(1, base.yMax - base.yMin)
  // Zu viele Striche werden auf dem Papier unleserlich
  if (out.xStep <= 0 || (out.xMax - out.xMin) / out.xStep > 40) out.xStep = (out.xMax - out.xMin) / 10
  if (out.yStep <= 0 || (out.yMax - out.yMin) / out.yStep > 40) out.yStep = (out.yMax - out.yMin) / 10
  if (kind === 'klima') {
    out.months = true
    out.xMin = 0
    out.xMax = 12
    out.xStep = 1
    // Niederschlagsachse im Verhältnis 1 : 2 zur Temperatur (Walter/Lieth)
    if (out.y2Step <= 0 || (out.y2Max - out.y2Min) / out.y2Step !== (out.yMax - out.yMin) / out.yStep) {
      out.y2Min = out.yMin * 2
      out.y2Max = out.yMax * 2
      out.y2Step = out.yStep * 2
    }
  }
  return out
}
