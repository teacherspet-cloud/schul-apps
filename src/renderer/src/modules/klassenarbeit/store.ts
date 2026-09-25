import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import type { Exam } from './model/types'
import { leererVerlauf, merke, rueckgaengig, schliesseGruppe, type Verlauf, wiederholen } from '../../shared/undo'
import { newId } from '../vokabeltest/model/random'
import { fassungsZahl, normalisiereArbeit } from './model/fassungen'

interface KlassenarbeitState {
  exam: Exam | null
  step: number
  /** Welche Fassung (0 = A) gerade angezeigt wird – wie `variante` in der Lernzielkontrolle */
  fassung: number
  /** Erwartungshorizont statt Arbeit anzeigen */
  loesung: boolean
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
  setFassung: (f: number) => void
  setLoesung: (v: boolean) => void
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

/**
 * Nach Rückgängig ohne Teile zurück zum Rahmen – der Aufgabenschritt hätte nichts zu zeigen.
 * Gibt es die angezeigte Fassung im zurückgeholten Stand nicht mehr, gilt wieder Fassung A.
 */
const passend = (step: number, fassung: number, exam: Exam): { step: number; fassung: number } => ({
  step: exam.parts.length ? step : 0,
  fassung: Math.min(fassung, fassungsZahl(exam) - 1)
})

export const useKlassenarbeit = create<KlassenarbeitState>((set, get) => ({
  exam: null,
  step: 0,
  fassung: 0,
  loesung: false,
  docId: newId(),
  docName: '',
  savedAt: null,
  verlauf: leererVerlauf(),
  setExam: (exam, gruppe) => {
    const { exam: vorher, verlauf } = get()
    set({ exam, verlauf: vorher ? merke(verlauf, vorher, gruppe) : verlauf })
  },
  setStep: (step) => set({ step }),
  setFassung: (fassung) => set({ fassung }),
  setLoesung: (loesung) => set({ loesung }),
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
  // Gespeicherte Arbeiten auf den heutigen Stand (Fassungen) – eine Arbeit mit einer Fassung bleibt unverändert
  openSaved: (docId, docName, gespeichert, savedAt) => {
    const exam = normalisiereArbeit(gespeichert)
    set({ docId, docName, exam, savedAt, step: exam.parts.some((p) => p.blocks.length) ? 1 : 0, fassung: 0, loesung: false, verlauf: leererVerlauf() })
  },
  reset: () => set({ exam: null, step: 0, fassung: 0, loesung: false, docId: newId(), docName: '', savedAt: null, verlauf: leererVerlauf() }),
  endGroup: () => set({ verlauf: schliesseGruppe(get().verlauf) }),
  undo: () => {
    const { exam, verlauf, step, fassung } = get()
    const r = exam && rueckgaengig(verlauf, exam)
    if (r) set({ exam: r.stand, verlauf: r.verlauf, ...passend(step, fassung, r.stand) })
  },
  redo: () => {
    const { exam, verlauf, step, fassung } = get()
    const r = exam && wiederholen(verlauf, exam)
    if (r) set({ exam: r.stand, verlauf: r.verlauf, ...passend(step, fassung, r.stand) })
  }
}))

/** KI-Aufruf über den Hauptprozess (gleiche Schnittstelle wie in den anderen Programmen). */
export const aiCall = <T>(req: StructuredRequest): Promise<T> => window.api.ai.structured<T>(req)
