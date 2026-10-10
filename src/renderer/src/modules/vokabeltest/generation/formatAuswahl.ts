// Aufgabenformate beim „Test automatisch erstellen" (10.10.2026): Eignung je Klasse und Niveau, Vorauswahl, gleichmäßige Verteilung.
import type { CefrLevel } from '@shared/types'
import { levelAtLeast } from '../../../shared/cefr'
import type { TaskTypeId, TestSettings } from '../model/types'
import { TASK_TYPE_LIST, TASK_TYPES } from './taskTypes'
import { aufgabenLabel, passtZurSprache } from '../didactics/latein'
import { formVorwissen, formZuSchwer, type FormSettings } from '../didactics/formVorwissen'

/** Einstellungen für die Eignung; ohne Sprache oder Klasse wird nur das Niveau geprüft */
export type EignungsSettings = Pick<TestSettings, 'level'> & Partial<Omit<FormSettings, 'level'>>

/** Niveau, ab dem das Format beim automatischen Erstellen passt (`ab.niveau`, sonst `minLevel`) */
export const abNiveau = (id: TaskTypeId): CefrLevel => TASK_TYPES[id].ab?.niveau ?? TASK_TYPES[id].minLevel

/**
 * Warum ein Format für diese Klasse nicht passt – oder `null`, wenn es passt. Grundlage sind die
 * Angaben der Formate (minLevel bzw. `ab`), das Vorwissen bei Wortformen (Wortbildung erst, wenn
 * eingeführt) und die Sprache. „Unregelmäßige Verben" braucht eine Verbauswahl und geht nur über
 * „Test einstellen".
 */
export function formatHinderung(id: TaskTypeId, settings: EignungsSettings): string | null {
  const def = TASK_TYPES[id]
  if (!def) return 'unbekannt'
  if (!def.usesVocab) return 'nur in „Test einstellen“'
  if (settings.targetLanguage && !passtZurSprache(id, settings.targetLanguage)) return 'nicht in dieser Sprache'
  const niveau = abNiveau(id)
  const klasse = def.ab?.klasse
  const niveauFehlt = !levelAtLeast(settings.level, niveau)
  const klasseFehlt = Boolean(klasse && settings.grade && settings.grade < klasse)
  if (niveauFehlt || klasseFehlt) {
    const teile = [niveau !== 'Pre-A1' ? niveau : '', klasse ? `Kl. ${klasse}` : ''].filter(Boolean)
    return `ab ${teile.join(' / ')}`
  }
  if (settings.targetLanguage && settings.grade) {
    const v = formVorwissen({
      targetLanguage: settings.targetLanguage,
      grade: settings.grade,
      languageOrder: settings.languageOrder ?? 1,
      stateId: settings.stateId ?? '',
      level: settings.level
    })
    if (formZuSchwer(id, v)) return 'Wortbildung noch nicht eingeführt'
  }
  return null
}

export const formatGeeignet = (id: TaskTypeId, settings: EignungsSettings): boolean => formatHinderung(id, settings) === null

export interface FormatEintrag {
  id: TaskTypeId
  label: string
  geeignet: boolean
  /** Grund für „nicht geeignet", z. B. „ab B1 / Kl. 8" */
  hinweis?: string
}

/** Alle Formate der Sprache (wie in „Test einstellen", ohne Freie Aufgabe) mit ihrer Eignung */
export function formatListe(settings: EignungsSettings & { targetLanguage: string }): FormatEintrag[] {
  return TASK_TYPE_LIST.filter((d) => d.id !== 'freeText' && passtZurSprache(d.id, settings.targetLanguage)).map((d) => {
    const hinweis = formatHinderung(d.id, settings)
    return { id: d.id, label: aufgabenLabel(d, settings.targetLanguage), geeignet: !hinweis, ...(hinweis ? { hinweis } : {}) }
  })
}

/** Typische Formate je Stufe, in dieser Reihenfolge bevorzugt */
const TYPISCH = {
  anfang: ['gapSentences', 'pictureLabel', 'multipleChoice', 'matchDefinitions'],
  mitte: ['gapSentences', 'gapText', 'matchDefinitions', 'writeSentences'],
  oben: ['gapText', 'collocations', 'wordFormation', 'writeDefinitions'],
  latein: ['latinForms', 'latinContext', 'latinWordFormation', 'matchDefinitions']
} satisfies Record<string, TaskTypeId[]>

/** Auffüllen, wenn typische Formate hier nicht passen (Sprache, Vorwissen) */
const AUFFUELLEN: TaskTypeId[] = ['gapSentences', 'multipleChoice', 'matchDefinitions', 'gapText', 'dialogue', 'scrambled', 'categorize', 'trueFalse', 'pictureLabel']

/** Sprachbesondere Formate, die in der Vorauswahl vorne stehen */
const SPRACH_VORNE: Partial<Record<string, TaskTypeId>> = { zh: 'readingMatch', ja: 'readingMatch' }

/**
 * Vorauswahl: drei bis vier typische, geeignete Formate für Klasse und Niveau
 * (A1/Kl. 5: Lückensätze, Bilder beschriften, Multiple Choice im Kontext, Erklärungen zuordnen).
 */
