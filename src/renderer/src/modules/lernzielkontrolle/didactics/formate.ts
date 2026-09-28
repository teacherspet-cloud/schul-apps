/**
 * Der kurze schriftliche Leistungsnachweis – wie ihn die Länder nennen und begrenzen.
 *
 * WARUM DAS EINE EIGENE TABELLE IST: Es gibt kein bundesweites Format „Lernzielkontrolle".
 * Jedes Land hat einen eigenen Begriff, eigene Zeitgrenzen und eigene Regeln dazu, ob der
 * Test angekündigt werden muss. Wer in Bayern „Lernzielkontrolle" auf ein Blatt schreibt,
 * benennt kein Format, das die GSO kennt – dort heißt es Stegreifaufgabe oder Kurzarbeit.
 *
 * DIE FALLE IN NIEDERSACHSEN: Dort ist „schriftliche Lernkontrolle" die KLASSENARBEIT
 * (RdErl. MK v. 01.08.2025, Nr. 6.4/6.5 – drei bis vier pro Jahr, bis zu zwei
 * Unterrichtsstunden). Das Wort darf für einen Kurztest also gerade nicht benutzt werden.
 *
 * BELEGLAGE: Jede Zeile trägt ihre Fundstelle. Was nicht belegt ist, steht als `null` bzw.
 * `'unklar'` da und wird auch so angezeigt – nicht mit einem plausiblen Wert gefüllt.
 * Zwei der Fundstellen sind private Spiegel amtlicher Texte (`landesrecht.online`,
 * `schulgesetz-berlin.de`); sie sind mit `amtlich: false` gekennzeichnet, weil ihr Inhalt
 * zwar konsistent wirkte, aber nicht aus einer amtlichen Verkündung stammt.
 *
 * Recherchestand 23.09.2026.
 */

/** Muss der Test vorher angekündigt werden? */
export type Ankuendigung = 'unangekuendigt' | 'pflicht' | 'unklar'

export interface KurztestFormat {
  /** Kennung, eindeutig über alle Länder */
  id: string
  stateId: string
  /** So heißt das Format im Land – genau dieses Wort gehört auf das Blatt */
  bezeichnung: string
  /** Kurze Erläuterung für die Lehrkraft */
  beschreibung: string
  ankuendigung: Ankuendigung
  /** Frist in Unterrichtstagen, wenn angekündigt werden muss */
  fristTage: number | null
  /** Obergrenze der Bearbeitungszeit in Minuten; null = nicht normiert */
  maxMinuten: number | null
  /** Auf wie viele vorangegangene Unterrichtsstunden sich der Stoff höchstens beziehen darf */
  stoffStunden: number | null
  /** Wie viele solcher Tests zulässig sind – Freitext, weil die Länder es sehr verschieden fassen */
  anzahl: string
  /** Wie die Note zählt */
  gewichtung: string
  /** Vorschrift und Fassung */
  fundstelle: string
  /** Adresse, unter der die Fassung abgerufen wurde */
  url: string
  /** false = privater Spiegel statt amtlicher Verkündung */
  amtlich: boolean
  /** Zusätzliche Bedingungen, die auf dem Blatt oder im Hinweis auftauchen sollen */
  hinweis?: string
}

