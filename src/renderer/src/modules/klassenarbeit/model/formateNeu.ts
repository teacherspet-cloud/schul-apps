/**
 * Aufgabenformate der Fächer, die am 29.09.2026 dazugekommen sind (Wunsch der Lehrkraft:
 * „Klassenarbeiten in allen Fächern"). Grundlage: recherche/klassenarbeiten-faecher-neu-2026-09-29.md
 * (Abschnitt 13, „Vorschlag für die App") mit den Quellen je Fach:
 * - Mathematik: KMK-Bildungsstandards 2022 (7 prozessbezogene Kompetenzen, 5 Leitideen),
 *   IQB-Pool/ZP10 NRW mit hilfsmittelfreiem Teil A (etwa 30 %).
 * - Latein/Griechisch: EPA; Übersetzung : Begleitaufgaben 2 : 1 (mindestens 1 : 1), Fehlerquote.
 * - Naturwissenschaften: KMK 2024 (Sach-, Erkenntnisgewinnungs-, Kommunikations-, Bewertungskompetenz),
 *   IQB-Operatorenliste (beurteilen = Sachurteil, bewerten = Werturteil).
 * - Informatik, Wirtschaft, Religion/Ethik/Philosophie/WuN, Musik/Kunst: EPA und Länderhandreichungen;
 *   für die Sek I gibt es dort kaum eigene Formatvorgaben – die Formate sind abgeleitet (so im Hinweis).
 */
import type { ExamFormat } from './formats'
import type { ExamSubjectId } from './faecher'

export const MATHEMATIK: ExamFormat[] = [
  {
    id: 'ma-basis',
    subject: 'mathematik',
    label: 'Teil A: Basisaufgaben ohne Hilfsmittel',
    competence: 'Mit mathematischen Objekten umgehen',
    description:
      'Einzelne, nicht aufeinander bezogene Aufgaben mit 1–3 Punkten (Kopfrechnen, Umformen, Graph zuordnen); abgegeben, bevor Taschenrechner und Formelsammlung ausgegeben werden.',
    afb: ['I', 'II'],
    share: 25,
    grades: [5, 13],
    material: 'none',
    note: 'Hilfsmittelfreier Teil – NRW ZP10: 30 Minuten; Abitur (IQB-Pool): Teil A etwa 30 %.'
  },
  {
    id: 'ma-rechnen',
    subject: 'mathematik',
    label: 'Rechnen und Umformen',
    competence: 'Mit mathematischen Objekten umgehen',
    description: 'Terme, Gleichungen und Rechenverfahren mit nachvollziehbarem Lösungsweg.',
    afb: ['I', 'II'],
    share: 25,
    grades: [5, 10],
    material: 'none'
  },
  {
    id: 'ma-sachaufgabe',
    subject: 'mathematik',
    label: 'Sachaufgabe / Modellieren',
    competence: 'Mathematisch modellieren',
    description: 'Ein Kontext mit mehreren Teilaufgaben; die Teilaufgaben möglichst unabhängig, ggf. mit angegebenem Zwischenergebnis.',
    afb: ['II', 'III'],
    share: 30,
    grades: [5, 13],
    material: 'text'
  },
  {
    id: 'ma-funktionen',
    subject: 'mathematik',
    label: 'Funktionen und Graphen',
    competence: 'Mathematisch darstellen',
    description: 'Graph zeichnen, zuordnen und deuten; Wertetabelle; Parameter interpretieren.',
    afb: ['I', 'II'],
    share: 25,
    grades: [7, 13],
    material: 'data'
  },
  {
    id: 'ma-geometrie',
    subject: 'mathematik',
    label: 'Geometrie: Konstruieren und Berechnen',
    competence: 'Probleme mathematisch lösen',
    description: 'Konstruktion mit Zirkel und Geodreieck, Berechnung von Längen, Winkeln, Flächen und Volumina; die Zeichengenauigkeit wird bewertet.',
    afb: ['I', 'II'],
    share: 25,
    grades: [5, 10],
    material: 'image'
  },
  {
    id: 'ma-daten',
    subject: 'mathematik',
    label: 'Daten und Zufall',
    competence: 'Mathematisch darstellen',
    description: 'Diagramme lesen und erstellen, Kennwerte bestimmen, Wahrscheinlichkeiten berechnen.',
    afb: ['I', 'II'],
    share: 20,
    grades: [5, 13],
    material: 'data'
  },
  {
    id: 'ma-begruenden',
    subject: 'mathematik',
    label: 'Begründen und Prüfen',
    competence: 'Mathematisch argumentieren',
    description: 'Eine Behauptung prüfen, einen Fehler in einer Rechnung finden, eine Aussage begründen oder widerlegen.',
    afb: ['II', 'III'],
    share: 15,
    grades: [5, 13],
    material: 'none'
  }
]

