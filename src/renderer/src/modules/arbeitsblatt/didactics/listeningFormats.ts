/**
 * Hörtextsorten für Hörverstehensaufgaben und die Regeln, nach denen sie gebaut werden.
 *
 * Grundlage der Recherche:
 * - QUA-LiS NRW, Handreichung „Hörverstehen im Abitur und in der gymnasialen Oberstufe“
 *   (gültig ab Abitur 2025) – die am stärksten operationalisierte Quelle: Textsortenlisten
 *   nach monologisch/dialogisch, Sprecherperformanz, Item-Konstruktionsprinzipien, Zeiten.
 * - KMK-Bildungsstandards erste Fremdsprache MSA (2003), ESA/MSA (2023) und fortgeführte
 *   Fremdsprache Allgemeine Hochschulreife (2012).
 * - Hinweise zum Hörverstehen im Abitur Mecklenburg-Vorpommern und Schleswig-Holstein.
 * - GER-Begleitband (2020): Skalen zum Hörverstehen – er nennt bewusst KEINE Wörter je Minute,
 *   sondern beschreibt das Tempo qualitativ („very slow and carefully articulated“ bis
 *   „natural speed“).
 * - Prüfungsformate Cambridge (A2 Key, B1 Preliminary, B2 First), DELF junior/scolaire,
 *   DELE, Goethe-Zertifikat A1.
 * - Fachdidaktik: Solmecke (2000) Schwierigkeitsfaktoren, Porsch/Grotjahn/Tesch (2010),
 *   Buck (2001), Field (2008/2019), Tauroza & Allison (1990), Griffiths (1990/1992).
 *
 * Wo die Quellen Zahlen nennen, stehen sie hier. Wo sie nur qualitativ formulieren
 * (vor allem beim Sprechtempo), ist der Wert als Faustregel gekennzeichnet.
 */
import type { CefrLevel } from '@shared/types'
import { levelAtLeast } from '../../../shared/cefr'

export type ListeningMode = 'monolog' | 'dialog'

/** Hörabsicht nach der NRW-Handreichung */
export type ListeningPurpose = 'global' | 'selektiv' | 'detailliert' | 'inferierend'

export interface ListeningFormat {
  id: string
  label: string
  /** Bezeichnung in den Prüfungsunterlagen – geht so in den KI-Auftrag */
  english: string
  mode: ListeningMode
  /** Ab diesem GER-Niveau ist die Textsorte belegt sinnvoll */
  minLevel: CefrLevel
  /** Spieldauer in Sekunden (von, bis) */
  seconds: [number, number]
  /** Zahl der Sprechenden (von, bis) */
  speakers: [number, number]
  /** Wofür sich die Textsorte didaktisch eignet */
  purposes: ListeningPurpose[]
  /** Kurzbeschreibung für die Auswahl in der Oberfläche */
  description: string
  /** Bauanleitung für die KI */
  construction: string
}

/**
 * Die Textsorten. Die Reihenfolge ist die des Niveaus – so steht in der Auswahl oben,
 * was für jüngere Lerngruppen passt.
 */
