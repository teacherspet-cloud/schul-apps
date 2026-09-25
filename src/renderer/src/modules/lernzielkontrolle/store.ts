import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import type { Kurztest } from './model/types'
import { AiProgressTracker, trackingAiCall } from '../../shared/aiProgress'
import { leererVerlauf, merke, rueckgaengig, schliesseGruppe, type Verlauf, wiederholen } from '../../shared/undo'
import { newId } from '../vokabeltest/model/random'

interface LernzielkontrolleState {
  test: Kurztest | null
  step: number
  /** Welche Variante gerade im Editor steht */
  variante: number
  /** Lösungsblatt statt Schülerblatt anzeigen */
  loesung: boolean
  /** Kennung der offenen Kontrolle – von Anfang an; ob sie in der Bibliothek liegt, sagt `savedAt` */
  docId: string
  docName: string
  savedAt: string | null
  /** Rückgängig/Wiederholen – auch eine neu erzeugte Kontrolle lässt sich zurücknehmen */
  verlauf: Verlauf<Kurztest>
  setTest: (test: Kurztest, gruppe?: string) => void
  setStep: (step: number) => void
  setVariante: (i: number) => void
  setLoesung: (v: boolean) => void
  /** `gruppe` fasst fortlaufendes Tippen in einem Feld (oder einen Zug) zu einem Verlaufsschritt zusammen */
  update: (fn: (draft: Kurztest) => void, gruppe?: string) => void
  markSaved: (id: string, savedAt: string, name: string) => void
  /** Die offene Kontrolle wurde aus der Bibliothek gelöscht: Sie gilt wieder als ungesichert. */
  forgetSaved: () => void
  openSaved: (id: string, name: string, test: Kurztest, savedAt: string) => void
  reset: () => void
  endGroup: () => void
  undo: () => void
  redo: () => void
}

/** Nach Rückgängig ohne Aufgaben zurück zu den Angaben – der Editor hätte nichts zu zeigen. */
function passend(step: number, variante: number, test: Kurztest): { step: number; variante: number } {
  return {
    step: test.varianten.some((v) => v.blocks.length) ? step : 0,
    variante: Math.min(variante, Math.max(0, test.varianten.length - 1))
  }
}

export const useLernzielkontrolle = create<LernzielkontrolleState>((set, get) => ({
  test: null,
  step: 0,
  variante: 0,
  loesung: false,
  docId: newId(),
  docName: '',
  savedAt: null,
  verlauf: leererVerlauf(),
  setTest: (test, gruppe) => {
    const { test: vorher, verlauf } = get()
    set({ test, verlauf: vorher ? merke(verlauf, vorher, gruppe) : verlauf })
  },
  setStep: (step) => set({ step }),
  setVariante: (variante) => set({ variante }),
  setLoesung: (loesung) => set({ loesung }),
  update: (fn, gruppe) => {
    const { test: current, verlauf } = get()
    if (!current) return
    const draft = structuredClone(current)
    fn(draft)
    set({ test: draft, verlauf: merke(verlauf, current, gruppe) })
  },
  // Kommt die Bestätigung erst an, nachdem schon eine andere Kontrolle offen ist, gilt sie nicht mehr
  markSaved: (docId, savedAt, docName) => {
    if (docId === get().docId) set({ savedAt, docName })
  },
  forgetSaved: () => set({ docId: newId(), savedAt: null, docName: '' }),
  openSaved: (docId, docName, test, savedAt) =>
    set({ docId, docName, test, savedAt, step: test.varianten.some((v) => v.blocks.length) ? 1 : 0, variante: 0, verlauf: leererVerlauf() }),
  reset: () => set({ test: null, step: 0, variante: 0, loesung: false, docId: newId(), docName: '', savedAt: null, verlauf: leererVerlauf() }),
  endGroup: () => set({ verlauf: schliesseGruppe(get().verlauf) }),
  undo: () => {
    const { test, verlauf, step, variante } = get()
    const r = test && rueckgaengig(verlauf, test)
    if (r) set({ test: r.stand, verlauf: r.verlauf, ...passend(step, variante, r.stand) })
  },
  redo: () => {
    const { test, verlauf, step, variante } = get()
    const r = test && wiederholen(verlauf, test)
    if (r) set({ test: r.stand, verlauf: r.verlauf, ...passend(step, variante, r.stand) })
  }
}))

/** KI-Aufruf über den Hauptprozess (gleiche Schnittstelle wie in den anderen Programmen). */
export const aiCall = <T>(req: StructuredRequest): Promise<T> => window.api.ai.structured<T>(req)

/** KI-Aufruf, der seinen Fortschritt meldet. */
export const trackedAiCall =
  (tracker: AiProgressTracker) =>
  <T>(req: StructuredRequest): Promise<T> =>
    trackingAiCall(tracker, (r: StructuredRequest) => window.api.ai.structured<T>(r))(req)
