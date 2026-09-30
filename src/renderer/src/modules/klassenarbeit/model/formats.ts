/**
 * Katalog der Aufgabenformate für Klassenarbeiten.
 *
 * Englisch folgt den Kompetenzbereichen der KMK-Bildungsstandards für die erste Fremdsprache
 * (Hör-/Hörsehverstehen, Leseverstehen, Sprechen, Schreiben, Sprachmittlung, Verfügung über
 * sprachliche Mittel). Geschichte hat keine KMK-Bildungsstandards für die Sekundarstufe I;
 * die Länder arbeiten mit demselben Grundmodell aus Sach-, Methoden-, Urteils- und
 * Urteilskompetenz, das hier abgebildet ist: Niedersachsen nennt Sach-, Methoden- und
 * Urteilskompetenz mit der narrativen Kompetenz als Oberziel, Nordrhein-Westfalen ergänzt die
 * Handlungskompetenz. Für das Abitur gelten die EPA Geschichte (KMK 2005) mit den Aufgabenarten
 * Quelleninterpretation, Erörterung von Deutungen und historische Darstellung.
 */
import { formatIdFuer, inhaltsanteil, istAlteSprache, istFremdsprache, type ExamSubjectId } from './faecher'
import { FORMATE_NEU, FREMDSPRACHEN_NEU, uebertrageFormate, VORSCHLAG_NEU } from './formateNeu'

export interface ExamFormat {
  id: string
  subject: ExamSubjectId
  /** Bezeichnung auf der Arbeit */
  label: string
  /** Kompetenzbereich, der geprüft wird */
  competence: string
  /** Was die Lernenden tun – erscheint als Erklärung in der Auswahl */
  description: string
  /** Schwerpunkt der Anforderungsbereiche */
  afb: ('I' | 'II' | 'III')[]
  /** Üblicher Anteil an der Gesamtpunktzahl in Prozent */
  share: number
  /** Jahrgangsspanne, in der das Format üblich ist */
  grades: [number, number]
  /** Braucht Material (Text, Quelle, Hörtext, Bild) */
  material: 'text' | 'audio' | 'image' | 'data' | 'none'
  /** Hinweis für die Lehrkraft */
  note?: string
  /**
   * Produktiver Teil: Die Lernenden schreiben einen eigenen Text, die Bewertung teilt sich
   * in Inhalt und Sprache (üblich 40 : 60).
   */
  productive?: boolean
  /**
   * Punkte, die dieser Teil für sich hat; aus ihnen ergibt sich die Teilnote.
   * 0 bedeutet: Der Teil wird nicht über Punkte bewertet, sondern über die Aufteilung
   * in Inhalt und Sprache (Schreiben, Sprachmittlung).
   */
  defaultPoints?: number
}

const ENGLISCH: ExamFormat[] = [
  {
    id: 'en-listening',
    subject: 'englisch',
    label: 'Listening comprehension',
    competence: 'Hör-/Hörsehverstehen',
    description:
      'Ein Hörtext (Interview, Durchsage, Gespräch) wird zweimal abgespielt; dazu Ankreuz-, Zuordnungs- und Tabellenaufgaben, die während des Hörens lösbar sind.',
    afb: ['I', 'II'],
    share: 15,
    grades: [5, 13],
    material: 'audio',
    defaultPoints: 21,
    note: 'Während des Hörens keine zusammenhängenden Texte schreiben lassen.'
  },
  {
    id: 'en-reading',
    subject: 'englisch',
    label: 'Reading comprehension',
    competence: 'Leseverstehen',
    description:
      'Ein unbekannter Text auf dem Niveau der Lerngruppe mit Aufgaben zum Global- und Detailverstehen: richtig/falsch mit Textbeleg, Multiple Choice, Überschriften zuordnen, kurze Antworten.',
    afb: ['I', 'II'],
    share: 25,
    grades: [5, 13],
    material: 'text',
    defaultPoints: 21
  },
  {
    id: 'en-mediation',
    subject: 'englisch',
    label: 'Mediation',
    competence: 'Sprachmittlung',
    description:
      'Ein deutscher Gebrauchstext wird sinngemäß und adressatengerecht in die Zielsprache übertragen – als situierte Schreibaufgabe mit Adressat, Textsorte und Zweck.',
    afb: ['II', 'III'],
    share: 20,
    grades: [6, 13],
    material: 'text',
    defaultPoints: 0,
    productive: true,
    note: 'Keine Übersetzung; Adressat, Textsorte und inhaltlicher Fokus sind vorgegeben.'
  },
  {
    id: 'en-writing',
    subject: 'englisch',
    label: 'Writing',
    competence: 'Schreiben',
    description:
      'Eine situierte Schreibaufgabe (E-Mail, Artikel, Blogbeitrag, Rede) mit Adressat, Zweck und Gliederungspunkten; bewertet nach Inhalt, Textsortenmerkmalen und Sprache.',
    afb: ['II', 'III'],
    share: 35,
    grades: [5, 13],
    material: 'none',
    defaultPoints: 0,
    productive: true
  },
  {
    id: 'en-language',
    subject: 'englisch',
    label: 'Use of English',
    competence: 'Verfügung über sprachliche Mittel',
    description:
      'Wortschatz und Grammatik im Zusammenhang: Lückentext, Wortbildung, Satzumformung, Zeiten im Kontext – immer eingebettet, nie als isolierte Einzelsätze.',
    afb: ['I', 'II'],
    share: 20,
    grades: [5, 10],
    material: 'text',
    defaultPoints: 20
  },
  {
    id: 'en-grammar',
    subject: 'englisch',
    label: 'Grammatik im Kontext',
    competence: 'Verfügung über sprachliche Mittel',
    description: 'Ein festgelegtes Grammatikthema wird in einem zusammenhängenden Text geprüft: erkennen, ergänzen, umformen und in eigenen Sätzen anwenden.',
    afb: ['I', 'II'],
    share: 20,
    grades: [5, 11],
    material: 'text',
    defaultPoints: 20,
    note: 'Das Thema wird im Rahmen der Arbeit festgelegt; geprüft wird im Text, nicht in Einzelsätzen.'
  },
  {
    id: 'en-speaking',
    subject: 'englisch',
    label: 'Speaking (Ersatz für eine schriftliche Arbeit)',
    competence: 'Sprechen',
    description: 'Paar- oder Gruppenprüfung: Monolog (Bildimpuls, Kurzvortrag) und Dialog (Diskussion, Rollenspiel) mit Bewertungsraster.',
    afb: ['II', 'III'],
    share: 100,
    grades: [5, 13],
    material: 'image',
    defaultPoints: 30,
    // Befund F7 (29.09.2026): Häufigkeit ist Ländersache – nicht „in den meisten Ländern einmal jährlich"
    note: 'Ob und wie oft eine Sprechprüfung eine Arbeit ersetzt, regelt das Land: Niedersachsen je Doppeljahrgang, NRW einmal im Jahr möglich und im letzten Schuljahr der Sek I Pflicht, Bayern auch teilweise mündlich.'
  }
]

