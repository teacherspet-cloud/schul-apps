/**
 * Schaltpläne zeichnet die App selbst – nach DIN EN 60617, maßhaltig in Millimetern (30.09.2026, 2. Fassung).
 *
 * Befund der Lehrkraft (Physik): „Die Schaltzeichnungen kann man nicht erkennen … zu klein."
 * Nachgestellt zeigte sich:
 *  - Die Zeichnung hatte keine feste Größe. Sie wurde auf die Bildbreite gestreckt – und die hing
 *    von der Rolle ab: 80 % der Satzbreite, als Bild neben einer Aufgabe nur 38 %, und davon gingen
 *    noch 2 × 26 mm für die Beschriftungsspalten ab. Übrig blieben 13 mm für den ganzen Schaltplan.
 *  - Strichstärke 1,6 Einheiten, Titel 6,5 Einheiten – je nach Streckung 0,2 bis 0,6 mm bzw. 4 bis 7 pt.
 *  - Ein geschlossener Schalter war ein Strich mit drei Punkten (der mittlere = Beschriftungspunkt)
 *    und sah aus wie eine Verzweigung; Führungslinien liefen über Leitungen.
 *
 * Jetzt:
 *  - 1 Einheit der viewBox = 1 mm im Druck. Die App setzt die Bildbreite so, dass der Plan in
 *    Originalgröße (mindestens 120 mm breit, höchstens die Satzbreite) erscheint – nie daneben.
 *  - Schaltzeichen 10 mm (Lampe, Messgeräte, Motor), Widerstand 12 × 4,5 mm, Strich 0,6 mm,
 *    Buchstaben 5,6 mm, Beschriftungen 10,5 pt.
 *  - Layout aus dem Reihen-/Parallel-Baum (schaltplanNetz.ts): rechtwinklig, auf festem Raster,
 *    Batterie links (Pluspol oben), Bauteile auf oberer und unterer Leitung, Parallelzweige als
 *    Leiter mit Stromschienen. Keine Überkreuzungen möglich; Knotenpunkte entstehen nur dort, wo
 *    sich mindestens drei Leitungen treffen (aus der Geometrie gezählt).
 *  - Beschriftungen stehen DIREKT am Bauteil (über, unter bzw. neben ihm), der Platz ist im Layout
 *    reserviert – keine Führungslinien, nichts überdeckt ein Schaltzeichen.
 */
import type { ImageLabel } from '../model/types'
import {
  analysiereKreis,
  MAX_BESCHRIFTUNGEN,
  sanitizeSchaltplan,
  type AnalyseOptionen,
  type Baum,
  type SchaltArt,
  type SchaltBauteil,
  type SchaltplanSpec
} from './schaltplanNetz'

export {
  analysiereKreis,
  leseSchaltplan,
  MAX_BAUTEILE,
  MAX_BESCHRIFTUNGEN,
  MAX_KREISE,
  sanitizeSchaltplan,
  SCHALT_ARTEN,
  SCHALT_NAMEN
} from './schaltplanNetz'
export type { SchaltArt, SchaltBauteil, Schaltkreis, SchaltplanSpec } from './schaltplanNetz'

// ---------- Maße in mm ----------

/** Strichstärke der Leitungen und Schaltzeichen (≥ 0,5 mm im Druck) */
export const STRICH_MM = 0.6
/** Schriftgröße der Beschriftungen in pt – ImageLabels.tsx setzt sie so im Druck */
export const BESCHRIFTUNG_PT = 10.5
const PT_MM = 0.3528
const SCHRIFT_MM = BESCHRIFTUNG_PT * PT_MM
/** Höhe, die ein Beschriftungsschild braucht */
const SCHILD_H = SCHRIFT_MM * 1.15 + 1
/** Breite einer leeren Schreiblinie */
export const LEERLINIE_MM = 22
const SCHILD_ABSTAND = 1.2
/** Abstand zwischen Bauteil (Punkt) und Schild – ImageLabels.tsx setzt ihn genauso */
export const SCHILD_ABSTAND_MM = SCHILD_ABSTAND
const ZULEITUNG = 5 // Leitung beiderseits eines Schaltzeichens
const SCHIENE = 3.5 // Abstand der Stromschiene vom Zweiganfang
const ZWEIG_LUECKE = 4 // senkrechter Abstand paralleler Zweige (zusätzlich zu den Symbolen)
const ZWEIG_MIN = 11
const ECKE = 4 // Leitungsstück an den Ecken des Stromkreises
const MITTE_LUECKE = 6 // Abstand zwischen oberer und unterer Bauteilreihe
const MIN_BREITE = 26
const MIN_HOEHE = 28
const KREIS_LUECKE = 12
const RAND = 2
const TITEL_MM = 10 * PT_MM
/** Satzbreite des Blattes – breiter wird kein Schaltplan gedruckt */
export const SATZBREITE_MM = 170
/** Höher darf ein Bild auf dem Blatt nicht werden (ws.css: max-height 110 mm) */
export const MAX_HOEHE_MM = 110
/** Unter diesem Maßstab wären Schaltzeichen kleiner als ~8,5 mm */
const MIN_MASSSTAB = 0.85

/** Geschätzte Breite eines Beschriftungsschildes in mm (großzügig) */
export function schildBreite(text: string, leer?: boolean): number {
  if (leer) return LEERLINIE_MM + 1
  return Math.max(6, text.length * SCHRIFT_MM * 0.56 + 1.6)
}

// ---------- Geometrie ----------

type Pkt = { x: number; y: number }
type Dreh = 0 | 90 | 180 | 270
/** Lage eines lokalen Rahmens: Ursprung und Drehung (nur Drehungen – so bleiben Symbole seitenrichtig) */
interface Rahmen {
  x: number
  y: number
  rot: Dreh
}

