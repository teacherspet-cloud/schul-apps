import type { CefrTable } from '@shared/types'
import type { AfbMix } from './ageBands'
import { stateInfo } from './states'

export type SchoolProfileId = 'grundschule' | 'hauptschule' | 'realschule' | 'integriert' | 'gymnasium' | 'foerderLernen'

/** Kursniveau: G/M/E (BW), G/E (Kurse), E–H (Berlin/Brandenburg) oder gemischte Lerngruppe */
export type CourseLevel = 'mixed' | 'G' | 'M' | 'E' | 'BB-E' | 'BB-F' | 'BB-G' | 'BB-H'

export const FOERDERSCHULE_ID = 'foerderschule-lernen'

export interface SchoolProfile {
  id: SchoolProfileId
  label: string
  targetDegree: string
  afbShift: Partial<AfbMix>
  rules: string[]
}

export const SCHOOL_PROFILES: Record<SchoolProfileId, SchoolProfile> = {
  grundschule: {
    id: 'grundschule',
    label: 'Grundschule',
    targetDegree: 'Primarbereich',
    afbShift: {},
    rules: [
      'Nutze kindgerechte Handlungsverben (male, kreise ein, verbinde, kreuze an, ordne, trage ein, ergänze, rechne, markiere) statt abstrakter Operatoren.',
      'Stelle jeder Arbeitsanweisung ein passendes Handlungssymbol voran (z. B. Stift = schreiben, Auge = lesen) und nur eine Handlung pro Anweisung.'
    ]
  },
  hauptschule: {
    id: 'hauptschule',
    label: 'Hauptschule / Mittelschule',
    targetDegree: 'Erster Schulabschluss (ESA)',
    afbShift: { I: 5, III: -5 },
    rules: [
      'Stelle einen deutlichen Lebenswelt- und Berufsbezug her (Alltag, Beruf, Betrieb, Geld, Gesundheit).',
      'Arbeite kleinschrittig: eine Handlung pro Teilaufgabe, nummerierte Arbeitsschritte, ein gelöstes Beispiel vor der Aufgabe.',
      'Kurze Texte mit konkretem Wortschatz; Fachbegriffe einführen und in einem Glossar erklären.',
      'Anspruchsvolle Operatoren (begründen, beurteilen) nur mit Formulierungshilfe, z. B. „Begründe – nutze ‚weil …‘“.'
    ]
  },
  realschule: {
    id: 'realschule',
    label: 'Realschule',
    targetDegree: 'Mittlerer Schulabschluss (MSA)',
    afbShift: {},
    rules: [
      'Mische die Anforderungsbereiche ausgewogen mit Schwerpunkt auf Anwendung und Transfer.',
      'Hilfen nur optional anbieten (Tipp-Kasten), selbstständiges Arbeiten fördern.'
    ]
  },
  integriert: {
    id: 'integriert',
    label: 'Schulform mit mehreren Bildungsgängen',
    targetDegree: 'ESA, MSA oder Abitur (je nach Kursniveau)',
    afbShift: {},
    rules: ['Die Lerngruppe ist heterogen: alle Aufgaben müssen einen niedrigschwelligen Einstieg und eine Vertiefungsmöglichkeit bieten.']
  },
  gymnasium: {
    id: 'gymnasium',
    label: 'Gymnasium',
    targetDegree: 'Allgemeine Hochschulreife (Abitur)',
    afbShift: { I: -5, III: 5 },
    rules: [
      'Führe Abstraktion und Fachsprache altersgemäß früh ein.',
      'Ab Klasse 9 wissenschaftspropädeutisch arbeiten: Hypothesen bilden, Quellen, Modelle und Daten kritisch prüfen.'
    ]
  },
  foerderLernen: {
    id: 'foerderLernen',
    label: 'Förderschwerpunkt Lernen',
    targetDegree: 'individuelle Lernziele',
    afbShift: {},
    rules: [
      'Sehr kleine Schritte, starker Lebensweltbezug und handlungsorientierte Formate.',
      'Visualisiere Schlüsselbegriffe und Arbeitsschritte mit Bildern oder Symbolen.',
      'Wende einen gemeinsamen Lerngegenstand auf konkreter, bildlicher und symbolischer Ebene an (Stufenmodell).'
    ]
  }
}

const PROFILE_BY_SCHOOL_TYPE: Record<string, SchoolProfileId> = {
  grundschule: 'grundschule',
  hauptschule: 'hauptschule',
  mittelschule: 'hauptschule',
  werkrealschule: 'hauptschule',
  realschule: 'realschule',
  gymnasium: 'gymnasium',
  [FOERDERSCHULE_ID]: 'foerderLernen'
}

