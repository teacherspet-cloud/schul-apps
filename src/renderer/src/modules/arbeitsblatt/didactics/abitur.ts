/**
 * Abiturbezogene Übungsaufgaben und Übungsklausuren für den 12./13. Jahrgang.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Analysiere das Material der Abituraufgaben
 * Niedersachsens […], um daran angelehnt für den 12./13. Jahrgang im jeweiligen Fach
 * Übungsaufgaben auf Arbeitsblättern zu ermöglichen."
 *
 * WAS HIER STEHT UND WOHER ES KOMMT
 * Die Angaben stammen aus direkt abgerufenen Primärquellen: der EB-AVO-GOBAK (RdErl. vom
 * 19.05.2005, zuletzt geändert 23.02.2025), den fachbezogenen „Hinweisen zur schriftlichen
 * Abiturprüfung" des Landes Niedersachsen für 2027 bzw. 2029, den Einheitlichen
 * Prüfungsanforderungen (EPA) der KMK und den niedersächsischen Kerncurricula Sek II.
 * Jede Angabe trägt ihre Quelle bei sich. Was nicht belegt werden konnte, steht als `offen`
 * dabei – und zwar sichtbar, damit die Lehrkraft es nicht für eine Vorgabe hält.
 *
 * ES GIBT KEIN EINHEITLICHES ABITURFORMAT. Deutsch legt vier Aufgaben zur Auswahl vor,
 * Biologie vier mit Auswahl von dreien, die Gesellschaftswissenschaften zwei. Mathematik hat
 * einen hilfsmittelfreien Teil, die Fremdsprachen drei getrennt gewichtete Prüfungsteile.
 * Deshalb ein Profil je Fachgruppe und keine gemeinsame Schablone.
 *
 * WICHTIG ZUM MATERIAL: Die veröffentlichten Aufgabenpakete des Landes enthalten aus
 * urheberrechtlichen Gründen „keinerlei Texte, Abbildungen, Fotos oder Tondokumente fremder
 * Urheber […], sondern nur Quellenangaben zu diesen Materialien" (Nutzungsbedingungen
 * za-aufgaben.nibis.de). Das Aufgabengerüst lässt sich also nachbilden, das Material nicht –
 * es muss beschafft werden. Genau dafür gibt es die Materialsuche dieser App.
 */
import type { AbiturVorgaben, WorksheetMeta } from '../model/types'

/** Grundlegendes und erhöhtes Anforderungsniveau. */
export type Anforderungsniveau = 'gA' | 'eA'

export const NIVEAU_LABEL: Record<Anforderungsniveau, string> = {
  gA: 'grundlegendes Anforderungsniveau',
  eA: 'erhöhtes Anforderungsniveau'
}

export interface AbiturAufgabenart {
  id: string
  label: string
  /** Was die Aufgabe verlangt – erscheint als Erklärung in der Auswahl */
  beschreibung: string
}

export interface Pruefungsteil {
  id: string
  label: string
  /** Anteil an der Gesamtbewertung in Prozent */
  anteil: number
  /** Bearbeitungszeit DIESES Teils in Minuten */
  minuten: number
  /**
   * Umfang der Textvorlage DIESES Teils in Woertern.
   *
   * Gemeldet von der Lehrkraft (24.09.2026): „die uebungsklausur abitur fuer englisch geht
   * davon aus, dass die gesamte laenge ueber bspw. Mediation gemacht wird […] mediation sind
   * nur 60 Minuten. Ein Text bei meiner probe wurde viel zu lang fuer 60 minuten."
   *
   * Die Ursache: Das Fachprofil trug nur EINE Zeit und EINE Wortzahl – naemlich die der
   * Schreibaufgabe. Wer Sprachmittlung waehlte, bekam trotzdem 225 Minuten und 1000 Woerter
   * vorgegeben. In 60 Minuten ist das nicht zu schaffen.
   */
  woerter?: Record<Anforderungsniveau, number>
}

