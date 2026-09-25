/**
 * Beobachtungsaufträge zu Filmen, Lernvideos und Videos aus dem Netz.
 *
 * Grundlage der Recherche:
 * - kinofenster.de (Filmbildungsportal der bpb): FAQ zum Einsatz im Unterricht, Methoden
 *   „Aufgaben zur Beobachtung“, „Szenenanalyse“, „Einen Film in Kapitel einteilen“,
 *   „Nur den Ton einer Filmszene abspielen“.
 * - VISION KINO, „Praxisleitfaden Film im Fremdsprachenunterricht“ (3. Auflage 2018) und
 *   die Methodensammlung auf visionkino.de.
 * - Länderkonferenz MedienBildung / VISION KINO, „Filmbildung – Kompetenzorientiertes
 *   Konzept für die Schule“ (2009, überarbeitet 2015): die Progression der Filmsprache.
 * - Landesbildungsserver Baden-Württemberg, Bausteine Film im Deutschunterricht
 *   (Erstrezeption, visuelle und akustische Gestaltungsmittel, Montage, Literaturverfilmung).
 * - ZUM-Unterrichten, „Filme im Geschichtsunterricht“ (Typologie nach Michael Sauer).
 * - Landesbildungsserver BW, Gemeinschaftskunde: Erklärvideos; FILM+SCHULE NRW,
 *   „Erklärvideos im Unterricht“.
 * - Brame (2016), CBE Life Sciences Education 15:es6, mit den Primärstudien Lawson u. a.
 *   (2006), Szpunar u. a. (2013), Zhang u. a. (2006), MacHardy & Pardos (2015).
 * - Guo, Kim & Rubin (2014), edX-Daten zur Videolänge; ISB Bayern (klickpunkt.schule);
 *   bpb, Werkstatt Digitale Bildung.
 *
 * ZWEI BEFUNDE, die einander scheinbar widersprechen – und der Grund für `duringPolicy`:
 *
 * 1. Bei FILMEN rät die deutsche Filmdidaktik vom Mitschreiben ab. Notizen entstehen
 *    „direkt nach der Vorführung“ (Landesbildungsserver BW, VISION KINO); Spontaneindrücke
 *    „sollten in der Regel nicht durch zu geschlossene Fragen gelenkt werden“.
 * 2. Bei LERNVIDEOS ist das Gegenteil belegt: Leitfragen während des Schauens hoben die
 *    Testleistung signifikant (Lawson u. a. 2006), eingestreute Zwischenfragen verbesserten
 *    das Behalten und verringerten das Abschweifen (Szpunar u. a. 2013).
 *
 * Der Unterschied ist die Sache selbst: Ein Film wird erlebt und läuft durch; ein Lernvideo
 * wird benutzt, lässt sich anhalten und zurückspulen. Deshalb hängt die Frage, was während
 * des Sehens verlangt wird, an der Videoart – nicht am Jahrgang.
 *
 * Was NICHT belegt ist, steht hier als Faustregel gekennzeichnet: die Abschnittslängen je
 * Jahrgang und die Beobachtungsschwerpunkte der Fächer außerhalb von Deutsch, den
 * Fremdsprachen, Geschichte und Politik. Für diese vier Fächer gibt es Fachquellen, für die
 * übrigen nicht – dort sind die Schwerpunkte aus den allgemeinen Grundsätzen abgeleitet.
 */

export type VideoKind = 'spielfilm' | 'kurzfilm' | 'dokumentation' | 'nachrichten' | 'lernvideo' | 'experiment' | 'reportage'

/** Was während des Sehens verlangt wird. */
export type ViewingDuring = 'auto' | 'keine' | 'ankreuzen' | 'leitfragen'

/** Die drei Phasen. `nach` trägt bei Filmen die Hauptlast. */
export type ViewingPhase = 'vor' | 'waehrend' | 'nach'

export const VIEWING_PHASES: { id: ViewingPhase; label: string; purpose: string }[] = [
  { id: 'vor', label: 'Vor dem Sehen', purpose: 'Vorwissen aktivieren, Begriffe klären, den Beobachtungsauftrag lesen und verstehen.' },
  { id: 'waehrend', label: 'Während des Sehens', purpose: 'Genau ein bis zwei Aspekte beobachten – mehr überfordert.' },
  { id: 'nach', label: 'Nach dem Sehen', purpose: 'Eindrücke festhalten, Beobachtungen zusammentragen, deuten und beurteilen.' }
]

