/**
 * Vergleich bei den Achievements (09.10.2026, Wunsch der Lehrkraft) – reine Rechnung, ohne Datenbank:
 *  - Anteil der Lernenden der Schule, die ein Achievement haben – erst ab 10 Lernenden im Vergleich.
 *  - Eigener Platz in der Klasse („Platz 4 von 26") nach Übungstagen der letzten 4 Wochen – erst ab 5 Lernenden;
 *    gleich viele Tage = gleicher Platz. Keine Namen, keine Plätze anderer.
 * Der Server (server/achievementsVergleich.ts) sammelt die Daten und gibt nur diese Zahlen heraus.
 */

export const MINDEST_SCHULE = 10
export const MINDEST_KLASSE = 5
/** Zeitraum für den Platz in der Klasse: die letzten 28 Tage (heute eingeschlossen) */
export const ZEITRAUM_TAGE = 28

/**
 * Prozent je Achievement: `erreichtJe` = je Lernender die Kennungen des Erreichten, `lernende` = alle Lernenden im
 * Vergleich (auch ohne Erreichtes). null, wenn es weniger als `mindest` sind. Gerundet; über 0 nie unter 1 %.
 */
export function anteileAus(erreichtJe: Iterable<Iterable<string>>, lernende: number, mindest = MINDEST_SCHULE): Record<string, number> | null {
  if (lernende < mindest) return null
  const zahl = new Map<string, number>()
  for (const ids of erreichtJe) for (const id of new Set(ids)) zahl.set(id, (zahl.get(id) ?? 0) + 1)
  const aus: Record<string, number> = {}
  for (const [id, n] of zahl) aus[id] = Math.min(100, Math.max(1, Math.round((Math.min(n, lernende) / lernende) * 100)))
  return aus
}

const TAG_MS = 86_400_000
const tagNr = (iso: string): number => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / TAG_MS)

/** Verschiedene Übungstage (ISO-Datum, UTC) in den letzten `zeitraum` Tagen bis `jetzt` */
export function tageImZeitraum(tage: Iterable<string>, jetzt: number, zeitraum = ZEITRAUM_TAGE): number {
  const heute = Math.floor(jetzt / TAG_MS)
  const da = new Set<number>()
  for (const t of tage) {
    const n = tagNr(String(t))
    if (Number.isFinite(n) && n <= heute && n > heute - zeitraum) da.add(n)
  }
  return da.size
}

/**
 * Platz von `ich` unter `werte` (Kennung → Übungstage): 1 + Zahl derer mit MEHR Tagen – gleich viele teilen sich den
 * Platz. null, wenn `ich` nicht dabei ist oder weniger als `mindest` verglichen werden.
 */
export function platzVon(werte: ReadonlyMap<string, number>, ich: string, mindest = MINDEST_KLASSE): { platz: number; von: number } | null {
  const meins = werte.get(ich)
  if (meins === undefined || werte.size < mindest) return null
  let besser = 0
  for (const w of werte.values()) if (w > meins) besser++
  return { platz: besser + 1, von: werte.size }
}
