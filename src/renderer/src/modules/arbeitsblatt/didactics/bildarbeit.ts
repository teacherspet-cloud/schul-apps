/**
 * Die Arbeit mit Bildern – was in welchem Fach damit geschieht.
 *
 * Wunsch der Lehrkraft (25.09.2026): „Recherchiere intensiv zur Arbeit mit Bildmaterial in den
 * verschiedenen Fächern."
 *
 * DER BEFUND, DER DIESES MODUL NÖTIG MACHT:
 *
 * Kein einziges Fach hat bildspezifische Operatoren. Die Recherche hat fünf amtliche
 * Operatorenlisten vollständig gelesen (KMK-EPA Geschichte; Niedersachsen 2024 für Erdkunde/
 * Geschichte/Politik, Kunst, Naturwissenschaften, Deutsch, Englisch) – nirgends gibt es
 * „Bildquelle analysieren" oder „Karikatur deuten". Die niedersächsische Liste sagt das
 * ausdrücklich: Operatoren „werden durch den Kontext der Prüfungsaufgabe erst konkretisiert
 * bzw. präzisiert: durch die Formulierung bzw. Gestaltung der Aufgabenstellung, durch den
 * Bezug zu Textmaterialien, Abbildungen, Problemstellungen".
 *
 * Für eine App, die Operatoren aus Listen zieht, ist das die entscheidende Konsequenz: Der
 * Bildbezug muss in die AUFGABENSTELLUNG, nicht in den Operator. Sonst entstehen formal
 * korrekte, aber bildblinde Aufgaben („Analysieren Sie …" ohne zu sagen, was).
 *
 * DIE SCHEIDELINIE ZWISCHEN DEN FÄCHERN:
 *
 * In Geschichte, Kunst und Politik ist das Bild UNTERSUCHUNGSGEGENSTAND – Urheber,
 * Entstehungszeit, Adressat und Absicht gehören dazu. In den Fremdsprachen ist es REDEANLASS:
 * Die niedersächsische Englisch-Liste fragt durchgängig nach „message" und „the means used to
 * convey it", nach Auswahl und Begründung – nie nach Urheber oder Entstehungszeit. In den
 * Naturwissenschaften ist das Bild überwiegend SCHÜLERPRODUKT.
 *
 * Die fächerübergreifende Bilddidaktik (Bildfunktionen nach Levin, Bildbudget, Sperre für
 * Schmuckbilder) steht weiterhin in `imageDesign.ts`. Hier geht es nur um das Fachliche.
 */
import type { WorksheetMeta } from '../model/types'
import { subjectById } from '../model/subjects'

/** Fächergruppen, die Bilder auf je eigene Weise behandeln. */
export type Bildzugriff = 'quelle' | 'karikatur' | 'werk' | 'darstellung' | 'raum' | 'redeanlass' | 'keiner'

const GESELLSCHAFT_KARIKATUR = ['politik', 'werte-und-normen']
const NATURWISSENSCHAFT = ['biologie', 'chemie', 'physik', 'informatik', 'mathematik']

/**
 * Wie dieses Fach mit Bildern umgeht.
 *
 * Geschichte bekommt „quelle", Politik „karikatur" – beide arbeiten quellenkritisch, aber
 * Politik nicht mit historischer Verortung. Das war der ausdrückliche Hinweis der Lehrkraft
 * (25.09.2026): „beachte, dass geschichte durchaus speziell ist durch die historische
 * verortung."
 */
export function bildzugriff(meta: Pick<WorksheetMeta, 'subjectId'>): Bildzugriff {
  const id = meta.subjectId
  if (id === 'geschichte') return 'quelle'
  if (GESELLSCHAFT_KARIKATUR.includes(id)) return 'karikatur'
  if (id === 'kunst') return 'werk'
  if (id === 'erdkunde') return 'raum'
  if (NATURWISSENSCHAFT.includes(id)) return 'darstellung'
  if (subjectById(id).foreignLanguage) return 'redeanlass'
  return 'keiner'
}

/**
 * Die fachlichen Regeln für den Prompt.
 *
 * Jede Zeile ist entweder belegt oder als Konvention gekennzeichnet – bei Geographie sogar
 * ausdrücklich, weil die Recherche dort KEINE amtliche Schrittfolge gefunden hat.
 */
