/**
 * Operatoren – und warum sie nicht in einer einzigen Liste stehen können.
 *
 * DER BEFUND, der dieses Modell bestimmt (Recherche 23.09.2026):
 *
 * Es GIBT eine gemeinsame Grundlage. Sie heißt amtlich „Grundstock von Operatoren" und
 * stammt aus den gemeinsamen Abituraufgabenpools beim IQB, auf Beschluss der KMK vom
 * 15.10.2020. NRW schreibt das in die eigene Liste hinein, Niedersachsen markiert die
 * eigenen Zusätze sogar grafisch als „der niedersächsischen Tradition entsprechend".
 *
 * ABER: Der BESTAND konvergiert, die BEDEUTUNG nicht. Derselbe Operator heißt in zwei
 * Ländern dasselbe und verlangt etwas anderes:
 *
 *   „begründen" in Mathematik
 *     NRW/NI/HH: mit „nachweisen" und „zeigen" zusammengefasst, „durch logisches Schließen
 *                zu bestätigen", Vorgehen frei wählbar – eine reine Rechnung genügt.
 *     SH:        eigener Operator, verlangt ausdrücklich Textanteile: „Die Angabe einer
 *                Formel oder Ähnliches genügt hier nicht."
 *
 *   „berechnen" in Mathematik
 *     HE: „ohne Nutzung der erweiterten Funktionalitäten des WTR/CAS"
 *     SH: „Auch die Nutzung des Taschenrechners ist zulässig."
 *
 * Das ist der Fehler, der im erzeugten Material UNSICHTBAR wäre: „Begründe" mit
 * NRW-Bedeutung erzeugt einen Erwartungshorizont aus reiner Rechnung – in
 * Schleswig-Holstein wäre die Aufgabe damit falsch gestellt. Für die Lehrkraft sähe das
 * aus wie ein KI-Problem.
 *
 * DARAUS FOLGEN DREI SCHICHTEN:
 *   1. KERN – acht Operatoren, die in allen acht gelesenen Listen vorkommen. Nur die NAMEN.
 *      Ohne Landesprofil gibt die App KEINE Definition aus. Lieber keine als eine fremde.
 *   2. LÄNDERPROFIL – die wörtlichen Definitionen, die Fundstelle, und ob es überhaupt eine
 *      AFB-Spalte gibt. Nur für Länder, deren Liste im Volltext gelesen wurde.
 *   3. STUFE – Sek I oder Sek II. Das ist der WICHTIGERE Schalter als das Land: Die
 *      Länderlisten sind fast alle Abiturdokumente. Für eine Lernzielkontrolle in Klasse 7
 *      ist die Abiturliste des eigenen Landes die falschere Referenz als die Sek-I-Liste
 *      eines Nachbarlandes.
 *
 * ZUR AFB-SPALTE: Sie darf kein universelles Feld sein. NRW Mathematik sagt ausdrücklich
 * „Grundsätzlich können sich alle Operatoren auf alle drei Anforderungsbereiche beziehen"
 * und ordnet gar nichts zu; Hessen ordnet Schwerpunkte zu; Niedersachsen (EK/GE/PW) ordnet
 * jeden Operator genau einem AFB zu; NRW Deutsch ordnet jeden mehreren zu. Ein globales
 * Feld „AFB" würde für NRW-Mathematik eine Genauigkeit vortäuschen, die es dort nicht gibt.
 */

import { BESTAND } from '@shared/operatoren/zugriff'
import { STATES } from '../../arbeitsblatt/didactics/states'

export type Stufe = 'sek1' | 'sek2'
export type Afb = 'I' | 'II' | 'III'

/** Wie das Land Operatoren den Anforderungsbereichen zuordnet – oder eben nicht. */
export type AfbLogik =
  | 'keine' // NRW Mathematik: „alle Operatoren können sich auf alle drei beziehen"
  | 'schwerpunkt' // Hessen: der AFB, „in welchem sie jeweils ihren Schwerpunkt haben"
  | 'genauEiner' // Niedersachsen EK/GE/PW: Blockgliederung, ein AFB je Operator
  | 'mehrfach' // NRW Deutsch: „stets mehr als einem Anforderungsbereich zugeordnet"

export interface OperatorDefinition {
  /** Der Operator, wie er in der Aufgabe steht */
  name: string
  /** Weitere Namen, die in der Quelle dieselbe Zeile teilen */
  synonyme?: string[]
  /** WÖRTLICH aus der Landesquelle. Leer lassen, wenn die Quelle keine Definition gibt. */
  definition: string
  /** Nur gefüllt, wenn das Profil eine AFB-Spalte hat */
  afb?: Afb[]
  /**
   * Kommunikative Teilkompetenz, der der Operator zugeordnet ist.
   *
   * Die Fremdsprachen-Kerncurricula der Sekundarstufe I ordnen ihre Operatoren NICHT nach
   * Anforderungsbereichen, sondern nach Hörverstehen, Leseverstehen, Sprechen, Schreiben
   * und Sprachmittlung. Das ist keine Formalie: „cocher" (ankreuzen) gehört zum
   * Hörverstehen und hat in einer Schreibaufgabe nichts zu suchen.
   */
  teilkompetenz?: string
}

export interface Laenderprofil {
  stateId: string
  fach: string
  stufe: Stufe
  /** Vorschrift oder Handreichung, aus der die Liste stammt */
  quelle: string
  url: string
  stand: string
  /** false = Einzelschul- oder Privatspiegel, kein amtlicher Text */
  amtlich: boolean
  afbLogik: AfbLogik
  /** Erlaubt die Quelle ausdrücklich ungelistete Operatoren? */
  oeffnungsklausel: boolean
  /** Anrede in den Aufgabenstellungen dieser Stufe */
  anrede: 'du' | 'sie'
  operatoren: OperatorDefinition[]
  hinweis?: string
  /**
   * Woher das Profil stammt.
   *
   * 'volltext'   – die Landesliste wurde im Volltext gelesen; die Definitionen sind wörtlich.
   * 'abgeleitet' – für dieses Land wurde KEINE amtliche Liste gefunden. Das Profil trägt
   *                nur die Operatornamen des gemeinsamen Kerns, KEINE Definitionen. Es ist
   *                eine Arbeitsgrundlage, keine Landesvorgabe, und wird in der Oberfläche
   *                als solche gekennzeichnet.
   * Fehlt das Feld, gilt 'volltext'.
   */
  /**
   * Schulformen, für die dieses Profil gilt (Kennungen wie in `levels.json`).
   *
   * Fehlt die Angabe, gilt das Profil für alle Schulformen. Nötig wurde sie, weil
   * Niedersachsen in Erdkunde, Geschichte und Politik an Haupt-, Real- und Oberschulen
   * EIGENE Listen führt – mit anderen Anforderungsbereichen für dieselben Operatoren als am
   * Gymnasium. Ohne dieses Feld bekäme eine Hauptschulklasse die Gymnasialzuordnung, und der
   * Fehler stünde unsichtbar im Erwartungshorizont.
   */
  schulformen?: string[]
  belegt?: 'volltext' | 'abgeleitet'
  /** true = die AFB-Zuordnungen stammen aus der Quelle und wurden übernommen */
  afbUebernommen?: boolean
}

/**
 * Der sichere Kern: in allen acht gelesenen Listen enthalten.
 *
 * Geprüft über NRW, Hamburg, Niedersachsen, Schleswig-Holstein, Baden-Württemberg, Hessen,
 * Bayern-Mittelschule und Sachsen-Mittelschule.
 *
 * ACHTUNG: sicher nur im NAMEN, nicht in der BEDEUTUNG – siehe „begründen" und „berechnen"
 * im Kopfkommentar. Deshalb trägt der Kern keine Definitionen.
 */
export const KERN_OPERATOREN = ['angeben', 'nennen', 'beschreiben', 'begründen', 'berechnen', 'bestimmen', 'ermitteln', 'beurteilen', 'skizzieren', 'zeichnen']

/** In sieben von acht Listen – brauchbar, aber nicht überall belegt. */
export const FAST_KERN = ['erläutern', 'untersuchen', 'deuten', 'interpretieren']

/**
 * Praxisübliche Operatoren, die in KEINER der gelesenen amtlichen Listen stehen.
 *
 * Sie sind trotzdem zulässig: Sieben der acht Listen enthalten eine Öffnungsklausel, und
 * die bayerische Mittelschulliste nennt in ihrer sogar Beispiele – „Ordne zu", „Überprüfe",
 * „Untersuche", „Runde", „Schätze ab".
 *
 * Belegt sind sie außerdem durch echte Arbeiten: Eine bayerische Stegreifaufgabe für
 * Klasse 10 verlangt wörtlich „Fasse zusammen und vereinfache so weit wie möglich", eine
 * Schulaufgabe „Vereinfache so weit wie möglich" (mathe-physik-aufgaben.de, GM_STA003 bzw.
 * GM_A0361).
 *
 * Sie hier zu führen ist kein Aufweichen, sondern das Gegenteil: Ohne diese Liste hielte die
 * App „**Vereinfache.**" für gar keinen Operator und meldete eine tadellose Aufgabe als
 * fehlerhaft. Genau das ist im zweiten Prüfdurchlauf mit echter KI passiert.
 */
export const PRAXIS_OPERATOREN = [
  'vereinfachen',
  'zusammenfassen',
  'kürzen',
  'faktorisieren',
  'ausmultiplizieren',
  'runden',
  'abschätzen',
  'widerlegen',
  'zuordnen',
  'überprüfen'
]

/**
 * Operatoren, die für einen Kurztest zu aufwendig sind.
 *
 * Keine Vorschrift, sondern die Folge der Zeitgrenze: Bei Stoff aus „höchstens zwei
 * unmittelbar vorangegangenen Unterrichtsstunden" (Bayern GSO § 23) und 20 Minuten
 * Bearbeitungszeit ist eine Erörterung nicht leistbar. Sie werden gemeldet, nicht gesperrt.
 */
export const ZU_AUFWENDIG = ['erörtern', 'beweisen', 'interpretieren', 'diskutieren', 'Stellung nehmen', 'sich auseinandersetzen', 'reflektieren', 'entwerfen']

const NRW_MATHE: OperatorDefinition[] = [
  { name: 'angeben', synonyme: ['nennen'], definition: 'Für die Angabe bzw. Nennung ist keine Begründung notwendig.' },
  { name: 'entscheiden', definition: 'Für die Entscheidung ist keine Begründung notwendig.' },
  {
    name: 'beschreiben',
    definition:
      'Bei einer Beschreibung kommt einer sprachlich angemessenen Formulierung und ggf. einer korrekten Verwendung der Fachsprache besondere Bedeutung zu. Eine Begründung für die Beschreibung ist nicht notwendig.'
  },
  { name: 'berechnen', definition: 'Die Berechnung ist ausgehend von einem Ansatz darzustellen.' },
  {
    name: 'bestimmen',
    synonyme: ['ermitteln'],
    definition:
      'Die Art des Vorgehens kann – sofern nicht durch einen Zusatz anders angegeben – frei gewählt werden (z. B. Anwenden rechnerischer oder grafischer Verfahren). Das Vorgehen ist darzustellen.'
  },
  {
    name: 'untersuchen',
    definition:
      'Die Art des Vorgehens kann – sofern nicht durch einen Zusatz anders angegeben – frei gewählt werden (z. B. Anwenden rechnerischer oder grafischer Verfahren). Das Vorgehen ist darzustellen.'
  },
  {
    name: 'erläutern',
    definition:
      'Die Erläuterung liefert Informationen, mithilfe derer sich z. B. das Zustandekommen einer grafischen Darstellung oder ein mathematisches Vorgehen nachvollziehen lassen.'
  },
  {
    name: 'deuten',
    synonyme: ['interpretieren'],
    definition:
      'Die Deutung bzw. Interpretation stellt einen Zusammenhang her z. B. zwischen einer grafischen Darstellung, einem Term oder dem Ergebnis einer Rechnung und einem vorgegebenen Sachzusammenhang.'
  },
  {
    name: 'begründen',
    synonyme: ['nachweisen', 'zeigen'],
    definition:
      'Aussagen oder Sachverhalte sind durch logisches Schließen zu bestätigen. Die Art des Vorgehens kann – sofern nicht durch einen Zusatz anders angegeben – frei gewählt werden. Das Vorgehen ist darzustellen.'
  },
  { name: 'beurteilen', definition: 'Das zu fällende Urteil ist zu begründen.' },
  { name: 'grafisch darstellen', synonyme: ['zeichnen'], definition: 'Die grafische Darstellung bzw. Zeichnung ist möglichst genau anzufertigen.' },
  { name: 'skizzieren', definition: 'Die Skizze ist so anzufertigen, dass sie das im betrachteten Zusammenhang Wesentliche grafisch beschreibt.' }
]

