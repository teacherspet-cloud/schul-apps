/**
 * Rechtliche Rahmenvorgaben für Klassenarbeiten je Bundesland.
 *
 * Seit 29.09.2026 für ALLE 16 Länder (Wunsch der Lehrkraft), übernommen aus dem Recherchebericht
 * `recherche/klassenarbeiten-laender-2026-09-29.md` (amtliche Primärtexte, Stand 29.09.2026).
 * Vorher (18.09.2026) waren nur NI, NW, BY, BW und HE hinterlegt; dabei korrigiert:
 * - NW: Dauer (Kl. 7 nur Deutsch 1–2 Stunden) und Zahl je Jahrgang (6 / 5–6 / 4–5 / 4–5 / 3–5);
 * - NI: „schriftlicher Anteil mindestens ein Drittel" steht in keinem Erlass → entfernt (nicht
 *   gesichert); die 30-%-Regel (Erlass 2012 Nr. 8) ergänzt; `perWeek` gilt je Klasse/Lerngruppe;
 * - BY: Korrekturfrist zwei Wochen (Deutsch ab Jgst. 10 und Jgst. 12/13 drei), Mathematik
 *   Jgst. 8–11 mind. 3, übrige Kernfächer mind. 2 (GSO § 22, § 25);
 * - HE: VOGSV geändert durch Gesetz vom 22.06.2026 – Notenspiegelpflicht, Wiederholung bei mehr
 *   als einem Drittel, 2. Fremdsprache;
 * - BW: § 9 NVO in der Fassung ab 01.08.2026 (dreistündige Kernfächer mind. 3).
 *
 * Die Vorschriften stehen je Land in `sources` (Vorschrift, Paragraph, Adresse). Was der Bericht
 * „nicht gesichert" nennt, steht in `nichtGesichert` und im Text selbst.
 * - NI: RdErl. „Schriftliche Arbeiten" 22.3.2012 (SVBl. S. 266, vorläufig weiter gültig);
 *   Gymnasium RdErl. 1.8.2025 (SVBl. S. 492) Nr. 6.4–6.7; HS/RS/OBS Erlasse vom 18.08.2026
 * - NW: APO-S I § 6 mit VV 6.1.1–6.1.3 (BASS 13-21 Nr. 1.1/1.2), BASS 12-63 Nr. 3
 * - BY: GSO §§ 16, 21–23, 25, 28 und Anlage 1 (Fassung ab 01.08.2026); RSO §§ 17–20; MSO §§ 12, 13
 *   (Kernfächer je Ausbildungsrichtung ergänzt am 29.09.2026, `recherche/bayern-schulaufgaben-2026-09-29.md`)
 * - BW: Notenbildungsverordnung §§ 7–9, 9a (zuletzt geändert 08.04.2026)
 * - HE: VOGSV §§ 28, 32–34 und Anlage 2 Nr. 4–7
 * - BE: Sek I-VO §§ 19, 20 und Anlage 4
 * - BB: VV-Leistungsbewertung (zuletzt geändert 18.08.2025) mit Anlage 2025
 * - HB: Richtlinie 331.01 von 1982 (Geltung nicht abschließend gesichert), BremSchulG § 38
 * - HH: Bildungspläne Sek I (2024), Teil C „Leistungsbewertung" (HmbSG § 4 Abs. 2)
 * - MV: LeistBewVO M-V (in Kraft seit 01.08.2026) §§ 5, 6, 8, 14
 * - RP: ÜSchO §§ 50–56, 61; VV Zahl der Klassenarbeiten vom 12.07.2012 (Geltung nicht gesichert)
 * - SL: Erlass zur Leistungsbewertung vom 09.07.2024, Nr. 3.4
 * - SN: SOGYA §§ 27, 29; SOOSA § 24a (jeweils zuletzt geändert 15.06.2026)
 * - ST: RdErl. MK vom 26.06.2012 Nr. 4.1.3 (nur inoffizielle Wiedergabe gelesen; nicht gesichert)
 * - SH: Erlass „Leistungsnachweise in der Sekundarstufe I" vom 4.6.2025, Nr. 4
 * - TH: ThürSchulO § 58 (Lesefassung ab 01.08.2025)
 *
 * Die Angaben sind Richtwerte für die Planung und ersetzen nicht den Blick in die jeweils
 * geltende Fassung. Art und Bezeichnung je Fach/Jahrgang (Schulaufgabe, Kurzarbeit, Klausur …)
 * liefert `nachweisFuer` in model/nachweise.ts.
 */
import { ohneIsolierteSprachmittel } from './formats'
import { gradeScaleLine as sharedGradeScaleLine } from '../../../shared/gradeScale'
import { notenpunkteFuer, punkteZeile } from '../../../shared/notenpunkte'
import { formatArt } from './faecher'
import { fachName, istModerneFremdsprache, nachweisFuer, type ByZweig } from './nachweise'
import { examGrades } from './types'
import type { Exam } from './types'

export interface ExamStateRules {
  stateId: string
  /** Wie die Dauer geregelt ist */
  duration: string
  /** Ankündigungsfrist */
  announce: string
  /** Höchstzahl pro Tag und Woche; null = vom Land nicht geregelt */
  perDay: number | null
  perWeek: number | null
  /** Frist für Korrektur und Rückgabe */
  correction: string
  /** Verhältnis schriftlich zu mündlich */
  weighting: string
  /** Zahl der Arbeiten je Schuljahr in den Kernfächern (Deutsch, Mathematik, Fremdsprachen) */
  mainSubject: string
  /** Zahl der Arbeiten je Schuljahr in den übrigen Fächern (z. B. Geschichte) */
  otherSubject: string
  /** Hinweise, die beim Entwurf zu beachten sind */
  notes: string[]
  /** Fächer mit Klassenarbeiten (Wortlaut des Berichts) */
  subjects: string[]
  /** Vorschriften mit Paragraph bzw. Nummer und Fundstelle */
  sources: string[]
  /** Was der Recherchebericht ausdrücklich „nicht gesichert" nennt */
  nichtGesichert: string[]
}