const SACHFAECHER: ExamFormat[] = [
  // ---------- Geschichte ----------
  {
    id: 'ge-knowledge',
    subject: 'geschichte',
    label: 'Grundwissen',
    competence: 'Sachkompetenz',
    description: 'Begriffe erklären, Daten und Ereignisse zuordnen, eine Zeitleiste ergänzen, Zusammenhänge in eigenen Worten wiedergeben.',
    afb: ['I'],
    share: 25,
    grades: [5, 13],
    material: 'none'
  },
  {
    id: 'ge-source',
    subject: 'geschichte',
    label: 'Quellenanalyse (Textquelle)',
    competence: 'Methodenkompetenz',
    description: 'Eine Textquelle wird eingeordnet (Verfasser, Zeit, Textsorte, Adressat), der Inhalt herausgearbeitet und die Absicht gedeutet.',
    afb: ['I', 'II'],
    share: 40,
    grades: [6, 13],
    material: 'text',
    note: 'Vollständige Quellenangabe und Zeilennummern; Quelle und Darstellung klar unterscheiden.'
  },
  {
    id: 'ge-cartoon',
    subject: 'geschichte',
    label: 'Karikaturanalyse',
    competence: 'Methodenkompetenz',
    description: 'Erst genau beschreiben, dann Symbole und Überzeichnungen deuten, zuletzt Aussage und Absicht beurteilen.',
    afb: ['I', 'II', 'III'],
    share: 35,
    grades: [7, 13],
    material: 'image'
  },
  {
    id: 'ge-image',
    subject: 'geschichte',
    label: 'Bildquelle oder Plakat',
    competence: 'Methodenkompetenz',
    description: 'Ein Gemälde, Foto oder Plakat wird beschrieben, in seinen Entstehungszusammenhang eingeordnet und auf seine Wirkung hin untersucht.',
    afb: ['I', 'II'],
    share: 30,
    grades: [5, 13],
    material: 'image'
  },
  {
    id: 'ge-data',
    subject: 'geschichte',
    label: 'Statistik oder Diagramm auswerten',
    competence: 'Methodenkompetenz',
    description: 'Zahlenmaterial beschreiben, Auffälligkeiten mit Werten belegen und historisch erklären.',
    afb: ['I', 'II'],
    share: 25,
    grades: [7, 13],
    material: 'data'
  },
  {
    id: 'ge-comparison',
    subject: 'geschichte',
    label: 'Vergleich',
    competence: 'Urteilskompetenz',
    description:
      'Zwei Quellen, Positionen oder Epochen werden unter festgelegten Gesichtspunkten verglichen; Gemeinsamkeiten und Unterschiede werden gewichtet.',
    // Befund G2 (29.09.2026): NI-KC Geschichte S. 30 AFB II, NRW-Liste AFB II–III
    afb: ['II', 'III'],
    share: 30,
    grades: [8, 13],
    material: 'text',
    note: '„vergleichen" steht in Niedersachsen im Anforderungsbereich II, in NRW im Bereich II–III; die Gewichtung der Unterschiede reicht in III.'
  },
  /*
   * 29.09.2026, Befunde G3/G4: EPA Geschichte 3.2.3 „Erörtern von Erklärungen historischer
   * Sachverhalte aus Darstellungen" – bisher gab es nur Quellen; dazu die historische Karte.
   */
  {
    id: 'ge-darstellung',
    subject: 'geschichte',
    label: 'Darstellung analysieren und erörtern',
    competence: 'Methoden- und Urteilskompetenz',
    description:
      'Einen Auszug aus der Fachliteratur (Historikertext) oder einer Dokumentation analysieren: Position und Argumentation herausarbeiten, auf Schlüssigkeit prüfen und die Deutung beurteilen. Darstellung ist keine Quelle.',
    afb: ['II', 'III'],
    share: 40,
    grades: [9, 13],
    material: 'text',
    note: 'EPA Geschichte 3.2.3; in der Oberstufe eine der drei Aufgabenarten.'
  },
  {
    id: 'ge-map',
    subject: 'geschichte',
    label: 'Geschichtskarte auswerten',
    competence: 'Methodenkompetenz',
    description: 'Eine historische Karte beschreiben (Thema, Raum, Zeit, Legende), Veränderungen herausarbeiten und historisch erklären; Geschichtskarte und historische Karte unterscheiden.',
    afb: ['I', 'II'],
    share: 30,
    grades: [6, 13],
    material: 'image'
  },
  {
    id: 'ge-judgement',
    subject: 'geschichte',
    label: 'Urteilsaufgabe',
    competence: 'Urteilskompetenz',
    description:
      'Ein Sachurteil (historisch einordnen) oder Werturteil (mit offengelegten Maßstäben bewerten) auf Grundlage des Materials, mit Begründung und Gegenargument.',
    afb: ['III'],
    share: 30,
    grades: [7, 13],
    material: 'none'
  },
  {
    id: 'ge-narrative',
    subject: 'geschichte',
    label: 'Darstellungstext verfassen',
    competence: 'Narrative Kompetenz',
    description:
      'Einen zusammenhängenden Text schreiben (Erklärtext, Bericht, historische Argumentation), der Fachbegriffe nutzt und Zusammenhänge herstellt – in den EPA die Aufgabenart „Darstellen historischer Sachverhalte“.',
    afb: ['II', 'III'],
    share: 30,
    grades: [6, 13],
    material: 'none'
  },
  {
    id: 'ge-action',
    subject: 'geschichte',
    label: 'Handlungsaufgabe',
    competence: 'Handlungskompetenz',
    description:
      'Begründet Position beziehen zu einer historischen Sachfrage oder zur Geschichtskultur – z. B. Leserbrief, Beitrag zur Gedenktagsdebatte, Stellungnahme zu einem Denkmal.',
    afb: ['III'],
    share: 25,
    grades: [8, 13],
    material: 'none',
    note: 'In Nordrhein-Westfalen als eigene Überprüfungsform im Kernlehrplan ausgewiesen.'
  }
]

