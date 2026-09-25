import type { WorksheetMeta } from './types'

export function defaultMeta(stateId: string, schoolTypeId: string, schoolTypeName: string): WorksheetMeta {
  return {
    title: '',
    subjectId: 'biologie',
    subjectLabel: 'Biologie',
    topic: '',
    learningGoals: '',
    priorKnowledge: '',
    stateId,
    schoolTypeId,
    schoolTypeName,
    grade: schoolTypeId === 'grundschule' ? 3 : 7,
    courseLevel: 'mixed',
    languageMode: 'standard',
    languageOrder: 1,
    cefrLevel: 'A2',
    instructionsInGerman: false,
    skillFocus: 'mixed',
    wordLimit: false,
    materialWords: 0,
    studentTextType: '',
    grammarTopic: '',
    comprehensionFormats: [],
    sheetType: 'erarbeitung',
    pages: 2,
    minutes: 45,
    socialForms: [],
    differentiation: { levels: 1, mode: 'separate' },
    answerKey: true,
    sheetNumber: '',
    imageSource: 'auto',
    overrides: {},
    teacherNote: ''
  }
}