export interface VideoKindInfo {
  id: VideoKind
  label: string
  /** Kurzbeschreibung für die Auswahl */
  description: string
  /**
   * Was bei dieser Art während des Sehens sinnvoll ist.
   * 'keine' und 'ankreuzen' bei Filmen (Erstrezeption nicht durch Fragen lenken),
   * 'leitfragen' bei Lernvideos (empirisch belegt wirksam).
   */
  during: Exclude<ViewingDuring, 'auto'>
  /** Begründung, die im Editor und im KI-Auftrag auftaucht */
  reason: string
  /** true = das Video lässt sich anhalten und zurückspulen (Lernvideo, Netzvideo) */
  replayable: boolean
}

export const VIDEO_KINDS: VideoKindInfo[] = [
  {
    id: 'spielfilm',
    label: 'Spielfilm / Szene aus einem Spielfilm',
    description: 'Erzählender Film; im Unterricht meist als Ausschnitt oder Ganzfilm über mehrere Stunden.',
    during: 'keine',
    reason:
      'Beim ersten Sehen eines Spielfilms wird nicht mitgeschrieben: Notizen entstehen direkt im Anschluss, solange der Eindruck frisch ist (Landesbildungsserver BW, VISION KINO).',
    replayable: false
  },
  {
    id: 'kurzfilm',
    label: 'Kurzfilm',
    description: 'Geschlossener Film unter etwa 15 Minuten – lässt sich in einer Stunde ganz sehen und zweimal zeigen.',
    during: 'ankreuzen',
    reason: 'Ein Kurzfilm lässt sich zweimal zeigen: Der erste Durchgang bleibt frei, im zweiten wird gezielt beobachtet.',
    replayable: true
  },
  {
    id: 'dokumentation',
    label: 'Dokumentarfilm',
    description: 'Dokumentarische Darstellung; im Unterricht auch als Quelle über ihre eigene Entstehungszeit.',
    during: 'ankreuzen',
    reason: 'Beim Dokumentarfilm trägt eine knappe Abhak- oder Tabellenliste mit, ohne den Blick vom Bild zu nehmen.',
    replayable: true
  },
  {
    id: 'nachrichten',
    label: 'Nachrichtenbeitrag',
    description: 'Kurzer journalistischer Beitrag, meist ein bis drei Minuten.',
    during: 'ankreuzen',
    reason: 'Ein Nachrichtenbeitrag ist kurz genug, um ihn zweimal zu zeigen – beim zweiten Mal mit W-Fragen-Tabelle.',
    replayable: true
  },
  {
    id: 'lernvideo',
    label: 'Lern- oder Erklärvideo',
    description: 'Erklärt einen Sachverhalt; wird angehalten, zurückgespult und einzeln geschaut.',
    during: 'leitfragen',
    reason:
      'Leitfragen während des Schauens hoben in Studien die spätere Testleistung, Zwischenfragen verringerten das Abschweifen (Lawson u. a. 2006; Szpunar u. a. 2013, referiert bei Brame 2016).',
    replayable: true
  },
  {
    id: 'experiment',
    label: 'Versuchs- oder Vorgangsvideo',
    description: 'Zeigt einen Versuch, einen Bewegungsablauf oder einen technischen Vorgang.',
    during: 'ankreuzen',
    reason: 'Beobachtung und Protokoll gehören zusammen; das Video lässt sich für jeden Schritt anhalten.',
    replayable: true
  },
  {
    id: 'reportage',
    label: 'Reportage / Magazinbeitrag',
    description: 'Längerer journalistischer Beitrag mit Personen und Schauplätzen.',
    during: 'ankreuzen',
    reason: 'Eine Tabelle zu Personen, Orten und Aussagen trägt durch den Beitrag, ohne zum Mitschreiben zu zwingen.',
    replayable: true
  }
]

export const videoKindById = (id: string): VideoKindInfo | undefined => VIDEO_KINDS.find((k) => k.id === id)

/**
 * Was während des Sehens verlangt wird – entweder ausdrücklich gewählt oder aus der Videoart.
 */
export function duringPolicy(kind: VideoKind, chosen: ViewingDuring | undefined): Exclude<ViewingDuring, 'auto'> {
  if (chosen && chosen !== 'auto') return chosen
  return videoKindById(kind)?.during ?? 'ankreuzen'
}

