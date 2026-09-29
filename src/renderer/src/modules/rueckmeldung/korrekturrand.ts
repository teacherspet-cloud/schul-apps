/**
 * Korrekturrand für digitale Texte (29.09.2026): Die KI nennt zu jedem Kommentar die Stelle als
 * wörtliches Zitat; hier wird sie im Text gefunden, nummeriert und dem Absatz zugeordnet – so
 * entsteht das Bild einer korrigierten Arbeit: links der Text mit markierten Stellen, rechts am
 * Rand Nummer, Korrekturzeichen und Kommentar.
 *
 * Gesucht wird wörtlich, dann ohne Groß-/Kleinschreibung, dann mit beliebigem Leerraum. Findet
 * sich eine Stelle nicht (die KI hat umformuliert), steht der Kommentar unter „ohne Stelle"
 * – verloren geht keiner.
 */
import type { RandKommentar } from './model/types'

export interface Treffer {
  start: number
  ende: number
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Fundstelle eines Zitats im Text (ab `ab`), sonst null */
export function findeZitat(text: string, zitat: string, ab = 0): Treffer | null {
  const z = zitat.trim().replace(/^[„"“']+|[“"”']+$/g, '')
  if (!z) return null
  const exakt = text.indexOf(z, ab)
  if (exakt >= 0) return { start: exakt, ende: exakt + z.length }
  const klein = text.toLowerCase().indexOf(z.toLowerCase(), ab)
  if (klein >= 0) return { start: klein, ende: klein + z.length }
  const woerter = z.split(/\s+/).filter(Boolean).map(escape)
  if (!woerter.length) return null
  const re = new RegExp(woerter.join('\\s+'), 'gi')
  re.lastIndex = ab
  const m = re.exec(text)
  return m ? { start: m.index, ende: m.index + m[0].length } : null
}

export interface NummerierterKommentar {
  nr: number
  k: RandKommentar
}

export interface Textteil {
  text: string
  /** Markierte Stelle mit ihrer Nummer */
  nr?: number
  art?: RandKommentar['art']
}

export interface RandAbsatz {
  teile: Textteil[]
  kommentare: NummerierterKommentar[]
}

export interface RandLayout {
  absaetze: RandAbsatz[]
  ohneStelle: NummerierterKommentar[]
}

/**
 * Text und Kommentare → Absätze mit markierten Stellen und Randkommentaren. `name` setzt die
 * Namen wieder ein (Zitate kennen nur Kürzel); dieselbe Funktion muss auf den Text wirken.
 */
export function randLayout(text: string, rand: RandKommentar[], name: (s: string) => string = (s) => s): RandLayout {
  // Fundstellen suchen; gleiche Zitate nacheinander an verschiedenen Stellen
  const belegt: Treffer[] = []
  const gefunden: { t: Treffer; k: RandKommentar }[] = []
  const ohne: RandKommentar[] = []
  for (const k of rand) {
    let ab = 0
    let t = findeZitat(text, name(k.zitat), ab)
    while (t && belegt.some((b) => b.start === t!.start && b.ende === t!.ende)) {
      ab = t.start + 1
      t = findeZitat(text, name(k.zitat), ab)
    }
    if (!t) t = findeZitat(text, name(k.zitat))
    if (t) {
      belegt.push(t)
      gefunden.push({ t, k })
    } else ohne.push(k)
  }
  gefunden.sort((a, b) => a.t.start - b.t.start || a.t.ende - b.t.ende)
  const nummeriert = gefunden.map((g, i) => ({ ...g, nr: i + 1 }))
  // Überlappende Stellen: nur die erste wird markiert, die Nummer der zweiten steht am Ende der ersten
  const marken: { start: number; ende: number; nrn: number[]; art: RandKommentar['art'] }[] = []
  for (const g of nummeriert) {
    const letzte = marken[marken.length - 1]
    if (letzte && g.t.start < letzte.ende) letzte.nrn.push(g.nr)
    else marken.push({ start: g.t.start, ende: g.t.ende, nrn: [g.nr], art: g.k.art })
  }

  // Absätze mit Versatz
  const absaetze: RandAbsatz[] = []
  const re = /[^\n]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const aStart = m.index
    const aEnde = m.index + m[0].length
    const teile: Textteil[] = []
    let pos = aStart
    for (const mk of marken) {
      if (mk.ende <= aStart || mk.start >= aEnde) continue
      const s = Math.max(mk.start, aStart)
      const e = Math.min(mk.ende, aEnde)
      if (s > pos) teile.push({ text: text.slice(pos, s) })
      // Die Nummer steht am Ende der Stelle – liegt das Ende im nächsten Absatz, dort
      const endetHier = mk.ende <= aEnde
      teile.push({ text: text.slice(s, e), ...(endetHier ? { nr: mk.nrn[0] } : {}), art: mk.art })
      if (endetHier && mk.nrn.length > 1) for (const n of mk.nrn.slice(1)) teile.push({ text: '', nr: n, art: mk.art })
      pos = e
    }
    if (pos < aEnde) teile.push({ text: text.slice(pos, aEnde) })
    const kommentare = nummeriert
      .filter((g) => {
        // Der Kommentar steht im Absatz, in dem seine Stelle endet
        const ende = Math.min(g.t.ende, text.length) - 1
        return ende >= aStart && ende < aEnde
      })
      .map((g) => ({ nr: g.nr, k: g.k }))
    absaetze.push({ teile, kommentare })
  }
  const ohneStelle = ohne.map((k, i) => ({ nr: nummeriert.length + i + 1, k }))
  return { absaetze, ohneStelle }
}

/** Nummern für Scan-Kommentare: nach Seite, dann von oben nach unten */
export function scanReihenfolge(rand: RandKommentar[]): NummerierterKommentar[] {
  return [...rand]
    .map((k, i) => ({ k, i }))
    .sort((a, b) => (a.k.seite ?? 0) - (b.k.seite ?? 0) || (a.k.y ?? 50) - (b.k.y ?? 50) || a.i - b.i)
    .map(({ k }, i) => ({ nr: i + 1, k }))
}

/** Lage eines Scan-Kommentars auf 0–100 begrenzen */
export const klemme = (v: number | undefined, fallback = 50): number => Math.max(0, Math.min(100, Number.isFinite(v) ? (v as number) : fallback))
