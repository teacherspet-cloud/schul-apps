/**
 * Schaltpläne zeichnet die App selbst – nach DIN EN 60617, mit Beschriftungen, die AM BAUTEIL
 * ankern (30.09.2026).
 *
 * Befund der Lehrkraft am Blatt „Wann leuchtet die Lampe?" (Physik, Klasse 5): Im Schaltplan M1
 * ragten Linien mit Punkten ins Bild, die „alle ins Nirgendwo" zeigten; zugleich bot Aufgabe 1
 * nummerierte Schreiblinien für dieselben Namen. Ursache: Die Text-KI hatte Beschriftungspunkte
 * (x/y in Prozent) für ein Bild GESCHÄTZT, das es noch gar nicht gab – gefunden wurde danach ein
 * Wikimedia-Bild (zwei übereinanderliegende Stromkreise mit Widerstand und Messgerät), auf dem die
 * geschätzten Punkte neben Leitungen, im Leeren oder mitten in Symbolen lagen.
 *
 * Deshalb hier: Der Schaltplan ist DATEN (`SchaltplanSpec`: Quelle, Bauteile oben/unten, Zweige).
 * Das Layout ist maßhaltig berechnet, und jede Beschriftung erhält ihren Punkt aus der Lage ihres
 * Bauteils – nie aus einer Schätzung. Die Führungslinie verläuft rechtwinklig: vom Bauteil nach
 * außen in einen freien Streifen über bzw. unter dem Schaltplan und dort waagerecht zum Rand.
 * Die Streifen werden so vergeben, dass sich keine zwei Linien kreuzen und keine durch ein Symbol
 * läuft (Linien, die weiter vom Rand starten, liegen weiter außen).
 *
 * Schaltzeichen (DIN EN 60617, Schulbuch-Darstellung):
 * - Lampe: Kreis mit Kreuz · Widerstand: Rechteck · Messgeräte: Kreis mit A/V, Motor: Kreis mit M
 * - Batterie/Gleichspannungsquelle: langer dünner Strich (Pluspol) und kurzer dicker Strich
 * - Schalter: Schaltwippe mit zwei Kontakten; offen = schräg abgehoben, geschlossen = anliegend
 * - Leitungen rechtwinklig, Knotenpunkte (Verzweigungen) als gefüllte Punkte
 */
import type { ImageLabel } from '../model/types'

export const SCHALT_ARTEN = ['lampe', 'schalter_offen', 'schalter_geschlossen', 'widerstand', 'amperemeter', 'voltmeter', 'motor', 'leitung'] as const
export type SchaltArt = (typeof SCHALT_ARTEN)[number]

export interface SchaltBauteil {
  art: SchaltArt
  /** Beschriftung am Bauteil; leer = keine */
  beschriftung?: string
  /** true = auf dem Schülerblatt eine leere Linie, im Lösungsteil der Text */
  leer?: boolean
}

export interface Schaltkreis {
  /** Kurzer Name unter dem Schaltkreis, z. B. „A: Schalter offen" */
  titel?: string
  /** Die Quelle (Batterie) sitzt immer links */
  quelle: { beschriftung?: string; leer?: boolean }
  /** In Reihe auf der oberen Leitung, von links nach rechts */
  oben: SchaltBauteil[]
  /** In Reihe auf der unteren Leitung, von links nach rechts */
  unten: SchaltBauteil[]
  /**
   * Senkrechte Zweige rechts zwischen oberer und unterer Leitung. Einer = rechte Seite des
   * Rechtecks (Reihenschaltung), mehrere = Parallelschaltung. Leer = rechte Seite ist Leitung.
   */
  zweige: SchaltBauteil[][]
}

export interface SchaltplanSpec {
  /** 1 oder 2 Schaltkreise nebeneinander (z. B. offen / geschlossen) */
  kreise: Schaltkreis[]
}

export const SCHALT_NAMEN: Record<SchaltArt | 'batterie', string> = {
  batterie: 'Batterie',
  lampe: 'Lampe',
  schalter_offen: 'Schalter (offen)',
  schalter_geschlossen: 'Schalter (geschlossen)',
  widerstand: 'Widerstand',
  amperemeter: 'Strommessgerät',
  voltmeter: 'Spannungsmessgerät',
  motor: 'Motor',
  leitung: 'Leitung'
}