export const KURZTEST_FORMATE: KurztestFormat[] = [
  {
    id: 'BY-stegreif',
    stateId: 'BY',
    bezeichnung: 'Stegreifaufgabe',
    beschreibung: 'Der unangekündigte Kurztest („Ex"). Zählt zu den kleinen Leistungsnachweisen.',
    ankuendigung: 'unangekuendigt',
    fristTage: null,
    maxMinuten: 20,
    stoffStunden: 2,
    anzahl: 'Zahl und Terminierung liegen im pädagogischen Ermessen der Lehrkraft (§ 21 Abs. 2 S. 8).',
    gewichtung: 'Eigene Gesamtnote „kleine Leistungsnachweise"; zu den großen 1:1 bei zwei Schulaufgaben, sonst 2:1.',
    fundstelle: 'GSO §§ 21, 23 Abs. 2, 25–28, Fassung gültig ab 01.08.2026',
    url: 'https://www.gesetze-bayern.de/Content/Document/BayGSO-23',
    amtlich: true,
    hinweis: 'Bei der unangekündigten Stegreifaufgabe besteht kein Anspruch auf einen Nachtermin (§ 27 Abs. 1 S. 3: „kann").'
  },
  {
    id: 'BY-kurzarbeit',
    stateId: 'BY',
    bezeichnung: 'Kurzarbeit',
    beschreibung: 'Der angekündigte Kurztest. Umfangreicher als die Stegreifaufgabe.',
    ankuendigung: 'pflicht',
    fristTage: 7,
    maxMinuten: 30,
    stoffStunden: 10,
    anzahl: 'Im pädagogischen Ermessen der Lehrkraft (§ 21 Abs. 2 S. 8).',
    gewichtung: 'wie die Stegreifaufgabe ein kleiner Leistungsnachweis',
    fundstelle: 'GSO §§ 21, 23 Abs. 2, Fassung gültig ab 01.08.2026',
    url: 'https://www.gesetze-bayern.de/Content/Document/BayGSO-23',
    amtlich: true
  },
  {
    id: 'BW-wiederholung',
    stateId: 'BW',
    bezeichnung: 'Schriftliche Wiederholungsarbeit',
    beschreibung: 'Kurze Wiederholung des unmittelbar vorangegangenen Unterrichts.',
    ankuendigung: 'unangekuendigt',
    fristTage: null,
    maxMinuten: 20,
    stoffStunden: null,
    anzahl: 'In Fächern ohne Klassenarbeiten höchstens vier schriftliche Arbeiten im Schuljahr (§ 9 Abs. 4).',
    gewichtung: 'gehört zu den schriftlichen Leistungen; die Gewichtung legt die Fachlehrkraft fest und gibt sie zu Unterrichtsbeginn bekannt.',
    fundstelle: 'NVO § 8 Abs. 2, § 9 Abs. 4 (Fassung Stand 01.01.2017)',
    url: 'https://smv-bw.de/rechte/Anhang/Notenbildung.pdf',
    amtlich: false,
    hinweis: 'Die abgerufene Fassung ist von 2017. Vor dem Verlassen auf die Zahlen die geltende Fassung prüfen.'
  },
  {
    id: 'NW-uebung',
    stateId: 'NW',
    bezeichnung: 'Kurze schriftliche Übung',
    beschreibung: 'In der APO-S I nur als „gelegentliche kurze schriftliche Übungen in allen Fächern" erwähnt.',
    ankuendigung: 'unklar',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'nicht geregelt („gelegentlich")',
    gewichtung: 'zählt zum Beurteilungsbereich „Sonstige Leistungen"; beide Bereiche werden angemessen berücksichtigt (§ 6 Abs. 3).',
    fundstelle: 'APO-S I § 6 Abs. 2 und 3, Fassung 01.08.2025 (BASS 13-21 Nr. 1.1)',
    url: 'https://www.landesrecht.online/NW/APO-S_I/6',
    amtlich: false,
    hinweis: 'Dauer und Anzahl sind in NRW nicht normiert. Die Zeitgrenzen anderer Länder sind hier nur ein Anhaltspunkt.'
  },
  {
    id: 'HE-lernkontrolle',
    stateId: 'HE',
    bezeichnung: 'Lernkontrolle',
    beschreibung: 'Nur in Fächern OHNE Klassen- oder Kursarbeit zulässig.',
    ankuendigung: 'pflicht',
    fristTage: 5,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'Je Fach und Halbjahr eine; nicht in den letzten zwei Wochen vor der Zeugnisausgabe (Anlage 2 Nr. 7 d).',
    gewichtung: 'schriftliche Arbeiten machen etwa ein Drittel der Beurteilung aus, wo es keine Klassenarbeiten gibt (§ 32 Abs. 3).',
    fundstelle: 'VOGSV §§ 32, 33 und Anlage 2, v. 19.08.2011',
    url: 'https://sts-ghrf-kassel.bildung.hessen.de/service/an_Schule/vogsv.pdf',
    amtlich: true,
    hinweis:
      'Hessen kennt daneben die „Übungsarbeit" (§ 32 Abs. 2 Nr. 3): eine schriftliche Übung, die der individuellen Kenntnisfeststellung dient und NICHT Grundlage der Leistungsbeurteilung ist. Das ist die rechtlich saubere Form eines unbenoteten Tests.'
  },
  {
    id: 'RP-ueberpruefung',
    stateId: 'RP',
    bezeichnung: 'Schriftliche Überprüfung',
    beschreibung: 'In Fächern MIT Klassen- oder Kursarbeiten ausdrücklich unzulässig (§ 52 Abs. 4).',
    ankuendigung: 'pflicht',
    fristTage: 7,
    maxMinuten: 30,
    stoffStunden: 10,
    anzahl: 'Eine je Schulhalbjahr; höchstens drei in einer Kalenderwoche, höchstens eine am Tag.',
    gewichtung: 'dient der individuellen Leistungsfeststellung und Leistungsbeurteilung (§ 52 Abs. 1); Quote nicht normiert.',
    fundstelle: 'Übergreifende Schulordnung § 52 Abs. 1, 4–8, Fassung 01.07.2025',
    url: 'https://www.landesrecht.online/RP/SchulO/52',
    amtlich: false,
    hinweis: 'Nicht in den letzten vier Wochen vor der Zeugniskonferenz und nicht in der ersten Fachstunde nach den Ferien.'
  },
  {
    id: 'BE-kurzkontrolle',
    stateId: 'BE',
    bezeichnung: 'Kurzkontrolle',
    beschreibung: 'Kann schriftlich, mündlich oder praktisch sein.',
    ankuendigung: 'unangekuendigt',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'Mindestens einmal je Schulhalbjahr in allen Fächern (§ 19 Abs. 4); Anzahl und Umfang beschließt die Fachkonferenz.',
    gewichtung: 'schriftliche Kurzkontrollen zählen zu den schriftlichen Leistungen (§ 19 Abs. 2 Nr. 1).',
    fundstelle: 'Sek I-VO § 19 Abs. 2–7',
    url: 'https://schulgesetz-berlin.de/sek-i-vo/gesamtansicht.php',
    amtlich: false,
    hinweis:
      'Berlin verlangt für ALLE schriftlichen Lernerfolgskontrollen „förderliche Hinweise für die weitere Lernentwicklung" (§ 19 Abs. 6 S. 4). Ein Notenspiegel ist dagegen nur bei Klassenarbeiten Pflicht (§ 19 Abs. 7).'
  },
  {
    id: 'BB-lernerfolg',
    stateId: 'BB',
    bezeichnung: 'Schriftliche Lernerfolgskontrolle',
    beschreibung: 'Über „geringere Dauer und geringeren Umfang" als die schriftliche Arbeit definiert.',
    ankuendigung: 'unangekuendigt',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'nicht normiert',
    gewichtung: 'zählt NICHT zum Bereich „schriftliche Arbeiten"; dessen Anteil beträgt in Jg. 3/4 20 %, Jg. 5/6 30 %, Sek I 25 %.',
    fundstelle: 'VV-Leistungsbewertung §§ 8, 9, v. 21.07.2011, zul. geänd. 18.08.2025',
    url: 'https://bravors.brandenburg.de/verwaltungsvorschriften/vv_leistungsbewertung',
    amtlich: true,
    hinweis: 'Jg. 1/2 in der Regel 10–15 Minuten; erste Fremdsprache Ende Jg. 3: 20 Minuten. Vorher sind „hinreichend Übungsphasen vorzusehen".'
  },
  {
    id: 'MV-lernerfolg',
    stateId: 'MV',
    bezeichnung: 'Schriftliche Lernerfolgskontrolle',
    beschreibung: 'Über „geringeren Umfang und geringere Komplexität" als die Klassenarbeit definiert.',
    ankuendigung: 'pflicht',
    fristTage: 3,
    maxMinuten: 30,
    stoffStunden: null,
    anzahl: 'Höchstens zwei am Unterrichtstag, und nur an Tagen ohne Klassenarbeit (§ 5 Abs. 2).',
    gewichtung: 'zählt zu den sonstigen Leistungen neben den Klassenarbeiten.',
    fundstelle: 'LeistBewVO §§ 3–5, 8, Fassung 01.08.2026',
    url: 'https://www.landesrecht.online/MV/LeistBewVO/8',
    amtlich: false,
    hinweis:
      'Rückgabe in der Regel binnen zwei Wochen, „auf der Grundlage lernförderlicher Rückmeldungen" (§ 8 Abs. 3). Als einziges Land hat MV einen verbindlichen Prozentschlüssel (§ 4 Abs. 3) – für Lernerfolgskontrollen gilt er nach Abs. 4 nur „als Orientierung".'
  },
  {
    id: 'SN-kurzkontrolle',
    stateId: 'SN',
    bezeichnung: 'Kurzkontrolle',
    beschreibung: 'Eigene Kategorie neben Klassenarbeiten und sonstigen Leistungen.',
    ankuendigung: 'unklar',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'Die Anzahl bestimmt die Fachlehrkraft (§ 19 Abs. 3).',
    gewichtung: 'eigene Kategorie (§ 19 Abs. 1)',
    fundstelle: 'Schulordnung Grundschulen § 19, v. 03.08.2004, zul. geänd. 22.06.2021',
    url: 'https://www.revosax.sachsen.de/vorschrift/3886-Schulordnung-Grundschulen',
    amtlich: true,
    hinweis: 'Belegt ist nur die GRUNDSCHULordnung. Für Oberschule und Gymnasium (SOOS/SOGYA) wurde die Regelung nicht ermittelt.'
  },
  {
    id: 'NI-keins',
    stateId: 'NI',
    bezeichnung: 'Kurze schriftliche Überprüfung',
    beschreibung: 'Niedersachsen kennt kein eigenes Kurztestformat. Kurze Überprüfungen fallen unter die „fachspezifischen Lernkontrollen".',
    ankuendigung: 'unklar',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'nicht normiert; bewertete schriftliche Arbeiten höchstens drei je Kalenderwoche und eine am Tag.',
    gewichtung: 'mündliche und fachspezifische Lernkontrollen haben „in allen Fächern eine große Bedeutung" (Nr. 6.3).',
    fundstelle: 'RdErl. MK v. 01.08.2025, 33-81011, Nr. 6.1–6.9; RdErl. v. 22.03.2012, 33-83201',
    url: 'https://www.schure.de/22410/33-81011.htm',
    amtlich: true,
    hinweis:
      'ACHTUNG: In Niedersachsen heißt „schriftliche Lernkontrolle" die KLASSENARBEIT. Dieses Wort darf für einen Kurztest nicht verwendet werden. Bewertete schriftliche Arbeiten sind „in der Regel einige Tage vor der Anfertigung anzukündigen".'
  },
  {
    id: 'TH-offen',
    stateId: 'TH',
    bezeichnung: 'Leistungsnachweis',
    beschreibung: 'Die Schulordnung kennt keine eigene Kategorie; nähere Festlegungen treffen die Lehrpläne.',
    ankuendigung: 'unklar',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'nicht normiert',
    gewichtung: 'richtet sich „nach den Erfordernissen" (§ 58 Abs. 1)',
    fundstelle: 'ThürSchulO § 58, gültig ab 01.08.2021',
    url: 'https://www.schulportal-thueringen.de/services/resources/download/public/1671629/thueringer_schulordnung.pdf',
    amtlich: true,
    hinweis: 'Thüringen verweist auf die Lehrpläne. Die App kann hier keine Zeitgrenze nennen.'
  },
  /*
   * HH, HB, SH, SL, ST – recherchiert am 28.09.2026 (recherche/lzk/formate-HH-HB-SH-SL-ST.md mit
   * Zitaten). Nur Belegtes; was ein Land nicht regelt, steht als null bzw. „nicht normiert".
   * Achtung Saarland: „Schriftliche Überprüfung" ist dort ein GROSSER Leistungsnachweis.
   */
  {
    id: 'HH-leistungsfeststellung',
    stateId: 'HH',
    bezeichnung: 'Bewertete Leistungsfeststellung',
    beschreibung:
      'Hamburg kennt kein eigenes Kurztestformat. Bewertete Leistungsfeststellungen gehören zur laufenden Unterrichtsarbeit und dürfen unangekündigt sein.',
    ankuendigung: 'unangekuendigt',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'nicht normiert (in Latein/Griechisch „regelmäßig", Bildungsplan Teil C Nr. 7 a)',
    gewichtung:
      'zählt zur laufenden Unterrichtsarbeit; die Zeugnisnote darf sich nicht überwiegend auf Klassenarbeiten stützen (Mathematik: Klassenarbeiten 50 %). Das Verhältnis legen die Konferenzen fest.',
    fundstelle: 'Bildungsplan Gymnasium Sek I / Stadtteilschule 5–11, Teil C Leistungsbewertung (BSB 2024), Nr. 2, 3 b, 4',
    url: 'https://dokumente.hamburg.de/resource/blob/798488/251acd87545f55fad72fc95d6402821c/teil-c-leistungsbewertung-data.pdf',
    amtlich: true,
    hinweis:
      'Dauer, Stoffumfang und Anzahl sind in Hamburg nicht normiert. Die APO-GrundStGy (§ 5) nennt „schriftliche Lernerfolgskontrolle" nur allgemein, ohne Regeln.'
  },
  {
    id: 'HB-kurzarbeit-unangekuendigt',
    stateId: 'HB',
    bezeichnung: 'Kurzarbeit',
    beschreibung: 'Nicht angekündigte Kurzarbeit. In allen Fächern zulässig, „soweit eine selbständige, kurze schriftliche Darstellung sinnvoll ist".',
    ankuendigung: 'unangekuendigt',
    fristTage: null,
    maxMinuten: 30,
    stoffStunden: null,
    anzahl:
      'Je Schulhalbjahr neben den Klassenarbeiten: Mathematik und Fremdsprachen bis zu 2, Deutsch bis zu 3 (einschließlich Diktaten), übrige Fächer bis zu 4 (Nr. 2.2).',
    gewichtung: 'nicht geregelt; jede Arbeit erhält eine Note (Nr. 4.2).',
    fundstelle:
      'Richtlinie 331.01 „Schriftliche Arbeiten im Unterricht der allgemeinbildenden Schulen in den Jahrgangsstufen 5 bis 10" v. 29.10.1982, Nr. 1.2, 2.2, 3',
    url: 'https://bildung.bremen.de/sixcms/media.php/13/331.01%2B-%2BSchriftliche%2BArbeiten%2Bim%2BUnterricht%2Bder%2Ballgemeinb.pdf',
    amtlich: true,
    hinweis:
      'Stoff: etwa die letzten zwei Unterrichtswochen. Die Richtlinie ist von 1982, steht aber seit 2021 im Transparenzportal Bremen. Nicht gewertet wird, wenn mehr als ein Drittel „mangelhaft" oder „ungenügend" ist (Nr. 4.4).'
  },
  {
    id: 'HB-kurzarbeit-angekuendigt',
    stateId: 'HB',
    bezeichnung: 'Kurzarbeit',
    beschreibung: 'Angekündigte Kurzarbeit. Zählt zu den angekündigten Arbeiten (höchstens eine pro Tag, drei pro Woche).',
    ankuendigung: 'pflicht',
    fristTage: null,
    maxMinuten: 30,
    stoffStunden: null,
    anzahl: 'wie die nicht angekündigte Kurzarbeit (gemeinsames Kontingent, Nr. 2.2)',
    gewichtung: 'nicht geregelt; jede Arbeit erhält eine Note (Nr. 4.2).',
    fundstelle: 'Richtlinie 331.01 v. 29.10.1982, Nr. 1.2, 2.2, 3',
    url: 'https://bildung.bremen.de/sixcms/media.php/13/331.01%2B-%2BSchriftliche%2BArbeiten%2Bim%2BUnterricht%2Bder%2Ballgemeinb.pdf',
    amtlich: true,
    hinweis: 'Stoff: nur die letzten vier Unterrichtswochen. Eine Ankündigungsfrist nennt die Richtlinie nicht.'
  },
  {
    id: 'SH-test',
    stateId: 'SH',
    bezeichnung: 'Test',
    beschreibung:
      'Schriftliche Leistungsüberprüfung bis 20 Minuten zum unmittelbaren Unterrichtszusammenhang. Kein Leistungsnachweis, sondern Teil der Unterrichtsbeiträge.',
    ankuendigung: 'unklar',
    fristTage: null,
    maxMinuten: 20,
    stoffStunden: null,
    anzahl: 'nicht normiert',
    gewichtung:
      'fließt in die Note für Unterrichtsbeiträge ein; diese haben ein stärkeres Gewicht als die Leistungsnachweise (Oberstufe: geben den Ausschlag).',
    fundstelle:
      'Erlass „Leistungsnachweise in der Sekundarstufe I" v. 04.06.2025, Nr. 1 a, 2; Erlass Oberstufe v. 23.06.2021 i. d. F. v. 11.04.2026, Nr. II.1–2',
    url: 'https://www.schleswig-holstein.de/DE/fachinhalte/S/schulrecht/Downloads/Erlasse/Downloads/Leistungsnachweise_Sek_I.pdf?__blob=publicationFile&v=1',
    amtlich: true,
    hinweis:
      'Wer länger als 20 Minuten schreiben lässt oder über den unmittelbaren Unterrichtszusammenhang hinausgeht, schreibt keinen Test mehr, sondern einen Leistungsnachweis, und der zählt auf das vorgeschriebene Kontingent. Der Erlass Sek I gilt bis 31.07.2030.'
  },
  {
    id: 'SL-kleiner-lnw',
    stateId: 'SL',
    bezeichnung: 'Kleiner Leistungsnachweis',
    beschreibung: 'In Umfang und Komplexität kleiner als der große Leistungsnachweis; in allen Fächern möglich.',
    ankuendigung: 'unangekuendigt',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl:
      'Die Lehrkraft entscheidet fachbezogen in pädagogischer Verantwortung (Nr. 3.2.3); die Tages- und Wochengrenzen für große Leistungsnachweise gelten nicht (Nr. 3.4.1).',
    gewichtung:
      'geht in die Gesamtnote „sonstige Leistungen" ein; diese zählt in schriftlichen Fächern etwa gleich wie die einzelnen Noten der großen Leistungsnachweise (Nr. 3.4.5).',
    fundstelle: 'Erlass zur Leistungsbewertung in den Schulen des Saarlandes v. 09.07.2024 (Amtsbl. I S. 506), Nr. 3.2.3, 3.4.1, 3.4.4, 3.4.5',
    url: 'https://www.amtsblatt.saarland.de',
    amtlich: true,
    hinweis:
      'Bewertungskriterien vorher erläutern; Bewertung spätestens zwei Schulwochen danach bekannt geben, Eltern bestätigen per Unterschrift (Nr. 3.4.4). Stoff: „überschaubare, in sich zusammenhängende Unterrichtseinheit". Eine Minutengrenze nennt der Erlass für die Sek I nicht.'
  },
  {
    id: 'SL-schriftliche-ueberpruefung',
    stateId: 'SL',
    bezeichnung: 'Schriftliche Überprüfung',
    beschreibung:
      'ACHTUNG: Im Saarland ein GROSSER Leistungsnachweis, und zwar nur in nicht schriftlichen Fächern (Gymnasium Kl. 8–10, GemS/FöS Kl. 9–10). Kein Kurztest.',
    ankuendigung: 'pflicht',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: 6,
    anzahl: 'ein großer Leistungsnachweis je Halbjahr (Fächer ab zwei Wochenstunden) bzw. je Schuljahr (einstündige Fächer) (Nr. 3.1).',
    gewichtung: 'großer Leistungsnachweis; in nicht schriftlichen Fächern etwa gleich gewichtet mit der Gesamtnote „sonstige Leistungen" (Nr. 3.4.5).',
    fundstelle: 'Erlass zur Leistungsbewertung in den Schulen des Saarlandes v. 09.07.2024 (Amtsbl. I S. 506), Nr. 3.1, 3.1.2.1, 3.4.1',
    url: 'https://www.amtsblatt.saarland.de',
    amtlich: true,
    hinweis:
      'Ankündigung spätestens sieben KALENDERtage vorher (Nr. 3.4.1). Bearbeitungszeit „in der Regel" höchstens eine Unterrichtsstunde. Vor der Rückgabe mindestens drei Arbeiten der Schulleitung vorlegen (Nr. 3.4.3).'
  },
  {
    id: 'ST-lernerfolgskontrolle',
    stateId: 'ST',
    bezeichnung: 'Schriftliche Lernerfolgskontrolle',
    beschreibung: 'Oberbegriff für Diktate, Vokabelkontrollen und Tests unter den „weiteren Formen" neben den Klassenarbeiten.',
    ankuendigung: 'unklar',
    fristTage: null,
    maxMinuten: null,
    stoffStunden: null,
    anzahl: 'nicht normiert',
    gewichtung:
      'Klassenarbeiten zählen zusammen 25–40 % (Fremdsprachen bei nur einer Klassenarbeit höchstens 20 %); die weiteren Formen bilden den übrigen Anteil (Nr. 4.1.9).',
    fundstelle:
      'RdErl. des MK v. 26.06.2012 – 2-83200 „Leistungsbewertung und Beurteilung an allgemeinbildenden Schulen … Sek I und II", Nr. 2.2, 4.1.9, 4.2.1',
    url: 'https://www.landesrecht.sachsen-anhalt.de/perma?j=VVST-223110-MK-20120626-SF',
    amtlich: true,
    hinweis:
      'Die Ankündigungspflicht von einer Woche (Nr. 4.1.2) gilt nur für Klassenarbeiten und Klausuren. Formen und Gewichtung sind den Schülerinnen und Schülern vorab mitzuteilen, zu allen Formen gibt es eine qualifizierte Rückmeldung (Nr. 2.2). Wortlaut aus der LISA-Fassung mit dem Hinweis, dass nur der Text im SVBl. LSA verbindlich ist.'
  }
]

