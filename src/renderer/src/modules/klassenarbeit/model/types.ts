/**
 * Datenmodell für Klassenarbeiten.
 *
 * Eine Klassenarbeit besteht aus mehreren Teilen (z. B. Leseverstehen, Sprachmittlung, Schreiben
 * bzw. Quellenanalyse und Urteilsaufgabe). Jeder Teil hat ein Aufgabenformat aus dem Katalog,
 * eine Punktzahl und eine Zeitplanung; die Aufgaben selbst sind dieselben Bausteine wie im
 * Arbeitsblatt, damit Darstellung, Seitenumbruch und Export wiederverwendet werden können.
 */
import type { DesignTemplate } from '@shared/design'
import type { AiProviderId, CefrLevel } from '@shared/types'
import type { AfbMix } from '../../arbeitsblatt/didactics/ageBands'
import type { CourseLevel } from '../../arbeitsblatt/didactics/schoolProfiles'
import type { BilingualVorgaben, WsBlock } from '../../arbeitsblatt/model/types'
import type { KnownVocab } from '../../../shared/knownVocab'
import type { StoffQuelle } from '../../../shared/files/stoffQuelle'

/** Fächer, die das Modul zunächst abdeckt */
export type ExamSubjectId = 'englisch' | 'geschichte'

/**
 * Welcher Note ein Teil zugerechnet wird.
 * In Niedersachsen erhält der Schreibteil eine eigenständige Note; die übrigen geprüften
 * Kompetenzen ergeben zusammen die zweite Note.
 */
export type GradeGroup = 'writing' | 'other'

/**
 * Ausführlichkeit des Erwartungshorizonts:
 * kurz = Stichpunkte der erwarteten Inhalte,
 * ausfuehrlich = vollständig ausformulierte Musterlösung,
 * raster = Musterlösung plus Bewertungsraster mit Punkten je Kriterium
 *          (bei Schreiben und Sprachmittlung getrennt nach Inhalt und Sprache).
 */
export type AnswerKeyDetail = 'kurz' | 'ausfuehrlich' | 'raster'

export const ANSWER_KEY_DETAILS: { value: AnswerKeyDetail; label: string; description: string }[] = [
  { value: 'kurz', label: 'Knapp', description: 'Stichpunkte der erwarteten Inhalte je Aufgabe.' },
  { value: 'ausfuehrlich', label: 'Ausformuliert', description: 'Vollständige Musterlösung, wie sie eine gute Arbeit enthielte.' },
  {
    value: 'raster',
    label: 'Mit Bewertungsraster',
    description: 'Musterlösung und Raster mit Punkten je Kriterium – bei Schreiben und Sprachmittlung getrennt nach Inhalt und Sprache.'
  }
]

/** Geplanter Teil einer Arbeit (ein Aufgabenformat aus dem Katalog) */
export interface ExamPart {
  id: string
  /** Kennung aus dem Formatkatalog (formats.ts) */
  formatId: string
  /** Überschrift auf der Arbeit, z. B. „Part 1: Reading comprehension“ */
  label: string
  /** Kompetenzbereich, der geprüft wird */
  competence: string
  /** Anteil an der ganzen Arbeit in Prozent */
  weight: number
  /** aus dem Anteil errechnete Punktzahl */
  points: number
  minutes: number
  /** Note, zu der dieser Teil zählt */
  gradeGroup: GradeGroup
  /**
   * Produktive Teile (Schreiben, Sprachmittlung) werden in Inhalt und Sprache geteilt:
   * üblich sind 40 % Inhalt und 60 % Sprache. Leer bei rezeptiven Teilen.
   */
  contentShare?: number
  /** Verteilung der Anforderungsbereiche in diesem Teil */
  afbMix: AfbMix
  /** Hör-/Leseverstehen: gewählte Aufgabenformate (ids aus comprehensionFormats.ts) */
  formats?: string[]
  /**
   * Hör-/Leseverstehen: Zahl der abgefragten Items (0 oder fehlend = nach Niveau).
   *
   * Bei rezeptiven Teilen zählt ein Item einen Punkt – deshalb bestimmt diese Zahl zugleich
   * die Punktzahl des Teils. Das ist Prüfungspraxis: Ein Item ist die kleinste bewertete
   * Einheit, und Teilpunkte auf ein Ankreuzitter zu verteilen ergibt keinen Sinn.
   */
  items?: number
  /**
   * Nähere Vorgaben der Lehrkraft für diesen Teil, frei formuliert –
   * z. B. „Der Text handelt von einem Schüleraustausch" oder „Aufgabe zum past perfect".
   */
  notes?: string
  /** Produktive Teile: Textsorte, in der die Lernenden schreiben ('' = die KI wählt passend) */
  studentTextType?: string
  /** Material und Aufgaben des Teils – bei mehreren Fassungen die der Fassung A */
  blocks: WsBlock[]
  /**
   * Bausteine der weiteren Fassungen: [0] = Fassung B, [1] = Fassung C.
   *
   * Fassung A bleibt bewusst in `blocks`. So bleibt jede bis 25.09.2026 gespeicherte Arbeit
   * (eine Fassung) unverändert gültig, und alles, was nur eine Fassung kennt – Hörtexte,
   * Glossar, Bibliotheksübersicht –, arbeitet weiter mit `blocks`. Aufbau, Punkte, Zeit und
   * Anteile des Teils gelten für ALLE Fassungen gleich; nur Material und Aufgaben sind je
   * Fassung verschieden (siehe model/fassungen.ts).
   *
   * Übernommenes Material (derselbe Hörtext, dieselbe Quelle) steht in jeder Fassung mit
   * DERSELBEN id – eine Änderung daran gilt in allen Fassungen.
   */
  weitereFassungen?: WsBlock[][]
}