const alteSprache = (subject: ExamSubjectId, praefix: string, woerter: string): ExamFormat[] => [
  {
    id: `${praefix}-uebersetzung`,
    subject,
    label: 'Übersetzung',
    competence: 'Textkompetenz / Sprachkompetenz',
    description: `Ein geschlossener Text mit deutscher Überschrift bzw. Einleitung und Wortangaben; ${woerter}. Bewertet über die Fehlerquote (Fehler je 100 Wörter).`,
    afb: ['I', 'II', 'III'],
    share: 67,
    grades: [5, 13],
    material: 'text',
    defaultPoints: 0,
    note: 'Halbe, ganze und Doppelfehler; Folge- und Wiederholungsfehler werden nicht eigens gezählt (EPA).'
  },
  {
    id: `${praefix}-vorerschliessung`,
    subject,
    label: 'Texterschließung vor der Übersetzung',
    competence: 'Textkompetenz',
    description: 'Sachfelder, Personen, Satzstruktur (Subjekt, Prädikat) und Tempusrelief am Text herausarbeiten.',
    afb: ['I', 'II'],
    share: 33,
    grades: [5, 13],
    material: 'text'
  },
  {
    id: `${praefix}-sprache`,
    subject,
    label: 'Sprachaufgaben (Formen, Syntax)',
    competence: 'Sprachkompetenz',
    description: 'Formen bestimmen und bilden, Satzglieder und Konstruktionen am Text – nicht isoliert.',
    afb: ['I', 'II'],
    share: 33,
    grades: [5, 10],
    material: 'text'
  },
  {
    id: `${praefix}-interpretation`,
    subject,
    label: 'Interpretationsaufgaben',
    competence: 'Textkompetenz / Kulturkompetenz',
    description: 'Inhalt wiedergeben, Stilmittel nachweisen und deuten, vergleichen (auch mit einem Rezeptionsdokument), Stellung nehmen.',
    afb: ['II', 'III'],
    share: 33,
    grades: [7, 13],
    material: 'text'
  },
  {
    id: `${praefix}-kultur`,
    subject,
    label: 'Sach- und Kulturwissen',
    competence: 'Kulturkompetenz',
    description: 'Geschichte, Mythologie und Alltag der Antike – vor allem zu Beginn der Spracherwerbsphase.',
    afb: ['I'],
    share: 20,
    grades: [5, 10],
    material: 'none'
  }
]

export const LATEIN = alteSprache('latein', 'la', 'Lehrbuchphase etwa 40–70 Wörter je 45 Minuten, Lektüre etwa 60 Wörter je Zeitstunde Übersetzungszeit')
export const GRIECHISCH = alteSprache('griechisch', 'grc', 'Lektüre etwa 65 Wörter je Zeitstunde Übersetzungszeit')

/** Formate für Biologie, Chemie, Physik und Technik (je Fach ein eigenes Präfix) */
const naturwissenschaft = (subject: ExamSubjectId, praefix: string): ExamFormat[] => [
  {
    id: `${praefix}-wissen`,
    subject,
    label: 'Fachwissen und Fachbegriffe',
    competence: 'Sachkompetenz',
    description: 'Begriffe im Zusammenhang erklären, Vorgänge beschreiben – nicht nur wiedergeben.',
    afb: ['I'],
    share: 25,
    grades: [5, 13],
    material: 'none'
  },
  {
    id: `${praefix}-experiment`,
    subject,
    label: subject === 'technik' ? 'Versuch oder Test auswerten' : 'Experiment auswerten',
    competence: 'Erkenntnisgewinnung',
    description:
      'Versuchsaufbau bzw. -skizze gegeben; Hypothese, Beobachtung und Deutung getrennt; auch ein Versuch zum Protokollieren oder ein Demonstrationsversuch in der Arbeit.',
    afb: ['I', 'II', 'III'],
    share: 35,
    grades: [5, 13],
    material: 'text'
  },
  {
    id: `${praefix}-daten`,
    subject,
    label: 'Messwerte und Diagramme',
    competence: 'Erkenntnisgewinnung / Kommunikation',
    description: 'Tabelle in ein Diagramm übertragen (Achsen, Einheiten), Diagramm auswerten, Zusammenhang formulieren.',
    afb: ['I', 'II'],
    share: 30,
    grades: [6, 13],
    material: 'data'
  },
  ...(subject === 'biologie'
    ? []
    : [
        {
          id: `${praefix}-rechnen`,
          subject,
          label: 'Berechnung',
          competence: 'Sachkompetenz',
          description: 'Ansatz, Rechnung mit Einheiten, Ergebnis; Folgefehler werden berücksichtigt.',
          afb: ['I', 'II'],
          share: 25,
          grades: [7, 13],
          material: 'none'
        } satisfies ExamFormat
      ]),
  ...(subject === 'chemie'
    ? [
        {
          id: 'ch-gleichung',
          subject,
          label: 'Reaktionsgleichungen',
          competence: 'Sachkompetenz (Repräsentationen)',
          description: 'Wort- und Formelgleichungen aufstellen und ausgleichen.',
          afb: ['I', 'II'],
          share: 25,
          grades: [7, 13],
          material: 'none'
        } satisfies ExamFormat
      ]
    : []),
  {
    id: `${praefix}-modell`,
    subject,
    label: subject === 'technik' ? 'Technische Skizze und Konstruktion' : 'Modelle nutzen',
    competence: 'Erkenntnisgewinnung',
    description:
      subject === 'technik'
        ? 'Eine technische Skizze lesen oder anfertigen, eine Konstruktion begründen und optimieren.'
        : 'Teilchenmodell, Schaltplan oder beschriftete Skizze nutzen; Grenzen des Modells benennen.',
    afb: ['II', 'III'],
    share: 25,
    grades: [5, 13],
    material: 'image'
  },
  {
    id: `${praefix}-material`,
    subject,
    label: 'Materialgebundene Aufgabe',
    competence: 'Kommunikation',
    description: 'Text, Abbildung und Tabelle erschließen und aufeinander beziehen (Materialverweise M1, M2 …).',
    afb: ['II'],
    share: 30,
    grades: [7, 13],
    material: 'text'
  },
  {
    id: `${praefix}-bewertung`,
    subject,
    label: 'Beurteilen und Bewerten',
    competence: 'Bewertungskompetenz',
    description: '„beurteilen" = Sachurteil nach fachlichen Kriterien, „bewerten" = Werturteil nach offengelegten Werten und Normen (Dilemma).',
    afb: ['III'],
    share: 20,
    grades: [7, 13],
    material: 'text'
  }
]

