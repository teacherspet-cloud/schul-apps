import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { create } from 'zustand'
import { sichereAlles } from './autosave'
import { laeuft, useAuftraege } from './auftraege'
import { notifyError } from './util'

/**
 * Wohin die Hauptapp gerade zeigt – und wie man von überall dorthin kommt.
 *
 * Anlass (25.09.2026): Der Wechsel zwischen Startseite, Programmen und Einstellungen lag als
 * lokaler Zustand in App.tsx. Von außen kam niemand heran. Deshalb standen in den Programmen
 * Sätze wie „Bitte links unten unter Einstellungen …" – statt eines Knopfes, der genau den
 * richtigen Reiter öffnet. Und die Startseite konnte ein zuletzt bearbeitetes Dokument nicht
 * direkt öffnen, sondern nur das Programm.
 *
 * Jetzt geht beides über diesen Store:
 * - `openModule(id)` – Startseite ('home'), ein Programm oder die Einstellungen,
 * - `openSettings(tab)` – die Einstellungen mit dem passenden Reiter,
 * - `openDocument(moduleId, docId)` – ein gespeichertes Dokument im richtigen Programm.
 *
 * Wie ein Dokument geöffnet wird, weiß nur das Programm selbst (eigener Store, eigene
 * Bibliothek). Es meldet dafür einen „Öffner" an (`useDokumentOeffner`). Ebenso meldet ein
 * geöffneter Editor seine Druckfunktion an (`useDruck`) – Strg+P ruft sie für das vordere
 * Programm auf und tut sonst nichts.
 *
 * Der Laufpunkt je Programm (`laufpunkte`) folgt den Hintergrund-Aufträgen (auftraege.ts):
 * Die Seitenleiste zeigt einen Punkt am Symbol, solange dort etwas erzeugt wird.
 */

/** Reiter der Einstellungsseite */
export type SettingsTab = 'schule' | 'material' | 'darstellung' | 'ki' | 'dienste' | 'netzwerk' | 'wartung'

interface NavigationState {
  /** 'home', 'settings', 'themen' (übergreifende Themenbereiche) oder die Kennung eines Programms aus modules/registry.ts */
  active: string
  settingsTab: SettingsTab
  /** Wohin die Seite „Themenbereiche" beim Öffnen zeigt (Fach, Bereich); `n` zählt hoch, damit auch derselbe Sprung wirkt */
  themenZiel: { fachId?: string; bereichId?: string; n: number }
  /** Programme, an deren Symbol ein Punkt steht (laufender Auftrag, abgeleitet aus auftraege.ts) */
  laufpunkte: Record<string, boolean>
  openModule: (id: string) => void
  openSettings: (tab?: SettingsTab) => void
  setSettingsTab: (tab: SettingsTab) => void
  openDocument: (moduleId: string, docId: string) => Promise<void>
  openThemen: (fachId?: string, bereichId?: string) => void
}

type Oeffner = (docId: string) => Promise<void>

const oeffner = new Map<string, Oeffner>()
const anleger = new Map<string, () => Promise<string>>()
const druck = new Map<string, () => void>()

export const useNavigation = create<NavigationState>((set, get) => ({
  active: 'home',
  settingsTab: 'schule',
  themenZiel: { n: 0 },
  laufpunkte: {},
  openModule: (id) => {
    /*
     * Beim Wechsel des Programms anstehende Sicherungen sofort ausführen. Die Programme bleiben
     * zwar im Hintergrund erhalten – aber wer danach das Fenster schließt oder der Rechner
     * ausgeht, soll nicht die letzten Sekunden Arbeit verlieren.
     */
    if (id !== get().active) void sichereAlles()
    // Über die Leiste kommt man in die Einstellungen immer beim ersten Reiter an (siehe SettingsPage)
    set(id === 'settings' ? { active: id, settingsTab: 'schule' } : { active: id })
  },
  openSettings: (tab = 'schule') => {
    if (get().active !== 'settings') void sichereAlles()
    set({ active: 'settings', settingsTab: tab })
  },
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  openDocument: async (moduleId, docId) => {
    await sichereAlles()
    get().openModule(moduleId)
    const oeffnen = oeffner.get(moduleId)
    if (!oeffnen) return
    try {
      await oeffnen(docId)
    } catch (e) {
      notifyError(e, 'Das Dokument ließ sich nicht öffnen')
    }
  },
  openThemen: (fachId, bereichId) => {
    get().openModule('themen')
    set({ themenZiel: { fachId, bereichId, n: get().themenZiel.n + 1 } })
  }
}))