/**
 * Antwortformate, die während des Sehens tragen.
 *
 * VISION KINO nennt für die Verständnissicherung ausdrücklich: Richtig-/Falschaussagen,
 * Multiple Choice, das Abhaken gehörter oder gesehener Gegenstände und das Ausfüllen einer
 * Tabelle. Freitext steht dort NICHT – wer schreibt, sieht nicht.
 */
export const DURING_ANSWER_KINDS = ['trueFalse', 'multipleChoice', 'matching', 'tableFill'] as const

/**
 * Filmsprache: Was wann eingeführt wird.
 *
 * Das LKM-Konzept staffelt nicht jahrgangsfein, sondern nach drei Abschlüssen – nach
 * Klasse 4, nach dem mittleren Abschluss (Klasse 10) und nach der Sekundarstufe II
 * (Klasse 12), spiralcurricular. Die Kategorien unten sind die des Konzepts.
 *
 * Bemerkenswert und oft unterschätzt: Einstellungsgröße, Kameraperspektive, einfache
 * Kamerabewegung und die Wirkung von Geräuschen, Musik und Sprache gehören dort bereits
 * zum Stand nach Klasse 4.
 */
export type FilmLanguageStage = 'grundschule' | 'sek1' | 'sek2'

export interface FilmLanguageAspect {
  id: string
  label: string
  /** Was auf dieser Stufe verlangt wird (nah am Wortlaut des Konzepts) */
  can: Record<FilmLanguageStage, string>
}

export const FILM_LANGUAGE: FilmLanguageAspect[] = [
  {
    id: 'kamera',
    label: 'Kamera und Bildgestaltung',
    can: {
      grundschule:
        'den Bildaufbau eines Standbildes beschreiben, wichtige Einstellungsgrößen unterscheiden und Kameraperspektiven sowie einfache Kamerabewegungen und ihre Wirkung untersuchen',
      sek1: 'Grundregeln des Bildaufbaus beschreiben, Gestaltungsmittel der Kamera samt Funktion und Wirkung analysieren, Lichtquellen und Lichtrichtung bestimmen',
      sek2: 'Beleuchtungsstil und Farbgestaltung analysieren, besondere Mittel wie Handkamera, Schärfe und Unschärfe, Brennweite und Zoom beurteilen'
    }
  },
  {
    id: 'mise',
    label: 'Mise-en-Scène (was im Bild angeordnet ist)',
    can: {
      grundschule: 'Vorder-, Mittel- und Hintergrund, die Anordnung von Personen und Gegenständen, Handlungsort und Requisiten beschreiben',
      sek1: 'Bedeutung und Wirkung der einzelnen Elemente und ihr Zusammenwirken analysieren',
      sek2: 'die Mise-en-Scène verschiedener Stile vergleichen und im Zusammenhang mit anderen Elementen erörtern'
    }
  },
  {
    id: 'ton',
    label: 'Ton, Musik und Geräusche',
    can: {
      grundschule: 'die unterschiedliche Wirkung von Geräuschen, Musik und Sprache wahrnehmen und beschreiben',
      sek1: 'die Funktion von Atmo, Geräuschen, Musik und Sprache erläutern und Bild-Ton-Beziehungen beschreiben',
      sek2: 'die akustische Gestaltung eines Films analysieren, erörtern und deuten'
    }
  },
  {
    id: 'montage',
    label: 'Montage und Schnitt',
    can: {
      grundschule: 'an Bild-Bild-Kombinationen und einfachen Bildfolgen erkennen, dass durch Montage Bedeutung entsteht',
      sek1: 'Grundprinzipien der Montage an einer Beispielsequenz untersuchen und Montagemuster samt Funktion beschreiben',
      sek2: 'den Stellenwert der Montage anhand von Sequenz- und Filmanalysen erörtern'
    }
  },
  {
    id: 'narration',
    label: 'Erzählweise',
    can: {
      grundschule: 'dargestellte Konflikte und ihre Lösung benennen und zentrale Aussagen erfassen',
      sek1: 'Motivationen der Figuren erörtern und das Modell der dramatischen Drei-Akt-Struktur beschreiben',
      sek2: 'Erzählweisen und Erzählstrukturen analysieren, vergleichen und Deutungsansätze erörtern'
    }
  },
  {
    id: 'aesthetik',
    label: 'Ästhetische Wirkung',
    can: {
      grundschule: 'eigene Gefühle und Eindrücke benennen und begründen',
      sek1: 'ästhetische Wirkungen beschreiben und begründen und den Film als gestaltetes Werk analysieren',
      sek2: 'die ästhetische Gestaltung in ihrer Gesamtheit analysieren und beurteilen'
    }
  }
]

