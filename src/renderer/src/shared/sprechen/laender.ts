/**
 * Sprechprüfungen in den modernen Fremdsprachen je Land (01.10.2026).
 *
 * Hinterlegt ist, was sich amtlich belegen ließ (Fundstellen in recherche/sprechpruefung-2026-10-01.md
 * und in `quellen`). Wo ein Land nichts Eigenes regelt oder nichts zu finden war, gilt der
 * KMK-Rahmen mit vorsichtigen Richtwerten – das steht dann ausdrücklich in `unsicher`, damit die
 * Oberfläche es nicht als Landesregel ausgibt. Lieber eine ehrliche Lücke als eine erfundene Vorgabe.
 */
import type { Gewichtung } from './raster'

/** Woran die Prüfung festgemacht ist: Ersatz einer Klassenarbeit Pflicht, möglich oder nicht vorgesehen */
export type Ersatzregel = 'pflicht' | 'moeglich' | 'nein' | 'unbekannt'

export type SprechMaterial = 'bild' | 'cartoon' | 'diagramm' | 'text' | 'zitat' | 'situation'

export const SPRECH_MATERIALIEN: { value: SprechMaterial; label: string }[] = [
  { value: 'bild', label: 'Bild bzw. Foto' },
  { value: 'cartoon', label: 'Cartoon (Beschreibung)' },
  { value: 'diagramm', label: 'Diagramm bzw. Statistik' },
  { value: 'text', label: 'Kurzer Text' },
  { value: 'zitat', label: 'Zitat' },
  { value: 'situation', label: 'Situationsimpuls bzw. Rollenkarte' }
]

/** Vorgaben eines Landes – Voreinstellungen der Sprechprüfung */
export interface SprechLand {
  stateId: string
  /** Lehrplanwerk, wie das Land es nennt */
  lehrplan: string
  /** Bezeichnung der Prüfung im Land */
  bezeichnung: string
  /** Ersetzt die Sprechprüfung eine schriftliche Arbeit? Sek I */
  ersatzSek1: Ersatzregel
  /** dasselbe für die Oberstufe (Klausur) */
  ersatzSek2: Ersatzregel
  /** Regel im Wortlaut der Fundstelle, knapp */
  regel: string
  /** Voreingestellte Gruppengröße */
  gruppe: 2 | 3
  /** Richtwerte in Minuten */
  vorbereitung: number
  aufwaermen: number
  /** je Prüfling */
  monolog: number
  /** je Gruppe */
  dialog: number
  /** Kriterien mit Gewicht (Prozent) */
  kriterien: Gewichtung[]
  /** Fundstellen */
  quellen: string[]
  /** Was nicht belegt ist – erscheint als Hinweis */
  unsicher: string[]
}

/**
 * Gewichtung Sprache 60 : Inhalt 40 – belegt in der Handreichung Paarprüfung MV (2025) und als eine der
 * beiden Gewichtungen der KMK 2012 (60/40 bzw. 70/30); Niedersachsen: „sprachliche Leistung hat ein
 * größeres Gewicht als die inhaltliche". Die Aufteilung auf Einzelkriterien ist eine Ableitung der App.
 */
const GEWICHTE_60_40: Gewichtung[] = [
  { id: 'aufgabe', gewicht: 25 },
  { id: 'interaktion', gewicht: 15 },
  { id: 'spektrum', gewicht: 20 },
  { id: 'korrektheit', gewicht: 20 },
  { id: 'aussprache', gewicht: 10 },
  { id: 'fluessigkeit', gewicht: 10 }
]

const KMK_QUELLE =
  'KMK-Bildungsstandards fortgeführte Fremdsprache AHR 2012 (kurzer Impuls, Einzel-, Partner- oder Gruppenprüfung): https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2012/2012_10_18-Bildungsstandards-Fortgef-FS-Abi.pdf'
