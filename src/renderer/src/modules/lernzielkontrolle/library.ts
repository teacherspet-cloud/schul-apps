/**
 * Lernzielkontrollen in der App speichern und wieder öffnen – wie bei Vokabeltests,
 * Arbeitsblättern, Klassenarbeiten und Grammatiktests. Gespeichert wird unter
 * `%APPDATA%/schul-apps/lernzielkontrollen`.
 */
import type { SavedKurztestStats } from '@shared/types'
import { dokumentName, sichereAlles } from '../../shared/autosave'
import { legeAb } from '../../shared/auftraege'
import { useStoreAutosave } from '../../shared/useAutosave'
import { gesamtpunkte } from './didactics/bewertung'
import { teilaufgaben } from './didactics/pruefungen'
import type { Kurztest } from './model/types'
import { useLernzielkontrolle } from './store'

/** Hat die Kontrolle überhaupt Aufgaben? Ein leeres Formular soll die Übersicht nicht füllen. */
export const hatInhalt = (test: Kurztest | null): boolean => Boolean(test?.varianten.some((v) => v.blocks.length))

/**
 * Lohnt sich das Sichern? Schon als Entwurf, sobald ein Thema dasteht – nicht erst nach dem
 * Erzeugen. Vorher war alles Eingestellte bis dahin nur im Arbeitsspeicher.
 */
export const lohntSicherung = (test: Kurztest | null): boolean => Boolean(test && (hatInhalt(test) || test.meta.thema.trim() || test.meta.title.trim()))

export function kurztestStats(test: Kurztest): SavedKurztestStats {
  const blocks = test.varianten[0]?.blocks ?? []
  return {
    subjectLabel: test.meta.subjectLabel,
    grade: test.meta.grade,
    thema: test.meta.thema,
    bezeichnung: test.meta.bezeichnung,
    stateId: test.meta.stateId,
    taskCount: teilaufgaben(blocks),
    points: gesamtpunkte(blocks),
    minutes: test.meta.minutes,
    varianten: test.varianten.length
  }
}

/** Vorschlag für den Namen: Titel, sonst Thema und Fach. */
export function defaultKurztestName(test: Kurztest): string {
  const titel = test.meta.title.trim()
  if (titel) return titel
  const thema = test.meta.thema.trim()
  return thema ? `${test.meta.subjectLabel} – ${thema}` : `${test.meta.bezeichnung} ${test.meta.subjectLabel}`
}

export async function saveCurrentKurztest(name?: string): Promise<void> {
  const state = useLernzielkontrolle.getState()
  const test = state.test
  if (!test || !lohntSicherung(test)) return
  const id = state.docId
  const meta = await window.api.kurztests.save({
    id,
    name: name?.trim() || dokumentName(id, state.docName, defaultKurztestName(test)),
    stats: kurztestStats(test),
    payload: test
  })
  useLernzielkontrolle.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedKurztest(id: string): Promise<void> {
  // Was an der bisherigen Kontrolle noch ansteht, zuerst sichern – sonst ginge es beim Wechsel verloren
  await sichereAlles()
  const saved = await window.api.kurztests.get(id)
  useLernzielkontrolle.getState().openSaved(saved.id, saved.name, saved.payload as Kurztest, saved.updatedAt)
}

/** Ist genau diese Kontrolle gerade im Programm offen? */
export const kurztestOffen = (docId: string): boolean => {
  const s = useLernzielkontrolle.getState()
  return s.docId === docId && s.test !== null
}

/**
 * Ergebnis eines Hintergrund-Auftrags in der Kontrolle `docId` ablegen (siehe
 * shared/auftraege.ts): im offenen Dokument als Rückgängig-Schritt, sonst in der Bibliothek.
 */
export function legeKurztestAb(docId: string, schnappschuss: Kurztest, einarbeiten: (t: Kurztest) => Kurztest, schritt?: number): Promise<void> {
  return legeAb<Kurztest>(
    {
      istOffen: kurztestOffen,
      imOffenen: (f) => {
        const s = useLernzielkontrolle.getState()
        if (!s.test) return
        s.setTest(f(s.test))
        if (schritt !== undefined) s.setStep(schritt)
      },
      laden: async (id) => {
        const t = await window.api.kurztests.get(id)
        return { name: t.name, dok: t.payload as Kurztest }
      },
      speichern: async (id, name, test) => {
        await window.api.kurztests.save({ id, name: name ?? defaultKurztestName(test), stats: kurztestStats(test), payload: test })
      }
    },
    docId,
    schnappschuss,
    einarbeiten
  )
}

/** Neue Kontrolle beginnen – die bisherige vorher sichern. */
export async function newKurztestSafely(): Promise<void> {
  await sichereAlles()
  useLernzielkontrolle.getState().reset()
}

/**
 * Automatisches Speichern – als Entwurf ab dem Thema, danach nach jeder Änderung.
 *
 * Verzögert um anderthalb Sekunden, damit nicht jeder Tastendruck im Editor eine Datei
 * schreibt. Ohne diese Verzögerung entstand beim Grammatiktest bei jedem Zeichen ein
 * Schreibvorgang.
 */
export function useKurztestAutosave(): void {
  useStoreAutosave({
    store: useLernzielkontrolle,
    dokument: (s) => s.docId,
    gesichert: (s) => Boolean(s.savedAt),
    bereit: (s) => lohntSicherung(s.test),
    geaendert: (s, prev) => s.test !== prev.test,
    speichern: () => saveCurrentKurztest()
  })
}