export interface AbiturProfil {
  id: string
  fachIds: string[]
  label: string
  aufgabenarten: AbiturAufgabenart[]
  /** Fremdsprachen: getrennt gewichtete Prüfungsteile */
  pruefungsteile?: Pruefungsteil[]
  /** Bearbeitungszeit der ganzen Prüfung in Minuten */
  zeit: Record<Anforderungsniveau, number>
  /** Zeit, die vor der Bearbeitung für die Auswahl zur Verfügung steht */
  auswahlzeit: number
  /** Wie viele Aufgaben vorgelegt und wie viele bearbeitet werden */
  vorgelegt: number
  zuBearbeiten: number
  /** Soll-Anteile der Anforderungsbereiche in Prozent */
  afb: Record<Anforderungsniveau, { I: number; II: number; III: number }>
  /** Umfang der Textvorlage in Wörtern, soweit vorgegeben */
  materialWoerter?: Record<Anforderungsniveau, number>
  /** Wie bewertet wird */
  bewertung: string
  /** Wie die Operatorenliste des Faches aufgebaut ist */
  operatoren: 'afb-strikt' | 'afb-spanne' | 'ohne-afb' | 'kompetenzbereich'
  /** Regeln für das Material, soweit fachspezifisch belegt */
  material: string[]
  quelle: string
  /** Was sich nicht belegen ließ – wird der Lehrkraft angezeigt */
  offen?: string
}

/*
 * Deutsch
 *
 * Belegt: Hinweise zur schriftlichen Abiturprüfung 2027 und 2029, Abschnitt „Konzeption der
 * Abiturprüfungsaufgaben"; Kerncurriculum Deutsch Sek II, Kap. 5; Bewertungshinweise
 * Darstellungsleistung (Land Niedersachsen).
 *
 * Belegter Widerspruch: Die EB-AVO-GOBAK Nr. 9.1 nennt für Deutsch DREI Aufgabenvorschläge,
 * die fachbezogenen Hinweise 2027 und 2029 nennen VIER. Maßgeblich sind die Hinweise: Sie
 * sind jahrgangsbezogen, fachspezifisch und neuer.
 */
const DEUTSCH: AbiturProfil = {
  id: 'deutsch',
  fachIds: ['deutsch'],
  label: 'Deutsch',
  aufgabenarten: [
    { id: 'interpretation-lit', label: 'Interpretation literarischer Texte', beschreibung: 'Deutung eines literarischen Textes, gestützt auf Textbelege.' },
    { id: 'eroerterung-lit', label: 'Erörterung literarischer Texte', beschreibung: 'Auseinandersetzung mit einer These zu einem literarischen Text.' },
    { id: 'analyse-pragmatisch', label: 'Analyse pragmatischer Texte', beschreibung: 'Untersuchung eines Sachtextes nach Inhalt, Aufbau und Sprache.' },
    {
      id: 'materialgestuetzt-argumentierend',
      label: 'Materialgestütztes Verfassen argumentierender Texte',
      beschreibung: 'Eigener argumentierender Text auf der Grundlage mehrerer Materialien.'
    }
  ],
  zeit: { gA: 210, eA: 270 },
  auswahlzeit: 45,
  vorgelegt: 4,
  zuBearbeiten: 1,
  /*
   * Prozentwerte sind für Deutsch NICHT vorgegeben. Das Kerncurriculum sagt nur, dass auf
   * grundlegendem Niveau die Anforderungsbereiche I und II, auf erhöhtem II und III „stärker
   * zu akzentuieren" sind. Die Zahlen hier sind daraus abgeleitet – als Richtwert, nicht als
   * Vorgabe; sie stehen deshalb auch im Hinweis an die Lehrkraft.
   */
  afb: { gA: { I: 30, II: 50, III: 20 }, eA: { I: 20, II: 45, III: 35 } },
  bewertung:
    'Zwei getrennte Bereiche: Verstehensleistung und Darstellungsleistung. Bei textbezogenem Schreiben 70 % zu 30 %, beim materialgestützten Schreiben 60 % zu 40 %. Die Sprachrichtigkeit wird holistisch innerhalb der Darstellungsleistung bewertet – ein nachträglicher Punktabzug ist nicht zulässig.',
  operatoren: 'afb-spanne',
  material: [
    'Ein zusammenhängender Text als Grundlage; beim materialgestützten Schreiben mehrere kurze Materialien.',
    'Zeilennummern am Rand, damit sich Textbelege angeben lassen.'
  ],
  quelle: 'Hinweise zur schriftlichen Abiturprüfung Deutsch 2027/2029 (Nds.), KC Deutsch Sek II, Bewertungshinweise Darstellungsleistung',
  offen: 'Für Deutsch gibt es keine vorgegebenen Prozentanteile der Anforderungsbereiche und keine Wortzahlvorgabe für die Textvorlage.'
}