export const BIOLOGIE = naturwissenschaft('biologie', 'bio')
export const CHEMIE = naturwissenschaft('chemie', 'ch')
export const PHYSIK = naturwissenschaft('physik', 'ph')
export const TECHNIK = naturwissenschaft('technik', 'te')
// 30.09.2026: Integriertes Fach Naturwissenschaften (NaWi) – Formate wie in den Einzelfächern (abgeleitet)
export const NATURWISSENSCHAFTEN = naturwissenschaft('naturwissenschaften', 'nawi')

export const INFORMATIK: ExamFormat[] = [
  {
    id: 'inf-daten',
    subject: 'informatik',
    label: 'Information und Daten',
    competence: 'Darstellen und Interpretieren',
    description: 'Codierung, Binärzahlen, Datentypen und Datenstrukturen.',
    afb: ['I', 'II'],
    share: 25,
    grades: [5, 13],
    material: 'none'
  },
  {
    id: 'inf-algorithmus',
    subject: 'informatik',
    label: 'Algorithmus entwerfen',
    competence: 'Modellieren und Implementieren',
    description: 'Einen Algorithmus als Struktogramm, Pseudocode oder Code in der Unterrichtssprache entwerfen.',
    afb: ['II', 'III'],
    share: 30,
    grades: [5, 13],
    material: 'text',
    note: 'Die verwendeten Sprachelemente werden als Material beigefügt (NRW-Abitur). Eine amtliche Regel zur Bewertung von Syntaxfehlern auf Papier gibt es nicht.'
  },
  {
    id: 'inf-trace',
    subject: 'informatik',
    label: 'Programm analysieren',
    competence: 'Darstellen und Interpretieren',
    description: 'Einen Code-Ausschnitt nachvollziehen (Schreibtischtest), die Ausgabe bestimmen, Fehler finden und korrigieren.',
    afb: ['II'],
    share: 25,
    grades: [7, 13],
    material: 'text'
  },
  {
    id: 'inf-modell',
    subject: 'informatik',
    label: 'Modellieren',
    competence: 'Modellieren und Implementieren',
    description: 'Klassendiagramm, ER-Modell oder Zustandsdiagramm erstellen bzw. auswerten.',
    afb: ['II', 'III'],
    share: 30,
    grades: [8, 13],
    material: 'text'
  },
  {
    id: 'inf-sql',
    subject: 'informatik',
    label: 'Datenbankabfragen',
    competence: 'Modellieren und Implementieren',
    description: 'SQL-Abfragen zu einem gegebenen Datenbankschema formulieren.',
    afb: ['I', 'II'],
    share: 25,
    grades: [9, 13],
    material: 'data'
  },
  {
    id: 'inf-gesellschaft',
    subject: 'informatik',
    label: 'Informatik und Gesellschaft',
    competence: 'Begründen und Bewerten',
    description: 'Datenschutz, KI, Urheberrecht – begründet beurteilen.',
    afb: ['III'],
    share: 20,
    grades: [5, 13],
    material: 'text'
  }
]

export const WIRTSCHAFT: ExamFormat[] = [
  {
    id: 'wi-fall',
    subject: 'wirtschaft',
    label: 'Fallanalyse',
    competence: 'Analysekompetenz',
    description: 'Eine Ausgangssituation mit Akteuren, Interessen und einer Entscheidung untersuchen.',
    afb: ['II'],
    share: 35,
    grades: [7, 13],
    material: 'text'
  },
  {
    id: 'wi-daten',
    subject: 'wirtschaft',
    label: 'Statistik oder Schaubild auswerten',
    competence: 'Methodenkompetenz',
    description: 'Wirtschaftsdaten beschreiben, Auffälligkeiten mit Werten belegen und erklären.',
    afb: ['I', 'II'],
    share: 25,
    grades: [7, 13],
    material: 'data'
  },
  {
    id: 'wi-rechnen',
    subject: 'wirtschaft',
    label: 'Wirtschaftliche Berechnung',
    competence: 'Sachkompetenz',
    description: 'Haushaltsplan, Kosten und Gewinn, Zinsen berechnen.',
    afb: ['I', 'II'],
    share: 20,
    grades: [7, 13],
    material: 'data',
    note: 'Taschenrechner zulassen.'
  },
  {
    id: 'wi-modell',
    subject: 'wirtschaft',
    label: 'Modell auswerten',
    competence: 'Analysekompetenz',
    description: 'Wirtschaftskreislauf oder Angebots-Nachfrage-Diagramm lesen und anwenden.',
    afb: ['II'],
    share: 25,
    grades: [7, 13],
    material: 'image'
  },
  {
    id: 'wi-text',
    subject: 'wirtschaft',
    label: 'Analyse eines wirtschaftspolitischen Textes',
    competence: 'Methodenkompetenz',
    description: 'Zeitungsartikel oder Kommentar erschließen: Position, Argumente, Interessen.',
    afb: ['I', 'II'],
    share: 35,
    grades: [8, 13],
    material: 'text'
  },
  {
    id: 'wi-urteil',
    subject: 'wirtschaft',
    label: 'Urteilsbildung',
    competence: 'Urteilskompetenz',
    description: 'Zu einer wirtschaftlichen Streitfrage ein begründetes Urteil mit offengelegten Kriterien fällen.',
    afb: ['III'],
    share: 30,
    grades: [7, 13],
    material: 'none'
  }
]

