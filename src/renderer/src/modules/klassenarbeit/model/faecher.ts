/**
 * Die Fächer der Klassenarbeit (Großprogramm 0.4, Phase G).
 *
 * Bis 0.3 kannte die Klassenarbeit nur Englisch und Geschichte, und überall stand
 * `subjectId === 'englisch'` bzw. `=== 'geschichte'`. Gemeint war fast immer eine Eigenschaft
 * des Fachs: „Fremdsprache" (GER-Niveau, Teilnoten Schreiben/übrige Kompetenzen, Kopf in der
 * Zielsprache, Wortschatz aus dem Lehrwerk) oder „Sachfach mit Quellen und Materialien"
 * (eine Note, Punkte nach Anteil, dasselbe Material in allen Fassungen). Diese Datei sagt je
 * Fach, was es ist; die Programmteile fragen danach statt nach dem Namen.
 *
 * Formatkennungen der Fremdsprachen: `<sprache>-<art>` (en-writing, fr-writing, es-writing …),
 * damit jede Stelle, die eine Art meint („der Schreibteil"), sie für alle drei Sprachen findet.
 */
export type ExamSubjectId =
  | 'englisch'
  | 'franzoesisch'
  | 'spanisch'
  | 'deutsch'
  | 'geschichte'
  | 'politik'
  | 'erdkunde'
  // 29.09.2026 (Wunsch der Lehrkraft: Klassenarbeiten in allen Fächern; recherche/klassenarbeiten-faecher-neu-2026-09-29.md)
  | 'italienisch'
  | 'russisch'
  | 'latein'
  | 'griechisch'
  | 'mathematik'
  | 'informatik'
  | 'biologie'
  | 'chemie'
  | 'physik'
  | 'technik'
  | 'wirtschaft'
  | 'religion'
  | 'ethik'
  | 'philosophie'
  | 'werte-und-normen'
  | 'musik'
  | 'kunst'

/**
 * Art des Fachs – die Programmteile fragen danach statt nach dem Namen.
 * - fremdsprache: Teilnoten Schreiben/übrige Kompetenzen, Kopf in der Zielsprache
 * - alte-sprache: Übersetzung (Fehlerquote, eigene Teilnote) + Begleitaufgaben (Punkte), 2 : 1
 * - mathematik: Punkte je Teilaufgabe, Teil A ohne Hilfsmittel
 * - naturwissenschaft: Punkte, Versuch und Messwerte, Einheiten als fachliche Fehler
 * - informatik: wie Naturwissenschaft, Code auf Papier oder am Rechner
 * - gesellschaft: Material, Urteil, eine Note (auch Wirtschaft, Religion, Ethik, Philosophie, WuN)
 * - musisch: kurze Lernkontrollen mit Hör- bzw. Bildmaterial
 */
export type FachArt = 'fremdsprache' | 'deutsch' | 'gesellschaft' | 'alte-sprache' | 'mathematik' | 'naturwissenschaft' | 'informatik' | 'musisch'
export type Zielsprache = 'en' | 'fr' | 'es' | 'it' | 'ru' | 'de'

/** Arten der Fremdsprachen-Teile */
export type FormatArt = 'listening' | 'reading' | 'mediation' | 'writing' | 'language' | 'grammar' | 'speaking'

export interface KopfTexte {
  /** Titel, wenn die Lehrkraft keinen setzt */
  titel: string
  /** Fachname im Kopf */
  fach: string
  teil: string
  punkte: string
  gruppe: string
}

export interface KlassenarbeitFach {
  id: ExamSubjectId
  label: string
  art: FachArt
  /** Sprache der Arbeit – bei Fremdsprachen die Zielsprache */
  sprache: Zielsprache
  /** Kennung der Formate (Präfix vor dem Bindestrich) */
  praefix: string
  /** Hauptfach (Zahl der Arbeiten nach `mainSubject` der Länderregeln) */
  hauptfach: boolean
  /** Beispielthema im Eingabefeld */
  beispiel: string
  kopf: KopfTexte
}

