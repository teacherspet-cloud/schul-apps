/**
 * Zeitleisten-Modell (Nachbesserung 30.09.2026) – Datum lesen, Ereignisse ordnen, Marken setzen.
 *
 * Befund der Lehrkraft: „Die Texte und Boxen werden unchronologisch und an falschen Stellen mit der
 * Zeitleiste verbunden." Ursachen:
 * 1. Das Datum wurde zu grob gelesen: „9. November 1918" ergab das Jahr 9, „28.6.1914" das Jahr 286,
 *    „vor 66 Mio. Jahren" lag NACH „vor 2 Mio. Jahren". Fehlte eine Angabe, blieb die ganze Leiste
 *    in der Reihenfolge der KI.
 * 2. Die Verbinder endeten an einer beim Setzen berechneten Stelle, das SVG zeichnete die Marke aber
 *    mit einem Einzug für die Beschriftung – der Verbinder traf daneben. Verschob die Lehrkraft die
 *    Achse, blieben die Enden stehen.
 * 3. Die Kästen standen in gleich breiten Spalten, unabhängig von der Lage ihrer Marke.
 *
 * Jetzt: EIN Zeitwert je Angabe (Jahre als Dezimalzahl, v. Chr. negativ, Monat und Tag als Bruchteil),
 * eine stabile Sortierung, Marken maßstabsgerecht oder gleichabständig, und die Lage einer Marke
 * rechnet genau EINE Funktion (markenPunkt) – für Zeichnung, Verbinder, PowerPoint und Editor.
 */
import type { Schriftart } from './formate'
import type { Diagramm, TbBeziehung, TbElement, TbInhalt, TbKnoten } from './model'
import { textBreite } from './textsatz'

// ---------- Datum lesen ----------

const MONATE: [RegExp, number][] = [
  [/^jan/, 1],
  [/^feb/, 2],
  [/^(m[äa]r|maerz|march)/, 3],
  [/^apr/, 4],
  [/^(mai|may)/, 5],
  [/^jun/, 6],
  [/^jul/, 7],
  [/^aug/, 8],
  [/^sep/, 9],
  [/^(okt|oct)/, 10],
  [/^nov/, 11],
  [/^(dez|dec)/, 12]
]
const MONATSWORT = '(januar|jan|februar|feb|märz|maerz|mär|mrz|april|apr|mai|juni|jun|juli|jul|august|aug|september|sept|sep|oktober|okt|november|nov|dezember|dez)'

const monatAus = (w: string): number => MONATE.find(([r]) => r.test(w))?.[1] ?? 1

/** Zahl mit Tausenderpunkt oder -leerzeichen („10.000", „12 000") und Dezimalkomma („3,5") */
const zahlAus = (s: string): number => {
  const t = s.trim()
  if (/^\d{1,3}([.\s ]\d{3})+$/.test(t)) return Number(t.replace(/[.\s ]/g, ''))
  return Number(t.replace(',', '.'))
}

/**
 * Zeitwert einer Angabe in Jahren (v. Chr. negativ; Monat und Tag als Bruchteil des Jahres) –
 * oder null, wenn keine Zeit darin steht. Versteht u. a. „1918", „9. November 1918", „28.6.1914",
 * „1914-06-28", „Juli 1914 – 1918", „44 v. Chr.", „15. Jh.", „Ende des 5. Jh. v. Chr.",
 * „3. Jahrtausend v. Chr.", „1920er Jahre", „vor 66 Mio. Jahren", „vor 10.000 Jahren", „3,5 Mrd.".
 */