/** Religion, Ethik, Philosophie, Werte und Normen – gleiche Struktur, eigene Operatorenlisten */
const werteFach = (subject: ExamSubjectId, praefix: string, textart: string): ExamFormat[] => [
  {
    id: `${praefix}-wissen`,
    subject,
    label: 'Grundwissen und Begriffe',
    competence: 'Sachkompetenz',
    description: 'Begriffe erklären, Positionen und Zusammenhänge wiedergeben.',
    afb: ['I'],
    share: 25,
    grades: [5, 13],
    material: 'none'
  },
  {
    id: `${praefix}-text`,
    subject,
    label: `Textarbeit (${textart})`,
    competence: 'Deutungs- und Methodenkompetenz',
    description: 'Einen Text erschließen: Thema, Aussage, Argumentation, Bezug zu Fragen des Fachs.',
    afb: ['I', 'II'],
    share: 40,
    grades: [5, 13],
    material: 'text'
  },
  {
    id: `${praefix}-bild`,
    subject,
    label: 'Bild- oder Karikaturanalyse',
    competence: 'Deutungskompetenz',
    description: 'Beschreiben, deuten, auf die Frage des Fachs beziehen.',
    afb: ['I', 'II', 'III'],
    share: 35,
    grades: [5, 13],
    material: 'image'
  },
  {
    id: `${praefix}-fall`,
    subject,
    label: 'Fallbeispiel oder Dilemma',
    competence: 'Urteilskompetenz',
    description: 'Eine Situation mit widerstreitenden Werten untersuchen und Handlungsmöglichkeiten abwägen.',
    afb: ['II', 'III'],
    share: 35,
    grades: [7, 13],
    material: 'text'
  },
  {
    id: `${praefix}-eroerterung`,
    subject,
    label: 'Erörterung oder Stellungnahme',
    competence: 'Urteilskompetenz',
    description: 'Begründet Stellung nehmen; die Wertmaßstäbe offenlegen.',
    afb: ['III'],
    share: 30,
    grades: [8, 13],
    material: 'none',
    note: 'Bei „bewerten" und „Stellung nehmen" sind die Wertmaßstäbe offenzulegen.'
  },
  {
    id: `${praefix}-gestaltung`,
    subject,
    label: 'Gestaltungsaufgabe',
    competence: 'Gestaltungskompetenz',
    description: 'Eine eigene Position in einer Textform gestalten (Brief, Rede, Dialog).',
    afb: ['III'],
    share: 25,
    grades: [7, 13],
    material: 'none'
  }
]

export const RELIGION = werteFach('religion', 're', 'biblischer, religiöser oder Sachtext')
export const ETHIK = werteFach('ethik', 'eth', 'philosophischer oder Sachtext')
export const PHILOSOPHIE = werteFach('philosophie', 'phil', 'philosophischer Text')
export const WERTE_UND_NORMEN = werteFach('werte-und-normen', 'wun', 'philosophischer, religiöser oder Sachtext')
// 30.09.2026: Pädagogik/Erziehungswissenschaft – Text, Fall, Erörterung wie in den Wertefächern (abgeleitet)
export const PAEDAGOGIK = werteFach('paedagogik', 'paed', 'pädagogischer oder psychologischer Fachtext')

/**
 * Formate eines verwandten Fachs unter neuer Kennung übernehmen (30.09.2026): Arbeitslehre/WAT
 * arbeitet mit denselben Formaten wie Wirtschaft (Fall, Daten, Urteil), Gesellschaftslehre mit
 * denen aus Geschichte, Erdkunde und Politik (formats.ts). Abgeleitet, nicht eigens belegt –
 * so im Hinweis des Formats.
 */
export function uebertrageFormate(liste: ExamFormat[], subject: ExamSubjectId, praefix: string, herkunft: string): ExamFormat[] {
  return liste.map((f) => ({
    ...f,
    id: `${praefix}-${f.id.slice(f.id.indexOf('-') + 1)}`,
    subject,
    note: [f.note, `Format aus ${herkunft} übernommen – für dieses Fach nicht eigens belegt.`].filter(Boolean).join(' ')
  }))
}

export const ARBEITSLEHRE = uebertrageFormate(WIRTSCHAFT, 'arbeitslehre', 'al', 'Wirtschaft')

