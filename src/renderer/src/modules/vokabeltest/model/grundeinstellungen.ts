import type { AppSettings, CefrTable } from '@shared/types'
import { loadLastChoice } from '../../../shared/lastChoice'
import { distributeEvenly } from '../generation/distribute'
import { TASK_TYPES } from '../generation/taskTypes'
import { istLatein } from '../didactics/latein'
import { gradeOptions } from './cefr'
import { randomSeed } from './random'
import type { TaskTypeId, TestSettings } from './types'

const DEFAULT_TASKS: TaskTypeId[] = ['gapSentences', 'matchDefinitions', 'multipleChoice']
/*
 * In Latein ist die Nennform-Aufgabe der eigentliche Vokabeltest (amtlicher Mustertest,
 * Leitfaden Latein SH 2016, S. 25) – deshalb steht sie dort von vornherein bereit.
 */
const DEFAULT_TASKS_LATEIN: TaskTypeId[] = ['latinForms', 'latinContext']

/** So viele Varianten entstehen ohne eigene Wahl – auf beiden Wegen gleich */
export const STANDARD_VARIANTEN = 2

/** Woher die Liste stammt (Schulbuch, gespeicherte Liste) – deren Angaben gehen vor */
export interface Herkunft {
  language?: string
  stateId?: string
  schoolTypeId?: string
  grade?: number
}

/**
 * Grundeinstellungen eines neuen Vokabeltests – EINE Stelle für beide Wege.
 *
 * Anlass (Paket 7): „Test erstellen" (Schritt 2) und „Test automatisch erstellen" (Schritt 1)
 * hatten eigene Vorgaben – der eine zwei Varianten und die zuletzt gewählte Lerngruppe, der
 * andere eine Variante und nur die Vorgaben aus den Einstellungen. Wer denselben Test auf
 * beiden Wegen anlegte, bekam Verschiedenes.
 *
 * Reihenfolge: Herkunft der Liste (Green Line 1 → Klasse 5, Niedersachsen, Gymnasium), dann
 * die zuletzt getroffene Auswahl, dann die Vorgaben aus den Einstellungen.
 */
export function grundEinstellungen(app: Pick<AppSettings, 'defaults'>, table: CefrTable, herkunft: Herkunft | null, vokabeln: number): TestSettings {
  const last = loadLastChoice('vokabeltest')
  const sprache = herkunft?.language || last.targetLanguage || app.defaults.targetLanguage
  // Standardumfang 14–18 (29.09.2026); ohne KI-Vorschlag die Mitte
  const count = Math.min(16, vokabeln)
  const tasks = distributeEvenly(
    (istLatein(sprache) ? DEFAULT_TASKS_LATEIN : DEFAULT_TASKS).map((type) => ({ type, count: 0, pointsPerItem: TASK_TYPES[type].defaultPoints })),
    count
  )
  const settings: TestSettings = {
    targetLanguage: sprache,
    stateId: herkunft?.stateId || last.stateId || app.defaults.stateId,
    schoolTypeId: herkunft?.schoolTypeId || last.schoolTypeId || app.defaults.schoolTypeId,
    languageOrder: last.languageOrder ?? 1,
    grade: 6,
    level: 'A2',
    vocabCount: count,
    variantCount: STANDARD_VARIANTEN,
    variantMode: 'sameVocab',
    tasks,
    topic: '',
    pictureSource: 'auto',
    answerKey: true,
    seed: randomSeed(),
    pageLimit: { mode: 'auto', pages: 2 }
  }
  const grades = gradeOptions(table, settings.stateId, settings.schoolTypeId, settings.languageOrder)
  if (grades.length) {
    const wanted = String(herkunft?.grade ?? last.grade ?? 6)
    const g = grades.find((x) => x.value === wanted) ?? grades.find((x) => x.value === '6') ?? grades[0]
    settings.grade = Number(g.value)
    settings.level = g.level as TestSettings['level']
  }
  return settings
}