// ---------- Bereinigung ----------

const MAX_KREISE = 2
const MAX_SCHIENE = 4
const MAX_ZWEIGE = 4
const MAX_JE_ZWEIG = 3
/** So viele Schilder trägt die Beschriftungsebene (convert.ts: höchstens 8) */
export const MAX_BESCHRIFTUNGEN = 8

const text = (v: unknown): string => String(v ?? '').trim()

function bauteil(v: unknown): SchaltBauteil | null {
  const o = (v ?? {}) as Record<string, unknown>
  const art = text(o.art) as SchaltArt
  if (!SCHALT_ARTEN.includes(art)) return null
  const beschriftung = text(o.beschriftung)
  return { art, ...(beschriftung ? { beschriftung } : {}), ...(beschriftung && o.leer ? { leer: true } : {}) }
}

const bauteile = (v: unknown, max: number): SchaltBauteil[] =>
  (Array.isArray(v) ? v : [])
    .map(bauteil)
    .filter((b): b is SchaltBauteil => Boolean(b))
    .slice(0, max)

/** Alles, was die KI liefert, geht hier durch – ein unbrauchbarer Plan wird null. */
export function sanitizeSchaltplan(v: unknown): SchaltplanSpec | null {
  const roh = (v ?? {}) as Record<string, unknown>
  const kreise: Schaltkreis[] = (Array.isArray(roh.kreise) ? roh.kreise : []).slice(0, MAX_KREISE).map((k: any) => {
    const q = (k?.quelle ?? {}) as Record<string, unknown>
    const qText = text(q.beschriftung)
    const zweige = (Array.isArray(k?.zweige) ? k.zweige : [])
      // Die KI liefert Zweige als { bauteile: [...] }, gespeicherte Pläne als Liste
      .map((z: unknown) => bauteile(Array.isArray(z) ? z : (z as { bauteile?: unknown })?.bauteile, MAX_JE_ZWEIG))
      .slice(0, MAX_ZWEIGE)
    return {
      ...(text(k?.titel) ? { titel: text(k.titel) } : {}),
      quelle: { ...(qText ? { beschriftung: qText } : {}), ...(qText && q.leer ? { leer: true } : {}) },
      oben: bauteile(k?.oben, MAX_SCHIENE),
      unten: bauteile(k?.unten, MAX_SCHIENE),
      // Ein leerer Zweig in einer Parallelschaltung wäre ein Kurzschluss – weg damit
      zweige: zweige.filter((z: SchaltBauteil[]) => z.length)
    }
  })
  // Ein Schaltkreis ohne ein einziges Bauteil außer der Quelle ist kein Schaltplan
  const brauchbar = kreise.filter((k) => k.oben.length + k.unten.length + k.zweige.flat().length > 0)
  return brauchbar.length ? { kreise: brauchbar } : null
}

// ---------- Maße (Einheiten der viewBox; im Druck ≈ 0,4 mm) ----------

const SLOT = 36 // Abstand der Bauteile auf einer Leitung
const HL = 10 // halbe Länge, die ein Bauteil aus der Leitung schneidet
const RUNG = 38 // Abstand paralleler Zweige
const ROW0 = 14 // erster freier Streifen über/unter dem Schaltplan (über Schalterwippe und Lampe)
const ROW = 6.5 // Abstand der Streifen
const AUSWEG = 12 // senkrechter Umweg neben einem Zweig bzw. der Quelle
const LUECKE = 44 // Abstand zweier Schaltkreise
const STRICH = 1.6
const TITEL = 6.5 // Schriftgröße der Titel

type Pkt = { x: number; y: number }
type Seite = 'left' | 'right'
type Ort = 'quelle' | 'oben' | 'unten' | 'zweig'

interface Platz {
  key: string
  kreis: number
  ort: Ort
  art: SchaltArt | 'batterie'
  mitte: Pkt
  /** Drehung in Grad: 0 oben, 180 unten, 90 rechter Zweig, -90 Quelle links */
  dreh: number
  beschriftung?: string
  leer?: boolean
  zweig?: number
  letzterZweig?: boolean
}