function an(t: Rahmen, p: Pkt): Pkt {
  switch (t.rot) {
    case 0:
      return { x: t.x + p.x, y: t.y + p.y }
    case 90:
      return { x: t.x - p.y, y: t.y + p.x }
    case 180:
      return { x: t.x - p.x, y: t.y - p.y }
    case 270:
      return { x: t.x + p.y, y: t.y - p.x }
  }
}
const versetzt = (t: Rahmen, dx: number, dy = 0): Rahmen => ({ ...an(t, { x: dx, y: dy }), rot: t.rot })
const GERADE: Rahmen = { x: 0, y: 0, rot: 0 }

export interface Kasten {
  x0: number
  y0: number
  x1: number
  y1: number
}
const kastenAus = (pts: Pkt[]): Kasten => ({
  x0: Math.min(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  x1: Math.max(...pts.map((p) => p.x)),
  y1: Math.max(...pts.map((p) => p.y))
})

type Prim =
  | { k: 'l'; a: Pkt; b: Pkt; dick?: number }
  | { k: 'k'; m: Pkt; r: number; weiss?: boolean }
  | { k: 'p'; pts: Pkt[]; zu: boolean; fuell?: boolean }

// ---------- Schaltzeichen (lokal: Leitung entlang x, außen = −y) ----------

interface Symbol {
  /** Länge, die das Zeichen aus der Leitung schneidet (Anschlüsse bei ±len/2) */
  len: number
  /** Ausdehnung nach außen (−y) bzw. innen (+y) */
  auf: number
  ab: number
  prims: Prim[]
  buchstabe?: string
}

const L = (x1: number, y1: number, x2: number, y2: number, dick?: number): Prim => ({ k: 'l', a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, ...(dick ? { dick } : {}) })
const K = (x: number, y: number, r: number, weiss = false): Prim => ({ k: 'k', m: { x, y }, r, weiss })
const P = (pts: [number, number][], zu = true, fuell = false): Prim => ({ k: 'p', pts: pts.map(([x, y]) => ({ x, y })), zu, fuell })
const KONTAKT = 1.1

/** Pfeil von a nach b mit gefüllter Spitze */
function pfeil(a: Pkt, b: Pkt): Prim[] {
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
  const n = { x: -u.y, y: u.x }
  const s = 1.6
  return [
    L(a.x, a.y, b.x - u.x * s * 0.6, b.y - u.y * s * 0.6),
    P(
      [
        [b.x, b.y],
        [b.x - u.x * s + n.x * s * 0.5, b.y - u.y * s + n.y * s * 0.5],
        [b.x - u.x * s - n.x * s * 0.5, b.y - u.y * s - n.y * s * 0.5]
      ],
      true,
      true
    )
  ]
}

/** Schaltzeichen; `rueck` spiegelt gepolte Bauteile (Batterie, Diode, LED) entlang der Leitung */
function symbol(art: SchaltArt, rueck: boolean): Symbol {
  const sx = rueck ? -1 : 1
  switch (art) {
    case 'lampe': {
      const d = 5 * Math.SQRT1_2
      return { len: 10, auf: 5, ab: 5, prims: [K(0, 0, 5), L(-d, -d, d, d), L(-d, d, d, -d)] }
    }
    case 'amperemeter':
      return { len: 10, auf: 5, ab: 5, prims: [K(0, 0, 5)], buchstabe: 'A' }
    case 'voltmeter':
      return { len: 10, auf: 5, ab: 5, prims: [K(0, 0, 5)], buchstabe: 'V' }
    case 'motor':
      return { len: 10, auf: 5, ab: 5, prims: [K(0, 0, 5)], buchstabe: 'M' }
    case 'widerstand':
      return {
        len: 12,
        auf: 2.25,
        ab: 2.25,
        prims: [
          P([
            [-6, -2.25],
            [6, -2.25],
            [6, 2.25],
            [-6, 2.25]
          ])
        ]
      }
    case 'sicherung':
      return {
        len: 10,
        auf: 2,
        ab: 2,
        prims: [
          P([
            [-5, -2],
            [5, -2],
            [5, 2],
            [-5, 2]
          ]),
          L(-5, 0, 5, 0)
        ]
      }
    case 'schalter_offen': {
      // Schaltwippe um 30° abgehoben
      const w = (30 * Math.PI) / 180
      return { len: 12, auf: 6.6, ab: KONTAKT, prims: [L(-6, 0, -6 + 12.6 * Math.cos(w), -12.6 * Math.sin(w)), K(-6, 0, KONTAKT, true), K(6, 0, KONTAKT, true)] }
    }
    case 'schalter_geschlossen':
      // Wippe liegt auf dem rechten Kontakt auf – offene Kontaktkreise: deutlich keine bloße Leitung
      return { len: 12, auf: 2, ab: KONTAKT, prims: [L(-6, 0, 6.3, -KONTAKT - 0.1), K(-6, 0, KONTAKT, true), K(6, 0, KONTAKT, true)] }
    case 'taster':
      // Schließer mit Druckknopf, nicht betätigt
      return { len: 12, auf: 7.4, ab: KONTAKT, prims: [L(-7, -3, 7, -3), L(0, -3, 0, -7), L(-2.5, -7, 2.5, -7), K(-6, 0, KONTAKT, true), K(6, 0, KONTAKT, true)] }
    case 'batterie':
      // Langer dünner Strich = Pluspol (Seite „von"), kurzer dicker Strich = Minuspol
      return { len: 3.4, auf: 5, ab: 5, prims: [L(-1.7 * sx, -5, -1.7 * sx, 5), L(1.7 * sx, -2.6, 1.7 * sx, 2.6, 1.4)] }
    case 'diode':
    case 'led': {
      const prims: Prim[] = [
        L(-4, 0, 4, 0),
        P([
          [-3.5 * sx, -4],
          [-3.5 * sx, 4],
          [3.5 * sx, 0]
        ]),
        L(3.5 * sx, -4, 3.5 * sx, 4)
      ]
      if (art === 'led') prims.push(...pfeil({ x: -0.5, y: -4.6 }, { x: 2.3, y: -8.6 }), ...pfeil({ x: 2.4, y: -4.2 }, { x: 5.2, y: -8.2 }))
      return { len: 8, auf: art === 'led' ? 8.8 : 4, ab: 4, prims }
    }
    case 'klingel': {
      // Glocke: Halbkreis über dem Anschlussstrich
      const pts: [number, number][] = []
      for (let i = 0; i <= 16; i++) pts.push([-5 * Math.cos((i * Math.PI) / 16), -5 * Math.sin((i * Math.PI) / 16)])
      return { len: 10, auf: 5, ab: 0.4, prims: [L(-5, 0, 5, 0), P(pts, true)] }
    }
    case 'wechselschalter':
    case 'leitung':
      return { len: 0, auf: 0, ab: 0, prims: [] }
  }
}

// ---------- Layout des Baums ----------

interface Mass {
  w: number
  /** Ausdehnung über der Leitung (außen) bzw. darunter */
  auf: number
  ab: number
}

const beschriftet = (b: SchaltBauteil, mitSchild: boolean): boolean => mitSchild && Boolean(b.beschriftung)

function teilMass(b: SchaltBauteil, rueck: boolean, mitSchild: boolean): Mass {
  const s = symbol(b.art, rueck)
  const schild = beschriftet(b, mitSchild)
  const w = Math.max(s.len + 2 * ZULEITUNG, b.art === 'leitung' ? 14 : 0, schild ? schildBreite(b.beschriftung!, b.leer) + 2 : 0)
  return { w, auf: s.auf + (schild ? SCHILD_ABSTAND + SCHILD_H : 0), ab: s.ab }
}

const WS_LEN = 12 // Wechselschalter: Mittelkontakt bis Kontakte
const WS_ZEILE = 8 // Abstand der beiden Kontaktleitungen

function mass(b: Baum, mitSchild: boolean): Mass {
  switch (b.t) {
    case 'teil':
      return teilMass(b.b, b.rueck, mitSchild)
    case 'reihe': {
      const ms = b.k.map((k) => mass(k, mitSchild))
      return { w: ms.reduce((s, m) => s + m.w, 0), auf: Math.max(...ms.map((m) => m.auf)), ab: Math.max(...ms.map((m) => m.ab)) }
    }
    case 'parallel': {
      const ms = b.k.map((k) => mass(k, mitSchild))
      const ys = zweigHoehen(ms)
      return { w: Math.max(...ms.map((m) => m.w)) + 2 * SCHIENE, auf: ms[0].auf, ab: ys[ys.length - 1] + ms[ms.length - 1].ab }
    }
    case 'wechsel': {
      const schild = Math.max(...[b.s1, b.s2].map((s) => (beschriftet(s, mitSchild) ? schildBreite(s.beschriftung!, s.leer) + 2 : 0)))
      const hatSchild = [b.s1, b.s2].some((s) => beschriftet(s, mitSchild))
      return { w: Math.max(2 * (ZULEITUNG + WS_LEN) + 12, 2 * schild + 4), auf: 1.5 + (hatSchild ? SCHILD_ABSTAND + SCHILD_H : 0), ab: WS_ZEILE + KONTAKT }
    }
  }
}

/** Lage der Zweige einer Parallelschaltung unter der Leitung */
function zweigHoehen(ms: Mass[]): number[] {
  const ys = [0]
  for (let i = 1; i < ms.length; i++) ys.push(ys[i - 1] + Math.max(ZWEIG_MIN, ms[i - 1].ab + ZWEIG_LUECKE + ms[i].auf))
  return ys
}

export type Richtung = 'oben' | 'unten' | 'links' | 'rechts'
const RICHTUNG: Record<Dreh, Richtung> = { 0: 'oben', 90: 'rechts', 180: 'unten', 270: 'links' }

export interface GesetztesSymbol {
  key: string
  art: SchaltArt
  kasten: Kasten
  mitte: Pkt
  klemmen: Pkt[]
}
interface GesetzteBeschriftung {
  key: string
  bauteil: SchaltBauteil
  punkt: Pkt
  richtung: Richtung
  kasten: Kasten
}

class Zeichner {
  prims: Prim[] = []
  draehte: [Pkt, Pkt][] = []
  buchstaben: { p: Pkt; b: string }[] = []
  titel: { p: Pkt; text: string }[] = []
  symbole: GesetztesSymbol[] = []
  schilder: GesetzteBeschriftung[] = []
  constructor(
    readonly kreis: number,
    readonly mitSchild: boolean
  ) {}

  draht(t: Rahmen, a: Pkt, b: Pkt): void {
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01) return
    this.draehte.push([an(t, a), an(t, b)])
  }

  prim(t: Rahmen, p: Prim): void {
    if (p.k === 'l') this.prims.push({ ...p, a: an(t, p.a), b: an(t, p.b) })
    else if (p.k === 'k') this.prims.push({ ...p, m: an(t, p.m) })
    else this.prims.push({ ...p, pts: p.pts.map((q) => an(t, q)) })
  }

  /** Beschriftung außen (lokal −y) am Rand p des Bauteils – das Schild steht im Abstand davor */
  schild(t: Rahmen, b: SchaltBauteil, p: Pkt): void {
    if (!beschriftet(b, this.mitSchild)) return
    const w = schildBreite(b.beschriftung!, b.leer)
    const punkt = an(t, p)
    const q = an(t, { x: p.x, y: p.y - SCHILD_ABSTAND })
    const richtung = RICHTUNG[t.rot]
    // Die Schrift steht immer waagerecht – der Kasten dreht sich nicht mit
    const kasten: Kasten =
      richtung === 'oben'
        ? { x0: q.x - w / 2, y0: q.y - SCHILD_H, x1: q.x + w / 2, y1: q.y }
        : richtung === 'unten'
          ? { x0: q.x - w / 2, y0: q.y, x1: q.x + w / 2, y1: q.y + SCHILD_H }
          : richtung === 'links'
            ? { x0: q.x - w, y0: q.y - SCHILD_H / 2, x1: q.x, y1: q.y + SCHILD_H / 2 }
            : { x0: q.x, y0: q.y - SCHILD_H / 2, x1: q.x + w, y1: q.y + SCHILD_H / 2 }
    this.schilder.push({ key: `k${this.kreis}:${b.id}`, bauteil: b, punkt, richtung, kasten })
  }

  /** Setzt einen Teilbaum mit Leitungsanfang im Rahmenursprung, gestreckt auf `breite` */
  setze(b: Baum, t: Rahmen, breite: number): void {
    const m = mass(b, this.mitSchild)
    switch (b.t) {
      case 'teil': {
        const s = symbol(b.b.art, b.rueck)
        const mx = breite / 2
        this.draht(t, { x: 0, y: 0 }, { x: mx - s.len / 2, y: 0 })
        this.draht(t, { x: mx + s.len / 2, y: 0 }, { x: breite, y: 0 })
        const tm = versetzt(t, mx)
        for (const p of s.prims) this.prim(tm, p)
        if (s.buchstabe) this.buchstaben.push({ p: an(tm, { x: 0, y: 0 }), b: s.buchstabe })
        if (b.b.art !== 'leitung')
          this.symbole.push({
            key: `k${this.kreis}:${b.b.id}`,
            art: b.b.art,
            mitte: an(tm, { x: 0, y: 0 }),
            kasten: kastenAus([an(tm, { x: -s.len / 2, y: -s.auf }), an(tm, { x: s.len / 2, y: s.ab })]),
            klemmen: [an(tm, { x: -s.len / 2, y: 0 }), an(tm, { x: s.len / 2, y: 0 })]
          })
        this.schild(tm, b.b, { x: 0, y: -s.auf })
        return
      }
      case 'reihe': {
        const ms = b.k.map((k) => mass(k, this.mitSchild))
        const extra = (breite - m.w) / (b.k.length + 1)
        let x = extra
        this.draht(t, { x: 0, y: 0 }, { x: extra, y: 0 })
        b.k.forEach((k, i) => {
          this.setze(k, versetzt(t, x), ms[i].w)
          const ende = x + ms[i].w
          x = ende + extra
          this.draht(t, { x: ende, y: 0 }, { x: Math.min(x, breite), y: 0 })
        })
        return
      }
      case 'parallel': {
        const ms = b.k.map((k) => mass(k, this.mitSchild))
        const ys = zweigHoehen(ms)
        const innen = breite - 2 * SCHIENE
        const unten = ys[ys.length - 1]
        this.draht(t, { x: 0, y: 0 }, { x: SCHIENE, y: 0 })
        this.draht(t, { x: breite - SCHIENE, y: 0 }, { x: breite, y: 0 })
        this.draht(t, { x: SCHIENE, y: 0 }, { x: SCHIENE, y: unten })
        this.draht(t, { x: breite - SCHIENE, y: 0 }, { x: breite - SCHIENE, y: unten })
        b.k.forEach((k, i) => this.setze(k, versetzt(t, SCHIENE, ys[i]), innen))
        return
      }
      case 'wechsel': {
        const x1 = ZULEITUNG
        const k1 = x1 + WS_LEN
        const x2 = breite - ZULEITUNG
        const k2 = x2 - WS_LEN
        this.draht(t, { x: 0, y: 0 }, { x: x1, y: 0 })
        this.draht(t, { x: x2, y: 0 }, { x: breite, y: 0 })
        for (const z of [0, WS_ZEILE]) this.draht(t, { x: k1, y: z }, { x: k2, y: z })
        const wippe = (m: Pkt, ziel: Pkt): Prim => {
          const l = Math.hypot(ziel.x - m.x, ziel.y - m.y)
          // Die Wippe endet am Rand des gewählten Kontakts und liegt leicht darüber
          return L(m.x, m.y, ziel.x - ((ziel.x - m.x) / l) * KONTAKT, ziel.y - KONTAKT - 0.1)
        }
        const teile: [SchaltBauteil, number, number, 0 | 1][] = [
          [b.s1, x1, k1, b.reihe1],
          [b.s2, x2, k2, b.reihe2]
        ]
        for (const [s, mx, kx, reihe] of teile) {
          this.prim(t, wippe({ x: mx, y: 0 }, { x: kx, y: reihe * WS_ZEILE }))
          for (const p of [K(mx, 0, KONTAKT, true), K(kx, 0, KONTAKT, true), K(kx, WS_ZEILE, KONTAKT, true)]) this.prim(t, p)
          const lo = Math.min(mx, kx)
          const hi = Math.max(mx, kx)
          this.symbole.push({
            key: `k${this.kreis}:${s.id}`,
            art: 'wechselschalter',
            mitte: an(t, { x: (mx + kx) / 2, y: WS_ZEILE / 2 }),
            kasten: kastenAus([an(t, { x: lo - KONTAKT, y: -1.5 }), an(t, { x: hi + KONTAKT, y: WS_ZEILE + KONTAKT })]),
            klemmen: [an(t, { x: mx, y: 0 }), an(t, { x: kx, y: 0 }), an(t, { x: kx, y: WS_ZEILE })]
          })
          this.schild(t, s, { x: (mx + kx) / 2, y: -1.5 })
        }
        return
      }
    }
  }
}

