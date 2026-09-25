/**
 * Klassenarbeiten in der App speichern und wieder öffnen – wie bei Vokabeltests und
 * Arbeitsblättern. Gespeichert wird unter `%APPDATA%/schul-apps/klassenarbeiten`.
 */
import type { SavedExamStats } from '@shared/types'
import { dokumentName, sichereAlles } from '../../shared/autosave'
import { legeAb } from '../../shared/auftraege'
import { useStoreAutosave } from '../../shared/useAutosave'
import type { Exam } from './model/types'
import { examHasContent } from './render/examWorksheet'
import { useKlassenarbeit } from './store'
import { normalisiereArbeit } from './model/fassungen'

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

/**
 * Lohnt sich das Sichern? Schon als Entwurf, sobald ein Thema oder ein Aufbau dasteht – nicht
 * erst mit geplanten Teilen. Ein leeres Formular soll die Übersicht aber nicht füllen.
 */
export const lohntSicherung = (exam: Exam | null): boolean => Boolean(exam && (exam.parts.length || exam.meta.topic.trim() || exam.meta.title.trim()))

export async function saveCurrentExam(name?: string): Promise<void> {
  const state = useKlassenarbeit.getState()
  const exam = state.exam
  if (!exam || !lohntSicherung(exam)) return
  const id = state.docId
  const meta = await window.api.exams.save({
    id,
    name: name?.trim() || dokumentName(id, state.docName, defaultExamName(exam)),
    stats: examStats(exam),
    payload: exam
  })
  useKlassenarbeit.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedExam(id: string): Promise<void> {
  // Was an der bisherigen Arbeit noch ansteht, zuerst sichern – sonst ginge es beim Wechsel verloren
  await sichereAlles()
  const saved = await window.api.exams.get(id)
  useKlassenarbeit.getState().openSaved(saved.id, saved.name, saved.payload as Exam, saved.updatedAt)
}

/** Ist genau diese Arbeit gerade im Programm offen? */
export const arbeitOffen = (docId: string): boolean => {
  const s = useKlassenarbeit.getState()
  return s.docId === docId && s.exam !== null
}

/**
 * Ergebnis eines Hintergrund-Auftrags in der Arbeit `docId` ablegen (siehe
 * shared/auftraege.ts): in der offenen Arbeit als Rückgängig-Schritt, sonst in der Bibliothek.
 */
export function legeArbeitAb(docId: string, schnappschuss: Exam, einarbeiten: (e: Exam) => Exam, schritt?: number): Promise<void> {
  return legeAb<Exam>(
    {
      istOffen: arbeitOffen,
      imOffenen: (f) => {
        const s = useKlassenarbeit.getState()
        if (!s.exam) return
        s.setExam(f(s.exam))
        if (schritt !== undefined) s.setStep(schritt)
      },
      laden: async (id) => {
        const e = await window.api.exams.get(id)
        // Ältere Arbeiten auf den heutigen Stand (Fassungen) – wie beim Öffnen
        return { name: e.name, dok: normalisiereArbeit(e.payload as Exam) }
      },
      speichern: async (id, name, exam) => {
        await window.api.exams.save({ id, name: name ?? defaultExamName(exam), stats: examStats(exam), payload: exam })
      }
    },
    docId,
    schnappschuss,
    einarbeiten
  )
}

/** Neue Arbeit beginnen – die bisherige vorher sichern. */
export async function newExamSafely(): Promise<void> {
  await sichereAlles()
  useKlassenarbeit.getState().reset()
}

/**
 * Automatisches Speichern – als Entwurf, sobald Thema oder Aufbau dastehen, danach nach
 * jeder Änderung. Verzögert, damit nicht jede Eingabe eine Datei schreibt.
 */
export function useExamAutosave(): void {
  useStoreAutosave({
    store: useKlassenarbeit,
    dokument: (s) => s.docId,
    gesichert: (s) => Boolean(s.savedAt),
    bereit: (s) => lohntSicherung(s.exam),
    geaendert: (s, prev) => s.exam !== prev.exam,
    speichern: () => saveCurrentExam()
  })
}
