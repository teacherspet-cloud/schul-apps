/**
 * Grammatiktests in der App speichern und wieder öffnen – wie bei Vokabeltests,
 * Arbeitsblättern und Klassenarbeiten. Gespeichert wird unter
 * `%APPDATA%/schul-apps/grammatiktests`.
 */
import { useEffect, useRef } from 'react'
import type { SavedGrammarTestStats } from '@shared/types'
import { notifyError } from '../../shared/util'
import { newId } from '../vokabeltest/model/random'
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

export async function saveCurrentTest(name?: string): Promise<void> {
  const state = useGrammatiktest.getState()
  const test = state.test
  // Ohne Aufgaben gibt es nichts zu sichern – ein leeres Formular soll die Übersicht nicht füllen
  if (!test || !testHasContent(test)) return
  const id = state.docId ?? newId()
  const meta = await window.api.grammarTests.save({
    id,
    name: (name ?? state.docName).trim() || defaultTestName(test),
    stats: testStats(test),
    payload: test
  })
  useGrammatiktest.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedTest(id: string): Promise<void> {
  const saved = await window.api.grammarTests.get(id)
  useGrammatiktest.getState().openSaved(saved.id, saved.name, saved.payload as GrammarTest, saved.updatedAt)
}

/**
 * Automatisches Speichern: das erste Mal, sobald Aufgaben da sind, danach nach jeder Änderung.
 * Verzögert, damit nicht jede Eingabe im Editor eine Datei schreibt.
 */
export function useTestAutosave(): void {
  const timer = useRef<number | null>(null)
  useEffect(() => {
    const save = (): void => {
      saveCurrentTest().catch((e) => notifyError(e, 'Automatisches Speichern fehlgeschlagen'))
    }
    const schedule = (): void => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(save, 1500)
    }
    const state = useGrammatiktest.getState()
    if (state.test && testHasContent(state.test) && !state.docId) schedule()
    const unsubscribe = useGrammatiktest.subscribe((s, prev) => {
      if (s.test === prev.test) return
      if (!s.test || !testHasContent(s.test)) return
      schedule()
    })
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      unsubscribe()
    }
  }, [])
}
