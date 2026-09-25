import type { DesignTemplate } from '@shared/design'
import type { AiProviderId, CefrLevel, TtsSettings } from '@shared/types'
import type { SourceCitation } from '../../../shared/citation'
import type { BoardField, BoardFormat } from '../didactics/boardDesign'
import type { ImageFunction } from '../didactics/imageDesign'
import type { Afb, AfbMix } from '../didactics/ageBands'
import type { Stars } from '../didactics/differentiation'
import type { LanguageMode } from '../didactics/language'
import type { CourseLevel } from '../didactics/schoolProfiles'
import type { KnownVocab } from '../../../shared/knownVocab'
import type { SubtitleMode, VideoKind, ViewingDuring, ViewingPhase } from '../didactics/videoTasks'
import type { SourceHeader } from '../didactics/sourceHeader'
import type { ZuhoerenMode } from '../didactics/zuhoeren'
import type { Narration } from '../didactics/narration'

export type { Afb, Stars }

export type SocialForm = 'EA' | 'PA' | 'GA' | 'Plenum' | 'Rollenspiel'

export interface ImageRef {
  dataUrl: string
  source: 'openmoji' | 'own' | 'openverse' | 'pixabay' | 'wikimedia' | 'clipart' | 'ai' | 'material'
  /** Fertig formulierter Nachweis (ältere Blätter haben nur diesen) */
  credit?: string
  /** Einzelangaben der Quelle – daraus entsteht der Nachweis im eingestellten Zitierstil */
  citation?: SourceCitation
  /**
   * Auftrag, aus dem ein KI-Bild entstanden ist.
   * Wird mitgespeichert, damit die Lehrkraft offenlegen kann, wie das Bild zustande kam,
   * und damit sich ein missratenes Bild gezielt neu erzeugen lässt.
   */
  aiPrompt?: string
  /**
   * Kennung desselben Motivs über Programme hinweg.
   *
   * Taucht ein Bild auf dem Arbeitsblatt UND in der zugehörigen Abfrage auf, wirkt es als
   * Abrufhilfe – selbst ein rein schmückendes Bild kehrt seine Wirkung dann ins Positive
   * (Schneider, Nebel, Beege & Rey 2020, vier Experimente). Die Kennung erlaubt der
   * Klassenarbeit, das Bild eines Arbeitsblatts zum selben Thema wiederzuverwenden.
   */
  reuseId?: string
}

/**
 * Beschriftung, die direkt an einem Element im Bild sitzt.
 *
 * Der stärkste belegte Hebel der Bildgestaltung auf Papier: Beschriftung am Element statt
 * eines Textabsatzes darunter brachte d = 0,80 im Transfer, gegenüber einer Legende darunter
 * noch d = 0,35 (Johnson & Mayer 2012). Die Gegenform – Ziffern im Bild, deren Bedeutung in
 * einer Liste darunter steht – war für Studierende das am schwersten verständliche Format
 * (Kottmeyer, Van Meter & Cameron 2020).
 *
 * Das Schild ist deckend hinterlegt und über eine Linie mit dem Bildpunkt verbunden: Text
 * unmittelbar auf einem Bild ist schlecht lesbar (DBSV, leserlich.info).
 */
export interface ImageLabel {
  id: string
  /** Was an dieser Stelle steht */
  text: string
  /** Bildpunkt, auf den die Linie zeigt – in Prozent der Bildbreite bzw. -höhe */
  x: number
  y: number
  /** Seite, auf der das Schild neben dem Bildpunkt sitzt */
  side?: 'left' | 'right'
  /** true = auf dem Schülerblatt eine leere Linie, im Lösungsteil der Text */
  blank?: boolean
}

interface BaseBlock {
  id: string
  /**
   * Dieser Baustein beginnt auf einer NEUEN Seite.
   *
   * Gesetzt bei Uebungsklausuren fuer den ersten Materialbaustein: Die Aufgabenstellungen
   * stehen dann vorn auf einer eigenen Seite, das Material auf den folgenden.
   */
  pageBreakBefore?: boolean
  /** Niveau bei „ein Blatt mit ★-Aufgaben" (leer = für alle) */
  stars?: Stars
  /** Hinweise aus Prüfungen, nur im Editor sichtbar */
  warnings?: string[]
  /** Frühere und spätere Entwürfe dieses Bausteins (KI-Überarbeitungen); nur dieser Baustein wechselt */
  versions?: Omit<WsBlock, 'versions' | 'versionIndex'>[]
  /** Angezeigter Entwurf (Index in versions) */
  versionIndex?: number
  /**
   * FREI auf der Seite platziert – der Baustein wurde mit der Hand dorthin gezogen.
   *
   * Er verlässt damit den automatischen Satz: Er schiebt nichts mehr weiter, wandert bei
   * einem Seitenumbruch nicht mit und kann anderen Inhalt überdecken. Genau das ist der
   * Sinn („frei"), aber es ist auch der Preis – deshalb gilt es immer nur für den EINEN
   * gezogenen Baustein. Alles übrige bricht weiter von selbst um, und die Prüfungen
   * (Zeilenlänge, Aufgaben je Seite, Anforderungsbereiche) bleiben in Kraft.
   *
   * `page` ist die Seitennummer ab 1, `x`/`y`/`width` sind Prozent der Inhaltsfläche –
   * so bleibt die Lage erhalten, wenn sich Schriftgröße oder Seitenränder ändern.
   */
  free?: { page: number; x: number; y: number; width: number }
}

export interface LearningGoalsBlock extends BaseBlock {
  type: 'learningGoals'
  title: string
  goals: string[]
}

export type InfoVariant = 'merke' | 'definition' | 'beispiel' | 'wissen' | 'regel'

export interface InfoBoxBlock extends BaseBlock {
  type: 'infoBox'
  variant: InfoVariant
  title: string
  body: string
}