export function zeitWert(zeit?: string | null): number | null {
  if (!zeit) return null
  let s = ` ${zeit.toLowerCase().replace(/[‒-―−]/g, '-').replace(/ /g, ' ')} `
  const vChr = /v\.\s*chr|vor\s+christus|v\.\s*u\.\s*z|\bbce?\b/.test(s)
  const vorz = (n: number): number => (vChr ? -Math.abs(n) : n)

  // Erdzeitalter und Vorgeschichte: „vor 66 Mio. Jahren", „3,5 Mrd. Jahre", „vor 10.000 Jahren"
  const gross = /(\d+(?:[.,]\d+)?)\s*(mrd|milliarde|mio|million|tsd|tausend)/.exec(s)
  if (gross) {
    const f = /^mrd|^milliard/.test(gross[2]) ? 1e9 : /^mio|^million/.test(gross[2]) ? 1e6 : 1e3
    const n = zahlAus(gross[1]) * f
    // Ohne „n. Chr." ist eine Angabe in Millionen immer „vor heute"
    return /n\.\s*chr/.test(s) ? n : -n
  }
  const vorJahren = /vor\s+(?:ca\.\s*|etwa\s+|rund\s+|über\s+)?(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:jahren|j\.)/.exec(s)
  if (vorJahren) return -zahlAus(vorJahren[1])

  // ISO-Datum
  const iso = /(-?\d{3,4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) return Number(iso[1]) + (Number(iso[2]) - 1) / 12 + (Number(iso[3]) - 1) / 365
  // Zeitraum: nur der Anfang zählt („1789–1799", „Juli 1914 bis 1918")
  s = s.replace(/(\d)\s*(?:-|bis)\s*\d.*$/, '$1 ').replace(/\s+-\s+.*$/, ' ')
  // Tagesdatum „28.6.1914", „28. 06. 1914"
  const tag = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,4})/.exec(s)
  if (tag) return vorz(Number(tag[3])) + (Number(tag[2]) - 1) / 12 + (Number(tag[1]) - 1) / 365
  // „9. November 1918", „November 1918", „Nov. 1918"
  const monat = new RegExp(`(?:(\\d{1,2})\\.?\\s*)?${MONATSWORT}\\.?\\s+(\\d{1,4})`).exec(s)
  if (monat) return vorz(Number(monat[3])) + (monatAus(monat[2]) - 1) / 12 + (Number(monat[1] ?? 1) - 1) / 365
  // Jahrtausend und Jahrhundert, mit Anfang/Mitte/Ende
  const lage = /anfang|beginn|frühe|fruehe|erste[ns]?\s+hälfte/.test(s) ? 0.1 : /ende|späte|spaete|zweite[ns]?\s+hälfte/.test(s) ? 0.9 : 0.5
  const jt = /(\d{1,2})\.\s*(?:jt|jtsd|jahrtausend)/.exec(s)
  if (jt) {
    const n = Number(jt[1])
    return vChr ? -(n * 1000 - lage * 1000) : (n - 1) * 1000 + lage * 1000
  }
  const jh = /(\d{1,2})\.\s*(?:jh|jahrhundert)/.exec(s)
  if (jh) {
    const n = Number(jh[1])
    return vChr ? -(n * 100 - lage * 100) : (n - 1) * 100 + lage * 100
  }
  // Jahrzehnt „1920er"
  const dek = /(\d{3})0er/.exec(s)
  if (dek) return vorz(Number(dek[1]) * 10 + 5)
  // Tag und Monat ohne Jahr („14. Juli") sind keine lesbare Zeit – die Tageszahl ist kein Jahr
  if (new RegExp(`\\d\\.?\\s*${MONATSWORT}\\b`).test(s)) return null
  // Jahr (auch negativ geschrieben: „-44"); eine drei- oder vierstellige Zahl vor einer kleinen
  // („mit 6 Jahren (1996)", „1. Weltkrieg 1914")
  const jahr = /(-?\d{3,4})(?!\d)/.exec(s) ?? /(-?\d{1,2})(?!\d)/.exec(s)
  if (!jahr) return null
  const n = Number(jahr[1])
  return n < 0 ? n : vorz(n)
}

/** Erstes Jahr einer Zeitangabe (ganzzahlig) – für ältere Aufrufer */
export function jahrAus(zeit?: string): number | null {
  const v = zeitWert(zeit)
  return v === null ? null : Math.trunc(v)
}

/** Kurze Form für die Achse: „9. November 1918" → „9.11.1918", „November 1918" → „Nov. 1918" */
export function kurzeZeit(zeit: string): string {
  const s = zeit.trim()
  const m = new RegExp(`^(\\d{1,2})\\.?\\s*${MONATSWORT}\\.?\\s+(\\d{1,4})(.*)$`, 'i').exec(s)
  if (m) return `${Number(m[1])}.${monatAus(m[2].toLowerCase())}.${m[3]}${m[4]}`.trim()
  const n = new RegExp(`^${MONATSWORT}\\.?\\s+(\\d{1,4})(.*)$`, 'i').exec(s)
  if (n && n[1].length > 4) return `${n[1].slice(0, 3)}. ${n[2]}${n[3]}`.trim()
  return s.replace(/\s+/g, ' ')
}

