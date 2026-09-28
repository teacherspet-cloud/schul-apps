/**
 * Datenmodell der Lernzielkontrolle.
 *
 * Der Test benutzt dieselben Bausteine wie das Arbeitsblatt (`WsBlock`), damit Darstellung,
 * Seitenumbruch, Druck und Word-Export wiederverwendet werden – wie bei Klassenarbeit und
 * Grammatiktest auch.
 *
 * DREI DINGE UNTERSCHEIDEN IHN von allen anderen Programmen:
 *
 * 1. Er trägt ein LANDESFORMAT. „Lernzielkontrolle" ist kein bundesweiter Begriff: In Bayern
 *    heißt das Format Stegreifaufgabe oder Kurzarbeit, in Baden-Württemberg schriftliche
 *    Wiederholungsarbeit, in Berlin Kurzkontrolle. In Niedersachsen ist „schriftliche
 *    Lernkontrolle" sogar die Klassenarbeit. Das Format bestimmt Name, Höchstdauer,
 *    Ankündigungspflicht und Stoffgrenze.
 *
 * 2. Er enthält NUR Aufgaben und Material. Keine Lernziele, keine Merkkästen, keine
 *    Tippkarten – siehe `didactics/bausteine.ts`. Das ist der schärfste Unterschied zum
 *    Arbeitsblatt.
 *
 * 3. Er kennt die STUFE getrennt vom Jahrgang. Die Operatorenlisten der Länder sind fast
 *    alle Abiturdokumente; für eine Lernzielkontrolle in Klasse 7 gilt eine andere
 *    Grundlage als für dieselbe Aufgabe in Klasse 12.
 */
import type { DesignTemplate } from '@shared/design'
import type { AiProviderId } from '@shared/types'
import type { CourseLevel } from '../../arbeitsblatt/didactics/schoolProfiles'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import type { Bewertungseinstellung } from '../didactics/bewertung'
import type { Nachteilsausgleich } from '../didactics/bausteine'
import type { Stufe } from '../didactics/operatoren'
import type { StoffQuelle } from '../../../shared/files/stoffQuelle'

/**
 * Eine hineingezogene Datei als Beleg dafür, was im Unterricht behandelt wurde.
 * Der Typ steht seit 25.09.2026 in shared/files/stoffQuelle.ts – auch die Klassenarbeit nutzt ihn.
 */
export type { StoffQuelle }

export interface KurztestMeta {
  /** KI-Kennzeichnung (Großprogramm 0.4): welche KI mitgewirkt hat – gesetzt beim Ablegen eines KI-Ergebnisses */
  ki?: import('@shared/kiKennzeichnung').KiHerkunft
  /** Sichtbarer KI-Vermerk: nur im Lösungsteil, überall oder aus (fehlt = Einstellung der App) */
  kiVermerk?: import('@shared/kiKennzeichnung').KiVermerk
  /**
   * „Farbe der Vorlage verwenden" (Paket 10a): true = die Akzentfarbe der Designvorlage statt
   * der Fachfarbe aus den Einstellungen. Fehlt = Fachfarbe.
   */
  vorlagenfarbe?: boolean
  /** Überthema im Kopf (Paket 11, shared/ueberthema.ts): eigener Eintrag; leer = der Themenbereich */
  ueberthema?: string
  /** true = kein Überthema auf diesem Material */
  ueberthemaAus?: boolean
  /** Blattoptionen wie beim Arbeitsblatt (27.09.2026): Schulangaben, Ränder, KI-Test */
  showSchool?: boolean
  correctionMargin?: boolean
  notesMargin?: boolean
  aiCanary?: boolean
  aiCanaryWords?: string
  subjectId: string
  subjectLabel: string

  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  grade: number
  courseLevel?: CourseLevel
  /**
   * Sekundarstufe I oder II.
   *
   * Wird aus dem Jahrgang vorbelegt, ist aber überschreibbar: In den Ländern mit
   * sechsjähriger Grundschule und in der gymnasialen Oberstufe liegt die Grenze anders,
   * und die Lehrkraft weiß, welche Operatorengrundlage für ihre Gruppe gilt.
   */
  stufe: Stufe

  /** Kennung aus KURZTEST_FORMATE – bestimmt Bezeichnung, Höchstdauer und Ankündigung */
  formatId: string
  /** Die Bezeichnung, die auf dem Blatt steht (aus dem Format vorbelegt, änderbar) */
  bezeichnung: string

  title: string
  thema: string
  /**
   * Was im Unterricht unmittelbar vorher behandelt wurde.
   *
   * Nicht Zierde, sondern die rechtliche Grenze des Formats: Bayern lässt für die
   * Stegreifaufgabe höchstens zwei, für die Kurzarbeit höchstens zehn vorangegangene
   * Unterrichtsstunden zu, Rheinland-Pfalz höchstens zehn.
   */
  stoff: string
  /**
   * Tafelbilder, Buchseiten, Hefteinträge – was im Unterricht tatsächlich dran war.
   *
   * Eine getippte Stoffangabe bleibt notgedrungen grob („Potenzgesetze"). Ein abfotografiertes
   * Tafelbild zeigt dagegen genau die Schreibweise, die Beispiele und die Reihenfolge, die die
   * Klasse kennt – und darauf kommt es bei einem Kurztest an, der sich auf die letzten zwei
   * Unterrichtsstunden beschränken muss.
   */
  stoffQuellen: StoffQuelle[]
  minutes: number

  /**
   * Operatoren, die die Lehrkraft für diesen Test BEVORZUGT sehen möchte.
   *
   * Leer = die KI wählt aus der Landesliste frei. Steht etwas drin, sind es Vorschläge, kein
   * Zwang: Manche Aufgabenformen verlangen einen bestimmten Operator („Ordne zu" bei einer
   * Zuordnung), und eine erzwungene Auswahl führte sonst zu Aufgaben, deren Operator nicht
   * zur Antwortform passt – genau der Fehler, den die App sonst meldet.
   */
  bevorzugteOperatoren: string[]

  /** 1 = eine Fassung, 2 = A/B, 3 = A/B/C */
  varianten: number

  nachteilsausgleich: Nachteilsausgleich
  bewertung: Bewertungseinstellung

  /** Lösungsblatt für die Lehrkraft erzeugen */
  answerKey: boolean
  /** Kopfzeile mit Name, Klasse, Datum */
  nameFeld: boolean

  provider?: AiProviderId
  model?: string
}

export interface KurztestVariante {
  id: string
  /** „A", „B", „C" – bei einer einzigen Fassung leer */
  label: string
  blocks: WsBlock[]
}

export interface Kurztest {
  version: 1
  meta: KurztestMeta
  design: DesignTemplate
  varianten: KurztestVariante[]
  createdAt: string
}

/** Alle Aufgaben über alle Varianten – für Prüfungen, die das ganze Blatt betreffen. */
export const alleBloecke = (test: Kurztest): WsBlock[] => test.varianten.flatMap((v) => v.blocks)

/** Die Buchstaben der Varianten. */
export const variantenLabel = (index: number, gesamt: number): string => (gesamt < 2 ? '' : String.fromCharCode(65 + index))
