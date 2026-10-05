/**
 * Voreinstellungen und Bereinigung für die Diagramm-Antwortform (26.09.2026).
 *
 * Alles, was die KI liefert, geht durch `sanitizeDiagram`: Ein Diagramm mit unsinnigen Achsen
 * (Schrittweite 0, Ende vor Anfang, 400 Marken) wäre auf dem Papier unbrauchbar – und der
 * Fehler fiele erst beim Ausdruck auf. Zeitangaben stehen als Text („1914-07-28", „1914",
 * „-500" für 500 v. Chr.) und werden hier in Zahlen der jeweiligen Einheit übersetzt.
 */
import { defaultAxes, sanitizeAxes } from './grid'
import type { DiagramKind, DiagramSpec, GridAxes, TimelineEvent, TimelineSection, TimelineSpec, TimelineUnit } from './types'

export const DIAGRAM_KINDS: { value: DiagramKind; label: string; hint: string }[] = [
  { value: 'koordinaten', label: 'Koordinatensystem', hint: 'Graphen zeichnen, Wertepaare eintragen' },
  { value: 'mm', label: 'Millimeterpapier mit Achsen', hint: 'Messreihen genau auftragen (Physik, Chemie)' },
  { value: 'klima', label: 'Klimadiagramm', hint: 'Temperatur und Niederschlag über zwölf Monate' },
  { value: 'schraegbild', label: 'Schrägbild (x, y, z)', hint: 'Körper und Punkte im Raum, Kavalierperspektive' },
  { value: 'spannung', label: 'Verlaufskurve (Kategorien)', hint: 'Spannungskurve, Gefühlsverlauf: Schritte auf der x-Achse' },
  { value: 'zeitleiste', label: 'Zeitleiste', hint: 'Zeitachse mit Marken, wahlweise Stufen (Eskalation), Stränge, Ereignisse' }
]

export const TIMELINE_UNITS: { value: TimelineUnit; label: string }[] = [
  { value: 'day', label: 'Tage' },
  { value: 'month', label: 'Monate' },
  { value: 'year', label: 'Jahre' }
]

export function defaultTimeline(): TimelineSpec {
  return { unit: 'year', from: '1900', to: '1950', step: 10, sections: [], yLabel: '', yLevels: [], strands: [], events: [] }
}

export function defaultDiagram(kind: DiagramKind = 'koordinaten'): DiagramSpec {
  const axes: GridAxes =
    kind === 'klima'
      ? defaultAxes('klima')
      : kind === 'mm'
        ? { ...defaultAxes('koordinaten'), xMin: 0, xMax: 10, xStep: 1, yMin: 0, yMax: 10, yStep: 1 }
        : kind === 'spannung'
          ? {
              ...defaultAxes('koordinaten'),
              xLabel: 'Handlung',
              yLabel: 'Spannung',
              xMin: 0,
              xMax: 6,
              xStep: 1,
              yMin: 0,
              yMax: 5,
              yStep: 1,
              showNumbers: false
            }
          : kind === 'schraegbild'
            ? { ...defaultAxes('koordinaten'), xLabel: 'x₂', yLabel: 'x₃', xMin: 0, xMax: 8, xStep: 1, yMin: 0, yMax: 6, yStep: 1 }
            : defaultAxes('koordinaten')
  return {
    kind,
    heightMm: kind === 'zeitleiste' ? 60 : kind === 'klima' ? 75 : 80,
    axes,
    z: { label: 'x₁', min: 0, max: 6, step: 1 },
    xCategories: kind === 'spannung' ? ['Anfang', 'Wendepunkt', 'Höhepunkt', 'Schluss'] : [],
    yLevels: kind === 'spannung' ? ['ruhig', 'angespannt', 'dramatisch'] : [],
    timeline: defaultTimeline()
  }
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const text = (v: unknown): string => String(v ?? '').trim()
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean) : [])

// ---------- Zeitangaben ----------

/** „1914-07-28" | „1914-07" | „1914" | „-500" → Bestandteile; null, wenn unlesbar */
export function parseDatum(s: string): { year: number; month: number; day: number } | null {
  const m = /^\s*(-?\d{1,12})(?:-(\d{1,2}))?(?:-(\d{1,2}))?\s*$/.exec(s ?? '')
  if (!m) return null
  const year = Number(m[1])
  const month = Math.min(12, Math.max(1, Number(m[2] ?? 1)))
  const day = Math.min(31, Math.max(1, Number(m[3] ?? 1)))
  return { year, month, day }
}