export function vorauswahlFormate(settings: EignungsSettings & { targetLanguage: string }): TaskTypeId[] {
  const geeignet = new Set(formatListe(settings).filter((f) => f.geeignet).map((f) => f.id))
  const latein = passtZurSprache('latinForms', settings.targetLanguage)
  const typisch: TaskTypeId[] = latein
    ? TYPISCH.latein
    : levelAtLeast(settings.level, 'B1') && (settings.grade ?? 99) >= 8
      ? TYPISCH.oben
      : levelAtLeast(settings.level, 'A2')
        ? TYPISCH.mitte
        : TYPISCH.anfang
  const vorne = SPRACH_VORNE[settings.targetLanguage]
  const wahl: TaskTypeId[] = []
  for (const id of [...(vorne ? [vorne] : []), ...typisch, ...AUFFUELLEN]) {
    if (wahl.length >= 4) break
    if (geeignet.has(id) && !wahl.includes(id)) wahl.push(id)
  }
  return wahl
}

/**
 * Verteilt `gesamt` Vokabeln gleichmäßig auf die Formate (Reste vorne). Reicht die Zahl nicht für
 * die Mindestanzahlen aller Formate, fallen Formate von hinten weg.
 */
export function gleichVerteilen(formate: TaskTypeId[], gesamt: number): { type: TaskTypeId; count: number }[] {
  let liste = formate.filter((id) => TASK_TYPES[id]?.usesVocab)
  const minOf = (id: TaskTypeId): number => TASK_TYPES[id].minItems ?? 1
  while (liste.length > 1 && liste.reduce((s, id) => s + minOf(id), 0) > gesamt) liste = liste.slice(0, -1)
  if (!liste.length || gesamt <= 0) return []
  const counts = liste.map((_, i) => Math.floor(gesamt / liste.length) + (i < gesamt % liste.length ? 1 : 0))
  // Mindestanzahlen anheben, Überschuss bei den größten wieder abziehen
  let ueber = 0
  liste.forEach((id, i) => {
    if (counts[i] < minOf(id)) {
      ueber += minOf(id) - counts[i]
      counts[i] = minOf(id)
    }
  })
  while (ueber > 0) {
    let g = -1
    counts.forEach((c, i) => {
      if (c > minOf(liste[i]) && (g < 0 || c > counts[g])) g = i
    })
    if (g < 0) break
    counts[g]--
    ueber--
  }
  return liste.map((type, i) => ({ type, count: counts[i] }))
}

/**
 * KI-Plan an die gleichmäßige Verteilung binden: Die KI darf je Format etwas abweichen (je nach
 * Eignung der Wörter), höchstens ein Viertel der gleichen Menge, mindestens aber eine Vokabel.
 * Fehlende Formate bekommen ihren Anteil zurück; die Summe bleibt `gesamt`.
 */
export function anGleichverteilungBinden(geplant: { type: TaskTypeId; count: number }[], formate: TaskTypeId[], gesamt: number): { type: TaskTypeId; count: number }[] {
  const gleich = gleichVerteilen(formate, gesamt)
  if (!gleich.length) return []
  const minOf = (id: TaskTypeId): number => TASK_TYPES[id].minItems ?? 1
  const counts = gleich.map((g) => {
    const spiel = Math.max(1, Math.round(g.count / 4))
    const ki = geplant.find((p) => p.type === g.type)?.count ?? g.count
    return Math.max(minOf(g.type), g.count - spiel, Math.min(g.count + spiel, Math.round(ki)))
  })
  // Summe ausgleichen: zuerst dort, wo die Abweichung von der Gleichverteilung am größten ist
  for (let guard = 0; guard < 500; guard++) {
    const diff = gesamt - counts.reduce((s, c) => s + c, 0)
    if (!diff) break
    const schritt = diff > 0 ? 1 : -1
    let best = -1
    counts.forEach((c, i) => {
      if (schritt < 0 && c - 1 < minOf(gleich[i].type)) return
      const abw = (c - gleich[i].count) * schritt
      if (best < 0 || abw < (counts[best] - gleich[best].count) * schritt) best = i
    })
    if (best < 0) break
    counts[best] += schritt
  }
  return gleich.map((g, i) => ({ type: g.type, count: counts[i] }))
}

// ---------- Letzte Auswahl je Klasse/Niveau auf diesem Gerät ----------

const SPEICHER = 'vokabeltest.autoFormate'

const schluessel = (s: { targetLanguage: string; grade?: number; level: CefrLevel }): string => `${s.targetLanguage}|${s.grade ?? ''}|${s.level}`

/** Gemerkte Auswahl (nur noch geeignete Formate) – `null`, wenn es für diese Klasse/Niveau keine gibt */
export function gemerkteFormate(settings: EignungsSettings & { targetLanguage: string }): TaskTypeId[] | null {
  try {
    const alle = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Record<string, TaskTypeId[]>
    const liste = alle[schluessel(settings)]
    if (!Array.isArray(liste)) return null
    return liste.filter((id) => TASK_TYPES[id] && formatGeeignet(id, settings))
  } catch {
    return null
  }
}

export function formateMerken(settings: { targetLanguage: string; grade?: number; level: CefrLevel }, formate: TaskTypeId[]): void {
  try {
    const alle = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Record<string, TaskTypeId[]>
    alle[schluessel(settings)] = formate
    localStorage.setItem(SPEICHER, JSON.stringify(alle))
  } catch {
    // ohne Speicher gilt beim nächsten Mal die Vorauswahl
  }
}
