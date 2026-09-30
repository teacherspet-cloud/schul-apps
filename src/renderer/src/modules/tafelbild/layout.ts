/**
 * Deterministisches Layout: aus dem Inhalt der KI (Knoten, Beziehungen, Merksatz, Zeichnungen)
 * die Elemente EINES Formats setzen – im Raster, ohne Überlappung, mit einem gemeinsamen
 * Schriftgrad für alle Kästen (Übersichtlichkeit) und nie unter der Mindestschrift des Formats.
 *
 * Die KI liefert nur einen Vorschlag (Struktur, Reihenfolge, beim Tafelfoto die Lage); wo was
 * steht, entscheidet diese Datei. So sieht dasselbe Tafelbild auf der Klapptafel, dem
 * Whiteboard, dem Flipchart und im Heft jeweils passend aus.
 */
import { formatInfo, standardSchrift, ZEILENHOEHE, zonen, type Farbe, type FormatId, type Schriftart, type Zone, type Zonen } from './formate'
import { kastenSatz } from './kasten'
import { textBreite } from './textsatz'
import {
  neueId,
  type Diagramm,
  type Regler,
  type StrukturArt,
  type TbElement,
  type TbInhalt,
  type TbKnoten,
  type TbTafel,
  type TbZeichnung,
  type Varianten
} from './model'

interface Rechteck {
  x: number
  y: number
  w: number
  h: number
}

interface Umgebung {
  W: number
  H: number
  schrift: Schriftart
  min: number
  text: number
  titel: number
  stil: Regler['stil']
  /** Oben bündig statt mittig (Hefteintrag: kompakt, wie abgeschrieben) */
  oben?: boolean
  /** Alles, was nicht passte – die Prüfung meldet es */
  ueberlauf: string[]
}

/** Text eines Knotens im Kasten: Stichpunkte mit „•", ausformuliert als Sätze untereinander */
export function knotenText(k: Pick<TbKnoten, 'punkte'>, stil: Regler['stil']): string {
  const p = k.punkte.map((x) => x.trim()).filter(Boolean)
  return stil === 'stichpunkte' ? p.map((x) => `• ${x}`).join('\n') : p.join('\n')
}

const hoeheBei = (u: Umgebung, titel: string, text: string, w: number, g: number, icon: boolean): number =>
  kastenSatz({ titel, text, mitIcon: icon, typ: 'kasten' }, w, g, u.schrift).hoehe

interface Posten {
  knoten?: TbKnoten
  titel: string
  text: string
  icon: boolean
}

const posten = (k: TbKnoten, u: Umgebung): Posten => ({ knoten: k, titel: k.titel, text: knotenText(k, u.stil), icon: Boolean(k.symbol) })

/**
 * Posten im Raster setzen: Spaltenzahl und Schriftgrad so wählen, dass alles in die Zone passt –
 * der größte Grad gewinnt. Freier Platz wird als Abstand verteilt (Weißraum statt Gedränge).
 */
function raster(u: Umgebung, liste: Posten[], z: Rechteck, spalten: number[], abstand: { x: number; y: number }): { rects: Rechteck[]; g: number; passt: boolean } {
  let best: { rects: Rechteck[]; g: number; passt: boolean; ueber: number; trennt: boolean } | null = null
  for (const cols of spalten) {
    if (cols < 1) continue
    const zeilen = Math.ceil(liste.length / cols)
    const w = (z.w - abstand.x * (cols - 1)) / cols
    if (w <= 0) continue
    let g = u.text
    for (let i = 0; i < 30; i++) {
      const hoehen: number[] = []
      for (let r = 0; r < zeilen; r++) {
        const reihe = liste.slice(r * cols, r * cols + cols)
        hoehen.push(Math.max(...reihe.map((p) => hoeheBei(u, p.titel, p.text, w, g, p.icon))))
      }
      const gesamt = hoehen.reduce((a, b) => a + b, 0) + abstand.y * (zeilen - 1)
      const passt = gesamt <= z.h
      if (passt || g <= u.min) {
        const ueber = Math.max(0, gesamt - z.h)
        const kandidat = { g, passt, ueber, rects: [] as Rechteck[], trennt: trenntWoerter(u, liste, w, g) }
        // Freien Platz verteilen: zuerst größere Abstände, dann Kästen strecken bis zur Zonenhöhe
        const frei = Math.max(0, z.h - gesamt)
        const zusatz = zeilen > 1 ? Math.min(frei / (zeilen - 1), u.text * (u.oben ? 0.4 : 1.5)) : 0
        let y = z.y + (u.oben ? 0 : Math.max(0, (frei - zusatz * (zeilen - 1)) / 2))
        for (let r = 0; r < zeilen; r++) {
          const reihe = liste.slice(r * cols, r * cols + cols)
          // Unvollständige letzte Reihe: mittig
          const versatz = ((cols - reihe.length) * (w + abstand.x)) / 2
          reihe.forEach((_, i) => kandidat.rects.push({ x: z.x + versatz + i * (w + abstand.x), y, w, h: hoehen[r] }))
          y += hoehen[r] + abstand.y + zusatz
        }
        // Reihenfolge: passt > keine getrennten Wörter > größere Schrift (bzw. weniger Überlauf)
        const besser =
          !best ||
          (passt && !best.passt) ||
          (passt === best.passt && !kandidat.trennt && best.trennt) ||
          (passt === best.passt && kandidat.trennt === best.trennt && (passt ? g > best.g + 1e-9 : ueber < best.ueber))
        if (besser) best = kandidat
        break
      }
      g = Math.max(u.min, g * 0.94)
    }
  }
  if (!best) return { rects: liste.map(() => ({ ...z })), g: u.min, passt: false }
  return best
}

/** Müsste ein Wort bei dieser Breite getrennt werden? (Titel etwas größer gesetzt) */
function trenntWoerter(u: Umgebung, liste: Posten[], w: number, g: number): boolean {
  const innen = w - 2 * g * 0.45
  return liste.some((p) => {
    const icon = p.icon ? g * 1.9 + g * 0.3 : 0
    const titel = p.titel.split(/\s+/).some((x) => textBreite(x, g * 1.12, u.schrift) > innen - icon)
    return titel || p.text.split(/\s+/).some((x) => textBreite(x, g, u.schrift) > innen - g)
  })
}

/** Kasten-Element aus einem Posten */
function kasten(p: Posten, r: Rechteck, g: number, u: Umgebung, farbe?: Farbe): TbElement {
  const k = p.knoten
  return {
    id: neueId('k'),
    typ: 'kasten',
    ...rel(r, u),
    titel: p.titel,
    text: p.text,
    farbe: farbe ?? k?.farbe ?? 'grund',
    rahmen: k?.rolle === 'zentrum' ? 'doppelt' : 'linie',
    schrift: g / u.H,
    schritt: k?.schritt ?? 2,
    niveau: k?.niveau ?? 1,
    ...(k?.lueckenWoerter?.length ? { lueckenWoerter: k.lueckenWoerter } : {}),
    ...(k?.symbol ? { symbol: k.symbol } : {}),
    ...(k ? { knoten: k.id } : {})
  }
}

