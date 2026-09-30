/**
 * Zeichnet eine Tafel als SVG – EINE Zeichnung für Editor, Präsentation, PDF, PNG und PowerPoint.
 *
 * Kreide-Optik: dunkelgrüne Fläche mit leichten Wischspuren, Holzrahmen und Flügelfugen bei der
 * Klapptafel, Kreidestrich über einen feinen Körnungsfilter (nicht im Editor – dort zählt das
 * flüssige Verschieben). Whiteboard und Flipchart weiß mit Markerfarben, der Hefteintrag auf
 * kariertem Papier. Gelb auf hellem Grund ist ein Textmarker hinter dunkler Schrift (R22).
 */
import { texToSvg } from '../../shared/richtext/math'
import { schaltplanZeichnen } from '../arbeitsblatt/render/schaltplanSvg'
import { farbwert, formatInfo, PALETTEN, SCHRIFTEN, ZEILENHOEHE, type Farbe, type Medium } from './formate'
import { funktionsPunkte, parseFunktion } from './funktion'
import { kastenInhalt, kastenSatz } from './kasten'
import { tabellenSpalten } from './layout'
import type { Diagramm, TbElement, TbTafel } from './model'
import { SKIZZEN, SYMBOLE } from './symbole'
import { textBreite, umbrechen } from './textsatz'
import { inAnsicht, sichtbareElemente, wortspeicher, type Ansicht } from './varianten'

