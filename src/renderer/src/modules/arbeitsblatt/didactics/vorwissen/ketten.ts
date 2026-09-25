/**
 * Voraussetzungsketten je Fach – „A vor B“, mit Fachbegriffen und typischen Fehlvorstellungen.
 *
 * Wunsch der Lehrkraft (25.09.2026): Vorschläge zum Vorwissen, die „dynamisch auf Fach, Thema,
 * Jahrgang, Lernziel usw. reagieren“. Entscheidungen aus der Rücksprache:
 *
 * - REIHENFOLGE STATT JAHRGANG. Fachlogisch zwingende Folgen (Brüche vor Prozent, Teilchenmodell
 *   vor Atommodell, Wortarten vor Satzgliedern) gelten in jedem Land. Einen JAHRGANG nennt die
 *   App nur, wo er in einem Lehrplan nachgelesen ist – und nur für das Gymnasium, auf das sich
 *   die geprüften Pläne beziehen. Sonst heißt es „vermutlich behandelt – bitte prüfen“.
 * - Fehlvorstellungen sind KEIN Vorwissen, das vorausgesetzt wird, sondern etwas, das das Blatt
 *   aufgreifen soll (Kattmann u. a. 1997, Didaktische Rekonstruktion; Vosniadou).
 *
 * Belege der Jahrgänge (alle Gymnasium, in der Recherche vom 25.09.2026 nachgelesen):
 * - NW: Kernlehrpläne G9 (MSB NRW 2019), Lehrplannavigator – nur „Ende Erprobungsstufe“ (5/6)
 *   und „Ende Sek I“ (7–10), weil die Pläne selbst nicht feiner gliedern.
 * - BY: LehrplanPLUS Gymnasium, Fachlehrpläne je Jahrgangsstufe.
 * - BW: Bildungsplan 2016, Doppeljahrgänge.
 * - BE/BB: Rahmenlehrplan 1–10.
 *
 * Fehlvorstellungen: Padberg & Wartha, Didaktik der Bruchrechnung (2017); Schecker, Wilhelm,
 * Hopf & Duit, Schülervorstellungen und Physikunterricht (2018); Barke, Chemiedidaktik (2006) und
 * Barke u. a., Chemiedidaktik kompakt (2018); Hammann & Asshoff, Schülervorstellungen im
 * Biologieunterricht (2014/2023); Diethelm & Zumbrägel (2010); Möller u. a. (2002); Reinfried,
 * Schülervorstellungen und geographisches Lernen (2010); Günther-Arndt (Geschichte);
 * Granzow-Emden (Grammatik, 2021).
 */

import { JAHRGANG_NACHTRAG, KNOTEN_NACHTRAG } from './nachtrag'

/** Länder mit nachgelesenen Jahrgängen */
export type BelegLand = 'NW' | 'BY' | 'BW' | 'BE' | 'BB' | 'NI' | 'HE'

export const LEHRPLAN: Record<BelegLand, string> = {
  NW: 'Kernlehrplan NRW',
  BY: 'LehrplanPLUS Bayern',
  BW: 'Bildungsplan BW',
  BE: 'Rahmenlehrplan Berlin-Brandenburg',
  BB: 'Rahmenlehrplan Berlin-Brandenburg',
  NI: 'Kerncurriculum Niedersachsen',
  HE: 'Lehrplan G9 Hessen'
}

/**
 * Hessen: Die G9-Lehrpläne gelten nur, wo die Schule kein eigenes Schulcurriculum beschlossen
 * hat (Hessisches Kultusministerium). Ihre Jahrgänge sind deshalb Richtwerte, nie „sicher“.
 */
export const NUR_RICHTWERT: BelegLand[] = ['HE']

export interface Fehlvorstellung {
  text: string
  quelle: string
}

export interface Knoten {
  id: string
  fach: string
  /** So erscheint der Knoten als Vorschlag: kurz und konkret */
  titel: string
  /** Kleingeschrieben; trifft, wenn Thema oder Lernziel es enthält */
  stichwoerter: string[]
  /** Unmittelbare Voraussetzungen (ids) */
  nach?: string[]
  /** Fachbegriffe, die nach diesem Knoten bekannt sind */
  begriffe?: string[]
  /** Typische Inhalte einer Einheit zu diesem Knoten – für Klassenarbeit und Kurztest */
  inhalte?: string[]
  fehlvorstellungen?: Fehlvorstellung[]
  /** Nachgelesene Jahrgangsspanne (Gymnasium) */
  jahrgang?: Partial<Record<BelegLand, [number, number]>>
}

const PADBERG = 'Padberg & Wartha, Didaktik der Bruchrechnung (2017)'
const MATHE_GV = 'Grundvorstellungen nach vom Hofe; Prediger u. a., Mathe sicher können (DZLM)'
const SCHECKER = 'Schecker u. a., Schülervorstellungen und Physikunterricht (2018)'
const BARKE = 'Barke, Chemiedidaktik: Schülervorstellungen (2006); Barke u. a. (2018)'
const HAMMANN = 'Hammann & Asshoff, Schülervorstellungen im Biologieunterricht (2014/2023)'
const REINFRIED = 'Reinfried, Schülervorstellungen und geographisches Lernen (2010)'
const GUENTHER_ARNDT = 'Günther-Arndt/Sauer, Geschichtsdidaktik empirisch (2006)'
const LANGE = 'Lange, Bürgerbewusstsein (GWP 3/2008); fachdidaktischer Konsens'
const GRANZOW = 'Granzow-Emden, Didaktik Deutsch 50 (2021)'
const INFO_FV = 'Diethelm & Zumbrägel (2010); Sorva (2012); Qian & Lehman (2017)'