const ABGELEITET =
  'Zeiten und Vorbereitung sind für dieses Land nicht belegt – Richtwerte abgeleitet aus der Paarprüfung MV (Einstieg ca. 2 min, Monolog, Diskussion, bis zu 2 min Orientierung).'

/** Gemeinsamer Rahmen nach den KMK-Bildungsstandards, solange ein Land nichts Eigenes belegt */
export const KMK_SPRECHEN: SprechLand = {
  stateId: 'KMK',
  lehrplan: 'KMK-Bildungsstandards',
  bezeichnung: 'Sprechprüfung',
  ersatzSek1: 'unbekannt',
  ersatzSek2: 'unbekannt',
  regel: 'Für dieses Land ist keine eigene Regel hinterlegt; Ersatz einer Klassenarbeit nur nach Erlasslage und Fachkonferenzbeschluss.',
  gruppe: 2,
  vorbereitung: 2,
  aufwaermen: 2,
  monolog: 3,
  dialog: 8,
  kriterien: GEWICHTE_60_40,
  quellen: [KMK_QUELLE],
  unsicher: ['Für dieses Land ist keine eigene Regel zur Sprechprüfung hinterlegt.', ABGELEITET]
}

const land = (stateId: string, p: Partial<SprechLand> & Pick<SprechLand, 'lehrplan' | 'regel' | 'quellen'>): SprechLand => ({
  ...KMK_SPRECHEN,
  stateId,
  unsicher: [ABGELEITET],
  ...p
})