/** Datum → Zahl in der Einheit der Achse (Tage seit 1970, Monate seit Jahr 0, Jahre) */
export function datumZahl(s: string, unit: TimelineUnit): number | null {
  const d = parseDatum(s)
  if (!d) return null
  if (unit === 'year') return d.year + (d.month - 1) / 12 + (d.day - 1) / 365
  if (unit === 'month') return d.year * 12 + (d.month - 1) + (d.day - 1) / 31
  return Date.UTC(d.year, d.month - 1, d.day) / 86400000
}

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** Beschriftung einer Marke: Jahr („1914", „500 v. Chr."), Monat („Jul 1914"), Tag („28.7." bzw. mit Jahr) */
export function datumText(wert: number, unit: TimelineUnit, mitJahr = false): string {
  if (unit === 'year') {
    const j = Math.round(wert)
    const betrag = Math.abs(j)
    // Erdgeschichte: „vor 4,6 Mrd. J." statt zehnstelliger Zahlen
    if (betrag >= 1e6) {
      const zahl =
        betrag >= 1e9
          ? `${(betrag / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mrd.`
          : `${(betrag / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 0 })} Mio.`
      return j < 0 ? `vor ${zahl} J.` : `${zahl} J.`
    }
    if (j === 0 && betrag === 0) return 'heute'
    return j < 0 ? `${betrag} v. Chr.` : String(j)
  }
  if (unit === 'month') {
    const m = Math.round(wert)
    const jahr = Math.floor(m / 12)
    return `${MONATE[((m % 12) + 12) % 12]} ${jahr}`
  }
  const d = new Date(Math.round(wert) * 86400000)
  const tag = `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
  return mitJahr ? `${tag}${d.getUTCFullYear()}` : tag
}

// ---------- Bereinigung ----------

function sanitizeSection(s: Partial<TimelineSection> | undefined, fallback: TimelineSection): TimelineSection | null {
  const unit: TimelineUnit = s?.unit === 'day' || s?.unit === 'month' || s?.unit === 'year' ? s.unit : fallback.unit
  const from = text(s?.from)
  const to = text(s?.to)
  const a = datumZahl(from, unit)
  const b = datumZahl(to, unit)
  if (a === null || b === null || b <= a) return null
  let step = num(s?.step, fallback.step)
  if (step <= 0) step = 1
  // Höchstens 40 Marken je Abschnitt – sonst unleserlich
  while ((b - a) / step > 40) step *= 2
  return { from, to, unit, step }
}

export function sanitizeTimeline(t: Partial<TimelineSpec> | undefined): TimelineSpec {
  const base = defaultTimeline()
  const unit: TimelineUnit = t?.unit === 'day' || t?.unit === 'month' || t?.unit === 'year' ? t.unit : base.unit
  const haupt = sanitizeSection({ from: text(t?.from), to: text(t?.to), unit, step: num(t?.step, base.step) }, { ...base, unit }) ?? { ...base, unit }
  const sections = (Array.isArray(t?.sections) ? t.sections : [])
    .map((s) => sanitizeSection(s as Partial<TimelineSection>, haupt))
    .filter((s): s is TimelineSection => Boolean(s))
    .slice(0, 6)
  const yLevels = strings(t?.yLevels).slice(0, 8)
  const strands = strings(t?.strands).slice(0, 5)
  const events: TimelineEvent[] = (Array.isArray(t?.events) ? t.events : [])
    .map((e) => {
      const ev = e as Partial<TimelineEvent>
      const date = text(ev?.date)
      const label = text(ev?.text)
      if (!parseDatum(date) || !label) return null
      return {
        date,
        text: label,
        ...(strands.length ? { strand: Math.min(strands.length - 1, Math.max(0, Math.round(num(ev?.strand, 0)))) } : {}),
        ...(yLevels.length && typeof ev?.level === 'number' ? { level: Math.min(yLevels.length - 1, Math.max(0, Math.round(ev.level))) } : {})
      }
    })
    .filter((e): e is TimelineEvent => Boolean(e))
    .slice(0, 30)
  return { unit, from: haupt.from, to: haupt.to, step: haupt.step, sections, yLabel: text(t?.yLabel), yLevels, strands, events }
}

export function sanitizeDiagram(d: Partial<DiagramSpec> | undefined): DiagramSpec {
  const kind: DiagramKind = DIAGRAM_KINDS.some((k) => k.value === d?.kind) ? (d!.kind as DiagramKind) : 'koordinaten'
  const base = defaultDiagram(kind)
  const gridKind = kind === 'klima' ? 'klima' : 'koordinaten'
  const axes = sanitizeAxes({ ...base.axes, ...((d?.axes ?? {}) as Partial<GridAxes>) } as GridAxes, gridKind)
  const z = {
    label: text(d?.z?.label) || base.z.label,
    min: num(d?.z?.min, base.z.min),
    max: num(d?.z?.max, base.z.max),
    step: num(d?.z?.step, base.z.step)
  }
  if (z.max <= z.min) z.max = z.min + 6
  if (z.step <= 0 || (z.max - z.min) / z.step > 20) z.step = (z.max - z.min) / 6
  const xCategories = strings(d?.xCategories).slice(0, 12)
  const yLevels = strings(d?.yLevels).slice(0, 8)
  let heightMm = Math.max(30, Math.min(250, Math.round(num(d?.heightMm, base.heightMm))))
  const timeline = sanitizeTimeline(d?.timeline)
  if (kind === 'zeitleiste') {
    // Genug Platz je Strang bzw. für die Stufen
    const mindest = timeline.strands.length > 1 ? 22 * timeline.strands.length + 16 : timeline.yLevels.length ? 8 * timeline.yLevels.length + 26 : 45
    heightMm = Math.max(heightMm, mindest)
  }
  return {
    kind,
    heightMm,
    axes: kind === 'spannung' && xCategories.length ? { ...axes, xMin: 0, xMax: xCategories.length, xStep: 1 } : axes,
    z,
    xCategories: kind === 'spannung' ? (xCategories.length ? xCategories : base.xCategories) : xCategories,
    yLevels,
    timeline
  }
}