// ---------- Ereignisse ordnen ----------

export interface Ereignis {
  knoten: TbKnoten
  /** Zeitwert; ohne lesbares Datum der des Vorgängers in der Reihenfolge der KI */
  wert: number
  geschaetzt: boolean
}

/**
 * Ereignisse chronologisch: stabil nach Zeitwert (gleiche Zeit → Reihenfolge der KI). Ein Ereignis
 * ohne lesbares Datum bleibt hinter seinem Vorgänger in der Reihenfolge der KI.
 */
export function ordneEreignisse(knoten: TbKnoten[]): Ereignis[] {
  const werte = knoten.map((k) => zeitWert(k.zeit))
  const erster = werte.find((w) => w !== null) ?? 0
  let vorher = erster
  const liste = knoten.map((k, i) => {
    const w = werte[i]
    if (w !== null) vorher = w
    return { knoten: k, wert: w ?? vorher, geschaetzt: w === null, i }
  })
  return liste.sort((a, b) => a.wert - b.wert || a.i - b.i).map(({ knoten, wert, geschaetzt }) => ({ knoten, wert, geschaetzt }))
}

export type ZeitMassstab = 'auto' | 'massstab' | 'gleich'

export const MASSSTAB_NAMEN: Record<ZeitMassstab, string> = {
  auto: 'Automatisch',
  massstab: 'Maßstabsgerecht',
  gleich: 'Gleiche Abstände'
}

export interface Marke {
  wert: number
  /** Beschriftung (Zeitangabe des ersten Ereignisses dieser Marke) */
  text: string
  /** Lage auf der Achse 0 … 1 */
  t: number
}

/**
 * Maßstabsgerecht, wenn die Abstände nicht zu ungleich sind – sonst drängen sich Marken (Monate
 * 1789 neben Jahren bis 1799, Erdzeitalter in Millionen Jahren) und die Beschriftungen überdecken sich.
 */
export function massstabPasst(werte: number[]): boolean {
  const w = [...new Set(werte)].sort((a, b) => a - b)
  if (w.length < 3) return true
  const luecken = w.slice(1).map((x, i) => x - w[i])
  const spanne = w[w.length - 1] - w[0]
  const mittel = spanne / luecken.length
  const kleinste = Math.min(...luecken)
  return kleinste >= mittel * 0.25 && Math.max(...luecken) <= kleinste * 12
}

/** Marken (eine je verschiedenem Zeitwert) und die Marke jedes Ereignisses */
export function markenLage(ereignisse: Ereignis[], wahl: ZeitMassstab = 'auto'): { marken: Marke[]; zuMarke: number[]; art: 'massstab' | 'gleich' } {
  const marken: Marke[] = []
  const zuMarke: number[] = []
  for (const e of ereignisse) {
    const letzte = marken[marken.length - 1]
    if (letzte && Math.abs(letzte.wert - e.wert) < 1e-9) zuMarke.push(marken.length - 1)
    else {
      marken.push({ wert: e.wert, text: e.knoten.zeit?.trim() ? kurzeZeit(e.knoten.zeit) : '', t: 0 })
      zuMarke.push(marken.length - 1)
    }
  }
  const art = wahl === 'auto' ? (massstabPasst(marken.map((m) => m.wert)) ? 'massstab' : 'gleich') : wahl
  const min = marken[0]?.wert ?? 0
  const spanne = (marken[marken.length - 1]?.wert ?? 0) - min
  marken.forEach((m, i) => {
    m.t = marken.length < 2 ? 0.5 : art === 'massstab' && spanne > 0 ? (m.wert - min) / spanne : i / (marken.length - 1)
  })
  return { marken, zuMarke, art }
}

// ---------- Lage der Marken (Zeichnung, Verbinder, Editor) ----------

