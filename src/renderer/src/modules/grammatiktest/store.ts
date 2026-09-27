import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import type { GrammarTest } from './model/types'
import { leererVerlauf, merke, rueckgaengig, schliesseGruppe, type Verlauf, wiederholen } from '../../shared/undo'
import { newId } from '../vokabeltest/model/random'

interface GrammatiktestState {
  test: GrammarTest | null
  step: number
  /** Kennung des offenen Tests – von Anfang an; ob er in der Bibliothek liegt, sagt `savedAt` */
  docId: string
  docName: string
  savedAt: string | null
  /** Rückgängig/Wiederholen – auch ein neu erzeugter Test lässt sich zurücknehmen */
  verlauf: Verlauf<GrammarTest>
  /** `gruppe` fasst fortlaufendes Tippen in einem Feld zu einem Verlaufsschritt zusammen */
  setTest: (test: GrammarTest, gruppe?: string) => void
  setStep: (step: number) => void
  update: (fn: (draft: GrammarTest) => void, gruppe?: string) => void
  markSaved: (id: string, savedAt: string, name: string) => void
  /** Name in der App – aus der Werkzeugleiste (27.09.2026) */
  setDocName: (name: string) => void
  /** Der offene Test wurde aus der Bibliothek gelöscht: Er gilt wieder als ungesichert. */
  forgetSaved: () => void
  openSaved: (id: string, name: string, test: GrammarTest, savedAt: string) => void
  /** Aus einer Datei: neues Dokument, noch nicht in der Bibliothek */
  loadFromFile: (test: GrammarTest) => void
  reset: () => void
  endGroup: () => void
  undo: () => void
  redo: () => void
}

/** Nach Rückgängig ohne Aufgaben zurück zu den Angaben – der Editor hätte nichts zu zeigen. */
const passenderSchritt = (step: number, test: GrammarTest): number => (test.blocks.length ? step : 0)

export const useGrammatiktest = create<GrammatiktestState>((set, get) => ({
  test: null,
  step: 0,
  docId: newId(),
  docName: '',
  savedAt: null,
  verlauf: leererVerlauf(),
  setTest: (test, gruppe) => {
    const { test: vorher, verlauf } = get()
    set({ test, verlauf: vorher ? merke(verlauf, vorher, gruppe) : verlauf })
  },
  setStep: (step) => set({ step }),
  update: (fn, gruppe) => {
    const { test: current, verlauf } = get()
    if (!current) return
    const draft = structuredClone(current)
    fn(draft)
    set({ test: draft, verlauf: merke(verlauf, current, gruppe) })
  },
  // Kommt die Bestätigung erst an, nachdem schon ein anderer Test offen ist, gilt sie nicht mehr
  markSaved: (docId, savedAt, docName) => {
    if (docId === get().docId) set({ savedAt, docName })
  },
  setDocName: (docName) => set({ docName }),
  forgetSaved: () => set({ docId: newId(), savedAt: null, docName: '' }),
  loadFromFile: (test) => set({ docId: newId(), docName: '', test, savedAt: null, step: test.blocks.length ? 1 : 0, verlauf: leererVerlauf() }),
  openSaved: (docId, docName, test, savedAt) => set({ docId, docName, test, savedAt, step: test.blocks.length ? 1 : 0, verlauf: leererVerlauf() }),
  reset: () => set({ test: null, step: 0, docId: newId(), docName: '', savedAt: null, verlauf: leererVerlauf() }),
  endGroup: () => set({ verlauf: schliesseGruppe(get().verlauf) }),
  undo: () => {
    const { test, verlauf, step } = get()
    const r = test && rueckgaengig(verlauf, test)
    if (r) set({ test: r.stand, verlauf: r.verlauf, step: passenderSchritt(step, r.stand) })
  },
  redo: () => {
    const { test, verlauf, step } = get()
    const r = test && wiederholen(verlauf, test)
    if (r) set({ test: r.stand, verlauf: r.verlauf, step: passenderSchritt(step, r.stand) })
  }
}))

/** KI-Aufruf über den Hauptprozess (gleiche Schnittstelle wie in den anderen Programmen). */
export const aiCall = <T>(req: StructuredRequest): Promise<T> => window.api.ai.structured<T>(req)

/*
 * Den Fortschritt einer Erzeugung verfolgt jetzt der Hintergrund-Auftrag selbst (k.ai in
 * shared/auftraege.ts) – mit Warteplatz und Abbruch. Die frühere Hülle `trackedAiCall` ist weg.
 */