export interface SvgOptionen extends Ansicht {
  /** Ohne Körnung (Editor) */
  ohneTextur?: boolean
  /** data-id an den Elementen (Editor) */
  editor?: boolean
  /** Elemente mit Befund rot umrandet */
  markiert?: string[]
  /**
   * Ohne Kreidekörnung über der Schrift (PDF): der Druck rechnet jede Musterfüllung in ein
   * seitengroßes Rasterbild um – im PDF brächte sie nur Dateigröße, keine sichtbare Körnung.
   */
  ohneKorn?: boolean
  /** Nur die Fläche, ohne Rahmen/Hintergrund (für Einbettungen) */
  ohneHintergrund?: boolean
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (v: number): string => String(Math.round(v * 10) / 10)

export interface Kontext {
  W: number
  H: number
  medium: Medium
  familie: string
  schrift: TbTafel['schrift']
  farbe: (f: Farbe) => string
  hell: boolean
  marker?: string
  tafel: string
}

/** Mehrzeiliger Text; bei Gelb auf hellem Grund Textmarker dahinter */
function zeilen(k: Kontext, liste: string[], x: number, y: number, g: number, farbe: Farbe, o: { fett?: boolean; mitte?: boolean; breite?: number } = {}): string {
  const lh = g * ZEILENHOEHE
  const fill = k.farbe(farbe)
  const teile: string[] = []
  liste.forEach((z, i) => {
    const t = z.replace(/\s+$/, '')
    if (!t) return
    const by = y + i * lh + g * 0.93
    if (farbe === 'gelb' && k.hell && k.marker) {
      const w = Math.min(o.breite ?? Infinity, textBreite(t, g, k.schrift) * (o.fett ? 1.06 : 1))
      const x0 = o.mitte ? x - w / 2 : x
      teile.push(`<rect x="${r2(x0 - g * 0.12)}" y="${r2(y + i * lh + g * 0.12)}" width="${r2(w + g * 0.24)}" height="${r2(g * 1.05)}" rx="${r2(g * 0.2)}" fill="${k.marker}" opacity="0.9"/>`)
    }
    teile.push(
      `<text x="${r2(x)}" y="${r2(by)}" font-size="${r2(g)}"${o.fett ? ' font-weight="700"' : ''}${o.mitte ? ' text-anchor="middle"' : ''} fill="${fill}" xml:space="preserve">${esc(t)}</text>`
    )
  })
  return teile.join('')
}

function rahmen(k: Kontext, e: TbElement, x: number, y: number, w: number, h: number, g: number): string {
  const art = e.rahmen ?? (e.typ === 'merksatz' ? 'doppelt' : e.typ === 'kasten' ? 'linie' : 'keiner')
  if (art === 'keiner') return ''
  const c = k.farbe(e.farbe === 'gelb' && k.hell ? 'grund' : e.farbe)
  const sw = Math.max(1.5, g * 0.075)
  const rr = art === 'wolke' ? Math.min(w, h) * 0.3 : g * 0.3
  const basis = `fill="none" stroke="${c}" stroke-width="${r2(sw)}" stroke-linejoin="round"`
  const aussen = `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(rr)}" ${basis}${art === 'gestrichelt' ? ` stroke-dasharray="${r2(g * 0.45)} ${r2(g * 0.3)}"` : ''}/>`
  if (art !== 'doppelt') return aussen
  const d = g * 0.2
  return `${aussen}<rect x="${r2(x + d)}" y="${r2(y + d)}" width="${r2(Math.max(0, w - 2 * d))}" height="${r2(Math.max(0, h - 2 * d))}" rx="${r2(rr * 0.7)}" ${basis}/>`
}

/** Symbol aus dem Vorrat in ein Quadrat zeichnen */
function symbolSvg(k: Kontext, name: string | undefined, x: number, y: number, s: number, farbe: Farbe): string {
  const z = SYMBOLE[name ?? ''] ?? SYMBOLE.idee
  const c = k.farbe(farbe)
  const f = s / 100
  return `<g transform="translate(${r2(x)} ${r2(y)}) scale(${f.toFixed(4)})" fill="none" stroke="${c}" stroke-width="${r2(Math.max(5, 7))}" stroke-linecap="round" stroke-linejoin="round">${z.d
    .map((d) => `<path d="${d}"/>`)
    .join('')}${(z.voll ?? []).map((d) => `<path d="${d}" fill="${c}" stroke="none"/>`).join('')}</g>`
}

function bildSvg(src: string, x: number, y: number, w: number, h: number): string {
  return `<image href="${esc(src)}" x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" preserveAspectRatio="xMidYMid meet"/>`
}

function kastenSvg(k: Kontext, e: TbElement, x: number, y: number, w: number, h: number): string {
  const g = (e.schrift ?? 0.05) * k.H
  const s = kastenSatz(kastenInhalt(e), w, g, k.schrift)
  const teile = [rahmen(k, e, x, y, w, h, g)]
  let ty = y + s.pad
  const mitte = e.ausrichtung === 'mitte'
  const tx = mitte ? x + w / 2 : x + s.pad
  if (s.icon) {
    teile.push(e.bild ? bildSvg(e.bild, x + s.pad, ty, s.icon, s.icon) : symbolSvg(k, e.symbol, x + s.pad, ty, s.icon, e.farbe === 'grund' ? 'gelb' : e.farbe))
  }
  if (s.titelZeilen.length) {
    const titelFarbe: Farbe = e.typ === 'text' && e.titel === 'Hausaufgabe' ? 'blau' : e.farbe
    const kopfY = s.icon ? ty + Math.max(0, (s.icon - s.titelZeilen.length * s.titelGroesse * ZEILENHOEHE) / 2) : ty
    teile.push(zeilen(k, s.titelZeilen, s.icon ? tx + s.icon + s.pad * 0.6 : tx, kopfY, s.titelGroesse, titelFarbe, { fett: true, mitte, breite: w - 2 * s.pad }))
    ty += Math.max(s.titelZeilen.length * s.titelGroesse * ZEILENHOEHE, s.icon) + g * 0.25
  } else if (s.icon) ty += s.icon + g * 0.25
  // Text: bei Kästen und Merksätzen in der Grundfarbe (lesbar), freie Texte in ihrer Farbe
  const textFarbe: Farbe = e.typ === 'text' ? e.farbe : 'grund'
  teile.push(zeilen(k, s.textZeilen, tx, ty, g, textFarbe, { mitte, breite: w - 2 * s.pad }))
  return teile.join('')
}

/** Schnittpunkt der Linie Mitte→Ziel mit dem Rand eines Rechtecks (mit etwas Abstand) */
function randPunkt(r: { x: number; y: number; w: number; h: number }, zx: number, zy: number, luft: number): { x: number; y: number } {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const dx = zx - cx
  const dy = zy - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const tx = dx ? (r.w / 2 + luft) / Math.abs(dx) : Infinity
  const ty = dy ? (r.h / 2 + luft) / Math.abs(dy) : Infinity
  const t = Math.min(tx, ty)
  return { x: cx + dx * t, y: cy + dy * t }
}

function pfeilSvg(k: Kontext, a: { x: number; y: number }, b: { x: number; y: number }, e: TbElement, g: number): string {
  const c = k.farbe(e.farbe === 'gelb' && k.hell ? 'grund' : e.farbe)
  const sw = pfeilStaerke(k)
  const art = e.pfeilArt ?? 'pfeil'
  const spitze = sw * 4.2
  const winkel = Math.atan2(b.y - a.y, b.x - a.x)
  const kopf = (p: { x: number; y: number }, w: number): string => {
    const l = { x: p.x - spitze * Math.cos(w - 0.45), y: p.y - spitze * Math.sin(w - 0.45) }
    const r = { x: p.x - spitze * Math.cos(w + 0.45), y: p.y - spitze * Math.sin(w + 0.45) }
    return `<path d="M${r2(l.x)} ${r2(l.y)}L${r2(p.x)} ${r2(p.y)}L${r2(r.x)} ${r2(r.y)}" fill="none" stroke="${c}" stroke-width="${r2(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  const teile = [`<path d="M${r2(a.x)} ${r2(a.y)}L${r2(b.x)} ${r2(b.y)}" stroke="${c}" stroke-width="${r2(sw)}" stroke-linecap="round" fill="none"/>`]
  if (art !== 'linie') teile.push(kopf(b, winkel))
  if (art === 'doppelpfeil') teile.push(kopf(a, winkel + Math.PI))
  const l = pfeilBeschriftung(k, a, b, e, g)
  if (l) {
    const x0 = l.mx - l.breite / 2 - l.gg * 0.2
    teile.push(`<rect x="${r2(x0)}" y="${r2(l.my - l.hoehe / 2)}" width="${r2(l.breite + l.gg * 0.4)}" height="${r2(l.hoehe)}" rx="${r2(l.gg * 0.2)}" fill="${k.tafel}"/>`)
    teile.push(zeilen(k, l.zeilen, l.mx, l.my - l.hoehe / 2, l.gg, l.farbe, { mitte: true }))
  }
  return teile.join('')
}

/** Strichstärke der Pfeile und Verbinder (Einheiten) */
export const pfeilStaerke = (k: Pick<Kontext, 'H' | 'medium'>): number => Math.max(2, k.H * (k.medium === 'papier' ? 0.0022 : 0.0045))

/** Beschriftung auf einer Linie: Lage (Mitte), Maße und Zeilen – für SVG und PowerPoint gleich */
export function pfeilBeschriftung(
  k: Kontext,
  a: { x: number; y: number },
  b: { x: number; y: number },
  e: TbElement,
  g: number
): { mx: number; my: number; breite: number; hoehe: number; gg: number; zeilen: string[]; farbe: Farbe } | null {
  const label = e.text.trim()
  if (!label) return null
  // Beschriftung so schmal wie die Linie (sie soll die Kästen nicht überdecken), notfalls zweizeilig
  const laenge = Math.hypot(b.x - a.x, b.y - a.y)
  const gg = Math.max(g * 0.7, Math.min(g * 0.85, (e.schrift ?? 0) * k.H || g * 0.8))
  const laengstes = Math.max(...label.split(/\s+/).map((w) => textBreite(w, gg, k.schrift)))
  const zl = umbrechen(label, Math.max(laengstes, gg * 4, laenge * 0.85), gg, k.schrift)
  const breite = Math.max(...zl.map((z) => textBreite(z, gg, k.schrift)))
  return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, breite, hoehe: zl.length * gg * ZEILENHOEHE, gg, zeilen: zl, farbe: e.farbe === 'grund' ? 'blau' : e.farbe }
}

function beschriftungUnten(k: Kontext, e: TbElement, x: number, y: number, w: number, h: number): { h: number; svg: string } {
  const t = e.text.trim()
  if (!t) return { h, svg: '' }
  const laengstes = Math.max(...t.split(/\s+/).map((x) => textBreite(x, 1, k.schrift)))
  const g = Math.min((e.schrift ?? 0.04) * k.H, w / Math.max(1, laengstes))
  const zl = umbrechen(t, w, g, k.schrift).slice(0, 2)
  const th = zl.length * g * ZEILENHOEHE
  return { h: Math.max(g, h - th), svg: zeilen(k, zl, x + w / 2, y + h - th, g, e.farbe, { mitte: true }) }
}

function skizzeSvg(k: Kontext, e: TbElement, x: number, y: number, w: number, h: number): string {
  const unten = beschriftungUnten(k, e, x, y, w, h)
  const hh = unten.h
  const c = k.farbe(e.farbe)
  const teile: string[] = []
  const v = SKIZZEN[e.vorlage ?? '']
  if (v) {
    const f = Math.min(w / 200, hh / 140)
    const ox = x + (w - 200 * f) / 2
    const oy = y + (hh - 140 * f) / 2
    teile.push(
      `<g transform="translate(${r2(ox)} ${r2(oy)}) scale(${f.toFixed(4)})" fill="none" stroke="${c}" stroke-width="${r2(Math.max(2.5, 3.2))}" stroke-linecap="round" stroke-linejoin="round">${v.d
        .map((d) => `<path d="${d}"/>`)
        .join('')}${(v.voll ?? []).map((d) => `<path d="${d}" fill="${c}" stroke="none"/>`).join('')}</g>`
    )
  }
  if (e.pfade?.length) {
    // Freie Striche: 0 … 1000 in beiden Richtungen des Elements
    const sw = Math.max(2, k.H * 0.004)
    teile.push(
      `<g transform="translate(${r2(x)} ${r2(y)}) scale(${(w / 1000).toFixed(5)} ${(hh / 1000).toFixed(5)})" fill="none" stroke="${c}" stroke-linecap="round" stroke-linejoin="round">${e.pfade
        .map((d) => `<path d="${esc(d)}" stroke-width="${r2((sw * 1000) / Math.max(1, Math.min(w, hh)))}" vector-effect="non-scaling-stroke"/>`)
        .join('')}</g>`
    )
  }
  return teile.join('') + unten.svg
}

// ---------- Diagramme ----------

function tabelleSvg(k: Kontext, e: TbElement, d: Diagramm, x: number, y: number, w: number): string {
  const g = (e.schrift ?? 0.045) * k.H
  const breiten = tabellenSpalten(d, w)
  const pad = g * 0.35
  const c = k.farbe('grund')
  const sw = Math.max(1.5, g * 0.06)
  const teile: string[] = []
  let yy = y
  const reihe = (werte: string[], gg: number, kopf: boolean): void => {
    const satz = breiten.map((b, i) => umbrechen(werte[i] ?? '', b - 2 * pad, gg, k.schrift))
    const h = Math.max(...satz.map((s) => s.length)) * gg * ZEILENHOEHE + 2 * pad
    let xx = x
    satz.forEach((s, i) => {
      const f: Farbe = kopf ? (i === 0 ? 'grund' : (['gelb', 'blau', 'orange', 'gruen'] as Farbe[])[(i - 1) % 4]) : i === 0 ? 'blau' : 'grund'
      teile.push(zeilen(k, s, xx + pad, yy + pad, gg, f, { fett: kopf || i === 0 }))
      xx += breiten[i]
    })
    yy += h
    teile.push(`<path d="M${r2(x)} ${r2(yy)}H${r2(x + w)}" stroke="${c}" stroke-width="${r2(kopf ? sw * 1.6 : sw)}"/>`)
  }
  if (d.spalten?.length) reihe(d.spalten, g * 1.05, true)
  for (const z of d.zeilen ?? []) reihe(z, g, false)
  // Senkrechte Linien
  let xx = x
  for (const b of breiten.slice(0, -1)) {
    xx += b
    teile.push(`<path d="M${r2(xx)} ${r2(y)}V${r2(yy)}" stroke="${c}" stroke-width="${r2(sw)}"/>`)
  }
  return teile.join('')
}

function zeitstrahlSvg(k: Kontext, e: TbElement, d: Diagramm, x: number, y: number, w: number, h: number): string {
  // Beschriftungen müssen in die Fläche passen: oben und unten je gut zwei Zeilen
  const nurAchse = d.eintraege.every((t) => !t.label)
  const g = Math.min((e.schrift ?? 0.045) * k.H, w >= h ? h / (nurAchse ? 3.4 : 5.6) : w / 4)
  const c = k.farbe('grund')
  const sw = Math.max(2, k.H * 0.005)
  const teile: string[] = []
  const quer = w >= h
  if (quer) {
    const ay = y + h / 2
    teile.push(`<path d="M${r2(x)} ${r2(ay)}H${r2(x + w)}" stroke="${c}" stroke-width="${r2(sw)}"/>`)
    teile.push(`<path d="M${r2(x + w - g * 0.7)} ${r2(ay - g * 0.4)}L${r2(x + w)} ${r2(ay)}L${r2(x + w - g * 0.7)} ${r2(ay + g * 0.4)}" stroke="${c}" stroke-width="${r2(sw)}" fill="none"/>`)
    // Einzug links und rechts, damit Jahreszahl und Beschriftung am Rand nicht abgeschnitten werden
    const breiteste = Math.max(g * 1.2, ...d.eintraege.map((t) => Math.min(g * 7, Math.max((t.wert ?? '').length * 0.85, t.label.length * 0.8) * g * SCHRIFTEN[k.schrift].breite)))
    const rand = breiteste / 2 + g * 0.2
    const innen = w - g * 0.9 - 2 * rand
    const gesehen = new Set<string>()
    d.eintraege.forEach((t, i) => {
      // Gleiche Marke (gleiches Jahr) nur einmal beschriften
      const schluessel = `${t.x}|${t.wert}`
      if (gesehen.has(schluessel) && !t.label) return
      gesehen.add(schluessel)
      const px = x + rand + (t.x ?? i / Math.max(1, d.eintraege.length - 1)) * innen
      teile.push(`<path d="M${r2(px)} ${r2(ay - g * 0.45)}V${r2(ay + g * 0.45)}" stroke="${k.farbe('gelb')}" stroke-width="${r2(sw * 1.3)}"/>`)
      const oben = i % 2 === 1
      if (t.wert) teile.push(zeilen(k, [t.wert], px, oben ? ay - g * 1.6 : ay + g * 0.55, g * 0.85, 'gelb', { mitte: true, fett: true }))
      if (t.label) teile.push(zeilen(k, umbrechen(t.label, g * 7, g * 0.8, k.schrift).slice(0, 1), px, oben ? ay - g * 2.65 : ay + g * 1.6, g * 0.8, 'grund', { mitte: true }))
    })
  } else {
    const ax = x + w * 0.5
    teile.push(`<path d="M${r2(ax)} ${r2(y)}V${r2(y + h)}" stroke="${c}" stroke-width="${r2(sw)}"/>`)
    teile.push(`<path d="M${r2(ax - g * 0.4)} ${r2(y + h - g * 0.7)}L${r2(ax)} ${r2(y + h)}L${r2(ax + g * 0.4)} ${r2(y + h - g * 0.7)}" stroke="${c}" stroke-width="${r2(sw)}" fill="none"/>`)
    d.eintraege.forEach((t, i) => {
      const py = y + g * 0.4 + (t.y ?? i / Math.max(1, d.eintraege.length - 1)) * (h - g * 1.8)
      teile.push(`<path d="M${r2(ax - g * 0.45)} ${r2(py)}H${r2(ax + g * 0.45)}" stroke="${k.farbe('gelb')}" stroke-width="${r2(sw * 1.3)}"/>`)
      if (t.wert) teile.push(zeilen(k, [t.wert], x, py - g * 0.55, Math.min(g * 0.8, (w * 0.45) / Math.max(2, t.wert.length * 0.6)), 'gelb', { fett: true }))
    })
  }
  return teile.join('')
}

/** „Schöne" Teilung für Achsen (1, 2, 5 × 10^n) */
function teilung(spanne: number, ziel = 8): number {
  const roh = spanne / ziel
  const p = 10 ** Math.floor(Math.log10(roh))
  const n = roh / p
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p
}

function koordinatenSvg(k: Kontext, e: TbElement, d: Diagramm, x: number, y: number, w: number, h: number): string {
  const b = d.bereich ?? { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }
  const g = (e.schrift ?? 0.04) * k.H * 0.8
  const c = k.farbe('grund')
  const sw = Math.max(1.5, k.H * 0.0035)
  const pad = g * 1.2
  const ix = x + pad
  const iy = y + pad * 0.5
  const iw = w - pad * 1.5
  const ih = h - pad * 1.5
  const sx = (v: number): number => ix + ((v - b.xMin) / (b.xMax - b.xMin || 1)) * iw
  const sy = (v: number): number => iy + ih - ((v - b.yMin) / (b.yMax - b.yMin || 1)) * ih
  const teile: string[] = []
  const tx = teilung(b.xMax - b.xMin)
  const ty = teilung(b.yMax - b.yMin)
  // Kästchenraster, sehr zart
  const raster = k.hell ? '#d7e3ef' : 'rgba(255,255,255,0.14)'
  for (let v = Math.ceil(b.xMin / tx) * tx; v <= b.xMax + 1e-9; v += tx) teile.push(`<path d="M${r2(sx(v))} ${r2(iy)}V${r2(iy + ih)}" stroke="${raster}" stroke-width="1"/>`)
  for (let v = Math.ceil(b.yMin / ty) * ty; v <= b.yMax + 1e-9; v += ty) teile.push(`<path d="M${r2(ix)} ${r2(sy(v))}H${r2(ix + iw)}" stroke="${raster}" stroke-width="1"/>`)
  const x0 = sy(Math.min(Math.max(0, b.yMin), b.yMax))
  const y0 = sx(Math.min(Math.max(0, b.xMin), b.xMax))
  const achse = (d2: string): string => `<path d="${d2}" stroke="${c}" stroke-width="${r2(sw)}" fill="none" stroke-linecap="round"/>`
  teile.push(achse(`M${r2(ix)} ${r2(x0)}H${r2(ix + iw)}M${r2(ix + iw - g * 0.5)} ${r2(x0 - g * 0.3)}L${r2(ix + iw)} ${r2(x0)}L${r2(ix + iw - g * 0.5)} ${r2(x0 + g * 0.3)}`))
  teile.push(achse(`M${r2(y0)} ${r2(iy + ih)}V${r2(iy)}M${r2(y0 - g * 0.3)} ${r2(iy + g * 0.5)}L${r2(y0)} ${r2(iy)}L${r2(y0 + g * 0.3)} ${r2(iy + g * 0.5)}`))
  const zahl = (v: number): string => String(Math.round(v * 100) / 100).replace('.', ',')
  for (let v = Math.ceil(b.xMin / tx) * tx; v <= b.xMax - tx / 2; v += tx)
    if (Math.abs(v) > 1e-9) teile.push(zeilen(k, [zahl(v)], sx(v), x0 + g * 0.15, g * 0.75, 'grund', { mitte: true }))
  for (let v = Math.ceil(b.yMin / ty) * ty; v <= b.yMax - ty / 2; v += ty)
    if (Math.abs(v) > 1e-9) teile.push(zeilen(k, [zahl(v)], y0 - g * 0.9, sy(v) - g * 0.45, g * 0.75, 'grund', { mitte: true }))
  teile.push(zeilen(k, [d.xName || 'x'], ix + iw - g * 0.4, x0 - g * 1.5, g * 0.85, 'grund', { mitte: true }))
  teile.push(zeilen(k, [d.yName || 'y'], y0 + g * 0.9, iy - g * 0.2, g * 0.85, 'grund', { mitte: true }))
  const farben: Farbe[] = ['blau', 'rot', 'gruen', 'orange']
  ;(d.funktionen ?? []).forEach((term, i) => {
    const f = parseFunktion(term)
    if (!f) return
    const farbe = farben[i % farben.length]
    for (const zug of funktionsPunkte(f, b.xMin, b.xMax, b.yMin, b.yMax)) {
      const pts = zug.filter((p) => p.y >= b.yMin - (b.yMax - b.yMin) && p.y <= b.yMax + (b.yMax - b.yMin))
      if (pts.length < 2) continue
      const pfad = pts.map((p, j) => `${j ? 'L' : 'M'}${r2(sx(p.x))} ${r2(Math.min(iy + ih + g, Math.max(iy - g, sy(p.y))))}`).join('')
      teile.push(`<path d="${pfad}" stroke="${k.farbe(farbe)}" stroke-width="${r2(sw * 1.4)}" fill="none" stroke-linejoin="round"/>`)
    }
    const lx = b.xMin + (b.xMax - b.xMin) * (0.78 - i * 0.1)
    const ly = f(lx)
    if (Number.isFinite(ly) && ly > b.yMin && ly < b.yMax) teile.push(zeilen(k, [String.fromCharCode(102 + i)], sx(lx) + g * 0.3, sy(ly) - g * 1.3, g * 0.9, farbe, { fett: true }))
  })
  for (const p of d.eintraege) {
    const px = Number(p.x)
    const py = Number(p.y)
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue
    teile.push(`<circle cx="${r2(sx(px))}" cy="${r2(sy(py))}" r="${r2(sw * 1.8)}" fill="${k.farbe('rot')}"/>`)
    if (p.label) teile.push(zeilen(k, [p.label], sx(px) + g * 0.3, sy(py) - g * 1.2, g * 0.8, 'rot'))
  }
  // Clip auf die Fläche
  return `<g><clipPath id="kc-${esc(e.id)}"><rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"/></clipPath><g clip-path="url(#kc-${esc(e.id)})">${teile.join('')}</g></g>`
}

function kreislaufSvg(k: Kontext, e: TbElement, d: Diagramm, x: number, y: number, w: number, h: number): string {
  const n = Math.max(1, d.eintraege.length)
  const g = (e.schrift ?? 0.04) * k.H * 0.85
  const cx = x + w / 2
  const cy = y + h / 2
  const rx = w / 2 - g * 3.5
  const ry = h / 2 - g * 1.2
  const teile: string[] = []
  const pkt = (i: number): { x: number; y: number } => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  }
  for (let i = 0; i < n; i++) {
    const a = pkt(i)
    const b = pkt((i + 1) % n)
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const kurz = { x: a.x + (m.x - a.x) * 0.35, y: a.y + (m.y - a.y) * 0.35 }
    const lang = { x: b.x - (b.x - m.x) * 0.35, y: b.y - (b.y - m.y) * 0.35 }
    teile.push(pfeilSvg(k, kurz, lang, { ...e, text: '', pfeilArt: 'pfeil' }, g))
    const t = d.eintraege[i]
    teile.push(zeilen(k, umbrechen(t.label, g * 7, g, k.schrift).slice(0, 3), a.x, a.y - g * 0.6, g, 'grund', { mitte: true, fett: true }))
  }
  return teile.join('')
}

/** Kartenskizze: grober Umriss (aus dem Titel gewürfelt, also stabil), Orte als Punkte */
function karteSvg(k: Kontext, e: TbElement, d: Diagramm, x: number, y: number, w: number, h: number): string {
  let s = 7
  for (const ch of e.id) s = (s * 31 + ch.charCodeAt(0)) % 9973
  const zufall = (): number => {
    s = (s * 16807) % 2147483647
    return (s % 1000) / 1000
  }
  const n = 11
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const r = 0.36 + zufall() * 0.1
    return { x: x + w / 2 + Math.cos(a) * r * w, y: y + h / 2 + Math.sin(a) * r * h }
  })
  const pfad = pts.map((p, i) => {
    const q = pts[(i + 1) % n]
    return `${i ? '' : `M${r2((p.x + q.x) / 2)} ${r2((p.y + q.y) / 2)}`}Q${r2(q.x)} ${r2(q.y)} ${r2((q.x + pts[(i + 2) % n].x) / 2)} ${r2((q.y + pts[(i + 2) % n].y) / 2)}`
  })
  const g = (e.schrift ?? 0.04) * k.H * 0.8
  const c = k.farbe('grund')
  const teile = [`<path d="${pfad.join('')}Z" fill="none" stroke="${c}" stroke-width="${r2(Math.max(2, k.H * 0.004))}"/>`]
  for (const o of d.eintraege) {
    const px = x + (o.x ?? 0.5) * w
    const py = y + (o.y ?? 0.5) * h
    teile.push(`<circle cx="${r2(px)}" cy="${r2(py)}" r="${r2(g * 0.22)}" fill="${k.farbe('rot')}"/>`)
    teile.push(zeilen(k, [o.label], px + g * 0.35, py - g * 0.6, g, 'grund'))
  }
  return teile.join('')
}