const rel = (r: Rechteck, u: Umgebung): { x: number; y: number; w: number; h: number } => ({ x: r.x / u.W, y: r.y / u.H, w: r.w / u.W, h: r.h / u.H })
const abs = (z: Zone, u: Umgebung): Rechteck => ({ x: z.x * u.W, y: z.y * u.H, w: z.w * u.W, h: z.h * u.H })

function verbinder(von: TbElement, nach: TbElement, text: string, art: TbElement['pfeilArt'], schritt?: number): TbElement {
  return {
    id: neueId('v'),
    typ: 'verbinder',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    text,
    farbe: 'grund',
    schritt: schritt ?? Math.max(von.schritt, nach.schritt),
    niveau: Math.max(von.niveau ?? 1, nach.niveau ?? 1) as 1 | 2 | 3,
    // Beschriftung etwas kleiner als der Text der Kästen
    schrift: Math.min(von.schrift ?? 0.05, nach.schrift ?? 0.05) * 0.85,
    von: von.id,
    nach: nach.id,
    pfeilArt: art ?? 'pfeil'
  }
}

// ---------- Strukturen ----------

function gliederung(u: Umgebung, knoten: TbKnoten[], z: Rechteck, quer: boolean): TbElement[] {
  const n = knoten.length
  const spalten = quer ? [n, Math.ceil(n / 2), Math.ceil(n / 3), 3, 2] : [1, 2, Math.min(3, n)]
  const r = raster(u, knoten.map((k) => posten(k, u)), z, [...new Set(spalten)].filter((c) => c <= n), { x: u.text * 0.9, y: u.text * 0.7 })
  if (!r.passt) u.ueberlauf.push('Die Kästen passen bei Mindestschrift nicht ganz in das Hauptfeld.')
  return knoten.map((k, i) => kasten(posten(k, u), r.rects[i], r.g, u))
}

function netzReihen(u: Umgebung, inhalt: TbInhalt, z: Rechteck, quer: boolean): TbElement[] {
  const zentrum = inhalt.knoten.find((k) => k.rolle === 'zentrum') ?? inhalt.knoten[0]
  const rest = inhalt.knoten.filter((k) => k !== zentrum)
  if (!rest.length) return gliederung(u, [zentrum], z, quer)
  /*
   * Der Begriff in einer mittleren Reihe, die Aspekte in einer Reihe darüber und einer darunter.
   * So kreuzt keine Verbindungslinie einen anderen Kasten, und die Breite der Tafel wird genutzt
   * (drei Spalten ließen auf der Mitteltafel nur schmale, lange Kästen übrig).
   */
  const halb = Math.ceil(rest.length / 2)
  const a = rest.slice(0, halb)
  const b = rest.slice(halb)
  const proReihe = (l: TbKnoten[]): number[] => {
    const n = l.length
    return [...new Set(quer ? [n, Math.min(4, n), Math.ceil(n / 2)] : [Math.min(3, n), Math.min(2, n), 1])].filter((c) => c >= 1)
  }
  // Der Begriff möglichst in einer Zeile – so breit wie nötig, höchstens 60 % der Fläche
  const einzeilig = textBreite(zentrum.titel, u.text * 1.1 * 1.12, u.schrift) + u.text * 1.4 + (zentrum.symbol ? u.text * 2.2 : 0)
  const mitteW = Math.min(z.w * 0.6, Math.max(z.w * (quer ? 0.3 : 0.5), einzeilig))
  const luecke = u.text * (inhalt.beziehungen.some((b) => b.beschriftung.trim()) ? 1.45 : 0.9)
  let g = u.text
  let ra: ReturnType<typeof raster> | null = null
  let rb: ReturnType<typeof raster> | null = null
  let hz = 0
  for (let i = 0; i < 30; i++) {
    hz = hoeheBei(u, zentrum.titel, knotenText(zentrum, u.stil), mitteW, g * 1.1, Boolean(zentrum.symbol))
    const reihe = (z.h - hz - 2 * luecke) / 2
    const uu = { ...u, text: g }
    ra = raster(uu, a.map((k) => posten(k, u)), { x: z.x, y: z.y, w: z.w, h: reihe }, proReihe(a), { x: u.text * 0.8, y: u.text * 0.5 })
    rb = b.length ? raster(uu, b.map((k) => posten(k, u)), { x: z.x, y: z.y + reihe + hz + 2 * luecke, w: z.w, h: reihe }, proReihe(b), { x: u.text * 0.8, y: u.text * 0.5 }) : null
    const passt = ra.passt && (!rb || rb.passt) && ra.g >= g - 1e-9 && (!rb || rb.g >= g - 1e-9)
    if (passt || g <= u.min) break
    g = Math.max(u.min, Math.min(g * 0.94, ra.g, rb?.g ?? Infinity))
  }
  if (!ra) return gliederung(u, inhalt.knoten, z, quer)
  if (!ra.passt || (rb && !rb.passt)) u.ueberlauf.push('Das Begriffsnetz passt bei Mindestschrift nicht ganz in das Hauptfeld.')
  // Reihen an den Begriff heranrücken: obere Reihe unten bündig, untere oben bündig
  const obenH = ra.rects.length ? Math.max(...ra.rects.map((r) => r.y + r.h)) - Math.min(...ra.rects.map((r) => r.y)) : 0
  const untenH = rb?.rects.length ? Math.max(...rb.rects.map((r) => r.y + r.h)) - Math.min(...rb.rects.map((r) => r.y)) : 0
  const gesamt = obenH + hz + untenH + 2 * luecke
  const start = z.y + (u.oben ? 0 : Math.max(0, (z.h - gesamt) / 2))
  const verschiebe = (l: Rechteck[], ziel: number): Rechteck[] => {
    const y0 = Math.min(...l.map((r) => r.y))
    return l.map((r) => ({ ...r, y: r.y - y0 + ziel }))
  }
  const oben = verschiebe(ra.rects, start)
  const rz = { x: z.x + (z.w - mitteW) / 2, y: start + obenH + luecke, w: mitteW, h: hz }
  const unten = rb ? verschiebe(rb.rects, rz.y + hz + luecke) : []
  const gg = Math.min(ra.g, rb?.g ?? Infinity)
  const aus: TbElement[] = [{ ...kasten(posten(zentrum, u), rz, Math.min(gg * 1.1, u.text * 1.1), u), rahmen: 'doppelt' }]
  a.forEach((k, i) => aus.push(kasten(posten(k, u), oben[i], gg, u)))
  b.forEach((k, i) => aus.push(kasten(posten(k, u), unten[i], gg, u)))
  const zEl = aus[0]
  zEl.schritt = Math.min(zEl.schritt, ...aus.map((e) => e.schritt))
  // Jeder Aspekt hängt am Begriff; Beschriftung aus den Beziehungen der KI
  for (const e of aus.slice(1)) {
    const bz = inhalt.beziehungen.find((x) => (x.von === zentrum.id && x.nach === e.knoten) || (x.nach === zentrum.id && x.von === e.knoten))
    aus.push(verbinder(zEl, e, bz?.beschriftung ?? '', bz?.art ?? 'linie'))
  }
  // Weitere Beziehungen zwischen Aspekten
  for (const bz of inhalt.beziehungen) {
    if (bz.von === zentrum.id || bz.nach === zentrum.id) continue
    const von = aus.find((e) => e.knoten === bz.von)
    const nach = aus.find((e) => e.knoten === bz.nach)
    if (von && nach) aus.push(verbinder(von, nach, bz.beschriftung, bz.art))
  }
  return aus
}

