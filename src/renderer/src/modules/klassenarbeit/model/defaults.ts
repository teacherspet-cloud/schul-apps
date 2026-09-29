import type { ExamMeta } from './types'

/** Übliche Dauer einer Klassenarbeit nach Jahrgang (Richtwert, je Land unterschiedlich). */
export function defaultMinutes(grade: number): number {
  if (grade <= 6) return 45
  if (grade <= 8) return 60
  if (grade <= 10) return 90
  return 135
}

/** Leere Klassenarbeit mit den Voreinstellungen der Schule. */
export function defaultExamMeta(stateId: string, schoolTypeId: string, schoolTypeName: string, grade = 9): ExamMeta {
  return {
    title: '',
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: '',
    content: '',
    stateId,
    schoolTypeId,
    schoolTypeName,
    grade,
    courseLevel: 'mixed',
    cefrLevel: 'B1',
    grammarTopic: '',
    vocab: [],
    minutes: defaultMinutes(grade),
    points: 60,
    // Befund F8 (29.09.2026): Für Sek-I-Klassenarbeiten ist keine Wörterbuchvorgabe belegt – voreingestellt „keine"; beim Fachwechsel passt die App es an
    aids: 'keine Hilfsmittel',
    variants: 1,
    infoBox: true,
    // Der Schlüssel steht im Erwartungshorizont; auf der Arbeit selbst nur auf Wunsch
    gradeScale: false,
    separateWritingGrade: true,
    answerKey: true,
    answerKeyDetail: 'ausfuehrlich',
    teacherNote: ''
  }
}