/*
 * Fortgeführte Fremdsprachen (Englisch, Französisch, Spanisch)
 *
 * Belegt: Erlass „Kombinierte Aufgaben in den fortgeführten Fremdsprachen … ab 2025"
 * (04.05.2023 i.d.F. 16.08.2023); Hinweise Englisch 2027; KMK-Bildungsstandards fortgeführte
 * Fremdsprache 2012, Kap. 3, auf die die niedersächsischen Hinweise ausdrücklich verweisen.
 *
 * Die Gewichtung 20/25/55 und die Zeiten sind belegt. Die Wortzahlen der Textvorlage
 * (gA ca. 800, eA ca. 1000) stammen aus den KMK-Bildungsstandards; ein zweiter Rechercheversuch
 * konnte das Dokument nicht mehr abrufen – der Wert ist deshalb als Richtwert gekennzeichnet.
 */
const FREMDSPRACHE: AbiturProfil = {
  id: 'fremdsprache',
  fachIds: ['englisch', 'franzoesisch', 'spanisch', 'italienisch'],
  label: 'Fortgeführte Fremdsprache',
  aufgabenarten: [
    { id: 'schreiben', label: 'Schreiben (Textaufgabe)', beschreibung: 'Drei Teilaufgaben zu einem Ausgangstext; bei der dritten besteht eine Wahl.' },
    { id: 'sprachmittlung', label: 'Sprachmittlung', beschreibung: 'Sinngemäße, adressatengerechte Wiedergabe eines deutschen Textes in der Zielsprache.' },
    { id: 'hoerverstehen', label: 'Hör-/Hörsehverstehen', beschreibung: 'Aufgaben zu einer Ton- oder Filmvorlage von höchstens fünf Minuten.' }
  ],
  pruefungsteile: [
    // Hoervorlage hoechstens fuenf Minuten – eine Textvorlage gibt es hier nicht
    { id: 'hoerverstehen', label: 'Hörverstehen', anteil: 20, minuten: 30 },
    /*
     * Sprachmittlung: 60 Minuten. Die Wortzahl ist NICHT amtlich vorgegeben; sie ist aus der
     * Zeit abgeleitet. Ein deutscher Gebrauchstext, der in einer Stunde zu lesen, zu
     * verstehen und adressatengerecht wiederzugeben ist, liegt bei 400 bis 500 Woertern –
     * die 800/1000 der Schreibaufgabe waeren in dieser Zeit nicht zu bewaeltigen.
     */
    { id: 'sprachmittlung', label: 'Sprachmittlung', anteil: 25, minuten: 60, woerter: { gA: 400, eA: 500 } },
    // Schreiben: die Zeit steht im Profil (gA 195 / eA 225), hier deshalb 0
    { id: 'schreiben', label: 'Schreiben', anteil: 55, minuten: 0, woerter: { gA: 800, eA: 1000 } }
  ],
  // Schreiben: eA 225 / gA 195 Minuten, darin 15 Minuten Auswahlzeit
  zeit: { gA: 195, eA: 225 },
  auswahlzeit: 15,
  vorgelegt: 2,
  zuBearbeiten: 1,
  afb: { gA: { I: 30, II: 50, III: 20 }, eA: { I: 20, II: 45, III: 35 } },
  materialWoerter: { gA: 800, eA: 1000 },
  bewertung:
    'Sprachliche Leistung 60 %, inhaltliche Leistung 40 %. Die sprachliche Leistung wird integrativ über Lexik, Grammatik und Textgestaltung bewertet. Eine ungenügende sprachliche oder inhaltliche Leistung schließt mehr als drei Punkte für den Prüfungsteil aus.',
  operatoren: 'kompetenzbereich',
  material: [
    'Die Textvorlage bleibt im vorgegebenen Umfang; bei mehreren Texten zählt die Summe.',
    'Höchstens fünf Arbeitsanweisungen.',
    'Bilder, Grafiken und Hörvorlagen nur in Verbindung mit einer schriftlichen Vorlage.',
    'Hörvorlage in der Regel höchstens fünf Minuten.'
  ],
  quelle: 'Erlass Kombinierte Aufgaben fortgeführte Fremdsprachen (Nds., 04.05.2023), Hinweise Englisch 2027, KMK-Bildungsstandards 2012',
  offen:
    'Die Wortzahlen 800/1000 fuer die Schreibaufgabe stammen aus den KMK-Bildungsstandards und konnten in der zweiten Recherche nicht erneut belegt werden. Fuer die Sprachmittlung gibt es gar keine amtliche Wortzahl – 400/500 sind aus den 60 Minuten Bearbeitungszeit abgeleitet.'
}