/** Länder, für die gar nichts ermittelt werden konnte – die App sagt das offen. Seit 28.09.2026 keins mehr. */
export const NICHT_ERMITTELT: string[] = []

export const formateFuer = (stateId: string): KurztestFormat[] => KURZTEST_FORMATE.filter((f) => f.stateId === stateId)

export const formatById = (id: string): KurztestFormat | undefined => KURZTEST_FORMATE.find((f) => f.id === id)

/**
 * Das voreingestellte Format eines Landes.
 * Wo es zwei gibt (Bayern), ist das kürzere, unangekündigte der Regelfall.
 */
export function standardFormat(stateId: string): KurztestFormat | undefined {
  const alle = formateFuer(stateId)
  if (!alle.length) return undefined
  return alle.find((f) => f.ankuendigung === 'unangekuendigt') ?? alle[0]
}

/**
 * Voreingestellte Bearbeitungszeit.
 *
 * 20 Minuten als Grundwert: Das ist die Obergrenze in Bayern und Baden-Württemberg und
 * liegt innerhalb aller übrigen belegten Grenzen. Wo ein Land eine kleinere Grenze hat,
 * gilt die.
 */
export function standardMinuten(format?: KurztestFormat): number {
  if (!format?.maxMinuten) return 20
  return Math.min(20, format.maxMinuten)
}

