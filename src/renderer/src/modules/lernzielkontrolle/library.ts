/**
 * Lernzielkontrollen in der App speichern und wieder öffnen – wie bei Vokabeltests,
 * Arbeitsblättern, Klassenarbeiten und Grammatiktests. Gespeichert wird unter
 * `%APPDATA%/schul-apps/lernzielkontrollen`.
 */
import type { SavedKurztestStats } from '@shared/types'
import { ueberthemaVon } from '../../shared/ueberthema'
import { gesamtpunkte } from './didactics/bewertung'
import { teilaufgaben } from './didactics/pruefungen'
import { erzeugeBibliothek } from '../../shared/testmodul/bibliothek'
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
    schoolTypeId: test.meta.schoolTypeId,
    taskCount: teilaufgaben(blocks),
    points: gesamtpunkte(blocks),
    minutes: test.meta.minutes,
    varianten: test.varianten.length,
    ...(ueberthemaVon(test.meta) ? { ueberthema: ueberthemaVon(test.meta) } : {})
  }
}

/** Vorschlag für den Namen: Titel, sonst Thema und Fach. */
export function defaultKurztestName(test: Kurztest): string {
  const titel = test.meta.title.trim()
  if (titel) return titel
  const thema = test.meta.thema.trim()
  return thema ? `${test.meta.subjectLabel} – ${thema}` : `${test.meta.bezeichnung} ${test.meta.subjectLabel}`
}

/*
 * Speichern, Öffnen, Ablegen, Neu, automatisch Speichern: gemeinsames Gerüst mit den anderen
 * Testprogrammen (shared/testmodul/bibliothek.ts, Großprogramm 0.4). Die bisherigen Namen bleiben.
 */
export const bibliothek = erzeugeBibliothek({
  store: useLernzielkontrolle,
  dokument: (s) => s.test,
  setzeDokument: (s, d) => s.setTest(d),
  // Erst beim Aufruf nachschlagen – beim Laden des Moduls (auch in Tests) gibt es `window.api` noch nicht
  api: { save: (i) => window.api.kurztests.save(i), get: (id) => window.api.kurztests.get(id) },
  stats: kurztestStats,
  standardName: defaultKurztestName,
  lohntSicherung
})

export const saveCurrentKurztest = bibliothek.speichern
export const openSavedKurztest = bibliothek.oeffnen
/** Ist genau dieses Dokument gerade im Programm offen? */
export const kurztestOffen = bibliothek.istOffen
/** Ergebnis eines Hintergrund-Auftrags ablegen (siehe shared/auftraege.ts) */
export const legeKurztestAb = bibliothek.legeAb
/** Neues Dokument beginnen – das bisherige vorher sichern. */
export const newKurztestSafely = bibliothek.neuSicher
export const useKurztestAutosave = bibliothek.useAutosave
