/**
 * Rechtliche Rahmenvorgaben für Klassenarbeiten je Bundesland.
 *
 * Belegt aus den amtlichen Vorschriften (Stand der Recherche 18.09.2026):
 * - NRW: APO-S I § 6 mit VV 6.1.1/6.1.2 (BASS 13-21 Nr. 1.1/1.2) und RdErl. BASS 12-63 Nr. 3
 * - Niedersachsen: RdErl. „Die Arbeit in den Schuljahrgängen 5 bis 10 des Gymnasiums“ (1.8.2025,
 *   SVBl. 9/2025 S. 492) und RdErl. „Schriftliche Arbeiten“ (22.3.2012, SVBl. 5/2012 S. 266)
 * - Bayern: GSO §§ 22, 23, 28 (gilt für das Gymnasium)
 * - Baden-Württemberg: Notenbildungsverordnung §§ 7–9
 * - Hessen: VOGSV §§ 28, 32, 33 und Anlage 2 Nr. 7
 *
 * Die Angaben sind Richtwerte für die Planung und ersetzen nicht den Blick in die
 * aktuelle Fassung; bei BW und Hessen lag nur eine ältere Fassung vor.
 */
import { istGesellschaftsfach } from '../model/faecher'
import { gradeScaleLine as sharedGradeScaleLine } from '../../../shared/gradeScale'
import { notenpunkteFuer, punkteZeile } from '../../../shared/notenpunkte'
import { examGrades } from './types'
import type { Exam } from './types'

export interface ExamStateRules {
  stateId: string
  /** Wie die Dauer geregelt ist */
  duration: string
  /** Ankündigungsfrist */
  announce: string
  /** Höchstzahl pro Tag und Woche */
  perDay: number
  perWeek: number
  /** Frist für Korrektur und Rückgabe */
  correction: string
  /** Verhältnis schriftlich zu mündlich */
  weighting: string
  /** Zahl der Arbeiten je Schuljahr in den Kernfächern (Deutsch, Mathematik, Fremdsprachen) */
  mainSubject: string
  /** Zahl der Arbeiten je Schuljahr in den übrigen Fächern (z. B. Geschichte) */
  otherSubject: string
  /** Hinweise, die beim Entwurf zu beachten sind */
  notes: string[]
}

