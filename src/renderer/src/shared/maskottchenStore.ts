/**
 * Die Maskottchen der Schule in der Oberfläche (26.09.2026).
 *
 * Die Materialien verweisen nur auf Kennung und Pose; die Bilder kommen aus diesem Speicher.
 * Er wird beim Start geladen (App.tsx) und nach jeder Änderung in den Einstellungen neu –
 * Druck-HTML, Word-Export und Netzclients greifen über dieselben Helfer darauf zu.
 */
import { create } from 'zustand'
import type { MaskottchenInfo } from '@shared/maskottchen'
import { useAppSettings } from './settingsStore'

interface MaskottchenState {
  liste: MaskottchenInfo[]
  geladen: boolean
  lade: () => Promise<void>
  setze: (liste: MaskottchenInfo[]) => void
}

export const useMaskottchen = create<MaskottchenState>((set) => ({
  liste: [],
  geladen: false,
  lade: async () => {
    try {
      const liste = await window.api.maskottchen.list()
      set({ liste, geladen: true })
    } catch {
      set({ geladen: true })
    }
  },
  setze: (liste) => set({ liste, geladen: true })
}))

/** Standardfigur: die in den Einstellungen gewählte, sonst die erste. */
export function standardMaskottchen(): MaskottchenInfo | undefined {
  const { liste } = useMaskottchen.getState()
  const id = useAppSettings.getState().settings.illustrationen?.standardId
  return liste.find((m) => m.id === id) ?? liste[0]
}

export function maskottchenById(id: string | undefined): MaskottchenInfo | undefined {
  if (!id) return standardMaskottchen()
  return useMaskottchen.getState().liste.find((m) => m.id === id) ?? standardMaskottchen()
}

/**
 * Bild einer Pose – fehlt die Pose, die Vorlage (meist „winkend"). Ohne Figur nichts:
 * Ein Blatt ohne angelegtes Maskottchen zeigt keine leeren Rahmen.
 */
export function maskottchenBild(id: string | undefined, pose: string): string | undefined {
  const m = maskottchenById(id)
  if (!m) return undefined
  return m.posen[pose] || m.posen.winkend || m.vorlage || undefined
}
