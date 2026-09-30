/**
 * Setzer für die Beschriftungen an einem Bild – ohne Überdeckung.
 *
 * Befund der Lehrkraft (26.09.2026, Blatt „Strahlung aus Atomkernen", M1): Teile der
 * Beschriftung waren von anderen übermalt. Ursache: Jedes Schild saß in seiner Spalte genau
 * auf der Höhe seines Bildpunkts, deckend weiß, ohne Rücksicht auf die Nachbarn. Zwei Punkte
 * auf gleicher Höhe („Strahlungsquelle" und „Betastrahlung", beide bei 50 %) ergaben zwei
 * Schilder an derselben Stelle; das obere verdeckte das untere.
 *
 * Deshalb wird hier GESETZT statt nur platziert:
 *  1. Höhe jedes Schildes schätzen (Zeilen nach Zeichen je Zeile in der 26-mm-Spalte).
 *  2. Je Seite die Schilder nach Punkthöhe ordnen und so wenig wie nötig verschieben, dass
 *     keines das andere berührt und keines über den Bildrand hinausragt.
 *  3. Ist eine Seite überfüllt, wandern Schilder ohne feste Seitenangabe – die mit dem Punkt
 *     am nächsten zur Bildmitte zuerst – auf die andere Seite.
 * Die Linie zum Punkt knickt dann (Ellbogen); liegt das Schild noch auf Punkthöhe, bleibt
 * sie waagerecht wie bisher.
 *
 * OHNE Browser-Messung: Das Druck-HTML wird als reines Markup zu PDF gedruckt, dort läuft
 * kein Skript. Die Schätzung ist bewusst großzügig (Sicherheitszuschlag), damit eher ein
 * Millimeter Luft bleibt als eine Zeile verdeckt wird.
 */
import type { ImageLabel } from '../model/types'

export interface LabelLayoutOptions {
  /** Höhe des Bildes in mm – der Bezug für alle Prozentwerte der Punkte */
  imageHeightMm: number
  /** Breite der Schilderspalte in mm (ws.css: 26 mm) */
  colWidthMm?: number
  /** Schriftgröße der Schilder in Punkt (ws.css: 8,5 pt) */
  fontPt?: number
  /** Mindestabstand zwischen zwei Schildern in mm */
  gapMm?: number
}

export interface PlacedLabel {
  id: string
  side: 'left' | 'right'
  /** Mitte des Schildes in Prozent der Bildhöhe */
  top: number
  /** Höhe des Schildes in Prozent der Bildhöhe */
  heightPct: number
  /** Geschätzte Zeilenzahl */
  lines: number
}

const PT_MM = 0.3528

/** Seite aus der Angabe oder nach der Lage des Punktes. */
export const labelSide = (label: ImageLabel): 'left' | 'right' => label.side ?? (label.x < 50 ? 'left' : 'right')

/**
 * Der rechtwinklige Leitweg einer Beschriftung (Schaltpläne, 30.09.2026): vom Punkt bis in den
 * freien Streifen, aus dem die Linie waagerecht zum Rand läuft. Gilt nur, solange er am Punkt
 * beginnt – hat die Lehrkraft den Punkt verschoben, bleibt nur der Punkt selbst.
 */
export function leitweg(label: ImageLabel): { x: number; y: number }[] {
  const r = label.route
  if (r && r.length > 1 && Math.abs(r[0].x - label.x) < 0.6 && Math.abs(r[0].y - label.y) < 0.6) return r
  return [{ x: label.x, y: label.y }]
}

/** Punkt in Prozent des Bildes */
export type Prozentpunkt = { x: number; y: number }

/**
 * Linie vom Punkt zum Schild in der Randspalte (Prozent): erst der Leitweg, dann rechtwinklig –
 * waagerecht bis kurz vor den Bildrand, senkrecht auf die Höhe des Schildes, waagerecht hinaus.
 * Liegt das Schild auf der Höhe, auf der die Linie das Bild verlässt, bleibt sie gerade.
 * Gemeinsam für Bildschirm, Druck und Word (beschriftungSvg.ts).
 */