/** Glieder der äußersten Reihe (die Leitungen rund um den Stromkreis) */
const glieder = (b: Baum): Baum[] => (b.t === 'reihe' ? b.k : [b])
const alsReihe = (k: Baum[]): Baum | null => (k.length === 0 ? null : k.length === 1 ? k[0] : { t: 'reihe', k, ord: k[0].ord })

interface KreisLayout {
  zeichner: Zeichner
  /** Umriss inkl. Beschriftungen (ohne Titel), lokale Koordinaten – obere Leitung bei y = 0 */
  kasten: Kasten
  /** Mitte der Leitungen – dort steht der Titel */
  mitteX: number
  titel?: string
}

/** Ein Schaltkreis als Rechteck: Batterie links, obere Leitung nach rechts, untere zurück */
function kreisLayout(quelle: SchaltBauteil, baum: Baum, titel: string | undefined, kreis: number, mitSchild: boolean): KreisLayout {
  const z = new Zeichner(kreis, mitSchild)
  const g = glieder(baum)
  // Aufteilung oben/unten: die längere Leitung so kurz wie möglich, oben eher mehr
  let best = { k: g.length, wert: Infinity }
  for (let k = Math.ceil(g.length / 2); k <= g.length; k++) {
    const wo = alsReihe(g.slice(0, k))
    const wu = alsReihe(g.slice(k))
    const wert = Math.max(wo ? mass(wo, mitSchild).w : 0, wu ? mass(wu, mitSchild).w : 0)
    if (wert < best.wert - 0.01) best = { k, wert }
  }
  const oben = alsReihe(g.slice(0, best.k))!
  const unten = alsReihe(g.slice(best.k))
  const mo = mass(oben, mitSchild)
  const mu = unten ? mass(unten, mitSchild) : { w: 0, auf: 0, ab: 0 }
  const qs = symbol('batterie', true)

  const innen = Math.max(mo.w, mu.w, MIN_BREITE)
  const breite = innen + 2 * ECKE
  const hoehe = Math.max(MIN_HOEHE, mo.ab + MITTE_LUECKE + mu.ab, qs.len + 2 * ZULEITUNG + 6)

  // Rahmen: Ecke oben links = (0, 0)
  z.draht(GERADE, { x: 0, y: 0 }, { x: ECKE, y: 0 })
  z.setze(oben, { x: ECKE, y: 0, rot: 0 }, innen)
  z.draht(GERADE, { x: ECKE + innen, y: 0 }, { x: breite, y: 0 })
  z.draht(GERADE, { x: breite, y: 0 }, { x: breite, y: hoehe })
  // Untere Leitung von rechts nach links (um 180° gedreht: Beschriftungen außen, Zweige nach innen)
  z.draht(GERADE, { x: breite, y: hoehe }, { x: breite - ECKE, y: hoehe })
  if (unten) z.setze(unten, { x: breite - ECKE, y: hoehe, rot: 180 }, innen)
  else z.draht(GERADE, { x: breite - ECKE, y: hoehe }, { x: ECKE, y: hoehe })
  z.draht(GERADE, { x: ECKE, y: hoehe }, { x: 0, y: hoehe })
  // Batterie links, vom Minuspol (unten) zum Pluspol (oben) – also „rückwärts" durchlaufen
  z.setze({ t: 'teil', b: quelle, rueck: true, ord: 0 }, { x: 0, y: hoehe, rot: 270 }, hoehe)

  const kasten: Kasten = {
    x0: Math.min(-qs.auf - 1, ...z.schilder.map((s) => s.kasten.x0)),
    y0: Math.min(-mo.auf, ...z.schilder.map((s) => s.kasten.y0)),
    x1: Math.max(breite + 1, ...z.schilder.map((s) => s.kasten.x1)),
    y1: Math.max(hoehe + mu.auf, ...z.schilder.map((s) => s.kasten.y1))
  }
  if (titel) {
    const tb = titel.length * TITEL_MM * 0.55
    kasten.x0 = Math.min(kasten.x0, breite / 2 - tb / 2)
    kasten.x1 = Math.max(kasten.x1, breite / 2 + tb / 2)
  }
  return { zeichner: z, kasten, mitteX: breite / 2, ...(titel ? { titel } : {}) }
}