export const MUSIK: ExamFormat[] = [
  {
    id: 'mu-hoeren',
    subject: 'musik',
    label: 'Höranalyse',
    competence: 'Wahrnehmen und Verstehen',
    description: 'Ein Klangbeispiel (wo möglich mit Notentext) beschreiben und analysieren: Besetzung, Form, Tempo, Dynamik, Wirkung.',
    afb: ['I', 'II'],
    share: 35,
    grades: [5, 13],
    material: 'audio'
  },
  {
    id: 'mu-theorie',
    subject: 'musik',
    label: 'Musiklehre',
    competence: 'Wissen',
    description: 'Intervalle, Tonleitern, Akkorde, Notation.',
    afb: ['I', 'II'],
    share: 30,
    grades: [5, 13],
    material: 'none'
  },
  {
    id: 'mu-analyse',
    subject: 'musik',
    label: 'Werkanalyse mit Notentext',
    competence: 'Analysieren und Deuten',
    description: 'Einen Ausschnitt anhand des Notentextes untersuchen und deuten.',
    afb: ['II', 'III'],
    share: 35,
    grades: [7, 13],
    material: 'image'
  },
  {
    id: 'mu-text',
    subject: 'musik',
    label: 'Musikbezogener Text',
    competence: 'Reflektieren',
    description: 'Einen Text über Musik erschließen und Stellung nehmen.',
    afb: ['II', 'III'],
    share: 30,
    grades: [8, 13],
    material: 'text'
  },
  {
    id: 'mu-gestalten',
    subject: 'musik',
    label: 'Gestaltung mit Erläuterung',
    competence: 'Gestalten',
    description: 'Eine kleine Gestaltung (Rhythmus, Melodie, Begleitung) entwerfen und schriftlich erläutern.',
    afb: ['III'],
    share: 25,
    grades: [5, 13],
    material: 'none'
  }
]

export const KUNST: ExamFormat[] = [
  {
    id: 'ku-bild',
    subject: 'kunst',
    label: 'Bildbeschreibung und -analyse',
    competence: 'Wahrnehmen und Analysieren',
    description: 'Ein Werk beschreiben und nach Komposition, Farbe, Raum und Wirkung analysieren.',
    afb: ['I', 'II'],
    share: 40,
    grades: [5, 13],
    material: 'image',
    note: 'Stichworte allein genügen nicht als schriftlicher Anteil (EPA Kunst).'
  },
  {
    id: 'ku-skizze',
    subject: 'kunst',
    label: 'Analytische Skizze',
    competence: 'Analysieren',
    description: 'Komposition, Farb- oder Raumaufbau in einer Skizze sichtbar machen und erläutern.',
    afb: ['II'],
    share: 25,
    grades: [7, 13],
    material: 'image'
  },
  {
    id: 'ku-vergleich',
    subject: 'kunst',
    label: 'Werkvergleich',
    competence: 'Deuten und Urteilen',
    description: 'Zwei Werke kriteriengeleitet vergleichen und deuten.',
    afb: ['III'],
    share: 35,
    grades: [8, 13],
    material: 'image'
  },
  {
    id: 'ku-gestalten',
    subject: 'kunst',
    label: 'Gestaltungsaufgabe mit Erläuterung',
    competence: 'Gestalten',
    description: 'Eine Gestaltungsidee skizzieren und schriftlich begründen.',
    afb: ['III'],
    share: 30,
    grades: [5, 13],
    material: 'none'
  }
]

/**
 * Italienisch und Russisch (29.09.2026), Niederländisch, Polnisch, Tschechisch, Portugiesisch,
 * Türkisch, Chinesisch und DaZ (30.09.2026): dieselben Arten wie die übrigen modernen
 * Fremdsprachen (formats.ts). Die KMK-Bildungsstandards gelten für alle modernen Fremdsprachen
 * mit denselben Kompetenzbereichen; die Bezeichnungen stehen in der Zielsprache, wie sie die
 * Prüfungen der Herkunftsländer verwenden (Quellen in recherche/sprachtexte-2026-09-30.md).
 */