const BELEGTE_PROFILE: Laenderprofil[] = [
  {
    stateId: 'NW',
    fach: 'mathematik',
    stufe: 'sek2',
    quelle: 'abitur.nrw, Mathematik – Übersicht über die Operatoren, gültig ab Abitur 2023 (angepasst 2026)',
    url: 'https://www.standardsicherung.schulministerium.nrw.de/system/files/media/document/file/m_operatoren_ab_2023_angepasst_2026.pdf',
    stand: '23.03.2026',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: NRW_MATHE,
    hinweis:
      'NRW ordnet Mathematik-Operatoren ausdrücklich KEINEM Anforderungsbereich zu: „Grundsätzlich können sich alle Operatoren auf alle drei Anforderungsbereiche beziehen."'
  },
  {
    stateId: 'HH',
    fach: 'mathematik',
    stufe: 'sek2',
    quelle: 'Anlage 27 zur Richtlinie für die Aufgabenstellung und Bewertung der Leistungen in der Abiturprüfung, Mathematik',
    url: 'https://www.hamburg.de/contentblob/4671812/33b306f4845a852f93340513681e2025/data/mathematik-arl-2021.pdf',
    stand: '2021',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: NRW_MATHE,
    hinweis:
      'Die Hamburger Liste ist mit der nordrhein-westfälischen wortgleich. Einziger Unterschied: In der Öffnungsklausel schreibt Hamburg „alltagssprachlichen", NRW und Niedersachsen schreiben „standardsprachlichen".'
  },
  {
    stateId: 'NI',
    fach: 'mathematik',
    stufe: 'sek2',
    quelle: 'Nds. Kultusministerium, Operatoren für das Fach Mathematik (Zentralabitur)',
    url: 'https://bildungsportal-niedersachsen.de/allgemeinbildung/zentrale-arbeiten/operatoren-zentrale-pruefungsfaecher-ab-2024',
    stand: '01.02.2024',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: [
      ...NRW_MATHE.map((o) =>
        o.name === 'berechnen'
          ? {
              ...o,
              definition:
                'Die Berechnung ist ausgehend von einem Ansatz darzustellen. Für die Berechnung der Extrempunkte einer Funktion f ist es beispielsweise nicht zulässig, diese direkt aus dem Graphen von f abzulesen.'
            }
          : o
      ),
      {
        name: 'herleiten',
        definition:
          'Aus bekannten Sachverhalten oder Aussagen muss nach gültigen Schlussregeln mit Berechnungen oder logischen Begründungen die Entstehung eines neuen Sachverhaltes dargelegt werden.'
      },
      {
        name: 'klassifizieren',
        definition: 'Eine Menge von Objekten muss nach vorgegebenen oder selbstständig zu wählenden Kriterien in Klassen eingeteilt werden.'
      },
      { name: 'vergleichen', definition: '' }
    ],
    hinweis:
      'Niedersachsen führt gegenüber NRW und Hamburg drei Operatoren zusätzlich: herleiten, klassifizieren, vergleichen. Bei „berechnen" ist die Definition strenger.'
  },
  {
    stateId: 'SH',
    fach: 'mathematik',
    stufe: 'sek1',
    quelle: 'Fachanforderungen Mathematik, Sekundarstufe I und Sekundarstufe II, Anhang „Operatoren im Fach Mathematik"',
    url: 'https://fachportal.lernnetz.de/files/Fachanforderungen%20und%20Leitf%C3%A4den/Sek.%20I_II/Fachanforderungen/Fachanforderungen_Mathematik_Sekundarstufen_I_II.pdf',
    stand: 'August 2014',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'du',
    operatoren: [
      {
        name: 'angeben',
        synonyme: ['nennen'],
        definition: 'Die erfragten Objekte, Sachverhalte, Begriffe oder Daten werden ohne Erläuterungen, Begründungen oder Lösungswege mitgeteilt oder notiert.'
      },
      {
        name: 'berechnen',
        definition: 'Ergebnisse werden von einem Ansatz ausgehend auf rechnerischem Wege gewonnen. Auch die Nutzung des Taschenrechners ist zulässig.'
      },
      {
        name: 'beschreiben',
        definition: 'Sachverhalte oder Verfahren werden in Textform unter Verwendung der Fachsprache in vollständigen Sätzen dargestellt.'
      },
      {
        name: 'begründen',
        definition:
          'Ein Sachverhalt wird auf Gesetzmäßigkeiten oder kausale Zusammenhänge zurückgeführt. Hierbei sind mathematische Regeln und Beziehungen zu nutzen. Auch bei der Verwendung mathematischer Syntax ist eine geschlossene Antwort erforderlich, die auch Textanteile enthält. Die Angabe einer Formel oder Ähnliches genügt hier nicht.'
      },
      {
        name: 'auflösen',
        definition:
          'Gleichungen werden unter Angabe von wesentlichen Zwischenschritten in eine äquivalente Form gebracht. Ziel ist im Allgemeinen eine Form, aus der ein Variablen- oder Parameterwert unmittelbar abzulesen ist.'
      },
      { name: 'bestimmen', synonyme: ['ermitteln'], definition: '' },
      { name: 'beurteilen', definition: '' },
      { name: 'skizzieren', definition: '' },
      { name: 'zeichnen', definition: '' },
      { name: 'zuordnen', definition: '' },
      { name: 'konstruieren', definition: '' },
      { name: 'modellieren', definition: '' },
      { name: 'widerlegen', definition: '' }
    ],
    hinweis:
      'Die schleswig-holsteinische Liste gilt für Sek I UND Sek II und ist älter als die KMK-Vereinheitlichung von 2020. ACHTUNG: „begründen" verlangt hier ausdrücklich Textanteile – „Die Angabe einer Formel oder Ähnliches genügt hier nicht." In NRW, Niedersachsen und Hamburg genügt eine reine Rechnung.'
  },
  {
    stateId: 'HE',
    fach: 'mathematik',
    stufe: 'sek2',
    quelle: 'Hessisches Kultusministerium, Operatoren Biologie/Chemie/Informatik/Mathematik/Physik, Landesabitur',
    url: 'https://kultus.hessen.de/schulsystem/schulformen-und-bildungsgaenge/gymnasium/landesabitur/operatoren-allgemeinbildende-faecher',
    stand: '01.08.2025',
    amtlich: true,
    afbLogik: 'schwerpunkt',
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: 'angeben', synonyme: ['nennen'], definition: '', afb: ['I'] },
      {
        name: 'berechnen',
        definition:
          'durch Rechenoperationen zu einem Ergebnis gelangen und die Rechenschritte dokumentieren (in Mathematik: ohne Nutzung der erweiterten Funktionalitäten des WTR/CAS)',
        afb: ['I', 'II']
      },
      {
        name: 'beschreiben',
        definition:
          'Aussagen, Beobachtungen, Methoden, Sachverhalte, Strukturen, Verfahren o. Ä. in eigenen Worten strukturiert und fachsprachlich wiedergeben',
        afb: ['I', 'II']
      },
      { name: 'skizzieren', definition: 'eine grafische Darstellung so anfertigen, dass die wesentlichen Eigenschaften deutlich werden', afb: ['I', 'II'] },
      { name: 'zeichnen', synonyme: ['grafisch darstellen'], definition: '', afb: ['I'] },
      { name: 'zusammenfassen', definition: '', afb: ['I'] },
      { name: 'begründen', definition: '', afb: ['II'] },
      { name: 'bestimmen', synonyme: ['ermitteln'], definition: '', afb: ['II'] },
      { name: 'deuten', synonyme: ['interpretieren'], definition: '', afb: ['II'] },
      { name: 'entscheiden', definition: '', afb: ['II'] },
      { name: 'erklären', definition: '', afb: ['II'] },
      { name: 'erläutern', definition: '', afb: ['II'] },
      { name: 'herleiten', definition: '', afb: ['II'] },
      { name: 'untersuchen', definition: '', afb: ['II'] },
      { name: 'vergleichen', synonyme: ['gegenüberstellen'], definition: '', afb: ['II'] },
      { name: 'zuordnen', synonyme: ['ordnen', 'einordnen'], definition: '', afb: ['II'] },
      { name: 'beurteilen', definition: '', afb: ['III'] },
      { name: 'bewerten', definition: '', afb: ['III'] },
      { name: 'beweisen', definition: '', afb: ['III'] },
      { name: 'erörtern', synonyme: ['diskutieren'], definition: '', afb: ['III'] }
    ],
    hinweis:
      'Hessen bündelt Biologie, Chemie, Informatik, Mathematik und Physik in EINER Liste; eine eigene Mathematikliste gibt es nicht. Als einziges der gelesenen Länder hat Hessen KEINE Öffnungsklausel. Zur Zuordnung sagt die Quelle: „Die konkrete Zuordnung eines Operators zu den Anforderungsbereichen ist vom Kontext der Aufgabenstellung abhängig."'
  },
  {
    stateId: 'BY',
    fach: 'mathematik',
    stufe: 'sek1',
    quelle: 'ISB Bayern, Ergänzende Materialien zum LehrplanPLUS, Mittelschule Mathematik – Operatoren',
    url: 'https://www.isb.bayern.de/fileadmin/user_upload/Mittelschule/MSA/Mathematik/LPP-MS_Mathematik_Operatoren.pdf',
    stand: 'Juli 2022',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'du',
    operatoren: [
      {
        name: 'gib an',
        synonyme: ['nenne'],
        definition: 'Von dir wird nur ein Ergebnis erwartet, ein Lösungsweg oder eine Begründung ist nicht erforderlich.'
      },
      { name: 'berechne', definition: 'Du ermittelst mithilfe einer nachvollziehbaren Rechnung die Lösung.' },
      { name: 'beschreibe', definition: 'Du stellst ein Vorgehen unter Verwendung der mathematischen Fachbegriffe sprachlich dar.' },
      {
        name: 'bestimme',
        synonyme: ['ermittle'],
        definition: 'Der Lösungsweg muss nachvollziehbar dargestellt werden; deine Lösung kann Rechnungen, Erklärungen, Skizzen oder Zeichnungen enthalten.'
      },
      {
        name: 'begründe',
        synonyme: ['zeige'],
        definition:
          'Entweder musst du eine wahre Aussage bestätigen oder du musst eine falsche Aussage widerlegen. Wenn es nicht vorgegeben ist, kannst du das Vorgehen frei wählen (z. B. Argumente, Rechnungen, Skizzen oder Gegenbeispiele).'
      },
      { name: 'beurteile', definition: 'Du prüfst eine Aussage oder wählst eine Möglichkeit und begründest deine Entscheidung.' },
      {
        name: 'entscheide',
        definition: 'Du wählst aus gegebenen Möglichkeiten die passenden aus. Eine Begründung ist nicht notwendig, außer diese wird zusätzlich gefordert.'
      },
      { name: 'erkläre', definition: 'Du machst Sachverhalte verständlich und nachvollziehbar und ordnest sie in Zusammenhänge ein.' },
      { name: 'skizziere', definition: 'Du fertigst die Skizze so an, dass sie das Wesentliche grafisch beschreibt.' },
      { name: 'zeichne', definition: 'Du fertigst mithilfe von Geodreieck, Zirkel etc. eine genaue Zeichnung an.' }
    ],
    hinweis:
      'Die einzige gefundene bayerische Mathematik-Operatorenliste stammt aus der MITTELSCHULE. Für das Gymnasium wurde keine eigene bayerische Liste ermittelt. Die Liste steht in Du-Form und spricht die Lernenden in der Definition selbst an – sie ist damit die passendste Vorlage für Sek-I-Aufgabenstellungen. Öffnungsklausel wörtlich: „Des Weiteren können in Prüfungen natürlich auch noch andere Operatoren vorkommen, wie zum Beispiel ‚Ordne zu‘, ‚Überprüfe‘, ‚Untersuche‘, ‚Runde‘ oder ‚Schätze ab‘."'
  },
  {
    stateId: 'SN',
    fach: 'alle',
    stufe: 'sek1',
    quelle: 'Sächsisches Staatsministerium für Kultus, „Verwendung ausgewählter Operatoren in Aufgabenstellungen, Klassenstufen 5 bis 10, Mittelschule"',
    url: 'https://schule.sachsen.de/download/operatoren_ms_2008.pdf',
    stand: 'August 2008',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: [
      { name: 'nennen', definition: '' },
      { name: 'angeben', definition: '' },
      { name: 'beschreiben', definition: '' },
      { name: 'berechnen', definition: '' },
      { name: 'bestimmen', definition: '' },
      { name: 'ermitteln', definition: '' },
      { name: 'begründen', definition: '' },
      { name: 'beurteilen', definition: '' },
      { name: 'skizzieren', definition: '' },
      { name: 'zeichnen', definition: '' },
      { name: 'zuordnen', definition: '' },
      { name: 'einordnen', definition: '' },
      { name: 'erklären', definition: '' },
      { name: 'erläutern', definition: '' },
      { name: 'untersuchen', definition: '' },
      { name: 'vergleichen', definition: '' },
      { name: 'analysieren', definition: '' },
      { name: 'charakterisieren', definition: '' },
      { name: 'definieren', definition: '' },
      { name: 'entwickeln', definition: '' },
      { name: 'erörtern', definition: '' },
      { name: 'interpretieren', definition: '' },
      { name: 'konstruieren', definition: '' },
      { name: 'nachweisen', definition: '' },
      { name: 'beweisen', definition: '' },
      { name: 'werten', definition: '' }
    ],
    hinweis:
      'Sachsen ordnet nicht nach Fächern, sondern nach Fächergruppen (Mathematik und Naturwissenschaften / Deutsch, Gesellschafts- und künstlerische Fächer) – ein anderes Ordnungsprinzip als in allen übrigen Ländern. Die Quelle gilt ausdrücklich auch für „dezentrale Leistungsermittlungen wie Klassenarbeiten, Kurzarbeiten und Präsentationen", also genau für diesen Anwendungsfall. Die Definitionen wurden für dieses Profil NICHT übernommen, weil die Liste nach Fächergruppen gegliedert ist und die Zuordnung zum Einzelfach eine Auslegung wäre.'
  },
  {
    stateId: 'NI',
    fach: 'deutsch',
    stufe: 'sek2',
    quelle: 'Nds. Kultusministerium, Operatoren für das Fach Deutsch (Zentralabitur)',
    url: 'https://bildungsportal-niedersachsen.de/allgemeinbildung/zentrale-arbeiten/operatoren-zentrale-pruefungsfaecher-ab-2024',
    stand: '01.02.2024',
    amtlich: true,
    afbLogik: 'mehrfach',
    afbUebernommen: true,
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: [
      { name: 'nennen', synonyme: ['benennen'], definition: 'Informationen ohne Kommentierung bezeichnen', afb: ['I'] },
      { name: 'wiedergeben', definition: '', afb: ['I', 'II'] },
      { name: 'zusammenfassen', definition: '', afb: ['I', 'II'] },
      { name: 'beschreiben', definition: '', afb: ['I', 'II'] },
      { name: 'darstellen', definition: '', afb: ['I', 'II'] },
      { name: 'einordnen', definition: '', afb: ['I', 'II'] },
      { name: 'analysieren', definition: '', afb: ['I', 'II', 'III'] },
      { name: 'erläutern', definition: 'mit zusätzlichen Informationen und Beispielen veranschaulichen', afb: ['II', 'III'] },
      { name: 'begründen', definition: '', afb: ['II', 'III'] },
      { name: 'charakterisieren', definition: '', afb: ['II', 'III'] },
      { name: 'vergleichen', definition: '', afb: ['II', 'III'] },
      { name: 'in Beziehung setzen', definition: '', afb: ['II', 'III'] },
      { name: 'prüfen', synonyme: ['überprüfen'], definition: '', afb: ['II', 'III'] },
      { name: 'beurteilen', definition: '', afb: ['II', 'III'] },
      { name: 'bewerten', definition: '', afb: ['II', 'III'] },
      { name: 'Stellung nehmen', definition: '', afb: ['II', 'III'] },
      { name: 'sich auseinandersetzen', definition: '', afb: ['II', 'III'] },
      { name: 'entwerfen', definition: '', afb: ['II', 'III'] },
      { name: 'erörtern', definition: '', afb: ['I', 'II', 'III'] },
      { name: 'gestalten', definition: '', afb: ['I', 'II', 'III'] },
      { name: 'interpretieren', definition: '', afb: ['I', 'II', 'III'] },
      { name: 'verfassen', definition: '', afb: ['I', 'II', 'III'] }
    ],
    hinweis:
      'Niedersachsen markiert in dieser Liste selbst, welche Operatoren über den IQB-Grundstock hinausgehen: „Hellgrau unterlegt sind diejenigen Operatoren, die über die Liste der IQB-Operatoren für die schriftliche Abiturprüfung hinausgehen und der niedersächsischen Tradition entsprechen." Von den Definitionen liegen nur zwei wörtlich vor; die übrigen Zeilen tragen deshalb nur den Anforderungsbereich.'
  },
  {
    stateId: 'NW',
    fach: 'deutsch',
    stufe: 'sek2',
    quelle: 'abitur.nrw, Deutsch – Übersicht über die Operatoren, gültig ab Abitur 2023',
    url: 'https://www.standardsicherung.schulministerium.nrw.de/system/files/media/document/file/d-operatoren-ab-abitur-2023.pdf',
    stand: 'Abitur 2023',
    amtlich: true,
    afbLogik: 'mehrfach',
    afbUebernommen: true,
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: [
      {
        name: 'nennen',
        synonyme: ['benennen'],
        definition: 'aus einem Text entnommene Informationen, Aspekte eines Sachverhalts, Fakten zusammentragen',
        afb: ['I']
      },
      { name: 'wiedergeben', definition: '', afb: ['I'] },
      { name: 'zusammenfassen', definition: '', afb: ['I', 'II'] },
      { name: 'beschreiben', definition: '', afb: ['I', 'II'] },
      { name: 'analysieren', definition: '', afb: ['I', 'II', 'III'] },
      {
        name: 'erläutern',
        definition:
          'Materialien, Sachverhalte, Zusammenhänge, Thesen in einen Begründungszusammenhang stellen und mit zusätzlichen Informationen und Beispielen veranschaulichen',
        afb: ['II', 'III']
      },
      { name: 'begründen', definition: '', afb: ['III'] },
      { name: 'vergleichen', definition: '', afb: ['II', 'III'] },
      { name: 'beurteilen', definition: '', afb: ['II', 'III'] },
      { name: 'bewerten', definition: '', afb: ['II', 'III'] },
      { name: 'Stellung nehmen', definition: '', afb: ['II', 'III'] },
      { name: 'erörtern', definition: '', afb: ['II', 'III'] },
      { name: 'gestalten', definition: '', afb: ['II'] },
      { name: 'entwerfen', definition: '', afb: ['III'] },
      { name: 'interpretieren', definition: '', afb: ['I', 'II', 'III'] }
    ],
    hinweis:
      'NRW nennt die Grundlage selbst: „eine Zusammenführung des ‚Grundstocks von Operatoren‘ des gemeinsamen Abituraufgabenpools der Länder beim IQB mit in NRW bereits etablierten Operatoren … vor dem Hintergrund des Beschlusses der Kultusministerkonferenz vom 15.10.2020". ACHTUNG gegenüber Niedersachsen: „begründen" ist hier AFB III (in NI II/III), „gestalten" AFB II (in NI I/II/III), „wiedergeben" AFB I (in NI I/II). Der Operator „erschließen" trägt in der AFB-Spalte keinen Anforderungsbereich, sondern den Eintrag „generalisierende Aufforderung".'
  },
  {
    stateId: 'HE',
    fach: 'deutsch',
    stufe: 'sek2',
    quelle: 'Hessisches Kultusministerium, Operatoren Deutsch/Musik/Sport, Landesabitur',
    url: 'https://kultus.hessen.de/schulsystem/schulformen-und-bildungsgaenge/gymnasium/landesabitur/operatoren-allgemeinbildende-faecher',
    stand: '01.08.2025',
    amtlich: true,
    afbLogik: 'schwerpunkt',
    afbUebernommen: true,
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: 'nennen', definition: 'zielgerichtet Informationen zusammentragen, ohne diese zu kommentieren', afb: ['I'] },
      {
        name: 'beschreiben',
        definition: 'Aussagen, Sachverhalte, Situationen, Strukturen o. Ä. in eigenen Worten strukturiert und fachsprachlich darlegen',
        afb: ['I', 'II']
      },
      { name: 'zusammenfassen', definition: '', afb: ['I'] },
      { name: 'analysieren', definition: '', afb: ['II'] },
      { name: 'erläutern', definition: '', afb: ['II'] },
      { name: 'begründen', definition: '', afb: ['II'] },
      { name: 'vergleichen', definition: '', afb: ['II'] },
      { name: 'beurteilen', definition: '', afb: ['III'] },
      { name: 'bewerten', definition: '', afb: ['III'] },
      { name: 'erörtern', synonyme: ['diskutieren'], definition: '', afb: ['III'] },
      { name: 'Stellung nehmen', definition: '', afb: ['III'] },
      { name: 'verfassen', definition: '', afb: ['III'] }
    ],
    hinweis: 'Wie die hessische Naturwissenschaftsliste ohne Öffnungsklausel. Nur zwei Definitionen liegen wörtlich vor.'
  },
  {
    stateId: 'NI',
    fach: 'geschichte',
    stufe: 'sek2',
    quelle: 'Nds. Kultusministerium, Operatoren für Erdkunde, Geschichte, Politik-Wirtschaft und Wirtschaftslehre',
    url: 'https://bildungsportal-niedersachsen.de/allgemeinbildung/zentrale-arbeiten/operatoren-zentrale-pruefungsfaecher-ab-2024',
    stand: '01.02.2024',
    amtlich: true,
    afbLogik: 'genauEiner',
    afbUebernommen: false,
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: [
      { name: 'nennen', definition: '' },
      { name: 'beschreiben', definition: '' },
      { name: 'zusammenfassen', definition: '' },
      { name: 'einordnen', definition: '' },
      { name: 'erläutern', definition: '' },
      { name: 'erklären', definition: '' },
      { name: 'analysieren', definition: '' },
      { name: 'herausarbeiten', definition: '' },
      { name: 'vergleichen', definition: '' },
      { name: 'gegenüberstellen', definition: '' },
      { name: 'in Beziehung setzen', definition: '' },
      { name: 'nachweisen', definition: '' },
      { name: 'interpretieren', definition: '' },
      { name: 'beurteilen', definition: '' },
      { name: 'bewerten', definition: '' },
      { name: 'Stellung nehmen', definition: '' },
      { name: 'sich auseinandersetzen', definition: '' },
      { name: 'erörtern', definition: '' }
    ],
    hinweis:
      'Diese Liste gilt für vier Fächer gemeinsam und ordnet jeden Operator GENAU EINEM Anforderungsbereich zu (Blockgliederung); einzige Ausnahme ist „interpretieren", das allen drei zugeordnet ist. Einige Operatoren sind fachgebunden: „darstellen" und „begründen" nur in Erdkunde und Politik-Wirtschaft; „herausarbeiten" und „sich auseinandersetzen" nur in Geschichte und Politik-Wirtschaft; „gegenüberstellen", „in Beziehung setzen", „interpretieren" und „nachweisen" nur in Geschichte. Die Einzelzuordnung zu den Anforderungsbereichen wurde NICHT übernommen, weil sie in der Recherche nicht Operator für Operator erfasst wurde.'
  },
  {
    stateId: 'NW',
    fach: 'englisch',
    stufe: 'sek2',
    quelle: 'abitur.nrw, Englisch – Übersicht über die Operatoren, gültig ab Abitur 2025',
    url: 'https://www.standardsicherung.schulministerium.nrw.de/system/files/media/document/file/e_operatoren_ab_abitur2025.pdf',
    stand: 'Abitur 2025',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: 'analyse', definition: 'describe and explain in detail' },
      { name: 'examine', definition: 'describe and explain in detail' },
      { name: 'assess', definition: 'express a well-founded opinion on the nature or quality of sb./sth.' },
      { name: 'evaluate', definition: 'express a well-founded opinion on the nature or quality of sb./sth.' },
      { name: 'give a characterization of', synonyme: ['write a characterization of'], definition: 'provide a thorough analysis of a character' },
      { name: 'comment', definition: 'state one’s opinion clearly and support one’s view with evidence or reasons' },
      { name: 'compare', definition: 'show similarities and differences' },
      { name: 'describe', definition: 'give a detailed account of what sb./sth. is like' },
      { name: 'discuss', definition: 'give arguments or reasons for and against, especially to come to a well-founded conclusion' },
      { name: 'explain', definition: 'make sth. clear by giving reasons for and details, aspects of sth.' },
      { name: 'illustrate', definition: 'use examples to explain or make clear' },
      { name: 'interpret', definition: 'explain the meaning, purpose or message of sth.' },
      { name: 'outline', definition: 'give the main features, structure or general principles of sth.' },
      { name: 'point out', definition: 'find and explain certain aspects' },
      { name: 'state', definition: 'present the main aspects of sth. briefly and clearly' },
      { name: 'summarize', synonyme: ['sum up'], definition: 'give a concise account of the main points or ideas of a text, issue or topic' },
      { name: 'write', definition: 'produce a text with specific features' }
    ],
    hinweis:
      'Die Operatoren stehen auf ENGLISCH und werden auch so in die Aufgabe geschrieben. Anders als die nordrhein-westfälischen Listen für Mathematik und Biologie enthält diese KEINE Öffnungsklausel für ungelistete Operatoren. Für die Sprachmittlung führt die Quelle eigene Operatoren (explain, outline, summarize) mit abweichenden, auf Kulturunterschiede bezogenen Definitionen.'
  },
  {
    stateId: 'NW',
    fach: 'geschichte',
    stufe: 'sek2',
    quelle: 'abitur.nrw, Geschichte – Übersicht über die Operatoren',
    url: 'https://www.standardsicherung.schulministerium.nrw.de/system/files/media/document/file/af2-ge_operatoren.pdf',
    stand: 'Abitur 2023',
    amtlich: true,
    afbLogik: 'mehrfach',
    afbUebernommen: true,
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: 'nennen', definition: 'Informationen / Sachverhalte / Merkmale zielgerichtet unkommentiert zusammentragen', afb: ['I', 'II'] },
      { name: 'beschreiben', definition: 'Merkmale / Aspekte eines Sachverhaltes oder eines Materials detailliert darstellen', afb: ['I', 'II'] },
      { name: 'zusammenfassen', definition: 'Sachverhalte / Aussagen komprimiert darstellen', afb: ['I', 'II'] },
      {
        name: 'analysieren',
        definition:
          'Formale Merkmale von Materialien untersuchen und Inhalt und Gedankengang von Materialien (Quellen, Darstellungen) wiedergeben bzw. Bildelemente (Karikaturen, historische Gemälde) beschreiben',
        afb: ['II']
      },
      {
        name: 'begründen',
        definition: 'Aussagen (z. B. Urteil, These, Wertung) durch Argumente stützen, die auf historischen Beispielen und anderen Belegen gründen',
        afb: ['II']
      },
      { name: 'einordnen', definition: 'einen oder mehrere historische Sachverhalte in einen historischen Zusammenhang stellen', afb: ['II'] },
      {
        name: 'erläutern',
        definition:
          'historische Sachverhalte durch Wissen und Einsichten in einen Zusammenhang einordnen und durch zusätzliche Informationen und Beispiele verdeutlichen',
        afb: ['II']
      },
      {
        name: 'herausarbeiten',
        definition:
          'aus Materialien bestimmte historische Sachverhalte herausfinden, die nicht explizit genannt werden, und Zusammenhänge zwischen ihnen herstellen',
        afb: ['II']
      },
      { name: 'untersuchen', definition: 'Materialien oder historische Sachverhalte kriterienorientiert bzw. aspektgeleitet erschließen', afb: ['II'] },
      {
        name: 'charakterisieren',
        definition: 'historische Sachverhalte in ihren Eigenarten beschreiben und diese dann unter einem bestimmten Gesichtspunkt zusammenfassen',
        afb: ['II', 'III']
      },
      {
        name: 'vergleichen',
        definition:
          'auf der Grundlage von Kriterien historische Sachverhalte problembezogen gegenüberstellen, um Gemeinsamkeiten, Unterschiede, Teil-Identitäten, Ähnlichkeiten, Abweichungen oder Gegensätze darzustellen',
        afb: ['II', 'III']
      },
      {
        name: 'entwickeln',
        definition:
          'auf der Grundlage erarbeiteter Ergebnisse zu einer eigenen Deutung gelangen; gewonnene Analyseergebnisse verwerten, um in einem vorgegebenen Textformat (z. B. Rede, Leserbrief, Diskussionsbeitrag) zu einer eigenen Deutung zu gelangen',
        afb: ['II', 'III']
      },
      {
        name: 'beurteilen',
        definition:
          'den Stellenwert historischer Sachverhalte in einem Zusammenhang bestimmen, um ohne persönlichen Wertebezug zu einem begründeten Sachurteil zu gelangen',
        afb: ['III']
      },
      {
        name: 'bewerten',
        definition:
          'wie Operator „beurteilen", aber zusätzlich mit Offenlegen und Begründen eigener Wertmaßstäbe, die Pluralität einschließen und zu einem Werturteil führen, das auf den Wertvorstellungen des Grundgesetzes basiert',
        afb: ['III']
      },
      {
        name: 'Stellung nehmen',
        definition:
          'eine Problemstellung / eine Bewertung / eine Position auf der Grundlage fachlicher Kenntnisse prüfen und nach sorgfältiger Abwägung eine Einschätzung formulieren',
        afb: ['III']
      },
      {
        name: 'erörtern',
        definition:
          'Eine These oder Problemstellung auf ihren Wert und ihre Stichhaltigkeit hin abwägend prüfen und auf dieser Grundlage eine eigene Stellungnahme dazu entwickeln. Die Erörterung einer historischen Darstellung setzt deren Analyse voraus.',
        afb: ['I', 'II', 'III']
      },
      {
        name: 'interpretieren',
        definition:
          'Sinnzusammenhänge aus Quellen erschließen und eine begründete Stellungnahme abgeben, die auf einer Analyse, Erläuterung und Bewertung beruht',
        afb: ['I', 'II', 'III']
      }
    ],
    hinweis:
      'Die Quelle gibt je Operator eine AFB-BANDBREITE an, nicht einen einzelnen Anforderungsbereich – teils mit dem Zusatz „überwiegend". „Erörtern" und „interpretieren" sind ausdrücklich übergeordnete Operatoren über alle drei Bereiche. Anders als die nordrhein-westfälische Mathematikliste enthält diese keine Öffnungsklausel.'
  },
  {
    stateId: 'NW',
    fach: 'biologie',
    stufe: 'sek2',
    quelle: 'abitur.nrw, Biologie – Übersicht über die Operatoren, gültig ab Abitur 2025',
    url: 'https://www.standardsicherung.schulministerium.nrw.de/system/files/media/document/file/bi_operatoren_ab_abitur2025-gost.pdf',
    stand: 'Abitur 2025',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: [
      { name: 'angeben', synonyme: ['nennen'], definition: 'Formeln, Regeln, Sachverhalte, Begriffe oder Daten ohne Erläuterung aufzählen bzw. wiedergeben' },
      { name: 'ableiten', definition: 'auf der Grundlage von Erkenntnissen oder Daten sachgerechte Schlüsse ziehen' },
      { name: 'abschätzen', definition: 'durch begründete Überlegungen Größenwerte angeben' },
      { name: 'analysieren', definition: 'wichtige Bestandteile, Eigenschaften oder Zusammenhänge auf eine bestimmte Fragestellung hin herausarbeiten' },
      {
        name: 'auswerten',
        definition: 'Beobachtungen, Daten, Einzelergebnisse oder Informationen in einen Zusammenhang stellen und daraus Schlussfolgerungen ziehen'
      },
      { name: 'begründen', definition: 'Gründe oder Argumente für eine Vorgehensweise oder einen Sachverhalt nachvollziehbar darstellen' },
      { name: 'berechnen', definition: 'Die Berechnung ist ausgehend von einem Ansatz darzustellen.' },
      {
        name: 'beschreiben',
        definition:
          'Beobachtungen, Strukturen, Sachverhalte, Methoden, Verfahren oder Zusammenhänge strukturiert und unter Verwendung der Fachsprache formulieren'
      },
      { name: 'beurteilen', definition: 'Das zu fällende Sachurteil ist mithilfe fachlicher Kriterien zu begründen.' },
      { name: 'bewerten', definition: 'Das zu fällende Werturteil ist unter Berücksichtigung gesellschaftlicher Werte und Normen zu begründen.' },
      {
        name: 'darstellen',
        definition:
          'Strukturen, Sachverhalte oder Zusammenhänge strukturiert und unter Verwendung der Fachsprache formulieren, auch mithilfe von Zeichnungen und Tabellen'
      },
      { name: 'diskutieren', definition: 'Argumente zu einer Aussage oder These einander gegenüberstellen und abwägen' },
      {
        name: 'entwickeln',
        definition: 'zu einem Sachverhalt oder einer Problemstellung eine Fragestellung, ein Modell oder ein Experiment entwerfen oder modifizieren'
      },
      { name: 'Hypothesen aufstellen', definition: 'eine Vermutung über einen unbekannten Sachverhalt formulieren, die fachlich fundiert begründet wird' },
      {
        name: 'aufstellen',
        synonyme: ['formulieren'],
        definition: 'chemische Formeln, Gleichungen, Reaktionsgleichungen (Wort- oder Formelgleichungen) oder Reaktionsmechanismen entwickeln'
      }
    ],
    hinweis:
      'Die Liste hat eine Öffnungsklausel und nennt dafür sogar ein Beispiel: „(z. B. „durchführen": Führen Sie das Experiment durch.)". Zur AFB-Zuordnung sagt sie wie die Mathematikliste: „Grundsätzlich können sich alle Operatoren auf alle drei Anforderungsbereiche beziehen."'
  },
  {
    stateId: 'NI',
    fach: 'biologie',
    stufe: 'sek2',
    quelle: 'Nds. Kultusministerium, Operatoren für die Naturwissenschaften (Biologie, Chemie, Physik)',
    url: 'https://bildungsportal-niedersachsen.de/allgemeinbildung/zentrale-arbeiten/operatoren-zentrale-pruefungsfaecher-ab-2024',
    stand: '15.02.2024',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: [
      { name: 'angeben', synonyme: ['nennen'], definition: 'Formeln, Regeln, Sachverhalte, Begriffe, Daten ohne Erläuterung aufzählen bzw. wiedergeben' },
      { name: 'ableiten', definition: 'auf der Grundlage von Erkenntnissen oder Daten sachgerechte Schlüsse ziehen' },
      { name: 'abschätzen', definition: 'durch begründete Überlegungen Größenwerte angeben' },
      { name: 'analysieren', definition: 'wichtige Bestandteile, Eigenschaften oder Zusammenhänge auf eine bestimmte Fragestellung hin herausarbeiten' },
      { name: 'anwenden', definition: 'einen bekannten Sachverhalt oder eine bekannte Methode auf etwas Neues beziehen' },
      {
        name: 'auswerten',
        definition: 'Beobachtungen, Daten, Einzelergebnisse oder Informationen in einen Zusammenhang stellen und daraus Schlussfolgerungen ziehen'
      },
      { name: 'begründen', definition: 'Gründe oder Argumente für eine Vorgehensweise oder einen Sachverhalt nachvollziehbar darstellen' },
      { name: 'berechnen', definition: 'die Berechnung ist ausgehend von einem Ansatz darzustellen' },
      {
        name: 'beschreiben',
        definition:
          'Beobachtungen, Strukturen, Sachverhalte, Methoden, Verfahren oder Zusammenhänge strukturiert und unter Verwendung der Fachsprache formulieren'
      },
      {
        name: 'bestätigen',
        definition:
          'die Gültigkeit einer Aussage (z. B. einer Hypothese, einer Modellvorstellung, eines Naturgesetzes) zu einem Experiment, zu vorliegenden Daten oder zu Schlussfolgerungen feststellen'
      },
      { name: 'beurteilen', definition: 'das zu fällende Sachurteil ist mit Hilfe fachlicher Kriterien zu begründen' },
      {
        name: 'bewerten',
        definition: 'einen Sachverhalt vor dem Hintergrund gesellschaftlicher Werte und Normen einschätzen und dadurch zu einem Werturteil gelangen'
      },
      {
        name: 'darstellen',
        definition:
          'Strukturen, Sachverhalte oder Zusammenhänge strukturiert und unter Verwendung der Fachsprache formulieren, auch mithilfe von Zeichnungen und Tabellen'
      },
      { name: 'diskutieren', synonyme: ['erörtern'], definition: 'Argumente zu einer Aussage oder These einander gegenüberstellen und abwägen' },
      {
        name: 'entwickeln',
        definition:
          'Sachverhalte und Methoden zielgerichtet miteinander verknüpfen: eine Hypothese, eine Skizze, ein Experiment, ein Modell oder eine Theorie schrittweise weiterführen und ausbauen'
      },
      { name: 'erklären', definition: 'einen Sachverhalt nachvollziehbar und verständlich machen, indem man ihn auf Regeln und Gesetzmäßigkeiten zurückführt' },
      { name: 'erläutern', definition: 'einen Sachverhalt veranschaulichend darstellen und durch zusätzliche Informationen verständlich machen' },
      { name: 'ermitteln', definition: 'ein Ergebnis oder einen Zusammenhang rechnerisch, grafisch oder experimentell bestimmen' },
      { name: 'herleiten', definition: 'mithilfe bekannter Gesetzmäßigkeiten einen Zusammenhang zwischen chemischen bzw. physikalischen Größen herstellen' },
      {
        name: 'interpretieren',
        synonyme: ['deuten'],
        definition:
          'naturwissenschaftliche Ergebnisse, Beschreibungen und Annahmen vor dem Hintergrund einer Fragestellung oder Hypothese in einen nachvollziehbaren Zusammenhang bringen'
      },
      { name: 'ordnen', synonyme: ['zuordnen'], definition: 'Begriffe oder Gegenstände auf der Grundlage bestimmter Merkmale systematisch einteilen' },
      { name: 'planen', definition: 'zu einem vorgegebenen Problem (auch experimentelle) Lösungswege entwickeln und dokumentieren' },
      { name: 'protokollieren', definition: 'Beobachtungen oder die Durchführung von Experimenten zeichnerisch bzw. fachsprachlich richtig wiedergeben' },
      {
        name: 'prüfen',
        synonyme: ['überprüfen'],
        definition: 'Sachverhalte oder Aussagen an Fakten oder innerer Logik messen und eventuelle Widersprüche aufdecken'
      },
      { name: 'skizzieren', definition: 'Sachverhalte, Prozesse, Strukturen oder Ergebnisse übersichtlich grafisch darstellen' },
      { name: 'untersuchen', definition: 'Sachverhalte oder Phänomene mithilfe fachspezifischer Arbeitsweisen erschließen' },
      { name: 'vergleichen', definition: 'Gemeinsamkeiten und Unterschiede kriteriengeleitet herausarbeiten' },
      { name: 'zeichnen', definition: 'Objekte grafisch exakt darstellen' },
      { name: 'zusammenfassen', definition: 'das Wesentliche in konzentrierter Form herausstellen' },
      { name: 'aufbauen eines Experiments', definition: 'Objekte und Geräte zielgerichtet anordnen und kombinieren' },
      {
        name: 'durchführen eines Experiments',
        definition: 'an einer Experimentieranordnung zielgerichtete Messungen und Änderungen vornehmen oder eine Experimentieranleitung umsetzen'
      },
      { name: 'dokumentieren', definition: 'bei Verwendung eines elektronischen Rechners den Lösungsweg nachvollziehbar darstellen' },
      { name: 'Hypothesen aufstellen', definition: 'eine Vermutung über einen unbekannten Sachverhalt formulieren, die fachlich fundiert begründet wird' },
      {
        name: 'aufstellen',
        synonyme: ['formulieren'],
        definition: 'chemische Formeln, Gleichungen, Reaktionsgleichungen (Wort- oder Formelgleichungen), Reaktionsmechanismen entwickeln'
      }
    ],
    hinweis:
      'Eine Liste für Biologie, Chemie und Physik gemeinsam. Einzelne Definitionen tragen fachgebundene Zusätze, die hier nicht mitgeführt werden: „analysieren" heißt in Chemie zusätzlich „einen Sachverhalt experimentell prüfen", „aufstellen/formulieren" gilt nur für Biologie und Chemie, „dokumentieren" bezieht sich auf die Verwendung von GTR/CAS.'
  },
  {
    stateId: 'NI',
    fach: 'biologie',
    stufe: 'sek1',
    quelle: 'Kerncurriculum Naturwissenschaften, Gymnasium Schuljahrgänge 5–10, Anhang A2 „Operatoren für Aufgabenstellungen in den Naturwissenschaften"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=18',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: 'nennen', definition: 'Elemente, Sachverhalte, Begriffe, Daten ohne Erläuterungen angeben' },
      { name: 'abschätzen', definition: 'durch begründetes Überlegen Näherungswerte angeben' },
      { name: 'analysieren', definition: 'wichtige Bestandteile oder Eigenschaften auf eine bestimmte Fragestellung hin herausarbeiten' },
      { name: 'anwenden', definition: 'einen bekannten Sachverhalt oder eine bekannte Methode auf etwas Neues beziehen' },
      { name: 'ein Experiment aufbauen', definition: 'Objekte und Geräte zielgerichtet anordnen und kombinieren' },
      {
        name: 'eine Hypothese aufstellen',
        definition: 'eine begründete Vermutung auf der Grundlage von Beobachtungen, Untersuchungen, Experimenten oder Aussagen formulieren'
      },
      { name: 'eine Reaktionsgleichung aufstellen', definition: 'vorgegebene chemische Informationen in eine Reaktionsgleichung übersetzen. (nur Chemie)' },
      {
        name: 'auswerten',
        definition: 'Daten, Einzelergebnisse oder andere Elemente in einen Zusammenhang stellen und ggf. zu einer Gesamtaussage zusammenführen'
      },
      { name: 'begründen', definition: 'Sachverhalte auf Regeln und Gesetzmäßigkeiten bzw. kausale Beziehungen von Ursachen und Wirkung zurückführen' },
      { name: 'berechnen', synonyme: ['bestimmen'], definition: 'numerische Ergebnisse von einem Ansatz ausgehend gewinnen' },
      { name: 'beschreiben', definition: 'Strukturen, Sachverhalte oder Zusammenhänge strukturiert und fachsprachlich richtig mit eigenen Worten wiedergeben' },
      {
        name: 'bestätigen',
        definition:
          'die Gültigkeit einer Aussage (z. B. einer Hypothese, einer Modellvorstellung, eines Naturgesetzes) zu einem Experiment, zu vorliegenden Daten oder zu Schlussfolgerungen feststellen.'
      },
      {
        name: 'beurteilen',
        synonyme: ['Stellung nehmen'],
        definition: 'zu einem Sachverhalt ein selbstständiges Urteil unter Verwendung von Fachwissen und Fachmethoden formulieren und begründen'
      },
      { name: 'bewerten', definition: 'einen Gegenstand an erkennbaren Wertkategorien oder an bekannten Beurteilungskriterien messen' },
      { name: 'darstellen', definition: 'Sachverhalte, Zusammenhänge, Methoden etc. strukturiert und ggf. fachsprachlich wiedergeben' },
      { name: 'deuten', definition: 'Sachverhalte in einen Erklärungszusammenhang bringen' },
      {
        name: 'diskutieren',
        synonyme: ['erörtern'],
        definition: 'Argumente, Sachverhalte und Beispiele zu einer Aussage oder These einander gegenüberstellen und abwägen'
      },
      {
        name: 'dokumentieren',
        definition: 'Bei Verwendung eines elektronischen Rechners den Lösungsweg nachvollziehbar darstellen (im Zusammenhang mit dem GTR/CAS)'
      },
      {
        name: 'ein Experiment durchführen',
        definition: 'an einer Experimentieranordnung zielgerichtete Messungen und Änderungen vornehmen oder eine Experimentieranleitung umsetzen'
      },
      {
        name: 'entwickeln',
        definition:
          'Sachverhalte und Methoden zielgerichtet miteinander verknüpfen. Eine Hypothese, eine Skizze, ein Experiment, ein Modell oder eine Theorie schrittweise weiterführen und ausbauen'
      },
      {
        name: 'erklären',
        definition: 'einen Sachverhalt nachvollziehbar und verständlich zum Ausdruck bringen mit Bezug auf Regeln, Gesetzmäßigkeiten und Ursachen'
      },
      { name: 'erläutern', definition: 'einen Sachverhalt durch zusätzliche Informationen veranschaulichen und verständlich machen' },
      { name: 'ermitteln', definition: 'einen Zusammenhang oder eine Lösung finden und das Ergebnis formulieren' },
      {
        name: 'herleiten',
        definition: 'aus Größengleichungen durch mathematische Operationen eine Bestimmungsgleichung einer naturwissenschaftlichen Größe erstellen'
      },
      {
        name: 'ein Experiment planen',
        definition: 'zu einem vorgegebenen Problem eine Experimentieranordnung finden oder zu einem vorgegebenen Problem eine Experimentieranleitung erstellen.'
      },
      { name: 'protokollieren', definition: 'Beobachtungen oder die Durchführung von Experimenten zeichnerisch bzw. fachsprachlich richtig wiedergeben' },
      { name: 'skizzieren', definition: 'Sachverhalte, Strukturen oder Ergebnisse auf das Wesentliche reduziert grafisch übersichtlich darstellen' },
      {
        name: 'überprüfen',
        synonyme: ['prüfen'],
        definition: 'Sachverhalte oder Aussagen an Fakten oder innerer Logik messen und eventuelle Widersprüche aufdecken'
      },
      { name: 'verallgemeinern', definition: 'aus einem erkannten Sachverhalt eine erweiterte Aussage formulieren' },
      { name: 'vergleichen', definition: 'Gemeinsamkeiten, Ähnlichkeiten und Unterschiede feststellen' },
      { name: 'zeichnen', definition: 'eine anschauliche und hinreichend exakte grafische Darstellung beobachtbarer oder gegebener Strukturen anfertigen' },
      { name: 'zusammenfassen', definition: 'das Wesentliche in konzentrierter Form herausstellen' }
    ],
    hinweis:
      'Die Sekundarstufe I hat in Niedersachsen KEINE getrennten Listen für Biologie, Chemie und Physik – es gilt eine gemeinsame naturwissenschaftliche Liste. Sie weicht von der Abiturliste ab: „herleiten" ist hier eng auf Größengleichungen bezogen, „berechnen" und „bestimmen" sind zusammengefasst, und „verallgemeinern" gibt es nur hier. Fachgebunden ist allein „eine Reaktionsgleichung aufstellen" (nur Chemie). Das Kerncurriculum führt denselben Bestand zusätzlich zweisprachig für den bilingualen Unterricht.'
  },
  {
    stateId: 'NI',
    fach: 'deutsch',
    stufe: 'sek1',
    quelle: 'Kerncurriculum Deutsch für den Sekundarbereich I, Schuljahrgänge 5–10, Kapitel 6 „Operatorenliste"',
    url: 'https://www.mk.niedersachsen.de/download/212300/Kerncurriculum_Deutsch_fuer_den_Sekundarbereich_I.pdf',
    stand: 'ANHÖRFASSUNG Oktober 2024',
    amtlich: true,
    afbLogik: 'mehrfach',
    afbUebernommen: true,
    oeffnungsklausel: true,
    anrede: 'sie',
    operatoren: [
      { name: 'nennen', definition: 'Informationen ohne Kommentierung – auch unter Einbeziehung von Material – darlegen', afb: ['I', 'II'] },
      { name: 'aufzählen', definition: 'vorgegebene Inhalte in richtiger Reihenfolge benennen', afb: ['I', 'II'] },
      { name: 'wiedergeben', definition: 'Inhalte mit eigenen Worten sprachlich angemessen darlegen', afb: ['I', 'II'] },
      {
        name: 'beschreiben',
        definition: 'Sachverhalte, Situationen, Vorgänge, Merkmale von Personen bzw. Figuren in eigenen Worten sachlich darlegen',
        afb: ['I', 'II']
      },
      { name: 'gliedern', definition: 'Texte nach bestimmten Aspekten strukturieren und hierarchisieren', afb: ['I', 'II'] },
      {
        name: 'einordnen',
        definition: 'eine Aussage, einen Text, einen Sachverhalt unter Verwendung von Kontextwissen begründet in einen (vorgegebenen) Zusammenhang stellen',
        afb: ['I', 'II']
      },
      {
        name: 'erschließen',
        definition: 'Materialien für die weitere Bearbeitung aufbereiten; (neue) Informationen, Erkenntnisse und Sichtweisen herleiten',
        afb: ['I', 'II']
      },
      { name: 'erzählen', definition: 'Erlebnisse oder Erfundenes adressatenorientiert und anschaulich vortragen und darstellen', afb: ['I', 'II'] },
      { name: 'zusammenfassen', definition: 'Inhalte und Zusammenhänge sachbezogen, strukturiert und komprimiert wiedergeben', afb: ['II'] },
      {
        name: 'anwenden',
        definition: 'bekannte Sachverhalte, erarbeitete Regeln oder Methoden auf andere Problemstellungen übertragen und zur Lösung nutzen',
        afb: ['II']
      },
      { name: 'darstellen', definition: 'Zusammenhänge und übergeordnete Sachverhalte strukturiert veranschaulichen', afb: ['II'] },
      { name: 'erklären', definition: 'Sachverhalte, Textaussagen, Zusammenhänge oder Problemstellungen verständlich machen', afb: ['II'] },
      {
        name: 'analysieren',
        definition:
          'inhaltliche, formale und sprachliche Aspekte verschiedener Medien unter Berücksichtigung des funktionalen Zusammenhangs (auch aspektgeleitet) erschließen und das Ergebnis darlegen',
        afb: ['II', 'III']
      },
      { name: 'auswerten', definition: 'Informationen aus (vorgegebenen) Medien gewinnen und zielgerichtet verarbeiten', afb: ['II', 'III'] },
      {
        name: 'begründen',
        definition: 'Positionen, Auffassungen, Urteile und Wertungen durch nachvollziehbare Argumente, Belege und/oder Beispiele absichern',
        afb: ['II', 'III']
      },
      {
        name: 'beurteilen',
        definition: 'einen Sachverhalt, eine Aussage, eine Figur auf Basis von Kriterien bzw. begründeten Wertmaßstäben einschätzen',
        afb: ['II', 'III']
      },
      {
        name: 'charakterisieren',
        definition: 'die jeweilige Eigenart von Figuren herausarbeiten und ggf. ihre Funktion für den Handlungsverlauf aufzeigen',
        afb: ['II', 'III']
      },
      { name: 'diskutieren', definition: 'sich im Gespräch argumentativ mit einem Thema oder einer Fragestellung auseinandersetzen', afb: ['II', 'III'] },
      {
        name: 'erörtern',
        definition:
          'auf der Grundlage einer Materialanalyse oder -auswertung eine These oder Problemstellung unter Abwägung von Argumenten hinterfragen und zu einem begründeten Urteil gelangen',
        afb: ['II', 'III']
      },
      { name: 'in Beziehung setzen', definition: 'Zusammenhänge unter vorgegebenen oder selbstgewählten Gesichtspunkten herstellen', afb: ['II', 'III'] },
      {
        name: 'präsentieren',
        definition: 'vorbereitete Informationen zu einem Thema strukturiert, mediengestützt und adressatengerecht vortragen',
        afb: ['II', 'III']
      },
      {
        name: 'Stellung nehmen',
        definition: 'zu einzelnen Meinungen, Textaussagen oder Problemstellungen fundierte, differenzierte und eigene wertende Standpunkte formulieren',
        afb: ['II', 'III']
      },
      {
        name: 'überarbeiten',
        definition: 'eigene oder fremde Produkte kriteriengeleitet analysieren und mit Qualitätsgewinn weiterentwickeln',
        afb: ['II', 'III']
      },
      { name: 'vergleichen', definition: 'Unterschiede, Ähnlichkeiten oder Gemeinsamkeiten herausarbeiten, gegenüberstellen und abwägen', afb: ['II', 'III'] },
      {
        name: 'erläutern',
        definition: 'Sachverhalte, Textaussagen, Zusammenhänge oder Problemstellungen mit zusätzlichen Informationen und Beispielen veranschaulichen',
        afb: ['III']
      },
      {
        name: 'interpretieren',
        definition:
          'Sinnzusammenhänge auf der Grundlage einer Analyse im Ganzen oder aspektorientiert erschließen und unter Einbeziehung der Wechselwirkung zwischen Inhalt, Form und Sprache zu einer schlüssigen (Gesamt-)Deutung kommen',
        afb: ['III']
      },
      {
        name: 'prüfen',
        definition: 'Aussagen und Behauptungen kritisch hinterfragen und die Gültigkeit kriterienorientiert und begründet einschätzen',
        afb: ['III']
      },
      {
        name: 'sich auseinandersetzen mit',
        definition: 'Themen oder Sachverhalte kritisch, differenziert, argumentativ und urteilend abwägen, reflektieren',
        afb: ['III']
      },
      {
        name: 'entwerfen',
        definition: 'zu einer pragmatischen oder literarischen Vorlage nach vorhergehender Analyse ein Konzept oder eine eigene Produktion entwickeln',
        afb: ['I', 'II', 'III']
      },
      {
        name: 'gestalten',
        definition: 'Ergebnisse kreativ in Text- und Medienprodukten oder in szenischen Darstellungsformen inhaltlich und sprachlich produktiv umsetzen',
        afb: ['I', 'II', 'III']
      },
      {
        name: 'verfassen',
        definition:
          'wesentliche Aspekte von Sachverhalten oder Problemen in informierender oder argumentierender Form adressatenbezogen und zielorientiert darlegen',
        afb: ['I', 'II', 'III']
      }
    ],
    hinweis:
      'ACHTUNG: Dies ist die ANHÖRFASSUNG vom Oktober 2024. Eine Endfassung wurde nicht gefunden – die Liste kann sich noch ändern. Sie steht nicht in der Datenbank „Curriculare Vorgaben", sondern nur auf mk.niedersachsen.de; dort liegt sie schulformübergreifend für alle Schulformen des Sekundarbereichs I. Sie ist deutlich breiter als die Abiturliste: „aufzählen", „anwenden", „auswerten", „diskutieren", „erklären", „erschließen", „erzählen", „gliedern", „präsentieren", „prüfen" und „überarbeiten" gibt es nur hier. Auch die Anforderungsbereiche weichen ab – „erläutern" ist hier AFB III, im Abitur II/III; „analysieren" hier II/III, im Abitur I/II/III. Die Quelle sagt selbst: „Es erfolgt nicht immer eine strikte Zuordnung von Operatoren zu einem einzelnen Anforderungsbereich."'
  },
  {
    stateId: 'NI',
    fach: 'geschichte',
    stufe: 'sek1',
    schulformen: ['hauptschule', 'realschule', 'oberschule'],
    quelle: 'Kerncurriculum Geschichte, Hauptschule / Realschule / Oberschule, Abschnitt „Operatoren"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=191',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'genauEiner',
    afbUebernommen: true,
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      {
        name: 'aufzeigen',
        synonyme: ['beschreiben'],
        definition: 'historische Sachverhalte unter Beibehaltung des Sinnes auf Wesentliches reduzieren',
        afb: ['I']
      },
      { name: 'benennen', synonyme: ['nennen', 'kennen'], definition: 'zielgerichtet Informationen zusammentragen, ohne diese zu kommentieren', afb: ['I'] },
      { name: 'darstellen', definition: 'historische Entwicklungszusammenhänge und Zustände beschreiben', afb: ['I'] },
      { name: 'durchführen', definition: 'ein vorgegebenes Verfahren zur Erschließung historischer Sachverhalte anwenden', afb: ['I'] },
      { name: 'Informationen entnehmen', definition: 'gezielte Fragen an eine Quelle richten und die Ergebnisse benennen', afb: ['I'] },
      {
        name: 'schildern',
        synonyme: ['skizzieren', 'nachvollziehen'],
        definition: 'historische Sachverhalte, Probleme oder Aussagen erkennen und zutreffend formulieren',
        afb: ['I']
      },
      {
        name: 'analysieren',
        synonyme: ['untersuchen', 'erkennen', 'sich erschließen'],
        definition: 'Materialien oder historische Sachverhalte kriterienorientiert oder aspektgeleitet erschließen und in Zusammenhänge einordnen',
        afb: ['II']
      },
      {
        name: 'charakterisieren',
        synonyme: ['begreifen'],
        definition: 'historische Sachverhalte in ihren Eigenarten beschreiben und diese dann unter einem bestimmten Gesichtspunkt zusammenfassen',
        afb: ['II']
      },
      {
        name: 'begründen',
        synonyme: ['nachweisen'],
        definition: 'Aussagen durch Argumente stützen, die auf historischen Beispielen und anderen Belegen gründen',
        afb: ['II']
      },
      {
        name: 'einordnen',
        synonyme: ['ordnen', 'zuordnen'],
        definition: 'einen oder mehrere Sachverhalte in einen begründeten Zusammenhang stellen (räumlich/zeitlich)',
        afb: ['II']
      },
      {
        name: 'herausarbeiten',
        synonyme: ['erarbeiten', 'erforschen', 'Spuren finden'],
        definition:
          'aus Materialien bestimmte historische Sachverhalte herausfinden, die nicht explizit genannt werden, und Zusammenhänge zwischen ihnen herstellen',
        afb: ['II']
      },
      { name: 'erklären', definition: 'Sachverhalte durch Wissen und Einsichten in einen Zusammenhang einordnen und begründen', afb: ['II'] },
      { name: 'erläutern', definition: 'wie „erklären", aber durch zusätzliche Informationen und Beispiele verdeutlichen', afb: ['II'] },
      { name: 'gegenüberstellen', definition: 'wie „skizzieren", aber zusätzlich argumentierend gewichten', afb: ['II'] },
      {
        name: 'präsentieren',
        definition: 'einen Sachverhalt nach vorgegebenen oder selbst gewählten Kriterien sachangemessen und adressatengerecht vorstellen',
        afb: ['II']
      },
      { name: 'unterscheiden', definition: 'Feststellen von Unterschieden zwischen zwei Sachverhalten', afb: ['II'] },
      { name: 'argumentieren', definition: 'Beweise und Argumente darlegen und dadurch eine Meinung untermauern', afb: ['III'] },
      {
        name: 'bewerten',
        synonyme: ['wahrnehmen', 'würdigen'],
        definition:
          'den Stellenwert historischer Sachverhalte in einem Zusammenhang bestimmen und dabei eigene Wertmaßstäbe offenlegen; unter Berücksichtigung von Pluralität und den Wertvorstellungen des Grundgesetzes zu einem Werturteil gelangen',
        afb: ['III']
      },
      {
        name: 'beurteilen',
        synonyme: ['deuten'],
        definition:
          'den Stellenwert historischer Sachverhalte in einem Zusammenhang bestimmen, um ohne persönlichen Wertebezug zu einem begründeten Sachurteil zu gelangen',
        afb: ['III']
      },
      {
        name: 'diskutieren',
        synonyme: ['sich auseinandersetzen', 'erörtern'],
        definition: 'zu einer historischen Problemstellung oder These eine Argumentation entwickeln, die zu einer begründeten Bewertung führt',
        afb: ['III']
      },
      { name: 'entwickeln', definition: 'gewonnene Analyseergebnisse synthetisieren, um zu einer eigenen Deutung zu gelangen', afb: ['III'] },
      {
        name: 'Fragen stellen',
        synonyme: ['vermuten'],
        definition: 'eigene Hypothesen zu historischen Sachverhalten und Problemen aufstellen und überprüfen',
        afb: ['III']
      },
      {
        name: 'interpretieren',
        definition:
          'Sinnzusammenhänge aus Quellen erschließen und eine begründete Stellungnahme abgeben, die auf einer Analyse, Erläuterung und Bewertung beruht',
        afb: ['III']
      },
      { name: 'überprüfen', synonyme: ['prüfen'], definition: 'Aussagen an historischen Sachverhalten auf ihre Angemessenheit hin untersuchen', afb: ['III'] },
      {
        name: 'vergleichen',
        definition:
          'auf der Grundlage von Kriterien historische Sachverhalte problembezogen gegenüberstellen, um Gemeinsamkeiten, Unterschiede, Ähnlichkeiten oder Gegensätze zu beurteilen',
        afb: ['III']
      }
    ],
    hinweis:
      'Diese Liste gilt an Hauptschule, Realschule und Oberschule und ist in allen drei Kerncurricula WORTGLEICH. Sie unterscheidet sich erheblich von der Abiturliste: Sie ordnet jedem Operator GENAU EINEN Anforderungsbereich zu, fasst viele Operatoren zu Synonymgruppen zusammen („analysieren/untersuchen/erkennen/sich erschließen") und kennt Operatoren, die es sonst nicht gibt – „Informationen entnehmen", „Fragen stellen", „argumentieren", „durchführen". Achtung bei den Anforderungsbereichen: „erläutern" ist hier AFB II, „vergleichen" AFB III – im Abitur liegt „vergleichen" bei II–III.'
  },
  {
    stateId: 'NI',
    fach: 'erdkunde',
    stufe: 'sek1',
    schulformen: ['hauptschule', 'realschule', 'oberschule'],
    quelle: 'Kerncurriculum Erdkunde, Hauptschule / Realschule / Oberschule, Anhang „Operatoren"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=114',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'genauEiner',
    afbUebernommen: true,
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      {
        name: 'Befragungen',
        synonyme: ['Erkundungen', 'Versuche durchführen'],
        definition: 'Sachverhalte kriterienorientiert erschließen und wiedergeben',
        afb: ['I']
      },
      { name: '(be-)nennen', definition: 'Sachverhalte ohne Erläuterung angeben', afb: ['I'] },
      { name: 'beschreiben', definition: 'gesetzmäßige und raumspezifische Sachverhalte aus Materialien strukturiert darlegen', afb: ['I'] },
      { name: 'Bestimmen eines Standortes', definition: 'die Lage eines Ortes, einer Person oder eines Gegenstandes feststellen', afb: ['I'] },
      {
        name: 'darlegen',
        synonyme: ['darstellen', 'aufzeigen'],
        definition: 'Sachverhalte detailliert und fachsprachlich oder grafisch angemessen aufzeigen',
        afb: ['I']
      },
      {
        name: 'gliedern',
        definition: 'einen Raum oder einen Sachverhalt nach selbst gewählten oder vorgegebenen Kriterien systematisierend ordnen',
        afb: ['I']
      },
      {
        name: 'Informationen gewinnen',
        synonyme: ['entnehmen aus'],
        definition: 'gezielte Fragen an eine Quelle richten und die Ergebnisse benennen',
        afb: ['I']
      },
      {
        name: 'wiedergeben',
        definition: 'bekannte Sachverhalte oder einem Material entnommene Informationen mit eigenen Worten unkommentiert zusammenfassen',
        afb: ['I']
      },
      { name: 'zeichnen', definition: 'geographische Sachverhalte in einfacher Form grafisch darstellen', afb: ['I'] },
      {
        name: 'analysieren',
        definition: 'ein Ganzes (z. B. einen Raum) nach bekannten Ordnungsmerkmalen aufgliedern und systematisch untersuchen',
        afb: ['II']
      },
      {
        name: 'auswerten',
        definition:
          'inhaltliche Schwerpunkte eines Sachverhalts oder einer geographischen Quelle (z. B. Karte) aufzeigen und sprachlich so darstellen, dass sich eine klare Aussage ergibt',
        afb: ['II']
      },
      { name: 'charakterisieren', definition: 'geographische Sachverhalte in ihren Eigenarten beschreiben und typische Merkmale kennzeichnen', afb: ['II'] },
      { name: 'einordnen', synonyme: ['zuordnen'], definition: 'Sachverhalte in einen systematischen Zusammenhang einfügen', afb: ['II'] },
      { name: 'erklären', definition: 'Sachverhalte so darstellen, dass Bedingungen, Ursachen und Gesetzmäßigkeiten verständlich werden', afb: ['II'] },
      {
        name: 'erläutern',
        definition: 'Sachverhalte in ihren komplexen Beziehungen verdeutlichen (auf der Grundlage von Kenntnissen bzw. Materialanalyse)',
        afb: ['II', 'III']
      },
      { name: 'kartieren', definition: 'geographische Sachverhalte im Realraum nach vorgegebenen Kriterien in thematischen Karten darstellen', afb: ['II'] },
      {
        name: 'präsentieren',
        definition: 'einen geographischen Sachverhalt nach vorgegebenen oder selbst gewählten Kriterien sachangemessen und adressatengerecht vorstellen',
        afb: ['II']
      },
      { name: 'unterscheiden', definition: 'Feststellen von Unterschieden zwischen zwei Sachverhalten', afb: ['II'] },
      { name: 'vergleichen', definition: 'Gemeinsamkeiten und Unterschiede von geographischen Sachverhalten erkennen und darlegen', afb: ['II'] },
      {
        name: 'vorstellen',
        definition: 'einen geographischen Sachverhalt nach vorgegebenen oder selbst gewählten Kriterien angemessen präsentieren',
        afb: ['II']
      },
      { name: 'argumentieren', synonyme: ['begründen'], definition: 'Beweise und Argumente darlegen und dadurch eine Meinung untermauern', afb: ['III'] },
      {
        name: 'beurteilen',
        definition:
          'begründete Aussagen über die Richtigkeit, Wahrscheinlichkeit, Angemessenheit bzw. Anwendbarkeit eines Sachverhalts machen, ohne persönlich Stellung zu nehmen',
        afb: ['III']
      },
      { name: 'bewerten', definition: 'einen Sachverhalt anhand von Beurteilungskriterien und einem persönlichen Wertebezug messen', afb: ['III'] },
      {
        name: 'diskutieren',
        synonyme: ['erörtern'],
        definition:
          'zu einer These oder Problemstellung eine Kette von Argumenten vortragen, auf ihren Wert und ihre Stichhaltigkeit überprüfen und auf Gegenargumente eingehen',
        afb: ['III']
      },
      {
        name: 'entwickeln',
        definition:
          'einen Sachverhalt nach vorherigem Untersuchen, Analysieren und Einschätzen schrittweise in eine weiterführende Betrachtung heben und eine begründete, realistische Perspektive formulieren',
        afb: ['III']
      },
      {
        name: 'interpretieren',
        definition:
          'Ursachen/Gründe/Bedingungen für bestimmte Erscheinungen/Entwicklungen herausstellen und dabei Zusammenhänge verdeutlichen sowie eigene Schlussfolgerungen ziehen',
        afb: ['III']
      },
      {
        name: 'Stellung nehmen',
        definition: 'zu einem Sachverhalt bzw. einer Behauptung differenziert argumentierend eine eigene Meinung äußern',
        afb: ['III']
      }
    ],
    hinweis:
      'Die drei Kerncurricula für Hauptschule, Realschule und Oberschule sind bis auf Kleinigkeiten gleich: Der Operator zum Standort heißt einmal „Bestimmen eines Standortes", einmal „einen Standort bestimmen" und einmal „Standorte bestimmen"; „entwickeln" fehlt in der Oberschulfassung. Übernommen ist die Realschulfassung. BESONDERHEIT: Das Kerncurriculum führt „erläutern" DOPPELT – unter AFB II und AFB III – mit wortgleicher Aussage in umgestellter Reihenfolge. Auf Entscheidung der Lehrkraft gibt die App beide Anforderungsbereiche an und übernimmt die Definition aus AFB II. Gegenüber dem Gymnasium fällt auf: „vergleichen" ist hier AFB II, „interpretieren" und „entwickeln" sind AFB III.'
  },
  {
    stateId: 'NI',
    fach: 'geschichte',
    stufe: 'sek1',
    schulformen: ['gymnasium', 'integrierte-gesamtschule'],
    quelle: 'Kerncurriculum Geschichte, Gymnasium Schuljahrgänge 5–10, Anhang „Operatoren"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=62',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'genauEiner',
    afbUebernommen: true,
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: '(be-)nennen', definition: 'Informationen ohne Kommentierung angeben', afb: ['I'] },
      { name: 'beschreiben', definition: 'strukturiert und fachsprachlich angemessen Materialien und/oder Sachverhalte vorstellen', afb: ['I'] },
      {
        name: 'gliedern',
        definition: 'einen Raum, eine Zeit, oder einen Sachverhalt nach selbst gewählten oder vorgegebenen Kriterien systematisierend ordnen',
        afb: ['I']
      },
      {
        name: 'wiedergeben',
        definition:
          'Kenntnisse (Sachverhalte, Fachbegriffe, Daten, Fakten, Modelle) und/oder (Teil-)Aussagen mit eigenen Worten sprachlich distanziert, strukturiert und damit unkommentiert darstellen',
        afb: ['I']
      },
      {
        name: 'zusammenfassen',
        definition: 'Sachverhalte auf wesentliche Aspekte reduzieren und sprachlich distanziert strukturiert und unkommentiert wiedergeben',
        afb: ['I']
      },
      {
        name: 'analysieren',
        definition: 'Materialien, Sachverhalte oder Räume kriterienorientiert oder aspektgeleitet erschließen und strukturiert darstellen',
        afb: ['II']
      },
      {
        name: 'charakterisieren',
        definition:
          'Sachverhalte in ihren Eigenarten beschreiben, typische Merkmale kennzeichnen und diese dann gegebenenfalls unter einem oder mehreren bestimmten Gesichtspunkten zusammenführen',
        afb: ['II']
      },
      {
        name: 'einordnen',
        definition: 'begründet eine Position/Material zuordnen oder einen Sachverhalt begründet in einen Zusammenhang stellen',
        afb: ['II']
      },
      {
        name: 'erklären',
        definition:
          'Sachverhalte so darstellen – gegebenenfalls mit Theorien und Modellen –, dass Bedingungen, Ursachen, Gesetzmäßigkeiten und/oder Funktionszusammenhänge verständlich werden',
        afb: ['II']
      },
      {
        name: 'erläutern',
        definition:
          'Sachverhalte in ihren komplexen Beziehungen an Beispielen und/oder Theorien verdeutlichen (auf Grundlage von Kenntnissen bzw. Materialanalyse)',
        afb: ['II']
      },
      {
        name: 'herausarbeiten',
        definition:
          'Materialien auf bestimmte, explizit nicht unbedingt genannte Sachverhalte hin untersuchen und Zusammenhänge zwischen den Sachverhalten herstellen',
        afb: ['II']
      },
      {
        name: 'in Beziehung setzen',
        definition: 'Zusammenhänge zwischen Materialien, Sachverhalten aspektgeleitet und kriterienorientiert herstellen und erläutern',
        afb: ['II']
      },
      { name: 'nachweisen', definition: 'Materialien auf Bekanntes hin untersuchen und belegen', afb: ['II'] },
      { name: 'vergleichen', definition: 'Gemeinsamkeiten, Ähnlichkeiten und Unterschiede von Sachverhalten kriterienorientiert darlegen', afb: ['II'] },
      {
        name: 'beurteilen',
        definition:
          'den Stellenwert von Sachverhalten oder Prozessen in einem Zusammenhang überprüfen, um kriterienorientiert zu einem begründeten Sachurteil zu gelangen',
        afb: ['III']
      },
      {
        name: 'entwickeln',
        definition:
          'zu einem Sachverhalt oder zu einer Problemstellung eine Einschätzung, ein konkretes Lösungsmodell, eine Gegenposition oder ein Lösungskonzept inhaltlich weiterführend und/oder zukunftsorientiert darlegen',
        afb: ['III']
      },
      {
        name: 'erörtern',
        definition:
          'zu einer vorgegebenen Problemstellung eine reflektierte, abwägende Auseinandersetzung führen und zu einem begründeten Sach- und/oder Werturteil kommen',
        afb: ['III']
      },
      {
        name: 'Stellung nehmen',
        definition:
          'Beurteilung mit zusätzlicher Reflexion individueller, sachbezogener und/ oder die Pluralität gewährleistender politischer Wertmaßstäbe, die zu einem begründeten eigenen Werturteil führt',
        afb: ['III']
      },
      {
        name: 'überprüfen',
        definition:
          'Inhalte, Sachverhalte, Vermutungen oder Hypothesen auf der Grundlage eigener Kenntnisse oder mithilfe zusätzlicher Materialien auf ihre sachliche Richtigkeit bzw. auf ihre innere Logik hin untersuchen',
        afb: ['III']
      },
      {
        name: 'interpretieren',
        definition:
          'Sinnzusammenhänge aus Quellen erschließen und eine begründete Stellungnahme abgeben, die auf einer Analyse, Erläuterung und Bewertung beruht A5',
        afb: ['I', 'II', 'III']
      }
    ],
    hinweis:
      'Das Kerncurriculum ordnet jedem Operator GENAU EINEN Anforderungsbereich zu – mit einer ausdrücklichen Ausnahme: „interpretieren" steht dort als „Operator, der Leistungen in allen drei Anforderungsbereichen verlangt". Gegenüber der Abiturliste fehlen „gegenüberstellen" und „sich auseinandersetzen"; dafür gibt es „gliedern" und „nachweisen". Das Dokument führt denselben Bestand zusätzlich zweisprachig (Englisch/Französisch) für das bilinguale Sachfach.'
  },
  {
    stateId: 'NI',
    fach: 'erdkunde',
    stufe: 'sek1',
    schulformen: ['gymnasium', 'integrierte-gesamtschule'],
    quelle: 'Kerncurriculum Erdkunde, Gymnasium Schuljahrgänge 5–10, Anhang „Operatoren"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=61',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'genauEiner',
    afbUebernommen: true,
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: '(be-)nennen', definition: 'Informationen ohne Kommentierung angeben', afb: ['I'] },
      { name: 'beschreiben', definition: 'strukturiert und fachsprachlich angemessen Materialien und/oder Sachverhalte darstellen', afb: ['I'] },
      { name: 'darstellen', definition: 'Sachverhalte detailliert und fachsprachlich angemessen aufzeigen', afb: ['I'] },
      {
        name: 'gliedern',
        definition: 'einen Raum, eine Zeit, oder einen Sachverhalt nach selbst gewählten oder vorgegebenen Kriterien systematisierend ordnen',
        afb: ['I']
      },
      {
        name: 'wiedergeben',
        definition:
          'Kenntnisse (Sachverhalte, Fachbegriffe, Daten, Fakten, Modelle) und/oder (Teil-)Aussagen mit eigenen Worten sprachlich distanziert, strukturiert und damit unkommentiert darstellen',
        afb: ['I']
      },
      {
        name: 'zusammenfassen',
        definition: 'Sachverhalte auf wesentliche Aspekte reduzieren und sprachlich distanziert strukturiert und unkommentiert wiedergeben',
        afb: ['I']
      },
      {
        name: 'analysieren',
        definition: 'Materialien, Sachverhalte oder Räume kriterienorientiert oder aspektgeleitet erschließen und strukturiert darstellen',
        afb: ['II']
      },
      {
        name: 'charakterisieren',
        definition:
          'Sachverhalte in ihren Eigenarten beschreiben, typische Merkmale kennzeichnen und diese dann gegebenenfalls unter einem oder mehreren bestimmten Gesichtspunkten zusammenführen',
        afb: ['II']
      },
      {
        name: 'einordnen',
        synonyme: ['zuordnen'],
        definition: 'begründet Material zuordnen oder eine Position/einen Sachverhalt begründet in einen Zusammenhang stellen',
        afb: ['II']
      },
      {
        name: 'erklären',
        definition:
          'Sachverhalte so darstellen – gegebenenfalls mit Theorien und Modellen –, dass Bedingungen, Ursachen, Gesetzmäßigkeiten und/oder Funktionszusammenhänge verständlich werden',
        afb: ['II']
      },
      {
        name: 'erläutern',
        definition:
          'Sachverhalte in ihren komplexen Beziehungen an Beispielen und/oder Theorien verdeutlichen (auf der Grundlage von Kenntnissen bzw. Materialanalyse)',
        afb: ['II']
      },
      { name: 'vergleichen', definition: 'Gemeinsamkeiten, Ähnlichkeiten und Unterschiede von Sachverhalten kriterienorientiert darlegen', afb: ['II'] },
      { name: 'begründen', definition: 'Komplexe Grundgedanken durch Argumente stützen und nachvollziehbare Zusammenhänge herstellen', afb: ['III'] },
      {
        name: 'beurteilen',
        definition:
          'den Stellenwert von Sachverhalten oder Prozessen in einem Zusammenhang überprüfen, um kriterienorientiert zu einem begründeten Sachurteil zu gelangen',
        afb: ['III']
      },
      {
        name: 'entwickeln',
        definition:
          'zu einem Sachverhalt oder zu einer Problemstellung eine Einschätzung, ein konkretes Lösungsmodell, eine Gegenposition oder ein Lösungskonzept inhaltlich weiterführend und/oder zukunftsorientiert darlegen',
        afb: ['III']
      },
      {
        name: 'erörtern',
        definition:
          'zu einer vorgegebenen Problemstellung eine reflektierte, abwägende Auseinandersetzung führen und zu einem begründeten Sach- und/oder Werturteil kommen',
        afb: ['III']
      },
      {
        name: 'Stellung nehmen',
        definition:
          'Beurteilung mit zusätzlicher Reflexion individueller, sachbezogener und/ oder politischer Wertmaßstäbe, die Pluralität gewährleistet und zu einem begründeten eigenen Werturteil führt',
        afb: ['III']
      }
    ],
    hinweis:
      'Deutlich kürzer als die Liste der Haupt-, Real- und Oberschulen: Die fachspezifischen Operatoren „kartieren", „Informationen gewinnen", „Bestimmen eines Standortes" und „interpretieren" fehlen hier. Dafür weicht die Einstufung ab – „vergleichen" ist am Gymnasium AFB II wie an den übrigen Schulformen, „begründen" dagegen AFB III. Das Kerncurriculum führt für den bilingualen Unterricht zusätzlich englische und französische Entsprechungen, gegliedert nach Erkenntnisgewinnung, Kommunikation und Beurteilung.'
  },
  {
    stateId: 'NI',
    fach: 'politik',
    stufe: 'sek1',
    schulformen: ['hauptschule', 'realschule', 'oberschule'],
    quelle: 'Kerncurriculum Politik, Hauptschule / Realschule / Oberschule, Anhang „Operatoren"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=70',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'genauEiner',
    afbUebernommen: true,
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      {
        name: 'aufzählen',
        synonyme: ['nennen', 'wiedergeben', 'zusammenfassen'],
        definition: 'Kenntnisse (Fachbegriffe, Daten, Fakten, Modelle) und Aussagen in komprimierter Form unkommentiert darstellen',
        afb: ['I']
      },
      { name: 'benennen', synonyme: ['bezeichnen'], definition: 'Sachverhalte, Strukturen und Prozesse begrifflich präzise aufführen', afb: ['I'] },
      {
        name: 'beschreiben',
        synonyme: ['darlegen', 'darstellen'],
        definition: 'Wesentliche Aspekte eines Sachverhalts im logischen Zusammenhang unter Verwendung der Fachbegriffe wiedergeben',
        afb: ['I']
      },
      { name: 'analysieren', definition: 'Materialien oder Sachverhalte am Politikzyklus orientiert erschließen', afb: ['II'] },
      { name: 'auswerten', definition: 'Daten oder Einzelergebnisse zu einer abschließenden Gesamtaussage zusammenführen', afb: ['II'] },
      {
        name: 'charakterisieren',
        definition: 'Sachverhalte in ihren Eigenarten beschreiben und diese dann unter einem bestimmten Gesichtspunkt zusammenführen',
        afb: ['II']
      },
      { name: 'einordnen', definition: 'Eine Position zuordnen oder einen Sachverhalt in einen Zusammenhang stellen', afb: ['II'] },
      {
        name: 'erklären',
        definition:
          'Sachverhalte durch Wissen und Einsichten in einen Zusammenhang (Theorie, Modell, Regel, Gesetz, Funktionszusammenhang) einordnen und deuten',
        afb: ['II']
      },
      { name: 'erläutern', definition: 'Wie „erklären“, aber durch zusätzliche Informationen und Beispiele verdeutlichen', afb: ['II'] },
      {
        name: 'herausarbeiten',
        synonyme: ['ermitteln', 'erschließen'],
        definition:
          'Aus Materialien bestimmte Sachverhalte herausfinden, auch wenn wie nicht explizit genannt werden, und Zusammenhänge zwischen ihnen herstellen',
        afb: ['II']
      },
      { name: 'interpretieren', definition: 'Sinnzusammenhänge aus Materialien erschließen', afb: ['II'] },
      { name: 'vergleichen', definition: 'Sachverhalte gegenüberstellen, um Gemeinsamkeiten, Ähnlichkeiten und Unterschiede herauszufinden', afb: ['II'] },
      { name: 'widerlegen', definition: 'Argumente anführen, dass Daten, eine Behauptung, ein Konzept oder eine Position nicht haltbar sind', afb: ['II'] },
      {
        name: 'begründen',
        definition: 'Zu einem Sachverhalt komplexe Grundgedanken unter dem Aspekt der Kausalität argumentativ und schlüssig entwickeln',
        afb: ['III']
      },
      {
        name: 'beurteilen',
        definition:
          'Den Stellenwert von Sachverhalten oder Prozessen in einem Zusammenhang bestimmen, um kriterienorientiert zu einem begründeten Urteil zu gelangen',
        afb: ['III']
      },
      {
        name: 'bewerten',
        synonyme: ['Stellung nehmen'],
        definition:
          'Wie „beurteilen“, aber zusätzlich mit individuellen und politischen Wertmaßstäben reflektieren und zu einem begründeten eigenen Urteil kommen',
        afb: ['III']
      },
      { name: 'entwerfen', definition: 'Ein Konzept in seinen wesentlichen Zügen erstellen', afb: ['III'] },
      {
        name: 'entwickeln',
        definition:
          'Zu einem Sachverhalt oder zu einer Problemstellung ein konkretes Lösungsmodell, eine Gegenposition, ein Lösungskonzept oder einen Regelungsentwurf begründend skizzieren',
        afb: ['III']
      },
      {
        name: 'erörtern',
        definition:
          'Zu einer vorgegebenen Problemstellung eine reflektierte, kontroverse Auseinandersetzung führen und zu einer abschließenden, begründeten Bewertung gelangen',
        afb: ['III']
      },
      {
        name: 'gestalten',
        definition: 'Aufgabenstellungen produktorientiert bearbeiten; dazu zählt unter anderem das Entwerfen eigener Handlungsvorschläge und Modelle',
        afb: ['III']
      },
      { name: 'problematisieren', definition: 'Widersprüche herausarbeiten sowie Positionen oder Theorien begründend hinterfragen', afb: ['III'] },
      {
        name: 'prüfen',
        synonyme: ['überprüfen'],
        definition:
          'Inhalte, Sachverhalte, Vermutungen oder Hypothesen auf der Grundlage eigener Kenntnisse oder mithilfe zusätzlicher Materialien auf ihre sachliche Richtigkeit bzw. auf ihre innere Logik untersuchen',
        afb: ['III']
      },
      {
        name: 'sich auseinandersetzen',
        synonyme: ['diskutieren'],
        definition:
          'Zu einem Sachverhalt, zu einem Konzept, zu einer Problemstellung oder zu einer These eine Argumentation entwickeln, die zu einer begründeten Bewertung führt',
        afb: ['III']
      }
    ],
    hinweis:
      'Die Liste arbeitet stark mit Synonymgruppen: „aufzählen/nennen/wiedergeben/zusammenfassen" teilen sich eine Definition, ebenso „herausarbeiten/ermitteln/erschließen" und „bewerten/Stellung nehmen". Fachtypisch ist „analysieren", das ausdrücklich „am Politikzyklus orientiert" erschließen heißt. Nur hier gibt es „widerlegen", „problematisieren" und „gestalten" als eigene Operatoren. Achtung: „interpretieren" ist hier AFB II – in Geschichte an denselben Schulformen ist es AFB III.'
  },
  {
    stateId: 'NI',
    fach: 'werte-und-normen',
    stufe: 'sek1',
    quelle: 'Kerncurriculum Werte und Normen, Sekundarbereich I, Anhang „Operatoren"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=129',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'genauEiner',
    afbUebernommen: true,
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: 'benennen', definition: 'Begriffe oder Sachverhalte ohne nähere Erläuterung aufzählen', afb: ['I'] },
      { name: 'beschreiben', synonyme: ['darstellen'], definition: 'Sachverhalte und Zusammenhänge strukturiert mit eigenen Worten wiedergeben', afb: ['I'] },
      { name: 'skizzieren', definition: 'Sachverhalte auf das Wesentliche reduziert übersichtlich darstellen', afb: ['I'] },
      {
        name: 'wiedergeben',
        definition: 'einen Sachverhalt oder Gedankengang in seinen Grundzügen unter Verwendung fachsprachlicher Grundbegriffe ausdrücken',
        afb: ['I']
      },
      { name: 'zusammenfassen', definition: 'das Wesentliche in konzentrierter Form herausstellen', afb: ['I'] },
      {
        name: 'analysieren',
        synonyme: ['untersuchen'],
        definition: 'wichtige Bestandteile eines Textes oder Zusammenhangs auf eine bestimmte Fragestellung hin herausarbeiten',
        afb: ['II']
      },
      { name: 'vergleichen', synonyme: ['gegenüberstellen'], definition: 'Gemeinsamkeiten, Ähnlichkeiten und Unterschiede ermitteln', afb: ['II'] },
      {
        name: 'einordnen',
        synonyme: ['in einen Zusammenhang einordnen'],
        definition: 'einen Sachverhalt mit erläuternden Hinweisen in einen Zusammenhang einfügen',
        afb: ['II']
      },
      {
        name: 'sich auseinandersetzen',
        definition: 'zu einem Sachverhalt ein selbstständiges Urteil unter Verwendung von Fachwissen und Fachmethoden begründet formulieren',
        afb: ['II']
      },
      { name: 'erklären', definition: 'einen Sachverhalt nachvollziehbar und verständlich machen', afb: ['II'] },
      { name: 'herausarbeiten', definition: 'aus Materialien Sachverhalte herausfinden, die nicht explizit genannt werden', afb: ['II'] },
      { name: 'einen Argumentationsgang wiedergeben', definition: 'einen Argumentationsgang strukturiert zusammenfassen', afb: ['II'] },
      { name: 'erläutern', definition: 'einen Sachverhalt veranschaulichend darstellen und durch zusätzliche Informationen verständlich machen', afb: ['II'] },
      { name: 'in Beziehung setzen', definition: 'Zusammenhänge unter vorgegebenen oder selbst gewählten Gesichtspunkten begründet herstellen', afb: ['II'] },
      { name: 'belegen', synonyme: ['nachweisen'], definition: 'Aussagen durch Textstellen oder bekannte Sachverhalte stützen', afb: ['II'] },
      {
        name: 'erörtern',
        synonyme: ['diskutieren'],
        definition:
          'eine These oder Problemstellung in Form einer Gegenüberstellung von Argumenten untersuchen und mit einer begründeten Stellungnahme bewerten',
        afb: ['III']
      },
      { name: 'reflektieren', definition: 'Konzeptionen, Lösungen und Positionierungen mit einer kritischen Distanz überdenken', afb: ['III'] },
      { name: 'begründen', definition: 'einen Sachverhalt oder eine Aussage durch nachvollziehbare Argumente stützen', afb: ['III'] },
      { name: 'entwickeln', definition: 'gewonnene Analyseergebnisse synthetisieren, um zu einer eigenen Deutung zu gelangen', afb: ['III'] },
      { name: 'prüfen', definition: 'Aussagen auf ihre Angemessenheit hin untersuchen', afb: ['III'] },
      {
        name: 'Stellung nehmen',
        definition:
          'zu einem Sachverhalt ein selbstständiges Werturteil unter Verwendung von Fachwissen und durch Offenlegung von Wertmaßstäben begründet formulieren Die neuen Prüfungsformen erfordern ggf. neue Operatoren. Diese können alle drei',
        afb: ['III']
      },
      { name: 'debattieren', definition: 'in einem Streitgespräch kontroverse Positionen nach vorgegebenen Regeln vertreten', afb: ['I', 'II', 'III'] },
      {
        name: 'gestalten',
        synonyme: ['entwerfen'],
        definition:
          'Aufgaben auf der Grundlage von Textkenntnissen und Sachwissen gestaltend interpretieren Die Operatoren orientieren sich weitgehend an den „Einheitlichen Prüfungsanforderungen in der Abiturprüfung Ethik“.',
        afb: ['I', 'II', 'III']
      },
      {
        name: 'beurteilen',
        definition: 'zu einem Sachverhalt ein selbstständiges Urteil unter Verwendung von Fachwissen und Fachmethoden begründet formulieren',
        afb: ['III']
      }
    ],
    hinweis:
      'Besonderheit: „sich auseinandersetzen" steht im Kerncurriculum in ZWEI Anforderungsbereichen – unter AFB II mit der Definition „eine These oder Problemstellung in Form einer Gegenüberstellung von Argumenten untersuchen …", unter AFB III zusammen mit „beurteilen". Die App führt den Operator unter AFB II und „beurteilen" als eigenen Eintrag unter AFB III. Für die neuen Prüfungsformen nennt das Kerncurriculum zusätzlich „debattieren" sowie „gestalten/entwerfen"; beide können laut Quelle alle drei Anforderungsbereiche umfassen.'
  },
  {
    stateId: 'NI',
    fach: 'kunst',
    stufe: 'sek1',
    schulformen: ['hauptschule', 'realschule', 'oberschule'],
    quelle: 'Kerncurriculum Kunst, Hauptschule / Realschule / Oberschule, Anhang „Operatoren für das Fach Kunst"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=39',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: false,
    anrede: 'sie',
    operatoren: [
      { name: '(be-)nennen', definition: 'Zusammentragen von Informationen und Wiedergabe ohne Erläuterung' },
      {
        name: 'beschreiben',
        definition: 'Wiedergabe von Wahrnehmungen, Beobachtungen und Zusammenhängen strukturiert und fachsprachlich richtig mit eigenen Worten'
      },
      { name: 'wiedergeben', definition: 'Beschreibung/Darstellung eines bild- oder textbezogenen Sachverhalts' },
      {
        name: 'darstellen',
        definition: 'Wiedergabe von bild- oder textbezogenen Sachverhalten, Zusammenhängen, Vorstellungen usw. mit (bild-)sprachlichen Mitteln'
      },
      {
        name: 'anwenden',
        synonyme: ['einsetzen', 'verwenden'],
        definition: 'Nutzung von Verfahren, bildnerischen Mitteln, Techniken, Strategien, um bildnerische Aussagen zu erzeugen'
      },
      { name: 'einordnen', synonyme: ['zuordnen'], definition: 'Organisation/Zuweisung (bildsprachlicher) Sachverhalte' },
      { name: 'deuten', definition: 'Nachvollziehbare Erläuterung eines Bildes oder Sachverhalts' },
      { name: 'erläutern', definition: 'Nachvollziehbare Erklärung eines bildsprachlichen und/oder textbezogenen Sachverhalts' },
      { name: 'untersuchen', definition: 'Prüfen von Eigenschaften eines Objektes und Aufzeigen von Beziehungen zwischen Objekten und Sachverhalten' },
      {
        name: 'vergleichen',
        definition: 'Kriterienorientierte Untersuchung und Darstellung von Gemeinsamkeiten, Ähnlichkeiten, Unterschieden in Bild-/Textmaterial'
      },
      { name: 'dokumentieren', definition: 'Festhalten von Ergebnissen oder Prozessen durch (bild-)sprachliche Mittel' },
      { name: 'visualisieren', definition: 'Bildhafte klare Darstellung von Ideen und/oder Zusammenhängen' },
      {
        name: 'skizzieren',
        definition:
          '(Bild-)sprachliches Festhalten eines Eindrucks oder einer Gestaltungsidee, sodass die damit wesentlich verbundene Information vermittelt wird'
      },
      { name: 'entwerfen', definition: 'Erarbeitung einer Gestaltungsidee zu einem konkreten Auftrag' },
      {
        name: 'planen',
        synonyme: ['entwickeln'],
        definition: 'Selbstständige Erarbeitung eines gestalterischen Konzeptes (ggf. nach vorgegebenen Bedingungen)'
      },
      {
        name: 'experimentell erproben',
        definition: 'Anbahnung einer gestalterischen Lösung durch gezielte Versuche mit Material, Technik oder Darstellungsmittel'
      },
      { name: 'umsetzen', definition: 'Realisierung einer Gestaltungsidee' },
      { name: 'verändern', definition: 'Ergänzung und Überarbeitung diverser Objekte' },
      { name: 'verfremden', definition: 'Bekanntes in neuartige und ungewohnte Beziehungen setzen' },
      {
        name: 'hinterfragen',
        synonyme: ['reflektieren'],
        definition: 'Vergleich von Entwürfen oder gestalterischen Lösungen kriterienorientiert mit den Zielsetzungen und Erwägung von Alternativen'
      },
      {
        name: 'beurteilen',
        synonyme: ['bewerten'],
        definition: 'Abgabe einer Stellungnahme zu einem Sachverhalt oder Problem ggf. unter Berücksichtigung von Kriterien'
      }
    ],
    hinweis:
      'OHNE ANFORDERUNGSBEREICHE: Das Kerncurriculum sagt zwar, die Operatoren seien „jeweils einzelnen Anforderungsbereichen zugeordnet", die Zuordnung selbst steht aber in einer Matrix, die sich aus dem PDF nicht zuverlässig auslesen lässt. Die App führt die Operatoren deshalb ohne Anforderungsbereich, statt eine Zuordnung zu erfinden. Auffällig ist der praktische Zuschnitt des Fachs: „umsetzen", „verfremden", „experimentell erproben" und „visualisieren" gibt es in keiner anderen Liste.'
  },
  {
    stateId: 'NI',
    fach: 'franzoesisch',
    stufe: 'sek1',
    quelle: 'Kerncurriculum Französisch für die Schulformen des Sekundarbereichs I, Anhang A1 „Operatoren"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=756',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'du',
    operatoren: [
      { name: 'cocher', definition: 'etwas ankreuzen', teilkompetenz: 'Hörverstehen und Leseverstehen' },
      { name: 'compléter', definition: 'etwas vervollständigen', teilkompetenz: 'Hörverstehen und Leseverstehen' },
      { name: 'mettre dans le bon ordre', definition: 'etwas in die richtige Reihenfolge bringen', teilkompetenz: 'Hörverstehen und Leseverstehen' },
      { name: 'noter', definition: 'etwas notieren', teilkompetenz: 'Hörverstehen und Leseverstehen' },
      { name: 'relier', definition: 'etwas verbinden, zuordnen', teilkompetenz: 'Hörverstehen und Leseverstehen' },
      { name: 'comparer', definition: 'etwas miteinander vergleichen', teilkompetenz: 'Sprechen und Schreiben' },
      { name: 'décrire', definition: 'etwas beschreiben', teilkompetenz: 'Sprechen und Schreiben' },
      { name: 'demander', synonyme: ['poser des questions', 'interviewer'], definition: 'Fragen stellen', teilkompetenz: 'Sprechen' },
      { name: 'discuter', definition: 'etwas diskutieren (und eine Lösung finden)', teilkompetenz: 'Sprechen und Schreiben' },
      { name: 'donner des informations', definition: 'Informationen weitergeben', teilkompetenz: 'Sprechen und Schreiben' },
      { name: 'donner son avis', definition: 'die eigene Meinung zu einem Thema zum Ausdruck bringen', teilkompetenz: 'Sprechen und Schreiben' },
      { name: 'expliquer', definition: 'etwas erklären, erläutern', teilkompetenz: 'Sprechen und Schreiben' },
      { name: 'jouer', definition: 'spielen', teilkompetenz: 'Sprechen' },
      { name: 'parler', definition: 'sprechen', teilkompetenz: 'Sprechen' },
      { name: 'présenter', definition: 'etwas / jemanden vorstellen', teilkompetenz: 'Sprechen und Schreiben' },
      { name: 'raconter', definition: 'etwas (nach-)erzählen', teilkompetenz: 'Sprechen' },
      { name: 'écrire', definition: 'schreiben', teilkompetenz: 'Schreiben' },
      { name: 'faire le portrait de', definition: 'Personen beschreiben', teilkompetenz: 'Schreiben' },
      { name: 'imaginer', synonyme: ['inventer'], definition: 'sich etwas vorstellen, ausdenken', teilkompetenz: 'Schreiben' },
      { name: 'justifier', definition: 'etwas rechtfertigen, begründen', teilkompetenz: 'Schreiben' },
      { name: 'rédiger', definition: 'einen Text nach Vorgaben verfassen', teilkompetenz: 'Schreiben' },
      { name: 'résumer', definition: 'etwas zusammenfassen', teilkompetenz: 'Schreiben' }
    ],
    hinweis:
      'Die Operatoren stehen auf FRANZÖSISCH und werden so in die Aufgabe geschrieben; die deutsche Angabe ist nur die Erläuterung des Kerncurriculums. Gegliedert ist die Liste nach kommunikativen TEILKOMPETENZEN, nicht nach Anforderungsbereichen – „cocher" gehört zum Hörverstehen und hat in einer Schreibaufgabe nichts zu suchen. Die Beispielarbeitsanweisungen stehen in der 2. Person Singular („Décris la photo."). Für die Sprachmittlung nennt die Quelle keine eigenen Operatoren, sondern verweist auf die des Sprechens und Schreibens. Öffnungsklausel wörtlich: „Die Liste erhebt keinen Anspruch auf Vollständigkeit; weitere Aufgabenstellungen sind möglich."'
  },
  {
    stateId: 'NI',
    fach: 'spanisch',
    stufe: 'sek1',
    quelle: 'Kerncurriculum Spanisch, Sekundarbereich I, Anhang „Operatoren"',
    url: 'https://cuvo.nibis.de/index.php?p=download&upload=450',
    stand: 'Kerncurriculum Sek I',
    amtlich: true,
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: 'du',
    operatoren: [
      { name: 'contestar', definition: 'Fragen beantworten', teilkompetenz: 'Hörverstehen und Leseverstehen' },
      { name: 'completar', definition: 'etwas vervollständigen (Satz, Tabelle)', teilkompetenz: 'Hörverstehen und Leseverstehen' },
      { name: 'relacionar', definition: 'zuordnen, in Beziehung setzen', teilkompetenz: 'Hörverstehen, Leseverstehen und Sprechen' },
      { name: 'marcar', synonyme: ['subrayar'], definition: 'ankreuzen bzw. unterstreichen', teilkompetenz: 'Hörverstehen und Leseverstehen' },
      { name: 'ordenar', definition: 'Absätze oder Sätze in die richtige Reihenfolge bringen', teilkompetenz: 'Leseverstehen' },
      { name: 'responder', definition: 'auf Fragen antworten', teilkompetenz: 'Sprechen' },
      { name: 'describir', definition: 'etwas beschreiben', teilkompetenz: 'Sprechen' },
      { name: 'hablar de', definition: 'über etwas sprechen', teilkompetenz: 'Sprechen' },
      { name: 'comparar', definition: 'etwas miteinander vergleichen', teilkompetenz: 'Sprechen' },
      { name: 'explicar', definition: 'etwas erklären', teilkompetenz: 'Sprechen und Sprachmittlung' },
      { name: 'discutir', definition: 'etwas diskutieren', teilkompetenz: 'Sprechen' },
      { name: 'ponerse de acuerdo', definition: 'sich auf etwas einigen', teilkompetenz: 'Sprechen' },
      { name: 'dar la opinión', synonyme: ['expresar la opinión'], definition: 'die eigene Meinung äußern', teilkompetenz: 'Sprechen' },
      { name: 'escribir', synonyme: ['redactar'], definition: 'einen Text verfassen', teilkompetenz: 'Sprachmittlung und Schreiben' },
      { name: 'informar', synonyme: ['contar'], definition: 'jemanden über etwas informieren bzw. etwas erzählen', teilkompetenz: 'Sprachmittlung' },
      { name: 'presentar', definition: 'Informationen vorstellen', teilkompetenz: 'Sprachmittlung und Schreiben' },
      {
        name: 'contar',
        definition: 'etwas mit eigenen Worten (nach-)erzählen; kein Fazit, keine Wertung, keine Zitate',
        teilkompetenz: 'Schreiben (Textarbeit)'
      },
      {
        name: 'describir (texto)',
        definition: 'etwas genau und sachlich beschreiben; keine Interpretation, keine persönliche Wertung, keine Zitate',
        teilkompetenz: 'Schreiben (Textarbeit)'
      }
    ],
    hinweis:
      'Die Operatoren stehen auf SPANISCH. Gegliedert ist die Liste nach kommunikativen TEILKOMPETENZEN, nicht nach Anforderungsbereichen. Für die Sprachmittlung führt die Quelle die Operatoren in zwei Fassungen – deutsche, wenn die Aufgabenstellung auf Deutsch erfolgt, und spanische für den Ausnahmefall; hier stehen die spanischen. Der Abschnitt „Schreiben/Textarbeit" ist im Kerncurriculum ausführlicher als hier wiedergegeben: Er nennt zu jedem Operator eine „konkrete Ausgestaltung" (Einleitungssatz, Zeitform, Zitatverbot) und ordnet die Operatoren den Anforderungsbereichen zu – mit dem Vorbehalt, „eine scharfe Trennung der Anforderungsbereiche ist nicht immer möglich". Diese Feinheiten sind hier NICHT übernommen; für eine Textarbeitsaufgabe lohnt der Blick ins Kerncurriculum.'
  }
]