// ---------- Gesamtzeichnung ----------

export interface SchaltplanGeometrie {
  symbole: GesetztesSymbol[]
  draehte: [Pkt, Pkt][]
  knoten: Pkt[]
  schilder: { key: string; text: string; leer: boolean; kasten: Kasten; richtung: Richtung }[]
  titel: Kasten[]
}

export interface SchaltplanZeichnung {
  svg: string
  /** Maße in mm (= Einheiten der viewBox) */
  breite: number
  hoehe: number
  /** Beschriftungen direkt am Bauteil – Prozent der Bildmaße */
  labels: ImageLabel[]
  /** Anker (Bauteilmitten und Beschriftungspunkte) in Prozent – für die Prüfung auf verwaiste Punkte */
  anker: { key: string; art: string; x: number; y: number }[]
  /** Umriss jedes Bauteils in Prozent – zum Einrasten und für die Prüfung */
  bauteile: { key: string; art: string; kasten: Kasten }[]
  /** Maße und Lage aller Teile in mm – für die Prüfungen */
  geometrie: SchaltplanGeometrie
  /** Gründe, warum sich der Plan nicht zeichnen ließ (dann ist `svg` leer) */
  fehler: string[]
  /** Nicht zeichenbar (Topologie) oder zu groß für das Blatt */
  zuKomplex: boolean
}