/*
 * Gesellschaftswissenschaften (Geschichte, Politik-Wirtschaft, Erdkunde, Werte und Normen,
 * Religion)
 *
 * Belegt: EB-AVO-GOBAK Nr. 9.1 (zwei Prüfungsaufgaben zur Auswahl); EPA Geschichte 3.3.3 und
 * 3.4; EPA Geographie 3.3; Kerncurricula Geschichte 2017, Politik-Wirtschaft 2018.
 *
 * Die fachbezogenen Hinweise dieser Fächer enthalten NUR inhaltliche Vorgaben (Wahlmodule),
 * keine Strukturvorgaben – das ist ein belegtes Negativergebnis.
 */
const GESELLSCHAFT: AbiturProfil = {
  id: 'gesellschaft',
  fachIds: ['geschichte', 'politik', 'erdkunde', 'werte-und-normen', 'religion'],
  label: 'Gesellschaftswissenschaften',
  aufgabenarten: [
    {
      id: 'materialgebunden',
      label: 'Materialgebundene Aufgabe',
      beschreibung: 'Wenige, aber komplexe Arbeitsanweisungen zu einem Material – kein additives Reihen von Einzelfragen.'
    },
    { id: 'quellenvergleich', label: 'Vergleich zweier Materialien', beschreibung: 'Zwei Materialien unterschiedlicher Art werden aufeinander bezogen.' },
    {
      id: 'produktionsorientiert',
      label: 'Produktionsorientierte Aufgabe',
      beschreibung: 'Eigener Text in einer Rolle oder Textsorte, gestützt auf das Material.'
    }
  ],
  zeit: { gA: 220, eA: 270 },
  auswahlzeit: 30,
  vorgelegt: 2,
  zuBearbeiten: 1,
  /*
   * Auch hier gibt es keine Prozentvorgaben. Belegt ist nur: Schwerpunkt AFB II, die übrigen
   * Bereiche „angemessen enthalten", und mit reiner AFB-I-Leistung ist keine ausreichende
   * Note erreichbar (EPA Geschichte 3.4).
   */
  afb: { gA: { I: 30, II: 50, III: 20 }, eA: { I: 20, II: 45, III: 35 } },
  bewertung:
    'Teilleistungen mit ausgewiesenem Anforderungsbereich und Gewichtung. Übliche Verhältnisse bei vier Teilaufgaben 2:3:3:2, bei drei Teilaufgaben 2:2:1. „Gut" setzt annähernd vier Fünftel der Gesamtleistung in allen drei Anforderungsbereichen voraus, „ausreichend" annähernd die Hälfte und Leistungen über AFB I hinaus.',
  operatoren: 'afb-strikt',
  material: [
    'Wenige Materialien: „Eine Vielzahl von Materialien innerhalb einer Prüfungsaufgabe ist zu vermeiden." (EPA Geschichte 3.3.3)',
    'Unterschiedliche Materialarten miteinander kombinieren (EPA Geographie 3.3).',
    'Keine ausdrückliche Zuordnung der Materialien zu einzelnen Teilaufgaben (EPA Geographie 3.3).',
    'Das Material darf im Unterricht nicht verwendet worden sein, muss aber in seiner Art vertraut sein.',
    'Zeilenzählung am Rand und Quellenangabe in wissenschaftlicher Zitierweise (EPA Geschichte 3.3.3).',
    'Sacherklärungen beifügen, soweit sie zum Verständnis nötig sind.'
  ],
  quelle: 'EB-AVO-GOBAK Nr. 9, EPA Geschichte 3.3.3/3.4, EPA Geographie 3.3, KC Geschichte 2017, KC Politik-Wirtschaft 2018',
  offen: 'Für diese Fächer gibt es weder vorgegebene Prozentanteile der Anforderungsbereiche noch eine verbindliche Zahl von Teilaufgaben.'
}

