/**
 * Fachtypische Reihenmuster (08.10.2026, Auftrag der Lehrkraft): Wie baut man in diesem Fach eine Unterrichtsreihe auf –
 * Reihentypen mit ihren Phasen, geeignete und ungeeignete Einstiege, Materialarten, Methoden, Sicherung, Abschlussprodukte,
 * Einsatz von Lernkarten, Unterschiede je Stufe und Schulform sowie harte Regeln („nie"). Grundlage der KI-Planung
 * (unterrichtsreihe/planungDidaktik.ts `reihenmusterZeilen`) und des Gegenchecks danach (reihenmusterPruefung.ts).
 *
 * Recherche: recherche/reihenmuster-gesellschaft-2026-10-08.md, reihenmuster-sprachen-2026-10-08.md,
 * reihenmuster-mint-aesthetik-2026-10-08.md.
 *
 * BELEGT ODER FAUSTREGEL – ausdrücklich getrennt:
 *  - `belege` je Muster und `beleg` je Reihentyp tragen die Aussagen, die eine geprüfte Quelle (URL) stützt.
 *  - ALLES ANDERE in den Listen (Einstiege, Materialarten, Methoden, Sicherung, Abschlussprodukte, Lernkarten, Stufen,
 *    Schulformen, nieRegeln) ist FAUSTREGEL: verbreitete fachdidaktische Praxis bzw. Lehrbuchwissen (Sauer, Pandel,
 *    Reinhardt, Haubrich, Lachmann/Rupp, Pfeifer, Spinner, Kuhlmann, Barzel/Leuders …), nicht online gegengeprüft.
 *  - Ausnahme in den Listen: Ein Eintrag mit „[belegt]" ist durch einen Eintrag in `belege` desselben Musters gedeckt.
 *
 * Die Phasen sind FUNKTIONEN, keine starre Reihenfolge (für Mathematik und Musik belegt, s. `belege`): Die KI darf sie
 * je Teilthema wiederholen und ineinandergreifen lassen.
 *
 * Fächer nur mit Kennungen aus shared/faecher.ts. Ohne Muster (keine Recherche): Pädagogik, Psychologie, Hauswirtschaft,
 * Darstellendes Spiel, „Anderes Fach" – dort plant die KI nur mit den allgemeinen Regeln.
 *
 * Texte knapp halten: Sie gehen in die Anfrage an die KI.
 */
import { FAECHER } from './faecher'
import type { SchulProfil } from './schulformen'

/** Stufe der Reihe (Grundschule nur, wo das Fach dort unterrichtet wird) */
export type MusterStufe = 'Grundschule' | '5/6' | '7/8' | '9/10' | 'Oberstufe'

/** Schulform-Hinweis je Schulprofil, dazu berufliche Schulen */
export type MusterSchulform = SchulProfil | 'beruflich'

/** Gegenchecks nach der Planung (reihenmusterPruefung.ts), zusätzlich zu den allgemeinen (Einstieg, Leitfrage, Lernkarten) */
export type MusterPruefung = 'beutelsbacher' | 'risu' | 'bekenntnis' | 'sportBlatt'

export interface Reihentyp {
  id: string
  label: string
  /** Didaktische Funktionen in üblicher Abfolge – keine starre Chronologie */
  phasen: string[]
  /** Quelle (URL), wenn der Reihentyp selbst belegt ist; sonst Faustregel */
  beleg?: string
}

export interface Reihenmuster {
  /** Kennung der Fachfamilie */
  id: string
  name: string
  /** Fächer (Kennungen aus faecher.ts) */
  faecher: string[]
  reihentypen: Reihentyp[]
  einstiege: string[]
  ungeeigneteEinstiege: string[]
  materialarten: string[]
  methoden: string[]
  sicherung: string[]
  abschlussprodukte: string[]
  lernkartenNutzung: string
  stufenUnterschiede: Partial<Record<MusterStufe, string>>
  schulformHinweise: Partial<Record<MusterSchulform, string>>
  /** Harte Regeln – gelten immer, die KI darf sie nicht abwägen */
  nieRegeln: string[]
  /** Belegte Aussagen mit Quelle */
  belege: { aussage: string; url: string }[]
  /** Besonderheiten einzelner Fächer der Familie (Kennung → Hinweis, Faustregel wenn nicht belegt) */
  fachHinweise?: Record<string, string>
  /** Zusätzliche Gegenchecks nach der Planung */
  pruefungen?: MusterPruefung[]
}

/** Geprüfte Quellen (aus den Recherchen) */
const Q = {
  beutelsbach: 'https://www.lpb-bw.de/beutelsbacher-konsens-wortlaut',
  geFriedrichPlanung:
    'https://www.friedrich-verlag.de/friedrich-plus/sekundarstufe/geschichte/methodik-didaktik/unterrichtsplanung-in-der-zweiten-phase-der-lehrkraefteausbildung-8501',
  geFriedrichEinstiege: 'https://www.friedrich-verlag.de/friedrich-plus/sekundarstufe/geschichte/forschen-entdecken/einstiege-in-unterrichtsreihen-21730',
  geOperatoren: 'https://www.geschichte.tu-darmstadt.de/media/geschichte/ifg/didaktik/pdf_ifg_gedid/Operatoren.pdf',
  konfliktanalyse: 'https://sowi-online.de/print/praxis/methode/konfliktanalyse.html',
  lpbMethoden: 'https://www.lpb-bw.de/publikationen/did_reihe/methoden/methoden.htm',
  glNrw: 'https://lehrplannavigator.nrw.de/system/files/media/document/file/hs_gl_klp_3202_2022_03_15.pdf',
  dgfgSek1:
    'https://fachportal.lernnetz.de/files/Inhalte%20der%20Unterrichtsf%C3%A4cher/Geographie/Download%20Center/Bildungsstandards%20SI%20Geographie%202020%20Web.pdf',
  mystery: 'https://www.phbern.ch/sites/default/files/2019-11/20191126_leitfaden_mystery_d_is1.pdf',
  elementarisierung: 'https://www.die-bibel.de/stichwort/100014',
  martens: 'https://journal.viterbo.edu/index.php/atpp/article/view/1127',
  kmdd: 'https://www.afet.de/wp-content/uploads/2023/01/Schirrmacher_KMDD.pdf',
  wun: 'https://uol.de/philosophie/studium-lehre/werte-und-normen',
  kmkD: 'https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2022/2022_06_23-Bista-ESA-MSA-Deutsch.pdf',
  kmkDAbi: 'https://www.kmk.org/fileadmin/veroeffentlichungen_beschluesse/2012/2012_10_18-Bildungsstandards-Deutsch-Abi.pdf',
  kmkFs: 'https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2023/2023_06_22-Bista-ESA-MSA-ErsteFremdsprache.pdf',
  kmkFsAbi: 'https://www.kmk.org/fileadmin/veroeffentlichungen_beschluesse/2012/2012_10_18-Bildungsstandards-Fortgef-FS-Abi.pdf',
  kmkFsUebersicht: 'https://www.kmk.org/bildungsministerkonferenz/vertiefende-bildungsinhalte/allgemeinbildende-schulen/fremdsprachen.html',
  goethePreTask: 'https://www.goethe.de/ins/be/de/spr/mgs/26068586.html',
  latein: 'https://www.fachdidaktik.klassphil.uni-muenchen.de/studium_lehre/lehrverans/sommer_151/repetitorium/11_wohlfarth.pdf',
  mercator: 'https://mercator-institut.uni-koeln.de/sites/mercator/user_upload/PDF/05_Publikationen_und_Material/230206_Basiswissen__Scaffolding.pdf',
  kosima: 'https://eldorado.tu-dortmund.de/bitstreams/16a6cedf-a224-470d-ae1b-424a7de3c67c/download',
  nwKmk:
    'https://bildung.rlp.de/fileadmin/user_upload/studienseminar.rlp.de/bb-sp/Fachdidaktische_Seminare/Biologie/ImplBroschuere_BiSta_NATURWISSENSCHAFTEN_2024-06-06.pdf',
  chik: 'https://www.friedrich-verlag.de/friedrich-plus/sekundarstufe/chemie/methoden-konzepte/neugierig-auf-das-was-kommt-11518',
  giSek1: 'https://www.mnu.de/images/fachbereiche/Informatik/Bildungsstandards_Sek_I_2025__pdf-A_.pdf',
  technik: 'https://www.uni-due.de/imperia/md/content/prodaz/wichtige_technikspezifische_unterrichtsverfahren.pdf',
  kunstNrw: 'https://lehrplannavigator.nrw.de/system/files/media/document/file/klp_gost_kunst.pdf',
  jankStroh: 'https://www.pedocs.de/volltexte/2020/18572/pdf/Jank_Stroh_2006_Aufbauender_Musikunterricht.pdf',
  sportNrw: 'https://www.bezreg-detmold.nrw.de/system/files/media/document/file/4.48_kernlehrplan_sport_gymnasium_sek_i.pdf',
  balz: 'https://schulentwicklung.nrw.de/cms/upload/Faecher_Seiten/Sport/UE/Sportunterricht_mehrperspektivisch_planen_BALZ_2021.pdf',
  gdsu: 'https://www.klinkhardt.de/newsite/media/20130314_9783781519923Inh.pdf'
}

/** Gemeinsame Regel aller Fächer (Faustregel aus allen drei Recherchen) */
const NIE_BEGRIFFE_ZUERST = 'Nie Lernkarten, Glossar, Merkkasten oder fertige Begriffsdefinitionen als ersten Schritt – Begriffe erst nach der Erarbeitung sichern.'
const NIE_LEITFRAGE = 'Nie eine Reihe ohne Leitfrage/Problem; der letzte Schritt beantwortet sie ausdrücklich.'
const NIE_UEBERWAELTIGEN =
  'Nie eine Meinung vorgeben: Wo geurteilt wird, kontroverse Positionen darstellen und das Urteil den Lernenden überlassen (Beutelsbacher Konsens).'
const NIE_RISU = 'Nie ein Experiment oder einen Versuch ohne den Hinweis „Lehrkraft prüft nach RiSU (Gefährdungsbeurteilung)" planen.'

const MODERNE_FREMDSPRACHEN = FAECHER.filter((f) => f.art === 'fremdsprache').map((f) => f.id)