/**
 * Länder, für die keine amtliche Operatorenliste ermittelt werden konnte.
 *
 * Sie bekommen ein ABGELEITETES Profil: die Namen des gemeinsamen Kerns, keine
 * Definitionen. Das ist keine Landesvorgabe, sondern eine Arbeitsgrundlage, und die
 * Oberfläche sagt das auch so. Eine erfundene Definition wäre schlimmer als keine, weil
 * sie unbemerkt einen anderen Erwartungshorizont erzeugt.
 */
export const OHNE_AMTLICHE_LISTE = ['BE', 'BB', 'RP', 'MV', 'HB', 'SL', 'ST', 'TH', 'BW']

/**
 * Erzeugt für ein Land ohne Liste ein abgeleitetes Profil.
 *
 * Bestand: der gemeinsame Kern plus die vier Operatoren, die in sieben von acht gelesenen
 * Listen stehen. Das ist der Teil, bei dem der BESTAND belegt ist – die BEDEUTUNG ist es
 * nicht, deshalb bleibt jede Definition leer.
 */
function abgeleitetesProfil(stateId: string, stufe: Stufe): Laenderprofil {
  return {
    stateId,
    fach: 'alle',
    stufe,
    quelle: 'Kein Landesdokument ermittelt – gemeinsamer Bestand aus den acht gelesenen Länderlisten',
    url: 'https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Physik/N_Grundstock_von_Operatoren.pdf',
    stand: 'Recherchestand 23.09.2026',
    amtlich: false,
    belegt: 'abgeleitet',
    afbLogik: 'keine',
    oeffnungsklausel: true,
    anrede: stufe === 'sek1' ? 'du' : 'sie',
    operatoren: [...KERN_OPERATOREN, ...FAST_KERN].map((name) => ({ name, definition: '' })),
    hinweis:
      'Für dieses Bundesland wurde keine amtliche Operatorenliste gefunden. Verwendet wird der Bestand, der in allen acht gelesenen Länderlisten vorkommt; er geht auf den „Grundstock von Operatoren" der gemeinsamen Abituraufgabenpools beim IQB zurück (KMK-Beschluss v. 15.10.2020). Die App gibt dazu KEINE Definitionen aus – die Bedeutung weicht zwischen den Ländern nachweislich ab. Bitte die schulinterne oder landeseigene Liste gegenprüfen.'
  }
}

