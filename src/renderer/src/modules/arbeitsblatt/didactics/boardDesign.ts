/**
 * Aufbau eines Tafelbildes.
 *
 * Ein Tafelbild im DIN-A4-Hochformat ist nicht bloß schmal, es ist didaktisch falsch: Die
 * Standard-Mitteltafel misst 200 × 100 cm, ist also **doppelt so breit wie hoch**; mit
 * aufgeklappten Flügeln 400 × 100 cm. Gleichzeitig gilt eine gegenläufige Bedingung, die in
 * der Literatur ausdrücklich steht: Der abzuschreibende Kern muss ins **Heft (A4)** passen.
 * Beides zusammen ergibt: breite Fläche, darin ein markierter Kern in A4 quer.
 *
 * Grundlage der Recherche:
 * - Sitte, W.: „Die Wandtafel als Arbeitsmittel", in: Beiträge zur Didaktik des GW-Unterrichts,
 *   Wien 2001, S. 531–544 – die ausführlichste Quelle: Format, Farbe, Schriftgröße, Reduktion,
 *   Mitschreibbarkeit, Skizzenregeln.
 * - JLU Gießen, Didaktik der Geschichte: „Kriterien für ein gutes Tafelbild" und „Zeitleisten".
 * - Universität Hamburg: Workshop „Das Tafelbild zur Gestaltung von Unterricht" (2017) –
 *   Dreifeld-Logik der Klapptafel.
 * - Brüning/Saum: „Visualisieren als Strategie erfolgreichen Unterrichts" (2022) – die
 *   Strukturformen und die Warnung, nicht alles „Mindmap" zu nennen.
 * - Einecke, G.: Tafelbild (Fachdidaktik Deutsch) – Leserichtung, Abschreibregeln.
 * - ZPG Geographie Baden-Württemberg: Methodenblatt Wirkungsgefüge (Querformat vorgeschrieben).
 * - LISA Sachsen-Anhalt: Checkliste digitale Tafelbilder (Barrierefreiheit, schrittweise
 *   Enthüllung).
 */

export type BoardFormat = 'mitteltafel' | 'volltafel' | 'display' | 'heftseite'

export interface BoardFormatInfo {
  value: BoardFormat
  label: string
  /** Breite geteilt durch Höhe */
  ratio: number
  description: string
}

export const BOARD_FORMATS: BoardFormatInfo[] = [
  {
    value: 'mitteltafel',
    label: 'Mitteltafel (200 × 100 cm)',
    ratio: 2,
    description: 'Der Regelfall: die breite Mittelfläche der Klapptafel, doppelt so breit wie hoch.'
  },
  {
    value: 'volltafel',
    label: 'Tafel mit aufgeklappten Flügeln (400 × 100 cm)',
    ratio: 4,
    description: 'Sehr breit – nur sinnvoll, wenn die Flügel wirklich mitgeplant sind, etwa für eine lange Zeitleiste.'
  },
  {
    value: 'display',
    label: 'Digitale Tafel oder Beamer (16:9)',
    ratio: 16 / 9,
    description: 'Schmaler als die Mitteltafel: lieber zwei Spalten als drei, und alles muss ohne Scrollen sichtbar bleiben.'
  },
  {
    value: 'heftseite',
    label: 'A4 quer – zum Übertragen ins Heft',
    ratio: 297 / 210,
    description: 'Wenn das Tafelbild genau so ins Heft soll.'
  }
]

export const boardFormatInfo = (value?: BoardFormat): BoardFormatInfo => BOARD_FORMATS.find((f) => f.value === value) ?? BOARD_FORMATS[0]

/**
 * Die Tafelbilder eines Blattes – ältere Blätter haben nur ein einzelnes.
 * Je Format gibt es genau eines.
 */
export function boardList<T extends { format?: BoardFormat }>(ws: { board?: T | null; boards?: T[] }): T[] {
  if (ws.boards?.length) return ws.boards
  return ws.board ? [ws.board] : []
}

/** Die Formate, für die es ein Tafelbild gibt. */
export function chosenFormats(ws: { board?: { format?: BoardFormat } | null; boards?: { format?: BoardFormat }[] }): BoardFormat[] {
  const list = boardList(ws).map((b) => b.format ?? 'mitteltafel')
  return list.length ? [...new Set(list)] : ['mitteltafel']
}