export const LISTENING_FORMATS: ListeningFormat[] = [
  {
    id: 'voicemail',
    label: 'Nachricht auf der Mailbox',
    english: 'voicemail message',
    mode: 'monolog',
    minLevel: 'A1',
    seconds: [20, 45],
    speakers: [1, 1],
    purposes: ['selektiv'],
    description: 'Jemand hinterlässt eine Nachricht mit Uhrzeit, Ort und Telefonnummer.',
    construction:
      'Eine einzige Person spricht auf den Anrufbeantworter. Sie nennt ihren Namen, den Anlass und zwei bis drei genaue Angaben (Uhrzeit, Ort, Telefonnummer, Tag). Die Angaben stehen nicht am Satzanfang und werden einmal wiederholt oder bestätigt.'
  },
  {
    id: 'announcement',
    label: 'Durchsage / Ansage',
    english: 'public announcement',
    mode: 'monolog',
    minLevel: 'A1',
    seconds: [15, 40],
    speakers: [1, 1],
    purposes: ['selektiv'],
    description: 'Ansage am Bahnhof, Flughafen, im Kaufhaus oder in der Schule.',
    construction:
      'Eine Durchsage nennt Ort, Zeit und eine Handlungsanweisung (Gleiswechsel, Treffpunkt, Angebot). Kurze Hauptsätze, kein Nebensatzgefüge. Der Anlass steht im ersten Satz.'
  },
  {
    id: 'everyday-dialogue',
    label: 'Alltagsgespräch',
    english: 'short everyday conversation',
    mode: 'dialog',
    minLevel: 'A1',
    seconds: [30, 75],
    speakers: [2, 2],
    purposes: ['selektiv', 'global'],
    description: 'Kurzes Gespräch im Laden, im Café, auf dem Schulhof.',
    construction:
      'Zwei klar unterscheidbare Personen (eine jüngere, eine ältere Stimme) sprechen über eine alltägliche Sache. Kurze Redebeiträge im Wechsel, Rückfragen und Bestätigungen („Sorry, when?“ – „At four.“).'
  },
  {
    id: 'snippets',
    label: 'Mehrere kurze Beiträge zu einem Thema',
    english: 'set of short recordings on one topic',
    mode: 'monolog',
    minLevel: 'A2',
    seconds: [20, 40],
    speakers: [1, 1],
    purposes: ['global'],
    description: 'Fünf bis acht kurze Stimmen zum selben Thema – für Zuordnungsaufgaben.',
    construction:
      'Fünf bis acht voneinander unabhängige Kurzbeiträge unter einem gemeinsamen Thema; jeder Beitrag von einer eigenen Person, jeweils 20 bis 40 Sekunden. Jeder Beitrag hat genau eine Kernaussage, die nicht mit dem Signalwort der Lösung anfängt.'
  },
  {
    id: 'directions',
    label: 'Wegbeschreibung',
    english: 'giving directions',
    mode: 'dialog',
    minLevel: 'A2',
    seconds: [30, 60],
    speakers: [1, 2],
    purposes: ['selektiv'],
    description: 'Weg zu Fuß oder mit Bus und Bahn.',
    construction:
      'Die Beschreibung folgt streng der tatsächlichen Reihenfolge des Weges. Höchstens fünf Schritte, jeder mit einem klaren Bezugspunkt (Ampel, Kirche, Haltestelle).'
  },
  {
    id: 'weather',
    label: 'Wetterbericht',
    english: 'weather forecast',
    mode: 'monolog',
    minLevel: 'A2',
    seconds: [30, 50],
    speakers: [1, 1],
    purposes: ['selektiv'],
    description: 'Wetter für mehrere Orte oder Tage – gut für eine Tabelle.',
    construction:
      'Drei bis fünf Orte oder Tage nacheinander, je mit Wetterlage und Temperatur. Die Temperaturen sind ausgeschrieben („eighteen degrees“), nicht als Ziffern.'
  },
  {
    id: 'advert',
    label: 'Werbespot',
    english: 'radio advert',
    mode: 'monolog',
    minLevel: 'A2',
    seconds: [20, 40],
    speakers: [1, 2],
    purposes: ['global'],
    description: 'Kurzer Spot – wofür wird geworben?',
    construction:
      'Der Spot nennt das Angebot nie direkt beim erwarteten Oberbegriff, sondern beschreibt es; so prüft die Aufgabe Verstehen statt Wiedererkennen. Ein Preis oder ein Datum kommt vor.'
  },
  {
    id: 'phone-call',
    label: 'Telefongespräch',
    english: 'phone call',
    mode: 'dialog',
    minLevel: 'A2',
    seconds: [45, 120],
    speakers: [2, 2],
    purposes: ['selektiv', 'detailliert'],
    description: 'Verabredung, Auskunft, Buchung oder Absage am Telefon.',
    construction:
      'Zwei Personen klären eine Sache (Termin, Bestellung, Auskunft). Am Ende steht ein Ergebnis, das sich von dem unterscheidet, was zu Beginn vorgeschlagen wurde – sonst genügt Raten.'
  },
  {
    id: 'voice-message',
    label: 'Sprachnachricht / Audioblog',
    english: 'voice message',
    mode: 'monolog',
    minLevel: 'A2',
    seconds: [30, 90],
    speakers: [1, 1],
    purposes: ['selektiv', 'inferierend'],
    description: 'Persönliche Sprachnachricht – auch Stimmung und Haltung sind hörbar.',
    construction:
      'Eine Person erzählt einem Freund oder einer Freundin von etwas Erlebtem. Die Haltung (froh, enttäuscht, unsicher) wird nicht benannt, sondern zeigt sich an dem, was gesagt wird.'
  },
  {
    id: 'radio-news',
    label: 'Radionachricht',
    english: 'radio news item',
    mode: 'monolog',
    minLevel: 'B1',
    seconds: [45, 90],
    speakers: [1, 1],
    purposes: ['selektiv', 'global'],
    description: 'Eine oder mehrere Kurzmeldungen aus dem Radio.',
    construction: 'Jede Meldung beantwortet Wer, Was, Wo, Wann. Zahlen und Eigennamen kommen genau einmal vor und werden deutlich gesprochen.'
  },
  {
    id: 'story',
    label: 'Erzählung / Anekdote',
    english: 'short narrative',
    mode: 'monolog',
    minLevel: 'B1',
    seconds: [90, 180],
    speakers: [1, 1],
    purposes: ['global', 'detailliert'],
    description: 'Jemand erzählt, was passiert ist.',
    construction:
      'Die Erzählung folgt der tatsächlichen Reihenfolge der Ereignisse. Ein überraschender Schluss, der sich aus dem Erzählten ergibt und nicht erraten werden kann.'
  },
  {
    id: 'interview',
    label: 'Interview',
    english: 'interview',
    mode: 'dialog',
    minLevel: 'B1',
    seconds: [90, 240],
    speakers: [2, 2],
    purposes: ['detailliert', 'inferierend'],
    description: 'Moderation und Gast – Fragen, Antworten, Haltung.',
    construction:
      'Die moderierende Person fragt, die befragte antwortet ausführlicher. Die Rollen sind zu Beginn benannt. Mindestens eine Antwort weicht von der Erwartung der Frage ab, damit Haltungen erschlossen werden müssen.'
  },
  {
    id: 'podcast',
    label: 'Podcast-Ausschnitt',
    english: 'podcast extract',
    mode: 'dialog',
    minLevel: 'B1',
    seconds: [120, 300],
    speakers: [1, 3],
    purposes: ['global', 'detailliert', 'inferierend'],
    description: 'Ausschnitt aus einer Folge – allein gesprochen oder im Gespräch.',
    construction:
      'Der Ausschnitt beginnt mit einer kurzen Einordnung („In this episode …“) und behandelt genau einen Aspekt. Keine Rückverweise auf frühere Folgen, die niemand kennt.'
  },
  {
    id: 'audioguide',
    label: 'Führung / Audioguide',
    english: 'audio guide',
    mode: 'monolog',
    minLevel: 'B1',
    seconds: [90, 180],
    speakers: [1, 1],
    purposes: ['selektiv', 'global'],
    description: 'Erklärung an einem Ort, in einem Museum oder auf einer Führung.',
    construction: 'Die Führung geht von Station zu Station. Jahreszahlen und Maße kommen vor und sind ausgeschrieben.'
  },
  {
    id: 'talk',
    label: 'Kurzvortrag / Präsentation',
    english: 'short talk',
    mode: 'monolog',
    minLevel: 'B1',
    seconds: [90, 300],
    speakers: [1, 1],
    purposes: ['global', 'detailliert'],
    description: 'Klar gegliederter Vortrag zu einem Thema.',
    construction:
      'Der Vortrag hat eine hörbare Gliederung („First … Second … Finally …“). Jeder Abschnitt trägt genau einen Gedanken. Der GER kennt für Vorträge erst ab B1 Deskriptoren – darunter nicht einsetzen.'
  },
  {
    id: 'report',
    label: 'Reportage / Hintergrundbericht',
    english: 'radio report',
    mode: 'dialog',
    minLevel: 'B2',
    seconds: [180, 300],
    speakers: [2, 4],
    purposes: ['detailliert', 'inferierend'],
    description: 'Bericht mit Moderation und O-Tönen.',
    construction:
      'Eine berichtende Stimme führt durch den Beitrag, zwei bis drei O-Töne kommen zu Wort. Die O-Töne widersprechen sich teilweise; die Auflösung steht nicht im Text.'
  },
  {
    id: 'discussion',
    label: 'Diskussion / Debatte',
    english: 'discussion',
    mode: 'dialog',
    minLevel: 'B2',
    seconds: [180, 300],
    speakers: [2, 3],
    purposes: ['inferierend', 'detailliert'],
    description: 'Mehrere Positionen zu einer Streitfrage.',
    construction:
      'Jede Person vertritt eine erkennbare Position und begründet sie mit einem eigenen Argument. Die Beiträge sind bis B2 klar voneinander abgegrenzt; erst ab C1 gibt es kurze Überlappungen und Unterbrechungen.'
  },
  {
    id: 'commentary',
    label: 'Kommentar / Meinungsbeitrag',
    english: 'commentary',
    mode: 'monolog',
    minLevel: 'B2',
    seconds: [120, 240],
    speakers: [1, 1],
    purposes: ['inferierend'],
    description: 'Eine Person bewertet ein Geschehen.',
    construction: 'Die Wertung steht nicht als Urteilssatz da, sondern ergibt sich aus Wortwahl, Beispielen und Betonung.'
  },
  {
    id: 'audiobook',
    label: 'Hörbuch / Hörspiel',
    english: 'audiobook extract',
    mode: 'dialog',
    minLevel: 'B2',
    seconds: [180, 300],
    speakers: [1, 4],
    purposes: ['global', 'inferierend'],
    description: 'Literarischer Ausschnitt, gelesen oder gespielt.',
    construction: 'Der Ausschnitt ist für sich verständlich: Personen und Ort werden im ersten Absatz eingeführt.'
  },
  {
    id: 'lecture',
    label: 'Vorlesung / Fachvortrag',
    english: 'lecture',
    mode: 'monolog',
    minLevel: 'C1',
    seconds: [240, 300],
    speakers: [1, 1],
    purposes: ['detailliert'],
    description: 'Fachvortrag zum Mitschreiben.',
    construction: 'Dichte Folge von Aspekten ohne Wiederholung, mit Fachbegriffen, die im Vortrag selbst erklärt werden.'
  }
]

