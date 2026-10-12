/**
 * Förder- und Fordermaterial (12.10.2026, Wunsch der Lehrkraft: Knopf „Förder- und Fordermaterial erstellen" in
 * „Meine Klassen"). EINE didaktische Quelle für alle Fächer: je Fach (Kennungen aus shared/faecher.ts, Fächergruppe als
 * Rückfall) Förderbedarfe, Förder- und Forderformate, Jahrgangsbänder (GS 1–4, 5/6, 7/8, 9/10, Sek II) mit Stolpersteinen,
 * belegte Länder-/Schulform-Abweichungen und Wettbewerbe (nur belegte, mit Altersgrenzen).
 *
 * Grundlage sind die vier Rechercheberichte vom 12.10.2026 (recherche/foerdern-2026-10-12/ergebnis-sprachen.md,
 * ergebnis-gesellschaft.md, ergebnis-mint.md, ergebnis-rahmen-aesthetik.md). Jede Regel trägt ihre Kennung:
 *  - 'belegt'     – die Quelle sagt es (Quellenkürzel in `q`, Liste in QUELLEN);
 *  - 'faustregel' – fachdidaktischer Konsens/Ableitung ohne eigene Primärquelle: für die KI eine Empfehlung, keine Vorschrift;
 *  - 'lehrkraft'  – Festlegung der Lehrkraft (z. B. Geschichte „zusammenfassen"/„beurteilen", fester Blattaufbau).
 * Quellenkürzel: S-… Sprachen (Q-Nummern des Berichts), G-… Gesellschaft, M-… MINT, R-… Rahmen/Ästhetik.
 *
 * Entscheidungen der Lehrkraft (12.10.2026), hier verankert: getrennte Blätter (Förderblatt = Basis + gestufte Hilfen
 * Impuls → Strategie → Teillösung, Lösungsbeispiel mit Ausblenden; Forderblatt = „komplexer statt mehr", KEINE
 * Lösungsbeispiele), oben „Dein Ziel" (1 Satz aus dem Befund), 15–30 Minuten, KEINE Selbsteinschätzung am Ende (abgewählt,
 * obwohl Niedersachsen die Einschätzung durch Lernende in der Lernentwicklungsdokumentation vorsieht – R-NI), gleiche
 * Gestaltung, neutrale Titel, Niveau dezent; Forderblätter nennen passende Wettbewerbe als Ausblick (Aufgaben nur „im Stil
 * von", nie Originale – Urheberrecht, M-10). Politik/Religion/Ethik: Beutelsbacher Konsens immer (G-6).
 * Nachteilsausgleich ist KEINE inhaltliche Absenkung (R-MV, R-HE): nur Darstellung (Schrift, Zeit, Vorlesen), Niveau bleibt;
 * an die KI geht nur die Maßnahme, nie eine Diagnose (rueckmeldung/nachteilsausgleich.ts).
 */
import { fachVon, type FachArt } from '@shared/faecher'
import { geschichtsStufe, hilfenFuer, STUFEN_NAME } from '@shared/operatoren/geschichteSchreibformen'

export type Kennung = 'belegt' | 'faustregel' | 'lehrkraft'
export interface Regel {
  t: string
  k: Kennung
  /** Quellenkürzel (QUELLEN) */
  q?: string
}
export type Band = 'gs' | '56' | '78' | '910' | 'sek2'
export const BAND_NAME: Record<Band, string> = { gs: 'Grundschule 1–4', '56': 'Klasse 5/6', '78': 'Klasse 7/8', '910': 'Klasse 9/10', sek2: 'Sek II' }

export interface BandRegeln {
  foerder: Regel[]
  forder: Regel[]
  stolpersteine: Regel[]
}
export interface Bedarf {
  id: string
  label: string
  k: Kennung
  q?: string
}
export interface Wettbewerb {
  name: string
  /** Jahrgang von/bis (einschließlich) */
  ab?: number
  bis?: number
  /** Altersgrenze in Jahren (höchstens) */
  alterBis?: number
  hinweis: string
  q: string
}
export interface LandRegel {
  laender: string[]
  /** Schulform-Kennungen (shared/schulformen.ts); fehlt = alle */
  schulformen?: string[]
  regel: Regel
}
export interface FachRegeln {
  bedarfe: Bedarf[]
  foerderformate: Regel[]
  forderformate: Regel[]
  baender: Partial<Record<Band, BandRegeln>>
  laender?: LandRegel[]
  wettbewerbe?: Wettbewerb[]
  /** Regeln, die immer gelten (Beutelsbacher Konsens, Bekenntnisneutralität, keine Gesundheitsdaten …) */
  leitplanken?: Regel[]
}

const B = (t: string, q?: string): Regel => ({ t, k: 'belegt', ...(q ? { q } : {}) })
const F = (t: string, q?: string): Regel => ({ t, k: 'faustregel', ...(q ? { q } : {}) })
const L = (t: string): Regel => ({ t, k: 'lehrkraft' })
const bed = (id: string, label: string, k: Kennung = 'faustregel', q?: string): Bedarf => ({ id, label, k, ...(q ? { q } : {}) })
const band = (foerder: Regel[], forder: Regel[], stolpersteine: Regel[]): BandRegeln => ({ foerder, forder, stolpersteine })

/** Quellen (Kürzel → Kurzangabe); Volltexte und Adressen in den Berichten unter recherche/foerdern-2026-10-12/ */
export const QUELLEN: Record<string, string> = {
  'S-Q1': 'KMK, Förderstrategie für leistungsschwächere Schülerinnen und Schüler (04.03.2010)',
  'S-Q2': 'KMK, Förderstrategie für leistungsstarke Schülerinnen und Schüler (11.06.2015)',
  'S-Q3': 'KMK-Bildungsstandards (Deutsch 2022, 1. Fremdsprache 2023, fortgeführte Fremdsprache AHR 2012)',
  'S-Q4': 'KMK, Bildungssprachliche Kompetenzen stärken (05.12.2019)',
  'S-Q5': 'IQB-Bildungstrend 2022 (KMK-Pressemitteilung)',
  'S-Q6': 'Bundeswettbewerb Fremdsprachen 2026/27, SOLO/SOLO PLUS (Flyer Sachsen-Anhalt)',
  'S-Q7': 'Bayerisches Kultusministerium zum Bundeswettbewerb Fremdsprachen (TEAM Schule)',
  'S-Q8': 'Certamen Carolinum NRW (Landeswettbewerb Alte Sprachen)',
  'S-Q9': 'Landeswettbewerb Alte Sprachen Bayern; Pegalogos (Schulseite)',
  'S-Q10': 'Mercator-Institut, Basiswissen Scaffolding; Kniffka/Gibbons (FörMig)',
  'S-Q11': 'Lautlesetandem (Bildungsserver)',
  'S-Q12': 'Berlin-Brandenburg, Leseflüssigkeit Trainingspaket B',
  'S-Q13': 'Goethe-Institut zur Mediation im GER-Begleitband 2020',
  'S-Q14': 'SchulG NRW § 1, APO-SI NRW',
  'S-Q14b': 'Schulministerium NRW, Gesamtschule: Fachleistungsdifferenzierung',
  'S-Q15': 'NRW, LRS-Erlass (BASS 14-01 Nr. 1)',
  'S-Q16': 'NRW, Herkunftssprachlicher Unterricht (BASS 13-61 Nr. 2)',
  'S-Q17': 'Niedersachsen, Dokumentation der individuellen Lernentwicklung',
  'S-Q18': 'Niedersachsen, Erlass Schwierigkeiten im Lesen, Rechtschreiben, Rechnen (2005)',
  'S-Q19': 'Niedersachsen, Erlass nichtdeutsche Herkunftssprache (2014)',
  'S-Q21': 'Niedersachsen, Oberschule (G/E/Z-Kurse)',
  'S-Q22': 'Niedersachsen, KC Englisch Sek I (Landtagsfassung 2026) und GO',
  'S-Q23': 'Bayern, § 34 BaySchO (Notenschutz)',
  'S-Q24': 'Bayern, LehrplanPLUS DaZ, Deutschklassen',
  'S-Q25': 'Bayern, LehrplanPLUS Latein',
  'S-Q26': 'Bayern, LehrplanPLUS Griechisch',
  'S-Q27': 'Bayern, ISB Individuelle Lernzeit',
  'S-Q28': 'Bayern, LehrplanPLUS Förderschule',
  'S-Q29': 'Hamburg, § 45 HmbSG Lernförderung',
  'S-Q30': 'Hessen, VOGSV §§ 37–44',
  'S-Q32': 'Pegasus-Onlinezeitschrift (Wortschatzabdeckung der Lektüre)',
  'S-Q34': 'Landesinstitut BW, Englisch an Gemeinschaftsschulen (Niveaus G/M/E)',
  'G-1': 'Niedersachsen, KC Geschichte Gymnasium 5–10 (Anhörfassung 2014)',
  'G-2': 'Studienseminar Koblenz, Urteilskompetenz (nach Bergmann, Weymar, Körber)',
  'G-3': 'Niedersachsen, KC Geschichte gymnasiale Oberstufe 2017',
  'G-5': 'Baden-Württemberg, Bildungsplan 2016 Sek I Gemeinschaftskunde',
  'G-6': 'Beutelsbacher Konsens (LpB BW, Bildungsserver Berlin-Brandenburg)',
  'G-7': 'Bormuth/Körber/Seidl, Inklusiver Geschichtsunterricht (2018)',
  'G-8': 'Handro/Kilimann, Sprachsensibler Geschichtsunterricht (2020)',
  'G-9': 'DGfG, Bildungsstandards Geographie MSA (2020)',
  'G-9b': 'DGfG, Bildungsstandards Geographie AHR (2024)',
  'G-10': 'Uni Münster, Geographiedidaktik (Kartenkompetenz, Maßstab Kl. 6)',
  'G-11': 'bpb/APuZ, Standards für die politische Bildung (GPJE)',
  'G-12': 'Retzmann, Kompetenzen der ökonomischen Bildung',
  'G-13': 'NRW, KLP Gesellschaftslehre Gesamtschule 2020',
  'G-14': 'GDSU-Perspektivrahmen Sachunterricht (2013)',
  'G-15': 'Geschichtswettbewerb des Bundespräsidenten 2026/27',
  'G-16': 'bpb, Schülerwettbewerb zur politischen Bildung 2026',
  'G-17': 'Diercke WISSEN (FAQ)',
  'G-18': 'KGD 2022/2024 (Kritik am Sach-/Werturteil-Schema)',
  'G-19': 'FUER-Modell (Niveaus basal – intermediär – elaboriert)',
  'G-22': 'Niedersachsen, KC Politik-Wirtschaft',
  'G-23': 'Niedersachsen, KC Gesellschaftslehre IGS 5–10',
  'G-25': 'Martens, Fünf-Finger-Methode',
  'G-26': 'Prozessbezogene Kompetenzbereiche Ev. Religion (Niedersachsen, Schulseite)',
  'G-28': 'Niedersachsen, KC Werte und Normen',
  'G-29': 'Dilemmadiskussion (Kohlberg; Konstanzer Methode nach Lind)',
  'G-30': 'NRW, KLP Erziehungswissenschaft GOSt',
  'M-1': 'Mathe sicher können (DZLM/TU Dortmund)',
  'M-2': 'Gestufte Lernhilfen (Leisen, Stäudel; Uni Kassel, Uni Bremen)',
  'M-3': 'Blütenaufgaben (Bruder u. a.)',
  'M-4': 'Rechenschwierigkeiten (Uni Bayreuth u. a.)',
  'M-5': 'Grundvorstellungen und Brüche (Prediger; MSK D4)',
  'M-6': 'PIKAS, leistungsstarke Lernende',
  'M-7': 'Klingbeil u. a., Variablen (GDM 2024)',
  'M-8': 'MSK Baustein S3 Textaufgaben; PIKAS 7.4',
  'M-9': 'Hammer, Modellieren (Blum/Leiß)',
  'M-10': 'Grundvorstellungen der Ableitung (Greefrath u. a.)',
  'M-11': 'KMK-Bildungsstandards Mathematik ESA/MSA 2022',
  'M-12': 'Niedersachsen, Erlass Die Arbeit in der Oberschule (SVBl 7/2017)',
  'M-13': 'Niedersachsen, Erlass Schuljahrgänge 5–10 der IGS (Stand 01.08.2026)',
  'M-14': 'IQB-Kompetenzstufenmodelle; KMK AHR Naturwissenschaften 2020',
  'M-15': 'Niedersachsen, KC Naturwissenschaften Haupt-/Realschule (2015)',
  'M-16': 'Schülervorstellungen Chemie/Physik (Teilchenmodell, Streller 2019, Schecker)',
  'M-17': 'Baden-Württemberg, BNT-Auflösung und neue Bildungspläne',
  'M-18': 'Bayern, LehrplanPLUS Natur und Technik',
  'M-19': 'Schülervorstellungen Biologie (Johannsen/Krüger 2005; Schramm/Schmiemann 2019)',
  'M-20': 'Renkl/Schworm, Lösungsbeispiele; Expertise-Umkehr-Effekt',
  'M-21': 'Leisen, sprachsensibler Fachunterricht; Diagramme',
  'M-22': 'MAKOS-Checkliste; Kompetenzraster Mathematik BW',
  'M-24': 'Mathematik-Olympiade; Känguru der Mathematik',
  'M-25': 'Jugend forscht / Schüler experimentieren, Teilnahmebedingungen',
  'M-26': 'IJSO (Junior Science Olympiade)',
  'M-27': 'BWINF (Informatik-Biber, Jugendwettbewerb, Bundeswettbewerb Informatik)',
  'M-28': 'Variablen in Einführungskursen (Van der Werf u. a.; inf-schule)',
  'M-29': 'GI-Bildungsstandards Informatik Sek I 2025',
  'M-30': 'Parsons-Puzzles (ITiCSE u. a.)',
  'M-31': 'Niedersachsen, Informatik-Pflichtfach 9/10',
  'M-32': 'Technikspezifische Unterrichtsverfahren (Uni Duisburg-Essen)',
  'M-33': 'Technisches Zeichnen und Raumvorstellung (Hessen u. a.)',
  'M-35': 'NRW, Gesamtschule: Fachleistungsdifferenzierung (APO-SI)',
  'R-NRW': 'NRW, § 1 SchulG, APO-SI § 3/§ 7 (Förderkonzept, Lern- und Förderempfehlung)',
  'R-NI': 'Niedersachsen, Erlasse Haupt-/Realschule 5.2 (dokumentierte Lernentwicklung)',
  'R-HE': 'Hessen, Handreichung VOGSV (Förderplan: positiv, 1–3 Ziele mit Indikatoren)',
  'R-BE': 'Berlin, Leitfaden Förderplan (Gymnasium)',
  'R-HH': 'Hamburg, § 45 HmbSG (Lern- und Fördervereinbarung)',
  'R-SN': 'Sachsen, SOOSA § 21 (Förderunterricht für Leistungsschwächere und -stärkere)',
  'R-MV': 'Mecklenburg-Vorpommern, Handbuch Standards der Diagnostik (2026)',
  'R-KMK': 'KMK-Förderstrategie 2015, LemaS (Leistung musikalisch, sportlich …)',
  'R-Leisen': 'Gestufte Lernhilfen (Leisen u. a.)',
  'R-Renzulli': 'Compacting und Enrichment (Renzulli/Reis)',
  'R-EEF': 'Education Endowment Foundation (Gruppierung, Feedback)',
  'R-DSGVO': 'Art. 4 Nr. 4, Art. 22 DSGVO; EuGH C-634/21',
  'R-KIVO': 'KI-Verordnung Anhang III Nr. 3',
  'R-Kunst': 'Fachcurricula Kunst (Schulcurricula NI/SH)',
  'R-Musik': 'GMTH; Verlagsmaterial Notenlesen',
  'R-Sport': 'Bildungsserver Sport; Differenzierung im Sport',
  'R-DS': 'KC Theater NI 2023; Bildungspläne DSP Bremen 2026',
  'R-AL': 'Schulcurricula Arbeitslehre NRW; KC Werken NI',
  'R-HW': 'Übersicht Hauswirtschaft; Lehrplan Hessen'
}