/** Die Stufe des LKM-Konzepts, die zum Jahrgang gehört. */
export function filmLanguageStage(grade: number): FilmLanguageStage {
  if (grade <= 4) return 'grundschule'
  if (grade <= 10) return 'sek1'
  return 'sek2'
}

/** Was auf dieser Stufe an Filmsprache verlangt werden darf – als Zeilen für den KI-Auftrag. */
export function filmLanguageRules(grade: number): string[] {
  const stage = filmLanguageStage(grade)
  return FILM_LANGUAGE.map((a) => `${a.label}: ${a.can[stage]}`)
}

/**
 * Beobachtungsschwerpunkte je Fach – die Aspekte, auf die sich ein Auftrag richten kann
 * und die sich arbeitsteilig auf Gruppen verteilen lassen.
 *
 * `sourced: true` heißt: durch Fachdidaktik belegt (Deutsch, Fremdsprachen, Geschichte,
 * Politik). Bei den übrigen Fächern sind die Schwerpunkte aus den allgemeinen Grundsätzen
 * abgeleitet – brauchbar, aber ohne Quelle.
 */
export interface ObservationFocus {
  id: string
  label: string
  /** Was die Gruppe genau tut */
  task: string
}

interface SubjectFoci {
  /** Fachkennungen aus model/subjects.ts */
  subjects: string[]
  sourced: boolean
  foci: ObservationFocus[]
}

const GENERAL_FOCI: ObservationFocus[] = [
  { id: 'inhalt', label: 'Inhalt', task: 'festhalten, was geschieht: Wer? Wo? Was? Wann? Warum?' },
  { id: 'begriffe', label: 'Fachbegriffe', task: 'die Fachbegriffe notieren, die vorkommen, und ihre Erklärung' },
  { id: 'bild', label: 'Bilder und Darstellung', task: 'festhalten, was gezeigt wird und wie es dargestellt ist (Aufnahmen, Grafiken, Modelle)' },
  { id: 'ton', label: 'Ton und Sprache', task: 'auf Musik, Geräusche und die Art des Sprechens achten' }
]

