/**
 * Art und Bezeichnung des Leistungsnachweises je Land, Schulform, Fach und Jahrgang.
 *
 * ANLASS (Wunsch der Lehrkraft 29.09.2026, per Auswahl entschieden: „automatisch nach
 * Land/Fach, änderbar"): Die Klassenarbeit hieß überall „Klassenarbeit". In Bayern heißt sie
 * aber Schulaufgabe, außerhalb der Kernfächer gibt es dort nur Kurzarbeiten und
 * Stegreifaufgaben; in NRW, Bremen, Rheinland-Pfalz oder im Saarland werden in vielen Fächern
 * der Sek I gar keine Klassenarbeiten geschrieben; in der Oberstufe heißt die Arbeit Klausur.
 * `nachweisFuer` liefert den VORSCHLAG – die Oberfläche übernimmt ihn als Vorbelegung, die
 * Lehrkraft kann ihn ändern (Auswahl: `NACHWEIS_BEZEICHNUNGEN`).
 *
 * GRUNDLAGE: Recherchebericht `recherche/klassenarbeiten-laender-2026-09-29.md` (amtliche
 * Primärtexte, Stand 29.09.2026) und für NRW-Sachfächer die Kernlehrpläne G9 (Kap. 3, laut
 * `recherche/klassenarbeiten-pruefung-vorhandene-faecher-2026-09-29.md`, Befund G1). Die
 * Fundstelle steht je Ergebnis in `quelle`; was der Bericht „nicht gesichert" nennt, trägt
 * `nichtGesichert: true` und sagt das im Hinweis.
 *
 * Bayern (Gymnasium G9 je Ausbildungsrichtung, Realschule, Mittelschule) seit 29.09.2026 nach
 * `recherche/bayern-schulaufgaben-2026-09-29.md` (GSO §§ 16, 21–25 und Anlage 1, RSO §§ 17–20,
 * MSO § 12, jeweils Fassung ab 01.08.2026).
 *
 * Wo der Bericht nichts belegt, heißt der Vorschlag neutral „Klassenarbeit" – ohne Anzahl,
 * Dauer oder Behauptung.
 *
 * Die Fächer kommen als beliebige Kennung (string): Die Klassenarbeit bekommt laufend neue
 * Fächer; Unbekanntes fällt in die Gruppe „sonstiges" und damit unter die Regeln für die
 * übrigen Fächer des Landes.
 */
import { istFremdsprache, istKlassenarbeitsFach } from './faecher'
import { datenSchulform, schulformVon } from '@shared/schulformen'

export interface NachweisAnfrage {
  stateId: string
  schoolTypeId: string
  subjectId: string
  grade: number
  /** Bayern, Gymnasium: Ausbildungsrichtung der Klasse (29.09.2026) – ohne Angabe nennt der Hinweis beide Fälle */
  ausbildungsrichtung?: ByZweig
}

export interface Nachweis {
  /** Vorgeschlagene Bezeichnung für Kopf und Titel (z. B. „Schulaufgabe", „Klausur") */
  bezeichnung: string
  /** Dauer nach Landesvorgabe, wo geregelt */
  dauer?: string
  /** Zahl im Schuljahr (bzw. Halbjahr/Jahrgangsblock – steht dann dabei) */
  anzahl?: string
  /** Ein bis zwei Sätze zur Einordnung – unpersönlich formuliert */
  hinweis?: string
  /** In diesem Fach/Jahrgang sind im Land keine Klassenarbeiten (große Arbeiten) vorgesehen */
  keineKlassenarbeit?: boolean
  /** Vorschrift mit Paragraph bzw. Nummer */
  quelle?: string
  /** Der Bericht nennt die Grundlage „nicht gesichert" */
  nichtGesichert?: boolean
}

/** Bezeichnungen zur Auswahl, wenn die Lehrkraft den Vorschlag ändert */
export const NACHWEIS_BEZEICHNUNGEN = [
  'Klassenarbeit',
  'Schulaufgabe',
  'Kurzarbeit',
  'Stegreifaufgabe',
  'Klausur',
  'Kursarbeit',
  'schriftliche Arbeit',
  'schriftliche Lernkontrolle',
  'Lernkontrolle',
  'schriftliche Lernerfolgskontrolle',
  'schriftliche Überprüfung',
  'schriftliche Kurzkontrolle',
  'großer Leistungsnachweis',
  'kleiner Leistungsnachweis',
  'schriftlicher Leistungsnachweis',
  'Leistungsnachweis',
  'Test'
] as const

// ---------------------------------------------------------------------------------------------
// Fächer
// ---------------------------------------------------------------------------------------------

export type Fachgruppe =
  | 'deutsch'
  | 'mathematik'
  | 'fremdsprache'
  | 'alteSprache'
  | 'naturwissenschaft'
  | 'gesellschaft'
  | 'religion'
  | 'aesthetik'
  | 'sport'
  | 'technik'
  | 'informatik'
  | 'sonstiges'

const GRUPPEN: Record<string, Fachgruppe> = {
  deutsch: 'deutsch',
  mathematik: 'mathematik',
  englisch: 'fremdsprache',
  franzoesisch: 'fremdsprache',
  spanisch: 'fremdsprache',
  italienisch: 'fremdsprache',
  russisch: 'fremdsprache',
  niederlaendisch: 'fremdsprache',
  polnisch: 'fremdsprache',
  tuerkisch: 'fremdsprache',
  portugiesisch: 'fremdsprache',
  chinesisch: 'fremdsprache',
  japanisch: 'fremdsprache',
  daenisch: 'fremdsprache',
  schwedisch: 'fremdsprache',
  latein: 'alteSprache',
  griechisch: 'alteSprache',
  biologie: 'naturwissenschaft',
  chemie: 'naturwissenschaft',
  physik: 'naturwissenschaft',
  naturwissenschaften: 'naturwissenschaft',
  geschichte: 'gesellschaft',
  erdkunde: 'gesellschaft',
  geographie: 'gesellschaft',
  geografie: 'gesellschaft',
  politik: 'gesellschaft',
  wirtschaft: 'gesellschaft',
  'wirtschaft-politik': 'gesellschaft',
  'politik-wirtschaft': 'gesellschaft',
  sozialkunde: 'gesellschaft',
  gemeinschaftskunde: 'gesellschaft',
  gesellschaftslehre: 'gesellschaft',
  weltkunde: 'gesellschaft',
  religion: 'religion',
  ethik: 'religion',
  philosophie: 'religion',
  'werte-und-normen': 'religion',
  musik: 'aesthetik',
  kunst: 'aesthetik',
  'darstellendes-spiel': 'aesthetik',
  theater: 'aesthetik',
  sport: 'sport',
  technik: 'technik',
  arbeitslehre: 'technik',
  informatik: 'informatik'
}

const LABELS: Record<string, string> = {
  englisch: 'Englisch',
  franzoesisch: 'Französisch',
  spanisch: 'Spanisch',
  italienisch: 'Italienisch',
  russisch: 'Russisch',
  latein: 'Latein',
  griechisch: 'Griechisch',
  deutsch: 'Deutsch',
  mathematik: 'Mathematik',
  biologie: 'Biologie',
  chemie: 'Chemie',
  physik: 'Physik',
  technik: 'Technik',
  informatik: 'Informatik',
  geschichte: 'Geschichte',
  erdkunde: 'Erdkunde',
  politik: 'Politik',
  wirtschaft: 'Wirtschaft',
  religion: 'Religion',
  ethik: 'Ethik',
  philosophie: 'Philosophie',
  'werte-und-normen': 'Werte und Normen',
  musik: 'Musik',
  kunst: 'Kunst',
  sport: 'Sport'
}

/** Gruppe eines Fachs; unbekannte Kennungen: Fremdsprache laut faecher.ts, sonst „sonstiges" */
export function fachgruppe(subjectId: string): Fachgruppe {
  const direkt = GRUPPEN[subjectId]
  if (direkt) return direkt
  if (subjectId.startsWith('religion')) return 'religion'
  // Neue Fächer der Klassenarbeit, die hier noch nicht stehen. Erst istKlassenarbeitsFach:
  // fachDerArbeit() behandelt Unbekanntes als Englisch.
  if (istKlassenarbeitsFach(subjectId) && istFremdsprache(subjectId)) return 'fremdsprache'
  return 'sonstiges'
}

/** Moderne Fremdsprache (nicht Latein/Griechisch) – für die Länderregeln der Fremdsprachen */
export const istModerneFremdsprache = (subjectId: string): boolean => fachgruppe(subjectId) === 'fremdsprache'

/** Deutsch, Mathematik, Fremdsprachen (auch alte) – in fast allen Ländern die Klassenarbeitsfächer */
export const istKernfach = (subjectId: string): boolean => {
  const g = fachgruppe(subjectId)
  return g === 'deutsch' || g === 'mathematik' || g === 'fremdsprache' || g === 'alteSprache'
}