/**
 * Wie viel auf die Mittelfläche passt.
 * Gerechnet auf 200 × 100 cm bei 5 cm Versalhöhe (Sitte) und 2,5 cm Zeilenabstand.
 */
export const BOARD_CAPACITY = {
  /** Zeilen auf der Mittelfläche, Überschrift und Rand abgezogen */
  maxLines: 12,
  /** Zeichen je Zeile, mit Reserve */
  maxCharsPerLine: 50,
  /** Felder oder Kästen auf der Mittelfläche */
  maxBlocks: 4,
  /** Versalhöhe in Millimetern – aus der letzten Reihe muss es lesbar sein */
  minCapHeightMm: 50,
  /** Farben einschließlich der Grundfarbe; jede braucht eine Bedeutung */
  maxColours: 3
}

export interface BoardStructure {
  id: string
  label: string
  /** Fächer, für die die Form belegt ist; leer = alle */
  subjects: string[]
  /** Wofür die Form taugt */
  purpose: string
  /** Aufbau, wie ihn die KI umsetzen soll */
  construction: string
  /** Passendes Format, wenn die Form eines verlangt */
  format?: BoardFormat
}

/**
 * Strukturformen. Die Auswahl trifft der Inhalt, nicht der Zufall – und schon gar nicht
 * pauschal die Mindmap: Sie taugt ausschließlich für Ober- und Unterbegriffe.
 */
