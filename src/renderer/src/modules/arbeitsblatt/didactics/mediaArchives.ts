/**
 * Archive mit ECHTEN Ton- und Filmquellen für Geschichte und Politik.
 *
 * WARUM DIESE LISTE ÜBERHAUPT:
 *
 * Für die Fremdsprachen schreibt die KI den Hörtext selbst und lässt ihn vertonen – ein
 * erfundener Schulhofdialog ist dort genau das Richtige. In Geschichte wäre dasselbe
 * Verfahren ein Übergriff: Ein nachgesprochenes „Zeitzeugeninterview" ist keine Quelle,
 * sondern eine Fälschung. Es sähe aus wie Überlieferung, wäre aber erfunden – und damit das
 * Gegenteil dessen, was Quellenarbeit lehrt. Dasselbe gilt für eine erfundene Rede in
 * Politik. Deshalb SUCHT die KI in diesen Fächern eine Originalaufnahme, statt eine zu
 * erzeugen.
 *
 * WARUM EINE FESTE LISTE UND NICHT FREIE SUCHE:
 *
 * In diesem Projekt ist mehrfach belegt, dass frei erfundene Adressen einer KI ins Leere
 * führen (deshalb gibt es `completeOriginalSources` mit Zitatprüfung und Wikisource-Ersatz).
 * Nennt man dagegen die Archive, in denen das Gesuchte tatsächlich liegt, steigt die Trefferquote
 * deutlich. Jede von der KI genannte Adresse wird anschließend trotzdem abgerufen und geprüft –
 * die Liste ersetzt die Prüfung nicht, sie verbessert nur den Ausgangspunkt.
 *
 * STAND DER LISTE: von Hand zusammengestellt (22.09.2026) aus den Angeboten öffentlicher
 * Einrichtungen. Sie ist keine amtliche Empfehlung; jede Einrichtung ist aber real und
 * öffentlich zugänglich. Zugangshürden sind vermerkt, denn ein Archiv, für das man ein Konto
 * braucht, taugt nicht für ein Arbeitsblatt mit QR-Code.
 */
export interface MediaArchive {
  id: string
  name: string
  traeger: string
  domain: string
  /** Was dort zu finden ist */
  inhalt: string
  /** Für welche Fächer die Suche dort lohnt */
  subjects: string[]
  /** Ton, Film, Text oder beides */
  art: 'audio' | 'video' | 'text' | 'beides'
  /**
   * true = ohne Anmeldung und ohne Lizenz im Unterricht abrufbar (QR-Code auf dem Blatt
   * funktioniert für die Klasse). false = Anmeldung, Lizenz oder Schulzugang nötig.
   */
  frei: boolean
  /** Einschränkung, die auf dem Lehrkraft-Hinweis landet */
  hinweis?: string
}

