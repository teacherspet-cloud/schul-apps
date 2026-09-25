import { create } from 'zustand'
import type { Worksheet, WsBlock } from './model/types'
import { AiProgressTracker, trackingAiCall } from '../../shared/aiProgress'

const HISTORY_LIMIT = 60

interface ArbeitsblattState {
  step: number
  worksheet: Worksheet | null
  /** ID in der App-Bibliothek, sobald das Blatt gespeichert wurde */
  docId: string | null
  docName: string
  savedAt: string | null
  past: Worksheet[]
  future: Worksheet[]
  activeSheetId: string | null

  setStep: (step: number) => void
  setDocName: (name: string) => void
  markSaved: (id: string, updatedAt: string, name: string) => void
  /** Gespeichertes Arbeitsblatt öffnen */
  openSaved: (id: string, name: string, worksheet: Worksheet, updatedAt: string) => void
  /** Ersetzt das Arbeitsblatt ohne Verlauf (z. B. neue Eingaben in Schritt 1) */
  setWorksheet: (ws: Worksheet) => void
  /** Von vorn beginnen: Schritt 1 mit leerem Blatt */
  newWorksheet: () => void
  loadWorksheet: (ws: Worksheet, step?: number) => void
  update: (fn: (draft: Worksheet) => void) => void
  updateBlock: (sheetId: string, blockId: string, fn: (draft: WsBlock) => void) => void
  setActiveSheet: (id: string) => void
  undo: () => void
  redo: () => void
}

export const useArbeitsblatt = create<ArbeitsblattState>((set, get) => ({
  step: 0,
  worksheet: null,
  docId: null,
  docName: '',
  savedAt: null,
  past: [],
  future: [],
  activeSheetId: null,

  setStep: (step) => set({ step }),
  setDocName: (docName) => set({ docName }),
  markSaved: (docId, savedAt, docName) => set({ docId, savedAt, docName }),
  openSaved: (docId, docName, worksheet, savedAt) =>
    set({ docId, docName, savedAt, worksheet, past: [], future: [], step: 2, activeSheetId: worksheet.sheets[0]?.id ?? null }),
  setWorksheet: (worksheet) => set({ worksheet }),
  newWorksheet: () => set({ worksheet: null, step: 0, past: [], future: [] }),
  loadWorksheet: (worksheet, step = 2) =>
    set({ worksheet, past: [], future: [], step, activeSheetId: worksheet.sheets[0]?.id ?? null, docId: null, savedAt: null, docName: '' }),

  update: (fn) => {
    const { worksheet, past } = get()
    if (!worksheet) return
    const draft = structuredClone(worksheet)
    fn(draft)
    set({ worksheet: draft, past: [...past, worksheet].slice(-HISTORY_LIMIT), future: [] })
  },

  /**
   * Einen Baustein ändern.
   *
   * Die Änderung greift in JEDEM Blatt, das einen Baustein dieser Kennung hat – nicht nur im
   * angezeigten. Das betrifft genau einen Fall: die Gruppenfassungen der arbeitsteiligen
   * Filmbeobachtung, die sich das gemeinsame Material teilen. Sonst sind die Kennungen je
   * Blatt verschieden, und es ändert sich wie bisher nur das eine.
   */
  updateBlock: (sheetId, blockId, fn) =>
    get().update((d) => {
      const sheets = d.sheets.filter((s) => s.id === sheetId || s.blocks.some((b) => b.id === blockId))
      for (const sheet of sheets) {
        const block = sheet.blocks.find((b) => b.id === blockId)
        if (block) fn(block)
      }
    }),

  setActiveSheet: (activeSheetId) => set({ activeSheetId }),

  undo: () => {
    const { worksheet, past, future } = get()
    if (!worksheet || !past.length) return
    set({ worksheet: past[past.length - 1], past: past.slice(0, -1), future: [worksheet, ...future] })
  },

  redo: () => {
    const { worksheet, past, future } = get()
    if (!worksheet || !future.length) return
    set({ worksheet: future[0], past: [...past, worksheet], future: future.slice(1) })
  }
}))

export const aiCall = <T>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)

/**
 * KI-Aufruf, der seinen Fortschritt meldet.
 * Damit füllt sich der Balken während der Erstellung, statt bis zum Schluss still zu stehen.
 */
export const trackedAiCall =
  (tracker: AiProgressTracker) =>
  <T>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> =>
    trackingAiCall(tracker, (r: Parameters<typeof window.api.ai.structured>[0]) => window.api.ai.structured<T>(r))(req)