export const listeningFormatById = (id: string): ListeningFormat | undefined => LISTENING_FORMATS.find((f) => f.id === id)

/** Textsorten, die auf diesem Niveau sinnvoll sind. */
export function listeningFormatsFor(level: CefrLevel): ListeningFormat[] {
  return LISTENING_FORMATS.filter((f) => levelAtLeast(level, f.minLevel))
}

/**
 * Sprechtempo, Länge und Rahmenbedingungen je Niveau.
 *
 * Länge, Zahl der Durchgänge, Lese- und Pausenzeiten sind aus den Prüfungsvorgaben belegt
 * (NRW, MV, SH, DELF, Cambridge). Die Wörter je Minute sind eine **Faustregel**: GER, KMK und
 * die Länder beschreiben das Tempo nur qualitativ. Die Werte leiten sich aus Griffiths
 * (100/150/200 WpM im Experiment) und den Bändern von Tauroza & Allison (1990) ab.
 */
export interface ListeningLevelRules {
  seconds: [number, number]
  /** Wörter je Minute (Faustregel) */
  wpm: [number, number]
  speakers: [number, number]
  /** Zahl der Hördurchgänge – Standard sind zwei */
  plays: number
  /** Items je Hörtext */
  items: [number, number]
  /** Verzögerungsphänomene („well …“, Selbstkorrekturen) */
  hesitations: 'keine' | 'vereinzelt' | 'natürlich'
  /** Hintergrundgeräusche */
  noise: 'keine' | 'nur zu Beginn' | 'erlaubt'
}

