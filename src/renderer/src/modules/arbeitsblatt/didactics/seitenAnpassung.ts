import type { DesignTemplate } from '@shared/design'
import type { ImageBlock, WorksheetMeta } from '../model/types'
import { profileFromMeta } from '../render/SheetPages'
import { imageFunction } from './imageDesign'

/**
 * „Auf weniger Seiten bringen" (23.10.2026, Wunsch der Lehrkraft: Die Formatierung soll so angepasst werden, dass
 * keine Folgeseite mit nur wenigen Zeilen entsteht). Abgestimmt: Die APP probiert gemessen die Stellschrauben, die
 * KI kürzt erst, wenn das nicht reicht.
 *
 * Reihenfolge – das Unauffälligste zuerst, jede Stufe schließt die vorige ein:
 *   1. Zeilenabstand etwas enger
 *   2. Seitenrand schmaler
 *   3. Bilder kleiner – nie unter ihre Mindestbreite (ordnende Bilder wie Karten, Schemata, Zeitleisten gar nicht)
 *   4. Schrift in halben Punkten kleiner
 *
 * Grenzen (gewählt von der Lehrkraft): Schrift nicht unter 10 pt – in Klasse 5/6, bei einfacher/leichter Sprache,
 * DaZ und an Förderschulen nicht unter 12 pt; Schreiblinien bleiben (ihr Abstand hängt am Jahrgang, nicht an der
 * Schrift: `--ws-linie`); Bilder nicht unter ihre Mindestbreite. Alle Stellschrauben liegen im Design des Dokuments
 * bzw. gelten für jedes Bild nach derselben Regel – Fassungen A/B/C/D ändern sich also immer gleich.
 */

/** Die Schrift und der Zeilenabstand werden nicht weiter verkleinert, wenn Lesbarkeit für die Lerngruppe vorgeht */
function brauchtGrosseSchrift(meta: Pick<WorksheetMeta, 'grade' | 'languageMode' | 'schoolTypeId'>): boolean {
  return (
    (meta.grade > 0 && meta.grade <= 6) ||
    ['simple', 'easyOriented', 'dazA1', 'dazA2'].includes(meta.languageMode) ||
    /foerderschul|sonderschul/i.test(meta.schoolTypeId ?? '')
  )
}

export function mindestSchrift(meta: Pick<WorksheetMeta, 'grade' | 'languageMode' | 'schoolTypeId'>): number {
  return brauchtGrosseSchrift(meta) ? 12 : 10
}

export function mindestZeilenabstand(meta: Pick<WorksheetMeta, 'grade' | 'languageMode' | 'schoolTypeId'>): number {
  return brauchtGrosseSchrift(meta) ? 1.3 : 1.15
}

export const MIN_RAND_MM = 12

/** Kleinste Bildbreite in % des Satzspiegels – null: dieses Bild bleibt, wie es ist */
export function bildMindestbreite(b: Pick<ImageBlock, 'fn' | 'role' | 'side' | 'widthPercent'>): number | null {
  // Seitlich stehende Bilder richtet das Layout selbst aus
  if (b.side === 'left' || b.side === 'right') return null
  const fn = imageFunction(b as ImageBlock)
  // Karten, Schemata, Diagramme, Zeitleisten tragen Text – volle Breite (Befund Julikrise, 27.09.2026)
  if (fn === 'organisation') return null
  if (b.role === 'motivation' || fn === 'schmuck') return 25
  if (b.role === 'illustration') return 35
  return 60
}

/**
 * Alle Bilder eines Dokuments eine Stufe kleiner (höchstens um ein Viertel, nie unter die Mindestbreite) – geht durch
 * das ganze Dokument, damit es für Arbeitsblatt, Klassenarbeit, Lernzielkontrolle und Grammatiktest gleich gilt und
 * alle Fassungen gleich trifft.
 */
export function bilderVerkleinern<T>(doc: T): { doc: T; anzahl: number } {
  let anzahl = 0
  const gehe = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(gehe)
    if (!x || typeof x !== 'object') return x
    const o = x as Record<string, unknown>
    const neu: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) neu[k] = gehe(v)
    if (o.type === 'image' && typeof o.widthPercent === 'number') {
      const min = bildMindestbreite(o as unknown as ImageBlock)
      if (min !== null && o.widthPercent > min) {
        neu.widthPercent = Math.max(min, Math.round(o.widthPercent * 0.75))
        anzahl++
      }
    }
    return neu
  }
  return { doc: gehe(doc) as T, anzahl }
}

