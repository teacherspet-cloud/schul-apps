/**
 * Die Fächer aller Programme – EINE Quelle der Wahrheit (30.09.2026).
 *
 * Auftrag der Lehrkraft: „Stelle sicher, dass alle Bundesländer, Schulformen und Fächer in jeder
 * App verfügbar und vollständig eingepflegt sind – einschließlich bilingualer Varianten." Bis
 * dahin standen die Fächer an vier Stellen: `SUBJECTS` (Arbeitsblatt und die meisten Programme),
 * `WEITERE_FAECHER` (nur Niederländisch, nur Vokabeltest), die Fächer der Klassenarbeit und die
 * Sprachen des Vokabeltests. Merkmale wie „Fremdsprache" oder „bilingual möglich" rechnete jedes
 * Programm selbst aus.
 *
 * Hier steht je Fach: Kennung (unveränderlich – Materialien tragen sie), Anzeigename, Kürzel,
 * Fachart, Zielsprache (moderne Fremdsprachen) bzw. Übersetzungssprache (Latein, Griechisch),
 * Formeln, ob bilingualer Sachfachunterricht möglich ist, die vorgeschlagene Fachfarbe (Name aus
 * der Palette in renderer/shared/fachfarben.ts) und andere Namen, unter denen das Fach in den
 * Ländern läuft (für das Erkennen aus Dateien und Materialnamen).
 *
 * Neue Fächer (30.09.2026): Niederländisch (vorher nur Vokabeltest), Polnisch, Tschechisch,
 * Portugiesisch, Türkisch, Chinesisch – Fremdsprachen mit Lehrplänen in mehreren Ländern –,
 * Gesellschaftslehre, Naturwissenschaften, Arbeitslehre (Integrationsfächer der Gesamt-, Ober-
 * und Sekundarschulen), Darstellendes Spiel und Pädagogik. Weitere Fächer (Japanisch,
 * Neugriechisch, Dänisch, Arabisch, Psychologie, Hauswirtschaft) scheitern an der Farbpalette:
 * Mehr druckfeste Farben mit ΔE₀₀ ≥ 12 gibt es nicht (Suche vom 30.09.2026) – sie laufen unter
 * „Anderes Fach". Siehe recherche/audit-laender-schulformen-faecher-2026-09-30.md.
 */

export type FachArt =
  | 'deutsch'
  | 'fremdsprache'
  | 'alte-sprache'
  | 'mathematik'
  | 'naturwissenschaft'
  | 'informatik'
  | 'gesellschaft'
  | 'musisch'
  | 'sport'
  | 'grundschule'
  | 'sonstiges'

export interface Fach {
  id: string
  label: string
  /** Übliches Kürzel (Stundenplan, Dateinamen) */
  kuerzel: string
  art: FachArt
  /** Sprachcode der modernen Fremdsprache (GER-Niveau, Hörverstehen, Anweisungen in der Zielsprache) */
  sprache?: string
  /** Sprachcode, aus dem ins Deutsche übersetzt wird (Latein, Griechisch) */
  uebersetzungssprache?: string
  /** Formeln üblich */
  formeln?: boolean
  /** Name der vorgeschlagenen Fachfarbe in der Palette (fachfarben.ts) */
  farbe: string
  /** Andere Bezeichnungen in den Ländern */
  auch?: string[]
}