export function listeningRules(level: CefrLevel): ListeningLevelRules {
  if (!levelAtLeast(level, 'A2')) {
    return { seconds: [30, 60], wpm: [85, 100], speakers: [1, 2], plays: 2, items: [4, 6], hesitations: 'keine', noise: 'keine' }
  }
  if (!levelAtLeast(level, 'B1')) {
    return { seconds: [45, 90], wpm: [100, 120], speakers: [1, 2], plays: 2, items: [5, 8], hesitations: 'keine', noise: 'nur zu Beginn' }
  }
  if (!levelAtLeast(level, 'B2')) {
    return { seconds: [90, 180], wpm: [120, 140], speakers: [2, 3], plays: 2, items: [6, 10], hesitations: 'vereinzelt', noise: 'nur zu Beginn' }
  }
  if (!levelAtLeast(level, 'C1')) {
    return { seconds: [180, 300], wpm: [140, 165], speakers: [2, 3], plays: 2, items: [9, 12], hesitations: 'natürlich', noise: 'erlaubt' }
  }
  return { seconds: [240, 300], wpm: [165, 190], speakers: [3, 4], plays: 2, items: [9, 12], hesitations: 'natürlich', noise: 'erlaubt' }
}

/** Wie viele Hörtexte das Blatt bekommt (mindestens einer, höchstens drei). */
export function listeningCount(meta: { audioCount?: number }): number {
  return Math.min(3, Math.max(1, Math.round(meta.audioCount ?? 1)))
}