function eingebettet(svg: string, x: number, y: number, w: number, h: number, farbe: string): string {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]
  const innen = /<svg[^>]*>([\s\S]*)<\/svg>\s*$/.exec(svg)?.[1]
  if (!vb || innen === undefined) return ''
  // Schwarz des Schaltplans bzw. der Formel in die Tafelfarbe
  const umgefaerbt = innen.replace(/(stroke|fill)="(#000000|#000|black|#111|#222|#1a1a1a|currentColor)"/gi, `$1="${farbe}"`)
  return `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" style="color:${farbe}" overflow="visible">${umgefaerbt}</svg>`
}

function diagrammSvg(k: Kontext, e: TbElement, x: number, y: number, w: number, h: number): string {
  const d = e.diagramm
  if (!d) return ''
  switch (d.art) {
    case 'tabelle':
      return tabelleSvg(k, e, d, x, y, w)
    case 'zeitstrahl':
      return zeitstrahlSvg(k, e, d, x, y, w, h)
    case 'koordinatensystem':
      return koordinatenSvg(k, e, d, x, y, w, h)
    case 'kreislauf':
      return kreislaufSvg(k, e, d, x, y, w, h)
    case 'kartenskizze':
      return karteSvg(k, e, d, x, y, w, h)
    case 'schaltplan': {
      if (!d.schaltplan) return ''
      try {
        const z = schaltplanZeichnen(d.schaltplan)
        if (!z.svg) return zeilen(k, ['Schaltplan nicht zeichenbar'], x, y, (e.schrift ?? 0.04) * k.H, 'rot')
        return eingebettet(z.svg, x, y, w, h, k.farbe('grund'))
      } catch {
        return ''
      }
    }
  }
  return ''
}