const DEUTSCHER_KOPF = (fach: string): KopfTexte => ({ titel: `Klassenarbeit ${fach}`, fach, teil: 'Teil', punkte: 'Punkte', gruppe: 'Gruppe' })

export const KLASSENARBEIT_FAECHER: KlassenarbeitFach[] = [
  {
    id: 'englisch',
    label: 'Englisch',
    art: 'fremdsprache',
    sprache: 'en',
    praefix: 'en',
    hauptfach: true,
    beispiel: 'z. B. Going abroad',
    kopf: { titel: 'English test', fach: 'English', teil: 'Part', punkte: 'points', gruppe: 'Group' }
  },
  {
    id: 'franzoesisch',
    label: 'Französisch',
    art: 'fremdsprache',
    sprache: 'fr',
    praefix: 'fr',
    hauptfach: true,
    beispiel: 'z. B. Les vacances en Bretagne',
    kopf: { titel: 'Contrôle', fach: 'Français', teil: 'Partie', punkte: 'points', gruppe: 'Groupe' }
  },
  {
    id: 'spanisch',
    label: 'Spanisch',
    art: 'fremdsprache',
    sprache: 'es',
    praefix: 'es',
    hauptfach: true,
    beispiel: 'z. B. Mi ciudad',
    kopf: { titel: 'Examen', fach: 'Español', teil: 'Parte', punkte: 'puntos', gruppe: 'Grupo' }
  },
  {
    id: 'deutsch',
    label: 'Deutsch',
    art: 'deutsch',
    sprache: 'de',
    praefix: 'de',
    hauptfach: true,
    beispiel: 'z. B. Kurzgeschichten',
    kopf: DEUTSCHER_KOPF('Deutsch')
  },
  {
    id: 'geschichte',
    label: 'Geschichte',
    art: 'gesellschaft',
    sprache: 'de',
    praefix: 'ge',
    hauptfach: false,
    beispiel: 'z. B. Industrialisierung',
    kopf: DEUTSCHER_KOPF('Geschichte')
  },
  {
    id: 'politik',
    label: 'Politik',
    art: 'gesellschaft',
    sprache: 'de',
    praefix: 'pol',
    hauptfach: false,
    beispiel: 'z. B. Wahlen in Deutschland',
    kopf: DEUTSCHER_KOPF('Politik')
  },
  {
    id: 'erdkunde',
    label: 'Erdkunde',
    art: 'gesellschaft',
    sprache: 'de',
    praefix: 'geo',
    hauptfach: false,
    beispiel: 'z. B. Klimazonen der Erde',
    kopf: DEUTSCHER_KOPF('Erdkunde')
  },
  // ---------- 29.09.2026 ----------
  {
    id: 'italienisch',
    label: 'Italienisch',
    art: 'fremdsprache',
    sprache: 'it',
    praefix: 'it',
    hauptfach: true,
    beispiel: 'z. B. La mia famiglia',
    // Kopfzeilen nach der Recherche; sprachlich geprüfte Standardbegriffe
    kopf: { titel: 'Verifica', fach: 'Italiano', teil: 'Parte', punkte: 'punti', gruppe: 'Gruppo' }
  },
  {
    id: 'russisch',
    label: 'Russisch',
    art: 'fremdsprache',
    sprache: 'ru',
    praefix: 'ru',
    hauptfach: true,
    beispiel: 'z. B. Моя семья',
    kopf: { titel: 'Контрольная работа', fach: 'Русский язык', teil: 'Часть', punkte: 'баллы', gruppe: 'Группа' }
  },
  {
    id: 'latein',
    label: 'Latein',
    art: 'alte-sprache',
    sprache: 'de',
    praefix: 'la',
    hauptfach: true,
    beispiel: 'z. B. Odysseus und Polyphem',
    kopf: DEUTSCHER_KOPF('Latein')
  },
  {
    id: 'griechisch',
    label: 'Griechisch',
    art: 'alte-sprache',
    sprache: 'de',
    praefix: 'grc',
    hauptfach: true,
    beispiel: 'z. B. Sokrates vor Gericht',
    kopf: DEUTSCHER_KOPF('Griechisch')
  },
  {
    id: 'mathematik',
    label: 'Mathematik',
    art: 'mathematik',
    sprache: 'de',
    praefix: 'ma',
    hauptfach: true,
    beispiel: 'z. B. Lineare Funktionen',
    kopf: DEUTSCHER_KOPF('Mathematik')
  },
  {
    id: 'informatik',
    label: 'Informatik',
    art: 'informatik',
    sprache: 'de',
    praefix: 'inf',
    hauptfach: false,
    beispiel: 'z. B. Sortieralgorithmen',
    kopf: DEUTSCHER_KOPF('Informatik')
  },
  {
    id: 'biologie',
    label: 'Biologie',
    art: 'naturwissenschaft',
    sprache: 'de',
    praefix: 'bio',
    hauptfach: false,
    beispiel: 'z. B. Fotosynthese',
    kopf: DEUTSCHER_KOPF('Biologie')
  },
  {
    id: 'chemie',
    label: 'Chemie',
    art: 'naturwissenschaft',
    sprache: 'de',
    praefix: 'ch',
    hauptfach: false,
    beispiel: 'z. B. Säuren und Basen',
    kopf: DEUTSCHER_KOPF('Chemie')
  },
  {
    id: 'physik',
    label: 'Physik',
    art: 'naturwissenschaft',
    sprache: 'de',
    praefix: 'ph',
    hauptfach: false,
    beispiel: 'z. B. Elektrischer Stromkreis',
    kopf: DEUTSCHER_KOPF('Physik')
  },
  {
    id: 'technik',
    label: 'Technik',
    art: 'naturwissenschaft',
    sprache: 'de',
    praefix: 'te',
    hauptfach: false,
    beispiel: 'z. B. Brückenbau',
    kopf: DEUTSCHER_KOPF('Technik')
  },
  {
    id: 'wirtschaft',
    label: 'Wirtschaft',
    art: 'gesellschaft',
    sprache: 'de',
    praefix: 'wi',
    hauptfach: false,
    beispiel: 'z. B. Der Wirtschaftskreislauf',
    kopf: DEUTSCHER_KOPF('Wirtschaft')
  },
  {
    id: 'religion',
    label: 'Religion',
    art: 'gesellschaft',
    sprache: 'de',
    praefix: 're',
    hauptfach: false,
    beispiel: 'z. B. Das Gleichnis vom verlorenen Sohn',
    kopf: DEUTSCHER_KOPF('Religion')
  },
  {
    id: 'ethik',
    label: 'Ethik',
    art: 'gesellschaft',
    sprache: 'de',
    praefix: 'eth',
    hauptfach: false,
    beispiel: 'z. B. Gerechtigkeit',
    kopf: DEUTSCHER_KOPF('Ethik')
  },
  {
    id: 'philosophie',
    label: 'Philosophie',
    art: 'gesellschaft',
    sprache: 'de',
    praefix: 'phil',
    hauptfach: false,
    beispiel: 'z. B. Was ist Glück?',
    kopf: DEUTSCHER_KOPF('Philosophie')
  },
  {
    id: 'werte-und-normen',
    label: 'Werte und Normen',
    art: 'gesellschaft',
    sprache: 'de',
    praefix: 'wun',
    hauptfach: false,
    beispiel: 'z. B. Freundschaft',
    kopf: DEUTSCHER_KOPF('Werte und Normen')
  },
  {
    id: 'musik',
    label: 'Musik',
    art: 'musisch',
    sprache: 'de',
    praefix: 'mu',
    hauptfach: false,
    beispiel: 'z. B. Die Sonatenhauptsatzform',
    kopf: DEUTSCHER_KOPF('Musik')
  },
  {
    id: 'kunst',
    label: 'Kunst',
    art: 'musisch',
    sprache: 'de',
    praefix: 'ku',
    hauptfach: false,
    beispiel: 'z. B. Der Expressionismus',
    kopf: DEUTSCHER_KOPF('Kunst')
  }
]