const istFs = (g: Fachgruppe): boolean => g === 'fremdsprache' || g === 'alteSprache'

/** Anzeigename eines Fachs für die Hinweise */
export function fachName(subjectId: string): string {
  if (LABELS[subjectId]) return LABELS[subjectId]
  const t = subjectId.replace(/-/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// ---------------------------------------------------------------------------------------------
// Kontext
// ---------------------------------------------------------------------------------------------

interface Kontext extends NachweisAnfrage {
  gruppe: Fachgruppe
  kern: boolean
  gym: boolean
  fach: string
}

/** Ein Wert aus einer Tabelle je Jahrgang (ab `ab`), am Rand begrenzt */
const jeJahrgang = <T,>(werte: T[], grade: number, ab = 5): T => werte[Math.max(0, Math.min(werte.length - 1, grade - ab))]

const NEUTRAL = (k: Kontext): Nachweis => ({
  bezeichnung: 'Klassenarbeit',
  hinweis: `Für ${k.fach} ist in dieser Schulform keine Landesregel hinterlegt.`
})

// ---------------------------------------------------------------------------------------------
// Oberstufe
// ---------------------------------------------------------------------------------------------

/** Gymnasien, deren Einführungsphase in Klasse 10 liegt und dort schon Klausuren schreibt */
const EINFUEHRUNG_IN_10 = new Set(['HB', 'MV'])

function istOberstufe(k: Kontext): boolean {
  if (k.schoolTypeId === 'grundschule') return false
  // Bayern (G9): Jgst. 11 gehört noch zu den Schulaufgaben mit 60 min (GSO § 22 Abs. 5)
  if (k.stateId === 'BY') return k.grade >= 12
  if (k.grade >= 11) return true
  return k.grade === 10 && k.gym && EINFUEHRUNG_IN_10.has(k.stateId)
}

function oberstufe(k: Kontext): Nachweis {
  const klausur = (n: Omit<Nachweis, 'bezeichnung'>): Nachweis => ({ bezeichnung: 'Klausur', ...n })
  switch (k.stateId) {
    case 'BY': {
      // GSO § 21 Abs. 3, § 22 Abs. 3 und 5, § 25 Abs. 1 (Fassung ab 01.08.2026; Recherche 29.09.2026)
      const quelle = 'GSO §§ 21, 22, 25 (Fassung ab 01.08.2026)'
      if (k.gruppe === 'sport') {
        return {
          bezeichnung: 'Leistungsnachweis',
          keineKlassenarbeit: true,
          hinweis:
            'In Sport treten an die Stelle der Schulaufgabe praktische Leistungsnachweise; nur im Leistungsfach Sport kommt je Ausbildungsabschnitt eine Schulaufgabe aus der Sporttheorie hinzu.',
          quelle
        }
      }
      const hinweise = [
        'In 13/2 haben Fächer auf grundlegendem Niveau keine Schulaufgabe, sondern mindestens zwei kleine Leistungsnachweise (je ein schriftlicher und ein mündlicher).',
        'In Jgst. 13 kann in den Abiturfächern je eine Schulaufgabe im Umfang einer Prüfungsaufgabe gehalten werden.'
      ]
      if (k.gruppe === 'fremdsprache')
        hinweise.push('Eine Schulaufgabe in Jgst. 12 oder 13 wird mündlich abgehalten, möglichst als Partner- oder Gruppenprüfung.')
      if (k.subjectId === 'kunst') hinweise.push('Kombinierte Aufgaben mit bildnerisch-praktischem und schriftlich-theoretischem Teil.')
      if (k.subjectId === 'musik') hinweise.push('Hörzeiten zählen nicht zur Arbeitszeit; im Leistungsfach kommt eine praktische Prüfung hinzu.')
      hinweise.push('Rückgabe binnen drei Wochen, vorher keine neue Schulaufgabe im Fach.')
      return {
        bezeichnung: 'Schulaufgabe',
        anzahl: 'je Fach und Ausbildungsabschnitt eine (12/1–13/1; in 13/2 nur Fächer auf erhöhtem Niveau)',
        dauer: k.subjectId === 'kunst' ? 'bis 180 min' : 'höchstens 90 min',
        hinweis: hinweise.join(' '),
        quelle
      }
    }
    case 'NW':
      return klausur({
        anzahl: k.grade === 11 ? 'Einführungsphase: D, M, Fremdsprachen je 2 pro Halbjahr' : undefined,
        dauer: k.grade === 11 ? '90 min' : 'Leistungskurs 135–180 min, Grundkurs 90–180 min',
        hinweis: 'Höchstens eine Klausur am Tag und drei in der Woche; die Facharbeit ersetzt eine Klausur.',
        quelle: 'APO-GOSt § 14'
      })
    case 'BE':
      return klausur({
        anzahl: k.grade <= 11 ? 'Einführungsphase: 1–2 je Halbjahr' : 'Grundkurs 1, Leistungskurs 2 je Halbjahr',
        dauer: k.grade <= 11 ? 'mindestens 2 Unterrichtsstunden' : 'Grundkurs mindestens 2, Leistungskurs mindestens 3 Unterrichtsstunden',
        quelle: 'VO-GO § 14'
      })
    case 'BB':
      return klausur({
        anzahl: k.grade <= 11 ? 'Einführungsphase: 1 je Fach' : undefined,
        dauer: k.grade <= 11 ? '90 min' : 'Grundkurs 90 min, Leistungskurs mindestens 135 min',
        quelle: 'VV-Leistungsbewertung mit Anlage (Fassung 2025)'
      })
    case 'HB':
      return klausur({
        anzahl: k.grade <= 10 ? 'Einführungsphase: D, M, 1. Fremdsprache mindestens 2 je Halbjahr, übrige Fächer 1' : 'mindestens 1 je Kurs und Halbjahr, Leistungskurs 2',
        quelle: 'GyO-VO § 12'
      })
    case 'HH':
      return klausur({
        anzahl: '6-stündige Fächer 4 im Schuljahr, 4-/5-stündige 3, 2-/3-stündige 1 je Semester',
        dauer: k.gruppe === 'deutsch' ? 'mindestens 135 min' : 'mindestens 90 min',
        hinweis: 'Eine Präsentationsleistung ersetzt je Schuljahr eine Klausur.',
        quelle: 'APO-GrundStGy (Stand 8.4.2024)'
      })
    case 'MV':
      return klausur({
        anzahl:
          k.grade <= 10
            ? k.kern
              ? 'Einführungsphase: 2 (auf Konferenzbeschluss 3)'
              : 'Einführungsphase: 1–2'
            : '1–2 je Halbjahr',
        dauer: k.grade <= 10 ? undefined : 'mindestens 90 min',
        quelle: 'APVO M-V (19.2.2019, geändert 1.8.2025)'
      })
    case 'RP':
      return {
        bezeichnung: 'Kursarbeit',
        anzahl: 'Leistungskurs 1–2 je Halbjahr, Grundkurs 1 je Halbjahr',
        dauer: 'Leistungskurs 2–4 Unterrichtsstunden',
        quelle: 'MSS-Broschüre 02/2025'
      }
    case 'SN':
      return klausur({ anzahl: '1–2 je Kurs und Halbjahr', dauer: 'in der Regel höchstens 90 min, in einigen Fächern bis 180 min', quelle: 'SOGYA' })
    case 'ST':
      return klausur({ anzahl: '1 je Kurshalbjahr', quelle: 'RdErl. MK vom 26.06.2012 (spätere Änderungen nicht gesichert)', nichtGesichert: true })
    case 'SH':
      return klausur({
        anzahl: 'grundsätzlich 1 Leistungsnachweis je Fach und Halbjahr, in Kernfächern bzw. auf erhöhtem Niveau mehr',
        dauer: '90 min',
        quelle: 'Oberstufen-Erlass vom 23.6.2021, geändert 11.4.2026'
      })
    case 'TH':
      return klausur({
        anzahl: 'Q1–Q3: je Fach eine',
        dauer: 'erhöhtes Niveau mindestens 90 min, grundlegendes mindestens 60 min',
        quelle: 'ThürSchulO § 74'
      })
    default:
      // NI, HE, BW, SL: Oberstufe im Bericht nicht ausgewertet
      return klausur({ hinweis: 'Die Oberstufenregeln dieses Landes sind nicht hinterlegt (nicht gesichert).', nichtGesichert: true })
  }
}

// ---------------------------------------------------------------------------------------------
// Sekundarstufe I je Land
// ---------------------------------------------------------------------------------------------

function niedersachsen(k: Kontext): Nachweis {
  const quelle = k.gym
    ? 'RdErl. „Die Arbeit in den Schuljahrgängen 5 bis 10 des Gymnasiums" vom 1.8.2025 (SVBl. S. 492) Nr. 6.4–6.7; RdErl. „Schriftliche Arbeiten" vom 22.3.2012 (SVBl. S. 266)'
    : 'RdErl. „Schriftliche Arbeiten" vom 22.3.2012 (SVBl. S. 266); Erlasse Haupt-/Real-/Oberschule vom 18.08.2026; IGS-Erlass Nr. 7.4–7.6'
  const dauer = k.gym
    ? k.grade <= 6
      ? 'in der Regel eine Unterrichtsstunde'
      : 'in der Regel höchstens zwei Unterrichtsstunden'
    : k.grade <= 6
      ? 'höchstens 45 min'
      : k.gruppe === 'deutsch' && k.grade >= 9 && k.schoolTypeId !== 'integrierte-gesamtschule'
        ? 'bis 135 min'
        : '90 min'
  if (k.gruppe === 'sport') {
    return { bezeichnung: 'Leistungsnachweis', keineKlassenarbeit: true, hinweis: 'In Niedersachsen werden in Sport keine schriftlichen Arbeiten geschrieben.', quelle }
  }
  if (k.kern) {
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl: '3–4 im Schuljahr (Regelfall 4)',
      dauer,
      hinweis:
        k.gruppe === 'fremdsprache'
          ? 'Bis zur Hälfte der Arbeiten ist durch andere Lernkontrollen ersetzbar; die Sprechprüfung ersetzt eine schriftliche Arbeit je Doppeljahrgang.'
          : 'Bis zur Hälfte der Arbeiten ist durch andere Lernkontrollen ersetzbar.',
      quelle
    }
  }
  const alleErsetzbar = k.gruppe === 'aesthetik' || k.gruppe === 'informatik'
  const erweitert = !k.gym && ['realschule', 'oberschule', 'integrierte-gesamtschule'].includes(k.schoolTypeId) && (k.gruppe === 'naturwissenschaft' || k.gruppe === 'gesellschaft')
  return {
    bezeichnung: 'schriftliche Lernkontrolle',
    anzahl: erweitert ? '3–4 im Schuljahr (Real-/Oberschule nach den Erlassen 2026 ab 01.08.2027; übrige Fächer 2)' : '2 im Schuljahr (einstündig oder epochal 1)',
    dauer,
    hinweis: alleErsetzbar
      ? `In ${k.fach} sind alle schriftlichen Lernkontrollen durch andere Formen ersetzbar.`
      : 'Die Hälfte der schriftlichen Lernkontrollen ist durch andere Formen ersetzbar (einstündig oder epochal: keine).',
    quelle
  }
}

function nwDauer(k: Kontext): string {
  const g = k.grade
  if (g <= 6) return k.gruppe === 'deutsch' ? '1 Unterrichtsstunde' : 'bis zu 1 Unterrichtsstunde'
  if (g === 7) return k.gruppe === 'deutsch' ? '1–2 Unterrichtsstunden' : '1 Unterrichtsstunde'
  if (g === 8) return '1–2 Unterrichtsstunden'
  if (k.gruppe === 'deutsch') return '2–3 Unterrichtsstunden'
  if (k.gruppe === 'mathematik' && g === 10 && ['gymnasium', 'realschule', 'gesamtschule'].includes(k.schoolTypeId)) return '2 Unterrichtsstunden'
  return '1–2 Unterrichtsstunden'
}

function nordrheinWestfalen(k: Kontext): Nachweis {
  const quelle = 'APO-S I § 6 mit VV 6.1.1–6.1.3 (BASS 13-21 Nr. 1.1/1.2)'
  if (!k.kern) {
    return {
      bezeichnung: 'schriftliche Lernkontrolle',
      keineKlassenarbeit: true,
      hinweis: `In Nordrhein-Westfalen werden in ${k.fach} in der Sekundarstufe I keine Klassenarbeiten geschrieben (APO-S I § 6); bewertet wird der Bereich „Sonstige Leistungen im Unterricht". Die Arbeit ist dort als schriftliche Lernkontrolle oder Übungsarbeit nutzbar. Ausnahme: ${k.fach} als Wahlpflichtfach.`,
      quelle: k.gruppe === 'gesellschaft' ? `${quelle}; Kernlehrplan G9 ${k.fach}, Kap. 3` : quelle
    }
  }
  const erste = jeJahrgang(['6', '6', '5–6', '4–5', '4–5', '3–5'], k.grade)
  const zweite = k.grade === 7 ? '5–6 (Gesamtschule 4–6)' : '4–5 (Wahlpflicht am Gymnasium in Kl. 9/10: 4)'
  const anzahl =
    istFs(k.gruppe) && k.subjectId !== 'englisch' && k.grade >= 7
      ? `als 1. Fremdsprache ${erste}, als 2. Fremdsprache bzw. Wahlpflichtfach ${zweite} im Schuljahr`
      : `${erste} im Schuljahr`
  const hinweise: string[] = []
  if (k.gruppe === 'fremdsprache') hinweise.push('Schreiben ist Bestandteil jeder Klassenarbeit und wird um mindestens eine weitere Teilkompetenz ergänzt (Kernlehrplan G9, Kap. 3).')
  if (k.subjectId === 'englisch') hinweise.push('Im letzten Jahr der Sek I wird eine Arbeit durch eine mündliche Prüfung ersetzt.')
  if (k.grade === 10 && (k.subjectId === 'deutsch' || k.subjectId === 'englisch' || k.subjectId === 'mathematik'))
    hinweise.push('Im 2. Halbjahr mindestens eine Arbeit zur Vorbereitung auf die ZP10.')
  hinweise.push('Einmal je Fach und Schuljahr ist eine Klassenarbeit durch eine andere Leistung ersetzbar (§ 6 Abs. 8).')
  return { bezeichnung: 'Klassenarbeit', anzahl, dauer: nwDauer(k), hinweis: hinweise.join(' '), quelle }
}

/**
 * Bayern, Gymnasium (G9): weitere Kernfächer je Ausbildungsrichtung.
 *
 * GSO § 16 Abs. 2 (Fassung ab 01.08.2026): Kernfächer sind überall Deutsch, zwei Fremdsprachen,
 * Mathematik und Physik, dazu je Ausbildungsrichtung EIN weiteres Fach. In den „übrigen
 * Kernfächern" sind mindestens zwei Schulaufgaben zu halten (§ 22 Abs. 1 Satz 2); Fächer ohne
 * Kernfach-Status haben keine Schulaufgaben (§ 28 Abs. 2). Recherche 29.09.2026:
 * `recherche/bayern-schulaufgaben-2026-09-29.md`.
 *
 * `jahrgaenge`: in welchen Jahrgangsstufen das Fach in dieser Ausbildungsrichtung laut
 * Stundentafel (GSO Anlage 1) unterrichtet wird. `nurDort`: Jahrgangsstufen, in denen das Fach
 * AUSSCHLIESSLICH in dieser Ausbildungsrichtung unterrichtet wird – dort steht die Richtung
 * mit dem Fach schon fest, und der Vorschlag kann ohne Zweig-Angabe „Schulaufgabe" lauten.
 *
 * Ist die Ausbildungsrichtung der Klasse angegeben (`meta.ausbildungsrichtung`), ist der Vorschlag
 * eindeutig; sonst nennt der Hinweis in den übrigen Jahrgängen beide Fälle.
 */
export type ByZweig = 'HG' | 'SG' | 'NTG' | 'MuG' | 'WWG' | 'SWG'

export interface ByZweigKernfach {
  zweig: ByZweig
  name: string
  /** Dativ für Hinweise („am Musischen Gymnasium") */
  am: string
  fach: string
  subjectIds: string[]
  jahrgaenge: [number, number]
  nurDort: number[]
}

export const BY_GYM_ZWEIG_KERNFAECHER: ByZweigKernfach[] = [
  {
    zweig: 'HG',
    name: 'Humanistisches Gymnasium',
    am: 'am Humanistischen Gymnasium',
    fach: 'Griechisch',
    subjectIds: ['griechisch'],
    jahrgaenge: [8, 11],
    nurDort: [8, 9, 10, 11]
  },
  {
    zweig: 'SG',
    name: 'Sprachliches Gymnasium',
    am: 'am Sprachlichen Gymnasium',
    fach: 'dritte Fremdsprache',
    subjectIds: ['franzoesisch', 'italienisch', 'russisch', 'spanisch', 'chinesisch'],
    jahrgaenge: [8, 11],
    nurDort: []
  },
  {
    zweig: 'NTG',
    name: 'Naturwissenschaftlich-technologisches Gymnasium',
    am: 'am Naturwissenschaftlich-technologischen Gymnasium',
    fach: 'Chemie',
    subjectIds: ['chemie'],
    jahrgaenge: [8, 11],
    nurDort: [8, 11]
  },
  {
    zweig: 'MuG',
    name: 'Musisches Gymnasium',
    am: 'am Musischen Gymnasium',
    fach: 'Musik',
    subjectIds: ['musik'],
    jahrgaenge: [5, 11],
    nurDort: []
  },
  {
    zweig: 'WWG',
    name: 'Wirtschaftswissenschaftliches Gymnasium',
    am: 'am Wirtschaftswissenschaftlichen Gymnasium',
    fach: 'Wirtschaft und Recht',
    subjectIds: ['wirtschaft'],
    jahrgaenge: [8, 11],
    nurDort: [8, 9]
  },
  {
    zweig: 'SWG',
    name: 'Sozialwissenschaftliches Gymnasium',
    am: 'am Sozialwissenschaftlichen Gymnasium',
    fach: 'Politik und Gesellschaft',
    subjectIds: ['politik'],
    jahrgaenge: [8, 11],
    nurDort: [8, 9]
  }
]

/**
 * Wochenstunden der Fremdsprachen je Jahrgangsstufe 5–11 laut GSO Anlage 1 (in allen
 * Ausbildungsrichtungen gleich): 1., 2. und 3. Fremdsprache (3. = SG, Griechisch am HG).
 * Ab vier Wochenstunden gelten mindestens vier Schulaufgaben (§ 22 Abs. 1 Nr. 3). Eine in
 * Jgst. 11 neu einsetzende spät beginnende Fremdsprache hat vier Wochenstunden (Fußnote 7).
 */
export const BY_GYM_FS_WOCHENSTUNDEN: Record<1 | 2 | 3, number[]> = {
  1: [5, 4, 4, 3, 3, 3, 3],
  2: [0, 4, 4, 4, 3, 3, 3],
  3: [0, 0, 0, 4, 4, 3, 3]
}

/** Als wievielte Fremdsprache ein Fach am bayerischen Gymnasium vorkommen kann (Anlage 1) */
function byFsFolgen(subjectId: string): (1 | 2 | 3)[] {
  if (subjectId === 'griechisch') return [3]
  if (subjectId === 'englisch' || subjectId === 'latein') return [1, 2]
  if (subjectId === 'franzoesisch') return [1, 2, 3]
  return [3]
}

/** Mindestzahl der Schulaufgaben in einer Fremdsprache am bayerischen Gymnasium, Jgst. 5–11 */
export function byGymFsAnzahl(subjectId: string, grade: number): string {
  const i = grade - 5
  const teile = byFsFolgen(subjectId)
    .map((folge) => ({
      folge,
      stunden: BY_GYM_FS_WOCHENSTUNDEN[folge][i] ?? 0
    }))
    .filter((t) => t.stunden > 0)
    .map((t) => ({ folge: t.folge, zahl: t.stunden >= 4 ? 4 : 3 }))
  const spaet = grade === 11 && subjectId !== 'englisch' && subjectId !== 'latein' && subjectId !== 'griechisch'
  if (!teile.length)
    return spaet ? 'als spät beginnende Fremdsprache (vierstündig) mindestens 4 im Schuljahr' : 'mindestens 3 im Schuljahr (ab vier Wochenstunden mindestens 4)'
  const zahlen = new Set(teile.map((t) => t.zahl))
  let text =
    zahlen.size === 1
      ? `mindestens ${teile[0].zahl} im Schuljahr`
      : `${teile.map((t) => `als ${t.folge}. Fremdsprache mindestens ${t.zahl}`).join(', ')} im Schuljahr`
  if (spaet) text += '; als spät beginnende Fremdsprache (vierstündig) mindestens 4'
  return text
}

/**
 * Wochenstunden im Sinn von GSO § 22 Abs. 1 Nr. 3 (Nachrecherche 2, 29.09.2026): Die
 * Intensivierungsstunden stehen in Anlage 1 als eigene Zeile neben den Fächern, dienen nach
 * Fußnote 9 dem Üben, Wiederholen und Vertiefen und nicht der Vermittlung neuer Lehrplaninhalte.
 * Sie zählen daher nicht als Wochenstunden des Fachs – ausdrücklich geregelt ist das weder in der
 * GSO noch im KMS vom 18.06.2026. Weicht die Schule nach § 15 Abs. 1 Satz 3 von der Stundentafel ab
 * (mehr Stunden im Fach), zählen die tatsächlich erteilten Stunden.
 */
export const BY_GYM_FS_STUNDEN_HINWEIS =
  'Maßgeblich sind die Wochenstunden des Fachs: ab vier Wochenstunden mindestens 4 Schulaufgaben, sonst 3. Intensivierungsstunden stehen in der Stundentafel als eigene Zeile, dienen dem Üben und Vertiefen und zählen nach dieser Auslegung nicht mit. Erhöht die Schule die Stundenzahl des Fachs (GSO § 15 Abs. 1), gelten die tatsächlich erteilten Stunden.'

/** Fächer, die nach Anlage 1 Fußnote 5 als gleichzeitig einsetzende 1. und 2. Fremdsprache vorkommen */
export const BY_GYM_FS_GLEICHZEITIG = ['englisch', 'latein', 'franzoesisch']

/**
 * Anlage 1 Fußnote 5: Französisch oder Latein (1. FS, zusammen mindestens 13 Wochenstunden in
 * Jgst. 5–7) und Englisch (2. FS, mindestens 11) können gleichzeitig ab Jgst. 5 beginnen, je
 * mindestens drei Wochenstunden je Jahrgangsstufe. Die Regel „ab vier Wochenstunden mindestens
 * vier" bleibt; die Zahl hängt dann von der Stundenverteilung der Schule ab.
 */
export const BY_GYM_FS_GLEICHZEITIG_HINWEIS =
  'Beginnen erste und zweite Fremdsprache gleichzeitig in Jgst. 5 (Latein oder Französisch mit Englisch, je mindestens drei Wochenstunden), richtet sich die Zahl nach der Stundenverteilung der Schule: bei vier und mehr Wochenstunden mindestens 4, bei drei mindestens 3.'

/**
 * Beispiele für gleichwertige Ersatzformate (GSO § 22 Abs. 2 Satz 1) aus dem KMS „Weiterentwicklung
 * der Prüfungskultur an den bayerischen Gymnasien" vom 18.06.2026 (VI.3-BS5200.0/88/5).
 */
export function byGymErsatzBeispiel(subjectId: string, gruppe: Fachgruppe, grade: number): string | undefined {
  if (gruppe === 'deutsch') {
    if (grade === 6 || grade === 8)
      return 'Hält die Schule vier Schulaufgaben, kann eine davon etwa durch den Jahrgangsstufentest zusammen mit einem schulinternen Test ersetzt werden (KMS vom 18.06.2026).'
    if (grade >= 9 && grade <= 11)
      return 'Beispiele für Ersatzformen laut KMS vom 18.06.2026: Debattenschulaufgabe (Jgst. 9) und mündliche Formate in Jgst. 11 wie Literarische Debatte, Epochengespräch, Literarisches Quartett oder Präsentationsprüfung.'
    return undefined
  }
  if (subjectId === 'latein' || subjectId === 'griechisch')
    return 'Als Ersatzform nennt das KMS vom 18.06.2026 die mündliche Dialogschulaufgabe, die vor allem im Lektüreunterricht bis Jgst. 11 eine zweigeteilte Schulaufgabe ersetzen kann.'
  if (subjectId === 'physik' || subjectId === 'chemie')
    return 'Für die Naturwissenschaften nennt das KMS vom 18.06.2026 etwa Laborexperimente oder Freilanduntersuchungen, bei angemessenem Anforderungsniveau.'
  return undefined
}

function bayernGymnasium(k: Kontext): Nachweis {
  const quelle = 'GSO §§ 16, 22, 23, 25 und Anlage 1 (Fassung ab 01.08.2026)'
  const klein =
    'kleiner Leistungsnachweis: Kurzarbeit höchstens 30 min über höchstens zehn vorangegangene Stunden (eine Woche vorher angekündigt) oder Stegreifaufgabe höchstens 20 min über höchstens zwei Stunden (unangekündigt)'
  const rueckgabe =
    k.gruppe === 'deutsch' && k.grade >= 10
      ? 'Rückgabe binnen drei Wochen, vorher keine neue Schulaufgabe im Fach.'
      : 'Rückgabe binnen zwei Wochen, vorher keine neue Schulaufgabe im Fach.'
  const ersatz = (): string[] => {
    const h = [
      'Höchstens eine Schulaufgabe je Schuljahr ist durch ein im Anforderungsniveau gleichwertiges Prüfungsformat ersetzbar (Beschluss der Lehrerkonferenz zu Schuljahresbeginn, einheitlich für die Jahrgangsstufe der Ausbildungsrichtung). Auch dafür gelten eine Woche Ankündigung und höchstens ein großer Nachweis am Tag.'
    ]
    const beispiel = byGymErsatzBeispiel(k.subjectId, k.gruppe, k.grade)
    if (beispiel) h.push(beispiel)
    if (k.grade <= 8 && k.gruppe !== 'deutsch')
      h.push(
        'In Jgst. 5–8 können außerdem alle Schulaufgaben des Fachs durch Leistungsnachweise im Abstand von grundsätzlich sechs Unterrichtswochen ersetzt werden (Lehrerkonferenz mit Zustimmung des Elternbeirats).'
      )
    return h
  }
  const schulaufgabe = (anzahl: string, hinweise: string[], dauer = 'höchstens 60 min'): Nachweis => ({
    bezeichnung: 'Schulaufgabe',
    anzahl,
    dauer,
    hinweis: [...hinweise, ...ersatz(), rueckgabe].join(' '),
    quelle
  })

  if (k.gruppe === 'deutsch') {
    const hinweise = ['Diktate oder grammatische Übungen sind als Schulaufgaben nicht zulässig.']
    if (k.grade <= 8) hinweise.push('Bei nur drei Schulaufgaben ist in Jgst. 5–8 keine Ersetzung durch Formate zulässig, die keine Aufsatzschulaufgaben sind.')
    return schulaufgabe(
      'mindestens 3 im Schuljahr',
      hinweise,
      k.grade >= 8 ? 'höchstens 60 min (in Deutsch ab Jgst. 8 angemessen länger möglich)' : 'höchstens 60 min'
    )
  }
  if (k.gruppe === 'mathematik') return schulaufgabe(k.grade <= 7 ? 'mindestens 4 im Schuljahr' : 'mindestens 3 im Schuljahr', [])
  if (istFs(k.gruppe)) {
    const hinweise = [BY_GYM_FS_STUNDEN_HINWEIS]
    if (k.grade <= 7 && BY_GYM_FS_GLEICHZEITIG.includes(k.subjectId)) hinweise.push(BY_GYM_FS_GLEICHZEITIG_HINWEIS)
    if (k.gruppe === 'fremdsprache') hinweise.push('In mindestens zwei Jahrgangsstufen wird eine Schulaufgabe ganz oder teilweise mündlich abgehalten.')
    if (k.subjectId === 'griechisch') hinweise.push('Griechisch ist Kernfach am Humanistischen Gymnasium (ab Jgst. 8).')
    return schulaufgabe(byGymFsAnzahl(k.subjectId, k.grade), hinweise)
  }
  if (k.subjectId === 'physik') {
    if (k.grade < 8) {
      return {
        bezeichnung: 'Kurzarbeit',
        dauer: 'höchstens 30 min',
        keineKlassenarbeit: true,
        hinweis: `Physik wird am bayerischen Gymnasium erst ab Jgst. 8 unterrichtet (davor Natur und Technik ohne Schulaufgaben); die Arbeit gilt als ${klein}.`,
        quelle
      }
    }
    return schulaufgabe('mindestens 2 im Schuljahr', ['Physik ist ab Jgst. 8 in allen Ausbildungsrichtungen Kernfach.'])
  }
  const zweig = BY_GYM_ZWEIG_KERNFAECHER.find((z) => z.subjectIds.includes(k.subjectId) && z.zweig !== 'SG')
  if (zweig && k.grade >= zweig.jahrgaenge[0] && k.grade <= zweig.jahrgaenge[1]) {
    // Ausbildungsrichtung angegeben: Vorschlag eindeutig
    if (k.ausbildungsrichtung === zweig.zweig) {
      return schulaufgabe('mindestens 2 im Schuljahr', [`${zweig.fach} ist ${zweig.am} (${zweig.zweig}) Kernfach.`])
    }
    if (k.ausbildungsrichtung) {
      return {
        bezeichnung: 'Kurzarbeit',
        dauer: 'höchstens 30 min',
        keineKlassenarbeit: true,
        hinweis: `${zweig.fach} ist nur ${zweig.am} (${zweig.zweig}) Kernfach; in der Ausbildungsrichtung ${k.ausbildungsrichtung} gilt die Arbeit als ${klein}.`,
        quelle
      }
    }
    if (zweig.nurDort.includes(k.grade)) {
      return schulaufgabe('mindestens 2 im Schuljahr', [
        `${zweig.fach} wird in Jgst. ${k.grade} nur ${zweig.am} (${zweig.zweig}) unterrichtet und ist dort Kernfach.`
      ])
    }
    return {
      bezeichnung: 'Kurzarbeit',
      anzahl: `am ${zweig.zweig} mindestens 2 Schulaufgaben im Schuljahr, sonst keine`,
      dauer: 'höchstens 30 min',
      hinweis: `${zweig.fach} ist nur ${zweig.am} (${zweig.zweig}) Kernfach mit mindestens 2 Schulaufgaben (höchstens 60 min); dort passt die Bezeichnung „Schulaufgabe". In den übrigen Ausbildungsrichtungen gilt die Arbeit als ${klein}.`,
      quelle
    }
  }
  return {
    bezeichnung: 'Kurzarbeit',
    dauer: 'höchstens 30 min',
    keineKlassenarbeit: true,
    hinweis: `Schulaufgaben gibt es am bayerischen Gymnasium nur in den Kernfächern: Deutsch, zwei Fremdsprachen, Mathematik, Physik und je Ausbildungsrichtung Griechisch (HG), eine dritte Fremdsprache (SG), Chemie (NTG), Musik (MuG), Wirtschaft und Recht (WWG) oder Politik und Gesellschaft (SWG). In ${k.fach} gilt die Arbeit in Jgst. ${k.grade} als ${klein}.`,
    quelle
  }
}

function bayern(k: Kontext): Nachweis {
  if (k.gym) return bayernGymnasium(k)
  if (k.schoolTypeId === 'realschule') {
    const quelle = 'RSO §§ 17–20 (Fassung ab 01.08.2026)'
    const sa = (anzahl: string, hinweis?: string, gruppe?: string): Nachweis => {
      const h: string[] = []
      if (hinweis) h.push(hinweis)
      if (k.gruppe === 'deutsch' && k.grade <= 7)
        h.push('In Jgst. 5–7 kann je eine Aufgabe aus Rechtschreibung und Grammatik als eine Schulaufgabe gegeben werden.')
      if (k.gruppe !== 'deutsch')
        h.push('Außer in Deutsch sind Schulaufgaben auf Beschluss der Lehrerkonferenz durch mindestens fünf angesagte Tests ersetzbar.')
      if (k.subjectId === 'kunst') h.push('Eine Schulaufgabe wird als praktischer Leistungsnachweis durchgeführt.')
      else if (k.grade <= 9)
        h.push('In Fächern mit mehr als zwei Schulaufgaben ist in Jgst. 5–9 eine durch zwei Kurzarbeiten oder ein gleichwertiges Prüfungsformat ersetzbar.')
      if (k.grade === 10) h.push('In den Fächern der Abschlussprüfung dürfen höchstens zwei Schulaufgaben den Umfang einer Prüfungsaufgabe haben.')
      h.push(k.gruppe === 'deutsch' && k.grade === 10 ? 'Rückgabe binnen drei Wochen.' : 'Rückgabe binnen zwei Wochen.')
      return {
        bezeichnung: 'Schulaufgabe',
        anzahl: gruppe ? `${anzahl} (${gruppe})` : anzahl,
        dauer: 'höchstens 60 min',
        hinweis: h.join(' '),
        quelle
      }
    }
    const jahr = (werte: number[]): string => `${jeJahrgang(werte, k.grade)} im Schuljahr`
    if (k.subjectId === 'deutsch' || k.subjectId === 'englisch') return sa(jahr([4, 4, 4, 4, 3, 3]))
    if (k.subjectId === 'mathematik')
      return sa(`Wahlpflichtfächergruppe I: ${jeJahrgang([4, 4, 4, 4, 4, 3], k.grade)}, Gruppe II/III: ${jeJahrgang([4, 4, 3, 3, 3, 3], k.grade)} im Schuljahr`)
    if (k.subjectId === 'physik' && k.grade >= 7) {
      return k.grade === 7
        ? sa('2 im Schuljahr', 'Nur in der Wahlpflichtfächergruppe I; in Gruppe II/III ab Jgst. 8.')
        : sa(`Wahlpflichtfächergruppe I: ${jeJahrgang([2, 2, 3, 3], k.grade, 7)}, Gruppe II/III: 2 im Schuljahr`)
    }
    if (k.subjectId === 'chemie' && k.grade >= 8) {
      return k.grade === 8 ? sa('2 im Schuljahr', 'Nur in der Wahlpflichtfächergruppe I; in Gruppe II/III ab Jgst. 9.') : sa('2 im Schuljahr')
    }
    if (k.subjectId === 'franzoesisch' && k.grade >= 7) return sa('3 im Schuljahr', undefined, 'Wahlpflichtfächergruppe III')
    if (k.subjectId === 'wirtschaft' && k.grade >= 7) return sa('3 im Schuljahr', 'Als Betriebswirtschaftslehre/Rechnungswesen.', 'Wahlpflichtfächergruppe II')
    if (k.subjectId === 'kunst' && k.grade >= 7)
      return sa('3 im Schuljahr', 'Als Prüfungsfach der Wahlpflichtfächergruppe III (ebenso Werken, Ernährung und Gesundheit, Sozialwesen).')
    return {
      bezeichnung: 'kleiner Leistungsnachweis',
      keineKlassenarbeit: true,
      hinweis: `An der bayerischen Realschule sind in ${k.fach} in Jgst. ${k.grade} keine Schulaufgaben vorgesehen (RSO § 18); die Arbeit gilt als kleiner Leistungsnachweis (Kurzarbeit höchstens 30 min, Stegreifaufgabe höchstens 20 min).`,
      quelle
    }
  }
  if (k.schoolTypeId === 'mittelschule') {
    const hinweise = [
      'Die Mittelschulordnung kennt keine Schulaufgaben und keine festen Zahlen; die Lehrerkonferenz legt die Leistungsnachweise zu Schuljahresbeginn fest.',
      'Angekündigt wird spätestens eine Woche vorher, höchstens einer am Tag und in der Regel höchstens zwei in der Woche.'
    ]
    if (k.grade <= 7) hinweise.push('In Jgst. 5–7 findet in einem Fach je Schuljahr eine Projektarbeit als Leistungsnachweis statt.')
    return {
      bezeichnung: 'schriftlicher Leistungsnachweis',
      anzahl: 'keine feste Zahl',
      hinweis: hinweise.join(' '),
      quelle: 'MSO § 12'
    }
  }
  return NEUTRAL(k)
}

function badenWuerttemberg(k: Kontext): Nachweis {
  const quelle = 'Notenbildungsverordnung §§ 7–9 (§ 9 in der Fassung ab 01.08.2026)'
  if (k.kern) {
    const hinweise: string[] = []
    if (k.gruppe === 'deutsch' && ((k.gym && k.grade <= 7) || (k.schoolTypeId === 'realschule' && k.grade <= 9)))
      hinweise.push('Eine der Arbeiten ist eine Nachschrift.')
    if (k.gym && k.grade >= 7) hinweise.push('Dazu einmal je Schuljahr eine gleichwertige Feststellung von Schülerleistungen (GFS).')
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl: 'mindestens 4 im Schuljahr (dreistündige Kernfächer mindestens 3)',
      hinweis: hinweise.join(' ') || undefined,
      quelle
    }
  }
  return {
    bezeichnung: 'schriftliche Arbeit',
    anzahl: 'höchstens 4 im Schuljahr',
    hinweis: `Als Kernfach (z. B. Profil- oder Wahlpflichtfach) gelten für ${k.fach} mindestens 4 Klassenarbeiten; schriftliche Wiederholungsarbeiten dauern in der Regel bis 20 min.`,
    quelle
  }
}