/*
 * Mathematik
 *
 * Belegt: Hinweise Mathematik 2027 (Stand 09/2025) und 2029.
 *
 * Belegter Widerspruch: Die EB-AVO-GOBAK nennt 270/225 Minuten, die fachbezogenen Hinweise
 * 330/285 Minuten Gesamtzeit (mit Abgabe von Teil A nach 110 bzw. 100 Minuten). Die EB-Fassung
 * bildet den hilfsmittelfreien Teil A noch nicht ab; maßgeblich sind die Hinweise.
 */
const MATHEMATIK: AbiturProfil = {
  id: 'mathematik',
  fachIds: ['mathematik'],
  label: 'Mathematik',
  aufgabenarten: [
    { id: 'teil-a', label: 'Teil A – hilfsmittelfrei', beschreibung: 'Ohne Rechner und ohne Formelsammlung; je Aufgabe 5 Bewertungseinheiten.' },
    { id: 'teil-b', label: 'Teil B – mit Hilfsmitteln', beschreibung: 'Mit digitalem Mathematikwerkzeug und Formelsammlung; je Sachgebiet eine Aufgabe.' }
  ],
  zeit: { gA: 285, eA: 330 },
  auswahlzeit: 30,
  // Teil B: je Sachgebiet zwei Aufgaben zur Auswahl, davon genau eine bearbeiten
  vorgelegt: 2,
  zuBearbeiten: 1,
  // Die einzigen prozentgenau belegten AFB-Anteile im ganzen Material
  afb: { gA: { I: 30, II: 45, III: 25 }, eA: { I: 25, II: 45, III: 30 } },
  bewertung:
    'Bewertungseinheiten: grundlegendes Niveau 80 BE (25 in Teil A, 55 in Teil B), erhöhtes Niveau 100 BE (30 und 70). Jede Teilaufgabe weist genau einen Anforderungsbereich aus; bei Mischung gilt der höchste.',
  operatoren: 'ohne-afb',
  material: ['Teil A ohne jedes Hilfsmittel und ohne Formelsammlung.', 'Teil B mit Rechner und der IQB-Formelsammlung.'],
  quelle: 'Hinweise zur schriftlichen Abiturprüfung Mathematik 2027/2029 (Nds.)',
  offen: 'Getrennte Aufgabensätze für GTR und CAS bildet die App nicht ab.'
}

/*
 * Naturwissenschaften (Biologie, Chemie, Physik)
 *
 * Belegt: Erlass „Fachpraktische Aufgaben … in den Fächern Biologie und Chemie" (MK vom
 * 01.12.2025): „Den Prüflingen werden ab der Abiturprüfung 2025 vier voneinander unabhängige
 * Aufgaben angeboten, von denen sie drei auswählen." Hinweise Physik 2027 ebenso.
 * KC Biologie 2022 für die Anforderungsbereiche.
 *
 * Belegtes Negativergebnis: Für Biologie und Chemie gibt es keine fachbezogenen „Hinweise
 * zur schriftlichen Abiturprüfung".
 */
const NATURWISSENSCHAFT: AbiturProfil = {
  id: 'naturwissenschaft',
  fachIds: ['biologie', 'chemie', 'physik'],
  label: 'Naturwissenschaften',
  aufgabenarten: [
    { id: 'materialgebunden', label: 'Materialgebundene Aufgabe', beschreibung: 'Operationalisierte Aufgabe zu Versuchsdaten, Diagrammen oder Texten.' },
    { id: 'experiment', label: 'Aufgabe mit fachpraktischem Anteil', beschreibung: 'Mit Schülerexperiment – nur auf erhöhtem Anforderungsniveau.' }
  ],
  zeit: { gA: 220, eA: 270 },
  auswahlzeit: 30,
  vorgelegt: 4,
  zuBearbeiten: 3,
  /*
   * KC Biologie 2022: Schwerpunkt AFB II, AFB I und III angemessen, dabei AFB I stärker als
   * AFB III. Prozentwerte sind nicht vorgegeben; die Zahlen sind daraus abgeleitet.
   */
  afb: { gA: { I: 35, II: 45, III: 20 }, eA: { I: 25, II: 45, III: 30 } },
  bewertung: 'Teilleistungen mit ausgewiesenem Anforderungsbereich. Der Anforderungsbereich lässt sich nicht am Operator ablesen.',
  operatoren: 'ohne-afb',
  material: [
    'Aufgaben sind operationalisiert und in der Regel materialgebunden.',
    'Teilaufgaben müssen unabhängig von den Ergebnissen vorangegangener Teilaufgaben lösbar sein (KC Biologie 2022).'
  ],
  quelle: 'Erlass fachpraktische Aufgaben Biologie/Chemie (MK 01.12.2025), Hinweise Physik 2027, KC Biologie 2022',
  offen: 'Für Biologie und Chemie gibt es keine fachbezogenen Hinweise zur schriftlichen Abiturprüfung.'
}

