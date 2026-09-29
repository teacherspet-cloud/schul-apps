/**
 * Landes- und Schulformvorgaben für die Rückmeldung (Recherche 29.09.2026, alle 16 Länder).
 *
 * Grundlage: Schulgesetze, Schulordnungen, Leistungsbewertungs- und LRS-Erlasse der Länder,
 * KMK-Vereinbarung zur gymnasialen Oberstufe (i. d. F. 16.03.2023, Ziff. 8.4.3, 9.1/9.2,
 * Anlage 1), KMK-Beschluss LRS/Rechnen (2003 i. d. F. 2007), BVerwG 6 C 35.14 (2015), BVerfG
 * 1 BvR 2577/15 (2023). Die Recherche liegt als Bericht vor; hier steht nur, was die App
 * anzeigt oder der KI mitgibt. Was dort „nicht gesichert" war, steht auch hier so.
 *
 * WAS DIE APP DARAUS MACHT:
 * - Hinweise neben der Auswahl der Einstufung (Tendenzen erlaubt/untersagt/Pflicht, Punkte).
 * - Hinweise im Fenster „Nachteilsausgleich" (Abgrenzung, Zeugnisvermerk, Oberstufe).
 * - Für die KI nur die Regeln zur sprachlichen Richtigkeit und zur Kommentierung – Rechtsfragen
 *   entscheidet die Lehrkraft, nicht die KI.
 *
 * AKTUALITÄT (Stand der Recherche): SH-NuNVO galt bis 31.07.2026, Nachfolge nicht gesichert;
 * MV hat eine neue LeistBewVO vom 08.06.2026; ThürSchulO nach der Reform 2024 nur teilweise
 * geprüft. Solche Stellen sagen es im Hinweis.
 */
import { gehoertZurSekII } from '../arbeitsblatt/didactics/bildungsgang'
import type { EinstufungsArt, RueckmeldungMeta } from './model/types'
import { fremdsprachlich } from './teilbewertung'

export interface LandesHinweis {
  text: string
  /** Kurz, wo es steht */
  quelle?: string
  /** Warnung (Konflikt mit der gewählten Einstufung) statt reiner Information */
  warnung?: boolean
}

type Tendenz = 'erlaubt' | 'pflicht' | 'untersagt' | 'offen'

interface LandRegel {
  name: string
  /** Tendenzen (+/−) unter Arbeiten der Sek I */
  tendenz: Tendenz
  notengebung: LandesHinweis
  /** Sprachliche Richtigkeit in der Sek I – für die KI (leer = keine feste Regel) */
  spracheSekI?: string
  /** Sprachliche Richtigkeit in der Oberstufe – für die KI */
  spracheSekII: string
  /** Vorgaben zur Kommentierung von Arbeiten – für die KI */
  kommentar?: string
  /**
   * Maßstab der sprachlichen Leistung (Komplexität, Umfang) – für die KI, nur Belegtes
   * (recherche/sprachliche-bewertungsmassstaebe-2026-09-29.md). `nurFS`: nur moderne Fremdsprachen.
   */
  spracheLeistung?: { text: string; nurFS?: boolean }
  /** Notenpunkte schon in der Sek I (Saarland) */
  punkteSekI?: string
  ausgleich: LandesHinweis
  /** Notenschutz in Oberstufe und Abitur */
  notenschutzOberstufe: 'ja' | 'nein' | 'eingeschränkt' | 'nicht gesichert'
}

const KMK_SEK_II = 'Schwerwiegende und gehäufte Verstöße gegen sprachliche Richtigkeit oder äußere Form: Abzug bis zu 2 Punkten (KMK-Vereinbarung Ziff. 8.4.3), nicht, wenn Sprache schon Teil der fachlichen Bewertung ist.'