/** Punkt im Bauteil-Rahmen (Leitung entlang x, außen = −y) in Blattkoordinaten */
function dreheUm(p: Pkt, grad: number, mitte: Pkt): Pkt {
  const r = (grad * Math.PI) / 180
  const c = Math.round(Math.cos(r))
  const s = Math.round(Math.sin(r))
  return { x: mitte.x + p.x * c - p.y * s, y: mitte.y + p.x * s + p.y * c }
}

/** Wo die Beschriftungslinie am Bauteil ansetzt – auf seinem äußeren Rand, im Bauteil-Rahmen */
function ankerLokal(art: Platz['art']): Pkt {
  switch (art) {
    case 'lampe':
    case 'amperemeter':
    case 'voltmeter':
    case 'motor':
      return { x: 0, y: -7 }
    case 'widerstand':
      return { x: 0, y: -3.5 }
    case 'schalter_offen':
      // auf der abgehobenen Wippe
      return { x: -8 + 0.72 * 12.99, y: -0.72 * 7.5 }
    case 'batterie':
      // Spitze des langen Strichs (Pluspol)
      return { x: 2.5, y: -8 }
    default:
      return { x: 0, y: 0 }
  }
}

/** Schaltzeichen im Bauteil-Rahmen: Leitung von −HL bis +HL entlang x */
function zeichen(art: Platz['art']): string {
  const l = (x1: number, y1: number, x2: number, y2: number, extra = ''): string => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${extra}/>`
  const kreis = `<circle cx="0" cy="0" r="7"/>`
  switch (art) {
    case 'lampe':
      return [l(-HL, 0, -7, 0), l(7, 0, HL, 0), kreis, l(-4.95, -4.95, 4.95, 4.95), l(-4.95, 4.95, 4.95, -4.95)].join('')
    case 'amperemeter':
    case 'voltmeter':
    case 'motor':
      return [l(-HL, 0, -7, 0), l(7, 0, HL, 0), kreis].join('')
    case 'widerstand':
      return [l(-HL, 0, -9, 0), l(9, 0, HL, 0), `<rect x="-9" y="-3.5" width="18" height="7"/>`].join('')
    case 'schalter_offen':
      return [l(-HL, 0, -9.4, 0), l(9.4, 0, HL, 0), l(-8, 0, 4.99, -7.5), `<circle cx="-8" cy="0" r="1.4" fill="#fff"/>`, `<circle cx="8" cy="0" r="1.4" fill="#fff"/>`].join('')
    case 'schalter_geschlossen':
      return [l(-HL, 0, -9.4, 0), l(9.4, 0, HL, 0), l(-8, 0, 8, 0), `<circle cx="-8" cy="0" r="1.4" fill="#fff"/>`, `<circle cx="8" cy="0" r="1.4" fill="#fff"/>`].join('')
    case 'batterie':
      // langer dünner Strich = Pluspol, kurzer dicker Strich = Minuspol
      return [l(-HL, 0, -2.5, 0), l(2.5, 0, HL, 0), l(2.5, -8, 2.5, 8), l(-2.5, -4, -2.5, 4, ' stroke-width="4" stroke-linecap="butt"')].join('')
    default:
      return ''
  }
}

const BUCHSTABE: Partial<Record<Platz['art'], string>> = { amperemeter: 'A', voltmeter: 'V', motor: 'M' }

/** Leitung von a nach b (waagerecht oder senkrecht) mit Lücken für die Bauteile */
function leitung(a: Pkt, b: Pkt, luecken: number[]): string {
  const waag = a.y === b.y
  const von = waag ? Math.min(a.x, b.x) : Math.min(a.y, b.y)
  const bis = waag ? Math.max(a.x, b.x) : Math.max(a.y, b.y)
  const stuecke: [number, number][] = []
  let start = von
  for (const m of [...luecken].sort((p, q) => p - q)) {
    if (m - HL > start) stuecke.push([start, m - HL])
    start = Math.max(start, m + HL)
  }
  if (bis > start) stuecke.push([start, bis])
  return stuecke.map(([s, e]) => (waag ? `M${s} ${a.y}H${e}` : `M${a.x} ${s}V${e}`)).join('')
}

interface KreisMass {
  breite: number
  hoehe: number
  railEnd: number
  zweige: SchaltBauteil[][]
}

function kreisMass(k: Schaltkreis): KreisMass {
  const n = Math.max(k.oben.length, k.unten.length)
  const zweige = k.zweige.length ? k.zweige : [[]]
  const railEnd = n ? 18 + n * SLOT + 4 : 48
  const kmax = Math.max(1, ...zweige.map((z) => z.length))
  const hoehe = Math.max(72, kmax * SLOT + 24)
  return { breite: railEnd + (zweige.length - 1) * RUNG, hoehe, railEnd, zweige }
}

/** Lage aller Bauteile eines Kreises (Ursprung: linke obere Ecke) */
function kreisPlaetze(k: Schaltkreis, m: KreisMass, kreis: number): Platz[] {
  const out: Platz[] = []
  const verteile = (anzahl: number, i: number): number => 18 + ((m.railEnd - 4 - 18) * (i + 0.5)) / anzahl
  out.push({ key: `k${kreis}:quelle`, kreis, ort: 'quelle', art: 'batterie', mitte: { x: 0, y: m.hoehe / 2 }, dreh: -90, ...k.quelle })
  k.oben.forEach((b, i) => out.push({ key: `k${kreis}:oben:${i}`, kreis, ort: 'oben', mitte: { x: verteile(k.oben.length, i), y: 0 }, dreh: 0, ...b }))
  k.unten.forEach((b, i) => out.push({ key: `k${kreis}:unten:${i}`, kreis, ort: 'unten', mitte: { x: verteile(k.unten.length, i), y: m.hoehe }, dreh: 180, ...b }))
  m.zweige.forEach((z, j) =>
    z.forEach((b, i) =>
      out.push({
        key: `k${kreis}:zweig:${j}:${i}`,
        kreis,
        ort: 'zweig',
        zweig: j,
        letzterZweig: j === m.zweige.length - 1,
        mitte: { x: m.railEnd + j * RUNG, y: (m.hoehe * (i + 1)) / (z.length + 1) },
        dreh: 90,
        ...b
      })
    )
  )
  return out
}

interface Leitweg {
  platz: Platz
  seite: Seite
  /** Führung: 'direkt' = waagerecht zum Rand; sonst über den Streifen oben/unten */
  modus: 'direkt' | 'oben' | 'unten'
  anker: Pkt
  /** x der senkrechten Führung zum Streifen */
  vx: number
  zeile?: number
}

/** Welcher Weg führt die Linie eines Bauteils aus dem Schaltplan – ohne ein Symbol zu kreuzen? */
function leitwegFuer(p: Platz, m: KreisMass, kreisSeite: Seite | null): Leitweg {
  const anker = dreheUm(ankerLokal(p.art), p.dreh, p.mitte)
  if (p.ort === 'oben') return { platz: p, seite: kreisSeite ?? (anker.x < m.breite / 2 ? 'left' : 'right'), modus: 'oben', anker, vx: anker.x }
  if (p.ort === 'unten') return { platz: p, seite: kreisSeite ?? (anker.x < m.breite / 2 ? 'left' : 'right'), modus: 'unten', anker, vx: anker.x }
  if (p.ort === 'quelle') {
    const seite = kreisSeite ?? 'left'
    return seite === 'left' ? { platz: p, seite, modus: 'direkt', anker, vx: anker.x } : { platz: p, seite, modus: 'oben', anker, vx: -AUSWEG }
  }
  // Zweig: der äußerste führt nach rechts direkt hinaus, alle anderen über den oberen Streifen
  const vx = p.letzterZweig ? p.mitte.x + AUSWEG : p.mitte.x + RUNG / 2
  const seite = kreisSeite ?? (vx < m.breite / 2 ? 'left' : 'right')
  if (p.letzterZweig && seite === 'right') return { platz: p, seite, modus: 'direkt', anker, vx: anker.x }
  return { platz: p, seite, modus: 'oben', anker, vx }
}

export interface SchaltplanZeichnung {
  svg: string
  breite: number
  hoehe: number
  /** Beschriftungen mit Punkt am Bauteil und rechtwinkligem Leitweg – Prozent der Bildmaße */
  labels: ImageLabel[]
  /** Ankerpunkt jedes Bauteils in Prozent – für die Prüfung auf verwaiste Punkte */
  anker: { key: string; art: string; x: number; y: number }[]
}

const r1 = (v: number): number => Math.round(v * 100) / 100

/**
 * Zeichnet den Schaltplan und setzt die Beschriftungen an die Bauteile.
 * Mit `ohneBeschriftung` entstehen nur Zeichnung und Anker (die Aufgabe bietet dann die Schreiblinien).
 */
export function schaltplanZeichnen(spec: SchaltplanSpec, opts: { ohneBeschriftung?: boolean } = {}): SchaltplanZeichnung {
  const kreise = spec.kreise.slice(0, MAX_KREISE)
  const masse = kreise.map(kreisMass)
  const plaetze = kreise.map((k, i) => kreisPlaetze(k, masse[i], i))

  // Leitwege und Streifen je Kreis
  let anzahl = 0
  const wege = plaetze.map((ps, i) => {
    const kreisSeite: Seite | null = kreise.length > 1 ? (i === 0 ? 'left' : 'right') : null
    return ps
      .filter((p) => !opts.ohneBeschriftung && p.beschriftung && anzahl++ < MAX_BESCHRIFTUNGEN)
      .map((p) => leitwegFuer(p, masse[i], kreisSeite))
  })
  const zeilen = (ws: Leitweg[], modus: 'oben' | 'unten'): number => {
    let max = 0
    for (const seite of ['left', 'right'] as const) {
      const eigene = ws.filter((w) => w.modus === modus && w.seite === seite)
      // Näher am Zielrand = näher am Schaltplan; so kreuzt keine Waagerechte eine fremde Senkrechte
      eigene.sort((a, b) => (seite === 'left' ? a.vx - b.vx : b.vx - a.vx) || a.anker.y - b.anker.y)
      eigene.forEach((w, z) => (w.zeile = z))
      max = Math.max(max, eigene.length)
    }
    return max
  }
  const obenZeilen = Math.max(0, ...wege.map((ws) => zeilen(ws, 'oben')))
  const untenZeilen = wege.map((ws) => zeilen(ws, 'unten'))

  // Blattmaße: Rand links/rechts für Quelle, Umwege und den Knick der Beschriftungslinie (4 %)
  const innen = masse.reduce((s, m) => s + m.breite, 0) + (kreise.length - 1) * LUECKE
  const rand = Math.max(26, innen * 0.075)
  const breite = innen + 2 * rand
  const oben = ROW0 + Math.max(0, obenZeilen - 1) * ROW + 8
  const titelH = kreise.some((k) => k.titel) ? TITEL + 6 : 0
  const unten = masse.map((m, i) => m.hoehe + ROW0 + Math.max(0, untenZeilen[i] - 1) * ROW + 6)
  const hoehe = oben + Math.max(...unten) + titelH

  const px = (x: number): number => (x / breite) * 100
  const py = (y: number): number => (y / hoehe) * 100

  const teile: string[] = []
  const knoten: Pkt[] = []
  const texte: string[] = []
  const labels: ImageLabel[] = []
  const anker: SchaltplanZeichnung['anker'] = []
  let x0 = rand
  kreise.forEach((k, i) => {
    const m = masse[i]
    const o = { x: x0, y: oben }
    const g = (p: Pkt): Pkt => ({ x: p.x + o.x, y: p.y + o.y })
    const ps = plaetze[i]
    const letzte = m.railEnd + (m.zweige.length - 1) * RUNG
    const luecken = (ort: Ort, zweig?: number): number[] =>
      ps.filter((p) => p.ort === ort && p.art !== 'leitung' && (zweig === undefined || p.zweig === zweig)).map((p) => (ort === 'oben' || ort === 'unten' ? p.mitte.x + o.x : p.mitte.y + o.y))

    // Leitungen: oben, unten, links (Quelle), Zweige
    teile.push(`<path d="${leitung(g({ x: 0, y: 0 }), g({ x: letzte, y: 0 }), luecken('oben'))}"/>`)
    teile.push(`<path d="${leitung(g({ x: 0, y: m.hoehe }), g({ x: letzte, y: m.hoehe }), luecken('unten'))}"/>`)
    teile.push(`<path d="${leitung(g({ x: 0, y: 0 }), g({ x: 0, y: m.hoehe }), luecken('quelle'))}"/>`)
    m.zweige.forEach((_, j) => {
      const x = m.railEnd + j * RUNG
      teile.push(`<path d="${leitung(g({ x, y: 0 }), g({ x, y: m.hoehe }), luecken('zweig', j))}"/>`)
      // Knotenpunkte: wo ein Zweig abgeht und die Leitung weiterläuft
      if (j < m.zweige.length - 1) knoten.push(g({ x, y: 0 }), g({ x, y: m.hoehe }))
    })

    // Schaltzeichen
    for (const p of ps) {
      const c = g(p.mitte)
      if (p.art !== 'leitung') teile.push(`<g transform="translate(${r1(c.x)} ${r1(c.y)}) rotate(${p.dreh})">${zeichen(p.art)}</g>`)
      const b = BUCHSTABE[p.art]
      // Buchstaben stehen immer aufrecht, auch auf der unteren Leitung
      if (b) texte.push(`<text x="${r1(c.x)}" y="${r1(c.y + 3.3)}" text-anchor="middle" font-size="9.5" font-weight="700">${b}</text>`)
      const a = g(dreheUm(ankerLokal(p.art), p.dreh, p.mitte))
      anker.push({ key: p.key, art: p.art, x: r1(px(a.x)), y: r1(py(a.y)) })
    }
    if (k.titel) texte.push(`<text x="${r1(o.x + m.breite / 2)}" y="${r1(hoehe - 4)}" text-anchor="middle" font-size="${TITEL}">${escapeXml(k.titel)}</text>`)

    // Beschriftungen: Punkt am Bauteil, dann rechtwinklig in den freien Streifen
    for (const w of wege[i]) {
      const a = g(w.anker)
      const route: Pkt[] = [a]
      if (w.modus !== 'direkt') {
        const y = w.modus === 'oben' ? o.y - ROW0 - (w.zeile ?? 0) * ROW : o.y + m.hoehe + ROW0 + (w.zeile ?? 0) * ROW
        const vx = w.vx + o.x
        if (Math.abs(vx - a.x) > 0.01) route.push({ x: vx, y: a.y })
        route.push({ x: vx, y })
      }
      const pct = route.map((p) => ({ x: r1(px(p.x)), y: r1(py(p.y)) }))
      labels.push({
        id: `sp-${w.platz.key}`,
        text: w.platz.beschriftung ?? '',
        x: pct[0].x,
        y: pct[0].y,
        side: w.seite,
        ...(w.platz.leer ? { blank: true } : {}),
        ...(pct.length > 1 ? { route: pct } : {})
      })
    }
    x0 += m.breite + LUECKE
  })

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(breite)} ${r1(hoehe)}" width="${r1(breite * 0.4)}mm" height="${r1(hoehe * 0.4)}mm">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<g fill="none" stroke="#000" stroke-width="${STRICH}" stroke-linecap="round" stroke-linejoin="round">${teile.join('')}</g>`,
    `<g fill="#000">${knoten.map((p) => `<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="2.2"/>`).join('')}</g>`,
    `<g font-family="Arial, Helvetica, sans-serif" fill="#000">${texte.join('')}</g>`,
    `</svg>`
  ].join('')
  return { svg, breite, hoehe, labels, anker }
}