const NACH_ID = new Map(KLASSENARBEIT_FAECHER.map((f) => [f.id, f]))

/** Das Fach der Arbeit; Unbekanntes (alte oder fremde Datei) gilt als Englisch */
export const fachDerArbeit = (id: string): KlassenarbeitFach => NACH_ID.get(id as ExamSubjectId) ?? KLASSENARBEIT_FAECHER[0]

export const istKlassenarbeitsFach = (id: string): id is ExamSubjectId => NACH_ID.has(id as ExamSubjectId)
export const istFremdsprache = (id: string): boolean => fachDerArbeit(id).art === 'fremdsprache'
export const istGesellschaftsfach = (id: string): boolean => fachDerArbeit(id).art === 'gesellschaft'
export const istAlteSprache = (id: string): boolean => fachDerArbeit(id).art === 'alte-sprache'
export const istMathematik = (id: string): boolean => fachDerArbeit(id).art === 'mathematik'
/** Naturwissenschaften, Technik und Informatik: Punkte je Teilaufgabe, Einheiten, Versuche */
export const istMint = (id: string): boolean => ['mathematik', 'naturwissenschaft', 'informatik'].includes(fachDerArbeit(id).art)
/** Fächer mit Versuchen, Messungen oder Beobachtungen – dort gibt es die Karte „Versuch mit Protokoll" */
export const hatVersuche = (id: string): boolean => ['biologie', 'chemie', 'physik', 'technik', 'informatik', 'erdkunde'].includes(id)
/** Bezeichnung der eigenen Teilnote: Schreiben (Fremdsprachen) bzw. Übersetzung (Latein, Griechisch) */
export const eigeneTeilnoteLabel = (id: string): string => (istAlteSprache(id) ? 'Übersetzung' : 'Schreiben')