export interface TextBlock extends BaseBlock {
  type: 'text'
  title: string
  /** Absätze durch Leerzeile getrennt; Textformat mit Formeln */
  body: string
  lineNumbers: boolean
  source: string
  glossary: { term: string; explanation: string }[]
  /**
   * Fremdsprachen: Sprache des Textes. 'de' kennzeichnet den deutschen Ausgangstext
   * einer Sprachmittlungsaufgabe, sonst steht der Text in der Zielsprache.
   */
  language?: 'de' | 'target'
  /**
   * Geschichte/Politik: Materialkopf einer QUELLE (Verfasser, Datum, Textsorte, Fundstelle).
   *
   * Die EPA Geschichte verlangt diese Angaben ausdrücklich – ohne sie lässt sich die
   * Standortgebundenheit nicht beurteilen, und genau darum geht es bei der Quellenanalyse.
   * Eine Darstellung (Sach- oder Verfassertext) hat keinen Materialkopf.
   */
  sourceHeader?: SourceHeader
  /**
   * Geschichte/Politik: Der Text ist eine ERZAEHLUNG (erzaehlende Darstellung), keine Quelle.
   *
   * Traegt die Erzaehlperspektive und ob die erzaehlende Figur erfunden ist. Daran haengt
   * der Hinweis ueber dem Text - eine Ich-Erzaehlung suggeriert Authentizitaet, und wer sie
   * fuer eine Quelle haelt, lernt beim Analysieren das Falsche.
   */
  narration?: Narration
}

/** Einzelbild einer Bildreihe (z. B. vier Tiere, Instrumente, Vulkantypen) */
export interface ImageItem {
  id: string
  caption: string
  description: string
  search?: string
  image?: ImageRef
}

/**
 * Rolle eines Bildes:
 * material = Arbeitsmaterial, mit dem gearbeitet wird (Schema, Karte, Quelle, Diagramm)
 * illustration = Verständnisbild neben dem Text
 * motivation = kleines Bild am Einstieg
 */
export type ImageRole = 'material' | 'illustration' | 'motivation'

export interface ImageBlock extends BaseBlock {
  type: 'image'
  role?: ImageRole
  /**
   * Was das Bild für das Lernen leistet (ordnend, abbildend, schmückend).
   * Anders als `role`, die über Platz und Größe entscheidet: Nur zur Funktion gibt es
   * gemessene Effektstärken. Siehe didactics/imageDesign.ts.
   */
  fn?: ImageFunction
  image?: ImageRef
  /** Beschriftungen, die direkt an Elementen im Bild sitzen */
  labels?: ImageLabel[]
  /** Bildbeschreibung (Alternativtext und Suchgrundlage) */
  description: string
  caption: string
  widthPercent: number
  /** Suchwörter für Wikimedia Commons / Cliparts */
  search?: string
  /** Originalquelle (historisches Bild, Kunstwerk): nur das genannte Werk selbst, nie ein KI-Bild */
  original?: boolean
  /** Bildreihe: mehrere Einzelbilder nebeneinander (ersetzt dann das Einzelbild) */
  items?: ImageItem[]
  /** Das Bild wurde automatisch gewählt/erzeugt – im Editor als Hinweis sichtbar */
  autoPicked?: boolean
  /**
   * Seitliche Anordnung: Dieser Baustein steht links bzw. rechts, der FOLGENDE Baustein
   * (Aufgabe, Text, Merkkasten) fließt daneben. Reicht dessen Inhalt tiefer als das Bild
   * bzw. die Tabelle, läuft er darunter in voller Blattbreite weiter – so bleibt rechts
   * kein Streifen ungenutzt und die Schreiblinien bleiben gut beschreibbar.
   *
   * 'none' = ausdrücklich untereinander. Fehlt der Wert, entscheidet bei Bildern die Rolle.
   */
  side?: 'left' | 'right' | 'none'
}

export type AnswerKind = 'lines' | 'grid' | 'space' | 'none' | 'gapText' | 'matching' | 'multipleChoice' | 'trueFalse' | 'ordering' | 'tableFill' | 'labels'

export interface Answer {
  kind: AnswerKind
  /** lines/labels: Anzahl; grid: Kästchenzeilen */
  count: number
  /** space: Höhe in mm */
  heightMm: number
  /** gapText: Text mit [[Lösung]]-Markierungen */
  gapText: string
  /** matching */
  left: string[]
  right: string[]
  /** matching: Index in right je Eintrag in left */
  pairs: number[]
  /** multipleChoice */
  options: string[]
  correct: number[]
  /** trueFalse */
  statements: { text: string; isTrue: boolean }[]
  /** ordering: Elemente in richtiger Reihenfolge; displayOrder = Anzeige-Reihenfolge (Indizes) */
  items: string[]
  displayOrder: number[]
  /** tableFill: Kopfzeile, Vorgaben (leere Zelle = ausfüllen) und Lösungen */
  headers: string[]
  rows: string[][]
  solutionRows: string[][]
  /** labels: Lösungen der Beschriftungen */
  labels: string[]
}

export interface TaskPart {
  id: string
  instruction: string
  answer: Answer
  solution: string
}

/**
 * Kompetenzbereich einer Fremdsprachenaufgabe (KMK-Bildungsstandards):
 * mediation = Sprachmittlung, writing = Schreiben, listening = Hör-/Hörsehverstehen,
 * reading = Leseverstehen, grammar = Verfügung über sprachliche Mittel (Grammatik).
 * Für alle anderen Fächer bleibt das Feld leer.
 */
export type LanguageSkill = 'mediation' | 'writing' | 'listening' | 'reading' | 'grammar' | 'vocabulary'

/**
 * Eine Spalte der Notizentabelle einer Schreibaufgabe.
 *
 * Die amtlichen Abschlussprüfungen (Bayern, NRW, Mecklenburg-Vorpommern) geben die
 * Inhaltspunkte als schlichte Spiegelstrichliste vor – eine zweispaltige Notizentabelle
 * mit offenen Impulsen („Positives: …") ist in keiner der eingesehenen Prüfungsaufgaben
 * belegt. Sie ist aber dieselbe Sache in einer zweiten Gliederungsebene und wird von
 * Lehrkräften so verwendet. Deshalb kann eine Aufgabe BEIDES: `points` allein ergibt die
 * Spiegelstrichliste des Prüfungsformats, `notes` die Tabelle.
 */
export interface BriefNotes {
  /** Spaltenüberschrift, z. B. „The Conference" */
  title: string
  /** Stichpunkte, die übernommen werden können */
  items: string[]
  /** Offene Impulse, die die Lernenden selbst füllen, z. B. „Positives: …" */
  prompts: string[]
}