function formelSvg(k: Kontext, e: TbElement, x: number, y: number, w: number, h: number): string {
  if (!e.tex?.trim()) return ''
  const m = texToSvg(e.tex, true)
  const unten = beschriftungUnten(k, e, x, y, w, h)
  const farbe = k.farbe(e.farbe)
  // Seitenverhältnis der Formel erhalten, mittig in die Fläche
  const v = m.widthEx / Math.max(0.5, m.heightEx)
  let fw = w
  let fh = fw / v
  if (fh > unten.h) {
    fh = unten.h
    fw = fh * v
  }
  return eingebettet(m.svg, x + (w - fw) / 2, y + (unten.h - fh) / 2, fw, fh, farbe) + unten.svg
}

/** Seite eines Rechtecks, an der ein Punkt liegt (Anschlussstelle eines Verbinders in PowerPoint) */
export type Kante = 'oben' | 'links' | 'unten' | 'rechts'

function kanteVon(r: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }): Kante {
  const d: [Kante, number][] = [
    ['oben', Math.abs(p.y - r.y)],
    ['unten', Math.abs(p.y - (r.y + r.h))],
    ['links', Math.abs(p.x - r.x)],
    ['rechts', Math.abs(p.x - (r.x + r.w))]
  ]
  return d.sort((x, y) => x[1] - y[1])[0][0]
}