function hessen(k: Kontext): Nachweis {
  const quelle = 'VOGSV §§ 28, 32–34 und Anlage 2 Nr. 7.1 (geändert durch Gesetz vom 22.06.2026)'
  if (k.kern) {
    // G6-Mittelstufe (5–10) und G9 (5–9) haben dieselben Zahlen: Jg. 5/6 je 5, danach 4
    const erste = k.grade <= 6 ? 5 : 4
    const anzahl =
      k.subjectId === 'englisch' || !istFs(k.gruppe)
        ? `${erste} im Schuljahr`
        : `als 1. Fremdsprache ${erste}, als 2. Fremdsprache 4 (G9 im ersten Lernjahr 5) im Schuljahr`
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl,
      hinweis: 'Ankündigung mindestens fünf Unterrichtstage vorher; Notenspiegel ist Pflicht. In Jg. 6 und 8 soll eine Arbeit als schulinterne Vergleichsarbeit geschrieben werden.',
      quelle
    }
  }
  if (k.subjectId === 'politik' || k.subjectId === 'wirtschaft' || k.subjectId === 'politik-wirtschaft') {
    return {
      bezeichnung: 'Klassenarbeit',
      hinweis: 'Politik und Wirtschaft ist in § 32 Abs. 2 VOGSV genannt; die Zahl der Arbeiten ist nicht gesichert.',
      quelle,
      nichtGesichert: true
    }
  }
  return {
    bezeichnung: 'Lernkontrolle',
    anzahl: 'höchstens eine je Halbjahr',
    hinweis: 'Nicht in den letzten zwei Wochen vor dem Zeugnis.',
    quelle
  }
}

