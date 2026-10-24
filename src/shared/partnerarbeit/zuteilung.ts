/**
 * Zuteilung der Gruppen für die Partnerarbeit (24.10.2026, abgestimmt mit der Lehrkraft): rein rechnend.
 *  - Strategie: Zufall · Stärkere mit Schwächeren (gemischt) · Ähnlich starke zusammen (aehnlich)
 *  - Regeln der Lehrkraft: Einstufung je Kind (stark/mittel/schwach), „nicht mit"-Paare, „nicht wie zuletzt"
 *  - Rest: Größe 2 und ungerade Zahl → eine Dreiergruppe; Größe 3 und Rest 1 → zwei Paare, Rest 2 → ein Paar
 *  - Deterministisch je Saat („Neu mischen" = neue Saat); die Lehrkraft sieht den Vorschlag, tauscht oder mischt neu
 *    und startet erst dann (Art. 22 DSGVO: die Entscheidung bleibt bei der Lehrkraft).
 */
import { mischen, zufall } from '../mehrspieler/kern'
import type { Einstufung, Gruppengroesse, PaRegeln, Strategie } from './typen'

export interface ZuteilungEingabe {
  anwesend: string[]
  groesse: Gruppengroesse
  strategie: Strategie
  regeln: PaRegeln
  nichtWieZuletzt: boolean
  saat: number
}

const RANG: Record<Einstufung, number> = { schwach: 0, mittel: 1, stark: 2 }
const rangVon = (regeln: PaRegeln, id: string): number => RANG[regeln.einstufung[id] ?? 'mittel']

const paarIn = (l: [string, string][], a: string, b: string): boolean => l.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
const zuletztZusammen = (r: PaRegeln, a: string, b: string): boolean => Boolean(r.zuletzt[a]?.includes(b) || r.zuletzt[b]?.includes(a))

/** Alle Paare innerhalb einer Gruppe */
function paare(g: string[]): [string, string][] {
  const aus: [string, string][] = []
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) aus.push([g[i], g[j]])
  return aus
}

/** Reihenfolge, die nach dem Zerteilen in Gruppen der Strategie entspricht */
function grundordnung(ids: string[], strategie: Strategie, regeln: PaRegeln, z: { saat: number }): string[] {
  const gemischt = mischen(z, ids)
  if (strategie === 'zufall') return gemischt
  // Stabil nach Rang sortieren (gleiche Ränge bleiben zufällig gemischt)
  const sortiert = [...gemischt].sort((a, b) => rangVon(regeln, b) - rangVon(regeln, a))
  if (strategie === 'aehnlich') return sortiert
  // gemischt: Enden zusammenführen – stark, schwach, stark, schwach …
  const aus: string[] = []
  let i = 0
  let j = sortiert.length - 1
  while (i <= j) {
    aus.push(sortiert[i++])
    if (i <= j) aus.push(sortiert[j--])
  }
  return aus
}

/** In Gruppen der Größe zerteilen; den Rest nach den abgestimmten Regeln verteilen */
export function aufteilen(ordnung: string[], groesse: Gruppengroesse): string[][] {
  const n = ordnung.length
  if (!n) return []
  if (n === 1) return [[ordnung[0]]]
  const gruppen: string[][] = []
  for (let i = 0; i < n; i += groesse) gruppen.push(ordnung.slice(i, i + groesse))
  const letzte = gruppen[gruppen.length - 1]
  if (letzte.length === 1) {
    gruppen.pop()
    if (groesse === 2) gruppen[gruppen.length - 1].push(letzte[0])
    else {
      // Rest 1 bei Dreiern: aus der letzten Dreiergruppe zwei Paare machen
      const vorige = gruppen.pop()!
      gruppen.push([vorige[0], vorige[1]], [vorige[2], letzte[0]])
    }
  }
  return gruppen
}

/** Strafpunkte: harte Regel 1000, „wie zuletzt" 10, Abweichung von der Strategie 1 je Gruppe */
function strafe(gruppen: string[][], e: ZuteilungEingabe): number {
  let s = 0
  for (const g of gruppen) {
    for (const [a, b] of paare(g)) {
      if (paarIn(e.regeln.nichtMit, a, b)) s += 1000
      if (e.nichtWieZuletzt && zuletztZusammen(e.regeln, a, b)) s += 10
    }
    if (g.length > 1 && e.strategie !== 'zufall') {
      const r = g.map((id) => rangVon(e.regeln, id))
      const spanne = Math.max(...r) - Math.min(...r)
      s += e.strategie === 'gemischt' ? 2 - spanne : spanne
    }
  }
  return s
}