/* ======================================================================
 * Rahmen für alle Fächer
 * ====================================================================== */

/** Gestaltung eines Förderblatts (alle Fächer) */
export const FOERDER_RAHMEN: Regel[] = [
  B('Diagnose → Förderziel → Material: das Blatt knüpft an den konkret erkannten Fehler bzw. die Lücke an, nicht nur an das Thema.', 'M-1'),
  B('Kurze Standortbestimmung am Anfang (Vorbild „Mathe sicher können": Diagnose, dann Förderung).', 'M-1'),
  B('Gestufte Hilfen mit aufsteigendem Hilfegrad (Impuls → Strategie → Teillösung); die Lernenden entscheiden selbst, wann sie eine Karte öffnen.', 'M-2'),
  B('Lösungsbeispiel mit Ausblenden (fading): erst vollständig, dann mit Lücken, dann eigene Aufgabe.', 'M-20'),
  B('Scaffolding wird wieder abgebaut: von Aufgabe zu Aufgabe weniger Stütze.', 'S-Q10'),
  B('Auch auf Förderblättern begründen, erklären, vergleichen – Förderblatt heißt nicht „nur AFB I"; ein Urteil darf verlangt werden, aber mit Gerüst.', 'G-5'),
  F('Je Blatt EIN Förderziel; Aufbau: Regel-/Strategiebox (sprachlich entlastet) → reproduktive Übung → gelenkte Anwendung → kleine freie Anwendung.'),
  F('Keine neue Lexik und nur bekannte Formen auf Förderblättern (passt zur App-Regel „nur bekannte Formen").'),
  B('Sprachhilfen (Wortspeicher, Satzanfänge) so viele wie nötig – Sprache ist Förderziel in allen Fächern.', 'M-21')
]

/** Gestaltung eines Forderblatts (alle Fächer) */
export const FORDER_RAHMEN: Regel[] = [
  B('Enrichment statt Mehr-vom-Gleichen: Lernstofferweiterung, Projekt, anspruchsvolle Aufgabenformate.', 'S-Q2'),
  B('Differenzierung nach oben über Umfang und Komplexität: Modelle/Theorien, Generalisieren, systemische Perspektive, mehr AFB-III-Operatoren.', 'G-5'),
  B('Blütenaufgaben: 3–5 nach Schwierigkeit gestufte Teilaufgaben zu einem Kontext, nach oben offen, unabhängig voneinander lösbar.', 'M-3'),
  B('KEINE Lösungsbeispiele (Expertise-Umkehr-Effekt) – höchstens Strategiehinweise wie „Arbeite rückwärts" oder „Untersuche Sonderfälle".', 'M-20'),
  B('Compacting: zuerst kurz zeigen lassen, dass das Grundziel sitzt („Zeig, dass du es kannst"), dann Vertiefung/Transfer.', 'R-Renzulli'),
  F('Wettbewerbsaufgaben nur „im Stil von" – keine Originalaufgaben abschreiben (Urheberrecht).', 'M-24')
]

/** Gilt für beide Blattarten (Entscheidungen der Lehrkraft und Rahmen) */
export const GEMEINSAM: Regel[] = [
  L('Oben ein Kasten „Dein Ziel" mit genau EINEM Satz (Schülersprache, positiv formuliert, aus dem Befund).'),
  B('Ziele positiv und konkret formulieren (Förderplan: 1–3 Ziele mit Indikator).', 'R-HE'),
  L('Bearbeitungszeit etwa 15–30 Minuten; Forderblätter dürfen offener sein, aber nicht einfach länger.'),
  L('KEINE Selbsteinschätzung und keine „Das kann ich jetzt"-Checkliste am Ende des Blattes (von der Lehrkraft abgewählt).'),
  F(
    'Nicht stigmatisierend: gleiche Gestaltung wie andere Blätter, neutraler Titel („Training: …" bzw. „Weiterdenken: …"), nie „Förder…", „Forder…", „schwach", „stark" oder „Niveau niedrig" auf dem Blatt.',
    'R-EEF'
  ),
  B('Feedback-Bezug: das Blatt greift den konkreten Befund auf statt eines allgemeinen Themas.', 'R-EEF')
]

/* ======================================================================
 * Fächergruppen (Rückfall, wenn ein Fach keine eigenen Angaben hat)
 * ====================================================================== */

const SPRACHEN_GRUPPE: FachRegeln = {
  bedarfe: [
    bed('wortschatz', 'Wortschatz (Wörter wackeln)'),
    bed('grammatik', 'Grammatik (eine bestimmte Form/Regel)'),
    bed('leseverstehen', 'Leseverstehen'),
    bed('hoerverstehen', 'Hörverstehen'),
    bed('schreiben', 'Schreiben (Aufbau, Textbausteine)'),
    bed('aussprache', 'Aussprache'),
    bed('rechtschreibung', 'Rechtschreibung / Schreibung'),
    bed('mediation', 'Sprachmittlung')
  ],
  foerderformate: [
    F('Regelbox, Muster-Satz, Umformungsübungen; Lückensätze mit Wortspeicher; Zuordnen Bild–Wort.'),
    F('Hilfekarten in der Reihenfolge Strategie-Hinweis → Beispiel/Muster → Teillösung.', 'S-Q10')
  ],
  forderformate: [
    F(
      'Kreatives Schreiben (Perspektivwechsel, Fortsetzung, Genrewechsel), Fehleranalyse fremder Texte, Sprachvergleich, authentische Texte über Lehrwerksniveau.'
    ),
    B('Mediation als Forderformat – der GER-Begleitband 2020 kennt Mediation von Texten, Konzepten und Kommunikation.', 'S-Q13')
  ],
  baender: {},
  wettbewerbe: [
    {
      name: 'Bundeswettbewerb Fremdsprachen – TEAM Schule',
      ab: 6,
      bis: 10,
      hinweis: 'Gruppen von 3–10 Personen; Film, Theater, Podcast u. Ä.',
      q: 'S-Q7'
    },
    {
      name: 'Bundeswettbewerb Fremdsprachen – SOLO',
      ab: 8,
      bis: 10,
      hinweis: 'alle Schulformen, eine Sprache; Video (max. 3 Min.), dann Klausurtag (Landeskunde, kreatives Schreiben, Lese- und Hörverstehen)',
      q: 'S-Q6'
    },
    { name: 'Bundeswettbewerb Fremdsprachen – SOLO PLUS', ab: 10, hinweis: 'zwei Sprachen; Kurzvideo und Audiobeitrag in der Zweitsprache', q: 'S-Q6' }
  ]
}

const GESELLSCHAFT_GRUPPE: FachRegeln = {
  bedarfe: [
    bed('quelle-verstehen', 'Sachtext/Quelle verstehen', 'belegt', 'G-8'),
    bed('fachbegriffe', 'Fachbegriffe'),
    bed('operator', 'Operator verstehen (z. B. beschreiben vs. erklären)', 'belegt', 'G-1'),
    bed('struktur', 'Antwort strukturieren', 'belegt', 'G-5'),
    bed('verknuepfung', 'Sprachliche Verknüpfung (nur Aufzählung)', 'belegt', 'G-1'),
    bed('urteil', 'Urteil begründen (Kriterium fehlt)', 'belegt', 'G-1'),
    bed('sach-wert', 'Sach- und Werturteil trennen', 'belegt', 'G-1'),
    bed('karte-diagramm', 'Karte/Diagramm auswerten', 'belegt', 'G-10')
  ],
  foerderformate: [
    B('Leitfrage vorab, kategoriengeleitetes Lesen, Worterklärungen am Rand, kurze Abschnitte.', 'G-8'),
    B(
      'Hilfen „unter Anleitung" (Schlüsselfragen, vorgegebene Handlungsschritte, vorgegebene Urteilskriterien) und „vorstrukturiertes Material" (fett gedruckte Schlüsselbegriffe, kleine Texteinheiten, Zuordnung, teilweise ausgefüllte Tabellen).',
      'G-5'
    ),
    B('Auf ALLEN Niveaus bewerten die Lernenden und formulieren ein eigenes Urteil – mit Gerüst.', 'G-5'),
    B('Operatorkarte: Definition aus dem Operatorenkatalog des Landes + Mini-Musterlösung + Gegenbeispiel („das wäre nur beschreiben").', 'G-1'),
    B('Konnektoren-Leiste nach Stufe: temporal/kausal → konditional/konzessiv/final → komplex.', 'G-1'),
    B('Kriterienliste vorgeben (Effizienz, Gerechtigkeit, Legitimität, Nachhaltigkeit …), Satzbaustein „Gemessen am Kriterium … ist …, weil …".', 'G-1'),
    B('Sortieraufgabe „kein Urteil / Sachurteil / Werturteil" mit Beispielsätzen.', 'G-1'),
    B('Karte/Diagramm: Schrittfolge Dekodieren → Beschreiben → Erklären → Beurteilen.', 'G-10')
  ],
  forderformate: [
    B('Kontroversität/Multiperspektivität: zwei Deutungen oder Positionen gegeneinander abwägen.', 'G-6'),
    B('Perspektivwechsel und Gegenwartsbezug; Progression individuell → öffentlich → systemisch.', 'G-5'),
    B('Komplexere Fragestellung statt mehr Aufgaben: Theorie/Modell, Generalisierung, mehrere Kriterien.', 'G-5')
  ],
  baender: {}
}

const MINT_GRUPPE: FachRegeln = {
  bedarfe: [
    bed('grundvorstellung', 'Grundvorstellung fehlt (Verstehen statt Rechnen)', 'belegt', 'M-1'),
    bed('fehlvorstellung', 'Typische Fehlvorstellung', 'belegt', 'M-16'),
    bed('fachsprache', 'Fachsprache', 'belegt', 'M-21'),
    bed('diagramm', 'Diagramm/Tabelle lesen und erstellen', 'belegt', 'M-21'),
    bed('experiment', 'Experiment auswerten (Frage, Vermutung, Beobachtung, Deutung)'),
    bed('modell', 'Modell und Wirklichkeit trennen', 'belegt', 'M-16'),
    bed('textaufgabe', 'Textaufgaben / Sachsituation übersetzen', 'belegt', 'M-8')
  ],
  foerderformate: [
    B('Verstehen statt Drill: Grundvorstellungen und Darstellungswechsel (Bild, Handlung, Symbol, Sprache) auf jedem Förderblatt.', 'M-5'),
    B('Gestufte Lernhilfen (5–6 je Aufgabe in den Naturwissenschaften erprobt) – als Hilfekarten zum Aufklappen.', 'M-2'),
    F('„Wer hat recht?": zwei Schülerantworten gegenüberstellen und die richtige begründen lassen (Fehlvorstellung offen ansprechen).'),
    B('Diagramme sind Lerngegenstand (Konventionen): Diagramm in Worte fassen, Tabelle ↔ Diagramm.', 'M-21')
  ],
  forderformate: [
    B('Blütenaufgaben mit wählbarer Schwierigkeit (*, **, ***).', 'M-3'),
    F('Offene Aufgaben, Problemlösen, Modellieren, Beweisen/Begründen, Variieren und Verallgemeinern.'),
    B('Eigene Experimente planen, Fehlerquellen bewerten, offene Fragestellungen.', 'M-25')
  ],
  baender: {},
  wettbewerbe: [
    {
      name: 'Jugend forscht / Schüler experimentieren',
      ab: 4,
      alterBis: 21,
      hinweis: 'Schüler experimentieren ab Klasse 4 bis 14 Jahre, Jugend forscht 15–21 Jahre; Stichtag 31.12.',
      q: 'M-25'
    },
    { name: 'IJSO – Internationale JuniorScienceOlympiade', alterBis: 15, hinweis: 'bis 15 Jahre, 4 Runden (IPN Kiel)', q: 'M-26' }
  ]
}

