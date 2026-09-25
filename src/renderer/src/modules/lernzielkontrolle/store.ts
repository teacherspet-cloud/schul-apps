import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import type { Kurztest } from './model/types'
import { AiProgressTracker, trackingAiCall } from '../../shared/aiProgress'

interface LernzielkontrolleState {
  test: Kurztest | null
  step: number
  /** Welche Variante gerade im Editor steht */
  variante: number
  /** Lösungsblatt statt Schülerblatt anzeigen */
  loesung: boolean
  docId: string | null
  docName: string
  savedAt: string | null
  setTest: (test: Kurztest) => void
  setStep: (step: number) => void
  setVariante: (i: number) => void
  setLoesung: (v: boolean) => void
  update: (fn: (draft: Kurztest) => void) => void
  markSaved: (id: string, savedAt: string, name: string) => void
  openSaved: (id: string, name: string, test: Kurztest, savedAt: string) => void
  reset: () => void
}

export const useLernzielkontrolle = create<LernzielkontrolleState>((set, get) => ({
  test: null,
  step: 0,
  variante: 0,
  loesung: false,
  docId: null,
  docName: '',
  savedAt: null,
  setTest: (test) => set({ test }),
  setStep: (step) => set({ step }),
  setVariante: (variante) => set({ variante }),
  setLoesung: (loesung) => set({ loesung }),
  update: (fn) => {
    const current = get().test
    if (!current) return
    const draft = structuredClone(current)
    fn(draft)
    set({ test: draft })
  },
  markSaved: (docId, savedAt, docName) => set({ docId, savedAt, docName }),
  openSaved: (docId, docName, test, savedAt) => set({ docId, docName, test, savedAt, step: test.varianten.some((v) => v.blocks.length) ? 1 : 0 }),
  reset: () => set({ test: null, step: 0, variante: 0, loesung: false, docId: null, docName: '', savedAt: null })
}))

/** KI-Aufruf über den Hauptprozess (gleiche Schnittstelle wie in den anderen Programmen). */
export const aiCall = <T>(req: StructuredRequest): Promise<T> => window.api.ai.structured<T>(req)

/** KI-Aufruf, der seinen Fortschritt meldet. */
export const trackedAiCall =
  (tracker: AiProgressTracker) =>
  <T>(req: StructuredRequest): Promise<T> =>
    trackingAiCall(tracker, (r: StructuredRequest) => window.api.ai.structured<T>(r))(req)