/**
 * Eine Zeile des Erwartungshorizonts.
 *
 * Aufgebaut wie die amtlichen Erwartungshorizonte in NRW und Bayern, die unabhängig
 * voneinander zur selben Architektur kommen: ein ÜBERGEORDNETES Kriterium mit eigener
 * Höchstpunktzahl, darunter Beispiellösungen, die ausdrücklich NICHT verbindlich sind.
 * Wörtlich (QUA-LiS NRW zur ZP10): „Die unter den Spiegelstrichen aufgeführten Lösungen
 * sind beispielhaft und antizipieren, wie diese Anforderungen im Sinne des übergeordneten
 * Kriteriums erfüllt werden können."
 */
export interface BriefExpectation {
  /** Der Inhaltspunkt bzw. Operator, auf den sich die Zeile bezieht */
  aspect: string
  /** Das übergeordnete Kriterium – verbindlich */
  criterion: string
  /** Beispiellösungen – ausdrücklich nicht verbindlich */
  examples: string[]
  points: number
}

/** Vorgaben, die eine Schreib- oder Sprachmittlungsaufgabe situieren (Adressat, Textsorte, Zweck). */
export interface TaskBrief {
  /** Situation: Wer bist du, was ist passiert? */
  situation: string
  /** Adressat: An wen richtet sich der Text? */
  audience: string
  /** Textsorte: E-Mail, Blogbeitrag, Artikel, Rede … */
  textType: string
  /** Zweck: informieren, überzeugen, beraten, berichten … */
  purpose: string
  /** erwarteter Umfang in Wörtern (0 = keine Vorgabe) */
  words: number
  /** Punkte, die der Text abdecken muss (Gliederungsvorgabe der Aufgabe) */
  points: string[]
  /** Notizentabelle als Alternative zur Spiegelstrichliste; leer = keine Tabelle */
  notes?: BriefNotes[]
  /** Formvorgaben, z. B. „Überschrift und Zwischenüberschriften verwenden" */
  form?: string[]
  /** Bewertungskriterien für den Erwartungshorizont */
  criteria: string[]
  /** Erwartete Inhalte je Aspekt – nur für die Lehrkraft */
  expected?: BriefExpectation[]
  /**
   * Ausformulierter Mustertext auf dem Zielniveau – nur für die Lehrkraft.
   *
   * Entscheidung der Lehrkraft (23.09.2026): Der Erwartungshorizont soll neben den
   * erwarteten Inhalten auch zeigen, wie ein erwartungsgemäßer Text tatsächlich klingt.
   */
  model?: string
}

export interface TaskBlock extends BaseBlock {
  type: 'task'
  instruction: string
  operator: string
  afb?: Afb
  afbReason: string
  socialForm: SocialForm
  answer: Answer
  parts: TaskPart[]
  solution: string
  points: number
  minutes: number
  /** Fremdsprachen: Kompetenzbereich der Aufgabe */
  skill?: LanguageSkill
  /** Fremdsprachen: Situierung für Sprachmittlung und Schreiben */
  brief?: TaskBrief
  /**
   * Gelöstes Beispiel, das der Aufgabe als Punkt „0" vorangestellt wird.
   *
   * Belegt als Konstruktionsprinzip: ÖSZ (2024), „Leitfaden zur Erstellung von
   * Schularbeiten": „Bei jeder Aufgabenstellung sollte zu Beginn ein gelöstes Beispiel (0)
   * vorgegeben sein"; ebenso in den Modellsätzen des Goethe-Instituts und in den
   * Cambridge-Formaten (Item 0 mit eingetragener Lösung).
   *
   * Optional und einzeln entfernbar – die Lehrkraft entscheidet je Aufgabe. Es ist ein
   * eigenes Feld und keine Teilaufgabe, damit es die Nummerierung der echten Items nicht
   * verschiebt und beim Zählen der Punkte nicht mitläuft.
   */
  example?: TaskPart
  /** Hörverstehen: id des Hörtext-Bausteins, zu dem die Aufgabe gehört */
  audioId?: string
  /** Filmbeobachtung: id des Video-Bausteins, zu dem die Aufgabe gehört */
  videoId?: string
  /** Filmbeobachtung: Phase, in der die Aufgabe bearbeitet wird */
  viewingPhase?: ViewingPhase
  /**
   * Filmbeobachtung: Beobachtergruppe („A“, „B“ …) bei arbeitsteiliger Beobachtung.
   * Leer = für alle. Aus diesen Angaben entstehen die Gruppenfassungen des Blattes.
   */
  observerGroup?: string
  /** Filmbeobachtung: Zeitmarke der gemeinten Stelle, z. B. „03:20“ */
  timecode?: string
  /**
   * Grammatiktest: geprüfte Form und die Stolperstelle, auf die die Aufgabe zielt.
   * Daraus entsteht im Lösungsteil das Fehlerprofil – nicht nur „wie viele Punkte",
   * sondern „welcher Fehler".
   */
  grammar?: { topicId: string; error: string }
}

/** Sprecherin oder Sprecher eines Hörtextes (Stimme von ElevenLabs). */
export interface AudioSpeaker {
  id: string
  /** Name im Skript, z. B. „Interviewer“ */
  name: string
  /** Stimm-Kennung bei ElevenLabs */
  voiceId: string
  voiceName: string
}

/**
 * Hörtext für Hörverstehensaufgaben. Das Skript steht nur auf der Lehrerseite,
 * das Schülerblatt nennt Textsorte, Sprecher, Anzahl der Durchgänge und optional einen QR-Code.
 */
export interface AudioBlock extends BaseBlock {
  type: 'audio'
  title: string
  /** Textsorte: Interview, Nachrichtenmeldung, Durchsage, Gespräch, Vortrag … */
  textType: string
  /** Skript mit Sprecherzeilen „Name: Text“ */
  transcript: string
  speakers: AudioSpeaker[]
  /** Wie oft der Text abgespielt wird (KMK: in der Regel zweimal) */
  plays: number
  /** Hinweis vor dem Hören (pre-listening): worauf zu achten ist */
  beforeListening: string
  /** geschätzte Spieldauer in Sekunden */
  seconds: number
  /**
   * Eigene Klangregler der Lehrkraft. Fehlt die Angabe, berechnet die App Tempo und
   * Ausdruck aus dem GER-Niveau (`shared/voiceSettings.ts`).
   */
  voiceSettings?: TtsSettings
  /** erzeugte Audiodatei */
  audio?: { dataUrl?: string; fileName?: string }
  /** Adresse für den QR-Code auf dem Blatt (z. B. Cloud-Ordner); leer = kein QR-Code */
  url?: string
  /**
   * Woher die Aufnahme stammt.
   *
   * 'ki' = Skript von der KI, vertont über die Sprachsynthese. Solche Aufnahmen werden auf
   * dem Schülerblatt gekennzeichnet (KMK-Handlungsempfehlung KI 2024: „Absprachen zur
   * Verwendung und Kennzeichnung KI-generierter Produkte").
   * 'archiv' = echte Aufnahme aus einem Archiv, nur verlinkt. Sie DARF nicht als
   * KI-erzeugt gekennzeichnet werden – das wäre schlicht falsch.
   *
   * Fehlt die Angabe, gilt 'ki': Alle bisher erzeugten Hörtexte stammen von der KI.
   */
  origin?: 'ki' | 'archiv'
}