/** Obergrenze für einen einzelnen Hörtext (KMK Abitur 2012; NRW, MV, SH: „in der Regel fünf Minuten"). */
export const MAX_LISTENING_SECONDS = 300
/** Grenzen des Reglers für die selbst gewählte Länge */
export const LISTENING_SECONDS_RANGE = { min: 20, max: MAX_LISTENING_SECONDS, step: 10 }

/**
 * Spieldauer eines Hörtextes: eigene Vorgabe der Lehrkraft, sonst der Bereich des Niveaus.
 * Eine eigene Vorgabe wird als Punktwert behandelt, mit etwas Spielraum nach oben und unten.
 */
export function listeningSeconds(level: CefrLevel, chosen?: number): [number, number] {
  if (!chosen || chosen <= 0) return listeningRules(level).seconds
  const s = Math.min(MAX_LISTENING_SECONDS, Math.max(LISTENING_SECONDS_RANGE.min, Math.round(chosen)))
  return [Math.round(s * 0.85), Math.round(s * 1.15)]
}

/** Zielwortzahl aus Dauer und Tempo; romanische Sprachen brauchen für dieselbe Zeit mehr Wörter. */
export function listeningWords(level: CefrLevel, language?: string, chosenSeconds?: number): [number, number] {
  const r = listeningRules(level)
  const [from, to] = listeningSeconds(level, chosenSeconds)
  const factor = language && ['fr', 'es', 'it'].includes(language) ? 1.12 : 1
  const mid = (r.wpm[0] + r.wpm[1]) / 2
  return [Math.round(((from * mid) / 60) * factor), Math.round(((to * mid) / 60) * factor)]
}

/**
 * Textsorte, die die App vorschlägt, wenn die Lehrkraft „automatisch“ stehen lässt.
 * Sie wechselt mit dem Thema, bleibt aber im Rahmen des Niveaus.
 */
export function suggestListeningFormat(level: CefrLevel, seed = 0): ListeningFormat {
  const fits = listeningFormatsFor(level).filter((f) => f.seconds[0] <= listeningRules(level).seconds[1])
  return fits[Math.abs(Math.round(seed)) % Math.max(1, fits.length)] ?? LISTENING_FORMATS[0]
}
