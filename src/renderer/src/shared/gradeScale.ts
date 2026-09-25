/**
 * Notenschlüssel für Klassenarbeiten und Tests.
 *
 * Der Schlüssel arbeitet mit PROZENTSCHWELLEN, nicht mit festen Punktzahlen: So gilt derselbe
 * Schlüssel für eine Arbeit über 20 wie über 63 Punkte, und die Lehrkraft muss nichts umrechnen.
 *
 * Die Voreinstellung stammt von der Lehrkraft selbst (1 ab 91 %, 2 ab 78 %, 3 ab 64 %,
 * 4 ab 50 %, 5 ab 25 %, 6 ab 0 %) und ist je Arbeit im Fenster „Notenschlüssel" änderbar.
 * Ein anderer Schlüssel ist ausdrücklich vorgesehen – die Länder machen dazu unterschiedliche
 * Vorgaben, und viele Fachschaften haben eigene.
 *
 * Gerundet wird kaufmännisch: ab ,5 aufwärts (14,49 → 14 · 14,5 → 15). Die Schwelle ist die
 * Punktzahl, ab der die Note gilt.
 */

export interface GradeStep {
  /** Note als Zahl (1–6) */
  grade: number
  /** Bezeichnung, wie sie auf dem Lösungsblatt steht */
  label: string
  /** Prozent der Gesamtpunktzahl, ab denen die Note gilt */
  percent: number
}

/** Bezeichnungen der Notenstufen in der üblichen Reihenfolge. */
export const GRADE_LABELS = ['sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend']

/** Voreinstellung: die Prozentschwellen für die Noten 1 bis 6. */
export const DEFAULT_THRESHOLDS = [91, 78, 64, 50, 25, 0]

/**
 * Der Schlüssel, der für ein bestimmtes Fach gilt.
 *
 * Reihenfolge: eigener Schlüssel des Fachs → allgemeiner Schlüssel der Einstellungen →
 * die eingebaute Voreinstellung. Fachweise Schlüssel sind kein Luxus: Fachkonferenzen legen
 * sie fachweise fest, und in den Fremdsprachen sind andere Schwellen üblich als in
 * Mathematik.
 *
 * Die Sechs steht in den Einstellungen nicht mit drin – sie gilt immer ab 0 % und wird hier
 * ergänzt, damit die Liste überall gleich lang ist.
 */
export function thresholdsForSubject(gradeScale: { allgemein: number[]; jeFach: Record<string, number[]> } | undefined, subjectId: string): number[] {
  const eigen = gradeScale?.jeFach?.[subjectId]
  const gewaehlt = eigen?.length ? eigen : gradeScale?.allgemein
  if (!gewaehlt?.length) return DEFAULT_THRESHOLDS
  return gewaehlt.length >= 6 ? gewaehlt.slice(0, 6) : [...gewaehlt.slice(0, 5), 0]
}

/**
 * Kaufmännisches Runden: ab ,5 aufwärts.
 *
 * `Math.round` tut das für positive Zahlen bereits, scheitert aber an Fließkommaresten:
 * 0,78 × 50 ergibt 39,000000000000004. Geglättet wird deshalb auf neun Stellen – das tilgt
 * das Rauschen (Größenordnung 1e-14), lässt einen echten Wert knapp unter ,5 aber unangetastet.
 * Gröber zu glätten wäre falsch: 4,4999999 ist keine 4,5.
 */
export function roundHalfUp(value: number): number {
  const smoothed = Math.round(value * 1e9) / 1e9
  return Math.floor(smoothed + 0.5)
}

/** Vollständiger Schlüssel; fehlende oder unsinnige Angaben fallen auf die Voreinstellung zurück. */
export function gradeSteps(thresholds?: number[]): GradeStep[] {
  const values = normalizeThresholds(thresholds)
  return values.map((percent, i) => ({ grade: i + 1, label: GRADE_LABELS[i], percent }))
}

/**
 * Bringt eine Eingabe in eine brauchbare Form: sechs Werte, absteigend, zwischen 0 und 100.
 * Die schlechteste Note beginnt immer bei 0 – sonst gäbe es Punktzahlen ohne Note.
 */
export function normalizeThresholds(thresholds?: number[]): number[] {
  if (!thresholds || thresholds.length !== 6 || thresholds.some((t) => !Number.isFinite(t))) return [...DEFAULT_THRESHOLDS]
  const clamped = thresholds.map((t) => Math.min(100, Math.max(0, Math.round(t))))
  // Absteigend erzwingen: Eine Note darf nie eine niedrigere Schwelle haben als die schlechtere
  for (let i = 1; i < clamped.length; i++) if (clamped[i] > clamped[i - 1]) clamped[i] = clamped[i - 1]
  clamped[5] = 0
  return clamped
}

export interface GradeBoundary extends GradeStep {
  /** Punktzahl, ab der die Note gilt */
  fromPoints: number
}

/** Der Schlüssel in Punkten für eine Arbeit über `points` Punkte. */
export function gradeBoundaries(points: number, thresholds?: number[]): GradeBoundary[] {
  const max = Math.max(0, points)
  return gradeSteps(thresholds).map((step) => ({ ...step, fromPoints: roundHalfUp((step.percent / 100) * max) }))
}

/** Note zu einer erreichten Punktzahl. */
export function gradeForPoints(achieved: number, points: number, thresholds?: number[]): GradeBoundary {
  const boundaries = gradeBoundaries(points, thresholds)
  return boundaries.find((b) => achieved >= b.fromPoints) ?? boundaries[boundaries.length - 1]
}

/** Einzeilige Fassung für den Kopf einer Arbeit: „1 ab 18 · 2 ab 16 · …" */
export function gradeScaleLine(points: number, thresholds?: number[]): string {
  return gradeBoundaries(points, thresholds)
    .filter((b) => b.grade < 6)
    .map((b) => `${b.grade} ab ${b.fromPoints}`)
    .join(' · ')
}

/** Zeilen für das Lösungsblatt, mit Punktspanne und Prozentangabe. */
export function gradeScaleRows(points: number, thresholds?: number[]): { grade: string; range: string; percent: string }[] {
  const boundaries = gradeBoundaries(points, thresholds)
  return boundaries.map((b, i) => {
    const upper = i === 0 ? Math.max(0, points) : boundaries[i - 1].fromPoints - 1
    return {
      grade: `${b.grade} (${b.label})`,
      // Bei sehr kleinen Punktzahlen können Schwellen zusammenfallen – dann steht nur ein Wert
      range: upper > b.fromPoints ? `${b.fromPoints} – ${upper}` : `${b.fromPoints}`,
      percent: `ab ${b.percent} %`
    }
  })
}