const AESTHETIK_GRUPPE: FachRegeln = {
  bedarfe: [
    bed('fachbegriffe', 'Fachbegriffe'),
    bed('beschreiben', 'Beschreiben ohne Ordnung'),
    bed('deuten', 'Wirkung begründen / deuten'),
    bed('reflexion', 'Reflexion')
  ],
  foerderformate: [
    F('Ein Arbeitsblatt fördert nur die kognitiven Anteile (Fachsprache, Analyse, Reflexion, Theorie, Planung, Sicherheit) – nicht die Praxis selbst.')
  ],
  forderformate: [B('Musikalische und sportliche Leistungsfähigkeit sind ausdrücklich Begabungsbereiche – Forderblätter sind legitim.', 'R-KMK')],
  baender: {},
  leitplanken: [F('In diesen Fächern gibt es meist keine Lerndaten in der App – Grundlage ist der von der Lehrkraft eingetragene Bedarf.')]
}

/** Deutsch/DaZ: Sprachengruppe ohne Fremdsprachen-Wettbewerbe und ohne Aussprache/Sprachmittlung als Bedarf */
const DEUTSCH_GRUPPE: FachRegeln = {
  ...SPRACHEN_GRUPPE,
  bedarfe: SPRACHEN_GRUPPE.bedarfe.filter((b) => !['aussprache', 'mediation', 'hoerverstehen'].includes(b.id)),
  forderformate: SPRACHEN_GRUPPE.forderformate.slice(0, 1),
  wettbewerbe: []
}

const GRUPPE: Partial<Record<FachArt, FachRegeln>> = {
  deutsch: DEUTSCH_GRUPPE,
  fremdsprache: SPRACHEN_GRUPPE,
  'alte-sprache': SPRACHEN_GRUPPE,
  // Mathematik: eigene Wettbewerbe (Olympiade, Känguru) – IJSO und Jugend forscht gehören zu den Naturwissenschaften
  mathematik: { ...MINT_GRUPPE, wettbewerbe: [] },
  naturwissenschaft: MINT_GRUPPE,
  informatik: MINT_GRUPPE,
  gesellschaft: GESELLSCHAFT_GRUPPE,
  musisch: AESTHETIK_GRUPPE,
  sport: AESTHETIK_GRUPPE,
  grundschule: GESELLSCHAFT_GRUPPE,
  sonstiges: AESTHETIK_GRUPPE
}

/* ======================================================================
 * Fächer
 * ====================================================================== */

const BEUTELSBACH: Regel = B(
  'Beutelsbacher Konsens IMMER: Überwältigungsverbot, Kontroversitätsgebot, Schülerorientierung – keine Position als „richtig" vorgeben, kontroverse Positionen sichtbar machen, bewertet wird nur die Begründungsqualität.',
  'G-6'
)

const DEUTSCH: FachRegeln = {
  bedarfe: [
    bed('rechtschreibung', 'Rechtschreibung (Mitsprechen, Ableiten, Merken)'),
    bed('grammatik', 'Grammatik (Wortarten, Satzglieder, Kommasetzung)'),
    bed('lesen', 'Leseflüssigkeit / Leseverstehen', 'belegt', 'S-Q11'),
    bed('schreiben', 'Schreiben (Schreibplan, Textprozeduren, Überarbeiten)'),
    bed('zuhoeren', 'Zuhören', 'belegt', 'S-Q5'),
    bed('inhaltsangabe', 'Inhaltsangabe / Zusammenfassen'),
    bed('argumentieren', 'Argumentieren / Erörtern'),
    bed('zitieren', 'Zitieren und Belegen')
  ],
  foerderformate: [
    B(
      'Lesen: Leseflüssigkeit ist Voraussetzung für Leseverstehen – Lautlesetandems (GS ab Kl. 2, auch Sek I), Lesestrategietraining („Textdetektive"), flüssiges Mitlesen beim Hören.',
      'S-Q11'
    ),
    F(
      'Orthografie über Strategien Mitsprechen, Nachdenken (Ableiten, Verlängern), Merken; Fehlerwörter-Training; Wortfamilien; Groß-/Kleinschreibung über Proben.'
    ),
    F('Grammatik über Umstell- und Ersatzprobe; Kommasetzung bei Haupt- und Nebensatz.'),
    F('Schreiben: Schreibplan, Textbausteine/Formulierungshilfen (Textprozeduren), Checkliste zur Überarbeitung.')
  ],
  forderformate: [
    F(
      'Literarisches und kreatives Schreiben, Erörtern mit Gegenposition, Textvergleich, Sprachreflexion (Sprachwandel, Jugendsprache, Mehrsprachigkeit), Rhetorik und Debatte.'
    )
  ],
  baender: {
    gs: band(
      [F('Silbenlesen, Leseflüssigkeit, Laut-Buchstaben-Zuordnung, Grundwortschatz, Satzanfang groß.')],
      [F('Eigene Geschichten, Gedichte variieren, Sachtexte zu Interessensthemen.')],
      [F('Dehnung und Schärfung; das/dass noch kein Thema; Lesetempo.')]
    ),
    '56': band(
      [F('Wortarten, Satzglieder, s-Laute, Großschreibung von Nominalisierungen, Erzählen mit Bauplan.')],
      [F('Erzählperspektive wechseln, Fabeln selbst schreiben, Jugendbuch-Rezension.')],
      [F('Zeitformwechsel beim Erzählen; Nominalisierung.')]
    ),
    '78': band(
      [F('Kommasetzung, Konjunktiv bei indirekter Rede, Inhaltsangabe, Sachtexte erschließen, Bericht.')],
      [F('Argumentieren mit Gegenargument, Balladen gestalten, Medienanalyse.')],
      [F('Inhaltsangabe im Präsens ohne Wertung; das/dass.')]
    ),
    '910': band(
      [F('Erörterung (Aufbau), Textanalyse mit Zitieren, Bewerbung, Fachsprache.')],
      [F('Interpretation mit Deutungshypothese, Essay, Sprachwandel.')],
      [F('Zitiertechnik; Belegen statt Nacherzählen.')]
    ),
    sek2: band(
      [F('Analyse-Operatoren, Gliederung, Zitierregeln, Fachbegriffe.')],
      [F('Vergleich über Epochen, Essay, Sprachtheorie.')],
      [F('Interpretation ohne Belege; Operatoren verwechselt.')]
    )
  },
  laender: [
    {
      laender: ['NW'],
      regel: B(
        '§ 1 SchulG: Recht auf individuelle Förderung; LRS-Erlass 1991 gilt weiter (fragt nicht nach Diagnose, allgemeine und zusätzliche Förderung).',
        'S-Q15'
      )
    },
    {
      laender: ['NW'],
      schulformen: ['gesamtschule'],
      regel: B('Gesamtschule: Fachleistungsdifferenzierung Deutsch ab Klasse 8 oder 9 (Grund-/Erweiterungskurs oder binnendifferenziert).', 'S-Q14b')
    },
    {
      laender: ['NI'],
      regel: B('Erlass Lesen/Rechtschreiben/Rechnen (2005): Lernbeobachtung, Dokumentation der individuellen Lernentwicklung, Förderplanung.', 'S-Q18')
    },
    { laender: ['NI'], schulformen: ['oberschule'], regel: B('Oberschule: Fachleistungsdifferenzierung Deutsch auf G/E/Z.', 'S-Q21') },
    { laender: ['BY'], regel: B('§ 34 BaySchO Notenschutz: Vorlesen bzw. Rechtschreibung können ohne Bewertung bleiben (Zeugnisbemerkung).', 'S-Q23') },
    { laender: ['HE'], regel: B('VOGSV §§ 37–44 (Lese-/Rechtschreibschwierigkeiten): Förderpflicht, Förderplan, Nachteilsausgleich nach § 42.', 'S-Q30') },
    { laender: ['HH'], regel: B('§ 45 HmbSG Lernförderung („Fördern statt Wiederholen") auch in Deutsch, mit Lern- und Fördervereinbarung.', 'S-Q29') }
  ],
  leitplanken: [
    B('IQB 2022: in Deutsch (Kl. 9) mehr Jugendliche unter den Mindeststandards in Lesen, Zuhören, Orthografie – Basisblätter sind breit nötig.', 'S-Q5')
  ]
}

const DAZ: FachRegeln = {
  bedarfe: [
    bed('artikel', 'Grundwortschatz mit Artikel und Plural'),
    bed('verbstellung', 'Verbstellung (V2, Satzklammer, Nebensatz)'),
    bed('kasus', 'Kasus nach Präposition'),
    bed('bildungssprache', 'Bildungssprache (Nominalstil, Passiv, Fachwörter)', 'belegt', 'S-Q4'),
    bed('operatoren', 'Operatoren verstehen'),
    bed('verstehen', 'Lese-/Hörverstehen mit Bildstützen')
  ],
  foerderformate: [
    B('Scaffolding nach Gibbons (Makro und Mikro) als Leitkonzept.', 'S-Q10'),
    F(
      'Wortspeicher mit Bild, Satzmuster/Satzanfänge, Lückentext mit Auswahl, Zuordnung Bild–Wort, Dialoggerüste, Textsorten-Muster, Glossar ggf. mit Herkunftssprache.'
    )
  ],
  forderformate: [
    F(
      'Sprachmittlung Herkunftssprache ↔ Deutsch, Mehrsprachigkeit als Ressource (Sprachvergleich), eigene Texte für Gleichaltrige, Übergang zu Fachtexten der Regelklasse.'
    )
  ],
  baender: {
    gs: band([F('Mündlicher Wortschatz, Artikel, einfache Sätze, Alphabetisierung (ggf. Zweitschrift).')], [], [F('Artikel und Genus.')]),
    '56': band([F('Satzklammer, Perfekt und Präteritum, Fachwortschatz der Fächer.')], [], [F('Trennbare Verben; Dativ/Akkusativ.')]),
    '78': band([F('Satzklammer, Perfekt und Präteritum, Fachwortschatz der Fächer.')], [], [F('Nominalisierungen in Aufgabenstellungen.')]),
    '910': band([F('Bildungssprache, Bewerbung, Prüfungsformate.')], [], [F('Nominalisierungen in Aufgabenstellungen.')]),
    sek2: band([F('Fachsprache, Argumentation.')], [], [])
  },
  laender: [
    {
      laender: ['NI'],
      regel: B('Erlass 2014 (nichtdeutsche Herkunftssprache): Sprachlernklassen, Förderkurse DaZ, Förderunterricht nach Sprachförderkonzept.', 'S-Q19')
    },
    { laender: ['BY'], regel: B('Fachprofil DaZ (LehrplanPLUS), Deutschklassen, DeutschPLUS-Kurse; Notenschutz und Vorlesen gelten auch für DaZ.', 'S-Q24') },
    { laender: ['NW'], regel: B('Herkunftssprachlicher Unterricht als Ressource.', 'S-Q16') }
  ]
}

const ENGLISCH: FachRegeln = {
  bedarfe: [
    bed('wortschatz', 'Wortschatz (Wortfelder, Kollokationen)'),
    bed('zeiten', 'Zeiten (simple/progressive, present perfect vs. simple past)'),
    bed('fragen', 'Fragebildung mit do'),
    bed('3ps', '3. Person -s / Satzstellung SVO'),
    bed('leseverstehen', 'Leseverstehen'),
    bed('hoerverstehen', 'Hörverstehen'),
    bed('schreiben', 'Schreiben (useful phrases, Schreibrahmen)'),
    bed('aussprache', 'Aussprache (th, w/v, Wortbetonung)'),
    bed('mediation', 'Sprachmittlung', 'belegt', 'S-Q13'),
    bed('rechtschreibung', 'Rechtschreibung')
  ],
  foerderformate: [
    F('Wortschatz: Wortfelder, Kollokationen, Bild–Wort, Lückensätze mit Wortspeicher.'),
    F('Grammatik: Signalwörter-Tabellen, Regelbox, Muster-Satz, Umformungsübungen.'),
    F('Leseverstehen: Vorentlastung (Wortliste), true/false/not given, Überschriften zuordnen; Hörverstehen: Transkript als Hilfekarte.'),
    F('Schreiben: Textbausteine, useful phrases, Schreibrahmen; Aussprache: Minimalpaare.')
  ],
  forderformate: [
    F(
      'Kreatives Schreiben (Tagebuch einer Figur, alternatives Ende), Mediation (Flyer oder Mail für eine konkrete Person), Debatte, authentische Texte (Nachrichten, Songtexte), Fehlerdetektiv.'
    ),
    B('Englisch-Leistungen sind laut IQB 2022 gestiegen – Forderangebote sind für viele relevant.', 'S-Q5')
  ],
  baender: {
    gs: band([F('Mündlich, Wort–Bild, Chunks (Kl. 3/4, wo vorhanden).')], [F('Kleine Rollenspiele.')], [F('Schriftbild vs. Aussprache.')]),
    '56': band(
      [F('simple present/past, Fragen mit do, Possessivbegleiter, Grundwortschatz.')],
      [F('Steckbrief/Comic, kleine Projekte.')],
      [F('3.-Person-s, unregelmäßige Verben, false friends (become/bekommen).')]
    ),
    '78': band(
      [F('present perfect, going to/will, Steigerung, Adverbien, if-Sätze Typ I.')],
      [F('Kurzgeschichte, Mediation, Podcast.')],
      [F('since/for; Adjektiv vs. Adverb.')]
    ),
    '910': band(
      [F('Passiv, if II/III, reported speech, Relativsätze, Prüfungsformate.')],
      [F('Argumentative essay, Rede, Film/Literatur.')],
      [F('Zeitenfolge; Kommasetzung im Relativsatz.')]
    ),
    sek2: band(
      [F('Analyse-Vokabular, Kohäsion, Operatoren.')],
      [F('Kommentar, Sprachmittlung auf B2/C1, Literatur.')],
      [F('Stilebene; Paraphrasieren statt Zitieren.')]
    )
  },
  laender: [
    { laender: ['NW'], schulformen: ['gesamtschule'], regel: B('Gesamtschule: Fachleistungsdifferenzierung Englisch ab Klasse 7.', 'S-Q14b') },
    { laender: ['NI'], schulformen: ['oberschule'], regel: B('Oberschule: G-, E- und Z-Kurse in Englisch, auch schon ab 5/6 möglich.', 'S-Q21') },
    { laender: ['NI'], regel: B('KC Englisch Sek I (2026 neu gefasst) betont kumulativen, individuellen Spracherwerb.', 'S-Q22') },
    {
      laender: ['BY'],
      regel: B(
        'LehrplanPLUS: kumulativer Kompetenzaufbau, innere Differenzierung über Lern- und Übungsaufgaben; bei LRS Vorlesen/Rechtschreibung ohne Bewertung möglich.',
        'S-Q23'
      )
    },
    { laender: ['HH'], regel: B('§ 45 HmbSG Lernförderung auch für Englisch.', 'S-Q29') },
    { laender: ['BW'], schulformen: ['gemeinschaftsschule'], regel: B('Gemeinschaftsschule mit Niveaus G/M/E.', 'S-Q34') }
  ],
  leitplanken: [F('Förderblätter für den G-Kurs bzw. Förderschwerpunkt Lernen mündlichkeitsnah: Chunks, Bildstützen, wenig Fließtext.', 'S-Q28')]
}

