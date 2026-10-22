/**
 * Eine KI-Anfrage je Person und Freigabe (22.10.2026, KI-Sicherheitsprüfung „TOCTOU"): Arbeitsblatt (prüfen lassen,
 * einreichen) und Rückmeldebogen. Vorher wurden die Runden gelesen, dann lief die KI, dann wurde gespeichert – mehrere
 * gleichzeitige Anfragen kamen so alle an der Rundenprüfung vorbei.
 *
 * Jetzt: Die Sperre wird VOR dem Lesen der Runden geholt und erst nach dem Speichern freigegeben; parallele Anfragen
 * derselben Person bekommen 429 mit freundlichem Text. Die Runde selbst wird vor der KI reserviert (arbeitsblaetter.ts,
 * schuelerfeedback.ts) und bei einem Ausfall der KI zurückgegeben – Kinder werden für Störungen nicht bestraft.
 *
 * Faustregel: Eine Sperre verfällt nach 10 Minuten (falls eine Anfrage hängt), damit niemand dauerhaft gesperrt bleibt.
 */

export const LAEUFT_SCHON = 'Deine Rückmeldung wird gerade schon geschrieben. Bitte warte, bis sie da ist.'

const VERFALL_MS = 10 * 60_000
const sperren = new Map<string, { seit: number; nr: number }>()
let zaehler = 0

/** Sperre holen; null = es läuft schon eine Anfrage. Die Rückgabe gibt die Sperre frei (mehrfach aufrufbar). */
export function kiSperre(art: string, freigabeId: string, personId: string, jetzt = Date.now()): (() => void) | null {
  const schluessel = `${art}|${freigabeId}|${personId}`
  const da = sperren.get(schluessel)
  if (da && jetzt - da.seit < VERFALL_MS) return null
  const nr = ++zaehler
  sperren.set(schluessel, { seit: jetzt, nr })
  return () => {
    if (sperren.get(schluessel)?.nr === nr) sperren.delete(schluessel)
  }
}

/** Nur für Tests */
export const kiSperrenLeeren = (): void => sperren.clear()
