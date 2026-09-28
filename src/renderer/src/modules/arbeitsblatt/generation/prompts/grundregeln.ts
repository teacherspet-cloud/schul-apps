import type { LearnerProfile } from '../../didactics/profile'
import { anredeRegel } from '../../../../shared/anrede'
import { anredeFuerMeta } from '../../didactics/anrede'
import type { SheetType, WorksheetMeta } from '../../model/types'
import { seitenBereich, seitenText, seitenVorgabe } from '../../didactics/seiten'
import { subjectById } from '../../model/subjects'
import { mediaSourceRules, textSourceRules } from '../../didactics/mediaArchives'
import { sourceHeaderRules } from '../../didactics/sourceHeader'
import { quellenkritikRegeln } from '../../didactics/quellenkritik'
import { bildRegeln } from '../../didactics/bildarbeit'
import { abiturRegeln } from '../abiturPrompt'
import { bilingualRegeln } from '../../didactics/bilingual'
import { narrationRules } from '../../didactics/narration'
import { zuhoerenRules } from '../../didactics/zuhoeren'
import { vocabFocusRules } from '../../didactics/vocabWork'
import { knownVocabRulesDe } from '../../../../shared/knownVocab'
import { rolePlayRules } from '../../didactics/rolePlay'
import { demandRules } from '../../didactics/demand'
import { interkulturellRegeln } from '../../didactics/interkulturell'
import { helpCardRules, skillFocusPrompt, loesungsspracheRegel, phraseSheetRules, grammarRules } from './fertigkeiten'
import { comprehensionRules, mcItemRules, itemWordingRules, singleTaskFocus } from './aufgaben'
import { imageRules, learningDesignRules, scaffoldRules, operatorRules, subjectMethodRules, gridRules } from './gestaltung'
import { umfangRegeln } from './schreiben'
import { languageSkillRules, videoRules } from './sprache'

export const SHEET_TYPES: {
  value: SheetType
  label: string
  prompt: string
}[] = [
  {
    value: 'erarbeitung',
    label: 'Erarbeitung (neues Thema)',
    prompt: 'Erarbeitungsblatt: neues Wissen wird anhand von Material schrittweise erarbeitet und in einem Merkkasten gesichert.'
  },
  {
    value: 'uebung',
    label: 'Übung / Vertiefung',
    prompt: 'Übungsblatt: bekanntes Wissen wird mit abwechslungsreichen Aufgaben gefestigt und angewendet, mit steigender Schwierigkeit.'
  },
  {
    value: 'wiederholung',
    label: 'Wiederholung',
    prompt: 'Wiederholungsblatt: zentrale Inhalte werden kompakt zusammengefasst und mit Aufgaben aller Anforderungsbereiche wiederholt.'
  },
  {
    value: 'lesetext',
    label: 'Lesetext mit Aufgaben',
    prompt: 'Lesetext mit Aufgaben: ein zentraler Sach- oder Lesetext mit Zeilennummern, Worterklärungen und Aufgaben zum Textverständnis und zur Weiterarbeit.'
  },
  {
    value: 'hausaufgabe',
    label: 'Hausaufgabe',
    prompt: 'Hausaufgabe: selbstständig ohne Lehrkraft lösbar, klare Anweisungen, Beispiel vorab, überschaubarer Umfang.'
  },
  {
    value: 'lernkontrolle',
    label: 'Lernzielkontrolle (ohne Noten)',
    prompt: 'Lernzielkontrolle zur Selbstüberprüfung: Aufgaben zu jedem Lernziel (ohne Punkte), am Ende Selbsteinschätzung.'
  }
]

export function sheetTypePrompt(type: SheetType): string {
  return SHEET_TYPES.find((t) => t.value === type)?.prompt ?? SHEET_TYPES[0].prompt
}

