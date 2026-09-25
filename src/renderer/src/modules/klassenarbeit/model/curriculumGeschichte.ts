/**
 * Themen des Geschichtsunterrichts nach Bundesland, Schulform und Jahrgang.
 *
 * Die Bezeichnungen sind den Lehrplänen wörtlich entnommen (Stand der Recherche 18.09.2026).
 * Die Länder sind unterschiedlich aufgebaut: Niedersachsen und Nordrhein-Westfalen arbeiten mit
 * Doppeljahrgängen bzw. Inhaltsfeldern, Bayern mit Lernbereichen je Einzeljahrgang,
 * Baden-Württemberg mit nummerierten Teilkapiteln – und Hessen ordnet die Inhalte bewusst
 * KEINEM Jahrgang zu, das übernimmt dort das Schulcurriculum.
 */
export interface CurriculumTopic {
  id: string
  stateId: string
  /** Schulformen, für die dieser Lehrplan gilt */
  schoolTypeIds: string[]
  /** aufgelöste Einzeljahrgänge, damit sich nach Klasse filtern lässt */
  grades: number[]
  /** Bezeichnung des Jahrgangs im Lehrplan */
  gradeLabel: string
  /** Titel, wie er im Lehrplan steht */
  label: string
  /** Nummerierung des Lehrplans (Inhaltsfeld, Lernbereich, Kapitel) */
  code?: string
  structure: 'chronologisch' | 'laengsschnitt'
  source: string
}

export const CURRICULUM_SOURCES: Record<string, { title: string; url: string }> = {
  'ni-gym': { title: 'Kerncurriculum Geschichte, Gymnasium Sek I (Niedersachsen, ab 1.8.2015)', url: 'https://cuvo.nibis.de/index.php?p=download&upload=62' },
  'ni-obs': { title: 'Kerncurriculum Geschichte, Oberschule (Niedersachsen, ab 1.8.2013)', url: 'https://cuvo.nibis.de/index.php?p=download&upload=35' },
  'nw-gym': {
    title: 'Kernlehrplan Geschichte, Gymnasium G9 (NRW, ab 2019/20)',
    url: 'https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ge_klp_3407_2019_06_23.pdf'
  },
  'nw-rs': {
    title: 'Kernlehrplan Geschichte, Realschule (NRW, ab 2020/21)',
    url: 'https://lehrplannavigator.nrw.de/system/files/media/document/file/rs_ge_klp_3316_2020_07_01.pdf'
  },
  'nw-ge': {
    title: 'Kernlehrplan Gesellschaftslehre, Gesamtschule/Sekundarschule (NRW, ab 2020/21)',
    url: 'https://lehrplannavigator.nrw.de/system/files/media/document/file/gesk_gl_klp_3120_2020_07_01.pdf'
  },
  'by-gym': { title: 'LehrplanPLUS Geschichte, Gymnasium (Bayern)', url: 'https://www.lehrplanplus.bayern.de/fachlehrplan/gymnasium/6/geschichte' },
  'by-rs': { title: 'LehrplanPLUS Geschichte, Realschule (Bayern)', url: 'https://www.lehrplanplus.bayern.de/fachlehrplan/realschule/6/geschichte' },
  'by-ms': {
    title: 'LehrplanPLUS Geschichte/Politik/Geographie, Mittelschule (Bayern)',
    url: 'https://www.lehrplanplus.bayern.de/fachlehrplan/mittelschule/5/gpg'
  },
  'bw-gym': { title: 'Bildungsplan 2016 Geschichte, Gymnasium (Baden-Württemberg)', url: 'https://www.bildungsplaene-bw.de/,Lde/LS/BP2016BW/ALLG/GYM/G' },
  'bw-sek1': {
    title: 'Bildungsplan 2016 Geschichte, Sekundarstufe I (Baden-Württemberg)',
    url: 'https://www.bildungsplaene-bw.de/,Lde/LS/BP2016BW/ALLG/SEK1/G'
  },
  he: { title: 'Kerncurriculum Geschichte, Sekundarstufe I (Hessen)', url: 'https://kultus.hessen.de/Unterricht/Sekundarstufe-I-Kerncurricula' }
}