export const LAENDER: Record<string, LandRegel> = {
  BW: {
    name: 'Baden-Württemberg',
    tendenz: 'offen',
    notengebung: {
      text: 'Zeugnisse nur ganze Noten; in der Halbjahresinformation sind Tendenz und halbe Noten zulässig. Für einzelne Klassenarbeiten trifft die Notenbildungsverordnung keine Regelung. Gemeinschaftsschule: Lernentwicklungsbericht mit Niveau G/M/E.',
      quelle: 'NVO § 4 Abs. 1, § 5 Abs. 4'
    },
    spracheSekII: 'Sprachliche Richtigkeit: in der Regel 1–2 Notenpunkte Abzug (Abitur-Richtlinien; nicht in Deutsch).',
    ausgleich: {
      text: 'Nachteilsausgleich ändert die Anforderungen nicht und wird nicht vermerkt. Bei LRS in Deutsch und Fremdsprachen zurückhaltende Gewichtung, in anderen Fächern Nichtbewertung der Rechtschreibung – nicht in Abschlussklassen und Kursstufe; Beschluss der Klassenkonferenz unter Vorsitz der Schulleitung, Vermerk unter „Bemerkungen". Neu Zugewanderte: Sprachbildungsverordnung vom 25.11.2025 (§§ 15–17).',
      quelle: 'VwV Förderbedarf 2008 Ziff. 2.3.1/2.3.2'
    },
    notenschutzOberstufe: 'nein'
  },
  BY: {
    name: 'Bayern',
    tendenz: 'offen',
    notengebung: {
      text: 'An Mittel- und Grundschule werden keine Zwischennoten erteilt; für Gymnasium und Realschule regeln GSO/RSO Tendenzen nicht. Sprachverstöße sind in allen Fächern zu kennzeichnen und angemessen zu bewerten; an der Realschule sind Schlussbemerkungen bei Deutsch-Schulaufgaben Pflicht.',
      quelle: 'MSO § 13 Abs. 1; GSO § 26 Abs. 1; RSO § 21 Abs. 1'
    },
    spracheSekI: 'Verstöße gegen die sprachliche Richtigkeit werden in allen Fächern gekennzeichnet und angemessen bewertet.',
    spracheSekII: KMK_SEK_II,
    spracheLeistung: { text: 'Realschule, Englisch (ISB, Guided Writing 2023): Grundlage ist die tatsächlich geschriebene Wortzahl – bei höchstens 25/50/75 % des Umfangs in Kohärenz, Grammatik und Wortschatz höchstens Band 1/3/5 von 7; ein fehlerfreier Text mit nur einfachen Strukturen höchstens Band 4 von 7.', nurFS: true },
    ausgleich: {
      text: 'Nachteilsausgleich (§ 33 BaySchO) passt nur die Bedingungen an, kein Zeugnisvermerk. Notenschutz nur in den Fällen des § 34 BaySchO – bei Rechtschreibstörung Verzicht auf die Bewertung der Rechtschreibung, bei Lesestörung auf die des Vorlesens – mit Zeugnisvermerk (§ 36 Abs. 7). Für Rechenstörung weder Nachteilsausgleich noch Notenschutz; ADHS gilt nicht als nachteilsausgleichsfähig. Reduzierter Aufgabenumfang ist in Leistungserhebungen unzulässig.',
      quelle: 'Art. 52 Abs. 5 BayEUG; §§ 31–36 BaySchO'
    },
    notenschutzOberstufe: 'ja'
  },
  BE: {
    name: 'Berlin',
    tendenz: 'erlaubt',
    notengebung: {
      text: 'Tendenzen unter Arbeiten sind zulässig, auf Zeugnissen nicht. Arbeiten sind mit förderlichen Hinweisen und einem Notenspiegel zu versehen. Sprachmängel werden in allen Fächern gekennzeichnet und mitbewertet; ein Fehlerquotient ist unzulässig. ISS/Gemeinschaftsschule: Punkte mit Niveau-Umrechnung.',
      quelle: 'Sek I-VO §§ 19, 20'
    },
    spracheSekI: 'Sprachmängel werden in allen Fächern gekennzeichnet und mitbewertet; ein Fehlerquotient ist unzulässig.',
    spracheSekII: 'Sprachliche Richtigkeit angemessen berücksichtigen; ab dem 3. Kurshalbjahr Abiturmaßstab (bis 2 Punkte Abzug).',
    spracheLeistung: { text: 'Fachbrief Moderne Fremdsprachen Nr. 19 (2026): Bei nur wenigen Sätzen ist die Bandbreite in Lexik und Grammatik höchstens „mangelhaft" bis „schwach ausreichend"; die Korrektheit kann besser liegen.', nurFS: true },
    kommentar: 'Die Arbeit erhält förderliche Hinweise (Sek I-VO § 19 Abs. 6).',
    ausgleich: {
      text: 'Nachteilsausgleich (§ 58 Abs. 8 SchulG, § 15 Sek I-VO) lässt das Anforderungsniveau unverändert, kein Zeugnisvermerk. Notenschutz bei stark ausgeprägten Lese-/Rechtschreibschwierigkeiten auf Antrag je Schuljahr, Entscheidung der Schulleitung, mit Zeugnisvermerk. Nichtdeutsche Herkunftssprache: u. a. Zeitverlängerung und zweisprachiges Wörterbuch (§ 17 Sek I-VO).',
      quelle: 'SchulG § 58; Sek I-VO §§ 15–17; VO-GO § 14a'
    },
    notenschutzOberstufe: 'ja'
  },
  BB: {
    name: 'Brandenburg',
    tendenz: 'erlaubt',
    notengebung: {
      text: 'Eine Einzelleistung kann innerhalb der Notenstufe mit Tendenz oder Worturteil beschrieben werden. Die Berücksichtigung sprachlicher Verstöße in der Sek I legt die Fachkonferenz fest. Oberstufe: Punkte ab der Einführungsphase, Abzug bis 2 Punkte.',
      quelle: 'VV-Leistungsbewertung Nr. 3 Abs. 2, Nr. 6 Abs. 2'
    },
    spracheSekII: KMK_SEK_II,
    spracheLeistung: { text: 'IQB-Raster (Fachbrief Englisch Nr. 9, 2025): Bandbreite und Korrektheit getrennt; eine unzureichende Bandbreite kann nicht durch ein hohes Maß an Korrektheit ausgeglichen werden.', nurFS: true },
    ausgleich: {
      text: 'Nachteilsausgleich bei LRS und bei Rechenschwierigkeiten (nur bis Jgst. 10) lässt die Anforderungen unverändert, kein Zeugnisvermerk. Abweichen von den Bewertungsgrundsätzen (z. B. keine Bewertung der Rechtschreibung) nur bei LRS, auf Antrag, durch Konferenzbeschluss und mit Zeugnisvermerk; in der Sek II nur mit fachärztlichem Attest.',
      quelle: 'BbgSchulG § 57 Abs. 2 Nr. 5; LRSRV §§ 5, 7, 8'
    },
    notenschutzOberstufe: 'eingeschränkt'
  },
  HB: {
    name: 'Bremen',
    tendenz: 'offen',
    notengebung: {
      text: 'Auf Zeugnissen sind Zwischennoten und Zusätze unzulässig. Für Klassenarbeiten gibt es keine landesweite Regel – maßgeblich ist das schulische Gesamtkonzept. Oberschule bis Jg. 8: Zeugnis oder Lernentwicklungsbericht mit Kompetenzraster.',
      quelle: 'ZeugnisVO § 6 Abs. 1'
    },
    spracheSekII: KMK_SEK_II,
    ausgleich: {
      text: 'Nachteilsausgleich (z. B. mehr Zeit, begrenzter Umfang, Textverarbeitung) ändert den Bewertungsmaßstab nicht, kein Vermerk. Notenschutz bei LRS (zurückhaltende Gewichtung bis Nichtbewertung der Rechtschreibung) beschließt die Klassenkonferenz mit Einverständnis der Eltern; Zeugnisvermerk, auf Antrag auch im Abitur. Bei Rechenschwäche Nachteilsausgleich nur in der Grundschule.',
      quelle: 'LSR-Erlass 02/2010'
    },
    notenschutzOberstufe: 'ja'
  },
  HH: {
    name: 'Hamburg',
    tendenz: 'erlaubt',
    notengebung: {
      text: 'Tendenzen sind bei den Noten 2–5 (+/−) und bei Note 1 (nur −) zulässig, auch auf Zeugnissen außer Abgangs- und Abschlusszeugnissen. Stadtteilschule Jg. 7–10: G- und E-Noten. Korrekturanmerkungen sollen Vorzüge und Defizite kenntlich machen.',
      quelle: 'APO-GrundStGy § 2 Abs. 6; Bildungsplan Teil C'
    },
    spracheSekI: 'Sprachliche Richtigkeit angemessen berücksichtigen.',
    spracheSekII: KMK_SEK_II,
    spracheLeistung: { text: 'Richtlinie Abitur Englisch 2021: Sprachrichtigkeit nicht allein nach der Zahl der Verstöße beurteilen; Mut zur anspruchsvolleren Sprachgestaltung zählt positiv.', nurFS: true },
    kommentar: 'Korrekturanmerkungen machen Vorzüge und Defizite kenntlich.',
    ausgleich: {
      text: 'Notenschutz nur bei festgestellten besonderen Lese- oder Rechtschreibschwierigkeiten, auf Antrag und nach Beschluss der Zeugniskonferenz; vorrangig zurückhaltende Gewichtung, Nichtbewertung nur ausnahmsweise. Notenschutz wird im Zeugnis vermerkt, Nachteilsausgleich nicht.',
      quelle: 'HmbSG § 44 Abs. 1a; Notenschutz-VO 19.08.2024'
    },
    notenschutzOberstufe: 'ja'
  },
  HE: {
    name: 'Hessen',
    tendenz: 'erlaubt',
    notengebung: {
      text: 'Zwischen- und Dezimalnoten sind unzulässig. Die Tendenz wird als „(+)" bzw. „(−)" angegeben, in Jg. 9/10 bei schriftlichen Arbeiten verpflichtend, nicht auf Zeugnissen. Sprachverstöße: Jg. 5–8 höchstens −2/3 Note, Jg. 9/10 nach Fehlerindex. Unter jede Arbeit gehört ein Notenspiegel.',
      quelle: 'VOGSV §§ 30, 33 Abs. 3, Anlage 2'
    },
    spracheSekI: 'Verstöße gegen die sprachliche Richtigkeit: in Jg. 5–8 höchstens 2/3 Notenstufe Abzug, in Jg. 9/10 nach Fehlerindex (VOGSV Anlage 2).',
    spracheSekII: 'Sprachliche Richtigkeit: 1–2 Punkte Abzug nach Fehlerindex.',
    kommentar: 'Die Korrektur muss die Bewertung nachvollziehbar machen.',
    ausgleich: {
      text: 'Nachteilsausgleich und Abweichen von der Leistungsfeststellung lassen die fachlichen Anforderungen unverändert, kein Vermerk. Abweichen von der Leistungsbewertung (Notenschutz, z. B. zeitweiser Verzicht auf die Bewertung der Rechtschreibung) beschließt die Klassenkonferenz mit Einwilligung der Eltern; Vermerk in der Arbeit und im Zeugnis. Bei Rechenschwäche nur in der Grundschule.',
      quelle: 'VOGSV §§ 7, 37–44, 56'
    },
    notenschutzOberstufe: 'eingeschränkt'
  },
  MV: {
    name: 'Mecklenburg-Vorpommern',
    tendenz: 'erlaubt',
    notengebung: {
      text: 'Eine Einzelbewertung kann durch + oder − präzisiert werden. Auf der Arbeit ist der Leistungsdurchschnitt anzugeben. Die Einführungsphase wird noch mit Noten und Tendenz bewertet, Punkte erst ab der Qualifikationsphase.',
      quelle: 'LeistBewVO 2026 §§ 4, 5; APVO § 15'
    },
    spracheSekII: KMK_SEK_II,
    ausgleich: {
      text: 'Nachteilsausgleich (ab Klasse 3) senkt das Anspruchsniveau nicht, kein Vermerk. Abweichen von den Grundsätzen der Leistungsbewertung setzt bei Lesen/Rechtschreiben eine anerkannte Teilleistungsstörung voraus, bei Rechnen nur in Klasse 1–4; jährlicher Beschluss der Klassenkonferenz, Vermerk auf allen Zeugnissen.',
      quelle: 'LRSRVO M-V 08.07.2024'
    },
    notenschutzOberstufe: 'nicht gesichert'
  },
  NI: {
    name: 'Niedersachsen',
    tendenz: 'untersagt',
    notengebung: {
      text: 'Das Verbot von Zwischennoten gilt entsprechend auch für schriftliche Arbeiten – Tendenzzusätze sind nicht vorgesehen. IGS: Jg. 5–7 Lernentwicklungsberichte; Arbeiten können dort in freier Form bewertet werden.',
      quelle: 'Erlass „Schriftliche Arbeiten" Nr. 7 i. V. m. Zeugniserlass Nr. 3.5.2'
    },
    spracheSekII: KMK_SEK_II,
    spracheLeistung: { text: 'Kerncurricula: kein rein quantifizierendes Verfahren – das Gewicht der Fehler in Relation zu Wortzahl, Wortschatz und Satzbau setzen.' },
    ausgleich: {
      text: 'Vorrang haben Hilfen im Sinne eines Nachteilsausgleichs. Abweichen von den Bewertungsgrundsätzen (etwa zeitweiliger Verzicht auf die Bewertung der Rechtschreibung) beschließt die Klassenkonferenz nur in besonders begründeten Ausnahmefällen (Rechnen nur Grundschule); Zeugnisvermerk, nicht in Abgangs- und Abschlusszeugnissen. In der Oberstufe nicht zulässig.',
      quelle: 'RdErl. 04.10.2005'
    },
    notenschutzOberstufe: 'nein'
  },
  NW: {
    name: 'Nordrhein-Westfalen',
    tendenz: 'offen',
    notengebung: {
      text: 'Tendenzen unter Klassenarbeiten sind in der APO-S I nicht geregelt. Häufige Verstöße gegen die sprachliche Richtigkeit sind angemessen zu berücksichtigen und können die Note um bis zu eine Notenstufe absenken. Oberstufe: EF eine Notenstufe, Q-Phase bis zu 2 Notenpunkte.',
      quelle: 'APO-S I § 6 Abs. 6, VV 6.6.2; APO-GOSt § 13 Abs. 2'
    },
    spracheSekI: 'Häufige Verstöße gegen die sprachliche Richtigkeit können die Note um bis zu eine Notenstufe absenken (APO-S I § 6 Abs. 6).',
    spracheSekII: 'Sprachliche Richtigkeit: Einführungsphase bis eine Notenstufe, Qualifikationsphase bis 2 Notenpunkte (APO-GOSt § 13 Abs. 2).',
    spracheLeistung: { text: 'Konstruktionshinweise Klausuren moderne Fremdsprachen GOSt 2025: Kommunikative Textgestaltung verlangt einen hinreichend ausführlichen Text; Komplexität zählt im Ausdrucksvermögen (variabler Satzbau, differenzierter Wortschatz), Sprachrichtigkeit wird über Verstöße beschrieben.', nurFS: true },
    ausgleich: {
      text: 'Nachteilsausgleich (APO-S I § 6 Abs. 9, APO-GOSt § 13 Abs. 7) ändert die Rahmenbedingungen, nicht die fachlichen Anforderungen, kein Zeugnisvermerk. Bei LRS fließt die Rechtschreibung in Klasse 3–6, in Einzelfällen bis 10, nicht in die Bewertung schriftlicher Arbeiten ein. Für Abschlusszeugnisse ist nach neuerer Erlasslage die Rechtschreibung zu bewerten (nicht gesichert).',
      quelle: 'BASS 14-01 Nr. 1 (LRS-Erlass)'
    },
    notenschutzOberstufe: 'nein'
  },
  RP: {
    name: 'Rheinland-Pfalz',
    tendenz: 'offen',
    notengebung: {
      text: 'Auf Zeugnissen sind Zwischennoten unzulässig; für Klassenarbeiten gibt es keine ausdrückliche Tendenzregel. Anspruch auf Begründung der Noten und Notenspiegel. Oberstufe: Sprachverstöße ein oder zwei MSS-Punkte Abzug.',
      quelle: 'ÜSchO §§ 56, 60'
    },
    spracheSekI: 'Deutsch Klasse 7–10: Sprachverstöße senken die Note höchstens um eine Notenstufe (Fachberatung; nicht amtlich gesichert).',
    spracheSekII: 'Sprachliche Richtigkeit: ein oder zwei MSS-Punkte Abzug.',
    spracheLeistung: { text: 'Lehrplan (Italienisch): Die Sprachrichtigkeit ergibt sich nicht aus dem Verhältnis Wortzahl : Fehlerzahl; Mut zur anspruchsvolleren Sprachgestaltung wird berücksichtigt.', nurFS: true },
    ausgleich: {
      text: 'Nachteilsausgleich senkt die Anforderungen nicht, kein Zeugnisvermerk. Abweichen (etwa Verzicht auf die Bewertung der Rechtschreibung) nur bei LRS in der Sek I, mit Klassenkonferenzbeschluss und Förderplan, Vermerk unter „Bemerkungen". In der Oberstufe nicht zulässig.',
      quelle: 'VV LRS 28.08.2007'
    },
    notenschutzOberstufe: 'nein'
  },
  SL: {
    name: 'Saarland',
    tendenz: 'pflicht',
    notengebung: {
      text: 'Große Leistungsnachweise an Gemeinschaftsschule und Gymnasium erhalten eine Note und je nach Tendenz einen Punktwert des 15-Punkte-Systems – ab Klasse 5. Pflicht sind Korrekturhinweise und ein kurzer zusammenfassender Kommentar mit Würdigung der Teilkompetenzen und Verbesserungshinweisen.',
      quelle: 'Erlass Leistungsbewertung 2024 Nr. 3.4.2'
    },
    punkteSekI: 'Im Saarland erhalten große Leistungsnachweise schon ab Klasse 5 einen Punktwert (Erlass Leistungsbewertung 2024 Nr. 3.4.2).',
    spracheSekI: 'Sprachliche und formale Richtigkeit wird in angemessenem Umfang berücksichtigt.',
    spracheSekII: 'Sprachliche Richtigkeit: Abzug bis zu 3 Punkten (GOS-VO § 24 Abs. 6).',
    spracheLeistung: { text: 'Lehrpläne Englisch Gymnasium 2025: Bei deutlicher Unterschreitung des geforderten Textumfangs können auch in den sprachlichen Kategorien Abzüge vorgenommen werden.', nurFS: true },
    kommentar: 'Pflicht: Korrekturhinweise und ein kurzer zusammenfassender Kommentar, der erworbene Teilkompetenzen würdigt und Hinweise zur Verbesserung gibt, auch zu Sprache und Form.',
    ausgleich: {
      text: 'Bei festgestellter Lese-/Rechtschreibstörung wird die Rechtschreibung bis einschließlich Klasse 9 außerhalb reiner Rechtschreibprüfungen gekennzeichnet, aber nicht bewertet; Vermerk unter der Arbeit und im Zeugnis. Nachteilsausgleich (z. B. bis 50 % mehr Zeit, Wörterbuch) erscheint weder im Zeugnis noch unter der Arbeit. Reduzierter Umfang gilt als Abweichen.',
      quelle: 'Richtlinien LRS 15.11.2009 Ziff. 5'
    },
    notenschutzOberstufe: 'nein'
  },
  SN: {
    name: 'Sachsen',
    tendenz: 'erlaubt',
    notengebung: {
      text: 'Notentendenzen werden durch „+" oder „−" ausgedrückt. Schwerwiegende Verstöße gegen Sprachrichtigkeit und äußere Form sind in allen Fächern zu kennzeichnen und zu berücksichtigen; ein Abzug bei der Benotung ist zu vermerken.',
      quelle: 'SOGYA §§ 25, 28; SOOSA § 23 Abs. 2'
    },
    spracheSekI: 'Schwerwiegende Verstöße gegen Sprachrichtigkeit und äußere Form werden in allen Fächern gekennzeichnet und berücksichtigt; ein Abzug wird vermerkt.',
    spracheSekII: 'Sprachliche Richtigkeit: im Abitur höchstens 1 Punkt Abzug.',
    ausgleich: {
      text: 'Nachteilsausgleich (§ 22 Abs. 5 SOOSA, § 58 SOGYA) ändert nur Organisation und Gestaltung der Leistungsermittlung. Bei LRS kann die Klassenkonferenz mit Zustimmung der Eltern die Benotung der Rechtschreibung in Deutsch und Fremdsprachen befristet aussetzen (regulär Klasse 5–6); Zeugnisvermerk.',
      quelle: 'VwV LRS-Förderung 2006/2008'
    },
    notenschutzOberstufe: 'nicht gesichert'
  },
  ST: {
    name: 'Sachsen-Anhalt',
    tendenz: 'erlaubt',
    notengebung: {
      text: 'Arbeiten werden mit ganzen Noten bewertet; außer in Zeugnissen kann die Notentendenz ausgewiesen werden. Die Korrektur bezieht in allen Fächern die Sprachkompetenz ein; ein erläuternder Kommentar soll ergänzt werden, sofern pädagogisch geboten.',
      quelle: 'RdErl. Leistungsbewertung Nr. 4.1.13, 4.1.14, 6.1'
    },
    spracheSekI: 'Die Korrektur bezieht in allen Fächern die Sprachkompetenz ein.',
    spracheSekII: KMK_SEK_II,
    kommentar: 'Ein erläuternder Kommentar soll ergänzt werden, sofern pädagogisch geboten.',
    ausgleich: {
      text: 'Nachteilsausgleich ändert nur die äußeren Bedingungen, kein Zeugnisvermerk. Befristetes Abweichen (z. B. Aussetzen der Rechtschreibbenotung, verbale Bewertung) nur in der Sek I außerhalb des Abschlussjahrgangs, Beschluss der Klassenkonferenz, Zeugnisvermerk „Das Zeugnis enthält eine Anlage"; in Abschlussjahrgang und Oberstufe ausgeschlossen.',
      quelle: 'RdErl. Leistungsbewertung; Landesschulamt, Broschüre 2020'
    },
    notenschutzOberstufe: 'nein'
  },
  SH: {
    name: 'Schleswig-Holstein',
    tendenz: 'offen',
    notengebung: {
      text: 'In allen Fächern werden Leistungsnachweise auf standardsprachliche Normen geprüft und Fehler korrigiert; Korrekturhinweise sollen eine motivierende Lernhilfe bieten. Zwischennoten sind nach der ZVO unzulässig; eine Tendenzregel für Arbeiten gibt es nicht.',
      quelle: 'Erlass Leistungsnachweise Sek I 2025 Nr. 1a; ZVO'
    },
    spracheSekI: 'Leistungsnachweise werden in allen Fächern auf standardsprachliche Normen geprüft und Fehler korrigiert.',
    spracheSekII: KMK_SEK_II,
    kommentar: 'Korrekturhinweise sollen eine motivierende Lernhilfe bieten.',
    ausgleich: {
      text: 'Nachteilsausgleich (z. B. Zeitzugabe, Hilfsmittel, verkürzte Aufgabenstellung) ändert die fachlichen Anforderungen nicht, kein Zeugnisvermerk. Bei förmlich anerkannter LRS kann in Primarstufe/Sek I auf die Bewertung von Vorlesen und Sprachrichtigkeit verzichtet werden; in der Sek II einschließlich Abitur wird die Sprachrichtigkeit in Deutsch/Fremdsprachen zurückhaltend gewichtet; Notenschutz wird vermerkt. Die NuNVO war bis 31.07.2026 befristet – Fortgeltung nicht gesichert.',
      quelle: 'NuNVO 16.02.2022 §§ 2, 4'
    },
    notenschutzOberstufe: 'eingeschränkt'
  },
  TH: {
    name: 'Thüringen',
    tendenz: 'untersagt',
    notengebung: {
      text: 'Zwischennoten werden nicht erteilt; Erläuterungen und Schlussbemerkungen können angebracht werden. Gemeinschaftsschule: Verzicht auf Noten bis Klasse 7 per Schulkonferenzbeschluss möglich (Wortgutachten). Stand der ThürSchulO nach der Reform 2024 nicht vollständig geprüft.',
      quelle: 'ThürSchulO § 59'
    },
    spracheSekII: KMK_SEK_II,
    ausgleich: {
      text: 'Nachteilsausgleich (Zeitverlängerung, technische Hilfsmittel, mündlich statt schriftlich, veränderte Aufgabengestaltung) verändert nur die äußeren Umstände, kein Zeugnisvermerk. Notenverzicht (z. B. keine Bewertung der Rechtschreibung) wird im Zeugnis vermerkt und ist in Klassenstufe 9/10 sowie in der Qualifikationsphase ausgeschlossen. DaZ: Zeitverlängerung und zweisprachiges Wörterbuch ohne Senkung der Anforderungen.',
      quelle: 'ThürSchulO § 59 Abs. 5, 6, 8'
    },
    notenschutzOberstufe: 'nein'
  }
}