/** Begriffsnetz in drei Spalten: Aspekte links und rechts gestapelt, der Begriff in der Mitte */
function netzSpalten(u: Umgebung, inhalt: TbInhalt, z: Rechteck): TbElement[] {
  const zentrum = inhalt.knoten.find((k) => k.rolle === 'zentrum') ?? inhalt.knoten[0]
  const rest = inhalt.knoten.filter((k) => k !== zentrum)
  const halb = Math.ceil(rest.length / 2)
  const a = rest.slice(0, halb)
  const b = rest.slice(halb)
  // Mit Beschriftungen auf den Linien braucht es mehr Abstand zwischen Begriff und Aspekten
  const beschriftet = inhalt.beziehungen.some((b) => b.beschriftung.trim())
  const lueckeX = z.w * (beschriftet ? 0.11 : 0.06)
  const mitte = z.w * 0.24
  const seite = (z.w - mitte - 2 * lueckeX) / 2
  const links = { x: z.x, y: z.y, w: seite, h: z.h }
  const rechts = { x: z.x + seite + mitte + 2 * lueckeX, y: z.y, w: seite, h: z.h }
  let ra = raster(u, a.map((k) => posten(k, u)), links, [1], { x: 0, y: u.text * 0.6 })
  let rb = raster(u, b.map((k) => posten(k, u)), rechts, [1], { x: 0, y: u.text * 0.6 })
  const g = Math.min(ra.g, rb.g)
  if (g < ra.g) ra = raster({ ...u, text: g }, a.map((k) => posten(k, u)), links, [1], { x: 0, y: u.text * 0.6 })
  if (g < rb.g) rb = raster({ ...u, text: g }, b.map((k) => posten(k, u)), rechts, [1], { x: 0, y: u.text * 0.6 })
  if (!ra.passt || !rb.passt) u.ueberlauf.push('Das Begriffsnetz passt bei Mindestschrift nicht ganz in das Hauptfeld.')
  const gz = Math.min(g * 1.1, u.text * 1.1)
  const hz = Math.min(z.h, hoeheBei(u, zentrum.titel, knotenText(zentrum, u.stil), mitte, gz, Boolean(zentrum.symbol)))
  const rz = { x: z.x + seite + lueckeX, y: z.y + (z.h - hz) / 2, w: mitte, h: hz }
  const aus: TbElement[] = [{ ...kasten(posten(zentrum, u), rz, gz, u), rahmen: 'doppelt' }]
  a.forEach((k, i) => aus.push(kasten(posten(k, u), ra.rects[i], g, u)))
  b.forEach((k, i) => aus.push(kasten(posten(k, u), rb.rects[i], g, u)))
  const zEl = aus[0]
  zEl.schritt = Math.min(zEl.schritt, ...aus.map((e) => e.schritt))
  for (const e of aus.slice(1)) {
    const bz = inhalt.beziehungen.find((x) => (x.von === zentrum.id && x.nach === e.knoten) || (x.nach === zentrum.id && x.von === e.knoten))
    aus.push(verbinder(zEl, e, bz?.beschriftung ?? '', bz?.art ?? 'linie'))
  }
  return aus
}

/** Begriffsnetz: die Anordnung, die bei größerer Schrift passt (Reihen oder Spalten) */
function netz(u: Umgebung, inhalt: TbInhalt, z: Rechteck, quer: boolean): TbElement[] {
  const versuch = (fn: (uu: Umgebung) => TbElement[]): { el: TbElement[]; ueber: string[]; g: number } => {
    const uu = { ...u, ueberlauf: [] as string[] }
    const el = fn(uu)
    const g = Math.min(...el.filter((e) => e.typ === 'kasten').map((e) => e.schrift ?? 0))
    return { el, ueber: uu.ueberlauf, g }
  }
  const kandidaten = [versuch((uu) => netzReihen(uu, inhalt, z, quer))]
  if (quer && inhalt.knoten.length >= 3) kandidaten.push(versuch((uu) => netzSpalten(uu, inhalt, z)))
  kandidaten.sort((x, y) => x.ueber.length - y.ueber.length || y.g - x.g)
  u.ueberlauf.push(...kandidaten[0].ueber)
  return kandidaten[0].el
}

function tabelle(u: Umgebung, inhalt: TbInhalt, z: Rechteck): TbElement[] {
  const spalten = inhalt.knoten.filter((k) => k.rolle === 'spalte')
  const knoten = spalten.length >= 2 ? spalten : inhalt.knoten
  const aspekte = (inhalt.aspekte ?? []).filter(Boolean)
  if (aspekte.length && knoten.every((k) => k.punkte.length >= 1)) {
    const kopf = ['', ...knoten.map((k) => k.titel)]
    const zeilen = aspekte.map((a, i) => [a, ...knoten.map((k) => k.punkte[i] ?? '')])
    const diagramm: Diagramm = { art: 'tabelle', eintraege: [], spalten: kopf, zeilen }
    const g = tabellenGrad(u, diagramm, z.w, z.h)
    const h = Math.min(z.h, tabellenHoehe(u, diagramm, z.w, g))
    const e: TbElement = {
      id: neueId('t'),
      typ: 'diagramm',
      ...rel({ x: z.x, y: z.y + (z.h - h) / 2, w: z.w, h }, u),
      text: '',
      farbe: 'grund',
      schrift: g / u.H,
      schritt: Math.min(...knoten.map((k) => k.schritt)),
      niveau: 1,
      diagramm,
      lueckenWoerter: knoten.flatMap((k) => k.lueckenWoerter)
    }
    if (tabellenHoehe(u, diagramm, z.w, g) > z.h + 1) u.ueberlauf.push('Die Tabelle passt bei Mindestschrift nicht ganz in das Hauptfeld.')
    return [e]
  }
  // Ohne Aspekte: Spalten nebeneinander, gleich hoch (Gegenüberstellung)
  const r = raster(u, knoten.map((k) => posten(k, u)), z, [knoten.length], { x: u.text * 1.2, y: 0 })
  if (!r.passt) u.ueberlauf.push('Die Gegenüberstellung passt bei Mindestschrift nicht ganz in das Hauptfeld.')
  const hoehe = Math.max(...r.rects.map((x) => x.h))
  return knoten.map((k, i) => kasten(posten(k, u), { ...r.rects[i], h: hoehe }, r.g, u))
}

