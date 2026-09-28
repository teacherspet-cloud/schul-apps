import { erzeugeProjektDatei } from '../../shared/testmodul/projekt'
import type { Exam } from './model/types'

/**
 * Weitergebbare Datei einer Klassenarbeit (27.09.2026) – wie `.arbeitsblatt`: „Als Datei speichern" in der
 * Werkzeugleiste, „Datei öffnen …" in der Bibliothek. Gerüst gemeinsam mit den anderen
 * Testprogrammen (shared/testmodul/projekt.ts, Großprogramm 0.4).
 */
export const projektDatei = erzeugeProjektDatei<Exam>({
  typ: 'klassenarbeit',
  feld: 'exam',
  bezeichnung: 'Klassenarbeit',
  gueltig: (d) => Array.isArray(d.parts)
})

export const EXAM_FILTER = projektDatei.filter
export const serializeExam = projektDatei.serialisiere
export const parseExamFile = projektDatei.lies
