/**
 * Empfindlichkeit der Problemwörter (12.10.2026, Wunsch der Lehrkraft): Jede Lehrkraft stellt in ihren Einstellungen
 * eine Standard-Stufe ein (1 „nur deutliche Probleme" … 5 „schon kleine Unsicherheiten"); je Kurs lässt sie sich im
 * Pop-up „Problemwörter" abweichend einstellen (Spalte vok_zuweisungen.problem_stufe, 0 = Standard der Lehrkraft).
 *
 * Der Standard liegt am Server (server_einstellungen 'problem-stufe:<Lehrkraft>'), weil die Problemwörter dort
 * berechnet werden – die Einstellungen der App liegen sonst lokal. Es ist nur eine Zahl ohne Personenbezug.
 */
import { problemStufe, PROBLEM_STUFE_STANDARD, type ProblemStufe } from '../shared/problemWoerter'
import { serverWert, setzeServerWert } from './datenbank'

const schluessel = (lehrkraftId: string): string => `problem-stufe:${lehrkraftId}`

/** Standard-Stufe der Lehrkraft */
export const lehrkraftProblemStufe = (lehrkraftId: string): ProblemStufe => problemStufe(serverWert<number>(schluessel(lehrkraftId), PROBLEM_STUFE_STANDARD))

export const setzeLehrkraftProblemStufe = (lehrkraftId: string, stufe: unknown): ProblemStufe => {
  const s = problemStufe(stufe)
  setzeServerWert(schluessel(lehrkraftId), s)
  return s
}

/** Stufe eines Kurses: eigene Einstellung, sonst Standard der Lehrkraft */
export const kursProblemStufe = (z: { lehrkraft_id: string; problem_stufe?: number | null }): ProblemStufe =>
  z.problem_stufe ? problemStufe(z.problem_stufe, lehrkraftProblemStufe(z.lehrkraft_id)) : lehrkraftProblemStufe(z.lehrkraft_id)