/**
 * Film, Lernvideo oder Netzvideo, zu dem beobachtet wird.
 *
 * Auf dem Schülerblatt stehen Titel, Art, Laufzeit und – wenn eine Adresse vorliegt – ein
 * QR-Code samt Klartextlink. Zeitmarken und Rechtehinweise stehen nur auf der Lehrerseite,
 * es sei denn, die Lehrkraft schaltet sie ausdrücklich frei: Zeitmarken hängen an einer
 * bestimmten Fassung und veralten, sobald das Video neu hochgeladen oder anders geschnitten
 * wird.
 */
export interface VideoBlock extends BaseBlock {
  type: 'video'
  /** Überschrift des Bausteins auf dem Blatt */
  title: string
  kind: VideoKind
  /** Titel des Films oder Videos, unter dem es zu finden ist */
  sourceTitle: string
  /** Adresse; leer = kein QR-Code */
  url: string
  /** Plattform oder Herkunft (YouTube, Mediathek, Medienzentrum, DVD) */
  platform: string
  /** Gesamtlaufzeit in Minuten (0 = unbekannt) */
  minutes: number
  /** Gezeigter Abschnitt als Zeitmarken, z. B. „12:40–18:10“ (leer = ganzes Video) */
  section: string
  /** Worum es geht – kurz, für das Schülerblatt */
  summary: string
  /** Hinweis vor dem Sehen: worauf zu achten ist */
  beforeViewing: string
  /** Wie oft gezeigt wird */
  plays: number
  /** Untertitel (Fremdsprachen) */
  subtitles?: SubtitleMode
  /** Nur Lehrerseite: Zeitmarken, Regiehinweise, Stolperstellen */
  teacherNote: string
  /**
   * Suchbegriffe für das Archiv, wenn die KI keine Fundstelle nennen konnte.
   *
   * Entscheidung der Lehrkraft (22.09.2026): Lieber ein sichtbarer Baustein mit Suchhilfe
   * als gar nichts. Eine Lücke, die man sieht, schließt man mit einem Handgriff; eine, die
   * nur in den Notizen steht, fällt durch.
   */
  searchTerms?: string[]
}

export type ScaffoldVariant = 'tipp' | 'satzanfaenge' | 'wortspeicher' | 'hilfekarten'

export interface ScaffoldBlock extends BaseBlock {
  type: 'scaffold'
  variant: ScaffoldVariant
  title: string
  items: string[]
}

/**
 * Hilfsblatt mit nützlichen Ausdrücken und Wortschatz (Fremdsprachen).
 *
 * Gruppiert nach SPRACHHANDLUNG, nicht alphabetisch: Wer eine Meinung äußern soll, sucht unter
 * „eine Meinung äußern" – nicht unter „I". Zu jedem Eintrag darf die deutsche Entsprechung
 * stehen; bei Wendungen ist sie oft hilfreicher als eine wörtliche Übersetzung.
 */
export interface PhrasesBlock extends BaseBlock {
  type: 'phrases'
  title: string
  /** Kurzer Hinweis, wie das Blatt zu benutzen ist */
  hint: string
  groups: { label: string; items: { text: string; german: string }[] }[]
}

export interface TableBlock extends BaseBlock {
  type: 'table'
  title: string
  headers: string[]
  rows: string[][]
  /**
   * Seitliche Anordnung: Dieser Baustein steht links bzw. rechts, der FOLGENDE Baustein
   * (Aufgabe, Text, Merkkasten) fließt daneben. Reicht dessen Inhalt tiefer als das Bild
   * bzw. die Tabelle, läuft er darunter in voller Blattbreite weiter – so bleibt rechts
   * kein Streifen ungenutzt und die Schreiblinien bleiben gut beschreibbar.
   *
   * 'none' = ausdrücklich untereinander. Fehlt der Wert, entscheidet bei Bildern die Rolle.
   */
  side?: 'left' | 'right' | 'none'
}

export interface WorkspaceBlock extends BaseBlock {
  type: 'workspace'
  kind: 'lines' | 'grid' | 'blank'
  heightMm: number
  label: string
}

/**
 * Gitternetz mit festen Abständen: vorgegebene Zeichenfläche für Graphen, Skizzen,
 * Messreihen und Klimadiagramme. Die Maße sind echte Millimeter, damit die Schüler
 * auf dem gedruckten Blatt mit dem Lineal arbeiten können.
 */
export type GridKind = 'karo' | 'mm' | 'koordinaten' | 'klima'

export interface GridAxes {
  xLabel: string
  yLabel: string
  /** zweite y-Achse rechts (Klimadiagramm: Niederschlag) */
  y2Label: string
  xMin: number
  xMax: number
  xStep: number
  yMin: number
  yMax: number
  yStep: number
  y2Min: number
  y2Max: number
  y2Step: number
  /** Zahlen an den Achsen beschriften */
  showNumbers: boolean
  /** x-Achse mit den Monatsanfangsbuchstaben statt mit Zahlen (Klimadiagramm) */
  months: boolean
}

export interface GridBlock extends BaseBlock {
  type: 'grid'
  kind: GridKind
  title: string
  /** Hinweis unter dem Gitternetz, z. B. „1 Kästchen = 2 Jahre“ */
  caption: string
  heightMm: number
  /** Kästchenweite in mm (Karo 5, Millimeterpapier 1) */
  cellMm: number
  axes: GridAxes
}