/**
 * Alle Profile: die im Volltext gelesenen zuerst, danach die abgeleiteten.
 *
 * Die Reihenfolge ist wichtig, weil `profilFuer` den ersten Treffer nimmt – ein belegtes
 * Profil soll ein abgeleitetes immer schlagen.
 */
/**
 * Listen, die laut ihrer eigenen Überschrift für MEHRERE Fächer gelten.
 *
 * Hessen bündelt „Biologie, Chemie, Informatik, Mathematik und Physik" in einer einzigen
 * Tabelle; eine hessische Mathematikliste allein gibt es nicht. Niedersachsen führt eine
 * gemeinsame Liste „für die Naturwissenschaften (Biologie, Chemie, Physik)".
 *
 * Diese Kopien sind keine Auslegung, sondern stehen so im Kopf der jeweiligen Quelle.
 */
const MEHRFACHGELTUNG: { stateId: string; von: string; fuer: string[]; stufe?: Stufe }[] = [
  { stateId: 'HE', von: 'mathematik', fuer: ['biologie', 'chemie', 'physik', 'informatik'] },
  { stateId: 'NI', von: 'biologie', fuer: ['chemie', 'physik'] },
  { stateId: 'NI', von: 'biologie', stufe: 'sek1', fuer: ['chemie', 'physik'] }
]

