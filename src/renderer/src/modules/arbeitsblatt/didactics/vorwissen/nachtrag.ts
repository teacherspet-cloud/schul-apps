/**
 * Ausbau der Voraussetzungsketten – Recherche vom 25.09.2026.
 *
 * Wunsch der Lehrkraft: „Vorwissen ausbauen“ – mehr Themen, weitere Länder mit belegten
 * Jahrgängen, Religion und Ethik. Drei Teile:
 *
 * 1. JAHRGÄNGE für Niedersachsen und Hessen.
 *    - NI: Kerncurricula Gymnasium 5–10 (cuvo.nibis.de: Mathematik 2015/2021, Naturwissenschaften
 *      2015, Geschichte 2015, Erdkunde 2015, Deutsch 2015). Die KCs nennen nur DOPPELjahrgänge;
 *      die Verteilung darin legt die Fachkonferenz fest. Biologie steht dort nur als
 *      „Beispiel für eine mögliche Themenfolge“ – übernommen ist deshalb nur die Zelle (7/8),
 *      die der KC-Text selbst festlegt.
 *    - HE: Lehrpläne Gymnasium G9 (kultus.hessen.de). Sie gelten laut Kultusministerium nur, wo
 *      die Schule kein eigenes Schulcurriculum beschlossen hat – die App nennt sie deshalb als
 *      „Richtwert“ und nie als sicher (siehe `stand` in vorwissen.ts).
 * 2. NEUE KNOTEN für Themen, die in den Ketten fehlten (Kreis, Körper, Redox, Drama …).
 * 3. RELIGION UND ETHIK: KC Niedersachsen ev./kath. Religion (2016) und Werte und Normen
 *    (2017), KLP NRW ev./kath. Religion (2019) und Praktische Philosophie (2024), LehrplanPLUS
 *    Bayern Ethik/ev./kath. Religion. Die Ketten sind aus diesen Plänen abgeleitet.
 */
import type { BelegLand, Knoten } from './ketten'

type Spannen = Partial<Record<BelegLand, [number, number]>>