export const FREMDSPRACHEN_NEU: {
  fach: ExamSubjectId
  praefix: string
  labels: Record<string, string>
  /** Arten, die es im Fach nicht gibt (DaZ: keine Sprachmittlung) */
  ohne?: string[]
  /** Frühester Jahrgang, falls abweichend von Klasse 6 (DaZ auch in der Grundschule) */
  ab?: number
  /** Hinweis an jedem Format des Fachs */
  hinweis?: string
}[] = [
  {
    fach: 'italienisch',
    praefix: 'it',
    labels: {
      listening: 'Comprensione orale',
      reading: 'Comprensione scritta',
      mediation: 'Mediazione',
      writing: 'Produzione scritta',
      language: 'Uso della lingua',
      grammar: 'Grammatik im Kontext',
      speaking: 'Produzione orale (Ersatz für eine schriftliche Arbeit)'
    }
  },
  {
    fach: 'russisch',
    praefix: 'ru',
    labels: {
      listening: 'Аудирование',
      reading: 'Чтение',
      mediation: 'Медиация',
      writing: 'Письменная речь',
      language: 'Грамматика и лексика',
      grammar: 'Grammatik im Kontext',
      speaking: 'Говорение (Ersatz für eine schriftliche Arbeit)'
    }
  },
  // ---------- 30.09.2026 ----------
  {
    fach: 'niederlaendisch',
    praefix: 'nl',
    // Vaardigheden wie im Centraal Examen und im ERK (Europees Referentiekader: „mediatie")
    labels: {
      listening: 'Luistervaardigheid',
      reading: 'Leesvaardigheid',
      mediation: 'Mediatie',
      writing: 'Schrijfvaardigheid',
      language: 'Grammatica en woordenschat',
      grammar: 'Grammatik im Kontext',
      speaking: 'Spreekvaardigheid (Ersatz für eine schriftliche Arbeit)'
    }
  },
  {
    fach: 'polnisch',
    praefix: 'pl',
    // Teile der polnischen Fremdsprachenprüfung (CKE): „Rozumienie ze słuchu", „Rozumienie tekstów pisanych",
    // „Znajomość środków językowych", „Wypowiedź pisemna"; Sprachmittlung dort als „Przetwarzanie tekstu"
    labels: {
      listening: 'Rozumienie ze słuchu',
      reading: 'Rozumienie tekstów pisanych',
      mediation: 'Przetwarzanie tekstu',
      writing: 'Wypowiedź pisemna',
      language: 'Znajomość środków językowych',
      grammar: 'Grammatik im Kontext',
      speaking: 'Wypowiedź ustna (Ersatz für eine schriftliche Arbeit)'
    }
  },
  {
    fach: 'tschechisch',
    praefix: 'cs',
    // Teile der tschechischen Maturita (CERMAT): „Poslech s porozuměním", „Čtení s porozuměním", „Písemný projev"
    labels: {
      listening: 'Poslech s porozuměním',
      reading: 'Čtení s porozuměním',
      mediation: 'Mediace',
      writing: 'Písemný projev',
      language: 'Jazykové prostředky',
      grammar: 'Grammatik im Kontext',
      speaking: 'Ústní projev (Ersatz für eine schriftliche Arbeit)'
    }
  },
  {
    fach: 'portugiesisch',
    praefix: 'pt',
    labels: {
      listening: 'Compreensão oral',
      reading: 'Compreensão escrita',
      mediation: 'Mediação',
      writing: 'Produção escrita',
      language: 'Gramática e vocabulário',
      grammar: 'Grammatik im Kontext',
      speaking: 'Produção oral (Ersatz für eine schriftliche Arbeit)'
    }
  },
  {
    fach: 'tuerkisch',
    praefix: 'tr',
    // Die vier Fertigkeiten des türkischen Lehrplans (MEB): Dinleme, Okuma, Konuşma, Yazma
    labels: {
      listening: 'Dinleme',
      reading: 'Okuma',
      mediation: 'Aracılık',
      writing: 'Yazma',
      language: 'Dil bilgisi ve sözcük bilgisi',
      grammar: 'Grammatik im Kontext',
      speaking: 'Konuşma (Ersatz für eine schriftliche Arbeit)'
    }
  },
  {
    fach: 'chinesisch',
    praefix: 'zh',
    // Wie im HSK und in chinesischen Schulprüfungen: 听力, 阅读, 写作; Kurzform ohne „理解" wäre ebenfalls üblich
    labels: {
      listening: '听力理解',
      reading: '阅读理解',
      mediation: '语言中介',
      writing: '写作',
      language: '词汇与语法',
      grammar: 'Grammatik im Kontext',
      speaking: '口语表达 (Ersatz für eine schriftliche Arbeit)'
    }
  },
  {
    fach: 'daz',
    praefix: 'daz',
    // Teile nach dem Deutschen Sprachdiplom I (ZfA): Leseverstehen, Hörverstehen, schriftliche und mündliche Kommunikation
    labels: {
      listening: 'Hörverstehen',
      reading: 'Leseverstehen',
      writing: 'Schriftliche Kommunikation',
      language: 'Wortschatz und Grammatik im Kontext',
      grammar: 'Grammatik im Kontext',
      speaking: 'Mündliche Kommunikation (Ersatz für eine schriftliche Arbeit)'
    },
    ohne: ['mediation'],
    ab: 3,
    hinweis:
      'Aufbau nach dem DSD I (Leseverstehen, Hörverstehen, schriftliche Kommunikation – je nach GER-Niveau); für DaZ-Klassenarbeiten nicht fachspezifisch belegt. Notenaussetzung und Nachteilsausgleich regeln die Länder (Anforderungen werden nicht abgesenkt).'
  }
]

/**
 * Sport (30.09.2026): nur Sporttheorie. Grundlage EPA Sport (KMK 1989): schriftlicher Teil als
 * Erörterung mit oder ohne Material, Kenntnisbereiche Bewegungslehre, Trainingslehre,
 * motorisches Lernen, Verletzungsprophylaxe, Sport und Gesellschaft; AFB III „Anwendung
 * sporttheoretischer Kenntnisse auf Falldarstellungen". Für die Sek I gibt es keine eigenen
 * Formatvorgaben (NI: keine schriftliche Lernkontrolle, NRW: keine Klassenarbeiten) – abgeleitet.
 */
const SEK1_SPORT = 'Für die Sekundarstufe I nicht fachspezifisch belegt (abgeleitet aus den EPA Sport).'