const mehrfachProfile = (): Laenderprofil[] =>
  MEHRFACHGELTUNG.flatMap(({ stateId, von, fuer, stufe }) => {
    const quelle = BELEGTE_PROFILE.find((p) => p.stateId === stateId && p.fach === von && (!stufe || p.stufe === stufe))
    return quelle ? fuer.map((fach) => ({ ...quelle, fach })) : []
  })

/*
 * Profile aus dem gemeinsamen Operatoren-Bestand (Großprogramm 0.4, D3; Recherche 28.09.2026).
 * Nur Listen aus Dokumenten des Landes selbst, nur wo kein von Hand erfasstes Profil für Land,
 * Fach und Stufe besteht. Fremdsprachen bekommen die Liste in der Zielsprache, alle anderen
 * Fächer die deutsche. Mehrere Tabellen eines Landes (je Kompetenzbereich) werden zu einem
 * Profil zusammengeführt. Ob die Quelle ungelistete Operatoren erlaubt, wurde nicht erfasst –
 * deshalb keine Warnung „nicht in der Landesliste" (Öffnungsklausel angenommen). Ergänzungstabellen
 * mit weniger als sechs Einträgen und Listen ohne auffindbare Online-Adresse werden kein Profil.
 */
const ZIELSPRACHE: Record<string, string> = { englisch: 'en', franzoesisch: 'fr', spanisch: 'es' }
const AFB_AUS: Record<string, Afb[]> = { I: ['I'], II: ['II'], III: ['III'], 'I–II': ['I', 'II'], 'II–III': ['II', 'III'], 'I–III': ['I', 'II', 'III'] }