export const EXAM_STATE_RULES: ExamStateRules[] = [
  {
    stateId: 'NI',
    duration:
      'Gymnasium: Jg. 5–6 in der Regel eine Unterrichtsstunde, ab Jg. 7 in der Regel höchstens zwei; Haupt-/Real-/Oberschule (Erlasse 2026): Jg. 5–6 höchstens 45 min, sonst 90 min, Deutsch Jg. 9/10 bis 135 min; IGS 45/90 min',
    announce: 'in der Regel einige Tage vorher',
    perDay: 1,
    perWeek: 3, // je Klasse bzw. Lerngruppe (Erlass 2012 Nr. 4)
    correction: 'Sek I zwei Wochen, Sek II drei Wochen (Primarbereich eine Woche)',
    weighting: 'keine feste Quote in den Erlassen; Festlegung durch Fachkonferenz bzw. Kerncurricula',
    mainSubject: '3–4 (Regelfall 4); gilt auch für drei-/vierstündige Wahlpflichtkurse',
    otherSubject: '2 (einstündig oder Epochalunterricht 1; Sport keine)',
    notes: [
      'Sind mehr als 30 % der Arbeiten mangelhaft oder ungenügend, wird die Arbeit nicht gewertet; die Schulleitung kann eine Abweichung genehmigen, die Klassenelternvertretung wird unterrichtet.',
      'Ersetzbar durch andere Lernkontrollen: in D/M/Fremdsprachen bis zur Hälfte, in Musik, Kunst und Informatik alle, in den übrigen Fächern die Hälfte (einstündig/epochal keine).',
      'In den modernen Fremdsprachen ersetzt die Sprechprüfung eine schriftliche Lernkontrolle je Doppeljahrgang.',
      'Verfügen über sprachliche Mittel wird nicht isoliert bewertet – Grammatik nur eingebettet prüfen.',
      'Haupt-, Real- und Oberschule: neue Erlasse vom 18.08.2026; die neuen Anzahlen gelten ab 01.08.2027.'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      'Fremdsprachen (auch Latein)',
      'Wahlpflichtkurse (3-/4-stündig)',
      'Naturwissenschaften',
      'Gesellschaftswissenschaften',
      'Religion/Werte und Normen',
      'Musik',
      'Kunst',
      'Informatik',
      'weitere Fächer außer Sport'
    ],
    sources: [
      'RdErl. „Schriftliche Arbeiten in den allgemein bildenden Schulen" vom 22.3.2012 (SVBl. S. 266), Nr. 4 und 8 – https://www.mk.niedersachsen.de/download/69741/',
      'RdErl. „Die Arbeit in den Schuljahrgängen 5 bis 10 des Gymnasiums" vom 1.8.2025 (SVBl. S. 492), Nr. 6.4–6.7',
      'Erlasse Hauptschule/Realschule/Oberschule vom 18.08.2026 (SVBl. S. 487/498/509)',
      'IGS-Erlass (Fassung ab 01.08.2026), Nr. 7.4–7.6'
    ],
    nichtGesichert: [
      'Ein schriftlicher Mindestanteil von einem Drittel steht in keinem Erlass (vermutlich aus den Kerncurricula).',
      'Der Erlass von 2012 ist formal außer Kraft und gilt vorläufig weiter; eine Neufassung liegt als Anhörungsfassung vom 20.04.2026 vor.',
      'Wortzahlverbot in den Fremdsprachen: Angabe der Lehrkraft (23.09.2026), Fundstelle nicht belegt.',
      'Notenspiegel, Oberstufe (EB-VO-GO), Wirkung von VERA.'
    ]
  },
  {
    stateId: 'NW',
    duration: 'in Unterrichtsstunden: Kl. 5–6 bis zu 1; Kl. 7 Deutsch 1–2, sonst 1; Kl. 8 1–2; Kl. 9–10 Deutsch 2–3, sonst 1–2 (Mathematik 10 an Gym/RS/GE: 2)',
    announce: 'rechtzeitig vorher',
    perDay: 1,
    perWeek: 2,
    correction: 'innerhalb von drei Wochen korrigiert, zurückgegeben und besprochen; erst danach eine neue Arbeit im selben Fach',
    weighting: '„Schriftliche Arbeiten" und „Sonstige Leistungen" werden angemessen berücksichtigt – keine feste Quote',
    mainSubject: 'D, 1. FS, M: Kl. 5/6 je 6, Kl. 7 5–6, Kl. 8/9 4–5, Kl. 10 3–5',
    otherSubject: 'keine (Ausnahme: Wahlpflichtfach/2. Fremdsprache 4–6 je nach Schulform und Klasse)',
    notes: [
      'In Geschichte, Erdkunde, Wirtschaft-Politik und den übrigen Fächern ohne Klassenarbeiten zählt nur der Bereich „Sonstige Leistungen im Unterricht".',
      'Fremdsprachen (Englisch, Französisch, Spanisch): Schreiben ist Bestandteil jeder Klassenarbeit, ergänzt um mindestens eine weitere Teilkompetenz.',
      'Sprachmittlung, Hör-/Hörsehverstehen und Leseverstehen je mindestens einmal im Schuljahr.',
      'Englisch: im letzten Jahr der Sek I wird eine Arbeit durch eine mündliche Prüfung ersetzt.',
      'Einmal je Schuljahr und Fach kann eine Klassenarbeit durch eine andere schriftliche oder mündliche Leistung ersetzt werden.',
      'Klassenarbeiten dürfen nicht am Nachmittag geschrieben werden; am Tag einer Klassenarbeit keine weitere schriftliche Überprüfung.',
      'Kl. 10: im 2. Halbjahr in D, E und M mindestens eine Arbeit zur Vorbereitung auf die ZP10.',
      'Lernstandserhebungen (Kl. 8) werden nicht als Klassenarbeit gewertet und nicht benotet.'
    ],
    subjects: ['Deutsch', 'Mathematik', 'Englisch/1. Fremdsprache', '2. Fremdsprache', 'Wahlpflichtfach', 'Ergänzungsstunden-Fremdsprache Kl. 9/10'],
    sources: [
      'APO-S I § 6 mit VV 6.1.1–6.1.3 (BASS 13-21 Nr. 1.1/1.2), zuletzt geändert 29.01.2026 – https://bass.schule.nrw/12691.htm',
      'BASS 12-63 Nr. 3 – https://bass.schule.nrw/15325.htm',
      'Kernlehrpläne G9 Englisch/Französisch/Spanisch, Geschichte, Erdkunde, Wirtschaft-Politik, jeweils Kap. 3 – lehrplannavigator.nrw.de',
      'Lernstandserhebungen: BASS 12-32 Nr. 4'
    ],
    nichtGesichert: ['Drittel-Regel bei schlechtem Ausfall und Notenspiegel.']
  },
  {
    stateId: 'BY',
    duration: 'Schulaufgabe Jgst. 5–11 höchstens 60 min (Deutsch ab Jgst. 8 angemessen länger), Jgst. 12/13 höchstens 90 min (Kunst bis 180 min)',
    announce: 'spätestens eine Woche vorher (Kurzarbeit ebenso; Stegreifaufgabe unangekündigt)',
    perDay: 1,
    perWeek: 2, // „soll"; gilt für große schriftliche Leistungsnachweise (GSO § 22 Abs. 4)
    correction: 'zwei Wochen; Deutsch ab Jgst. 10 und Jgst. 12/13 drei Wochen; vor Rückgabe keine neue Schulaufgabe',
    weighting: 'große zu kleine Leistungsnachweise 1:1 bei zwei Schulaufgaben, sonst 2:1; Fächer ohne Schulaufgaben nur kleine Leistungsnachweise',
    mainSubject:
      'Deutsch mind. 3; Mathematik Jgst. 5–7 mind. 4, 8–11 mind. 3; Fremdsprachen mind. 3, ab vier Wochenstunden mind. 4 (1. FS Jgst. 5–7, 2. FS Jgst. 6–8, 3. FS Jgst. 8–9)',
    otherSubject:
      'übrige Kernfächer mind. 2: Physik (ab Jgst. 8) und je Ausbildungsrichtung Griechisch (HG), 3. Fremdsprache (SG), Chemie (NTG), Musik (MuG), Wirtschaft und Recht (WWG), Politik und Gesellschaft (SWG); alle anderen Fächer ohne Schulaufgaben',
    notes: [
      'Kernfächer (GSO § 16 Abs. 2): Deutsch, zwei Fremdsprachen, Mathematik und Physik, dazu je Ausbildungsrichtung ein weiteres Fach; nur Kernfächer haben Schulaufgaben.',
      'In Ausnahmefällen darf die Mindestzahl in Deutsch, Mathematik und den Fremdsprachen um eine unterschritten werden.',
      'Höchstens eine Schulaufgabe je Fach und Schuljahr (Jgst. 5–11) ist durch ein im Anforderungsniveau gleichwertiges Prüfungsformat ersetzbar; die Lehrerkonferenz entscheidet zu Schuljahresbeginn einheitlich je Jahrgangsstufe und Ausbildungsrichtung, das Schulforum wird angehört. Gruppenarbeitsphasen oder eine Jahresstoff-Prüfung als letzter großer Nachweis brauchen die Zustimmung des Elternbeirats. Ankündigung, Hilfsmittel und Wiederholungsverbot gelten wie für Schulaufgaben (§ 22 Abs. 9).',
      'Beispiele für Ersatzformate (KMS vom 18.06.2026): Deutsch Debattenschulaufgabe (Jgst. 9) und mündliche Formate in Jgst. 11 (Literarische Debatte, Epochengespräch, Literarisches Quartett, Präsentationsprüfung); Latein/Griechisch Dialogschulaufgabe statt einer zweigeteilten Schulaufgabe; Naturwissenschaften Laborexperimente, Freilanduntersuchungen, hybride Herbarien; Informatik praktische Prüfungen am Computer. Produktorientierte Formate brauchen Prozessbegleitung und Prüfungsteile zur Reflexion.',
      'Deutsch Jgst. 5–8: Hält eine Schule vier statt drei Schulaufgaben, darf eine davon ersetzt werden, etwa durch den Jahrgangsstufentest (Jgst. 6, 8) zusammen mit einem schulinternen Test; frühere Ersatzformen laufen sonst als kleine Leistungsnachweise weiter.',
      'Fremdsprachen: Maßgeblich sind die Wochenstunden des Fachs. Intensivierungsstunden sind in der Stundentafel eine eigene Zeile (Üben, Wiederholen, keine neuen Lehrplaninhalte) und zählen nach dieser Auslegung nicht mit. Bei gleichzeitig einsetzender 1. und 2. Fremdsprache ab Jgst. 5 (je mindestens drei Wochenstunden) hängt die Zahl von der Stundenverteilung der Schule ab.',
      'In Jgst. 5–8 können außer in Deutsch alle Schulaufgaben eines Fachs durch Leistungsnachweise im Abstand von grundsätzlich sechs Unterrichtswochen ersetzt werden (Lehrerkonferenz, Zustimmung des Elternbeirats).',
      'Deutsch: Diktate oder grammatische Übungen sind als Schulaufgaben nicht zulässig; bei nur drei Schulaufgaben in Jgst. 5–8 keine Ersetzung durch Formate, die keine Aufsatzschulaufgaben sind.',
      'In modernen Fremdsprachen wird in mindestens zwei Jahrgangsstufen eine Schulaufgabe ganz oder teilweise mündlich abgehalten, in Jgst. 12/13 eine Schulaufgabe mündlich.',
      'Keine Drittel-Regel: Die Schulleitung kann eine Schulaufgabe bei unangemessenen Anforderungen für ungültig erklären; eine freiwillige Wiederholung ist unzulässig.',
      'Kurzarbeit höchstens 30 min über höchstens zehn vorangegangene Stunden (eine Woche Ankündigung), Stegreifaufgabe höchstens 20 min über höchstens zwei Stunden (unangekündigt), fachlicher Leistungstest höchstens 45 min.',
      'Qualifikationsphase: je Fach und Ausbildungsabschnitt eine Schulaufgabe (12/1–13/1; in 13/2 nur auf erhöhtem Niveau); Sport praktisch.',
      'Realschule: feste Zahlen je Fach und Wahlpflichtfächergruppe (RSO § 18), höchstens 60 min; höchstens 3 angekündigte Nachweise pro Woche, davon höchstens 2 Schulaufgaben.',
      'Mittelschule: keine Schulaufgaben und keine festen Zahlen; angekündigte schriftliche Leistungsnachweise höchstens einer am Tag, in der Regel höchstens zwei pro Woche (MSO § 12).'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      'zwei Fremdsprachen (auch Latein)',
      'Physik (ab Jgst. 8)',
      'HG: Griechisch',
      'SG: dritte Fremdsprache',
      'NTG: Chemie',
      'MuG: Musik',
      'WWG: Wirtschaft und Recht',
      'SWG: Politik und Gesellschaft'
    ],
    sources: [
      'GSO § 16 Abs. 2 (Kernfächer) – https://www.gesetze-bayern.de/Content/Document/BayGSO-16',
      'GSO §§ 21–23, 25, 28 (Fassung ab 01.08.2026) – https://www.gesetze-bayern.de/Content/Document/BayGSO-22',
      'GSO Anlage 1 (Stundentafeln Jgst. 5–11) – https://www.gesetze-bayern.de/Content/Document/BayGSO-ANL_1',
      'RSO §§ 17–20 – https://www.gesetze-bayern.de/Content/Document/BayRSO-18',
      'MSO §§ 12, 13 – https://www.gesetze-bayern.de/Content/Document/BayMSO-12',
      'KMS „Weiterentwicklung der Prüfungskultur an den bayerischen Gymnasien" vom 18.06.2026 (VI.3-BS5200.0/88/5) – https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Leistungserhebungen/2026_06_KMS_Weiterentwicklung_Pruefungskultur_Gymnasium.pdf',
      'StMUK: Prüfungskultur am Gymnasium – https://www.km.bayern.de/unterrichten/unterrichtsalltag/pruefungskultur/gymnasium'
    ],
    nichtGesichert: [
      'Intensivierungsstunden: Dass sie nicht als Wochenstunden des Fachs zählen, ist eine Auslegung aus Anlage 1 (eigene Zeile, Fußnote 9); ausdrücklich geregelt ist es nicht. Offen bleiben Intensivierungen zur Klassenteilung, in denen neue Inhalte zulässig sind.',
      'Zweisprachige Züge: modifizierte Stundentafeln des Staatsministeriums nicht ausgewertet; die Zahl richtet sich auch dort nach den Wochenstunden der Fremdsprache.',
      'Grundschule 3/4, Wirkung von VERA, Notenspiegel.'
    ]
  },
  {
    stateId: 'BW',
    duration: 'für Klassenarbeiten nicht geregelt; schriftliche Wiederholungsarbeit in der Regel bis 20 min',
    announce: 'in der Regel anzukündigen',
    perDay: 1,
    perWeek: 3,
    correction: 'keine feste Frist; vor Rückgabe und am Rückgabetag keine neue Arbeit im selben Fach',
    weighting: 'die Fachlehrkraft gibt die Gewichtung zu Beginn des Unterrichts bekannt – keine feste Quote',
    mainSubject: 'Kernfächer mind. 4, dreistündige Kernfächer mind. 3',
    otherSubject: 'höchstens vier schriftliche Arbeiten im Schuljahr',
    notes: [
      'Am Gymnasium ist ab Klasse 7 jede Schülerin und jeder Schüler einmal je Schuljahr zu einer gleichwertigen Leistungsfeststellung (GFS) verpflichtet.',
      'Deutsch: Gymnasium Kl. 5–7 und Realschule Kl. 5–9 mit einer Nachschrift.',
      'Realschule, Werkrealschule, Gemeinschaftsschule: Projekt in Kl. 8/9 (Gewicht ein Viertel im gewählten Fach).',
      'Profilfächer NwT/IMP sowie Musik und Bildende Kunst: eine Arbeit fachpraktisch ersetzbar.',
      'Keine Drittel-Regel in der Notenbildungsverordnung.'
    ],
    subjects: ['Deutsch', 'Mathematik', 'Pflichtfremdsprachen', 'Wahlpflicht-/Profilfach', 'weitere Kernfächer', 'übrige Fächer: schriftliche Arbeiten (höchstens 4)'],
    sources: [
      'Notenbildungsverordnung §§ 7–9, 9a (§ 8 Fassung ab 05.02.2025, § 9 Fassung ab 01.08.2026; zuletzt geändert GBl. 2026 Nr. 48) – https://www.landesrecht-bw.de/bsbw/document/jlr-NNLBW00007BBD'
    ],
    nichtGesichert: ['Dauer, Korrekturfrist, Notenspiegel.', 'Mindestzahl an der Gemeinschaftsschule.', 'Oberstufe nicht ausgewertet.']
  },
  {
    stateId: 'HE',
    duration: 'für die Sekundarstufe I nicht geregelt',
    announce: 'mindestens fünf Unterrichtstage vorher, mit inhaltlichem Rahmen',
    perDay: 1,
    perWeek: 3,
    correction: 'spätestens nach drei Unterrichtswochen; vor Rückgabe keine neue Arbeit im Fach',
    weighting: 'Fächer mit Klassenarbeiten 50 %, übrige Fächer etwa ein Drittel',
    mainSubject: 'Deutsch, Mathematik, 1. Fremdsprache: Jg. 5/6 je 5, Jg. 7–10 je 4; 2. Fremdsprache 4 (G9 im ersten Lernjahr 5)',
    otherSubject: 'Lernkontrollen, höchstens eine je Fach und Halbjahr',
    notes: [
      'Ein Notenspiegel ist anzugeben.',
      'Sind mehr als ein Drittel der Arbeiten mangelhaft oder ungenügend, wird die Arbeit einmal wiederholt, außer die Schulleitung entscheidet nach Beratung für die Wertung; es zählt die bessere Note.',
      'In Jg. 6 und 8 soll eine Arbeit als schulinterne Vergleichsarbeit geschrieben werden.',
      'Die Note „ausreichend" ist erreicht, wenn die Erwartungen annähernd zur Hälfte erfüllt sind.'
    ],
    subjects: ['Deutsch', 'Mathematik', '1./2./3. Fremdsprache', 'Lernbereiche (z. B. NaWi/GL an IGS)', 'Politik und Wirtschaft (Anzahl nicht gesichert)'],
    sources: [
      'VOGSV §§ 28, 32–34 und Anlage 2 Nr. 4–7, geändert durch Art. 7 des Gesetzes vom 22.06.2026 (GVBl. 2026 Nr. 38) – https://www.rv.hessenrecht.hessen.de/bshe/document/hevr-SchulVerhGVHE2011V4IVZ/part/X'
    ],
    nichtGesichert: ['Zahl der Arbeiten in Politik und Wirtschaft.', 'Oberstufe (OAVO) nicht ausgewertet.']
  },
  {
    stateId: 'BE',
    duration:
      'je Fach/Jahrgang: Deutsch Jg. 5–8 30–120 min, Jg. 9–10 90–180 min; Mathematik 45–120 min; 1. FS Jg. 5–6 45 min, Jg. 7–10 45–150 min; 2. FS 45–150 min; 3. FS und Wahlpflicht 45–90 min',
    announce: 'spätestens eine Woche vorher, mit inhaltlichen Schwerpunkten',
    perDay: 1,
    perWeek: null, // Gesamtkonferenz regelt die Verteilung
    correction: 'unverzüglich (keine feste Frist)',
    weighting: 'schriftliche Leistungen etwa zur Hälfte in Fächern mit Klassenarbeiten',
    mainSubject: 'Deutsch, Mathematik, 1./2./3. Fremdsprache mind. 4',
    otherSubject: 'Wahlpflichtunterricht mind. 2; Gesellschafts-/Naturwissenschaften Jg. 5/6 mind. 3; übrige Fächer keine Pflicht',
    notes: [
      'Ein Notenspiegel ist anzugeben; der Schulleitung wird je eine gute, durchschnittliche und schwache Arbeit vorgelegt.',
      'Sind mehr als ein Drittel mangelhaft oder schlechter, entscheidet die Schulleitung über Wertung oder Neuanfertigung.',
      'In modernen Fremdsprachen kann einmal je Schuljahr eine mündliche Leistung eine Klassenarbeit ersetzen.',
      'Je Fach und Schuljahr ist höchstens eine Projektarbeit auf die Mindestzahl anrechenbar.',
      'In D, 1. FS und M kann in Jg. 8–10 je eine Arbeit entfallen, wenn eine Vergleichsarbeit oder die MSA/eBBR-Prüfung geschrieben wird.'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      '1. Fremdsprache',
      '2. Fremdsprache',
      '3. Fremdsprache',
      'Wahlpflichtunterricht',
      'Gesellschaftswissenschaften 5/6',
      'Naturwissenschaften 5/6'
    ],
    sources: [
      'Sek I-VO §§ 19, 20 (aktuelle Fassung 16.08.2026) – https://gesetze.berlin.de/bsbe/document/jlr-SekIVBE2010V31P19',
      'Sek I-VO Anlage 4 „Verbindliche Anzahl der Klassenarbeiten" (Stand 09.08.2023)'
    ],
    nichtGesichert: []
  },
  {
    stateId: 'BB',
    duration: 'Jg. 7–9 45–90 min; Jg. 10 Deutsch/Mathematik 45–135 min, Fremdsprachen 45–90 min; Wahlpflicht 45 min',
    announce: 'mindestens fünf Unterrichtstage vorher (Gymnasium Jg. 10: drei Wochen)',
    perDay: 1,
    perWeek: 2,
    correction: 'Sek I zwei Wochen, spätestens vor der nächsten Arbeit',
    weighting: 'schriftliche Arbeiten 25 % der Gesamtbewertung',
    mainSubject: 'Deutsch, Mathematik, Fremdsprachen je 2',
    otherSubject: 'Wahlpflicht nach Beschluss der Mitwirkungsgremien; sonstige Fächer nur Gymnasium Jg. 10 (Anzahl nicht gesichert)',
    notes: [
      'Je Jahrgangsstufe kann eine Pflichtarbeit durch eine mündliche Leistung ersetzt werden (Fachkonferenz).',
      'Sind mehr als ein Drittel mangelhaft oder ungenügend, entscheidet die Schulleitung nach Rücksprache über Wertung oder Wiederholung (nicht Gymnasium Jg. 10).',
      'Zentrale Orientierungsarbeiten ersetzen je eine schriftliche Arbeit.',
      'Notenspiegel nur auf Beschluss der Elternversammlung.',
      'Notenschlüssel Jg. 5–10: ab 96/80/60/45/16 %.'
    ],
    subjects: ['Deutsch', 'Mathematik', 'Fremdsprachen', 'Wahlpflichtunterricht', 'sonstige Fächer ab 2 Wochenstunden (nur Gymnasium Jg. 10)'],
    sources: [
      'VV-Leistungsbewertung vom 21.07.2011, zuletzt geändert 18.08.2025 (Abl. MBJS/25 Nr. 17 S. 244), Nr. 5 und 8 – https://bravors.brandenburg.de/verwaltungsvorschriften/vv_leistungsbewertung',
      'Anlage „Anzahl und Dauer der schriftlichen Arbeiten" (Fassung 2025) – https://bravors.brandenburg.de/sixcms/media.php/66/Anlage.242455.pdf'
    ],
    nichtGesichert: ['Zahl der Arbeiten in den sonstigen Fächern am Gymnasium Jg. 10.']
  },
  {
    stateId: 'HB',
    duration: 'Jg. 5/6 bis eine Unterrichtsstunde, Jg. 7–10 bis zwei; Deutsch-Aufsatz zwei bis drei (Jg. 10 bis vier) Stunden',
    announce: 'Klassenarbeiten werden angekündigt, feste Frist nicht geregelt',
    perDay: 1,
    perWeek: 3,
    correction: 'in der Regel innerhalb einer Woche',
    weighting: 'keine landesweite Quote (nicht gesichert)',
    mainSubject: 'Deutsch, Mathematik, Fremdsprachen: 3 je Halbjahr',
    otherSubject: 'keine Klassenarbeiten; bis zu vier Kurzarbeiten (höchstens 30 min) je Halbjahr',
    notes: [
      'Sind mehr als ein Drittel mangelhaft oder ungenügend, wird die Arbeit nicht gewertet; Ausnahme nur auf begründeten Antrag durch die Schulleitung.',
      'Kurzarbeiten höchstens 30 min, auch unangekündigt über den Stoff der letzten zwei Wochen.',
      'Parallelarbeiten Jg. 6 in Deutsch, Mathematik und Englisch zählen als Klassenarbeit (60 min).',
      'An Ganztagsschulen in der Regel vor der Mittagspause.',
      'Grundlage ist die Richtlinie von 1982; die Geltung ist nicht abschließend gesichert.'
    ],
    subjects: ['Deutsch', 'Mathematik', 'Fremdsprachen (Englisch, 2./3. FS, Latein)'],
    sources: [
      'Richtlinie 331.01 „Schriftliche Arbeiten … Jahrgangsstufen 5 bis 10" vom 29.10.1982 – https://www.transparenz.bremen.de/schriftliche-arbeiten-im-unterricht-der-allgemeinbildenden-schulen-in-den-jahrgangstufen-5-bis-10-163668',
      'BremSchulG § 38; VO Sek I Oberschule bzw. Gymnasium, jeweils § 4',
      'Mitteilung Nr. 271/2025 (Parallelarbeiten Jg. 6)'
    ],
    nichtGesichert: ['Geltung der Richtlinie von 1982.', 'Gewichtung (keine landesweite Quote gefunden).']
  },
  {
    stateId: 'HH',
    duration: 'Sek I nicht geregelt; Gymnasium Kl. 10: mind. 45 min (1. Halbjahr) bzw. 90 min (2. Halbjahr)',
    announce: 'Terminplan zu Beginn jedes Halbjahres, im Klassenraum ausgehängt',
    perDay: null, // Sek I nicht gefunden; Oberstufe 1
    perWeek: 2,
    correction: 'zeitnah (Oberstufe spätestens nach drei Wochen)',
    weighting: 'Zeugnisnote nicht überwiegend aus Klassenarbeiten; Mathematik 50 %',
    mainSubject: 'Deutsch Kl. 5–8: 6 (davon 2 Rechtschreibung); Deutsch ab Kl. 9, Mathematik, Fremdsprachen: 4',
    otherSubject: 'mind. 2 (nicht Sport, Musik, Bildende Kunst, Theater)',
    notes: [
      'Höchstens sieben Klassenarbeiten pro Monat, im Dezember sechs.',
      'Je Fach und Schuljahr ist eine Klassenarbeit durch eine entsprechende Leistung ersetzbar (bei vier oder mehr Arbeiten bis zu zwei); nicht in Mathematik und bei Rechtschreibarbeiten.',
      'Sprechprüfung einmal in der Sek I je neuerer Fremdsprache (ab Kl. 7), ersetzt eine Klassenarbeit.',
      'Sind mehr als ein Drittel mangelhaft oder ungenügend, wird die Arbeit nur mit Zustimmung der Schulleitung gewertet.',
      'Jahrgangsarbeiten nach zentralen Vorgaben in den Naturwissenschaften (Kl. 6 und 8).',
      'Mindestens vier Leistungsnachweise je Jahrgang mit digitalen Anteilen, davon mindestens zwei Klassenarbeiten.',
      'KERMIT-Lernstandserhebungen sind keine Klassenarbeiten.'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      'Fremdsprachen (auch Latein)',
      'Biologie/Chemie/Physik bzw. NaWi',
      'Geschichte',
      'Geografie',
      'PGW',
      'Religion/Philosophie',
      'Informatik',
      'Arbeit und Beruf/Technik',
      'Wahlpflichtfächer'
    ],
    sources: [
      'Bildungsplan Gymnasium Sek I (2024), Teil C „Leistungsbewertung" – https://dokumente.hamburg.de/resource/blob/798488/251acd87545f55fad72fc95d6402821c/teil-c-leistungsbewertung-data.pdf',
      'Bildungsplan Stadtteilschule (2024), Teil C „Leistungsbewertung" – https://dokumente.hamburg.de/resource/blob/798348/b90a28a8e27ba7b4169fedbc33474269/teil-c-leistungsbewertung-data.pdf',
      'APO-GrundStGy (Stand 8.4.2024); Rechtsgrundlage HmbSG § 4 Abs. 2'
    ],
    nichtGesichert: ['Tagesgrenze in der Sek I.', 'Genaues Inkrafttreten der Bildungsplan-Fassungen 2024.', 'Notenspiegelpflicht.']
  },
  {
    stateId: 'MV',
    duration: 'Jg. 5/6 grundsätzlich 45 min (Aufsatz höchstens 90); Jg. 7–10 mind. 45 min (Aufsatz mind. 90)',
    announce: 'mindestens fünf Unterrichtstage vorher',
    perDay: 1,
    perWeek: 2,
    correction: 'Rückgabe spätestens nach zwei Wochen',
    weighting: 'Klassenarbeiten 30 % (Orientierungsstufe, Berufsreife/Mittlere Reife); Gymnasium Jg. 7–9 in D/M/FS 50 %, übrige Fächer ein Drittel',
    mainSubject: 'Gymnasium bis Jg. 9: mind. 3; Orientierungsstufe und Regionale Schule/Gesamtschule: 2',
    otherSubject: 'Gymnasium: je 1 nur auf Beschluss der Lehrkräftekonferenz; sonst keine',
    notes: [
      'Neue Leistungsbewertungsverordnung seit 01.08.2026.',
      'Ist mehr als die Hälfte schlechter als ausreichend, entscheidet die Schulleitung über Wertung oder Wiederholung.',
      'Der Leistungsdurchschnitt ist anzugeben; ein Notenspiegel ist freigestellt.',
      'Fremdsprachen (außer Latein/Griechisch): in Jg. 7/8 mindestens eine Arbeit mit mündlichem Teil, spätestens ab Jg. 9 eine gleichwertige Sprechleistung.',
      'Am Gymnasium kann eine komplexe Leistung eine Klassenarbeit ersetzen.',
      'Am Tag einer Klassenarbeit keine schriftliche Lernerfolgskontrolle.',
      'VERA zählt höchstens als Lernerfolgskontrolle, nicht als Klassenarbeit.'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      'Pflichtfremdsprachen (Englisch, 2. FS, Latein/Griechisch)',
      'Wahlpflicht-Fremdsprachen (Gymnasium)',
      'weitere Fächer am Gymnasium auf Konferenzbeschluss'
    ],
    sources: [
      'LeistBewVO M-V, Art. 1 der VO vom 8.6.2026 (Mitteilungsblatt 7/2026 S. 350 ff.), §§ 5, 6, 8, 14 – https://www.regierung-mv.de/serviceassistent/download?id=1690073',
      'APVO M-V vom 19.2.2019, geändert 1.8.2025 (Oberstufe)'
    ],
    nichtGesichert: ['Welche Zahl am Gymnasium ab Kl. 5 in Jg. 5/6 gilt.']
  },
  {
    stateId: 'RP',
    duration: 'nicht landesrechtlich geregelt',
    announce: 'mindestens eine Woche vorher; Zeiträume zu Beginn des Halbjahres',
    perDay: 1,
    perWeek: 3, // bei Nachterminen ausnahmsweise 4
    correction: 'innerhalb angemessener Frist; mindestens zwei Unterrichtswochen zwischen Rückgabe und nächster Arbeit im Fach',
    weighting: 'Gesamtnote Klassenarbeiten und Gesamtnote andere Leistungsnachweise 1:1',
    mainSubject: 'Deutsch 4 (Kl. 5–8: 3 Texte + 1 Rechtschreibung), Mathematik 4, 1. FS 3 (Kl. 5) bzw. 4, 2. FS 3 (1. Lernjahr) bzw. 4',
    otherSubject: 'keine Klassenarbeiten; je Halbjahr eine schriftliche Überprüfung (bis 30 min) möglich; Wahlpflichtfach (RS+/IGS) 3–4',
    notes: [
      'In den Klassenstufen 5 und 7 wird mindestens eine Klassenarbeit je Fach als Parallelarbeit geschrieben.',
      'Liegt ein Drittel oder mehr der Noten unter ausreichend, entscheidet die Schulleitung über eine Wiederholung.',
      'Der Notenspiegel wird mitgeteilt.',
      'In den Fremdsprachen kann je Klassenstufe eine Klassenarbeit durch eine mündliche Leistungsfeststellung ersetzt werden.',
      'In der ersten Fachstunde nach den Ferien wird keine Klassenarbeit geschrieben.'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      '1. Fremdsprache (Englisch/Französisch/Latein)',
      '2. Fremdsprache',
      '3. Fremdsprache (Französisch, Italienisch, Spanisch, Latein, Griechisch)',
      'Wahlpflichtfach (Realschule plus, IGS)'
    ],
    sources: [
      'Übergreifende Schulordnung (ÜSchO, zuletzt geändert 06.12.2021) §§ 50–56, 61 – https://bildung.rlp.de/fileadmin/user_upload/schulemedienrecht.bildung.rlp.de/Downloads/Broschuere_Schulordnung_LAY_07102022.pdf',
      'VV „Zahl der benoteten Klassenarbeiten in den Pflichtfächern an Realschulen plus, Gymnasien und Integrierten Gesamtschulen (Kl. 5–10)" vom 12.07.2012 (Amtsbl. 8/2012 S. 277), Nr. 2.1'
    ],
    nichtGesichert: ['Geltung der VV von 2012 ohne Änderungen im Jahr 2026.', 'Änderungen der ÜSchO nach 2021.', 'Dauer, VERA-Regelungen.']
  },
  {
    stateId: 'SL',
    duration: 'Richtwerte: Kl. 5/6 etwa 45 min; Kl. 7/8 45–90 min; Kl. 9/10 45–90 min (Deutsch bis 135 min)',
    announce: 'spätestens sieben Kalendertage vorher',
    perDay: 1,
    perWeek: 2, // im Klassenverband, dazu einer außerhalb
    correction: 'spätestens drei Schulwochen (kleine Leistungsnachweise zwei)',
    weighting: 'große Leistungsnachweise und sonstige Leistungen etwa gleich gewichtet',
    mainSubject:
      'D, M, 1./2. FS (Gym auch 3. FS/Profilfach): 4 große Leistungsnachweise, davon 2 schriftliche Arbeiten (je Halbjahr eine) und mind. eine medien-/materialgestützte Arbeit',
    otherSubject: 'Gymnasium ab Kl. 8, Gemeinschaftsschule ab Kl. 9: ein großer Leistungsnachweis je Halbjahr (einstündig: einer im Schuljahr); davor nur sonstige Leistungen',
    notes: [
      'Erreicht mindestens ein Drittel kein ausreichendes Ergebnis, entscheidet die Schulleitung über Wertung, geänderten Maßstab oder Wiederholung.',
      'Vor der Rückgabe werden der Schulleitung drei Arbeiten mit Aufgabenstellung, Maßstab und Notenverteilung vorgelegt.',
      'In Parallelklassen soll je Fach und Schuljahr eine Arbeit als Vergleichsarbeit geschrieben werden.',
      'Ein Notenspiegel soll bekannt gegeben werden.',
      'In den modernen Fremdsprachen mindestens jedes zweite Jahr eine mündliche Prüfung.',
      'Ein neuer gleichartiger Leistungsnachweis frühestens eine Unterrichtswoche nach der Rückmeldung zum vorherigen.'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      '1. Fremdsprache',
      '2. Fremdsprache',
      '3. Fremdsprache bzw. Profilfach (Gymnasium)',
      'übrige Fächer: große Leistungsnachweise ab Kl. 8 (Gym) bzw. 9 (GemS)'
    ],
    sources: [
      'Erlass zur Leistungsbewertung in den Schulen des Saarlandes vom 09.07.2024 (Amtsbl. I S. 506), Nr. 3.4 – https://www.saarland.de/SharedDocs/Downloads/DE/mbk/Bildungsserver/allgemeine-informationen/erlass_leistungbewert_2024.pdf'
    ],
    nichtGesichert: ['Oberstufe (GOS-VO nicht abrufbar).', 'Lesart der Grundschultabelle Deutsch.']
  },
  {
    stateId: 'SN',
    duration: 'für die Sek I landesrechtlich nicht vorgegeben; Gymnasium Kl. 10 besondere Leistungsfeststellung in der Regel 90 min',
    announce: 'in der Regel mindestens eine Woche vorher',
    perDay: 1,
    perWeek: 3,
    correction: 'höchstens zwei Wochen',
    weighting: 'Gymnasium: Beschluss der Fachkonferenz, zu Schuljahresbeginn bekanntgegeben; Oberschule: Klassenarbeiten in der Regel höher gewichtet',
    mainSubject: 'keine Landesvorgabe (Gesamtlehrer- bzw. Fachkonferenz); Gymnasium: je Schüler höchstens 20 Klassenarbeiten und komplexe Leistungen im Schuljahr',
    otherSubject: 'keine Landesvorgabe',
    notes: [
      'Komplexe Leistungen können Klassenarbeiten gleichgestellt werden.',
      'Gymnasium Kl. 10: zentrale besondere Leistungsfeststellung in Deutsch, Mathematik und Englisch, zählt doppelt.',
      'Oberschule Kl. 10: zentrale schriftliche Realschulabschlussprüfung.',
      'Eine Wiederholungsregel bei schlechtem Ausfall enthalten SOGYA und SOOSA nicht.'
    ],
    subjects: ['schulische Festlegung (keine Landesliste)'],
    sources: [
      'SOGYA vom 30.05.2023, zuletzt geändert 15.06.2026 (SächsGVBl. S. 230), §§ 27, 29 – https://www.revosax.sachsen.de/vorschrift/20003',
      'SOOSA vom 11.07.2011, zuletzt geändert 15.06.2026, § 24a – https://www.revosax.sachsen.de/vorschrift/12053-Schulordnung-Ober-und-Abendoberschulen'
    ],
    nichtGesichert: ['Ob die Lehrpläne der Oberschule Zahlen enthalten.']
  },
  {
    stateId: 'ST',
    duration: 'mindestens 45 min; in den Kernfächern ab Jg. 8 mindestens eine Arbeit mit 90 min; Arbeiten unter Prüfungsbedingungen in Prüfungslänge',
    announce: 'mindestens eine Woche vorher',
    perDay: 1,
    perWeek: 3,
    correction: 'höchstens drei Wochen (Ferien zählen mit)',
    weighting: 'Klassenarbeiten zusammen 25–40 % der Halbjahres-/Jahresnote',
    mainSubject: 'Kernfächer mind. 2 (Festlegung durch die Fachkonferenz)',
    otherSubject: 'sonstige versetzungsrelevante Fächer außer Sport mind. 1; Ausnahmen möglich',
    notes: [
      'Erreichen weniger als zwei Drittel mindestens ausreichend, entscheidet die Schulleitung vor der Rückgabe über Wertung oder Wiederholung.',
      'Eine gleichwertige komplexe Leistung kann eine Klassenarbeit ersetzen (nicht bei Arbeiten unter Prüfungsbedingungen).',
      'Jg. 6: eine Kernfach-Arbeit mit landeszentralen Vorgaben; Jg. 5 und 7–9: eine gemeinsame Parallelarbeit in einem Kernfach.',
      'Jg. 10: in Deutsch, Englisch und Mathematik je eine Arbeit unter Prüfungsbedingungen.',
      'Grundlage ist der Erlass von 2012; spätere Änderungen sind nicht gesichert.'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      'Englisch',
      'alle weiteren versetzungsrelevanten Fächer außer Sport (z. B. 2. FS, Biologie, Chemie, Physik, Geografie, Geschichte, Sozialkunde, Ethik/Religion, Wirtschaft, Technik, Kunst, Musik, Astronomie, Wahlpflicht)'
    ],
    sources: [
      'RdErl. MK vom 26.06.2012 „Leistungsbewertung und Beurteilung an allgemeinbildenden Schulen … Sekundarstufen I und II", Nr. 4.1.3 – https://www.landesrecht.sachsen-anhalt.de/perma?j=VVST-223110-MK-20120626-SF (gelesen in inoffizieller Wiedergabe)'
    ],
    nichtGesichert: [
      'Nur inoffizielle Wiedergabe des Erlasses gelesen; spätere Änderungen nicht geprüft.',
      'Dass die Kernfächer Deutsch, Mathematik und Englisch sind, ist abgeleitet.',
      'Notenspiegel.'
    ]
  },
  {
    stateId: 'SH',
    duration: 'im Erlass nicht geregelt (Oberstufe 90 min)',
    announce: 'keine Frist; Bedingungen (Zeit, Raum, Hilfsmittel) werden vorab bekanntgemacht',
    perDay: 1,
    perWeek: 2,
    correction: 'höchstens vier Unterrichtswochen; nächste Arbeit im Fach in der Regel frühestens zwei Wochen nach Rückgabe',
    weighting: 'Unterrichtsbeiträge stärker gewichtet als Leistungsnachweise',
    mainSubject: 'Zahlen je Jahrgangsblock (Gesamtzahl/davon Klassenarbeiten), z. B. Gymnasium G9 Deutsch Jg. 5–6 10/7, Jg. 7–10 17/12',
    otherSubject: 'bereichsweise, z. B. Naturwissenschaften 4/3, Gesellschaftswissenschaften 4/3, Informatik 2/1, Ästhetik/Sport 2/0 (Gymnasium Jg. 7–9/10)',
    notes: [
      'Die Zahl je Jahrgang und Fach legt die Schulleitung nach Anhörung der Fachkonferenzen fest; die Fächer im NaWi-/GeWi-/Ästhetikbereich wählt die Schulkonferenz.',
      'Sprechprüfungen in modernen Fremdsprachen sind eine Form der Klassenarbeit.',
      'Mathematik: jede Klassenarbeit enthält einen Wiederholungsteil zu grundlegenden Kompetenzen.',
      'Gleichwertige Leistungsnachweise brauchen einen mündlichen Teil; reine Heimarbeit ist unzulässig.',
      'Sollen ein Drittel oder mehr schlechter als ausreichend bewertet werden, muss die Schulleitung zustimmen.',
      'Tests bis 20 min zählen zu den Unterrichtsbeiträgen.',
      'Standardsprachliche Richtigkeit wird in allen Fächern geprüft.'
    ],
    subjects: [
      'Deutsch',
      'Mathematik',
      '1. Fremdsprache',
      '2. Fremdsprache',
      '3. Fremdsprache bzw. Wahlpflichtunterricht',
      'Informatik',
      'Naturwissenschaften',
      'Gesellschaftswissenschaften (Geschichte, Erdkunde, WiPo, Weltkunde)',
      'Ästhetische Bildung/Sport (nur gleichwertige Nachweise)'
    ],
    sources: [
      'Erlass „Leistungsnachweise in der Sekundarstufe I" vom 4.6.2025 (gültig 01.08.2025–31.07.2030), Nr. 4 – https://www.schleswig-holstein.de/DE/fachinhalte/S/schulrecht/Downloads/Erlasse/Downloads/Leistungsnachweise_Sek_I.pdf',
      'Oberstufen-Erlass vom 23.6.2021, geändert 11.4.2026'
    ],
    nichtGesichert: ['Dauer und Notenspiegel in der Sek I.']
  },
  {
    stateId: 'TH',
    duration: 'nicht landesrechtlich geregelt (Fachkonferenz)',
    announce: 'Ankündigungspflicht ohne feste Frist',
    perDay: 1, // höchstens eine an zwei aufeinanderfolgenden Unterrichtstagen
    perWeek: null,
    correction: 'nicht geregelt',
    weighting: 'Festlegung durch die Lehrerkonferenz',
    mainSubject: 'Deutsch, Mathematik, 1. Fremdsprache: mind. eine Klassenarbeit je Halbjahr (bei mind. drei Leistungsnachweisen je Halbjahr)',
    otherSubject: 'keine Klassenarbeiten vorgeschrieben; Leistungsnachweise nach Wochenstunden, mind. drei je Halbjahr (Soll)',
    notes: [
      'An zwei aufeinanderfolgenden Unterrichtstagen ist nur eine Klassenarbeit zulässig; Nachschreibearbeiten zählen nicht mit.',
      'Art, Zahl, Umfang und Gewichtung der Leistungsnachweise legen die Fachkonferenzen fest.',
      'Kompetenztests werden nicht benotet.',
      'Gymnasium Kl. 10: In den Fächern der besonderen Leistungsfeststellung entfallen im 2. Halbjahr die Klassenarbeiten.',
      'Vergleichbare komplexe Leistungen und anerkannte Wettbewerbsleistungen zählen als Leistungsnachweis.'
    ],
    subjects: ['Deutsch', 'Mathematik', '1. Fremdsprache', 'weitere Fächer nach Beschluss der Fachkonferenz'],
    sources: [
      'Thüringer Schulordnung (nichtamtliche Lesefassung ab 01.08.2025) §§ 58, 59, 68, 74 – https://bildung.thueringen.de/fileadmin/ministerium/publikationen/thueringer_schulordnung.pdf'
    ],
    nichtGesichert: [
      'Die „Fachliche Empfehlung zur Leistungsbewertung" war nicht abrufbar (Korrekturfrist, Wiederholungsregel).',
      'Ob in den übrigen Fächern im 2. Halbjahr Kl. 10 eine Klassenarbeit zu schreiben ist.'
    ]
  }
]