export interface AchsenMass {
  quer: boolean
  /** Schriftgrad der Achse */
  g: number
  /** Lage der Achsenlinie (y bei quer, x bei hochkant) */
  linie: number
  /** Erste und letzte mögliche Markenlage entlang der Achse */
  a0: number
  a1: number
  /** Seite der Beschriftung je Eintrag: -1 = oben bzw. links, 1 = unten bzw. rechts */
  seiten: (-1 | 1)[]
}

type Eintrag = Diagramm['eintraege'][number]

export const seiteVon = (t: Eintrag, i: number): -1 | 1 => (t.seite === -1 || t.seite === 1 ? t.seite : i % 2 === 1 ? -1 : 1)

/**
 * Maße eines gezeichneten Zeitstrahls in Einheiten der Fläche. `schriftGrad` = Schrift des
 * Elements (Anteil × Flächenhöhe). Quer: Einzug links und rechts so breit, dass die Beschriftung
 * am Rand nicht abgeschnitten wird; hochkant: Linie mittig, bei Beschriftung nur auf einer Seite
 * an den Rand gerückt.
 */
export function achsenMass(d: Diagramm, x: number, y: number, w: number, h: number, schriftGrad: number, schrift: Schriftart): AchsenMass {
  const nurAchse = d.eintraege.every((t) => !t.label)
  const quer = w >= h
  const g = Math.min(schriftGrad, quer ? h / (nurAchse ? 3.4 : 5.6) : w / 4)
  const seiten = d.eintraege.map(seiteVon)
  if (quer) {
    const breiteste = Math.max(
      g * 1.2,
      ...d.eintraege.map((t) => Math.min(g * 7, Math.max(textBreite(t.wert ?? '', g * 0.85, schrift) * 1.06, t.label ? textBreite(t.label, g * 0.8, schrift) : 0)))
    )
    const rand = breiteste / 2 + g * 0.2
    return { quer, g, linie: y + h / 2, a0: x + rand, a1: Math.max(x + rand, x + w - g * 0.9 - rand), seiten }
  }
  const links = seiten.some((s) => s < 0)
  const rechts = seiten.some((s) => s > 0)
  const linie = links && !rechts ? x + w - g * 0.7 : rechts && !links ? x + g * 0.7 : x + w / 2
  return { quer, g, linie, a0: y + g * 0.6, a1: Math.max(y + g * 0.6, y + h - g * 1.4), seiten }
}

/** Lage des Eintrags i: seine Lage 0 … 1 (x bei quer, y bei hochkant), ohne Angabe gleichmäßig */
export const eintragLage = (d: Diagramm, i: number, quer: boolean): number => {
  const t = d.eintraege[i]
  const v = quer ? t?.x : (t?.y ?? t?.x)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v as number)) : d.eintraege.length > 1 ? i / (d.eintraege.length - 1) : 0.5
}

/** Punkt der Marke i auf der Achse (Einheiten der Fläche) */
export function markenPunkt(m: AchsenMass, d: Diagramm, i: number): { x: number; y: number } {
  const v = m.a0 + eintragLage(d, i, m.quer) * (m.a1 - m.a0)
  return m.quer ? { x: v, y: m.linie } : { x: m.linie, y: v }
}

/** Marke i eines Zeitstrahl-Elements (Lage relativ, Einheiten W × H) – null, wenn es sie nicht gibt */
export function markeAufAchse(W: number, H: number, schrift: Schriftart, achse: Pick<TbElement, 'x' | 'y' | 'w' | 'h' | 'schrift' | 'diagramm'>, i: number): { x: number; y: number } | null {
  const d = achse.diagramm
  if (!d || d.art !== 'zeitstrahl' || !d.eintraege[i]) return null
  const m = achsenMass(d, achse.x * W, achse.y * H, achse.w * W, achse.h * H, (achse.schrift ?? 0.045) * H, schrift)
  return markenPunkt(m, d, i)
}

/**
 * Stehen die Jahreszahlen frei? Zwei Beschriftungen auf derselben Seite dürfen sich nicht
 * überdecken; eine Beschriftung darf nicht im Weg des Verbinders der Nachbarmarke liegen (der kommt
 * von der Seite, auf der sie steht). Sonst werden maßstabsgerechte Marken zu eng.
 */
