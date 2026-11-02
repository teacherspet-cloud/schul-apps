/**
 * Adaptive Schwierigkeit der Klassenspiele (02.11.2026) nach dem Elo-Verfahren.
 *
 * BELEGT:
 *  - Elo als einfaches, robustes Verfahren für Lernende und Aufgaben (Pelánek 2016, Computers & Education): Jede Antwort
 *    ist ein „Spiel" Person gegen Aufgabe; P(richtig) = 1 / (1 + e^-(θ − b)).
 *  - Math Garden (Klinkenberg, Straatmeier & van der Maas 2011) zieht Aufgaben mit ≈ 75 % Erfolgswahrscheinlichkeit.
 *  - K als Funktion der Antwortzahl (Unsicherheit nimmt ab): K = a / (1 + b·n) (Pelánek 2016).
 *
 * FAUSTREGEL (gesetzt, nicht belegt):
 *  - Ziel 0,78 (zwischen den 75 % von Math Garden und „85 %-Regel"), a = 0,8, b = 0,1, K nie unter 0,3.
 *  - Schwierigkeit einer Aufgabe b = Band des Items für die Person + Formatstufe (Werte unten).
 *  - Startwert θ aus dem Anteil sicherer bzw. schwerer Items im eigenen Lernstand.
 */
import type { Band } from '../mehrspieler/typen'

/** Formatstufe: 1 erkennen/auswählen · 2 abrufen mit Auswahl · 3 schreiben · 4 im Satz anwenden (schreiben) */
export type Stufe = 1 | 2 | 3 | 4
export const STUFEN: Stufe[] = [1, 2, 3, 4]

export const ZIEL_P = 0.78

/** FAUSTREGEL: Grundschwierigkeit je Band (null = noch nie geübt) */
export const B_BAND: Record<Band | 'neu', number> = { leicht: -1, mittel: 0, schwer: 0.8, unmoeglich: 1.4, neu: 0.5 }
/** FAUSTREGEL: Zuschlag je Formatstufe (auswählen leichter als schreiben) */
export const B_STUFE: Record<Stufe, number> = { 1: -1.2, 2: -0.4, 3: 0.4, 4: 1.0 }

export const wahrscheinlichkeit = (theta: number, b: number): number => 1 / (1 + Math.exp(-(theta - b)))

export const schwierigkeitVon = (band: Band | null | undefined, stufe: Stufe): number => B_BAND[band ?? 'neu'] + B_STUFE[stufe]

/** K nach Antwortzahl (BELEGT als Form, Werte FAUSTREGEL) */
export const kFaktor = (n: number): number => Math.max(0.3, 0.8 / (1 + 0.1 * n))

/** θ nach einer Antwort nachführen */
export function eloSchritt(theta: number, b: number, richtig: boolean, n: number): number {
  const p = wahrscheinlichkeit(theta, b)
  const neu = theta + kFaktor(n) * ((richtig ? 1 : 0) - p)
  return Math.max(-4, Math.min(5, neu))
}

/**
 * Startwert aus dem Lernstand der Person (FAUSTREGEL): Mit θ = 0,7 gelingt ein mittleres Item auf Stufe 2 zu ≈ 75 %.
 * Viele sichere Items heben, viele schwere senken den Start; ohne Lernstand 0,7.
 */
export function startTheta(baender: (Band | null)[]): number {
  const geuebt = baender.filter((b): b is Band => b !== null)
  if (!geuebt.length) return 0.7
  const leicht = geuebt.filter((b) => b === 'leicht').length / geuebt.length
  const schwer = geuebt.filter((b) => b === 'schwer' || b === 'unmoeglich').length / geuebt.length
  return Math.round((0.7 + 0.8 * leicht - 0.8 * schwer) * 100) / 100
}

/** Erlaubte Stufen je Modus (fest: nach Stufe; level: nach Level 1–6) */
export function stufenFuer(art: 'adaptiv' | 'fest' | 'level', feste: 'leicht' | 'mittel' | 'schwer', level: number): Stufe[] {
  if (art === 'fest') return feste === 'leicht' ? [1, 2] : feste === 'mittel' ? [2, 3] : [3, 4]
  if (art === 'level') {
    const l = Math.max(1, Math.min(6, Math.round(level)))
    return ([[1], [1, 2], [2, 3], [3], [3, 4], [4]] as Stufe[][])[l - 1]
  }
  return STUFEN
}

/** Bänder, die im Modus „fest" bevorzugt werden (Items nach dem Lernstand der Person) */
export const BAND_FEST: Record<'leicht' | 'mittel' | 'schwer', Band[]> = {
  leicht: ['leicht', 'mittel'],
  mittel: ['mittel', 'leicht', 'schwer'],
  schwer: ['schwer', 'unmoeglich', 'mittel']
}