function bestandsProfile(): Laenderprofil[] {
  const out: Laenderprofil[] = []
  const vorhanden = new Set([...BELEGTE_PROFILE, ...mehrfachProfile()].map((p) => `${p.stateId}|${p.fach}|${p.stufe}`))
  for (const land of Object.values(BESTAND)) {
    if (land.stateId === 'KMK') continue
    const gruppen = new Map<string, typeof land.listen>()
    for (const l of land.listen) {
      if (l.belegt !== 'volltext') continue
      for (const fach of l.faecher) {
        if (l.sprache !== (ZIELSPRACHE[fach] ?? 'de')) continue
        const k = `${land.stateId}|${fach}|${l.stufe}`
        if (vorhanden.has(k)) continue
        gruppen.set(k, [...(gruppen.get(k) ?? []), l])
      }
    }
    for (const [k, listen] of gruppen) {
      const [, fach, stufe] = k.split('|')
      const operatoren: OperatorDefinition[] = []
      const gesehen = new Set<string>()
      for (const l of listen)
        for (const o of l.operatoren) {
          const schluessel = `${o.operator.toLowerCase()}|${o.kompetenzbereich ?? ''}`
          if (gesehen.has(schluessel)) continue
          gesehen.add(schluessel)
          operatoren.push({
            name: o.operator,
            ...(o.formen?.length ? { synonyme: o.formen } : {}),
            definition: o.definition,
            ...(o.afb ? { afb: AFB_AUS[o.afb] } : {}),
            ...(o.kompetenzbereich ? { teilkompetenz: o.kompetenzbereich } : {})
          })
        }
      // Ergänzungstabellen mit zwei, drei Einträgen (BB Englisch Sek II) sind kein Profil; ohne Fundstellen-Adresse auch nicht
      const url = listen.find((l) => l.url)?.url ?? ''
      if (operatoren.length < 6 || !url) continue
      // Die AFB-Logik der Tabelle, die tatsächlich Zuordnungen trägt – gemischte Tabellen ohne Spalte zählen nicht
      const mitAfb = operatoren.some((o) => o.afb?.length)
      const logik = mitAfb ? (listen.find((l) => l.afbLogik !== 'keine')?.afbLogik ?? 'mehrfach') : 'keine'
      out.push({
        stateId: land.stateId,
        fach,
        stufe: stufe as Stufe,
        quelle: [...new Set(listen.map((l) => l.quelle))].join('; '),
        url,
        stand: `Recherchestand ${land.stand}`,
        amtlich: true,
        belegt: 'volltext',
        afbLogik: logik,
        afbUebernommen: logik !== 'keine',
        oeffnungsklausel: true,
        anrede: stufe === 'sek1' ? 'du' : 'sie',
        operatoren
      })
    }
  }
  return out
}

