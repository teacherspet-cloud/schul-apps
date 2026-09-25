/**
 * Klassenarbeiten in der App speichern und wieder öffnen – wie bei Vokabeltests und
 * Arbeitsblättern. Gespeichert wird unter `%APPDATA%/schul-apps/klassenarbeiten`.
 */
import { useEffect, useRef } from 'react'
import type { SavedExamStats } from '@shared/types'
import { notifyError } from '../../shared/util'
import { newId } from '../vokabeltest/model/random'
import type { Exam } from './model/types'
import { examHasContent } from './render/examWorksheet'
import { useKlassenarbeit } from './store'

export function examStats(exam: Exam): SavedExamStats {
  return {
    subjectLabel: exam.meta.subjectLabel,
    grade: exam.meta.grade,
    topic: exam.meta.topic,
    partCount: exam.parts.length,
    hasTasks: examHasContent(exam),
    minutes: exam.meta.minutes
  }
}

/** Vorschlag für den Namen: Titel, sonst Fach und Thema. */
export function defaultExamName(exam: Exam): string {
  const m = exam.meta
  if (m.title.trim()) return m.title.trim()
  const topic = m.topic.trim()
  return topic ? `${m.subjectLabel} – ${topic}` : `Klassenarbeit ${m.subjectLabel}`
}

export async function saveCurrentExam(name?: string): Promise<void> {
  const state = useKlassenarbeit.getState()
  const exam = state.exam
  if (!exam || !exam.parts.length) return
  const id = state.docId ?? newId()
  const meta = await window.api.exams.save({
    id,
    name: (name ?? state.docName).trim() || defaultExamName(exam),
    stats: examStats(exam),
    payload: exam
  })
  useKlassenarbeit.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedExam(id: string): Promise<void> {
  const saved = await window.api.exams.get(id)
  useKlassenarbeit.getState().openSaved(saved.id, saved.name, saved.payload as Exam, saved.updatedAt)
}

/**
 * Automatisches Speichern: das erste Mal, sobald der Aufbau steht, danach nach jeder Änderung.
 * Gespeichert wird verzögert, damit nicht jede Eingabe eine Datei schreibt.
 */
export function useExamAutosave(): void {
  const timer = useRef<number | null>(null)
  useEffect(() => {
    const save = (): void => {
      saveCurrentExam().catch((e) => notifyError(e, 'Automatisches Speichern fehlgeschlagen'))
    }
    const schedule = (): void => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(save, 1500)
    }
    // Erste Sicherung, sobald etwas zu sichern da ist
    const state = useKlassenarbeit.getState()
    if (state.exam?.parts.length && !state.docId) schedule()
    const unsubscribe = useKlassenarbeit.subscribe((s, prev) => {
      if (s.exam === prev.exam) return
      if (!s.exam?.parts.length) return
      schedule()
    })
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      unsubscribe()
    }
  }, [])
}