export const FAECHER: Fach[] = [
  { id: 'deutsch', label: 'Deutsch', kuerzel: 'D', art: 'deutsch', farbe: 'Rot' },
  { id: 'englisch', label: 'Englisch', kuerzel: 'E', art: 'fremdsprache', sprache: 'en', farbe: 'Dunkelblau' },
  { id: 'franzoesisch', label: 'Französisch', kuerzel: 'F', art: 'fremdsprache', sprache: 'fr', farbe: 'Violett' },
  { id: 'spanisch', label: 'Spanisch', kuerzel: 'S', art: 'fremdsprache', sprache: 'es', farbe: 'Orange' },
  { id: 'italienisch', label: 'Italienisch', kuerzel: 'I', art: 'fremdsprache', sprache: 'it', farbe: 'Tannengrün' },
  { id: 'latein', label: 'Latein', kuerzel: 'L', art: 'alte-sprache', uebersetzungssprache: 'la', farbe: 'Braun' },
  { id: 'russisch', label: 'Russisch', kuerzel: 'Ru', art: 'fremdsprache', sprache: 'ru', farbe: 'Khaki' },
  { id: 'griechisch', label: 'Griechisch', kuerzel: 'Gr', art: 'alte-sprache', uebersetzungssprache: 'grc', farbe: 'Kastanie', auch: ['Altgriechisch'] },
  // 30.09.2026: weitere Schulfremdsprachen mit Lehrplänen der Länder
  { id: 'niederlaendisch', label: 'Niederländisch', kuerzel: 'N', art: 'fremdsprache', sprache: 'nl', farbe: 'Rostrot' },
  { id: 'polnisch', label: 'Polnisch', kuerzel: 'Pl', art: 'fremdsprache', sprache: 'pl', farbe: 'Ochsenblut' },
  { id: 'tschechisch', label: 'Tschechisch', kuerzel: 'Tsch', art: 'fremdsprache', sprache: 'cs', farbe: 'Nachtblau' },
  { id: 'portugiesisch', label: 'Portugiesisch', kuerzel: 'Pt', art: 'fremdsprache', sprache: 'pt', farbe: 'Dunkeloliv' },
  { id: 'tuerkisch', label: 'Türkisch', kuerzel: 'Tü', art: 'fremdsprache', sprache: 'tr', farbe: 'Heide' },
  { id: 'chinesisch', label: 'Chinesisch', kuerzel: 'Chin', art: 'fremdsprache', sprache: 'zh', farbe: 'Brombeere' },
  { id: 'mathematik', label: 'Mathematik', kuerzel: 'M', art: 'mathematik', formeln: true, farbe: 'Blau' },
  { id: 'biologie', label: 'Biologie', kuerzel: 'Bio', art: 'naturwissenschaft', formeln: true, farbe: 'Grün' },
  { id: 'chemie', label: 'Chemie', kuerzel: 'Ch', art: 'naturwissenschaft', formeln: true, farbe: 'Türkis' },
  { id: 'physik', label: 'Physik', kuerzel: 'Ph', art: 'naturwissenschaft', formeln: true, farbe: 'Petrol' },
  {
    id: 'naturwissenschaften',
    label: 'Naturwissenschaften (NaWi)',
    kuerzel: 'NW',
    art: 'naturwissenschaft',
    formeln: true,
    farbe: 'Salbei',
    auch: ['NaWi', 'Naturwissenschaften', 'Biologie-Naturphänomene-Technik', 'BNT', 'Natur und Technik', 'Naturphänomene']
  },
  { id: 'informatik', label: 'Informatik', kuerzel: 'If', art: 'informatik', formeln: true, farbe: 'Schiefergrau', auch: ['Medienbildung und Informatik'] },
  { id: 'geschichte', label: 'Geschichte', kuerzel: 'G', art: 'gesellschaft', farbe: 'Bordeaux' },
  { id: 'erdkunde', label: 'Erdkunde / Geographie', kuerzel: 'Ek', art: 'gesellschaft', farbe: 'Olivgrün', auch: ['Erdkunde', 'Geographie', 'Geografie'] },
  {
    id: 'politik',
    label: 'Politik / Wirtschaft / Sozialkunde',
    kuerzel: 'Pol',
    art: 'gesellschaft',
    farbe: 'Ocker',
    auch: [
      'Politik',
      'Politik-Wirtschaft',
      'Politik und Wirtschaft',
      'Sozialkunde',
      'Gemeinschaftskunde',
      'Sozialwissenschaften',
      'Politische Bildung',
      'Wirtschaft/Politik'
    ]
  },
  {
    id: 'wirtschaft',
    label: 'Wirtschaft',
    kuerzel: 'Wi',
    art: 'gesellschaft',
    farbe: 'Nougat',
    auch: ['Wirtschaft und Beruf', 'Wirtschaft/Berufs- und Studienorientierung', 'WBS']
  },
  {
    id: 'gesellschaftslehre',
    label: 'Gesellschaftslehre',
    kuerzel: 'GL',
    art: 'gesellschaft',
    farbe: 'Walnuss',
    auch: ['Gesellschaftswissenschaften', 'Gesellschaft', 'Welt- und Umweltkunde', 'Geschichte/Politik/Geographie']
  },
  {
    id: 'arbeitslehre',
    label: 'Arbeitslehre / Wirtschaft-Arbeit-Technik',
    kuerzel: 'AL',
    art: 'gesellschaft',
    farbe: 'Mokka',
    auch: ['Arbeitslehre', 'Wirtschaft-Arbeit-Technik', 'WAT', 'Arbeit-Wirtschaft-Technik', 'AWT', 'Wirtschaft-Technik-Haushalt', 'WTH']
  },
  {
    id: 'religion',
    label: 'Religion / Ethik',
    kuerzel: 'Rel',
    art: 'gesellschaft',
    farbe: 'Magenta',
    auch: ['Religion', 'Evangelische Religion', 'Katholische Religion']
  },
  { id: 'werte-und-normen', label: 'Werte und Normen', kuerzel: 'WuN', art: 'gesellschaft', farbe: 'Lavendel' },
  {
    id: 'ethik',
    label: 'Ethik',
    kuerzel: 'Eth',
    art: 'gesellschaft',
    farbe: 'Indigo',
    auch: ['LER', 'Lebensgestaltung-Ethik-Religionskunde', 'Praktische Philosophie']
  },
  { id: 'philosophie', label: 'Philosophie', kuerzel: 'Phil', art: 'gesellschaft', farbe: 'Aubergine' },
  { id: 'paedagogik', label: 'Pädagogik', kuerzel: 'Päd', art: 'gesellschaft', farbe: 'Taupe', auch: ['Erziehungswissenschaft', 'Pädagogik/Psychologie'] },
  { id: 'kunst', label: 'Kunst', kuerzel: 'Ku', art: 'musisch', farbe: 'Orchidee', auch: ['Bildende Kunst'] },
  { id: 'musik', label: 'Musik', kuerzel: 'Mu', art: 'musisch', farbe: 'Pflaume' },
  {
    id: 'darstellendes-spiel',
    label: 'Darstellendes Spiel / Theater',
    kuerzel: 'DS',
    art: 'musisch',
    farbe: 'Malve',
    auch: ['Darstellendes Spiel', 'Theater']
  },
  { id: 'sport', label: 'Sport', kuerzel: 'Sp', art: 'sport', farbe: 'Terrakotta' },
  // Technik (29.09.2026, Wunsch der Lehrkraft) – u. a. für Test- und Konstruktionsprotokolle
  { id: 'technik', label: 'Technik', kuerzel: 'Te', art: 'naturwissenschaft', farbe: 'Tiefseeblau' },
  { id: 'sachunterricht', label: 'Sachunterricht', kuerzel: 'SU', art: 'grundschule', farbe: 'Moosgrün', auch: ['Heimat- und Sachunterricht', 'HSU'] },
  { id: 'daz', label: 'Deutsch als Zweitsprache (DaZ)', kuerzel: 'DaZ', art: 'deutsch', farbe: 'Altrosa' },
  { id: 'anderes', label: 'Anderes Fach …', kuerzel: '–', art: 'sonstiges', farbe: 'Anthrazit' }
]

