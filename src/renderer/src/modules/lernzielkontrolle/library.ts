/**
 * Lernzielkontrollen in der App speichern und wieder öffnen – wie bei Vokabeltests,
 * Arbeitsblättern, Klassenarbeiten und Grammatiktests. Gespeichert wird unter
 * `%APPDATA%/schul-apps/lernzielkontrollen`.
 */
import { useEffect, useRef } from 'react'
import type { SavedKurztestStats } from '@shared/types'
import { notifyError } from '../../shared/util'
import { newId } from '../vokabeltest/model/random'
import { gesamtpunkte } from './didactics/bewertung'
import { teilaufgaben } from './didactics/pruefungen'
import type { Kurztest } from './model/types'
import { useLernzielkontrolle } from './store'

/** Hat die Kontrolle überhaupt Aufgaben? Ein leeres Formular soll die Übersicht nicht füllen. */
export const hatInhalt = (test: Kurztest | null): boolean => Boolean(test?.varianten.some((v) => v.blocks.length))

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
  if (!test || !hatInhalt(test)) return
  const id = state.docId ?? newId()
  const meta = await window.api.kurztests.save({
    id,
    name: (name ?? state.docName).trim() || defaultKurztestName(test),
    stats: kurztestStats(test),
    payload: test
  })
  useLernzielkontrolle.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedKurztest(id: string): Promise<void> {
  const saved = await window.api.kurztests.get(id)
  useLernzielkontrolle.getState().openSaved(saved.id, saved.name, saved.payload as Kurztest, saved.updatedAt)
}

/**
 * Automatisches Speichern: das erste Mal, sobald Aufgaben da sind, danach nach jeder Änderung.
 *
 * Verzögert um anderthalb Sekunden, damit nicht jeder Tastendruck im Editor eine Datei
 * schreibt. Ohne diese Verzögerung entstand beim Grammatiktest bei jedem Zeichen ein
 * Schreibvorgang.
 */
export function useKurztestAutosave(): void {
  const timer = useRef<number | null>(null)
  useEffect(() => {
    const save = (): void => {
      saveCurrentKurztest().catch((e) => notifyError(e, 'Automatisches Speichern fehlgeschlagen'))
    }
    const schedule = (): void => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(save, 1500)
    }
    const state = useLernzielkontrolle.getState()
    if (hatInhalt(state.test) && !state.docId) schedule()
    const unsubscribe = useLernzielkontrolle.subscribe((s, prev) => {
      if (s.test === prev.test) return
      if (!hatInhalt(s.test)) return
      schedule()
    })
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      unsubscribe()
    }
  }, [])
}