export interface SelfCheckBlock extends BaseBlock {
  type: 'selfCheck'
  title: string
  statements: string[]
  format: 'smileys' | 'ampel' | 'kompetenzraster'
}

export interface DividerBlock extends BaseBlock {
  type: 'divider'
  title: string
}

export type WsBlock =
  | LearningGoalsBlock
  | InfoBoxBlock
  | TextBlock
  | ImageBlock
  | TaskBlock
  | ScaffoldBlock
  | PhrasesBlock
  | TableBlock
  | WorkspaceBlock
  | GridBlock
  | AudioBlock
  | VideoBlock
  | SelfCheckBlock
  | DividerBlock

export type WsBlockType = WsBlock['type']

export interface Sheet {
  id: string
  /** Niveaustufe bei getrennten Blättern */
  stars?: Stars
  label: string
  /**
   * Beobachtergruppe bei arbeitsteiliger Filmbeobachtung („A“, „B“ …).
   * Alle Gruppenfassungen haben dasselbe Layout und dasselbe Lernziel – unterschiedlich ist
   * nur der Beobachtungsauftrag. Das ist ausdrücklich so gefordert: Niemand soll am Blatt
   * ablesen können, dass er etwas anderes bekommen hat.
   */
  observerGroup?: string
  /**
   * Eigene Kopfzeile dieses Blattes – ersetzt `design.header.customText`. Für Dokumente mit
   * mehreren Fassungen (LZK „alle Fassungen"): Die Kopfzeile gehört sonst zum ganzen Dokument,
   * und auf jedem Blatt stand „Gruppe A" (Paket 6, 25.09.2026).
   */
  kopfzeile?: string
  blocks: WsBlock[]
}

export type SheetType = 'erarbeitung' | 'uebung' | 'wiederholung' | 'lesetext' | 'hausaufgabe' | 'lernkontrolle'