export const stateRules = (stateId: string): ExamStateRules | undefined => EXAM_STATE_RULES.find((r) => r.stateId === stateId)

/**
 * Tages- und Wochengrenze als eine Zeile für die Oberfläche; `null` heißt „vom Land nicht
 * geregelt" und darf nicht als „höchstens  pro Tag" erscheinen (29.09.2026).
 */
export function taktZeile(rules: Pick<ExamStateRules, 'perDay' | 'perWeek'>): string {
  const tag = rules.perDay === null ? 'pro Tag nicht geregelt' : `höchstens ${rules.perDay} pro Tag`
  const woche = rules.perWeek === null ? 'pro Woche nicht geregelt' : `höchstens ${rules.perWeek} pro Woche`
  return `${tag}, ${woche}`
}

/**
 * Darf die Arbeit den Lernenden eine Wortzahl vorgeben?
 *
 * In Niedersachsen dürfen in den Fremdsprachen bei Schreib- und Sprachmittlungsaufgaben in
 * KLASSENARBEITEN keine Wortzahlen mehr vorgegeben werden (Angabe der Lehrkraft, 23.09.2026;
 * eine amtliche Fundstelle ist nicht gesichert – in den KCs Englisch 2026, Französisch 2025
 * und Spanisch 2024 steht dazu nichts).
 *
 * Seit 29.09.2026 für ALLE modernen Fremdsprachen, nicht nur Englisch (Befund F1 der Prüfung
 * `recherche/klassenarbeiten-pruefung-vorhandene-faecher-2026-09-29.md`): Kommentar und
 * Grund-Text sprachen immer schon von „den Fremdsprachen".
 *
 * Die App erzwingt das, statt nur zu warnen: Eine Wortzahl auf dem Blatt ließe sich nach dem
 * Austeilen nicht mehr zurücknehmen, und die Lehrkraft sähe der fertigen Arbeit nicht an,
 * dass hier eine Landesvorgabe verletzt wird. Für ARBEITSBLÄTTER gilt die Regel nicht – dort
 * bleibt die Wortvorgabe eine Entscheidung der Lehrkraft.
 *
 * Der Umfang selbst wird weiter geplant (Schreibraum, Erwartungshorizont); er steht nur
 * nicht auf dem Schülerblatt.
 */