/*
 * Laufpunkte aus den Aufträgen ableiten: Ein Programm hat einen Punkt, solange dort ein
 * Auftrag läuft oder auf einen freien Platz wartet. Fertige, abgebrochene und gescheiterte
 * zählen nicht – die stehen in der Auftragsleiste.
 */
useAuftraege.subscribe((s, prev) => {
  if (s.auftraege === prev.auftraege) return
  const punkte: Record<string, boolean> = {}
  for (const a of s.auftraege) if (laeuft(a)) punkte[a.moduleId] = true
  const bisher = useNavigation.getState().laufpunkte
  const gleich = Object.keys(punkte).length === Object.keys(bisher).filter((k) => bisher[k]).length && Object.keys(punkte).every((k) => bisher[k])
  if (!gleich) useNavigation.setState({ laufpunkte: punkte })
})

/** Kurzformen für Stellen außerhalb von React (und für Knöpfe, die nur auslösen) */
export const openModule = (id: string): void => useNavigation.getState().openModule(id)
export const openSettings = (tab?: SettingsTab): void => useNavigation.getState().openSettings(tab)
export const openDocument = (moduleId: string, docId: string): Promise<void> => useNavigation.getState().openDocument(moduleId, docId)
export const openThemen = (fachId?: string, bereichId?: string): void => useNavigation.getState().openThemen(fachId, bereichId)

/**
 * Das Programm meldet an, wie es ein NEUES Dokument anlegt, und liefert dessen Kennung
 * (Paket 10b: „Neu in diesem Bereich" – auch von der übergreifenden Seite der Themenbereiche
 * aus, die selbst kein Programm ist).
 */
export function useNeuAnleger(moduleId: string, anlegen: () => Promise<string>): void {
  const aktuell = useRef(anlegen)
  aktuell.current = anlegen
  useEffect(() => {
    const fn = (): Promise<string> => aktuell.current()
    anleger.set(moduleId, fn)
    return () => {
      if (anleger.get(moduleId) === fn) anleger.delete(moduleId)
    }
  }, [moduleId])
}

/** Neues Dokument im Programm anlegen und dorthin wechseln; liefert die Kennung (null, wenn das Programm es nicht kann) */
export async function neuAnlegen(moduleId: string): Promise<string | null> {
  const fn = anleger.get(moduleId)
  if (!fn) return null
  await sichereAlles()
  const id = await fn()
  useNavigation.getState().openModule(moduleId)
  return id
}

/**
 * Das Programm meldet an, wie es ein gespeichertes Dokument öffnet.
 *
 * Liefert eine Markierung, die gesetzt ist, sobald von außen etwas geöffnet wurde. Die
 * Programme zeigen beim Start ihre Bibliothek, sobald die Liste geladen ist – kommt diese
 * Antwort NACH dem Öffnen an, soll sie das geöffnete Dokument nicht wieder verdecken.
 */
export function useDokumentOeffner(moduleId: string, oeffnen: Oeffner): MutableRefObject<boolean> {
  const aktuell = useRef(oeffnen)
  aktuell.current = oeffnen
  const geoeffnet = useRef(false)
  useEffect(() => {
    const fn: Oeffner = async (docId) => {
      geoeffnet.current = true
      await aktuell.current(docId)
    }
    oeffner.set(moduleId, fn)
    return () => {
      if (oeffner.get(moduleId) === fn) oeffner.delete(moduleId)
    }
  }, [moduleId])
  return geoeffnet
}

/**
 * Ein geöffneter Editor meldet seine Druckfunktion an (Druckvorschau bzw. Druckdialog).
 * Solange er gemountet ist, löst Strg+P sie aus – aber nur, wenn sein Programm vorn liegt.
 */
export function useDruck(moduleId: string, drucken: (() => void) | null): void {
  const aktuell = useRef(drucken)
  aktuell.current = drucken
  const da = drucken !== null
  useEffect(() => {
    if (!da) return
    const fn = (): void => aktuell.current?.()
    druck.set(moduleId, fn)
    return () => {
      if (druck.get(moduleId) === fn) druck.delete(moduleId)
    }
  }, [moduleId, da])
}

/** Strg+P: Druck des vorderen Programms, falls dort ein Editor mit Druck offen ist. */
export function druckeAktives(): boolean {
  const fn = druck.get(useNavigation.getState().active)
  if (!fn) return false
  fn()
  return true
}
