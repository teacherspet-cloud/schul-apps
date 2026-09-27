/**
 * Die Maskottchen der Schule in der Oberfläche (26.09.2026).
 *
 * Die Materialien verweisen nur auf Kennung und Pose; die Bilder kommen aus diesem Speicher.
 * Er wird beim Start geladen (App.tsx) und nach jeder Änderung in den Einstellungen neu –
 * Druck-HTML, Word-Export und Netzclients greifen über dieselben Helfer darauf zu.
 */
import { create } from 'zustand'
import type { MaskottchenInfo } from '@shared/maskottchen'
import { cleanImageBackground } from './imageCleanup'
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
      void stelleFrei(liste)
    } catch {
      set({ geladen: true })
    }
  },
  setze: (liste) => set({ liste, geladen: true })
}))

let freigestellt = false

/**
 * Sicherung gegen grüne Kästen auf dem Blatt (27.09.2026): Vorlage und Posen entstehen auf
 * Neongrün und werden gleich nach dem Zeichnen freigestellt. Blieb das einmal aus – etwa
 * weil das Fenster mitten im Speichern geschlossen wurde –, holt dieser stille Durchgang es
 * beim nächsten Start nach und schreibt nur die Bilder zurück, an denen er etwas geändert hat.
 * Einmal je Sitzung; bereits freigestellte Bilder erkennt die Prüfung am Rand und lässt sie in Ruhe.
 */
async function stelleFrei(liste: MaskottchenInfo[]): Promise<void> {
  if (freigestellt || typeof document === 'undefined' || !window.api?.maskottchen?.pose) return
  freigestellt = true
  let geaendert = false
  for (const m of liste) {
    try {
      for (const [pose, bild] of Object.entries(m.posen)) {
        const sauber = await cleanImageBackground(bild)
        if (sauber.kind === 'none') continue
        await window.api.maskottchen.pose(m.id, pose, sauber.dataUrl)
        geaendert = true
      }
      if (m.vorlage) {
        const sauber = await cleanImageBackground(m.vorlage)
        if (sauber.kind !== 'none') {
          await window.api.maskottchen.save({ id: m.id, name: m.name, beschreibung: m.beschreibung, quelle: m.quelle, vorlage: sauber.dataUrl })
          geaendert = true
        }
      }
    } catch {
      // Ein Bild, das sich nicht lesen lässt, bleibt wie es ist – die Figur wird deshalb nicht angefasst
    }
  }
  if (geaendert) useMaskottchen.setState({ liste: await window.api.maskottchen.list() })
}

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