/** Anfang und Ende eines Pfeils bzw. Verbinders (Einheiten) – für SVG und PowerPoint gleich */
export function linienPunkte(
  k: Kontext,
  e: TbElement,
  alle: Map<string, TbElement>
): { a: { x: number; y: number }; b: { x: number; y: number }; vonKante?: Kante; nachKante?: Kante } | null {
  const x = e.x * k.W
  const y = e.y * k.H
  if (e.typ === 'pfeil') return { a: { x, y }, b: { x: x + e.w * k.W, y: y + e.h * k.H } }
  const g = (e.schrift ?? 0.045) * k.H
  const von = e.von ? alle.get(e.von) : undefined
  const nach = e.nach ? alle.get(e.nach) : undefined
  if (!von) return null
  const rv = { x: von.x * k.W, y: von.y * k.H, w: von.w * k.W, h: von.h * k.H }
  const ziel = nach ? { x: (nach.x + nach.w / 2) * k.W, y: (nach.y + nach.h / 2) * k.H } : e.zielPunkt ? { x: e.zielPunkt.x * k.W, y: e.zielPunkt.y * k.H } : null
  if (!ziel) return null
  const luft = g * 0.25
  // Zu einem Punkt (Marke der Zeitleiste): vom nächsten Rand aus, möglichst waagerecht bzw. senkrecht –
  // aus der Mitte heraus liefe die Linie bei gleichen Jahren quer über den Nachbarkasten
  const kante = (v: number, a0: number, a1: number): number => Math.min(a1 - g * 0.3, Math.max(a0 + g * 0.3, v))
  const a = nach
    ? randPunkt(rv, ziel.x, ziel.y, luft)
    : ziel.x < rv.x
      ? { x: rv.x - luft, y: kante(ziel.y, rv.y, rv.y + rv.h) }
      : ziel.x > rv.x + rv.w
        ? { x: rv.x + rv.w + luft, y: kante(ziel.y, rv.y, rv.y + rv.h) }
        : ziel.y > rv.y + rv.h
          ? { x: kante(ziel.x, rv.x, rv.x + rv.w), y: rv.y + rv.h + luft }
          : ziel.y < rv.y
            ? { x: kante(ziel.x, rv.x, rv.x + rv.w), y: rv.y - luft }
            : randPunkt(rv, ziel.x, ziel.y, luft)
  const rn = nach ? { x: nach.x * k.W, y: nach.y * k.H, w: nach.w * k.W, h: nach.h * k.H } : null
  const b = rn ? randPunkt(rn, rv.x + rv.w / 2, rv.y + rv.h / 2, luft) : ziel
  return { a, b, vonKante: kanteVon(rv, a), ...(rn ? { nachKante: kanteVon(rn, b) } : {}) }
}