export const LAENDERPROFILE: Laenderprofil[] = [
  ...BELEGTE_PROFILE,
  ...mehrfachProfile(),
  ...bestandsProfile(),
  /*
   * Für JEDES Land und JEDE Stufe eine Rückfallebene – ausnahmslos.
   *
   * Eine Bedingung „nur wo noch gar nichts steht" sah sparsamer aus und war falsch: Sobald
   * Niedersachsen eine Sek-I-Liste für die Naturwissenschaften bekam, entfiel dadurch die
   * Rückfallebene für alle ÜBRIGEN Fächer derselben Stufe – eine Lernzielkontrolle in
   * Mathematik, Klasse 8, stand plötzlich ohne jede Grundlage da.
   *
   * Die abgeleiteten Profile stehen am Ende der Liste und tragen das Fach „alle";
   * `profilFuer` sucht zuerst nach dem Fach und greift erst danach auf sie zurück.
   */
  ...STATES.flatMap((st) => (['sek1', 'sek2'] as Stufe[]).map((stufe) => abgeleitetesProfil(st.id, stufe)))
]

/**
 * Jeder Operator, der irgendwo in den gelesenen Listen vorkommt.
 *
 * Damit lässt sich unterscheiden, ob eine Aufgabenstellung GAR KEINEN Operator hat
 * („Aufgabe 3: 2³ · 2⁴") oder einen, den nur dieses Bundesland nicht führt. Das ist ein
 * großer Unterschied: Das eine ist ein Fehler, das andere oft völlig in Ordnung – sieben der
 * acht gelesenen Listen erlauben ungelistete Operatoren ausdrücklich.
 */