export const EXAM_STATE_RULES: ExamStateRules[] = [
  {
    stateId: 'NI',
    duration: 'Kl. 5–6 in der Regel eine Unterrichtsstunde, ab Kl. 7 höchstens zwei',
    announce: 'in der Regel einige Tage vorher',
    perDay: 1,
    perWeek: 3,
    correction: 'Sek I zwei Wochen, Sek II drei Wochen',
    weighting: 'mündliche und fachspezifische Leistungen wiegen mehr; der schriftliche Anteil darf ein Drittel nicht unterschreiten',
    mainSubject: '3–4 (Regelfall 4)',
    otherSubject: '2 (bei Epochalunterricht 1)',
    notes: [
      'Bis zur Hälfte der schriftlichen Lernkontrollen kann durch andere Formen ersetzt werden.',
      'In den modernen Fremdsprachen ersetzt die Sprechprüfung eine schriftliche Lernkontrolle je Doppeljahrgang.',
      'Verfügen über sprachliche Mittel wird nicht isoliert bewertet – Grammatik nur eingebettet prüfen.'
    ]
  },
  {
    stateId: 'NW',
    duration: 'in Unterrichtsstunden geregelt: Kl. 5–7 meist eine, ab Kl. 8 bis zu zwei, Deutsch Kl. 9/10 bis zu drei',
    announce: 'rechtzeitig vorher',
    perDay: 1,
    perWeek: 2,
    correction: 'drei Wochen; erst danach eine neue Arbeit im selben Fach',
    weighting: '„Schriftliche Arbeiten“ und „Sonstige Leistungen“ werden angemessen berücksichtigt – keine feste Quote',
    mainSubject: 'Kl. 5/6 sechs, danach absteigend 3–6 je nach Jahrgang',
    otherSubject: 'keine',
    notes: [
      'In Geschichte gibt es in der Sekundarstufe I keine Klassenarbeiten – dort zählt nur der Bereich „Sonstige Leistungen“.',
      'Englisch: Schreiben ist Bestandteil JEDER Klassenarbeit, ergänzt um mindestens eine weitere Teilkompetenz.',
      'Sprachmittlung, Hör-/Hörsehverstehen und Leseverstehen je mindestens einmal im Schuljahr.',
      'Die Aufgaben einer Arbeit sollen unter einem gemeinsamen thematischen Dach stehen.',
      'Im letzten Jahr der Sek I wird in Englisch eine Arbeit durch eine mündliche Prüfung ersetzt.',
      'Klassenarbeiten dürfen nicht am Nachmittag geschrieben werden.'
    ]
  },
  {
    stateId: 'BY',
    duration: 'Schulaufgabe Jgst. 5–11 höchstens 60 Minuten, Jgst. 12/13 höchstens 90 Minuten',
    announce: 'spätestens eine Woche vorher',
    perDay: 1,
    perWeek: 2,
    correction: 'nicht ausdrücklich gefristet',
    weighting: 'große zu kleine Leistungsnachweise 1:1 bei zwei Schulaufgaben, sonst 2:1',
    mainSubject: 'Deutsch mind. 3, Mathematik 3–4, Fremdsprachen mind. 3 (ab vier Wochenstunden mind. 4)',
    otherSubject: 'Fächer ohne Schulaufgaben: Note aus kleinen Leistungsnachweisen',
    notes: [
      'Höchstens eine Schulaufgabe je Fach und Schuljahr kann durch ein anderes Format ersetzt werden.',
      'In modernen Fremdsprachen wird in mindestens zwei Jahrgangsstufen eine Schulaufgabe ganz oder teilweise mündlich abgehalten.',
      'Kurzarbeit höchstens 30 Minuten, Stegreifaufgabe höchstens 20 Minuten, Leistungstest höchstens 45 Minuten.'
    ]
  },
  {
    stateId: 'BW',
    duration: 'für Klassenarbeiten nicht geregelt; schriftliche Wiederholungsarbeit in der Regel bis 20 Minuten',
    announce: 'in der Regel anzukündigen',
    perDay: 1,
    perWeek: 3,
    correction: 'keine feste Frist; vor Rückgabe keine neue Arbeit im selben Fach',
    weighting: 'die Fachlehrkraft gibt die Gewichtung zu Beginn des Unterrichts bekannt – keine feste Quote',
    mainSubject: 'Kernfächer mindestens vier',
    otherSubject: 'höchstens vier schriftliche Arbeiten im Schuljahr',
    notes: ['Am Gymnasium ab Klasse 7 ist jede Schülerin und jeder Schüler zu einer gleichwertigen Leistungsfeststellung (GFS) verpflichtet.']
  },
  {
    stateId: 'HE',
    duration: 'für die Mittelstufe nicht geregelt',
    announce: 'mindestens fünf Unterrichtstage vorher, mit inhaltlichem Rahmen',
    perDay: 1,
    perWeek: 3,
    correction: 'in der Regel spätestens nach drei Unterrichtswochen',
    weighting: 'Fächer mit Klassenarbeiten 50 %, übrige Fächer etwa ein Drittel',
    mainSubject: 'Deutsch, Mathematik, 1. Fremdsprache: Kl. 5/6 fünf, Kl. 7–10 je vier',
    otherSubject: 'eine schriftliche Lernkontrolle je Fach und Halbjahr',
    notes: ['Die Note „ausreichend“ ist erreicht, wenn die Erwartungen annähernd zur Hälfte erfüllt sind.']
  }
]

export const stateRules = (stateId: string): ExamStateRules | undefined => EXAM_STATE_RULES.find((r) => r.stateId === stateId)

/**
 * Darf die Arbeit den Lernenden eine Wortzahl vorgeben?
 *
 * In Niedersachsen dürfen in den Fremdsprachen bei Schreib- und Sprachmittlungsaufgaben in
 * KLASSENARBEITEN keine Wortzahlen mehr vorgegeben werden (Angabe der Lehrkraft, 23.09.2026).
 *
 * Die App erzwingt das, statt nur zu warnen: Eine Wortzahl auf dem Blatt ließe sich nach dem
 * Austeilen nicht mehr zurücknehmen, und die Lehrkraft sähe der fertigen Arbeit nicht an,
 * dass hier eine Landesvorgabe verletzt wird. Für ARBEITSBLÄTTER gilt die Regel nicht – dort
 * bleibt die Wortvorgabe eine Entscheidung der Lehrkraft.
 *
 * Der Umfang selbst wird weiter geplant (Schreibraum, Erwartungshorizont); er steht nur
 * nicht auf dem Schülerblatt.
 */