type Meta = Pick<RueckmeldungMeta, 'stateId' | 'grade' | 'schoolTypeId' | 'subjectId'>

const regel = (stateId: string): LandRegel | undefined => LAENDER[stateId]
const sekII = (m: Meta): boolean => gehoertZurSekII(m.grade, m.schoolTypeId, m.stateId)

/** Notenpunkte in der Sek I: nur, wo das Land sie vorsieht (Saarland ab Klasse 5) */
export const punkteInSekI = (m: Pick<Meta, 'stateId' | 'grade'>): boolean => m.stateId === 'SL' && m.grade >= 5

/** Hinweise neben der Auswahl der Einstufung */
export function einstufungsHinweise(m: Meta, art: EinstufungsArt): LandesHinweis[] {
  const r = regel(m.stateId)
  if (!r || art === 'keine') return []
  const out: LandesHinweis[] = []
  const oberstufe = sekII(m)
  if (art === 'noteTendenz' && !oberstufe) {
    if (r.tendenz === 'untersagt')
      out.push({ text: `${r.name}: Tendenzen (+/−) sind unter Arbeiten nicht vorgesehen – besser „Note ohne + und −".`, quelle: r.notengebung.quelle, warnung: true })
  }
  if (art === 'note' && !oberstufe && r.tendenz === 'pflicht')
    out.push({ text: `${r.name}: Unter großen Leistungsnachweisen ist die Tendenz vorgeschrieben – „Note mit + und −" oder Notenpunkte wählen.`, quelle: r.notengebung.quelle, warnung: true })
  if (art === 'note' && !oberstufe && m.stateId === 'HE' && m.grade >= 9)
    out.push({ text: 'Hessen: In Jg. 9/10 ist die Tendenz bei schriftlichen Arbeiten verpflichtend.', quelle: 'VOGSV § 30 Abs. 1', warnung: true })
  if (art === 'notenpunkte' && !oberstufe && r.punkteSekI) out.push({ text: r.punkteSekI })
  if ((art === 'note' || art === 'noteTendenz') && oberstufe)
    out.push({ text: 'In der Oberstufe wird in Notenpunkten 0–15 bewertet (in einigen Ländern erst ab der Qualifikationsphase).', quelle: 'KMK-Vereinbarung Ziff. 9.1' })
  if (art === 'smileys' || art === 'ampel' || art === 'plusMinus')
    out.push({ text: 'Für Symbole wie Smileys, Ampel oder ++ … −− gibt es in keinem Land eine Vorschrift: Sie sind eine Form der Rückmeldung, keine amtliche Note.' })
  out.push({ text: `${r.name}: ${r.notengebung.text}`, quelle: r.notengebung.quelle })
  return out
}