export const ALLE_OPERATOREN: string[] = [
  ...new Set([
    ...BELEGTE_PROFILE.flatMap((p) => p.operatoren.flatMap((o) => [o.name, ...(o.synonyme ?? [])])),
    ...KERN_OPERATOREN,
    ...FAST_KERN,
    ...ZU_AUFWENDIG
  ])
]

/** Ist das Profil im Volltext belegt oder nur abgeleitet? */
export const istBelegt = (p?: Laenderprofil): boolean => Boolean(p) && (p!.belegt ?? 'volltext') === 'volltext'

/**
 * Baden-Württemberg hat eine Sonderstellung und bekommt deshalb kein Profil.
 *
 * Es gibt keine Definitionsliste, sondern nur eine Hinweisliste im Leitfaden zur
 * schriftlichen Abiturprüfung, und die sagt selbst: „Die Bedeutung der bei Arbeitsaufträgen
 * verwendeten Operatoren entspricht in den meisten Fällen … dem allgemein üblichen
 * Sprachgebrauch." Hinzu kommt ein Vorbehalt aus der Recherche: Beim Auslesen des PDF ging
 * die Spaltenausrichtung verloren, sodass die Zuordnung Operator→Hinweis eine Rekonstruktion
 * wäre. Diese Zuordnung wird deshalb NICHT übernommen.
 */
export const BW_HINWEIS =
  'Baden-Württemberg führt keine Operatoren-Definitionsliste. Der Leitfaden zur schriftlichen Abiturprüfung enthält nur Hinweise und sagt, die Bedeutung entspreche „in den meisten Fällen … dem allgemein üblichen Sprachgebrauch". Die App gibt deshalb keine BW-Definitionen aus.'

/**
 * Das passende Profil.
 *
 * Die Stufe geht dem Land vor: Für eine Lernzielkontrolle in Klasse 7 ist eine Sek-I-Liste
 * aus einem anderen Land die bessere Referenz als die Abiturliste des eigenen Landes.
 * Gibt es für das eigene Land keine Liste der richtigen Stufe, liefert die Funktion nichts –
 * dann greift der Kern ohne Definitionen.
 */
export function profilFuer(stateId: string, fach: string, stufe: Stufe, schoolTypeId?: string): Laenderprofil | undefined {
  const passend = LAENDERPROFILE.filter((p) => p.stateId === stateId && p.stufe === stufe)
  const fuerSchulform = (p: Laenderprofil): boolean => Boolean(schoolTypeId) && Boolean(p.schulformen?.includes(schoolTypeId!))
  const ohneEinschraenkung = (p: Laenderprofil): boolean => !p.schulformen?.length
  /*
   * Die Reihenfolge ist die Rangfolge, und sie ist wichtig:
   * Ein Profil für GENAU DIESE Schulform schlägt eines ohne Einschränkung, und beides
   * schlägt die Fächer-übergreifende Liste. Sonst bekäme eine Hauptschule in Geschichte die
   * Gymnasialliste – mit anderen Anforderungsbereichen für dieselben Operatoren.
   */
  return (
    passend.find((p) => p.fach === fach && fuerSchulform(p)) ??
    passend.find((p) => p.fach === fach && ohneEinschraenkung(p)) ??
    passend.find((p) => p.fach === 'alle' && fuerSchulform(p)) ??
    passend.find((p) => p.fach === 'alle' && ohneEinschraenkung(p))
  )
}

/** Alle Operatornamen eines Profils, Synonyme eingeschlossen. */
export function namenAus(profil: Laenderprofil): string[] {
  return profil.operatoren.flatMap((o) => [o.name, ...(o.synonyme ?? [])])
}

/**
 * Die Definition eines Operators – oder `null`.
 *
 * `null` heißt: Für dieses Land, dieses Fach und diese Stufe ist keine Definition belegt.
 * Dann gibt die App KEINE aus. Eine fremde Definition wäre schlimmer als keine, weil sie
 * unbemerkt einen anderen Erwartungshorizont erzeugt.
 */
export function definitionFuer(operator: string, profil?: Laenderprofil): string | null {
  if (!profil) return null
  const gesucht = operator.trim().toLowerCase()
  const treffer = profil.operatoren.find((o) => [o.name, ...(o.synonyme ?? [])].some((n) => n.toLowerCase() === gesucht))
  return treffer?.definition ? treffer.definition : null
}

/**
 * Bekannte Bedeutungsunterschiede zwischen Ländern.
 *
 * Steht hier, damit niemand die Listen später zusammenlegt, weil sie „fast gleich" aussehen.
 * Ein Test hält fest, dass die Definitionen tatsächlich auseinandergehen.
 */
export const BEDEUTUNGSKONFLIKTE = [
  {
    operator: 'begründen',
    fach: 'mathematik',
    laender: ['NW', 'NI', 'HH', 'SH'],
    unterschied:
      'In NRW, Niedersachsen und Hamburg ist „begründen" mit „nachweisen" und „zeigen" zusammengefasst; das Vorgehen ist frei wählbar, eine reine Rechnung genügt. In Schleswig-Holstein ist es ein eigener Operator, der ausdrücklich Textanteile verlangt: „Die Angabe einer Formel oder Ähnliches genügt hier nicht."'
  },
  {
    operator: 'berechnen',
    fach: 'mathematik',
    laender: ['HE', 'SH'],
    unterschied:
      'Hessen schließt beim Berechnen „die erweiterten Funktionalitäten des WTR/CAS" aus. Schleswig-Holstein erlaubt ausdrücklich: „Auch die Nutzung des Taschenrechners ist zulässig."'
  },
  {
    operator: 'berechnen',
    fach: 'mathematik',
    laender: ['NI', 'NW'],
    unterschied:
      'Niedersachsen ergänzt: „Für die Berechnung der Extrempunkte einer Funktion f ist es beispielsweise nicht zulässig, diese direkt aus dem Graphen von f abzulesen." In NRW und Hamburg fehlt dieser Satz.'
  },
  {
    operator: 'beschreiben',
    fach: 'mathematik',
    laender: ['NW', 'SH'],
    unterschied:
      'NRW: „Eine Begründung für die Beschreibung ist nicht notwendig." Schleswig-Holstein verlangt die Darstellung „in Textform unter Verwendung der Fachsprache in vollständigen Sätzen".'
  }
]

export const konflikteFuer = (operator: string, fach: string): typeof BEDEUTUNGSKONFLIKTE =>
  BEDEUTUNGSKONFLIKTE.filter((k) => k.operator === operator.trim().toLowerCase() && k.fach === fach)