function elementSvg(k: Kontext, e: TbElement, alle: Map<string, TbElement>): string {
  const x = e.x * k.W
  const y = e.y * k.H
  const w = e.w * k.W
  const h = e.h * k.H
  const g = (e.schrift ?? 0.045) * k.H
  switch (e.typ) {
    case 'kasten':
    case 'merksatz':
    case 'text':
      return kastenSvg(k, e, x, y, w, h)
    case 'pfeil':
    case 'verbinder': {
      const l = linienPunkte(k, e, alle)
      return l ? pfeilSvg(k, l.a, l.b, e, g) : ''
    }
    case 'symbol': {
      const unten = beschriftungUnten(k, e, x, y, w, h)
      const s = Math.min(w, unten.h)
      if (e.bild) return bildSvg(e.bild, x + (w - s) / 2, y + (unten.h - s) / 2, s, s) + unten.svg
      return symbolSvg(k, e.symbol, x + (w - s) / 2, y + (unten.h - s) / 2, s, e.farbe) + unten.svg
    }
    case 'bild': {
      const unten = beschriftungUnten(k, e, x, y, w, h)
      return e.bild ? bildSvg(e.bild, x, y, w, unten.h) + unten.svg : ''
    }
    case 'skizze':
      return skizzeSvg(k, e, x, y, w, h)
    case 'diagramm':
      return diagrammSvg(k, e, x, y, w, h)
    case 'formel':
      return formelSvg(k, e, x, y, w, h)
  }
  return ''
}