/** Tabellenmaße: erste Spalte (Aspekte) schmaler */
export function tabellenSpalten(d: Diagramm, w: number): number[] {
  const n = Math.max(1, d.spalten?.length ?? d.zeilen?.[0]?.length ?? 1)
  const ersteLeer = !(d.spalten?.[0] ?? '').trim()
  if (n === 1) return [w]
  const erste = ersteLeer ? w * Math.min(0.28, 1 / n) : w / n
  const rest = (w - erste) / (n - 1)
  return [erste, ...Array(n - 1).fill(rest)]
}

export function tabellenHoehe(u: Pick<Umgebung, 'schrift'>, d: Diagramm, w: number, g: number): number {
  const breiten = tabellenSpalten(d, w)
  const pad = g * 0.35
  const zeile = (z: string[], gg: number): number => Math.max(...breiten.map((b, i) => kastenSatz({ text: z[i] ?? '', typ: 'text' }, b - 2 * pad, gg, u.schrift).hoehe)) + 2 * pad
  let h = d.spalten?.length ? zeile(d.spalten, g * 1.05) : 0
  for (const z of d.zeilen ?? []) h += zeile(z, g)
  return h
}

function tabellenGrad(u: Umgebung, d: Diagramm, w: number, h: number): number {
  let g = u.text
  for (let i = 0; i < 30 && g > u.min; i++) {
    if (tabellenHoehe(u, d, w, g) <= h) return g
    g = Math.max(u.min, g * 0.94)
  }
  return g
}

function fluss(u: Umgebung, inhalt: TbInhalt, z: Rechteck, quer: boolean): TbElement[] {
  const knoten = inhalt.knoten
  const n = knoten.length
  // Leserichtung: links → rechts, dann nächste Zeile wieder links beginnend (R29); hochkant von oben nach unten
  const spalten = quer ? [n, Math.ceil(n / 2), Math.ceil(n / 3), 2] : [1, 2]
  const r = raster(u, knoten.map((k) => posten(k, u)), z, [...new Set(spalten)].filter((c) => c >= 1 && c <= n), { x: u.text * 2.2, y: u.text * 1.6 })
  if (!r.passt) u.ueberlauf.push('Das Flussdiagramm passt bei Mindestschrift nicht ganz in das Hauptfeld.')
  const el = knoten.map((k, i) => kasten(posten(k, u), r.rects[i], r.g, u))
  const aus = [...el]
  const gezogen = new Set<string>()
  for (const b of inhalt.beziehungen) {
    const von = el.find((e) => e.knoten === b.von)
    const nach = el.find((e) => e.knoten === b.nach)
    if (!von || !nach || von === nach) continue
    gezogen.add(`${von.id}>${nach.id}`)
    aus.push(verbinder(von, nach, b.beschriftung, b.art))
  }
  // Ohne ausdrückliche Beziehungen: die Kette in Reihenfolge
  if (!gezogen.size) for (let i = 0; i + 1 < el.length; i++) aus.push(verbinder(el[i], el[i + 1], '', 'pfeil'))
  return aus
}

/** Erstes Jahr aus einer Zeitangabe („1914", „15. Jh.", „44 v. Chr.", „Juli 1914 – 1918") */
export function jahrAus(zeit?: string): number | null {
  if (!zeit) return null
  const jh = /(\d{1,2})\.\s*(?:Jh|Jahrhundert)/i.exec(zeit)
  const vChr = /v\.\s*Chr/i.test(zeit)
  if (jh) return (Number(jh[1]) - 1) * 100 * (vChr ? -1 : 1) + (vChr ? -50 : 50)
  const m = /-?\d{1,4}/.exec(zeit.replace(/(\d)\.(\d)/g, '$1$2'))
  if (!m) return null
  const n = Number(m[0])
  return vChr ? -Math.abs(n) : n
}

function zeitleiste(u: Umgebung, inhalt: TbInhalt, z: Rechteck, quer: boolean): TbElement[] {
  const knoten = [...inhalt.knoten]
  const jahre = knoten.map((k) => jahrAus(k.zeit))
  const bekannt = jahre.every((j) => j !== null)
  // Nach der Zeit ordnen, wenn alle Angaben lesbar sind
  const ordnung = knoten.map((k, i) => ({ k, j: jahre[i] ?? i })).sort((a, b) => (bekannt ? a.j - b.j : 0))
  const aus: TbElement[] = []
  const min = Math.min(...ordnung.map((o) => o.j))
  const max = Math.max(...ordnung.map((o) => o.j))
  const spanne = max - min || 1
  // Achse: konstanter Maßstab (die Marken sitzen an der wahren Zeitstelle)
  const achse: Diagramm = {
    art: 'zeitstrahl',
    eintraege: ordnung.map((o) => ({ label: '', wert: o.k.zeit ?? '', x: bekannt ? (o.j - min) / spanne : ordnung.length > 1 ? ordnung.indexOf(o) / (ordnung.length - 1) : 0.5 }))
  }
  const n = ordnung.length
  if (quer) {
    const ah = u.text * 3
    const ay = z.y + (z.h - ah) / 2
    const achsR = { x: z.x, y: ay, w: z.w, h: ah }
    const oben = ordnung.filter((_, i) => i % 2 === 0)
    const unten = ordnung.filter((_, i) => i % 2 === 1)
    const hoch = (z.h - ah) / 2 - u.text * 1.2
    const ro = raster(u, oben.map((o) => posten(o.k, u)), { x: z.x, y: z.y, w: z.w, h: hoch }, [oben.length], { x: u.text * 0.8, y: 0 })
    const ru = raster(u, unten.map((o) => posten(o.k, u)), { x: z.x, y: ay + ah + u.text * 1.2, w: z.w, h: hoch }, [Math.max(1, unten.length)], { x: u.text * 0.8, y: 0 })
    const g = Math.min(ro.g, ru.g)
    const achsEl = diagrammElement(achse, achsR, u, Math.min(...knoten.map((k) => k.schritt)), g)
    aus.push(achsEl)
    // Obere Reihe unten bündig an die Achse, untere oben bündig
    oben.forEach((o, i) => {
      const r = ro.rects[i]
      aus.push(kasten(posten(o.k, u), { ...r, y: z.y + hoch - r.h }, g, u))
    })
    unten.forEach((o, i) => aus.push(kasten(posten(o.k, u), { ...ru.rects[i], y: ay + ah + u.text * 1.2 }, g, u)))
    if (!ro.passt || !ru.passt) u.ueberlauf.push('Die Zeitleiste passt bei Mindestschrift nicht ganz in das Hauptfeld.')
  } else {
    const aw = u.text * 3.2
    const achsR = { x: z.x, y: z.y, w: aw, h: z.h }
    achse.eintraege = achse.eintraege.map((e) => ({ ...e, y: e.x, x: undefined }))
    const r = raster(u, ordnung.map((o) => posten(o.k, u)), { x: z.x + aw + u.text * 1.5, y: z.y, w: z.w - aw - u.text * 1.5, h: z.h }, [1], { x: 0, y: u.text * 0.5 })
    aus.push(diagrammElement(achse, achsR, u, Math.min(...knoten.map((k) => k.schritt)), r.g))
    ordnung.forEach((o, i) => aus.push(kasten(posten(o.k, u), r.rects[i], r.g, u)))
    if (!r.passt) u.ueberlauf.push('Die Zeitleiste passt bei Mindestschrift nicht ganz in das Hauptfeld.')
  }
  // Jeder Kasten zeigt auf seine Marke
  const achsEl = aus[0]
  aus.slice(1, n + 1).forEach((e) => {
    const t = achse.eintraege[Math.max(0, ordnung.findIndex((o) => o.k.id === e.knoten))]
    const ax = quer ? achsEl.x + (t.x ?? 0) * achsEl.w : achsEl.x + achsEl.w * 0.5
    const ay = quer ? achsEl.y + achsEl.h * 0.5 : achsEl.y + (t.y ?? 0) * achsEl.h
    aus.push({ ...verbinder(e, e, '', 'linie'), nach: '', zielPunkt: { x: ax, y: ay } })
  })
  return aus
}