export const SPORT: ExamFormat[] = [
  {
    id: 'sp-wissen',
    subject: 'sport',
    label: 'Sporttheorie: Grundwissen und Regeln',
    competence: 'Sachkompetenz',
    description: 'Fachbegriffe, Regeln, Grundlagen von Aufwärmen, Belastung und Gesundheit – kurze Antworten, Zuordnen, Beschriften.',
    afb: ['I', 'II'],
    share: 35,
    grades: [5, 13],
    material: 'none',
    note: SEK1_SPORT
  },
  {
    id: 'sp-bewegung',
    subject: 'sport',
    label: 'Bewegungsanalyse',
    competence: 'Bewegungslehre',
    description: 'Eine Bewegung an einer Bildreihe beschreiben, in Phasen gliedern und Fehlerbilder mit Korrekturhinweisen erläutern.',
    afb: ['II'],
    share: 30,
    grades: [7, 13],
    material: 'image',
    note: SEK1_SPORT
  },
  {
    id: 'sp-training',
    subject: 'sport',
    label: 'Trainingslehre: Fallanwendung',
    competence: 'Anwendung auf Falldarstellungen',
    description: 'Zu einem Fall (Sportlerin, Verein, Schulklasse) Belastungsnormative bestimmen, einen Trainingsplan entwerfen und begründen.',
    afb: ['II', 'III'],
    share: 35,
    grades: [8, 13],
    material: 'text',
    note: 'EPA Sport: AFB III „Anwendung sporttheoretischer Kenntnisse auf Falldarstellungen".'
  },
  {
    id: 'sp-eroerterung',
    subject: 'sport',
    label: 'Sport und Gesellschaft: Erörterung mit Material',
    competence: 'Urteilskompetenz',
    description: 'Zu einem Text, einer Grafik oder Statistik (Doping, Sport und Medien, Gesundheit) Stellung nehmen und urteilen.',
    afb: ['II', 'III'],
    share: 30,
    grades: [10, 13],
    material: 'data',
    note: 'EPA Sport: schriftlicher Teil als Erörterung mit oder ohne Material; die Teilaufgaben unabhängig voneinander lösbar.'
  }
]

/**
 * Darstellendes Spiel / Theater (30.09.2026): Grundlage EPA Darstellendes Spiel (KMK 2006) –
 * Gestalten, Reflektieren, Kennen von Theaterformen. Schriftliche Arbeiten in der Sek I sind
 * nicht vorgesehen oder nicht geregelt; die Formate sind abgeleitet (so im Hinweis).
 */
const DS_HINWEIS = 'Aus den EPA Darstellendes Spiel abgeleitet; für die Sekundarstufe I nicht fachspezifisch belegt.'

export const DARSTELLENDES_SPIEL: ExamFormat[] = [
  {
    id: 'ds-wissen',
    subject: 'darstellendes-spiel',
    label: 'Theaterformen und Fachbegriffe',
    competence: 'Kennen und Verstehen',
    description: 'Theaterformen, Gestaltungsmittel (Körper, Stimme, Raum, Zeit, Requisit) und Fachbegriffe erklären und an Beispielen zeigen.',
    afb: ['I', 'II'],
    share: 30,
    grades: [5, 13],
    material: 'none',
    note: DS_HINWEIS
  },
  {
    id: 'ds-analyse',
    subject: 'darstellendes-spiel',
    label: 'Inszenierungsanalyse',
    competence: 'Wahrnehmen und Analysieren',
    description: 'Eine Szene (Szenenfoto, Szenenbeschreibung oder Dramenauszug) beschreiben und die Wirkung der Gestaltungsmittel analysieren.',
    afb: ['II'],
    share: 35,
    grades: [7, 13],
    material: 'image',
    note: DS_HINWEIS
  },
  {
    id: 'ds-konzept',
    subject: 'darstellendes-spiel',
    label: 'Inszenierungskonzept',
    competence: 'Gestalten',
    description: 'Zu einer Textvorlage ein Inszenierungskonzept entwerfen (Raum, Figur, Licht, Ton) und die Entscheidungen begründen.',
    afb: ['III'],
    share: 35,
    grades: [8, 13],
    material: 'text',
    note: DS_HINWEIS
  },
  {
    id: 'ds-reflexion',
    subject: 'darstellendes-spiel',
    label: 'Reflexion einer eigenen Gestaltung',
    competence: 'Reflektieren',
    description: 'Eine eigene szenische Gestaltung aus dem Unterricht beschreiben, deuten und kriteriengeleitet beurteilen.',
    afb: ['II', 'III'],
    share: 30,
    grades: [5, 13],
    material: 'none',
    note: DS_HINWEIS
  }
]

/**
 * Sachunterricht (30.09.2026): kurze schriftliche Lernkontrolle (Hessen Jg. 3 höchstens 15,
 * Jg. 4 höchstens 30 Minuten; Bayern Probearbeiten in HSU). Kompetenzangabe nach den fünf
 * Perspektiven des GDSU-Perspektivrahmens 2013. Eine amtliche Formatliste gibt es nicht.
 */
const SU_HINWEIS = 'Keine amtliche Formatliste – nicht fachspezifisch belegt. In Jahrgang 1/2 in der Regel ohne Note.'

export const SACHUNTERRICHT: ExamFormat[] = [
  {
    id: 'su-wissen',
    subject: 'sachunterricht',
    label: 'Wissen und Verstehen',
    competence: 'Perspektivenübergreifend',
    description: 'Kurze Antworten, Ankreuzen und Lückensätze zu den Inhalten der Einheit.',
    afb: ['I', 'II'],
    share: 35,
    grades: [1, 4],
    material: 'none',
    note: SU_HINWEIS
  },
  {
    id: 'su-zuordnen',
    subject: 'sachunterricht',
    label: 'Zuordnen und Beschriften',
    competence: 'Naturwissenschaftliche und geographische Perspektive',
    description: 'Eine Abbildung beschriften (Pflanze, Körper, Karte) oder Bilder und Begriffe einander zuordnen.',
    afb: ['I'],
    share: 30,
    grades: [1, 4],
    material: 'image',
    note: SU_HINWEIS
  },
  {
    id: 'su-versuch',
    subject: 'sachunterricht',
    label: 'Versuch beschreiben',
    competence: 'Naturwissenschaftliche und technische Perspektive',
    description: 'Zu einem Versuch aus dem Unterricht Vermutung, Beobachtung und Erklärung aufschreiben.',
    afb: ['II'],
    share: 35,
    grades: [2, 4],
    material: 'image',
    note: SU_HINWEIS
  },
  {
    id: 'su-zeit',
    subject: 'sachunterricht',
    label: 'Früher und heute',
    competence: 'Historische und sozialwissenschaftliche Perspektive',
    description: 'Bilder oder kurze Texte vergleichen und Veränderungen beschreiben; eine eigene Meinung begründen.',
    afb: ['II', 'III'],
    share: 30,
    grades: [3, 4],
    material: 'image',
    note: SU_HINWEIS
  }
]