export function bildRegeln(meta: Pick<WorksheetMeta, 'subjectId' | 'subjectLabel'>): string {
  const art = bildzugriff(meta)
  if (art === 'keiner') return ''

  const gemeinsam = [
    'ARBEIT MIT DEM BILD:',
    /*
     * Der Befund, der alles andere trägt: Es gibt keine bildspezifischen Operatoren. Was das
     * Bild leisten soll, muss deshalb in der Aufgabenstellung stehen.
     */
    '- Der Bildbezug gehört in die AUFGABENSTELLUNG, nicht in den Operator: „Analysieren Sie das Wahlplakat M1 …", nicht bloß „Analysieren Sie …". Ohne diesen Bezug ist die Aufgabe formal richtig und trotzdem unbrauchbar.',
    '- Zu jedem Bild, das bearbeitet werden soll, gehört eine Aufgabe. Ein Bild, das nur danebensteht, wird überblättert.'
  ]

  const fachlich: Record<Exclude<Bildzugriff, 'keiner'>, string[]> = {
    /*
     * KMK-EPA Geschichte: Bildquellen sind Material der Aufgabenart „Interpretieren von
     * Quellen", gleichrangig mit Textquellen. Die Schrittfolge ist dieselbe; anders sind nur
     * die Beschreibungskategorien. Das Unterstützungsmaterial des Lehrplannavigators NRW
     * führt für die Bildquelle einen eigenen, zur Textquelle parallelen Merkmalskatalog:
     * „Der Bildautor (z. B. Karikaturist, Maler, Zeichner etc.), sein(e) Adressat(en) …, der
     * Zeitpunkt, zu dem das Material entstanden ist, … Anlass für die Materialerstellung, mit
     * der Bildquelle verbundene Absichten, die Quellengattung (z. B. Karikatur, Gemälde,
     * Plakat etc.)."
     */
    quelle: [
      '- Eine Bildquelle wird wie eine Textquelle eingeleitet, nur anders gefüllt: Bildautor statt Verfasser, Quellengattung (Karikatur, Plakat, Gemälde, Fotografie, Flugblatt) statt Textsorte.',
      '- Vor der Deutung steht die BESCHREIBUNG, und zwar systematisch: Aufbau des Bildes (Hauptbestandteile, Bildzentrum, Hintergrund), die dargestellten Einzelelemente, Titel sowie Bildüber- und -unterschriften.',
      '- Die Beschreibung muss so vollständig sein, dass die genannten Elemente für die anschließende Deutung zur Verfügung stehen. Erst danach wird gedeutet und im historischen Zusammenhang erklärt.',
      '- Formale Gestaltungsmittel gehören zur Analyse: Aufbau, Farbgebung, Darstellung der Figuren und ihre Interaktion, Textelemente im Bild.'
    ],
    /*
     * Landeszentrale für politische Bildung Baden-Württemberg, „Politik & Unterricht"
     * 1/2-2015, M 16 „Analyse von Karikaturen": drei Ebenen, ausdrücklich mit dem Zusatz,
     * dass nicht jede Analyse alle drei abdecken muss. Die bpb kommt in „Karikatur
     * interpretieren" mit zwei Schritten aus (beschreiben, deuten) – beides ist legitim; die
     * dreistufige Fassung bildet die Anforderungsbereiche ab und ist für Arbeiten brauchbarer.
     */
    karikatur: [
      '- Eine Karikatur wird in drei Ebenen bearbeitet: BESCHREIBEN (Thema, Titel, Bildunter- und -überschriften, zeichnerische Elemente: Figuren, Symbole, Gegenstände, Gestik, Mimik, Sprechblasen) – DEUTEN (Aussage, Tendenz, Absicht des Zeichners) – BEURTEILEN (eigenes Urteil, und zwar mit offengelegtem Maßstab).',
      '- Die Karikatur ist parteiisch, und das ist ihr Wesen, kein Mangel: Sie verdichtet, übersteigert und nimmt Partei. Genau daran wird der Umgang mit Wertungen geübt.',
      '- Bei Schaubild, Diagramm oder Statistik gilt etwas anderes: Dort geht es um Datenentnahme, um den Zusammenhang zwischen den Daten und um die Darstellung selbst (Achsen, Bezugsgrößen, Auswahl des Ausschnitts) – nicht um eine Deutung von Symbolen.'
    ],
    /*
     * Operatoren Kunst (Niedersachsen, Stand 01.02.2024). Das Fach ist als einziges
     * zweidimensional gebaut: Produktion × Rezeption. „werkimmanent interpretieren" –
     * „Sinnzusammenhänge aus Bild- oder Textquellen systematisch erschließen und eine
     * begründete Deutung formulieren, die auf einer inhaltlichen Beschreibung und formalen
     * Analyse des Werkes beruht"; „werktranszendent interpretieren" – „wie Operator
     * werkimmanent interpretieren, jedoch unter Berücksichtigung von Kontextwissen".
     *
     * Das ist die amtliche Entsprechung zu Panofskys Stufenfolge, ohne dass sie ihn nennt.
     * Die verbreitete Liste der Bildelemente (Komposition, Farbe, Licht, Perspektive, Format)
     * steht dagegen in keiner amtlichen Vorgabe – Schulbuchkonvention.
     */
    werk: [
      '- Die Werkbetrachtung geht in dieser Folge: Bildbestand beschreiben – formale Analyse nach Kriterien – Deutung. Die Deutung heißt WERKIMMANENT, solange sie sich allein auf das Werk stützt, und WERKTRANSZENDENT, sobald Kontextwissen hinzukommt.',
      '- Die Deutung muss auf der Beschreibung und der formalen Analyse aufsetzen; eine Deutung ohne Beschreibung ist keine.',
      '- Übliche Betrachtungskriterien (Schulbuchkonvention, keine amtliche Liste): Bildaufbau und Komposition, Farbe, Licht, Perspektive und Raum, Format, Linienführung, Material und Technik. Wähle die aus, die am Werk etwas hergeben.',
      '- Kunst kennt neben der Rezeption die PRODUKTION: Wo die Aufgabe gestalten lässt, gehören Auftrag, Material und Bewertungsmaßstab dazu.'
    ],
    /*
     * Operatoren für die Naturwissenschaften (Niedersachsen, Stand 15.02.2024). Die
     * Unterscheidung ist wörtlich: „zeichnen – Objekte grafisch exakt darstellen";
     * „skizzieren – Sachverhalte, Prozesse, Strukturen oder Ergebnisse übersichtlich grafisch
     * darstellen". Sie legt das Genauigkeitsniveau fest und ist damit für eine
     * Aufgabenerzeugung direkt verwertbar.
     */
    darstellung: [
      '- Hier ist das Bild meist ein SCHÜLERPRODUKT, kein Analysegegenstand. Die Operatoren legen das Genauigkeitsniveau fest: „zeichnen" heißt grafisch EXAKT, „skizzieren" heißt ÜBERSICHTLICH. Nimm den, der gemeint ist.',
      '- Ein Schema lässt bewusst weg, was nicht zum Lernziel gehört, und hebt das Wesentliche hervor; ein Foto zeigt alles, auch das Störende. Für Struktur und Funktion also die Schemazeichnung, für das Wiedererkennen (Art, Gerät, Versuchsaufbau) das Foto.',
      '- Zu einem Diagramm gehört die Auswertung: Daten ablesen, in einen Zusammenhang stellen, daraus eine Schlussfolgerung ziehen. Das bloße Beschreiben der Kurve ist noch keine Auswertung.'
    ],
    /*
     * Für Geographie hat die Recherche KEINE amtliche Schrittfolge gefunden – weder in den
     * Bildungsstandards der Deutschen Gesellschaft für Geographie noch in den geprüften
     * Lehrplänen. Was hier steht, ist Unterrichtskonvention aus Schulbüchern und Atlanten,
     * und der Kommentar sagt das, damit es niemand für eine Vorgabe hält.
     *
     * Belegt sind nur die Operatoren (Niedersachsen 2024): „gliedern – einen Raum, eine Zeit
     * oder einen Sachverhalt nach selbst gewählten oder vorgegebenen Kriterien systematisierend
     * ordnen"; „analysieren – Materialien, Sachverhalte oder Räume beschreiben,
     * kriterienorientiert oder aspektgeleitet erschließen und strukturiert darstellen".
     */
    raum: [
      '- Karten und Diagramme werden in dieser Folge ausgewertet (Unterrichtskonvention, keine amtliche Vorgabe): orientieren (Titel, Legende, Maßstab, Raum und Zeit) – beschreiben (Verteilungen, Muster) – erklären (Ursachen) – beurteilen.',
      '- Beim Klimadiagramm gehören dazu: Lage der Station, Ablesen der Temperatur- und Niederschlagswerte, Jahresmittel und Jahresschwankung, Trocken- und Feuchtzeiten, daraus die Zuordnung zur Klimazone und die Folgerungen für Vegetation oder Landnutzung.',
      '- Die Aufgabe nennt immer den RAUM, um den es geht. „Analysieren Sie die Karte" ohne Raumbezug ist keine geographische Aufgabe.',
      '- Bei einem Profilschnitt gehört die Überhöhung der Höhenachse angegeben, sonst täuscht das Bild.'
    ],
    /*
     * Operatoren Englisch (Niedersachsen, Stand 01.02.2024, auf Grundlage der IQB-Liste). Im
     * Bereich Schreiben kommt das Bild nicht vor, im Bereich Sprechen durchgängig: „Talk about
     * the pictures.", „Explain the message of the cartoon … and the means used to convey it.",
     * „Which picture would you choose …? Give reasons for your choice."
     */
    redeanlass: [
      '- In der Fremdsprache ist das Bild ein SPRECHANLASS, kein Untersuchungsgegenstand: Gefragt wird nach dem, was zu sehen ist, nach der Aussage („message") und den Mitteln, mit denen sie transportiert wird – nicht nach Urheber, Entstehungszeit oder Quellenwert.',
      '- Gut geeignet sind Aufgaben, die eine Auswahl verlangen und begründen lassen („Which picture …? Give reasons.") oder die zwei Bilder vergleichen.',
      '- Ausnahme ist der cartoon: Dort kommt mit „the means used to convey it" ein Analyseelement hinzu.'
    ]
  }

  const barrierefrei = [
    '',
    /*
     * W3C Web Accessibility Initiative, Images Tutorial: informative Bilder brauchen eine
     * „short, meaningful description", dekorative einen leeren Alternativtext, komplexe
     * Darstellungen (Diagramme, Schemata) ein vollständiges Textäquivalent.
     *
     * Der zweite Satz ist eine Ableitung, aber eine wichtige: Ein Alternativtext, der ein Bild
     * schon deutet, nimmt blinden Lernenden genau die Leistung ab, die die Aufgabe prüft.
     */
    'ALTERNATIVTEXT (description):',
    '- Beschreibe, was zu sehen ist – nicht, was es bedeutet. Bei einer Analyseaufgabe nimmt eine Deutung im Alternativtext („Plakat, das vor Hindenburg warnt") blinden Lernenden genau die Leistung ab, die geprüft wird.',
    '- Ein Diagramm, Schema oder eine Karte braucht kein kurzes Etikett, sondern die Angaben selbst: Achsen, Werte, Verlauf.'
  ]

  return [...gemeinsam, ...fachlich[art], ...barrierefrei].join('\n')
}