/** Je Land: Fundstellen und Lücken in recherche/sprechpruefung-2026-10-01.md */
export const SPRECH_LAENDER: Record<string, SprechLand> = {
  BW: land('BW', {
    lehrplan: 'Bildungsplan 2016',
    bezeichnung: 'Kommunikationsprüfung',
    regel:
      'Ersatz einer Klassenarbeit durch eine Sprechprüfung in der Sek I nicht belegt (die NVO nennt die GFS als Ersatzform); Kommunikationsprüfung in Kursstufe und Abitur nicht am Wortlaut geprüft.',
    quellen: [
      'Bildungsplan 2016 Englisch Gymnasium: https://www.bildungsplaene-bw.de/,Lde/BP2016BW_ALLG_GYM_E1',
      'NVO: https://www.landesrecht-bw.de/bsbw/document/jlr-NNLBW00007BBD'
    ],
    unsicher: ['Format der Kommunikationsprüfung (Dauer, Gruppengröße, Gewichtung) nicht am Wortlaut geprüft.', ABGELEITET]
  }),
  BY: land('BY', {
    lehrplan: 'LehrplanPLUS',
    bezeichnung: 'mündliche Schulaufgabe',
    ersatzSek1: 'pflicht',
    ersatzSek2: 'pflicht',
    regel:
      'GSO § 22: In mindestens zwei Jahrgangsstufen (5–11) wird eine Schulaufgabe ganz oder teilweise mündlich abgehalten; in Jgst. 12 oder 13 eine Schulaufgabe mündlich, möglichst als Partner- oder Gruppenprüfung.',
    quellen: ['GSO § 22: https://www.gesetze-bayern.de/Content/Document/BayGSO-22'],
    unsicher: ['Dauer und Raster stehen in ISB-Material, das nicht ausgewertet ist.', ABGELEITET]
  }),
  BE: land('BE', {
    lehrplan: 'Rahmenlehrplan 1–10 (2025)',
    ersatzSek1: 'pflicht',
    regel:
      'Sek I-VO § 19: In den modernen Fremdsprachen einmal je Schuljahr eine Sprechprüfung als Klassenarbeit (Einzel- oder Gruppenprüfung, höchstens drei Personen).',
    quellen: ['Sek I-VO § 19: https://gesetze.berlin.de/bsbe/document/jlr-SekIVBE2010V31P19']
  }),
  BB: land('BB', {
    lehrplan: 'Rahmenlehrplan 1–10 (2025)',
    ersatzSek1: 'moeglich',
    regel: 'VV-Leistungsbewertung: Je Jahrgangsstufe kann eine Pflichtarbeit durch eine mündliche Leistung ersetzt werden (Fachkonferenz).',
    quellen: ['VV-Leistungsbewertung: https://bravors.brandenburg.de/verwaltungsvorschriften/vv_leistungsbewertung']
  }),
  HB: land('HB', {
    lehrplan: 'Bildungsplan Gymnasium (2006)',
    regel: 'Eine Regel zum Ersatz einer Klassenarbeit durch eine Sprechprüfung wurde nicht gefunden.',
    quellen: ['Bildungsplan Englisch Gymnasium: https://www.lis.bremen.de/sixcms/media.php/13/Gy_Englisch_2006.pdf'],
    unsicher: ['Keine Bremer Regel zur Sprechprüfung gefunden.', ABGELEITET]
  }),
  HH: land('HH', {
    lehrplan: 'Bildungsplan (2022)',
    ersatzSek1: 'pflicht',
    regel:
      'Bildungsplan Teil C: Einmal in der Sek I je neuerer Fremdsprache (frühestens 3. Lernjahr, nicht vor Jg. 7) eine Sprechprüfung, die eine Klassenarbeit ersetzt; Gruppen aus zwei bis fünf Prüflingen.',
    quellen: [
      'Bildungsplan Teil C Leistungsbewertung: https://dokumente.hamburg.de/resource/blob/798488/251acd87545f55fad72fc95d6402821c/teil-c-leistungsbewertung-data.pdf'
    ]
  }),
  HE: land('HE', {
    lehrplan: 'Kerncurriculum (2023)',
    regel: 'Für die Sek I keine Regel gefunden; in der Q-Phase soll eine Sprechprüfung eine Klausur ersetzen können (OAVO nicht am Wortlaut geprüft).',
    quellen: [
      'KC moderne Fremdsprachen Sek I: https://kultus.hessen.de/sites/kultus.hessen.de/files/2023-07/2023_-_kerncurriculum_moderne_fremdsprachen_-_sekundarstufe_i_gymnasium.pdf'
    ],
    unsicher: ['Regel der OAVO zur Sprechprüfung in der Q-Phase nicht geprüft.', ABGELEITET]
  }),
  MV: land('MV', {
    lehrplan: 'Rahmenplan (2025)',
    bezeichnung: 'Sprechprüfung (Paarprüfung)',
    ersatzSek1: 'pflicht',
    regel:
      'LeistBewVO: In Jg. 7/8 eine Arbeit mit mündlichem Teil, spätestens ab Jg. 9 eine gleichwertige Sprechleistung; Abitur als Paarprüfung (höchstens 30 min, Sprache 60 % : Inhalt 40 %).',
    monolog: 4,
    dialog: 10,
    quellen: [
      'Handreichung Paarprüfung Abitur: https://www.bildung-mv.de/export/sites/bildungsserver/.galleries/dokumente/unterricht/Handreichung_Paarpruefung_Abitur_moderne-Fremdsprachen.pdf',
      'LeistBewVO M-V: https://www.regierung-mv.de/serviceassistent/download?id=1690073'
    ],
    unsicher: [
      'Zeiten aus der Abitur-Paarprüfung (Einstieg 2 min unbewertet, Monolog ca. 4 min je Prüfling, Diskussion ca. 5 min je Prüfling); für die Sek I nicht eigens geregelt.'
    ]
  }),
  NI: land('NI', {
    lehrplan: 'Kerncurriculum',
    ersatzSek1: 'pflicht',
    ersatzSek2: 'moeglich',
    regel:
      'Kerncurriculum: Sprechen wird einmal je Doppeljahrgang (7/8, 9/10) in einer Sprechprüfung überprüft, die eine Klassenarbeit ersetzt (Jg. 6 fakultativ); in der Oberstufe kann sie eine Klausur ersetzen, nicht die unter Abiturbedingungen.',
    quellen: [
      'KC Französisch Sek I: https://cuvo.nibis.de/index.php?p=download&upload=756',
      'KC Spanisch Sek I (Paare 1–3 Tage vorher auslosen): https://cuvo.nibis.de/index.php?p=download&upload=450',
      'KC gymnasiale Oberstufe Englisch: https://cuvo.nibis.de/index.php?p=download&upload=77'
    ],
    unsicher: ['Dauer, Vorbereitungszeit und Raster sind im Kerncurriculum nicht festgelegt.', ABGELEITET]
  }),
  NW: land('NW', {
    lehrplan: 'Kernlehrplan',
    bezeichnung: 'mündliche Kommunikationsprüfung',
    ersatzSek1: 'moeglich',
    ersatzSek2: 'pflicht',
    regel:
      'KLP Sek I: Einmal im Schuljahr kann eine Klassenarbeit durch eine mündliche Kommunikationsprüfung ersetzt werden, in Englisch im letzten Schuljahr der Sek I verpflichtend. Q-Phase: in einem der ersten drei Halbjahre ersetzt eine mündliche Kommunikationsprüfung eine Klausur.',
    quellen: [
      'KLP Englisch Realschule: https://lehrplannavigator.nrw.de/system/files/media/document/file/rs_e_klp_2022_06_13.pdf',
      'KLP GOSt Englisch 2023: https://lehrplannavigator.nrw.de/system/files/media/document/file/gost_klp_e_2023_06_07_0.pdf',
      'APO-GOSt § 14: https://bass.schule.nrw/9607.htm'
    ],
    unsicher: ['APO-GOSt formuliert „kann", der KLP Englisch „wird" – nicht abschließend geklärt.', ABGELEITET]
  }),
  RP: land('RP', {
    lehrplan: 'Lehrplan',
    ersatzSek1: 'moeglich',
    regel:
      'VV Zahl der Klassenarbeiten: In den Fremdsprachen kann ab dem 2. Halbjahr des 1. Lernjahres je Klassenstufe eine Arbeit durch eine mündliche Leistungsfeststellung ersetzt werden.',
    quellen: ['VV Zahl der benoteten Klassenarbeiten (Archivfassung 2023): https://web.archive.org/web/20231024133234/https://rfb.bildung-rp.de/'],
    unsicher: ['Geltung der VV im Jahr 2026 nicht geprüft.', ABGELEITET]
  }),
  SL: land('SL', {
    lehrplan: 'Lehrplan (2025)',
    bezeichnung: 'mündliche Prüfung (großer Leistungsnachweis)',
    ersatzSek1: 'nein',
    ersatzSek2: 'nein',
    regel:
      'Erlass Leistungsbewertung 2024: Sprechen mindestens jedes zweite Schuljahr in einer mündlichen Prüfung (Einzel-, Paar- oder Gruppenprüfung); sie zählt als eigener großer Leistungsnachweis und ersetzt keine schriftliche Arbeit.',
    quellen: [
      'Erlass Leistungsbewertung 2024: https://www.saarland.de/SharedDocs/Downloads/DE/mbk/Bildungsserver/allgemeine-informationen/erlass_leistungbewert_2024.pdf'
    ]
  }),
  SN: land('SN', {
    lehrplan: 'Lehrplan',
    regel: 'Eine Regel zum Ersatz einer Klassenarbeit durch eine Sprechprüfung wurde nicht gefunden.',
    quellen: [KMK_QUELLE],
    unsicher: ['Keine sächsische Regel zur Sprechprüfung geprüft.', ABGELEITET]
  }),
  ST: land('ST', {
    lehrplan: 'Fachlehrplan (2022)',
    regel: 'Eine Klassenarbeit kann nur durch eine gleichwertige komplexe Leistung ersetzt werden; eine eigene Sprechprüfung ist nicht belegt.',
    quellen: ['Fachlehrplan Englisch Gymnasium: https://www.bildung-lsa.de/files/b45de329c361a40a2f0a7211902d5815/FLP_Englisch_Gym_010822_swd.pdf'],
    unsicher: ['Regel zur Sprechprüfung nicht belegt (nur inoffizielle Wiedergabe der Leistungsbewertung).', ABGELEITET]
  }),
  SH: land('SH', {
    lehrplan: 'Fachanforderungen (2014)',
    ersatzSek1: 'pflicht',
    ersatzSek2: 'moeglich',
    regel:
      'Fachanforderungen: Bis zum Ende der Sek I wird mindestens eine Klassenarbeit durch eine Sprechprüfung ersetzt (Einzel-, Partner- oder Gruppenprüfung); in der Sek II möglich. Abitur: 20 min (Paar) bzw. 25 min (Dreier), keine Vorbereitungszeit.',
    vorbereitung: 0,
    monolog: 4,
    dialog: 10,
    quellen: [
      'Fachanforderungen Englisch: https://fachportal.lernnetz.de/files/Fachanforderungen%20und%20Leitf%C3%A4den/Sekundarstufe/Fachanforderungen/Fachanforderungen%20Englisch%20Sekundarstufe%20%282014%2C%20barrierearm%29.pdf'
    ],
    unsicher: [
      'Die Fachanforderungen sehen für Sprechen eine ganzheitliche Bewertung vor; das Raster gliedert sie nur auf.',
      'Zeiten aus dem Abiturformat abgeleitet.'
    ]
  }),
  TH: land('TH', {
    lehrplan: 'Lehrplan',
    regel:
      'ThürSchulO: Gymnasium Kl. 10 besondere Leistungsfeststellung in der 1. Fremdsprache mündlich; ab 2026/27 mündliche Kommunikationsprüfung Englisch im Realschulabschluss. Ersatz einer Klassenarbeit nicht geregelt.',
    quellen: ['Thüringer Schulordnung: https://bildung.thueringen.de/fileadmin/ministerium/publikationen/thueringer_schulordnung.pdf']
  })
}