export const FORMATE_NEU: ExamFormat[] = [
  ...MATHEMATIK,
  ...LATEIN,
  ...GRIECHISCH,
  ...BIOLOGIE,
  ...CHEMIE,
  ...PHYSIK,
  ...TECHNIK,
  ...INFORMATIK,
  ...WIRTSCHAFT,
  ...RELIGION,
  ...ETHIK,
  ...PHILOSOPHIE,
  ...WERTE_UND_NORMEN,
  ...MUSIK,
  ...KUNST,
  ...NATURWISSENSCHAFTEN,
  ...PAEDAGOGIK,
  ...ARBEITSLEHRE,
  ...SPORT,
  ...DARSTELLENDES_SPIEL,
  ...SACHUNTERRICHT
]

/** Üblicher Aufbau je neuem Fach (Recherche 13.x) */
export const VORSCHLAG_NEU: Partial<Record<ExamSubjectId, (grade: number) => string[]>> = {
  mathematik: (g) => (g <= 7 ? ['ma-basis', 'ma-rechnen', 'ma-sachaufgabe'] : ['ma-basis', 'ma-funktionen', 'ma-sachaufgabe']),
  latein: (g) => (g <= 8 ? ['la-uebersetzung', 'la-sprache'] : ['la-uebersetzung', 'la-interpretation']),
  griechisch: (g) => (g <= 9 ? ['grc-uebersetzung', 'grc-sprache'] : ['grc-uebersetzung', 'grc-interpretation']),
  biologie: (g) => (g <= 7 ? ['bio-wissen', 'bio-experiment', 'bio-daten'] : ['bio-material', 'bio-experiment', 'bio-bewertung']),
  chemie: (g) => (g <= 7 ? ['ch-wissen', 'ch-experiment', 'ch-daten'] : ['ch-experiment', 'ch-gleichung', 'ch-bewertung']),
  physik: (g) => (g <= 7 ? ['ph-wissen', 'ph-experiment', 'ph-daten'] : ['ph-experiment', 'ph-rechnen', 'ph-bewertung']),
  technik: (g) => (g <= 7 ? ['te-wissen', 'te-modell', 'te-experiment'] : ['te-modell', 'te-experiment', 'te-bewertung']),
  informatik: (g) => (g <= 8 ? ['inf-daten', 'inf-algorithmus', 'inf-gesellschaft'] : ['inf-algorithmus', 'inf-trace', 'inf-modell']),
  wirtschaft: (g) => (g <= 8 ? ['wi-daten', 'wi-fall', 'wi-urteil'] : ['wi-text', 'wi-modell', 'wi-urteil']),
  religion: (g) => (g <= 7 ? ['re-wissen', 're-text', 're-bild'] : ['re-text', 're-fall', 're-eroerterung']),
  ethik: (g) => (g <= 7 ? ['eth-wissen', 'eth-text', 'eth-fall'] : ['eth-text', 'eth-fall', 'eth-eroerterung']),
  philosophie: (g) => (g <= 10 ? ['phil-wissen', 'phil-text', 'phil-eroerterung'] : ['phil-text', 'phil-eroerterung']),
  'werte-und-normen': (g) => (g <= 7 ? ['wun-wissen', 'wun-text', 'wun-fall'] : ['wun-text', 'wun-fall', 'wun-eroerterung']),
  musik: (g) => (g <= 7 ? ['mu-hoeren', 'mu-theorie'] : ['mu-hoeren', 'mu-analyse', 'mu-text']),
  kunst: (g) => (g <= 7 ? ['ku-bild', 'ku-gestalten'] : ['ku-bild', 'ku-vergleich']),
  // 30.09.2026
  naturwissenschaften: (g) => (g <= 7 ? ['nawi-wissen', 'nawi-experiment', 'nawi-daten'] : ['nawi-material', 'nawi-experiment', 'nawi-bewertung']),
  paedagogik: (g) => (g <= 10 ? ['paed-wissen', 'paed-text', 'paed-fall'] : ['paed-text', 'paed-fall', 'paed-eroerterung']),
  arbeitslehre: (g) => (g <= 8 ? ['al-daten', 'al-fall', 'al-urteil'] : ['al-text', 'al-modell', 'al-urteil']),
  sport: (g) => (g <= 7 ? ['sp-wissen', 'sp-bewegung'] : g <= 9 ? ['sp-wissen', 'sp-bewegung', 'sp-training'] : ['sp-bewegung', 'sp-training', 'sp-eroerterung']),
  'darstellendes-spiel': (g) => (g <= 7 ? ['ds-wissen', 'ds-reflexion'] : ['ds-analyse', 'ds-konzept', 'ds-reflexion']),
  sachunterricht: (g) => (g <= 2 ? ['su-wissen', 'su-zuordnen'] : ['su-wissen', 'su-zuordnen', 'su-versuch'])
}