interface Group {
  state: string
  types: string[]
  source: string
  grades: number[]
  gradeLabel: string
  /** Titel, optional mit Nummerierung „IF 5|Titel" und Längsschnitt-Markierung „~" am Anfang */
  topics: string[]
}

const GROUPS: Group[] = [
  // ---------- Niedersachsen ----------
  {
    state: 'NI',
    types: ['gymnasium'],
    source: 'ni-gym',
    grades: [5, 6],
    gradeLabel: 'Schuljahrgänge 5/6',
    topics: [
      'Identität im familiären und lokalen Umfeld',
      'Leben in der Steinzeit',
      'Merkmale einer Hochkultur',
      '~Entwicklung der Medien seit dem Zeitalter der Hochkulturen bis in die Gegenwart',
      'Die Welt der Griechen',
      'Leben in der Römischen Republik',
      'Politischer Wandel im republikanischen Rom',
      'Rom und die Anderen',
      'Lebensformen im Mittelalter: Lehnswesen und Grundherrschaft, Kloster, Stadt',
      'Unterschiedliche Formen von Kulturbegegnungen',
      'Die Welt des Spätmittelalters zwischen Krise und Aufbruch in die Neuzeit',
      'Zeit – erlebt, gemessen, eingeteilt und gedeutet'
    ]
  },
  {
    state: 'NI',
    types: ['gymnasium'],
    source: 'ni-gym',
    grades: [7, 8],
    gradeLabel: 'Schuljahrgänge 7/8',
    topics: [
      'Der frühneuzeitliche Fürstenstaat',
      'Das Zeitalter der Bürgerlichen Revolutionen',
      '~Geschichte des deutschen Nationalstaats im 19. Jahrhundert',
      'Industrialisierung und Soziale Frage',
      '~Geschichte der Nutzung von Energie',
      'Imperialismus im 19. Jahrhundert',
      'Erster Weltkrieg'
    ]
  },
  {
    state: 'NI',
    types: ['gymnasium'],
    source: 'ni-gym',
    grades: [9, 10],
    gradeLabel: 'Schuljahrgänge 9/10',
    topics: [
      'Herrschaftsidee des Sowjetkommunismus und ihre Folgen',
      'Weimarer Republik – Chancen und Belastungen',
      'Elemente der nationalsozialistischen Ideologie',
      'Zerstörung von Demokratie und Rechtsstaatlichkeit',
      'Lebenswirklichkeiten und Handlungsspielräume im Nationalsozialismus',
      'Zweiter Weltkrieg',
      'Deutsche und globale politische Situation nach dem Ende des Zweiten Weltkrieges',
      'Konkurrierende Staatsformen und Werteordnungen der beiden deutschen Staaten',
      'Lebensbedingungen in den beiden deutschen Staaten',
      'Das Ende der bipolaren Welt'
    ]
  },
  {
    state: 'NI',
    types: ['oberschule'],
    source: 'ni-obs',
    grades: [5, 6],
    gradeLabel: 'Schuljahrgänge 5/6',
    topics: [
      'Einführung in die Geschichte',
      'Leben in frühgeschichtlicher Zeit',
      'Eine frühe Hochkultur – Beispiel Ägypten',
      'Römisches Weltreich und Begegnung fremder Kulturen',
      'Leben im Mittelalter',
      'Neues Weltbild, Erfindungen, Entdeckungen'
    ]
  },
  {
    state: 'NI',
    types: ['oberschule'],
    source: 'ni-obs',
    grades: [7, 8],
    gradeLabel: 'Schuljahrgänge 7/8',
    topics: [
      'Reformation, Bauernkrieg und Dreißigjähriger Krieg',
      'Französische Revolution',
      'Industrielle Revolution',
      'Entstehung des monarchischen Nationalstaates (1848–1871)',
      'Imperialismus und Erster Weltkrieg',
      'Weimarer Republik'
    ]
  },
  {
    state: 'NI',
    types: ['oberschule'],
    source: 'ni-obs',
    grades: [9, 10],
    gradeLabel: 'Schuljahrgänge 9/10',
    topics: [
      'NS-Diktatur in Deutschland',
      'Geteilte Welt und Kalter Krieg',
      'Der Weg zur deutschen Einheit',
      'Begegnungen unterschiedlicher Kulturen in Europa'
    ]
  },
  // ---------- Nordrhein-Westfalen ----------
  {
    state: 'NW',
    types: ['gymnasium'],
    source: 'nw-gym',
    grades: [5, 6],
    gradeLabel: 'Erprobungsstufe (Kl. 5/6)',
    topics: [
      'IF 1|Frühe Kulturen und erste Hochkulturen',
      'IF 2|Antike Lebenswelten: Griechische Poleis und Imperium Romanum',
      'IF 3a|Lebenswelten im Mittelalter'
    ]
  },
  {
    state: 'NW',
    types: ['gymnasium'],
    source: 'nw-gym',
    grades: [7, 8, 9, 10],
    gradeLabel: 'Klassen 7–10',
    topics: [
      'IF 3b|Lebenswelten im Mittelalter: Städte, Religionen, Handel',
      'IF 4|Frühe Neuzeit: Neue Welten, neue Horizonte',
      'IF 5|Das „lange“ 19. Jahrhundert – politischer und wirtschaftlicher Wandel in Europa',
      'IF 6|Imperialismus und Erster Weltkrieg',
      'IF 7|Weimarer Republik',
      'IF 8|Nationalsozialismus und Zweiter Weltkrieg',
      'IF 9|Internationale Verflechtungen seit 1945',
      'IF 10|Gesellschaftspolitische und wirtschaftliche Entwicklungen in Deutschland seit 1945'
    ]
  },
  {
    state: 'NW',
    types: ['realschule'],
    source: 'nw-rs',
    grades: [5, 6],
    gradeLabel: 'Erprobungsstufe (Kl. 5/6)',
    topics: ['IF 1|Frühe Hochkulturen und antike Lebenswelten', 'IF 2a|Lebenswelten im Mittelalter']
  },
  {
    state: 'NW',
    types: ['realschule'],
    source: 'nw-rs',
    grades: [7, 8, 9, 10],
    gradeLabel: 'Klassen 7–10',
    topics: [
      'IF 2b|Lebenswelten im Mittelalter: Stadt, Religionen, Handel',
      'IF 3|Frühe Neuzeit: Neue Welten, neue Horizonte',
      'IF 4|Das „lange“ 19. Jahrhundert – politischer und wirtschaftlicher Wandel in Europa',
      'IF 5|Imperialismus und Erster Weltkrieg',
      'IF 6|Weimarer Republik',
      'IF 7|Nationalsozialismus und Zweiter Weltkrieg',
      'IF 8|Internationale Verflechtungen und die Entwicklungen in Deutschland seit 1945',
      'IF 9|Internationale Verflechtungen und die Entwicklungen in Deutschland seit 1989'
    ]
  },
  {
    state: 'NW',
    types: ['gesamtschule', 'integrierte-gesamtschule', 'sekundarschule'],
    source: 'nw-ge',
    grades: [5, 6, 7, 8, 9, 10],
    gradeLabel: 'Gesellschaftslehre, Kl. 5–10',
    topics: [
      'IF 1|Herrschaft, Partizipation und Demokratie (historische Schwerpunkte)',
      'IF 2|Wirtschaft, Arbeit und Konsum: Industrialisierung und soziale Frage',
      'IF 5|Individuum und Gesellschaft: Religionen im Mittelalter, jüdisches Leben',
      'IF 6|Internationalisierung: Entdeckungen und Eroberungen',
      'IF 7|Disparitäten: mittelalterliche Stadt, imperialistische Expansion',
      'IF 8|Konflikt und Frieden: Reformation, Erster Weltkrieg, Blockbildung, Ende des Ost-West-Konflikts',
      'IF 9|Nationalsozialismus und Zweiter Weltkrieg'
    ]
  },
  // ---------- Bayern ----------
  {
    state: 'BY',
    types: ['gymnasium'],
    source: 'by-gym',
    grades: [6],
    gradeLabel: 'Jahrgangsstufe 6',
    topics: [
      'LB 1|Der Mensch und seine Geschichte',
      'LB 2|Ägypten – eine frühe Hochkultur',
      'LB 3|Die griechische Antike',
      '~LB 4|Menschen machen Geschichte',
      'LB 5|Das Imperium Romanum',
      'LB 6|Von der Antike zum Mittelalter',
      '~LB 7|Gesellschaftsordnung im Kleinen: Leben in der Familie'
    ]
  },
  {
    state: 'BY',
    types: ['gymnasium'],
    source: 'by-gym',
    grades: [7],
    gradeLabel: 'Jahrgangsstufe 7',
    topics: [
      'LB 1|König und Reich: Herrschaft im Mittelalter',
      'LB 2|Leben und Kultur im Mittelalter',
      'LB 3|Neue räumliche und geistige Horizonte',
      '~LB 4|Wirtschaft und Handel gestern und heute',
      'LB 5|Das konfessionelle Zeitalter',
      'LB 6|Absolutismus und Barock',
      '~LB 7|Bauwerke als Ausdruck politischen Denkens'
    ]
  },
  {
    state: 'BY',
    types: ['gymnasium'],
    source: 'by-gym',
    grades: [8],
    gradeLabel: 'Jahrgangsstufe 8',
    topics: [
      'LB 1|Aufklärung, Französische Revolution und Napoleon',
      'LB 2|Deutschland zwischen Restauration und Revolution',
      '~LB 3|Bayern – Identität, Territorium und kulturelles Erbe',
      'LB 4|Industrialisierung und Soziale Frage',
      'LB 5|Das Deutsche Kaiserreich',
      'LB 6|Imperialismus und Erster Weltkrieg'
    ]
  },
  {
    state: 'BY',
    types: ['gymnasium'],
    source: 'by-gym',
    grades: [9],
    gradeLabel: 'Jahrgangsstufe 9',
    topics: [
      'LB 1|Weimarer Republik',
      'LB 2|Nationalsozialismus, Zweiter Weltkrieg und Holocaust',
      '~LB 3|Menschenrechte',
      'LB 4|Deutschland und die Siegermächte 1945–1949',
      'LB 5|Ost-West-Konflikt und Kalter Krieg'
    ]
  },
  {
    state: 'BY',
    types: ['gymnasium'],
    source: 'by-gym',
    grades: [10],
    gradeLabel: 'Jahrgangsstufe 10',
    topics: ['LB 1|Geteiltes Deutschland und Wiedervereinigung', 'LB 2|Europäische Integration und globalisierte Welt']
  },
  {
    state: 'BY',
    types: ['realschule'],
    source: 'by-rs',
    grades: [6],
    gradeLabel: 'Jahrgangsstufe 6',
    topics: [
      'LB 2|Der Mensch und seine Geschichte',
      'LB 3|Ägypten – eine frühe Hochkultur',
      'LB 4|Die griechische Antike',
      'LB 5|Das Imperium Romanum',
      'LB 6|Von der Antike zum Frühmittelalter',
      '~LB 7|Technik verändert das Leben der Menschen',
      '~LB 8|Menschen machen Geschichte'
    ]
  },
  {
    state: 'BY',
    types: ['realschule'],
    source: 'by-rs',
    grades: [7],
    gradeLabel: 'Jahrgangsstufe 7',
    topics: [
      'LB 2|Leben und Herrschaft im Mittelalter',
      'LB 3|Europa im Wandel vom Mittelalter zur Neuzeit',
      'LB 4|Reformation und Konfessionalisierung',
      'LB 5|Das frühneuzeitliche Europa zwischen konfessioneller Auseinandersetzung und absolutistischem Herrschaftsanspruch',
      '~LB 6|Bauwerke als Ausdruck politischen und religiösen Denkens',
      '~LB 7|Warenaustausch und Kulturtransfer'
    ]
  },
  {
    state: 'BY',
    types: ['realschule'],
    source: 'by-rs',
    grades: [8],
    gradeLabel: 'Jahrgangsstufe 8',
    topics: [
      'LB 2|Grundlagen der Moderne – Aufklärung, Unabhängigkeit der USA und Französische Revolution',
      'LB 3|Napoleon und die Umgestaltung Europas',
      'LB 4|Deutschland zwischen Restauration und Revolution',
      'LB 5|Industrialisierung und Soziale Frage',
      'LB 6|Das Deutsche Kaiserreich',
      '~LB 7|Protest, Aufstand und Revolution',
      '~LB 8|Kriege und ihre Folgen'
    ]
  },
  {
    state: 'BY',
    types: ['realschule'],
    source: 'by-rs',
    grades: [9],
    gradeLabel: 'Jahrgangsstufe 9',
    topics: [
      'LB 2|Imperialismus und Erster Weltkrieg',
      'LB 3|Weimarer Republik – die erste deutsche Demokratie',
      'LB 4|Nationalsozialismus – Ideologie und Politik bis 1939',
      'LB 5|Nationalsozialismus, Zweiter Weltkrieg und Holocaust',
      '~LB 6|Jugend und Jugendkultur im Wandel der Zeit',
      '~LB 7|Menschenrechte – Rechte für alle Menschen'
    ]
  },
  {
    state: 'BY',
    types: ['realschule'],
    source: 'by-rs',
    grades: [10],
    gradeLabel: 'Jahrgangsstufe 10',
    topics: [
      'LB 2|Nachkriegszeit und politischer Neubeginn in Deutschland',
      'LB 3|Die Teilung Deutschlands',
      'LB 4|Kalter Krieg, Entspannung und Neuorientierung in Europa und der Welt',
      'LB 5|Herausforderungen und Chancen globaler Entwicklungen der Gegenwart',
      '~LB 6|Migration in der Geschichte',
      '~LB 7|Geschichtskultur – wie wir mit Geschichte umgehen'
    ]
  },
  {
    state: 'BY',
    types: ['mittelschule'],
    source: 'by-ms',
    grades: [5],
    gradeLabel: 'Jgst. 5 (GPG, Lernbereich „Zeit und Wandel“)',
    topics: ['Vor- und Frühgeschichte: Lebensweise und Sesshaftwerdung', 'Altägypten und der Nil', 'Das Imperium Romanum und römische Spuren in Süddeutschland']
  },
  {
    state: 'BY',
    types: ['mittelschule'],
    source: 'by-ms',
    grades: [6],
    gradeLabel: 'Jgst. 6 (GPG)',
    topics: [
      'Mittelalterliche Lebensbedingungen und Stadtentwicklung',
      'Leistungen der islamischen Welt',
      'Frühneuzeitliche Entdeckungen',
      'Reformation und Dreißigjähriger Krieg'
    ]
  },
  {
    state: 'BY',
    types: ['mittelschule'],
    source: 'by-ms',
    grades: [7],
    gradeLabel: 'Jgst. 7 (GPG)',
    topics: [
      'Absolutismus und demokratische Herrschaft',
      'Französische Revolution',
      'Industrialisierung',
      'Reichsgründung',
      'Imperialismus und Kolonisierung in Afrika',
      'Erster Weltkrieg'
    ]
  },
  {
    state: 'BY',
    types: ['mittelschule'],
    source: 'by-ms',
    grades: [8],
    gradeLabel: 'Jgst. 8 (GPG)',
    topics: [
      'Weimarer Republik und Weimarer Reichsverfassung',
      'Aufstieg und Machtübertragung der NSDAP',
      'NS-Diktatur und Zweiter Weltkrieg',
      'Verfolgung und Vernichtung',
      'Flucht, Vertreibung, Migration',
      'Nürnberger Prozesse und Nachkriegszeit'
    ]
  },
  {
    state: 'BY',
    types: ['mittelschule'],
    source: 'by-ms',
    grades: [9],
    gradeLabel: 'Jgst. 9 (GPG)',
    topics: [
      'Gedenkstätten und Erinnerungskultur',
      'Glasnost, Perestroika und Demokratiebestrebungen in der DDR',
      'Wiedervereinigung 1990',
      'Gesellschaftlicher Wandel',
      'Internationale Sicherheitspolitik'
    ]
  },
  // ---------- Baden-Württemberg ----------
  {
    state: 'BW',
    types: ['gymnasium'],
    source: 'bw-gym',
    grades: [5, 6],
    gradeLabel: 'Klassen 5/6',
    topics: [
      '3.1.0|Orientierung in der Zeit',
      '3.1.1|Erste Begegnung mit dem Fach Geschichte',
      '3.1.2|Ägypten – Kultur und Hochkultur',
      '3.1.3|Griechisch-römische Antike – Zusammenleben in der Polis und im Imperium',
      '3.1.4|Von der Spätantike ins europäische Mittelalter – neue Religionen, neue Reiche'
    ]
  },
  {
    state: 'BW',
    types: ['gymnasium'],
    source: 'bw-gym',
    grades: [7, 8],
    gradeLabel: 'Klassen 7/8',
    topics: [
      '3.2.1|Europa im Mittelalter – Leben in der Agrargesellschaft und Begegnungen mit dem Fremden',
      '3.2.2|Wende zur Neuzeit – neue Welten, neue Horizonte, neue Gewalt',
      '3.2.3|Die Französische Revolution – Bürgertum, Vernunft, Freiheit',
      '3.2.4|Europa nach der Französischen Revolution – Bürgertum, Nationalstaat, Verfassung',
      '3.2.5|Der industrialisierte Nationalstaat – Durchbruch der Moderne',
      '3.2.6|Imperialismus und Erster Weltkrieg – europäisches Machtstreben und Epochenwende',
      '3.2.7|Europa in der Zwischenkriegszeit'
    ]
  },
  {
    state: 'BW',
    types: ['gymnasium'],
    source: 'bw-gym',
    grades: [9, 10],
    gradeLabel: 'Klassen 9/10',
    topics: [
      '3.3.1|Nationalsozialismus und Zweiter Weltkrieg',
      '3.3.2|BRD und DDR – zwei Staaten, zwei Systeme in der geteilten Welt',
      '3.3.3|Fremde Räume? Ehemalige Imperien und ihre gegenwärtigen Herausforderungen',
      '3.3.4|Russland – ein Imperium im Wandel',
      '3.3.5|China – ein Imperium im Wandel',
      '3.3.6|Osmanisches Reich und Türkei',
      '3.3.7|Ehemalige Imperien und die Europäische Integration im Vergleich'
    ]
  },
  {
    state: 'BW',
    types: ['werkrealschule', 'hauptschule', 'realschule', 'gemeinschaftsschule'],
    source: 'bw-sek1',
    grades: [5, 6],
    gradeLabel: 'Klassen 5/6',
    topics: [
      '3.1.1|Erste Begegnung mit dem Fach Geschichte',
      '3.1.2|Ägypten – Kultur und Hochkultur',
      '3.1.3|Griechisch-römische Antike',
      '3.1.4|Von der Spätantike ins europäische Mittelalter'
    ]
  },
  {
    state: 'BW',
    types: ['werkrealschule', 'hauptschule', 'realschule', 'gemeinschaftsschule'],
    source: 'bw-sek1',
    grades: [7, 8, 9],
    gradeLabel: 'Klassen 7/8/9',
    topics: [
      '3.2.1|Europa im Mittelalter',
      '3.2.2|Wende zur Neuzeit',
      '3.2.3|Die Französische Revolution',
      '3.2.4|Europa nach der Französischen Revolution',
      '3.2.5|Der industrialisierte Nationalstaat',
      '3.2.6|Imperialismus und Erster Weltkrieg',
      '3.2.7|Europa in der Zwischenkriegszeit',
      '3.2.8|Nationalsozialismus und Zweiter Weltkrieg',
      '3.2.9|BRD und DDR – zwei Staaten, zwei Systeme'
    ]
  },
  {
    state: 'BW',
    types: ['werkrealschule', 'hauptschule', 'realschule', 'gemeinschaftsschule'],
    source: 'bw-sek1',
    grades: [10],
    gradeLabel: 'Klasse 10',
    topics: ['3.3.1|Dekolonisierung nach 1945', '3.3.2|Die Europäische Integration']
  },
  // ---------- Hessen ----------
  {
    state: 'HE',
    types: ['gymnasium', 'realschule', 'hauptschule'],
    source: 'he',
    grades: [5, 6, 7, 8, 9, 10],
    gradeLabel: 'Kl. 5–10 (das Kerncurriculum ordnet die Themen keinem Jahrgang zu)',
    topics: [
      '„Menschwerdung“ in Auseinandersetzung mit der Natur',
      'Arbeitsteilung und Sesshaftwerdung in der Neolithischen Revolution',
      'Herrschaft, Religion, Wirtschaft und Schrift in frühen Stromkulturen',
      'Freiheit und Mitbestimmung in der griechischen Polis',
      'Entwicklung zum Imperium Romanum',
      'Griechische und römische Ursprünge der europäischen Kultur',
      'Kontinuitäten und Veränderungen in Herrschaft und Gesellschaft im Mittelalter',
      'Städte als Folge und Triebkraft gesellschaftlichen und politischen Wandels',
      'Einflüsse von Religionen auf Weltdeutungen in der Vormoderne',
      'Renaissance, Humanismus, Reformation und Konfessionalisierung',
      'Beziehungen und Konflikte Europas mit anderen Kulturzentren',
      'Aufklärung und Streben nach Freiheit',
      'Bürgerliche Revolutionen (Französische Revolution)',
      'Industrielle Revolutionen und Soziale Frage',
      'Kolonialismus, Imperialismus, Nationalstaaten und Erster Weltkrieg',
      'Versuche der Friedenssicherung und Neuordnung nach 1918',
      'Totalitäre Systeme und Nationalsozialismus',
      'Shoa',
      'Neuordnungen der Welt nach 1945 und 1989'
    ]
  }
]