export const REIHENMUSTER: Reihenmuster[] = [
  // ------------------------------------------------------------------ Gesellschaft
  {
    id: 'geschichte',
    name: 'Geschichte',
    faecher: ['geschichte'],
    reihentypen: [
      {
        id: 'leitfrage-urteil',
        label: 'Leitfrage → Quellen → Sachurteil → Werturteil',
        phasen: [
          'Problemorientierter Einstieg, Leitfrage entwickeln',
          'Orientierung (Zeitleiste, Karte, Darstellungstext)',
          'Erarbeitung an Quellen und Darstellungen mit Quellenkritik, Perspektivenvergleich',
          'Sachurteil (im zeitgenössischen Kontext)',
          'Werturteil mit offengelegten heutigen Maßstäben',
          'Rückbezug auf die Leitfrage, Sicherung/Transfer'
        ],
        beleg: Q.geFriedrichPlanung
      },
      { id: 'laengsschnitt', label: 'Längsschnitt', phasen: ['Leitfrage zum Wandel', 'Stationen im Vergleich (Quellen je Epoche)', 'Kontinuität und Wandel deuten', 'Urteil, Rückbezug'] },
      { id: 'fallstudie', label: 'Fallstudie / Personalisierung', phasen: ['Mensch der Zeit als Einstieg', 'Lebenswelt an Quellen erschließen', 'Verallgemeinern', 'Sachurteil, Rückbezug'] },
      { id: 'geschichtskultur', label: 'Geschichtskultur-Analyse', phasen: ['Film/Denkmal/Spiel als Einstieg', 'Mit Quellen und Forschung vergleichen', 'Deutungsabsicht analysieren', 'Urteil über die Darstellung'] },
      { id: 'spurensuche', label: 'Projekt / Spurensuche vor Ort', phasen: ['Spur vor Ort, Leitfrage', 'Recherche, Erkundung, Zeitzeugen', 'Auswerten, einordnen', 'Präsentation, Rückbezug'] }
    ],
    einstiege: [
      'Bildimpuls mit Irritation (Gemälde, Foto, Plakat)',
      'widersprüchliche Quellenaussagen („Wer hat recht?")',
      'Gegenwartsbezug (Straßenname, Denkmal, Gedenktag, Nachricht, Film/Spiel)',
      'Sachquelle/Objekt („Was ist das?")',
      'provokante These',
      'Fallgeschichte eines Menschen der Zeit (Kl. 5–7)'
    ],
    ungeeigneteEinstiege: [
      'Begriffskarten/Glossar',
      'Lehrervortrag mit Daten ohne Frage',
      'Lückentext zum Lehrbuchtext',
      'Ergebnis vorab zusammengefasst',
      'Werturteil als Einstieg (Sachurteil muss vorausgehen)'
    ],
    materialarten: [
      'Textquellen (Briefe, Reden, Gesetze, Zeitung)',
      'Bildquellen, Plakate, historische Karikaturen',
      'Sachquellen',
      'Statistiken',
      'Geschichtskarten und historische Karten',
      'Darstellungen (Autorentext, Historikertexte)',
      'Zeitleisten, Verfassungsschemata',
      'Zeitzeugenberichte',
      'Geschichtskultur (Film, Comic, Spiel, Denkmal) ab Kl. 7/8'
    ],
    methoden: [
      'Quellenanalyse mit Quellenkritik (Wer, wann, für wen, Absicht)',
      'Bild-/Plakat-/Karikaturanalyse',
      'Darstellungsanalyse, Kontroverse (ab 9/10)',
      'Perspektivenwechsel, Brief aus der Zeit',
      'Ursachen-Folgen-Schema, Zeitleiste',
      'Gruppenpuzzle (Perspektiven)',
      'Pro-Contra, Positionslinie zum Werturteil',
      'historisches Erzählen'
    ],
    sicherung: [
      'Strukturskizze Ursachen → Ereignis → Folgen',
      'Zeitleiste über die Reihe fortschreiben',
      'Begriffskarten nach der Erarbeitung',
      'Antwort auf die Leitfrage (Sachurteil, ein Absatz)',
      'Concept Map der Akteure'
    ],
    abschlussprodukte: [
      'Sach-/Werturteil zur Leitfrage (Kernprodukt)',
      'Erzählung/Brief/Tagebuch aus einer Perspektive (Kl. 5–8)',
      'Plakat, Ausstellung, Erklärvideo, Podcast',
      'Lernkontrolle mit Quellenaufgabe',
      'Oberstufe: Quelleninterpretation, Erörterung'
    ],
    lernkartenNutzung: 'Fachbegriffe nach der jeweiligen Erarbeitung, wenige Ankerdaten (keine Datenflut); Wiederholung am Stundenbeginn und vor der Lernkontrolle.',
    stufenUnterschiede: {
      '5/6': 'Personalisierung, Alltagsgeschichte, Bilder und Sachquellen vor Text, Zeitbegriffe; Werturteil nur anbahnen.',
      '7/8': 'Quellenkritik systematisch, Perspektivenvergleich, Karikatur ab ca. 8, Sachurteil als Kurztext.',
      '9/10': '19./20. Jh., NS und Holocaust, Darstellungen und Kontroversen, Werturteil mit Gegenwartsbezug, Geschichtskultur.',
      Oberstufe: 'Historikerkontroversen, Theorien, Abiturformate (Quelleninterpretation, Darstellungsanalyse, Erörterung), AFB III verpflichtend.'
    },
    schulformHinweise: {
      gymnasium: 'Längere Textquellen, früh Darstellungen.',
      realschule: 'Stärker gegliederte Aufgaben, gekürzte Quellen, Wortspeicher.',
      hauptschule: 'Bild- und Sachquellen vor Text, Personalisierung, Satzanfänge für Urteile, kleine Schritte.',
      foerderLernen: 'Bild- und Sachquellen, Leichte Sprache, Satzanfänge, sehr kleine Schritte.',
      integriert: 'Oft in Gesellschaftslehre integriert – Geschichte als eine Perspektive.'
    },
    nieRegeln: [
      NIE_BEGRIFFE_ZUERST,
      NIE_LEITFRAGE,
      'Nie das Werturteil vor dem Sachurteil.',
      'Beurteilen (ohne persönlichen Wertbezug) und bewerten (mit offengelegten Maßstäben) nie vermischen.',
      NIE_UEBERWAELTIGEN
    ],
    belege: [
      { aussage: 'Verlaufsmodelle: historische Fragestellung, Analyseteil, Diskussion/Reflexion; Fragenbündel wird am Ende ausgewertet', url: Q.geFriedrichPlanung },
      { aussage: 'Einstiege in Unterrichtsreihen Geschichte', url: Q.geFriedrichEinstiege },
      { aussage: 'Operatoren: beurteilen ohne persönlichen Wertbezug, bewerten mit Offenlegen der Maßstäbe', url: Q.geOperatoren },
      { aussage: 'Beutelsbacher Konsens (Überwältigungsverbot, Kontroversität, Schülerorientierung)', url: Q.beutelsbach }
    ],
    pruefungen: ['beutelsbacher']
  },
  {
    id: 'politik',
    name: 'Politik / Wirtschaft / Sozialkunde / Gesellschaftslehre',
    faecher: ['politik', 'wirtschaft', 'gesellschaftslehre'],
    reihentypen: [
      {
        id: 'konfliktanalyse',
        label: 'Konfliktanalyse (Reinhardt)',
        phasen: [
          'Konfrontation mit dem Konflikt',
          'Analyse mit Kategorien (Akteure, Interessen, Macht, Recht, Lösungen)',
          'Stellungnahme/Urteil',
          'Kontroversverfahren (Debatte, Rollenspiel, Talkshow)',
          'Generalisierung vom Fall zur Struktur'
        ],
        beleg: Q.konfliktanalyse
      },
      { id: 'fallanalyse', label: 'Fallanalyse', phasen: ['Fall', 'Analyse', 'Verallgemeinerung', 'Urteil', 'Rückbezug auf den Fall'], beleg: Q.lpbMethoden },
      { id: 'problemstudie', label: 'Problemstudie / Politikzyklus', phasen: ['Problem', 'Auseinandersetzung der Akteure', 'Entscheidung', 'Bewertung und Reaktion', 'neues Problem'] },
      { id: 'planspiel', label: 'Planspiel / Entscheidungsspiel', phasen: ['Ausgangslage, Rollen', 'Vorbereitung der Positionen', 'Spielphase', 'Auswertung und Reflexion', 'Übertragen auf die Wirklichkeit'], beleg: Q.lpbMethoden },
      { id: 'debatte', label: 'Pro-Contra-Debatte', phasen: ['Strittige Frage, erstes Meinungsbild', 'Argumente an Material erarbeiten', 'Debatte', 'Auswertung, zweites Meinungsbild, Urteil'], beleg: Q.lpbMethoden },
      { id: 'erkundung', label: 'Erkundung / Expertenbefragung', phasen: ['Frage, Erkundung planen', 'Erkundung/Befragung', 'Auswerten', 'Urteil oder Handlungsprodukt'], beleg: Q.lpbMethoden },
      {
        id: 'gl-perspektiven',
        label: 'Gesellschaftslehre integriert: Leitfrage → 2–3 Fachperspektiven → Vernetzung',
        phasen: ['Lebensweltliche Leitfrage', 'Erarbeitung aus 2–3 Fachperspektiven (Karte, Quelle, Fall)', 'Zusammenführen (Concept Map, Mystery)', 'Urteil oder Handlungsprodukt']
      }
    ],
    einstiege: [
      'aktueller Fall, Zeitungsmeldung, Social-Media-Post',
      'Karikatur zum Konflikt',
      'Positionslinie/Meinungsbarometer (am Ende wiederholen)',
      'kurzer Nachrichtenclip',
      'Fall aus der Lebenswelt (Kl. 5–7)',
      'Statistik mit überraschendem Befund',
      'Dilemma/Entscheidungssituation'
    ],
    ungeeigneteEinstiege: [
      'Begriffskarten ohne Fall',
      'Schaubild des politischen Systems als Erstes',
      'Lehrermeinung zum Thema',
      'einseitiges Material ohne Gegenposition'
    ],
    materialarten: [
      'Fallbeispiele, Zeitungsartikel, Pro/Contra-Kommentare',
      'Karikaturen',
      'Statistiken, Infografiken, Schaubilder',
      'Gesetzestexte, Grundgesetz, Urteile',
      'Parteiprogramme, Positionen von Verbänden',
      'Interviews, Reden',
      'Wirtschaft: Marktdiagramme, Haushaltsbudgets, Unternehmensdaten'
    ],
    methoden: [
      'Konfliktanalyse, Fallanalyse, Problemstudie',
      'Pro-Contra-Debatte, Talkshow, Fishbowl',
      'Planspiel, Rollenspiel',
      'Karikatur- und Statistikanalyse',
      'Positionslinie, Placemat',
      'Expertenbefragung, Erkundung',
      'Leserbrief/Stellungnahme schreiben'
    ],
    sicherung: [
      'Analyseraster (Akteure – Interessen – Lösungen)',
      'Schaubild NACH der Fallarbeit',
      'Pro-Contra-Tabelle mit Gewichtung',
      'Begriffskarten nach der Analyse',
      'Urteil schriftlich mit Kriterien'
    ],
    abschlussprodukte: [
      'begründetes Urteil, Leserbrief, Kommentar',
      'Debattenbeitrag',
      'Plakat, Infografik, Erklärvideo',
      'Brief an Abgeordnete, Antrag an SV/Gemeinde',
      'Oberstufe: Problemerörterung, Materialanalyse mit Urteil'
    ],
    lernkartenNutzung: 'Institutionen und Begriffe nach der Fallphase, gut zur Wiederholung – kein Einstieg.',
    stufenUnterschiede: {
      '5/6': 'Nahraum (Klasse, Schule, Gemeinde, Kinderrechte, Medien), einfache Urteile („Ich finde …, weil …").',
      '7/8': 'Gemeinde/Land, Jugend und Recht, Konsum/Markt, einfache Konfliktanalyse.',
      '9/10': 'Bund, Wahlen, Parteien, Sozialstaat, EU, Wirtschaftsordnung; vollständige Konfliktanalyse, Debatte.',
      Oberstufe: 'Theorien (Demokratie, Wirtschaft), Soziologie, Abiturformat (Analyse + Erörterung).'
    },
    schulformHinweise: {
      integriert: 'Gesellschaftslehre: Problem aus mehreren Fachperspektiven (Erdkunde, Geschichte, Politik) in den Blick nehmen.',
      hauptschule: 'Lebensweltfälle, Erkundung und Rollenspiel, Satzbausteine für Urteile, Berufs- und Wirtschaftsbezug.',
      foerderLernen: 'Lebensweltfälle, Handlungsorientierung, Satzbausteine für Urteile.',
      gymnasium: 'Kriterien des Urteils (Effizienz, Legitimität) ausdrücklich machen.'
    },
    nieRegeln: [
      NIE_BEGRIFFE_ZUERST,
      NIE_LEITFRAGE,
      NIE_UEBERWAELTIGEN,
      'Nie Material, das nur eine Position zeigt – was in Gesellschaft kontrovers ist, erscheint kontrovers.',
      'Nie Institutionenkunde ohne Fall oder Problem.'
    ],
    belege: [
      { aussage: 'Beutelsbacher Konsens', url: Q.beutelsbach },
      { aussage: 'Konfliktanalyse als Makromethode', url: Q.konfliktanalyse },
      { aussage: 'Makromethoden Fallanalyse, Planspiel, Debatte, Erkundung, Expertenbefragung', url: Q.lpbMethoden },
      { aussage: 'Gesellschaftslehre integriert (NRW)', url: Q.glNrw }
    ],
    pruefungen: ['beutelsbacher']
  },
  {
    id: 'erdkunde',
    name: 'Erdkunde / Geographie',
    faecher: ['erdkunde'],
    reihentypen: [
      {
        id: 'raumanalyse',
        label: 'Raumbezogene Leitfrage → Orientierung → Raumanalyse → Bewertung',
        phasen: [
          'Problemorientierter Einstieg mit raumbezogener Leitfrage',
          'Topographische Orientierung (Atlas, Karte)',
          'Raumanalyse an Karten, Diagrammen, Bildern, Texten',
          'Vernetzung/Wirkungsgefüge (Mensch-Umwelt)',
          'Beurteilen/Bewerten (Nutzungskonflikt, Nachhaltigkeit)',
          'Transfer auf einen anderen Raum, Handeln'
        ],
        beleg: Q.dgfgSek1
      },
      { id: 'mystery', label: 'Mystery', phasen: ['Mystery-Leitfrage', 'Informationskarten in Gruppen ordnen', 'Wirkungsgefüge erklären', 'Bewerten, Rückbezug'], beleg: Q.mystery },
      { id: 'exkursion', label: 'Exkursion / Feldarbeit', phasen: ['Leitfrage zum Nahraum', 'Erkundung planen', 'Kartieren, messen, befragen', 'Auswerten, präsentieren'] },
      { id: 'nutzungskonflikt', label: 'Planspiel Nutzungskonflikt', phasen: ['Konflikt um einen Raum', 'Interessen an Material erarbeiten', 'Rollenspiel/Planspiel', 'Bewerten, Lösungen'] }
    ],
    einstiege: [
      'Foto/Luft-/Satellitenbild mit Irritation',
      'Mystery-Frage',
      'Nachricht zu Naturereignis',
      'Produkt/Warenkette („Wo kommt das her?")',
      'Klimadiagramm-Rätsel',
      'Kartenvergleich früher/heute'
    ],
    ungeeigneteEinstiege: ['Begriffskarten ohne Raumbezug', 'Topographie-Pauken als Reiheneinstieg', 'Länder-Steckbrief „Alles über Land X" ohne Frage'],
    materialarten: [
      'physische und thematische Karten, Atlas, digitale Karten/GIS',
      'Klimadiagramme, Profile, Blockbilder',
      'Statistiken, Bevölkerungspyramiden',
      'Luft- und Satellitenbilder, Fotos',
      'Wirkungsgefüge, Modelle',
      'Raumbeispiele, Reportagen',
      'Modellversuche (Erosion, Treibhauseffekt)'
    ],
    methoden: [
      'Karten- und Atlasarbeit',
      'Klimadiagramm zeichnen und auswerten',
      'Diagramm- und Bildauswertung',
      'Wirkungsgefüge erstellen',
      'Mystery',
      'Rollenspiel zu Nutzungskonflikten',
      'Exkursion, Kartierung, Befragung'
    ],
    sicherung: ['Wirkungsgefüge/Pfeildiagramm', 'Kartenskizze', 'Merkbild eines Modells', 'Begriffskarten mit Skizze nach der Erarbeitung', 'Topographie-Merkkarte als Daueraufgabe'],
    abschlussprodukte: ['Erklärtext zum Wirkungsgefüge', 'eigene thematische Karte', 'Plakat, Infografik, Erklärvideo', 'Bewertung eines Nutzungskonflikts', 'Oberstufe: materialgestützte Raumanalyse mit Bewertung'],
    lernkartenNutzung: 'Fachbegriffe und Topographie (Lagekarten mit Ausschnitt) nach der Erarbeitung; Topographie als wiederkehrende Kartenübung.',
    stufenUnterschiede: {
      '5/6': 'Orientierung (Gradnetz, Maßstab), Heimatraum, Deutschland/Europa, einfache Klimadiagramme, Bilder vor Text.',
      '7/8': 'Landschafts- und Klimazonen, Naturgefahren, Entwicklungsunterschiede, Mystery einführen.',
      '9/10': 'Globalisierung, Stadt, Migration, Klimawandel, Nachhaltigkeit, Bewertungsaufgaben.',
      Oberstufe: 'Systemdenken, Raumanalyse mit vielen Materialien, Modelle und Theorien, GIS, Abiturformat.'
    },
    schulformHinweise: {
      hauptschule: 'Vereinfachte Bild- und Kartenarbeit, Anschauung (Modell, Versuch), Nahraum, Topographie in kleinen Paketen.',
      foerderLernen: 'Viel Anschauung, Nahraum, kleine Topographie-Pakete.',
      integriert: 'Teils in Gesellschaftslehre integriert.'
    },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, 'Nie länderkundliches Abarbeiten (Lage – Klima – Relief – Wirtschaft) ohne Leitfrage.', NIE_UEBERWAELTIGEN],
    belege: [
      { aussage: 'Sechs Kompetenzbereiche (u. a. räumliche Orientierung, Beurteilung/Bewertung, Handlung)', url: Q.dgfgSek1 },
      { aussage: 'Mystery als Methode', url: Q.mystery },
      { aussage: 'Beutelsbacher Konsens gilt auch für Bewertungen', url: Q.beutelsbach }
    ],
    pruefungen: ['beutelsbacher']
  },
  {
    id: 'religion',
    name: 'Religion (evangelisch/katholisch)',
    faecher: ['religion'],
    reihentypen: [
      {
        id: 'korrelation',
        label: 'Erfahrung → Tradition → Erschließung → Korrelation → Position',
        phasen: [
          'Lebensweltlicher Einstieg, existenzielle Frage',
          'Begegnung mit der Tradition (Bibeltext, Glaubenszeugnis, Kunstwerk)',
          'Erschließung (Auslegung, Kontext, verschiedene Deutungen)',
          'Korrelation: Tradition und Erfahrung deuten sich gegenseitig',
          'Begründete eigene Position (ohne Bekenntniszwang)',
          'Gestaltung/Ausdruck (freiwillig)'
        ]
      },
      {
        id: 'elementarisierung',
        label: 'Elementarisierung als Planungsraster',
        phasen: ['Elementare Strukturen', 'Elementare Erfahrungen', 'Elementare Zugänge', 'Elementare Wahrheiten', 'Elementare Lernformen'],
        beleg: Q.elementarisierung
      },
      { id: 'bibel', label: 'Bibelreihe', phasen: ['Lebensfrage', 'Bibeltext begegnen', 'Text erschließen', 'Deuten heute', 'Gestalten'] },
      { id: 'symbol', label: 'Symbol-/Kirchenraumreihe', phasen: ['Symbol oder Raum erleben', 'Bedeutungen erschließen', 'In der Tradition deuten', 'Eigenes Verständnis gestalten'] }
    ],
    einstiege: ['lebensweltliche Situation, Foto, Fallgeschichte', 'Lied/Popsong mit religiösem Motiv', 'Kunstwerk', 'existenzielle Frage als Impuls', 'Symbol/Gegenstand', 'Kirchenraum, Begegnung'],
    ungeeigneteEinstiege: ['Begriffskarten (Sakrament, Rechtfertigung)', 'Bibeltext ohne Lebensbezug', 'Bekenntnisfragen an Einzelne („Glaubst du an Gott?")', 'Fakten-Quiz zur Kirchengeschichte'],
    materialarten: [
      'biblische Texte',
      'kirchliche Dokumente, Katechismus (ev./kath. unterschiedlich)',
      'Bilder, Kunstwerke, Kirchenarchitektur',
      'Lieder, Gebete',
      'Biografien, Fallgeschichten',
      'Texte und Sachtexte anderer Religionen',
      'Filme, Popkultur',
      'theologische Texte (Oberstufe)'
    ],
    methoden: ['Bibelarbeit/Texterschließung', 'Bibliodrama, Standbild', 'Bilderschließung', 'Symboldidaktik', 'kreatives Schreiben', 'Dilemmadiskussion', 'Theologisieren mit Kindern', 'Stationen (Weltreligionen)'],
    sicherung: ['Tafelbild Erfahrung ↔ Tradition', 'Merksätze, Begriffskarten nach der Erarbeitung', 'Heft/Portfolio (eigene Gedanken getrennt von Merkwissen)', 'Vergleichstabelle (Religionen, Konfessionen)'],
    abschlussprodukte: ['begründete Stellungnahme', 'Psalm, modernes Gleichnis, Comic, Collage', 'Plakat/Ausstellung', 'Erklärvideo, Hörspiel', 'Oberstufe: Interpretation theologischer Positionen, Erörterung'],
    lernkartenNutzung: 'Fachbegriffe, biblische Bücher und Personen, Kirchenjahr – nach der Erarbeitung; Glaubensaussagen als Wissen („Christen glauben, dass …"), nie als Bekenntnis der Lernenden.',
    stufenUnterschiede: {
      '5/6': 'Biblische Erzählungen, Kirchenjahr, Judentum/Islam, Schöpfung; erzählen, gestalten, Symbole.',
      '7/8': 'Propheten, Reformation, Gewissen, Gleichnisse; Bilderschließung, Dilemma.',
      '9/10': 'Gottesfrage/Theodizee, Tod und Auferstehung, Ethik, Kirche im NS; Urteile.',
      Oberstufe: 'Gotteslehre, Christologie, Anthropologie, Ethik, Religionskritik; theologische Texte, Erörterung.'
    },
    schulformHinweise: {
      hauptschule: 'Erzählen, Symbole, ganzheitliche Methoden, kurze Texte, Bibel in einfacher Sprache.',
      foerderLernen: 'Erzählen, Symbole, Bibel in einfacher Sprache.',
      integriert: 'Oft konfessionell-kooperativ: beide Konfessionen fair darstellen.'
    },
    nieRegeln: [
      NIE_BEGRIFFE_ZUERST,
      NIE_LEITFRAGE,
      'Nie ein Bekenntnis verlangen oder bewerten: keine Aufgabe „Glaubst du …? Begründe." – gefragt wird nach Deutungen; Gebet, Stille und persönliche Äußerungen sind freiwillig und unbewertet.',
      'Nie eine Konfession oder Religion abwerten.'
    ],
    belege: [{ aussage: 'Elementarisierung (Nipkow/Schweitzer) mit fünf Dimensionen', url: Q.elementarisierung }],
    pruefungen: ['bekenntnis']
  },
  {
    id: 'ethik',
    name: 'Ethik / Werte und Normen / Praktische Philosophie / Philosophie',
    faecher: ['ethik', 'werte-und-normen', 'philosophie'],
    reihentypen: [
      {
        id: 'fuenf-finger',
        label: 'Problem → Vorverständnis → Begriffe → Positionen → Argumentieren → Urteil (Fünf-Finger-Modell)',
        phasen: [
          'Problematisierung: Phänomen/Fall/Dilemma, Frage formulieren (phänomenologisch)',
          'Eigene Positionen, Vorverständnis sammeln',
          'Begriffsklärung selbst erarbeiten (analytisch)',
          'Auseinandersetzung mit Positionen und Texten (hermeneutisch)',
          'Argumentieren, Einwände prüfen (dialektisch)',
          'Urteil, Gedankenexperiment, eigener Entwurf (spekulativ)'
        ],
        beleg: Q.martens
      },
      {
        id: 'dilemma',
        label: 'Dilemmadiskussion (KMDD)',
        phasen: ['Dilemma präsentieren', 'erste Abstimmung', 'Gruppen pro/contra', 'Plenumsdiskussion mit Regeln', 'beste Gegenargumente würdigen', 'zweite Abstimmung, Reflexion'],
        beleg: Q.kmdd
      },
      { id: 'sokratisch', label: 'Sokratisches Gespräch', phasen: ['Allgemeine Frage', 'Konkretes Beispiel', 'Gemeinsame Begriffsarbeit', 'Konsens oder offene Punkte festhalten'] },
      { id: 'gedankenexperiment', label: 'Gedankenexperiment-Reihe', phasen: ['Gedankenexperiment', 'Intuitionen sammeln', 'Positionen erarbeiten', 'Urteil, eigenes Experiment entwerfen'] }
    ],
    einstiege: ['Dilemmageschichte', 'Gedankenexperiment', 'Fall/Zeitungsmeldung (Bio-, Tier-, Medienethik)', 'provokante These/Zitat', 'Bild, Kurzfilm, Werbung', 'Positionslinie', 'Kinderfrage („Darf man lügen?")'],
    ungeeigneteEinstiege: ['Begriffskarten mit fertigen Definitionen (Begriffsklärung ist selbst Lernziel)', 'Philosophenbiografie', 'Theorie zuerst (Kant-Text ohne Problem)', 'Lehrerposition als „richtige" Antwort'],
    materialarten: ['Dilemmageschichten, Fälle', 'Gedankenexperimente', 'philosophische Primärtexte (gekürzt; ab 9/10 Originalauszüge)', 'literarische Texte, Fabeln, Jugendbücher', 'Bilder, Kurzfilme', 'Sachtexte, Statistiken', 'religionskundliche Texte (neutral)', 'Menschenrechte, Grundgesetz'],
    methoden: ['Dilemmadiskussion', 'sokratisches/philosophisches Gespräch', 'Begriffsanalyse (Beispiel, Gegenbeispiel, Grenzfall)', 'Gedankenexperiment', 'Argumentrekonstruktion', 'Positionslinie, Debatte, Fishbowl', 'Essay, philosophisches Tagebuch'],
    sicherung: ['selbst erarbeitete Definition, danach Begriffskarte', 'Argumentationsschema (These, Begründung, Beispiel, Einwand)', 'Positionen-Tabelle', 'Begriffsnetz', 'eigene Position vorher/nachher'],
    abschlussprodukte: ['begründetes Urteil zum Dilemma', 'philosophischer Essay (ab 9/10)', 'Lexikon „Was ist …?"', 'Utopie/Regelwerk entwerfen', 'Debatte mit Reflexion', 'Oberstufe: Textinterpretation + Erörterung'],
    lernkartenNutzung: 'Begriffe und Positionen (Philosoph + Kernaussage) erst nach der eigenen Begriffsarbeit; Karten mit Beispiel und Gegenbeispiel.',
    stufenUnterschiede: {
      '5/6': 'Philosophieren mit Kindern, Ich/Gemeinschaft, Gefühle, Natur/Tiere; Geschichten, Bilder, Gespräch.',
      '7/8': 'Gewissen, Freiheit, Gerechtigkeit, Medien; Dilemmadiskussion, kurze Philosophentexte.',
      '9/10': 'Ethische Theorien (Pflicht, Nutzen, Tugend), angewandte Ethik, Menschenrechte, Sinn und Tod.',
      Oberstufe: 'Erkenntnistheorie, Anthropologie, Staatsphilosophie, Ethik; Primärtexte, Essay, Abiturformat.'
    },
    schulformHinweise: {
      hauptschule: 'Konkrete Fälle, Bild- und Geschichtenimpulse, Gesprächsregeln, Satzanfänge für Argumente.',
      foerderLernen: 'Konkrete Fälle, Bilder, Gesprächsregeln, Satzanfänge.',
      gymnasium: 'Früher Primärtexte und Argumentrekonstruktion.'
    },
    nieRegeln: [
      NIE_BEGRIFFE_ZUERST,
      NIE_LEITFRAGE,
      NIE_UEBERWAELTIGEN,
      'Nie eine Position als die richtige ausgeben; das Fach ist weltanschaulich neutral, Religionen werden religionskundlich dargestellt.'
    ],
    belege: [
      { aussage: 'Fünf-Finger-Modell nach Martens', url: Q.martens },
      { aussage: 'Konstanzer Methode der Dilemmadiskussion (KMDD)', url: Q.kmdd },
      { aussage: 'Werte und Normen: weltanschaulich neutral, religionskundlich', url: Q.wun },
      { aussage: 'Beutelsbacher Konsens maßgeblich für Werturteile', url: Q.beutelsbach }
    ],
    pruefungen: ['beutelsbacher']
  },
  // ------------------------------------------------------------------ Sprachen
  {
    id: 'deutsch',
    name: 'Deutsch',
    faecher: ['deutsch'],
    reihentypen: [
      {
        id: 'literatur',
        label: 'Literaturreihe',
        phasen: [
          'Leseerwartung wecken (Cover, Titel, erster Satz, Problemfrage)',
          'Erstbegegnung, subjektiver Leseeindruck',
          'Texterschließung: Inhalt, Handlung, Figuren',
          'Vertiefung: Erzählperspektive, Sprache, Motive, Kontext',
          'Handlungs- und produktionsorientierte Aufgaben',
          'Literarisches Gespräch über eine offene Deutungsfrage',
          'Schreibaufgabe (Inhaltsangabe → Charakterisierung → Interpretation je Stufe)'
        ]
      },
      {
        id: 'schreiben',
        label: 'Schreibreihe',
        phasen: ['Schreibanlass klären (Adressat, Zweck, Textsorte)', 'Mustertext untersuchen → Checkliste', 'Teilfertigkeiten üben', 'Planen', 'Formulieren (Rohfassung)', 'Überarbeiten (Schreibkonferenz, Textlupe)', 'Endfassung, Klassenarbeit im gleichen Format'],
        beleg: Q.kmkD
      },
      {
        id: 'sachtext',
        label: 'Sachtext-/Medienreihe',
        phasen: ['Vorwissen, Leseziel klären', 'Lesestrategien während des Lesens', 'Nach dem Lesen: zusammenfassen, Schaubild, bewerten', 'Anwendung: Referat, Plakat, Stellungnahme'],
        beleg: Q.kmkD
      },
      { id: 'sprache', label: 'Sprachreflexion (funktional)', phasen: ['Erscheinung im Text entdecken', 'Mit Proben untersuchen', 'Regel formulieren, sichern', 'Üben und im eigenen Text anwenden'] },
      { id: 'muendlich', label: 'Mündlichkeit', phasen: ['Anlass, Kriterien klären', 'Vortrag/Diskussion vorbereiten', 'Durchführen', 'Feedback nach Kriterien'] }
    ],
    einstiege: ['Buchcover, Titel, erster Satz → Hypothesen', 'Bild, Filmausschnitt, Hörbuch-Auszug', 'Problemfrage, Dilemma, These', 'Gegenstand aus dem Text', 'Schlagzeile, Post, Werbeanzeige', 'Stolperstelle/Fehler als Problem (Sprachreflexion)', 'Vorlesen mit Spannungsabbruch'],
    ungeeigneteEinstiege: ['Autorbiografie und Epoche als erste Stunde', 'Inhaltsangabe des Werks durch die Lehrkraft vorab', 'Grammatikregel ohne Text', 'Film zum Buch vor der Lektüre', 'Arbeitsblattfolgen ohne Leseanlass'],
    materialarten: ['Ganzschriften, Kurzprosa, Lyrik, Balladen, Fabeln, Märchen, Drama', 'Sach- und Gebrauchstexte, diskontinuierliche Texte', 'Film, Hörspiel, Podcast, Social Media, Werbung', 'Mustertexte, anonymisierte Schülertexte', 'Checklisten, Schreibpläne, Lesetagebuch-Vorlagen'],
    methoden: ['Lesetagebuch, reziprokes Lesen', '5-Schritt-Lesemethode', 'szenisches Interpretieren, Standbild, Hot Seat', 'Schreibkonferenz, Textlupe', 'Debatte, Fishbowl', 'Grammatikproben, Rechtschreibstrategien'],
    sicherung: ['Merkkasten Textsorten-/Gattungsmerkmale', 'Checkliste zur Textsorte (wird Bewertungsraster)', 'Figurenkonstellation, Handlungsverlauf', 'Lesetagebuch/Portfolio', 'Fachbegriffe-Glossar'],
    abschlussprodukte: ['eigener Text der Zieltextsorte', 'Buchvorstellung, Gedichtvortrag', 'Hörspiel/Kurzfilm', 'Interpretation, Erörterung, Sachtextanalyse (je Stufe)', 'Klassenarbeit im Format der Reihe'],
    lernkartenNutzung: 'Begrenzt: Fachbegriffe (Stilmittel, Wortarten, Erzählperspektive), Merkwörter/Rechtschreibung, Gattungsmerkmale – Sicherung, nie Kern einer Literatur- oder Schreibreihe.',
    stufenUnterschiede: {
      '5/6': 'Leseflüssigkeit, Märchen/Fabeln/Sagen/Kinderbuch, Erzählen, Wortarten, Rechtschreibstrategien; handlungsorientiert.',
      '7/8': 'Jugendbuch, Balladen, Kurzgeschichte, Sachtexte, Argumentieren, Inhaltsangabe; Satzbau, Komma.',
      '9/10': 'Kurzgeschichte, Novelle, Drama, Lyrik, Erörterung, Analyse; ESA/MSA-Formate, Bewerbung.',
      Oberstufe: 'Epochen, Pflichtlektüren, Sprachreflexion; Abiturformate (Interpretation, Analyse, Erörterung, materialgestütztes Schreiben).'
    },
    schulformHinweise: {
      gymnasium: 'Früher Analyse und Epochenbezug.',
      realschule: 'MSA-Formate, Formulierungshilfen, Schreibpläne, lebensnahe Sachtexte.',
      hauptschule: 'Leseförderung zentral, kurze Texte, Gebrauchstexte, Teilaufgaben statt geschlossener Aufsätze.',
      integriert: 'E-/G-Kurse: Differenzierung über Hilfen.',
      foerderLernen: 'Leichte Sprache, Bilder, Silbenhilfe, Vorlesen.',
      beruflich: 'Berufskommunikation, Sachtexte, Bewerbung, Protokoll.'
    },
    nieRegeln: [
      NIE_BEGRIFFE_ZUERST,
      NIE_LEITFRAGE,
      'Nie Schreiben ohne Planen, Formulieren und Überarbeiten.',
      'Nie Grammatik als losgelöste Regel – immer an Text oder Sprachhandlung.'
    ],
    belege: [
      { aussage: 'Kompetenzbereiche; Schreiben = planen, formulieren, überarbeiten; Lesestrategien vor/während/nach dem Lesen', url: Q.kmkD },
      { aussage: 'Abitur-Aufgabenarten (Interpretation, Analyse, Erörterung, materialgestütztes Schreiben)', url: Q.kmkDAbi }
    ]
  },
  {
    id: 'fremdsprachen',
    name: 'Moderne Fremdsprachen',
    faecher: MODERNE_FREMDSPRACHEN,
    reihentypen: [
      {
        id: 'zielaufgabe',
        label: 'Rückwärts von der Zielaufgabe (task-supported)',
        phasen: [
          'Zielaufgabe und Kompetenzschwerpunkt festlegen (rückwärts planen)',
          'Lead-in: Situation, Vorwissen, Wortfeld aktivieren',
          'Input: Hör-/Hörseh-/Lesetext mit pre-, while-, post-tasks',
          'Sprachmittel aufbauen: Chunks, Redemittel, Grammatik als Bedarf (Form nach Bedeutung)',
          'Üben vom gelenkten zum freien (enabling tasks)',
          'Zielaufgabe vorbereiten (Kriterien offenlegen) und durchführen',
          'Feedback, Fehlerfokus, Überarbeitung, Can-do-Reflexion'
        ],
        beleg: Q.kmkFs
      },
      { id: 'lektuere', label: 'Lektüre-/Filmreihe', phasen: ['Erwartungen wecken', 'Abschnittweise lesen/sehen mit Aufgaben', 'Figuren, Themen, Gestaltung', 'Kreative Zielaufgabe oder Analyse'] },
      { id: 'sprachmittlung', label: 'Sprachmittlungsreihe', phasen: ['Situation und Adressat', 'Deutsche Vorlage erschließen', 'Sinngemäß, adressatengerecht übertragen', 'Feedback nach Kriterien'], beleg: Q.kmkFs },
      { id: 'lehrwerk', label: 'Lehrwerks-Unit (Kl. 5–9/10)', phasen: ['Lead-in zum Unit-Thema', 'Texte und Wortschatz der Unit', 'Language focus nach Bedarf', 'Skills-Übungen', 'Unit-Aufgabe (Zielaufgabe)'] }
    ],
    einstiege: ['Bildimpuls mit offener Frage in der Zielsprache', 'kurzer Clip/Trailer (1–3 min)', 'Song (Unterstufe mit Bewegung)', 'Aussage/Statistik (ab Kl. 9)', 'Realia', 'Zielaufgabe ankündigen („At the end of this unit you will …")', 'Brainstorming zum Wortfeld', 'Umfrage („Find someone who …")'],
    ungeeigneteEinstiege: ['Grammatikregel als Startpunkt (Form vor Bedeutung)', 'Vokabelliste isoliert abfragen', 'langer Lesetext ohne Vorentlastung', 'Video über 5 min ohne Höraufgabe', 'Impuls, der nur Deutsch-Diskussion auslöst'],
    materialarten: ['Lehrwerkseinheit als Rückgrat (Kl. 5–9/10)', 'authentische Texte (Artikel, Blogs, Posts, Werbung)', 'Audio: Podcasts, Interviews', 'Video: Clips, Kurzfilme, Nachrichten', 'Easy Readers, Jugendroman, Graphic Novel, Kurzgeschichten, Lyrik', 'Songs', 'deutsche Vorlagen für Sprachmittlung', 'Redemittelkarten, Wortfeld-Mindmaps', 'Checklisten zur Zielaufgabe'],
    methoden: ['Think-Pair-Share, Kugellager', 'Rollenspiel, Info-Gap, Interview', 'Jigsaw mit Texten', 'Lese-/Hörstrategien (skimming, scanning)', 'Writing process mit peer editing', 'Sprachmittlung adressatenbezogen', 'TPR, Chants, Spiele (Unterstufe)', 'Sprachaufnahmen, Videoproduktion'],
    sicherung: ['Redemittel-/Wortschatzseite (Chunks)', 'Grammatik-Merkkasten nach induktiver Entdeckung', 'Lernkarten mit Kontextsatz', 'Can-do-Selbsteinschätzung', 'Feedback zur Zielaufgabe mit Raster'],
    abschlussprodukte: ['Präsentation, Poster, Gallery Walk', 'Dialog, Rollenspiel, Interview (live/Audio/Video)', 'E-Mail, Blogeintrag, Post', 'Video, Podcast', 'Flyer, Reiseführer, Steckbrief', 'Sprachmittlungsprodukt', 'Oberstufe: Kommentar, Rede, Analyse, Debatte'],
    lernkartenNutzung: 'Fester Sicherungsbaustein mit Kontext: Wörter aus dem Wortfeld der Zielaufgabe als Chunks mit Beispielsatz und Aussprache, gezielt vor der Zielaufgabe – nicht Ziel der Reihe. [belegt: Wortschatz als lexiko-grammatische Einheiten]',
    stufenUnterschiede: {
      Grundschule: 'Vorrang mündlich, Schriftbild unterstützend; Lieder, Reime, Storytelling, TPR; kleine Produkte; Ende Kl. 4 etwa A1.',
      '5/6': 'Lehrwerk als Rückgrat, viele kurze Sprechanlässe, einfache Zielaufgaben (Steckbrief, Dialog, E-Mail), Grammatik in kleinen Portionen.',
      '7/8': 'Längere Texte, Easy Readers, Sprachmittlung systematisch, Schreibprozess, Zielaufgaben mit Recherche.',
      '9/10': 'Authentische Texte, Film, Jugendroman, Sachthemen, Argumentation, ESA/MSA-Formate.',
      Oberstufe: 'Themenzentriert nach Abiturvorgaben: Literatur, Sachtexte, Film; Analyse, Kommentar, Sprachmittlung, Kommunikationsprüfung.'
    },
    schulformHinweise: {
      gymnasium: 'Volle Progression bis B2/C1, früh Lektüren.',
      realschule: 'MSA-Ziel B1, Lehrwerksbindung, mehr Hilfen, berufsnahe Zielaufgaben.',
      hauptschule: 'ESA-Ziel A2: kurze Phasen, viel Wiederholung, visuelle Stützen, lebenspraktische Zielaufgaben.',
      integriert: 'E-/G-Kurse (NRW: Ende 10 E-Kurs B1, G-Kurs A2 mit Anteilen B1).',
      foerderLernen: 'Stark visualisiert, Chunks und Routinen, handlungsnahe Zielaufgaben.',
      beruflich: 'Berufsbezogene Situationen (Kundengespräch, Mail, Bewerbung).'
    },
    nieRegeln: [
      NIE_BEGRIFFE_ZUERST,
      NIE_LEITFRAGE,
      'Nie Grammatik als Reihenthema oder als Einstieg: Sprachmittel dienen der Kommunikation (Ausnahme nur auf Wunsch der Lehrkraft, dann in eine Situation eingebettet).',
      'Nie Sprachmittlung als wörtliches Übersetzen.'
    ],
    belege: [
      { aussage: 'Funktionale kommunikative Kompetenz; sprachliche Mittel haben dienende Funktion; Wortschatz als lexiko-grammatische Einheiten; gestufte Lernaufgaben', url: Q.kmkFs },
      { aussage: 'Pre-tasks führen auf die finale Aufgabe hin', url: Q.goethePreTask },
      { aussage: 'GER-Ziele: ESA im Wesentlichen A2, MSA B1', url: Q.kmkFs },
      { aussage: 'Abitur fortgeführte Fremdsprache: B2, Englisch rezeptiv teils C1', url: Q.kmkFsAbi },
      { aussage: 'Bildungsstandards nur für Englisch/Französisch; für weitere Fremdsprachen nur EPA', url: Q.kmkFsUebersicht }
    ],
    fachHinweise: {
      englisch: 'GER [belegt]: ESA ≈ A2, MSA ≈ B1, Abitur B2 (rezeptiv teils C1).',
      franzoesisch: 'GER [belegt]: als erste Fremdsprache ESA ≈ A2, MSA ≈ B1, Abitur B2; als 2. Fremdsprache niedriger (Faustregel: Ende 10 etwa A2/A2+).',
      spanisch: 'Keine KMK-Bildungsstandards, nur EPA [belegt]; Muster wie Englisch/Französisch mit niedrigerem GER-Ziel (Faustregel: Ende 10 etwa A2/A2+, Abitur B1/B1+).',
      italienisch: 'Keine KMK-Bildungsstandards, nur EPA [belegt]; niedrigeres GER-Ziel (Faustregel: Ende 10 etwa A2, Abitur B1).',
      russisch: 'Nur EPA [belegt]; Schrifterwerb Kyrillisch braucht eigene Phasen am Anfang; GER-Ziel niedriger (Faustregel).',
      chinesisch: 'Schrifterwerb (Pinyin, Zeichen) braucht eigene Phasen am Anfang; GER-Ziel deutlich niedriger (Faustregel).',
      japanisch: 'Schrifterwerb (Kana, Kanji) braucht eigene Phasen; GER-Ziel deutlich niedriger (Faustregel).',
      arabisch: 'Schrifterwerb (arabische Schrift, rechts nach links) braucht eigene Phasen; GER-Ziel niedriger (Faustregel).',
      neugriechisch: 'Schrifterwerb (griechisches Alphabet) am Anfang; GER-Ziel niedriger (Faustregel).',
      niederlaendisch: 'Muster wie Englisch/Französisch, GER-Ziel niedriger (Faustregel).',
      polnisch: 'Muster wie Englisch/Französisch, GER-Ziel niedriger (Faustregel).',
      tschechisch: 'Muster wie Englisch/Französisch, GER-Ziel niedriger (Faustregel).',
      portugiesisch: 'Muster wie Englisch/Französisch, GER-Ziel niedriger (Faustregel).',
      tuerkisch: 'Muster wie Englisch/Französisch; oft herkunftssprachliche Lernende – Niveaus stark gemischt (Faustregel).',
      daenisch: 'Muster wie Englisch/Französisch, GER-Ziel niedriger (Faustregel).'
    }
  },
  {
    id: 'alte-sprachen',
    name: 'Latein / Griechisch',
    faecher: ['latein', 'griechisch'],
    reihentypen: [
      {
        id: 'lektion',
        label: 'Lehrwerk-Lektion (Spracherwerb)',
        phasen: [
          'Sachthema/Realien der Lektion (Bild, Karte, Gegenstand)',
          'Lernwortschatz einführen (Ableitungen, Fremdwörter)',
          'Grammatik induktiv an Mustersätzen',
          'Vorerschließung des Lektionstextes (Personen, Sachfelder, Konnektoren, Tempusprofil)',
          'Übersetzung satzweise mit Konstruktionsmethode, deutsche Fassung verbessern',
          'Interpretation altersgemäß (Antike – heute)',
          'Übungen: Formen bilden/bestimmen, Satzanalyse'
        ]
      },
      {
        id: 'lektuere',
        label: 'Lektürereihe (Original-/Übergangslektüre)',
        phasen: ['Hinführung: Autor/Werk knapp, Leitfrage', 'Texterschließung (Dekodieren)', 'Übersetzung (Rekodieren)', 'Interpretation, Rezeption', 'Vergleich, Stellungnahme', 'Klausur: Übersetzung + Interpretationsaufgaben'],
        beleg: Q.latein
      }
    ],
    einstiege: ['Bild (Fresko, Mosaik, Vasenbild, Rezeptionsgemälde)', 'Karte', 'Realie (Münze, Öllampe, Inschrift)', 'Lehnwort-Rätsel', 'Filmausschnitt, Comic', 'Problemfrage Antike – heute', 'Sentenz'],
    ungeeigneteEinstiege: ['sofort übersetzen ohne Vorerschließung', 'lange Formentabelle ohne Text', 'kommunikatives Sprechen in der Zielsprache als Regel'],
    materialarten: ['Lehrwerk mit Lektionstexten', 'adaptierte Texte, Übergangslektüre', 'Originaltexte (Caesar, Ovid, Cicero …; Homer, Platon …)', 'Realien, Karten, Inschriften', 'Rezeptionsdokumente', 'Begleitgrammatik, Formentabellen', 'Grundwortschatz', 'zweisprachige Ausgaben'],
    methoden: ['Satzanalyse (Einrück-, Kästchen-, Pendelmethode)', 'Vorerschließung (Sachfelder, Konnektoren, Tempusrelief)', 'Übersetzungsvergleich', 'Stilmittel und Wirkung', 'Wortfamilien, Ableitungen', 'Rezeptionsvergleich, kreative Umsetzung'],
    sicherung: ['Grammatik-Merkkasten + Formentabelle', 'Lernwortschatz je Lektion, kumulativ', 'verbesserte Musterübersetzung', 'Interpretationsergebnisse als Schaubild', 'Kurztests'],
    abschlussprodukte: ['Übersetzung + Interpretation (Klassenarbeit/Klausur)', 'Sachreferat zu Realien', 'Rezeptionsdokument erklären', 'Comic, Theaterszene, Brief einer Figur', 'eigene Übersetzung im Vergleich'],
    lernkartenNutzung: 'Sehr wichtig: Lernwortschatz mit Stammformen, Genitiv und Genus, Ableitungen, Beispielwendung; Formenkarten (Bestimmen mit allen Lesarten); kumulativ wiederholen – trotzdem nach der Begegnung im Text.',
    stufenUnterschiede: {
      '5/6': 'Spracherwerb mit Lehrwerk, viel Realien, Spiele, Lehnwortarbeit.',
      '7/8': 'Längere Lektionstexte, komplexe Satzanalyse (AcI, Partizipien, Abl. abs.).',
      '9/10': 'Abschluss Lehrbuch, Übergangslektüre, erste Originallektüre; Latinum je Land.',
      Oberstufe: 'Originallektüre nach Abiturvorgaben, Interpretation und Rezeption; Klausur Übersetzung + Interpretation.'
    },
    schulformHinweise: { gymnasium: 'Hauptort für Latein/Griechisch.', integriert: 'Latein als Wahlpflichtfach ab 6/7 möglich.' },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, 'Nie übersetzen ohne vorherige Erschließung.', 'Nie Übersetzung ohne Interpretation abschließen.'],
    belege: [
      { aussage: 'Texterschließung → Übersetzung → Interpretation; Lektürephasen', url: Q.latein },
      { aussage: 'Keine Bildungsstandards; EPA und Latinum/Graecum-Vereinbarung', url: Q.kmkFsUebersicht }
    ]
  },
  {
    id: 'daz',
    name: 'Deutsch als Zweitsprache',
    faecher: ['daz'],
    reihentypen: [
      {
        id: 'scaffolding',
        label: 'Makro-Scaffolding (Gibbons)',
        phasen: [
          'Bedarfsanalyse: Zielhandlung, nötige Wörter, Strukturen, Textmuster',
          'Lernstand',
          'Handlungsnaher Einstieg mit Bild, Realie, Situation',
          'Wortschatz mit Artikel, Plural, Chunks, Bildkarten',
          'Strukturen in Mustern üben',
          'Gestützt sprechen und schreiben (Redemittel, Wortgeländer)',
          'Anwenden in der Situation, Hilfen abbauen'
        ],
        beleg: Q.mercator
      }
    ],
    einstiege: ['Bild/Wimmelbild', 'Realie', 'Alltagssituation (Einkaufen, Arzt, Schule)', 'Lied/Reim', 'Video ohne Ton'],
    ungeeigneteEinstiege: ['lange Lesetexte ohne Bilder', 'abstrakte Grammatikregeln', 'bildungssprachlicher Lehrervortrag'],
    materialarten: ['Bildkarten, Wortkarten mit Artikelfarbe', 'DaZ-Lehrwerke', 'Texte in Leichter Sprache', 'Hörtexte mit Bild', 'Alltagsdokumente (Stundenplan, Speisekarte, Formular)'],
    methoden: ['Satzmuster, Satzbaukasten', 'generatives Schreiben', 'Rollenspiel', 'Wortgeländer, Satzanfänge'],
    sicherung: ['Wortschatzheft mit Artikel, Plural, Beispielsatz', 'Redemittelplakate', 'Lernkarten mit Bild und Ton'],
    abschlussprodukte: ['kurzer Dialog', 'Steckbrief', 'Bildbeschreibung', 'Mini-Präsentation', 'Formular ausfüllen'],
    lernkartenNutzung: 'Sehr sinnvoll: Bild + Wort + Artikel + Plural + Beispielsatz + Audio, verteilt wiederholen – nach der Begegnung in der Situation.',
    stufenUnterschiede: {
      Grundschule: 'Alphabetisierung und Grundwortschatz mit viel Bild und Bewegung.',
      '5/6': 'Grundstufe A1/A2, Alltags- und Schulsprache.',
      '7/8': 'A2/B1, Übergang in Fachsprache der Regelfächer.',
      '9/10': 'B1, Bildungssprache und Fachtexte, Berufsorientierung.',
      Oberstufe: 'Fachsprache und Bildungssprache für den Regelunterricht.'
    },
    schulformHinweise: { foerderLernen: 'Stark visualisiert, kleine Schritte.', beruflich: 'Berufssprache, Formulare, Kundengespräch.' },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, 'Nie Hilfen dauerhaft lassen – schrittweise abbauen.'],
    belege: [{ aussage: 'Makro- und Mikro-Scaffolding nach Gibbons, von Alltags- zu Bildungssprache', url: Q.mercator }]
  },
  // ------------------------------------------------------------------ MINT
  {
    id: 'mathematik',
    name: 'Mathematik',
    faecher: ['mathematik'],
    reihentypen: [
      {
        id: 'kernprozesse',
        label: 'Anknüpfen – Erkunden – Ordnen – Vertiefen (KOSIMA)',
        phasen: ['Anknüpfen: Vorwissen, Problem im Kontext', 'Erkunden: offene Aufgabe, eigene Wege, Vermutungen', 'Ordnen: Begriffe, Regeln, Verfahren sichern', 'Vertiefen: produktiv üben, anwenden, vernetzen', 'Reflektieren: Ich-kann-Checkliste'],
        beleg: Q.kosima
      },
      { id: 'modellieren', label: 'Modellierungsreihe', phasen: ['Reale Situation', 'Vereinfachen, mathematisieren', 'Mathematisch arbeiten', 'Interpretieren, validieren', 'Bericht'] },
      { id: 'lerntheke', label: 'Diagnose → Lerntheke → Test', phasen: ['Eingangsdiagnose', 'Lerntheke mit Förder-/Forderaufgaben', 'Vermischtes Üben', 'Selbstdiagnose, Test'] }
    ],
    einstiege: ['Problem mit echter Frage („Welcher Tarif lohnt sich?")', 'Muster/Phänomen (Zahlenmauer, Streichholzfolgen)', 'fehlerhafte Behauptung prüfen', 'Daten der Klasse erheben, Zufallsexperiment', 'Messen und Schätzen im Schulgebäude'],
    ungeeigneteEinstiege: ['Regel/Formel vorab, dann nur Einsetzen', 'Pseudokontext ohne echte Frage', 'Formelkarten', 'reine Wiederholungsabfrage'],
    materialarten: ['Erkundungsaufgabe, Forscherheft', 'Auftrag mit gestuften Hilfen', 'Wissensspeicher (Regel + Beispiel + Gegenbeispiel)', 'produktive Übungen, Blütenaufgaben, Fehlersuche', 'Darstellungswechsel Tabelle – Graph – Term – Situation', 'GeoGebra, Tabellenkalkulation', 'Checkliste mit Förder-/Forderaufgaben'],
    methoden: ['Ich-Du-Wir', 'Lerntheke', 'Stationenlernen', 'Mathekonferenz', 'Lernlandkarte', 'Partnerkontrolle'],
    sicherung: ['Merkkasten im Heft', 'Wissensspeicher', 'Musterlösung mit Begründung', 'Lernplakat', 'Begriffsnetz'],
    abschlussprodukte: ['Klassenarbeit/Test', 'Forscherheft', 'Modellierungsbericht', 'Präsentation einer Lösungsstrategie', 'Erklärvideo', 'Selbstdiagnose mit Rückmeldung'],
    lernkartenNutzung: 'Nach dem Ordnen: Begriff ↔ Definition, Formel ↔ Bedeutung der Variablen und Einheit, Regel ↔ Beispiel; Kopfrechen- und Grundwissenskarten zum Wachhalten.',
    stufenUnterschiede: {
      '5/6': 'Enaktiv – ikonisch – symbolisch, viel Material, kurze Erkundungen; Sicherung stark vorstrukturiert.',
      '7/8': 'Terme, Gleichungen, Proportionalität, Prozent; Darstellungswechsel; erste Begründungen.',
      '9/10': 'Funktionen, Pythagoras, Trigonometrie, Wahrscheinlichkeit; Modellierungskreislauf ausdrücklich.',
      Oberstufe: 'Analysis, Geometrie/Lineare Algebra, Stochastik; Herleitungen häufiger; Abiturformate (hilfsmittelfrei + mit WTR/CAS).'
    },
    schulformHinweise: {
      hauptschule: 'Alltagskontexte, kleinschrittige gestufte Hilfen, Rechnen mit Größen, wenig Formalisierung.',
      realschule: 'Balance aus Verfahren und Begründen.',
      gymnasium: 'Mehr Begründen, Beweisen, Verallgemeinern; Variablen früher.',
      foerderLernen: 'Handlungsorientierung, konkretes Material, Lebenspraxis (Geld, Zeit, Maße).',
      integriert: 'G-/E-Kurse: gestufte Hilfen und Forderaufgaben.'
    },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, 'Nie Formel vorgeben und nur einsetzen lassen, bevor erkundet wurde.'],
    belege: [{ aussage: 'Kernprozesse Anknüpfen – Erkunden – Ordnen – Vertiefen, „keine starre Chronologie"', url: Q.kosima }]
  },
  {
    id: 'naturwissenschaften',
    name: 'Naturwissenschaften (Biologie, Chemie, Physik, NaWi)',
    faecher: ['biologie', 'chemie', 'physik', 'naturwissenschaften'],
    reihentypen: [
      {
        id: 'forschend',
        label: 'Forschend-entdeckend (Erkenntnisgewinnung)',
        phasen: [
          'Phänomen/Kontext begegnen',
          'Fragestellung formulieren',
          'Hypothese aufstellen (Präkonzepte sichtbar)',
          'Untersuchung planen (ändern – messen – konstant halten)',
          'Durchführen (Experiment, Beobachtung, Modellversuch)',
          'Auswerten (Tabelle, Diagramm, Fehler)',
          'Deuten am Modell, Rückbezug zur Hypothese',
          'Vertiefen, vernetzen, bewerten'
        ],
        beleg: Q.nwKmk
      },
      { id: 'kontext', label: '… im Kontext (Chemie/Biologie/Physik im Kontext)', phasen: ['Begegnung', 'Neugier und Planung (Schülerfragen)', 'Erarbeitung', 'Vertiefung und Vernetzung (Basiskonzepte, Transfer)'], beleg: Q.chik },
      { id: 'bewertung', label: 'Bewertungsreihe (Umwelt, Gesundheit, Technik)', phasen: ['Problem aus Nachricht oder Alltag', 'Fachwissen erarbeiten', 'Positionen und Kriterien', 'Begründet bewerten'] }
    ],
    einstiege: ['Diskrepantes Ereignis/Demonstrationsexperiment', 'Alltagsphänomen, Bild, Kurzvideo', 'Lebewesen/Präparat (Bio)', 'Umweltproblem aus den Nachrichten', 'Schülervorstellungen erheben', 'technisches Gerät'],
    ungeeigneteEinstiege: ['Fachbegriff/Definition vorab', 'Versuchsanleitung mit vorweggenommenem Ergebnis', 'Effektshow ohne Fragestellung', 'Gefahrversuche oder Sezieren ohne Absprache'],
    materialarten: ['Versuchsanleitung (Material, Durchführung, Sicherheit, Beobachtungsauftrag)', 'Planungsbogen (Variablenkontrolle)', 'Messwerttabelle, Diagrammvorlage', 'Modelle (Teilchen-, Funktions-, Analogiemodelle)', 'gestufte Hilfen', 'Fachtexte, Schemata zum Beschriften', 'Simulationen, Smartphone-Messung', 'Mikroskopie, Bestimmungsschlüssel', 'Pro/Contra-Material zum Bewerten'],
    methoden: ['Schülerexperiment', 'Demonstrationsexperiment', 'Stationenlernen', 'Concept Cartoon', 'Predict-Observe-Explain', 'Gruppenpuzzle', 'Podiumsdiskussion (Bewertung)'],
    sicherung: ['Versuchsprotokoll', 'Ergebnissatz', 'beschriftete Skizze', 'Diagramm mit Deutung', 'Concept Map', 'Steckbrief'],
    abschlussprodukte: ['Forscherheft/Protokollmappe', 'gebautes Modell', 'Poster, Erklärvideo', 'Experimentiervorführung', 'Stellungnahme (Bewertung)', 'Test', 'Facharbeit (Oberstufe)'],
    lernkartenNutzung: 'Nach dem Deuten: Begriff ↔ Definition, Formel/Gleichung ↔ Bedeutung, Bild (Organ, Gerät, Schaltsymbol) ↔ Funktion, GHS-Piktogramme und Sicherheitsregeln.',
    stufenUnterschiede: {
      '5/6': 'Phänomene, beobachten, vergleichen, ordnen; Je-desto-Sätze; vorstrukturiertes Protokoll; meist integrierte NaWi.',
      '7/8': 'Erstes eigenes Planen (eine Variable), Teilchenmodell, Diagramme selbst anlegen.',
      '9/10': 'Hypothesengeleitet experimentieren, Modellkritik, quantitativ auswerten, Bewerten mit Kriterien.',
      Oberstufe: 'Fehlerbetrachtung, Mathematisierung, materialgestützte Aufgaben, Basiskonzepte, Abiturformate.'
    },
    schulformHinweise: {
      hauptschule: 'Alltags- und Berufsbezug, kurze Experimente mit klarer Anleitung, Bildprotokolle.',
      foerderLernen: 'Kurze Experimente mit Bildanleitung, Bildprotokolle, Fachsprache dosiert.',
      realschule: 'Balance qualitativ/quantitativ.',
      gymnasium: 'Theorie, Formalisierung, Modellkritik.',
      integriert: 'NaWi oft integriert bis Kl. 6–10.',
      beruflich: 'Fachrichtungsbezogene Kontexte (Ernährung, Technik, Gesundheit).'
    },
    nieRegeln: [
      NIE_BEGRIFFE_ZUERST,
      NIE_LEITFRAGE,
      NIE_RISU,
      'Nie Schülerversuche mit Stoffen, die für das Alter nicht zugelassen sind.',
      'Nie das Ergebnis eines Versuchs in der Anleitung vorwegnehmen.'
    ],
    belege: [
      { aussage: 'Kompetenzbereiche Sach-, Erkenntnisgewinnungs-, Kommunikations-, Bewertungskompetenz; Basiskonzepte; E1–E3', url: Q.nwKmk },
      { aussage: 'Chemie im Kontext: vier Phasen', url: Q.chik }
    ],
    fachHinweise: {
      biologie: 'Biologisches Zeichnen; Langzeitversuche über mehrere Stunden planen; Sexualerziehung mit Elterninformation.',
      chemie: 'Bewusst wechseln: Stoffebene (Beobachtung) ↔ Teilchenebene (Deutung) ↔ Symbolebene (Formel); Schutzbrille, GHS.',
      physik: 'Messreihe → Diagramm → Gesetz; Analogiemodelle; Smartphone-Sensoren.',
      naturwissenschaften: 'Themen um Phänomene (Wasser, Feuer, Sinne); Fachperspektiven Bio/Che/Phy im Thema; Schwerpunkt Arbeitsweisen.'
    },
    pruefungen: ['risu']
  },
  {
    id: 'informatik',
    name: 'Informatik',
    faecher: ['informatik'],
    reihentypen: [
      {
        id: 'problemloesen',
        label: 'Problem → Modellieren → Implementieren → Testen → Bewerten',
        phasen: ['Problem/Anwendung begegnen', 'Analysieren, modellieren', 'In kleinen Schritten implementieren (Use – Modify – Create)', 'Testen, Fehler suchen', 'Reflektieren, bewerten (Grenzen, Datenschutz)', 'Präsentieren, dokumentieren'],
        beleg: Q.giSek1
      },
      { id: 'unplugged', label: 'Unplugged-Reihe', phasen: ['Rätsel/Spiel ohne Computer', 'Prinzip entdecken', 'Formalisieren', 'Übertragen auf Programm oder Alltag'] },
      { id: 'projekt', label: 'Projekt (Programm, Roboter, App)', phasen: ['Idee, Anforderungen', 'Planung mit Meilensteinen', 'Umsetzung im Team', 'Test', 'Präsentation, Reflexion'] }
    ],
    einstiege: ['Alltagsfrage („Wie findet das Navi den Weg?")', 'Unplugged-Aktivität', 'fehlerhaftes Programm', 'Datenschutzfall', 'Roboter-/Microcontroller-Aufgabe'],
    ungeeigneteEinstiege: ['Syntax-Lehrgang ohne Problem', 'Bedienungsschulung als „Informatik"', 'Programm abtippen lassen'],
    materialarten: ['Unplugged-Material', 'Code-Vorlagen mit Lücken (Parsons)', 'Struktogramm, Flussdiagramm', 'Zustands-, Klassen-, ER-Diagramm', 'Testfälle', 'Lösungsbeispiele zum Verändern', 'Hilfekarten', 'Projektbeschreibung mit Meilensteinen'],
    methoden: ['Pair Programming', 'Use – Modify – Create', 'Unplugged', 'Code-Review', 'Debugging-Detektiv', 'Rollenspiel (Protokolle)'],
    sicherung: ['Merkkasten mit Begriff + Codebeispiel', 'Struktogramm', 'kommentierter Quelltext', 'Glossar', 'Cheat Sheet'],
    abschlussprodukte: ['lauffähiges Programm/Spiel', 'Roboter-/Microcontroller-Projekt', 'Datenbank, Webseite', 'Projektdokumentation', 'Erörterung (Informatik und Gesellschaft)'],
    lernkartenNutzung: 'Fachbegriffe, Syntax-Bausteine ↔ Bedeutung, Binär/Hex – nach der Erarbeitung.',
    stufenUnterschiede: {
      '5/6': 'Unplugged, blockbasiert (Scratch), Daten und Codierung, sicher im Netz.',
      '7/8': 'Block- → textbasiert, Robotik, einfache Tabellen/Datenbanken.',
      '9/10': 'Python/Java, SQL, Netzwerke, Verschlüsselung, KI-Grundlagen.',
      Oberstufe: 'OOP, Datenstrukturen, Automaten, theoretische Informatik, Projekte.'
    },
    schulformHinweise: { hauptschule: 'Blockbasiert länger, Alltagsanwendungen.', gymnasium: 'Früher textbasiert und formal.' },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, 'Nie Syntax ohne Problem lehren.'],
    belege: [{ aussage: 'GI-Bildungsstandards 2025: Prozess- und Inhaltsbereiche, Modellieren und Implementieren', url: Q.giSek1 }]
  },
  {
    id: 'technik',
    name: 'Technik / Arbeitslehre / WAT',
    faecher: ['technik', 'arbeitslehre'],
    reihentypen: [
      {
        id: 'konstruktion',
        label: 'Konstruktionsaufgabe',
        phasen: ['Problem/Bedarf', 'Anforderungsliste', 'Ideen und Entwürfe (Skizze)', 'Planung (Stückliste, Arbeitsplan)', 'Fertigung', 'Test und Optimierung', 'Bewertung, Präsentation'],
        beleg: Q.technik
      },
      { id: 'fertigung', label: 'Fertigungsaufgabe', phasen: ['Produkt vorstellen', 'Planen', 'Herstellen', 'Bewerten'], beleg: Q.technik },
      { id: 'analyse', label: 'Technische Analyse', phasen: ['Gerät/System', 'Zerlegen, Funktion erkunden', 'Prinzip erklären', 'Bewerten'], beleg: Q.technik },
      { id: 'erkundung', label: 'Betriebserkundung / Berufsorientierung', phasen: ['Fragen entwickeln', 'Erkundung', 'Auswerten', 'Bericht, Präsentation'], beleg: Q.technik }
    ],
    einstiege: ['Alltagsproblem (Handyhalter, Vogelhaus)', 'defektes Gerät', 'Betriebserkundung', 'Wettbewerb (Brückenbau)'],
    ungeeigneteEinstiege: ['Werkzeugkunde ohne Aufgabe', 'Normzeichnen ohne Bezug zum Produkt'],
    materialarten: ['technische Zeichnung', 'Arbeitsplan, Stückliste', 'Werkzeug-/Maschinenführerschein', 'Sicherheitsunterweisung', 'Bewertungsbogen'],
    methoden: ['Konstruktions- und Fertigungsaufgabe', 'technisches Experiment', 'Erkundung, Expertenbefragung', 'Projekt'],
    sicherung: ['Arbeitsplan', 'Skizze mit Fachbegriffen', 'Sicherheitsregeln', 'Projektmappe'],
    abschlussprodukte: ['Werkstück', 'Prototyp', 'Projektmappe', 'Präsentation', 'Erkundungsbericht, Praktikumsmappe'],
    lernkartenNutzung: 'Werkzeuge, Werkstoffe, Fachbegriffe, Sicherheitsregeln – nach der praktischen Begegnung.',
    stufenUnterschiede: {
      '5/6': 'Einfache Werkstücke, Werkzeugführerschein, Sicherheit.',
      '7/8': 'Konstruieren mit Anforderungsliste, Elektrotechnik-Grundlagen.',
      '9/10': 'Systeme, Steuerung, Berufsorientierung und Praktikum.',
      Oberstufe: 'Technikbewertung, Systemanalyse (selten als Fach).'
    },
    schulformHinweise: {
      hauptschule: 'Schwerpunktfach: praxisnah, Berufsorientierung.',
      realschule: 'Konstruieren und Bewerten, Berufsorientierung.',
      integriert: 'Arbeitslehre/WAT mit Praktikum.',
      foerderLernen: 'Kleine Fertigungsaufgaben, viel Sicherheitsroutine.'
    },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, NIE_RISU, 'Nie Maschinenarbeit ohne Sicherheitsunterweisung.'],
    belege: [{ aussage: 'Technikspezifische Unterrichtsverfahren (Konstruktions-, Fertigungsaufgabe, Analyse, Experiment, Erkundung)', url: Q.technik }],
    pruefungen: ['risu']
  },
  // ------------------------------------------------------------------ Ästhetik, Sport, Grundschule
  {
    id: 'kunst',
    name: 'Kunst',
    faecher: ['kunst'],
    reihentypen: [
      {
        id: 'gestaltung',
        label: 'Gestaltungsproblem mit Werkbezug',
        phasen: ['Wahrnehmen/Begegnen (Werk, Phänomen, Material)', 'Erproben (Material, Technik)', 'Gestaltungsproblem und Kriterien klären', 'Gestalten (Entwurf → Ausführung, Prozessdokumentation)', 'Werk betrachten (beschreiben, analysieren, deuten)', 'Präsentieren, reflektieren'],
        beleg: Q.kunstNrw
      },
      { id: 'werkanalyse', label: 'Werkanalyse mit eigener Gestaltung', phasen: ['Werk begegnen', 'Beschreiben, analysieren (Skizzen)', 'Deuten, Kontext', 'Eigene gestalterische Antwort'] }
    ],
    einstiege: ['Werk/Reproduktion mit offenem Impuls', 'irritierendes Bild', 'Materialbegegnung', 'Ort/Architektur', 'Werbung, Social Media', 'Gestaltungsproblem („Wie zeigt man Bewegung im Stillstand?")'],
    ungeeigneteEinstiege: ['Künstlerbiografie als Vortrag', 'fertiges Musterwerk zum Nachmachen', 'Analyseschema ohne Bild'],
    materialarten: ['Werkbetrachtung mit Leitfragen', 'Kompositionsskizzen', 'Technik-Anleitung', 'Skizzenbuch-Auftrag', 'Gestaltungsaufgabe mit Kriterien', 'Bewertungsbogen'],
    methoden: ['Skizzenbuch', 'Bildvergleich', 'Ausstellungsrundgang', 'Museumsbesuch', 'Werkstattunterricht', 'Galerie-Methode'],
    sicherung: ['Skizzenbuch/Portfolio', 'Fachbegriffe im Glossar', 'Analyseskizze', 'Kurzreflexion'],
    abschlussprodukte: ['Werk (Malerei, Zeichnung, Plastik, Druck, Foto, Film, digital)', 'Ausstellung', 'Portfolio', 'schriftliche Bildanalyse (Oberstufe)'],
    lernkartenNutzung: 'Gestaltungsmittel und Fachbegriffe, Epoche ↔ Merkmal ↔ Beispielwerk – nie Kern der Reihe; das Kernprodukt ist Praxis.',
    stufenUnterschiede: {
      '5/6': 'Handlungs- und materialbezogen, Farbe/Form, kurze mündliche Bildbetrachtung.',
      '7/8': 'Perspektive/Raum, Druck, Plastik, schriftliche Bildbeschreibung.',
      '9/10': 'Bildanalyse mit Fachsprache, Design/Architektur/Medien, eigene Konzepte.',
      Oberstufe: 'Produktion und Rezeption gleichwertig, Abitur-Aufgabenarten.'
    },
    schulformHinweise: { foerderLernen: 'Material und Handlung im Vordergrund.', gymnasium: 'Früher schriftliche Analyse.' },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, 'Nie eine Reihe nur aus Arbeitsblättern – Gestaltungspraxis ist der Kern.', 'Nie ein Musterwerk nur nachmachen lassen.'],
    belege: [{ aussage: 'Gleichwertige Integration von Produktion, Rezeption und Reflexion', url: Q.kunstNrw }]
  },
  {
    id: 'musik',
    name: 'Musik',
    faecher: ['musik'],
    reihentypen: [
      {
        id: 'aufbauend',
        label: 'Aufbauender Musikunterricht (Musizieren – Fähigkeiten – Kultur)',
        phasen: ['Ritualisiertes Warm-up (Rhythmus, Stimme)', 'Begegnung mit Musik (hören, musizieren)', 'Fähigkeiten aufbauen (in Musizierpraxis eingebettet)', 'Gestalten (Klassenmusizieren, Erfinden, Bewegung)', 'Erschließen mit Höraufträgen, Kontext', 'Aufführung'],
        beleg: Q.jankStroh
      },
      { id: 'hoeranalyse', label: 'Werk-/Höranalyse', phasen: ['Hörbeispiel mit Wirkungsfrage', 'Höraufträge, Verlaufsgrafik', 'Partitur/Notenbild', 'Kontext, Deutung', 'Eigene Gestaltung'] },
      { id: 'produktion', label: 'Komposition/Produktion', phasen: ['Gestaltungsidee', 'Material erproben', 'Komponieren/Arrangieren', 'Aufnehmen, präsentieren'] }
    ],
    einstiege: ['Hörbeispiel mit Wirkungsfrage', 'Mitmach-Rhythmus', 'Musikvideo/Filmszene', 'Instrument live', 'Lieblingsmusik der Klasse', 'Klangexperiment'],
    ungeeigneteEinstiege: ['Komponistenbiografie als Text', 'Notenlehre ohne Klang', 'langes Hörbeispiel ohne Auftrag'],
    materialarten: ['Hörbeispiel mit Höraufträgen und Zeitmarken', 'Hörpartitur', 'Noten-/Partiturausschnitt', 'Leadsheet', 'Rhythmuskarten', 'Spielsatz', 'Liedblatt', 'DAW/App-Auftrag'],
    methoden: ['Klassenmusizieren', 'Call & Response', 'Bodypercussion', 'Gruppenkomposition', 'Hörprotokoll', 'Musik und Bewegung'],
    sicherung: ['Merkkasten mit Notenbeispiel', 'Hörprotokoll', 'Formschema (A–B–A)', 'geübter Spielsatz', 'Aufnahme'],
    abschlussprodukte: ['Aufführung, Klassenkonzert', 'Aufnahme/Podcast', 'eigene Komposition/Arrangement', 'Choreografie', 'Höranalyse (Oberstufe)'],
    lernkartenNutzung: 'Notenwerte, Fachbegriffe, Instrumente (Bild/Klang ↔ Name), Formen – wo möglich als Hörquiz; nie Kern der Reihe.',
    stufenUnterschiede: {
      '5/6': 'Viel Singen und Musizieren, Rhythmus, Instrumentenkunde, Notation.',
      '7/8': 'Pop- und Filmmusik, Arrangieren, Akkorde.',
      '9/10': 'Musik und Gesellschaft, Epochen, digitale Produktion.',
      Oberstufe: 'Analyse mit Partitur, Musikgeschichte, Werkanalyse im Abiturformat.'
    },
    schulformHinweise: { foerderLernen: 'Musizieren und Bewegung im Vordergrund.', gymnasium: 'Früher Notation und Analyse.' },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, 'Nie eine Reihe ohne eigenes Musizieren oder Gestalten.', 'Nie Notenlehre ohne Klang.'],
    belege: [{ aussage: 'Drei Praxisfelder, „nicht als Nacheinander dreier getrennter Schritte"', url: Q.jankStroh }]
  },
  {
    id: 'sport',
    name: 'Sport',
    faecher: ['sport'],
    reihentypen: [
      {
        id: 'mehrperspektivisch',
        label: 'Mehrperspektivisches Unterrichtsvorhaben (Bewegungsfeld × Perspektive)',
        phasen: ['Leitfrage aus einer pädagogischen Perspektive', 'Ausgangslage erfassen (Bewegungsaufgabe)', 'Erproben/Erarbeiten (offene Aufgaben → Übungsreihe)', 'Üben/Anwenden (Stationen, Spielformen)', 'Gestalten/Präsentieren', 'Reflektieren (Kriterien, Beobachtung, Theorie)'],
        beleg: Q.balz
      },
      { id: 'spielreihe', label: 'Spielreihe (Game Sense)', phasen: ['Spiel ohne Regeln → Regeln erfinden', 'Spielproblem erkennen', 'Technik/Taktik im Spiel üben', 'Turnier, Reflexion'] },
      { id: 'theorie', label: 'Theoriereihe (Trainingslehre, Bewegungslehre)', phasen: ['Frage aus der Praxis', 'Theorie erarbeiten', 'In der Praxis erproben', 'Auswerten, Trainingsplan'] }
    ],
    einstiege: ['offene Bewegungsaufgabe', 'Videoanalyse', 'Bewegungsproblem („Wie kommt man über den Kasten?")', 'Spiel ohne Regeln', 'Puls-/Fitnessmessung'],
    ungeeigneteEinstiege: ['langer Theorievortrag in der Halle', 'Test ohne Übung', 'Leistungsdemonstration Einzelner vor der Gruppe', 'Wahlmannschaften durch Kapitäne'],
    materialarten: ['Stationskarten mit Bild, Beschreibung, Sicherheitshinweis', 'Beobachtungsbogen (Bewegungsphasen)', 'Bildreihen', 'Video-Feedback', 'Trainingsplan/-tagebuch', 'Regelkarten', 'Helfergriffe', 'Theorie-Arbeitsblatt (Trainingslehre, Anatomie)'],
    methoden: ['Stationsbetrieb', 'Gruppenarbeit mit Beobachterrollen', 'Lernen durch Lehren', 'Game Sense', 'methodische Übungsreihe', 'Partner-Feedback', 'Videoanalyse'],
    sicherung: ['Beobachtungsbogen', 'Reflexionsgespräch', 'Lerntagebuch', 'Merkplakat Technikmerkmale', 'Video vorher/nachher'],
    abschlussprodukte: ['Choreografie/Kür', 'Turnier', 'Leistungsüberprüfung (Technik + Leistung)', 'Trainingsplan', 'Theorie-Kurzklausur/Referat'],
    lernkartenNutzung: 'Nur für Theorie: Regeln, Bewegungsphasen, Trainingsprinzipien, Muskeln, Sicherheits- und Helferregeln.',
    stufenUnterschiede: {
      '5/6': 'Spielerisch, Bewegungsvielfalt, Schwimmfähigkeit, Regelverständnis.',
      '7/8': 'Technikerwerb in Sportspielen, Leichtathletik, Turnen; Kooperation, Wagnis.',
      '9/10': 'Taktik, eigene Fitness planen, Schiedsrichtern, Gestalten.',
      Oberstufe: 'Kurse/Profile, Theorie-Klausuren (Trainingslehre, Biomechanik), Abitur Praxis + Theorie.'
    },
    schulformHinweise: { foerderLernen: 'Differenzierte Bewegungsaufgaben, klare Rituale.', integriert: 'Differenzierte Bewegungsaufgaben für heterogene Gruppen.' },
    nieRegeln: [
      NIE_BEGRIFFE_ZUERST,
      NIE_LEITFRAGE,
      'Nie Arbeitsblätter für Bewegungspraxis – nur für Theorie- und Beobachtungsanteile; Praxis ist „Im Unterricht" mit Organisation, Sicherheit und Differenzierung.',
      'Nie Einzelne bloßstellen.'
    ],
    belege: [
      { aussage: 'Inhaltsfelder a–f (NRW)', url: Q.sportNrw },
      { aussage: 'Mehrperspektivisch planen: Bewegungsfeld × Perspektive', url: Q.balz }
    ],
    pruefungen: ['sportBlatt']
  },
  {
    id: 'sachunterricht',
    name: 'Sachunterricht',
    faecher: ['sachunterricht'],
    reihentypen: [
      {
        id: 'perspektiven',
        label: 'Phänomen → Fragen → Untersuchen → Sichern → Handeln',
        phasen: ['Begegnung/Staunen (Phänomen, Gegenstand, Unterrichtsgang)', 'Fragen sammeln', 'Vermutungen', 'Untersuchen (Versuch, Befragung, Erkundung)', 'Ordnen und sichern (Plakat, Forscherheft)', 'Anwenden/Handeln', 'Präsentieren'],
        beleg: Q.gdsu
      },
      { id: 'werkstatt', label: 'Lernwerkstatt / Stationen', phasen: ['Kinderfrage', 'Stationen mit Forscherkarten', 'Ergebnisse ordnen', 'Präsentieren'] }
    ],
    einstiege: ['Realgegenstand', 'Unterrichtsgang', 'Kinderfrage', 'Bilderbuch/Geschichte', 'Experiment', 'Expertenbesuch'],
    ungeeigneteEinstiege: ['Wortkarten ohne Sache', 'Sachtext ohne Anschauung'],
    materialarten: ['Forscherheft, Versuchskarten mit Bildanleitung', 'Beobachtungsbogen', 'leichte Sachtexte', 'Bildkarten', 'Wortspeicher', 'Lernwerkstatt-Kisten'],
    methoden: ['Unterrichtsgang', 'Versuch', 'Befragung', 'Stationen', 'Lapbook'],
    sicherung: ['Wortspeicher/Bildwörterbuch', 'Lernplakat', 'Forscherheft', 'Lapbook'],
    abschlussprodukte: ['Lapbook', 'Plakat', 'Ausstellung', 'Modell', 'Präsentation'],
    lernkartenNutzung: 'Bild ↔ Wort (Wortspeicher), DaZ-gerecht mit Artikel – nach der Begegnung mit der Sache.',
    stufenUnterschiede: {
      Grundschule: 'Perspektiven sozialwissenschaftlich, naturwissenschaftlich, geographisch, historisch, technisch; von der Kinderfrage aus.',
      '5/6': 'BE/BB: Übergang in Naturwissenschaften und Gesellschaftswissenschaften 5/6.'
    },
    schulformHinweise: { grundschule: 'Lebenswelt, Anschauung, Handeln; viel Bild und wenig Text.', foerderLernen: 'Viel Anschauung, kleine Schritte.' },
    nieRegeln: [NIE_BEGRIFFE_ZUERST, NIE_LEITFRAGE, 'Nie Sachunterricht ohne Begegnung mit der Sache (Gegenstand, Versuch, Erkundung).'],
    belege: [{ aussage: 'GDSU-Perspektivrahmen 2013: Perspektiven und vernetzende Denk-, Arbeits- und Handlungsweisen', url: Q.gdsu }]
  }
]

