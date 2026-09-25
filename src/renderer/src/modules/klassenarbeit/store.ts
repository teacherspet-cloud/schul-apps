import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import type { Exam } from './model/types'

interface KlassenarbeitState {
  exam: Exam | null
  step: number
  /** id der gespeicherten Arbeit, solange sie in der App liegt */
  docId: string | null
  docName: string
  savedAt: string | null
  setExam: (exam: Exam) => void
  setStep: (step: number) => void
  update: (fn: (draft: Exam) => void) => void
  markSaved: (id: string, savedAt: string, name: string) => void
  openSaved: (id: string, name: string, exam: Exam, savedAt: string) => void
  reset: () => void
}

export const useKlassenarbeit = create<KlassenarbeitState>((set, get) => ({
  exam: null,
  step: 0,
  docId: null,
  docName: '',
  savedAt: null,
  setExam: (exam) => set({ exam }),
  setStep: (step) => set({ step }),
  update: (fn) => {
    const current = get().exam
    if (!current) return
    const draft = structuredClone(current)
    fn(draft)
    set({ exam: draft })
  },
  markSaved: (docId, savedAt, docName) => set({ docId, savedAt, docName }),
  openSaved: (docId, docName, exam, savedAt) => set({ docId, docName, exam, savedAt, step: exam.parts.some((p) => p.blocks.length) ? 1 : 0 }),
  reset: () => set({ exam: null, step: 0, docId: null, docName: '', savedAt: null })
}))

/** KI-Aufruf über den Hauptprozess (gleiche Schnittstelle wie in den anderen Programmen). */
export const aiCall = <T>(req: StructuredRequest): Promise<T> => window.api.ai.structured<T>(req)
