/**
 * Stufenleiter je Kind (17.11.2026, abgestimmt mit der Lehrkraft) – Modus „leiter" aller Klassenspiele:
 * - Formate von leicht nach schwer: Fremdsprache → Deutsch aus 3 · Hören → Bedeutung aus 4 (ohne Hören: aus 4) ·
 *   Deutsch → Fremdsprache aus 4 · Buchstabensalat · Deutsch → Fremdsprache schreiben · Diktat (nur mit Hören) ·
 *   im Satz schreiben. „Hören" nur, wenn die Lehrkraft es beim Erstellen erlaubt (Kopfhörer).
 * - Aufstieg nach 3 richtigen in Folge auf der eigenen Stufe; ein Fehler setzt nur den Zähler zurück – nie abwärts.
 * - Start nach Lernstand (θ), höchstens Stufe 3; noch nie geübte Wörter höchstens Stufe 3 (Auswählen).
 * - Mindeststufe für alle nach Spielfortschritt (Boss: Phasen; Expedition: Lager; Rennen: Strecke; Gebiet: Felder;
 *   sonst Zeit): im ersten Drittel 1, dann „Deutsch → Fremdsprache auswählen", im letzten „schreiben".
 * - Grammatik und Wörter ohne passendes Format nehmen das nächstleichtere vorhandene Format.
 * FAUSTREGELN: 3 in Folge, Startgrenzen θ 0,9 / 1,3, Drittel des Fortschritts.
 */
import type { SpielItem } from '../mehrspieler/typen'
import type { Stufe } from './adaptiv'
import type { KlassenEinstellungen } from './typen'

export type LeiterFormat = 'wahl3' | 'wahl4' | 'hoerwahl' | 'rueckwahl' | 'salat' | 'schreiben' | 'diktat' | 'satz'

export const AUFSTIEG_NACH = 3
const START_HOECHSTENS = 3

export function leiterVon(e: Pick<KlassenEinstellungen, 'hoeren'>): LeiterFormat[] {
  return e.hoeren ? ['wahl3', 'hoerwahl', 'rueckwahl', 'salat', 'schreiben', 'diktat', 'satz'] : ['wahl3', 'wahl4', 'rueckwahl', 'salat', 'schreiben', 'satz']
}

/** Antwortform für Elo und Schaden (1–2 auswählen, 3–4 schreiben) */
export const ELO_STUFE: Record<LeiterFormat, Stufe> = { wahl3: 1, wahl4: 1, hoerwahl: 2, rueckwahl: 2, salat: 2, schreiben: 3, diktat: 3, satz: 4 }

/** Startstufe aus dem Lernstand (θ aus kern.ts personDazu) */
export const startLeiter = (theta: number): number => Math.min(START_HOECHSTENS, theta < 0.9 ? 1 : theta < 1.3 ? 2 : 3)

/** Mindeststufe aus dem Fortschritt 0–1 (Drittel): 1, „Deutsch → Fremdsprache auswählen", „schreiben" */
export function mindestStufe(fortschritt: number, leiter: LeiterFormat[]): number {
  if (fortschritt < 1 / 3) return 1
  return leiter.indexOf(fortschritt < 2 / 3 ? 'rueckwahl' : 'schreiben') + 1
}

const SALAT_LAENGE = 24
const SCHREIB_LAENGE = 40

/** Taugt das Format für das Item? */
export function passt(f: LeiterFormat, i: SpielItem): boolean {
  if (i.vok) {
    if (f === 'satz') return Boolean(i.vok.luecke)
    if (f === 'salat') return i.vok.term.length >= 2 && i.vok.term.length <= SALAT_LAENGE
    return true
  }
  if (f === 'salat') return i.loesung.length >= 2 && i.loesung.length <= SALAT_LAENGE
  if (f === 'schreiben' || f === 'diktat' || f === 'satz') return i.loesung.length <= SCHREIB_LAENGE
  return true
}

/** Format für Person und Item: eigene Stufe (mindestens die Mindeststufe), neue Wörter höchstens 3, sonst nächstleichter */
export function formatFuer(leiter: LeiterFormat[], stufe: number, item: SpielItem, neu: boolean): { format: LeiterFormat; stufe: number } {
  let s = Math.max(1, Math.min(leiter.length, stufe))
  if (neu) s = Math.min(s, START_HOECHSTENS)
  for (let k = s; k >= 1; k--) if (passt(leiter[k - 1], item)) return { format: leiter[k - 1], stufe: k }
  return { format: leiter[0], stufe: 1 }
}

/** Kacheln für den Buchstabensalat: Wörter bei Wendungen, sonst Buchstaben (Leerzeichen bleiben weg), gemischt */
export function salatKacheln(loesung: string, zufall: () => number): { kacheln: string[]; trenner: string } {
  const woerter = loesung.trim().split(/\s+/)
  const teile = woerter.length > 1 ? woerter : [...loesung.trim()]
  const trenner = woerter.length > 1 ? ' ' : ''
  const gemischt = [...teile]
  for (let n = 0; n < 6; n++) {
    for (let i = gemischt.length - 1; i > 0; i--) {
      const j = Math.floor(zufall() * (i + 1))
      ;[gemischt[i], gemischt[j]] = [gemischt[j], gemischt[i]]
    }
    if (gemischt.join(trenner) !== teile.join(trenner) || gemischt.length < 2) break
  }
  return { kacheln: gemischt, trenner }
}