/** Eine Stufe der Anpassung – kumulativ */
export interface Stufe {
  lineHeight: number
  marginMm: number
  fontPt: number
  bilder: boolean
}

/** Wie das Blatt jetzt gesetzt ist (bei automatischer Schriftgröße die Werte des Jahrgangs) */
export function satzJetzt(ws: { meta: WorksheetMeta; design: DesignTemplate }): { fontPt: number; lineHeight: number; marginMm: number } {
  const auto = ws.design.page.autoFontSize
  const typo = auto ? profileFromMeta(ws.meta).typography : null
  return {
    fontPt: typo ? typo.fontPt : ws.design.page.baseFontPt,
    lineHeight: ws.design.page.lineHeight ?? (typo ? typo.lineHeight : 1.35),
    marginMm: ws.design.page.marginMm
  }
}

/**
 * Die Stufen in der Reihenfolge oben; die Schriftstufen in halben Punkten bis zur Grenze. Ist eine Stellschraube
 * schon an ihrer Grenze (oder darunter), bleibt sie unverändert – nie wird etwas größer.
 */
export function stufen(ws: { meta: WorksheetMeta; design: DesignTemplate }, mitBildern: boolean): Stufe[] {
  const jetzt = satzJetzt(ws)
  const lh = Math.min(jetzt.lineHeight, Math.max(mindestZeilenabstand(ws.meta), Math.round((jetzt.lineHeight - 0.1) * 100) / 100))
  const rand = Math.min(jetzt.marginMm, Math.max(MIN_RAND_MM, jetzt.marginMm - 5))
  const liste: Stufe[] = []
  const dazu = (s: Stufe): void => {
    const vorige = liste[liste.length - 1] ?? { ...jetzt, bilder: false }
    if (s.lineHeight !== vorige.lineHeight || s.marginMm !== vorige.marginMm || s.fontPt !== vorige.fontPt || s.bilder !== vorige.bilder) liste.push(s)
  }
  dazu({ ...jetzt, lineHeight: lh, bilder: false })
  dazu({ ...jetzt, lineHeight: lh, marginMm: rand, bilder: false })
  if (mitBildern) dazu({ ...jetzt, lineHeight: lh, marginMm: rand, bilder: true })
  const min = mindestSchrift(ws.meta)
  for (let f = Math.ceil(jetzt.fontPt * 2) / 2 - 0.5; f >= min; f -= 0.5) dazu({ lineHeight: lh, marginMm: rand, fontPt: f, bilder: mitBildern })
  return liste
}

/** Das Design einer Stufe – mit fester Schrift (die automatische Größe nach Jahrgang wird zur festen Zahl) */
export function designMit(design: DesignTemplate, s: Stufe): DesignTemplate {
  return { ...design, page: { ...design.page, autoFontSize: false, baseFontPt: s.fontPt, lineHeight: s.lineHeight, marginMm: s.marginMm } }
}

const zahl = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })

/** Was sich ändert – für die Rückfrage vor dem Übernehmen */
export function aenderungen(vorher: { fontPt: number; lineHeight: number; marginMm: number }, s: Stufe, bilder: number): string[] {
  const t: string[] = []
  if (s.fontPt !== vorher.fontPt) t.push(`Schrift ${zahl(vorher.fontPt)} → ${zahl(s.fontPt)} pt`)
  if (s.lineHeight !== vorher.lineHeight) t.push(`Zeilenabstand ${zahl(vorher.lineHeight)} → ${zahl(s.lineHeight)}`)
  if (s.marginMm !== vorher.marginMm) t.push(`Seitenrand ${zahl(vorher.marginMm)} → ${zahl(s.marginMm)} mm`)
  if (s.bilder && bilder) t.push(`${bilder === 1 ? 'Ein Bild' : `${bilder} Bilder`} etwas kleiner (nicht unter die Mindestgröße)`)
  return t
}