const BASIS: Knoten[] = [
  // ------------------------------------------------------------------ Mathematik
  {
    id: 'm-natuerlich',
    fach: 'mathematik',
    titel: 'Grundrechenarten mit natürlichen Zahlen, schriftliche Verfahren',
    stichwoerter: ['natürliche zahlen', 'schriftlich', 'grundrechenarten'],
    begriffe: ['Summe', 'Differenz', 'Produkt', 'Quotient']
  },
  {
    id: 'm-groessen',
    fach: 'mathematik',
    titel: 'Größen und Einheiten (Länge, Masse, Zeit, Geld) umrechnen',
    stichwoerter: ['größen', 'einheiten', 'umrechnen'],
    nach: ['m-natuerlich'],
    begriffe: ['Maßzahl', 'Einheit']
  },
  {
    id: 'm-flaeche',
    fach: 'mathematik',
    titel: 'Umfang und Flächeninhalt von Rechteck und Quadrat',
    stichwoerter: ['flächeninhalt', 'umfang', 'rechteck', 'volumen', 'quader', 'oberfläche'],
    nach: ['m-groessen'],
    begriffe: ['Flächeneinheit', 'Umfang', 'Flächeninhalt'],
    inhalte: ['Flächeneinheiten umrechnen', 'Flächeninhalt zusammengesetzter Figuren', 'Umfang', 'Quader: Oberfläche und Volumen'],
    fehlvorstellungen: [{ text: 'Größerer Umfang bedeutet immer größeren Flächeninhalt.', quelle: MATHE_GV }]
  },
  {
    id: 'm-teiler',
    fach: 'mathematik',
    titel: 'Teiler, Vielfache, Teilbarkeitsregeln',
    stichwoerter: ['teiler', 'vielfache', 'teilbarkeit', 'primzahl', 'ggt', 'kgv'],
    nach: ['m-natuerlich'],
    begriffe: ['Teiler', 'Vielfaches', 'Primzahl']
  },
  {
    id: 'm-brueche',
    fach: 'mathematik',
    titel: 'Bruchrechnung: kürzen, erweitern, Grundrechenarten mit Brüchen',
    stichwoerter: ['bruch', 'brüche', 'bruchrechnung', 'bruchzahl'],
    nach: ['m-teiler'],
    begriffe: ['Zähler', 'Nenner', 'Hauptnenner', 'kürzen', 'erweitern'],
    inhalte: [
      'Brüche darstellen',
      'Kürzen und Erweitern',
      'Brüche vergleichen',
      'Addition und Subtraktion',
      'Multiplikation und Division',
      'Sachaufgaben mit Brüchen'
    ],
    fehlvorstellungen: [
      { text: '1/4 ist größer als 1/3, weil 4 größer als 3 ist.', quelle: PADBERG },
      { text: '1/2 + 1/3 = 2/5 (Zähler und Nenner getrennt addieren).', quelle: PADBERG },
      { text: 'Multiplizieren macht immer größer, Dividieren immer kleiner.', quelle: PADBERG }
    ],
    jahrgang: { BY: [6, 6] }
  },
  {
    id: 'm-dezimal',
    fach: 'mathematik',
    titel: 'Dezimalzahlen: Stellenwerte, runden, rechnen',
    stichwoerter: ['dezimal', 'kommazahl'],
    nach: ['m-brueche'],
    begriffe: ['Zehntel', 'Hundertstel', 'Stellenwert'],
    fehlvorstellungen: [{ text: '0,25 ist größer als 0,3, weil die Zahl länger ist.', quelle: PADBERG }],
    jahrgang: { BY: [6, 6] }
  },
  {
    id: 'm-prozent',
    fach: 'mathematik',
    titel: 'Prozentrechnung: Grundwert, Prozentwert, Prozentsatz',
    stichwoerter: ['prozent', 'zins'],
    nach: ['m-brueche', 'm-dezimal', 'm-proportional'],
    begriffe: ['Grundwert', 'Prozentwert', 'Prozentsatz'],
    inhalte: [
      'Prozentsatz, Prozentwert, Grundwert berechnen',
      'Prozentstreifen/Dreisatz',
      'Vermehrter und verminderter Grundwert',
      'Zinsrechnung',
      'Diagramme mit Prozentangaben'
    ],
    fehlvorstellungen: [
      { text: '+20 % und danach −20 % heben sich auf.', quelle: MATHE_GV },
      { text: 'Grundwert und Prozentwert werden verwechselt.', quelle: MATHE_GV }
    ],
    jahrgang: { BY: [6, 7] }
  },
  {
    id: 'm-negativ',
    fach: 'mathematik',
    titel: 'Negative Zahlen: Zahlengerade, Grundrechenarten',
    stichwoerter: ['negative zahl', 'ganze zahlen', 'rationale zahl'],
    nach: ['m-natuerlich'],
    begriffe: ['Vorzeichen', 'Betrag', 'Gegenzahl'],
    jahrgang: { BY: [6, 6] }
  },
  {
    id: 'm-proportional',
    fach: 'mathematik',
    titel: 'Proportionale und antiproportionale Zuordnungen, Dreisatz',
    stichwoerter: ['zuordnung', 'proportional', 'dreisatz'],
    nach: ['m-brueche'],
    begriffe: ['Zuordnung', 'proportional', 'Quotientengleichheit']
  },
  {
    id: 'm-terme',
    fach: 'mathematik',
    titel: 'Terme mit Variablen aufstellen und umformen',
    stichwoerter: ['term', 'variable', 'ausmultiplizieren', 'ausklammern', 'binomische'],
    nach: ['m-negativ', 'm-brueche'],
    begriffe: ['Variable', 'Term', 'Koeffizient'],
    fehlvorstellungen: [
      { text: 'Die Variable ist eine Abkürzung für einen Gegenstand („a = Äpfel“).', quelle: MATHE_GV },
      { text: 'Das Gleichheitszeichen heißt „ergibt“ statt „ist gleichwertig“.', quelle: MATHE_GV }
    ],
    jahrgang: { BY: [7, 7] }
  },
  {
    id: 'm-lingleichung',
    fach: 'mathematik',
    titel: 'Lineare Gleichungen durch Äquivalenzumformung lösen',
    stichwoerter: ['gleichung', 'äquivalenzumformung', 'gleichungssystem'],
    nach: ['m-terme'],
    begriffe: ['Äquivalenzumformung', 'Lösungsmenge'],
    inhalte: ['Gleichungen aufstellen', 'Äquivalenzumformungen', 'Probe', 'Textaufgaben mit Gleichungen'],
    jahrgang: { BY: [7, 7] }
  },
  {
    id: 'm-linfunktion',
    fach: 'mathematik',
    titel: 'Lineare Funktionen: Steigung, y-Achsenabschnitt, Graph',
    stichwoerter: ['lineare funktion', 'steigung', 'geradengleichung'],
    nach: ['m-proportional', 'm-lingleichung', 'm-koordinaten'],
    begriffe: ['Steigung', 'y-Achsenabschnitt', 'Steigungsdreieck'],
    inhalte: ['Funktionsgleichung y = mx + b', 'Steigungsdreieck', 'Graph zeichnen', 'Nullstelle', 'Schnittpunkt zweier Geraden'],
    fehlvorstellungen: [{ text: 'Der Graph ist ein Bild der Situation (Weg-Zeit-Graph als „Berg“).', quelle: MATHE_GV }]
  },
  {
    id: 'm-koordinaten',
    fach: 'mathematik',
    titel: 'Koordinatensystem: Punkte eintragen und ablesen',
    stichwoerter: ['koordinatensystem', 'koordinaten'],
    begriffe: ['x-Achse', 'y-Achse', 'Ursprung']
  },
  {
    id: 'm-wurzel',
    fach: 'mathematik',
    titel: 'Quadratwurzeln und reelle Zahlen',
    stichwoerter: ['wurzel', 'reelle zahl', 'irrational'],
    nach: ['m-terme'],
    begriffe: ['Radikand', 'Quadratwurzel'],
    jahrgang: { BY: [9, 9] }
  },
  {
    id: 'm-quadratisch',
    fach: 'mathematik',
    titel: 'Quadratische Funktionen und Gleichungen',
    stichwoerter: ['quadratische', 'parabel', 'scheitelpunkt', 'pq-formel', 'mitternachtsformel'],
    nach: ['m-linfunktion', 'm-wurzel'],
    begriffe: ['Parabel', 'Scheitelpunkt', 'Normalparabel'],
    inhalte: ['Normalparabel verschieben und strecken', 'Scheitelpunktform', 'Nullstellen', 'Lösungsformel', 'Anwendungsaufgaben'],
    jahrgang: { BY: [9, 9] }
  },
  {
    id: 'm-pythagoras',
    fach: 'mathematik',
    titel: 'Satz des Pythagoras',
    stichwoerter: ['pythagoras', 'hypotenuse', 'kathete'],
    nach: ['m-wurzel', 'm-flaeche'],
    begriffe: ['Hypotenuse', 'Kathete', 'rechter Winkel'],
    jahrgang: { BY: [9, 9] }
  },
  {
    id: 'm-trigonometrie',
    fach: 'mathematik',
    titel: 'Sinus, Kosinus, Tangens am rechtwinkligen Dreieck',
    stichwoerter: ['trigonometrie', 'sinus', 'kosinus', 'tangens'],
    nach: ['m-pythagoras', 'm-aehnlich'],
    begriffe: ['Ankathete', 'Gegenkathete', 'Sinus', 'Kosinus', 'Tangens'],
    jahrgang: { BY: [9, 10] }
  },
  {
    id: 'm-aehnlich',
    fach: 'mathematik',
    titel: 'Ähnlichkeit und Strahlensätze',
    stichwoerter: ['ähnlich', 'strahlensatz', 'zentrische streckung'],
    nach: ['m-proportional'],
    begriffe: ['Streckfaktor', 'ähnliche Figuren'],
    jahrgang: { BY: [9, 9] }
  },
  {
    id: 'm-exponential',
    fach: 'mathematik',
    titel: 'Exponentielles Wachstum und Exponentialfunktionen',
    stichwoerter: ['exponential', 'wachstum', 'zerfall', 'logarithmus'],
    nach: ['m-prozent', 'm-quadratisch'],
    begriffe: ['Wachstumsfaktor', 'Halbwertszeit']
  },
  {
    id: 'm-analysis',
    fach: 'mathematik',
    titel: 'Ableitung und Kurvendiskussion',
    stichwoerter: ['ableitung', 'differenzial', 'kurvendiskussion', 'extrempunkt', 'integral'],
    nach: ['m-quadratisch', 'm-exponential'],
    begriffe: ['Ableitung', 'Tangente', 'Extrempunkt', 'Wendepunkt']
  },
  {
    id: 'm-daten',
    fach: 'mathematik',
    titel: 'Daten in Tabellen und Säulendiagrammen darstellen',
    stichwoerter: ['diagramm', 'daten', 'statistik', 'mittelwert', 'boxplot'],
    begriffe: ['Häufigkeit', 'Mittelwert']
  },
  {
    id: 'm-wahrscheinlichkeit',
    fach: 'mathematik',
    titel: 'Wahrscheinlichkeiten bei Zufallsexperimenten',
    stichwoerter: ['wahrscheinlichkeit', 'zufall', 'baumdiagramm'],
    nach: ['m-brueche', 'm-daten'],
    begriffe: ['Ergebnis', 'Ereignis', 'relative Häufigkeit'],
    fehlvorstellungen: [{ text: 'Nach fünfmal Kopf muss jetzt Zahl kommen.', quelle: MATHE_GV }]
  },

  // ------------------------------------------------------------------ Physik
  {
    id: 'p-stromkreis',
    fach: 'physik',
    titel: 'Einfacher Stromkreis, Leiter und Nichtleiter',
    stichwoerter: ['stromkreis', 'leiter', 'schaltung', 'reihenschaltung', 'parallelschaltung'],
    begriffe: ['Stromquelle', 'Leiter', 'Nichtleiter', 'Schalter'],
    inhalte: ['Geschlossener Stromkreis', 'Schaltzeichen', 'Leiter und Nichtleiter', 'Reihen- und Parallelschaltung'],
    fehlvorstellungen: [
      { text: 'Strom wird in der Lampe verbraucht.', quelle: SCHECKER },
      { text: 'Die Batterie liefert immer dieselbe Stromstärke.', quelle: SCHECKER }
    ],
    jahrgang: { NW: [5, 6] }
  },
  {
    id: 'p-elektrik',
    fach: 'physik',
    titel: 'Stromstärke, Spannung und Widerstand (Ohm’sches Gesetz)',
    stichwoerter: ['stromstärke', 'spannung', 'widerstand', 'ohm'],
    nach: ['p-stromkreis', 'm-proportional'],
    begriffe: ['Stromstärke', 'Spannung', 'Widerstand', 'Ampere', 'Volt', 'Ohm'],
    inhalte: ['Messung von Stromstärke und Spannung', 'Ohm’sches Gesetz', 'Widerstand in Reihen- und Parallelschaltung', 'Elektrische Leistung'],
    fehlvorstellungen: [{ text: 'Spannung und Stromstärke sind dasselbe.', quelle: SCHECKER }],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'p-magnetismus',
    fach: 'physik',
    titel: 'Magnete und Magnetfeld',
    stichwoerter: ['magnet', 'magnetfeld', 'kompass'],
    begriffe: ['Nordpol', 'Südpol', 'Magnetfeld'],
    jahrgang: { NW: [5, 6] }
  },
  {
    id: 'p-induktion',
    fach: 'physik',
    titel: 'Elektromagnetische Induktion, Generator, Transformator',
    stichwoerter: ['induktion', 'generator', 'transformator', 'elektromotor'],
    nach: ['p-elektrik', 'p-magnetismus'],
    begriffe: ['Induktion', 'Spule', 'Wechselspannung'],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'p-waerme',
    fach: 'physik',
    titel: 'Temperatur und Wärme',
    stichwoerter: ['temperatur', 'wärme', 'thermometer', 'aggregatzustand'],
    begriffe: ['Temperatur', 'Wärme', 'Grad Celsius'],
    fehlvorstellungen: [
      { text: 'Wärme und Temperatur sind dasselbe.', quelle: SCHECKER },
      { text: 'Kälte ist ein eigener Stoff; eine Wolljacke „wärmt“ von selbst.', quelle: SCHECKER }
    ],
    jahrgang: { NW: [5, 6] }
  },
  {
    id: 'p-licht',
    fach: 'physik',
    titel: 'Lichtausbreitung, Schatten, Reflexion',
    stichwoerter: ['licht', 'schatten', 'reflexion', 'spiegel'],
    begriffe: ['Lichtquelle', 'Lichtstrahl', 'Kernschatten'],
    fehlvorstellungen: [{ text: 'Sehen geht vom Auge aus („Sehstrahl“).', quelle: SCHECKER }],
    jahrgang: { NW: [5, 6] }
  },
  {
    id: 'p-optik',
    fach: 'physik',
    titel: 'Brechung, Linsen und optische Geräte',
    stichwoerter: ['brechung', 'linse', 'brennweite', 'optische', 'auge'],
    nach: ['p-licht'],
    begriffe: ['Brennpunkt', 'Brennweite', 'Sammellinse'],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'p-kraft',
    fach: 'physik',
    titel: 'Kraft und Bewegung (Geschwindigkeit, Newton’sche Gesetze)',
    stichwoerter: ['kraft', 'newton', 'beschleunigung', 'geschwindigkeit', 'bewegung', 'trägheit'],
    nach: ['m-proportional'],
    begriffe: ['Kraft', 'Newton', 'Geschwindigkeit', 'Trägheit'],
    inhalte: ['Geschwindigkeit', 'Kraft als Ursache von Bewegungsänderung', 'Trägheitsgesetz', 'Kraftpfeile', 'Reibung'],
    fehlvorstellungen: [
      { text: 'Bewegung braucht eine Kraft; ohne Kraft kommt jeder Körper zur Ruhe.', quelle: SCHECKER },
      { text: 'Schwere Körper fallen schneller.', quelle: SCHECKER }
    ],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'p-energie',
    fach: 'physik',
    titel: 'Energieformen, Energieerhaltung und Wirkungsgrad',
    stichwoerter: ['energie', 'wirkungsgrad', 'energieerhaltung'],
    nach: ['p-kraft', 'p-waerme'],
    begriffe: ['Energieform', 'Energieerhaltung', 'Joule'],
    fehlvorstellungen: [{ text: 'Energie wird verbraucht (statt umgewandelt und entwertet).', quelle: SCHECKER }]
  },
  {
    id: 'p-druck',
    fach: 'physik',
    titel: 'Dichte, Druck und Auftrieb',
    stichwoerter: ['dichte', 'druck', 'auftrieb', 'schwimmen'],
    nach: ['p-kraft'],
    begriffe: ['Dichte', 'Druck', 'Auftrieb'],
    fehlvorstellungen: [{ text: 'Ob etwas schwimmt, hängt nur vom Gewicht ab.', quelle: SCHECKER }]
  },
  {
    id: 'p-radioaktivitaet',
    fach: 'physik',
    titel: 'Atomkern und Radioaktivität',
    stichwoerter: ['radioaktiv', 'strahlung', 'halbwertszeit', 'kernspaltung'],
    nach: ['c-atom'],
    begriffe: ['Isotop', 'Alpha-, Beta-, Gammastrahlung', 'Halbwertszeit'],
    jahrgang: { NW: [7, 10] }
  },

  // ------------------------------------------------------------------ Chemie
  {
    id: 'c-stoffe',
    fach: 'chemie',
    titel: 'Stoffe und Stoffeigenschaften, Stofftrennung',
    stichwoerter: ['stoffeigenschaft', 'stofftrennung', 'gemisch', 'reinstoff'],
    begriffe: ['Reinstoff', 'Gemisch', 'Siedetemperatur', 'Löslichkeit'],
    inhalte: ['Stoffeigenschaften untersuchen', 'Reinstoffe und Gemische', 'Trennverfahren'],
    fehlvorstellungen: [{ text: 'Beim Lösen verschwindet der Stoff (Zucker „ist weg“).', quelle: BARKE }],
    jahrgang: { NW: [7, 8] }
  },
  {
    id: 'c-teilchen',
    fach: 'chemie',
    titel: 'Einfaches Teilchenmodell, Aggregatzustände',
    stichwoerter: ['teilchenmodell', 'teilchen', 'aggregatzustand'],
    nach: ['c-stoffe'],
    begriffe: ['Teilchen', 'Aggregatzustand', 'Diffusion'],
    fehlvorstellungen: [
      { text: 'Teilchen haben die Eigenschaften des Stoffes (Kupferatome sind rot, Teilchen schmelzen).', quelle: BARKE },
      { text: 'Zwischen den Teilchen ist Luft.', quelle: BARKE }
    ],
    jahrgang: { NW: [7, 8] }
  },
  {
    id: 'c-reaktion',
    fach: 'chemie',
    titel: 'Chemische Reaktion und Massenerhaltung',
    stichwoerter: ['chemische reaktion', 'verbrennung', 'massenerhaltung', 'oxidation'],
    nach: ['c-teilchen'],
    begriffe: ['Edukt', 'Produkt', 'Reaktionsschema', 'exotherm', 'endotherm'],
    inhalte: ['Kennzeichen chemischer Reaktionen', 'Verbrennung', 'Gesetz von der Erhaltung der Masse', 'Reaktionsschema'],
    fehlvorstellungen: [
      { text: 'Bei der Verbrennung verschwindet Stoff; Gase haben keine Masse.', quelle: BARKE },
      { text: 'Eine chemische Reaktion ist nur ein Mischen oder ein Zustandswechsel.', quelle: BARKE }
    ],
    jahrgang: { NW: [7, 8] }
  },
  {
    id: 'c-atom',
    fach: 'chemie',
    titel: 'Atombau (Kern-Hülle-Modell) und Periodensystem',
    stichwoerter: ['atombau', 'atommodell', 'periodensystem', 'elektronen', 'schalenmodell'],
    nach: ['c-teilchen', 'c-reaktion'],
    begriffe: ['Proton', 'Neutron', 'Elektron', 'Hauptgruppe', 'Periode'],
    inhalte: ['Kern-Hülle-Modell', 'Schalenmodell', 'Aufbau des Periodensystems', 'Valenzelektronen'],
    fehlvorstellungen: [{ text: 'Das Atom ist ein Mini-Sonnensystem, wörtlich genommen.', quelle: BARKE }],
    jahrgang: { NW: [9, 10] }
  },
  {
    id: 'c-ionen',
    fach: 'chemie',
    titel: 'Salze und Ionenbindung',
    stichwoerter: ['salz', 'ion', 'ionenbindung', 'ionengitter'],
    nach: ['c-atom'],
    begriffe: ['Ion', 'Kation', 'Anion', 'Ionengitter'],
    fehlvorstellungen: [{ text: 'Kochsalz besteht aus NaCl-Molekülen.', quelle: BARKE }],
    jahrgang: { NW: [9, 10] }
  },
  {
    id: 'c-molekuel',
    fach: 'chemie',
    titel: 'Elektronenpaarbindung und Molekülverbindungen',
    stichwoerter: ['molekül', 'elektronenpaarbindung', 'polar', 'wasserstoffbrücke'],
    nach: ['c-atom'],
    begriffe: ['Elektronenpaarbindung', 'Elektronegativität', 'Dipol'],
    jahrgang: { NW: [9, 10] }
  },
  {
    id: 'c-saeure',
    fach: 'chemie',
    titel: 'Saure und alkalische Lösungen, pH-Wert, Neutralisation',
    stichwoerter: ['säure', 'base', 'lauge', 'ph-wert', 'neutralisation', 'alkalisch'],
    nach: ['c-ionen', 'c-molekuel'],
    begriffe: ['pH-Wert', 'Indikator', 'Neutralisation', 'Oxonium-Ion'],
    jahrgang: { NW: [9, 10] }
  },
  {
    id: 'c-organik',
    fach: 'chemie',
    titel: 'Organische Chemie: Kohlenwasserstoffe und Alkohole',
    stichwoerter: ['organisch', 'alkan', 'alkohol', 'kohlenwasserstoff', 'kunststoff'],
    nach: ['c-molekuel'],
    begriffe: ['Alkan', 'homologe Reihe', 'funktionelle Gruppe'],
    jahrgang: { NW: [9, 10] }
  },

  // ------------------------------------------------------------------ Biologie
  {
    id: 'b-lebewesen',
    fach: 'biologie',
    titel: 'Kennzeichen des Lebendigen',
    stichwoerter: ['kennzeichen des leben', 'lebewesen'],
    begriffe: ['Stoffwechsel', 'Reizbarkeit', 'Fortpflanzung', 'Wachstum'],
    fehlvorstellungen: [{ text: 'Lebendig ist, was sich bewegt.', quelle: HAMMANN }]
  },
  {
    id: 'b-zelle',
    fach: 'biologie',
    titel: 'Aufbau von Pflanzen- und Tierzellen, Mikroskopieren',
    stichwoerter: ['zelle', 'mikroskop', 'zellorganell', 'zellkern'],
    nach: ['b-lebewesen'],
    begriffe: ['Zellkern', 'Zellmembran', 'Zellwand', 'Chloroplast', 'Zellplasma'],
    inhalte: ['Umgang mit dem Mikroskop', 'Pflanzen- und Tierzelle im Vergleich', 'Zellorganellen und ihre Funktion', 'Einzeller und Vielzeller'],
    fehlvorstellungen: [{ text: 'Nur Tiere bestehen aus Zellen; Pflanzen nicht.', quelle: HAMMANN }]
  },
  {
    id: 'b-zellteilung',
    fach: 'biologie',
    titel: 'Mitose und Meiose',
    stichwoerter: ['mitose', 'meiose', 'zellteilung', 'chromosom'],
    nach: ['b-zelle'],
    begriffe: ['Chromosom', 'Chromatid', 'diploid', 'haploid']
  },
  {
    id: 'b-genetik',
    fach: 'biologie',
    titel: 'Klassische Genetik (Mendel’sche Regeln)',
    stichwoerter: ['vererbung', 'mendel', 'genetik', 'erbgang', 'allel'],
    nach: ['b-zellteilung'],
    begriffe: ['Gen', 'Allel', 'dominant', 'rezessiv', 'Genotyp', 'Phänotyp'],
    inhalte: ['Mendel’sche Regeln', 'Kreuzungsschemata', 'Stammbaumanalyse', 'Erbkrankheiten'],
    fehlvorstellungen: [{ text: 'Gene sind nur in bestimmten Zellen (z. B. Keimzellen) vorhanden.', quelle: HAMMANN }]
  },
  {
    id: 'b-molekulargenetik',
    fach: 'biologie',
    titel: 'DNA, Proteinbiosynthese',
    stichwoerter: ['dna', 'proteinbiosynthese', 'molekulargenetik', 'mutation', 'gentechnik'],
    nach: ['b-genetik'],
    begriffe: ['DNA', 'Basenpaar', 'Transkription', 'Translation']
  },
  {
    id: 'b-fotosynthese',
    fach: 'biologie',
    titel: 'Fotosynthese (Grundprinzip)',
    stichwoerter: ['fotosynthese', 'photosynthese', 'blattgrün'],
    nach: ['b-zelle'],
    begriffe: ['Fotosynthese', 'Chlorophyll', 'Kohlenstoffdioxid', 'Glucose'],
    fehlvorstellungen: [
      { text: 'Pflanzen nehmen ihre Nahrung aus dem Boden auf.', quelle: HAMMANN },
      { text: 'Pflanzen atmen nicht, sie machen nur Fotosynthese.', quelle: HAMMANN }
    ]
  },
  {
    id: 'b-oekologie',
    fach: 'biologie',
    titel: 'Nahrungsketten und Nahrungsnetze',
    stichwoerter: ['nahrungskette', 'nahrungsnetz', 'ökosystem', 'produzent', 'konsument', 'wald', 'see'],
    nach: ['b-fotosynthese'],
    begriffe: ['Produzent', 'Konsument', 'Destruent', 'Nahrungsnetz'],
    inhalte: ['Biotop und Biozönose', 'Nahrungsketten und -netze', 'Stoffkreislauf', 'Abiotische und biotische Faktoren'],
    fehlvorstellungen: [{ text: 'Ein Ökosystem ist ein statisches Gleichgewicht, Räuber „sorgen“ dafür.', quelle: HAMMANN }]
  },
  {
    id: 'b-stoffwechsel',
    fach: 'biologie',
    titel: 'Zellatmung und Enzyme',
    stichwoerter: ['zellatmung', 'enzym', 'stoffwechsel', 'atp'],
    nach: ['b-fotosynthese', 'c-reaktion'],
    begriffe: ['Enzym', 'Substrat', 'Zellatmung']
  },
  {
    id: 'b-organe',
    fach: 'biologie',
    titel: 'Organsysteme des Menschen (Verdauung, Atmung, Blutkreislauf)',
    stichwoerter: ['verdauung', 'atmung', 'blutkreislauf', 'herz', 'lunge', 'organ'],
    begriffe: ['Organ', 'Organsystem', 'Blutkreislauf'],
    inhalte: ['Verdauungsorgane', 'Atmungsorgane und Gasaustausch', 'Herz und Blutkreislauf', 'Gesunde Ernährung'],
    fehlvorstellungen: [{ text: 'Verdauung findet nur im Magen statt.', quelle: HAMMANN }]
  },
  {
    id: 'b-immun',
    fach: 'biologie',
    titel: 'Immunsystem und Impfung',
    stichwoerter: ['immun', 'impfung', 'antikörper', 'infektion', 'virus', 'bakterie'],
    nach: ['b-zelle', 'b-organe'],
    begriffe: ['Antigen', 'Antikörper', 'Virus', 'Bakterium']
  },
  {
    id: 'b-angepasst',
    fach: 'biologie',
    titel: 'Angepasstheit von Lebewesen an ihren Lebensraum',
    stichwoerter: ['angepasst', 'anpassung', 'lebensraum', 'wirbeltier'],
    begriffe: ['Angepasstheit', 'Lebensraum', 'Wirbeltierklassen']
  },
  {
    id: 'b-evolution',
    fach: 'biologie',
    titel: 'Evolution: Variabilität, Selektion, Artbildung',
    stichwoerter: ['evolution', 'selektion', 'darwin', 'artbildung', 'stammesgeschichte'],
    nach: ['b-angepasst', 'b-genetik'],
    begriffe: ['Variabilität', 'Selektion', 'Mutation', 'Fitness'],
    inhalte: ['Evolutionstheorien (Lamarck, Darwin)', 'Selektion und Variabilität', 'Artbildung', 'Belege für die Evolution'],
    fehlvorstellungen: [
      { text: 'Evolution ist zielgerichtet („die Giraffe streckt sich“).', quelle: HAMMANN },
      { text: 'Lebewesen „wollen“ sich anpassen.', quelle: HAMMANN }
    ]
  },
  {
    id: 'b-pubertaet',
    fach: 'biologie',
    titel: 'Pubertät und körperliche Entwicklung',
    stichwoerter: ['pubertät', 'sexual', 'fortpflanzung', 'hormon'],
    begriffe: ['Pubertät', 'Geschlechtsorgane', 'Hormon']
  },

  // ------------------------------------------------------------------ Informatik
  {
    id: 'i-algorithmus',
    fach: 'informatik',
    titel: 'Algorithmen als Anweisungsfolgen (Blockprogrammierung)',
    stichwoerter: ['algorithmus', 'scratch', 'blockprogrammierung', 'anweisung'],
    begriffe: ['Algorithmus', 'Anweisung', 'Sequenz'],
    fehlvorstellungen: [{ text: 'Der Computer versteht, was das Programm meint.', quelle: INFO_FV }]
  },
  {
    id: 'i-kontroll',
    fach: 'informatik',
    titel: 'Schleifen und Verzweigungen',
    stichwoerter: ['schleife', 'verzweigung', 'bedingung', 'wiederholung'],
    nach: ['i-algorithmus'],
    begriffe: ['Schleife', 'Bedingung', 'Verzweigung'],
    fehlvorstellungen: [{ text: 'Die Schleifenbedingung wird ständig geprüft statt einmal pro Durchlauf.', quelle: INFO_FV }]
  },
  {
    id: 'i-variable',
    fach: 'informatik',
    titel: 'Variablen und Zuweisung',
    stichwoerter: ['variable', 'zuweisung', 'datentyp'],
    nach: ['i-kontroll'],
    begriffe: ['Variable', 'Zuweisung', 'Datentyp'],
    fehlvorstellungen: [
      { text: 'Eine Variable kann mehrere Werte gleichzeitig speichern.', quelle: INFO_FV },
      { text: 'a = b ist eine Gleichung, die in beide Richtungen gilt.', quelle: INFO_FV }
    ]
  },
  {
    id: 'i-funktion',
    fach: 'informatik',
    titel: 'Funktionen/Prozeduren und Listen',
    stichwoerter: ['funktion', 'prozedur', 'liste', 'array', 'python', 'java', 'objektorientiert', 'klasse'],
    nach: ['i-variable'],
    begriffe: ['Parameter', 'Rückgabewert', 'Liste']
  },
  {
    id: 'i-codierung',
    fach: 'informatik',
    titel: 'Codierung von Information, Binärzahlen',
    stichwoerter: ['binär', 'codierung', 'bit', 'byte', 'dualzahl'],
    begriffe: ['Bit', 'Byte', 'Binärzahl']
  },
  {
    id: 'i-krypto',
    fach: 'informatik',
    titel: 'Verschlüsselung',
    stichwoerter: ['verschlüsselung', 'kryptolog', 'caesar', 'passwort'],
    nach: ['i-codierung'],
    begriffe: ['Klartext', 'Geheimtext', 'Schlüssel']
  },
  {
    id: 'i-netze',
    fach: 'informatik',
    titel: 'Netze und Internet (Client–Server, Datenpakete)',
    stichwoerter: ['internet', 'netzwerk', 'client', 'server', 'router', 'ip-adresse'],
    nach: ['i-eva'],
    begriffe: ['Client', 'Server', 'IP-Adresse', 'Datenpaket'],
    fehlvorstellungen: [{ text: 'Das Internet ist ein zentraler Großrechner.', quelle: INFO_FV }]
  },
  {
    id: 'i-eva',
    fach: 'informatik',
    titel: 'Aufbau eines Computers (Eingabe – Verarbeitung – Ausgabe)',
    stichwoerter: ['eva-prinzip', 'hardware', 'computer', 'speicher'],
    begriffe: ['Eingabe', 'Verarbeitung', 'Ausgabe', 'Speicher']
  },
  {
    id: 'i-datenbank',
    fach: 'informatik',
    titel: 'Tabellenkalkulation und Datenbanken (SQL)',
    stichwoerter: ['datenbank', 'sql', 'tabellenkalkulation', 'excel'],
    nach: ['i-variable'],
    begriffe: ['Tabelle', 'Datensatz', 'Attribut', 'Abfrage']
  },

  // ------------------------------------------------------------------ Geschichte
  {
    id: 'g-fruehgeschichte',
    fach: 'geschichte',
    titel: 'Frühgeschichte: Altsteinzeit, Neolithische Revolution',
    stichwoerter: ['steinzeit', 'neolithisch', 'jäger und sammler', 'sesshaft'],
    begriffe: ['Sesshaftigkeit', 'Neolithische Revolution'],
    jahrgang: { BY: [6, 6], BW: [5, 6], BE: [5, 6], BB: [5, 6] }
  },
  {
    id: 'g-hochkultur',
    fach: 'geschichte',
    titel: 'Frühe Hochkulturen (Ägypten)',
    stichwoerter: ['ägypt', 'hochkultur', 'pharao', 'pyramide', 'mesopotamien'],
    nach: ['g-fruehgeschichte'],
    begriffe: ['Hochkultur', 'Pharao', 'Hieroglyphen'],
    jahrgang: { BY: [6, 6], BW: [5, 6], BE: [5, 6], BB: [5, 6] }
  },
  {
    id: 'g-antike',
    fach: 'geschichte',
    titel: 'Antike: griechische Polis und Römisches Reich',
    stichwoerter: ['antike', 'griechen', 'athen', 'polis', 'rom', 'römer', 'römisch', 'imperium'],
    nach: ['g-hochkultur'],
    begriffe: ['Polis', 'Demokratie (Athen)', 'Republik', 'Kaiserzeit', 'Provinz'],
    inhalte: ['Athen und die Polis', 'Die römische Republik', 'Das Kaiserreich', 'Leben in den Provinzen', 'Christentum im Römischen Reich'],
    jahrgang: { BY: [6, 6], BW: [5, 6], BE: [5, 6], BB: [5, 6] }
  },
  {
    id: 'g-mittelalter',
    fach: 'geschichte',
    titel: 'Mittelalter: Frankenreich, Lehnswesen, Ständegesellschaft',
    stichwoerter: ['mittelalter', 'lehnswesen', 'ritter', 'burg', 'kloster', 'karl der große', 'stadt im mittelalter', 'grundherrschaft'],
    nach: ['g-antike'],
    begriffe: ['Lehnswesen', 'Grundherrschaft', 'Stände', 'Vasall'],
    inhalte: ['Frankenreich und Karl der Große', 'Lehnswesen und Grundherrschaft', 'Leben im Kloster', 'Die mittelalterliche Stadt', 'Kaiser und Papst'],
    fehlvorstellungen: [{ text: 'Das Mittelalter war eine finstere, rückständige Zeit.', quelle: GUENTHER_ARNDT }],
    jahrgang: { BW: [7, 8], BE: [7, 8], BB: [7, 8] }
  },
  {
    id: 'g-fruehneuzeit',
    fach: 'geschichte',
    titel: 'Frühe Neuzeit: Entdeckungen, Reformation, Dreißigjähriger Krieg',
    stichwoerter: ['reformation', 'luther', 'entdeckung', 'kolumbus', 'renaissance', 'dreißigjährig', 'humanismus'],
    nach: ['g-mittelalter'],
    begriffe: ['Reformation', 'Ablass', 'Konfession'],
    jahrgang: { BW: [7, 8], BE: [7, 8], BB: [7, 8] }
  },
  {
    id: 'g-absolutismus',
    fach: 'geschichte',
    titel: 'Absolutismus und Aufklärung',
    stichwoerter: ['absolutismus', 'aufklärung', 'ludwig xiv', 'sonnenkönig', 'gewaltenteilung montesquieu'],
    nach: ['g-fruehneuzeit'],
    begriffe: ['Absolutismus', 'Aufklärung', 'Gewaltenteilung'],
    jahrgang: { BW: [7, 8], BE: [7, 8], BB: [7, 8] }
  },
  {
    id: 'g-revolution',
    fach: 'geschichte',
    titel: 'Französische Revolution',
    stichwoerter: ['französische revolution', 'revolution 1789', 'bastille', 'menschenrechte 1789', 'napoleon'],
    nach: ['g-absolutismus'],
    begriffe: ['Dritter Stand', 'Nationalversammlung', 'Menschen- und Bürgerrechte'],
    inhalte: ['Ursachen der Revolution', 'Sturm auf die Bastille', 'Erklärung der Menschen- und Bürgerrechte', 'Terrorherrschaft', 'Napoleon'],
    jahrgang: { BW: [7, 8], BE: [7, 8], BB: [7, 8] }
  },
  {
    id: 'g-1848',
    fach: 'geschichte',
    titel: 'Wiener Kongress, Revolution 1848/49',
    stichwoerter: ['1848', 'wiener kongress', 'vormärz', 'paulskirche', 'märzrevolution'],
    nach: ['g-revolution'],
    begriffe: ['Restauration', 'Nationalbewegung', 'Paulskirche'],
    jahrgang: { BW: [7, 8] }
  },
  {
    id: 'g-reichsgruendung',
    fach: 'geschichte',
    titel: 'Reichsgründung 1871 und Kaiserreich',
    stichwoerter: ['reichsgründung', 'kaiserreich', 'bismarck', '1871'],
    nach: ['g-1848'],
    begriffe: ['Nationalstaat', 'Reichskanzler', 'Obrigkeitsstaat'],
    jahrgang: { BW: [7, 8] }
  },
  {
    id: 'g-industrialisierung',
    fach: 'geschichte',
    titel: 'Industrialisierung und soziale Frage',
    stichwoerter: ['industrialisierung', 'industrielle revolution', 'soziale frage', 'arbeiterbewegung', 'dampfmaschine'],
    nach: ['g-revolution'],
    begriffe: ['Industrialisierung', 'Proletariat', 'soziale Frage'],
    jahrgang: { BW: [7, 8] }
  },
  {
    id: 'g-imperialismus',
    fach: 'geschichte',
    titel: 'Imperialismus und Erster Weltkrieg',
    stichwoerter: ['imperialismus', 'kolonial', 'erster weltkrieg', '1914', 'versailles'],
    nach: ['g-industrialisierung', 'g-reichsgruendung'],
    begriffe: ['Imperialismus', 'Bündnissystem', 'Versailler Vertrag'],
    jahrgang: { BW: [7, 8] }
  },
  {
    id: 'g-weimar',
    fach: 'geschichte',
    titel: 'Weimarer Republik',
    stichwoerter: ['weimar', 'hyperinflation', 'hitlerputsch', 'goldene zwanziger'],
    nach: ['g-imperialismus'],
    begriffe: ['Republik', 'Reichspräsident', 'Notverordnung', 'Dolchstoßlegende'],
    inhalte: ['Revolution 1918/19 und Verfassung', 'Versailler Vertrag', 'Krisenjahr 1923', 'Goldene Zwanziger', 'Weltwirtschaftskrise und Ende der Republik'],
    jahrgang: { BW: [7, 8], BE: [9, 10], BB: [9, 10] }
  },
  {
    id: 'g-ns',
    fach: 'geschichte',
    titel: 'Nationalsozialismus und Zweiter Weltkrieg',
    stichwoerter: ['nationalsozialismus', 'ns-zeit', 'hitler', 'holocaust', 'zweiter weltkrieg', 'drittes reich', 'shoah'],
    nach: ['g-weimar'],
    begriffe: ['Machtergreifung', 'Gleichschaltung', 'Volksgemeinschaft', 'Holocaust'],
    inhalte: ['Machtübernahme und Gleichschaltung', 'Leben im NS-Staat', 'Verfolgung und Holocaust', 'Zweiter Weltkrieg', 'Widerstand'],
    fehlvorstellungen: [{ text: 'Geschichte machen einzelne große Männer („Hitler hat alles allein entschieden“).', quelle: GUENTHER_ARNDT }],
    jahrgang: { BW: [9, 10], BE: [9, 10], BB: [9, 10] }
  },
  {
    id: 'g-kalterkrieg',
    fach: 'geschichte',
    titel: 'Kalter Krieg und deutsche Teilung',
    stichwoerter: ['kalter krieg', 'ddr', 'teilung', 'mauer', 'brd', 'ost-west'],
    nach: ['g-ns'],
    begriffe: ['Kalter Krieg', 'Eiserner Vorhang', 'Blockbildung'],
    jahrgang: { BW: [9, 10], BE: [9, 10], BB: [9, 10] }
  },
  {
    id: 'g-einheit',
    fach: 'geschichte',
    titel: 'Friedliche Revolution und Wiedervereinigung 1989/90',
    stichwoerter: ['wiedervereinigung', '1989', 'mauerfall', 'friedliche revolution', 'deutsche einheit'],
    nach: ['g-kalterkrieg'],
    begriffe: ['Friedliche Revolution', 'Zwei-plus-Vier-Vertrag'],
    jahrgang: { BW: [9, 10], BE: [9, 10], BB: [9, 10] }
  },

  // ------------------------------------------------------------------ Politik
  {
    id: 'po-mitbestimmung',
    fach: 'politik',
    titel: 'Mitbestimmung in Klasse, Schule und Gemeinde',
    stichwoerter: ['klassenrat', 'schülervertretung', 'mitbestimmung', 'gemeinde', 'kommune'],
    begriffe: ['Mehrheitsentscheid', 'Klassensprecher', 'Gemeinderat'],
    fehlvorstellungen: [{ text: 'Demokratie heißt nur: Die Mehrheit bestimmt (ohne Minderheitenschutz).', quelle: LANGE }]
  },
  {
    id: 'po-grundrechte',
    fach: 'politik',
    titel: 'Grundrechte und Rechtsstaat',
    stichwoerter: ['grundrecht', 'grundgesetz', 'menschenwürde', 'rechtsstaat', 'menschenrechte'],
    nach: ['po-mitbestimmung'],
    begriffe: ['Grundrecht', 'Menschenwürde', 'Rechtsstaat']
  },
  {
    id: 'po-gewaltenteilung',
    fach: 'politik',
    titel: 'Gewaltenteilung',
    stichwoerter: ['gewaltenteilung', 'legislative', 'exekutive', 'judikative'],
    nach: ['po-grundrechte'],
    begriffe: ['Legislative', 'Exekutive', 'Judikative']
  },
  {
    id: 'po-wahlen',
    fach: 'politik',
    titel: 'Wahlen und Parteien',
    stichwoerter: ['wahl', 'partei', 'wahlrecht', 'erststimme', 'zweitstimme'],
    nach: ['po-mitbestimmung'],
    begriffe: ['Wahlgrundsätze', 'Erststimme', 'Zweitstimme', 'Partei'],
    fehlvorstellungen: [{ text: 'Politik ist dasselbe wie Parteienstreit.', quelle: LANGE }]
  },
  {
    id: 'po-bundestag',
    fach: 'politik',
    titel: 'Bundestag, Bundesregierung und Gesetzgebung',
    stichwoerter: ['bundestag', 'bundesregierung', 'gesetzgebung', 'bundeskanzler', 'koalition', 'bundesrat', 'föderalismus'],
    nach: ['po-gewaltenteilung', 'po-wahlen'],
    begriffe: ['Bundestag', 'Bundesrat', 'Koalition', 'Opposition'],
    inhalte: ['Aufgaben des Bundestags', 'Regierungsbildung und Koalition', 'Weg eines Gesetzes', 'Föderalismus und Bundesrat'],
    fehlvorstellungen: [{ text: 'Der Bundeskanzler ist der Chef, der alles allein entscheidet.', quelle: LANGE }]
  },
  {
    id: 'po-markt',
    fach: 'politik',
    titel: 'Bedürfnisse, Knappheit und Markt',
    stichwoerter: ['markt', 'angebot', 'nachfrage', 'preisbildung', 'bedürfnis', 'knappheit'],
    begriffe: ['Bedürfnis', 'Knappheit', 'Angebot', 'Nachfrage'],
    fehlvorstellungen: [{ text: 'Der Staat hat das Geld und kann es beliebig verteilen.', quelle: LANGE }]
  },
  {
    id: 'po-marktwirtschaft',
    fach: 'politik',
    titel: 'Soziale Marktwirtschaft',
    stichwoerter: ['soziale marktwirtschaft', 'wirtschaftspolitik', 'sozialstaat', 'wirtschaftsordnung'],
    nach: ['po-markt'],
    begriffe: ['Wettbewerb', 'Sozialstaat', 'Wirtschaftsordnung']
  },
  {
    id: 'po-eu',
    fach: 'politik',
    titel: 'Europäische Union',
    stichwoerter: ['europäische union', ' eu ', 'eu-', 'europaparlament', 'europa'],
    nach: ['po-bundestag'],
    begriffe: ['Europäisches Parlament', 'Europäische Kommission', 'Binnenmarkt']
  },

  // ------------------------------------------------------------------ Erdkunde
  {
    id: 'e-karte',
    fach: 'erdkunde',
    titel: 'Karten lesen: Himmelsrichtungen, Legende, Maßstab',
    stichwoerter: ['karte', 'maßstab', 'legende', 'himmelsrichtung', 'orientierung'],
    begriffe: ['Legende', 'Maßstab', 'Himmelsrichtungen'],
    inhalte: ['Himmelsrichtungen', 'Kartenlegende', 'Maßstab berechnen', 'Atlasarbeit'],
    jahrgang: { NW: [5, 6] }
  },
  {
    id: 'e-gradnetz',
    fach: 'erdkunde',
    titel: 'Gradnetz der Erde, Lage beschreiben',
    stichwoerter: ['gradnetz', 'breitengrad', 'längengrad', 'äquator'],
    nach: ['e-karte'],
    begriffe: ['Breitenkreis', 'Längenhalbkreis', 'Äquator', 'Nullmeridian']
  },
  {
    id: 'e-klimadiagramm',
    fach: 'erdkunde',
    titel: 'Temperatur und Niederschlag, Klimadiagramm lesen',
    stichwoerter: ['klimadiagramm', 'niederschlag', 'wetter und klima'],
    nach: ['m-daten'],
    begriffe: ['Wetter', 'Klima', 'humid', 'arid'],
    fehlvorstellungen: [{ text: 'Wetter und Klima sind dasselbe.', quelle: REINFRIED }]
  },
  {
    id: 'e-klimazonen',
    fach: 'erdkunde',
    titel: 'Klima- und Vegetationszonen',
    stichwoerter: ['klimazone', 'vegetationszone', 'landschaftszone', 'tropen', 'wüste', 'regenwald', 'savanne', 'polar'],
    nach: ['e-gradnetz', 'e-klimadiagramm'],
    begriffe: ['Klimazone', 'Vegetationszone', 'Beleuchtungszone'],
    inhalte: ['Beleuchtungs- und Klimazonen', 'Tropischer Regenwald', 'Wüsten', 'Landwirtschaft in den Landschaftszonen'],
    fehlvorstellungen: [
      { text: 'Wüste heißt immer heiß und sandig.', quelle: REINFRIED },
      { text: 'Die Jahreszeiten entstehen durch den Abstand der Erde zur Sonne.', quelle: REINFRIED }
    ],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'e-plattentektonik',
    fach: 'erdkunde',
    titel: 'Aufbau der Erde und Plattentektonik',
    stichwoerter: ['plattentektonik', 'vulkan', 'erdbeben', 'erdaufbau', 'erdkruste'],
    begriffe: ['Erdkruste', 'Erdmantel', 'Platte', 'Subduktion'],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'e-klimawandel',
    fach: 'erdkunde',
    titel: 'Treibhauseffekt und Klimawandel',
    stichwoerter: ['klimawandel', 'treibhauseffekt', 'erderwärmung'],
    nach: ['e-klimazonen'],
    begriffe: ['Treibhauseffekt', 'Treibhausgas', 'Emission'],
    fehlvorstellungen: [{ text: 'Treibhauseffekt und Ozonloch sind dasselbe.', quelle: REINFRIED }]
  },
  {
    id: 'e-bevoelkerung',
    fach: 'erdkunde',
    titel: 'Bevölkerungsentwicklung und Verstädterung',
    stichwoerter: ['bevölkerung', 'verstädterung', 'migration', 'stadt', 'megastadt'],
    nach: ['e-karte'],
    begriffe: ['Geburtenrate', 'Sterberate', 'Bevölkerungspyramide'],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'e-globalisierung',
    fach: 'erdkunde',
    titel: 'Disparitäten und Globalisierung',
    stichwoerter: ['globalisierung', 'disparität', 'entwicklungsland', 'welthandel'],
    nach: ['e-bevoelkerung'],
    begriffe: ['Disparität', 'Globalisierung', 'Entwicklungsstand'],
    jahrgang: { NW: [7, 10] }
  },

  // ------------------------------------------------------------------ Deutsch
  {
    id: 'd-wortarten',
    fach: 'deutsch',
    titel: 'Wortarten: Nomen, Verb, Adjektiv, Artikel, Pronomen',
    stichwoerter: ['wortart', 'nomen', 'adjektiv', 'pronomen'],
    begriffe: ['Nomen', 'Verb', 'Adjektiv', 'Artikel', 'Pronomen'],
    fehlvorstellungen: [{ text: 'Nomen sind nur Dinge, die man anfassen kann.', quelle: GRANZOW }]
  },
  {
    id: 'd-satzglieder',
    fach: 'deutsch',
    titel: 'Satzglieder: Subjekt, Prädikat, Objekte',
    stichwoerter: ['satzglied', 'subjekt', 'prädikat', 'objekt', 'umstellprobe'],
    nach: ['d-wortarten'],
    begriffe: ['Subjekt', 'Prädikat', 'Akkusativobjekt', 'Dativobjekt'],
    fehlvorstellungen: [
      { text: 'Das Subjekt ist immer der, der handelt.', quelle: GRANZOW },
      { text: 'Satzglieder bestimmt man durch Fragen – die Frageprobe führt oft in die Irre.', quelle: GRANZOW }
    ]
  },
  {
    id: 'd-adverbiale',
    fach: 'deutsch',
    titel: 'Adverbiale Bestimmungen und Attribute',
    stichwoerter: ['adverbial', 'attribut', 'relativsatz'],
    nach: ['d-satzglieder'],
    begriffe: ['Adverbiale', 'Attribut', 'Relativsatz'],
    jahrgang: { BY: [6, 6] }
  },
  {
    id: 'd-aktivpassiv',
    fach: 'deutsch',
    titel: 'Aktiv und Passiv',
    stichwoerter: ['passiv', 'aktiv und passiv'],
    nach: ['d-satzglieder'],
    begriffe: ['Aktiv', 'Vorgangspassiv'],
    jahrgang: { BY: [6, 6] }
  },
  {
    id: 'd-gliedsatz',
    fach: 'deutsch',
    titel: 'Satzgefüge und Gliedsätze, Kommasetzung',
    stichwoerter: ['gliedsatz', 'nebensatz', 'satzgefüge', 'komma', 'konjunktion'],
    nach: ['d-adverbiale'],
    begriffe: ['Hauptsatz', 'Nebensatz', 'Konjunktion', 'Satzgefüge'],
    jahrgang: { BY: [6, 6] }
  },
  {
    id: 'd-konjunktiv',
    fach: 'deutsch',
    titel: 'Modus: Konjunktiv und indirekte Rede',
    stichwoerter: ['konjunktiv', 'indirekte rede', 'modus'],
    nach: ['d-gliedsatz'],
    begriffe: ['Indikativ', 'Konjunktiv I', 'Konjunktiv II', 'indirekte Rede'],
    inhalte: ['Konjunktiv I bilden', 'Indirekte Rede', 'Konjunktiv II als Ersatzform', 'Redewiedergabe in Texten'],
    jahrgang: { BY: [8, 8] }
  },
  {
    id: 'd-erzaehlen',
    fach: 'deutsch',
    titel: 'Erzählen und Nacherzählen (Figur, Handlung)',
    stichwoerter: ['erzählen', 'nacherzähl', 'erlebniserzählung', 'fantasiegeschichte'],
    begriffe: ['Figur', 'Handlung', 'Einleitung', 'Höhepunkt']
  },
  {
    id: 'd-inhaltsangabe',
    fach: 'deutsch',
    titel: 'Inhaltsangabe',
    stichwoerter: ['inhaltsangabe', 'zusammenfass'],
    nach: ['d-erzaehlen'],
    begriffe: ['Kernaussage', 'Präsens', 'Basissatz'],
    inhalte: ['Basissatz', 'Handlungsschritte zusammenfassen', 'Präsens und indirekte Rede', 'Keine Wertung, keine Zitate']
  },
  {
    id: 'd-erzaehltext',
    fach: 'deutsch',
    titel: 'Erzähltexte untersuchen: Erzähler, Erzählperspektive',
    stichwoerter: ['erzähler', 'erzählperspektive', 'kurzgeschichte', 'novelle', 'erzähltext', 'roman', 'epik'],
    nach: ['d-erzaehlen'],
    begriffe: ['Erzähler', 'Erzählperspektive', 'Erzählzeit', 'erzählte Zeit'],
    fehlvorstellungen: [{ text: 'Erzähler und Autor sind dieselbe Person.', quelle: 'fachdidaktischer Konsens (Deutsch)' }]
  },
  {
    id: 'd-textanalyse',
    fach: 'deutsch',
    titel: 'Textanalyse mit Zitieren und Belegen',
    stichwoerter: ['textanalyse', 'interpretation', 'analyse', 'zitieren', 'sachtextanalyse'],
    nach: ['d-inhaltsangabe', 'd-erzaehltext'],
    begriffe: ['These', 'Beleg', 'Zitat', 'Zeilenangabe'],
    jahrgang: { BY: [8, 8] }
  },
  {
    id: 'd-argumentieren',
    fach: 'deutsch',
    titel: 'Meinung begründen, linear argumentieren',
    stichwoerter: ['argument', 'meinung', 'stellungnahme', 'leserbrief'],
    begriffe: ['These', 'Argument', 'Beispiel'],
    jahrgang: { BY: [8, 8] }
  },
  {
    id: 'd-eroerterung',
    fach: 'deutsch',
    titel: 'Erörterung (linear und dialektisch)',
    stichwoerter: ['erörterung', 'dialektisch', 'pro und contra', 'materialgestützt'],
    nach: ['d-argumentieren'],
    begriffe: ['Pro', 'Contra', 'Synthese', 'Überleitung'],
    inhalte: [
      'Stoffsammlung und Gliederung',
      'Argumente aufbauen',
      'Lineare und dialektische Erörterung',
      'Einleitung und Schluss',
      'Materialgestütztes Erörtern'
    ],
    jahrgang: { BY: [9, 9] }
  },
  {
    id: 'd-lyrik',
    fach: 'deutsch',
    titel: 'Gedichte: Reim, Vers, Strophe, sprachliche Bilder',
    stichwoerter: ['gedicht', 'lyrik', 'reim', 'metapher', 'ballade', 'sonett'],
    begriffe: ['Reim', 'Vers', 'Strophe', 'Metapher', 'Vergleich'],
    fehlvorstellungen: [{ text: 'Das lyrische Ich ist der Dichter selbst.', quelle: 'fachdidaktischer Konsens (Deutsch)' }]
  },

  // ------------------------------------------------------------------ Kunst
  {
    id: 'k-farbe',
    fach: 'kunst',
    titel: 'Farbeigenschaften und Farbkontraste',
    stichwoerter: ['farbe', 'farbkreis', 'farbkontrast', 'komplementär'],
    begriffe: ['Farbton', 'Helligkeit', 'Sättigung', 'Komplementärkontrast'],
    jahrgang: { NW: [5, 6], BY: [5, 7] }
  },
  {
    id: 'k-farbfunktion',
    fach: 'kunst',
    titel: 'Farbfunktionen: Lokal-, Ausdrucks-, Symbolfarbe',
    stichwoerter: ['farbfunktion', 'symbolfarbe', 'ausdrucksfarbe', 'expressionismus'],
    nach: ['k-farbe'],
    begriffe: ['Lokalfarbe', 'Ausdrucksfarbe', 'Symbolfarbe'],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'k-raum',
    fach: 'kunst',
    titel: 'Raumillusion: Überdeckung, Größenabnahme, Höhenlage',
    stichwoerter: ['raumillusion', 'raumdarstellung', 'überdeckung'],
    begriffe: ['Überdeckung', 'Größenabnahme', 'Vordergrund', 'Hintergrund'],
    jahrgang: { NW: [5, 6], BY: [5, 5] }
  },
  {
    id: 'k-parallelperspektive',
    fach: 'kunst',
    titel: 'Parallelperspektive',
    stichwoerter: ['parallelperspektive', 'schrägbild'],
    nach: ['k-raum'],
    begriffe: ['Parallelperspektive'],
    jahrgang: { BY: [6, 7], NW: [7, 10] }
  },
  {
    id: 'k-zentralperspektive',
    fach: 'kunst',
    titel: 'Zentralperspektive mit Fluchtpunkt und Horizont',
    stichwoerter: ['zentralperspektive', 'fluchtpunkt', 'perspektive'],
    nach: ['k-parallelperspektive'],
    begriffe: ['Fluchtpunkt', 'Horizont', 'Fluchtlinie'],
    jahrgang: { BY: [8, 8], NW: [7, 10] }
  },
  {
    id: 'k-antike',
    fach: 'kunst',
    titel: 'Kunst der Antike',
    stichwoerter: ['antike kunst', 'griechische kunst', 'tempel'],
    jahrgang: { BY: [6, 6] }
  },
  {
    id: 'k-mittelalter',
    fach: 'kunst',
    titel: 'Romanik und Gotik',
    stichwoerter: ['romanik', 'gotik', 'kathedrale'],
    nach: ['k-antike'],
    begriffe: ['Rundbogen', 'Spitzbogen', 'Strebewerk'],
    jahrgang: { BY: [7, 7] }
  },
  {
    id: 'k-renaissance',
    fach: 'kunst',
    titel: 'Renaissance und Barock',
    stichwoerter: ['renaissance', 'barock', 'da vinci', 'dürer'],
    nach: ['k-mittelalter', 'k-zentralperspektive'],
    begriffe: ['Zentralperspektive', 'Proportion', 'Hell-Dunkel'],
    jahrgang: { BY: [8, 8] }
  },

  // ------------------------------------------------------------------ Musik
  {
    id: 'mu-noten',
    fach: 'musik',
    titel: 'Violinschlüssel, Stammtöne, Noten- und Pausenwerte',
    stichwoerter: ['notenwert', 'notenschrift', 'violinschlüssel', 'stammtöne', 'noten lesen'],
    begriffe: ['Violinschlüssel', 'Stammton', 'Viertelnote', 'Pause'],
    jahrgang: { NW: [5, 6], BY: [5, 5] }
  },
  {
    id: 'mu-takt',
    fach: 'musik',
    titel: 'Metrum, Takt und Rhythmus',
    stichwoerter: ['takt', 'rhythmus', 'metrum', 'auftakt', 'synkope'],
    nach: ['mu-noten'],
    begriffe: ['Metrum', 'Takt', 'Auftakt'],
    jahrgang: { NW: [5, 6], BY: [5, 6] }
  },
  {
    id: 'mu-tonleiter',
    fach: 'musik',
    titel: 'Vorzeichen, Dur- und Moll-Tonleitern',
    stichwoerter: ['tonleiter', 'dur', 'moll', 'vorzeichen', 'tonart'],
    nach: ['mu-noten'],
    begriffe: ['Kreuz', 'Be', 'Ganzton', 'Halbton'],
    jahrgang: { NW: [5, 6], BY: [5, 6] }
  },
  {
    id: 'mu-intervalle',
    fach: 'musik',
    titel: 'Intervalle',
    stichwoerter: ['intervall', 'terz', 'quinte'],
    nach: ['mu-tonleiter'],
    begriffe: ['Prime', 'Terz', 'Quinte', 'Oktave'],
    jahrgang: { NW: [5, 10], BY: [5, 6] }
  },
  {
    id: 'mu-akkorde',
    fach: 'musik',
    titel: 'Dreiklänge und Kadenz',
    stichwoerter: ['dreiklang', 'akkord', 'kadenz', 'harmonie', 'dominante'],
    nach: ['mu-intervalle'],
    begriffe: ['Dreiklang', 'Tonika', 'Subdominante', 'Dominante'],
    jahrgang: { NW: [7, 10], BY: [6, 7] }
  },
  {
    id: 'mu-form',
    fach: 'musik',
    titel: 'Formen: Liedform, Rondo, ABA',
    stichwoerter: ['liedform', 'rondo', 'musikalische form', 'aba'],
    begriffe: ['Strophe', 'Refrain', 'Rondo'],
    jahrgang: { NW: [5, 6], BY: [6, 6] }
  },
  {
    id: 'mu-sonate',
    fach: 'musik',
    titel: 'Motiv, Thema, Sonatenhauptsatzform',
    stichwoerter: ['sonate', 'sonatenhauptsatz', 'sinfonie', 'motiv', 'wiener klassik'],
    nach: ['mu-form', 'mu-akkorde'],
    begriffe: ['Exposition', 'Durchführung', 'Reprise', 'Motiv'],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'mu-blues',
    fach: 'musik',
    titel: 'Blues, Jazz und Popmusik',
    stichwoerter: ['blues', 'jazz', 'popmusik', 'rock'],
    nach: ['mu-akkorde', 'mu-takt'],
    begriffe: ['Bluesschema', 'Off-Beat', 'Improvisation'],
    jahrgang: { NW: [7, 10] }
  },

  // ------------------------------------------------------------------ Sport
  {
    id: 's-grundfaehigkeiten',
    fach: 'sport',
    titel: 'Motorische Grundfähigkeiten (Kraft, Ausdauer, Schnelligkeit, Beweglichkeit)',
    stichwoerter: ['grundfähigkeit', 'kondition', 'ausdauer', 'kraft', 'beweglichkeit', 'aufwärmen'],
    begriffe: ['Kraft', 'Ausdauer', 'Schnelligkeit', 'Beweglichkeit', 'Koordination'],
    jahrgang: { NW: [5, 6] }
  },
  {
    id: 's-training',
    fach: 'sport',
    titel: 'Belastungsgrößen und Trainingsplanung',
    stichwoerter: ['training', 'belastung', 'trainingsplan', 'intervall'],
    nach: ['s-grundfaehigkeiten'],
    begriffe: ['Intensität', 'Umfang', 'Dichte', 'Dauer'],
    inhalte: ['Belastungsgrößen', 'Trainingsmethoden (Dauer-, Intervallmethode)', 'Trainingsplan', 'Puls messen'],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 's-anpassung',
    fach: 'sport',
    titel: 'Anpassung und Superkompensation, physiologische Grundlagen',
    stichwoerter: ['superkompensation', 'anpassung', 'trainingslehre', 'physiologie', 'energiebereitstellung'],
    nach: ['s-training'],
    begriffe: ['Superkompensation', 'Anpassung', 'aerob', 'anaerob'],
    jahrgang: { NW: [11, 13] }
  },

  // ------------------------------------------------------------------ Sachunterricht
  {
    id: 'su-stoffe',
    fach: 'sachunterricht',
    titel: 'Stoffe unterscheiden und sortieren',
    stichwoerter: ['stoffe', 'material', 'sortieren'],
    begriffe: ['Material', 'Eigenschaft']
  },
  {
    id: 'su-wasser',
    fach: 'sachunterricht',
    titel: 'Aggregatzustände des Wassers, Wasserkreislauf',
    stichwoerter: ['wasser', 'wasserkreislauf', 'verdunsten', 'schmelzen', 'gefrieren'],
    nach: ['su-stoffe'],
    begriffe: ['fest', 'flüssig', 'gasförmig', 'verdunsten'],
    fehlvorstellungen: [{ text: 'Beim Verdunsten verschwindet das Wasser.', quelle: 'Möller u. a. (2002); fachdidaktischer Konsens' }]
  },
  {
    id: 'su-schwimmen',
    fach: 'sachunterricht',
    titel: 'Schwimmen und Sinken',
    stichwoerter: ['schwimmen', 'sinken'],
    nach: ['su-stoffe'],
    begriffe: ['schwimmen', 'sinken', 'verdrängen'],
    fehlvorstellungen: [
      { text: 'Schwere Dinge gehen unter.', quelle: 'Möller, Jonen, Hardy & Stern (2002)' },
      { text: 'Große Schiffe schwimmen, weil Luft darin ist.', quelle: 'Möller, Jonen, Hardy & Stern (2002)' }
    ]
  },
  {
    id: 'su-luft',
    fach: 'sachunterricht',
    titel: 'Luft braucht Platz, Luft ist ein Stoff',
    stichwoerter: ['luft'],
    begriffe: ['Luft', 'Luftdruck'],
    fehlvorstellungen: [{ text: 'Luft ist „nichts“.', quelle: 'fachdidaktischer Konsens (Sachunterricht)' }]
  },
  {
    id: 'su-strom',
    fach: 'sachunterricht',
    titel: 'Einfacher Stromkreis',
    stichwoerter: ['strom', 'batterie', 'glühbirne', 'lämpchen'],
    begriffe: ['Batterie', 'Kabel', 'Schalter'],
    fehlvorstellungen: [{ text: 'Der Strom kommt aus einem Pol und wird in der Lampe verbraucht.', quelle: SCHECKER }]
  },
  {
    id: 'su-licht',
    fach: 'sachunterricht',
    titel: 'Licht und Schatten, Tag und Nacht',
    stichwoerter: ['schatten', 'licht', 'tag und nacht', 'jahreszeit'],
    begriffe: ['Lichtquelle', 'Schatten'],
    fehlvorstellungen: [{ text: 'Der Schatten ist ein dunkles Abbild, das aus dem Gegenstand kommt.', quelle: 'fachdidaktischer Konsens (Sachunterricht)' }]
  },
  {
    id: 'su-tiere',
    fach: 'sachunterricht',
    titel: 'Pflanzen und Tiere beobachten, Lebensräume',
    stichwoerter: ['tier', 'pflanze', 'lebensraum', 'wiese', 'hecke', 'igel'],
    begriffe: ['Lebensraum', 'Nahrungskette']
  },
  {
    id: 'su-zeit',
    fach: 'sachunterricht',
    titel: 'Zeitleiste, früher und heute',
    stichwoerter: ['früher und heute', 'zeitleiste', 'zeit', 'geschichte'],
    begriffe: ['Zeitleiste', 'Jahrhundert']
  },
  {
    id: 'su-karte',
    fach: 'sachunterricht',
    titel: 'Vom Plan zur Karte, Himmelsrichtungen',
    stichwoerter: ['plan', 'schulweg', 'himmelsrichtung', 'karte'],
    begriffe: ['Plan', 'Karte', 'Himmelsrichtungen']
  }
]

/** Die Ketten mit dem Ausbau vom 25.09.2026 (nachtrag.ts): Jahrgänge NI/HE, neue Themen, Religion/Ethik */
export const KNOTEN: Knoten[] = [
  ...BASIS.map((k) => (JAHRGANG_NACHTRAG[k.id] ? { ...k, jahrgang: { ...k.jahrgang, ...JAHRGANG_NACHTRAG[k.id] } } : k)),
  ...KNOTEN_NACHTRAG
]

export const knotenById = (id: string): Knoten | undefined => KNOTEN.find((k) => k.id === id)
