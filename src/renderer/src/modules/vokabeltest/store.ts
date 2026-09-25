import { create } from 'zustand'
import type { KnownVocab } from '../../shared/knownVocab'
import type { Block, TestDocument, TestSettings, VocabEntry } from './model/types'
import { leererVerlauf, merke, rueckgaengig, type Verlauf, wiederholen } from '../../shared/undo'
import { newId } from './model/random'

/**
 * Woher die Liste stammt – aus einem Schulbuch mit bekanntem Jahrgang, Bundesland und
 * Schulform. Die Testeinstellungen schlagen das dann vor (änderbar).
 */
export interface VocabListContext {
  bookName: string
  grade?: number
  stateId?: string
  schoolTypeId?: string
  /** Sprachcode der Vokabeln (en, fr, …) */
  language?: string
  /** Wortschatz früherer Units und Bände: Die Aufgaben bleiben in dem, was die Klasse kennt. */
  known?: KnownVocab
}

/** Inhalt eines in der App gespeicherten Vokabeltests */
export interface TestPayload {
  vocab: VocabEntry[]
  settings: TestSettings | null
  doc: TestDocument | null
}

interface VokabeltestState {
  step: number
  vocab: VocabEntry[]
  /** Name des Vokabeltests bzw. der Liste, z. B. „Green Line 5 – Unit 1, Station 1" */
  listName: string
  /** Herkunft der Liste (Schulbuch), falls bekannt */
  listContext: VocabListContext | null
  settings: TestSettings | null
  doc: TestDocument | null
  verlauf: Verlauf<TestDocument>
  activeVariantId: string | null
  /**
   * Kennung des offenen Tests – von Anfang an, nicht erst nach dem ersten Speichern. Unter ihr
   * landet er in der Bibliothek; ob er dort schon liegt, sagt `lastSavedAt`.
   */
  testId: string
  lastSavedAt: string | null

  setStep: (step: number) => void
  setVocab: (vocab: VocabEntry[]) => void
  setListName: (name: string) => void
  setListContext: (context: VocabListContext | null) => void
  setSettings: (settings: TestSettings) => void
  loadDocument: (doc: TestDocument) => void
  updateDoc: (fn: (draft: TestDocument) => void) => void
  updateBlock: (variantId: string, blockId: string, fn: (draft: Block) => void) => void
  setActiveVariant: (id: string) => void
  /** Der offene Test wurde aus der Bibliothek gelöscht: Er gilt wieder als ungesichert. */
  forgetSaved: () => void
  undo: () => void
  redo: () => void
  /** Leeren Vokabeltest beginnen */
  newTest: () => void
  /** Gespeicherten Vokabeltest aus der Bibliothek öffnen */
  openSaved: (id: string, name: string, payload: TestPayload, savedAt: string) => void
  markSaved: (id: string, savedAt: string) => void
}

export const useVokabeltest = create<VokabeltestState>((set, get) => ({
  step: 0,
  vocab: [],
  listName: '',
  listContext: null,
  settings: null,
  doc: null,
  verlauf: leererVerlauf(),
  activeVariantId: null,
  testId: newId(),
  lastSavedAt: null,

  setStep: (step) => set({ step }),
  setVocab: (vocab) => set({ vocab }),
  setListName: (listName) => set({ listName }),
  setListContext: (listContext) => set({ listContext }),
  setSettings: (settings) => set({ settings }),

  /*
   * Einen (neu erzeugten) Test übernehmen. Der bisherige Test wandert in den Verlauf –
   * vorher leerte „Test neu erstellen" den Verlauf, und der alte Test war verloren. Die
   * Lehrkraft hat Rückfragen davor bewusst abgewählt; Strg+Z holt ihn zurück.
   */
  loadDocument: (doc) =>
    set({
      doc,
      verlauf: get().doc ? merke(get().verlauf, get().doc!) : get().verlauf,
      activeVariantId: doc.variants[0]?.id ?? null,
      // Die vollständige Liste (auch nicht abgefragte Vokabeln) bleibt erhalten, wenn sie schon da ist
      vocab: mergeVocab(get().vocab, doc.vocab),
      settings: doc.settings,
      step: 2
    }),

  updateDoc: (fn) => {
    const { doc, verlauf } = get()
    if (!doc) return
    const draft = structuredClone(doc)
    fn(draft)
    set({ doc: draft, verlauf: merke(verlauf, doc) })
  },

  updateBlock: (variantId, blockId, fn) =>
    get().updateDoc((d) => {
      const block = d.variants.find((v) => v.id === variantId)?.blocks.find((b) => b.id === blockId)
      if (block) fn(block)
    }),

  setActiveVariant: (activeVariantId) => set({ activeVariantId }),
  forgetSaved: () => set({ testId: newId(), lastSavedAt: null }),

  undo: () => {
    const { doc, verlauf, activeVariantId } = get()
    const r = doc && rueckgaengig(verlauf, doc)
    if (!r) return
    set({ doc: r.stand, verlauf: r.verlauf, activeVariantId: gueltigeVariante(r.stand, activeVariantId) })
  },

  redo: () => {
    const { doc, verlauf, activeVariantId } = get()
    const r = doc && wiederholen(verlauf, doc)
    if (!r) return
    set({ doc: r.stand, verlauf: r.verlauf, activeVariantId: gueltigeVariante(r.stand, activeVariantId) })
  },

  newTest: () =>
    set({
      step: 0,
      vocab: [],
      listName: '',
      listContext: null,
      settings: null,
      doc: null,
      verlauf: leererVerlauf(),
      activeVariantId: null,
      testId: newId(),
      lastSavedAt: null
    }),

  openSaved: (id, name, payload, savedAt) =>
    set({
      testId: id,
      lastSavedAt: savedAt,
      listName: name,
      vocab: payload.vocab ?? payload.doc?.vocab ?? [],
      settings: payload.settings ?? payload.doc?.settings ?? null,
      doc: payload.doc,
      verlauf: leererVerlauf(),
      activeVariantId: payload.doc?.variants[0]?.id ?? null,
      step: payload.doc ? 2 : 0
    }),

  // Kommt die Bestätigung erst an, nachdem schon ein anderer Test offen ist, gilt sie nicht mehr
  markSaved: (testId, lastSavedAt) => {
    if (testId === get().testId) set({ lastSavedAt })
  }
}))

/** Nach Rückgängig kann die angezeigte Variante fehlen (z. B. nach dem Neu-Erstellen mit weniger Varianten). */
const gueltigeVariante = (doc: TestDocument, id: string | null): string | null => (doc.variants.some((v) => v.id === id) ? id : (doc.variants[0]?.id ?? null))

/** Vokabeln aus dem Test mit der vollständigen Liste zusammenführen (IDs bleiben gleich). */
function mergeVocab(list: VocabEntry[], fromDoc: VocabEntry[]): VocabEntry[] {
  if (list.length === 0) return fromDoc
  const byId = new Map(fromDoc.map((v) => [v.id, v]))
  const merged = list.map((v) => ({ ...v, ...byId.get(v.id) }))
  for (const v of fromDoc) if (!list.some((x) => x.id === v.id)) merged.push(v)
  return merged
}

export const aiCall = <T>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)