const r2 = (v: number): number => Math.round(v * 100) / 100
const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const schluessel = (p: Pkt): string => `${Math.round(p.x * 100)}|${Math.round(p.y * 100)}`

/** Knotenpunkte: wo sich mindestens drei Leitungen treffen (Enden zählen 1, Durchgänge 2) */
export function knotenpunkte(draehte: [Pkt, Pkt][]): Pkt[] {
  const grad = new Map<string, { p: Pkt; n: number }>()
  const zaehle = (p: Pkt, n: number): void => {
    const k = schluessel(p)
    grad.set(k, { p: grad.get(k)?.p ?? p, n: (grad.get(k)?.n ?? 0) + n })
  }
  for (const [a, b] of draehte) {
    zaehle(a, 1)
    zaehle(b, 1)
  }
  for (const { p } of [...grad.values()]) {
    for (const [a, b] of draehte) {
      const innen =
        (Math.abs(a.x - b.x) < 0.01 && Math.abs(p.x - a.x) < 0.01 && p.y > Math.min(a.y, b.y) + 0.01 && p.y < Math.max(a.y, b.y) - 0.01) ||
        (Math.abs(a.y - b.y) < 0.01 && Math.abs(p.y - a.y) < 0.01 && p.x > Math.min(a.x, b.x) + 0.01 && p.x < Math.max(a.x, b.x) - 0.01)
      if (innen) zaehle(p, 2)
    }
  }
  return [...grad.values()].filter((g) => g.n >= 3).map((g) => g.p)
}