/*
 * Französisch und Spanisch (Großprogramm 0.4, Phase G): dieselben Kompetenzbereiche wie Englisch –
 * die KMK-Bildungsstandards für die erste Fremdsprache (Englisch/Französisch, 2003/2023) und für die
 * fortgeführte Fremdsprache in der Oberstufe (2012/2023) gelten für alle modernen Fremdsprachen mit
 * denselben Bereichen. Bezeichnungen in der Zielsprache, weil der Kopf der Arbeit einsprachig ist.
 * Beginn als 2. Fremdsprache frühestens in Klasse 6; Sprachmittlung ab Klasse 7.
 */
const FREMDSPRACHEN: { fach: ExamSubjectId; praefix: string; labels: Record<string, string> }[] = [
  {
    fach: 'franzoesisch',
    praefix: 'fr',
    labels: {
      listening: 'Compréhension orale',
      reading: 'Compréhension écrite',
      mediation: 'Médiation',
      writing: 'Production écrite',
      language: 'Maîtrise de la langue',
      grammar: 'Grammatik im Kontext',
      speaking: 'Production orale (Ersatz für eine schriftliche Arbeit)'
    }
  },
  {
    fach: 'spanisch',
    praefix: 'es',
    labels: {
      listening: 'Comprensión auditiva',
      reading: 'Comprensión lectora',
      mediation: 'Mediación',
      writing: 'Expresión escrita',
      language: 'Uso de la lengua',
      grammar: 'Grammatik im Kontext',
      speaking: 'Expresión oral (Ersatz für eine schriftliche Arbeit)'
    }
  }
]

const ABGELEITET: ExamFormat[] = [...FREMDSPRACHEN, ...FREMDSPRACHEN_NEU].flatMap(({ fach, praefix, labels, ohne, ab, hinweis }: (typeof FREMDSPRACHEN_NEU)[number]) =>
  ENGLISCH.filter((f) => !ohne?.includes(f.id.slice(3))).map((f) => {
    const art = f.id.slice(3)
    // DaZ (30.09.2026) auch in der Grundschule – dort gilt der eigene früheste Jahrgang
    const beginn = ab ?? (art === 'mediation' ? 7 : 6)
    return {
      ...f,
      id: `${praefix}-${art}`,
      subject: fach,
      label: labels[art] ?? f.label,
      grades: [ab ? beginn : Math.max(beginn, f.grades[0]), f.grades[1]] as [number, number],
      ...(hinweis ? { note: [f.note, hinweis].filter(Boolean).join(' ') } : {})
    }
  })
)

/*
 * Deutsch (Phase G): Kompetenzbereiche der KMK-Bildungsstandards Deutsch (Mittlerer
 * Schulabschluss 2003/2022, Allgemeine Hochschulreife 2012): Schreiben, Lesen – mit Texten und
 * Medien umgehen, Sprache und Sprachgebrauch untersuchen. Die Aufgabenarten folgen den
 * Schreibformen der Standards (erzählend, informierend, argumentierend, analysierend/
 * interpretierend) und für die Oberstufe den Aufgabenarten der Abiturprüfung (interpretierendes
 * und analysierendes Schreiben, textbezogenes Erörtern, materialgestütztes Schreiben). Eine Note,
 * die Punkte werden nach Anteil verteilt wie in den Sachfächern.
 */
