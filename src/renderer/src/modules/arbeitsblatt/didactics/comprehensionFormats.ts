/**
 * Aufgabenformate für Hör-/Hörsehverstehen und Leseverstehen in den Fremdsprachen.
 *
 * Belegt aus den KMK-Bildungsstandards erste Fremdsprache (MSA 2003) und fortgeführte
 * Fremdsprache (Abitur 2012, mit illustrierenden Prüfungsaufgaben), dem Kernlehrplan Englisch
 * Gymnasium NRW (2019) samt den Empfehlungen der Fachaufsicht (2020) sowie dem Kerncurriculum
 * Englisch Niedersachsen (Tabellen „Mögliche Überprüfungsformate“).
 *
 * Zwei Regeln gelten formatübergreifend und stehen deshalb hier zentral:
 * - Bei isolierter Überprüfung von Hör- und Leseverstehen wird nur geprüft, ob die Lösung das
 *   richtige Verständnis nachweist; sprachliche Verstöße werden nicht gewertet.
 * - Die Items folgen der Reihenfolge des Textes, und die Formate müssen im Unterricht
 *   eingeführt worden sein.
 */
import type { AnswerKind } from '../model/types'

export type ComprehensionSkill = 'listening' | 'reading'

export interface ComprehensionFormat {
  id: string
  /** Für welche Kompetenz das Format belegt ist */
  skills: ComprehensionSkill[]
  label: string
  /** Bezeichnung in den Aufgabenbeispielen */
  english: string
  openness: 'geschlossen' | 'halboffen'
  /** Wofür das Format geeignet ist */
  purpose: string
  grades: [number, number]
  /** Antwortform, mit der die App die Aufgabe baut */
  answerKind: AnswerKind
  /** Hinweise zur Konstruktion (gehen in den KI-Auftrag ein) */
  construction: string
  /**
   * Wortlaut der EINZELNEN Frage bzw. der Arbeitsanweisung – Musterformulierungen aus
   * echten Prüfungsmaterialien (KMK 2003/2012, Operatorenliste NRW, Jahrgangsstufentests
   * ISB Bayern). Ohne sie schrieb die KI zu jedem Format denselben Anweisungssatz.
   */
  stem: string
  /** Punktvergabe */
  scoring: string
}

