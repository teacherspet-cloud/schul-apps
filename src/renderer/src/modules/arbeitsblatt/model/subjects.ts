import { FAECHER, SPRACHNAMEN } from '@shared/faecher'

export interface Subject {
  id: string
  label: string
  /** Sprachcode, wenn das Fach eine moderne Fremdsprache ist (GER-Niveau wählbar) */
  foreignLanguage?: string
  /**
   * Sprachcode, wenn in diesem Fach AUS einer Sprache ins Deutsche übersetzt wird.
   *
   * Latein ist eine Fremdsprache, aber keine, in der produziert wird: Es gibt kein
   * Hörverstehen, keine Sprachmittlung und keine Arbeitsanweisungen auf Latein. An
   * `foreignLanguage` hängen genau diese Dinge – deshalb ein eigenes Merkmal. Die
   * Wortangaben laufen hier immer über das Deutsche, denn das Übersetzen IST das Lernziel.
   */
  uebersetzungssprache?: string
  /** Formeln (Mathe, Naturwissenschaften) üblich */
  formulas?: boolean
}

/**
 * Die Fächer der Programme – seit 30.09.2026 aus dem gemeinsamen Katalog @shared/faecher (Kennung,
 * Name, Zielsprache, Formeln). Neue Fächer werden dort eingetragen, nicht hier.
 */
export const SUBJECTS: Subject[] = FAECHER.map((f) => ({
  id: f.id,
  label: f.label,
  ...(f.sprache ? { foreignLanguage: f.sprache } : {}),
  ...(f.uebersetzungssprache ? { uebersetzungssprache: f.uebersetzungssprache } : {}),
  ...(f.formeln ? { formulas: true } : {})
}))

export function subjectById(id: string): Subject {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0]
}

/** Deutscher Name einer Sprache nach Code – aus dem Katalog, damit neue Schulfremdsprachen mitkommen */
export const LANGUAGE_NAMES: Record<string, string> = SPRACHNAMEN