/**
 * Pixelmaße eines Bildes aus seinem Data-URL lesen.
 *
 * Ohne DOM, damit die Prüfung eine reine Funktion bleibt und sich testen lässt. Unterstützt
 * PNG (Maße stehen fest im IHDR-Kopf) und JPEG (Maße stehen im SOF-Abschnitt, dessen Lage
 * variiert). Bei allem anderen kommt `null` – dann wird nicht gewarnt, statt zu raten.
 */
export function bildmasse(dataUrl: string): { breite: number; hoehe: number } | null {
  const komma = dataUrl.indexOf(',')
  if (komma < 0 || !dataUrl.startsWith('data:image/')) return null
  let bytes: Uint8Array
  try {
    const roh = atob(dataUrl.slice(komma + 1))
    bytes = Uint8Array.from(roh, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
  const lies32 = (i: number): number => (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]

  // PNG: 8 Byte Signatur, dann der IHDR-Chunk mit Breite und Höhe ab Byte 16
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { breite: lies32(16), hoehe: lies32(20) }
  }

  // JPEG: die Marker durchlaufen, bis ein SOF-Abschnitt kommt (0xFFC0–0xFFCF, ohne C4/C8/CC)
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++
        continue
      }
      const marker = bytes[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { hoehe: (bytes[i + 5] << 8) | bytes[i + 6], breite: (bytes[i + 7] << 8) | bytes[i + 8] }
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3])
    }
  }
  return null
}