const ROMANISCH: FachRegeln = {
  bedarfe: [
    bed('aussprache', 'Aussprache und Schreibung (Akzente, stumme Endungen)'),
    bed('genus', 'Genus und Kongruenz, Artikel'),
    bed('konjugation', 'Verbkonjugation'),
    bed('vergangenheit', 'Vergangenheitszeiten (passé composé / indefinido vs. imperfecto)'),
    bed('pronomen', 'Objektpronomen und ihre Stellung'),
    bed('wortschatz', 'Wortschatz'),
    bed('rechtschreibung', 'Rechtschreibung / Akzente')
  ],
  foerderformate: [F('Konjugationstabellen mit Lücken, Farbcodes für Genus, Satzbaukästen, Hör- und Mitleseübungen, Minimalpaare.')],
  forderformate: [
    F(
      'Interkomprehension/Sprachvergleich (Französisch ↔ Spanisch ↔ Latein ↔ Englisch), landeskundliche Projekte, Chansons/Canciones, Mediation, DELF/DELE-nahe Aufgaben.'
    )
  ],
  baender: {
    '56': band(
      [F('Beginn (6/7): Aussprache, Artikel, Präsens, Fragen, Alltagsdialoge.')],
      [],
      [F('Interferenz aus dem Englischen (Schreibung, false friends).')]
    ),
    '78': band([F('Beginn bzw. 8/9: Vergangenheitszeiten, Pronomen, Futur.')], [], [F('Hilfsverbwahl; ser/estar; Akzente vergessen.')]),
    '910': band([F('Vergangenheitszeiten, Pronomen; in 10 Konditional, Subjonctif/Subjuntivo-Grundlagen.')], [], [F('Hilfsverbwahl; ser/estar.')]),
    sek2: band([F('Textanalyse, Kommentar, Mediation auf B1/B2.')], [], [])
  },
  wettbewerbe: SPRACHEN_GRUPPE.wettbewerbe,
  laender: [
    {
      laender: ['ALLE'],
      regel: B(
        'Französisch als 1. Fremdsprache unterliegt den Bildungsstandards ESA/MSA 2023; für die 2. Fremdsprache Sek I keine KMK-Standards (Lehrpläne der Länder).',
        'S-Q3'
      )
    }
  ]
}

const LATEIN: FachRegeln = {
  bedarfe: [
    bed('vokabeln', 'Vokabeln (mit Stammformen und Genus)'),
    bed('formen', 'Formenbestimmung (mehrdeutige Endungen)'),
    bed('kasus', 'Kasusfunktionen'),
    bed('satzanalyse', 'Satzanalyse (Prädikat zuerst)'),
    bed('konstruktionen', 'Satzwertige Konstruktionen (AcI, PC, Abl. abs.)'),
    bed('uebersetzen', 'Übersetzungsmethode')
  ],
  foerderformate: [
    F('Bestimmungstabellen mit ALLEN Lesarten (passt zur App-Logik), Einrück-/Kästchenmethode, Satzbilder, Wortschatz über Fremd- und Lehnwörter.'),
    F('Gestufte Übersetzung: Rohübersetzung, dann zielsprachlich; Lösungsteil mit Strukturerklärung.'),
    B('Der Lernwortschatz deckt die Lektüre nur begrenzt ab (1.250 Lexeme ≈ 83 % der Textwörter) – Wortbildung und Erschließung helfen.', 'S-Q32')
  ],
  forderformate: [
    F(
      'Originaltexte bzw. adaptierte Originale, Übersetzungsvergleich (zwei publizierte Übersetzungen bewerten), Rezeption (Antike in Kunst, Film, Sprache), Etymologie-Forschung, Metrik (Sek II).'
    )
  ],
  baender: {
    '56': band([F('a-/o-Deklination, Präsens/Imperfekt, Kasuslehre, Wortschatz.')], [], [F('Endung -a (Nom. Sg. f. oder Nom./Akk. Pl. n.).')]),
    '78': band([F('3. Deklination, Perfektstämme, Passiv, AcI, Partizipien.')], [], [F('Zeitverhältnisse im AcI.')]),
    '910': band([F('Abl. abs., Konjunktiv im Nebensatz, nd-Formen, Übergang zur Lektüre.')], [], [F('Lektüreschock durch Wortschatzlücken.')]),
    sek2: band([F('Autorenlektüre, Stilmittel, Interpretation, Metrik.')], [], [])
  },
  laender: [
    { laender: ['BY'], regel: B('LehrplanPLUS: Jgst. 5 ca. 500 Wörter Grundwortschatz, Jgst. 6 ca. 450 weitere; Individuelle Lernzeit am G9.', 'S-Q25') }
  ],
  wettbewerbe: [
    { name: 'Certamen Carolinum (NRW, Landeswettbewerb Alte Sprachen)', ab: 11, hinweis: 'Sek II; Zweige klassisch und „Antike trifft Kunst"', q: 'S-Q8' },
    { name: 'Landeswettbewerb Alte Sprachen (Bayern)', ab: 11, hinweis: 'Sek II, drei Runden, Übersetzung mit Zusatzfragen', q: 'S-Q9' },
    { name: 'Bundeswettbewerb Fremdsprachen – SOLO (Latein)', ab: 8, bis: 10, hinweis: 'eine Sprache, alle Schulformen', q: 'S-Q6' }
  ]
}

const GRIECHISCH: FachRegeln = {
  bedarfe: [
    bed('schrift', 'Schrift (Verwechslungen, Akzente, Spiritus)'),
    bed('artikel', 'Artikel als Bestimmungshilfe'),
    bed('verbformen', 'Verbformen (Augment, Aorist, Medium)'),
    bed('partizipien', 'Partizipien')
  ],
  foerderformate: [F('Lese- und Abschreibübungen, Transliteration, Fremdwortbrücken (Bio-, -logie, Demo-), Formenbestimmung mit allen Lesarten.')],
  forderformate: [
    F('Originallektüre (Platon, Homer in Auszügen), Mythos-Rezeption, Wortbildung der Wissenschaftssprache, Vergleich mit Latein und Neugriechisch.')
  ],
  baender: {
    '78': band(
      [B('Jgst. 8 (3. Fremdsprache): Alphabet, Akzente/Spiritus/Satzzeichen, Lehrbuchtexte (Bayern).', 'S-Q26')],
      [],
      [F('Verwechslung η/ν, ρ/p, υ/u, ω/w.')]
    ),
    '910': band([F('Formenlehre, in 10 Übergang zur Lektüre.')], [], []),
    sek2: band([F('Philosophie, Epos, Tragödie.')], [], [])
  },
  wettbewerbe: [
    { name: 'Bundeswettbewerb Fremdsprachen – SOLO/SOLO PLUS (Altgriechisch)', ab: 8, hinweis: 'nicht mit Latein kombinierbar', q: 'S-Q6' },
    { name: 'Pegalogos', ab: 8, hinweis: 'laut Schulseite ab Jahrgangsstufe 8', q: 'S-Q9' }
  ]
}

const WEITERE_SPRACHEN: FachRegeln = {
  bedarfe: [
    bed('schrift', 'Schrift / Schriftsystem'),
    bed('standardsprache', 'Register und Standardsprache (Herkunftssprachler)'),
    bed('grammatik', 'Grammatik'),
    bed('wortschatz', 'Wortschatz'),
    bed('rechtschreibung', 'Rechtschreibung')
  ],
  foerderformate: [
    F(
      'Zwei Lerngruppentypen trennen: Herkunftssprachler (mündlich stark, Schrift/Standardsprache schwächer) – Förderung Orthografie, Schriftsystem, Register; Fremdsprachler – Anfängerprogression.'
    ),
    F(
      'Für Sprachen mit eigener Schrift: Umschrift (Pinyin, Romaji, Transliteration) als abschaltbare Hilfestufe auf Förderblättern, Forderblätter ohne Umschrift.'
    )
  ],
  forderformate: [F('Literarische Texte, Sprachmittlung (für die Familie bzw. öffentliche Texte), Sprachvergleich.')],
  baender: {},
  laender: [{ laender: ['NW'], regel: B('Herkunftssprachlicher Unterricht (HSU) mit einheitlichem Lehrplan; Sprachprüfungen in 23 Sprachen.', 'S-Q16') }]
}

/** Sprachspezifische Stolpersteine (Faustregeln, ergebnis-sprachen.md Abschnitt 7) */
const SPRACH_STOLPERSTEINE: Record<string, string> = {
  russisch: 'Kasus, Aspekt, Kyrillisch',
  polnisch: 'Kasus, Aspekt, Diakritika',
  tschechisch: 'Kasus, Aspekt, Diakritika',
  tuerkisch: 'Agglutination, Vokalharmonie',
  arabisch: 'Schrift von rechts nach links, Buchstabenformen je Position, Wurzelsystem',
  chinesisch: 'Töne, Pinyin, Schriftzeichen (Strichfolge, Radikale)',
  japanisch: 'Hiragana, Katakana, Kanji, Höflichkeitsebenen',
  italienisch: 'Interferenz mit Spanisch, Französisch und Latein',
  portugiesisch: 'Interferenz mit Spanisch, Französisch und Latein',
  niederlaendisch: 'false friends zum Deutschen, Aussprache',
  daenisch: 'false friends zum Deutschen, Aussprache (stød)',
  neugriechisch: 'Schrift, Akzent, Brücke zu Altgriechisch'
}