const SUBJECT_FOCI: SubjectFoci[] = [
  {
    // Landesbildungsserver BW (Bausteine Film), kinofenster.de
    subjects: ['deutsch'],
    sourced: true,
    foci: [
      { id: 'figuren', label: 'Figuren', task: 'eine Figur durchgehend beobachten: Verhalten, Sprache, Beziehungen, Entwicklung' },
      { id: 'kamera', label: 'Kamera', task: 'auf Einstellungsgrößen und Kameraperspektiven achten und festhalten, wann sie sich ändern' },
      { id: 'ton', label: 'Ton und Musik', task: 'auf Musik, Geräusche und Stille achten und festhalten, wo sie die Stimmung tragen' },
      { id: 'farbe', label: 'Farbe und Licht', task: 'festhalten, welche Farben und Lichtstimmungen auffallen und wo' },
      { id: 'montage', label: 'Schnitt', task: 'auf das Tempo der Schnitte achten: Wo wird schnell geschnitten, wo langsam?' },
      { id: 'vorlage', label: 'Vergleich mit der Vorlage', task: 'festhalten, was gegenüber der Textvorlage weggelassen, ergänzt oder verändert wurde' }
    ]
  },
  {
    // VISION KINO, Praxisleitfaden Film im Fremdsprachenunterricht (2018)
    subjects: ['englisch', 'franzoesisch', 'spanisch', 'italienisch', 'latein', 'daz'],
    sourced: true,
    foci: [
      { id: 'global', label: 'Worum es geht', task: 'die Hauptaussage erfassen – ohne auf Einzelheiten zu achten' },
      { id: 'selektiv', label: 'Bestimmte Angaben', task: 'gezielt einzelne Angaben aus den Dialogen entnehmen (Namen, Orte, Zahlen, Verabredungen)' },
      { id: 'wendungen', label: 'Wendungen', task: 'Wendungen und Wörter notieren, die mehrfach vorkommen' },
      {
        id: 'stimmen',
        label: 'Stimmen und Geräusche',
        task: 'darauf achten, wie viele Personen sprechen, ob eine Stimme aus dem Off kommt und welche Geräusche zu hören sind'
      },
      { id: 'bild', label: 'Bild ohne Ton', task: 'nur auf das Bild achten und daraus erschließen, worum es geht' }
    ]
  },
  {
    // ZUM-Unterrichten, „Filme im Geschichtsunterricht“ (Typologie nach Michael Sauer)
    subjects: ['geschichte'],
    sourced: true,
    foci: [
      { id: 'darstellung', label: 'Was dargestellt wird', task: 'festhalten, welche Ereignisse, Personen und Orte gezeigt werden' },
      {
        id: 'mittel',
        label: 'Mit welchen Mitteln',
        task: 'beobachten, mit welchen filmischen Mitteln die Wirkung erzeugt wird (Musik, Kommentar, Schnitt, Nachstellungen)'
      },
      { id: 'quelle', label: 'Quelle oder Nachstellung', task: 'unterscheiden, was zeitgenössische Aufnahme und was heutige Nachstellung ist' },
      { id: 'kommentar', label: 'Kommentar', task: 'festhalten, was der Kommentar deutet und was das Bild allein zeigt' },
      { id: 'auslassung', label: 'Was fehlt', task: 'festhalten, welche Sichtweisen oder Gruppen nicht vorkommen' }
    ]
  },
  {
    // Landesbildungsserver BW (Gemeinschaftskunde, Erklärvideos); FILM+SCHULE NRW
    subjects: ['politik'],
    sourced: true,
    foci: [
      { id: 'position', label: 'Positionen', task: 'festhalten, wer spricht und welche Position vertreten wird' },
      { id: 'beleg', label: 'Belege', task: 'notieren, welche Zahlen, Quellen und Belege genannt werden – und welche nicht' },
      { id: 'auswahl', label: 'Auswahl', task: 'festhalten, wer zu Wort kommt und wer nicht' },
      { id: 'sprache', label: 'Wortwahl', task: 'auf wertende Wörter und Bilder achten' },
      { id: 'richtigkeit', label: 'Richtigkeit', task: 'die Aussagen notieren, die nachzuprüfen wären' }
    ]
  },
  {
    subjects: ['biologie', 'chemie', 'physik', 'informatik'],
    sourced: false,
    foci: [
      { id: 'aufbau', label: 'Aufbau', task: 'Geräte und Aufbau festhalten – skizzieren, was zu sehen ist' },
      { id: 'ablauf', label: 'Ablauf', task: 'die Schritte in der richtigen Reihenfolge festhalten' },
      { id: 'beobachtung', label: 'Beobachtung', task: 'nur notieren, was zu sehen ist – noch nicht, warum' },
      { id: 'groessen', label: 'Größen', task: 'genannte Messwerte, Einheiten und Bedingungen notieren' },
      { id: 'sicherheit', label: 'Sicherheit', task: 'festhalten, welche Sicherheitsmaßnahmen zu sehen sind' }
    ]
  },
  {
    subjects: ['mathematik'],
    sourced: false,
    foci: [
      { id: 'schritte', label: 'Rechenschritte', task: 'die Schritte des Lösungswegs in der gezeigten Reihenfolge notieren' },
      { id: 'begruendung', label: 'Begründungen', task: 'festhalten, womit jeder Schritt begründet wird' },
      { id: 'darstellung', label: 'Darstellung', task: 'festhalten, welche Darstellungen benutzt werden (Skizze, Tabelle, Graph, Term)' },
      { id: 'stolperstelle', label: 'Stolperstellen', task: 'die Stelle notieren, an der das Video besonders langsam wird oder warnt' }
    ]
  },
  {
    subjects: ['erdkunde'],
    sourced: false,
    foci: [
      { id: 'raum', label: 'Raum', task: 'festhalten, wo der Beitrag spielt und woran man das erkennt' },
      { id: 'natur', label: 'Naturfaktoren', task: 'auf Klima, Relief, Wasser und Vegetation achten' },
      { id: 'mensch', label: 'Nutzung', task: 'festhalten, wie die Menschen den Raum nutzen' },
      { id: 'konflikt', label: 'Interessen', task: 'festhalten, welche Interessen aufeinandertreffen' }
    ]
  },
  {
    subjects: ['kunst', 'musik'],
    sourced: false,
    foci: [
      { id: 'musik', label: 'Musik', task: 'beschreiben, wie die Musik klingt und welche Gefühle und Bilder sie auslöst' },
      { id: 'farbe', label: 'Farbe und Licht', task: 'festhalten, welche Farben und Lichtstimmungen vorkommen' },
      { id: 'bildaufbau', label: 'Bildaufbau', task: 'festhalten, wie die Bilder aufgebaut sind (Vorder-, Mittel-, Hintergrund)' },
      { id: 'rhythmus', label: 'Rhythmus', task: 'auf das Verhältnis von Musik und Schnitt achten' }
    ]
  },
  {
    subjects: ['sport'],
    sourced: false,
    foci: [
      { id: 'phasen', label: 'Bewegungsphasen', task: 'die Bewegung in Vorbereitung, Hauptteil und Abschluss gliedern' },
      { id: 'merkmale', label: 'Merkmale', task: 'auf ein Merkmal achten (z. B. Armzug, Absprung, Körperhaltung)' },
      { id: 'fehler', label: 'Abweichungen', task: 'festhalten, wo die Ausführung von der Beschreibung abweicht' },
      { id: 'taktik', label: 'Spielverhalten', task: 'festhalten, wie sich die Spielenden ohne Ball verhalten' }
    ]
  },
  {
    subjects: ['religion', 'werte-und-normen'],
    sourced: false,
    foci: [
      { id: 'entscheidung', label: 'Entscheidungen', task: 'festhalten, vor welcher Entscheidung eine Figur steht und wie sie entscheidet' },
      { id: 'werte', label: 'Werte', task: 'festhalten, welche Werte und Überzeugungen sichtbar werden' },
      { id: 'perspektive', label: 'Sichtweisen', task: 'festhalten, welche Sichtweisen aufeinandertreffen' },
      { id: 'symbol', label: 'Zeichen und Symbole', task: 'auf Zeichen, Symbole und Rituale achten' }
    ]
  },
  {
    subjects: ['sachunterricht'],
    sourced: false,
    foci: [
      { id: 'was', label: 'Was zu sehen ist', task: 'ankreuzen, was im Film vorkommt' },
      { id: 'reihenfolge', label: 'Reihenfolge', task: 'die Bilder in die richtige Reihenfolge bringen' },
      { id: 'geraeusche', label: 'Geräusche', task: 'abhaken, welche Geräusche zu hören sind' },
      { id: 'frage', label: 'Frage', task: 'aufschreiben, was du noch wissen möchtest' }
    ]
  }
]