const NACH_ID = new Map(FAECHER.map((f) => [f.id, f]))

export const fachVon = (id: string): Fach | undefined => NACH_ID.get(id)

/**
 * Bilingualer Sachfachunterricht ist in allen Sachfächern möglich – nicht in Deutsch und den
 * Sprachen. Berlin, AV bilingualer Unterricht 2020, Nr. 2 Abs. 3: „Sachfächer im Sinne der
 * Regelung sind alle Unterrichtsfächer mit Ausnahme von Deutsch und den Fremdsprachen."
 */
export const bilingualFaehig = (id: string): boolean => {
  const f = NACH_ID.get(id)
  return Boolean(f) && !['deutsch', 'fremdsprache', 'alte-sprache'].includes(f!.art)
}

/** Fächer mit Vokabel- und Grammatikarbeit: moderne und alte Fremdsprachen und DaZ */
export const SPRACHFAECHER: string[] = FAECHER.filter((f) => f.art === 'fremdsprache' || f.art === 'alte-sprache' || f.id === 'daz').map((f) => f.id)

/** Sprachcode → Fach (Vokabeltests kennen nur die Sprache) */
export const FACH_ZU_SPRACHE: Record<string, string> = Object.fromEntries(
  FAECHER.filter((f) => f.sprache || f.uebersetzungssprache).map((f) => [f.sprache ?? f.uebersetzungssprache!, f.id])
)

/** Deutscher Name einer Sprache nach Code (en → Englisch) */
export const SPRACHNAMEN: Record<string, string> = {
  de: 'Deutsch',
  ...Object.fromEntries(FAECHER.filter((f) => f.sprache || f.uebersetzungssprache).map((f) => [f.sprache ?? f.uebersetzungssprache!, f.label]))
}

/** Fach aus Kennung, Anzeigename oder einem der Landesnamen (Groß-/Kleinschreibung egal) */
export function fachAusName(wert: string): Fach | undefined {
  const w = wert.trim().toLocaleLowerCase('de')
  return FAECHER.find((f) => f.id === w || f.label.toLocaleLowerCase('de') === w || f.auch?.some((a) => a.toLocaleLowerCase('de') === w))
}