export interface WorksheetMeta {
  title: string
  subjectId: string
  subjectLabel: string
  topic: string
  learningGoals: string
  priorKnowledge: string
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  grade: number
  courseLevel: CourseLevel
  languageMode: LanguageMode
  /** Bei Fremdsprachen: 1., 2. oder 3. Fremdsprache (für den GER-Vorschlag) */
  languageOrder: number
  cefrLevel: CefrLevel
  instructionsInGerman: boolean
  /**
   * Deutsch, Schwerpunkt Zuhoeren: welche Bauform.
   *
   * 'muendlich' ist die in den Bildungsstandards belegte Form (Zuhoeren - Mitschrift -
   * Zusammenfassung - Vortrag), 'schriftlich' die aus der Fremdsprachendidaktik uebertragene.
   * Fehlt die Angabe, gilt die belegte.
   */
  listeningMode?: ZuhoerenMode
  /** Angaben zur Schule (Name, Logo) auf diesem Blatt abdrucken (Vorgabe aus den Einstellungen) */
  showSchool?: boolean
  /** Form des Rollenspiels aus ROLE_PLAY_TYPES (leer = die KI wählt eine passende) */
  rolePlayType?: string
  /** Unsichtbarer KI-Test auf dem Schülerblatt (siehe shared/aiCanary.ts) */
  aiCanary?: boolean
  /**
   * Die Wörter des KI-Tests, wie die Lehrkraft sie eingegeben hat (durch Komma getrennt).
   *
   * Leer bedeutet: der Vorschlag des Programms. Die Lehrkraft wird beim Einschalten gefragt,
   * weil sie hinterher in den Abgaben danach sucht – und weil nur sie weiß, welches Wort im
   * eigenen Unterricht gerade ohnehin vorkommt.
   */
  aiCanaryWords?: string
  /** Deckblatt als Seite 0 vor die Arbeitsblätter stellen */
  coverPage?: boolean
  /** Farbgebung des Deckblatts (id aus COVER_DESIGNS) – unabhängig vom Blattdesign */
  coverDesign?: string
  /** Sehr kurze Beschreibung für das Deckblatt */
  coverText?: string
  /** Erzeugtes Maskottchen als data:-URL; leer = mitgelieferte Zeichnung */
  coverImage?: string
  /** Fremdsprachen: Kompetenzschwerpunkt des Blattes ('mixed' = gemischt) */
  skillFocus?: LanguageSkill | 'mixed'
  /**
   * Hörverstehen: Die KI schreibt den Hörtext mit; vertont wird er auf Knopfdruck im
   * Reiter „Hörtexte". Nur sinnvoll, wenn eine Stimme (ElevenLabs) eingerichtet ist.
   */
  audioAi?: boolean
  /** Hörtextsorte aus LISTENING_FORMATS („auto" = die KI wählt eine passende) */
  audioFormat?: string
  /** Zahl der Hörtexte auf dem Blatt; die Aufgaben stehen nach Hörtext gruppiert */
  audioCount?: number
  /** Gewünschte Spieldauer je Hörtext in Sekunden (0 oder fehlend = nach GER-Niveau) */
  audioSeconds?: number
  /** Stärkere KI nur für den Hörtext: Anbieter und Modell ('' = wie eingestellt) */
  audioProvider?: AiProviderId
  audioModel?: string
  /**
   * Schwerpunkt Vokabeln: Wie die Wortschatzarbeit auf dem Blatt angelegt ist.
   * Ersetzt bei diesem Schwerpunkt die Frage nach Materialquellen.
   */
  vocabWork?: VocabWorkMode
  /** Zielwörter, die das Blatt aufbaut (leer = die KI wählt sie zum Thema) */
  vocabWords?: string
  /** Wortschatz früherer Units und Bände: So weit darf das Blatt sprachlich gehen. */
  knownVocab?: KnownVocab
  /**
   * Eigene Obergrenze für die Zahl der Zielwörter (0/fehlt = Empfehlung nach Jahrgang).
   * Wer bewusst mehr Wörter auf ein Blatt nimmt, trägt hier die gewünschte Zahl ein.
   */
  vocabMaxWords?: number
  /** Fremdsprachen: Den Lernenden eine Wortzahl vorgeben (Standard: aus) */
  wordLimit?: boolean
  /** Fremdsprachen: Umfang des Ausgangstextes in Wörtern (0 = automatisch nach GER-Niveau) */
  materialWords?: number
  /** Fremdsprachen: Textsorte, in der die Lernenden schreiben ('' = die KI wählt passend zur Situation) */
  studentTextType?: string
  /**
   * Schreibaufgabe: Inhaltspunkte zusaetzlich als Notizentabelle.
   *
   * Die amtlichen Abschlusspruefungen geben die Inhaltspunkte als Spiegelstrichliste vor;
   * eine zweispaltige Notizentabelle mit offenen Impulsen ist dort in keiner eingesehenen
   * Aufgabe belegt, im Unterricht aber verbreitet. Weil beides vertretbar ist, entscheidet
   * die Lehrkraft - und nicht die KI nach Gefuehl.
   */
  writingNotes?: boolean
  /**
   * Erwarteter Umfang des SCHÜLERTEXTES in Wörtern (0 = automatisch nach GER-Niveau).
   *
   * Der automatische Wert richtet sich allein nach dem Niveau: B1 ergibt 140 Wörter. Eine
   * Abschlussaufgabe der Klasse 10 verlangt aber eher 250–300. Der Wert steuert die Zahl der
   * Schreiblinien und den Erwartungshorizont – auf dem Blatt steht er nur, wenn `wordLimit`
   * eingeschaltet ist.
   */
  studentWords?: number
  /** Grammatik-Schwerpunkt: das behandelte Thema (frei eingetippt; ältere Blätter) */
  grammarTopic?: string
  /** Gewählte Grammatikthemen (Kennungen aus grammarTopics.ts) */
  grammarTopics?: string[]
  /**
   * Spät beginnende Fremdsprache (Beginn in der Oberstufe).
   * Das Lernjahr ergibt sich sonst aus `languageOrder`; nur dieser Fall lässt sich damit
   * nicht ausdrücken, weil die Progression eine ganz eigene ist.
   */
  lateStartLanguage?: boolean
  /**
   * DaZ: erreichte Erwerbsstufe (0–6).
   * Sperrt Themen, die mehr als eine Stufe darüber liegen – solche Strukturen lassen sich
   * nicht verarbeiten, egal wie gut das Arbeitsblatt ist.
   */
  acquisitionStage?: number
  /** Hör- und Leseverstehen: gewählte Aufgabenformate (ids aus comprehensionFormats.ts) */
  comprehensionFormats?: string[]
  /**
   * Fremdsprachen: Hilfsblatt mit nützlichen Ausdrücken und Wortschatz für die Lernenden.
   * 'aus' = keines · 'blatt' = eigenes Blatt am Ende · 'inline' = auf dem Aufgabenblatt.
   *
   * Ein eigenes Blatt lässt sich austeilen und liegen lassen, während die Aufgaben wechseln;
   * auf dem Aufgabenblatt spart es Papier und steht direkt bei der Aufgabe.
   */
  phraseSheet?: 'aus' | 'blatt' | 'inline'
  /**
   * Notenschlüssel für den Lösungsteil.
   *
   * Nur für Teile, die über PUNKTE bewertet werden. Teile mit eigener Teilnote – etwa die
   * Schreibkompetenz im Fach Englisch, die nach Inhalt und Sprache beurteilt wird – bekommen
   * keinen, weil ein Punkteschlüssel dort nichts aussagt.
   */
  gradeScale?: {
    thresholds?: number[]
    groups: { label: string; points: number }[]
  }
  /**
   * Ein schmückendes Bild zulassen (Standard: ja, aber unter Bedingungen).
   * Die Bedingungen stehen in didactics/imageDesign.ts – abgeschaltet heißt: Jedes Bild auf
   * dem Blatt trägt Information, die eine Aufgabe braucht.
   */
  decorImage?: boolean
  /**
   * Piktogramme an Arbeitsanweisungen und Sozialformen (Standard: aus).
   * Bewusst nicht automatisch nach Jahrgang: Eine belegte Altersgrenze, ab der Symbole
   * überflüssig werden, gibt es nicht – das beurteilt die Lehrkraft für ihre Lerngruppe.
   */
  pictograms?: boolean
  /** Beobachtungsauftrag zu einem Film, Lernvideo oder Netzvideo (fehlt = keiner) */
  video?: VideoSetup
  sheetType: SheetType
  pages: number
  /**
   * Gewünschte Zahl der Aufgaben auf dem Blatt (0 oder fehlend = Richtwert nach Jahrgang).
   *
   * Zwei verschiedene Größen, deshalb zwei Felder: `taskCount` zählt AUFGABENBLÖCKE,
   * `itemCount` die Fragen INNERHALB einer Verstehensaufgabe. „Sechs Aufgaben" heißt bei
   * einem Grammatikblatt etwas anderes als bei einem Hörverstehensblatt.
   */
  taskCount?: number
  /** Hör-/Leseverstehen: Zahl der Fragen JE Text (0 oder fehlend = Richtwert nach Niveau) */
  itemCount?: number
  minutes: number
  socialForms: SocialForm[]
  differentiation: { levels: 1 | 2 | 3; mode: 'separate' | 'combined' }
  answerKey: boolean
  sheetNumber: string
  /** auto = Internet (KI-geprüft), sonst KI-Bild; web = nur Internet; ai = nur KI-Bilder; placeholder = selbst wählen */
  /**
   * Korrekturrand neben den Schreiblinien.
   *
   * Die Linien enden dann vor dem rechten Rand, und eine senkrechte Linie trennt den
   * Streifen ab, in den die Lehrkraft beim Korrigieren schreibt. Gewünscht am 24.09.2026 –
   * einstellbar am fertigen Blatt, weil sich erst dort zeigt, ob der Platz gebraucht wird.
   */
  correctionMargin?: boolean
  /**
   * Notizrand neben den Materialtexten.
   *
   * Wunsch der Lehrkraft (24.09.2026): „fuege oben ausserdem eine option (wie beim
   * korrekturrand) hinzu, mit der man neben den materialien (texten) einen geeigneten rand
   * fuer notizen hinzufuegen kann."
   *
   * Beim Arbeiten mit einer Quelle wird am Rand mitgeschrieben – Gliederung, Stichworte,
   * Fragen. Ohne Platz dafuer landet das zwischen den Zeilen und ist spaeter unlesbar.
   */
  notesMargin?: boolean
  imageSource: WorksheetImageSource
  /**
   * Wie viele Bilder das Blatt tragen soll.
   *
   * Der Prompt rät von Bildern eher ab („ein Blatt ohne Bild ist besser als eines mit einem
   * überflüssigen") – das ist didaktisch richtig, führte aber dazu, dass oft GAR KEIN Bild
   * vorgeschlagen wurde, obwohl die Lehrkraft eines wollte. Die Suche und die KI-Erzeugung
   * liefen dann ins Leere: Es gab schlicht keinen Bedarf zu füllen.
   *
   * 'auto' = wie bisher, die KI entscheidet. 'min1' = mindestens ein lernwirksames Bild je
   * Seite. 'keine' = kein Bild.
   */
  imageAmount?: 'auto' | 'min1' | 'keine'
  /** Niveau-Sternchen (★/★★/★★★) auf den Blättern anzeigen (fehlt = ja) */
  showLevelMarks?: boolean
  /**
   * Sprache der festen Beschriftungen auf dem Blatt (Name, Klasse, Datum, Kopfzeile).
   * Fehlt = Deutsch. Englischarbeiten setzen hier 'en', damit auch PDF und Word
   * durchgehend englisch beschriftet sind.
   */
  labelLanguage?: 'de' | 'en'
  /**
   * Wort hinter dem Titel im Lösungsteil („– Lösungen"). Fehlt = „Lösungen". Die
   * Klassenarbeit setzt „Erwartungshorizont" – das ist dort der Fachbegriff, auch in
   * Englischarbeiten, denn der Lösungsteil ist für die Lehrkraft (Paket 6, 25.09.2026).
   */
  loesungsBegriff?: string
  /** Originalquellen (Text- und Bildquellen aus frei zugänglichen Archiven); fehlt = automatisch */
  originalSources?: OriginalSourcesMode
  /**
   * Abiturbezogene Uebungsaufgabe bzw. Uebungsklausur (Jahrgang 12/13).
   *
   * Wunsch der Lehrkraft (24.09.2026): Bei der Auswahl des 12./13. Jahrgangs soll sich der
   * Schritt „Thema & Lerngruppe" per Knopfdruck so umstellen lassen, dass sich an
   * Abituraufgaben angelehnte Uebungsaufgaben und Uebungsklausuren entwerfen lassen.
   *
   * Die Typen stehen hier als einfache Zeichenketten und nicht als Verweis auf
   * `didactics/abitur.ts`: Sonst entstuende ein Ringschluss zwischen Modell und Didaktik.
   */
  abitur?: AbiturVorgaben
  /**
   * Bilingualer Sachfachunterricht: Das Sachfach wird in einer Fremdsprache unterrichtet.
   *
   * Fehlt = einsprachig deutsch. Siehe `didactics/bilingual.ts`; die Form steht dabei, weil
   * mehrere Länder die Bewertung davon abhängig machen.
   */
  bilingual?: BilingualVorgaben
  /**
   * Tipp- und Hilfekarten zu den anspruchsvollen Aufgaben anlegen (fehlt = ja).
   * Sie stehen auf einer eigenen Schlussseite, nicht zwischen den Aufgaben.
   */
  helpCards?: boolean
  /** Tafelbild zur Sicherung gleich mit erstellen */
  boardPlan?: boolean
  /** Überschriebene Profilwerte */
  overrides: {
    afbMix?: AfbMix
    fontPt?: number
    scaffolding?: 'hoch' | 'mittel' | 'gering'
  }
  /** Hinweis der KI an die Lehrkraft (z. B. Thema passt schlecht zum Jahrgang) */
  teacherNote: string
}