export const JAHRGANG_NACHTRAG: Record<string, Spannen> = {
  // Mathematik
  'm-brueche': { NI: [5, 6], HE: [6, 6] },
  'm-dezimal': { NI: [5, 6], HE: [6, 6] },
  'm-negativ': { NI: [7, 8], HE: [7, 7] },
  'm-prozent': { NI: [7, 8], HE: [7, 8] },
  'm-terme': { NI: [7, 8] },
  'm-lingleichung': { NI: [7, 8], HE: [8, 8] },
  'm-linfunktion': { NI: [7, 8], HE: [8, 8] },
  'm-wurzel': { NI: [9, 10], HE: [9, 9] },
  'm-quadratisch': { NI: [9, 10], HE: [9, 9] },
  'm-pythagoras': { NI: [9, 10], HE: [9, 9] },
  'm-trigonometrie': { NI: [9, 10], HE: [10, 10] },
  'm-exponential': { NI: [9, 10], HE: [10, 10] },
  'm-wahrscheinlichkeit': { NI: [7, 8], HE: [7, 7] },
  'm-aehnlich': { NI: [9, 10], HE: [9, 9] },
  // Physik
  'p-stromkreis': { NI: [5, 6], HE: [7, 7] },
  'p-elektrik': { NI: [7, 8], HE: [8, 8] },
  'p-magnetismus': { HE: [7, 7] },
  'p-licht': { NI: [5, 6], HE: [7, 8] },
  'p-optik': { NI: [5, 6], HE: [7, 8] },
  'p-kraft': { NI: [7, 8], HE: [7, 7] },
  'p-energie': { NI: [5, 8], HE: [10, 10] },
  'p-waerme': { HE: [7, 7] },
  'p-radioaktivitaet': { NI: [9, 10], HE: [10, 10] },
  // Chemie
  'c-stoffe': { NI: [5, 6], HE: [8, 8] },
  'c-teilchen': { NI: [5, 6] },
  'c-reaktion': { NI: [7, 8], HE: [8, 8] },
  'c-atom': { NI: [9, 10], HE: [10, 10] },
  'c-ionen': { NI: [9, 10], HE: [9, 10] },
  'c-molekuel': { NI: [9, 10], HE: [10, 10] },
  'c-saeure': { NI: [9, 10], HE: [10, 10] },
  'c-organik': { HE: [10, 10] },
  // Biologie
  'b-zelle': { NI: [7, 8], HE: [7, 7] },
  'b-fotosynthese': { HE: [7, 7] },
  'b-oekologie': { HE: [7, 7] },
  'b-stoffwechsel': { HE: [7, 7] },
  'b-immun': { HE: [9, 9] },
  'b-genetik': { HE: [9, 9] },
  // Geschichte
  'g-fruehgeschichte': { NI: [5, 6], HE: [6, 6] },
  'g-hochkultur': { NI: [5, 6], HE: [6, 6] },
  'g-antike': { NI: [5, 6], HE: [6, 6] },
  'g-mittelalter': { NI: [5, 6], HE: [8, 8] },
  'g-fruehneuzeit': { NI: [7, 8], HE: [8, 8] },
  'g-absolutismus': { NI: [7, 8], HE: [8, 8] },
  'g-revolution': { NI: [7, 8], HE: [9, 9] },
  'g-1848': { NI: [7, 8] },
  'g-reichsgruendung': { NI: [7, 8], HE: [9, 9] },
  'g-industrialisierung': { NI: [7, 8], HE: [9, 9] },
  'g-imperialismus': { NI: [7, 8], HE: [9, 9] },
  'g-weimar': { NI: [9, 10], HE: [10, 10] },
  'g-ns': { NI: [9, 10], HE: [10, 10] },
  'g-kalterkrieg': { NI: [9, 10], HE: [10, 10] },
  'g-einheit': { NI: [9, 10], HE: [10, 10] },
  // Erdkunde
  'e-karte': { NI: [5, 6], HE: [5, 5] },
  'e-gradnetz': { NI: [5, 6], HE: [6, 6] },
  'e-plattentektonik': { NI: [5, 6], HE: [8, 8] },
  'e-klimazonen': { NI: [7, 8], HE: [6, 8] },
  'e-klimawandel': { NI: [9, 10] },
  'e-globalisierung': { NI: [9, 10], HE: [9, 9] },
  // Deutsch
  'd-wortarten': { NI: [5, 6], HE: [5, 5] },
  'd-satzglieder': { NI: [5, 6], HE: [5, 6] },
  'd-adverbiale': { NI: [7, 8] },
  'd-gliedsatz': { NI: [7, 8], HE: [6, 7] },
  'd-konjunktiv': { NI: [7, 8], HE: [7, 7] },
  'd-inhaltsangabe': { NI: [7, 8], HE: [7, 7] },
  'd-argumentieren': { NI: [7, 8] },
  'd-eroerterung': { NI: [9, 10], HE: [9, 9] }
}

const LECOUTRE = 'Lecoutre (1992), Educational Studies in Mathematics 23'
const GARNETT = 'Garnett & Treagust (1992), Journal of Research in Science Teaching 29'
const KATTMANN_OEKO = 'Didaktische Rekonstruktion Ökologie (Kattmann, Oldenburg)'
const BUCHER = 'Bucher (1990), Gleichnisse verstehen lernen; Bucher/Oser (1987)'
const FETZ = 'Fetz/Reich/Valentin (2001), nach Kropac'
const NIPKOW = 'Nipkow (1987), „Einbruchstellen“ des Glaubens'
const KLP_KR = 'Kernlehrplan NRW Katholische Religionslehre (2019), Stufe 7–10'