export function wortzahlErlaubt(stateId: string, subjectId: string): boolean {
  return !(stateId === 'NI' && istModerneFremdsprache(subjectId))
}

/** Warum die Wortzahl nicht vorgegeben werden darf – für die Oberfläche und den KI-Auftrag. */
export const WORTZAHL_GRUND =
  'In Niedersachsen dürfen in den modernen Fremdsprachen bei Schreib- und Sprachmittlungsaufgaben in Klassenarbeiten keine Wortzahlen vorgegeben werden. Der geplante Umfang steuert weiterhin Schreibraum und Erwartungshorizont, erscheint aber nicht auf dem Schülerblatt.'

/**
 * Hinweise, die zur geplanten Arbeit passen.
 *
 * 29.09.2026: Fächer ohne Klassenarbeiten kommen aus `nachweisFuer` (alle Länder; vorher nur
 * NW Geschichte, und die Zeile für `otherSubject === 'keine'` schob einen leeren Text ein, der
 * herausgefiltert wurde – sie wirkte nie). Die Fremdsprachenregeln gelten für alle modernen
 * Fremdsprachen statt nur für Englisch (Befunde F1, F3, F4, G1).
 *
 * `schoolTypeId` ist optional (Standard Gymnasium), damit ältere Aufrufer weiter passen.
 */
