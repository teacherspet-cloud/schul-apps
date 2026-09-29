/**
 * Vorgaben der Bundesländer zum Hörverstehen.
 *
 * Die KMK setzt den Rahmen, die Länder füllen ihn unterschiedlich aus – und zwar in Punkten,
 * die sich unmittelbar auf ein Arbeitsblatt oder eine Klassenarbeit auswirken:
 * - Wie heißt der Kompetenzbereich? (NRW „Hör-/Hörsehverstehen“, Bremen je nach Plan anders)
 * - Muss Hörverstehen in Klassenarbeiten überhaupt vorkommen? (NRW: ja, mindestens einmal
 *   pro Schuljahr – Bremen: keine solche Vorgabe)
 * - Ist Richtig/Falsch zugelassen? Das unterscheidet sich sogar INNERHALB eines Landes nach
 *   Stufe: In Bremen ist true/false im MSA ausdrücklich erlaubt, im Abitur ausdrücklich
 *   ausgeschlossen.
 * - Wie lang, wie oft gehört, welcher Anteil an der Arbeit?
 *
 * Hinterlegt ist nur, was in einem amtlichen Dokument steht. Für Länder ohne Eintrag gilt
 * `KMK_BASELINE` – die gemeinsamen Vorgaben der KMK-Bildungsstandards. Das ist Absicht:
 * lieber eine ehrliche Lücke als eine erfundene Landesregel.
 */

export type ListeningStage = 'sek1' | 'sek2'

export interface ListeningStateRules {
  /** Name des Lehrplanwerks, wie das Land es nennt */
  curriculum: string
  /** Bezeichnung des Kompetenzbereichs, wörtlich aus dem Lehrplan */
  competenceName: string
  /**
   * Abweichende Bezeichnung außerhalb des Gymnasiums. Niedersachsen führt dieselbe
   * Kompetenz in zwei Werken unter zwei Namen – das Blatt soll den richtigen nennen.
   */
  competenceNameNonGymnasium?: string
  /**
   * Abweichende Bezeichnung in der Oberstufe. Im Saarland heißt der Bereich in der
   * Sekundarstufe I „Hörverstehen und audiovisuelles Verstehen“, in der Oberstufe
   * „Hör-/Hörsehverstehen“; Hessen unterscheidet ähnlich.
   */
  competenceNameSek2?: string
  /** Sekundarstufe I */
  sek1: {
    /** Muss Hörverstehen in Klassenarbeiten geprüft werden? */
    requiredInTests: boolean
    /** Richtig/Falsch als Aufgabenformat zugelassen? */
    trueFalse: boolean
    /** Zahl der Hördurchgänge in der zentralen Abschlussprüfung */
    plays: number
    /** Erläuterung für die Lehrkraft */
    note: string
  }
  /** Gymnasiale Oberstufe und Abitur */
  sek2: {
    /**
     * Hörverstehen ist Pflichtbestandteil der schriftlichen Abiturprüfung.
     * Fehlt der Wert, ließ sich das aus den amtlichen Dokumenten nicht ermitteln –
     * dann behauptet die App dazu nichts.
     */
    requiredInAbitur?: boolean
    /** Ab welchem Abiturjahrgang */
    since?: number
    /** Anteil am Ergebnis der Klausur in Prozent */
    share?: number
    /** Bearbeitungszeit des Prüfungsteils in Minuten */
    minutes?: number
    /** Zahl der Hörtexte (von, bis) */
    texts?: [number, number]
    /** Höchstlänge je Text und insgesamt, in Sekunden */
    maxSeconds?: number
    maxSecondsTotal?: number
    plays: number
    trueFalse: boolean
    note: string
  }
  /** Fundstellen */
  sources: string[]
}

/**
 * Gemeinsamer Rahmen, solange für ein Land nichts Eigenes belegt ist.
 * Quellen: KMK-Bildungsstandards erste Fremdsprache MSA (2003) und ESA/MSA (2023),
 * fortgeführte Fremdsprache Allgemeine Hochschulreife (2012).
 */
export const KMK_BASELINE: ListeningStateRules = {
  curriculum: 'Lehrplan des Landes',
  competenceName: 'Hör- und Hörsehverstehen',
  sek1: {
    requiredInTests: false,
    trueFalse: true,
    plays: 2,
    note: 'Für dieses Land ist keine eigene Vorgabe hinterlegt; es gelten die KMK-Bildungsstandards.'
  },
  sek2: {
    requiredInAbitur: true,
    plays: 2,
    maxSeconds: 300,
    trueFalse: false,
    note: 'KMK Abitur 2012: Die Hörvorlage soll in der Regel fünf Minuten nicht überschreiten; die Zahl der Hörvorgänge wird auf der Tonspur angesagt.'
  },
  sources: ['KMK-Bildungsstandards erste Fremdsprache (MSA 2003, ESA/MSA 2023) und fortgeführte Fremdsprache (Abitur 2012)']
}