function berlin(k: Kontext): Nachweis {
  const quelle = 'Sek I-VO § 19 und Anlage 4 (Stand 09.08.2023)'
  if (k.kern) {
    const dauer =
      k.gruppe === 'deutsch'
        ? k.grade <= 8
          ? '30–120 min'
          : '90–180 min'
        : k.gruppe === 'mathematik'
          ? '45–120 min'
          : k.subjectId === 'englisch'
            ? k.grade <= 6
              ? '45 min'
              : '45–150 min'
            : '45–150 min (3. Fremdsprache 45–90 min)'
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl: 'mindestens 4 im Schuljahr',
      dauer,
      hinweis: 'Ankündigung eine Woche vorher mit inhaltlichen Schwerpunkten; Notenspiegel ist Pflicht.',
      quelle
    }
  }
  if (k.grade <= 6 && k.gym && (k.gruppe === 'naturwissenschaft' || k.gruppe === 'gesellschaft')) {
    return { bezeichnung: 'Klassenarbeit', anzahl: 'mindestens 3 im Schuljahr (grundständiges Gymnasium)', dauer: '45–90 min', quelle }
  }
  return {
    bezeichnung: 'schriftliche Kurzkontrolle',
    hinweis: `In Berlin sind in ${k.fach} keine Klassenarbeiten vorgeschrieben (als Wahlpflichtfach mindestens 2, 45–90 min); schriftliche Kurzkontrollen gibt es mindestens einmal je Halbjahr in allen Fächern.`,
    quelle
  }
}

