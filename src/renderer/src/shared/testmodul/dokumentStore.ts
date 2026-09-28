/**
 * Gemeinsamer Store für die neuen Programme (Großprogramm 0.4: Rückmeldung, Elternbrief).
 *
 * Grammatiktest, Lernzielkontrolle und Klassenarbeit haben je einen eigenen Store mit eigenen
 * Feldnamen (test, exam) – beim Aufräumen (D1) blieb das so, weil zu viele Stellen daran
 * hängen. Neue Programme nehmen diesen: das Dokument heißt überall `dok`, Rückgängig und
 * Wiederholen, Speicherstand und Name wie in den übrigen Programmen.
 */
import { create } from 'zustand'
import { leererVerlauf, merke, rueckgaengig, schliesseGruppe, type Verlauf, wiederholen } from '../undo'
import { newId } from '../../modules/vokabeltest/model/random'

export interface DokumentZustand<D> {
  dok: D | null
  step: number
  docId: string
  docName: string
  savedAt: string | null
  verlauf: Verlauf<D>
  setDok: (d: D, gruppe?: string) => void
  setStep: (step: number) => void
  update: (fn: (draft: D) => void, gruppe?: string) => void
  markSaved: (id: string, savedAt: string, name: string) => void
  setDocName: (name: string) => void
  forgetSaved: () => void
  openSaved: (id: string, name: string, dok: D, savedAt: string) => void
  loadFromFile: (dok: D) => void
  reset: () => void
  endGroup: () => void
  undo: () => void
  redo: () => void
}

export function erzeugeDokumentStore<D>(opts: { startSchritt: (d: D) => number; normalisiere?: (d: D) => D }) {
  const norm = (d: D): D => (opts.normalisiere ? opts.normalisiere(d) : d)
  return create<DokumentZustand<D>>((set, get) => ({
    dok: null,
    step: 0,
    docId: newId(),
    docName: '',
    savedAt: null,
    verlauf: leererVerlauf(),
    setDok: (dok, gruppe) => {
      const { dok: vorher, verlauf } = get()
      set({ dok, verlauf: vorher ? merke(verlauf, vorher, gruppe) : verlauf })
    },
    setStep: (step) => set({ step }),
    update: (fn, gruppe) => {
      const { dok, verlauf } = get()
      if (!dok) return
      const draft = structuredClone(dok)
      fn(draft)
      set({ dok: draft, verlauf: merke(verlauf, dok, gruppe) })
    },
    // Kommt die Bestätigung erst an, nachdem schon ein anderes Dokument offen ist, gilt sie nicht mehr
    markSaved: (docId, savedAt, docName) => {
      if (docId === get().docId) set({ savedAt, docName })
    },
    setDocName: (docName) => set({ docName }),
    forgetSaved: () => set({ docId: newId(), savedAt: null, docName: '' }),
    openSaved: (docId, docName, roh, savedAt) => {
      const dok = norm(roh)
      set({ docId, docName, dok, savedAt, step: opts.startSchritt(dok), verlauf: leererVerlauf() })
    },
    loadFromFile: (roh) => {
      const dok = norm(roh)
      set({ docId: newId(), docName: '', dok, savedAt: null, step: opts.startSchritt(dok), verlauf: leererVerlauf() })
    },
    reset: () => set({ dok: null, step: 0, docId: newId(), docName: '', savedAt: null, verlauf: leererVerlauf() }),
    endGroup: () => set({ verlauf: schliesseGruppe(get().verlauf) }),
    undo: () => {
      const { dok, verlauf } = get()
      const r = dok && rueckgaengig(verlauf, dok)
      if (r) set({ dok: r.stand, verlauf: r.verlauf })
    },
    redo: () => {
      const { dok, verlauf } = get()
      const r = dok && wiederholen(verlauf, dok)
      if (r) set({ dok: r.stand, verlauf: r.verlauf })
    }
  }))
}