/** Systemprompt: Rolle, Lerngruppen-Profil und allgemeine didaktische Qualitätskriterien. */
export function systemPrompt(meta: WorksheetMeta, profile: LearnerProfile): string {
  /*
   * Anrede der Lernenden (Paket 8b): Sek II Sie, sonst du – über `anredeFuerMeta`, das die
   * G8-Einführungsphase (Klasse 10) schon zur Sek II zählt, anders als `profile.stage`
   * (didactics/bildungsgang.ts). Der Satz steht in `shared/anrede.ts`, weil
   * Grammatiktest, Lernzielkontrolle und Vokabeltest (Latein) ihn ebenso brauchen; er sagt
   * auch, dass die du-Beispiele in diesem Auftrag in der Oberstufe umzuformen sind.
   */
  const address = anredeRegel(anredeFuerMeta(meta))
  return [
    `Du bist eine erfahrene Lehrkraft und Fachdidaktikerin für das Fach ${meta.subjectLabel} an deutschen Schulen. Du erstellst pädagogisch und didaktisch hochwertige Arbeitsblätter.`,
    '',
    'LERNGRUPPE UND VORGABEN (verbindlich):',
    ...profile.promptRules.map((r) => `- ${r}`),
    '',
    'DIDAKTISCHE QUALITÄTSKRITERIEN:',
    '- Das Lernziel ist sichtbar; jeder Baustein dient einem der Lernziele.',
    '- Knüpfe an Vorwissen und Lebenswelt der Lernenden an; aktiviere kognitiv, ohne zu überfordern.',
    '- Jede Arbeitsanweisung ist eindeutig, enthält einen klaren Operator und ist mit dem Material auf dem Blatt lösbar.',
    '- Zusammengehöriges steht beieinander (Material direkt vor den Aufgaben dazu).',
    '- Hilfen unterstützen, ohne das Lernziel abzusenken (Scaffolding).',
    '- Sozialformen wechseln sinnvoll; die Zeitplanung ist realistisch.',
    '- Fachlich korrekt, altersgerecht, inklusiv, ohne Stereotype, keine realen Privatpersonen.',
    '- Zu jeder Aufgabe gibt es eine vollständige Lösung bzw. einen Erwartungshorizont für die Lehrkraft.',
    loesungsspracheRegel(meta),
    '',
    address,
    '',
    'FORMAT:',
    '- Hervorhebungen nur mit **fett**. Keine Kursivschrift, keine Großbuchstaben-Blöcke.',
    '- Mathematische Ausdrücke als LaTeX in $…$ (abgesetzt: $$…$$ in eigener Zeile), chemische Formeln mit \\ce{…} innerhalb von $…$.',
    '- Aufzählungen mit „- " am Zeilenanfang; Absätze durch eine Leerzeile.',
    '- Lückentexte: jede Lücke als [[Lösung]].',
    '',
    'BILDER (Baustein „image“):',
    '- Nur, wo ein Bild dem Lernen dient: Foto eines Objekts/Phänomens, Schema oder Diagramm, Karte, Versuchsaufbau, Bewegungsablauf, Kunstwerk, Bildquelle.',
    '- imageDescription: das Kernmotiv, so wie es typische freie Fotos oder Schemata zeigen (z. B. „Außenansicht des Kolosseums in Rom“), fachlich korrekt und ohne Lösungen zu verraten – keine Details, die nur ein bestimmtes Foto hätte (Wetter, Personen, Verkehr, Blickwinkel); title: kurze Bildunterschrift.',
    '- Ein Bild zeigt genau EIN Motiv, ohne eingebaute Schrift und ohne Collage. Mehrere Motive (z. B. vier Tiere, Instrumente, Gesteine) als Bildreihe über imageItems (je Einzelbild description, search, caption); Namen stehen in caption, nicht im Bild – leer lassen, wenn die Lernenden sie zuordnen sollen.',
    '- imageSearch: 2–5 Suchwörter für ein passendes freies Bild in Wikimedia Commons – meist englisch (z. B. „water cycle diagram“, „red fox“), bei typisch deutschen Motiven deutsch (z. B. „Stimmzettel Bundestagswahl“, „Kölner Dom“). Keine Füllwörter wie „isolated“, „white background“, „photo“.',
    '- Aufgaben zu einem Bild beziehen sich nur auf das, was ein typisches Bild dazu sicher zeigt (keine erfundenen Details).',
    '- Karten, Dokumente, Diagramme und Statistiken werden NUR als echtes Bild gesucht, nie erzeugt. Ihre imageDescription ist deshalb die MINDESTANFORDERUNG an ein vorhandenes freies Bild („Politische Karte Europas 1914 mit den Bündnisblöcken") – keine Wunschliste mit Zusätzen, die kein Archivbild hat (datierte Pfeile, eine bestimmte Legende, bestimmte Farben). Solche Zusätze erarbeiten die Lernenden in der Aufgabe. imageSearch dazu auf Englisch UND das deutsche Kernwort in title.',
    '- Zeitleisten und Chronologien: als Bild anfordern (imageSearch, damit zuerst ein freies Archivbild gesucht wird) und in imageDescription ALLE Ereignisse mit Datum, die Stufen und die Stränge vollständig nennen – findet sich kein Archivbild, zeichnet die App die Zeitleiste daraus selbst, maßhaltig und lesbar. Ablaufschemata und Übersichten mit Zahlen als Baustein „table". Ein von der Bild-KI erzeugtes Bild erfindet Beschriftungen, und Schrift im Bild ist im Druck nicht lesbar.',
    '',
    imageRules(meta),
    '',
    learningDesignRules(meta),
    '',
    /*
     * Orte und interkulturelle Aspekte. Liefert bei Fächern, in denen das nichts zu suchen
     * hat (Mathematik, Physik …), eine leere Zeichenkette – dann steht auch nichts im Prompt.
     */
    interkulturellRegeln(meta),
    '',
    umfangRegeln(meta),
    '',
    /*
     * Abiturbezogene Uebungsaufgaben (Jg. 12/13) haben eine eigene Aufgabenstruktur je Fach.
     * Ist der Modus aus, steht hier nichts – dann gelten die gewoehnlichen Regeln.
     */
    abiturRegeln(meta),
    '',
    taskCountRules(meta, profile),
    '',
    operatorRules(meta, subjectById(meta.subjectId).foreignLanguage),
    '',
    // Ein richtiger Operator ohne die passende Anforderung ist der häufigste Fehler
    demandRules(),
    '',
    scaffoldRules(meta),
    '',
    helpCardRules(meta),
    '',
    gridRules(meta),
    '',
    grammarRules(meta),
    phraseSheetRules(meta),
    videoRules(meta),
    // Geschichte/Politik: echte Aufnahme SUCHEN statt eine erfinden
    mediaSourceRules(meta.subjectId),
    // Textquellen: Fundstelle aus einer Sammlung statt Wortlaut aus dem Gedaechtnis
    textSourceRules(meta.subjectId),
    // Quellen brauchen Verfasser, Datum und Textsorte – sonst ist keine Analyse möglich
    sourceHeaderRules(meta),
    // Was die Lernenden mit der Quelle tun, bevor sie sie benutzen
    quellenkritikRegeln(meta),
    // Bilingualer Sachfachunterricht: Arbeitssprache, Operatoren, zweisprachiges Glossar, Bewertung
    bilingualRegeln(meta),
    // Was in diesem Fach mit einem Bild geschieht – und was der Alternativtext verraten darf
    bildRegeln(meta),
    // Geschichtserzaehlung: Guetekriterien und das Verbot woertlicher Zitate
    narrationRules(meta),
    // Deutsch: Verstehend Zuhoeren hat eine eigene Bauform
    zuhoerenRules(meta),
    '',
    // Der gewählte Kompetenzschwerpunkt bestimmt, was überhaupt auf das Blatt kommt –
    // beim Hörverstehen etwa der Baustein „audio“. Ohne ihn entstanden allgemeine Aufgaben.
    skillFocusPrompt(meta),
    '',
    rolePlayRules(meta),
    '',
    comprehensionRules(meta),
    '',
    // Wie die einzelne Frage lauten soll – nicht nur, welches Format sie hat
    itemWordingRules(meta),
    '',
    // Der Operator gehört EINMAL in die Anweisung, nicht in jede einzelne Ankreuzfrage
    mcItemRules,
    '',
    languageSkillRules(meta),
    '',
    subjectMethodRules(meta),
    '',
    // Ausgewählte Wörter, die auf diesem Blatt besonders vorkommen sollen
    vocabFocusRules(meta),
    '',
    // Fremdsprachen: nur Wortschatz, den die Klasse im Lehrwerk schon hatte.
    // Steht ABSICHTLICH nach den Vorrangvokabeln: Die Obergrenze ist die stärkere Regel –
    // ein Vorrangwort rechtfertigt nicht, Wortschatz späterer Bände vorauszusetzen.
    knownVocabRulesDe(meta.knownVocab)
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Zahl und Zuschnitt der Aufgaben.
 *
 * Auf normalem Niveau trägt eine Aufgabe einen vollständigen Denkschritt. Kleinschrittigkeit
 * ist ein Mittel der Vereinfachung (Stufe ★, Förderschwerpunkt, Einfache Sprache) und wird
 * dort gezielt eingesetzt – sie ist nicht der Regelfall.
 */
/**
 * Vorgegebene Zahl der Aufgaben (0 = Richtwert nach Jahrgang).
 *
 * An mehreren Stellen im Auftrag steht, wie viele Aufgaben ein Blatt braucht: der
 * Hörverstehens-Schwerpunkt („2–3 Aufgaben"), die Lerndramaturgie („mindestens zwei
 * Formate", „die letzte Aufgabe sichert"), die Verstehensformate („mische ein geschlossenes
 * und ein halboffenes"). Gibt die Lehrkraft eine Zahl vor, müssen ALLE diese Stellen
 * nachgeben – sonst überstimmen sie zu viert die eine Vorgabe. Genau das passierte bei
 * „Zahl der Aufgaben = 1": Es entstanden trotzdem mehrere.
 */
export const wantedTasks = (meta: WorksheetMeta): number => Math.max(0, Math.round(meta.taskCount ?? 0))

export function taskCountRules(meta: WorksheetMeta, profile: LearnerProfile): string {
  const [min, max] = profile.tasks.perPage
  // Ohne Seitenvorgabe (Paket 7) rechnet der Richtwert mit der geschätzten Seitenzahl, bei einer Spanne mit ihren Grenzen
  const seiten = seitenBereich(meta)
  const total = `${min * seiten.min}–${max * seiten.max}`
  const foreign = subjectById(meta.subjectId).foreignLanguage
  if (singleTaskFocus(meta)) {
    return [
      'ZAHL DER AUFGABEN:',
      '- Dieses Blatt hat GENAU EINE Aufgabe. Sie wird nicht in Teilaufgaben zerlegt und bekommt keine Vorbereitungs- oder Zusatzaufgaben.',
      '- Der übrige Platz gehört dem Ausgangstext und dem Schreibraum.'
    ].join('\n')
  }
  /*
   * Hat die Lehrkraft eine Zahl gesetzt, gilt sie genau – sonst hätte das Feld keinen Zweck.
   * Ohne Vorgabe bleibt es beim Richtwert des Altersbands, und der ist bewusst eine Spanne.
   */
  const wanted = Math.round(meta.taskCount ?? 0)
  return [
    'ZAHL DER AUFGABEN (gut überlegen):',
    wanted > 0
      ? `- Das Blatt hat GENAU ${wanted} Aufgaben – nicht mehr und nicht weniger. Die Lehrkraft hat diese Zahl vorgegeben; teile den Stoff so ein, dass er auf ${wanted} tragfähige Aufgaben passt.`
      : seitenVorgabe(meta)
        ? `- Plane ${total} Aufgaben für ${seitenText(meta)} und bleibe im Zweifel am unteren Rand. Wenige, tragfähige Aufgaben sind besser als viele kleine Schritte.`
        : `- Plane etwa ${total} Aufgaben (Richtwert für ${meta.minutes} Minuten Bearbeitungszeit) und bleibe im Zweifel am unteren Rand. Wenige, tragfähige Aufgaben sind besser als viele kleine Schritte.`,
    '- Eine Aufgabe umfasst einen vollständigen Denkschritt. Zerlege nicht, was zusammengehört, und mache aus einem Arbeitsauftrag nicht drei.',
    '- Teilaufgaben a), b), c) nur, wenn die Schritte inhaltlich verschieden sind – höchstens drei, sonst ist die Aufgabe falsch zugeschnitten.',
    '- Kleinschrittigkeit ist ein Mittel der VEREINFACHUNG: vorgegebene Teilschritte, Zwischenfragen und Lückenlösungen gehören zur Stufe ★ bzw. zu sprachlich vereinfachten Fassungen, nicht zum normalen Niveau.',
    '- Keine Aufgabe, die nur das Vorhergehende wiederholt oder abschreiben lässt; jede Aufgabe bringt einen eigenen Ertrag.',
    foreign
      ? '- Sprachmittlung und Schreiben: Für jeden dieser Bereiche genügt GENAU EINE Aufgabe je Blatt. Alles Weitere sind kurze Vorbereitungen, keine zweite Hauptaufgabe.'
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}