export function beschriftungFrei(d: Diagramm, m: AchsenMass, schrift: Schriftart): boolean {
  const g = m.g
  const pos = d.eintraege.map((_, i) => (m.quer ? markenPunkt(m, d, i).x : markenPunkt(m, d, i).y))
  const ausdehnung = d.eintraege.map((t) => (m.quer ? textBreite(t.wert ?? '', g * 0.85, schrift) * 1.06 : g * 0.85 * 1.1))
  for (let i = 0; i < pos.length; i++)
    for (let j = i + 1; j < pos.length; j++) {
      const abstand = Math.abs(pos[j] - pos[i])
      const noetig = m.seiten[i] === m.seiten[j] ? (ausdehnung[i] + ausdehnung[j]) / 2 + g * 0.3 : Math.max(ausdehnung[i], ausdehnung[j]) / 2 + g * 0.5
      if (abstand < noetig) return false
    }
  return true
}

// ---------- Packen in einer Reihe ----------

/**
 * Kästen einer Reihe möglichst mittig an ihre Wunschstelle setzen, ohne Überlappung und in der
 * gegebenen Reihenfolge (so kreuzen sich die Verbinder nicht): erst nach rechts schieben, was
 * überlappt, dann von rechts in den Bereich zurück. Liefert die Anfänge.
 */
export function packe(mitten: number[], laengen: number[], von: number, bis: number, luft: number): number[] {
  const n = mitten.length
  const a = mitten.map((m, i) => m - laengen[i] / 2)
  for (let i = 0; i < n; i++) a[i] = Math.max(a[i], i ? a[i - 1] + laengen[i - 1] + luft : von)
  for (let i = n - 1; i >= 0; i--) a[i] = Math.min(a[i], i < n - 1 ? a[i + 1] - laengen[i] - luft : bis - laengen[i])
  // Reicht der Platz nicht, bleibt die Reihenfolge – der Anfang zählt
  for (let i = 0; i < n; i++) a[i] = Math.max(a[i], i ? a[i - 1] + laengen[i - 1] + luft : von)
  return a
}

// ---------- Prüfen der KI-Antwort ----------

export interface InhaltsProblem {
  knoten?: string
  text: string
}

const JAHR_IM_TEXT = /(?<![\d.,])(1\d{3}|20\d{2})(?![\d.,])/g

/**
 * Zeitleiste: jedes Ereignis braucht ein lesbares Datum; ein Jahr im Titel muss zum Datum passen.
 * Gleiche Ereignisse doppelt gelten ebenfalls als Fehler.
 */
export function pruefeZeitleiste(inhalt: Pick<TbInhalt, 'knoten'>): InhaltsProblem[] {
  const p: InhaltsProblem[] = []
  const gesehen = new Map<string, string>()
  for (const k of inhalt.knoten) {
    if (k.rolle === 'zentrum') continue
    const w = zeitWert(k.zeit)
    if (!k.zeit?.trim()) p.push({ knoten: k.id, text: `„${k.titel}" hat kein Datum.` })
    else if (w === null) p.push({ knoten: k.id, text: `„${k.titel}": Das Datum „${k.zeit}" ist nicht lesbar (Jahr, Datum oder Epoche angeben).` })
    else {
      const jahre = [...k.titel.matchAll(JAHR_IM_TEXT)].map((m) => Number(m[1]))
      if (jahre.length && w > 999 && !jahre.some((j) => Math.abs(j - Math.trunc(w)) <= 1))
        p.push({ knoten: k.id, text: `„${k.titel}": Das Jahr im Titel passt nicht zum Datum „${k.zeit}".` })
    }
    const schluessel = `${k.titel.trim().toLowerCase()}|${w}`
    if (gesehen.has(schluessel)) p.push({ knoten: k.id, text: `„${k.titel}" steht doppelt in der Zeitleiste.` })
    gesehen.set(schluessel, k.id)
  }
  return p
}

/**
 * Gegenüberstellung mit Aspekten: Jede Spalte braucht GENAU einen Eintrag je Aspekt – in der
 * Reihenfolge der Aspekte. Sonst rutschen Einträge in die falsche Zeile.
 */