export function spaltenLinie(label: ImageLabel, platz: { side: 'left' | 'right'; top: number }): Prozentpunkt[] {
  const links = platz.side === 'left'
  const weg = leitweg(label)
  const aus = weg[weg.length - 1]
  const rand = links ? 0 : 100
  if (Math.abs(aus.y - platz.top) < 0.05) return [...weg, { x: rand, y: aus.y }]
  const knick = links ? Math.min(aus.x, 4) : Math.max(aus.x, 96)
  return [...weg, { x: knick, y: aus.y }, { x: knick, y: platz.top }, { x: rand, y: platz.top }]
}

/** Ansatzpunkt eines Schildes am Bauteil: von Hand gesetzt oder am Punkt selbst */
export const schildAnker = (label: ImageLabel): Prozentpunkt => label.schild ?? { x: label.x, y: label.y }

/**
 * Linie eines Schildes am Bauteil, wenn Punkt und Schild getrennt verschoben wurden – sonst null
 * (das Schild steht dann direkt am Punkt). Rechtwinklig: bei Schildern über/unter dem Punkt erst
 * senkrecht, bei Schildern daneben erst waagerecht.
 */
export function bauteilLinie(label: ImageLabel): Prozentpunkt[] | null {
  const s = label.schild
  if (!s || Math.hypot(s.x - label.x, s.y - label.y) < 0.3) return null
  const p = { x: label.x, y: label.y }
  const senkrecht = label.inline === 'oben' || label.inline === 'unten'
  if (Math.abs(senkrecht ? s.x - p.x : s.y - p.y) < 0.05) return [p, s]
  return senkrecht ? [p, { x: p.x, y: s.y }, s] : [p, { x: s.x, y: p.y }, s]
}

/** „Linie begradigen": Schild so verschieben, dass die Linie gerade verläuft */
export function begradigt(label: ImageLabel): NonNullable<ImageLabel['schild']> {
  if (label.inline) {
    const s = schildAnker(label)
    return label.inline === 'oben' || label.inline === 'unten' ? { x: label.x, y: s.y } : { x: s.x, y: label.y }
  }
  const weg = leitweg(label)
  const aus = weg[weg.length - 1]
  return { x: labelSide(label) === 'left' ? 0 : 100, y: aus.y }
}

/**
 * Zeilen, die ein Text in einer Spalte belegt – gieriger Umbruch an Leerzeichen; ein Wort,
 * das länger ist als die Zeile, läuft über (bricht nicht) und zählt eine Zeile.
 */
export function estimateLines(text: string, charsPerLine: number): number {
  const woerter = text.trim().split(/\s+/).filter(Boolean)
  if (!woerter.length) return 1
  let zeilen = 1
  let breite = 0
  for (const w of woerter) {
    const l = w.length
    if (breite === 0) breite = l
    else if (breite + 1 + l <= charsPerLine) breite += 1 + l
    else {
      zeilen++
      breite = l
    }
  }
  return zeilen
}

/** Zeichen je Zeile bei proportionaler Schrift: mittlere Zeichenbreite ≈ 0,52 em, plus Innenabstand */
export function charsPerLineFor(colWidthMm: number, fontPt: number): number {
  return Math.max(6, Math.floor((colWidthMm - 1.6) / (fontPt * PT_MM * 0.52)))
}

/** Schilder einer Seite so verschieben, dass sie sich nicht berühren und im Bild bleiben. */
function stapeln(eintraege: { id: string; anchor: number; h: number }[], gap: number): Map<string, number> {
  const sortiert = [...eintraege].sort((a, b) => a.anchor - b.anchor || a.id.localeCompare(b.id))
  const mitte = sortiert.map((e) => e.anchor)
  // Von oben: jedes Schild so tief wie sein Punkt, aber unter dem Vorgänger
  for (let i = 0; i < sortiert.length; i++) {
    const h = sortiert[i].h
    mitte[i] = Math.max(mitte[i], h / 2)
    if (i > 0) mitte[i] = Math.max(mitte[i], mitte[i - 1] + sortiert[i - 1].h / 2 + gap + h / 2)
  }
  // Von unten: Läuft die Kette über den Rand, alles nach oben schieben – so weit wie nötig
  for (let i = sortiert.length - 1; i >= 0; i--) {
    const h = sortiert[i].h
    const obergrenze = i === sortiert.length - 1 ? 100 - h / 2 : mitte[i + 1] - sortiert[i + 1].h / 2 - gap - h / 2
    mitte[i] = Math.min(mitte[i], obergrenze)
    mitte[i] = Math.max(mitte[i], h / 2)
  }
  return new Map(sortiert.map((e, i) => [e.id, mitte[i]]))
}

