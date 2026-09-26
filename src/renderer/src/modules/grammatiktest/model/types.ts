/**
 * Datenmodell für Grammatiktests.
 *
 * Der Test besteht aus denselben Bausteinen wie ein Arbeitsblatt, damit Darstellung,
 * Seitenumbruch, Druck und Word-Export wiederverwendet werden – wie schon bei den
 * Klassenarbeiten.
 *
 * Zwei Dinge unterscheiden ihn von einer Klassenarbeit:
 * - Er prüft **eine oder wenige Formen**, ausgewählt aus der Grammatikliste, statt mehrerer
 *   Kompetenzbereiche.
 * - Jede Aufgabe ist einer **bekannten Stolperstelle** zugeordnet. Daraus entsteht im
 *   Lösungsteil ein Fehlerprofil: nicht nur „wie viele Punkte", sondern „welcher Fehler".
 */
import type { DesignTemplate } from '@shared/design'
import type { AiProviderId, CefrLevel } from '@shared/types'
import type { CourseLevel } from '../../arbeitsblatt/didactics/schoolProfiles'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import type { KnownVocab } from '../../../shared/knownVocab'

export interface GrammarTestMeta {
  /**
   * „Farbe der Vorlage verwenden" (Paket 10a): true = die Akzentfarbe der Designvorlage statt
   * der Fachfarbe aus den Einstellungen. Fehlt = Fachfarbe.
   */
  vorlagenfarbe?: boolean
  subjectId: string
  subjectLabel: string
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  grade: number
  courseLevel?: CourseLevel
  /** Stellung in der Fremdsprachenfolge – daraus ergibt sich das Lernjahr */
  languageOrder: number
  lateStartLanguage?: boolean
  cefrLevel: CefrLevel
  /** DaZ: erreichte Erwerbsstufe; sperrt Themen mehr als eine Stufe darüber */
  acquisitionStage?: number

  /** Geprüfte Grammatikthemen (Kennungen aus grammarTopics.ts) */
  topics: string[]
  /** Aufgabenformate (Kennungen aus GRAMMAR_FORMATS); vorbelegt aus den Themen */
  formats: string[]
  /** Wortschatz, den die Lerngruppe kennt – der Test führt keine neuen Wörter ein */
  knownVocab?: KnownVocab

  title: string
  minutes: number
  points: number
  /**
   * In einen Zusammenhang einbetten: ein durchlaufender Text statt unverbundener Einzelsätze.
   * Fachdidaktisch die tragfähigere Prüfform und in mehr Ländern als Leistung verwendbar.
   */
  embedded: boolean
  /** Wird der Test benotet? Steuert Notenschlüssel und die Hinweise zur Zulässigkeit. */
  graded: boolean
  /** Fehlerprofil im Lösungsteil ausweisen */
  errorProfile: boolean
  /**
   * Notenschlüssel AUCH auf dem Schülermaterial abdrucken.
   * Standardmäßig aus – im Lösungsteil steht er ohnehin.
   */
  gradeScaleOnSheet: boolean
  /** Eigene Prozentschwellen (leer = 1 ab 91 %, 2 ab 78 %, 3 ab 64 %, 4 ab 50 %, 5 ab 25 %) */
  gradeScaleThresholds?: number[]
  /** Lösungsblatt erzeugen */
  answerKey: boolean
  /** Kopfkasten mit Zeit und Punkten */
  infoBox: boolean
  /** Arbeitsanweisungen auf Deutsch statt in der Zielsprache */
  instructionsInGerman: boolean

  /** KI-Anbieter und Modell, falls abweichend von den Einstellungen */
  provider?: AiProviderId
  model?: string
}

export interface GrammarTest {
  version: 1
  meta: GrammarTestMeta
  design: DesignTemplate
  /** Die Aufgaben des Tests – dieselben Bausteine wie im Arbeitsblatt */
  blocks: WsBlock[]
  createdAt: string
}

/** Summe der vergebenen Punkte über alle Aufgaben. */
export function testPoints(test: GrammarTest): number {
  return test.blocks.reduce((sum, b) => sum + (b.type === 'task' ? (b.points ?? 0) : 0), 0)
}

/** Zahl der Aufgaben (ohne Material- und Kopfbausteine). */
export const testTaskCount = (test: GrammarTest): number => test.blocks.filter((b) => b.type === 'task').length

export const testHasContent = (test: GrammarTest): boolean => testTaskCount(test) > 0