export const ABITUR_PROFILE: AbiturProfil[] = [DEUTSCH, FREMDSPRACHE, GESELLSCHAFT, MATHEMATIK, NATURWISSENSCHAFT]

/** Profil zum Fach – null, wenn für dieses Fach keine belegten Vorgaben vorliegen. */
export function abiturProfil(subjectId: string): AbiturProfil | null {
  return ABITUR_PROFILE.find((p) => p.fachIds.includes(subjectId)) ?? null
}

/**
 * Ab wann der Abitur-Modus angeboten wird.
 *
 * Jahrgang 12 und 13, und nur am Gymnasium bzw. an Schulformen mit gymnasialer Oberstufe.
 * In der Einführungsphase (Klasse 11) wäre eine Abituraufgabe verfrüht: Dort werden die
 * Aufgabenarten erst aufgebaut.
 */
export function abiturMoeglich(meta: Pick<WorksheetMeta, 'grade' | 'subjectId'>): boolean {
  return meta.grade >= 12 && abiturProfil(meta.subjectId) !== null
}

/**
 * Sinnvolle Voreinstellung beim Einschalten – und Reparatur, wenn das Fach gewechselt hat.
 *
 * Grundlegendes Niveau ist der haeufigere Fall: In Niedersachsen belegen Lernende nur zwei
 * Faecher auf erhoehtem Niveau, alle uebrigen auf grundlegendem.
 *
 * Wichtig ist der zweite Teil: Wechselt die Lehrkraft das Fach, passt die gespeicherte
 * Aufgabenart nicht mehr („Interpretation literarischer Texte" gibt es in Erdkunde nicht).
 * Ohne diese Pruefung stuende im Auswahlfeld nichts, und die KI bekaeme eine Kennung, die
 * das Fachprofil gar nicht kennt.
 */
export function abiturStandard(meta: Pick<WorksheetMeta, 'subjectId' | 'abitur'>, an: boolean): AbiturVorgaben {
  const profil = abiturProfil(meta.subjectId)
  const bisher = meta.abitur
  const arten = profil?.aufgabenarten ?? []
  const aufgabenart = bisher && arten.some((a) => a.id === bisher.aufgabenart) ? bisher.aufgabenart : (arten[0]?.id ?? '')
  const teile = profil?.pruefungsteile
  const pruefungsteil = bisher?.pruefungsteil && teile?.some((p) => p.id === bisher.pruefungsteil) ? bisher.pruefungsteil : teile?.[0].id
  return { an, niveau: bisher?.niveau ?? 'gA', aufgabenart, pruefungsteil, klausur: bisher?.klausur ?? false }
}

/**
 * Bearbeitungszeit und Textumfang fuer den GEWAEHLTEN Pruefungsteil.
 *
 * Ohne diese Unterscheidung galt in den Fremdsprachen immer die Schreibaufgabe: 225 Minuten
 * und 1000 Woerter, auch wenn die Lehrkraft Sprachmittlung gewaehlt hatte – die dauert 60
 * Minuten. Gemeldet am 24.09.2026.
 */
export function teilVorgaben(profil: AbiturProfil, niveau: Anforderungsniveau, teilId?: string): { minuten: number; woerter?: number } {
  const teil = profil.pruefungsteile?.find((p) => p.id === teilId)
  if (!teil) return { minuten: profil.zeit[niveau], woerter: profil.materialWoerter?.[niveau] }
  return { minuten: teil.minuten > 0 ? teil.minuten : profil.zeit[niveau], woerter: teil.woerter?.[niveau] }
}