export function examWarnings(
  stateId: string,
  subjectId: string,
  grade: number,
  formatIds: string[],
  schoolTypeId = 'gymnasium',
  ausbildungsrichtung?: ByZweig
): string[] {
  const out: string[] = []
  const nachweis = nachweisFuer({ stateId, schoolTypeId, subjectId, grade, ausbildungsrichtung })
  if (nachweis.keineKlassenarbeit && nachweis.hinweis) out.push(nachweis.hinweis)

  const arten = formatIds.map((f) => formatArt(f))
  const fremdsprache = istModerneFremdsprache(subjectId)
  const fach = fachName(subjectId)

  // NRW, KLP G9 Englisch/Französisch/Spanisch Kap. 3: Schreiben in jeder Klassenarbeit (Sek I)
  if (stateId === 'NW' && fremdsprache && grade <= 10 && !arten.includes('writing')) {
    out.push(`In Nordrhein-Westfalen ist Schreiben Bestandteil jeder Klassenarbeit im Fach ${fach} – ein Schreibteil gehört dazu.`)
  }
  // NI, KC Englisch 2026 S. 61 f., KC Französisch 2025 S. 39 f., KC Spanisch 2024 S. 58
  if (stateId === 'NI' && fremdsprache && (arten.includes('grammar') || arten.includes('language'))) {
    out.push(
      'In Niedersachsen wird das Verfügen über sprachliche Mittel nicht isoliert bewertet. Die Grammatik wird deshalb eingebettet in eine andere Teilkompetenz geprüft.'
    )
  }
  // RP (Lehrplan Französisch 2022, Spanisch 2012), SL (Englisch/Französisch 2023/24), TH (neue Lehrpläne 2026):
  // Sprachmittel nicht isoliert – solche Teile bietet die App dort nicht mehr an (formatsFor); ältere Arbeiten warnen
  if (ohneIsolierteSprachmittel(stateId) && stateId !== 'NI' && fremdsprache && (arten.includes('grammar') || arten.includes('language'))) {
    const land = stateId === 'RP' ? 'In Rheinland-Pfalz' : stateId === 'SL' ? 'Im Saarland' : 'In Thüringen'
    out.push(
      `${land} werden sprachliche Mittel nicht isoliert, sondern anwendungsbezogen in einer Teilkompetenz geprüft. Ein eigener Grammatik- oder Sprachmittelteil entspricht nicht den Lehrplänen.`
    )
  }
  // NI, KC Französisch 2025 S. 40: höchstens zwei Teilkompetenzen, Sprachmittlung ab Jg. 9
  if (stateId === 'NI' && subjectId === 'franzoesisch') {
    const kompetenzen = new Set(arten.filter((a) => a && a !== 'grammar' && a !== 'language'))
    if (kompetenzen.size > 2) {
      out.push('In Niedersachsen werden in einer Französischarbeit höchstens zwei Teilkompetenzen geprüft, in der Regel eine rezeptive und eine produktive, jede mit eigener Teilnote.')
    }
    if (grade < 9 && arten.includes('mediation')) {
      out.push('In Niedersachsen wird Sprachmittlung im Fach Französisch erst ab Jahrgang 9 in Klassenarbeiten geprüft.')
    }
  }
  return out
}