export function wortzahlErlaubt(stateId: string, subjectId: string): boolean {
  return !(stateId === 'NI' && subjectId === 'englisch')
}

/** Warum die Wortzahl nicht vorgegeben werden darf – für die Oberfläche und den KI-Auftrag. */
export const WORTZAHL_GRUND =
  'In Niedersachsen dürfen bei Schreib- und Sprachmittlungsaufgaben in Klassenarbeiten keine Wortzahlen vorgegeben werden. Der geplante Umfang steuert weiterhin Schreibraum und Erwartungshorizont, erscheint aber nicht auf dem Schülerblatt.'

/**
 * Hinweise, die zur geplanten Arbeit passen – z. B. dass Geschichte in NRW in der
 * Sekundarstufe I gar nicht schriftlich geprüft wird.
 */
export function examWarnings(stateId: string, subjectId: string, grade: number, formatIds: string[]): string[] {
  const out: string[] = []
  if (stateId === 'NW' && subjectId === 'geschichte' && grade <= 10) {
    out.push(
      'In Nordrhein-Westfalen sind in Geschichte in der Sekundarstufe I keine Klassenarbeiten vorgesehen; bewertet wird der Bereich „Sonstige Leistungen im Unterricht“. Diese Arbeit eignet sich dort als Lernkontrolle oder Übungsarbeit.'
    )
  }
  if (stateId === 'NW' && subjectId === 'englisch' && !formatIds.includes('en-writing')) {
    out.push('In Nordrhein-Westfalen ist Schreiben Bestandteil jeder Klassenarbeit im Fach Englisch – ein Schreibteil gehört dazu.')
  }
  if (stateId === 'NI' && subjectId === 'englisch' && (formatIds.includes('en-grammar') || formatIds.includes('en-language'))) {
    out.push(
      'In Niedersachsen wird das Verfügen über sprachliche Mittel nicht isoliert bewertet. Die Grammatik wird deshalb eingebettet in eine andere Teilkompetenz geprüft.'
    )
  }
  const rules = stateRules(stateId)
  if (rules && istGesellschaftsfach(subjectId) && rules.otherSubject === 'keine') out.push('')
  return out.filter(Boolean)
}

/**
 * Notenschlüssel als kurze Zeile für den Kopf der ersten Seite.
 * Gerechnet wird in `shared/gradeScale.ts` – derselbe Schlüssel gilt für Grammatiktests.
 */
export function gradeScaleLine(points: number, thresholds?: number[]): string {
  return sharedGradeScaleLine(points, thresholds)
}

/**
 * Die Schlüsselzeile für DIESE Arbeit: in der Sekundarstufe II Notenpunkte 0–15 nach dem
 * Raster des Landes (26.09.2026), sonst der Notenschlüssel 1–6 der Lehrkraft.
 */
export function scaleLineFuer(meta: { grade: number; schoolTypeId: string; stateId: string; gradeScaleThresholds?: number[] }, points: number): string {
  const regel = notenpunkteFuer(meta)
  return regel ? punkteZeile(points, regel.schwellen) : sharedGradeScaleLine(points, meta.gradeScaleThresholds)
}

/**
 * Teile, für die ein Notenschlüssel etwas aussagt.
 *
 * Nur Teile, die über PUNKTE bewertet werden. Bekommt die Schreibkompetenz eine eigene
 * Teilnote – der Regelfall im Fach Englisch in Niedersachsen –, gilt dort kein Punkteschlüssel,
 * sondern eine Beurteilung nach Inhalt und Sprache.
 */
export function gradeScaleGroups(exam: Exam): { label: string; points: number }[] {
  const grades = examGrades(exam)
  if (!exam.meta.separateWritingGrade) {
    const points = grades.reduce((n, g) => n + g.points, 0)
    return points > 0 ? [{ label: '', points }] : []
  }
  return grades.filter((g) => g.group !== 'writing' && g.points > 0).map((g) => ({ label: g.label, points: g.points }))
}