/**
 * Angaben zum Film oder Video, die die Lehrkraft vor der Erstellung macht.
 *
 * Die KI kann das Video nicht ansehen. Sie schreibt die Aufgaben aus ihrem Wissen über den
 * genannten Titel – und liegt dabei umso sicherer, je bekannter der Film ist. Bei einem
 * beliebigen Netzvideo weiß sie nichts; deshalb gibt es `summary`, und deshalb steht auf der
 * Lehrerseite immer der Hinweis, die Lösungen am Video zu prüfen.
 */
export interface VideoSetup {
  /** Titel des Films oder Videos, unter dem es zu finden ist */
  title: string
  /** Adresse; nur daraus entsteht ein QR-Code */
  url: string
  kind: VideoKind
  /** Plattform oder Herkunft (YouTube, Mediathek, Medienzentrum, DVD) */
  platform: string
  /** Gesamtlaufzeit in Minuten (0 = unbekannt) */
  minutes: number
  /** Gezeigter Abschnitt als Zeitmarken, z. B. „12:40–18:10“ */
  section: string
  /** Eigene Inhaltsangabe oder ein Transkript – macht die Aufgaben belastbar */
  summary: string
  /** Was während des Sehens verlangt wird ('auto' = nach Videoart) */
  during: ViewingDuring
  /** Zeitmarken auch auf dem Schülerblatt (Vorgabe: aus – sie veralten mit der Fassung) */
  timecodesOnSheet?: boolean
  /** Zahl der Beobachtergruppen bei arbeitsteiliger Beobachtung (0 oder 1 = keine) */
  groups: number
  /** Fremdsprachen: Untertitel */
  subtitles?: SubtitleMode
}

export type OriginalSourcesMode = 'auto' | 'on' | 'off'

/**
 * Anlage der Wortschatzarbeit (Schwerpunkt „Vokabeln").
 * Die Stufen folgen dem fachdidaktischen Dreischritt Semantisierung – Festigung – Anwendung.
 */
export type VocabWorkMode = 'introduce' | 'practise' | 'apply' | 'revise' | 'check'

export type WorksheetImageSource = 'auto' | 'web' | 'ai' | 'placeholder'

export interface SourceMaterial {
  id: string
  fileName: string
  kind: 'pdf' | 'docx' | 'image' | 'text'
  text: string
  format: 'plain' | 'html'
  pageImages: string[]
  pageCount: number
  pagesRead: number[]
  useAsBasis: boolean
  embedImage: boolean
}

export interface OutlineItem {
  id: string
  type: WsBlockType
  purpose: string
  afb?: Afb
  operator: string
  socialForm: SocialForm
  stars?: Stars
  answerKind: AnswerKind
}

export interface Outline {
  title: string
  learningGoals: string[]
  minutes: number
  teacherNote: string
  items: OutlineItem[]
}