const DEUTSCH: ExamFormat[] = [
  {
    id: 'de-erzaehlen',
    subject: 'deutsch',
    label: 'Erzählen',
    competence: 'Schreiben',
    description:
      'Eine Erzählung zu einem Schreibanlass (Bild, Reizwörter, Erzählanfang) oder eine Nacherzählung, mit Spannungsaufbau und passender Erzählperspektive. (NRW-Aufgabentyp 1)',
    afb: ['II', 'III'],
    share: 100,
    grades: [5, 7],
    material: 'none',
    productive: true
  },
  {
    id: 'de-informieren',
    subject: 'deutsch',
    label: 'Informierendes Schreiben',
    competence: 'Schreiben',
    description: 'Einen Sachverhalt aus Materialien (Texte, Grafiken) adressatengerecht darstellen – Bericht, Beschreibung, Informationstext. (NRW-Aufgabentyp 2)',
    afb: ['I', 'II'],
    share: 60,
    grades: [5, 13],
    material: 'text',
    productive: true
  },
  {
    id: 'de-argumentieren',
    subject: 'deutsch',
    label: 'Argumentierendes Schreiben (Erörterung)',
    competence: 'Schreiben',
    description:
      'Zu einer strittigen Frage Stellung nehmen: Argumente mit Beispielen, Gegenargumente, begründetes Urteil – als Leserbrief, Stellungnahme oder (textgebundene) Erörterung. (NRW-Aufgabentyp 3)',
    afb: ['II', 'III'],
    share: 60,
    grades: [7, 13],
    material: 'none',
    productive: true
  },
  {
    id: 'de-textanalyse',
    subject: 'deutsch',
    label: 'Analyse eines literarischen Textes',
    competence: 'Lesen – mit Texten und Medien umgehen',
    description:
      'Einen epischen oder dramatischen Text (Kurzgeschichte, Novellenauszug, Szene) erschließen: Inhalt, Aufbau, Figuren, sprachliche und erzählerische Mittel, Deutung mit Textbelegen. (NRW-Aufgabentyp 4a)',
    afb: ['I', 'II', 'III'],
    share: 70,
    grades: [7, 13],
    material: 'text',
    productive: true,
    note: 'Zeilennummern am Text; Zitate mit Zeilenangabe erwarten.'
  },
  {
    id: 'de-gedicht',
    subject: 'deutsch',
    label: 'Gedichtinterpretation',
    competence: 'Lesen – mit Texten und Medien umgehen',
    description:
      'Ein Gedicht erschließen: Inhalt, Form (Strophe, Vers, Reim, Metrum), sprachliche Bilder und ihre Wirkung, Deutung mit Textbelegen – ab Klasse 9 auch im Vergleich zweier Gedichte. (NRW-Aufgabentyp 4a)',
    afb: ['I', 'II', 'III'],
    share: 70,
    grades: [6, 13],
    material: 'text',
    productive: true
  },
  {
    id: 'de-sachtext',
    subject: 'deutsch',
    label: 'Analyse eines Sachtextes',
    competence: 'Lesen – mit Texten und Medien umgehen',
    description:
      'Einen Sach- oder Gebrauchstext (Kommentar, Rede, Reportage) analysieren: Thema, Aufbau, Argumentation, sprachliche Mittel, Absicht und Wirkung. (NRW-Aufgabentyp 4a)',
    afb: ['I', 'II', 'III'],
    share: 70,
    grades: [8, 13],
    material: 'text',
    productive: true
  },
  {
    id: 'de-materialgestuetzt',
    subject: 'deutsch',
    label: 'Materialgestütztes Schreiben',
    competence: 'Schreiben',
    description:
      'Aus einem Materialdossier (Texte, Grafiken, Tabellen) einen eigenen informierenden oder argumentierenden Text für eine vorgegebene Situation verfassen – Aufgabenart der KMK-Bildungsstandards (MSA 2022 und Hochschulreife); NI: informierend in 7/8, argumentierend in 10 obligatorisch. (NRW-Aufgabentyp 2 bzw. 3)',
    afb: ['II', 'III'],
    share: 100,
    grades: [7, 13],
    material: 'text',
    productive: true
  },
  {
    id: 'de-lesen',
    subject: 'deutsch',
    label: 'Leseverstehen',
    competence: 'Lesen – mit Texten und Medien umgehen',
    description: 'Geschlossene und halboffene Aufgaben zu einem Text: Informationen entnehmen, Aussagen prüfen, Textstellen deuten. (NRW-Aufgabentyp 4b)',
    afb: ['I', 'II'],
    share: 40,
    grades: [5, 10],
    material: 'text'
  },
  {
    id: 'de-sprache',
    subject: 'deutsch',
    label: 'Sprache untersuchen',
    competence: 'Sprache und Sprachgebrauch untersuchen',
    description:
      'Wortarten, Satzglieder, Satzbau, Zeichensetzung und Rechtschreibung an einem zusammenhängenden Text untersuchen und anwenden – nicht an Einzelsätzen.',
    afb: ['I', 'II'],
    share: 30,
    grades: [5, 10],
    material: 'text'
  },
  /*
   * 29.09.2026, Befunde D1–D3 (recherche/klassenarbeiten-pruefung-vorhandene-faecher-2026-09-29.md):
   * NI-KC Deutsch Gymnasium S. 33–35, KLP Deutsch G9 NRW Kap. 3.
   */
  {
    id: 'de-rechtschreibung',
    subject: 'deutsch',
    label: 'Rechtschreibung und Zeichensetzung',
    competence: 'Sprache und Sprachgebrauch untersuchen',
    description:
      'Diktat (Vorlesetext mit Wortzahl, auch mit zeitlich begrenzter Wörterbuchphase), fehlerhaften Text korrigieren oder geschlossene Regelaufgaben – in Klasse 6–8 auch verbunden mit Grammatik.',
    afb: ['I', 'II'],
    share: 30,
    grades: [5, 9],
    material: 'text',
    note: 'Niedersachsen: Überprüfung der Rechtschreibkompetenz in jedem Jahrgang 5–9 obligatorisch (KC Deutsch Gymnasium). NRW: als Teil einer Klassenarbeit möglich.'
  },
  {
    id: 'de-ueberarbeiten',
    subject: 'deutsch',
    label: 'Text überarbeiten (mit Begründung)',
    competence: 'Schreiben',
    description: 'Einen gegebenen Text kriteriengestützt überarbeiten und die Änderungen begründen. (NRW-Aufgabentyp 5)',
    afb: ['II', 'III'],
    share: 60,
    grades: [5, 10],
    material: 'text',
    productive: true
  },
  {
    id: 'de-gestalten',
    subject: 'deutsch',
    label: 'Produktionsorientiertes Schreiben',
    competence: 'Schreiben / Lesen',
    description:
      'Zu einem literarischen Text umschreiben, fortsetzen, die Perspektive wechseln oder einen inneren Monolog verfassen – mit einer Reflexionsaufgabe zur eigenen Gestaltung. (NRW-Aufgabentyp 6)',
    afb: ['II', 'III'],
    share: 100,
    grades: [5, 13],
    material: 'text',
    productive: true
  },
  {
    id: 'de-inhaltsangabe',
    subject: 'deutsch',
    label: 'Inhaltsangabe',
    competence: 'Schreiben / Lesen',
    description:
      'Einen literarischen oder pragmatischen Text sachlich und knapp im Präsens zusammenfassen (Einleitungssatz, Handlungsschritte, keine Zitate); ab Klasse 9 mit analytischen Teilaufgaben. (NRW-Aufgabentyp 4a/4b)',
    afb: ['I', 'II'],
    share: 60,
    grades: [7, 10],
    material: 'text',
    productive: true
  }
]

