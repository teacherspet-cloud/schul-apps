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
  /**
   * Schreibraum der Lernenden (02.10.2026) – Grundlage der Antwortflächen (didactics/schreibraum.ts).
   * Befund der Lehrkraft: Ausfüllzellen und Antwortfelder waren für Notizen oft viel zu klein.
   * Alle drei Werte sind Faustregeln aus Recherche 02.10.2026 (Buchstabenbreite der Handschrift,
   * Linien je ausformuliertem Satz, Linien für eine Begründung); belegt ist nur die Lineatur
   * (siehe `linienAbstandMm`).
   */
  schreibraum: { mmProBuchstabe: number; zeilenProSatz: number; begruendungZeilen: number }
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
      'überwiegend geschlossene Formate (ankreuzen, verbinden, einkreisen, Bild-Wort-Zuordnung), jeweils mit gelöstem Beispiel als erstem Item, sehr wenig Text, viele Bilder',
    schreibraum: { mmProBuchstabe: 4.5, zeilenProSatz: 2, begruendungZeilen: 3 }
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
      'geschlossene und halboffene Formate, erste offene Aufgaben; neue Operatoren (beschreibe, vergleiche, begründe) immer mit Satzanfang; Beispiel-Item und Wortspeicher',
    schreibraum: { mmProBuchstabe: 4.5, zeilenProSatz: 2, begruendungZeilen: 4 }
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
    formats: 'Operatoren fett, nummerierte Teilschritte, Fachbegriffe beim ersten Auftreten erklären, eine Transfer- oder Knobelaufgabe, gestufte Tippkarten',
    schreibraum: { mmProBuchstabe: 3.25, zeilenProSatz: 1.5, begruendungZeilen: 4 }
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
    formats: 'Schwerpunkt Anforderungsbereich II, Lösungsbeispiele nur noch teilweise (Fading), Fachsprache gezielt aufbauen (Wortliste, Satzmuster)',
    schreibraum: { mmProBuchstabe: 3.25, zeilenProSatz: 1.5, begruendungZeilen: 5 }
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
    formats: 'offenere, problemorientierte Aufgaben, Operatoren wie in Abschlussprüfungen, Hilfen nur optional',
    schreibraum: { mmProBuchstabe: 3.25, zeilenProSatz: 1.5, begruendungZeilen: 5 }
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
      'materialgestützte Aufgaben, die alle drei Anforderungsbereiche mit Schwerpunkt II abdecken, kaum Schritt-für-Schritt-Anleitungen (Expertise-Reversal-Effekt)',
    schreibraum: { mmProBuchstabe: 2.75, zeilenProSatz: 1.25, begruendungZeilen: 6 }
  }
]

export function ageBandForGrade(grade: number): AgeBand {
  return AGE_BANDS.find((b) => grade >= b.grades[0] && grade <= b.grades[1]) ?? (grade < 1 ? AGE_BANDS[0] : AGE_BANDS[AGE_BANDS.length - 1])
}

/**
 * Linienabstand einer Schreiblinie in mm nach Jahrgang (02.10.2026).
 *
 * Belegt: Lineaturen der Schulhefte – Kl. 1 Lineatur 1 (15-mm-System), Kl. 2 Lineatur 2 (12 mm),
 * Kl. 3 Hilfslinien um 3,5–4 mm, Kl. 4 Lineatur 4/9 (9–10 mm), ab Kl. 5 Lineatur 21/25/27 (9 mm);
 * US „wide ruled" 8,7 mm für Kinder. Leitfäden (zebis 2022, LehrkräftePlus NRW) nennen „zu wenig
 * Platz in Lücken und auf Linien" als Hauptfehler von Arbeitsblättern.
 * Faustregel aus Recherche 02.10.2026: Kl. 1–2 ≥ 15 mm, Kl. 3 12 mm, Kl. 4 10 mm, Kl. 5–6 9,5 mm,
 * Kl. 7–10 9 mm, Oberstufe 8,5 mm (nie unter 7). Mit Förderbedarf (Nachteilsausgleich bei LRS,
 * Förderschule, Leichte Sprache) eine Stufe größer und mindestens 10 mm.
 */
const LINIEN_STUFEN_MM = [15, 12, 10, 9.5, 9, 8.5]

const linienStufe = (grade: number): number => (grade <= 2 ? 0 : grade === 3 ? 1 : grade === 4 ? 2 : grade <= 6 ? 3 : grade <= 10 ? 4 : 5)

export function linienAbstandMm(grade: number, foerder = false): number {
  const stufe = linienStufe(Number.isFinite(grade) ? grade : 7)
  if (!foerder) return LINIEN_STUFEN_MM[stufe]
  return Math.max(10, LINIEN_STUFEN_MM[Math.max(0, stufe - 1)])
}