function hintergrund(k: Kontext, t: TbTafel, textur: boolean): string {
  const { W, H } = k
  const p = PALETTEN[k.medium]
  const teile: string[] = []
  if (k.medium === 'kreide') {
    teile.push(`<rect width="${W}" height="${H}" fill="${p.hintergrund}"/>`)
    // Wischspuren: große, sehr blasse Flächen – fest verteilt, damit jede Ausgabe gleich aussieht
    const spuren = [
      [0.18, 0.3, 0.22, 0.35],
      [0.55, 0.65, 0.3, 0.3],
      [0.82, 0.25, 0.2, 0.28],
      [0.4, 0.15, 0.25, 0.2]
    ]
    for (const [sx, sy, rx, ry] of spuren) teile.push(`<ellipse cx="${r2(sx * W)}" cy="${r2(sy * H)}" rx="${r2(rx * W)}" ry="${r2(ry * H)}" fill="#ffffff" opacity="0.035"/>`)
    if (textur) teile.push(staubSvg(W, H))
    if (t.format === 'klapptafel') {
      // Fugen zwischen Mittelteil und Flügeln, Holzrahmen, Ablage
      for (const f of [0.25, 0.75]) {
        teile.push(`<rect x="${r2(f * W - H * 0.006)}" y="0" width="${r2(H * 0.012)}" height="${H}" fill="#152a1f"/>`)
        teile.push(`<rect x="${r2(f * W + H * 0.006)}" y="0" width="${r2(H * 0.003)}" height="${H}" fill="#35584a"/>`)
      }
    }
    const rb = H * (t.format === 'klapptafel' ? 0.022 : 0.016)
    teile.push(`<rect x="${r2(rb / 2)}" y="${r2(rb / 2)}" width="${r2(W - rb)}" height="${r2(H - rb)}" fill="none" stroke="${p.rahmen}" stroke-width="${r2(rb)}"/>`)
  } else if (k.medium === 'marker') {
    teile.push(`<rect width="${W}" height="${H}" fill="${p.hintergrund}"/>`)
    if (t.format === 'flipchart') {
      teile.push(`<rect width="${W}" height="${r2(H * 0.025)}" fill="#9aa3ad"/>`)
      for (const f of [0.2, 0.5, 0.8]) teile.push(`<circle cx="${r2(f * W)}" cy="${r2(H * 0.0125)}" r="${r2(H * 0.006)}" fill="#e8ebee"/>`)
    }
    teile.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#b9c0c8" stroke-width="2"/>`)
  } else {
    // Hefteintrag: kariertes Papier (5 mm), sehr zart, mit Rand
    teile.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
    const kaestchen = W / 42
    // Als EIN Linienpfad statt Muster: der PDF-Druck rechnete das Muster in ein seitengroßes Bild um
    const linien: string[] = []
    for (let x = kaestchen; x < W; x += kaestchen) linien.push(`M${r2(x)} 0V${H}`)
    for (let y = kaestchen; y < H; y += kaestchen) linien.push(`M0 ${r2(y)}H${W}`)
    teile.push(`<path d="${linien.join('')}" fill="none" stroke="#dbe7f3" stroke-width="1"/>`)
    teile.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#c9d3dd" stroke-width="2"/>`)
  }
  return teile.join('')
}

let lauf = 0

