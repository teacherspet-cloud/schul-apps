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
export type ExamSubjectId = 'englisch' | 'franzoesisch' | 'spanisch' | 'deutsch' | 'geschichte' | 'politik' | 'erdkunde'

export type FachArt = 'fremdsprache' | 'deutsch' | 'gesellschaft'
export type Zielsprache = 'en' | 'fr' | 'es' | 'de'

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
  }
]

const NACH_ID = new Map(KLASSENARBEIT_FAECHER.map((f) => [f.id, f]))

/** Das Fach der Arbeit; Unbekanntes (alte oder fremde Datei) gilt als Englisch */
export const fachDerArbeit = (id: string): KlassenarbeitFach => NACH_ID.get(id as ExamSubjectId) ?? KLASSENARBEIT_FAECHER[0]

export const istKlassenarbeitsFach = (id: string): id is ExamSubjectId => NACH_ID.has(id as ExamSubjectId)
export const istFremdsprache = (id: string): boolean => fachDerArbeit(id).art === 'fremdsprache'
export const istGesellschaftsfach = (id: string): boolean => fachDerArbeit(id).art === 'gesellschaft'

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