/** Eine der Arbeit zugeordnete Vokabelliste */
export interface ExamVocab {
  /** id der gespeicherten Liste */
  id: string
  name: string
  /** Wort, Übersetzung, Wortart und der Beispielsatz des Lehrwerks */
  words: { term: string; translation: string; pos?: string; example?: string }[]
  /** Wortschatz früherer Units und Bände – so weit darf die Arbeit sprachlich gehen */
  known?: KnownVocab
}

export interface ExamMeta {
  /**
   * „Farbe der Vorlage verwenden" (Paket 10a): true = die Akzentfarbe der Designvorlage statt
   * der Fachfarbe aus den Einstellungen. Fehlt = Fachfarbe.
   */
  vorlagenfarbe?: boolean
  title: string
  subjectId: ExamSubjectId
  subjectLabel: string
  topic: string
  /** Inhalte der Unterrichtseinheit, auf die sich die Arbeit bezieht */
  content: string
  /** Bilingualer Sachfachunterricht (nur Geschichte) – siehe arbeitsblatt/didactics/bilingual.ts */
  bilingual?: BilingualVorgaben
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  grade: number
  courseLevel: CourseLevel
  /** nur Fremdsprachen */
  cefrLevel: CefrLevel
  /** Grammatikthema, falls die Arbeit einen Grammatikteil enthält */
  grammarTopic: string
  /**
   * Fremdsprachen: zugeordnete Vokabeln, die in der Arbeit vorkommen dürfen.
   * Sie stammen aus den in der App gespeicherten Vokabellisten.
   */
  vocab: ExamVocab[]
  /** Bearbeitungszeit in Minuten */
  minutes: number
  /** Gesamtpunktzahl */
  points: number
  /** Erlaubte Hilfsmittel (z. B. „einsprachiges Wörterbuch“) */
  aids: string
  /**
   * Fremdsprachen: Formulierungshilfen zur Schreibaufgabe auf dem Arbeitsblatt der Arbeit.
   *
   * Standardmäßig AUS. In keiner der eingesehenen amtlichen Abschlussprüfungen (Bayern,
   * Nordrhein-Westfalen, Mecklenburg-Vorpommern) bekommen die Prüflinge Formulierungshilfen.
   * Bayern nimmt aus der Angabe übernommene Wendungen sogar ausdrücklich von der Bewertung
   * der Bandbreite aus („lifting"), Nordrhein-Westfalen verlangt beim Operator *describe*
   * „keine wörtliche Übernahme aus dem Text". Ein Gerüst auf dem Prüfungsblatt mindert also
   * die bewertbare Eigenleistung – deshalb ist es hier eine bewusste Entscheidung der
   * Lehrkraft und keine Voreinstellung.
   */
  writingScaffold?: boolean
  /**
   * Nennt die Arbeit den Lernenden eine Wortzahl?
   *
   * Standardmäßig AUS. In Niedersachsen dürfen in den Fremdsprachen bei Schreib- und
   * Sprachmittlungsaufgaben in Klassenarbeiten überhaupt keine Wortzahlen vorgegeben werden
   * (Angabe der Lehrkraft, 23.09.2026) – dort ist der Schalter gesperrt, siehe
   * `wortzahlErlaubt` in model/examRules.ts.
   *
   * Unabhängig davon wird der Umfang geplant: Er bestimmt Schreibraum und Erwartungshorizont.
   */
  wordLimit?: boolean
  /**
   * Hörverstehen: Die KI schreibt den Hörtext mit; vertont wird er auf Knopfdruck im
   * Reiter „Hörtexte". Nur sinnvoll, wenn eine Stimme (ElevenLabs) eingerichtet ist.
   */
  audioAi?: boolean
  /** Hörtextsorte aus LISTENING_FORMATS („auto" = die KI wählt eine passende) */
  audioFormat?: string
  /** Zahl der Hörtexte im Hörverstehensteil; die Aufgaben stehen nach Hörtext gruppiert */
  audioCount?: number
  /** Gewünschte Spieldauer je Hörtext in Sekunden (0 oder fehlend = nach GER-Niveau) */
  audioSeconds?: number
  /** Stärkere KI nur für den Hörtext: Anbieter und Modell ('' = wie eingestellt) */
  audioProvider?: AiProviderId
  audioModel?: string
  /**
   * Zahl der Fassungen: 1 = eine, 2 = A/B, 3 = A/B/C (gegen Abschreiben).
   *
   * Bis 25.09.2026 war das Feld wirkungslos – es stand im Formular, erzeugt wurde trotzdem
   * nur eine Fassung. Wie sie entstehen, steht in model/fassungen.ts.
   */
  variants: number
  /**
   * Hineingezogene Unterlagen aus dem Unterricht (Tafelbilder, Buchseiten, Arbeitsblätter).
   * Dieselbe Form wie in der Lernzielkontrolle; sie gehen in jede Anfrage der Erzeugung mit.
   */
  materialQuellen?: StoffQuelle[]
  /** Kopfkasten mit Zeit, Hilfsmitteln und Bewertung auf der Arbeit abdrucken */
  infoBox: boolean
  /**
   * Notenschlüssel AUCH auf dem Schülermaterial abdrucken.
   *
   * Standardmäßig aus: Im Erwartungshorizont steht er immer, auf der Arbeit selbst nur, wenn
   * die Lehrkraft es ausdrücklich möchte. Die Arbeit hat bewusst kein Deckblatt – sie beginnt
   * sofort mit dem Kopf und der ersten Aufgabe.
   */
  gradeScale: boolean
  /**
   * Eigene Prozentschwellen für die Noten 1 bis 6.
   * Leer = die Voreinstellung (1 ab 91 %, 2 ab 78 %, 3 ab 64 %, 4 ab 50 %, 5 ab 25 %, 6 ab 0 %).
   */
  gradeScaleThresholds?: number[]
  /** Schreibteil bekommt eine eigenständige Note (Vorgabe in Niedersachsen) */
  separateWritingGrade: boolean
  /** Erwartungshorizont als eigene Seite für die Lehrkraft */
  answerKey: boolean
  /** Wie ausführlich der Erwartungshorizont ausfällt */
  answerKeyDetail: AnswerKeyDetail
  teacherNote: string
}