const MATHEMATIK: FachRegeln = {
  bedarfe: [
    bed('zaehlendes-rechnen', 'Verfestigtes zählendes Rechnen', 'belegt', 'M-4'),
    bed('stellenwert', 'Stellenwertverständnis', 'belegt', 'M-4'),
    bed('grundvorstellung', 'Grundvorstellungen der Rechenarten', 'belegt', 'M-4'),
    bed('brueche', 'Brüche/Dezimalzahlen', 'belegt', 'M-5'),
    bed('variablen', 'Variablen und Terme', 'belegt', 'M-7'),
    bed('textaufgabe', 'Textaufgaben (Sachsituation übersetzen)', 'belegt', 'M-8'),
    bed('funktionen', 'Funktionen (Darstellungswechsel)'),
    bed('ableitung', 'Ableitung (Grundvorstellungen)', 'belegt', 'M-10')
  ],
  foerderformate: [
    B('„Mathe sicher können": Standortbestimmung plus Fördereinheit, verstehensorientiert, diagnosegeleitet, kommunikationsfördernd.', 'M-1'),
    B(
      'Textaufgaben über ein Situationsmodell (Skizze, Tabelle, nacherzählen), Rechenart begründen statt Schlüsselwörter suchen; Modellierungskreislauf als Gerüst.',
      'M-8'
    ),
    F('Fehleranalyse („Finde den Fehler", „Wer hat recht?") zu den belegten Fehlermustern.')
  ],
  forderformate: [
    B('Blütenaufgaben, offene und Problemlöseaufgaben.', 'M-3'),
    F('Beweisen und Verallgemeinern (Zahlentricks algebraisch erklären), Modellieren mit offenen Annahmen (Fermi-Aufgaben).')
  ],
  baender: {
    gs: band(
      [B('Ablösen vom zählenden Rechnen, Stellenwert (Bündeln, Stellentafel), Zahlbeziehungen, Grundvorstellungen der Grundrechenarten.', 'M-4')],
      [B('Substanzielle Lernumgebungen, herausfordernde Lernangebote (PIKAS).', 'M-6'), F('Zahlenmauern und Rechendreiecke mit Forscheraufträgen.')],
      [B('Zahlendreher (26/62), ±1-Fehler, Ziffer und Menge verwechselt.', 'M-4')]
    ),
    '56': band(
      [
        B(
          'Basiskompetenzen nachholen (Stellenwert, Grundvorstellungen ×/÷, Zahlenstrahl); Brüche als Anteil, Größenvergleich von Brüchen und Dezimalzahlen.',
          'M-1'
        )
      ],
      [B('Blütenaufgaben, Knobelaufgaben im Stil der Mathematik-Olympiade.', 'M-3')],
      [B('„Multiplizieren vergrößert immer".', 'M-5'), F('„0,25 > 0,3, weil 25 > 3".')]
    ),
    '78': band(
      [B('Variablenverständnis, Terme und Gleichungen, Textaufgaben.', 'M-7'), F('Prozent- und Zuordnungsvorstellungen.')],
      [F('Beweisen und Verallgemeinern.')],
      [B('Variable als Abkürzung eines Objekts („a = Äpfel").', 'M-7'), F('Proportionalität übergeneralisiert.')]
    ),
    '910': band(
      [F('Funktionen (Tabelle, Graph, Term, Situation), quadratische Gleichungen, Pythagoras, Trigonometrie.')],
      [F('Modellieren mit offenen Annahmen.')],
      [F('Graph als Bild der Situation gelesen; Steigung und Höhe verwechselt.')]
    ),
    sek2: band(
      [B('Grundvorstellungen der Ableitung, besonders lokale Änderungsrate und lokale Linearität.', 'M-10')],
      [F('Beweise, Modellierung.')],
      [B('Änderungsrate und Verstärkungsfaktor als Grundvorstellung schwach ausgeprägt.', 'M-10')]
    )
  },
  laender: [
    {
      laender: ['NI'],
      schulformen: ['oberschule'],
      regel: B(
        'Oberschule: G-Kurs nach KC Hauptschule, E-Kurs nach KC Realschule, Z-Kurs nach KC Gymnasium; G-Kurs Mathematik mit zusätzlicher 5. Stunde.',
        'M-12'
      )
    },
    {
      laender: ['NI'],
      schulformen: ['integrierte-gesamtschule'],
      regel: B(
        'IGS: Fachleistungskurse Mathematik ab Jahrgang 7, zwei Anspruchsebenen (E erhöht, G grundlegend); Noten beziehen sich auf die Anspruchsebene.',
        'M-13'
      )
    },
    {
      laender: ['NW'],
      schulformen: ['gesamtschule'],
      regel: B('Gesamtschule: Fachleistungsdifferenzierung Mathematik ab 7; innere und äußere Differenzierung gleichrangig.', 'M-35')
    },
    { laender: ['ALLE'], regel: B('KMK-Bildungsstandards Mathematik ESA/MSA 2022 verbindlich.', 'M-11') }
  ],
  wettbewerbe: [
    { name: 'Mathematik-Olympiade', ab: 3, bis: 13, hinweis: 'vier Runden (Schule, Region, Land, Bund ab Klasse 8)', q: 'M-24' },
    { name: 'Känguru der Mathematik', ab: 3, bis: 13, hinweis: 'Multiple Choice, gemeinsame Aufgaben in Doppeljahrgängen', q: 'M-24' }
  ]
}

const BIOLOGIE: FachRegeln = {
  bedarfe: [
    bed('teleologie', 'Teleologische Erklärungen („damit sie überleben")', 'belegt', 'M-19'),
    bed('struktur-funktion', 'Struktur und Funktion beschreiben'),
    bed('stoff-energie', 'Stoff- und Energieumwandlung'),
    bed('diagramm', 'Diagramm lesen', 'belegt', 'M-21'),
    bed('fachsprache', 'Fachsprache', 'belegt', 'M-21')
  ],
  foerderformate: [F('Struktur-Funktions-Sätze mit Satzbausteinen; „Wer hat recht?" zu Fehlvorstellungen.')],
  forderformate: [F('Materialanalyse, Hypothesen prüfen.')],
  baender: {
    '56': band([F('Merkmale des Lebendigen, Bau und Funktion, Mikroskopieren, Diagramme lesen.')], [], []),
    '78': band([F('Ökologie, Zelle, Fotosynthese und Atmung.')], [], [F('Stoff- und Energieumwandlung; „Pflanzen ernähren sich aus dem Boden".')]),
    '910': band([F('Genetik, Evolution, Hormone und Nerven.')], [], [B('Teleologie und Lamarckismus (71–81 % stimmten finalen Vorstellungen zu).', 'M-19')]),
    sek2: band([B('KMK-Bildungsstandards Biologie AHR seit 2020.', 'M-14')], [F('Materialanalyse, Hypothesen prüfen.')], [])
  },
  laender: [
    { laender: ['BW'], regel: B('BNT 5/6 aufgelöst, Biologie übernimmt die Inhalte; neue Pläne ab 1.8.2026 (Umsetzung ungeprüft).', 'M-17') },
    { laender: ['NW'], schulformen: ['gesamtschule'], regel: B('Gesamtschule: seit 2024 darf auch Biologie differenziert werden.', 'M-35') }
  ]
}

const CHEMIE: FachRegeln = {
  bedarfe: [
    bed('teilchenmodell', 'Teilchenmodell (Stoff- und Teilchenebene)', 'belegt', 'M-16'),
    bed('massenerhaltung', 'Massenerhaltung bei der Verbrennung', 'belegt', 'M-16'),
    bed('formelsprache', 'Formelsprache / Reaktionsgleichungen'),
    bed('fachsprache', 'Fachsprache', 'belegt', 'M-21')
  ],
  foerderformate: [
    B('Aufgaben mit 5–6 gestuften Lernhilfen (in SINUS erprobt).', 'M-2'),
    F('Ebenen ausdrücklich trennen (Spalten „Stoffebene" und „Teilchenebene"); Reaktionsgleichungen schrittweise mit Lösungsbeispiel und Ausblenden.')
  ],
  forderformate: [F('Experimente planen, Fehlerquellen bewerten.')],
  baender: {
    '78': band(
      [F('Stoffeigenschaften, Teilchenmodell, chemische Reaktion (Anfangsunterricht je nach Land ab 7 oder 8).')],
      [],
      [B('Stoffeigenschaften auf Teilchen übertragen; „zwischen den Teilchen ist Luft"; Masse verschwindet bei der Verbrennung.', 'M-16')]
    ),
    '910': band([F('Atombau, Bindung, Säuren und Basen, Reaktionsgleichungen.')], [], [F('Formelsprache mechanisch; Säure = „ätzend und gefährlich".')]),
    sek2: band([B('KMK-Bildungsstandards Chemie AHR seit 2020.', 'M-14')], [], [])
  }
}

const PHYSIK: FachRegeln = {
  bedarfe: [
    bed('mechanik', 'Kraft und Bewegung (Impetus-Vorstellung)', 'belegt', 'M-16'),
    bed('stromkreis', 'Stromkreis („Strom wird verbraucht")', 'belegt', 'M-16'),
    bed('waerme', 'Wärme und Temperatur', 'belegt', 'M-16'),
    bed('optik', 'Optik (Sehen, Spiegelbild)', 'belegt', 'M-16'),
    bed('diagramm', 'Diagramme (t-s, t-v)'),
    bed('formeln', 'Formeln mit Größen und Einheiten')
  ],
  foerderformate: [F('Vorhersagen mit anschließender Begründung („Leuchtet die Lampe?"); Lösungsbeispiel mit Ausblenden bei Formelaufgaben.')],
  forderformate: [F('Experimente planen, Modelle prüfen.')],
  baender: {
    '56': band(
      [F('Optik, Magnetismus, Stromkreis-Grundlagen, Wärme (oft in NuT, NaWi oder BNT).')],
      [],
      [B('Wolle „macht warm", Metall „ist kalt"; Licht „erfüllt den Raum".', 'M-16')]
    ),
    '78': band(
      [F('Mechanik (Kraft, Geschwindigkeit), Elektrizitätslehre.')],
      [],
      [B('Bewegung braucht immer eine Kraft; „je schwerer, desto schneller"; Strom wird verbraucht (sehr resistent).', 'M-16')]
    ),
    '910': band([F('Energie, Spannung und Widerstand, Bewegungsgesetze.')], [], [B('Actio und Reactio am selben Körper; „Stromspannung".', 'M-16')]),
    sek2: band([B('KMK-Bildungsstandards Physik AHR seit 2020.', 'M-14')], [], [])
  }
}

const INFORMATIK: FachRegeln = {
  bedarfe: [
    bed('variablen', 'Variablen und Zuweisung', 'belegt', 'M-28'),
    bed('kontrollstrukturen', 'Schleifen und Verzweigungen'),
    bed('ablauf', 'Ablauf nachvollziehen (Trace-Tabelle)'),
    bed('daten', 'Daten und Codierung')
  ],
  foerderformate: [
    B('Variablenzustand nach jeder Zuweisung eintragen lassen (Überschreiben, Kopieren).', 'M-28'),
    B('Parsons-Puzzles (Codeblöcke ordnen) als Hilfe – schnellere, motivierendere Bearbeitung bei gleichem Nachtest.', 'M-30'),
    F('Lösungsbeispiel mit Ausblenden (Codebeispiel → Lückencode → eigener Code); Unplugged-Aufgaben für den Einstieg.')
  ],
  forderformate: [F('Offene Projektaufgaben; Aufgaben im Stil des Informatik-Bibers.')],
  baender: {
    '56': band([F('Daten und Codierung, einfache Algorithmen in Alltags- und Blocksprache.')], [], []),
    '78': band([F('Blockbasiertes und erstes textbasiertes Programmieren, Variablen.')], [], [B('Variablen sind für Novizen schwierig.', 'M-28')]),
    '910': band([F('Algorithmisches Problemlösen.')], [], []),
    sek2: band([F('Ländercurricula (keine KMK-Standards AHR).')], [], [])
  },
  laender: [
    {
      laender: ['NI'],
      regel: B(
        'Informatik Pflichtfach in 9 und 10 (Lernfelder „Daten und ihre Spuren", „Computerkompetenz", „Algorithmisches Problemlösen", „Automatisierte Prozesse") – Blätter müssen auch für fachfremde Lehrkräfte selbsterklärend sein.',
        'M-31'
      )
    },
    { laender: ['BY'], schulformen: ['gymnasium'], regel: B('Informatik als Modul von Natur und Technik in der Unterstufe.', 'M-18') }
  ],
  wettbewerbe: [
    { name: 'Informatik-Biber', ab: 3, hinweis: 'Einstieg der Bundesweiten Informatikwettbewerbe (November)', q: 'M-27' },
    { name: 'Jugendwettbewerb Informatik', ab: 5, hinweis: 'ab Klasse 5 empfohlen, Runden 1–2 online', q: 'M-27' },
    { name: 'Bundeswettbewerb Informatik', ab: 9, hinweis: 'seit 1980, Start im September, 3 Runden', q: 'M-27' }
  ]
}

const NAWI: FachRegeln = {
  bedarfe: [...MINT_GRUPPE.bedarfe],
  foerderformate: [F('Im integrierten Fach das Teilfach (Biologie, Chemie, Physik) auf dem Blatt nennen, damit es zur Fehlvorstellung passt.')],
  forderformate: [],
  baender: {},
  laender: [
    {
      laender: ['NI'],
      schulformen: ['integrierte-gesamtschule'],
      regel: B('IGS: Naturwissenschaften als Fachbereich; Fachleistungsdifferenzierung ab Jahrgang 9.', 'M-13')
    },
    {
      laender: ['NI'],
      schulformen: ['hauptschule', 'realschule'],
      regel: B('KC Naturwissenschaften (Bio/Ch/Ph) für 5–10, verbindlich seit 1.8.2015.', 'M-15')
    },
    {
      laender: ['BY'],
      schulformen: ['gymnasium'],
      regel: B('Natur und Technik (Unterstufe) aus Naturwissenschaftlichem Arbeiten, Biologie, Informatik und Physik.', 'M-18')
    }
  ]
}

const TECHNIK: FachRegeln = {
  bedarfe: [
    bed('zeichnung', 'Technische Zeichnung lesen/anfertigen, Raumvorstellung', 'belegt', 'M-33'),
    bed('arbeitsplanung', 'Arbeitsplanung (Reihenfolge der Schritte)'),
    bed('fachbegriffe', 'Fachbegriffe Werkzeuge und Werkstoffe'),
    bed('sicherheit', 'Sicherheitsregeln')
  ],
  foerderformate: [
    B('Skizze → Einzelteilzeichnung → isometrische Darstellung → Arbeitsplan.', 'M-33'),
    F('Bild-Wort-Zuordnung, Arbeitsplan-Puzzle, Fehlersuche an einer Zeichnung.')
  ],
  forderformate: [B('Offene Konstruktionsaufgabe mit Optimierung und Bewertung (Produktbewertung mit Kriterien).', 'M-32')],
  baender: {},
  leitplanken: [B('Wirksamkeitsstudien zu einzelnen Verfahren fehlen – Formate sind Unterrichtsverfahren, keine erprobten Förderprogramme.', 'M-32')]
}