/**
 * Die Untergrenze, ab der ein Bild auf dem Blatt noch „detailgetreu" zu analysieren ist.
 *
 * Die einzige amtliche Vorgabe zur Bildqualität, die die Recherche gefunden hat, steht in der
 * KMK-EPA Geschichte (Abschnitt 3.3.3): „Insbesondere sind bildliche Quellen nur in einer
 * Qualität zugelassen, die es den Prüflingen erlaubt, detailgetreu zu analysieren und dabei
 * auch ästhetische Gesichtspunkte nicht zu vernachlässigen."
 *
 * „Detailgetreu" ist keine Zahl. Nachrechnen lässt sich aber, wie groß das Bild auf dem Blatt
 * wird: Bei 150 Bildpunkten je Zoll ist ein Druck noch ordentlich lesbar – darunter werden
 * Schrift im Bild und feine Linien unscharf. Die Schwelle ergibt sich damit aus der
 * tatsächlichen Breite auf dem Papier, nicht aus einer festen Pixelzahl.
 */
export const DRUCK_DPI = 150

/** Wie breit das Bild mindestens sein muss, um bei dieser Blattbreite scharf zu sein. */
export function mindestbreite(contentWidthMm: number, widthPercent: number): number {
  const mm = (contentWidthMm * Math.max(10, Math.min(100, widthPercent))) / 100
  return Math.round((mm / 25.4) * DRUCK_DPI)
}