export function pruefeTabelle(inhalt: Pick<TbInhalt, 'knoten' | 'aspekte'>): InhaltsProblem[] {
  const aspekte = (inhalt.aspekte ?? []).filter(Boolean)
  if (!aspekte.length) return []
  const spalten = inhalt.knoten.filter((k) => k.rolle === 'spalte')
  const liste = spalten.length >= 2 ? spalten : inhalt.knoten
  return liste
    .filter((k) => k.punkte.length !== aspekte.length)
    .map((k) => ({ knoten: k.id, text: `Spalte „${k.titel}" hat ${k.punkte.length} statt ${aspekte.length} Einträge (einer je Aspekt: ${aspekte.join(', ')}).` }))
}

/** Beginnt ein Eintrag mit dem Namen seines Aspekts („Wirtschaft: …"), ist der doppelt – weg damit */
export function ohneAspektPraefix(punkt: string, aspekt: string): string {
  const a = aspekt.trim()
  if (!a) return punkt
  const r = new RegExp(`^\\s*${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:–-]\\s*`, 'i')
  return punkt.replace(r, '').trim() || punkt
}

// ---------- Reihenfolge von Kreislauf und Flussdiagramm ----------

/**
 * Kreislauf: Stationen in der Reihenfolge der Pfeile. Bilden die Beziehungen einen Ring (oder eine
 * Kette) durch alle Stationen, gilt ihre Reihenfolge – nicht die Reihenfolge der Liste.
 */
export function ordneKreislauf(stationen: TbKnoten[], beziehungen: TbBeziehung[]): TbKnoten[] {
  if (stationen.length < 3) return stationen
  const ids = new Set(stationen.map((s) => s.id))
  const nach = new Map<string, string>()
  const hat = new Set<string>()
  for (const b of beziehungen) {
    if (!ids.has(b.von) || !ids.has(b.nach) || nach.has(b.von)) continue
    nach.set(b.von, b.nach)
    hat.add(b.nach)
  }
  if (nach.size < stationen.length - 1) return stationen
  // Anfang: die Station ohne Vorgänger (Kette); im Ring die mit dem frühesten Aufbauschritt, dann der kleinsten Kennung (k1 vor k2)
  const ring = [...stationen].sort((a, b) => a.schritt - b.schritt || a.id.localeCompare(b.id, 'de', { numeric: true }))
  const start = stationen.find((s) => !hat.has(s.id)) ?? ring[0]
  const weg: TbKnoten[] = []
  const besucht = new Set<string>()
  let id: string | undefined = start.id
  while (id && !besucht.has(id)) {
    besucht.add(id)
    weg.push(stationen.find((s) => s.id === id)!)
    id = nach.get(id)
  }
  return weg.length === stationen.length ? weg : stationen
}

/**
 * Flussdiagramm: Schritte in Pfeilrichtung (topologisch, bei Gleichstand die Reihenfolge der KI) –
 * so zeigen alle Pfeile in Leserichtung, und keiner läuft zurück über die Fläche.
 */
export function ordneFluss(knoten: TbKnoten[], beziehungen: TbBeziehung[]): TbKnoten[] {
  const idx = new Map(knoten.map((k, i) => [k.id, i]))
  const rein = new Map(knoten.map((k) => [k.id, 0]))
  const raus = new Map<string, string[]>()
  for (const b of beziehungen) {
    if (!idx.has(b.von) || !idx.has(b.nach) || b.von === b.nach) continue
    rein.set(b.nach, (rein.get(b.nach) ?? 0) + 1)
    raus.set(b.von, [...(raus.get(b.von) ?? []), b.nach])
  }
  const offen = knoten.filter((k) => !rein.get(k.id))
  const aus: TbKnoten[] = []
  const fertig = new Set<string>()
  while (aus.length < knoten.length) {
    offen.sort((a, b) => idx.get(a.id)! - idx.get(b.id)!)
    // Ein Kreis (Rückkopplung): mit dem frühesten übrigen Knoten weiter
    const k = offen.shift() ?? knoten.find((x) => !fertig.has(x.id))!
    if (fertig.has(k.id)) continue
    fertig.add(k.id)
    aus.push(k)
    for (const n of raus.get(k.id) ?? []) {
      rein.set(n, (rein.get(n) ?? 1) - 1)
      if (rein.get(n) === 0 && !fertig.has(n)) offen.push(knoten[idx.get(n)!])
    }
  }
  return aus
}
