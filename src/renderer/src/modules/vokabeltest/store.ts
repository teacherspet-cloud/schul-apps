import { create } from 'zustand'
import type { KnownVocab } from '../../shared/knownVocab'
import type { Block, TestDocument, TestSettings, VocabEntry } from './model/types'

const HISTORY_LIMIT = 60

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
  past: TestDocument[]
  future: TestDocument[]
  activeVariantId: string | null
  /** ID in der Test-Bibliothek der App (null = noch nicht gespeichert) */
  testId: string | null
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
  past: [],
  future: [],
  activeVariantId: null,
  testId: null,
  lastSavedAt: null,

  setStep: (step) => set({ step }),
  setVocab: (vocab) => set({ vocab }),
  setListName: (listName) => set({ listName }),
  setListContext: (listContext) => set({ listContext }),
  setSettings: (settings) => set({ settings }),

  loadDocument: (doc) =>
    set({
      doc,
      past: [],
      future: [],
      activeVariantId: doc.variants[0]?.id ?? null,
      // Die vollständige Liste (auch nicht abgefragte Vokabeln) bleibt erhalten, wenn sie schon da ist
      vocab: mergeVocab(get().vocab, doc.vocab),
      settings: doc.settings,
      step: 2
    }),

  updateDoc: (fn) => {
    const { doc, past } = get()
    if (!doc) return
    const draft = structuredClone(doc)
    fn(draft)
    set({ doc: draft, past: [...past, doc].slice(-HISTORY_LIMIT), future: [] })
  },

  updateBlock: (variantId, blockId, fn) =>
    get().updateDoc((d) => {
      const block = d.variants.find((v) => v.id === variantId)?.blocks.find((b) => b.id === blockId)
      if (block) fn(block)
    }),

  setActiveVariant: (activeVariantId) => set({ activeVariantId }),

  undo: () => {
    const { doc, past, future } = get()
    if (!doc || past.length === 0) return
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future] })
  },

  redo: () => {
    const { doc, past, future } = get()
    if (!doc || future.length === 0) return
    set({ doc: future[0], past: [...past, doc], future: future.slice(1) })
  },

  newTest: () =>
    set({
      step: 0,
      vocab: [],
      listName: '',
      listContext: null,
      settings: null,
      doc: null,
      past: [],
      future: [],
      activeVariantId: null,
      testId: null,
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
      past: [],
      future: [],
      activeVariantId: payload.doc?.variants[0]?.id ?? null,
      step: payload.doc ? 2 : 0
    }),

  markSaved: (testId, lastSavedAt) => set({ testId, lastSavedAt })
}))

/** Vokabeln aus dem Test mit der vollständigen Liste zusammenführen (IDs bleiben gleich). */
function mergeVocab(list: VocabEntry[], fromDoc: VocabEntry[]): VocabEntry[] {
  if (list.length === 0) return fromDoc
  const byId = new Map(fromDoc.map((v) => [v.id, v]))
  const merged = list.map((v) => ({ ...v, ...byId.get(v.id) }))
  for (const v of fromDoc) if (!list.some((x) => x.id === v.id)) merged.push(v)
  return merged
}

export const aiCall = <T>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)