/*
 * Politik (Phase G): Kompetenzmodell der GPJE (Politische Urteilsfähigkeit, Politische
 * Handlungsfähigkeit, Methodische Fähigkeiten, Konzeptuelles Deutungswissen), auf das sich die
 * Kerncurricula der Länder stützen; Oberstufe nach den EPA Sozialkunde/Politik (KMK 2005):
 * Materialanalyse, Erörterung, Gestaltungsaufgabe.
 */
const POLITIK: ExamFormat[] = [
  {
    id: 'pol-knowledge',
    subject: 'politik',
    label: 'Grundwissen',
    competence: 'Konzeptuelles Deutungswissen',
    description: 'Fachbegriffe erklären, Institutionen und Verfahren beschreiben (z. B. Gesetzgebung, Wahlen), Zusammenhänge in eigenen Worten darstellen.',
    afb: ['I'],
    share: 25,
    grades: [5, 13],
    material: 'none'
  },
  {
    id: 'pol-text',
    subject: 'politik',
    label: 'Analyse eines politischen Textes',
    competence: 'Methodische Fähigkeiten',
    description: 'Einen Zeitungsartikel, Kommentar, eine Rede oder ein Parteiprogramm erschließen: Thema, Position, Argumente, Interessen und Absicht.',
    afb: ['I', 'II'],
    share: 40,
    grades: [7, 13],
    material: 'text'
  },
  {
    id: 'pol-cartoon',
    subject: 'politik',
    label: 'Karikaturanalyse',
    competence: 'Methodische Fähigkeiten',
    description: 'Beschreiben, Symbole und Überzeichnungen deuten, die Aussage auf die politische Frage beziehen und beurteilen.',
    afb: ['I', 'II', 'III'],
    share: 35,
    grades: [7, 13],
    material: 'image'
  },
  {
    id: 'pol-data',
    subject: 'politik',
    label: 'Statistik oder Schaubild auswerten',
    competence: 'Methodische Fähigkeiten',
    description: 'Zahlen und Schaubilder (Wahlergebnisse, Umfragen, Haushalt) beschreiben, Auffälligkeiten mit Werten belegen und politisch erklären.',
    afb: ['I', 'II'],
    share: 25,
    grades: [7, 13],
    material: 'data'
  },
  {
    id: 'pol-conflict',
    subject: 'politik',
    label: 'Fall- oder Konfliktanalyse',
    competence: 'Politische Urteilsfähigkeit',
    description: 'Einen politischen Konflikt oder Fall untersuchen: Beteiligte, Interessen, Lösungsvorschläge, Entscheidungswege.',
    afb: ['II'],
    share: 30,
    grades: [8, 13],
    material: 'text'
  },
  {
    id: 'pol-judgement',
    subject: 'politik',
    label: 'Politische Urteilsbildung',
    competence: 'Politische Urteilsfähigkeit',
    description:
      'Zu einer politischen Streitfrage ein begründetes Sach- oder Werturteil fällen: Kriterien offenlegen (z. B. Effizienz, Legitimität), Gegenargumente abwägen.',
    afb: ['III'],
    share: 30,
    grades: [7, 13],
    material: 'none'
  },
  {
    id: 'pol-action',
    subject: 'politik',
    label: 'Gestaltungs- oder Handlungsaufgabe',
    competence: 'Politische Handlungsfähigkeit',
    description: 'Begründet Position beziehen und sie adressatengerecht vertreten – Leserbrief, Rede, Stellungnahme, Brief an eine Abgeordnete.',
    afb: ['III'],
    share: 25,
    grades: [8, 13],
    material: 'none'
  }
]

/*
 * Erdkunde (Phase G): Kompetenzbereiche der Bildungsstandards im Fach Geographie für den
 * Mittleren Schulabschluss (DGfG): Fachwissen, Räumliche Orientierung, Erkenntnisgewinnung/
 * Methoden, Kommunikation, Beurteilung/Bewertung, Handlung; Oberstufe nach den EPA Geographie
 * (KMK 2005): materialgestützte Problemerörterung.
 */