function kreislauf(u: Umgebung, inhalt: TbInhalt, z: Rechteck): TbElement[] {
  const zentrum = inhalt.knoten.find((k) => k.rolle === 'zentrum')
  const stationen = inhalt.knoten.filter((k) => k !== zentrum)
  const n = stationen.length
  if (n < 3) return fluss(u, inhalt, z, z.w > z.h)
  let bw = Math.min(z.w * 0.32, z.w / (n > 5 ? 3 : 2.4))
  let g = u.text
  let rects: Rechteck[] = []
  for (let versuch = 0; versuch < 40; versuch++) {
    const bh = Math.max(...stationen.map((k) => hoeheBei(u, k.titel, knotenText(k, u.stil), bw, g, Boolean(k.symbol))))
    const rx = (z.w - bw) / 2
    const ry = (z.h - bh) / 2
    const cx = z.x + z.w / 2
    const cy = z.y + z.h / 2
    rects = stationen.map((_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
      return { x: cx + rx * Math.cos(a) - bw / 2, y: cy + ry * Math.sin(a) - bh / 2, w: bw, h: bh }
    })
    const frei = rects.every((a, i) => rects.every((b, j) => i === j || !schneidet(a, b, u.text * 0.3))) && ry >= 0
    if (frei) break
    if (g > u.min) g = Math.max(u.min, g * 0.94)
    else bw *= 0.93
    if (versuch === 39) u.ueberlauf.push('Der Kreislauf ist sehr eng – Stationen kürzen.')
  }
  const el = stationen.map((k, i) => kasten(posten(k, u), rects[i], g, u))
  const aus = [...el]
  if (zentrum) {
    const w = bw * 0.9
    const h = hoeheBei(u, zentrum.titel, knotenText(zentrum, u.stil), w, g, Boolean(zentrum.symbol))
    const r = { x: z.x + z.w / 2 - w / 2, y: z.y + z.h / 2 - h / 2, w, h }
    if (!rects.some((x) => schneidet(x, r, 0))) aus.push({ ...kasten(posten(zentrum, u), r, g, u), rahmen: 'keiner' })
  }
  el.forEach((e, i) => aus.push(verbinder(e, el[(i + 1) % n], inhalt.beziehungen.find((b) => b.von === e.knoten)?.beschriftung ?? '', 'pfeil')))
  return aus
}

/** Übernommene Anordnung (Tafelfoto): Lage der KI, dann entzerrt */
function frei(u: Umgebung, inhalt: TbInhalt, z: Rechteck): TbElement[] {
  const mitLage = inhalt.knoten.filter((k) => k.lage && k.lage.w > 0 && k.lage.h > 0)
  if (mitLage.length < inhalt.knoten.length / 2) return gliederung(u, inhalt.knoten, z, z.w > z.h)
  const g = u.text
  const el = inhalt.knoten.map((k, i) => {
    const l = k.lage ?? { x: 0.05 + (i % 3) * 0.3, y: 0.3 + Math.floor(i / 3) * 0.2, w: 0.25, h: 0.15 }
    const r = { x: l.x * u.W, y: l.y * u.H, w: Math.max(l.w * u.W, g * 4), h: 0 }
    r.h = Math.max(l.h * u.H, hoeheBei(u, k.titel, knotenText(k, u.stil), r.w, g, Boolean(k.symbol)))
    return kasten(posten(k, u), r, g, u)
  })
  const aus = [...el]
  for (const b of inhalt.beziehungen) {
    const von = el.find((e) => e.knoten === b.von)
    const nach = el.find((e) => e.knoten === b.nach)
    if (von && nach && von !== nach) aus.push(verbinder(von, nach, b.beschriftung, b.art))
  }
  return aus
}

// ---------- Zeichnungen ----------

const diagrammElement = (d: Diagramm, r: Rechteck, u: Umgebung, schritt: number, g?: number): TbElement => ({
  id: neueId('d'),
  typ: 'diagramm',
  ...rel(r, u),
  text: '',
  farbe: 'grund',
  schrift: (g ?? u.text) / u.H,
  schritt,
  niveau: 1,
  diagramm: d
})

/** Seitenverhältnis (Breite/Höhe), das eine Zeichnung gern hätte */
function wunschVerhaeltnis(z: TbZeichnung): number {
  if (z.art === 'formel') return 3.2
  if (z.art === 'diagramm') {
    const a = z.diagramm?.art
    if (a === 'zeitstrahl') return 4
    if (a === 'schaltplan') return 1.5
    if (a === 'tabelle') return 1.8
    return 1.2
  }
  return 1
}

function zeichnungElement(z: TbZeichnung, r: Rechteck, u: Umgebung): TbElement {
  const basis = { id: neueId('z'), ...rel(r, u), text: z.beschriftung ?? '', farbe: 'grund' as Farbe, schritt: z.schritt || 2, niveau: 1 as const, schrift: u.text / u.H }
  switch (z.art) {
    case 'formel':
      return { ...basis, typ: 'formel', tex: z.tex ?? '' }
    case 'diagramm':
      return { ...basis, typ: 'diagramm', diagramm: z.diagramm }
    case 'skizze':
      return { ...basis, typ: 'skizze', vorlage: z.vorlage ?? '' }
    case 'symbol':
      return { ...basis, typ: 'symbol', symbol: z.symbol ?? 'idee' }
    default:
      return { ...basis, typ: z.bild ? 'bild' : 'symbol', ...(z.bild ? { bild: z.bild, bildQuelle: z.art === 'kibild' ? 'ki' : 'openmoji', bildPrompt: z.prompt } : { symbol: 'idee' }) }
  }
}