const NACH_FACH = new Map(REIHENMUSTER.flatMap((m) => m.faecher.map((f) => [f, m] as const)))

/** Muster des Fachs (Kennung aus faecher.ts) – fehlt eins, plant die KI nach den allgemeinen Regeln */
export const reihenmusterFuer = (fachId: string): Reihenmuster | undefined => NACH_FACH.get(fachId)

/** Stufe aus dem Jahrgang */
export function musterStufe(grade: number): MusterStufe {
  if (grade <= 4) return 'Grundschule'
  if (grade <= 6) return '5/6'
  if (grade <= 8) return '7/8'
  if (grade <= 10) return '9/10'
  return 'Oberstufe'
}

const STUFEN_REIHE: MusterStufe[] = ['Grundschule', '5/6', '7/8', '9/10', 'Oberstufe']

/** Hinweis der Stufe – fehlt er im Muster, der nächstgelegene */
export function stufenHinweis(m: Reihenmuster, grade: number): { stufe: MusterStufe; text: string } | null {
  const soll = STUFEN_REIHE.indexOf(musterStufe(grade))
  const kandidaten = STUFEN_REIHE.map((s, i) => ({ s, i, text: m.stufenUnterschiede[s] })).filter((k) => k.text)
  if (!kandidaten.length) return null
  const best = kandidaten.sort((a, b) => Math.abs(a.i - soll) - Math.abs(b.i - soll) || a.i - b.i)[0]
  return { stufe: best.s, text: best.text! }
}

/** Reihentyp nach Kennung (unbekannt/leer: keiner – die KI wählt) */
export const reihentypVon = (m: Reihenmuster | undefined, id: string | undefined): Reihentyp | undefined =>
  id ? m?.reihentypen.find((t) => t.id === id) : undefined