/** Beste von bis zu 200 Aufteilungen (deterministisch je Saat) */
export function zuteilen(e: ZuteilungEingabe): string[][] {
  const ids = [...new Set(e.anwesend.filter(Boolean))]
  if (!ids.length) return []
  if (ids.length === 1) return [[ids[0]]]
  const z = { saat: e.saat >>> 0 || 1 }
  let beste: string[][] = []
  let besteStrafe = Infinity
  for (let v = 0; v < 200; v++) {
    const ordnung = grundordnung(ids, e.strategie, e.regeln, z)
    // Ab dem zweiten Versuch leicht rütteln, damit auch bei gleicher Strategie-Ordnung andere Nachbarn entstehen
    if (v > 0 && e.strategie !== 'zufall') {
      const k = 1 + Math.floor(zufall(z) * 3)
      for (let t = 0; t < k; t++) {
        const i = Math.floor(zufall(z) * ordnung.length)
        const j = Math.floor(zufall(z) * ordnung.length)
        ;[ordnung[i], ordnung[j]] = [ordnung[j], ordnung[i]]
      }
    }
    const gruppen = aufteilen(ordnung, e.groesse)
    const s = strafe(gruppen, e)
    if (s < besteStrafe) {
      beste = gruppen
      besteStrafe = s
      if (s === 0) break
    }
  }
  return beste
}

export interface Warnung {
  gruppe: number
  art: 'nichtMit' | 'zuletzt' | 'allein'
  ids: string[]
}

/** Was am Vorschlag gegen die Regeln geht (die Lehrkraft entscheidet trotzdem) */
export function warnungen(gruppen: string[][], regeln: PaRegeln, nichtWieZuletzt: boolean): Warnung[] {
  const aus: Warnung[] = []
  gruppen.forEach((g, i) => {
    if (g.length === 1) aus.push({ gruppe: i, art: 'allein', ids: [g[0]] })
    for (const [a, b] of paare(g)) {
      if (paarIn(regeln.nichtMit, a, b)) aus.push({ gruppe: i, art: 'nichtMit', ids: [a, b] })
      else if (nichtWieZuletzt && zuletztZusammen(regeln, a, b)) aus.push({ gruppe: i, art: 'zuletzt', ids: [a, b] })
    }
  })
  return aus
}

/** Zwei Personen tauschen die Gruppe (gleiche Gruppe: nichts) */
export function tauschen(gruppen: string[][], a: string, b: string): string[][] {
  return gruppen.map((g) => g.map((x) => (x === a ? b : x === b ? a : x)))
}

/**
 * Nachzügler einordnen: zu einer Einzelperson (→ Paar), sonst in eine Gruppe unter der Höchstgröße ohne Regelverstoß,
 * sonst als neue Einzelgruppe (die Lehrkraft sieht die Warnung „allein")
 */
export function hinzufuegen(gruppen: string[][], id: string, regeln: PaRegeln, hoechstens = 3): string[][] {
  if (gruppen.some((g) => g.includes(id))) return gruppen
  const passt = (g: string[]): boolean => g.every((x) => !paarIn(regeln.nichtMit, x, id))
  const einzeln = gruppen.findIndex((g) => g.length === 1 && passt(g))
  if (einzeln >= 0) return gruppen.map((g, i) => (i === einzeln ? [...g, id] : g))
  const klein = gruppen.findIndex((g) => g.length < hoechstens && passt(g))
  if (klein >= 0) return gruppen.map((g, i) => (i === klein ? [...g, id] : g))
  return [...gruppen, [id]]
}

/** Gruppe auflösen: ihre Mitglieder als Nachzügler verteilen */
export function aufloesen(gruppen: string[][], index: number, regeln: PaRegeln, hoechstens = 3): string[][] {
  const weg = gruppen[index]
  if (!weg) return gruppen
  let aus = gruppen.filter((_, i) => i !== index)
  for (const id of weg) aus = hinzufuegen(aus, id, regeln, hoechstens)
  return aus
}

/** Zwei Gruppen zusammenlegen (nur bis zur Höchstgröße) */
export function zusammenlegen(gruppen: string[][], a: number, b: number, hoechstens = 3): string[][] | null {
  if (a === b || !gruppen[a] || !gruppen[b] || gruppen[a].length + gruppen[b].length > hoechstens) return null
  return gruppen.filter((_, i) => i !== a && i !== b).concat([[...gruppen[a], ...gruppen[b]]])
}

/** Partner der letzten Zuteilung je Person fortschreiben („nicht wie zuletzt") */
export function zuletztFortschreiben(gruppen: string[][]): Record<string, string[]> {
  const aus: Record<string, string[]> = {}
  for (const g of gruppen) for (const id of g) aus[id] = g.filter((x) => x !== id)
  return aus
}

/**
 * Vorschlag für die Einstufung aus dem Lernstand (Vokabeln sicher/gesamt, Grammatik-Ampeln). Nur ein Vorschlag – die
 * Lehrkraft setzt die Stufe selbst (Art. 22 DSGVO); ohne Daten „mittel".
 */
export function einstufungVorschlag(vokabeln: { sicher: number; gesamt: number } | null, grammatik: { ampel: string }[]): Einstufung {
  const quote = vokabeln && vokabeln.gesamt >= 10 ? vokabeln.sicher / vokabeln.gesamt : null
  const schwaechen = grammatik.filter((g) => g.ampel === 'schwaeche').length
  const sicher = grammatik.filter((g) => g.ampel === 'sicher').length
  if (quote === null && !grammatik.length) return 'mittel'
  const stark = (quote === null || quote >= 0.7) && schwaechen <= sicher && (quote !== null || sicher > 0)
  const schwach = (quote !== null && quote < 0.4) || (schwaechen >= 2 && schwaechen > sicher)
  return schwach ? 'schwach' : stark ? 'stark' : 'mittel'
}