export interface Worksheet {
  version: 1
  meta: WorksheetMeta
  design: DesignTemplate
  outline: Outline | null
  sheets: Sheet[]
  sources: SourceMaterial[]
  createdAt: string
  /** Optionales Tafelbild für die Lehrkraft (ältere Blätter haben nur dieses) */
  board?: BoardPlan | null
  /**
   * Je gewähltem Tafelformat ein eigenes Tafelbild.
   * Eine Mitteltafel und ein 16:9-Display fassen Unterschiedliches – ein Bild für beide
   * wäre für eines von beiden falsch geplant.
   */
  boards?: BoardPlan[]
  /**
   * Im Netz gefundener Originaltext, der als Ausgangsmaterial dient.
   *
   * Er wird beim Planen beschafft und von der App SELBST als Baustein eingesetzt – die KI
   * bekommt ihn nur zu lesen. Sie dürfte ihn nicht abschreiben: Ein Sprachmodell, das einen
   * Text „wiedergibt", ändert dabei Kleinigkeiten, und auf dem Blatt stünde das dann mit
   * Quellenangabe da wie ein Zitat.
   */
  originalMaterial?: OriginalMaterialAblage
}

/** Das beschaffte Originalmaterial, wie es in der Datei gespeichert wird. */
export interface AbiturVorgaben {
  an: boolean
  /** grundlegendes oder erhoehtes Anforderungsniveau */
  niveau: 'gA' | 'eA'
  /** Kennung einer Aufgabenart aus dem Fachprofil */
  aufgabenart: string
  /** Fremdsprachen: welcher Pruefungsteil geuebt wird */
  pruefungsteil?: string
  /**
   * Uebungsklausur statt einzelner Uebungsaufgabe.
   *
   * Der Unterschied ist nicht der Umfang, sondern die Vollstaendigkeit: Eine Uebungsklausur
   * bildet die Pruefungssituation nach – mit Auswahlmoeglichkeit, Zeitangabe, Hilfsmitteln
   * und Erwartungshorizont mit Bewertungsraster.
   */
  klausur: boolean
}

/**
 * Die drei Formen, die die KMK unterscheidet („Konzepte für den bilingualen Unterricht",
 * Beschluss vom 17.10.2013, Kap. 1.5):
 *
 * - `zug`: bilingualer Zug, Zweig oder Bildungsgang – durchgehend, meist mehrere Sachfächer
 * - `sachfach`: durchgängiger bilingualer Sachfachunterricht, „über mindestens ein Schuljahr"
 * - `modul`: bilinguale Module, „kürzere bilinguale Sequenzen"
 *
 * Die Form steht hier, weil sie die Bewertung ändert: In Thüringen steht sie bei Modulen
 * ausdrücklich „nicht im Vordergrund", und „für den Schüler darf aufgrund von Sprachproblemen
 * kein Nachteil bei der Leistungsbewertung entstehen".
 */
export type BilingualForm = 'zug' | 'sachfach' | 'modul'

export interface BilingualVorgaben {
  an: boolean
  /** Sprachcode der Arbeitssprache, z. B. „en" */
  sprache: string
  /** Anzeigename der Arbeitssprache, z. B. „Englisch" */
  spracheLabel: string
  form: BilingualForm
  /**
   * Nur in Prüfungen (Klassenarbeit): In welcher Sprache die Aufgaben stehen. Entscheidung der
   * Lehrkraft (25.09.2026): wählbar, Standard Arbeitssprache – reine Fremdsprache unterschätzt
   * die Sachleistung (Canz u. a. 2021), Mischformate sind amtlich gedeckt (Rheinland-Pfalz).
   */
  pruefsprache?: Pruefsprache
  /**
   * Das Blatt ist Teil einer Prüfung. Dann liegt das Glossar der Arbeit EINMAL als Hilfsmittel
   * bei, statt in jedem Teil als Baustein zu entstehen. Setzt die Klassenarbeit selbst.
   */
  pruefung?: boolean
}

export type Pruefsprache = 'ziel' | 'gemischt' | 'deutsch'

export interface OriginalMaterialAblage {
  titel: string
  urheber?: string
  url: string
  /** der gekürzte Wortlaut */
  text: string
  /** vollständige Quellenangabe (§ 63 UrhG) */
  quellenangabe: string
  /** sichtbarer Änderungshinweis (§ 62 Abs. 5 UrhG), ggf. leer */
  hinweis: string
  /** Kürzungsprotokoll für den Lehrkraftteil */
  protokoll: string[]
  /** einordnende Sätze der Lehrkraft – NICHT Teil des Zitats */
  vorbemerkung?: string
  /** false, wenn die Prüfung einen Eingriff am Wortlaut gefunden hat */
  wortlautGeprueft: boolean
}

export type BoardLayout = 'columns' | 'flow' | 'cluster'

export interface BoardSection {
  heading: string
  points: string[]
  /** Feld der Tafel: links Aufgabe, Mitte Erarbeitung, rechts Merksatz */
  field?: BoardField
  /** Wird dieser Bereich ins Heft übertragen? Nur der Kern gehört hinein. */
  toNotebook?: boolean
  /** Aus welchen Aufgaben die Inhalte stammen, z. B. „Aufgabe 1, 2b“ */
  fromTasks: string
  /** Skizze, die die Lehrkraft dazuzeichnet (z. B. Kräftepfeile, Zahlenstrahl, Kartenskizze) */
  sketch?: string
}

export interface BoardStep {
  /** z. B. „Ergebnisse von Aufgabe 1 vergleichen“ */
  phase: string
  /** Impuls oder Frage der Lehrkraft */
  impulse: string
  /** Erwartete Schülerbeiträge, die an die Tafel kommen */
  expected: string
}

/** Tafelbild zur Ergebnissicherung – wird im Unterrichtsgespräch aus dem Vergleich der Aufgaben entwickelt. */
export interface BoardPlan {
  title: string
  /** Vergleich nebeneinander, Ablauf/Ursache-Wirkung oder zentraler Begriff mit Aspekten */
  layout: BoardLayout
  /** Fläche, für die dieses Tafelbild gezeichnet ist – eine Tafel ist breiter als hoch */
  format?: BoardFormat
  /** Strukturform aus BOARD_STRUCTURES */
  structure?: string
  /** Warum diese Strukturform zum Inhalt passt */
  structureReason?: string
  sections: BoardSection[]
  /** Merksatz / zentrales Ergebnis */
  conclusion: string
  steps: BoardStep[]
}
