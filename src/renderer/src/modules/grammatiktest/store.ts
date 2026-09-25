import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import type { GrammarTest } from './model/types'
import { AiProgressTracker, trackingAiCall } from '../../shared/aiProgress'

interface GrammatiktestState {
  test: GrammarTest | null
  step: number
  /** id des gespeicherten Tests, solange er in der App liegt */
  docId: string | null
  docName: string
  savedAt: string | null
  setTest: (test: GrammarTest) => void
  setStep: (step: number) => void
  update: (fn: (draft: GrammarTest) => void) => void
  markSaved: (id: string, savedAt: string, name: string) => void
  openSaved: (id: string, name: string, test: GrammarTest, savedAt: string) => void
  reset: () => void
}

export const useGrammatiktest = create<GrammatiktestState>((set, get) => ({
  test: null,
  step: 0,
  docId: null,
  docName: '',
  savedAt: null,
  setTest: (test) => set({ test }),
  setStep: (step) => set({ step }),
  update: (fn) => {
    const current = get().test
    if (!current) return
    const draft = structuredClone(current)
    fn(draft)
    set({ test: draft })
  },
  markSaved: (docId, savedAt, docName) => set({ docId, savedAt, docName }),
  openSaved: (docId, docName, test, savedAt) => set({ docId, docName, test, savedAt, step: test.blocks.length ? 1 : 0 }),
  reset: () => set({ test: null, step: 0, docId: null, docName: '', savedAt: null })
}))

/** KI-Aufruf über den Hauptprozess (gleiche Schnittstelle wie in den anderen Programmen). */
export const aiCall = <T>(req: StructuredRequest): Promise<T> => window.api.ai.structured<T>(req)

/**
 * KI-Aufruf, der seinen Fortschritt meldet.
 *
 * Ein Grammatiktest ist eine einzige, lange Anfrage. Ohne diese Rückmeldung stand die
 * Oberfläche minutenlang still, und man konnte nicht unterscheiden, ob sie arbeitet oder hängt.
 */
export const trackedAiCall =
  (tracker: AiProgressTracker) =>
  <T>(req: StructuredRequest): Promise<T> =>
    trackingAiCall(tracker, (r: StructuredRequest) => window.api.ai.structured<T>(r))(req)
