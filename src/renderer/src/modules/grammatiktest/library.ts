/**
 * Grammatiktests in der App speichern und wieder öffnen – wie bei Vokabeltests,
 * Arbeitsblättern und Klassenarbeiten. Gespeichert wird unter
 * `%APPDATA%/schul-apps/grammatiktests`.
 */
import type { SavedGrammarTestStats } from '@shared/types'
import { dokumentName, sichereAlles } from '../../shared/autosave'
import { useStoreAutosave } from '../../shared/useAutosave'
import { chosenGrammarTopics } from '../arbeitsblatt/didactics/grammar'
import type { GrammarTest } from './model/types'
import { testHasContent, testPoints, testTaskCount } from './model/types'
import { useGrammatiktest } from './store'

/** Die geprüften Formen ausgeschrieben – in der Übersicht ist das die eigentliche Kennzeichnung. */
export function testTopicLine(test: GrammarTest): string {
  return chosenGrammarTopics({ ...test.meta, grammarTopics: test.meta.topics } as never)
    .map((t) => t.label)
    .join(', ')
}

export function testStats(test: GrammarTest): SavedGrammarTestStats {
  return {
    subjectLabel: test.meta.subjectLabel,
    grade: test.meta.grade,
    topics: testTopicLine(test),
    taskCount: testTaskCount(test),
    points: testPoints(test),
    minutes: test.meta.minutes,
    graded: test.meta.graded
  }
}

/** Vorschlag für den Namen: Titel, sonst Fach und geprüfte Formen. */
export function defaultTestName(test: GrammarTest): string {
  const title = test.meta.title.trim()
  if (title) return title
  const topics = testTopicLine(test)
  return topics ? `${test.meta.subjectLabel} – ${topics}` : `Grammatiktest ${test.meta.subjectLabel}`
}

/**
 * Lohnt sich das Sichern? Schon als Entwurf, sobald eine Form gewählt oder ein Titel da ist –
 * nicht erst nach dem Erzeugen. Ein leeres Formular soll die Übersicht aber nicht füllen.
 */
export const lohntSicherung = (test: GrammarTest | null): boolean =>
  Boolean(test && (testHasContent(test) || test.meta.topics.length || test.meta.title.trim()))

export async function saveCurrentTest(name?: string): Promise<void> {
  const state = useGrammatiktest.getState()
  const test = state.test
  if (!test || !lohntSicherung(test)) return
  const id = state.docId
  const meta = await window.api.grammarTests.save({
    id,
    name: name?.trim() || dokumentName(id, state.docName, defaultTestName(test)),
    stats: testStats(test),
    payload: test
  })
  useGrammatiktest.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedTest(id: string): Promise<void> {
  // Was am bisherigen Test noch ansteht, zuerst sichern – sonst ginge es beim Wechsel verloren
  await sichereAlles()
  const saved = await window.api.grammarTests.get(id)
  useGrammatiktest.getState().openSaved(saved.id, saved.name, saved.payload as GrammarTest, saved.updatedAt)
}

/** Neuen Test beginnen – den bisherigen vorher sichern. */
export async function newTestSafely(): Promise<void> {
  await sichereAlles()
  useGrammatiktest.getState().reset()
}

/**
 * Automatisches Speichern – als Entwurf ab dem ersten Schritt, danach nach jeder Änderung.
 * Verzögert, damit nicht jede Eingabe im Editor eine Datei schreibt.
 */
export function useTestAutosave(): void {
  useStoreAutosave({
    store: useGrammatiktest,
    dokument: (s) => s.docId,
    gesichert: (s) => Boolean(s.savedAt),
    bereit: (s) => lohntSicherung(s.test),
    geaendert: (s, prev) => s.test !== prev.test,
    speichern: () => saveCurrentTest()
  })
}