export const MEDIA_ARCHIVES: MediaArchive[] = [
  {
    id: 'zeitzeugen-portal',
    name: 'Zeitzeugen-Portal',
    traeger: 'Stiftung Haus der Geschichte der Bundesrepublik Deutschland',
    domain: 'zeitzeugen-portal.de',
    inhalt: 'Videoclips von Zeitzeuginnen und Zeitzeugen zur deutschen Geschichte des 20. Jahrhunderts, nach Themen und Jahrzehnten geordnet.',
    subjects: ['geschichte', 'politik'],
    art: 'video',
    frei: true
  },
  {
    id: 'bundesarchiv',
    name: 'Bundesarchiv',
    traeger: 'Bundesarchiv',
    // Die frühere Adresse filmothek.bundesarchiv.de war bei der Prüfung am 22.09.2026 nicht
    // erreichbar; der Einstieg läuft über das Hauptportal.
    domain: 'bundesarchiv.de',
    inhalt: 'Wochenschauen, Dokumentar- und Propagandafilme sowie Tondokumente aus dem Bestand des Bundesarchivs.',
    subjects: ['geschichte'],
    art: 'video',
    frei: true,
    hinweis: 'Propagandafilme sind Quellen ÜBER ihre Entstehungszeit – sie brauchen immer eine Einordnung und dürfen nie unkommentiert gezeigt werden.'
  },
  {
    id: 'lemo',
    name: 'LeMO – Lebendiges Museum Online',
    traeger: 'Deutsches Historisches Museum, Haus der Geschichte, Bundesarchiv',
    domain: 'dhm.de/lemo',
    inhalt: 'Ton- und Filmdokumente zur deutschen Geschichte, jeweils mit Einordnung und Quellenangabe.',
    subjects: ['geschichte', 'politik'],
    art: 'beides',
    frei: true
  },
  {
    id: 'bundestag-mediathek',
    name: 'Mediathek des Deutschen Bundestages',
    traeger: 'Deutscher Bundestag',
    domain: 'bundestag.de/mediathek',
    inhalt: 'Vollständige Aufzeichnungen von Plenardebatten und Reden, nach Datum und Thema durchsuchbar.',
    subjects: ['politik', 'geschichte'],
    art: 'video',
    frei: true
  },
  {
    id: 'bpb',
    name: 'Bundeszentrale für politische Bildung',
    traeger: 'Bundeszentrale für politische Bildung',
    domain: 'bpb.de',
    inhalt: 'Audiobeiträge, Podcasts und Filme zu politischen und zeitgeschichtlichen Themen, ausdrücklich für den Unterricht aufbereitet.',
    subjects: ['politik', 'geschichte'],
    art: 'beides',
    frei: true
  },
  {
    id: 'planet-schule',
    name: 'Planet Schule',
    traeger: 'SWR und WDR',
    domain: 'planet-schule.de',
    inhalt: 'Filme und Hörbeiträge für den Unterricht, mit Begleitmaterial und Altersangabe.',
    subjects: ['geschichte', 'politik', 'erdkunde', 'biologie', 'physik', 'chemie'],
    art: 'beides',
    frei: true
  },
  {
    id: 'ard-mediathek',
    name: 'ARD Mediathek / ARD Retro',
    traeger: 'ARD',
    domain: 'ardmediathek.de',
    inhalt: 'Aktuelle und historische Fernsehbeiträge; „ARD Retro" enthält Aufnahmen ab den 1950er-Jahren.',
    subjects: ['geschichte', 'politik'],
    art: 'video',
    frei: true,
    hinweis: 'Mediatheksbeiträge verschwinden nach der Verweildauer. Vor dem Einsatz prüfen, ob der Beitrag noch abrufbar ist.'
  },
  {
    id: 'ddb',
    name: 'Deutsche Digitale Bibliothek',
    traeger: 'Stiftung Deutsche Digitale Bibliothek',
    domain: 'deutsche-digitale-bibliothek.de',
    inhalt: 'Gemeinsamer Sucheinstieg in die Bestände deutscher Archive, Museen und Rundfunkanstalten – auch Ton- und Filmdokumente.',
    subjects: ['geschichte', 'politik'],
    art: 'beides',
    frei: true,
    hinweis: 'Sucheinstieg über viele Häuser hinweg; die Abrufbarkeit hängt am jeweiligen Bestand.'
  },
  {
    id: 'dra',
    name: 'Deutsches Rundfunkarchiv',
    traeger: 'ARD',
    domain: 'dra.de',
    inhalt: 'Ton- und Fernsehüberlieferung des deutschen Rundfunks, historische Originaltöne.',
    subjects: ['geschichte', 'politik'],
    art: 'beides',
    frei: false,
    hinweis: 'Recherche ist offen, die Aufnahmen selbst sind meist nicht frei abrufbar.'
  },
  {
    id: 'wikisource',
    name: 'Wikisource',
    traeger: 'Wikimedia',
    domain: 'de.wikisource.org',
    inhalt: 'Gemeinfreie Quellentexte im Wortlaut: Urkunden, Reden, Gesetze, Zeitungsartikel, Briefe.',
    subjects: ['geschichte', 'politik', 'deutsch'],
    art: 'text',
    frei: true,
    hinweis: 'Die App gleicht Zitate bereits gegen Wikisource ab (completeOriginalSources) - Fundstellen von dort sind am besten pruefbar.'
  },
  {
    id: 'schluesseldokumente',
    name: '100(0) Schluesseldokumente zur deutschen Geschichte',
    traeger: 'Bayerische Staatsbibliothek',
    domain: '1000dokumente.de',
    inhalt: 'Zentrale Quellen des 20. Jahrhunderts im Faksimile und als Transkription, jeweils mit fachwissenschaftlicher Einordnung.',
    subjects: ['geschichte', 'politik'],
    art: 'text',
    frei: true
  },
  {
    id: 'archive-org',
    name: 'Internet Archive (archive.org)',
    traeger: 'Internet Archive',
    domain: 'archive.org',
    inhalt: 'Sehr grosser Bestand an Ton-, Film- und Textdokumenten. NUR in kuratierten Sammlungen brauchbar - siehe Hinweis.',
    subjects: ['deutsch', 'englisch', 'musik'],
    art: 'beides',
    frei: false,
    hinweis:
      'ACHTUNG: archive.org ist eine Hochladeplattform, kein kuratiertes Archiv. Am 23.09.2026 geprueft: Eine offene Suche nach "Nationalsozialismus" liefert als Top-Treffer "Mein Kampf" sowie revisionistische Titel; nur 14 % der Tondokumente tragen ueberhaupt eine Lizenzangabe. Fuer Geschichte deshalb NICHT als Suchort freigegeben. Brauchbar sind einzelne Sammlungen: librivoxaudio (gemeinfreie Literaturaufnahmen, auch deutsch) und prelinger (historische Gebrauchsfilme).'
  },
  {
    id: 'zwangsarbeit-archiv',
    name: 'Zwangsarbeit 1939–1945. Erinnerungen und Geschichte',
    traeger: 'Freie Universität Berlin',
    domain: 'zwangsarbeit-archiv.de',
    inhalt: 'Rund 600 lebensgeschichtliche Interviews mit ehemaligen Zwangsarbeiterinnen und Zwangsarbeitern.',
    subjects: ['geschichte'],
    art: 'beides',
    frei: false,
    hinweis: 'Zugang nur nach Anmeldung. Für ein Arbeitsblatt mit QR-Code ungeeignet – eher zur Vorbereitung durch die Lehrkraft.'
  }
]

