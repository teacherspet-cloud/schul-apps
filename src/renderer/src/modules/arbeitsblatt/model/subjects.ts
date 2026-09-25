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

export const SUBJECTS: Subject[] = [
  { id: 'deutsch', label: 'Deutsch' },
  { id: 'englisch', label: 'Englisch', foreignLanguage: 'en' },
  { id: 'franzoesisch', label: 'Französisch', foreignLanguage: 'fr' },
  { id: 'spanisch', label: 'Spanisch', foreignLanguage: 'es' },
  { id: 'italienisch', label: 'Italienisch', foreignLanguage: 'it' },
  { id: 'latein', label: 'Latein', uebersetzungssprache: 'la' },
  { id: 'mathematik', label: 'Mathematik', formulas: true },
  { id: 'biologie', label: 'Biologie', formulas: true },
  { id: 'chemie', label: 'Chemie', formulas: true },
  { id: 'physik', label: 'Physik', formulas: true },
  { id: 'informatik', label: 'Informatik', formulas: true },
  { id: 'geschichte', label: 'Geschichte' },
  { id: 'erdkunde', label: 'Erdkunde / Geographie' },
  { id: 'politik', label: 'Politik / Wirtschaft / Sozialkunde' },
  { id: 'religion', label: 'Religion / Ethik' },
  /*
   * Werte und Normen ist ein eigenes Fach, kein Religionsersatz mit anderem Namen: In
   * Niedersachsen hat es ein eigenes Kerncurriculum mit eigener Operatorenliste, die von
   * der des Religionsunterrichts abweicht. Bis September 2026 lief es hier unter
   * „Religion / Ethik / Werte und Normen" mit – damit war es weder auswählbar noch
   * unterscheidbar.
   */
  { id: 'werte-und-normen', label: 'Werte und Normen' },
  { id: 'kunst', label: 'Kunst' },
  { id: 'musik', label: 'Musik' },
  { id: 'sport', label: 'Sport' },
  { id: 'sachunterricht', label: 'Sachunterricht' },
  { id: 'daz', label: 'Deutsch als Zweitsprache (DaZ)' },
  { id: 'anderes', label: 'Anderes Fach …' }
]

export function subjectById(id: string): Subject {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0]
}

export const LANGUAGE_NAMES: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch'
}