const ERDKUNDE: ExamFormat[] = [
  {
    id: 'geo-knowledge',
    subject: 'erdkunde',
    label: 'Grundwissen und Topographie',
    competence: 'Fachwissen / Räumliche Orientierung',
    description: 'Fachbegriffe erklären, Räume und Lagebeziehungen benennen, eine stumme Karte beschriften, Prozesse in eigenen Worten wiedergeben.',
    afb: ['I'],
    share: 25,
    grades: [5, 13],
    material: 'none'
  },
  {
    id: 'geo-map',
    subject: 'erdkunde',
    label: 'Kartenauswertung',
    competence: 'Erkenntnisgewinnung / Methoden',
    description: 'Eine thematische Karte beschreiben (Thema, Raum, Legende), räumliche Verteilungen herausarbeiten und erklären.',
    afb: ['I', 'II'],
    share: 35,
    grades: [5, 13],
    material: 'image'
  },
  {
    id: 'geo-climate',
    subject: 'erdkunde',
    label: 'Klimadiagramm auswerten',
    competence: 'Erkenntnisgewinnung / Methoden',
    description:
      'Ein Klimadiagramm lesen (Station, Lage, Temperatur- und Niederschlagsverlauf), Klimazone bestimmen und Folgen für Vegetation und Nutzung erklären.',
    afb: ['I', 'II'],
    share: 30,
    grades: [6, 13],
    material: 'data'
  },
  {
    id: 'geo-data',
    subject: 'erdkunde',
    label: 'Statistik oder Diagramm auswerten',
    competence: 'Erkenntnisgewinnung / Methoden',
    description: 'Zahlenmaterial (Bevölkerung, Wirtschaft, Umwelt) beschreiben, Auffälligkeiten mit Werten belegen und räumlich erklären.',
    afb: ['I', 'II'],
    share: 25,
    grades: [7, 13],
    material: 'data'
  },
  {
    id: 'geo-image',
    subject: 'erdkunde',
    label: 'Bild- oder Luftbildauswertung',
    competence: 'Erkenntnisgewinnung / Methoden',
    description: 'Ein Foto, Luft- oder Satellitenbild beschreiben, Merkmale des Raums erkennen und mit Fachwissen deuten.',
    afb: ['I', 'II'],
    share: 25,
    grades: [5, 13],
    material: 'image'
  },
  {
    id: 'geo-text',
    subject: 'erdkunde',
    label: 'Materialgestützte Raumanalyse',
    competence: 'Erkenntnisgewinnung / Kommunikation',
    description:
      'Mehrere Materialien (Text, Karte, Diagramm) zu einem Raumbeispiel auswerten und die Ergebnisse zu einer zusammenhängenden Erklärung verbinden.',
    afb: ['II', 'III'],
    share: 40,
    grades: [8, 13],
    material: 'text'
  },
  {
    id: 'geo-sketch',
    subject: 'erdkunde',
    label: 'Kartenskizze, Profil oder Wirkungsgefüge erstellen',
    competence: 'Erkenntnisgewinnung / Kommunikation',
    description: 'Aus Materialien eine Kartenskizze, ein Profil oder ein Wirkungsgefüge zeichnen und erläutern (Antwort auf einer Zeichenfläche).',
    afb: ['II', 'III'],
    share: 30,
    grades: [7, 13],
    material: 'data',
    note: 'Fachübliche Aufgabe; als Pflichtformat nicht amtlich belegt (EPA Geographie nennt nur die materialgebundene Problemerörterung).'
  },
  {
    id: 'geo-judgement',
    subject: 'erdkunde',
    label: 'Beurteilen und Bewerten',
    competence: 'Beurteilung / Bewertung',
    description:
      'Eine raumbezogene Maßnahme oder einen Nutzungskonflikt (z. B. Staudamm, Tourismus, Flächenverbrauch) unter ökologischen, ökonomischen und sozialen Gesichtspunkten beurteilen.',
    afb: ['III'],
    share: 30,
    grades: [7, 13],
    material: 'none'
  }
]

/**
 * Gesellschaftslehre (30.09.2026): das Integrationsfach aus Geschichte, Erdkunde und Politik –
 * je Format das aus dem Fach, das es prägt (Quelle aus Geschichte, Karte aus Erdkunde, Konflikt
 * aus Politik). Abgeleitet, nicht eigens belegt.
 */
const GESELLSCHAFTSLEHRE: ExamFormat[] = [
  ...uebertrageFormate(
    SACHFAECHER.filter((f) => ['ge-knowledge', 'ge-source', 'ge-image', 'ge-data', 'ge-judgement', 'ge-action'].includes(f.id)),
    'gesellschaftslehre',
    'gl',
    'Geschichte'
  ),
  ...uebertrageFormate(
    ERDKUNDE.filter((f) => ['geo-map', 'geo-sketch'].includes(f.id)),
    'gesellschaftslehre',
    'gl',
    'Erdkunde'
  ),
  ...uebertrageFormate(
    POLITIK.filter((f) => ['pol-conflict', 'pol-cartoon'].includes(f.id)),
    'gesellschaftslehre',
    'gl',
    'Politik'
  )
]

export const EXAM_FORMATS: ExamFormat[] = [...ENGLISCH, ...ABGELEITET, ...DEUTSCH, ...SACHFAECHER, ...POLITIK, ...ERDKUNDE, ...GESELLSCHAFTSLEHRE, ...FORMATE_NEU]

