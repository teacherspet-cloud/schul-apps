/**
 * Rahmendaten für die Vorwissens-Vorschläge: Fachbeginn je Land, Integrationsfächer,
 * Methoden je Jahrgang, der Übergangswortschatz Deutsch und die Fremdsprachen-Regeln.
 *
 * Die häufigste Fehlerquelle laut Recherche (25.09.2026): die Annahme, das eigene Fach habe
 * schon stattgefunden. Politik beginnt am bayerischen Gymnasium erst in Klasse 10, Geschichte
 * in Berlin/Brandenburg erst in Klasse 7. Entscheidung der Lehrkraft: „Hinweis + angepasste
 * Vorschläge“.
 */

export interface Fachbeginn {
  fach: string
  land: string
  /** Leer = alle weiterführenden Schulformen */
  schulformen?: string[]
  ab: number
  name: string
  quelle: string
  /** Woher das Vorwissen stattdessen stammt */
  stattdessen: string
}

const RANKING = 'Gökbudak/Hedtke/Hagedorn, 5. Ranking Politische Bildung (Uni Bielefeld 2022)'
const POLITIK_STATT = 'Alltagswissen, Medien und Geschichtsunterricht'

/** Fachbeginn. Mehrere Einträge je Land: der spezifischere (mit Schulform) gewinnt. */
export const FACHBEGINN: Fachbeginn[] = [
  // Politik – Stundentafeln laut Ranking 2022
  { fach: 'politik', land: 'BW', schulformen: ['gymnasium'], ab: 8, name: 'Gemeinschaftskunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'BW', schulformen: ['realschule'], ab: 7, name: 'Gemeinschaftskunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'BY', schulformen: ['gymnasium', 'realschule'], ab: 10, name: 'Sozialkunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'BE', ab: 7, name: 'Politische Bildung', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'BB', ab: 7, name: 'Politische Bildung', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'HH', ab: 7, name: 'PGW', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'MV', ab: 7, name: 'Sozialkunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'NI', schulformen: ['gymnasium'], ab: 8, name: 'Politik-Wirtschaft', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'NI', schulformen: ['realschule', 'oberschule'], ab: 7, name: 'Politik-Wirtschaft', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'RP', schulformen: ['gymnasium'], ab: 7, name: 'Sozialkunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'SL', schulformen: ['gymnasium'], ab: 9, name: 'Sozialkunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'SN', ab: 7, name: 'GRW', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'ST', ab: 8, name: 'Sozialkunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'TH', schulformen: ['gymnasium'], ab: 9, name: 'Sozialkunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  { fach: 'politik', land: 'TH', schulformen: ['regelschule'], ab: 8, name: 'Sozialkunde', quelle: RANKING, stattdessen: POLITIK_STATT },
  // Geschichte als Einzelfach
  {
    fach: 'geschichte',
    land: 'BE',
    ab: 7,
    name: 'Geschichte',
    quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg',
    stattdessen: 'dem Integrationsfach Gesellschaftswissenschaften 5/6'
  },
  {
    fach: 'geschichte',
    land: 'BB',
    ab: 7,
    name: 'Geschichte',
    quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg',
    stattdessen: 'dem Integrationsfach Gesellschaftswissenschaften 5/6'
  },
  // Naturwissenschaften als Einzelfach
  {
    fach: 'chemie',
    land: 'BY',
    schulformen: ['gymnasium'],
    ab: 8,
    name: 'Chemie (NTG ab 8, übrige Zweige ab 9)',
    quelle: 'LehrplanPLUS Bayern',
    stattdessen: 'Natur und Technik (Kl. 5–7) und Alltagserfahrung'
  },
  {
    fach: 'chemie',
    land: 'HE',
    schulformen: ['gymnasium'],
    ab: 8,
    name: 'Chemie',
    quelle: 'Lehrplan G9 Hessen (Richtwert)',
    stattdessen: 'Biologie und Physik, Alltagserfahrung'
  },
  {
    fach: 'geschichte',
    land: 'HE',
    schulformen: ['gymnasium'],
    ab: 6,
    name: 'Geschichte',
    quelle: 'Lehrplan G9 Hessen (Richtwert)',
    stattdessen: 'dem Sachunterricht der Grundschule'
  },
  { fach: 'chemie', land: 'BW', ab: 7, name: 'Chemie', quelle: 'Bildungsplan BW 2016', stattdessen: 'BNT (Kl. 5/6)' },
  { fach: 'chemie', land: 'NW', schulformen: ['gymnasium'], ab: 7, name: 'Chemie', quelle: 'Kernlehrplan NRW 2019', stattdessen: 'Alltagserfahrung' },
  { fach: 'physik', land: 'BY', schulformen: ['gymnasium'], ab: 7, name: 'Physik', quelle: 'LehrplanPLUS Bayern', stattdessen: 'Natur und Technik (Kl. 5/6)' },
  { fach: 'physik', land: 'BW', ab: 7, name: 'Physik', quelle: 'Bildungsplan BW 2016', stattdessen: 'BNT (Kl. 5/6)' },
  { fach: 'physik', land: 'BE', ab: 7, name: 'Physik', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg', stattdessen: 'Naturwissenschaften 5/6' },
  { fach: 'physik', land: 'BB', ab: 7, name: 'Physik', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg', stattdessen: 'Naturwissenschaften 5/6' },
  { fach: 'chemie', land: 'BE', ab: 7, name: 'Chemie', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg', stattdessen: 'Naturwissenschaften 5/6' },
  { fach: 'chemie', land: 'BB', ab: 7, name: 'Chemie', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg', stattdessen: 'Naturwissenschaften 5/6' },
  { fach: 'biologie', land: 'BE', ab: 7, name: 'Biologie', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg', stattdessen: 'Naturwissenschaften 5/6' },
  { fach: 'biologie', land: 'BB', ab: 7, name: 'Biologie', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg', stattdessen: 'Naturwissenschaften 5/6' }
]

/**
 * Informatik ist in manchen Ländern kein Pflichtfach – dann hängt das Vorwissen davon ab, ob
 * die Gruppe es gewählt hatte. Informatik-Monitor 2025/26 (Stifterverband/GI).
 */
export const INFORMATIK_OHNE_PFLICHT = ['BE', 'BB', 'HE']

/** Integrationsfächer statt Einzelfächern */
export interface Integration {
  land: string
  /** Leer = alle Schulformen */
  schulformen?: string[]
  von: number
  bis: number
  bereich: 'gesellschaft' | 'nawi'
  name: string
  quelle: string
}

export const GESELLSCHAFT = ['geschichte', 'politik', 'erdkunde']
export const NAWI = ['physik', 'chemie', 'biologie']

export const INTEGRATION: Integration[] = [
  { land: 'BE', von: 5, bis: 6, bereich: 'gesellschaft', name: 'Gesellschaftswissenschaften 5/6', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg' },
  { land: 'BB', von: 5, bis: 6, bereich: 'gesellschaft', name: 'Gesellschaftswissenschaften 5/6', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg' },
  { land: 'BE', von: 5, bis: 6, bereich: 'nawi', name: 'Naturwissenschaften 5/6', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg' },
  { land: 'BB', von: 5, bis: 6, bereich: 'nawi', name: 'Naturwissenschaften 5/6', quelle: 'Rahmenlehrplan 1–10 Berlin-Brandenburg' },
  { land: 'BW', von: 5, bis: 6, bereich: 'nawi', name: 'BNT (Biologie, Naturphänomene und Technik)', quelle: 'Bildungsplan BW 2016' },
  { land: 'BY', schulformen: ['gymnasium'], von: 5, bis: 7, bereich: 'nawi', name: 'Natur und Technik', quelle: 'LehrplanPLUS Bayern' },
  {
    land: 'BY',
    schulformen: ['mittelschule'],
    von: 5,
    bis: 10,
    bereich: 'gesellschaft',
    name: 'GPG (Geschichte/Politik/Geographie)',
    quelle: 'LehrplanPLUS Bayern'
  },
  {
    land: 'NW',
    schulformen: ['hauptschule', 'gesamtschule', 'sekundarschule'],
    von: 5,
    bis: 10,
    bereich: 'gesellschaft',
    name: 'Gesellschaftslehre',
    quelle: 'Kernlehrpläne NRW'
  },
  {
    land: 'HH',
    schulformen: ['stadtteilschule'],
    von: 5,
    bis: 10,
    bereich: 'gesellschaft',
    name: 'Gesellschaftswissenschaften',
    quelle: 'Bildungspläne Hamburg'
  },
  { land: 'SH', schulformen: ['gemeinschaftsschule'], von: 5, bis: 10, bereich: 'gesellschaft', name: 'Weltkunde', quelle: RANKING },
  {
    land: 'RP',
    schulformen: ['realschule-plus', 'integrierte-gesamtschule'],
    von: 5,
    bis: 10,
    bereich: 'gesellschaft',
    name: 'Gesellschaftslehre',
    quelle: RANKING
  },
  { land: 'SL', schulformen: ['gemeinschaftsschule'], von: 5, bis: 8, bereich: 'gesellschaft', name: 'Gesellschaftswissenschaften', quelle: RANKING },
  {
    land: 'NI',
    schulformen: ['integrierte-gesamtschule'],
    von: 5,
    bis: 10,
    bereich: 'nawi',
    name: 'Naturwissenschaften',
    quelle: 'Kerncurriculum IGS Niedersachsen (2020)'
  }
]

/** Methoden und Arbeitstechniken mit dem Jahrgang, ab dem sie erwartbar sind. */
export interface Methode {
  fach: string
  text: string
  ab: number
  /** Unsicher = keine Jahrgangsnorm gefunden, nur Unterrichtspraxis */
  sicher: boolean
  quelle: string
  /** Knoten, zu denen die Methode besonders gehört */
  knoten?: string[]
}

const KLP_GE = 'Kernlehrplan NRW Geschichte (2019)'
const KLP_EK = 'Kernlehrplan NRW Erdkunde (2019)'
const NAWI_PRAXIS = 'Perspektivrahmen Sachunterricht (GDSU 2013); LehrplanPLUS NT 5'

export const METHODEN: Methode[] = [
  // Geschichte
  { fach: 'geschichte', text: 'Quellen und Darstellungen unterscheiden', ab: 6, sicher: true, quelle: `${KLP_GE}, Ende Kl. 6` },
  { fach: 'geschichte', text: 'Grundlegende Schritte der Quelleninterpretation anwenden', ab: 6, sicher: true, quelle: `${KLP_GE}, Ende Kl. 6` },
  { fach: 'geschichte', text: 'Zeitleiste lesen und anlegen (auch mit Stufen, z. B. Eskalation)', ab: 5, sicher: false, quelle: 'Unterrichtspraxis' },
  // Zeichenflächen mit Achsen (Diagramm-Antwortform, 26.09.2026) – wo Zeitleisten und Diagramme zum Fach gehören
  { fach: 'politik', text: 'Zeitleiste eines Konflikts mit Eskalationsstufen anlegen', ab: 8, sicher: false, quelle: 'Unterrichtspraxis' },
  { fach: 'politik', text: 'Diagramm zeichnen (Verläufe, Statistiken mit x-y-Achsen)', ab: 7, sicher: false, quelle: 'Unterrichtspraxis' },
  { fach: 'deutsch', text: 'Handlungsverlauf als Zeitleiste oder Spannungskurve darstellen', ab: 5, sicher: false, quelle: 'Unterrichtspraxis' },
  { fach: 'religion', text: 'Zeitleiste der Religions- und Kirchengeschichte anlegen', ab: 7, sicher: false, quelle: 'Unterrichtspraxis' },
  { fach: 'werte-und-normen', text: 'Zeitleiste zur Ideen- und Religionsgeschichte anlegen', ab: 7, sicher: false, quelle: 'Unterrichtspraxis' },
  { fach: 'biologie', text: 'Entwicklungen auf einer Zeitleiste darstellen (Erdzeitalter, Evolution)', ab: 8, sicher: false, quelle: 'Unterrichtspraxis' },
  { fach: 'erdkunde', text: 'Erdgeschichte auf einer Zeitleiste mit Abschnitten darstellen', ab: 7, sicher: false, quelle: 'Unterrichtspraxis' },
  { fach: 'erdkunde', text: 'Diagramm zeichnen (Verläufe, Klimadiagramm)', ab: 6, sicher: true, quelle: `${KLP_EK}, Ende Kl. 6` },
  { fach: 'mathematik', text: 'Diagramm zeichnen: Wertepaare und Graphen im Koordinatensystem', ab: 5, sicher: true, quelle: 'Bildungsstandards Mathematik, Leitidee Funktionaler Zusammenhang' },
  { fach: 'mathematik', text: 'Schrägbild zeichnen (Körper und Punkte im Raum)', ab: 7, sicher: false, quelle: 'Unterrichtspraxis Kl. 7–10' },
  {
    fach: 'geschichte',
    text: 'Karikaturen interpretieren',
    ab: 8,
    sicher: false,
    quelle: 'Unterrichtspraxis (keine Jahrgangsnorm)',
    knoten: ['g-1848', 'g-weimar', 'g-kalterkrieg']
  },
  { fach: 'geschichte', text: 'Geschichtskarten auswerten', ab: 7, sicher: false, quelle: 'Unterrichtspraxis (keine Jahrgangsnorm)' },
  { fach: 'geschichte', text: 'Quellengattungen unterscheiden und quellenkritisch einleiten', ab: 9, sicher: true, quelle: `${KLP_GE}, Ende Sek I` },
  // Politik
  { fach: 'politik', text: 'Schaubilder und Statistiken auswerten', ab: 7, sicher: false, quelle: 'Unterrichtspraxis (keine Jahrgangsnorm)' },
  { fach: 'politik', text: 'Karikaturen analysieren', ab: 8, sicher: false, quelle: 'Unterrichtspraxis (keine Jahrgangsnorm)' },
  { fach: 'politik', text: 'Pro-Contra-Debatte führen', ab: 7, sicher: false, quelle: 'Unterrichtspraxis (keine Jahrgangsnorm)' },
  // Erdkunde
  { fach: 'erdkunde', text: 'Atlas nutzen (Register, Planquadrate)', ab: 5, sicher: true, quelle: `${KLP_EK}, Ende Kl. 6` },
  { fach: 'erdkunde', text: 'Einfache Diagramme auswerten', ab: 6, sicher: true, quelle: `${KLP_EK}, Ende Kl. 6` },
  {
    fach: 'erdkunde',
    text: 'Klimadiagramme lesen und auswerten',
    ab: 7,
    sicher: false,
    quelle: 'Unterrichtspraxis (in Bayern oft Kl. 7)',
    knoten: ['e-klimazonen', 'e-klimawandel']
  },
  { fach: 'erdkunde', text: 'Bevölkerungspyramiden auswerten', ab: 8, sicher: false, quelle: 'Unterrichtspraxis', knoten: ['e-bevoelkerung'] },
  // Naturwissenschaften
  ...['physik', 'chemie', 'biologie'].flatMap((fach) => [
    { fach, text: 'Beobachten, vermuten, prüfen', ab: 3, sicher: true, quelle: NAWI_PRAXIS },
    { fach, text: 'Versuchsprotokoll (Frage, Vermutung, Durchführung, Beobachtung, Auswertung)', ab: 5, sicher: false, quelle: 'Unterrichtspraxis ab Kl. 5/6' },
    { fach, text: 'Modelle als vereinfachte Abbilder nutzen', ab: 5, sicher: false, quelle: 'Unterrichtspraxis' },
    { fach, text: 'Variablen kontrollieren, Messfehler betrachten', ab: 7, sicher: false, quelle: 'Unterrichtspraxis Kl. 7–10' },
    { fach, text: 'Messwerte in Tabellen und Liniendiagrammen darstellen', ab: 7, sicher: false, quelle: 'Mathematik: Koordinatensystem Kl. 6–8' }
  ]),
  {
    fach: 'biologie',
    text: 'Mikroskopieren und mikroskopische Zeichnung anfertigen',
    ab: 5,
    sicher: false,
    quelle: 'Unterrichtspraxis',
    knoten: ['b-zelle', 'b-zellteilung']
  },
  { fach: 'physik', text: 'Mit Formelgrößen und Einheiten rechnen', ab: 7, sicher: false, quelle: 'Unterrichtspraxis Kl. 7/8' },
  {
    fach: 'chemie',
    text: 'Reaktionsschemata und Reaktionsgleichungen aufstellen',
    ab: 8,
    sicher: false,
    quelle: 'Unterrichtspraxis',
    knoten: ['c-atom', 'c-ionen', 'c-saeure']
  },
  // Mathematik
  {
    fach: 'mathematik',
    text: 'Tabellen, Strich- und Säulendiagramme lesen',
    ab: 3,
    sicher: true,
    quelle: 'KMK-Bildungsstandards Mathematik Primarbereich (2022)'
  },
  { fach: 'mathematik', text: 'Mit Geodreieck zeichnen und messen', ab: 5, sicher: false, quelle: 'Unterrichtspraxis' },
  { fach: 'mathematik', text: 'Punkte im Koordinatensystem eintragen', ab: 6, sicher: false, quelle: 'Unterrichtspraxis Kl. 6–8' },
  { fach: 'mathematik', text: 'Taschenrechner sinnvoll einsetzen', ab: 7, sicher: false, quelle: 'Unterrichtspraxis' },
  // Deutsch
  {
    fach: 'deutsch',
    text: 'Wörterbuch nutzen, Rechtschreibstrategien anwenden',
    ab: 3,
    sicher: true,
    quelle: 'KMK-Bildungsstandards Deutsch Primarbereich (2022)'
  },
  { fach: 'deutsch', text: 'Texte markieren und Randnotizen machen', ab: 5, sicher: false, quelle: 'Unterrichtspraxis' },
  {
    fach: 'deutsch',
    text: 'Zitieren mit Zeilenangabe',
    ab: 8,
    sicher: true,
    quelle: 'LehrplanPLUS Bayern Deutsch 8; KMK MSA (2022)',
    knoten: ['d-textanalyse']
  },
  { fach: 'deutsch', text: 'Schreibplan anlegen und Texte überarbeiten', ab: 5, sicher: false, quelle: 'Unterrichtspraxis' },
  // Informatik
  { fach: 'informatik', text: 'Programme in einer Blocksprache schreiben', ab: 5, sicher: false, quelle: 'GI-Bildungsstandards Sek I (2025), Stufe 5–6' },
  {
    fach: 'informatik',
    text: 'Ablauf eines Algorithmus mit Struktogramm oder Flussdiagramm darstellen',
    ab: 7,
    sicher: false,
    quelle: 'GI-Bildungsstandards Sek I (2025), Stufe 7–10'
  },
  // Kunst
  { fach: 'kunst', text: 'Bilder beschreiben (Bildgegenstand, Farbe, Komposition)', ab: 5, sicher: true, quelle: 'Kernlehrplan NRW Kunst (2019), Ende Kl. 6' },
  { fach: 'kunst', text: 'Werkanalyse mit Bildbeschreibung, Analyse, Deutung', ab: 9, sicher: false, quelle: 'Unterrichtspraxis' },
  // Musik
  {
    fach: 'musik',
    text: 'Musik hören und beschreiben (Tempo, Dynamik, Instrumente)',
    ab: 5,
    sicher: true,
    quelle: 'Kernlehrplan NRW Musik (2019), Ende Kl. 6'
  },
  { fach: 'musik', text: 'Partitur mitlesen', ab: 8, sicher: false, quelle: 'Kernlehrplan NRW Musik (2019), Ende Sek I' },
  // Religion, Ethik, Philosophie
  {
    fach: 'religion',
    text: 'Bibelstellen nachschlagen (Buch, Kapitel, Vers)',
    ab: 5,
    sicher: true,
    quelle: 'Kernlehrplan NRW Religionslehre (2019), Stufe 5/6'
  },
  { fach: 'religion', text: 'Bilder und Symbole deuten', ab: 5, sicher: false, quelle: 'Unterrichtspraxis' },
  {
    fach: 'ethik',
    text: 'Mit Gedankenexperimenten philosophische Fragen entwickeln',
    ab: 5,
    sicher: true,
    quelle: 'Kernlehrplan NRW Praktische Philosophie (2024), bis Ende Kl. 6'
  },
  { fach: 'ethik', text: 'Argumente formulieren und prüfen', ab: 5, sicher: true, quelle: 'Kernlehrplan NRW Praktische Philosophie (2024), bis Ende Kl. 6' },
  { fach: 'ethik', text: 'Dilemmata diskutieren und Güter abwägen', ab: 8, sicher: false, quelle: 'Unterrichtspraxis' },
  // Sport
  { fach: 'sport', text: 'Puls messen und Belastung einschätzen', ab: 7, sicher: false, quelle: 'Kernlehrplan NRW Sport (2019), Ende Sek I' },
  { fach: 'sport', text: 'Sicherheitsvereinbarungen und Helfen/Sichern', ab: 5, sicher: true, quelle: 'Kernlehrplan NRW Sport (2019), Ende Kl. 6' }
]

/**
 * Deutsch: der Übergangsbestand in Klasse 5.
 *
 * KMK-Bildungsstandards Deutsch Primarbereich (2022), Anhang „Grundlegende sprachliche
 * Strukturen und Begriffe“ – ausdrücklich als bekannt am Übergang deklariert. Die
 * belastbarste Quelle der ganzen Recherche; deshalb gilt sie als sicher.
 */
export const DEUTSCH_PRIMAR = [
  'Begriffe: Wortart, Nomen (Einzahl/Mehrzahl, Fall, Geschlecht), Verb (Grundform, gebeugte Form), Artikel, Adjektiv (Steigerung), Pronomen',
  'Begriffe: Präsens, Präteritum, Futur',
  'Begriffe: Satzarten, wörtliche Rede',
  'Begriffe: Subjekt, Prädikat, Satzglied/Ergänzung',
  'Begriffe: Figur, Handlung, Reim, Vers, Strophe'
]
export const DEUTSCH_PRIMAR_QUELLE = 'KMK-Bildungsstandards Deutsch Primarbereich (2022), Anhang'

/**
 * Fremdsprachen: Methoden und Textsorten nach Lernjahr.
 *
 * Kernlehrpläne NRW Englisch (2019) und Französisch/Spanisch (2019), die in allen Fremdsprachen
 * gleich aufgebaut sind; ergänzt um LehrplanPLUS Bayern Englisch 8 für die formellen Textsorten.
 */
export interface SprachMethode {
  text: string
  /** Lernjahr, ab dem es bekannt ist */
  ab: number
  art: 'methode' | 'fach'
  quelle: string
  /** Nur für die 1. Fremdsprache (Englisch) */
  nurEnglisch?: boolean
}

const KLP_E = 'Kernlehrplan NRW Englisch (2019)'
const KLP_F = 'Kernlehrplan NRW Französisch/Spanisch (2019)'

export const SPRACH_METHODEN: SprachMethode[] = [
  { text: 'Zweisprachiges Wörterbuch und Wortschatzanhang des Lehrwerks nutzen', ab: 2, art: 'methode', quelle: `${KLP_E}, Ende Kl. 6` },
  { text: 'Persönliche Textsorten: E-Mail, Postkarte, Tagebucheintrag, Textnachricht', ab: 2, art: 'fach', quelle: `${KLP_E}, Ende Kl. 6` },
  { text: 'Einfache Informationen sinngemäß mitteln (Sprachmittlung)', ab: 2, art: 'methode', quelle: `${KLP_E}; GER-Begleitband (2020)` },
  {
    text: 'Soziokulturelles Grundwissen: Alltag, Schule und eine Region in Großbritannien',
    ab: 3,
    art: 'fach',
    quelle: `${KLP_E}, Ende Kl. 6`,
    nurEnglisch: true
  },
  { text: 'Kritischer Umgang mit Übersetzungsprogrammen', ab: 4, art: 'methode', quelle: `${KLP_E}, Ende erste Stufe` },
  { text: 'Formelle Textsorten: formeller Brief, Bericht, Filmkritik', ab: 4, art: 'fach', quelle: 'LehrplanPLUS Bayern Englisch 8' },
  {
    text: 'Grundwissen zu UK und USA (Geografie, Politik, Geschichte)',
    ab: 5,
    art: 'fach',
    quelle: `${KLP_E}, Ende erste Stufe`,
    nurEnglisch: true
  },
  { text: 'Ein- und zweisprachige Wörterbücher nutzen', ab: 6, art: 'methode', quelle: `${KLP_E}, Ende Sek I; ${KLP_F}` }
]

/** Transfer in der 2./3. Fremdsprache (Meißner, Mehrsprachigkeitsdidaktik; KLP NRW Französisch) */
export const TRANSFER_AUS_ENGLISCH = [
  'Aus Englisch bekannt: Wörterbucharbeit, Texterschließung, Sprachmittlung als Aufgabenformat',
  'Aus Englisch bekannt: Textsorten wie E-Mail, Blog, Beschreibung – nur das Sprachniveau ist niedriger'
]
export const TRANSFER_QUELLE = 'Kernlehrplan NRW Französisch (2019); Meißner, Mehrsprachigkeitsdidaktik'

/** Latein: kulturelles Vorwissen der Lehrbuchphase (KLP NRW Latein 2019, erste Stufe) */
export const LATEIN_KULTUR = {
  lehrbuch: 'Rom und seine Provinzen, römische Familie, Sklaverei, Frühgeschichte und Republik, griechisch-römische Mythen',
  lektuere: 'Originallektüre, Prinzipat, Stoa und Epikureismus',
  quelle: 'Kernlehrplan NRW Latein (2019)'
}
