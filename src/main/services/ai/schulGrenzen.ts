/**
 * Haken des Servers für die KI-Kanäle (22.10.2026, KI-Sicherheitsprüfung M1/H7).
 *
 * main/kanaele.ts läuft am PC, auf dem iPad und auf dem Server. Was nur der Server weiß – welche Lehrkraft gerade fragt,
 * ob die Anfrage über den Schlüssel der SCHULE läuft, welche Modelle die Schule dafür freigegeben hat, wie weit ihr
 * Monatsbudget ist –, kommt über diese Haken (gesetzt in server/start.ts). Am PC und auf dem iPad bleibt alles leer:
 * dann gilt das bisherige Verhalten.
 */
import type { SchulBudgetStand } from '@shared/verbrauch'

/** Wahl für eine Anfrage: Anbieter und Modell, wie sie laufen dürfen */
export interface ModellWahl {
  anbieter: string
  modell: string
}

let modellPruefer: ((w: ModellWahl) => ModellWahl) | null = null
/** Server: begrenzt Anbieter/Modell auf die Freigabeliste, wenn die Anfrage über den Schlüssel der Schule liefe */
export const setzeSchulModellPruefer = (fn: typeof modellPruefer): void => {
  modellPruefer = fn
}
/** Anbieter/Modell, wie sie laufen dürfen (am PC unverändert). Darf werfen, wenn gar nichts freigegeben ist. */
export const erlaubteWahl = (w: ModellWahl): ModellWahl => (modellPruefer ? modellPruefer(w) : w)

let platzSchluessel: (() => string | undefined) | null = null
/** Server: Kennung der Lehrkraft, in deren Namen die Anfrage läuft – für den Wechsel je Lehrkraft (kiPlaetze.ts) */
export const setzePlatzSchluessel = (fn: typeof platzSchluessel): void => {
  platzSchluessel = fn
}
export const platzSchluesselJetzt = (): string | undefined => platzSchluessel?.()

/** Stand des Monatsbudgets der Lehrkraft (Server, nur Schlüssel der Schule) – für Einstellungen › Verbrauch */
export type { SchulBudgetStand }

let budgetQuelle: (() => SchulBudgetStand | null) | null = null
export const setzeSchulBudgetQuelle = (fn: typeof budgetQuelle): void => {
  budgetQuelle = fn
}
export const schulBudgetJetzt = (): SchulBudgetStand | null => {
  try {
    return budgetQuelle?.() ?? null
  } catch {
    return null
  }
}

/**
 * Plätze für KI-Anfragen zugleich. Am PC drei (wie seit 25.09.2026). Auf dem Server teilt sich die ganze Schule die
 * Plätze – Faustregel 8 (SCHULAPPS_KI_PLAETZE), je Lehrkraft weiterhin höchstens drei.
 */
export function platzZahlen(): { max: number; proSchluessel: number } {
  const env = typeof process !== 'undefined' ? process.env : {}
  const server = env.SCHULAPPS_SERVER === '1'
  const wunsch = Number(env.SCHULAPPS_KI_PLAETZE)
  const max = Number.isInteger(wunsch) && wunsch >= 1 && wunsch <= 64 ? wunsch : server ? 8 : 3
  return { max, proSchluessel: Math.min(3, max) }
}