const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Die Zeichnung als Bildadresse (base64 – so liest `imageSizeFromDataUrl` das Seitenverhältnis) */
export function schaltplanDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:image/svg+xml;base64,${btoa(bin)}`
}

/**
 * Prüfung: Beschriftungspunkte, die an keinem Bauteil ankern („verwaist").
 * Toleranz 1,5 Prozentpunkte – so weit darf ein Punkt beim Ziehen im Editor danebenliegen.
 * Die Anker hängen von den Randstreifen ab; maßgeblich ist die Fassung, deren Maße das
 * gespeicherte Bild hat (mit oder ohne Beschriftungsstreifen gezeichnet).
 */
export function verwaisteBeschriftungen(spec: SchaltplanSpec, labels: ImageLabel[], bild?: { width: number; height: number } | null): ImageLabel[] {
  const fassungen = [schaltplanZeichnen(spec), schaltplanZeichnen(spec, { ohneBeschriftung: true })]
  const passt = bild ? fassungen.find((f) => Math.abs(f.breite - bild.width) < 0.5 && Math.abs(f.hoehe - bild.height) < 0.5) : undefined
  const { anker } = passt ?? fassungen[0]
  return labels.filter((l) => !anker.some((a) => Math.abs(a.x - l.x) <= 1.5 && Math.abs(a.y - l.y) <= 1.5))
}