/** Regeln für die KI: sprachliche Richtigkeit und Kommentierung im Land */
export function kiLandesregeln(m: Meta, art: EinstufungsArt): string {
  const r = regel(m.stateId)
  if (!r) return ''
  const zeilen: string[] = []
  if (art !== 'keine') {
    const sprache = sekII(m) ? r.spracheSekII : r.spracheSekI
    if (sprache) zeilen.push(`- Sprachliche Richtigkeit (${r.name}): ${sprache}`)
    const fs = Boolean(m.subjectId) && fremdsprachlich(m.subjectId)
    if (r.spracheLeistung && (fs || (!r.spracheLeistung.nurFS && (m.subjectId === 'deutsch' || m.subjectId === 'daz'))))
      zeilen.push(`- Sprachliche Leistung (${r.name}): ${r.spracheLeistung.text}`)
  }
  if (r.kommentar) zeilen.push(`- Kommentierung (${r.name}): ${r.kommentar}`)
  return zeilen.length ? ['VORGABEN DES LANDES:', ...zeilen].join('\n') : ''
}

/** Hinweise im Fenster „Nachteilsausgleich" */
export function ausgleichHinweise(m: Meta, notenschutzGewaehlt: boolean): LandesHinweis[] {
  const r = regel(m.stateId)
  if (!r) return []
  const out: LandesHinweis[] = [{ text: `${r.name}: ${r.ausgleich.text}`, quelle: r.ausgleich.quelle }]
  if (notenschutzGewaehlt && sekII(m) && r.notenschutzOberstufe !== 'ja')
    out.unshift({
      text:
        r.notenschutzOberstufe === 'nein'
          ? `${r.name}: In der Oberstufe ist Notenschutz nicht zulässig.`
          : r.notenschutzOberstufe === 'eingeschränkt'
            ? `${r.name}: In der Oberstufe ist Notenschutz nur eingeschränkt möglich (siehe unten).`
            : `${r.name}: Ob Notenschutz in der Oberstufe möglich ist, ist nicht gesichert.`,
      warnung: true
    })
  return out
}
