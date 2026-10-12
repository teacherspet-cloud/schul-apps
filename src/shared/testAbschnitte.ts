/**
 * Abschnitte eines angekündigten Tests (12.10.2026, Entscheidung der Lehrkraft): Beim Testtermin eines Kurses wählt die
 * Lehrkraft, welche Abschnitte (und welche verbundene Grammatik) der Test abfragt – Mehrfachauswahl, vorbelegt mit den
 * Abschnitten seit dem letzten Test, sonst mit der zuletzt freigegebenen. Diese Abschnitte haben ab der Ankündigung
 * Vorrang beim Üben (shared/uebungsVorrang.ts), und nur sie bilden in den 3 Tagen vor dem Test die Sprachrunde.
 * Ein Vokabel-Onlinetest mit Termin übernimmt seine Abschnitte aus dem Thema („Green Line 3 - Unit 3 - Station 1").
 *
 * Gespeichert in vok_zuweisungen.test_abschnitte (verschlüsselt): {keys, letzter}. `keys` null = nie gewählt (dann gilt
 * die Vorbelegung); Vokabelabschnitte heißen nach ihrem Titel, Grammatik „gram:<Kennung>".
 */
import { GLEICHE_FREIGABE_MS } from './uebungsVorrang'

export interface TestAuswahl {
  /** Gewählte Abschnitte; null = noch nie gewählt (Vorbelegung gilt) */
  keys: string[] | null
  /** Termin des vorigen Tests (ms) – für die Vorbelegung „seit dem letzten Test" */
  letzter?: number
}

/** Präfix der Grammatik-Einträge */
export const GRAM_PRAEFIX = 'gram:'

/** Schlüssel eines Vokabelabschnitts */
export const teilSchluessel = (t: { titel: string }): string => String(t.titel ?? '').trim()

/** Gespeicherte Auswahl lesen (unlesbar = nie gewählt) */
export function testAuswahlAus(roh: string | null | undefined): TestAuswahl {
  try {
    const x = roh ? (JSON.parse(roh) as Record<string, unknown>) : {}
    const keys = Array.isArray(x.keys) ? [...new Set(x.keys.map(String).filter((k) => k && k.length <= 300))].slice(0, 200) : null
    const letzter = typeof x.letzter === 'number' && Number.isFinite(x.letzter) && x.letzter > 0 ? x.letzter : undefined
    return { keys, ...(letzter ? { letzter } : {}) }
  } catch {
    return { keys: null }
  }
}

/** Auswahl aus dem Anfragekörper: nur bekannte Schlüssel; kein Feld = unverändert (undefined) */
export function testKeysBereinigt(roh: unknown, bekannt: Set<string>): string[] | null | undefined {
  if (roh === undefined) return undefined
  if (roh === null) return null
  if (!Array.isArray(roh)) return undefined
  return [...new Set(roh.map(String))].filter((k) => bekannt.has(k)).slice(0, 200)
}

/**
 * Vorbelegung: Abschnitte, die nach dem letzten Test freigegeben wurden; ohne letzten Test (oder keiner danach) die der
 * neuesten Freigabe (zusammen freigeschaltete zählen als eine; geplante, noch nicht freie zählen dafür nicht – „seit dem
 * letzten Test" schließt sie ein). Für Grammatik genauso (Zeit = Freigabe).
 */
export function vorbelegung(eintraege: { key: string; zeit: number }[], letzter?: number | null, jetzt = Date.now()): string[] {
  if (!eintraege.length) return []
  if (letzter) {
    const seit = eintraege.filter((e) => e.zeit > letzter)
    if (seit.length) return seit.map((e) => e.key)
  }
  const frei = eintraege.filter((e) => (e.zeit || 0) <= jetzt)
  const basis = frei.length ? frei : eintraege
  const neueste = Math.max(...basis.map((e) => e.zeit || 0))
  return basis.filter((e) => (e.zeit || 0) >= neueste - GLEICHE_FREIGABE_MS).map((e) => e.key)
}

const klein = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
/** Steht `teil` als eigenes Stück in `text`? („Unit 3" nicht in „Unit 30") */
const enthaelt = (text: string, teil: string): boolean => {
  const t = klein(teil)
  if (!t) return false
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(text)
}

/**
 * Abschnitte eines Onlinetests aus seinem Thema: Nennt das Thema eine Unit, gelten deren Abschnitte – nur die genannten,
 * wenn es welche nennt („Unit 3 - Station 1"), sonst alle der Unit. Ohne Unit: Abschnitte, deren Titel oder Namen das
 * Thema nennt. Nichts erkannt: leere Liste (dann gilt die Auswahl des Kurses).
 */
export function abschnitteAusThema(thema: string | null | undefined, teile: { key: string; titel: string; unit: string; name: string }[]): string[] {
  const t = klein(String(thema ?? ''))
  if (!t || !teile.length) return []
  const namen = (x: { name: string }): string[] =>
    x.name
      .split(/,\s*|\s·\s/)
      .map((a) => a.trim())
      .filter(Boolean)
  const mitUnit = teile.filter((x) => x.unit && enthaelt(t, x.unit))
  if (mitUnit.length) {
    const genannt = mitUnit.filter((x) => namen(x).some((a) => a !== x.unit && enthaelt(t, a)))
    return (genannt.length ? genannt : mitUnit).map((x) => x.key)
  }
  return teile.filter((x) => enthaelt(t, x.titel) || namen(x).some((a) => a.length >= 4 && enthaelt(t, a))).map((x) => x.key)
}