export const COMPREHENSION_FORMATS: ComprehensionFormat[] = [
  {
    id: 'multiple-choice',
    skills: ['listening', 'reading'],
    label: 'Auswahlantworten (Multiple Choice)',
    english: 'multiple choice',
    openness: 'geschlossen',
    purpose: 'Hauptaussagen und Detailinformationen',
    grades: [5, 13],
    answerKind: 'multipleChoice',
    construction:
      'Drei bis vier Optionen je Item, die Items folgen der Reihenfolge des Textes; die Ablenker sind bei genauem Verständnis klar zu verwerfen, bei oberflächlichem Lesen aber plausibel.',
    stem: 'Arbeitsanweisung: „Tick (✓) the correct answer." Jedes Item ist eine vollständige FRAGE mit Fragezeichen („What is the writer trying to do in this text?", KMK 2003) oder ein Satzanfang, dessen Lücke am ENDE steht und an den alle Möglichkeiten grammatisch anschließen („Amelia wants to go to Bristol because …", ISB Bayern Jgst. 6).',
    scoring: 'ein Punkt je Item'
  },
  {
    id: 'true-false',
    /*
     * NUR Hörverstehen – im Leseverstehen ist der Textbeleg Bedingung (siehe
     * 'true-false-evidence'). Belegt: MSB/QUA-LiS NRW, Unterrichtsvorgaben ZP10 Englisch
     * 2027, Abschnitt 1.5, nennt als Leseverstehensformat ausdrücklich
     * „Richtig-/Falsch-Aufgaben MIT BEGRÜNDUNG" – für MSA, Gymnasium und EESA gleichermaßen.
     * Ohne Beleg lässt sich bei zwei Möglichkeiten nicht unterscheiden, ob verstanden oder
     * geraten wurde.
     *
     * Beim HÖRverstehen gilt in NRW das Gegenteil: Dort sind richtig/falsch UND
     * Begründungsformate für die Leistungsüberprüfung ausgeschlossen (Konstruktionshinweise
     * GOSt, Okt. 2025, S. 13). Weil der Hörtext flüchtig ist, wäre ein Zitat eine
     * Gedächtnisleistung. Die App bietet das Format hier weiterhin an – für den Unterricht
     * ist es laut derselben Stelle ausdrücklich geeignet –, und `listeningStates.ts` hält
     * fest, welche Länder es in der Leistungsmessung ausschließen.
     */
    skills: ['listening'],
    label: 'Richtig / Falsch',
    english: 'right / wrong',
    openness: 'geschlossen',
    purpose: 'Detailverstehen, besonders in Gesprächen',
    grades: [5, 10],
    answerKind: 'trueFalse',
    construction: 'Die Aussagen sind in der Regel paraphrasiert (ab Stufe 2); eine wörtlich übernommene Aussage ist bewusst sehr leicht (Stufe 1) und wird so ausgewiesen.',
    stem: 'Arbeitsanweisung: „True or false? Tick (✓) the correct box." Jede Aussage ist ein vollständiger Aussagesatz in der 3. Person, positiv formuliert und in der Regel paraphrasiert – nie eine Frage; der Wortlaut des Textes nur bei ausgewiesener Stufe 1.',
    scoring: 'ein Punkt je Item'
  },
  {
    id: 'true-false-evidence',
    skills: ['reading'],
    label: 'Richtig / Falsch mit Textbeleg',
    english: 'giving evidence from the text',
    openness: 'halboffen',
    purpose: 'Detailverstehen mit Nachweis am Text',
    // ab Klasse 5, seit der Beleg im Leseverstehen durchgängig verlangt wird
    grades: [5, 13],
    answerKind: 'tableFill',
    construction:
      'Tabelle mit den Spalten Aussage, richtig/falsch und Textbeleg. Der Beleg ist ein KURZES WÖRTLICHES ZITAT aus dem Text, Auslassungen mit […]; eine bloße Zeilenangabe zählt NICHT. Zwischen Aussage und Textstelle besteht bewusst keine wörtliche Übereinstimmung.',
    stem: 'Arbeitsanweisung (NRW-Operatorenliste Englisch, ZP10): „Tick the correct box and give one piece of evidence by quoting short passages from the text." Die Aussage selbst enthält keine Zeilenangabe.',
    scoring: 'zwei Punkte je Item – NUR für die richtige Kombination aus Ankreuzen UND zutreffendem Zitat. Keine Teilpunkte: entweder 0 oder 2.'
  },
  {
    id: 'true-false-not-in-text',
    skills: ['reading'],
    label: 'Richtig / Falsch / Nicht im Text',
    english: 'not in the text',
    openness: 'geschlossen',
    purpose: 'Detailverstehen; trennt Textaussage von Weltwissen und verhindert Raten',
    grades: [8, 13],
    answerKind: 'tableFill',
    construction:
      'Drei Spalten zum Ankreuzen, dazu eine Spalte für den Textbeleg. Für die Items, deren Lösung „nicht im Text" ist, gibt es KEINE Belegzeile – zu einer Aussage, die nicht im Text steht, kann es kein Zitat geben.',
    stem: 'Arbeitsanweisung: „Tick the correct box. For right and wrong, give one piece of evidence by quoting from the text." Die Aussagen zu „not in the text" sind plausibel und thematisch passend – sonst sind sie schon ohne Text als Fremdkörper erkennbar.',
    scoring:
      'zwei Punkte je Item. Bei richtig/falsch ist das Zitat Bedingung (ohne Zitat 0 Punkte); bei „nicht im Text" genügt das Ankreuzen für die vollen zwei Punkte (KMK 2012, Bewertungsvorschlag S. 124).'
  },
  {
    id: 'matching-headings',
    skills: ['reading'],
    label: 'Zuordnung: Überschriften oder Schlüsselaussagen zu Abschnitten',
    english: 'matching',
    openness: 'geschlossen',
    purpose: 'Hauptaussagen auf Abschnittsebene, mit Abstraktionsleistung',
    grades: [7, 13],
    answerKind: 'matching',
    construction: 'Deutlich mehr Optionen als Lösungen (drei bis fünf überzählige); die Optionen paraphrasieren den Kerngedanken des Abschnitts.',
    stem: 'Arbeitsanweisung: „Match each paragraph with the correct heading. There is one more heading than you need." Jede Überschrift ist eine kurze Nominalphrase (höchstens sechs Wörter), keine Frage.',
    scoring: 'ein Punkt je richtige Zuordnung'
  },
  {
    id: 'matching-speakers',
    skills: ['listening'],
    label: 'Zuordnung: Sprecher oder Personen zu Aussagen',
    english: 'matching',
    openness: 'geschlossen',
    purpose: 'Hauptaussagen und Adressatenbezüge',
    grades: [6, 13],
    answerKind: 'matching',
    construction: 'Mehr Aussagen als Sprecher (überzählige Optionen); bei zweischrittigen Aufgaben erst die Personen identifizieren, dann zuordnen.',
    stem: 'Arbeitsanweisung: „Match each speaker with the correct statement. There is one more statement than you need." Die Aussagen stehen in der 3. Person und sind gleich lang gebaut.',
    scoring: 'ein Punkt je Zuordnung; bei Identifizierung plus Zuordnung zwei Punkte, ohne richtige Zuordnung null'
  },
  {
    id: 'matching-criteria',
    skills: ['reading'],
    label: 'Informationen nach vorgegebenen Kriterien auswerten und zuordnen',
    english: 'matching',
    openness: 'geschlossen',
    purpose: 'suchendes Lesen in mehreren kurzen Sachtexten',
    grades: [5, 10],
    answerKind: 'matching',
    construction: 'Personenprofile oder Suchkriterien werden kurzen Anzeigen, Klappentexten oder Angeboten zugeordnet; mehrere überzählige Angebote.',
    stem: 'Arbeitsanweisung nach dem Muster der KMK 2003: „The people below all want to buy a book. Decide which books (letters A–H) would be the most suitable for each person (numbers 1–5)." Die Bedarfsbeschreibungen sind Aussagesätze, keine Fragen.',
    scoring: 'ein Punkt je Zuordnung'
  },
  {
    id: 'gap-filling',
    skills: ['listening', 'reading'],
    label: 'Lückentext / Einsetzaufgabe',
    english: 'gap filling',
    openness: 'halboffen',
    purpose: 'selektives Verstehen einzelner Fakten (Zahlen, Namen, Uhrzeiten)',
    grades: [5, 13],
    answerKind: 'gapText',
    construction: 'Vorstrukturierte Notiz mit nummerierten Lücken; die Antworten sind Einzelwörter oder Zahlen, damit Lese- und Schreibanteil klein bleiben.',
    stem: 'Arbeitsanweisung: „Fill in the missing information using 1 to 5 words." Die Höchstzahl der Wörter wird IMMER genannt. Keine Lücke am Satzanfang, keine Lücke in einer Kurzform, höchstens eine Lücke je Satz.',
    scoring: 'ein Punkt je Lücke; Rechtschreibung wird nicht gewertet'
  },
  {
    id: 'notes-table',
    skills: ['listening', 'reading'],
    label: 'Notizen in Tabelle oder Raster ausfüllen',
    english: 'fill in the table, key phrases',
    openness: 'halboffen',
    purpose: 'Detailverstehen und Strukturieren mehrerer Informationen',
    grades: [5, 13],
    answerKind: 'tableFill',
    construction: 'Rubriken mit ausdrücklicher Mengenangabe („nenne vier Beispiele“); Stichworte genügen, Wortlaut oder Paraphrase sind gleichwertig.',
    stem: 'Arbeitsanweisung: „While listening, fill in the table below, using key phrases." (KMK 2012) Die Rubriken sind knappe Nominalphrasen wie „Dates:", „Place:", „Opening hours:" – keine ganzen Fragen.',
    scoring: 'ein Punkt je gefordertes Beispiel'
  },
  {
    id: 'sentence-completion',
    skills: ['reading'],
    label: 'Sätze vervollständigen / Textergänzung',
    english: 'sentence completion',
    openness: 'halboffen',
    purpose: 'Detailverstehen, Übergang zu offenen Formaten',
    grades: [6, 13],
    answerKind: 'gapText',
    construction: 'Satzanfänge werden aus dem Text heraus sinngemäß ergänzt, nicht abgeschrieben.',
    stem: 'Arbeitsanweisung: „Complete the statements according to the text." (KMK 2003) Der Satzanfang trägt die Information, die Lücke steht am Ende, z. B. „On the evening of the party Andy has no time for a shower, so he …".',
    scoring: 'ein Punkt je Satz'
  },
  {
    id: 'short-answers',
    skills: ['listening', 'reading'],
    label: 'Halboffene Kurzantworten',
    english: 'short answers',
    openness: 'halboffen',
    purpose: 'Detailverstehen, wo Auswahloptionen die Lösung verraten würden',
    grades: [6, 13],
    answerKind: 'lines',
    construction: 'Ein bis zwei Sätze je Antwort, in der Zielsprache; keine vollständige Textwiedergabe verlangen.',
    stem: 'Arbeitsanweisung mit Mengenangabe: „Give two examples.", „Give three reasons why …", „Answer in note form." (ISB Bayern; Operatorenliste NRW) Antworttyp und Höchstlänge stehen immer dabei.',
    scoring: 'ein Punkt je Antwort; nur der Inhalt wird bewertet'
  },
  {
    id: 'short-answers-evidence',
    skills: ['reading'],
    label: 'Kurzantwort mit Textbeleg',
    english: 'identification and reference',
    openness: 'halboffen',
    purpose: 'Detailverstehen und erschließendes Lesen',
    grades: [9, 13],
    answerKind: 'tableFill',
    construction: 'Tabelle mit Antwort und Zeilenangabe als Beleg.',
    stem: 'Wie Kurzantwort, zusätzlich „Give the line numbers." Die Frage selbst bleibt kurz; der Beleg wird getrennt verlangt.',
    scoring: 'zwei Punkte je Item; ohne Beleg null Punkte'
  },
  {
    id: 'sequencing',
    skills: ['listening', 'reading'],
    label: 'Reihenfolge herstellen',
    english: 'sequencing',
    openness: 'geschlossen',
    purpose: 'Verstehen der Chronologie und des Aufbaus',
    grades: [6, 10],
    answerKind: 'ordering',
    construction: 'Fünf bis acht Ereignisse oder Abschnitte, die in die richtige Reihenfolge gebracht werden.',
    stem: 'Arbeitsanweisung: „Put the events in the correct order (1–6). The first one is done for you." Die Ereignisse sind gleich gebaute Kurzsätze in einer einheitlichen Zeitform.',
    scoring: 'ein Punkt je richtige Position oder Gesamtpunkte für die vollständige Reihenfolge'
  },
  {
    id: 'mindmap',
    skills: ['reading'],
    label: 'Mindmap / Word web anlegen',
    english: 'mind map, word web',
    openness: 'halboffen',
    purpose: 'Global- und Strukturverstehen',
    grades: [5, 9],
    answerKind: 'space',
    construction: 'Vorgegebener Mittelpunkt und benannte Äste, die aus dem Text gefüllt werden.',
    stem: 'Arbeitsanweisung: „Complete the word web with information from the text." Die Äste tragen benannte Oberbegriffe, keine Fragen.',
    scoring: 'Punkte nach Zahl der geforderten Einträge'
  }
]