const GESCHICHTE: FachRegeln = {
  bedarfe: [
    ...GESELLSCHAFT_GRUPPE.bedarfe,
    bed('zusammenfassen', 'Zusammenfassen (Merkblatt der Lehrkraft)', 'lehrkraft'),
    bed('beurteilen', 'Beurteilen – Sachurteil (Vorlage der Lehrkraft)', 'lehrkraft'),
    bed('quellenkritik', 'Quellenkritik / Quelle und Darstellung unterscheiden', 'belegt', 'G-1')
  ],
  foerderformate: [
    B('Sachurteil vs. Werturteil: „Ohne Sachanalyse kein Urteil", „Ohne Sachurteil kein Werturteil".', 'G-1'),
    B('Einfache, auf viele Gattungen übertragbare Leitfragen zur Quellenarbeit.', 'G-7'),
    F('Werturteile nicht erst in 9/10, sondern früh mit Gerüst.', 'G-18')
  ],
  forderformate: [
    B('Dreistufige Forder-Leiter beim Werturteil: Meinung → wertrationales Urteil → Historisierung der Meinungspluralität.', 'G-2'),
    B('Zwei Historikerurteile vergleichen (Kontroversität); Kriterien offenlegen und begründen.', 'G-1')
  ],
  baender: {
    '56': band(
      [
        B(
          'Einfache Verknüpfungen (temporal, kausal, konsekutiv); Quellen als Zeugnisse einstufen; kriteriengeleitet urteilen „ggf. unter Hilfestellung".',
          'G-1'
        )
      ],
      [F('Kriterium selbst wählen, ein Gegenargument nennen.')],
      [F('Früher = „alles gleich alt"; Meinung statt Urteil.')]
    ),
    '78': band(
      [B('Erweiterte Verknüpfungen (konditional, konzessiv, final, modal); Quelle und Darstellung unterscheiden.', 'G-1')],
      [B('Sortieraufgabe Sach- vs. Werturteil; Argumente gewichten.', 'G-1')],
      [F('Beschreiben statt erklären; Urteil ohne Kriterium.')]
    ),
    '910': band(
      [B('Quellenkritik auf den Inhalt beziehen; urteilen „unter Offenlegung der verwendeten Kriterien".', 'G-1')],
      [B('Zwei Historikerurteile vergleichen, Werturteil ausdrücklich getrennt anschließen.', 'G-1')],
      [B('Werturteil ohne vorheriges Sachurteil; Präsentismus.', 'G-1')]
    ),
    sek2: band(
      [B('Operatoren und Sach-/Werturteil-Definitionen fortgeführt (gemeinsame Operatorenliste Geschichte/Erdkunde/Politik-Wirtschaft in NI).', 'G-3')],
      [B('Kontroversen (z. B. Fischer-Kontroverse) als Beispiele für Kontroversität.', 'G-2')],
      [B('Urteil ohne Kriterium; gelungene Wertargumentationen selbst im Abitur selten.', 'G-18')]
    )
  },
  wettbewerbe: [
    {
      name: 'Geschichtswettbewerb des Bundespräsidenten 2026/27 („Über den Tellerrand. Essen und Trinken in der Geschichte")',
      alterBis: 21,
      hinweis: 'Start 1.9.2026, bis 21 Jahre, alle Schulformen, forschendes Lernen vor Ort/in der Familie',
      q: 'G-15'
    }
  ]
}

const POLITIK: FachRegeln = {
  bedarfe: [...GESELLSCHAFT_GRUPPE.bedarfe, bed('perspektive', 'Nur eigene Perspektive'), bed('meinung-urteil', 'Meinung statt Urteil')],
  foerderformate: [F('Förderblatt startet bei der individuellen Perspektive („Was bedeutet das für mich?").', 'G-5')],
  forderformate: [F('Systemische Perspektive (Modelle, Auswirkungen aufs Gesamtsystem).', 'G-5'), B('Planspiel/Simulation (Handlungskompetenz).', 'G-5')],
  baender: {
    gs: band([B('Klassenrat, Regeln, Konflikte in der Schule (Demokratie als Lebensform).', 'G-5')], [], []),
    '56': band([B('Klassenrat, Regeln, Konflikte in der Schule (Demokratie als Lebensform).', 'G-5')], [], [F('Meinung statt Urteil.')]),
    '78': band([B('Gesellschaft, Recht, Politisches System, Internationale Beziehungen (BW Sek I).', 'G-5')], [], [F('Verwechslung Analyse/Urteil.')]),
    '910': band([B('Gesellschaft, Recht, Politisches System, Internationale Beziehungen (BW Sek I).', 'G-5')], [], [F('Nur eigene Perspektive.')])
  },
  laender: [
    { laender: ['BW'], regel: B('Gemeinschaftskunde im gemeinsamen Bildungsplan Sek I, Niveaus G/M/E; Wirtschaft als eigenes Fach WBS.', 'G-5') },
    { laender: ['NI'], regel: B('Politik-Wirtschaft; Oberstufe nach Sach-, Methoden-, Urteilskompetenz, gemeinsame Operatorenliste.', 'G-22') },
    { laender: ['NW'], schulformen: ['gesamtschule', 'sekundarschule'], regel: B('KLP Gesellschaftslehre 2020: Teilfächer oder fächerintegriert.', 'G-13') }
  ],
  leitplanken: [BEUTELSBACH],
  wettbewerbe: [
    {
      name: 'Schülerwettbewerb zur politischen Bildung (bpb) 2026',
      ab: 4,
      bis: 12,
      hinweis: 'Aufgaben wahlweise für Klasse 4–8 oder 8–12, Einsendeschluss 3.12.2026',
      q: 'G-16'
    }
  ]
}

const ERDKUNDE: FachRegeln = {
  bedarfe: [
    ...GESELLSCHAFT_GRUPPE.bedarfe.filter((b) => b.id !== 'sach-wert'),
    bed('massstab', 'Maßstab und Legende', 'belegt', 'G-10'),
    bed('klimadiagramm', 'Klimadiagramm erklären statt beschreiben'),
    bed('orientierung', 'Räumliche Orientierung (Gradnetz, Atlas)', 'belegt', 'G-9')
  ],
  foerderformate: [
    B('Kartenkompetenz: Grundelemente, fragegeleitet auswerten, Manipulation durch Farbwahl erkennen, eigene Skizze.', 'G-9'),
    B(
      'Kriterienliste Beurteilen (ökologische/ökonomische/soziale Adäquanz, Perspektivität) und Bewerten (Menschenrechte, Naturschutz, Nachhaltigkeit).',
      'G-9'
    ),
    F('Diagramm: Thema/Quelle/Jahr → Achsen/Einheiten → Extremwerte → Trend → Erklärung.')
  ],
  forderformate: [B('Medienkritik (Reiseprospekte, Stadtkarten auf Interessen prüfen); eigene Kartierung im Nahraum.', 'G-9')],
  baender: {
    '56': band(
      [F('Orientierung (Gradnetz, Atlas, Maßstab), Heimatraum, Kontinente.')],
      [],
      [B('Maßstab als typische Hürde (Kl. 6) – gezieltes Training hilft.', 'G-10')]
    ),
    '78': band([F('Klima-/Vegetationszonen, Naturrisiken.')], [], [F('Beschreiben statt Erklären von Klimadiagrammen.')]),
    '910': band([B('Globalisierung, Entwicklung, Nachhaltigkeit, Nutzungskonflikte (Aufgabenbeispiele der DGfG).', 'G-9')], [], []),
    sek2: band([B('DGfG-Standards AHR 2024 (grundlegendes und erhöhtes Niveau).', 'G-9b')], [], [])
  },
  wettbewerbe: [{ name: 'Diercke WISSEN', ab: 7, bis: 10, alterBis: 16, hinweis: 'Klassen 7–10, Altersgrenze 16, vier Runden', q: 'G-17' }]
}

const WIRTSCHAFT: FachRegeln = {
  bedarfe: [
    ...GESELLSCHAFT_GRUPPE.bedarfe,
    bed('diagramm-index', 'Diagramme (Index/Prozent vs. absolute Werte)'),
    bed('modell', 'Modell und Realität trennen')
  ],
  foerderformate: [
    B('Zugang über die Rollen Konsument, Arbeitnehmer, Wirtschaftsbürger/Gestaltender.', 'G-5'),
    F('Entscheidungsmatrix (Alternativen, Kosten/Nutzen, Opportunitätskosten).')
  ],
  forderformate: [
    B('Modelle (Wirtschaftskreislauf, Marktmodell) auf einen aktuellen Fall anwenden – Modellarbeit als Merkmal erhöhten Niveaus.', 'G-5'),
    F('Zielkonflikte (Effizienz vs. Gerechtigkeit) beurteilen.')
  ],
  baender: {},
  leitplanken: [BEUTELSBACH]
}

const GESELLSCHAFTSLEHRE: FachRegeln = {
  bedarfe: [...GESELLSCHAFT_GRUPPE.bedarfe],
  foerderformate: [F('Erkennen, welcher Teilfach-Operator gemeint ist („beurteilen" in Geschichte = Sachurteil, in Erdkunde mit DGfG-Kriterien).')],
  forderformate: [],
  baender: {},
  laender: [
    {
      laender: ['NW'],
      schulformen: ['gesamtschule', 'sekundarschule'],
      regel: B('KLP Gesellschaftslehre 2020, Teilfächer Erdkunde, Geschichte, Politik, Wirtschaft oder fächerintegriert.', 'G-13')
    },
    {
      laender: ['NI'],
      schulformen: ['integrierte-gesamtschule'],
      regel: B('KC Gesellschaftslehre 5–10 (2020) mit Didaktik von Geographie, Geschichte und Politik.', 'G-23')
    }
  ],
  leitplanken: [BEUTELSBACH],
  wettbewerbe: [...(POLITIK.wettbewerbe ?? []), ...(GESCHICHTE.wettbewerbe ?? []), ...(ERDKUNDE.wettbewerbe ?? [])]
}

const SACHUNTERRICHT: FachRegeln = {
  bedarfe: [
    bed('fachbegriffe', 'Fachwörter'),
    bed('zeitvorstellung', 'Zeitvorstellung'),
    bed('karte', 'Einfache Karten der Umgebung'),
    bed('beobachten', 'Beobachten und beschreiben')
  ],
  foerderformate: [F('Bildimpulse, handelnder Zugang, Wortspeicher, kurze Sätze, Zeitleiste der eigenen Familie, einfache Karten der Umgebung.')],
  forderformate: [B('Befragung von Zeitzeugen, Kinderphilosophieren.', 'G-25')],
  baender: {
    gs: band(
      [
        B(
          'Fünf Perspektiven (sozialwissenschaftlich, naturwissenschaftlich, geographisch, historisch, technisch) und perspektivenübergreifende Denk-, Arbeits- und Handlungsweisen.',
          'G-14'
        )
      ],
      [B('Kinderphilosophieren; Schülerwettbewerb bpb ab Klasse 4.', 'G-16')],
      [F('Zeitvorstellung („früher = alles gleich alt"), Maßstab, Fachwörter.')]
    )
  },
  wettbewerbe: [...(POLITIK.wettbewerbe ?? []), ...(MINT_GRUPPE.wettbewerbe ?? []).filter((w) => w.name.startsWith('Jugend forscht'))]
}

const RELIGION: FachRegeln = {
  bedarfe: [
    bed('wahrnehmen', 'Wahrnehmen und darstellen'),
    bed('deuten', 'Deuten (Texte, Symbole)'),
    bed('standpunkt', 'Eigenen Standpunkt begründen'),
    bed('dialog', 'Andere Perspektiven einnehmen')
  ],
  foerderformate: [
    F('Bibeltext in einfacher Sprache neben dem Originaltext, Symbol-/Begriffskarten, Satzbausteine („Ich sehe das so …, weil …; Andere sehen es …").')
  ],
  forderformate: [B('Perspektive anderer Religionen/Weltanschauungen einnehmen, Religionskritik prüfen, biblische Sprachformen kreativ umgestalten.', 'G-26')],
  baender: {},
  leitplanken: [BEUTELSBACH, F('Bekenntnisgebundenheit: keine Glaubenszustimmung bewerten – bewertet wird nur die Begründung.')]
}

const ETHIK: FachRegeln = {
  bedarfe: [
    bed('begriffe', 'Begriffe klären (Wert vs. Norm)'),
    bed('argumentieren', 'Argumentieren (These–Begründung–Beispiel)'),
    bed('meinung', 'Meinung ohne Begründung'),
    bed('sein-sollen', 'Sein-Sollen-Fehlschluss')
  ],
  foerderformate: [
    B('Fünf-Finger-Methode nach Martens – Förderblätter Finger 1–3 (phänomenologisch, hermeneutisch, analytisch).', 'G-25'),
    F('Argumentationsschema These–Begründung–Beispiel, Pro/Contra-Tabelle.')
  ],
  forderformate: [
    B('Finger 4–5 (dialektisch, spekulativ): Gegenpositionen, Alternativen entwerfen.', 'G-25'),
    B('Dilemmadiskussion: Argumente beider Seiten gewichten, kein Konsens über die „richtige" Lösung gefordert.', 'G-29'),
    F('Philosophischer Essay, Gedankenexperiment, Prinzipienkonflikt (Freiheit vs. Sicherheit).')
  ],
  baender: {},
  laender: [
    {
      laender: ['NI'],
      regel: B('Werte und Normen: Wahrnehmen und Beschreiben, Verstehen und Reflektieren, Diskutieren und Urteilen; Kompetenzen nach Doppeljahrgängen.', 'G-28')
    }
  ],
  leitplanken: [BEUTELSBACH, F('Stolpersteine: Moralisieren statt Argumentieren.')]
}

const PAEDAGOGIK: FachRegeln = {
  bedarfe: [bed('theorie', 'Theorie erfassen'), bed('fallanalyse', 'Theorie auf Fall anwenden')],
  foerderformate: [F('Theorie-Steckbrief (Autor, Kernbegriffe, Menschenbild), Fallanalyse mit Leitfragen, Theorie-auf-Fall-Raster.')],
  forderformate: [F('Zwei Theorien am selben Fall vergleichen und Reichweite beurteilen; kleine Beobachtung/Befragung mit Methodenkritik.')],
  baender: {},
  laender: [{ laender: ['NW'], regel: B('Kernlehrplan Erziehungswissenschaft GOSt 2014 gültig, Entwurf 2025 im Beteiligungsverfahren.', 'G-30') }]
}