function brandenburg(k: Kontext): Nachweis {
  const quelle = 'VV-Leistungsbewertung Nr. 5 und 8 mit Anlage „Anzahl und Dauer der schriftlichen Arbeiten" (Fassung 2025)'
  if (k.kern) {
    const dauer = k.gruppe === 'deutsch' || k.gruppe === 'mathematik' ? (k.grade >= 10 ? '45–135 min' : '45–90 min') : '45–90 min'
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl: '2 im Schuljahr',
      dauer,
      hinweis:
        k.grade <= 6
          ? 'In Jg. 5/6 nur in Leistungs- und Begabungsklassen (45 min).'
          : 'Je Jahrgangsstufe ist eine Pflichtarbeit durch eine mündliche Leistung ersetzbar (Fachkonferenz).',
      quelle
    }
  }
  if (k.gym && k.grade === 10 && k.gruppe !== 'sport') {
    return {
      bezeichnung: 'Klassenarbeit',
      dauer: '45 min',
      hinweis: 'Am Gymnasium in Jg. 10 in Fächern ab zwei Wochenstunden; die Zahl ist nicht gesichert.',
      quelle,
      nichtGesichert: true
    }
  }
  return {
    bezeichnung: 'schriftliche Lernerfolgskontrolle',
    keineKlassenarbeit: true,
    hinweis: `In Brandenburg werden in ${k.fach} in der Sek I keine Klassenarbeiten geschrieben (Ausnahmen: Wahlpflichtunterricht nach Beschluss der Gremien, Gymnasium Jg. 10).`,
    quelle
  }
}