export interface ZeichenOptionen extends AnalyseOptionen {
  /** Nur Zeichnung, keine Beschriftungen (die Aufgabe bietet dann die Schreiblinien) */
  ohneBeschriftung?: boolean
}

const ohneBild = (fehler: string[], zuKomplex: boolean): SchaltplanZeichnung => ({
  svg: '',
  breite: 0,
  hoehe: 0,
  labels: [],
  anker: [],
  bauteile: [],
  geometrie: { symbole: [], draehte: [], knoten: [], schilder: [], titel: [] },
  fehler,
  zuKomplex
})

/**
 * Zeichnet den Schaltplan (1 Einheit = 1 mm) und setzt die Beschriftungen an die Bauteile.
 * Ist ein Kreis elektrisch fehlerhaft oder zu komplex, entsteht KEIN Bild, sondern eine Meldung.
 */
export function schaltplanZeichnen(spec: SchaltplanSpec, opts: ZeichenOptionen = {}): SchaltplanZeichnung {
  const fehler: string[] = []
  let zuKomplex = false
  const layouts: KreisLayout[] = []
  // Beschriftungen über die Obergrenze hinaus fallen weg (die ersten bleiben)
  let schilder = 0
  const erlaubt = new Set<SchaltBauteil>()
  for (const k of spec.kreise) for (const b of k.bauteile) if (b.beschriftung && schilder++ < MAX_BESCHRIFTUNGEN) erlaubt.add(b)
  const pruefe = (b: SchaltBauteil): SchaltBauteil => (erlaubt.has(b) ? b : { ...b, beschriftung: undefined })
  const nurErlaubt = (b: Baum): Baum =>
    b.t === 'teil' ? { ...b, b: pruefe(b.b) } : b.t === 'wechsel' ? { ...b, s1: pruefe(b.s1), s2: pruefe(b.s2) } : { ...b, k: b.k.map(nurErlaubt) }
  spec.kreise.forEach((k, i) => {
    const a = analysiereKreis(k, { ...spec.erlaubt, ...opts }, i + 1)
    if (a.zuKomplex) zuKomplex = true
    fehler.push(...a.fehler)
    if (a.fehler.length || !a.baum || !a.quelle) return
    layouts.push(kreisLayout(pruefe(a.quelle), nurErlaubt(a.baum), k.titel, i, !opts.ohneBeschriftung))
  })
  if (fehler.length || !layouts.length) return ohneBild(fehler.length ? fehler : ['Kein Schaltkreis.'], zuKomplex)

  // Nebeneinander, solange es in die Satzbreite passt – sonst untereinander
  const titelH = layouts.some((l) => l.titel) ? 2 + TITEL_MM * 1.3 : 0
  const breiten = layouts.map((l) => l.kasten.x1 - l.kasten.x0)
  const nebeneinander = breiten.reduce((s, b) => s + b, 0) + (layouts.length - 1) * KREIS_LUECKE + 2 * RAND <= SATZBREITE_MM
  const gesamtB = nebeneinander ? breiten.reduce((s, b) => s + b, 0) + (layouts.length - 1) * KREIS_LUECKE : Math.max(...breiten)
  // Nebeneinander stehen die oberen Leitungen auf einer Höhe, die Titel auf einer Grundlinie
  const oben = Math.min(...layouts.map((l) => l.kasten.y0))
  const unten = Math.max(...layouts.map((l) => l.kasten.y1))
  const versatz: Pkt[] = []
  const titelY: number[] = []
  let x = RAND
  let y = RAND
  for (const l of layouts) {
    const b = l.kasten.x1 - l.kasten.x0
    if (nebeneinander) {
      versatz.push({ x: x - l.kasten.x0, y: RAND - oben })
      titelY.push(unten + 2 + TITEL_MM)
      x += b + KREIS_LUECKE
    } else {
      versatz.push({ x: RAND + (gesamtB - b) / 2 - l.kasten.x0, y: y - l.kasten.y0 })
      titelY.push(l.kasten.y1 + 2 + TITEL_MM)
      y += l.kasten.y1 - l.kasten.y0 + titelH + KREIS_LUECKE
    }
  }
  for (const [i, l] of layouts.entries()) if (l.titel) l.zeichner.titel.push({ p: { x: l.mitteX, y: titelY[i] }, text: l.titel })
  const breite = gesamtB + 2 * RAND
  const hoehe = nebeneinander ? unten - oben + titelH + 2 * RAND : y - KREIS_LUECKE + RAND

  // Zu groß für das Blatt? Die Schaltzeichen würden unter ~8,5 mm schrumpfen
  const massstab = Math.min(1, SATZBREITE_MM / breite, MAX_HOEHE_MM / hoehe)
  if (massstab < MIN_MASSSTAB) {
    return ohneBild(
      [
        `Der Schaltplan wäre ${Math.round(breite)} × ${Math.round(hoehe)} mm groß – auf dem Blatt müsste er auf ${Math.round(massstab * 100)} % verkleinert werden, und die Schaltzeichen wären nicht mehr gut erkennbar. Abhilfe: weniger Bauteile oder nur ein Schaltkreis je Bild.`
      ],
      true
    )
  }

  const geo: SchaltplanGeometrie = { symbole: [], draehte: [], knoten: [], schilder: [], titel: [] }
  const zeichen: string[] = []
  const dicke: string[] = []
  const weiss: string[] = []
  const texte: string[] = []
  const labels: ImageLabel[] = []
  const anker: SchaltplanZeichnung['anker'] = []
  const px = (v: number): number => r2((v / breite) * 100)
  const py = (v: number): number => r2((v / hoehe) * 100)
  const pt = (p: Pkt, o: Pkt): Pkt => ({ x: p.x + o.x, y: p.y + o.y })
  const kas = (k: Kasten, o: Pkt): Kasten => ({ x0: k.x0 + o.x, y0: k.y0 + o.y, x1: k.x1 + o.x, y1: k.y1 + o.y })

  layouts.forEach((l, i) => {
    const o = versatz[i]
    const z = l.zeichner
    for (const [a, b] of z.draehte) geo.draehte.push([pt(a, o), pt(b, o)])
    for (const p of z.prims) {
      if (p.k === 'l') {
        const a = pt(p.a, o)
        const b = pt(p.b, o)
        const s = `<line x1="${r2(a.x)}" y1="${r2(a.y)}" x2="${r2(b.x)}" y2="${r2(b.y)}"${p.dick ? ` stroke-width="${p.dick}" stroke-linecap="butt"` : ''}/>`
        ;(p.dick ? dicke : zeichen).push(s)
      } else if (p.k === 'k') {
        const m = pt(p.m, o)
        ;(p.weiss ? weiss : zeichen).push(`<circle cx="${r2(m.x)}" cy="${r2(m.y)}" r="${p.r}"${p.weiss ? ' fill="#fff"' : ''}/>`)
      } else {
        const pts = p.pts
          .map((q) => pt(q, o))
          .map((q) => `${r2(q.x)},${r2(q.y)}`)
          .join(' ')
        zeichen.push(p.zu ? `<polygon points="${pts}"${p.fuell ? ' fill="#000"' : ''}/>` : `<polyline points="${pts}"/>`)
      }
    }
    for (const b of z.buchstaben) {
      const p = pt(b.p, o)
      texte.push(`<text x="${r2(p.x)}" y="${r2(p.y + 2)}" text-anchor="middle" font-size="5.6" font-weight="700">${b.b}</text>`)
    }
    for (const t of z.titel) {
      const p = pt(t.p, o)
      texte.push(`<text x="${r2(p.x)}" y="${r2(p.y)}" text-anchor="middle" font-size="${r2(TITEL_MM)}">${escapeXml(t.text)}</text>`)
      const tb = t.text.length * TITEL_MM * 0.55
      geo.titel.push({ x0: p.x - tb / 2, y0: p.y - TITEL_MM, x1: p.x + tb / 2, y1: p.y + TITEL_MM * 0.3 })
    }
    for (const s of z.symbole) {
      const m = pt(s.mitte, o)
      geo.symbole.push({ ...s, mitte: m, kasten: kas(s.kasten, o), klemmen: s.klemmen.map((k) => pt(k, o)) })
      anker.push({ key: s.key, art: s.art, x: px(m.x), y: py(m.y) })
    }
    for (const s of z.schilder) {
      const p = pt(s.punkt, o)
      geo.schilder.push({ key: s.key, text: s.bauteil.beschriftung ?? '', leer: Boolean(s.bauteil.leer), kasten: kas(s.kasten, o), richtung: s.richtung })
      anker.push({ key: `${s.key}:schild`, art: s.bauteil.art, x: px(p.x), y: py(p.y) })
      labels.push({
        id: `sp-${s.key}`,
        text: s.bauteil.beschriftung ?? '',
        x: px(p.x),
        y: py(p.y),
        inline: s.richtung,
        ...(s.bauteil.leer ? { blank: true } : {})
      })
    }
  })
  geo.knoten = knotenpunkte(geo.draehte)

  const pfad = geo.draehte.map(([a, b]) => `M${r2(a.x)} ${r2(a.y)}L${r2(b.x)} ${r2(b.y)}`).join('')
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(breite)} ${r2(hoehe)}" width="${r2(breite)}mm" height="${r2(hoehe)}mm">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<g fill="none" stroke="#000" stroke-width="${STRICH_MM}" stroke-linecap="round" stroke-linejoin="round">`,
    `<path d="${pfad}"/>${zeichen.join('')}${dicke.join('')}${weiss.join('')}</g>`,
    `<g fill="#000">${geo.knoten.map((p) => `<circle cx="${r2(p.x)}" cy="${r2(p.y)}" r="0.9"/>`).join('')}</g>`,
    `<g font-family="Arial, Helvetica, sans-serif" fill="#000">${texte.join('')}</g>`,
    `</svg>`
  ].join('')
  const bauteile = geo.symbole.map((x) => ({ key: x.key, art: x.art, kasten: { x0: px(x.kasten.x0), y0: py(x.kasten.y0), x1: px(x.kasten.x1), y1: py(x.kasten.y1) } }))
  return { svg, breite: r2(breite), hoehe: r2(hoehe), labels, anker, bauteile, geometrie: geo, fehler: [], zuKomplex: false }
}