export const BOARD_STRUCTURES: BoardStructure[] = [
  {
    id: 'zeitstrahl',
    label: 'Zeitleiste',
    subjects: ['geschichte', 'deutsch', 'biologie', 'erdkunde'],
    purpose: 'Ereignisse in ihrer zeitlichen Ordnung; Epochen; Entwicklungen',
    format: 'volltafel',
    construction:
      'Waagerechte Skala mit KONSTANTEM Maßstab – er darf innerhalb einer Zeitleiste niemals wechseln, sonst entsteht eine verzerrte Zeitdarstellung. Der Maßstab wird oben genannt (Ein-, Fünf-, Zehnjahresschritte). Bis zu drei Spuren übereinander (etwa Politik, Wirtschaft, Kultur). Besonders wichtige Daten hervorheben.'
  },
  {
    id: 'ursache-folge',
    label: 'Ursache-Folge-Kette',
    subjects: ['geschichte', 'erdkunde', 'politik', 'biologie', 'chemie', 'physik'],
    purpose: 'Kausale Ketten, bei denen jede Folge zur nächsten Ursache wird',
    construction: 'Ausgangspunkt links oder oben, dann Kästen mit Pfeilen in eine Richtung bis zum Schlusspunkt. Jeder Pfeil bedeutet „führt zu".'
  },
  {
    id: 'wirkungsgefuege',
    label: 'Wirkungsgefüge',
    subjects: ['erdkunde', 'politik', 'biologie'],
    purpose: 'Mehrere Ursachen, die aufeinander zurückwirken',
    format: 'heftseite',
    construction:
      'Zentrale Schlüsselbegriffe an auffälliger Stelle, Themenfelder unterschiedlich markiert. EINFACHE Pfeile für „wirkt auf", DOPPELPFEILE für Rückkopplungen. Eine Überschrift ist zwingend.'
  },
  {
    id: 'vergleich',
    label: 'Gegenüberstellung (Tabelle oder Venn)',
    subjects: [],
    purpose: 'Gemeinsamkeiten und Unterschiede',
    construction:
      'Drei Spalten: links das eine, rechts das andere, in der Mitte das Gemeinsame. Für jüngere Lerngruppen ist diese Tabelle besser als zwei überlappende Kreise. Eine vierte Spalte ganz links nennt die Vergleichsaspekte.'
  },
  {
    id: 'concept-map',
    label: 'Strukturbild (Concept Map)',
    subjects: [],
    purpose: 'Begriffsnetze mit verschiedenen logischen Verbindungen',
    construction: 'Das Thema steht ganz oben, davon gehen beschriftete Pfeile zu Kästen. Auf JEDEM Pfeil steht, wie die beiden Kästen zusammenhängen.'
  },
  {
    id: 'mindmap',
    label: 'Mindmap oder Wortstern',
    subjects: [],
    purpose: 'AUSSCHLIESSLICH Ober- und Unterbegriffe – sonst eine andere Form wählen',
    construction:
      'Das Zentrum ist gerahmt oder farbig. Wenige Hauptäste mit dickeren Linien, davon dünnere Nebenäste. Je Ast EIN Wort. Die Beschriftung steht waagerecht, die Aufteilung ist symmetrisch.'
  },
  {
    id: 'ablauf',
    label: 'Ablaufschema',
    subjects: ['mathematik', 'physik', 'chemie', 'biologie', 'informatik', 'deutsch'],
    purpose: 'Schritte in fester Reihenfolge: Rechenweg, Versuchsablauf, Handlungsverlauf',
    construction: 'Jeder Schritt in einem eigenen Kasten, verbunden durch Pfeile. Rechts daneben eine Spalte mit der Begründung des Schrittes.'
  },
  {
    id: 'konfliktanalyse',
    label: 'Konfliktanalyse (Akteure und Positionen)',
    subjects: ['politik', 'geschichte', 'erdkunde', 'ethik', 'religion', 'werte-und-normen'],
    purpose: 'Streitfragen mit mehreren Beteiligten',
    construction:
      'Oben der Konflikt als Frage, darunter je Partei eine Spalte mit Interessen und Mitteln, unten die Abwägung und die Verallgemeinerung. BEIDE Seiten müssen vorkommen (Kontroversitätsgebot).'
  },
  {
    id: 'pro-contra',
    label: 'Waage: Pro und Contra',
    subjects: ['politik', 'ethik', 'religion', 'werte-und-normen', 'deutsch', 'biologie'],
    purpose: 'Abwägen vor einem Urteil',
    construction: 'Zwei symmetrische Hälften unter einer gemeinsamen Leitfrage, unten in der Mitte das Fazit.'
  },
  {
    id: 'figurenkonstellation',
    label: 'Figurenkonstellation',
    subjects: ['deutsch'],
    purpose: 'Beziehungen zwischen Figuren eines Textes',
    construction:
      'Die Hauptfigur steht in der Mitte, Figurengruppen ringsum. Jeder Beziehungspfeil ist beschriftet. Unten eine Zeile mit Ziel und Konflikt der Hauptfigur.'
  },
  {
    id: 'kreislauf',
    label: 'Kreislauf',
    subjects: ['biologie', 'chemie', 'erdkunde', 'wirtschaft'],
    purpose: 'Wiederkehrende Abläufe',
    construction: 'Ein geschlossener Ring mit vier bis sechs Stationen und Pfeilen in eine Richtung.'
  },
  {
    id: 'regelkasten',
    label: 'Regel mit Beispiel',
    subjects: ['mathematik', 'englisch', 'franzoesisch', 'spanisch', 'latein', 'deutsch', 'daz'],
    purpose: 'Eine Regel, die gelten soll, mit ihrem Musterfall',
    construction: 'Die Regel gerahmt, darunter ein vollständig durchgeführtes Beispiel und daneben der typische Fehler. Der Kasten gehört auf das rechte Feld.'
  },
  {
    id: 'skizze',
    label: 'Skizze (Versuch, Karte, Profil)',
    subjects: ['physik', 'chemie', 'biologie', 'erdkunde', 'kunst', 'sport'],
    purpose: 'Aufbau, Lage oder Ablauf, die man sehen muss',
    construction:
      'Nur die groben Züge, aber vollständig beschriftet. Die Vereinfachung darf nie so weit gehen, dass dadurch ein Fehler entsteht. Die Zeichnung muss abmalbar bleiben.'
  }
]

export const boardStructureById = (id?: string): BoardStructure | undefined => BOARD_STRUCTURES.find((s) => s.id === id)

export function boardStructuresFor(subjectId: string): BoardStructure[] {
  return BOARD_STRUCTURES.filter((s) => !s.subjects.length || s.subjects.includes(subjectId))
}

/** Das Feld der Tafel, auf dem ein Bereich steht. */
export type BoardField = 'links' | 'mitte' | 'rechts'

export const BOARD_FIELD_LABELS: Record<BoardField, string> = {
  links: 'Aufgabe / Impuls',
  mitte: 'Erarbeitung (kommt ins Heft)',
  rechts: 'Merksatz / Regel'
}

/**
 * Regeln für den KI-Auftrag.
 * `afbMix` ist hier unerheblich – ein Tafelbild sichert, es prüft nicht.
 */