/** Zeichnungen nebeneinander (quer) bzw. untereinander in eine Fläche setzen */
function zeichnungenSetzen(liste: TbZeichnung[], z: Rechteck, u: Umgebung): TbElement[] {
  if (!liste.length || z.w <= 0 || z.h <= 0) return []
  const quer = z.w / z.h >= 1
  const luft = u.text * 0.6
  const n = liste.length
  const aus: TbElement[] = []
  const zelle = quer ? { w: (z.w - luft * (n - 1)) / n, h: z.h } : { w: z.w, h: (z.h - luft * (n - 1)) / n }
  liste.forEach((zz, i) => {
    const v = wunschVerhaeltnis(zz)
    // Beschriftung unter Bildern/Symbolen braucht eine Zeile
    const unter = zz.beschriftung && zz.art !== 'formel' && zz.art !== 'diagramm' ? u.text * 1.4 : 0
    let w = zelle.w
    let h = w / v + unter
    if (h > zelle.h) {
      h = zelle.h
      w = Math.min(zelle.w, (h - unter) * v)
    }
    const x0 = quer ? z.x + i * (zelle.w + luft) : z.x
    const y0 = quer ? z.y : z.y + i * (zelle.h + luft)
    aus.push(zeichnungElement(zz, { x: x0 + (zelle.w - w) / 2, y: y0 + (zelle.h - h) / 2, w, h }, u))
  })
  return aus
}

// ---------- Hauptfunktion ----------

export interface LayoutOptionen {
  regler: Pick<Regler, 'stil'>
  varianten: Varianten
  schrift?: Schriftart
}

export interface LayoutErgebnis {
  tafel: TbTafel
  ueberlauf: string[]
}

export function schneidet(a: Rechteck, b: Rechteck, luft = 0): boolean {
  return a.x < b.x + b.w + luft && b.x < a.x + a.w + luft && a.y < b.y + b.h + luft && b.y < a.y + a.h + luft
}

/**
 * Zonen der Formate ohne Flügel nach Bedarf: Überschrift, Impuls, Merksatz und Hausaufgabe bekommen
 * so viel Höhe, wie ihr Text braucht (mit Obergrenze) – der Rest gehört dem Hauptfeld. Feste
 * Anteile ließen auf dem Flipchart zu wenig Platz für die Struktur.
 */
function dynamischeZonen(format: FormatId, inhalt: TbInhalt, u: Umgebung, v: Varianten): Zonen {
  const basis = zonen(format)
  const f = formatInfo(format)
  const ry = (f.rand * Math.min(f.breite, f.hoehe)) / f.hoehe
  const luft = (u.text * 0.7) / u.H
  const bedarf = (titel: string, text: string, typ: TbElement['typ'], w: number, g: number): number =>
    text.trim() ? kastenSatz({ titel, text, typ }, w * u.W, g, u.schrift).hoehe / u.H : 0
  const titelH = Math.min(0.16, Math.max(bedarf('', inhalt.titel || 'Tafelbild', 'text', basis.titel.w, u.titel), (u.titel * ZEILENHOEHE) / u.H))
  const merkText = v.merksatz ? (inhalt.merksatz?.text ?? '') : ''
  const merkTitel = inhalt.merksatz?.titel || 'Merke!'
  if (format === 'whiteboard') {
    const impulsH = Math.min(0.22, bedarf('', inhalt.impuls, 'text', basis.impuls?.w ?? 0.3, u.text * 0.9))
    const oben = Math.max(titelH, impulsH)
    const merkH = Math.min(0.3, bedarf(merkTitel, merkText, 'merksatz', basis.merksatz.w, u.text))
    const haH = Math.min(0.3, bedarf('Hausaufgabe', inhalt.hausaufgabe, 'text', basis.hausaufgabe?.w ?? 0.3, u.text * 0.92))
    const unten = Math.max(merkH, haH)
    const untenY = 1 - ry - unten
    const hauptY = ry + oben + luft
    return {
      titel: { ...basis.titel, y: ry, h: oben },
      impuls: basis.impuls ? { ...basis.impuls, y: ry, h: oben } : null,
      haupt: { ...basis.haupt, y: hauptY, h: Math.max(0.1, untenY - (unten ? luft : 0) - hauptY) },
      merksatz: { ...basis.merksatz, y: untenY, h: unten },
      hausaufgabe: basis.hausaufgabe ? { ...basis.hausaufgabe, y: untenY, h: unten } : null
    }
  }
  // Flipchart und Heft: von oben nach unten
  const breit = { x: basis.haupt.x, w: basis.haupt.w }
  const impulsH = Math.min(0.14, bedarf('', inhalt.impuls, 'text', breit.w, u.text * 0.9))
  const haH = Math.min(0.14, bedarf('Hausaufgabe', inhalt.hausaufgabe, 'text', breit.w, u.text * 0.92))
  const merkH = Math.min(0.26, bedarf(merkTitel, merkText, 'merksatz', breit.w, u.text))
  const impulsY = ry + titelH + luft * 0.4
  const haY = 1 - ry - haH
  const merkY = haY - (haH ? luft * 0.6 : 0) - merkH
  const hauptY = impulsY + impulsH + (impulsH ? luft : luft * 0.4)
  return {
    titel: { ...basis.titel, x: breit.x, w: breit.w, y: ry, h: titelH },
    impuls: { ...breit, y: impulsY, h: impulsH },
    haupt: { ...breit, y: hauptY, h: Math.max(0.1, merkY - (merkH ? luft : 0) - hauptY) },
    merksatz: { ...breit, y: merkY, h: merkH },
    hausaufgabe: { ...breit, y: haY, h: haH }
  }
}

/** Setzt das Tafelbild für ein Format. */
export function setzeLayout(inhalt: TbInhalt, format: FormatId, o: LayoutOptionen): LayoutErgebnis {
  /*
   * Erst in der vorgesehenen Schrift; passt es nicht, wird ALLES gleichmäßig kleiner – bis zur
   * Notfallschrift des Formats. Lieber eine kleinere Schrift (mit Befund) als Kästen, die sich
   * überdecken; die KI kürzt danach auf Wunsch (auftrag.ts).
   */
  const f = formatInfo(format)
  let letztes: LayoutErgebnis | null = null
  for (const faktor of [1, 0.93, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56]) {
    const r = setzeEinmal(inhalt, format, o, faktor)
    letztes = r
    if (!r.ueberlauf.length) {
      if (faktor < 1) r.ueberlauf.push('Zu viel Text für diese Fläche – die Schrift wurde verkleinert. Kürzen empfohlen.')
      return r
    }
    if (f.schrift.text * faktor <= f.schrift.notfall) break
  }
  // Letzter Ausweg: Überlappungen wurden nach unten geschoben – alles gleichmäßig verkleinern, bis es auf die Fläche passt
  const r = letztes!
  const unten = Math.max(...r.tafel.elemente.filter((e) => e.typ !== 'verbinder').map((e) => e.y + e.h))
  const rechts = Math.max(...r.tafel.elemente.filter((e) => e.typ !== 'verbinder').map((e) => e.x + e.w))
  const s = Math.min(1, 0.97 / Math.max(unten, rechts))
  if (s < 1) {
    for (const e of r.tafel.elemente) {
      e.x = 0.5 + (e.x - 0.5) * s
      e.y *= s
      e.w *= s
      e.h *= s
      if (e.schrift) e.schrift *= s
      if (e.zielPunkt) e.zielPunkt = { x: 0.5 + (e.zielPunkt.x - 0.5) * s, y: e.zielPunkt.y * s }
    }
    r.ueberlauf.push('Viel zu viel Text für diese Fläche – alles wurde verkleinert und ist aus der letzten Reihe kaum lesbar. Bitte kürzen.')
  }
  return r
}