const KUNST: FachRegeln = {
  bedarfe: [
    bed('bildbeschreibung', 'Bildbeschreibung ohne Ordnung'),
    bed('fachbegriffe', 'Fachbegriffe (Farbkontrast, Komposition, Perspektive)'),
    bed('beschreiben-deuten', 'Beschreiben und Deuten vermischt'),
    bed('belege', 'Keine Belege am Bild')
  ],
  foerderformate: [
    F(
      'Beschreibungsgerüst Bildaufbau → Farbe → Form → Raum mit Satzanfängen; Wortspeicher mit Bildbeispiel; Bildausschnitt-Aufgaben; Strukturskizze; Zuordnung Begriff ↔ Bilddetail.'
    )
  ],
  forderformate: [
    F(
      'Werkvergleich (zwei Epochen, gleiches Motiv), werkexternes Kontextwissen, eigene Gestaltungsentscheidung begründen, Kuratieren (Mini-Ausstellung mit Begleittext).'
    )
  ],
  baender: {
    '56': band([F('Wahrnehmen und Benennen (Farben, Formen), einfache Beschreibung.')], [], []),
    '78': band([F('Bildanalyse mit Fachbegriffen, Wirkung.')], [], []),
    '910': band([F('Interpretation mit Kontext, Beurteilung.')], [], []),
    sek2: band([F('Abiturnahe Werkanalyse (Strukturskizze, werkimmanent und werkextern), Vergleich.')], [], [])
  },
  leitplanken: [
    B('Kompetenzdimensionen Rezeption, Produktion, Reflexion; Operatoren Beschreiben, Analysieren/Interpretieren, Beurteilen, Gestalten.', 'R-Kunst'),
    F('Gestaltungsprodukte nicht von der KI bewerten lassen – nur Reflexionstexte.')
  ]
}

const MUSIK: FachRegeln = {
  bedarfe: [
    bed('noten', 'Notennamen und -werte, Taktarten'),
    bed('intervalle', 'Intervalle, Dur/Moll, Tonleiterbau'),
    bed('hoereindruck', 'Fachsprache beim Höreindruck'),
    bed('form', 'Formteile erkennen')
  ],
  foerderformate: [
    B('Didaktische Reduktion (erst ganze Noten, dann Viertel); Mindestziel als „Notenlese-Führerschein".', 'R-Musik'),
    F(
      'Merkhilfen, Klaviatur- und Notenlinien-Vorlagen, Lückennoten, Hörbeispiel mit Ankreuz-Raster, gestufte Hilfen beim Intervallbestimmen (Halbtöne zählen). Hörbeispiele verlinkt die Lehrkraft (die App hat keine Musik).'
    )
  ],
  forderformate: [
    F('Kurze Analyse (Form, Harmonik), eigene Melodie/Begleitung nach Regeln, Werk im historischen Kontext, Arrangieren, Interpretationen vergleichen.')
  ],
  baender: {
    '56': band([F('Notenlesen, Rhythmus, Instrumentenkunde.')], [], []),
    '78': band([F('Dur/Moll, Intervalle, Formen, Musik und Medien.')], [], []),
    '910': band([F('Harmonik (Kadenz), Epochen, Popularmusik-Analyse.')], [], []),
    sek2: band([F('Werkanalyse mit Partitur, Epochenbezug.')], [], [])
  },
  leitplanken: [B('Musiktheoretische Vorkenntnisse stark heterogen (mit/ohne Instrumentalerfahrung) – Fortgeschrittene als Experten-Helfer.', 'R-Musik')]
}

const SPORT: FachRegeln = {
  bedarfe: [
    bed('bewegungsbeschreibung', 'Bewegungsbeschreibung (Phasen)'),
    bed('trainingslehre', 'Fachbegriffe Trainingslehre'),
    bed('regelkunde', 'Regelkunde'),
    bed('aufwaermen', 'Aufwärmen begründen')
  ],
  foerderformate: [
    F(
      'Bildreihen ordnen und Phasen beschriften, Fehlerbilder zuordnen, Regelquiz mit Spielsituation, Lückentext Trainingsprinzipien, Beobachtungsbogen für Partner.'
    )
  ],
  forderformate: [
    F('Eigenen Trainingsplan erstellen und begründen, Bewegungsanalyse an einer Bildreihe, Schiedsrichter-/Coaching-Aufgabe, Doping/Fairness erörtern.')
  ],
  baender: {
    '56': band([F('Regeln, Fairness, Aufwärmen.')], [], []),
    '78': band([F('Bewegungsphasen, einfache Trainingsbegriffe.')], [], []),
    '910': band([F('Trainingsplanung, Gesundheit, Sportverletzungen.')], [], []),
    sek2: band([B('Theorie in Bewegungs-, Trainingslehre, Sportbiologie, -soziologie, -psychologie; LK mit schriftlichen Abituranteilen.', 'R-Sport')], [], [])
  },
  leitplanken: [
    F(
      'Keine Gesundheits- oder Körperdaten (Gewicht, Fitnesswerte) als Diagnose – möglicherweise Gesundheitsdaten nach Art. 9 DSGVO. Motorische Leistung ist kein Arbeitsblatt-Thema.'
    )
  ]
}

const DS: FachRegeln = {
  bedarfe: [
    bed('theaterbegriffe', 'Theaterfachbegriffe (Status, Freeze, Chor, Raumebenen)'),
    bed('beobachten', 'Szenenbeobachtung beschreiben statt bewerten'),
    bed('wirkung', 'Wirkung begründen'),
    bed('reflexion', 'Probenprotokoll und Reflexion')
  ],
  foerderformate: [
    F('Beobachtungsbogen mit Kategorien (Körper, Stimme, Raum, Requisit), Wortspeicher Theaterzeichen, Satzanfänge für Feedback, Standbild-Fotos beschriften.')
  ],
  forderformate: [F('Szene konzipieren (Regiebuch-Auszug), Inszenierungsvergleich, Strichfassung begründen, postdramatische Formen (Sek II).')],
  baender: {
    '56': band([F('Spielregeln, Grundformen (Standbild).')], [], []),
    '78': band([F('Figur, Status, Raum.')], [], []),
    '910': band([F('Szenenentwicklung, Analyse.')], [], []),
    sek2: band([F('Theatertheorie (Brecht, Stanislawski, postdramatisch), Inszenierungsanalyse.')], [], [])
  },
  laender: [
    { laender: ['NI'], schulformen: ['gymnasium', 'integrierte-gesamtschule'], regel: B('KC Theater/Darstellendes Spiel Jg. 5–10 (2023).', 'R-DS') },
    { laender: ['HB'], regel: B('Bildungspläne Darstellendes Spiel für Gymnasium und Oberschule (2026, mit Operatorenanhang).', 'R-DS') }
  ]
}

const ARBEITSLEHRE: FachRegeln = {
  bedarfe: [
    bed('fachbegriffe', 'Fachbegriffe Wirtschaft (Bedarf, Bedürfnis, Angebot)'),
    bed('alltagsrechnen', 'Rechnen im Alltag (Preisvergleich, Prozent)'),
    bed('zeichnung', 'Technische Zeichnung lesen'),
    bed('arbeitsplanung', 'Arbeitsplanung und Sicherheit'),
    bed('berufsorientierung', 'Berufsorientierung (Bewerbung)')
  ],
  foerderformate: [
    F('Arbeitsablauf ordnen (Bildkarten), Rechenbeispiel mit Lösungsweg, Werkzeug-Bild-Zuordnung, Checkliste Sicherheit, Bewerbungsbausteine mit Lücken.')
  ],
  forderformate: [F('Schülerfirma kalkulieren, Produktentwicklung mit Kostenplan, Fallanalyse Arbeitsmarkt, Nachhaltigkeitsbewertung eines Produkts.')],
  baender: {
    '56': band([F('Haushalt und Werkstatt, Grundbegriffe, Sicherheit.')], [], []),
    '78': band([F('Markt, Verbraucher, Werkstoffe, Praktikumsvorbereitung.')], [], []),
    '910': band([F('Berufswahl, Betriebe, Wirtschaftskreislauf, Projektarbeit.')], [], [])
  },
  leitplanken: [B('Gliederung in Grundlagen- und Erweiterungsbereich (KC Werken, Oberschule NI) als Vorbild für die Förder-/Forder-Trennung.', 'R-AL')]
}

const HAUSWIRTSCHAFT: FachRegeln = {
  bedarfe: [
    bed('naehrstoffe', 'Nährstoffgruppen und Ernährungspyramide'),
    bed('rezept', 'Rezept lesen und Mengen umrechnen'),
    bed('hygiene', 'Hygiene und Arbeitsplanung beim Kochen'),
    bed('garverfahren', 'Fachbegriffe der Garverfahren')
  ],
  foerderformate: [
    F(
      'Bild-Zuordnung Lebensmittel ↔ Gruppe, Rezept-Umrechnung mit Beispiel und Tabelle, Ablaufplan mit Bildkarten, Hygiene-Checkliste, Garverfahren-Steckbriefe.'
    )
  ],
  forderformate: [
    F(
      'Wochenspeiseplan nach Budget und Nährwert, Lebensmittelkennzeichnung kritisch prüfen, nachhaltiger Einkauf, Esskulturen vergleichen, eigenes Rezept begründen.'
    )
  ],
  baender: {
    '56': band([F('Hygiene, Küchengeräte, einfache Rezepte.')], [], []),
    '78': band([F('Nährstoffe, Garverfahren, Einkauf.')], [], []),
    '910': band([F('Ernährung und Gesundheit, Verbraucherbildung, Budget.')], [], [])
  },
  leitplanken: [F('Keine Abfrage von Essgewohnheiten, Allergien oder Gewicht als Diagnose – sensible Daten.')]
}

const FAECHER_REGELN: Record<string, FachRegeln> = {
  deutsch: DEUTSCH,
  daz: DAZ,
  englisch: ENGLISCH,
  franzoesisch: ROMANISCH,
  spanisch: ROMANISCH,
  // Romanische Sprachen ohne eigene Angaben: Formen wie Französisch/Spanisch, dazu Herkunftssprachler (NRW-HSU)
  italienisch: { ...ROMANISCH, foerderformate: [...ROMANISCH.foerderformate, ...WEITERE_SPRACHEN.foerderformate], laender: WEITERE_SPRACHEN.laender },
  portugiesisch: { ...ROMANISCH, foerderformate: [...ROMANISCH.foerderformate, ...WEITERE_SPRACHEN.foerderformate], laender: WEITERE_SPRACHEN.laender },
  latein: LATEIN,
  griechisch: GRIECHISCH,
  russisch: WEITERE_SPRACHEN,
  polnisch: WEITERE_SPRACHEN,
  tschechisch: WEITERE_SPRACHEN,
  tuerkisch: WEITERE_SPRACHEN,
  chinesisch: WEITERE_SPRACHEN,
  japanisch: WEITERE_SPRACHEN,
  arabisch: WEITERE_SPRACHEN,
  daenisch: WEITERE_SPRACHEN,
  niederlaendisch: WEITERE_SPRACHEN,
  neugriechisch: WEITERE_SPRACHEN,
  mathematik: MATHEMATIK,
  biologie: BIOLOGIE,
  chemie: CHEMIE,
  physik: PHYSIK,
  naturwissenschaften: NAWI,
  informatik: INFORMATIK,
  technik: TECHNIK,
  geschichte: GESCHICHTE,
  politik: POLITIK,
  erdkunde: ERDKUNDE,
  wirtschaft: WIRTSCHAFT,
  gesellschaftslehre: GESELLSCHAFTSLEHRE,
  sachunterricht: SACHUNTERRICHT,
  religion: RELIGION,
  ethik: ETHIK,
  'werte-und-normen': ETHIK,
  philosophie: ETHIK,
  paedagogik: PAEDAGOGIK,
  psychologie: PAEDAGOGIK,
  kunst: KUNST,
  musik: MUSIK,
  sport: SPORT,
  'darstellendes-spiel': DS,
  arbeitslehre: ARBEITSLEHRE,
  hauswirtschaft: HAUSWIRTSCHAFT
}

/** Fächer, in denen die App keine eigenen Lerndaten hat – dort ist der Bedarf von Hand Pflicht (Entscheidung der Lehrkraft) */
export const OHNE_LERNDATEN = ['kunst', 'musik', 'sport', 'darstellendes-spiel', 'arbeitslehre', 'hauswirtschaft', 'technik', 'anderes']

/* ======================================================================
 * Auswahl
 * ====================================================================== */

/** Jahrgangsband: GS 1–4, 5/6, 7/8, 9/10, Sek II (ab 11) */
export function bandVon(jahrgang: number | undefined): Band {
  if (!jahrgang || !Number.isFinite(jahrgang)) return '78'
  if (jahrgang <= 4) return 'gs'
  if (jahrgang <= 6) return '56'
  if (jahrgang <= 8) return '78'
  if (jahrgang <= 10) return '910'
  return 'sek2'
}

/** Fachregeln mit der Fächergruppe als Rückfall (Bedarfe, Formate und Wettbewerbe der Gruppe ergänzen das Fach) */
export function regelnFuer(fachId: string): FachRegeln {
  const fach = fachVon(fachId)
  const gruppe = (fach && GRUPPE[fach.art]) || AESTHETIK_GRUPPE
  const eigen = FAECHER_REGELN[fachId]
  if (!eigen) return gruppe
  if (eigen === gruppe) return eigen
  const ohneDoppelte = <T>(xs: T[], key: (x: T) => string): T[] => xs.filter((x, i) => xs.findIndex((y) => key(y) === key(x)) === i)
  return {
    bedarfe: ohneDoppelte([...eigen.bedarfe, ...gruppe.bedarfe], (b) => b.id),
    foerderformate: [...eigen.foerderformate, ...gruppe.foerderformate],
    forderformate: [...eigen.forderformate, ...gruppe.forderformate],
    baender: { ...gruppe.baender, ...eigen.baender },
    laender: [...(eigen.laender ?? []), ...(gruppe.laender ?? [])],
    wettbewerbe: ohneDoppelte([...(eigen.wettbewerbe ?? []), ...(gruppe.wettbewerbe ?? [])], (w) => w.name),
    leitplanken: [...(eigen.leitplanken ?? []), ...(gruppe.leitplanken ?? [])]
  }
}