export function boardRules(meta: { subjectId: string; grade: number }, format: BoardFormat, structureId?: string): string {
  const info = boardFormatInfo(format)
  const structure = boardStructureById(structureId)
  const possible = boardStructuresFor(meta.subjectId)
  const lowerGrades = meta.grade <= 6
  return [
    `FORMAT: ${info.label}, also im QUERFORMAT mit dem Seitenverhältnis ${info.ratio.toFixed(2)} : 1. Eine Tafel ist breiter als hoch – plane in der Breite. Dieses Tafelbild ist EIGENS für diese Fläche gedacht: Nutze ihre Breite aus, statt für eine andere zu planen.`,
    `PLATZ: höchstens ${BOARD_CAPACITY.maxBlocks} Felder, zusammen höchstens ${BOARD_CAPACITY.maxLines} Zeilen zu je etwa ${BOARD_CAPACITY.maxCharsPerLine} Zeichen. Was nicht daraufpasst, gehört nicht an die Tafel.`,
    '',
    'AUFBAU:',
    '- Die ÜBERSCHRIFT ist Pflicht und wird als Leitfrage formuliert, nicht als Schlagwort.',
    '- Gelesen wird von links nach rechts und von oben nach unten; das Wichtigste steht in der MITTE.',
    '- Drei Felder: LINKS die Aufgabe oder der Impuls, MITTE die Erarbeitung, RECHTS der Merksatz oder die Regel. Nur das mittlere Feld wird ins Heft übertragen – gib bei jedem Bereich an, ob er abgeschrieben wird.',
    structure
      ? `- STRUKTURFORM: ${structure.label}. ${structure.construction}`
      : `- STRUKTURFORM: Wähle die, die zum Inhalt passt, und begründe die Wahl in einem Satz. Möglich sind: ${possible.map((s) => s.label).join(', ')}. Eine Mindmap NUR bei Ober- und Unterbegriffen.`,
    '- Mindestens ein grafisches Element (Pfeile, Skizze, Schema). Ein Tafelbild, das nur aus Merksätzen besteht, verführt zum Auswendiglernen.',
    lowerGrades
      ? '- In den unteren Jahrgängen sind ganze Sätze erlaubt.'
      : '- Stichworte oder kurze Wortgruppen, KEINE ganzen Sätze. Sammlungen von Beispielen nur beispielhaft, der Rest wird mündlich ergänzt.',
    `- Höchstens ${BOARD_CAPACITY.maxColours} Farben, und jede hat eine erklärte Bedeutung. Eine Information darf nie allein über die Farbe laufen – zusätzlich ein Symbol oder eine Form.`,
    '- Alles waagerecht beschriften, auch an Ästen und Pfeilen.',
    '',
    'ENTSTEHUNG:',
    '- Gib das Tafelbild als nummerierte AUFBAUSTUFEN aus: Was steht nach Schritt 1 an der Tafel, was kommt in Schritt 2 dazu? So lässt es sich im Unterrichtsgespräch entwickeln.',
    '- Sage ausdrücklich, WAS abgeschrieben wird und was nicht. Abgeschrieben wird nur, was Merkstoff ist oder Grundlage der Hausaufgabe – nie zum Füllen der Zeit.'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Prüft ein fertiges Tafelbild gegen die Grenzen der Fläche. */
export function checkBoard(board: { title: string; sections: { heading: string; points: string[] }[] }): string[] {
  const notes: string[] = []
  if (!board.title.trim()) notes.push('Dem Tafelbild fehlt die Überschrift – sie ist Pflicht und sollte eine Leitfrage sein.')
  else if (!/[?]/.test(board.title)) notes.push('Die Überschrift ist keine Frage. Als Leitfrage formuliert trägt sie die Stunde besser.')
  if (board.sections.length > BOARD_CAPACITY.maxBlocks) {
    notes.push(`${board.sections.length} Felder sind zu viel für eine Tafel – höchstens ${BOARD_CAPACITY.maxBlocks} passen darauf.`)
  }
  const lines = board.sections.reduce((n, s) => n + 1 + s.points.length, 0)
  if (lines > BOARD_CAPACITY.maxLines) {
    notes.push(`${lines} Zeilen passen nicht an die Tafel; bei lesbarer Schrift sind es höchstens ${BOARD_CAPACITY.maxLines}.`)
  }
  const tooLong = board.sections.flatMap((s) => s.points).filter((p) => p.length > BOARD_CAPACITY.maxCharsPerLine)
  if (tooLong.length) {
    notes.push(`${tooLong.length} Stichpunkt(e) sind länger als ${BOARD_CAPACITY.maxCharsPerLine} Zeichen und passen nicht in eine Tafelzeile.`)
  }
  return notes
}