function bremen(k: Kontext): Nachweis {
  const quelle = 'Richtlinie 331.01 „Schriftliche Arbeiten … Jahrgangsstufen 5 bis 10" vom 29.10.1982 (Geltung nicht abschließend gesichert)'
  if (k.kern) {
    const dauer = k.gruppe === 'deutsch' ? (k.grade >= 10 ? 'Aufsatz bis vier Unterrichtsstunden' : 'Aufsatz zwei bis drei Unterrichtsstunden') : k.grade <= 6 ? 'bis eine Unterrichtsstunde' : 'bis zwei Unterrichtsstunden'
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl: '3 je Halbjahr',
      dauer,
      hinweis: 'Sind mehr als ein Drittel mangelhaft oder ungenügend, wird die Arbeit nicht gewertet (Ausnahme nur durch die Schulleitung).',
      quelle,
      nichtGesichert: true
    }
  }
  return {
    bezeichnung: 'Kurzarbeit',
    anzahl: 'bis zu 4 je Halbjahr',
    dauer: 'höchstens 30 min',
    keineKlassenarbeit: true,
    hinweis: `In Bremen werden in ${k.fach} keine Klassenarbeiten geschrieben, sondern Kurzarbeiten (höchstens 30 min, auch unangekündigt über den Stoff der letzten zwei Wochen).`,
    quelle,
    nichtGesichert: true
  }
}