/** Vorgaben des Landes (oder der KMK-Rahmen) */
export const sprechLand = (stateId: string): SprechLand => SPRECH_LAENDER[stateId] ?? KMK_SPRECHEN

/** Einstellungen einer Sprechprüfung in der Klassenarbeit */
export interface SprechSetup {
  gruppe: 2 | 3
  /** gleichwertige Kartensätze, damit aufeinanderfolgende Gruppen verschiedene Aufgaben bekommen */
  kartensaetze: number
  /** ersetzt eine schriftliche Klassenarbeit */
  ersetztArbeit: boolean
  vorbereitung: number
  aufwaermen: number
  monolog: number
  dialog: number
  material: SprechMaterial[]
}

export const MAX_KARTENSAETZE = 6

/** Voreinstellung nach dem Land */
export function sprechSetupFuer(stateId: string, grade: number, sek2 = grade >= 11): SprechSetup {
  const l = sprechLand(stateId)
  const ersatz = sek2 ? l.ersatzSek2 : l.ersatzSek1
  return {
    gruppe: l.gruppe,
    kartensaetze: 2,
    ersetztArbeit: ersatz === 'pflicht' || ersatz === 'moeglich',
    vorbereitung: l.vorbereitung,
    aufwaermen: l.aufwaermen,
    monolog: l.monolog,
    dialog: l.dialog,
    material: grade >= 9 ? ['bild', 'diagramm', 'zitat', 'situation'] : ['bild', 'situation']
  }
}

/** Prüfungszeit je Gruppe (ohne Vorbereitung) */
export const pruefungsdauer = (s: Pick<SprechSetup, 'gruppe' | 'aufwaermen' | 'monolog' | 'dialog'>): number => s.aufwaermen + s.monolog * s.gruppe + s.dialog
