import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import type { Exam } from './model/types'
import { leererVerlauf, merke, rueckgaengig, schliesseGruppe, type Verlauf, wiederholen } from '../../shared/undo'
import { newId } from '../vokabeltest/model/random'

interface KlassenarbeitState {
  exam: Exam | null
  step: number
  /** Kennung der offenen Arbeit – von Anfang an; ob sie in der Bibliothek liegt, sagt `savedAt` */
  docId: string
  docName: string
  savedAt: string | null
  /**
   * Rückgängig/Wiederholen. Dazu gehört ausdrücklich, was Teile ersetzt oder leert: „Vorschlag
   * erzeugen", der Wechsel von Fach oder Jahrgang und das Neu-Erzeugen der Arbeit. Rückfragen
   * davor hat die Lehrkraft abgewählt – Strg+Z holt den alten Stand zurück.
   */
  verlauf: Verlauf<Exam>
  setExam: (exam: Exam, gruppe?: string) => void
  setStep: (step: number) => void
  /** `gruppe` fasst fortlaufendes Tippen in einem Feld (oder einen Zug) zu einem Verlaufsschritt zusammen */
  update: (fn: (draft: Exam) => void, gruppe?: string) => void
  markSaved: (id: string, savedAt: string, name: string) => void
  /** Die offene Arbeit wurde aus der Bibliothek gelöscht: Sie gilt wieder als ungesichert. */
  forgetSaved: () => void
  openSaved: (id: string, name: string, exam: Exam, savedAt: string) => void
  reset: () => void
  endGroup: () => void
  undo: () => void
  redo: () => void
}

/** Nach Rückgängig ohne Teile zurück zum Rahmen – der Aufgabenschritt hätte nichts zu zeigen. */
const passenderSchritt = (step: number, exam: Exam): number => (exam.parts.length ? step : 0)

export const useKlassenarbeit = create<KlassenarbeitState>((set, get) => ({
  exam: null,
  step: 0,
  docId: newId(),
  docName: '',
  savedAt: null,
  verlauf: leererVerlauf(),
  setExam: (exam, gruppe) => {
    const { exam: vorher, verlauf } = get()
    set({ exam, verlauf: vorher ? merke(verlauf, vorher, gruppe) : verlauf })
  },
  setStep: (step) => set({ step }),
  update: (fn, gruppe) => {
    const { exam: current, verlauf } = get()
    if (!current) return
    const draft = structuredClone(current)
    fn(draft)
    set({ exam: draft, verlauf: merke(verlauf, current, gruppe) })
  },
  // Kommt die Bestätigung erst an, nachdem schon eine andere Arbeit offen ist, gilt sie nicht mehr
  markSaved: (docId, savedAt, docName) => {
    if (docId === get().docId) set({ savedAt, docName })
  },
  forgetSaved: () => set({ docId: newId(), savedAt: null, docName: '' }),
  openSaved: (docId, docName, exam, savedAt) =>
    set({ docId, docName, exam, savedAt, step: exam.parts.some((p) => p.blocks.length) ? 1 : 0, verlauf: leererVerlauf() }),
  reset: () => set({ exam: null, step: 0, docId: newId(), docName: '', savedAt: null, verlauf: leererVerlauf() }),
  endGroup: () => set({ verlauf: schliesseGruppe(get().verlauf) }),
  undo: () => {
    const { exam, verlauf, step } = get()
    const r = exam && rueckgaengig(verlauf, exam)
    if (r) set({ exam: r.stand, verlauf: r.verlauf, step: passenderSchritt(step, r.stand) })
  },
  redo: () => {
    const { exam, verlauf, step } = get()
    const r = exam && wiederholen(verlauf, exam)
    if (r) set({ exam: r.stand, verlauf: r.verlauf, step: passenderSchritt(step, r.stand) })
  }
}))

/** KI-Aufruf über den Hauptprozess (gleiche Schnittstelle wie in den anderen Programmen). */
export const aiCall = <T>(req: StructuredRequest): Promise<T> => window.api.ai.structured<T>(req)