function setzeEinmal(inhalt: TbInhalt, format: FormatId, o: LayoutOptionen, faktor: number): LayoutErgebnis {
  const f = formatInfo(format)
  const schrift = o.schrift ?? standardSchrift(format)
  const H = f.hoehe
  const min = Math.max(f.schrift.notfall, Math.min(f.schrift.min, f.schrift.text * faktor * 0.9)) * H
  const u: Umgebung = { W: f.breite, H, schrift, min, text: Math.max(min, f.schrift.text * faktor * H), titel: Math.max(min * 1.3, f.schrift.titel * faktor * H), stil: o.regler.stil, oben: format === 'heft', ueberlauf: [] }
  const zo = format === 'klapptafel' ? zonen(format) : dynamischeZonen(format, inhalt, u, o.varianten)
  const quer = f.breite > f.hoehe
  const el: TbElement[] = []

  // Überschrift (Pflicht, als Leitfrage)
  const tz = abs(zo.titel, u)
  const titelText = inhalt.titel.trim() || 'Tafelbild'
  const ts = kastenSatz({ text: titelText, typ: 'text' }, tz.w, u.titel, schrift)
  const tg = ts.hoehe > tz.h ? Math.max(u.min * 1.3, u.titel * Math.sqrt(tz.h / ts.hoehe)) : u.titel
  el.push({ id: neueId('t'), typ: 'text', ...rel(tz, u), text: titelText, farbe: 'gelb', schrift: tg / u.H, ausrichtung: quer ? 'mitte' : 'links', schritt: 1, niveau: 1 })

  // Zeichnungen ohne Bezug (Skizzen, Diagramme, Formeln, Bilder) brauchen eine eigene Fläche
  const freieZeichnungen = inhalt.zeichnungen.filter((z) => !z.bezug || !inhalt.knoten.some((k) => k.id === z.bezug))
  let haupt = abs(zo.haupt, u)
  let zeichenFlaeche: Rechteck | null = null
  const impulsZone = zo.impuls ? abs(zo.impuls, u) : null

  // Impuls / Arbeitsauftrag
  if (inhalt.impuls.trim() && impulsZone) {
    const kurz = format === 'klapptafel'
    const titel = kurz ? 'Impuls' : ''
    const g = kurz ? u.text : Math.min(u.text, u.text * 0.9)
    const s = kastenSatz({ titel, text: inhalt.impuls, typ: kurz ? 'kasten' : 'text' }, impulsZone.w, g, schrift)
    const h = Math.min(impulsZone.h * (kurz ? 0.5 : 1), s.hoehe)
    const r = { x: impulsZone.x, y: impulsZone.y, w: impulsZone.w, h }
    const passt = s.hoehe <= impulsZone.h * (kurz ? 0.5 : 1) + 1
    const gg = passt ? g : Math.max(u.min, g * Math.sqrt((impulsZone.h * (kurz ? 0.5 : 1)) / s.hoehe))
    el.push({ id: neueId('i'), typ: kurz ? 'kasten' : 'text', ...rel(r, u), titel: titel || undefined, text: inhalt.impuls, farbe: kurz ? 'blau' : 'blau', rahmen: kurz ? 'gestrichelt' : 'keiner', schrift: gg / u.H, schritt: 1, niveau: 1 })
    if (kurz) zeichenFlaeche = { x: impulsZone.x, y: impulsZone.y + h + u.text * 0.8, w: impulsZone.w, h: impulsZone.h - h - u.text * 0.8 }
  } else if (impulsZone && format === 'klapptafel') zeichenFlaeche = impulsZone

  // Andere Formate: Zeichnungen unten bzw. rechts im Hauptfeld
  if (freieZeichnungen.length && !zeichenFlaeche) {
    if (format === 'whiteboard') {
      const b = haupt.w * 0.3
      zeichenFlaeche = { x: haupt.x + haupt.w - b, y: haupt.y, w: b, h: haupt.h }
      haupt = { ...haupt, w: haupt.w - b - u.text }
    } else {
      // So hoch wie nötig: eine Formel oder ein Zeitstrahl braucht wenig Höhe, eine Skizze mehr
      const zelleW = haupt.w / freieZeichnungen.length
      const bedarf = Math.max(
        ...freieZeichnungen.map((z) => {
          const eigen = zelleW / wunschVerhaeltnis(z)
          if (z.art === 'formel') return Math.min(eigen, u.text * 3)
          if (z.diagramm?.art === 'zeitstrahl') return Math.min(eigen, u.text * 5.5)
          return eigen + (z.beschriftung ? u.text * 1.4 : 0)
        })
      )
      const h = Math.min(bedarf, haupt.h * 0.3 * faktor)
      zeichenFlaeche = { x: haupt.x, y: haupt.y + haupt.h - h, w: haupt.w, h }
      haupt = { ...haupt, h: haupt.h - h - u.text * 0.8 }
    }
  }
  const zeichnungen = freieZeichnungen.length && zeichenFlaeche ? zeichnungenSetzen(freieZeichnungen, zeichenFlaeche, u) : []
  el.push(...zeichnungen)

  // Struktur im Hauptfeld
  const struktur: StrukturArt = inhalt.knoten.length ? inhalt.struktur : 'gliederung'
  const hauptQuer = haupt.w > haupt.h * 1.1
  if (inhalt.knoten.length) {
    const setze = (uu: Umgebung): TbElement[] =>
      struktur === 'netz'
        ? netz(uu, inhalt, haupt, hauptQuer)
        : struktur === 'tabelle'
          ? tabelle(uu, inhalt, haupt)
          : struktur === 'fluss'
            ? fluss(uu, inhalt, haupt, hauptQuer)
            : struktur === 'zeitleiste'
              ? zeitleiste(uu, inhalt, haupt, hauptQuer)
              : struktur === 'kreislauf'
                ? kreislauf(uu, inhalt, haupt)
                : struktur === 'frei'
                  ? frei(uu, inhalt, haupt)
                  : gliederung(uu, inhalt.knoten, haupt, hauptQuer)
    const teile = setze(u)
    el.push(...teile)
    // Hefteintrag: Zeichnungen direkt unter die Struktur rücken – keine Lücke mitten im Heft
    if (u.oben && zeichnungen.length && format !== 'klapptafel' && format !== 'whiteboard') {
      const unten = Math.max(...teile.filter((e) => e.typ !== 'verbinder').map((e) => e.y + e.h))
      const oben = Math.min(...zeichnungen.map((e) => e.y))
      const ziel = unten + (u.text * 1.2) / u.H
      if (oben > ziel) for (const e of zeichnungen) e.y -= oben - ziel
    }
  }

  // Bilder zu Knoten: ins Kastensymbol
  for (const z of inhalt.zeichnungen) {
    if (!z.bezug) continue
    const k = el.find((e) => e.knoten === z.bezug && e.typ === 'kasten')
    if (!k) continue
    if (z.bild) {
      k.bild = z.bild
      k.bildQuelle = z.art === 'kibild' ? 'ki' : 'openmoji'
    } else if (z.art === 'symbol' && z.symbol && !k.symbol) k.symbol = z.symbol
  }

  // Sicherung: Merksatz und Hausaufgabe
  const mz = abs(zo.merksatz, u)
  if (o.varianten.merksatz && inhalt.merksatz?.text.trim()) {
    const titel = inhalt.merksatz.titel.trim() || 'Merke!'
    let g = u.text
    let s = kastenSatz({ titel, text: inhalt.merksatz.text, typ: 'merksatz' }, mz.w, g, schrift)
    while (s.hoehe > mz.h && g > u.min) {
      g = Math.max(u.min, g * 0.94)
      s = kastenSatz({ titel, text: inhalt.merksatz.text, typ: 'merksatz' }, mz.w, g, schrift)
    }
    if (s.hoehe > mz.h + 1) u.ueberlauf.push('Der Merksatz ist für sein Feld zu lang.')
    const h = Math.min(mz.h, s.hoehe)
    el.push({
      id: neueId('m'),
      typ: 'merksatz',
      x: mz.x / u.W,
      y: (format === 'klapptafel' ? mz.y : mz.y + (mz.h - h) / 2) / u.H,
      w: mz.w / u.W,
      h: h / u.H,
      titel,
      text: inhalt.merksatz.text,
      farbe: 'orange',
      rahmen: 'doppelt',
      schrift: g / u.H,
      schritt: Math.max(2, ...el.map((e) => e.schritt)) + 1,
      niveau: 1,
      ...(inhalt.merksatz.lueckenWoerter.length ? { lueckenWoerter: inhalt.merksatz.lueckenWoerter } : {})
    })
  }
  if (inhalt.hausaufgabe.trim() && zo.hausaufgabe) {
    const hz = abs(zo.hausaufgabe, u)
    let g = Math.min(u.text, u.text * 0.92)
    let s = kastenSatz({ titel: 'Hausaufgabe', text: inhalt.hausaufgabe, typ: 'text' }, hz.w, g, schrift)
    while (s.hoehe > hz.h && g > u.min) {
      g = Math.max(u.min, g * 0.94)
      s = kastenSatz({ titel: 'Hausaufgabe', text: inhalt.hausaufgabe, typ: 'text' }, hz.w, g, schrift)
    }
    if (s.hoehe > hz.h + 1) u.ueberlauf.push('Die Hausaufgabe ist für ihr Feld zu lang.')
    el.push({
      id: neueId('h'),
      typ: 'text',
      x: hz.x / u.W,
      y: hz.y / u.H,
      w: hz.w / u.W,
      h: Math.min(hz.h, s.hoehe) / u.H,
      titel: 'Hausaufgabe',
      text: inhalt.hausaufgabe,
      farbe: 'grund',
      schrift: g / u.H,
      schritt: Math.max(...el.map((e) => e.schritt)),
      niveau: 1
    })
  }

  // Aufbau: ohne schrittweisen Aufbau steht alles in Schritt 1; sonst lückenlos durchnummeriert
  if (!o.varianten.schritte) for (const e of el) e.schritt = 1
  else nummeriereSchritte(el)
  entzerre(el, u)
  if (el.some((e) => e.typ !== 'verbinder' && (e.y + e.h > 1.002 || e.x + e.w > 1.002))) u.ueberlauf.push('Nicht alles passt auf die Fläche.')
  return { tafel: { format, elemente: el, schrift }, ueberlauf: u.ueberlauf }
}

