import { create } from 'zustand'
import { AppSettings, DeepPartial, DEFAULT_SETTINGS } from '@shared/types'
import { notifyError } from './util'
import { merkeFachfarben } from './fachfarben'
import { merkeBildungsgang } from '../modules/arbeitsblatt/didactics/bildungsgang'
import { setzeBlindprobe } from './verstehen/blindprobe'

export { THEMES, themeById } from './themes'
export type { AppTheme } from './themes'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: DeepPartial<AppSettings>) => Promise<void>
  /** Schullogo als PNG-data:-URL (für alle Programme) */
  logoDataUrl: string | null
  setLogo: (pngDataUrl: string | null) => Promise<void>
  /**
   * Selbst gestaltete Piktogramme (Kennung → PNG-data:-URL).
   * Sie ersetzen die mitgelieferte Zeichnung in allen Programmen; fehlt eines, gilt die
   * mitgelieferte.
   */
  pictograms: Record<string, string>
  setPictogram: (id: string, pngDataUrl: string | null) => Promise<void>
  resetPictograms: () => Promise<void>
}

/** App-weite Einstellungen in der Oberfläche; Änderungen werden sofort gespeichert. */
export const useAppSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  logoDataUrl: null,
  pictograms: {},
  load: async () => {
    try {
      const [settings, logoDataUrl, pictograms] = await Promise.all([
        window.api.settings.get(),
        window.api.branding.getLogo(),
        window.api.pictograms.get().catch(() => ({}))
      ])
      merkeFachfarben(settings.fachfarben)
      merkeBildungsgang(settings.defaults)
      // Blindprobe der Ankreuzfragen: die Erzeugung liest den Schalter außerhalb von React
      setzeBlindprobe(settings.ai?.mcBlindprobe)
      set({ settings, logoDataUrl, pictograms, loaded: true })
    } catch (e) {
      set({ loaded: true })
      notifyError(e)
    }
  },
  setLogo: async (pngDataUrl) => {
    try {
      if (pngDataUrl) await window.api.branding.setLogo(pngDataUrl)
      else await window.api.branding.removeLogo()
      set({ logoDataUrl: pngDataUrl })
    } catch (e) {
      notifyError(e)
    }
  },
  setPictogram: async (id, pngDataUrl) => {
    try {
      if (pngDataUrl) await window.api.pictograms.set(id, pngDataUrl)
      else await window.api.pictograms.remove(id)
      const next = { ...get().pictograms }
      if (pngDataUrl) next[id] = pngDataUrl
      else delete next[id]
      set({ pictograms: next })
    } catch (e) {
      notifyError(e)
    }
  },
  resetPictograms: async () => {
    try {
      await window.api.pictograms.reset()
      set({ pictograms: {} })
    } catch (e) {
      notifyError(e)
    }
  },
  update: async (patch) => {
    // Sofort anzeigen, dann speichern
    const sofort = deepMerge(get().settings, patch)
    // Die Fachfarben zuerst – Druck und Vorschau lesen sie außerhalb von React (fachfarben.ts)
    merkeFachfarben(sofort.fachfarben)
    // Ebenso der Bildungsgang der eigenen Schule (G8/G9) – die Anrede wird auch im Druck bestimmt
    merkeBildungsgang(sofort.defaults)
    setzeBlindprobe(sofort.ai?.mcBlindprobe)
    set({ settings: sofort })
    try {
      const gespeichert = await window.api.settings.set(patch)
      merkeFachfarben(gespeichert.fachfarben)
      merkeBildungsgang(gespeichert.defaults)
      setzeBlindprobe(gespeichert.ai?.mcBlindprobe)
      set({ settings: gespeichert })
    } catch (e) {
      notifyError(e)
    }
  }
}))

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const current = out[k]
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && current && typeof current === 'object' ? deepMerge(current, v as DeepPartial<typeof current>) : v
  }
  return out as T
}

/** Expertenmodus (07.10.2026): alle Optionen sichtbar. Fehlt die Einstellung, gilt er – so bleibt bei bestehenden Nutzern alles, wie es war. */
export const useExperte = (): boolean => useAppSettings((s) => s.settings.oberflaeche !== 'standard')