/** Beobachtungsschwerpunkte für ein Fach; unbekannte Fächer bekommen die allgemeinen. */
export function observationFoci(subjectId: string): { foci: ObservationFocus[]; sourced: boolean } {
  const entry = SUBJECT_FOCI.find((s) => s.subjects.includes(subjectId))
  if (!entry) return { foci: GENERAL_FOCI, sourced: false }
  return { foci: entry.foci, sourced: entry.sourced }
}

/**
 * Empfohlene Länge eines Videoabschnitts am Stück.
 *
 * FAUSTREGEL, NICHT BELEGT. Belegt ist nur die Richtung – „vor allem Schüler*innen unterer
 * Klassenstufen sollten langsam an das Medium Film herangeführt werden, es bietet sich an,
 * Langfilme in kürzeren Abschnitten zu sehen“ (VISION KINO) – und die Größenordnung für
 * Analyseeinheiten: eine zu analysierende Szene soll nicht länger als fünf Minuten sein
 * (kinofenster.de). Eine jahrgangsgestufte Minutentabelle findet sich in keiner Quelle.
 */
export function sectionMinutes(grade: number): { range: [number, number]; heuristic: true } {
  if (grade <= 4) return { range: [3, 5], heuristic: true }
  if (grade <= 7) return { range: [5, 8], heuristic: true }
  if (grade <= 10) return { range: [8, 12], heuristic: true }
  return { range: [15, 20], heuristic: true }
}

/**
 * Empfohlene Länge eines Lernvideos.
 *
 * Guo, Kim & Rubin (2014) an edX-Daten: „median engagement time is at most 6 minutes,
 * regardless of total video length“; jenseits von neun Minuten kommen die Lernenden oft
 * nicht bis zur Hälfte. ISB Bayern nennt höchstens sechs Minuten, die bpb drei bis sechs.
 *
 * Die Regel ist nicht unbestritten – „The myth of the six minute rule“ (ASEE) widerspricht.
 * Deshalb steht sie als Hinweis auf dem Lehrerteil, nicht als Sperre.
 */