export const KNOTEN_NACHTRAG: Knoten[] = [
  // ------------------------------------------------------------------ Mathematik
  {
    id: 'm-kreis',
    fach: 'mathematik',
    titel: 'Kreis: Umfang und Flächeninhalt',
    stichwoerter: ['kreis', 'kreisumfang', 'kreisfläche', 'zylinder'],
    nach: ['m-flaeche', 'm-dezimal'],
    begriffe: ['Radius', 'Durchmesser', 'π', 'Kreisausschnitt'],
    inhalte: ['Kreisumfang', 'Kreisfläche', 'Kreisausschnitt und Kreisbogen', 'Zylinder'],
    jahrgang: { NI: [9, 10], HE: [9, 9] }
  },
  {
    id: 'm-koerper',
    fach: 'mathematik',
    titel: 'Körper: Netz, Schrägbild, Oberfläche und Volumen',
    stichwoerter: ['körper', 'prisma', 'pyramide', 'kegel', 'kugel', 'schrägbild', 'netz'],
    nach: ['m-flaeche', 'm-pythagoras'],
    begriffe: ['Netz', 'Schrägbild', 'Prisma', 'Zylinder', 'Pyramide', 'Kegel'],
    inhalte: ['Netze und Schrägbilder', 'Prisma und Zylinder', 'Pyramide und Kegel', 'Kugel'],
    jahrgang: { NI: [9, 10], HE: [8, 10] }
  },
  {
    id: 'm-mehrstufig',
    fach: 'mathematik',
    titel: 'Mehrstufige Zufallsversuche, Baumdiagramm und Pfadregeln',
    stichwoerter: ['mehrstufig', 'pfadregel', 'vierfeldertafel', 'baumdiagramm'],
    nach: ['m-wahrscheinlichkeit'],
    begriffe: ['Baumdiagramm', 'Pfadregel', 'Vierfeldertafel'],
    fehlvorstellungen: [{ text: 'Zufall heißt gleich wahrscheinlich – jedes Ergebnis hat dieselbe Chance.', quelle: LECOUTRE }],
    jahrgang: { NI: [9, 10], HE: [10, 10] }
  },

  // ------------------------------------------------------------------ Physik
  {
    id: 'p-thermodynamik',
    fach: 'physik',
    titel: 'Wärmelehre: innere Energie, Gasgesetze, Wärmekraftmaschinen',
    stichwoerter: ['thermodynamik', 'gasgesetz', 'wärmekraftmaschine', 'stirling', 'wärmelehre'],
    nach: ['p-waerme', 'p-energie'],
    begriffe: ['innere Energie', 'Druck', 'Volumen', 'Wirkungsgrad'],
    jahrgang: { NI: [9, 10] }
  },

  // ------------------------------------------------------------------ Chemie
  {
    id: 'c-redox',
    fach: 'chemie',
    titel: 'Redoxreaktionen als Elektronenübertragung',
    stichwoerter: ['redox', 'reduktion', 'oxidationszahl', 'elektronenübertragung'],
    nach: ['c-reaktion', 'c-ionen'],
    begriffe: ['Oxidation', 'Reduktion', 'Oxidationsmittel', 'Reduktionsmittel'],
    jahrgang: { NI: [9, 10], HE: [11, 11] }
  },
  {
    id: 'c-elektrochemie',
    fach: 'chemie',
    titel: 'Elektrolyse und galvanische Zellen',
    stichwoerter: ['elektrolyse', 'galvanisch', 'batterie', 'akku', 'elektrochemie'],
    nach: ['c-redox', 'c-ionen'],
    begriffe: ['Anode', 'Kathode', 'Elektrolyt', 'Salzbrücke'],
    fehlvorstellungen: [{ text: 'Elektronen wandern durch den Elektrolyten bzw. die Salzbrücke.', quelle: GARNETT }],
    jahrgang: { HE: [9, 9] }
  },
  {
    id: 'c-mol',
    fach: 'chemie',
    titel: 'Stoffmenge und Mol',
    stichwoerter: ['stoffmenge', ' mol ', 'avogadro', 'molare masse'],
    nach: ['c-teilchen', 'c-atom'],
    begriffe: ['Stoffmenge', 'Mol', 'molare Masse'],
    jahrgang: { NI: [9, 10] }
  },

  // ------------------------------------------------------------------ Biologie
  {
    id: 'b-nerven',
    fach: 'biologie',
    titel: 'Nervensystem und Sinnesorgane',
    stichwoerter: ['nerv', 'sinnesorgan', 'auge', 'ohr', 'reiz', 'gehirn'],
    nach: ['b-zelle', 'b-organe'],
    begriffe: ['Reiz', 'Rezeptor', 'Nervenzelle', 'Reflex'],
    jahrgang: { HE: [9, 9] }
  },
  {
    id: 'b-hormone',
    fach: 'biologie',
    titel: 'Hormone und Regelung',
    stichwoerter: ['hormon', 'insulin', 'diabetes', 'regelkreis'],
    nach: ['b-organe', 'b-pubertaet'],
    begriffe: ['Hormon', 'Drüse', 'Regelkreis'],
    jahrgang: { HE: [9, 9] }
  },
  {
    id: 'b-ernaehrung',
    fach: 'biologie',
    titel: 'Ernährung und Nährstoffe',
    stichwoerter: ['ernährung', 'nährstoff', 'kohlenhydrat', 'eiweiß', 'fett'],
    begriffe: ['Kohlenhydrate', 'Fette', 'Eiweiße', 'Vitamine'],
    jahrgang: { HE: [7, 7] }
  },
  {
    id: 'b-gewaesser',
    fach: 'biologie',
    titel: 'Ökosystem Gewässer',
    stichwoerter: ['gewässer', ' see', ' fluss', ' teich'],
    nach: ['b-oekologie'],
    begriffe: ['Uferzone', 'Plankton', 'Eutrophierung'],
    fehlvorstellungen: [{ text: 'Ein Ökosystem strebt von selbst ein Gleichgewicht an, als hätte es ein Ziel.', quelle: KATTMANN_OEKO }]
  },

  // ------------------------------------------------------------------ Geschichte
  {
    id: 'g-russrev',
    fach: 'geschichte',
    titel: 'Russische Revolution',
    stichwoerter: ['russische revolution', 'oktoberrevolution', 'lenin', 'sowjet'],
    nach: ['g-imperialismus'],
    begriffe: ['Bolschewiki', 'Sowjet', 'Zar'],
    jahrgang: { NI: [9, 10] }
  },
  {
    id: 'g-europa',
    fach: 'geschichte',
    titel: 'Europäische Einigung',
    stichwoerter: ['europäische einigung', 'europäische integration', 'römische verträge', 'montanunion'],
    nach: ['g-kalterkrieg'],
    begriffe: ['EGKS', 'EWG', 'Europäische Union'],
    jahrgang: { HE: [10, 10] }
  },

  // ------------------------------------------------------------------ Erdkunde
  {
    id: 'e-landwirtschaft',
    fach: 'erdkunde',
    titel: 'Landwirtschaft und Landnutzung',
    stichwoerter: ['landwirtschaft', 'landnutzung', 'ackerbau', 'viehzucht', 'plantage'],
    nach: ['e-karte'],
    begriffe: ['Primärsektor', 'Anbaugebiet', 'Bewässerung'],
    jahrgang: { NI: [5, 8], HE: [5, 5] }
  },
  {
    id: 'e-stadt',
    fach: 'erdkunde',
    titel: 'Stadtentwicklung und Stadtstrukturen',
    stichwoerter: ['stadtentwicklung', 'stadtstruktur', 'städte im wandel', 'gentrifizierung', 'suburbanisierung'],
    nach: ['e-karte', 'e-bevoelkerung'],
    begriffe: ['Stadtviertel', 'Suburbanisierung', 'Gentrifizierung'],
    jahrgang: { NI: [7, 8], HE: [9, 9] }
  },
  {
    id: 'e-meere',
    fach: 'erdkunde',
    titel: 'Weltmeere und Küsten',
    stichwoerter: ['weltmeer', 'ozean', 'küste', 'gezeiten', 'meer'],
    nach: ['e-gradnetz'],
    begriffe: ['Ozean', 'Gezeiten', 'Meeresströmung'],
    jahrgang: { NI: [7, 8] }
  },

  // ------------------------------------------------------------------ Deutsch
  {
    id: 'd-drama',
    fach: 'deutsch',
    titel: 'Drama: Aufbau, Figurenrede, geschlossene Form',
    stichwoerter: ['drama', 'szene', 'theater', 'tragödie', 'komödie'],
    nach: ['d-erzaehltext'],
    begriffe: ['Akt', 'Szene', 'Regieanweisung', 'Monolog', 'Dialog'],
    jahrgang: { NI: [7, 10], HE: [8, 9] }
  },
  {
    id: 'd-sachtext',
    fach: 'deutsch',
    titel: 'Sachtexte und nichtlineare Texte erschließen',
    stichwoerter: ['sachtext', 'diagramm', 'nichtlinear', 'kommentar', 'reportage', 'zeitung'],
    begriffe: ['Sachtext', 'These', 'Diagramm', 'Kommentar']
  },
  {
    id: 'd-charakterisierung',
    fach: 'deutsch',
    titel: 'Figuren charakterisieren',
    stichwoerter: ['charakterisierung', 'charakterisieren', 'figurenkonstellation'],
    nach: ['d-erzaehltext'],
    begriffe: ['direkte Charakterisierung', 'indirekte Charakterisierung', 'Figurenkonstellation'],
    jahrgang: { NI: [9, 10] }
  },
  {
    id: 'd-rhetorik',
    fach: 'deutsch',
    titel: 'Rhetorische Mittel und ihre Wirkung',
    stichwoerter: ['rhetorisch', 'stilmittel', 'redeanalyse', 'politische rede', 'sprachwandel'],
    nach: ['d-lyrik'],
    begriffe: ['Anapher', 'Alliteration', 'rhetorische Frage', 'Klimax'],
    jahrgang: { NI: [9, 10] }
  },

  // ------------------------------------------------------------------ Religion
  {
    id: 'r-bibel',
    fach: 'religion',
    titel: 'Die Bibel als Buch: Entstehung und Aufbau',
    stichwoerter: ['bibel', 'altes testament', 'neues testament', 'bibelstelle'],
    begriffe: ['Altes Testament', 'Neues Testament', 'Evangelium', 'Bibelstelle'],
    jahrgang: { NW: [5, 6], BY: [5, 5] }
  },
  {
    id: 'r-jesus',
    fach: 'religion',
    titel: 'Jesus in seiner Zeit und Umwelt',
    stichwoerter: ['jesus', 'nazaret', 'palästina zur zeit'],
    nach: ['r-bibel'],
    begriffe: ['Pharisäer', 'Synagoge', 'Jünger'],
    jahrgang: { NI: [5, 6], NW: [5, 6] }
  },
  {
    id: 'r-gleichnisse',
    fach: 'religion',
    titel: 'Gleichnisse und Reich-Gottes-Botschaft',
    stichwoerter: ['gleichnis', 'reich gottes', 'wunder', 'parabel'],
    nach: ['r-jesus'],
    begriffe: ['Gleichnis', 'Bildhälfte', 'Sachhälfte', 'Reich Gottes'],
    fehlvorstellungen: [
      { text: 'Gleichnisse werden Stück für Stück „übersetzt“ (Vater = Gott) statt als Bild verstanden.', quelle: BUCHER },
      { text: 'Die Arbeiter im Weinberg zeigen, wie man es nicht machen soll – „Gott ist doch fair“.', quelle: BUCHER }
    ],
    jahrgang: { NI: [7, 8], NW: [7, 10] }
  },
  {
    id: 'r-gattungen',
    fach: 'religion',
    titel: 'Biblische Gattungen und nicht-wörtliches Verstehen',
    stichwoerter: ['gattung', 'mythos', 'wörtlich', 'bibelauslegung', 'exegese'],
    nach: ['r-gleichnisse'],
    begriffe: ['Gattung', 'Mythos', 'Auslegung'],
    fehlvorstellungen: [{ text: 'Die Bibel ist ein wörtlicher Tatsachenbericht.', quelle: KLP_KR }],
    jahrgang: { NW: [7, 10] }
  },
  {
    id: 'r-kreuz',
    fach: 'religion',
    titel: 'Kreuz und Auferstehung',
    stichwoerter: ['kreuz', 'auferstehung', 'ostern', 'passion'],
    nach: ['r-gleichnisse'],
    begriffe: ['Passion', 'Auferstehung', 'Erlösung'],
    jahrgang: { NI: [9, 10], NW: [7, 10] }
  },
  {
    id: 'r-abraham',
    fach: 'religion',
    titel: 'Judentum, Christentum, Islam – die abrahamitischen Religionen',
    stichwoerter: ['abraham', 'judentum', 'islam', 'weltreligion', 'moschee', 'synagoge'],
    begriffe: ['Tora', 'Koran', 'Monotheismus', 'Synagoge', 'Moschee'],
    jahrgang: { NI: [5, 6], NW: [5, 6] }
  },
  {
    id: 'r-religionen-vertieft',
    fach: 'religion',
    titel: 'Judentum und Islam vertieft, Trialog',
    stichwoerter: ['trialog', 'interreligiös', 'fundamentalismus'],
    nach: ['r-abraham'],
    begriffe: ['Trialog', 'Fundamentalismus'],
    jahrgang: { NI: [7, 8], BY: [7, 7], NW: [7, 10] }
  },
  {
    id: 'r-fernost',
    fach: 'religion',
    titel: 'Eine fernöstliche Religion (Buddhismus oder Hinduismus)',
    stichwoerter: ['buddhismus', 'hinduismus', 'fernöstlich', 'buddha', 'karma'],
    nach: ['r-religionen-vertieft'],
    begriffe: ['Karma', 'Wiedergeburt', 'Nirwana'],
    jahrgang: { NI: [9, 10], BY: [10, 10] }
  },
  {
    id: 'r-schoepfung',
    fach: 'religion',
    titel: 'Schöpfung: biblische Schöpfungserzählungen',
    stichwoerter: ['schöpfung', 'genesis', 'schöpfungserzählung'],
    nach: ['r-bibel'],
    begriffe: ['Schöpfung', 'Genesis'],
    fehlvorstellungen: [{ text: 'Gott hat die Welt gemacht wie ein Handwerker ein Werkstück.', quelle: FETZ }],
    jahrgang: { NI: [5, 6], BY: [5, 6] }
  },
  {
    id: 'r-glaube-wissen',
    fach: 'religion',
    titel: 'Naturwissenschaft und Glaube',
    stichwoerter: ['naturwissenschaft und glaube', 'urknall', 'evolution und schöpfung', 'weltbild'],
    nach: ['r-schoepfung', 'r-gattungen'],
    begriffe: ['Weltbild', 'Komplementarität'],
    fehlvorstellungen: [{ text: 'Die Naturwissenschaft hat Gott widerlegt – Urknall und Schöpfung schließen sich aus.', quelle: FETZ }],
    jahrgang: { BY: [8, 8], NI: [9, 10] }
  },
  {
    id: 'r-theodizee',
    fach: 'religion',
    titel: 'Theodizee: Gott und das Leid',
    stichwoerter: ['theodizee', 'leid', 'hiob', 'religionskritik', 'atheismus'],
    nach: ['r-glaube-wissen'],
    begriffe: ['Theodizee', 'Religionskritik'],
    fehlvorstellungen: [{ text: 'Wenn Gott in der Not nicht hilft, gibt es ihn nicht.', quelle: NIPKOW }],
    jahrgang: { NI: [9, 10] }
  },

  // ------------------------------------------------------------------ Ethik / Werte und Normen / Philosophie
  {
    id: 'et-regeln',
    fach: 'ethik',
    titel: 'Regeln für das Zusammenleben, Gerechtigkeit',
    stichwoerter: ['regeln', 'zusammenleben', 'gerechtigkeit', 'fairness'],
    begriffe: ['Regel', 'Norm', 'Gerechtigkeit'],
    jahrgang: { NI: [5, 6], NW: [5, 6] }
  },
  {
    id: 'et-glueck',
    fach: 'ethik',
    titel: 'Glück und Lebensgestaltung',
    stichwoerter: ['glück', 'sinn des lebens', 'lebensgestaltung', 'sinnsuche'],
    begriffe: ['Glück', 'Sinn', 'Wert'],
    jahrgang: { NI: [5, 6], BY: [8, 8] }
  },
  {
    id: 'et-wuerde',
    fach: 'ethik',
    titel: 'Menschenwürde und Menschenrechte',
    stichwoerter: ['menschenwürde', 'menschenrecht'],
    nach: ['et-regeln'],
    begriffe: ['Würde', 'Menschenrecht', 'Universalität'],
    jahrgang: { NI: [7, 8] }
  },
  {
    id: 'et-gewissen',
    fach: 'ethik',
    titel: 'Gewissen, Freiheit und Verantwortung',
    stichwoerter: ['gewissen', 'verantwortung', 'freiheit'],
    nach: ['et-wuerde'],
    begriffe: ['Gewissen', 'Verantwortung', 'Willensfreiheit'],
    fehlvorstellungen: [
      {
        text: 'Jeder hat eben seine eigene Moral – darüber kann man nicht streiten.',
        quelle: 'Satris (1986), Student Relativism – an Studierenden beobachtet, Übertragung auf die Schule unsicher'
      }
    ],
    jahrgang: { BY: [9, 9], NW: [7, 10] }
  },
  {
    id: 'et-angewandt',
    fach: 'ethik',
    titel: 'Angewandte Ethik: Umwelt-, Tier-, Friedens- und Medienethik',
    stichwoerter: ['tierethik', 'umweltethik', 'friedensethik', 'medienethik', 'wirtschaftsethik', 'bioethik', 'dilemma'],
    nach: ['et-gewissen'],
    begriffe: ['Dilemma', 'Güterabwägung', 'Verantwortungsethik'],
    jahrgang: { BY: [8, 10], NI: [9, 10] }
  },
  {
    id: 'et-philosophieren',
    fach: 'ethik',
    titel: 'Philosophieren: Fragen stellen, Gedankenexperimente, Argumente',
    stichwoerter: ['philosophieren', 'gedankenexperiment', 'philosophische frage', 'wahrheit', 'wahrnehmung'],
    begriffe: ['Argument', 'Gedankenexperiment', 'These'],
    jahrgang: { NW: [5, 6], BY: [10, 10] }
  }
]
