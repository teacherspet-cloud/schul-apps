/**
 * Vorgaben eines Fachs für die ganze Schule (13.10.2026, abgestimmt mit der Lehrkraft): gepflegt von den Fachobleuten des
 * Fachs (und Admins). „Fachleitung" ist keine eigene Rolle – die Fachobleute (shared/fachobleute.ts) bekommen diese Rechte.
 *
 *  - Curriculum (Vorgabe, je Kurs änderbar): Lehrwerk (Band) je Jahrgang und Themen/Reihen je Jahrgang. Füllt den
 *    Lehrwerk-Stand der Kurse, die Oberthemen der Reihen und das Vorwissen („laut Curriculum") vor.
 *  - Vorgaben (Standard für alle Lehrkräfte des Fachs, persönlich änderbar): Notenschlüssel, Problemwort-Empfindlichkeit,
 *    Erinnerungen für Lernende (Angebot im Kurs), schulinterne Operatoren (Ergänzungen und nicht verwendete).
 *    Die Fachfarbe bleibt schulweit (Entscheidung 09.10.2026) – Fachobleute dürfen die Farbe ihres Fachs ändern.
 *
 * Gespeichert am Server in server_einstellungen 'fachvorgaben' (server/fachvorgaben.ts); lesen dürfen alle Lehrkräfte.
 */
import { fachVon } from './faecher'

export interface SchulOperator {
  name: string
  erklaerung: string
}

export interface FachVorgaben {
  /** Curriculum: Band je Jahrgang („5" → „Green Line 1") */
  lehrwerke?: Record<string, string>
  /** Curriculum: Themen bzw. Reihen je Jahrgang, in Unterrichtsreihenfolge */
  themen?: Record<string, string[]>
  /** Notenschlüssel: Mindestprozent für Note 1 bis 5 (wie AppSettings.gradeScale) */
  notenschluessel?: number[]
  /** Problemwort-Empfindlichkeit 1–5 (shared/problemWoerter.ts) */
  problemStufe?: number
  /** Erinnerungen für Lernende standardmäßig anbieten (Kurse ohne eigene Wahl) */
  erinnerungen?: 'an' | 'aus'
  /** Schulinterne Operatoren: zusätzliche (mit Erklärung) und nicht verwendete (Namen) */
  operatoren?: { zusatz?: SchulOperator[]; weglassen?: string[] }
  /** Wer zuletzt geändert hat (Name) und wann */
  geaendert?: { von: string; am: string }
}

export type AlleFachVorgaben = Record<string, FachVorgaben>

const text = (x: unknown, n: number): string =>
  String(x ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)
const jahrgangGueltig = (k: string): boolean => /^(?:[1-9]|1[0-3])$/.test(k)

/** Notenschlüssel: fünf fallende Prozentwerte zwischen 0 und 100 (sonst ungültig) */
export function notenschluesselGueltig(x: unknown): number[] | undefined {
  if (!Array.isArray(x) || x.length !== 5) return undefined
  const w = x.map(Number)
  if (w.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return undefined
  for (let i = 1; i < w.length; i++) if (w[i] >= w[i - 1]) return undefined
  return w.map((v) => Math.round(v))
}

/** Vorgaben eines Fachs prüfen und bereinigen (unbekannte Felder fallen weg) */
export function vorgabenBereinigt(roh: unknown): FachVorgaben {
  const r = (roh ?? {}) as Record<string, unknown>
  const aus: FachVorgaben = {}
  if (r.lehrwerke && typeof r.lehrwerke === 'object') {
    const l: Record<string, string> = {}
    for (const [k, v] of Object.entries(r.lehrwerke as Record<string, unknown>)) if (jahrgangGueltig(k) && text(v, 80)) l[k] = text(v, 80)
    if (Object.keys(l).length) aus.lehrwerke = l
  }
  if (r.themen && typeof r.themen === 'object') {
    const t: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(r.themen as Record<string, unknown>)) {
      if (!jahrgangGueltig(k) || !Array.isArray(v)) continue
      const l = [...new Set(v.map((x) => text(x, 160)).filter(Boolean))].slice(0, 40)
      if (l.length) t[k] = l
    }
    if (Object.keys(t).length) aus.themen = t
  }
  const ns = notenschluesselGueltig(r.notenschluessel)
  if (ns) aus.notenschluessel = ns
  const ps = Number(r.problemStufe)
  if (Number.isInteger(ps) && ps >= 1 && ps <= 5) aus.problemStufe = ps
  if (r.erinnerungen === 'an' || r.erinnerungen === 'aus') aus.erinnerungen = r.erinnerungen
  if (r.operatoren && typeof r.operatoren === 'object') {
    const o = r.operatoren as Record<string, unknown>
    const zusatz = (Array.isArray(o.zusatz) ? o.zusatz : [])
      .map((x) => ({ name: text((x as SchulOperator)?.name, 40), erklaerung: text((x as SchulOperator)?.erklaerung, 400) }))
      .filter((x) => x.name && x.erklaerung)
      .slice(0, 30)
    const weglassen = [...new Set((Array.isArray(o.weglassen) ? o.weglassen : []).map((x) => text(x, 40)).filter(Boolean))].slice(0, 60)
    if (zusatz.length || weglassen.length) aus.operatoren = { ...(zusatz.length ? { zusatz } : {}), ...(weglassen.length ? { weglassen } : {}) }
  }
  if (r.geaendert && typeof r.geaendert === 'object') {
    const g = r.geaendert as Record<string, unknown>
    if (text(g.am, 40)) aus.geaendert = { von: text(g.von, 80), am: text(g.am, 40) }
  }
  return aus
}

/** Alle Vorgaben bereinigen (nur Fächer des Katalogs) */
export function alleVorgabenBereinigt(roh: unknown): AlleFachVorgaben {
  const aus: AlleFachVorgaben = {}
  if (!roh || typeof roh !== 'object') return aus
  for (const [fach, v] of Object.entries(roh as Record<string, unknown>)) if (fachVon(fach)) aus[fach] = vorgabenBereinigt(v)
  return aus
}

/** Darf diese Person die Vorgaben dieses Fachs ändern? Admin oder Fachobfrau/-mann des Fachs */
export function darfFachVorgaben(rolle: string | undefined, obmannFaecher: readonly string[] | undefined, fachId: string): boolean {
  if (rolle === 'admin') return true
  return rolle === 'lehrkraft' && Boolean(obmannFaecher?.includes(fachId))
}

/** Band laut Curriculum für einen Jahrgang (sonst undefined) */
export const curriculumBand = (v: FachVorgaben | undefined, jahrgang: number | null | undefined): string | undefined =>
  jahrgang ? v?.lehrwerke?.[String(jahrgang)] : undefined

/** Themen laut Curriculum: die des Jahrgangs und die der früheren Jahrgänge (ältere zuerst) */
export function curriculumThemen(v: FachVorgaben | undefined, jahrgang: number | null | undefined): { jetzt: string[]; frueher: string[] } {
  if (!v?.themen || !jahrgang) return { jetzt: [], frueher: [] }
  const frueher: string[] = []
  for (let j = 1; j < jahrgang; j++) frueher.push(...(v.themen[String(j)] ?? []))
  return { jetzt: v.themen[String(jahrgang)] ?? [], frueher }
}