export interface Zeitwarnung {
  /** true = die belegte Obergrenze des Landes ist überschritten */
  ueberschritten: boolean
  message: string
}

/**
 * Prüft die eingestellte Bearbeitungszeit gegen die Landesgrenze.
 *
 * Entscheidung der Lehrkraft (23.09.2026): warnen, nicht blockieren. Die Grenzen sind nur
 * für fünf Länder belegt, und die Lehrkraft kennt ihre Schule besser als eine Tabelle.
 */
export function zeitWarnung(minuten: number, format?: KurztestFormat): Zeitwarnung | null {
  if (!format) return null
  if (!format.maxMinuten) {
    return {
      ueberschritten: false,
      message: `Für ${format.bezeichnung} ist keine Höchstdauer normiert (${format.fundstelle}). Die belegten Grenzen anderer Länder liegen bei 20 bis 30 Minuten.`
    }
  }
  if (minuten <= format.maxMinuten) return null
  return {
    ueberschritten: true,
    message: `${minuten} Minuten überschreiten die Höchstdauer für ${format.bezeichnung}: ${format.maxMinuten} Minuten (${format.fundstelle}).`
  }
}

/**
 * Schätzt, wie lange ein Test mit dieser Aufgabenzahl dauert.
 *
 * Kalibriert an echten bayerischen Stegreifaufgaben: GM_STA003 hat 4 Teilaufgaben,
 * GM_STA005 hat 9 – beide für 20 Minuten. Das ergibt grob 2 bis 5 Minuten je Teilaufgabe,
 * je nachdem, ob nur ein Ergebnis oder ein Rechenweg verlangt ist. Die Schätzung ist eine
 * Faustregel aus zwei Vorlagen, keine belegte Norm – deshalb wird sie auch so benannt.
 */
export function geschaetzteMinuten(teilaufgaben: number, mitLoesungsweg: boolean): number {
  return Math.round(teilaufgaben * (mitLoesungsweg ? 3.5 : 2))
}
