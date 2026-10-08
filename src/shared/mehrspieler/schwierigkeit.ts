/**
 * Schwierigkeit im Mehrspieler (08.10.2026, abgestimmt): aus dem Lernstand aller Beigetretenen je Item – wie
 * „Problemwörter" (vokabeln.ts) bzw. „Am häufigsten falsch" (grammatik.ts) aus Versuchen und Fehlern.
 *  leicht     = alle sicher
 *  mittel     = gelegentlich falsch
 *  schwer     = öfter falsch
 *  unmöglich  = sehr oft falsch
 * Zu wenige Items im gewählten Band → die Nachbarbänder füllen auf (erst das nähere, bei Gleichstand das leichtere).
 * Versus mit Handicap: jedes Kind bekommt Items aus SEINEM Band (nach dem eigenen Stand), Punkte nach Schwierigkeit.
 */
import type { WortStand } from '../vokabeltrainer'
import { BAND_RANG, type Band, type Schwierigkeit } from './typen'

const BAENDER: Band[] = ['leicht', 'mittel', 'schwer', 'unmoeglich']

/** Band eines Items für EINE Person; null = noch nie geübt */
export function bandEinzeln(st: WortStand | undefined): Band | null {
  if (!st || !st.versuche) return null
  const q = st.falsch / st.versuche
  if (st.falsch >= 3 && q >= 0.5) return 'unmoeglich'
  if (q >= 0.3 || (st.falsch >= 2 && st.fach <= 2)) return 'schwer'
  if ((st.falsch === 0 && st.fach >= 2) || (q <= 0.1 && st.fach >= 4)) return 'leicht'
  return 'mittel'
}

/** Band für die ganze Gruppe: leicht nur, wenn alle sicher; sonst der aufgerundete Schnitt (nie geübt zählt als schwer) */
export function bandGemeinsam(staende: (WortStand | undefined)[]): Band | null {
  const einzeln = staende.map(bandEinzeln)
  if (einzeln.every((b) => b === null)) return null
  if (einzeln.every((b) => b === 'leicht')) return 'leicht'
  const raenge = einzeln.map((b) => (b === null ? 2 : BAND_RANG[b]))
  const schnitt = Math.ceil(raenge.reduce((a, b) => a + b, 0) / raenge.length - 1e-9)
  return BAENDER[Math.max(1, Math.min(3, schnitt))]
}

/** Punkte je Item nach Band (Handicap-Wertung im Versus) */
export const GEWICHT: Record<Band, number> = { leicht: 1, mittel: 2, schwer: 3, unmoeglich: 4 }
export const gewichtVon = (b: Band | null | undefined): number => (b ? GEWICHT[b] : 2)

/**
 * `n` Items ziehen: zuerst aus dem Zielband, dann aus den Nachbarbändern (näher zuerst, bei gleichem Abstand das
 * leichtere), zuletzt nie geübte. Reicht es nicht, wird der Vorrat erneut gemischt durchlaufen (Wiederholung).
 */
export function ziehe(baender: Record<string, Band | null>, ziel: Schwierigkeit, n: number, zufall: () => number): string[] {
  const ids = Object.keys(baender)
  if (!ids.length || n <= 0) return []
  const zr = BAND_RANG[ziel]
  const abstand = (b: Band | null): number => (b === null ? 10 : Math.abs(BAND_RANG[b] - zr) * 2 + (BAND_RANG[b] > zr ? 1 : 0))
  const sortiert = ids
    .map((id) => ({ id, a: abstand(baender[id]), r: zufall() }))
    .sort((x, y) => x.a - y.a || x.r - y.r)
    .map((x) => x.id)
  const aus: string[] = []
  while (aus.length < n) {
    for (const id of sortiert) {
      if (aus.length >= n) break
      aus.push(id)
    }
  }
  // Reihenfolge innerhalb der Auswahl mischen, damit das Zielband nicht immer zuerst kommt
  return aus
    .map((id) => ({ id, r: zufall() }))
    .sort((x, y) => x.r - y.r)
    .map((x) => x.id)
}

/** Wie viele Items liegen im Zielband (für den Hinweis in der Lobby)? */
export const imBand = (baender: Record<string, Band | null>, ziel: Schwierigkeit): number => Object.values(baender).filter((b) => b === ziel).length
