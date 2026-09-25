import type { DesignTemplate } from '@shared/design'
import type { GrammarTest, GrammarTestMeta } from './types'

/**
 * Voreinstellungen eines neuen Grammatiktests.
 *
 * Bewusst gesetzt: **eingebettet** und **nicht benotet**. Beides ist die vorsichtigere Wahl –
 * ein eingebetteter Test ist in mehr Ländern als Leistung verwendbar, und wer benoten will,
 * schaltet es bewusst ein und bekommt dann die Hinweise zur Zulässigkeit.
 */
export function defaultTestMeta(stateId: string, schoolTypeId: string, schoolTypeName: string): GrammarTestMeta {
  return {
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    stateId,
    schoolTypeId,
    schoolTypeName,
    grade: 7,
    languageOrder: 1,
    cefrLevel: 'A2',
    topics: [],
    formats: [],
    title: '',
    minutes: 20,
    points: 20,
    embedded: true,
    graded: false,
    errorProfile: true,
    gradeScaleOnSheet: false,
    answerKey: true,
    infoBox: true,
    instructionsInGerman: false
  }
}

export function newTest(design: DesignTemplate, stateId: string, schoolTypeId: string, schoolTypeName: string): GrammarTest {
  return {
    version: 1,
    meta: defaultTestMeta(stateId, schoolTypeId, schoolTypeName),
    design,
    blocks: [],
    createdAt: new Date().toISOString()
  }
}