export interface Exam {
  version: 1
  meta: ExamMeta
  design: DesignTemplate
  parts: ExamPart[]
  createdAt: string
}

/** Punktsumme aller Teile */
export const examPoints = (exam: Exam): number => exam.parts.reduce((n, p) => n + p.points, 0)

/** Geplante Zeit aller Teile */
export const examMinutes = (exam: Exam): number => exam.parts.reduce((n, p) => n + p.minutes, 0)

/** Summe der Anteile in Prozent */
export const examWeight = (exam: Exam): number => exam.parts.reduce((n, p) => n + p.weight, 0)

/** Punkte aus dem Anteil an der Gesamtpunktzahl */
export const pointsFromWeight = (weight: number, total: number): number => Math.round((total * weight) / 100)

/**
 * Verteilt eine Gesamtzahl (Punkte, Minuten) nach den Anteilen auf die Teile, so dass die
 * Summe GENAU stimmt. Einzeln gerundet käme sonst je nach Anteilen ein Punkt zu viel oder
 * zu wenig heraus.
 */
export function distribute(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!sum || !weights.length) return weights.map(() => 0)
  let done = 0
  let acc = 0
  return weights.map((w, i) => {
    acc += w
    const upTo = i === weights.length - 1 ? total : Math.round((total * acc) / sum)
    const value = upTo - done
    done = upTo
    return value
  })
}

/**
 * Die beiden Noten einer Englischarbeit: der Schreibteil für sich und die übrigen
 * Kompetenzen zusammen. Produktive Teile werden zusätzlich in Inhalt und Sprache geteilt.
 */
export function examGrades(exam: Exam): { group: GradeGroup; label: string; weight: number; points: number; content?: number; language?: number }[] {
  const groups: GradeGroup[] = ['other', 'writing']
  return groups
    .map((group) => {
      const parts = exam.parts.filter((p) => p.gradeGroup === group)
      if (!parts.length) return null
      const weight = parts.reduce((n, p) => n + p.weight, 0)
      const points = parts.reduce((n, p) => n + p.points, 0)
      const productive = parts.filter((p) => typeof p.contentShare === 'number')
      // Punkte nur, wenn der Teil überhaupt über Punkte bewertet wird
      const content = productive.length && points > 0 ? Math.round(productive.reduce((n, p) => n + (p.points * (p.contentShare ?? 40)) / 100, 0)) : undefined
      return {
        group,
        label: group === 'writing' ? 'Schreiben' : 'Weitere Kompetenzen',
        weight,
        points,
        content,
        language: content === undefined ? undefined : points - content
      }
    })
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
}
