/*
 * Keine Arbeitszeiten für Lehrkräfte (23.10.2026, Nachprüfung des Schulträgers, LfD-Eckpunkte):
 * Lehrkräfte dürfen nicht nachvollziehen können, wann (Uhrzeit) und wie lange Lernende gearbeitet
 * haben. Antworten an Lehrkräfte tragen deshalb höchstens das DATUM einer Einreichung oder Übung.
 * Intern dürfen die genauen Zeitstempel bleiben, wo die Logik sie braucht (Fristen, Sperren).
 */

/** Datum (lokaler Tag, „JJJJ-MM-TT") eines Zeitstempels (ms oder ISO-Text); leer, wenn keiner da ist */
export function nurTag(zeit: number | string | null | undefined): string {
  if (zeit === null || zeit === undefined || zeit === '' || zeit === 0) return ''
  const d = new Date(typeof zeit === 'number' ? zeit : String(zeit))
  if (Number.isNaN(d.getTime())) return ''
  const zwei = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`
}

/** Zeitstempel auf den Tagesbeginn (lokal) abgerundet; 0 bleibt 0 */
export function tagesBeginn(ms: number): number {
  if (!ms) return 0
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Feedback-Verlauf je Aufgabe ohne die Zeitstempel der einzelnen Runden */
export function verlaufOhneZeit<T extends Record<string, unknown>>(verlauf: Record<string, T[]>): Record<string, Omit<T, 'zeit'>[]> {
  return Object.fromEntries(
    Object.entries(verlauf).map(([nr, liste]) => [nr, (Array.isArray(liste) ? liste : []).map(({ zeit: _z, ...rest }) => rest as Omit<T, 'zeit'>)])
  )
}