/** Schritte lückenlos 1 … n; Verbinder erscheinen mit dem späteren ihrer Enden */
export function nummeriereSchritte(el: TbElement[]): void {
  const werte = [...new Set(el.filter((e) => e.typ !== 'verbinder').map((e) => e.schritt || 1))].sort((a, b) => a - b)
  const neu = new Map(werte.map((w, i) => [w, i + 1]))
  for (const e of el) if (e.typ !== 'verbinder') e.schritt = neu.get(e.schritt || 1) ?? 1
  const nach = new Map(el.map((e) => [e.id, e]))
  for (const e of el) {
    if (e.typ !== 'verbinder') continue
    const a = e.von ? nach.get(e.von)?.schritt : undefined
    const b = e.nach ? nach.get(e.nach)?.schritt : undefined
    e.schritt = Math.max(a ?? 1, b ?? 1)
  }
}

/**
 * Letzte Sicherung gegen Überlappung: Überdeckt ein Element ein anderes (Linien ausgenommen),
 * rutscht das spätere nach unten – oder, wenn unten kein Platz ist, nach rechts. Bleibt es dabei,
 * meldet die Prüfung die Überlappung.
 */
export function entzerre(el: TbElement[], u: { W: number; H: number }): void {
  const flaechig = el.filter((e) => e.typ !== 'verbinder' && e.typ !== 'pfeil')
  const r = (e: TbElement): Rechteck => ({ x: e.x * u.W, y: e.y * u.H, w: e.w * u.W, h: e.h * u.H })
  for (let runde = 0; runde < 12; runde++) {
    let geaendert = false
    for (let i = 0; i < flaechig.length; i++) {
      for (let j = i + 1; j < flaechig.length; j++) {
        const a = r(flaechig[i])
        const b = r(flaechig[j])
        if (!schneidet(a, b, -0.5)) continue
        const runter = a.y + a.h + 4 - b.y
        const rechts = a.x + a.w + 4 - b.x
        // Nach unten, sonst nach rechts; passt beides nicht, trotzdem nach unten (über den Rand –
        // das meldet die Prüfung, und setzeLayout verkleinert dann alles)
        if (b.y + runter + b.h <= u.H || b.x + rechts + b.w > u.W) flaechig[j].y = (b.y + runter) / u.H
        else flaechig[j].x = (b.x + rechts) / u.W
        geaendert = true
      }
    }
    if (!geaendert) break
  }
}

/** Alle gewählten Formate neu setzen */
export function setzeAlle(inhalt: TbInhalt, formate: FormatId[], o: Omit<LayoutOptionen, 'schrift'>, schriften: Partial<Record<FormatId, Schriftart>> = {}): LayoutErgebnis[] {
  return formate.map((f) => setzeLayout(inhalt, f, { ...o, schrift: schriften[f] }))
}