/** Förderbedarfe des Fachs zur Auswahl von Hand (Bedarf je Kind/Gruppe) */
export function foerderbedarfeFuer(fachId: string): { value: string; label: string }[] {
  return regelnFuer(fachId).bedarfe.map((b) => ({ value: b.id, label: b.label }))
}

/** Name eines Bedarfs (Kennung oder Freitext) */
export function bedarfName(fachId: string, id: string): string {
  return regelnFuer(fachId).bedarfe.find((b) => b.id === id)?.label ?? id
}

/** Passt ein Wettbewerb zum Jahrgang? (Altersgrenze grob: Jahrgang + 6 ≈ Alter – Faustregel) */
export function wettbewerbeFuer(fachId: string, jahrgang: number | undefined): Wettbewerb[] {
  const j = jahrgang ?? 8
  return (regelnFuer(fachId).wettbewerbe ?? []).filter(
    (w) => (w.ab === undefined || j >= w.ab) && (w.bis === undefined || j <= w.bis) && (w.alterBis === undefined || j + 6 <= w.alterBis)
  )
}

/** Länderregeln, die für Land und Schulform gelten ('ALLE' = bundesweit) */
export function landRegelnFuer(fachId: string, land: string | undefined, schulform: string | undefined): Regel[] {
  return (regelnFuer(fachId).laender ?? [])
    .filter((l) => l.laender.includes('ALLE') || (land && l.laender.includes(land)))
    .filter((l) => !l.schulformen || (schulform && l.schulformen.includes(schulform)))
    .map((l) => l.regel)
}

/* ---------- Niveau (Entscheidung der Lehrkraft: Oberschule/IGS G/E/Z, NRW G/E, BW G/M/E) ---------- */

export interface NiveauWahl {
  value: string
  label: string
}
const N = (v: string, label: string): NiveauWahl => ({ value: v, label: `${v} – ${label}` })

/**
 * Niveaus für Land und Schulform. Niedersachsen: Oberschule G/E/Z (belegt, M-12); die IGS kennt laut Erlass zwei
 * Anspruchsebenen (G/E, M-13) – Z ist dort auf Wunsch der Lehrkraft trotzdem wählbar (Festlegung 12.10.2026).
 * NRW Gesamt-/Sekundarschule G/E (S-Q14b, M-35); BW Gemeinschaftsschule G/M/E (S-Q34), Realschule G/M.
 */
export function niveausFuer(land: string | undefined, schulform: string | undefined): NiveauWahl[] {
  if (land === 'NI' && (schulform === 'oberschule' || schulform === 'integrierte-gesamtschule'))
    return [N('G', 'grundlegend'), N('E', 'erweitert'), N('Z', 'gymnasial')]
  if (land === 'NW' && (schulform === 'gesamtschule' || schulform === 'sekundarschule')) return [N('G', 'Grundkurs'), N('E', 'Erweiterungskurs')]
  if (land === 'BW' && schulform === 'gemeinschaftsschule') return [N('G', 'grundlegend'), N('M', 'mittel'), N('E', 'erweitert')]
  if (land === 'BW' && schulform === 'realschule') return [N('G', 'grundlegend'), N('M', 'mittel')]
  return []
}

/**
 * Vorbelegung des Niveaus: zuerst aus dem Kursnamen („9c E-Kurs", „Mathe G"), sonst nach Blattart – Förderblätter am
 * unteren, Forderblätter am oberen Niveau (Faustregel aus ergebnis-mint.md, Abschnitt 9). Ohne Niveaus: null.
 */
export function niveauVorwahl(land: string | undefined, schulform: string | undefined, kursName: string, art: 'foerder' | 'forder'): string | null {
  const wahl = niveausFuer(land, schulform).map((n) => n.value)
  if (!wahl.length) return null
  const m = /\b([GEMZ])[- ]?Kurs\b/i.exec(kursName) ?? /\bKurs\s*([GEMZ])\b/i.exec(kursName) ?? /\s([GEMZ])\s*$/.exec(kursName.trim())
  const ausKurs = m?.[1]?.toUpperCase()
  if (ausKurs && wahl.includes(ausKurs)) return ausKurs
  return art === 'foerder' ? wahl[0] : wahl[wahl.length - 1]
}

/* ---------- Prompt-Baustein ---------- */

export interface FoerderBlattWahl {
  fachId: string
  jahrgang?: number
  land?: string
  schulform?: string
  art: 'foerder' | 'forder'
  /** „Dein Ziel" – ein Satz */
  ziel: string
  /** Bedarfe (Kennungen aus dem Fach oder Freitext der Lehrkraft) und Befunde aus den Lerndaten – OHNE Namen */
  bedarfe: string[]
  befunde?: string[]
  niveau?: string | null
  /** Für mindestens ein Kind ist ein Nachteilsausgleich hinterlegt: nur Darstellung anpassen */
  nachteilsausgleich?: boolean
  /** Rechtschreibung ist kein Förderziel (Notenschutz/Ausgleich bei Rechtschreibung) */
  ohneRechtschreibung?: boolean
}

const kenn = (r: Regel): string => `${r.k === 'belegt' ? '[B' : r.k === 'lehrkraft' ? '[L' : '[F'}${r.q ? ` ${r.q}` : ''}]`
const zeile = (r: Regel): string => `- ${r.t} ${kenn(r)}`

/** Rechtschreibung als Ziel herausnehmen (Nachteilsausgleich/Notenschutz) */
export const istRechtschreibBedarf = (s: string): boolean => /rechtschreib|orthogra|schreibung|akzente/i.test(s)

/** Zeilen zu Geschichte: Festlegungen der Lehrkraft zu „zusammenfassen"/„beurteilen" (shared/operatoren/geschichteSchreibformen.ts) */
function geschichteZeilen(w: FoerderBlattWahl): string[] {
  if (w.fachId !== 'geschichte') return []
  const stufe = geschichtsStufe(w.jahrgang)
  const formen = (['zusammenfassen', 'beurteilen'] as const).filter((f) => w.bedarfe.includes(f) || w.bedarfe.some((b) => b.toLowerCase().includes(f)))
  if (!formen.length) return []
  const zeilen = [`GESCHICHTE – Festlegung der Lehrkraft (keine KC-Vorgabe; Stufe ${STUFEN_NAME[stufe]}) [L]:`]
  for (const f of formen) {
    const h = hilfenFuer(f, stufe)
    const hilfen = [
      h.raster.length ? `Raster ${h.raster.map((r) => `„${r}"`).join(' – ')}` : '',
      h.satzanfaenge.length ? `Satzanfänge ${h.satzanfaenge.map((s) => `„${s}"`).join(', ')}` : '',
      h.verben.length ? `Verben ${h.verben.join(', ')}` : ''
    ].filter(Boolean)
    zeilen.push(
      w.art === 'foerder'
        ? `- „${f}": die Hilfen DIESER Stufe auf das Blatt (${
            hilfen.join('; ') || 'nur eine Hilfekarte mit den Arbeitsschritten'
          }); Regeln der Vorlage der Lehrkraft einhalten (siehe GESCHICHTE-Regeln).`
        : `- „${f}": Hilfen der Stufe weglassen; ${
            f === 'beurteilen'
              ? 'Kriterien selbst entwickeln und offenlegen, zwei Urteile/Deutungen vergleichen'
              : 'Darstellung (Historikertext) zusammenfassen und die Deutung kennzeichnen, ohne sie zu bewerten'
          }.`
    )
  }
  return zeilen
}

/**
 * Prompt-Baustein für ein Förder- bzw. Forderblatt (kommt in die Lernziele des Blattes, generation/prompts/aufgaben.ts).
 * Enthält keine Namen – nur Fach, Jahrgang, Land/Schulform, Ziel und Bedarf.
 */
export function foerderBaustein(w: FoerderBlattWahl): string {
  const r = regelnFuer(w.fachId)
  const b = bandVon(w.jahrgang)
  const br = r.baender[b]
  const foerder = w.art === 'foerder'
  const bedarfe = w.bedarfe.filter((x) => !(w.ohneRechtschreibung && istRechtschreibBedarf(x))).map((x) => bedarfName(w.fachId, x))
  const befunde = (w.befunde ?? []).filter((x) => !(w.ohneRechtschreibung && istRechtschreibBedarf(x)))
  const land = landRegelnFuer(w.fachId, w.land, w.schulform)
  const wettbewerbe = foerder ? [] : wettbewerbeFuer(w.fachId, w.jahrgang)
  const sprache = fachVon(w.fachId)
  const stolper = SPRACH_STOLPERSTEINE[w.fachId]
  const teile: string[] = [
    `${
      foerder ? 'FÖRDERBLATT (Basis sichern, gestufte Hilfen)' : 'FORDERBLATT (Vertiefung und Transfer)'
    } – Recherche 12.10.2026. Kennung: [B] belegt, [F] Faustregel (Empfehlung, keine Vorschrift), [L] Festlegung der Lehrkraft.`,
    `Fach: ${sprache?.label ?? w.fachId}; ${BAND_NAME[b]}${w.jahrgang ? ` (Jahrgang ${w.jahrgang})` : ''}${w.niveau ? `; Niveau ${w.niveau}` : ''}.`,
    `DEIN ZIEL (wörtlich oben auf dem Blatt in einem Kasten „Dein Ziel"): „${w.ziel.trim()}"`,
    bedarfe.length ? `Bedarf der Lerngruppe: ${bedarfe.join('; ')}.` : '',
    befunde.length ? `Befund aus den Lerndaten (nur zum Zuschneiden, nicht abdrucken): ${befunde.join('; ')}.` : '',
    'FESTER AUFBAU:',
    ...GEMEINSAM.map(zeile),
    ...(foerder
      ? [
          '- Zuerst eine kurze Standortbestimmung (eine Aufgabe mit 2–4 Items) zum Ziel.',
          '- Dann eine kurze Regel-/Strategiebox, ein vollständiges Lösungsbeispiel, ein Beispiel mit Lücken (Ausblenden), danach eigene Aufgaben: reproduktiv → gelenkt → kleine freie Anwendung.',
          '- Zu JEDER Übungsaufgabe gestufte Hilfekarten (Baustein "scaffold" mit variant "hilfekarten") in der Reihenfolge Impuls → Strategie → Teillösung; keine Karte verrät die ganze Lösung. [L]',
          ...FOERDER_RAHMEN.map(zeile)
        ]
      : [
          '- „Komplexer statt mehr": Transfer, AFB III, offene Aufgabe oder Blütenaufgabe bzw. eine Aufgabe im Stil eines Wettbewerbs. [L]',
          '- KEINE Lösungsbeispiele und keine Hilfekarten mit Teillösungen – höchstens ein Strategiehinweis. [L]',
          ...FORDER_RAHMEN.map(zeile)
        ]),
    'FACH:',
    ...(foerder ? r.foerderformate : r.forderformate).map(zeile),
    ...(br ? [...(foerder ? br.foerder : br.forder).map(zeile), ...br.stolpersteine.map((s) => `- Stolperstein: ${s.t} ${kenn(s)}`)] : []),
    stolper ? `- Stolpersteine dieser Sprache: ${stolper}. [F]` : '',
    ...(r.leitplanken ?? []).map(zeile),
    ...(land.length ? ['LAND/SCHULFORM:', ...land.map(zeile)] : []),
    ...geschichteZeilen(w),
    w.niveau ? `- Niveau ${w.niveau} nur dezent kennzeichnen (kleines Kürzel im Kopf), nicht im Titel und nicht wertend.` : '',
    wettbewerbe.length
      ? `AUSBLICK (kleiner Kasten am Ende): passende Wettbewerbe nennen – nur diese, mit Altersangabe: ${wettbewerbe
          .map(
            (x) =>
              `${x.name} (${[x.ab ? `ab Kl. ${x.ab}` : '', x.bis ? `bis Kl. ${x.bis}` : '', x.alterBis ? `bis ${x.alterBis} Jahre` : '']
                .filter(Boolean)
                .join(', ')}; ${x.hinweis}) [B ${x.q}]`
          )
          .join('; ')}. Aufgaben höchstens „im Stil von", nie Originalaufgaben.`
      : '',
    w.nachteilsausgleich
      ? 'DARSTELLUNG (Nachteilsausgleich – Maßnahme, keine Diagnose): kurze Sätze, klare Gliederung, große Schreibfelder, wenig Text je Seite; die Lernenden können sich Anweisungen vorlesen lassen. Anforderungen und Niveau bleiben GLEICH – nichts inhaltlich absenken. [B R-MV]'
      : '',
    w.ohneRechtschreibung
      ? '- Rechtschreibung ist KEIN Ziel dieses Blattes, wird nicht geübt, nicht bewertet und nicht korrigiert; keine Diktatform. [F S-Q23]'
      : '',
    '- Das Blatt spricht die Lernenden mit „du" an und nennt keine Namen.'
  ]
  return teile.filter(Boolean).join('\n')
}

/** Neutraler Titel (nicht stigmatisierend): „Training: …" bzw. „Weiterdenken: …" */
export function neutralerTitel(art: 'foerder' | 'forder', thema: string): string {
  const t = thema.trim().replace(/^(Training|Weiterdenken):\s*/i, '')
  return `${art === 'foerder' ? 'Training' : 'Weiterdenken'}: ${t || 'Üben'}`
}