const FREMDSPRACH_PRAEFIXE = new Set(KLASSENARBEIT_FAECHER.filter((f) => f.art === 'fremdsprache').map((f) => f.praefix))
const ARTEN: FormatArt[] = ['listening', 'reading', 'mediation', 'writing', 'language', 'grammar', 'speaking']

/** Die Art eines Fremdsprachen-Teils (`fr-writing` → writing); null bei anderen Fächern */
export function formatArt(formatId: string | undefined): FormatArt | null {
  const [praefix, art] = (formatId ?? '').split('-')
  return FREMDSPRACH_PRAEFIXE.has(praefix) && ARTEN.includes(art as FormatArt) ? (art as FormatArt) : null
}

/** Die Formatkennung einer Art im Fach (`franzoesisch`, writing → fr-writing) */
export const formatIdFuer = (fach: string, art: FormatArt): string => `${fachDerArbeit(fach).praefix}-${art}`

/**
 * Aufteilung eines produktiven Teils: In den Fremdsprachen üblich 40 % Inhalt, 60 % Sprache.
 * In Deutsch heißt der zweite Teil „Darstellung" (Aufbau, Ausdruck, sprachliche Richtigkeit)
 * und wiegt weniger – in den Abiturvorgaben der Länder etwa 70 : 30.
 */
export const inhaltsanteil = (fach: string): number => (fachDerArbeit(fach).art === 'deutsch' ? 70 : 40)
export const zweiterTeil = (fach: string): string => (fachDerArbeit(fach).art === 'deutsch' ? 'Darstellung' : 'Sprache')

/** Die wievielte Fremdsprache: Englisch immer die erste, Französisch/Spanisch nach Angabe (fehlt = 2.) */
export const sprachfolge = (m: { subjectId: string; languageOrder?: number }): number => (m.subjectId === 'englisch' ? 1 : (m.languageOrder ?? 2))