/** Fester Zufall (gleiche Textur in jeder Ausgabe) */
function wuerfel(start: number): () => number {
  let s = start
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/**
 * Kreidetextur als kleine, gekachelte Muster statt SVG-Filter (Nachbesserung 30.09.2026): Filter
 * rechnet der PDF-Druck in ein großes Bild um (2,3 MB je Datei); eine Musterkachel bleibt klein
 * und wird im PDF nur wiederholt.
 * - Körnung: winzige Flecken in der Tafelfarbe ÜBER der Schrift – auf dem Grund unsichtbar, in
 *   den Kreidestrichen wirken sie wie die raue Kreidespur.
 * - Staub: blasse, waagerecht gezogene Wischspuren und Staubkörner UNTER der Schrift.
 */
function kreideMuster(id: string, grund: string): string {
  const z = wuerfel(97)
  const korn: string[] = []
  const K = 40
  for (let i = 0; i < 150; i++) {
    const r = 0.35 + z() * 0.9
    korn.push(`<circle cx="${r2(z() * K)}" cy="${r2(z() * K)}" r="${r2(r)}" fill-opacity="${(0.3 + z() * 0.5).toFixed(2)}"/>`)
  }
  return `<pattern id="${id}-korn" width="${K}" height="${K}" patternUnits="userSpaceOnUse"><g fill="${grund}">${korn.join('')}</g></pattern>`
}

/**
 * Staub und Wischspuren direkt als Vektorformen: je Deckkraftstufe EIN Pfad (im PDF nur wenige
 * Kilobyte – einzelne Formen mit eigener Deckkraft blähten den Seiteninhalt auf).
 */
function staubSvg(W: number, H: number): string {
  const z = wuerfel(211)
  const flaeche = (W * H) / (900 * 420)
  // Ellipse aus vier Bézierbögen (Bogenbefehle zerlegt der PDF-Druck in Hunderte kleiner Stücke)
  const oval = (cx: number, cy: number, rx: number, ry: number): string => {
    const kx = rx * 0.5523
    const ky = ry * 0.5523
    const punkte = [
      [cx - rx, cy],
      [cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
      [cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
      [cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
      [cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy]
    ]
    return `M${punkte[0].map(r2).join(' ')}${punkte
      .slice(1)
      .map((c) => `C${c.map(r2).join(' ')}`)
      .join('')}Z`
  }
  const spuren: string[][] = [[], [], []]
  const koerner: string[][] = [[], [], []]
  for (let i = 0; i < Math.round(14 * flaeche); i++) spuren[i % 3].push(oval(z() * W, z() * H, 60 + z() * 180, 4 + z() * 12))
  for (let i = 0; i < Math.round(60 * flaeche); i++) {
    const r = 0.8 + z() * 1.8
    koerner[i % 3].push(oval(z() * W, z() * H, r, r))
  }
  const pfad = (d: string[], deck: number): string => (d.length ? `<path d="${d.join('')}" fill-opacity="${deck}"/>` : '')
  return `<g fill="#ffffff">${spuren.map((d, i) => pfad(d, [0.02, 0.03, 0.045][i])).join('')}${koerner
    .map((d, i) => pfad(d, [0.05, 0.08, 0.11][i]))
    .join('')}</g>`
}

/** Zeichenumgebung einer Tafel (Maße, Farben, Schrift) */
export function kontextFuer(t: TbTafel): Kontext {
  const f = formatInfo(t.format)
  const p = PALETTEN[f.medium]
  return {
    W: f.breite,
    H: f.hoehe,
    medium: f.medium,
    familie: SCHRIFTEN[t.schrift ?? 'druck'].familie,
    schrift: t.schrift ?? 'druck',
    farbe: (x) => farbwert(f.medium, x),
    hell: f.medium !== 'kreide',
    marker: p.marker,
    tafel: p.tafel
  }
}

/**
 * EIN Element allein als SVG (durchsichtig, ohne Tafel) – für die Bilder in PowerPoint (Symbol,
 * Skizze, Diagramm, Formel). `rand` in Einheiten ringsum, damit Beschriftungen am Rand nicht fehlen.
 */
export function elementBildSvg(t: TbTafel, e: TbElement, o: SvgOptionen = {}, rand = 0): { svg: string; x: number; y: number; w: number; h: number } {
  const k = kontextFuer(t)
  const alle = new Map(t.elemente.map((x) => [x.id, x]))
  const x = e.x * k.W - rand
  const y = e.y * k.H - rand
  const w = e.w * k.W + 2 * rand
  const h = e.h * k.H + 2 * rand
  const innen = elementSvg(k, inAnsicht(e, o), alle)
  // viewBox ab 0 0 (svgZuPng/svgMasse lesen die Maße daraus), das Element dorthin verschoben
  const kopf = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${r2(w)} ${r2(h)}" width="${r2(w)}" height="${r2(h)}"`
  return { svg: `${kopf} font-family="${esc(k.familie)}"><g transform="translate(${r2(-x)} ${r2(-y)})">${innen}</g></svg>`, x, y, w, h }
}

/**
 * Hintergrund einer Folie (PowerPoint): Tafelfläche mit Rahmen, Fugen, Staub bzw. Karos an ihrer
 * Stelle, ringsum `randFarbe`. Maße in Tafeleinheiten; die Schrift liegt als Text darüber.
 */
export function folienHintergrundSvg(t: TbTafel, folie: { w: number; h: number }, tafel: { x: number; y: number }, randFarbe: string): string {
  const k = kontextFuer(t)
  const fw = r2(folie.w)
  const fh = r2(folie.h)
  const flaeche = `<svg x="${r2(tafel.x)}" y="${r2(tafel.y)}" width="${k.W}" height="${k.H}" viewBox="0 0 ${k.W} ${k.H}">${hintergrund(k, t, k.medium === 'kreide')}</svg>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fw} ${fh}" width="${fw}" height="${fh}"><rect width="${fw}" height="${fh}" fill="${randFarbe}"/>${flaeche}</svg>`
}

/** Die Tafel als vollständiges SVG */
export function tafelSvg(t: TbTafel, o: SvgOptionen = {}): string {
  const f = formatInfo(t.format)
  const p = PALETTEN[f.medium]
  const k = kontextFuer(t)
  const id = `tb${(lauf++).toString(36)}`
  const textur = f.medium === 'kreide' && !o.ohneTextur
  const sichtbar = sichtbareElemente(t, o)
  const alle = new Map(t.elemente.map((e) => [e.id, e]))
  // Linien zuerst, darüber die Flächen – eine Beschriftung überdeckt nie einen Kasten
  const reihenfolge = [...sichtbar.filter((e) => e.typ === 'verbinder' || e.typ === 'pfeil'), ...sichtbar.filter((e) => e.typ !== 'verbinder' && e.typ !== 'pfeil')]
  const inhalt = reihenfolge
    .map((e) => {
      const a = inAnsicht(e, o)
      const svg = elementSvg(k, a, alle)
      const mark = o.markiert?.includes(e.id)
        ? `<rect x="${r2(e.x * k.W - 4)}" y="${r2(e.y * k.H - 4)}" width="${r2(e.w * k.W + 8)}" height="${r2(e.h * k.H + 8)}" fill="none" stroke="#e03131" stroke-width="4" stroke-dasharray="12 8"/>`
        : ''
      return o.editor ? `<g data-id="${esc(e.id)}">${svg}${mark}</g>` : svg + mark
    })
    .join('')

  // Wortspeicher unter der Tafel (Lückenfassung ★)
  const woerter = o.luecke && o.wortspeicher ? wortspeicher(t, o) : []
  let band = ''
  let hoehe = k.H
  if (woerter.length) {
    const g = f.schrift.text * k.H * 0.9
    const zl = umbrechen(`Wortspeicher:  ${woerter.join('   ·   ')}`, k.W * 0.92, g, k.schrift)
    const bh = zl.length * g * ZEILENHOEHE + g * 1.2
    band = `<rect x="0" y="${k.H}" width="${k.W}" height="${r2(bh)}" fill="${k.hell ? '#f3f6f9' : '#1b3326'}"/>${zeilen(k, zl, k.W * 0.04, k.H + g * 0.6, g, 'grund')}`
    hoehe = k.H + bh
  }

  const mitKorn = textur && !o.ohneKorn
  const defs = mitKorn ? `<defs>${kreideMuster(id, p.hintergrund)}</defs>` : ''
  const grund = o.ohneHintergrund ? '' : hintergrund(k, t, textur)
  // Körnung über der Schrift (nur auf der Tafelfläche, nicht über dem Wortspeicher)
  const rb = k.H * (t.format === 'klapptafel' ? 0.022 : 0.016)
  const korn = mitKorn
    ? `<rect x="${r2(rb)}" y="${r2(rb)}" width="${r2(k.W - 2 * rb)}" height="${r2(k.H - 2 * rb)}" fill="url(#${id}-korn)" pointer-events="none"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${k.W} ${r2(hoehe)}" width="${k.W}" height="${r2(hoehe)}" font-family="${esc(
    k.familie
  )}">${defs}${grund}<g>${inhalt}</g>${korn}${band}</svg>`
}

/** Seitenverhältnis des SVG (mit Wortspeicher etwas höher) */
export function svgMasse(svg: string): { breite: number; hoehe: number } {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  return { breite: Number(m?.[1] ?? 1600), hoehe: Number(m?.[2] ?? 900) }
}
