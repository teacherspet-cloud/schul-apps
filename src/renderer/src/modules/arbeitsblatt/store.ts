import { create } from 'zustand'
import type { Worksheet, WsBlock } from './model/types'
import { leererVerlauf, merke, rueckgaengig, schliesseGruppe, type Verlauf, wiederholen } from '../../shared/undo'
import { newId } from '../vokabeltest/model/random'

interface ArbeitsblattState {
  step: number
  worksheet: Worksheet | null
  /**
   * Kennung des offenen Blattes – von Anfang an, nicht erst nach dem ersten Speichern.
   * Unter ihr landet das Blatt in der Bibliothek; ob es dort schon liegt, sagt `savedAt`.
   */
  docId: string
  docName: string
  savedAt: string | null
  verlauf: Verlauf<Worksheet>
  activeSheetId: string | null

  setStep: (step: number) => void
  setDocName: (name: string) => void
  markSaved: (id: string, updatedAt: string, name: string) => void
  /** Das offene Blatt wurde aus der Bibliothek gelöscht: Es gilt wieder als ungesichert. */
  forgetSaved: () => void
  /** Gespeichertes Arbeitsblatt öffnen */
  openSaved: (id: string, name: string, worksheet: Worksheet, updatedAt: string) => void
  /**
   * Ersetzt das Arbeitsblatt (Eingaben in Schritt 1 und 2, neue Gliederung).
   * `gruppe` fasst fortlaufendes Tippen in einem Feld zu einem Verlaufsschritt zusammen.
   */
  setWorksheet: (ws: Worksheet, gruppe?: string) => void
  /** Von vorn beginnen: Schritt 1 mit leerem Blatt */
  newWorksheet: () => void
  /** Ein anderes Blatt laden (z. B. aus einer Datei) – das ist ein neues Dokument */
  loadWorksheet: (ws: Worksheet, step?: number) => void
  /**
   * Das frisch ausformulierte Blatt übernehmen. Es bleibt DASSELBE Dokument wie der Entwurf
   * (vorher entstand ein zweiter Bibliothekseintrag), und Strg+Z führt zur Gliederung zurück.
   */
  applyGenerated: (ws: Worksheet, step?: number) => void
  update: (fn: (draft: Worksheet) => void, gruppe?: string) => void
  updateBlock: (sheetId: string, blockId: string, fn: (draft: WsBlock) => void, gruppe?: string) => void
  setActiveSheet: (id: string) => void
  /** Eine Geste (Schieberegler) ist zu Ende – die nächste Änderung wird ein eigener Schritt */
  endGroup: () => void
  undo: () => void
  redo: () => void
}

/**
 * Nach Rückgängig kann der angezeigte Schritt leer sein – etwa wenn das Ausformulieren
 * zurückgenommen wurde. Dann zeigt das Programm den Schritt, zu dem der Stand gehört.
 */
function passenderSchritt(step: number, ws: Worksheet): number {
  if (step >= 2 && !ws.sheets.length) return ws.outline ? 1 : 0
  if (step >= 1 && !ws.outline && !ws.sheets.length) return 0
  return step
}

export const useArbeitsblatt = create<ArbeitsblattState>((set, get) => ({
  step: 0,
  worksheet: null,
  docId: newId(),
  docName: '',
  savedAt: null,
  verlauf: leererVerlauf(),
  activeSheetId: null,

  setStep: (step) => set({ step }),
  setDocName: (docName) => set({ docName }),
  // Kommt die Bestätigung erst an, nachdem schon ein anderes Blatt offen ist, gilt sie nicht mehr
  markSaved: (docId, savedAt, docName) => {
    if (docId === get().docId) set({ savedAt, docName })
  },
  // Gelöscht, während es offen war: schließen statt mit neuer Kennung stehen lassen – sonst legte das automatische Sichern es sofort wieder an (29.09.2026)
  forgetSaved: () => get().newWorksheet(),
  openSaved: (docId, docName, worksheet, savedAt) =>
    set({
      docId,
      docName,
      savedAt,
      worksheet,
      verlauf: leererVerlauf(),
      // Ein Entwurf ohne ausformulierte Bausteine öffnet dort, wo er stehen geblieben ist
      step: worksheet.sheets.length ? 2 : worksheet.outline ? 1 : 0,
      activeSheetId: worksheet.sheets[0]?.id ?? null
    }),
  setWorksheet: (worksheet, gruppe) => {
    const { worksheet: vorher, verlauf } = get()
    set({ worksheet, verlauf: vorher ? merke(verlauf, vorher, gruppe) : verlauf })
  },
  newWorksheet: () => set({ worksheet: null, step: 0, verlauf: leererVerlauf(), docId: newId(), savedAt: null, docName: '' }),
  loadWorksheet: (worksheet, step = 2) =>
    set({
      worksheet,
      verlauf: leererVerlauf(),
      step,
      activeSheetId: worksheet.sheets[0]?.id ?? null,
      docId: newId(),
      savedAt: null,
      docName: ''
    }),
  applyGenerated: (worksheet, step = 2) => {
    const { worksheet: vorher, verlauf } = get()
    set({ worksheet, verlauf: vorher ? merke(verlauf, vorher) : verlauf, step, activeSheetId: worksheet.sheets[0]?.id ?? null })
  },

  update: (fn, gruppe) => {
    const { worksheet, verlauf } = get()
    if (!worksheet) return
    const draft = structuredClone(worksheet)
    fn(draft)
    set({ worksheet: draft, verlauf: merke(verlauf, worksheet, gruppe) })
  },

  /**
   * Einen Baustein ändern.
   *
   * Die Änderung greift in JEDEM Blatt, das einen Baustein dieser Kennung hat – nicht nur im
   * angezeigten. Das betrifft genau einen Fall: die Gruppenfassungen der arbeitsteiligen
   * Filmbeobachtung, die sich das gemeinsame Material teilen. Sonst sind die Kennungen je
   * Blatt verschieden, und es ändert sich wie bisher nur das eine.
   */
  updateBlock: (sheetId, blockId, fn, gruppe) =>
    get().update((d) => {
      const sheets = d.sheets.filter((s) => s.id === sheetId || s.blocks.some((b) => b.id === blockId))
      for (const sheet of sheets) {
        const block = sheet.blocks.find((b) => b.id === blockId)
        if (block) fn(block)
      }
    }, gruppe),

  setActiveSheet: (activeSheetId) => set({ activeSheetId }),

  endGroup: () => set({ verlauf: schliesseGruppe(get().verlauf) }),

  undo: () => {
    const { worksheet, verlauf, step } = get()
    const r = worksheet && rueckgaengig(verlauf, worksheet)
    if (!r) return
    set({ worksheet: r.stand, verlauf: r.verlauf, step: passenderSchritt(step, r.stand) })
  },

  redo: () => {
    const { worksheet, verlauf, step } = get()
    const r = worksheet && wiederholen(verlauf, worksheet)
    if (!r) return
    set({ worksheet: r.stand, verlauf: r.verlauf, step: passenderSchritt(step, r.stand) })
  }
}))

export const aiCall = <T>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)

/*
 * Den Fortschritt einer Erzeugung verfolgt jetzt der Hintergrund-Auftrag selbst (k.ai in
 * shared/auftraege.ts) – mit Warteplatz und Abbruch. Die frühere Hülle `trackedAiCall` ist weg.
 */