export const LEARNING_VIDEO_MINUTES: [number, number] = [3, 6]

/**
 * Untertitel in den Fremdsprachen.
 *
 * VISION KINO, Praxisleitfaden: Untertitel in der eigenen Muttersprache lenken von den
 * fremdsprachlichen Dialogen ab; Untertitel in der Zielsprache haben dagegen einen
 * positiven Effekt auf den Wortschatzerwerb. Empfohlen wird ein zeitweiser Einsatz –
 * einzelne, zentrale Szenen – damit nicht reines Leseverstehen trainiert wird.
 */
export type SubtitleMode = 'keine' | 'zielsprache' | 'deutsch'

export const SUBTITLE_OPTIONS: { value: SubtitleMode; label: string; note: string }[] = [
  { value: 'keine', label: 'ohne Untertitel', note: 'Das Erlebnis, sich auf einen nicht untertitelten Film einzulassen, gehört dazu.' },
  {
    value: 'zielsprache',
    label: 'Untertitel in der Zielsprache',
    note: 'Belegt förderlich für den Wortschatzerwerb – am besten nur in einzelnen, zentralen Szenen.'
  },
  { value: 'deutsch', label: 'deutsche Untertitel', note: 'Lenken von den fremdsprachlichen Dialogen ab; nur, wenn das Verstehen sonst scheitert.' }
]

/**
 * Hinweis zum Urheberrecht für die Lehrerseite.
 *
 * Quelle: FAQ „Was darf ich in der Filmbildung?“, FILM+SCHULE NRW, verfasst vom Institut
 * für Medienrecht der Universität zu Köln (Stand 08.11.2023), sowie § 60a UrhG.
 *
 * Das ist ein Hinweis, keine Rechtsberatung – die Lage ist in Teilen ausdrücklich
 * umstritten, ein höchstrichterliches Urteil steht aus.
 */
export const COPYRIGHT_NOTE = [
  '§ 60a UrhG erlaubt für den Unterricht bis zu 15 % eines Werkes; kurze Videos dürfen ganz gezeigt werden.',
  'Der Unterricht im Klassenverband gilt nach überwiegender Auffassung als nicht öffentlich – bei klassen- oder kursübergreifenden Vorführungen und Schulfesten gilt das nicht.',
  'Beim Streamen vor der Klasse darauf achten, dass das Video nicht offensichtlich unbefugt hochgeladen wurde; Werbung und Empfehlungsleiste vorher prüfen.',
  'In eine schulweit zugängliche Lernplattform dürfen Filme und Ausschnitte nicht eingestellt werden – nur für die eigene Lerngruppe.',
  'Der sichere Weg sind die Landesmediatheken und kommunalen Medienzentren; deren Filme sind für die Bildungsarbeit freigegeben.'
]

/**
 * Hinweise zum QR-Code.
 *
 * Belegt (Ralf Krause, Zentrum für Medienbildung; Stegbauer/Brütt, Joachim Herz Stiftung;
 * einfach-lehrer.de): Codes vorher mit mehreren Lesegeräten prüfen und testweise ausdrucken,
 * nicht zu klein setzen, bei Videos Kopfhörer bereitlegen, auf Werbefreiheit achten.
 *
 * Der Klartextlink unter dem Code ist NICHT belegt, aber die einzige Antwort auf die Frage,
 * was Lernende ohne eigenes Gerät tun: Am Klassenrechner oder zu Hause lässt sich ein
 * getippter Link öffnen, ein gedruckter Code nicht.
 */
export const QR_NOTE = [
  'Den Code vor dem Vervielfältigen testweise ausdrucken und mit einem Lesegerät prüfen.',
  'Kopfhörer bereitlegen, wenn mehrere gleichzeitig schauen.',
  'Vorher prüfen, ob vor dem Video Werbung läuft.',
  'Der Link steht im Klartext unter dem Code – so kommen auch Lernende ohne eigenes Gerät am Klassenrechner hin.'
]

/** Die Bezeichnungen der Beobachtergruppen. */
export const GROUP_LABELS = ['A', 'B', 'C', 'D'] as const

export const groupLabel = (index: number): string => GROUP_LABELS[index] ?? String(index + 1)