/**
 * Bildbreite in Prozent der Satzbreite, bei der der Plan in Originalgröße erscheint:
 * mindestens 120 mm (höchstens 1,4-fach vergrößert), höchstens die Satzbreite und 110 mm Höhe.
 */
export function schaltplanBreiteProzent(z: Pick<SchaltplanZeichnung, 'breite' | 'hoehe'>): number {
  const ziel = Math.max(z.breite, Math.min(120, z.breite * 1.4))
  const hoechstens = Math.floor((Math.min(SATZBREITE_MM, (MAX_HOEHE_MM * z.breite) / z.hoehe) / SATZBREITE_MM) * 100)
  return Math.max(20, Math.min(100, hoechstens, Math.ceil((ziel / SATZBREITE_MM) * 100)))
}

/** Die Zeichnung als Bildadresse (base64 – so liest `imageSizeFromDataUrl` das Seitenverhältnis) */
export function schaltplanDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:image/svg+xml;base64,${btoa(bin)}`
}

/** SVG-Text aus einer Bildadresse (base64 oder URL-kodiert) */
export function svgAusDataUrl(dataUrl: string): string | null {
  const komma = dataUrl.indexOf(',')
  if (!/^data:image\/svg/i.test(dataUrl) || komma < 0) return null
  const kopf = dataUrl.slice(0, komma)
  const body = dataUrl.slice(komma + 1)
  if (!/;base64/i.test(kopf)) return decodeURIComponent(body)
  return new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))
}

/**
 * Prüfung: Beschriftungspunkte, die an keinem Bauteil ankern („verwaist").
 * Toleranz 1,5 Prozentpunkte. Maßgeblich ist die Fassung, deren Maße das gespeicherte Bild hat
 * (mit oder ohne Beschriftungen gezeichnet). Passt keine – ein älteres, anders gezeichnetes
 * Bild –, lässt sich nichts sagen.
 */
export function verwaisteBeschriftungen(spec: SchaltplanSpec, labels: ImageLabel[], bild?: { width: number; height: number } | null): ImageLabel[] {
  const passt = passendeFassung(spec, bild)
  if (!passt) return []
  const amBauteil = (l: ImageLabel): boolean => passt.bauteile.some(({ kasten: k }) => l.x >= k.x0 - 1.5 && l.x <= k.x1 + 1.5 && l.y >= k.y0 - 1.5 && l.y <= k.y1 + 1.5)
  return labels.filter((l) => !amBauteil(l) && !passt.anker.some((a) => Math.abs(a.x - l.x) <= 1.5 && Math.abs(a.y - l.y) <= 1.5))
}

/** Die Fassung (mit/ohne Beschriftung), deren Maße das gespeicherte Bild hat */
function passendeFassung(spec: SchaltplanSpec, bild?: { width: number; height: number } | null): SchaltplanZeichnung | null {
  const sauber = sanitizeSchaltplan(spec)
  if (!sauber) return null
  const fassungen = [schaltplanZeichnen(sauber), schaltplanZeichnen(sauber, { ohneBeschriftung: true })].filter((f) => f.svg)
  return (bild ? fassungen.find((f) => Math.abs(f.breite - bild.width) < 0.5 && Math.abs(f.hoehe - bild.height) < 0.5) : fassungen[0]) ?? null
}

/**
 * „An Bauteil einrasten": der nächste Punkt auf dem Umriss des nächstgelegenen Bauteils (Prozent).
 * null, wenn sich die Zeichnung nicht mehr zuordnen lässt (älteres Bild).
 */
export function schaltplanEinrasten(spec: SchaltplanSpec, bild: { width: number; height: number } | null, p: { x: number; y: number }): { x: number; y: number } | null {
  const passt = passendeFassung(spec, bild)
  if (!passt?.bauteile.length) return null
  let best: { x: number; y: number; d: number } | null = null
  for (const { kasten: k } of passt.bauteile) {
    // Nächster Randpunkt: Liegt p innen, zur nächsten Kante; sonst auf den Kasten klemmen
    const innen = p.x > k.x0 && p.x < k.x1 && p.y > k.y0 && p.y < k.y1
    let q = { x: Math.min(k.x1, Math.max(k.x0, p.x)), y: Math.min(k.y1, Math.max(k.y0, p.y)) }
    if (innen) {
      const kanten = [
        { d: p.x - k.x0, q: { x: k.x0, y: p.y } },
        { d: k.x1 - p.x, q: { x: k.x1, y: p.y } },
        { d: p.y - k.y0, q: { x: p.x, y: k.y0 } },
        { d: k.y1 - p.y, q: { x: p.x, y: k.y1 } }
      ].sort((a, b) => a.d - b.d)
      q = kanten[0].q
    }
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (!best || d < best.d) best = { ...q, d }
  }
  return best ? { x: r2(best.x), y: r2(best.y) } : null
}