/** Länder, für die eigene Vorgaben belegt sind. */
export const LISTENING_STATES: Record<string, ListeningStateRules> = {
  BW: {
    curriculum: 'Bildungsplan',
    competenceName: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: false,
      plays: 2,
      note:
        'Für die Zahl der Klassenarbeiten und eine Pflicht zum Hörverstehen ist nichts Amtliches hinterlegt. ' +
        'Die Kommunikationsprüfung ist Pflichtteil der Abiturprüfung, nicht der Sekundarstufe I.'
    },
    sek2: {
      requiredInAbitur: true,
      share: 20,
      minutes: 30,
      maxSeconds: 300,
      plays: 2,
      trueFalse: false,
      note:
        'Hörverstehen ist Teil I der schriftlichen Prüfung und zählt 20 Prozent (Schreiben 55, Kommunikationsprüfung 25). ' +
        'Die Bearbeitungszeit von etwa 30 Minuten ist die Länge der Tonspur zuzüglich Einlesezeit; danach folgen 15 Minuten Pause und Teil II mit 225 Minuten. ' +
        'Vorgesehen sind Auswahlaufgaben, Zuordnungsaufgaben und halboffene Aufgaben wie Kurzantworten – Richtig/Falsch steht nicht auf der Liste. ' +
        'Textvorlagen sind unbekannte Hördokumente, etwa Ausschnitte aus Radiointerviews, Reportagen, Reden, Hörspielen oder Lesungen. ' +
        'Zahl und Höchstlänge der Hörtexte sind im Facherlass nicht geregelt.'
    },
    sources: [
      'Bildungsplan 2016 Baden-Württemberg, Englisch Gymnasium',
      'Erlass für die Abiturprüfung (Facherlass) sowie Beurteilungs- und Korrekturrichtlinienerlass des Kultusministeriums BW',
      'Leitfaden für die gymnasiale Oberstufe'
    ]
  },
  BY: {
    curriculum: 'LehrplanPLUS',
    competenceName: 'Hör- und Hörsehverstehen',
    sek1: {
      requiredInTests: true,
      trueFalse: false,
      plays: 2,
      note:
        'Jede der fünf sprachlichen Teilkompetenzen – also auch das Hör- und Hörsehverstehen – soll mindestens einmal pro Schuljahr in einem Leistungsnachweis geprüft werden. ' +
        'In den Fremdsprachen sind mindestens drei Schulaufgaben zu halten, bei vier und mehr Wochenstunden mindestens vier; große Leistungsnachweise sind in der Regel zweiteilig, bewährt ist etwa die Kombination von Hörverstehen und Sprachmittlung. ' +
        'In mindestens zwei Jahrgangsstufen wird eine Schulaufgabe oder ein Teil davon als mündliche Prüfung abgehalten. ' +
        'Zugelassen sind geschlossene Formate (Auswahl, Zuordnung), halboffene (Ausfüllen, Vervollständigen, Umformen, Korrektur falscher Aussagen) und offene; „Error spotting“ soll in Prüfungen vermieden werden, Übersetzung und Diktat sind nicht zu empfehlen.'
    },
    sek2: {
      requiredInAbitur: true,
      since: 2026,
      share: 20,
      minutes: 30,
      texts: [2, 4],
      maxSecondsTotal: 600,
      plays: 2,
      trueFalse: false,
      note:
        'Hörverstehen ist Prüfungsteil A, seit dem Abitur 2026, und zählt 20 Prozent (Schreiben 55, Sprachmittlung 25); etwa 30 Minuten, danach rund 15 Minuten Pause. ' +
        'Zwei bis vier Teilaufgaben, wobei eine auch mehrere kurze Texte umfassen kann; alle Hörtexte zusammen dauern in der Regel acht bis zehn Minuten. ' +
        'Vorgesehen sind Multiple Matching, Multiple Choice, Fragen, Satzergänzung und table completion – Richtig/Falsch steht nicht auf der Liste; die Aufgabenform wird innerhalb einer Teilaufgabe möglichst nicht gewechselt. ' +
        'Grundlage sind authentische Dokumente (Radioreportage, Podcast, Interview, Nachrichten, Rede, Vortrag, Gespräch, Diskussion, Hörbuch, Hörspiel, Kurzgeschichte) und ausdrücklich nicht nur monologische Texte. ' +
        'Grundlegendes und erhöhtes Niveau unterscheiden sich unter anderem in Sprechgeschwindigkeit, Sprecherwechseln, Redundanz, Abweichung von der Standardsprache und Hintergrundgeräuschen.'
    },
    sources: [
      'ISB Bayern: Moderne Fremdsprachen – Schriftliche Prüfungsformen in der Profil- und Leistungsstufe und im Abitur (KMBek, ab Prüfungstermin 2026)',
      'ISB-Schreiben Moderne Fremdsprachen Jahrgangsstufen 5 bis 11',
      'ISB: GER-Niveaustufen (Englisch: Jgst. 5 A1 bis Jgst. 13 B2/C1)',
      'Schulordnung für die Gymnasien in Bayern (GSO) § 22'
    ]
  },
  HE: {
    curriculum: 'Kerncurriculum',
    competenceName: 'Hör- und Hör-/Sehverstehen',
    competenceNameSek2: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: true,
      plays: 2,
      note:
        'Zur Zahl der Klassenarbeiten und zu einer Pflicht, Hörverstehen zu prüfen, ist nichts Amtliches hinterlegt. ' +
        'In der Qualifikationsphase ist in Q3 eine mündliche Kommunikationsprüfung im Leistungskurs verpflichtend, im Grundkurs möglich. ' +
        'Zielniveau der Sekundarstufe I am Gymnasium ist im Wesentlichen B1, in der Oberstufe B2 und in den rezeptiven Teilkompetenzen auch C1.'
    },
    sek2: {
      plays: 2,
      trueFalse: false,
      note:
        'Ob die schriftliche Abiturprüfung einen Hörverstehensteil enthält, ließ sich aus den erreichbaren amtlichen Dokumenten nicht klären – der Abiturerlass war nicht abrufbar. ' +
        'Belegt ist nur, dass Hessen für den Kompetenzbereich Schreiben die ländergemeinsamen Aufgaben des IQB-Pools nutzt. Bitte im Zweifel den aktuellen Abiturerlass prüfen.'
    },
    sources: [
      'Kerncurriculum Sekundarstufe I Gymnasium – Moderne Fremdsprachen (2023)',
      'Kerncurriculum gymnasiale Oberstufe – Englisch',
      'Oberstufen- und Abiturverordnung (OAVO) § 9 mit Übersicht zu Klausuren und Klausurersatzleistungen'
    ]
  },
  SL: {
    curriculum: 'Lehrplan',
    competenceName: 'Hörverstehen und audiovisuelles Verstehen',
    competenceNameSek2: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: true,
      plays: 2,
      note:
        'Zur Zahl der Klassenarbeiten und zu einer Pflicht, Hörverstehen zu prüfen, ist nichts Amtliches hinterlegt. ' +
        'Der Lehrplan verlangt zunehmend authentisches Hörmaterial (etwa Ausschnitte aus Serien oder Videos in sozialen Netzwerken) und viele verschiedene Sprecher und Varietäten, vor allem amerikanische. ' +
        'Als Schwierigkeitsmerkmale nennt er Didaktisierungsgrad, Länge, Zahl der Sprechenden, Abweichung von der Standardsprache, Sprechgeschwindigkeit und Informationsdichte.'
    },
    sek2: {
      requiredInAbitur: false,
      plays: 2,
      trueFalse: true,
      note:
        'Die schriftliche Abiturprüfung hat KEINEN Hörverstehensteil: Sie besteht aus Sprechen (25 Prozent), Leseverstehen (20) und Schreiben (55). ' +
        'Ein auditiver oder audiovisueller Text von etwa drei bis höchstens fünf Minuten kommt nur als Grundlage der mündlichen Prüfung vor (30 Minuten Vorbereitungszeit). ' +
        'Für das Leseverstehen ist „true/false/evidence/not given“ ausdrücklich zugelassen – das Saarland ist damit das einzige Land, das Richtig/Falsch wörtlich erlaubt.'
    },
    sources: [
      'Allgemeine Prüfungsanforderungen für das Abitur im Fach Englisch (APA Englisch), Saarland',
      'Lehrplan Englisch – Hauptphase der gymnasialen Oberstufe',
      'Lehrplan Englisch – Neunjähriges Gymnasium, erste Fremdsprache'
    ]
  },
  SN: {
    curriculum: 'Lehrplan',
    competenceName: 'mündliche Rezeption',
    sek1: {
      requiredInTests: false,
      trueFalse: true,
      plays: 2,
      note:
        'Besonderheit: Sachsen kennt keinen Kompetenzbereich „Hörverstehen“. Die Ziele sind nach „mündlich“ und „schriftlich“ gegliedert, jeweils in Rezeption, Produktion und Interaktion; das Hörverstehen liegt unter „mündlich – Rezeption“. Im Text heißt es „Hör- und Hör-/Sehtexte“. ' +
        'Der Lehrplan staffelt das Sprechtempo ausdrücklich: in Klasse 5/6 „langsam und deutlich“, in Klasse 7/8 „in annähernd natürlichem Tempo“, dort auch „bei wiederholtem Hören auch Details erfassen“; in der Oberstufe authentische Texte, sofern überwiegend Standardsprache gesprochen wird.'
    },
    sek2: {
      plays: 2,
      trueFalse: true,
      note: 'Ob und wie Hörverstehen im Abitur geprüft wird, ließ sich nicht belegen – die Schulordnungen waren nicht abrufbar.'
    },
    sources: ['Lehrplan Gymnasium Englisch (2004, Überarbeitung 2022)', 'Lehrplan Oberschule Englisch (2004, Überarbeitung 2019)']
  },
  TH: {
    curriculum: 'Lehrplan',
    competenceName: 'Hör-/Hör-Sehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: true,
      plays: 2,
      note:
        'Zur Zahl der Klassenarbeiten und zu einer Pflicht, Hörverstehen zu prüfen, ist nichts Amtliches hinterlegt. ' +
        'Der Lehrplan begründet die Schreibweise ausdrücklich mit der Unterscheidung von Hörverstehen und Hör-Sehverstehen; der Oberbereich heißt „Texte rezipieren“.'
    },
    sek2: {
      plays: 2,
      trueFalse: true,
      note:
        'Die Prüfungsvorgaben liegen hinter einer Anmeldung im Schulportal und ließen sich nicht einsehen. ' +
        'Belegt ist die Bewertungsregel: „Beim Hör-/Hör-Sehverstehen muss der Bewertungsschwerpunkt auf der Rezeptionsleistung liegen“ – Sprachfehler in der Antwort dürfen die Note also nicht bestimmen.'
    },
    sources: ['Lehrplan für den Erwerb der allgemeinen Hochschulreife – Englisch (Thüringen 2019)']
  },
  BE: {
    curriculum: 'Rahmenlehrplan',
    competenceName: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: true,
      plays: 2,
      note:
        'In den modernen Fremdsprachen KANN einmal im Schuljahr eine Klassenarbeit durch eine mündliche Leistungsbewertung ersetzt werden – eine Pflicht dazu gibt es nicht. ' +
        'In der Prüfung zum ersten Schulabschluss (eBBR/MSA) ist Hörverstehen Prüfungsteil mit vier Aufgaben (Telefongespräche und Ansagen, Radiobeiträge, Einzelaussagen zu einem Thema, Diskussion); jeder Text wird zweimal gehört. ' +
        'Der Rahmenlehrplan arbeitet mit den Niveaustufen A bis H statt mit GER-Stufen.'
    },
    sek2: {
      requiredInAbitur: false,
      plays: 2,
      trueFalse: false,
      note:
        'Hörverstehen ist KEIN Teil der schriftlichen Abiturprüfung: Der Aufgabenvorschlag besteht aus Leseverstehen und Schreiben (Teil 1) sowie Sprachmittlung (Teil 2). ' +
        'Ein Hörtext in einer Oberstufenklausur ist hier also Übung, keine Prüfungssimulation.'
    },
    sources: [
      'Rahmenlehrplan Jahrgangsstufen 1–10, Teil C Moderne Fremdsprachen (LISUM Berlin-Brandenburg 2015, aktualisiert 2025)',
      'Prüfungsschwerpunkte Englisch für das Abitur (SenBJF)',
      'Sek I-VO § 19 Abs. 3',
      'Fachbrief Englisch Nr. 27, Anlage 2 (Prüfung eBBR/MSA)'
    ]
  },
  BB: {
    curriculum: 'Rahmenlehrplan',
    competenceName: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: true,
      plays: 2,
      note:
        'Zwei schriftliche Arbeiten je Schuljahr in den Fremdsprachen (Jg. 7–10), 45 bis 90 Minuten; eine davon kann je Jahrgangsstufe durch eine mündliche Leistung ersetzt werden. ' +
        'Eine Pflicht, Hörverstehen in einer Arbeit zu prüfen, gibt es nicht. In der zentralen Prüfung am Ende von Jahrgang 10 ist Hörverstehen dagegen Prüfungsteil und trägt dort rund die Hälfte der Punkte. ' +
        'Der Fachbrief mahnt ausdrücklich an, über die didaktisierten Lehrwerkstexte hinaus authentische Hör- und Hörsehtexte einzusetzen.'
    },
    sek2: {
      requiredInAbitur: false,
      plays: 2,
      trueFalse: false,
      note: 'Wie in Berlin ist Hörverstehen KEIN Teil der schriftlichen Abiturprüfung (Leseverstehen und Schreiben, dazu Sprachmittlung).'
    },
    sources: [
      'Rahmenlehrplan Jahrgangsstufen 1–10, Teil C Moderne Fremdsprachen (2015/2025)',
      'VV-Leistungsbewertung Brandenburg mit Anlage „Anzahl und Dauer der schriftlichen Arbeiten“',
      'Prüfungsschwerpunkte Englisch Abitur (MBJS)',
      'Fachbrief Nr. 2 Englisch Brandenburg (2018)'
    ]
  },
  HH: {
    curriculum: 'Bildungsplan',
    competenceName: 'Hör- und Hör-Sehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: true,
      plays: 2,
      note:
        'Mindestens vier Klassenarbeiten je Schuljahr in den Fremdsprachen; eine (bei vier Arbeiten bis zu zwei) kann durch eine andere Leistung ersetzt werden. ' +
        'Verbindlich ist eine gesonderte Sprechprüfung, die eine Klassenarbeit ersetzt – frühestens im dritten Lernjahr und nicht vor Jahrgang 7. ' +
        'Eine ausdrückliche Pflicht, Hörverstehen in einer Klassenarbeit zu prüfen, steht nicht im Plan. ' +
        'Die Abschlussprüfungen in Englisch sind seit dem Schuljahr 2025/26 mündlich – einen schriftlichen Hörverstehensteil gibt es dort nicht mehr.'
    },
    sek2: {
      requiredInAbitur: true,
      share: 20,
      minutes: 30,
      maxSeconds: 300,
      maxSecondsTotal: 600,
      plays: 2,
      trueFalse: true,
      note:
        'Hörverstehen ist erster Prüfungsteil, 30 Minuten, 20 Prozent (Sprachmittlung 25, Schreiben 55). Texte in der Regel höchstens fünf Minuten, zusammen höchstens zehn Minuten Abspieldauer; ' +
        'ein- ODER zweimalige Darbietung – Hamburg legt sich hier nicht fest. Eine gesonderte Lese- oder Auswahlzeit ist nicht vorgesehen. ' +
        'Zugelassen sind geschlossene Formate (matching, multiple choice) und halboffene (short answers, gap filling, table completion, note taking); die Liste ist mit „z. B.“ offen, Richtig/Falsch ist weder genannt noch ausgeschlossen.'
    },
    sources: [
      'Bildungsplan Gymnasium Sekundarstufe I – Englisch (2022); Bildungsplan Stadtteilschule 5–11 – Englisch (2022)',
      'Bildungsplan Studienstufe Neuere Fremdsprachen – Englisch',
      'Abiturrichtlinie vom 21.07.2022, Anlage 2 Englisch, Kap. 4.2.3',
      'Regelungen für die zentralen schriftlichen Prüfungsaufgaben (BSB Hamburg)'
    ]
  },
  MV: {
    curriculum: 'Rahmenplan',
    competenceName: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: true,
      trueFalse: false,
      plays: 2,
      note:
        'Klassenarbeiten prüfen in der Regel mindestens zwei Teilkompetenzen; im Lauf der Sekundarstufe I muss jede Teilkompetenz – also auch das Hör-/Hörsehverstehen – mindestens einmal in einer Klassenarbeit vorkommen. ' +
        'In der Prüfung zur Mittleren Reife ist Hörverstehen Teil A (ca. 30 Minuten, rund 20 Prozent): je Aufgabenblatt eine Minute Einlesezeit, jeder Text zweimal, 15 Sekunden Pause zwischen den Texten, danach je eine Minute zum Fertigschreiben. ' +
        'Zugelassen sind multiple choice, multiple matching, Lücken und Tabellen ergänzen, sentence completion und Kurzantworten von ein bis fünf Wörtern – Richtig/Falsch steht nicht auf der Liste.'
    },
    sek2: {
      requiredInAbitur: true,
      since: 2017,
      share: 20,
      minutes: 30,
      texts: [2, 4],
      maxSeconds: 300,
      maxSecondsTotal: 600,
      plays: 2,
      trueFalse: false,
      note:
        'Zwei bis vier Texte, je in der Regel höchstens fünf Minuten, zusammen höchstens zehn Minuten; etwa 30 Minuten Bearbeitungszeit, 20 Prozent des Ergebnisses. ' +
        'Wörtlich: „Das Aufgabenformat true/false kommt nicht zur Anwendung.“ Zugelassen sind short answers, table completion, multiple matching und multiple choice. ' +
        'Zahlen dürfen in Ziffern angegeben werden; halbe Bewertungseinheiten gibt es nicht, und mehrere Kreuze bei einer Auswahlaufgabe gelten als falsch.'
    },
    sources: [
      'Rahmenplan Englisch Gymnasium / Regionale Schule, Jahrgangsstufe 7 bis 10 (IQ M-V 2025)',
      'Hinweise für den Aufgabenteil Hörverstehen im Rahmen des schriftlichen Abiturs Englisch (Bildungsministerium M-V)',
      'Vorabhinweise zum Abitur M-V und zur Mittleren Reife (Englisch)'
    ]
  },
  NI: {
    curriculum: 'Kerncurriculum',
    competenceName: 'Hör- und Hör-/Sehverstehen',
    competenceNameNonGymnasium: 'Hörverstehen und audiovisuelles Verstehen',
    sek1: {
      requiredInTests: true,
      trueFalse: false,
      plays: 2,
      note:
        'Alle kommunikativen Teilkompetenzen – also auch das Hör- bzw. Hör-/Sehverstehen – sind im Lauf eines Schuljahres mindestens einmal in einer schriftlichen Lernkontrolle zu überprüfen. ' +
        'Drei bis vier Lernkontrollen je Schuljahr, vier ist der Regelfall; je Doppeljahrgang ersetzt eine Überprüfung des Sprechens eine schriftliche Lernkontrolle. ' +
        'In der Abschlussprüfung von Jahrgang 10 beginnt die Arbeit mit dem Hörteil: Die Audiodatei läuft ohne Unterbrechung durch und enthält die nötigen Wiederholungen; das dauert etwa 30 Minuten. ' +
        'Formate: multiple choice, fill-in, note-taking und (multiple) matching – Richtig/Falsch ist nicht genannt.'
    },
    sek2: {
      requiredInAbitur: true,
      since: 2017,
      share: 20,
      minutes: 30,
      texts: [2, 3],
      maxSeconds: 300,
      plays: 2,
      trueFalse: false,
      note:
        'Erster Prüfungsteil, etwa 30 Minuten, 20 Prozent; mindestens zwei Texte von je in der Regel höchstens fünf Minuten, jeder Text zweimal. ' +
        'Ablauf der Musteraufgaben: zwei bis drei Minuten Einlesezeit, erster Durchgang, zwei Minuten Bearbeitung, zweiter Durchgang, zwei Minuten Bearbeitung. ' +
        'Wörtlich: „Das Aufgabenformat true/false kommt nicht zur Anwendung.“ Zugelassen sind short answers, gap filling, multiple matching und multiple choice. ' +
        'Ein Punkt je richtiger Antwort, keine halben Punkte; Rechtschreib- und Grammatikfehler zählen nur, wenn sie den Sinn entstellen, und Stichpunkte sowie wörtliche Übernahmen aus dem Hörtext sind zulässig.'
    },
    sources: [
      'Kerncurriculum für das Gymnasium Schuljahrgänge 5–10 – Englisch (2015)',
      'Kerncurriculum für die Schulformen des Sekundarbereichs I – Englisch',
      'Musteraufgaben für das Fach Englisch „Hörverstehen“ zur Vorbereitung auf die Abiturprüfung (Nds. Kultusministerium)',
      'Englisch – Hinweise zur schriftlichen Abiturprüfung (Nds. Kultusministerium)',
      'Grundsatzerlass „Die Arbeit in den Schuljahrgängen 5 bis 10 des Gymnasiums“'
    ]
  },
  ST: {
    curriculum: 'Fachlehrplan',
    competenceName: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: false,
      plays: 2,
      note:
        'Besonderheit: In Jahrgang 6 gibt es eine zentrale Klassenarbeit, die mit einem Hörteil beginnt (10 Minuten, der Text wird zweimal gespielt); sie zählt als Klassenarbeit und geht mit 25 bis 40 Prozent in die Jahresnote ein. ' +
        'In der Prüfung zum Mittleren Schulabschluss dauert Teil A Hörverstehen 30 Minuten, darin fünf Minuten Einlesezeit und zwei Minuten zum Nachlesen; alle Ansagen und Pausen stecken in der Audiodatei. ' +
        'Zugelassen sind multiple choice, multiple matching, note taking, sentence completion, Kurzantworten und table completion. Richtig/Falsch mit Textbeleg gibt es nur beim Leseverstehen, nicht beim Hören.'
    },
    sek2: {
      requiredInAbitur: true,
      minutes: 30,
      texts: [3, 3],
      plays: 2,
      trueFalse: false,
      note:
        'Hörverstehen ist Prüfungsteil 1, 30 Minuten auf beiden Anforderungsniveaus, und wird vor Ausgabe der übrigen Teile eingesammelt. Drei Hörtexte, jeder zweimal; vor jeder Aufgabe 45 Sekunden bis 1:30 Minuten Vorbereitungszeit. ' +
        'Materialgrundlage sind authentische Hörtexte. Belegt sind multiple matching, multiple choice und Kurzantworten; ein Prozentanteil und eine Höchstlänge je Text sind nicht veröffentlicht.'
    },
    sources: [
      'Fachlehrplan Gymnasium – Englisch (01.08.2022); Fachlehrplan Sekundarschule – Englisch (01.08.2019)',
      'Hinweise zu den schriftlichen Abiturprüfungen – Englisch (Bildungsministerium Sachsen-Anhalt)',
      'Hinweise zur Prüfung Mittlerer Schulabschluss – Englisch (LISA)',
      'Zentrale Klassenarbeit Englisch Schuljahrgang 6',
      'Handreichung „Leistung fordern, fördern und bewerten – Nachteilsausgleich richtig anwenden“'
    ]
  },
  SH: {
    curriculum: 'Fachanforderungen',
    competenceName: 'Hörverstehen und Hörsehverstehen',
    sek1: {
      requiredInTests: true,
      trueFalse: false,
      plays: 2,
      note:
        'Jede Klassenarbeit berücksichtigt mehrere Teilkompetenzen, und diese sind – außer dem Sprechen – in jeder Jahrgangsstufe ausgewogen Gegenstand der Klassenarbeiten; Hörverstehen gehört also regelmäßig dazu. ' +
        'Bis zum Ende der Sekundarstufe I ersetzt mindestens eine Sprechprüfung eine Klassenarbeit. Die Zahl der Klassenarbeiten ist fachlich nicht festgelegt. ' +
        'In der Abschlussprüfung (135 Minuten, davon 30 Minuten sprachpraktisch) hat Hörverstehen im ESA drei, im MSA zwei Aufgaben in geschlossenen und halboffenen Formaten; die Audiodatei läuft ohne Pause durch und enthält alle Wiederholungen. ' +
        'Wörterbücher dürfen erst nach dem Hörteil benutzt werden.'
    },
    sek2: {
      requiredInAbitur: false,
      minutes: 30,
      maxSeconds: 300,
      plays: 2,
      trueFalse: false,
      note:
        'ACHTUNG: Hörverstehen ist kein fester Prüfungsteil. Neben der verbindlichen Schreibaufgabe gibt das Ministerium für jeden Abiturjahrgang zwei weitere Teilkompetenzen vor – für 2027, 2028 und 2029 sind das Sprachmittlung und Sprechen, nicht das Hörverstehen. ' +
        'Wird es gesetzt, gilt: authentische Texte von in der Regel höchstens fünf Minuten, drei bis fünf Minuten Einlesezeit vor dem ersten Hören, zwei- oder dreimaliges Abspielen im Ganzen mit je 60 Sekunden Pause; die Zahl der Durchgänge steht in der Aufgabenstellung. ' +
        'Vorgesehen sind geschlossene und halboffene Formate; einzelne Formate nennen die Fachanforderungen nicht.'
    },
    sources: [
      'Fachanforderungen Englisch – Allgemein bildende Schulen, Sekundarstufe I und Sekundarstufe II (MBWK Schleswig-Holstein)',
      'Prüfungsregelungen für das Abitur (MBWK), Jahrgänge 2027 bis 2029',
      'Fachspezifische Hinweise Englisch ESA/MSA (MBWK)'
    ]
  },
  NW: {
    curriculum: 'Kernlehrplan',
    competenceName: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: true,
      trueFalse: false,
      plays: 2,
      note:
        'Hör-/Hörsehverstehen ist mindestens einmal pro Schuljahr in einer Klassenarbeit zu überprüfen (am Gymnasium in der zweiten Stufe mindestens einmal innerhalb der Stufe). ' +
        'An Haupt-, Real-, Gesamt- und Sekundarschulen sind Bestandteil jeder Klassenarbeit mindestens zwei Teilkompetenzen. ' +
        'Bewertet wird nur, ob die Lösung das richtige Verständnis nachweist – sprachliche Verstöße zählen nicht. ' +
        'In der ZP10 werden zwei Hörtexte je zweimal gehört (ca. 20 Minuten, 15–20 % der Punkte); zugelassen sind Auswahlaufgaben, Kurzantworten, Zuordnungs- und Einsetzaufgaben – Richtig/Falsch steht nicht auf der Liste.'
    },
    sek2: {
      requiredInAbitur: true,
      since: 2021,
      share: 20,
      minutes: 30,
      texts: [3, 3],
      maxSeconds: 300,
      maxSecondsTotal: 600,
      plays: 2,
      trueFalse: false,
      note:
        'Drei Hörtexte, jeder höchstens fünf Minuten (eher kürzer), zusammen höchstens zehn Minuten; jeder Text wird zweimal vorgespielt, dazwischen etwa eine Minute Orientierungszeit, Lesezeit höchstens zwei Minuten je Text. ' +
        'In der Regel 9–12 Items je Hörtext, bei Zuordnungsaufgaben 5–6 einschließlich Distraktoren. ' +
        'Richtig/Falsch ist ausgeschlossen: Kurzantworten „stellen keine Entscheidungsfragen“. Niveau Englisch B2 mit Anteilen von C1.'
    },
    sources: [
      'QUA-LiS NRW / Jessica Bial: Hörverstehen im Abitur und in der gymnasialen Oberstufe (Beiträge zur Schulentwicklung PRAXIS 32, 2022)',
      'MSB NRW: Klausuren in den modernen Fremdsprachen in der Qualifikationsphase der gymnasialen Oberstufe (Stand 27.10.2025)',
      'Kernlehrpläne Englisch Sekundarstufe I (Gymnasium 2019; Haupt-, Real-, Gesamt-/Sekundarschule 2022)',
      'APO-S I § 6 mit Verwaltungsvorschriften (BASS 13-21 Nr. 1.1/1.2)',
      'Vorgaben zu den zentralen Prüfungen am Ende der Klasse 10 (Englisch, MSA/EESA/GYM)'
    ]
  },
  HB: {
    curriculum: 'Bildungsplan',
    competenceName: 'Hör-/Hörsehverstehen',
    sek1: {
      requiredInTests: false,
      trueFalse: true,
      plays: 2,
      note:
        'Für Klassenarbeiten in der Sekundarstufe I gibt es keine Vorgabe, dass Hörverstehen geprüft werden muss, und keine festgelegte Zahl an Klassenarbeiten. ' +
        'In der Zentralen Abschlussprüfung ist Hörverstehen dagegen Pflicht (ca. 20 Minuten, jeder Text zweimal). ' +
        'Auf erweitertem Niveau ist Richtig/Falsch ausdrücklich zugelassen, auf grundlegendem Niveau sind es Zuordnung, Multiple Choice mit drei Optionen und Tabellen ergänzen. ' +
        'Der Kompetenzbereich heißt in den älteren Plänen „Hör-/Sehverstehen“, im Plan für die Einführungsphase „Hörverstehen und audiovisuelles Verstehen“.'
    },
    sek2: {
      requiredInAbitur: true,
      since: 2017,
      share: 20,
      minutes: 30,
      texts: [2, 3],
      maxSeconds: 300,
      maxSecondsTotal: 600,
      plays: 2,
      trueFalse: false,
      note:
        'Mindestens zwei Hörtexte, je höchstens fünf Minuten, zusammen höchstens zehn Minuten; jede Hörvorlage wird zweimal abgespielt. Grund- und Leistungskurs haben dieselben 30 Minuten und denselben Anteil von 20 Prozent. ' +
        'Zugelassen sind gap filling, multiple matching, multiple choice, note taking, short answers, sentence completion und table completion – höchstens die Hälfte davon Multiple Choice. ' +
        'Richtig/Falsch ist ausgeschlossen, weil es „das Hörverstehen noch nicht valide überprüft“. Bewertet wird nur die inhaltliche Erfüllung, geantwortet wird in der Zielsprache.'
    },
    sources: [
      'Die Senatorin für Kinder und Bildung Bremen: Moderne Fremdsprachen – Handreichungen zu den Abiturrichtlinien (2015)',
      'Richtlinie für die Aufgabenstellung und Bewertung der Leistungen in der Abiturprüfung (ARI, 2015)',
      'Verordnung über die Abiturprüfung im Lande Bremen (AP-V, 19.04.2023)',
      'Anlage zu den Zentralen Abschlussprüfungen Sekundarstufe I (Englisch)',
      'Bildungspläne Englisch: Oberschule 2010, Gymnasium 2006, Einführungsphase 2026, Fortgeführte moderne Fremdsprachen GyO 2015'
    ]
  }
}