/** Schulformen mit Kursen oder Niveaustufen (siehe Konzept A1) */
const COURSE_SCHOOL_TYPES = new Set([
  'oberschule',
  'gesamtschule',
  'integrierte-gesamtschule',
  'gemeinschaftsschule',
  'stadtteilschule',
  'integrierte-sekundarschule',
  'sekundarschule',
  'realschule-plus',
  'regionale-schule',
  'regelschule'
])

export function schoolProfileFor(schoolTypeId: string): SchoolProfile {
  const id = PROFILE_BY_SCHOOL_TYPE[schoolTypeId] ?? (COURSE_SCHOOL_TYPES.has(schoolTypeId) ? 'integriert' : 'realschule')
  return SCHOOL_PROFILES[id]
}

/** Schulformen eines Landes für die Auswahl (aus der GER-Tabelle) plus Förderschule. */
export function schoolTypesForState(table: CefrTable, stateId: string): { value: string; label: string }[] {
  const state = table.states.find((s) => s.id === stateId)
  const types = (state?.schoolTypes ?? []).map((t) => ({ value: t.id, label: t.name }))
  return [...types, { value: FOERDERSCHULE_ID, label: 'Förderschule (Förderschwerpunkt Lernen)' }]
}

/** Gültiger Jahrgangsbereich je Schulform und Land. */
export function gradeRange(table: CefrTable, stateId: string, schoolTypeId: string): { min: number; max: number; note?: string } {
  const info = stateInfo(stateId)
  if (schoolTypeId === FOERDERSCHULE_ID) return { min: 1, max: 10 }
  if (schoolTypeId === 'grundschule') return { min: 1, max: info.primaryYears }
  const type = table.states.find((s) => s.id === stateId)?.schoolTypes.find((t) => t.id === schoolTypeId)
  const grades = type?.languages.flatMap((l) => Object.keys(l.grades).map(Number)) ?? []
  const max = grades.length ? Math.max(...grades) : schoolTypeId === 'gymnasium' ? (info.gymnasium === 'G8' ? 12 : 13) : 10
  if (info.primaryYears === 6) {
    if (schoolTypeId === 'gymnasium') return { min: 5, max, note: 'Klasse 5–6 nur an grundständigen Gymnasien' }
    return { min: 7, max }
  }
  return { min: 5, max }
}

export function hasCourseLevels(schoolTypeId: string, stateId: string): boolean {
  if (COURSE_SCHOOL_TYPES.has(schoolTypeId)) return true
  // In Baden-Württemberg arbeitet auch die Realschule auf den Niveaus G und M
  return schoolTypeId === 'realschule' && stateId === 'BW'
}

/** Auswahlmöglichkeiten für das Kursniveau nach Land (null = kein Kursniveau). */
export function courseLevelOptions(stateId: string, schoolTypeId: string, grade: number): { value: CourseLevel; label: string }[] | null {
  if (!hasCourseLevels(schoolTypeId, stateId)) return null
  const mixed = { value: 'mixed' as const, label: 'Gemischte Lerngruppe' }
  const system = stateInfo(stateId).courseSystem
  if (system === 'GME') {
    return [
      mixed,
      { value: 'G', label: 'Niveau G (grundlegend)' },
      { value: 'M', label: 'Niveau M (mittel)' },
      ...(schoolTypeId === 'realschule' ? [] : [{ value: 'E' as const, label: 'Niveau E (erweitert)' }])
    ]
  }
  if (system === 'BBNiveau') {
    const all: { value: CourseLevel; label: string }[] = [
      { value: 'BB-E', label: 'Niveaustufe E' },
      { value: 'BB-F', label: 'Niveaustufe F' },
      { value: 'BB-G', label: 'Niveaustufe G (≈ MSA)' },
      { value: 'BB-H', label: 'Niveaustufe H (≈ gymnasiale Oberstufe)' }
    ]
    // Vorschlag nach Jahrgang: 7/8 → E/F, 9/10 → G/H
    const suggested = grade <= 8 ? ['BB-E', 'BB-F'] : ['BB-G', 'BB-H']
    return [mixed, ...all.map((o) => (suggested.includes(o.value) ? { ...o, label: `${o.label} – typisch für Kl. ${grade}` } : o))]
  }
  return [mixed, { value: 'G', label: 'Grundkurs (G)' }, { value: 'E', label: 'Erweiterungskurs (E)' }]
}

/** Welches Schulprofil entspricht einem Kursniveau? */
export function profileForCourseLevel(level: CourseLevel): SchoolProfileId | null {
  switch (level) {
    case 'G':
    case 'BB-E':
    case 'BB-F':
      return 'hauptschule'
    case 'M':
    case 'BB-G':
      return 'realschule'
    case 'E':
    case 'BB-H':
      return 'gymnasium'
    default:
      return null
  }
}