/**
 * Formate eines Fachs für den Jahrgang. Befund F2 (29.09.2026): In Niedersachsen ist eine
 * isolierte Überprüfung sprachlicher Mittel „nicht möglich" (KC Englisch 2026, S. 61 f.; ebenso
 * Französisch und Spanisch) – dort fehlen die Teile „Use of English" und „Grammatik im Kontext".
 */
export const formatsFor = (subject: ExamSubjectId, grade: number, stateId?: string): ExamFormat[] =>
  EXAM_FORMATS.filter(
    (f) =>
      f.subject === subject &&
      grade >= f.grades[0] &&
      grade <= f.grades[1] &&
      !(ohneIsolierteSprachmittel(stateId) && istFremdsprache(subject) && /-(language|grammar)$/.test(f.id))
  )

/**
 * Länder, in denen sprachliche Mittel in Fremdsprachen-Klassenarbeiten nicht isoliert geprüft
 * werden: NI (KC), RP (Lehrplan Französisch 2022, Spanisch 2012), SL (Englisch/Französisch
 * 2023/24), TH (neue Lehrpläne 2026). 29.09.2026, Nachrecherche in
 * recherche/grammatik-in-schreibaufgaben-2026-09-29.md.
 */
export const ohneIsolierteSprachmittel = (stateId?: string): boolean => stateId === 'NI' || stateId === 'RP' || stateId === 'SL' || stateId === 'TH'

export const formatById = (id: string): ExamFormat | undefined => EXAM_FORMATS.find((f) => f.id === id)

/**
 * Anteil des Schreibteils an der Arbeit. In Niedersachsen erhält der Schreibteil eine
 * eigenständige Note; üblich sind 60 % in Klasse 5 und 70 % ab Klasse 6.
 */
export const writingWeightFor = (grade: number, fachschaft?: { k5: number; ab6: number }): number =>
  grade <= 5 ? (fachschaft?.k5 ?? 60) : (fachschaft?.ab6 ?? 70)

/** Übliche Aufteilung eines produktiven Teils in Inhalt und Sprache */
export const CONTENT_SHARE = 40

/**
 * Setzt die Anteile nach der Regel des Landes: In den Fremdsprachen trägt der Schreibteil
 * 70 % (Klasse 5: 60 %), die übrigen geprüften Kompetenzen teilen sich den Rest.
 * Gibt es keinen Schreibteil, teilen sich alle Teile die 100 % gleichmäßig.
 */
export function defaultWeights(
  subject: ExamSubjectId,
  grade: number,
  parts: { formatId: string; gradeGroup: 'writing' | 'other' }[],
  /** Schreibanteil der Fachschaft (Einstellungen) */
  fachschaft?: { k5: number; ab6: number }
): number[] {
  if (!parts.length) return []
  if (!istFremdsprache(subject) && !istAlteSprache(subject)) {
    const shares = parts.map((p) => formatById(p.formatId)?.share ?? 1)
    const total = shares.reduce((n, x) => n + x, 0)
    let rest = 100
    return shares.map((sh, i) => {
      const w = i === shares.length - 1 ? rest : Math.round((100 * sh) / total)
      rest -= w
      return w
    })
  }
  const writingIdx = parts.map((p, i) => (p.gradeGroup === 'writing' ? i : -1)).filter((i) => i >= 0)
  const otherIdx = parts.map((p, i) => (p.gradeGroup === 'writing' ? -1 : i)).filter((i) => i >= 0)
  if (!writingIdx.length || !otherIdx.length) {
    // Nur eine Sorte Teile: gleichmäßig aufteilen
    const even = Math.floor(100 / parts.length)
    return parts.map((_, i) => (i === parts.length - 1 ? 100 - even * (parts.length - 1) : even))
  }
  const writingTotal = istAlteSprache(subject) ? UEBERSETZUNGSANTEIL : writingWeightFor(grade, fachschaft)
  const otherTotal = 100 - writingTotal
  const out = new Array(parts.length).fill(0)
  const spread = (idx: number[], total: number): void => {
    let rest = total
    idx.forEach((pos, k) => {
      const w = k === idx.length - 1 ? rest : Math.round(total / idx.length)
      out[pos] = w
      rest -= w
    })
  }
  spread(writingIdx, writingTotal)
  spread(otherIdx, otherTotal)
  return out
}

/** Üblicher Aufbau je Fach (Deutsch und Sachfächer) */
const VORSCHLAG: Partial<Record<ExamSubjectId, (grade: number) => string[]>> = {
  geschichte: (g) => (g <= 7 ? ['ge-knowledge', 'ge-source', 'ge-judgement'] : ['ge-source', 'ge-comparison', 'ge-judgement']),
  politik: (g) => (g <= 7 ? ['pol-knowledge', 'pol-data', 'pol-judgement'] : ['pol-text', 'pol-conflict', 'pol-judgement']),
  erdkunde: (g) => (g <= 7 ? ['geo-knowledge', 'geo-map', 'geo-climate'] : ['geo-map', 'geo-text', 'geo-judgement']),
  gesellschaftslehre: (g) => (g <= 7 ? ['gl-knowledge', 'gl-map', 'gl-judgement'] : ['gl-source', 'gl-conflict', 'gl-judgement']),
  // Deutsch: eine Schreibaufgabe als Hauptteil, in der Sek I mit einem Teil „Sprache untersuchen"
  deutsch: (g) => (g <= 6 ? ['de-erzaehlen'] : g <= 10 ? ['de-textanalyse', 'de-sprache'] : ['de-textanalyse']),
  // Die Fächer vom 29.09.2026 (formateNeu.ts)
  ...VORSCHLAG_NEU
}

