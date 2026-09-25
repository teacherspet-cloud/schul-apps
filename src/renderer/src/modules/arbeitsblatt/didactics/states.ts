/**
 * Länderinformationen, die für Arbeitsblätter relevant sind: Begriffe, Zeitpunkt der Themen, Kursniveaus.
 * Stand der Recherche 2026; G8/G9-Angaben laut Übersicht (vor Nutzung im Einzelfall prüfen).
 */

export type CourseSystem = 'GME' | 'GE' | 'BBNiveau' | 'none'

export interface StateInfo {
  id: string
  name: string
  curriculumName: string
  /** Gymnasium: 'G8' = Abitur nach Kl. 12, 'G9' = nach Kl. 13 */
  gymnasium: 'G8' | 'G9' | 'G9 im Aufbau'
  primaryYears: 4 | 6
  /** Bezeichnung der Kursniveaus an Schulformen mit Kursen */
  courseSystem: CourseSystem
}

export const STATES: StateInfo[] = [
  { id: 'BW', name: 'Baden-Württemberg', curriculumName: 'Bildungsplan', gymnasium: 'G9 im Aufbau', primaryYears: 4, courseSystem: 'GME' },
  { id: 'BY', name: 'Bayern', curriculumName: 'LehrplanPLUS', gymnasium: 'G9', primaryYears: 4, courseSystem: 'GE' },
  { id: 'BE', name: 'Berlin', curriculumName: 'Rahmenlehrplan', gymnasium: 'G8', primaryYears: 6, courseSystem: 'BBNiveau' },
  { id: 'BB', name: 'Brandenburg', curriculumName: 'Rahmenlehrplan', gymnasium: 'G8', primaryYears: 6, courseSystem: 'BBNiveau' },
  { id: 'HB', name: 'Bremen', curriculumName: 'Bildungsplan', gymnasium: 'G8', primaryYears: 4, courseSystem: 'GE' },
  { id: 'HH', name: 'Hamburg', curriculumName: 'Bildungsplan', gymnasium: 'G8', primaryYears: 4, courseSystem: 'GE' },
  { id: 'HE', name: 'Hessen', curriculumName: 'Kerncurriculum', gymnasium: 'G9', primaryYears: 4, courseSystem: 'GE' },
  { id: 'MV', name: 'Mecklenburg-Vorpommern', curriculumName: 'Rahmenplan', gymnasium: 'G8', primaryYears: 4, courseSystem: 'GE' },
  { id: 'NI', name: 'Niedersachsen', curriculumName: 'Kerncurriculum', gymnasium: 'G9', primaryYears: 4, courseSystem: 'GE' },
  { id: 'NW', name: 'Nordrhein-Westfalen', curriculumName: 'Kernlehrplan', gymnasium: 'G9', primaryYears: 4, courseSystem: 'GE' },
  { id: 'RP', name: 'Rheinland-Pfalz', curriculumName: 'Lehrplan', gymnasium: 'G9', primaryYears: 4, courseSystem: 'GE' },
  { id: 'SL', name: 'Saarland', curriculumName: 'Lehrplan', gymnasium: 'G9 im Aufbau', primaryYears: 4, courseSystem: 'GE' },
  { id: 'SN', name: 'Sachsen', curriculumName: 'Lehrplan', gymnasium: 'G8', primaryYears: 4, courseSystem: 'GE' },
  { id: 'ST', name: 'Sachsen-Anhalt', curriculumName: 'Fachlehrplan', gymnasium: 'G8', primaryYears: 4, courseSystem: 'GE' },
  { id: 'SH', name: 'Schleswig-Holstein', curriculumName: 'Fachanforderungen', gymnasium: 'G9', primaryYears: 4, courseSystem: 'GE' },
  { id: 'TH', name: 'Thüringen', curriculumName: 'Lehrplan', gymnasium: 'G8', primaryYears: 4, courseSystem: 'GE' }
]

export function stateInfo(id: string): StateInfo {
  return STATES.find((s) => s.id === id) ?? STATES.find((s) => s.id === 'NI')!
}
