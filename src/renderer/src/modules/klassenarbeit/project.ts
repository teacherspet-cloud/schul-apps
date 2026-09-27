import { normalizeDesign } from '@shared/design'
import type { Exam } from './model/types'

/**
 * Weitergebbare Datei einer Klassenarbeit (27.09.2026) – wie `.arbeitsblatt` und `.vokabeltest`:
 * „Als Datei speichern" in der Werkzeugleiste, „Datei öffnen …" in der Bibliothek.
 */
interface ProjectFile {
  app: 'schul-apps'
  type: 'klassenarbeit'
  version: 1
  exam: Exam
}

export const EXAM_FILTER = [{ name: 'Klassenarbeit', extensions: ['klassenarbeit'] }]

export function serializeExam(exam: Exam): string {
  const file: ProjectFile = { app: 'schul-apps', type: 'klassenarbeit', version: 1, exam }
  return JSON.stringify(file)
}

export function parseExamFile(data: Uint8Array): Exam {
  let parsed: ProjectFile
  try {
    parsed = JSON.parse(new TextDecoder().decode(data)) as ProjectFile
  } catch {
    throw new Error('Die Datei ist keine gültige Klassenarbeit-Datei.')
  }
  if (parsed?.type !== 'klassenarbeit' || !Array.isArray(parsed.exam?.parts)) {
    throw new Error('Die Datei ist keine gültige Klassenarbeit-Datei.')
  }
  const exam = parsed.exam
  return { ...exam, design: normalizeDesign(exam.design) }
}