/**
 * Latein und Griechisch (29.09.2026): Übersetzung und Begleitaufgaben im Verhältnis 2 : 1 (EPA;
 * mindestens 1 : 1). Die Übersetzung ist die eigene Teilnote (Gruppe „writing", Fehlerquote),
 * die Begleitaufgaben werden über Punkte bewertet.
 */
export const UEBERSETZUNGSANTEIL = 67
export const istUebersetzungsformat = (formatId: string | undefined): boolean => /-uebersetzung$/.test(formatId ?? '')

export interface SuggestedPart {
  formatId: string
  weight: number
  minutes: number
  gradeGroup: 'writing' | 'other'
  contentShare?: number
}

/**
 * Vorschlag für den Aufbau einer Arbeit.
 *
 * Englisch: In der Regel werden genau zwei Kompetenzen geprüft – eine rezeptive oder die
 * Sprachmittlung und dazu das Schreiben. Der Schreibteil trägt 60 % (Klasse 5) bzw. 70 %.
 * Geschichte: die üblichen Teile des Fachs, gleichmäßig nach ihrem Anteil verteilt.
 */
export function suggestParts(
  subject: ExamSubjectId,
  grade: number,
  points: number,
  minutes: number,
  /** Schreibanteil der Fachschaft (Einstellungen) */
  fachschaft?: { k5: number; ab6: number },
  stateId?: string
): { formatId: string; points: number; minutes: number; weight: number; gradeGroup: 'writing' | 'other'; contentShare?: number }[] {
  if (istFremdsprache(subject)) {
    // Jeder Teil hat eigene Punkte; daraus entsteht seine Teilnote. Erst die Teilnoten
    // werden nach ihrem Anteil (30 : 70 bzw. 40 : 60 in Klasse 5) zur Gesamtnote verrechnet.
    const writing = writingWeightFor(grade, fachschaft)
    const other = 100 - writing
    // Befund F6: Niedersachsen Kl. 5 gewichtet Hörverstehen stärker; Französisch-Sprachmittlung dort erst ab Kl. 9 (F3)
    const zweiter = stateId === 'NI' && grade <= 5 ? 'listening' : grade <= 7 || (stateId === 'NI' && subject === 'franzoesisch' && grade < 9) ? 'reading' : 'mediation'
    // DaZ kennt keine Sprachmittlung (30.09.2026) – dann das Leseverstehen
    const otherFormat = formatById(formatIdFuer(subject, zweiter)) ? formatIdFuer(subject, zweiter) : formatIdFuer(subject, 'reading')
    const otherDef = formatById(otherFormat)
    const writingDef = formatById(formatIdFuer(subject, 'writing'))
    const otherMinutes = Math.round((minutes * other) / 100)
    return [
      {
        formatId: otherFormat,
        weight: other,
        points: otherDef?.defaultPoints ?? 0,
        minutes: otherMinutes,
        gradeGroup: 'other',
        ...(otherDef?.productive ? { contentShare: CONTENT_SHARE } : {})
      },
      {
        formatId: formatIdFuer(subject, 'writing'),
        weight: writing,
        points: writingDef?.defaultPoints ?? 0,
        minutes: minutes - otherMinutes,
        gradeGroup: 'writing',
        contentShare: CONTENT_SHARE
      }
    ]
  }
  // Latein, Griechisch: Übersetzung (eigene Teilnote, Fehlerquote) + Begleitaufgaben (Punkte), 2 : 1
  if (istAlteSprache(subject)) {
    const ids = VORSCHLAG[subject]?.(grade) ?? []
    const uebersetzung = ids.find(istUebersetzungsformat)
    const begleit = ids.filter((id) => !istUebersetzungsformat(id))
    const minU = Math.round((minutes * UEBERSETZUNGSANTEIL) / 100)
    let restMin = minutes - minU
    let restW = 100 - UEBERSETZUNGSANTEIL
    let restP = points
    const teile = begleit.map((id, i) => {
      const last = i === begleit.length - 1
      const w = last ? restW : Math.round((100 - UEBERSETZUNGSANTEIL) / begleit.length)
      const m = last ? restMin : Math.round((minutes - minU) / begleit.length)
      const p = last ? restP : Math.round(points / begleit.length)
      restW -= w
      restMin -= m
      restP -= p
      return { formatId: id, weight: w, points: p, minutes: m, gradeGroup: 'other' as const }
    })
    return [...(uebersetzung ? [{ formatId: uebersetzung, weight: UEBERSETZUNGSANTEIL, points: 0, minutes: minU, gradeGroup: 'writing' as const }] : []), ...teile]
  }
  // Deutsch und Sachfächer: eine Note, die Punkte werden auf die Teile verteilt
  const ids = VORSCHLAG[subject]?.(grade) ?? []
  const chosen = ids.map((id) => formatById(id)!).filter(Boolean)
  const total = chosen.reduce((n, f) => n + f.share, 0)
  let restMinutes = minutes
  let restWeight = 100
  let restPoints = points
  return chosen.map((f, i) => {
    const last = i === chosen.length - 1
    const weight = last ? restWeight : Math.round((100 * f.share) / total)
    const min = last ? restMinutes : Math.round((minutes * f.share) / total)
    const pts = last ? restPoints : Math.round((points * f.share) / total)
    restWeight -= weight
    restMinutes -= min
    restPoints -= pts
    return {
      formatId: f.id,
      weight,
      points: pts,
      minutes: min,
      gradeGroup: 'other' as const,
      ...(f.productive ? { contentShare: inhaltsanteil(subject) } : {})
    }
  })
}