function hamburg(k: Kontext): Nachweis {
  const quelle = `Bildungsplan ${k.gym ? 'Gymnasium' : 'Stadtteilschule'} Sek I (2024), Teil C „Leistungsbewertung"`
  const dauer = k.gym && k.grade === 10 ? 'mindestens 45 min (1. Halbjahr) bzw. 90 min (2. Halbjahr)' : undefined
  if (k.kern) {
    const anzahl = k.gruppe === 'deutsch' && k.grade <= 8 ? '6 im Schuljahr (davon 2 zur Rechtschreibung)' : '4 im Schuljahr'
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl,
      dauer,
      hinweis: k.gruppe === 'fremdsprache' ? 'Einmal in der Sek I je neuerer Fremdsprache (ab Kl. 7) ersetzt eine Sprechprüfung eine Klassenarbeit.' : undefined,
      quelle
    }
  }
  if (k.gruppe === 'sport' || k.subjectId === 'musik' || k.subjectId === 'kunst' || k.subjectId === 'theater') {
    return { bezeichnung: 'Leistungsnachweis', keineKlassenarbeit: true, hinweis: `In Hamburg werden in ${k.fach} keine Klassenarbeiten geschrieben.`, quelle }
  }
  return { bezeichnung: 'Klassenarbeit', anzahl: 'mindestens 2 im Schuljahr', dauer, quelle }
}

function mecklenburgVorpommern(k: Kontext): Nachweis {
  const quelle = 'LeistBewVO M-V (in Kraft seit 01.08.2026) §§ 5, 8, 14'
  const dauer = k.grade <= 6 ? 'grundsätzlich 45 min (Aufsatz höchstens 90 min)' : 'mindestens 45 min (Aufsatz mindestens 90 min)'
  if (k.gruppe === 'sport') return { bezeichnung: 'Leistungsnachweis', keineKlassenarbeit: true, hinweis: 'In Sport werden keine Klassenarbeiten geschrieben.', quelle }
  if (k.kern) {
    const gymnasial = k.gym && k.grade >= 7
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl: gymnasial ? 'mindestens 3 im Schuljahr (Wahlpflicht-Fremdsprachen bis 3)' : k.gym ? 'nicht gesichert (Orientierungsstufe sonst 2)' : '2 im Schuljahr',
      dauer,
      hinweis:
        k.gruppe === 'fremdsprache'
          ? 'In Jg. 7/8 mindestens eine Arbeit mit mündlichem Teil, spätestens ab Jg. 9 eine gleichwertige Sprechleistung.'
          : undefined,
      quelle,
      nichtGesichert: k.gym && k.grade <= 6 ? true : undefined
    }
  }
  if (k.gym) {
    return { bezeichnung: 'Klassenarbeit', anzahl: '1 im Schuljahr, nur auf Beschluss der Lehrkräftekonferenz', dauer, quelle }
  }
  return {
    bezeichnung: 'schriftliche Lernerfolgskontrolle',
    dauer: 'bis 30 min',
    keineKlassenarbeit: true,
    hinweis: `In Mecklenburg-Vorpommern werden in ${k.fach} außerhalb des Gymnasiums keine Klassenarbeiten geschrieben; schriftliche Lernerfolgskontrollen dauern bis 30 min.`,
    quelle
  }
}

function rheinlandPfalz(k: Kontext): Nachweis {
  const quelle =
    'ÜSchO §§ 52, 53, 61; VV „Zahl der benoteten Klassenarbeiten …" vom 12.07.2012 (Amtsbl. 8/2012 S. 277, Geltung 2026 nicht gesichert)'
  if (k.kern) {
    let anzahl: string
    if (k.gruppe === 'deutsch') anzahl = k.grade <= 8 ? '4 im Schuljahr (3 Texte und 1 Rechtschreibung)' : '4 im Schuljahr'
    else if (k.gruppe === 'mathematik' || k.subjectId === 'latein') anzahl = '4 im Schuljahr'
    else if (k.subjectId === 'englisch') anzahl = k.grade <= 5 ? '3 im Schuljahr' : '4 im Schuljahr'
    else anzahl = 'als 1. Fremdsprache Kl. 5: 3, sonst 4; als 2. Fremdsprache im 1. Lernjahr 3, sonst 4; als 3. Fremdsprache 2–4 im Schuljahr'
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl,
      hinweis:
        k.gruppe === 'fremdsprache'
          ? 'Je Klassenstufe ist eine Arbeit durch eine mündliche Leistungsfeststellung ersetzbar. Ankündigung mindestens eine Woche vorher.'
          : 'Ankündigung mindestens eine Woche vorher; in Kl. 5 und 7 mindestens eine Arbeit als Parallelarbeit.',
      quelle,
      nichtGesichert: true
    }
  }
  return {
    bezeichnung: 'schriftliche Überprüfung',
    anzahl: 'höchstens eine je Halbjahr',
    dauer: 'höchstens 30 min',
    keineKlassenarbeit: true,
    hinweis: `In Rheinland-Pfalz werden in ${k.fach} keine Klassenarbeiten geschrieben (Ausnahme: Wahlpflichtfach an Realschule plus/IGS, 3–4). Möglich ist eine schriftliche Überprüfung je Halbjahr über den Stoff von höchstens zehn Stunden, nicht in den letzten vier Wochen vor der Zeugniskonferenz (ÜSchO § 52 Abs. 4).`,
    quelle
  }
}

function saarland(k: Kontext): Nachweis {
  const quelle = 'Erlass zur Leistungsbewertung in den Schulen des Saarlandes vom 09.07.2024 (Amtsbl. I S. 506), Nr. 3.4'
  if (k.kern) {
    const dauer =
      k.grade <= 6 ? 'etwa 45 min' : k.gruppe === 'deutsch' && k.grade >= 9 ? '45–135 min' : '45–90 min'
    return {
      bezeichnung: 'schriftliche Arbeit',
      anzahl: '2 im Schuljahr (je Halbjahr eine) als Teil von 4 großen Leistungsnachweisen',
      dauer,
      hinweis:
        k.gruppe === 'fremdsprache'
          ? 'Schriftliches Fach (1./2. Fremdsprache, am Gymnasium auch 3.); mindestens jedes zweite Jahr eine mündliche Prüfung.'
          : 'Dazu mindestens eine medien- und materialgestützte Arbeit im Schuljahr.',
      quelle
    }
  }
  const abKlasse = k.gym ? 8 : 9
  if (k.grade >= abKlasse) {
    return {
      bezeichnung: 'schriftliche Überprüfung',
      anzahl: 'ein großer Leistungsnachweis je Halbjahr, davon höchstens eine schriftliche Überprüfung im Schuljahr',
      dauer: 'höchstens eine Unterrichtsstunde',
      keineKlassenarbeit: true,
      hinweis: `Im Saarland werden schriftliche Arbeiten nur in Deutsch, Mathematik und den Fremdsprachen geschrieben; in ${k.fach} ist eine schriftliche Überprüfung über den Stoff der letzten sechs Stunden möglich.`,
      quelle
    }
  }
  return {
    bezeichnung: 'Lernkontrolle',
    keineKlassenarbeit: true,
    hinweis: `Im Saarland zählen in ${k.fach} vor Klasse ${abKlasse} nur die sonstigen Leistungen; große Leistungsnachweise sind nicht vorgesehen.`,
    quelle
  }
}

function sachsen(k: Kontext): Nachweis {
  const quelle = k.gym ? 'SOGYA § 27 (zuletzt geändert 15.06.2026)' : 'SOOSA § 24a (zuletzt geändert 15.06.2026)'
  const zentral =
    k.gym && k.grade === 10 && ['deutsch', 'mathematik', 'englisch'].includes(k.subjectId)
      ? ' In Kl. 10 gibt es in diesem Fach die zentrale besondere Leistungsfeststellung (etwa 90 min, zählt doppelt).'
      : ''
  return {
    bezeichnung: 'Klassenarbeit',
    anzahl: k.gym ? 'keine Landesvorgabe (Gesamtlehrerkonferenz; je Schüler höchstens 20 im Schuljahr)' : 'keine Landesvorgabe (Fachkonferenz)',
    hinweis: `Ankündigung in der Regel mindestens eine Woche vorher; komplexe Leistungen können Klassenarbeiten gleichgestellt werden.${zentral}`,
    quelle
  }
}