/**
 * Notenschlüssel als kurze Zeile für den Kopf der ersten Seite.
 * Gerechnet wird in `shared/gradeScale.ts` – derselbe Schlüssel gilt für Grammatiktests.
 */
export function gradeScaleLine(points: number, thresholds?: number[]): string {
  return sharedGradeScaleLine(points, thresholds)
}

/**
 * Die Schlüsselzeile für DIESE Arbeit: in der Sekundarstufe II Notenpunkte 0–15 nach dem
 * Raster des Landes (26.09.2026), sonst der Notenschlüssel 1–6 der Lehrkraft.
 */
export function scaleLineFuer(meta: { grade: number; schoolTypeId: string; stateId: string; gradeScaleThresholds?: number[] }, points: number): string {
  const regel = notenpunkteFuer(meta)
  return regel ? punkteZeile(points, regel.schwellen) : sharedGradeScaleLine(points, meta.gradeScaleThresholds)
}

/**
 * Teile, für die ein Notenschlüssel etwas aussagt.
 *
 * Nur Teile, die über PUNKTE bewertet werden. Bekommt die Schreibkompetenz eine eigene
 * Teilnote – der Regelfall im Fach Englisch in Niedersachsen –, gilt dort kein Punkteschlüssel,
 * sondern eine Beurteilung nach Inhalt und Sprache.
 */
export function gradeScaleGroups(exam: Exam): { label: string; points: number }[] {
  const grades = examGrades(exam)
  if (!exam.meta.separateWritingGrade) {
    const points = grades.reduce((n, g) => n + g.points, 0)
    return points > 0 ? [{ label: '', points }] : []
  }
  return grades.filter((g) => g.group !== 'writing' && g.points > 0).map((g) => ({ label: g.label, points: g.points }))
}