export const CURRICULUM_TOPICS: CurriculumTopic[] = GROUPS.flatMap((g) =>
  g.topics.map((raw, i) => {
    const laengsschnitt = raw.startsWith('~')
    const rest = laengsschnitt ? raw.slice(1) : raw
    const [maybeCode, ...restLabel] = rest.split('|')
    const hasCode = restLabel.length > 0
    return {
      id: `${g.state.toLowerCase()}-${g.types[0]}-${g.grades[0]}-${i}`,
      stateId: g.state,
      schoolTypeIds: g.types,
      grades: g.grades,
      gradeLabel: g.gradeLabel,
      label: hasCode ? restLabel.join('|') : rest,
      ...(hasCode ? { code: maybeCode } : {}),
      structure: laengsschnitt ? ('laengsschnitt' as const) : ('chronologisch' as const),
      source: g.source
    }
  })
)

/** Themen, die für Bundesland, Schulform und Jahrgang hinterlegt sind. */
export function curriculumTopics(stateId: string, schoolTypeId: string, grade: number): CurriculumTopic[] {
  return CURRICULUM_TOPICS.filter((t) => t.stateId === stateId && t.schoolTypeIds.includes(schoolTypeId) && t.grades.includes(grade))
}

/** Gibt es für dieses Land überhaupt hinterlegte Themen? */
export const hasCurriculum = (stateId: string): boolean => CURRICULUM_TOPICS.some((t) => t.stateId === stateId)

/** Quelle, aus der die Themen einer Auswahl stammen. */
export function curriculumSource(topics: CurriculumTopic[]): { title: string; url: string } | undefined {
  return topics.length ? CURRICULUM_SOURCES[topics[0].source] : undefined
}
