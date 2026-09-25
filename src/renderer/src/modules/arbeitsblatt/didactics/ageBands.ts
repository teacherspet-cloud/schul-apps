/**
 * Altersbänder nach Jahrgang (Recherche: Hughes & Wilkins, Katzir et al., Bamberger/Vanecek,
 * LIX-Richtwerte Grundschule, Cognitive Load Theory). Mit (H) markierte Werte sind Faustregeln.
 */

export type AgeBandId = 'k12' | 'k34' | 'k56' | 'k78' | 'k910' | 'sek2'
export type Afb = 'I' | 'II' | 'III'
export type AfbMix = Record<Afb, number>
export type SelfAssessmentFormat = 'smileys' | 'ichKannSmileys' | 'ichKann' | 'kompetenzraster' | 'erwartungshorizont'

export interface AgeBand {
  id: AgeBandId
  label: string
  grades: [number, number]
  typography: { fontPt: number; lineHeight: number }
  language: { avgSentenceWords: number; maxSentenceWords: number; lixMax: number }
  /** Aufgaben pro Seite (H) */
  tasksPerPage: [number, number]
  /** Minuten pro Aufgabe (H) */
  minutesPerTask: [number, number]
  afbMix: AfbMix
  exampleFirst: boolean
  instructionSymbols: boolean
  scaffolding: 'hoch' | 'mittel' | 'gering'
  selfAssessment: SelfAssessmentFormat
  formats: string
}

export const AGE_BANDS: AgeBand[] = [
  {
    id: 'k12',
    label: 'Klasse 1–2',
    grades: [1, 2],
    typography: { fontPt: 17, lineHeight: 1.5 },
    language: { avgSentenceWords: 7, maxSentenceWords: 10, lixMax: 24 },
    tasksPerPage: [2, 4],
    minutesPerTask: [3, 8],
    afbMix: { I: 60, II: 35, III: 5 },
    exampleFirst: true,
    instructionSymbols: true,
    scaffolding: 'hoch',
    selfAssessment: 'smileys',
    formats:
      'überwiegend geschlossene Formate (ankreuzen, verbinden, einkreisen, Bild-Wort-Zuordnung), jeweils mit gelöstem Beispiel als erstem Item, sehr wenig Text, viele Bilder'
  },
  {
    id: 'k34',
    label: 'Klasse 3–4',
    grades: [3, 4],
    typography: { fontPt: 15, lineHeight: 1.4 },
    language: { avgSentenceWords: 11, maxSentenceWords: 14, lixMax: 30 },
    tasksPerPage: [3, 5],
    minutesPerTask: [5, 10],
    afbMix: { I: 45, II: 40, III: 15 },
    exampleFirst: true,
    instructionSymbols: true,
    scaffolding: 'hoch',
    selfAssessment: 'ichKannSmileys',
    formats:
      'geschlossene und halboffene Formate, erste offene Aufgaben; neue Operatoren (beschreibe, vergleiche, begründe) immer mit Satzanfang; Beispiel-Item und Wortspeicher'
  },
  {
    id: 'k56',
    label: 'Klasse 5–6',
    grades: [5, 6],
    typography: { fontPt: 13, lineHeight: 1.3 },
    language: { avgSentenceWords: 12.5, maxSentenceWords: 16, lixMax: 38 },
    tasksPerPage: [3, 5],
    minutesPerTask: [10, 15],
    afbMix: { I: 35, II: 45, III: 20 },
    exampleFirst: true,
    instructionSymbols: false,
    scaffolding: 'mittel',
    selfAssessment: 'ichKann',
    formats: 'Operatoren fett, nummerierte Teilschritte, Fachbegriffe beim ersten Auftreten erklären, eine Transfer- oder Knobelaufgabe, gestufte Tippkarten'
  },
  {
    id: 'k78',
    label: 'Klasse 7–8',
    grades: [7, 8],
    typography: { fontPt: 12, lineHeight: 1.25 },
    language: { avgSentenceWords: 14.5, maxSentenceWords: 20, lixMax: 45 },
    tasksPerPage: [4, 6],
    minutesPerTask: [10, 20],
    afbMix: { I: 30, II: 45, III: 25 },
    exampleFirst: false,
    instructionSymbols: false,
    scaffolding: 'mittel',
    selfAssessment: 'kompetenzraster',
    formats: 'Schwerpunkt Anforderungsbereich II, Lösungsbeispiele nur noch teilweise (Fading), Fachsprache gezielt aufbauen (Wortliste, Satzmuster)'
  },
  {
    id: 'k910',
    label: 'Klasse 9–10',
    grades: [9, 10],
    typography: { fontPt: 11.5, lineHeight: 1.15 },
    language: { avgSentenceWords: 16, maxSentenceWords: 22, lixMax: 50 },
    tasksPerPage: [3, 5],
    minutesPerTask: [15, 25],
    afbMix: { I: 25, II: 50, III: 25 },
    exampleFirst: false,
    instructionSymbols: false,
    scaffolding: 'gering',
    selfAssessment: 'kompetenzraster',
    formats: 'offenere, problemorientierte Aufgaben, Operatoren wie in Abschlussprüfungen, Hilfen nur optional'
  },
  {
    id: 'sek2',
    label: 'Oberstufe',
    grades: [11, 13],
    typography: { fontPt: 11, lineHeight: 1.15 },
    language: { avgSentenceWords: 18, maxSentenceWords: 25, lixMax: 60 },
    tasksPerPage: [2, 4],
    minutesPerTask: [20, 45],
    afbMix: { I: 25, II: 45, III: 30 },
    exampleFirst: false,
    instructionSymbols: false,
    scaffolding: 'gering',
    selfAssessment: 'erwartungshorizont',
    formats:
      'materialgestützte Aufgaben, die alle drei Anforderungsbereiche mit Schwerpunkt II abdecken, kaum Schritt-für-Schritt-Anleitungen (Expertise-Reversal-Effekt)'
  }
]

export function ageBandForGrade(grade: number): AgeBand {
  return AGE_BANDS.find((b) => grade >= b.grades[0] && grade <= b.grades[1]) ?? (grade < 1 ? AGE_BANDS[0] : AGE_BANDS[AGE_BANDS.length - 1])
}