function sachsenAnhalt(k: Kontext): Nachweis {
  const quelle = 'RdErl. MK „Leistungsbewertung und Beurteilung …" vom 26.06.2012, Nr. 4.1.3 (spätere Änderungen nicht gesichert)'
  if (k.gruppe === 'sport') return { bezeichnung: 'Leistungsnachweis', keineKlassenarbeit: true, hinweis: 'In Sport werden keine Klassenarbeiten geschrieben.', quelle }
  const kernfach = k.gruppe === 'deutsch' || k.gruppe === 'mathematik' || k.subjectId === 'englisch'
  if (kernfach) {
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl: 'mindestens 2 im Schuljahr (Fachkonferenz)',
      dauer: k.grade >= 8 ? 'mindestens 45 min, mindestens eine Arbeit 90 min' : 'mindestens 45 min',
      hinweis: 'Dass Deutsch, Mathematik und Englisch die Kernfächer sind, ist abgeleitet und nicht gesichert.',
      quelle,
      nichtGesichert: true
    }
  }
  return {
    bezeichnung: 'Klassenarbeit',
    anzahl: 'mindestens 1 im Schuljahr (versetzungsrelevante Fächer; Ausnahmen möglich)',
    dauer: 'mindestens 45 min',
    quelle,
    nichtGesichert: true
  }
}

/** Schleswig-Holstein: Zahlen je Jahrgangsblock – „Gesamtzahl/davon mindestens Klassenarbeiten" */
const SH_G9: Record<string, [string | null, string | null]> = {
  deutsch: ['10/7', '17/12'],
  mathematik: ['11/8', '15/11'],
  fs1: ['10/7', '12/9'],
  fs2: [null, '15/10'],
  informatik: [null, '2/1'],
  naturwissenschaft: [null, '4/3'],
  gesellschaft: [null, '4/3']
}
const SH_GEMS: Record<string, [string | null, string | null]> = {
  deutsch: ['11/8', '17/12'],
  mathematik: ['11/8', '17/12'],
  fs1: ['10/7', '15/10'],
  fs2: [null, '15/8'],
  informatik: [null, '2/1'],
  naturwissenschaft: ['4/3', '8/6'],
  gesellschaft: ['5/4', '10/8']
}

function schleswigHolstein(k: Kontext): Nachweis {
  const quelle = 'Erlass „Leistungsnachweise in der Sekundarstufe I" vom 4.6.2025, Nr. 4'
  if (k.gruppe === 'sport' || k.gruppe === 'aesthetik') {
    return {
      bezeichnung: 'Leistungsnachweis',
      keineKlassenarbeit: true,
      hinweis: `In Schleswig-Holstein sind in ${k.fach} nur gleichwertige Leistungsnachweise vorgesehen (Jg. 7–10: 2, davon 0 Klassenarbeiten).`,
      quelle
    }
  }
  const tabelle = k.gym ? SH_G9 : k.schoolTypeId === 'gemeinschaftsschule' ? SH_GEMS : null
  const schluessel =
    k.gruppe === 'deutsch' || k.gruppe === 'mathematik' || k.gruppe === 'informatik' || k.gruppe === 'naturwissenschaft' || k.gruppe === 'gesellschaft'
      ? k.gruppe
      : istFs(k.gruppe)
        ? k.subjectId === 'englisch'
          ? 'fs1'
          : 'fs2'
        : null
  const zeile = tabelle && schluessel ? tabelle[schluessel] : null
  const wert = zeile ? (k.grade <= 6 ? zeile[0] : zeile[1]) : null
  if (!wert) {
    return {
      bezeichnung: 'Klassenarbeit',
      hinweis: 'Die Zahl je Jahrgang legt die Schulleitung nach Anhörung der Fachkonferenzen fest; für dieses Fach bzw. diesen Jahrgangsblock nennt der Erlass keine Zahl.',
      quelle
    }
  }
  const [gesamt, davon] = wert.split('/')
  const block = k.grade <= 6 ? 'Jg. 5–6' : 'Jg. 7–10'
  const hinweise = ['Die Verteilung auf die Jahrgänge legt die Schulleitung nach Anhörung der Fachkonferenzen fest.']
  if (k.gruppe === 'mathematik') hinweise.push('Jede Klassenarbeit enthält einen Wiederholungsteil zu grundlegenden Kompetenzen.')
  if (k.gruppe === 'fremdsprache') hinweise.push('Die Sprechprüfung ist eine Form der Klassenarbeit.')
  if (schluessel === 'fs2') hinweise.push('Als 1. Fremdsprache gelten die Zahlen wie in Englisch.')
  if (k.gruppe === 'naturwissenschaft' || k.gruppe === 'gesellschaft') hinweise.push('Die Zahl gilt für den ganzen Fachbereich; die Fächer wählt die Schulkonferenz.')
  return {
    bezeichnung: 'Klassenarbeit',
    anzahl: `${block} zusammen ${gesamt} Leistungsnachweise, davon mindestens ${davon} Klassenarbeiten`,
    hinweis: hinweise.join(' '),
    quelle
  }
}

function thueringen(k: Kontext): Nachweis {
  const quelle = 'ThürSchulO § 58 (Lesefassung ab 01.08.2025)'
  const pflicht = k.gruppe === 'deutsch' || k.gruppe === 'mathematik' || k.subjectId === 'englisch'
  if (pflicht || istFs(k.gruppe)) {
    return {
      bezeichnung: 'Klassenarbeit',
      anzahl: pflicht ? 'mindestens 1 je Halbjahr' : 'als 1. Fremdsprache mindestens 1 je Halbjahr, sonst nach Fachkonferenz',
      hinweis:
        k.gym && k.grade === 10 && (k.gruppe === 'deutsch' || k.gruppe === 'mathematik')
          ? 'Gymnasium Kl. 10: In den Fächern der besonderen Leistungsfeststellung entfallen im 2. Halbjahr die Klassenarbeiten.'
          : 'An zwei aufeinanderfolgenden Unterrichtstagen ist nur eine Klassenarbeit zulässig.',
      quelle
    }
  }
  return {
    bezeichnung: 'Leistungsnachweis',
    hinweis: `In Thüringen sind in ${k.fach} keine Klassenarbeiten vorgeschrieben; Art, Zahl und Umfang der Leistungsnachweise legt die Fachkonferenz fest.`,
    quelle
  }
}

const LAENDER: Record<string, (k: Kontext) => Nachweis> = {
  NI: niedersachsen,
  NW: nordrheinWestfalen,
  BY: bayern,
  BW: badenWuerttemberg,
  HE: hessen,
  BE: berlin,
  BB: brandenburg,
  HB: bremen,
  HH: hamburg,
  MV: mecklenburgVorpommern,
  RP: rheinlandPfalz,
  SL: saarland,
  SN: sachsen,
  ST: sachsenAnhalt,
  SH: schleswigHolstein,
  TH: thueringen
}

/**
 * Vorschlag für Art und Bezeichnung des Leistungsnachweises.
 *
 * Reine Funktion; die Oberfläche belegt damit Titel/Bezeichnung vor und zeigt `hinweis`
 * (bei `keineKlassenarbeit` als Warnung). Die Lehrkraft kann die Bezeichnung ändern.
 */
export function nachweisFuer(anfrage: NachweisAnfrage): Nachweis {
  /*
   * Schulformen ohne eigene Regeln im Bericht (Kooperative Gesamtschule, berufliches Gymnasium,
   * Wirtschaftsschule, FOS/BOS, Förderschule …, 30.09.2026): Regeln der Bezugsform aus
   * @shared/schulformen – ausdrücklich als nicht gesichert gekennzeichnet.
   */
  const form = schulformVon(anfrage.stateId, anfrage.schoolTypeId)
  const bezug = form?.bezug ? datenSchulform(anfrage.stateId, anfrage.schoolTypeId) : null
  if (form && bezug && bezug !== anfrage.schoolTypeId) {
    const r = nachweisFuer({ ...anfrage, schoolTypeId: bezug })
    const bezugName = schulformVon(anfrage.stateId, bezug)?.name ?? bezug
    return {
      ...r,
      nichtGesichert: true,
      hinweis: [r.hinweis, `Für die Schulform „${form.name}" nicht eigens belegt – Regeln der Schulform „${bezugName}" übernommen (nicht gesichert).`]
        .filter(Boolean)
        .join(' ')
    }
  }
  const k: Kontext = {
    ...anfrage,
    gruppe: fachgruppe(anfrage.subjectId),
    kern: istKernfach(anfrage.subjectId),
    gym: anfrage.schoolTypeId === 'gymnasium',
    fach: fachName(anfrage.subjectId)
  }
  if (istOberstufe(k)) return oberstufe(k)
  if (k.schoolTypeId === 'grundschule' || k.grade < 5) return { bezeichnung: 'Klassenarbeit' }
  const land = LAENDER[k.stateId]
  return land ? land(k) : NEUTRAL(k)
}