/** Braucht diese Seite mehr Platz, als das Bild hoch ist? */
const ueberfuellt = (eintraege: { h: number }[], gap: number): boolean => eintraege.reduce((s, e) => s + e.h, 0) + Math.max(0, eintraege.length - 1) * gap > 100

export function layoutImageLabels(labels: ImageLabel[], opts: LabelLayoutOptions): Map<string, PlacedLabel> {
  const colWidthMm = opts.colWidthMm ?? 26
  const fontPt = opts.fontPt ?? 8.5
  const gapMm = opts.gapMm ?? 0.8
  const imageHeightMm = Math.max(10, opts.imageHeightMm)
  const chars = charsPerLineFor(colWidthMm, fontPt)
  const lineMm = fontPt * PT_MM * 1.15
  const prozent = (mm: number): number => (mm / imageHeightMm) * 100

  // Von Hand gesetzte Schilder bleiben, wo sie sind – gesetzt werden nur die übrigen
  const out = new Map<string, PlacedLabel>()
  const hand = labels.filter((l) => l.schild && !l.inline)
  for (const l of hand) {
    const lines = l.blank ? 1 : estimateLines(l.text, chars)
    out.set(l.id, { id: l.id, side: labelSide(l), top: Math.min(100, Math.max(0, l.schild!.y)), heightPct: prozent(lines * lineMm + 0.6 + 0.8), lines })
  }
  const eintraege = labels.filter((l) => !l.inline && !l.schild).map((l) => {
    const lines = l.blank ? 1 : estimateLines(l.text, chars)
    // Zeilen + Innenabstand (0,6 mm) + Sicherheitszuschlag (0,8 mm)
    const h = prozent(lines * lineMm + 0.6 + 0.8)
    // Mit Leitweg sitzt das Schild auf der Höhe, auf der die Linie das Bild verlässt
    const weg = leitweg(l)
    const aus = weg[weg.length - 1]
    return { id: l.id, anchor: Math.min(100, Math.max(0, aus.y)), x: aus.x, side: labelSide(l), fest: Boolean(l.side), h, lines }
  })
  const gap = prozent(gapMm)

  // Überfüllte Seite entlasten: Schilder ohne feste Seite, Punkt nahe der Mitte zuerst
  const seite = (s: 'left' | 'right') => eintraege.filter((e) => e.side === s)
  for (let runde = 0; runde < eintraege.length; runde++) {
    const volle = (['left', 'right'] as const).find((s) => ueberfuellt(seite(s), gap))
    if (!volle) break
    const andere = volle === 'left' ? 'right' : 'left'
    const kandidat = seite(volle)
      .filter((e) => !e.fest)
      .sort((a, b) => Math.abs(a.x - 50) - Math.abs(b.x - 50))[0]
    if (!kandidat) break
    const nachher = [...seite(andere), kandidat]
    // Nur wechseln, wenn die andere Seite dadurch nicht selbst überfüllt wird
    if (ueberfuellt(nachher, gap)) break
    kandidat.side = andere
  }

  for (const s of ['left', 'right'] as const) {
    const eigene = seite(s)
    const mitten = stapeln(eigene, gap)
    for (const e of eigene) out.set(e.id, { id: e.id, side: s, top: mitten.get(e.id) ?? e.anchor, heightPct: e.h, lines: e.lines })
  }
  return out
}

/**
 * Bildhöhe in mm aus Blockbreite und Seitenverhältnis. Ohne bekanntes Verhältnis wird 4:3
 * angenommen – die Schätzung darf grob sein, sie bestimmt nur, wie viel Luft gelassen wird.
 */
export function imageHeightMmFor(blockWidthMm: number, colWidthMm: number, size: { width: number; height: number } | null): number {
  const bildBreite = Math.max(20, blockWidthMm - 2 * colWidthMm)
  const verhaeltnis = size && size.width > 0 && size.height > 0 ? size.height / size.width : 3 / 4
  return bildBreite * verhaeltnis
}