export const archivesForSubject = (subjectId: string): MediaArchive[] => MEDIA_ARCHIVES.filter((a) => a.subjects.includes(subjectId))

/** Fächer, in denen die KI eine Originalaufnahme SUCHEN statt eine erzeugen soll. */
export const SEARCHES_MEDIA = ['geschichte', 'politik']

export const searchesMediaSources = (subjectId: string): boolean => SEARCHES_MEDIA.includes(subjectId)

/**
 * Regelteil für den KI-Auftrag.
 *
 * Der wichtigste Satz ist das Verbot: keine nachgestellte Aufnahme, kein erfundener
 * Zeitzeuge, keine erfundene Rede. Was die KI nicht findet, bleibt leer – ein ehrliches
 * „nicht gefunden" ist im Geschichtsunterricht unendlich viel besser als eine erfundene
 * Quelle, die echt aussieht.
 */
/**
 * Archive, in denen die KI TEXTquellen suchen soll.
 *
 * Bisher gab die KI den Wortlaut aus dem Gedaechtnis wieder, und die App glich ihn
 * nachtraeglich gegen die Adresse und Wikisource ab. Das faengt den Fehler auf, verhindert
 * ihn aber nicht. Nennt man die Sammlungen, in denen die Quelle tatsaechlich liegt, steigt
 * die Trefferquote - die Pruefung bleibt trotzdem.
 */
export const textArchivesForSubject = (subjectId: string): MediaArchive[] =>
  MEDIA_ARCHIVES.filter((a) => a.subjects.includes(subjectId) && (a.art === 'text' || a.art === 'beides') && a.frei)

export function textSourceRules(subjectId: string): string {
  const archive = textArchivesForSubject(subjectId)
  if (!archive.length || !SEARCHES_MEDIA.includes(subjectId)) return ''
  return [
    'TEXTQUELLEN (Geschichte/Politik):',
    '- Gib den Wortlaut einer Quelle nicht aus dem Gedaechtnis wieder. Nenne eine Fundstelle aus einer dieser Sammlungen und zitiere nur, was dort steht:',
    ...archive.map((a) => `  - ${a.name} (${a.traeger}), ${a.domain} - ${a.inhalt}`),
    '- Die App prueft den Wortlaut gegen die angegebene Adresse. Eine erfundene Fundstelle faellt dabei auf.',
    '- Kuerzungen werden mit [...] kenntlich gemacht; der Sinnzusammenhang bleibt gewahrt.',
    '- Findest du keine gesicherte Fundstelle, schreibe statt eines Zitats eine DARSTELLUNG in eigenen Worten und kennzeichne sie als solche.'
  ].join('\n')
}

export function mediaSourceRules(subjectId: string): string {
  /*
   * Gebunden an SEARCHES_MEDIA, nicht daran, ob es zufaellig ein Archiv gibt.
   *
   * Der Unterschied wurde erst durch archive.org sichtbar: Es gehoert zu Deutsch, Englisch
   * und Musik, also lieferte die alte Bedingung („gibt es ein Archiv?") ploetzlich auch fuer
   * Englisch eine Quellenregel – in einem Fach, in dem die KI den Hoertext selbst schreiben
   * soll. Die Regel gilt nur dort, wo eine Aufnahme eine QUELLE ist.
   */
  if (!SEARCHES_MEDIA.includes(subjectId)) return ''
  const archive = archivesForSubject(subjectId)
  if (!archive.length) return ''
  const frei = archive.filter((a) => a.frei)
  return [
    'TON- UND FILMQUELLEN (Geschichte/Politik):',
    '- Zeitzeugenberichte, Reden, Rundfunkbeiträge und Interviews werden NICHT erfunden und NICHT nachgesprochen. Sie sind Quellen; eine nachgestellte Aufnahme wäre eine Fälschung.',
    '- Suche stattdessen eine echte Aufnahme in einem dieser Archive und gib die vollständige Adresse an:',
    ...frei.map((a) => `  • ${a.name} (${a.traeger}), ${a.domain} – ${a.inhalt}`),
    '- Nenne zu jeder Aufnahme: Titel, sprechende Person mit Rolle, Jahr, Archiv und Adresse.',
    '- Findest du keine Aufnahme, die du sicher benennen kannst, lass die Adresse LEER und trage stattdessen 2–4 Suchbegriffe in searchTerms ein, mit denen die Lehrkraft im Archiv fündig wird. Erfinde nichts.',
    '- Eine Aufnahme ist immer eine Quelle mit Entstehungszeit, Urheber und Absicht – die Aufgaben fragen auch danach, nicht nur nach dem Inhalt.'
  ].join('\n')
}
