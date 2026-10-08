/**
 * Klassenarbeiten in der App speichern und wieder öffnen – wie bei Vokabeltests und
 * Arbeitsblättern. Gespeichert wird unter `%APPDATA%/schul-apps/klassenarbeiten`.
 */
import type { SavedExamStats } from '@shared/types'
import { ueberthemaVon } from '../../shared/ueberthema'
import { erzeugeBibliothek } from '../../shared/testmodul/bibliothek'
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
    minutes: exam.meta.minutes,
    stateId: exam.meta.stateId,
    schoolTypeId: exam.meta.schoolTypeId,
    ...(ueberthemaVon(exam.meta) ? { ueberthema: ueberthemaVon(exam.meta) } : {})
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
 * Lohnt sich das Sichern? Schon als Entwurf, sobald ein Titel, ein Thema oder Inhalt in einem Teil
 * dasteht – nicht erst nach dem Erzeugen. Ein leeres Formular soll die Übersicht aber nicht füllen.
 *
 * Ein Aufbau allein zählt nicht mehr (08.10.2026): Im Standardmodus füllt der Rahmenschritt den
 * Aufbau beim Öffnen selbst (FrameStep, `fuelleAufbau`). Jede frisch geöffnete oder nach dem
 * Löschen neu angelegte Arbeit landete so als leere „Klassenarbeit Englisch“ in der Bibliothek.
 */
export const lohntSicherung = (exam: Exam | null): boolean =>
  Boolean(
    exam &&
      (exam.meta.topic.trim() ||
        exam.meta.title.trim() ||
        examHasContent(exam) ||
        exam.parts.some((p) => p.notes?.trim() || p.sprechDaten))
  )

/*
 * Speichern, Öffnen, Ablegen, Neu, automatisch Speichern: gemeinsames Gerüst mit den anderen
 * Testprogrammen (shared/testmodul/bibliothek.ts, Großprogramm 0.4). Die bisherigen Namen bleiben.
 */
export const bibliothek = erzeugeBibliothek({
  store: useKlassenarbeit,
  dokument: (s) => s.exam,
  setzeDokument: (s, d) => s.setExam(d),
  // Erst beim Aufruf nachschlagen – beim Laden des Moduls (auch in Tests) gibt es `window.api` noch nicht
  api: { save: (i) => window.api.exams.save(i), get: (id) => window.api.exams.get(id) },
  stats: examStats,
  standardName: defaultExamName,
  lohntSicherung,
  normalisiere: normalisiereArbeit
})

export const saveCurrentExam = bibliothek.speichern
export const openSavedExam = bibliothek.oeffnen
/** Ist genau dieses Dokument gerade im Programm offen? */
export const arbeitOffen = bibliothek.istOffen
/** Ergebnis eines Hintergrund-Auftrags ablegen (siehe shared/auftraege.ts) */
export const legeArbeitAb = bibliothek.legeAb
/** Neues Dokument beginnen – das bisherige vorher sichern. */
export const newExamSafely = bibliothek.neuSicher
export const useExamAutosave = bibliothek.useAutosave