export const comprehensionFormatsFor = (skill: ComprehensionSkill, grade: number): ComprehensionFormat[] =>
  COMPREHENSION_FORMATS.filter((f) => f.skills.includes(skill) && grade + 1 >= f.grades[0] && grade - 1 <= f.grades[1])

export const comprehensionFormatById = (id: string): ComprehensionFormat | undefined => COMPREHENSION_FORMATS.find((f) => f.id === id)

/**
 * Voreinstellung nach Jahrgang: In Klasse 5–6 überwiegen geschlossene Formate mit wenig
 * Schreibanteil, ab Klasse 7 kommen halboffene dazu, und zum Ende der Sekundarstufe I
 * überwiegen die offeneren Formate.
 */
export function defaultComprehensionFormats(skill: ComprehensionSkill, grade: number): string[] {
  if (skill === 'listening') {
    if (grade <= 6) return ['multiple-choice', 'true-false', 'gap-filling']
    if (grade <= 8) return ['multiple-choice', 'notes-table', 'matching-speakers']
    return ['notes-table', 'matching-speakers', 'short-answers']
  }
  /*
   * Auch in Klasse 5/6 mit Beleg: Ausdrückliche Vorgabe der Lehrkraft, dass richtig/falsch
   * im Leseverstehen IMMER einen Beleg verlangt. Eine Quelle, die den Beleg unterhalb einer
   * Jahrgangsstufe ausschließt, gibt es nicht – DELF verlangt ihn schon auf A2, und die
   * NRW-Vorgaben gelten für alle Schulformen einschließlich des Hauptschulabschlusses.
   */
  if (grade <= 6) return ['multiple-choice', 'true-false-evidence', 'matching-criteria']
  if (grade <= 8) return ['multiple-choice', 'true-false-evidence', 'sequencing']
  if (grade <= 10) return ['matching-headings', 'true-false-evidence', 'short-answers']
  return ['matching-headings', 'true-false-not-in-text', 'short-answers-evidence']
}