/** Vorgaben eines Landes – oder der KMK-Rahmen, wenn dafür nichts hinterlegt ist. */
export function listeningStateRules(stateId: string | undefined): ListeningStateRules {
  return (stateId && LISTENING_STATES[stateId]) || KMK_BASELINE
}

/** Gilt für dieses Land eine eigene, belegte Vorgabe? */
export const hasStateRules = (stateId: string | undefined): boolean => Boolean(stateId && LISTENING_STATES[stateId])

/**
 * Regelsätze für den KI-Auftrag. Sie ergänzen die allgemeinen Hörtext-Regeln um das,
 * was das jeweilige Land vorschreibt.
 */
export function competenceNameFor(rules: ListeningStateRules, schoolTypeId: string | undefined, stage: ListeningStage = 'sek1'): string {
  if (stage === 'sek2' && rules.competenceNameSek2) return rules.competenceNameSek2
  return schoolTypeId === 'gymnasium' || !rules.competenceNameNonGymnasium ? rules.competenceName : rules.competenceNameNonGymnasium
}

export function listeningStateRulesText(stateId: string | undefined, stage: ListeningStage, schoolTypeId?: string): string {
  const rules = listeningStateRules(stateId)
  const part = stage === 'sek2' ? rules.sek2 : rules.sek1
  const lines = [
    `- Der Kompetenzbereich heißt hier „${competenceNameFor(rules, schoolTypeId, stage)}“ (${rules.curriculum}). Benutze diese Bezeichnung in den Hinweisen für die Lehrkraft.`,
    `- Der Hörtext wird ${part.plays === 1 ? 'einmal' : `${part.plays}-mal`} gehört.`,
    part.trueFalse
      ? '- Richtig/Falsch-Aufgaben sind hier zugelassen.'
      : '- KEINE Richtig/Falsch-Aufgaben und keine Entscheidungsfragen (ja/nein): In diesem Land sind sie für diese Stufe nicht zugelassen. Nimm stattdessen Auswahlantworten, Kurzantworten, Zuordnung oder Ergänzungsaufgaben.'
  ]
  if (stage === 'sek2' && rules.sek2.maxSeconds) {
    lines.push(
      `- Kein Hörtext länger als ${Math.round(rules.sek2.maxSeconds / 60)} Minuten${rules.sek2.maxSecondsTotal ? `, alle zusammen höchstens ${Math.round(rules.sek2.maxSecondsTotal / 60)} Minuten` : ''}.`
    )
  }
  // Wo Hörverstehen nicht geprüft wird, soll das Blatt es auch nicht als Prüfungsvorbereitung ausgeben
  if (stage === 'sek2' && rules.sek2.requiredInAbitur === false) {
    lines.push(
      '- Hinweis für die Lehrkraft (nicht auf das Schülerblatt): In diesem Bundesland ist Hörverstehen derzeit kein Teil der schriftlichen Abiturprüfung. Das Blatt übt die Kompetenz, ersetzt aber keine Prüfungsvorbereitung.'
    )
  }
  return lines.join('\n')
}

/**
 * Sind Richtig/Falsch-Items im Land und auf der Stufe zugelassen? (29.09.2026)
 * Die KI-Ergänzung „weitere Fragen im gleichen Format" darf bei einem Verbot kein solches Item
 * neu anlegen – auch nicht auf Stufe 5 („not given" gegenüber „false").
 */
export function trueFalseZugelassen(stateId: string | undefined, stage: ListeningStage = 'sek1'): boolean {
  const rules = listeningStateRules(stateId)
  return stage === 'sek2' ? rules.sek2.trueFalse : rules.sek1.trueFalse
}
