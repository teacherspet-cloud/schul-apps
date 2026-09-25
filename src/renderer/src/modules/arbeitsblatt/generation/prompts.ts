import type { LearnerProfile } from '../didactics/profile'
import { stageForGrade } from '../didactics/profile'
import type { Stars } from '../didactics/differentiation'
import type { OriginalMaterialAblage, SheetType, SourceMaterial, WorksheetMeta } from '../model/types'
import { subjectById } from '../model/subjects'
import { mediaSourceRules, textSourceRules } from '../didactics/mediaArchives'
import { sourceHeaderRules } from '../didactics/sourceHeader'
import { quellenkritikRegeln } from '../didactics/quellenkritik'
import { bildRegeln } from '../didactics/bildarbeit'
import { abiturRegeln, istUebungsklausur } from './abiturPrompt'
import { istUebersetzungsfach, phrasenRegeln } from '../didactics/phraseRules'
import { bilingualAktiv, bilingualRegeln, glossarRegeln, operatorenFuer } from '../didactics/bilingual'
import { vorwissenRegeln } from '../didactics/vorwissen/vorwissen'
import { narrationRules } from '../didactics/narration'
import { zuhoerenRules } from '../didactics/zuhoeren'
import { vocabFocusRules, vocabWorkRules } from '../didactics/vocabWork'
import { listeningCount, listeningFormatById, listeningFormatsFor, listeningRules, listeningSeconds, listeningWords } from '../didactics/listeningFormats'
import { listeningStateRulesText } from '../didactics/listeningStates'
import { levelAtLeast } from '../../../shared/cefr'
import { comprehensionFormatById, ComprehensionSkill, defaultComprehensionFormats } from '../didactics/comprehensionFormats'
import { subjectOperators } from '../didactics/subjectOperators'
import { knownVocabRulesDe } from '../../../shared/knownVocab'
import { rolePlayRules } from '../didactics/rolePlay'
import { demandRules } from '../didactics/demand'
import { imageDesignRules } from '../didactics/imageDesign'
import { interkulturellRegeln } from '../didactics/interkulturell'
import { chosenGrammarTopics, grammarFormatLabel } from '../didactics/grammar'
import {
  duringPolicy,
  filmLanguageRules,
  GROUP_LABELS,
  LEARNING_VIDEO_MINUTES,
  observationFoci,
  sectionMinutes,
  SUBTITLE_OPTIONS,
  videoKindById,
  VIEWING_PHASES
} from '../didactics/videoTasks'

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
  const address =
    profile.stage === 'sek2'
      ? 'Sprich die Lernenden mit „Sie“ an (Imperativ, z. B. „Erläutern Sie …“).'
      : 'Sprich die Lernenden mit „du“ an (Imperativ, z. B. „Erkläre …“).'
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
    `- ${address}`,
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
  const total = `${min * meta.pages}–${max * meta.pages}`
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
      : `- Plane ${total} Aufgaben für ${meta.pages} Seite(n) und bleibe im Zweifel am unteren Rand. Wenige, tragfähige Aufgaben sind besser als viele kleine Schritte.`,
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

/** Kompetenzschwerpunkt eines Fremdsprachenblattes (Auswahl in Schritt 1). */
export const SKILL_FOCUS: {
  value: 'mixed' | 'mediation' | 'writing' | 'listening' | 'reading' | 'grammar' | 'vocabulary'
  label: string
  description: string
  prompt: string
}[] = [
  {
    value: 'mixed',
    label: 'Gemischt',
    description: 'Aufgaben zu Leseverstehen, Wortschatz und Grammatik, wie es das Thema verlangt.',
    prompt: ''
  },
  {
    value: 'mediation',
    label: 'Sprachmittlung (Mediation)',
    description: 'Nur der deutsche Ausgangstext und eine einzelne Schreibaufgabe in der Zielsprache.',
    prompt: [
      'SCHWERPUNKT SPRACHMITTLUNG: Das Blatt besteht aus GENAU ZWEI Bausteinen, in dieser Reihenfolge:',
      '1. ein Baustein "text" mit dem deutschen Ausgangstext (language = "de"), mit zielsprachlichen Worterklärungen im glossary,',
      '2. GENAU EINE Aufgabe mit skill = "mediation".',
      'Sonst nichts: keine Lernziele, keine Merkkästen, keine Vorentlastung, kein Wortspeicher als eigener Baustein, keine Selbsteinschätzung, keine zweite Aufgabe und keine Teilaufgaben.'
    ].join(' ')
  },
  {
    value: 'writing',
    label: 'Schreiben (Writing)',
    description: 'Nur eine einzelne, situierte Schreibaufgabe (bei Bedarf mit dem Text, auf den geantwortet wird).',
    prompt: [
      'SCHWERPUNKT SCHREIBEN: Das Blatt besteht aus GENAU EINER Aufgabe mit skill = "writing".',
      'Nur wenn die Situation einen Ausgangstext verlangt (z. B. die E-Mail, die beantwortet wird, oder der Aushang, auf den man sich bewirbt), steht davor ein einziger Baustein "text" in der Zielsprache.',
      'Sonst nichts: keine Lernziele, keine Textsortenübung, kein Mustertext, kein Wortspeicher als eigener Baustein, keine Selbsteinschätzung, keine zweite Aufgabe und keine Teilaufgaben.',
      'Situation, Adressat, Textsorte, Zweck, Umfang und die Inhaltspunkte stehen in brief, nicht als eigene Aufgaben.'
    ].join(' ')
  },
  {
    value: 'vocabulary',
    label: 'Vokabeln',
    description: 'Wortschatz aufbauen: einführen, üben, anwenden oder wiederholen.',
    prompt: 'SCHWERPUNKT VOKABELN: siehe die gesonderten Regeln zur Wortschatzarbeit weiter unten.'
  },
  {
    value: 'grammar',
    label: 'Grammatik',
    description: 'Ein Grammatikthema entdecken, ordnen, üben und in eigenen Sätzen anwenden.',
    prompt: [
      'SCHWERPUNKT GRAMMATIK: Das Blatt führt durch ein einziges Grammatikthema.',
      'Aufbau: (1) kurzer, zusammenhängender Text oder Dialog, in dem die Form gehäuft und auffällig vorkommt, (2) eine Aufgabe, in der die Lernenden die Formen im Text finden und ordnen, (3) ein Merkkasten, den die Lernenden selbst vervollständigen, (4) gelenkte Übung, (5) eine halboffene Übung, (6) eine Anwendungsaufgabe, in der die Form in eigenen Sätzen zu einem echten Anlass gebraucht wird.',
      'Nicht mehr als zwei Übungsaufgaben zur reinen Form – der Ertrag liegt in der Anwendung.'
    ].join(' ')
  },
  {
    value: 'reading',
    label: 'Leseverstehen',
    description: 'Ein Lesetext mit Aufgaben in den gewählten Prüfungsformaten.',
    prompt: [
      'SCHWERPUNKT LESEVERSTEHEN: Das Blatt enthält einen unbekannten Lesetext auf dem Niveau der Lerngruppe und dazu 2–3 Aufgaben in den vorgegebenen Formaten.',
      'Der Text steht als Baustein "text" mit Zeilennummern vor den Aufgaben; die Aufgaben tragen skill = "reading".',
      'Nach den Verstehensaufgaben darf eine weiterführende Aufgabe folgen (Meinung, Weiterschreiben) – als eigene Aufgabe ohne skill = "reading".'
    ].join(' ')
  },
  {
    value: 'listening',
    label: 'Hörverstehen (Listening)',
    description: 'Hörtext mit Skript, dazu Aufgaben, die während des Hörens lösbar sind.',
    prompt:
      'SCHWERPUNKT HÖRVERSTEHEN: Das Blatt enthält einen Baustein "audio" mit Skript, davor eine kurze Aufgabe zur Vorentlastung (Wortschatz, Erwartungen) und danach 2–3 Aufgaben mit skill = "listening" zum Ankreuzen, Zuordnen oder Ergänzen.'
  }
]

/**
 * Welche Schwerpunkte das Fach anbietet: In den Fremdsprachen alle, in Deutsch nur
 * „gemischt" und „Grammatik" – Sprachmittlung und Hörverstehen sind dort keine eigenen Bereiche.
 */
export function skillFocusOptions(subjectId: string): typeof SKILL_FOCUS {
  if (subjectById(subjectId).foreignLanguage) return SKILL_FOCUS
  // DaZ arbeitet mit denselben Schwerpunkten wie die Fremdsprachen, ohne Sprachmittlung
  if (subjectId === 'daz') return SKILL_FOCUS.filter((f) => f.value !== 'mediation')
  /*
   * Deutsch hat als einziges Fach ausserhalb der Fremdsprachen einen eigenen
   * Hoer-Kompetenzbereich: Verstehend zuhoeren ist Kernbereich der KMK-Bildungsstandards
   * (ESA/MSA 2022) und getestete Domaene in VERA-8. Lesen gehoert dort ebenfalls dazu.
   */
  if (subjectId === 'deutsch') return SKILL_FOCUS.filter((f) => ['mixed', 'listening', 'reading', 'grammar', 'vocabulary'].includes(f.value))
  return SKILL_FOCUS.filter((f) => f.value === 'mixed')
}

/**
 * Gestufte Hilfekarten: Sie stehen auf einer eigenen Schlussseite und helfen den Lernenden,
 * selbst weiterzukommen, statt auf die Lösung zu warten (Leisen, Stäudel).
 */
export function helpCardRules(meta: WorksheetMeta): string {
  if (meta.helpCards === false) return ''
  return [
    'TIPP- UND HILFEKARTEN: Lege zu den ein bis zwei anspruchsvollsten Aufgaben je einen Baustein "scaffold" mit variant "hilfekarten" an.',
    '- Die Karten sind gestuft und in dieser Reihenfolge: (1) die Aufgabe in eigenen Worten, (2) ein Denkanstoß als Frage, (3) das nötige Fachwissen, (4) ein Lösungsbeispiel für einen Teil der Aufgabe.',
    '- Der Titel nennt die zugehörige Aufgabe („Hilfekarten zu Aufgabe 3").',
    '- Keine Karte verrät die vollständige Lösung.',
    '- Die App setzt die Karten auf eine eigene Schlussseite – schreibe sie deshalb als eigenen Baustein, nicht in die Aufgabe hinein.'
  ].join('\n')
}

export function skillFocusPrompt(meta: WorksheetMeta): string {
  if (!skillFocusOptions(meta.subjectId).some((f) => f.value === meta.skillFocus)) return ''
  // Beim Schwerpunkt Vokabeln stehen die ausführlichen Regeln in didactics/vocabWork.ts
  if (meta.skillFocus === 'vocabulary') return vocabWorkRules(meta)
  const text = SKILL_FOCUS.find((f) => f.value === (meta.skillFocus ?? 'mixed'))?.prompt ?? ''
  const wanted = wantedTasks(meta)
  if (!wanted || !text) return text
  /*
   * Die Schwerpunkt-Texte nennen selbst eine Zahl („2–3 Aufgaben"), und beim Hörverstehen
   * zusätzlich eine Vorentlastungsaufgabe. Gibt die Lehrkraft eine Zahl vor, darf hier keine
   * andere mehr stehen – sonst steht die Vorgabe gegen mehrere Sätze zugleich und verliert.
   */
  const ersetzt = text
    /*
     * Die Vorentlastungsaufgabe fällt weg, sobald eine Zahl vorgegeben ist – bei jeder Zahl,
     * nicht nur bei der Eins. Sonst wäre unklar, ob sie mitzählt, und aus „4 Aufgaben" würden
     * fünf. Der Hinweis vor dem Hören geht nicht verloren: Er steht im Baustein „audio".
     */
    .replace(/davor eine kurze Aufgabe zur Vorentlastung \(Wortschatz, Erwartungen\) und /, '')
    .replace(/2–3 Aufgaben/g, wanted === 1 ? 'GENAU EINE Aufgabe' : `GENAU ${wanted} Aufgaben`)
  return wanted === 1
    ? `${ersetzt} Es entsteht KEINE weitere Aufgabe – der Hinweis vor dem Hören bzw. Lesen steht im Material, nicht als eigene Aufgabe.`
    : ersetzt
}

/**
 * Grammatik: Regeln für ein Arbeitsblatt zu einer sprachlichen Form.
 *
 * Fachdidaktischer Kern: Grammatik wird induktiv und im Kontext erarbeitet (Sammeln – Ordnen –
 * Systematisieren), die Form wird im Eingangstext auffällig angeboten (input enhancement),
 * geübt wird vom gelenkten zum freien Gebrauch und vom Erkennen zum Produzieren.
 * Isolierte Einzelsätze ohne Zusammenhang gelten als wenig wirksam.
 */
/**
 * Hilfsblatt mit nützlichen Ausdrücken und Wortschatz.
 *
 * Fachdidaktischer Kern: Solche Redemittel wirken, wenn sie nach SPRACHHANDLUNG geordnet sind
 * und als feste Wendungen (chunks) gelernt werden – nicht als alphabetische Wortliste. Wer eine
 * Meinung äußern soll, sucht unter „eine Meinung äußern“. Die Wendungen werden angewendet,
 * nicht analysiert.
 */
/**
 * Welcher Modus für das sprachliche Gerüst gilt.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Die Übungsklausuren stellen bisher keine sprachlichen
 * Hilfsmittel zur Verfügung wie bei anderen Arbeitsblättern. Füge diese als eigene Seite
 * hinzu."
 *
 * Bei einer ÜBUNGSKLAUSUR in einer Fremdsprache gilt deshalb „eigene Seite", auch ohne dass
 * die Lehrkraft es eigens einschaltet. Das ist eine bewusste Abweichung von der
 * Prüfungswirklichkeit – im Abitur gibt es keine Formulierungshilfen. Eine Übung ist aber
 * zum Üben da, und wer die Wendungen noch nicht hat, kann die Aufgabe sonst nicht bewältigen.
 *
 * Eine EIGENE Seite und nicht im Text: So lässt sie sich beim zweiten Durchgang weglassen.
 */
/**
 * In welcher Sprache die Musterlösungen stehen.
 *
 * Gemeldet am 25.09.2026: „die ausformulierte musterlösung der aufgabe [wurde] auf Deutsch
 * verfasst, obwohl die Aufgabe Englisch erfordert. Stelle sicher, dass die Musterlösungen
 * immer in der Zielsprache verfasst werden."
 *
 * Der Grund ist praktisch: Die Lehrkraft legt den Mustertext neben eine fremdsprachige Abgabe.
 * Auf Deutsch taugt er weder für die Wortwahl noch für den Satzbau – und die Lernenden sollen
 * genau daran gemessen werden.
 *
 * Der ganze Prompt ist auf Deutsch; ohne einen ausdrücklichen Satz schreibt ein Sprachmodell
 * die Lösung deshalb ebenfalls auf Deutsch.
 */
export function loesungsspracheRegel(meta: WorksheetMeta): string {
  // Im bilingualen Sachfach ist die Arbeitssprache die Zielsprache, nicht das Fach selbst
  const bilingual = bilingualAktiv(meta)
  const ziel = bilingual ? meta.bilingual!.sprache : subjectById(meta.subjectId).foreignLanguage
  if (!ziel) return ''
  const sprache = bilingual ? meta.bilingual!.spracheLabel : meta.subjectLabel
  // Mischformat oder deutsche Aufgaben: Die Musterlösung folgt der Sprache der Aufgabe
  if (bilingual && meta.bilingual!.pruefsprache && meta.bilingual!.pruefsprache !== 'ziel')
    return `- Jede ausformulierte Musterlösung steht in der Sprache, in der die Aufgabe gestellt ist (${sprache} oder Deutsch). Hinweise an die Lehrkraft stehen auf Deutsch.`
  return (
    `- ALLES, WAS EINE SCHÜLERIN SCHREIBEN WÜRDE, STEHT AUF ${sprache.toUpperCase()}: der Mustertext (brief.model), die Beispiellösungen im Erwartungshorizont (examples) ` +
    `und jede ausformulierte Musterantwort. Eine Musterlösung auf Deutsch ist beim Korrigieren wertlos. Auf Deutsch bleiben nur die HINWEISE an die Lehrkraft: ` +
    `Bewertungskriterien, Punkte, Anforderungsbereiche.`
  )
}

export function phraseSheetModus(meta: WorksheetMeta): 'aus' | 'blatt' | 'inline' {
  const gewaehlt = meta.phraseSheet ?? 'aus'
  // Prüfung: Das Glossar liegt der ganzen Arbeit einmal bei, nicht jedem Teil
  if (bilingualAktiv(meta) && meta.bilingual!.pruefung) return gewaehlt
  if (gewaehlt !== 'aus') return gewaehlt
  const istKlausur = istUebungsklausur(meta)
  /*
   * Bilingual ist das zweisprachige Glossar PFLICHT (siehe `didactics/bilingual.ts`). Ohne
   * eigenen Gliederungspunkt entstünde es nie – die Ausformulierung erzeugt nur, was in der
   * Gliederung steht. Deshalb schaltet es sich hier von selbst ein.
   */
  if (bilingualAktiv(meta)) return istKlausur ? 'blatt' : 'inline'
  return istKlausur && subjectById(meta.subjectId).foreignLanguage ? 'blatt' : gewaehlt
}

export function phraseSheetRules(meta: WorksheetMeta): string {
  const mode = phraseSheetModus(meta)
  if (mode === 'aus') return ''
  if (bilingualAktiv(meta)) return glossarRegeln(meta, mode)
  const target = meta.subjectLabel
  return [
    istUebersetzungsfach(meta) ? 'HILFSBLATT „ÜBERSETZUNGSHILFEN“ (Baustein „phrases“):' : 'HILFSBLATT „NÜTZLICHE AUSDRÜCKE“ (Baustein „phrases“):',
    istUebersetzungsfach(meta)
      ? `- Erstelle GENAU EINEN Baustein vom Typ „phrases“ mit den Konstruktionen, die im Text dieses Blattes vorkommen und beim Übersetzen Schwierigkeiten machen. Das ist PFLICHT: Die Lehrkraft hat das Hilfsblatt eingeschaltet.`
      : `- Erstelle GENAU EINEN Baustein vom Typ „phrases“ mit Wendungen und Wortschatz auf ${target}, die für die Aufgaben dieses Blattes gebraucht werden. Das ist PFLICHT: Die Lehrkraft hat das Hilfsblatt eingeschaltet. Ein Blatt ohne diesen Baustein gilt als unvollständig.`,
    istUebersetzungsfach(meta)
      ? ''
      : '- Ordne sie nach SPRACHHANDLUNG (phraseGroups[].label), nicht alphabetisch und nicht nach Wortart: „eine Meinung äußern“, „zustimmen“, „widersprechen“, „etwas beschreiben“, „begründen“, „nachfragen“ – je nachdem, was die Aufgaben verlangen.',
    istUebersetzungsfach(meta)
      ? ''
      : '- Vollständige, direkt verwendbare Wendungen („In my opinion, …“), keine Einzelwörter ohne Kontext und keine Grammatikregeln.',
    /*
     * Umfang, Metasprache und Übersetzung richten sich nach Jahrgang und Niveau – die Regeln
     * und ihre Belege stehen in `didactics/phraseRules.ts`.
     */
    ...phrasenRegeln(meta),
    mode === 'blatt'
      ? '- Das Hilfsblatt steht am Ende als eigene Seite; die Aufgaben dürfen darauf verweisen („Nutze die Wendungen auf dem Hilfsblatt“).'
      : '- Das Hilfsblatt steht auf dem Aufgabenblatt, möglichst vor der ersten Aufgabe, die es braucht.',
    '- title: kurze Überschrift in der Zielsprache („Useful phrases“, „Expressions utiles“). body: ein Satz, wie das Blatt zu benutzen ist.',
    writingScaffoldRules(meta)
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Das sprachliche Gerüst für eine Schreibaufgabe.
 *
 * Es wird AUS DEM ERWARTUNGSHORIZONT abgeleitet, nicht aus dem Thema – so passen Aufgabe,
 * Erwartung und Hilfe zusammen, statt nebeneinanderher zu laufen (Entscheidung der
 * Lehrkraft, 23.09.2026).
 *
 * Die Gliederung folgt zwei Schemata, die beide amtlich sind und nicht von der App erfunden:
 *
 *   - Textsortenposition – so gliedert die Operatorenliste zur ZP10 in Nordrhein-Westfalen
 *     die Zieltextformate: Einleitung, Hauptteil, Abschluss, Leseransprache.
 *   - Sprachfunktion – so gliedert die bayerische Rating Scale ihre Tabelle „Linking
 *     Devices" nach PURPOSE: time, sequence, addition, cause/reason, illustration,
 *     paraphrase, contrast, comparison, concession, result, conclusion.
 *
 * Für „bewerten" und „Vorschläge machen" gibt es in keinem amtlichen Schema eine Kategorie.
 * Wo die App dafür Gruppen bildet, ist das ihr Vorschlag – deshalb steht es hier als
 * erlaubte Ergänzung und nicht als Zitat.
 *
 * Die Abstufung nach Niveau übernimmt Bayerns Zweiteilung BASIC/COMPLEX, weil nur sie
 * belegt und zugleich an die Bewertungsbänder gekoppelt ist („basic linking" trägt Band 5,
 * „varied complex linking" Band 7). GER-Etiketten wie A2/B1 für einzelne Wendungen habe
 * ich in keiner Quelle gefunden und werden deshalb nicht behauptet.
 */
export function writingScaffoldRules(meta: WorksheetMeta): string {
  const subject = subjectById(meta.subjectId)
  if (!subject.foreignLanguage) return ''
  const stufen = meta.differentiation?.levels ?? 1
  return [
    '',
    'SPRACHLICHES GERÜST FÜR DIE SCHREIBAUFGABE:',
    '- Leite die Gruppen AUS DEM ERWARTUNGSHORIZONT ab: zu jedem Aspekt in brief.expected eine Gruppe, die genau die Sprachhandlung bedient, die er verlangt.',
    '- Zwei Arten von Gruppen sind zulässig: nach Stelle im Text (Einleitung, Hauptteil, Leseransprache, Abschluss) und nach Sprachfunktion (zeitlich ordnen, aufzählen, begründen, veranschaulichen, gegenüberstellen, vergleichen, einräumen, folgern, zusammenfassen).',
    '- Wendungen, die der Mustertext (brief.model) tatsächlich braucht, haben Vorrang vor allgemeinen Floskeln.',
    '- Der einleitende Satz macht das Gerüst zum ANGEBOT, nicht zur Vorlage – im Wortlaut der bayerischen Unterrichtsmaterialien: „… to choose from. Of course, you can also use different ones."',
    stufen > 1
      ? '- Abgestuft nach Niveau: ★ vollständige Satzmuster mit Lücke, ★★ Satzanfänge und ein Wortfeld, ★★★ nur wenige anspruchsvolle Wendungen (komplexe Konnektoren, Konzessivsätze). Auf jeder Stufe dieselben Gruppen, nur anders ausgebaut.'
      : '- Mische einfache und anspruchsvollere Wendungen, damit auch starke Lernende etwas finden, was sie noch nicht benutzen.',
    '- KEINE fertigen Sätze, die den Inhalt schon vorwegnehmen. Das Gerüst trägt die Sprache, nicht die Gedanken.'
  ].join('\n')
}

export function grammarRules(meta: WorksheetMeta): string {
  if (meta.skillFocus !== 'grammar') return ''
  const picked = chosenGrammarTopics(meta)
  const topic = picked.length
    ? picked.map((t) => `${t.label}${t.term && t.term !== t.label ? ` (${t.term})` : ''}`).join(' · ')
    : (meta.grammarTopic ?? '').trim()
  const target = meta.subjectLabel
  const german = meta.subjectId === 'deutsch'
  // Belegte Fehlerquellen und Formatempfehlungen mitgeben, statt sie die KI raten zu lassen
  const errors = picked.map((t) => t.errors).filter(Boolean)
  const formats = [...new Set(picked.flatMap((t) => t.formats))].map(grammarFormatLabel)
  const receptive = picked.filter((t) => t.receptive)
  return [
    `GRAMMATIK – THEMA: ${topic || '(aus dem Thema des Blattes ableiten)'}`,
    picked.length > 1
      ? '- Mehrere Themen sind gewählt: Das Blatt ist eine Wiederholung. Ordne die Aufgaben nach Themen und gib jedem einen eigenen Abschnitt mit Überschrift.'
      : '',
    errors.length
      ? `- BEKANNTE STOLPERSTELLEN, an denen die Übungen ansetzen müssen: ${errors.join(' | ')}. Mindestens eine Aufgabe nimmt genau einen dieser Fehler zum Gegenstand.`
      : '',
    formats.length ? `- Für dieses Thema besonders geeignete Aufgabenformen: ${formats.join(', ')}. Nutze mindestens zwei davon.` : '',
    receptive.length
      ? `- ${receptive.map((t) => t.label).join(', ')}: auf dieser Stufe nur ERKENNEN, nicht selbst bilden. Keine Aufgabe, die diese Form produzieren lässt.`
      : '',
    '- Genau EIN Grammatikthema je Blatt. Alles auf dem Blatt dient diesem Thema.',
    '- Beginne mit der SPRACHHANDLUNG, nicht mit dem Formennamen: „über Vergangenes berichten", „Bedingungen ausdrücken", „etwas vergleichen". Der Fachbegriff fällt erst bei der Systematisierung.',
    `- Einstieg: ein kurzer zusammenhängender Text, Dialog oder eine Bildergeschichte auf ${target}, in dem die Zielform mindestens sechsmal natürlich vorkommt – inhaltlich sinnvoll, nicht als Aneinanderreihung von Beispielsätzen. Hebe die Zielform im Text **fett** hervor.`,
    '- Dreischritt Sammeln – Ordnen – Systematisieren: (1) die Formen im Text suchen und herausschreiben, (2) sie nach einem Merkmal ordnen (Tabelle mit zwei Spalten), (3) die Regel selbst formulieren.',
    '- Die Regel formulieren die Lernenden selbst: Der Merkkasten hat Lücken ([[…]]), die aus der geordneten Sammlung gefüllt werden. Der Kasten ist ein Schema oder eine Tabelle mit Beispielsatz – niemals ein Fließtextabsatz.',
    '- Vor der ersten Produktionsaufgabe steht eine Verstehensaufgabe, die ohne eigenes Produzieren lösbar ist und eine eindeutig richtige Antwort hat („Geschieht das jetzt oder früher? Kreuze an."). Reine Meinungsfragen ersetzen diese Aufgabe nicht.',
    '- Übungsfolge: geschlossen (zuordnen, auswählen) → halboffen (umformen, Lücke mit Vorgabe) → offen (eigener kurzer Text, in dem die Form gebraucht werden MUSS).',
    '- Auch die Übungen behalten eine Mitteilungsabsicht: Jede Aufgabe hat ein inhaltliches Ergebnis, nicht nur eine richtige Form.',
    '- Höchstens zwei rein formale Übungen; kein Konjugationsdrill und keine Reihe unverbundener Einzelsätze.',
    '- Keine unbekannte Lexik: Die Grammatik wird an Wortschatz geübt, den die Lerngruppe kennt.',
    german
      ? '- Nutze die operationalen Verfahren des Deutschunterrichts als Arbeitsweise: Umstell-, Ersatz-, Weglass- und Erweiterungsprobe. Statt „Bestimme das Satzglied" heißt es „Stelle den Satz auf fünf Arten um – was bleibt zusammen?", immer mit einer Beobachtungsfrage („Was ändert sich an der Bedeutung oder an der Betonung?").'
      : `- Ein kurzer Sprachvergleich gehört dazu: dieselbe Aussage auf ${target} und auf Deutsch nebeneinander, mit einer Frage nach dem UNTERSCHIED (nicht nach der Übersetzung).`,
    german ? '' : '- Ein kleiner Redemittelkasten mit festen Wendungen (chunks) darf danebenstehen; er wird angewendet, nicht analysiert.',
    '- Fehlerarbeit steht am Ende, nie am Anfang: eine Aufgabe, in der ein typischer Fehler gefunden und mit Begründung verbessert wird.',
    '- Differenzierung: Auf der Stufe ★ darf die Regel vorangestellt werden (deduktiv) – schwächere Lernende profitieren davon; auf ★★★ wird sie selbst erschlossen.',
    '- Fachbegriffe sparsam, aber korrekt; jeder neue Begriff wird beim ersten Auftreten erklärt.'
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Aufgabenformate für Hör- und Leseverstehen.
 *
 * Belegt aus den KMK-Bildungsstandards (MSA 2003, Abitur 2012), dem Kernlehrplan Englisch NRW
 * mit den Empfehlungen der Fachaufsicht und dem Kerncurriculum Englisch Niedersachsen.
 */
export function comprehensionRules(meta: WorksheetMeta): string {
  const skill: ComprehensionSkill | null = meta.skillFocus === 'listening' ? 'listening' : meta.skillFocus === 'reading' ? 'reading' : null
  if (!skill) return ''
  const chosen = (meta.comprehensionFormats?.length ? meta.comprehensionFormats : defaultComprehensionFormats(skill, meta.grade))
    .map(comprehensionFormatById)
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
  if (!chosen.length) return ''
  return [
    /*
     * „Benutze genau diese" war zu schwach: Bei mehreren gewählten Formaten nahm die KI
     * einzelne heraus, und ein ausdrücklich bestelltes Format fehlte auf dem Blatt. Deshalb
     * steht jetzt dabei, dass JEDES gewählte Format vorkommen muss – und bei genau einem
     * Format, dass es das einzige ist.
     */
    `AUFGABENFORMATE (${skill === 'listening' ? 'Hörverstehen' : 'Leseverstehen'}):`,
    chosen.length === 1
      ? `- Benutze AUSSCHLIESSLICH dieses eine Format. Kein anderes Antwortformat kommt vor.`
      : wantedTasks(meta) === 1
        ? `- Wähle EINES dieser ${chosen.length} Formate – die Lehrkraft hat nur eine Aufgabe bestellt.`
        : `- JEDES dieser ${chosen.length} Formate kommt mindestens einmal vor; andere Formate sind nicht erlaubt.`,
    // `stem` nennt den Wortlaut der Frage – ohne ihn schrieb die KI zu jedem Format denselben Satz
    ...chosen.map((f) => `- ${f.label} (answer.kind = "${f.answerKind}"): ${f.purpose}. ${f.construction} ${f.stem} Punkte: ${f.scoring}.`),
    '',
    /*
     * Anforderungsbereiche bei Hör- und Leseverstehen.
     *
     * Recherche in den amtlichen Quellen (KMK, IQB, NRW, Hamburg, Bayern, Brandenburg, SH):
     * Eine Zuordnung „Format → Anforderungsbereich" gibt es NICHT und wäre sachlich falsch.
     * Der Bereich ergibt sich aus der verlangten Denkleistung – KMK 2012: die Zuordnung ist
     * „vom Kontext der Aufgabenstellung … abhängig"; abitur.nrw: „Grundsätzlich können sich
     * alle Operatoren auf alle drei Anforderungsbereiche beziehen."
     *
     * Belegt ist dagegen die OBERGRENZE: Für rezeptive Prüfungsteile gilt durchgängig I–II
     * (IQB: „schwerpunktmäßig Anforderungsbereich I, vereinzelt Anforderungsbereich II";
     * Hamburg: „Leistungen in den Anforderungsbereichen I und II"). Bereich III wird über
     * die produktiven Teile eingelöst; begründungspflichtige Formate sind im Hörverstehen
     * testtheoretisch sogar ausgeschlossen (NRW).
     */
    'ANFORDERUNGSBEREICHE (Hör-/Leseverstehen):',
    '- Nur AFB I und AFB II. KEINE Verstehensaufgabe bekommt AFB III – Bewerten und Gestalten gehören zu den produktiven Aufgaben, nicht zum Verstehen.',
    '- Der Bereich hängt an der Denkleistung, NICHT am Antwortformat: Eine Ankreuzaufgabe ist AFB I, wenn die Antwort ausdrücklich im Text steht, und AFB II, wenn sie erst erschlossen werden muss (Haltung, Absicht, Ursache, Folge).',
    '- Eine offene Frage nach einer ausdrücklich genannten Einzelheit bleibt AFB I; das Format hebt sie nicht.',
    '',
    'REGELN FÜR ALLE VERSTEHENSAUFGABEN:',
    // Die Zahl gilt JE Text: Bei zwei Hörtexten bekommt jeder so viele Fragen.
    meta.itemCount && meta.itemCount > 0 ? `- GENAU ${Math.round(meta.itemCount)} Items je Text – die Lehrkraft hat diese Zahl vorgegeben.` : '',
    '- Die Items folgen der Reihenfolge des Textes und verteilen sich über den ganzen Text.',
    '- Zwischen Aufgabe und Textstelle soll keine wörtliche Übereinstimmung bestehen – paraphrasiere.',
    '- Jede Antwort steht wörtlich oder sinngemäß im Text; nichts ist aus Vorwissen allein lösbar.',
    '- Bewertet wird nur, ob die Lösung das richtige Verständnis nachweist; sprachliche Verstöße und Rechtschreibung zählen nicht.',
    wantedTasks(meta) === 1 ? '' : '- Mische ein geschlossenes und ein halboffenes Format; zum Ende der Sekundarstufe I überwiegen die offeneren Formate.',
    skill === 'listening'
      ? '- Vor dem Hören bekommen die Lernenden Zeit, die Aufgaben zu lesen; der Text wird zweimal gehört.'
      : '- Der Lesetext trägt Zeilennummern, damit Textbelege angegeben werden können.'
  ].join('\n')
}

/**
 * Wie eine Reihe von Ankreuzfragen formuliert wird.
 *
 * Gemeldet wurde: „Die Multiple-Choice-Antworten werden alle formuliert mit **Tick** …" –
 * bei vier Fragen stand der Operator viermal da, obwohl er schon in der Arbeitsanweisung
 * steht. Er gehört dort genau einmal hin; daneben zeigt ein angekreuztes Kästchen, was zu
 * tun ist. Die einzelnen Punkte sind dann das, was sie sein sollen: FRAGEN.
 *
 * Das ist keine Geschmacksfrage. Eine Anweisung, die sich wortgleich wiederholt, wird nicht
 * mehr gelesen – und wer „Tick" liest, wo eine Frage stehen sollte, sucht die Frage.
 */
export const mcItemRules = [
  'AUFBAU EINER REIHE VON ANKREUZFRAGEN (answer.kind = "multipleChoice" in parts):',
  '- Der Operator („Tick", „Choose", „Kreuze an") steht EINMAL in der Arbeitsanweisung der Aufgabe (instruction), niemals in den einzelnen Teilaufgaben.',
  '- Jede Teilaufgabe ist eine vollständige FRAGE mit Fragezeichen, z. B. „Where does Ruby go after school?" – kein „Tick …", kein „Choose …", keine Wiederholung der Anweisung.',
  '- Die Frage steht ohne Nummer und ohne Buchstaben davor; die Zählung vergibt das Arbeitsblatt.',
  '- Die Antwortmöglichkeiten sind kurz (höchstens fünf Wörter) und stehen ohne „a)", „b)" – auch diese Marken setzt das Arbeitsblatt.',
  '- Alle Möglichkeiten einer Frage sind gleich gebaut und gleich lang; die falschen sind plausibel, nicht abwegig.'
].join('\n')

/**
 * Wortlaut der EINZELNEN Fragen bei Hör- und Leseverstehen.
 *
 * Bis hierher sagte der Auftrag, WELCHE Formate vorkommen und WIE VIELE Items – aber nichts
 * darüber, wie der Satz lauten soll, den die Lernenden lesen. Das ist der Satz, an dem sich
 * entscheidet, ob Verstehen geprüft wird oder Wortgleichheit.
 *
 * Belegt aus den amtlichen Vorgaben (Fundstellen in `didactics/itemWording.ts`):
 * - QUA-LiS/MSB NRW (27.10.2025, S. 13–14): Items „sind so formuliert, dass ihr Sprachniveau
 *   nicht das Sprachniveau des Hörtextes übersteigt"; sie „vermeiden Verneinungen"; sie sind
 *   „ohne Einschränkungs- und Ausschließlichkeitspartikel"; sie „sind voneinander
 *   unabhängig"; sie „sind nicht allein durch Weltwissen zu lösen"; der Wortlaut des
 *   Originaltexts wird weder im Attraktor noch in den Distraktoren wiederholt.
 * - KMK 2012: „Das sprachliche Anforderungsniveau der einzelnen Items liegt jeweils
 *   unterhalb des Anforderungsniveaus der Hörtexte."
 * - ALTE/Council of Europe (2011): keine wörtliche Übernahme; Antworttyp und Höchstlänge
 *   müssen angegeben sein; Items dürfen nicht voneinander abhängen.
 * - Rodriguez (2005), Metaanalyse über 80 Jahre: drei Antwortmöglichkeiten genügen.
 *
 * Ausdrücklich NICHT belegt und deshalb nicht als Regel formuliert: eine Rangfolge der
 * Fragewörter (who/what vor why/how). Dazu gibt es in den geprüften Quellen nichts; die
 * belegte Abstufung läuft über den Verarbeitungsgrad (explizit genannt vs. erschlossen).
 */
export function itemWordingRules(meta: WorksheetMeta): string {
  const skill = meta.skillFocus === 'listening' ? 'listening' : meta.skillFocus === 'reading' ? 'reading' : null
  if (!skill) return ''
  return [
    'WORTLAUT DER EINZELNEN FRAGEN (verbindlich):',
    '- Die Frage ist sprachlich EINFACHER als der Text: nur Wortschatz und Strukturen auf dem Niveau des Textes oder darunter. Defizite im Lesen dürfen das Verstehen nicht verdecken.',
    '- Jede Frage ist kurz – höchstens etwa 20 Wörter. Die Leseleistung der Frage darf nicht schwerer wiegen als das Verstehen selbst.',
    '- Weder die Frage noch eine Antwortmöglichkeit wiederholt den Wortlaut des Textes. Paraphrasiere, aber nur mit Wortschatz, den die Lerngruppe kennt.',
    '- Die richtige Möglichkeit wiederholt kein Schlüsselwort aus der Frage.',
    '- Keine Frage ist allein aus Welt-, Fach- oder Kulturwissen lösbar; ohne den Text darf keine Antwort sicher sein.',
    '- Die Fragen sind voneinander unabhängig: Keine Frage verrät die Lösung einer anderen oder setzt sie voraus.',
    '- Positiv formulieren. Keine Verneinung in der Frage und keine doppelte Verneinung aus Frage und Möglichkeit.',
    '- Keine Ausschließlichkeitswörter (immer, nie, nur, alle, ausschließlich, weniger) – weder in der Frage noch in den Möglichkeiten.',
    '- Genau EINE Frage je Item. Keine zweiteiligen Fragen („… und warum?"), keine Kombinationsmöglichkeiten („a und c"), kein „alles davon" / „nichts davon".',
    '- Alle Bezüge stehen in der Frage selbst. Keine Pronomen, deren Bezug erst aus dem Text oder aus einer anderen Frage hervorgeht.',
    '- Die Frage ist ohne die Antwortmöglichkeiten verständlich und löst eine Antworterwartung aus.',
    '- Satzergänzung nur, wenn die Lücke am SATZENDE steht und alle Möglichkeiten grammatisch anschließen; sonst die Frageform.',
    '- Die Antwortmöglichkeiten sind gleich gebaut, ähnlich lang und ähnlich komplex; drei plausible Möglichkeiten genügen.',
    '- Genau eine Möglichkeit ist eindeutig richtig; die falschen sind plausibel. Die Stelle der richtigen Antwort wechselt.',
    '- Bei halboffenen Formaten stehen Antworttyp und Höchstlänge in der Aufgabe („Nenne zwei Beispiele.", „using 1 to 5 words").',
    skill === 'listening'
      ? '- Die Fragen folgen der Reihenfolge des Hörtextes, verteilen sich gleichmäßig über ihn und sind schon beim ERSTEN Hören lesbar und lösbar; je Hörtext wird nur ein Hörstil geprüft.'
      : '- Die Fragen folgen der Reihenfolge des Textes und verteilen sich über den ganzen Text.',
    /*
     * Richtig/Falsch im Leseverstehen NUR mit Textbeleg.
     *
     * Belegt: MSB/QUA-LiS NRW, Unterrichtsvorgaben ZP10 Englisch 2027, Abschnitt 1.5 nennt
     * als Leseverstehensformat „Richtig-/Falsch-Aufgaben MIT BEGRÜNDUNG" – MSA, Gymnasium
     * und EESA gleichermaßen. KMK 2012 setzt in der illustrierenden Prüfungsaufgabe
     * Französisch unter jedes Item „Citez le passage qui justifie votre réponse". DELF
     * verlangt die justification auf allen Niveaus ab A2.
     *
     * Der Beleg ist ein ZITAT, keine Zeilenangabe: QUA-LiS NRW, ZP10-FAQ – „Eine
     * Zeilenangabe als Beleg ist nicht vorgesehen … Zeilenangaben geben keine Punkte."
     *
     * Beim HÖREN gilt das nicht: Dort ist der Text flüchtig, ein Zitat wäre Gedächtnis-
     * leistung – NRW schließt Begründungsformate für die Hörverstehensmessung sogar aus.
     */
    skill === 'reading'
      ? [
          '- Richtig/Falsch-Aufgaben NUR mit Textbeleg: Zu jeder Aussage gehört ein kurzes WÖRTLICHES Zitat aus dem Text, das die Entscheidung stützt. Auslassungen werden mit […] gekennzeichnet.',
          '- Eine bloße Zeilenangabe ist KEIN Beleg – verlange immer den Wortlaut.',
          '- Punkte gibt es nur für die richtige Kombination aus Ankreuzen UND zutreffendem Zitat; für eines von beiden gibt es nichts.',
          '- Ausnahme: Items, deren Lösung „nicht im Text" lautet. Zu ihnen kann es kein Zitat geben; sie bekommen die vollen Punkte allein für das Ankreuzen.'
        ].join('\n')
      : '',
    meta.instructionsInGerman
      ? '- Die Fragen stehen auf Deutsch, weil die Lehrkraft das so gewählt hat.'
      : '- Die Fragen stehen in der Zielsprache. Ein unvermeidbar unbekanntes Wort wird als Fußnote übersetzt, statt die Sprache zu wechseln.'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Sprachmittlung und Schreiben bestehen aus dem Ausgangstext und genau einer Aufgabe. */
export function singleTaskFocus(meta: WorksheetMeta): boolean {
  if (!subjectById(meta.subjectId).foreignLanguage) return false
  return meta.skillFocus === 'mediation' || meta.skillFocus === 'writing'
}

/** Beschreibung des Auftrags (Thema, Art, Umfang) für Gliederung und Ausformulierung. */
export function taskContext(meta: WorksheetMeta, profile: LearnerProfile): string {
  const tasksMin = profile.tasks.perPage[0] * meta.pages
  const tasksMax = profile.tasks.perPage[1] * meta.pages
  // Sprachmittlung und Schreiben füllen das Blatt mit einer einzigen Aufgabe
  const single = singleTaskFocus(meta)
  return [
    `Thema: ${meta.topic}`,
    meta.learningGoals ? `Vorgegebene Lernziele: ${meta.learningGoals}` : '',
    /*
     * Vorwissen nach Wirkung getrennt: voraussetzen, Fehlvorstellungen aufgreifen, nicht
     * voraussetzen (didactics/vorwissen). In einer Lernkontrolle – so baut auch die
     * Klassenarbeit ihr Blatt – steht hier der geprüfte Stoff; dort gibt es keinen
     * Aktivierungseinstieg, also bleibt es bei der schlichten Angabe.
     */
    meta.priorKnowledge ? (meta.sheetType === 'lernkontrolle' ? `Vorwissen der Lerngruppe: ${meta.priorKnowledge}` : vorwissenRegeln(meta.priorKnowledge)) : '',
    `Art des Arbeitsblatts: ${sheetTypePrompt(meta.sheetType)}`,
    single
      ? `Umfang: RICHTWERT ${meta.pages} DIN-A4-Seite(n) mit GENAU EINER Aufgabe, Bearbeitungszeit ca. ${meta.minutes} Minuten. Der Platz gehört dem Ausgangstext und den Schreiblinien, nicht weiteren Aufgaben.`
      : `Umfang: RICHTWERT ${meta.pages} DIN-A4-Seite(n), insgesamt ${tasksMin}–${tasksMax} Aufgaben (${tasksMax} ist die Obergrenze der Aufgabenzahl, nicht das Ziel), Bearbeitungszeit ca. ${meta.minutes} Minuten.`,
    meta.socialForms.length ? `Bevorzugte Sozialformen: ${meta.socialForms.join(', ')}.` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------- Originalquellen ----------

/** Fächer, in denen Quellenarbeit zum Kern gehört */
export const SOURCE_SUBJECTS = ['geschichte', 'politik', 'religion', 'werte-und-normen', 'deutsch', 'latein', 'kunst', 'musik', 'erdkunde']

/**
 * Automatisch: in Quellenfächern ab Klasse 7 (Quellenarbeit ist dort fester Bestandteil der Lehrpläne),
 * in Klasse 5–6 nur für die anspruchsvollste Niveaustufe.
 */
export function originalSourcesActive(meta: WorksheetMeta, level: Stars | null = null): boolean {
  const mode = meta.originalSources ?? 'auto'
  if (mode !== 'auto') return mode === 'on'
  if (!SOURCE_SUBJECTS.includes(meta.subjectId)) return false
  return meta.grade >= 7 || (meta.grade >= 5 && level === 3)
}

export function originalSourcesHint(meta: WorksheetMeta): string {
  if (!SOURCE_SUBJECTS.includes(meta.subjectId)) return `Automatisch: in ${meta.subjectLabel || 'diesem Fach'} keine Originalquellen.`
  if (meta.grade >= 7) return `Automatisch: in ${meta.subjectLabel} ab Klasse 7 mit Originalquellen.`
  if (meta.grade >= 5) return 'Automatisch: in Klasse 5–6 nur in der Fassung ★★★.'
  return 'Automatisch: in der Grundschule keine Originalquellen.'
}

/**
 * Regeln für Originalquellen, die die KI AUS DEM GEDÄCHTNIS nennt.
 *
 * Gemeldet von der Lehrkraft (24.09.2026): Zu einer Macbeth-Inszenierung wurde ein Text von
 * 2025 als bester Treffer angeboten – und dann doch nicht im Original verwendet.
 *
 * Die Ursache stand in diesen Regeln: „Kennst du den Wortlaut nicht sicher, verwende
 * stattdessen einen als Autorentext erkennbaren Darstellungstext." Den Wortlaut eines
 * Artikels von 2025 kennt kein Sprachmodell – also nahm es den angebotenen Ausweg, obwohl
 * der echte Text längst geladen danebenlag.
 *
 * Deshalb: Ist Material BESCHAFFT, treten diese Regeln zurück. Zwei Regelwerke aus zwei
 * Epochen im selben Prompt sind genau die Art Widerspruch, bei dem am Ende die allgemeinere
 * Regel gewinnt.
 */
export function originalSourceRules(meta: WorksheetMeta, level: Stars | null = null, material?: OriginalMaterialAblage | null): string {
  if (!originalSourcesActive(meta, level)) return ''
  if (material) {
    return [
      'ORIGINALQUELLE: Der Ausgangstext ist bereits beschafft, geladen und geprüft (siehe unten).',
      '- Er steht dort im Wortlaut. Du musst und darfst ihn NICHT aus dem Gedächtnis wiedergeben.',
      '- Weiche NICHT auf einen selbst geschriebenen Darstellungstext aus. Das war früher der Ausweg, wenn du einen Wortlaut nicht sicher kanntest – hier ist er falsch.',
      '- Aufgaben zur Quellenarbeit passend zum Jahrgang: Quelle einordnen (Wer? Wann? Für wen? Mit welcher Absicht?), Aussagen herausarbeiten, Perspektive und Glaubwürdigkeit beurteilen.'
    ].join('\n')
  }
  const literary = ['deutsch', 'latein'].includes(meta.subjectId)
  return [
    'ORIGINALQUELLEN: Setze, wo es dem Lernziel dient, authentische Quellen ein statt nur Autorentexte – ' +
      (literary
        ? 'z. B. gemeinfreie literarische Originaltexte (Autorin/Autor seit über 70 Jahren verstorben), Briefe, Reden, zeitgenössische Bilder.'
        : 'z. B. historische Textquellen (Urkunden, Gesetze, Reden, Briefe, Tagebücher, Zeitungsartikel), Bildquellen (Gemälde, Fotografien, Karikaturen, Plakate, historische Karten).'),
    '- Nur gemeinfreie oder frei zugängliche Quellen, z. B. Wikisource, Projekt Gutenberg, documentArchiv.de, LeMO (DHM), Bundeszentrale für politische Bildung, Wikimedia Commons.',
    '- Zitiere nur Wortlaute, die du sicher kennst. Erfinde NIEMALS Quellen, Zitate, Urheber oder Jahreszahlen. Kennst du den Wortlaut nicht sicher, verwende stattdessen einen als Autorentext erkennbaren Darstellungstext.',
    '- Textquelle als Baustein „text“: title beginnt mit „Q1:“, „Q2:“ …; Kürzungen mit […]; lineNumbers an (Zeilennummern setzt die App – nie selbst Nummern in den Text schreiben); veraltete oder unbekannte Wörter im Glossar erklären.',
    '- source bei Textquellen: „Urheber, Titel bzw. Art der Quelle, Datum. Fundort: <https-Adresse des frei zugänglichen Volltexts>“ – die Adresse nur, wenn du sie sicher kennst. Bei Übersetzung oder sprachlicher Anpassung „(Übersetzung)“ bzw. „(sprachlich angepasst)“ ergänzen.',
    '- Bildquelle als Baustein „image“: title = Bildunterschrift „Urheber: Titel, Jahr“; imageDescription = was zu sehen ist; imageSearch = 2–5 markante Suchwörter für Wikimedia Commons (Urheber bzw. Kernwörter des Originaltitels, ohne Gattungswörter wie „Karikatur“); imageIsSource = true. Nur tatsächlich existierende, bekannte Werke.',
    '- Aufgaben zur Quellenarbeit passend zum Jahrgang: Quelle einordnen (Wer? Wann? Für wen? Mit welcher Absicht?), Aussagen herausarbeiten, Perspektive und Glaubwürdigkeit beurteilen.',
    level === 1
      ? '- Diese Fassung: kurze Auszüge, sprachlich angepasst und gekennzeichnet, viele Worterklärungen, Leitfragen zur Quellenarbeit.'
      : level === 3
        ? '- Diese Fassung: längere Auszüge im Originalwortlaut, Quellenkritik und Vergleich von Perspektiven.'
        : '- Kürzungen erlaubt; in Stufe ★ sprachlich angepasste Auszüge, in Stufe ★★★ Originalwortlaut.'
  ].join('\n')
}

/**
 * Der Ausgangstext steht schon fest – die KI plant nur noch die Aufgaben dazu.
 *
 * Wunsch der Lehrkraft (24.09.2026): Die App sucht das Originalmaterial im Netz. Sie hat es
 * geladen, gekürzt und den Wortlaut geprüft.
 *
 * Entscheidend ist der letzte Satz dieser Regeln: Die KI darf den Text NICHT abschreiben.
 * Ein Sprachmodell, das einen Text „übernimmt", ändert dabei Kleinigkeiten – ein Komma, eine
 * Schreibweise, ein Wort. Auf dem Blatt stünde das dann mit Quellenangabe da und sähe aus
 * wie ein Zitat. Die App setzt den Baustein deshalb selbst ein.
 */
export function originalMaterialVorgabe(material: OriginalMaterialAblage | null | undefined): string {
  if (!material) return ''
  return [
    'AUSGANGSTEXT – BEREITS BESCHAFFT, NICHT ZU ERZEUGEN:',
    `Titel: ${material.titel}${material.urheber ? ` · Urheber: ${material.urheber}` : ''}`,
    `Quellenangabe: ${material.quellenangabe}`,
    '--- Wortlaut (bereits gekuerzt) ---',
    material.text,
    '--- Ende des Wortlauts ---',
    'REGELN DAZU:',
    '- Dieser Text steht auf dem Blatt. Die App setzt ihn SELBST als Baustein ein, zusammen mit Quellenangabe und Zeilennummern.',
    '- Erzeuge KEINEN eigenen Baustein fuer diesen Text und gib ihn NIRGENDS wieder – auch nicht auszugsweise, auch nicht „zur Sicherheit".',
    '- Plane die Aufgaben zu DIESEM Text. Beziehe dich auf seinen Inhalt, nicht auf einen gedachten anderen.',
    '- Zitiere in Aufgaben und Loesungen nur mit Zeilenangabe („Z. 4–7"), nicht durch Abschreiben laengerer Stellen.',
    '- Schreibe keine Aufgabe, die etwas verlangt, was in diesem Text nicht steht.'
  ].join('\n')
}

/** Material der Lehrkraft als Text (Bilder werden separat übergeben). */
export function materialText(sources: SourceMaterial[]): string {
  const used = sources.filter((s) => s.useAsBasis)
  if (!used.length) return ''
  return [
    'MATERIAL DER LEHRKRAFT (als Grundlage nutzen; längere Passagen nicht wörtlich übernehmen, sondern altersgerecht bearbeiten und die Quelle angeben):',
    ...used.map((s, i) =>
      s.text
        ? `--- Material ${i + 1}: ${s.fileName}${s.format === 'html' ? ' (als HTML)' : ''} ---\n${s.text}`
        : `--- Material ${i + 1}: ${s.fileName} (als Bild beigefügt) ---`
    )
  ].join('\n\n')
}

export function materialImages(sources: SourceMaterial[]): string[] {
  return sources.filter((s) => s.useAsBasis).flatMap((s) => s.pageImages)
}

/** Bilder aus dem Material, die ins Blatt übernommen werden dürfen. */
export function embeddableImages(sources: SourceMaterial[]): { index: number; fileName: string; dataUrl: string }[] {
  return sources
    .filter((s) => s.embedImage && s.kind === 'image' && s.pageImages[0])
    .map((s, index) => ({
      index,
      fileName: s.fileName,
      dataUrl: s.pageImages[0]
    }))
}

export const MATERIAL_WARN_CHARS = 80_000

// ---------- Bilder, Lernpsychologie, Fachmethoden ----------

/**
 * Wie viele Bilder ein Blatt bekommt und wofür sie da sind.
 *
 * Die inhaltlichen Regeln stehen in didactics/imageDesign.ts, zusammen mit den Belegen.
 * Hier bleibt nur, was die Platzierung im Blatt betrifft (imageRole).
 */
export function imageRules(meta: WorksheetMeta): string {
  return [
    imageDesignRules(meta),
    '',
    /*
     * Seitliche Anordnung. Sie spart echten Platz: Neben einem Bild oder einer Tabelle
     * stehen Aufgabe und Schreiblinien, darunter laufen sie in voller Breite weiter.
     */
    'ANORDNUNG – setze sie in blockSide (gilt für Bilder UND Tabellen):',
    '- "left" oder "right": Der Baustein steht seitlich, der FOLGENDE Baustein (Aufgabe, Text, Merkkasten) steht daneben und läuft darunter in voller Breite weiter. Sinnvoll bei einem Bild oder einer Tabelle, auf die sich die Aufgabe bezieht – besonders neben Schreiblinien.',
    '- "none": untereinander. Richtig für breite Tabellen (ab vier Spalten), Bildreihen und alles, was ausgewertet wird und Fläche braucht.',
    '- "auto": Die App entscheidet. Im Zweifel "auto".',
    '',
    'PLATZ AUF DEM BLATT – setze ihn in imageRole:',
    '- "material": Bild, mit dem gearbeitet wird. Steht als eigener Baustein VOR den zugehörigen Aufgaben.',
    '- "illustration": Verständnisbild zu einem Text oder einer Aufgabe. Steht direkt VOR dem Baustein, zu dem es gehört; die App setzt es daneben, der Text fließt darum.',
    '- "motivation": kleines Bild am Einstieg.',
    '- Bildreihen (imageItems) für mehrere Motive zum Zuordnen, Benennen oder Ordnen.',
    '',
    'DRUCK UND LESBARKEIT:',
    '- Das Blatt wird in Graustufen vervielfältigt: Farbe darf nie der einzige Träger einer Unterscheidung sein. Wo Farbe unterscheidet, kommt ein zweites Merkmal dazu (Form, Schraffur, Beschriftung, Linienart).',
    '- Stelle nie Rot gegen Grün.',
    '- Schreibe keinen Text über ein Bild oder einen Farbverlauf.'
  ].join('\n')
}

/**
 * Lernwirksame Gestaltung (Cognitive Load, gelöste Beispiele, Üben).
 * Die Regeln richten sich nach der Art des Arbeitsblatts.
 */
export function learningDesignRules(meta: WorksheetMeta): string {
  const practice = meta.sheetType === 'uebung' || meta.sheetType === 'wiederholung' || meta.sheetType === 'hausaufgabe'
  return [
    'LERNWIRKSAME GESTALTUNG:',
    '- Kurze Sinnabschnitte mit Zwischenüberschriften; je Abschnitt höchstens zwei fett hervorgehobene Begriffe.',
    '- Bild und zugehörige Erklärung stehen beieinander; derselbe Inhalt wird nicht doppelt in Text und Bild ausformuliert.',
    meta.sheetType === 'erarbeitung' || meta.sheetType === 'lesetext'
      ? '- Neues Verfahren: genau ein vollständig gelöstes Beispiel mit nummerierten Schritten voranstellen; danach die Hilfen verblassen lassen (erst Lückenlösung, dann Schrittgerüst, dann frei).'
      : '',
    practice
      ? '- Übung: Aufgabentypen mischen statt blockweise zu sortieren, etwa ein Drittel der Aufgaben wiederholt frühere Inhalte, und eine Aufgabe wird aus dem Gedächtnis ohne Hilfsmittel gelöst.'
      : '',
    '- Zu jeder Aufgabe eine realistische Minutenangabe; die Summe passt zur angegebenen Bearbeitungszeit.',
    '- Einstieg mit einer echten Frage, einem Widerspruch oder einem Alltagsphänomen, das zum Lernziel führt – keine Anekdote ohne Bezug.',
    '- Höchstens eine Wahlmöglichkeit je Blatt, dann mit drei bis fünf Optionen.',
    meta.grade <= 4
      ? '- Grundschule: konkrete Dinge und Handlungen, kurze Textmengen, viel Platz zum Schreiben und Malen.'
      : meta.grade <= 10
        ? '- Sekundarstufe I: Alltag und Lebenswelt der Jugendlichen aufgreifen; die erste Aufgabe schaffen alle.'
        : '- Oberstufe: gesellschaftliche Relevanz, Kontroversen, Studien- und Berufsbezug; fachliche Tiefe statt Verpackung.'
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Sprachliche Hilfen (sprachsensibler Fachunterricht nach Leisen, Wortspeicher mit Artikel,
 * Satzanfänge zum Operator, Textsortengerüste, gestufter Abbau der Hilfen).
 */
export function scaffoldRules(meta: WorksheetMeta): string {
  return [
    'SPRACHLICHE HILFEN:',
    '- Fachwörter bei der ersten Nennung in einem kurzen Satz erklären und für denselben Sachverhalt durchgehend dasselbe Wort verwenden (keine Synonyme).',
    '- Wortspeicher mit Artikel und Pluralform; wo es passt, Alltagssprache und Fachsprache nebeneinanderstellen.',
    '- Zu Schreib- und Sprechaufgaben drei bis fünf Satzanfänge anbieten, die zum Operator passen (erklären: „Das liegt daran, dass …"; begründen: „Dafür spricht, dass …"; vergleichen: „Beide … haben gemeinsam, dass …").',
    '- Für Textsorten ein Gerüst vorgeben: Versuchsprotokoll (Frage, Vermutung, Material, Durchführung, Beobachtung, Ergebnis), Quelleninterpretation (Einordnung, Inhalt, Deutung, Bewertung), Erörterung (These, Argument, Beleg, Beispiel, Schluss).',
    '- Aktiv statt Passiv, Verben statt Nominalisierungen, keine doppelten Verneinungen, keine Redewendungen.',
    meta.differentiation.levels > 1
      ? '- Hilfen stufenweise abbauen: ★ vollständiges Satzmuster, ★★ nur Satzanfänge, ★★★ nur Wortspeicher oder freie Formulierung.'
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** Fachtypische Arbeitsweisen mit Material (Quellenarbeit, Experiment, Textanalyse …). */
/** Operatorenliste des Fachs als Vorgabe (mit Anforderungsbereich, wo das Fach ihn festlegt). */
export function operatorRules(meta: WorksheetMeta, foreignLanguage?: string): string {
  const ops = subjectOperators(meta.subjectId, foreignLanguage)
  if (!ops) return ''
  const byAfb: Record<string, string[]> = { I: [], II: [], III: [], offen: [] }
  for (const [op, afb] of Object.entries(ops.afb)) byAfb[afb ?? 'offen'].push(op)
  /*
   * Bilingual: Die Aufgaben stehen in der Arbeitssprache. Stünde hier die deutsche Liste mit
   * „genau einem Operator aus dieser Liste", widerspräche sie der bilingualen Regel – und die
   * KI entschiede selbst, welche von beiden gilt. Die belegte zielsprachliche Liste ersetzt
   * deshalb die deutsche; die AFB-Zuordnung bleibt dieselbe.
   */
  const bilingual = bilingualAktiv(meta) && meta.bilingual!.pruefsprache !== 'deutsch' ? operatorenFuer(meta.bilingual!.sprache) : null
  const lines = bilingual
    ? (['I', 'II', 'III'] as const).map(
        (a) =>
          `- Anforderungsbereich ${a}: ${bilingual
            .filter((o) => o.afb === a)
            .map((o) => `${o.ziel} (${o.de})`)
            .join(', ')}.`
      )
    : ops.targetLanguage || byAfb.offen.length
      ? [`- Zulässige Operatoren: ${byAfb.offen.join(', ')}.`]
      : (['I', 'II', 'III'] as const).map((a) => `- Anforderungsbereich ${a}: ${byAfb[a].join(', ')}.`)
  return [
    `OPERATOREN (${meta.subjectLabel}):`,
    ...lines,
    ops.note ? `- ${ops.note}` : '',
    bilingual && meta.bilingual!.pruefsprache === 'gemischt' ? '- Aufgaben auf Deutsch verwenden die deutsche Entsprechung in Klammern.' : '',
    '- Jede Aufgabe beginnt mit genau einem Operator aus dieser Liste; keine Umschreibungen wie „Beschäftige dich mit".',
    '- Jede Aufgabe nennt das Material ausdrücklich (z. B. „anhand von M1", „mithilfe der Tabelle").',
    '- MATERIALNUMMERN VERGIBT DIE APP: Sie nummeriert Texte, Bilder, Tabellen und Raster in der Reihenfolge der Bausteine als M1, M2, M3 … Schreibe selbst KEINE Nummer in den Titel und verweise nur auf Nummern, die es nach dieser Zählung wirklich gibt (bei zwei Materialien also höchstens M2).',
    '- Vergleichsmaterial: Zählt das Material zwei Dinge/Personen auf, stehen die Merkmale NICHT in derselben Reihenfolge – sonst lässt sich der Vergleich durch Abgleichen der Position lösen, statt durch Vergleichen. Zahl und Auswahl der Merkmale dürfen sich ebenfalls unterscheiden.',
    '- Schwerpunkt im Anforderungsbereich II; Bereich I stärker gewichtet als Bereich III; alle drei Bereiche kommen vor.',
    // Beide Regeln setzen mehrere Aufgaben voraus – bei genau einer widersprächen sie der Vorgabe
    wantedTasks(meta) === 1
      ? ''
      : '- Die letzte oder vorletzte Aufgabe sichert das Ergebnis (zusammenfassen, Tabelle ausfüllen, Merksatz formulieren) und beantwortet die Leitfrage des Einstiegs.',
    wantedTasks(meta) === 1 ? '' : '- Mindestens zwei verschiedene Aufgabenformate; mindestens eine offene Aufgabe.',
    '- Arbeitsanweisungen mit höchstens 25 Wörtern und nur einem Arbeitsauftrag je Nummer.'
  ]
    .filter(Boolean)
    .join('\n')
}

export function subjectMethodRules(meta: WorksheetMeta): string {
  const id = meta.subjectId
  const rules: Record<string, string[]> = {
    geschichte: [
      'Jede Quelle bekommt eine vollständige Angabe (Urheber, Jahr, Quellenart, Adressat, Fundort); Quelle und Darstellung sind klar unterschieden.',
      'Reihenfolge der Quellenaufgaben: W-Fragen (Wer? Wann? Für wen? Warum?) – Inhalt – Einordnung – Beurteilung der Absicht.',
      'Bildquellen und Karikaturen: erst genau beschreiben, dann Symbole deuten, zuletzt Wirkung und Absicht beurteilen.'
    ],
    politik: ['Kontroverse Positionen gegenüberstellen (Beutelsbacher Konsens): mindestens zwei Sichtweisen mit Belegen, eigene Urteilsbildung am Schluss.'],
    biologie: ['Erkenntnisweg: Frage – Hypothese („Wenn …, dann …") – Beobachtung – Deutung; Beobachtung und Deutung stehen in getrennten Feldern.'],
    chemie: [
      'Erkenntnisweg: Frage – Hypothese („Wenn …, dann …") – Beobachtung – Deutung; Beobachtung und Deutung stehen in getrennten Feldern; Sicherheitshinweise beachten.'
    ],
    physik: [
      'Erkenntnisweg: Frage – Hypothese („Wenn …, dann …") – Beobachtung – Deutung; bei Diagrammen: Achsen benennen, Verlauf beschreiben, Auffälligkeiten mit Zahlen belegen, dann erklären.'
    ],
    mathematik: [
      'Sachaufgaben in Schritten: Annahmen benennen – Modell aufstellen – rechnen – Ergebnis im Sachzusammenhang deuten und auf Plausibilität prüfen.',
      'Mindestens eine Aufgabe verlangt einen Darstellungswechsel (Text, Term, Tabelle, Graph, Skizze).'
    ],
    deutsch: [
      'Textanalyse beginnt mit einem Einleitungssatz (Autor, Titel, Textsorte, Jahr, Thema); Inhalt im Präsens.',
      'Zu sprachlichen Mitteln immer Beleg mit Zeilenangabe und Funktion verlangen – eine bloße Aufzählung gilt nicht als Lösung.'
    ],
    erdkunde: [
      'Kartenarbeit in der Folge: Titel, Legende und Maßstab auswerten – Verteilung beschreiben – Ursachen erklären – bewerten; Kartenquelle angeben.'
    ],
    kunst: ['Dreischritt einhalten: erst sachlich beschreiben, dann analysieren, dann deuten; jede Deutung wird am Werk belegt.'],
    musik: ['Gestufte Höraufträge mit je einem Fokus; erst Wirkung beschreiben, dann die musikalischen Mittel benennen, die sie erzeugen.'],
    latein: ['Übersetzungs- und Interpretationsaufgaben trennen; Wortschatz- und Formenhilfen direkt am Text anbieten.'],
    sport: ['Bewegungsabläufe in Phasen gliedern und mit Beobachtungskriterien versehen (was ist woran zu erkennen).'],
    religion: ['Positionen und Perspektiven gegenüberstellen; die eigene Urteilsfrage steht am Ende, nicht am Anfang.']
  }
  const list = rules[id]
  return list ? `FACHLICHE ARBEITSWEISE:\n${list.map((r) => `- ${r}`).join('\n')}` : ''
}

// ---------- Gitternetze ----------

/** Fächer, in denen vorgegebene Zeichenflächen zum Handwerk gehören */
const GRID_SUBJECTS: Record<string, string> = {
  mathematik: 'Graphen, Wertepaare, geometrische Zeichnungen',
  physik: 'Messreihen auftragen, Diagramme auswerten',
  chemie: 'Messreihen und Titrationskurven auftragen',
  biologie: 'Messreihen und Wachstumskurven auftragen',
  erdkunde: 'Klimadiagramme, Bevölkerungs- und Wirtschaftsdiagramme',
  informatik: 'Laufzeiten und Wertetabellen als Graph',
  sachunterricht: 'einfache Säulendiagramme, Wetterbeobachtungen'
}

/**
 * Vorgegebene Zeichenflächen (Baustein „grid"). Ohne Raster zeichnen Lernende Achsen
 * ohne Maßstab; ein vorbereitetes Gitternetz macht Ergebnisse vergleichbar und korrigierbar.
 */
export function gridRules(meta: WorksheetMeta): string {
  const use = GRID_SUBJECTS[meta.subjectId]
  if (!use) return ''
  return [
    `GITTERNETZE (Baustein „grid") – in ${meta.subjectLabel} für: ${use}.`,
    '- Setze das Gitternetz IMMER direkt hinter die Aufgabe, für die gezeichnet wird; die Aufgabe selbst bekommt dann answer.kind = "none".',
    '- variant wählen: "koordinaten" (Graph oder Wertepaare eintragen), "mm" (Messwerte genau auftragen), "klima" (Klimadiagramm), "karo" (Skizze, Rechnung, einfaches Säulendiagramm).',
    '- Bei "koordinaten" und "klima" die Achsen vollständig angeben: xLabel und yLabel mit Einheit (z. B. „Zeit t in s", „Weg s in m"), xMin/xMax/xStep und yMin/yMax/yStep.',
    '- xStep und yStep sind der Wert je Kästchen. Wähle sie so, dass alle Werte der Aufgabe hineinpassen und glatt abzulesen sind (1, 2, 5, 10 … je Kästchen), und dass höchstens 30 Kästchen je Achse nötig sind.',
    '- Klimadiagramm: yMin/yMax/yStep für die Temperatur angeben (üblich −10 bis 40 °C in 10er-Schritten). Die Niederschlagsachse setzt die App im Verhältnis 1 : 2 dazu (10 °C entsprechen 20 mm), die zwölf Monate stehen automatisch an der x-Achse.',
    '- heightMm: 60–90 mm, bei Millimeterpapier bis 100 mm.',
    '- caption nutzen, wenn der Maßstab erklärt werden muss („1 Kästchen = 2 Jahre").',
    '- Kein Gitternetz, wenn geschrieben und nicht gezeichnet wird – dafür gibt es Schreiblinien.'
  ].join('\n')
}

// ---------- Fremdsprachen: Sprachmittlung, Schreiben, Hörverstehen ----------

/** Textlänge und Umfang je GER-Niveau (Ausgangstext / Schreibprodukt / Hörtext). */
function skillSizes(level: string): {
  source: number
  words: number
  listenSeconds: number
} {
  if (level.startsWith('A1')) return { source: 80, words: 60, listenSeconds: 60 }
  if (level.startsWith('A2')) return { source: 120, words: 90, listenSeconds: 90 }
  if (level.startsWith('B1')) return { source: 180, words: 140, listenSeconds: 120 }
  if (level.startsWith('B2')) return { source: 270, words: 200, listenSeconds: 180 }
  return { source: 350, words: 250, listenSeconds: 240 }
}

/**
 * Erwarteter Umfang des Schülertextes in Wörtern.
 *
 * Eigene Vorgabe der Lehrkraft, sonst der Wert des GER-Niveaus. Planungswert für die Zahl
 * der Schreiblinien und den Erwartungshorizont; auf dem Blatt steht er nur, wenn die
 * Wortvorgabe eingeschaltet ist.
 */
export function writingWords(meta: WorksheetMeta): number {
  const chosen = meta.studentWords ?? 0
  return chosen > 0 ? chosen : skillSizes(meta.cefrLevel).words
}

/** Grenzen des Schiebereglers für den Umfang des Schülertextes */
export const STUDENT_WORDS = { min: 40, max: 400, step: 10 }

/** Grenzen des Schiebereglers für den Umfang des Ausgangstextes */
export const MATERIAL_WORDS = { min: 50, max: 600, step: 10 }

/** Wortzahl des Ausgangstextes: eigene Vorgabe der Lehrkraft, sonst der Wert des GER-Niveaus. */
export function sourceTextWords(meta: WorksheetMeta): number {
  const auto = skillSizes(meta.cefrLevel).source
  const chosen = meta.materialWords ?? 0
  return chosen > 0 ? chosen : auto
}

/**
 * Kontextbindung: Sprachmittlung und Schreiben sind immer situiert. Die Arbeitsanweisung
 * selbst erzählt die Situation – wer schreibt, an wen, aus welchem Anlass und wozu.
 */
export function contextRules(meta: WorksheetMeta): string {
  const target = meta.subjectLabel
  return [
    'KONTEXTBINDUNG (gilt für Sprachmittlung UND Schreiben):',
    /*
     * Gemeldet von der Lehrkraft (24.09.2026) zu einer Sprachmittlungsaufgabe: Die Situation
     * stand ZWEIMAL auf dem Blatt – einmal als Vorspann, einmal noch einmal in der
     * Arbeitsanweisung. „diese beiden abschnitte muessen sinnvoll und nicht ueberfrachtet
     * gebuendelt werden."
     *
     * Die Ursache waren zwei Regeln, die dasselbe an zwei Stellen verlangten. Deshalb steht
     * die Arbeitsteilung jetzt ausdruecklich hier – und zwar zuerst.
     */
    'DIE SITUATION STEHT GENAU EINMAL. Teile dir die Arbeit so auf:',
    `- brief.situation: die Lage – wer du bist, was der Anlass ist, an wen der Text geht. Zwei bis drei Sätze auf ${target}. Das ist der Vorspann auf dem Blatt.`,
    `- instruction: der AUFTRAG. Beginnt mit dem Operator, nennt die Textsorte und was inhaltlich zu leisten ist. EIN Satz, höchstens zwei.`,
    '- Die Arbeitsanweisung nennt das Material, auf das sie sich bezieht („… based on M1", „… mit Hilfe von M1 und M2"). Die App vergibt die Nummern; verweise nur auf Material, das es gibt.',
    '- Die Arbeitsanweisung wiederholt die Situation NICHT. Sie greift sie höchstens mit einem Halbsatz auf („In your article, …"), nennt aber nicht noch einmal Rolle, Anlass und Adressat.',
    '- Muster für das Zusammenspiel: brief.situation = „You are a member of your school website’s editorial team. Your British partner school is preparing a Shakespeare festival and wants to learn how German theatre reinterprets Macbeth." · instruction = „Write an article for your school website presenting the Hohenbrück production, and consider what makes it relevant for young audiences."',
    '- Verboten ist der nackte Operator ohne jede Situation („Schreibe einen Text über …") ebenso wie die doppelte Situierung.',
    '- Der Ausgangstext wird im Kontext eingeführt („You have found this article …", „Your host family sent you this leaflet …"), damit klar ist, woher die Informationen kommen.',
    '- Der Anlass ist glaubhaft und altersgemäß: Austauschpartner, Gastfamilie, Schulprojekt, Praktikum, Ferien- oder Vereinsplanung, Schülerzeitung, Forum, Nachbarschaft. Keine erfundenen Behörden und keine künstlichen Prüfungssituationen.',
    '- Aus dem Anlass ergibt sich die Auswahl: Der Auftrag sagt, was der Adressat wissen will; nur das gehört in den Text.',
    '- Der Kontext steht in brief.situation, nicht in einem eigenen Baustein, und wiederholt nicht den Inhalt des Ausgangstextes.',
    studentTextTypeRule(meta)
  ].join('\n')
}

/**
 * Textsorten, in denen die Lernenden ihren eigenen Text schreiben.
 * Die Auswahl steuert brief.textType und damit auch die geforderten Textsortenmerkmale.
 */
export const STUDENT_TEXT_TYPES: {
  value: string
  label: string
  english: string
}[] = [
  { value: '', label: 'KI wählt passend zur Situation', english: '' },
  { value: 'email', label: 'E-Mail', english: 'email' },
  { value: 'letter', label: 'Brief', english: 'letter' },
  {
    value: 'article',
    label: 'Artikel (Schülerzeitung, Website)',
    english: 'article for the school website'
  },
  { value: 'blog', label: 'Blogbeitrag', english: 'blog post' },
  { value: 'forum', label: 'Forumsbeitrag / Kommentar', english: 'forum post' },
  { value: 'report', label: 'Bericht', english: 'report' },
  { value: 'speech', label: 'Rede', english: 'speech' },
  { value: 'leaflet', label: 'Flyer / Infoblatt', english: 'leaflet' },
  { value: 'message', label: 'Nachricht / Chat', english: 'message' },
  { value: 'diary', label: 'Tagebucheintrag', english: 'diary entry' },
  { value: 'review', label: 'Rezension / Empfehlung', english: 'review' }
]

/** Vorgegebene Textsorte des Schülertextes, falls die Lehrkraft eine gewählt hat. */
export function studentTextTypeRule(meta: WorksheetMeta): string {
  const chosen = STUDENT_TEXT_TYPES.find((t) => t.value === meta.studentTextType && t.value)
  if (!chosen) return '- Die Textsorte ergibt sich aus der Situation; wähle die, die im Alltag wirklich benutzt würde.'
  return `- TEXTSORTE VORGEGEBEN: Die Lernenden schreiben „${chosen.label}" (brief.textType = "${chosen.english}"). Die Situation muss zu dieser Textsorte passen, und die Aufgabe verlangt deren Merkmale.`
}

/**
 * Vorgaben, Notizentabelle und Erwartungshorizont einer Schreibaufgabe.
 *
 * Aufbau und Wortlaut folgen den amtlichen Abschlussprüfungen, die alle dieselbe Form haben
 * (Bayern Abschlussprüfung Realschule „Guided Writing", ZP10 Nordrhein-Westfalen, Mittlere
 * Reife Mecklenburg-Vorpommern): Situierung, Inhaltspunkte, Umfang, Formvorgaben.
 *
 * ZWEI BEFUNDE AUS DER RECHERCHE, die hier Regeln geworden sind:
 *
 * 1. Die Inhaltspunkte sind in den Prüfungen eine SPIEGELSTRICHLISTE. Eine zweispaltige
 *    Notizentabelle mit offenen Impulsen („Positives: …") ist in keiner eingesehenen
 *    amtlichen Aufgabe belegt – sie ist im Unterricht verbreitet und eine legitime
 *    Darstellungsvariante derselben Sache, aber nichts, was die App als Prüfungsstandard
 *    ausgeben dürfte. Deshalb entscheidet die Zahl der Inhaltspunkte über die Form.
 *
 * 2. Der Erwartungshorizont ist in Nordrhein-Westfalen und Bayern gleich gebaut: ein
 *    ÜBERGEORDNETES Kriterium je Aspekt, darunter ausdrücklich nicht verbindliche
 *    Beispiele. Die Ausarbeitungstiefe ist in Bayern operationalisiert und deshalb
 *    übernommen: erwähnt (keine Punkte) – beinhaltet (ein eigener Gedanke) – ausgearbeitet
 *    (zwei) – voll ausgearbeitet (drei).
 */
export function writingBriefRules(meta: WorksheetMeta): string {
  const target = meta.subjectLabel
  return [
    'SCHREIBAUFGABE – VORGABEN UND ERWARTUNGSHORIZONT (task mit skill = "writing"):',
    `- brief.situation: zwei bis drei Sätze auf ${target}, die Rolle, Anlass und Adressat erzählen. Sie stehen als Vorspann auf dem Blatt – und NUR dort. Die Arbeitsanweisung wiederholt sie nicht.`,
    '- brief.points: die Inhaltspunkte, die der Text abdecken muss – drei bis fünf, jeder mit einem eigenen Operator (describe, explain, evaluate, suggest …).',
    meta.writingNotes
      ? '- brief.notes: PFLICHT. Genau zwei Spalten mit sprechenden Überschriften, je fünf bis acht Stichpunkten (2–6 Wörter, KEINE ganzen Sätze) und ein bis zwei offenen Impulsen zum Selbstausfüllen („Positives: …“, „Problems: …“). Die Stichpunkte liefern den Stoff, aus dem der Text entsteht – sie benutzen NICHT dieselben Worte wie die Inhaltspunkte.'
      : '- brief.notes: leer lassen. Die Inhaltspunkte stehen als Spiegelstrichliste – das ist das Format der Abschlussprüfungen.',
    '- Die Stichpunkte sind ANGEBOT, nicht Pflicht. Der Auftrag sagt das ausdrücklich („Use the notes below and add some of your own ideas. You do not have to use all the information.").',
    '- brief.form: Formvorgaben, die man sehen kann – Überschrift, Zwischenüberschriften, Anrede, Grußformel. Keine Bewertungshinweise.',
    '',
    'ERWARTUNGSHORIZONT (brief.expected) – nur für die Lehrkraft, nie auf dem Schülerblatt:',
    '- Eine Zeile je Inhaltspunkt, in derselben Reihenfolge. aspect = der Inhaltspunkt mit seinem Operator.',
    '- criterion = das übergeordnete Kriterium: was der Text leisten muss, damit der Aspekt erfüllt ist. Ein Satz, kein Stichwort.',
    '- Maßstab für die Ausarbeitungstiefe: Ein Inhaltspunkt ist BEINHALTET, wenn ein eigener Gedanke oder ein stützendes Detail dazukommt; AUSGEARBEITET bei zwei, VOLL AUSGEARBEITET bei drei. Das bloße Wiederholen der Vorgabe zählt nicht.',
    '- examples = PFLICHT: MINDESTENS ZWEI Beispiellösungen je Zeile, kurz und konkret in der Zielsprache, so wie eine Schülerin es schreiben würde (nicht „nennt zwei Ideen", sondern „more trees along the streets"). Sie sind ausdrücklich NICHT verbindlich; die App schreibt das auf das Lösungsblatt. Eine Zeile ohne Beispiele ist unvollständig.',
    '- points = Punkte für den Aspekt, zusammen etwa zwei Drittel der Aufgabenpunkte. Das restliche Drittel trägt die Sprache; die Gewichtung von Inhalt zu Sprache reicht in den Ländern von 23:77 (Bayern) bis 42:58 (Nordrhein-Westfalen).',
    '- brief.criteria: die sprachlichen Kriterien, getrennt nach Ausdrucksvermögen und Textaufbau einerseits, sprachlicher Korrektheit andererseits.',
    `- brief.words = ${writingWords(meta)}. Inhaltspunkte, Schreibraum und Mustertext richten sich nach diesem Umfang.`,
    `- brief.model: ein ausformulierter Mustertext auf ${target}, der die Textsorte einhält und ungefähr ${writingWords(meta)} Wörter lang ist. Er zeigt der Lehrkraft, was sie erwartet – die Lernenden sehen ihn nicht.`
  ].join('\n')
}

/** Ob die Aufgabe den Lernenden eine Wortzahl nennt (Auswahl in Schritt 1). */
/**
 * Umfangsangaben sind RICHTWERTE, keine Obergrenzen.
 *
 * Wunsch der Lehrkraft (24.09.2026): Seitenzahl, Umfang des Schülertextes und Umfang des
 * Ausgangstextes sollen ein Vorschlag sein, der erhöht werden darf, „wenn der Aufgaben- und
 * Materialumfang dies erfordert".
 *
 * Der Grund leuchtet ein: Eine Quelle lässt sich nicht auf 200 Wörter kürzen, ohne ihren
 * Sinn zu verlieren, und vier Inhaltspunkte brauchen mehr als 120 Wörter. Wer die Zahl
 * erzwingt, bekommt entweder ein überfülltes Blatt oder eine verstümmelte Aufgabe.
 *
 * Nach OBEN offen, nach unten nicht: Weniger als gewünscht wäre keine Hilfe, sondern eine
 * stillschweigende Kürzung. Und jede Abweichung wird BEGRÜNDET – sonst merkt die Lehrkraft
 * erst beim Ausdrucken, dass aus zwei Seiten vier geworden sind.
 */
export function umfangRegeln(meta: WorksheetMeta): string {
  return [
    'UMFANG – RICHTWERTE, KEINE OBERGRENZEN:',
    `- Seitenzahl (${meta.pages}), Umfang des Schülertextes und Umfang des Ausgangstextes sind VORSCHLÄGE. Verlangt der Inhalt mehr, darfst du darüber hinausgehen.`,
    '- Überschreite nur, wenn es die Sache verlangt: eine Quelle, die sich nicht sinnvoll kürzen lässt; Inhaltspunkte, die in der vorgegebenen Wortzahl nicht zu behandeln sind; Material, das sonst unleserlich klein würde.',
    '- Höchstens EINE Seite mehr als vorgegeben, und höchstens ein Viertel mehr Wörter. Darüber hinaus kürze lieber die Aufgabenstellung.',
    '- UNTERSCHREITE die Vorgaben nicht. Weniger wäre keine Hilfe, sondern eine stillschweigende Kürzung.',
    '- Jede Abweichung gehört in teacherNote, mit Grund und Zahl: „Drei statt zwei Seiten: Der Originalauszug umfasst 480 Wörter und lässt sich nicht kürzen."'
  ].join('\n')
}

export function wordLimitRule(meta: WorksheetMeta): string {
  if (meta.wordLimit) {
    return ['UMFANGSANGABE:', '- Die Arbeitsanweisung nennt am Ende die erwartete Wortzahl („Write about 120 words.").'].join('\n')
  }
  return [
    'UMFANGSANGABE:',
    '- Die Arbeitsanweisung nennt KEINE Wortzahl. Schreibe weder „ca. 120 Wörter" noch „about 120 words" oder „(120–150 words)" hinein.',
    '- Der Umfang ergibt sich für die Lernenden aus den Inhaltspunkten und dem Schreibraum auf dem Blatt.',
    '- brief.words füllst du trotzdem aus: Der Wert dient nur der Planung (Zahl der Schreiblinien und Erwartungshorizont) und erscheint nicht auf dem Schülerblatt.'
  ].join('\n')
}

/**
 * Vorgaben für den Hörtext selbst: Textsorte, Länge, Tempo, Sprecher, Merkmale gesprochener Sprache.
 *
 * Die Länge, die Zahl der Durchgänge und die Item-Zahlen sind aus den Prüfungsvorgaben belegt
 * (QUA-LiS NRW, Abiturhinweise MV und SH, DELF, Cambridge). Das Sprechtempo ist eine Faustregel –
 * GER und KMK beschreiben es nur qualitativ (siehe didactics/listeningFormats.ts).
 */
export function listeningTextRules(meta: WorksheetMeta): string {
  const level = meta.cefrLevel
  const rules = listeningRules(level)
  const language = subjectById(meta.subjectId).foreignLanguage
  const [minWords, maxWords] = listeningWords(level, language, meta.audioSeconds)
  const [minSec, maxSec] = listeningSeconds(level, meta.audioSeconds)
  const count = listeningCount(meta)
  const chosen = meta.audioFormat && meta.audioFormat !== 'auto' ? listeningFormatById(meta.audioFormat) : undefined
  const possible = listeningFormatsFor(level)
  return [
    count > 1 ? `- ANZAHL: Das Blatt hat ${count} Hörtexte. Alles Folgende gilt für JEDEN von ihnen.` : '',
    chosen
      ? `- TEXTSORTE: ${chosen.label} (${chosen.english}), ${chosen.mode === 'dialog' ? 'dialogisch' : 'monologisch'}. Schreibe variant genau so: "${chosen.label}". ${chosen.construction}`
      : `- TEXTSORTE: Wähle eine, die zum Thema und zum Niveau passt, und schreibe sie in variant. Möglich sind: ${possible.map((f) => f.label).join(', ')}.${count > 1 ? ' Die Hörtexte haben UNTERSCHIEDLICHE Textsorten.' : ''}`,
    `- LÄNGE: ${minSec} bis ${maxSec} Sekunden je Hörtext, also rund ${minWords} bis ${maxWords} Wörter.${meta.audioSeconds ? ' Diese Länge hat die Lehrkraft vorgegeben.' : ''} Kein Hörtext ist länger als fünf Minuten.`,
    `- SPRECHENDE: ${rules.speakers[0]} bis ${rules.speakers[1]}. Sie sind klar zu unterscheiden (Rolle, Alter, Geschlecht) und werden zu Beginn eingeführt.`,
    `- Merkmale gesprochener Sprache: ${rules.hesitations === 'keine' ? 'keine Verzögerungslaute; dafür Redundanz – jede Schlüsselinformation kommt ein zweites Mal in anderer Formulierung vor' : rules.hesitations === 'vereinzelt' ? 'vereinzelt Verzögerungen („well …“) und eine Selbstkorrektur; wichtige Angaben werden bestätigt' : 'Verzögerungen, Selbstkorrekturen, Einschübe und Rückgriffe wie in echter Rede'}.`,
    `- Die Erzähl- oder Gesprächsreihenfolge entspricht der tatsächlichen Reihenfolge der Ereignisse${levelAtLeast(level, 'B2') ? '; Rückblenden nur, wenn sie sprachlich markiert sind' : ''}.`,
    '- Zahlen, Uhrzeiten und Preise werden ausgeschrieben, wie man sie spricht („half past seven“, nicht „7:30“) – der Text wird vorgelesen.',
    '- Keine bedeutungstragenden Bilder, keine Ironie und kein Wortwitz: Beides lässt sich beim Hören nicht sicher erschließen (QUA-LiS NRW).',
    /*
     * Die Vorentlastung stand hier fest auf Deutsch – auch auf einem englischen Blatt, wo
     * sie mitten zwischen den zielsprachigen Aufgaben auffällt. Sie richtet sich nach
     * derselben Einstellung wie alle anderen Arbeitsanweisungen („Arbeitsanweisungen auf
     * Deutsch"); nur wenn die Lehrkraft die setzt, steht sie auf Deutsch.
     */
    `- VORENTLASTUNG (instruction des Bausteins): ein bis zwei Sätze ${
      meta.instructionsInGerman ? 'auf Deutsch' : `auf ${subjectById(meta.subjectId).label}`
    } mit Anlass, Zahl und Rolle der Sprechenden. Sie nimmt KEINE Information vorweg, mit der sich eine Aufgabe schon vor dem Hören lösen ließe.`,
    `- plays = ${rules.plays} (so oft wird der Text gehört).`,
    meta.itemCount && meta.itemCount > 0
      ? `- GENAU ${Math.round(meta.itemCount)} Items zu JEDEM Hörtext, über den ganzen Text verteilt und in der Reihenfolge des Textes. Die Lehrkraft hat diese Zahl vorgegeben.`
      : `- ${rules.items[0]} bis ${rules.items[1]} Items zum Hörtext, über den ganzen Text verteilt und in der Reihenfolge des Textes.`,
    count > 1
      ? '- REIHENFOLGE AUF DEM BLATT: erst Hörtext 1 mit ALLEN seinen Aufgaben, dann Hörtext 2 mit allen seinen Aufgaben, und so weiter. Aufgaben zu verschiedenen Hörtexten werden nicht vermischt, und keine Aufgabe bezieht sich auf zwei Hörtexte – außer einer abschließenden Aufgabe, die beide vergleicht und dann als letzte steht.'
      : '',
    // Was das Bundesland vorschreibt, geht den allgemeinen Regeln vor
    listeningStateRulesText(meta.stateId, stageForGrade(meta.grade, meta.schoolTypeId) === 'sek2' ? 'sek2' : 'sek1', meta.schoolTypeId)
  ].join('\n')
}

/**
 * Regeln für die drei Kompetenzbereiche, die auf einem Arbeitsblatt geübt werden können.
 * Grundlage: KMK-Bildungsstandards (Sprachmittlung gibt Adressat, Textsorte und inhaltlichen
 * Fokus vor; Hörvorlagen werden zweimal gehört und nicht mit Schreibaufgaben vermischt).
 */
export function languageSkillRules(meta: WorksheetMeta): string {
  const subject = subjectById(meta.subjectId)
  if (!subject.foreignLanguage) return ''
  const size = skillSizes(meta.cefrLevel)
  const target = meta.subjectLabel
  const sourceWords = sourceTextWords(meta)
  return [
    contextRules(meta),
    '',
    writingBriefRules(meta),
    '',
    'SPRACHMITTLUNG (task mit skill = "mediation"):',
    `- Eine Sprachmittlungsaufgabe besteht IMMER aus zwei Bausteinen: erst ein Baustein "text" mit dem deutschen Ausgangstext (language = "de"), dann genau eine Aufgabe, die auf ${target} zu schreiben ist.`,
    `- Der deutsche Ausgangstext ist ein Gebrauchstext (Zeitungsmeldung, Website, Broschüre, Aushang, Elternbrief, Forumsbeitrag), etwa ${sourceWords} Wörter lang (${Math.round(sourceWords * 0.85)}–${Math.round(sourceWords * 1.15)}), sachlich und selbst verfasst. Literarische oder stilistisch anspruchsvolle Texte sind als Vorlage ungeeignet.`,
    '- Eine Sprachmittlungsaufgabe je Blatt genügt; sie wird nicht in Teilaufgaben zerlegt.',
    '- Die Aufgabe ist eine kontextualisierte SCHREIBaufgabe. In brief stehen: situation (wer bin ich, was ist der Anlass), audience (an wen), textType (E-Mail, Blogbeitrag, Artikel, Brief …), purpose (informieren, beraten, überzeugen), words und points (die Inhaltspunkte, die der Adressat braucht).',
    '- Sinngemäß, nicht wörtlich: Es wird ausgewählt, zusammengefasst und für den Adressaten erklärt – nie Satz für Satz übersetzt. Was der Adressat nicht braucht, bleibt weg.',
    `- Typisch deutsche Begriffe (z. B. Abitur, Ausbildung, Bundesland, Pfand) werden IM SCHÜLERTEXT für den Adressaten erklärt, nicht nur übersetzt.`,
    `- HILFEN ZUM DEUTSCHEN TEXT STEHEN AUF ${target.toUpperCase()}: Der deutsche Ausgangstext bekommt KEINE deutschen Worterklärungen. Die Lernenden verstehen den deutschen Text; was ihnen fehlt, sind die zielsprachlichen Wörter.`,
    `- Nutze glossary des deutschen Textbausteins so: term = das deutsche Wort, explanation = die Entsprechung auf ${target} (bei Begriffen ohne Entsprechung eine kurze Umschreibung auf ${target}), z. B. „Pfand" → „deposit (money you get back when you return the bottle)".`,
    `- 6–10 solche Einträge genügen: genau das, was für die Wiedergabe schwierig ist. Sie stehen im glossary des Textes, NICHT als eigener Wortspeicher-Baustein – das Blatt besteht nur aus Text und Aufgabe.`,
    '- Verboten: „Übersetze den Text", Vokabellisten, Einzelsätze zum Übertragen, Fragen zum deutschen Text auf Deutsch.',
    /*
     * Gemeldet von der Lehrkraft (24.09.2026): „Im Erwartungshorizont sind Bewertungskriterien,
     * oben eine ‚Lösung', aber in der Lösung sind nur Dinge, die Schüler beachten sollten. Es ist
     * kein Beispieltext als Lösung vorhanden."
     *
     * Die Ursache stand genau hier: Für die Sprachmittlung war nur ein Erwartungshorizont
     * verlangt, der Mustertext ausdrücklich nur beim Schreiben. Beim Korrigieren einer
     * Sprachmittlung hilft eine Kriterienliste aber wenig – man muss sehen, wie eine
     * gelungene Wiedergabe tatsächlich klingt, um Auslassungen und Übersetzungsnähe zu
     * beurteilen. Die Sprachmittlung bekommt deshalb dieselben Lösungsteile wie das Schreiben.
     */
    '- brief.expected: Erwartungshorizont wie bei der Schreibaufgabe – eine Zeile je Inhaltspunkt mit criterion, MINDESTENS ZWEI Beispiellösungen und Punktzahl.',
    '- brief.criteria: die Bewertungskriterien (Inhaltliche Vollständigkeit, Adressatenbezug, sprachliche Angemessenheit und Korrektheit).',
    `- brief.model: PFLICHT. Ein vollständig ausformulierter Mustertext auf ${target} – die fertige Sprachmittlung, so wie eine gute Schülerin sie schreiben würde, mit Anrede und Grußformel bzw. den Merkmalen der geforderten Textsorte und etwa so lang wie gefordert. Keine Stichpunkte, keine Aufzählung dessen, was zu beachten wäre, sondern zusammenhängender Text. Er steht nur auf dem Lösungsblatt.`,
    `- solution: NUR ein kurzer Hinweis für die Lehrkraft (ein bis zwei Sätze, deutsch), dass die Formulierungen vom Mustertext abweichen dürfen und sinngemäße Wiedergabe zählt. Der ausformulierte Text gehört in brief.model, NICHT hierher – steht er in solution, fehlt er auf dem Lösungsblatt an der Stelle, an der die Lehrkraft ihn sucht.`,
    '',
    'SCHREIBEN (task mit skill = "writing"):',
    '- Eine einzelne Schreibaufgabe ist das ganze Blatt; die Inhaltspunkte stehen in brief.points, nicht als eigene Aufgaben, und die Aufgabe wird nicht in Teilaufgaben zerlegt.',
    `- Auch hier immer eine Situation statt eines Themas: brief mit situation, audience, textType, purpose, words (ca. ${size.words}) und 2–4 points als Gliederungsvorgabe.`,
    '- Die Textsorte bestimmt die Form: Anrede und Grußformel bei Brief und E-Mail, Überschrift und Absätze beim Artikel, Anrede des Publikums bei der Rede.',
    '- answer.kind = "lines"; count so wählen, dass der geforderte Umfang hineinpasst (etwa ein Zehntel der Wörterzahl an Linien).',
    '',
    wordLimitRule(meta),
    `- Bis B1 nennt die Aufgabe selbst die nötigen Redemittel (zwei bis vier Wendungen auf ${target} in der Arbeitsanweisung) – kein eigener Hilfe-Baustein.`,
    '- criteria in brief: 3–5 Kriterien für die Bewertung (Inhalt, Textsortenmerkmale, Sprache).',
    '',
    'HÖRVERSTEHEN (Baustein "audio" mit Aufgaben, die skill = "listening" tragen):',
    `- Der Baustein "audio" enthält in body das vollständige Skript in ${target}, in variant die Textsorte und in speakers die Sprechenden mit Namen.`,
    listeningTextRules(meta),
    `- Das Skript ist gesprochene Sprache: kurze Sätze, natürliche Wechsel, Rückfragen, Füllwörter – kein vorgelesener Sachtext.`,
    '- Sprecherzeilen im Skript als „Name: Text", je Sprecherwechsel eine neue Zeile.',
    '- plays = 2 (der Text wird zweimal gehört). instruction des Bausteins: ein Satz, worauf beim Hören zu achten ist (vor dem ersten Hören).',
    '- Die Aufgaben zum Hören müssen WÄHREND des Hörens auszufüllen sein: ankreuzen, zuordnen, Tabelle ergänzen, richtig/falsch, Stichworte notieren. Keine zusammenhängenden Texte schreiben, während gehört wird.',
    '- Die gefragten Informationen verteilen sich über den ganzen Text und kommen in der Reihenfolge des Textes vor; jede Antwort steht wörtlich oder sinngemäß im Skript.',
    '- Keine Fragen, die nur mit auswendig gemerktem Wortlaut zu lösen sind, und keine, die man ohne den Hörtext schon aus dem Vorwissen beantwortet.',
    '- Nach dem Hören darf eine weiterführende Aufgabe folgen (Meinung, Schreiben) – als eigene Aufgabe ohne skill = "listening".'
  ].join('\n')
}

/**
 * Beobachtungsauftrag zu einem Film oder Video.
 *
 * Die KI hat das Video nicht gesehen. Sie schreibt aus ihrem Wissen über den genannten
 * Titel – bei bekannten Filmen trägt das, bei einem beliebigen Netzvideo nicht. Deshalb
 * zwei Vorkehrungen im Auftrag: Beobachtungsaufträge werden so gebaut, dass sie auch dann
 * funktionieren, wenn eine Einzelheit anders ist, und jede aus dem Vorwissen stammende
 * Angabe wird im Lehrerhinweis als zu prüfen gekennzeichnet.
 */
export function videoRules(meta: WorksheetMeta): string {
  const v = meta.video
  if (!v?.title.trim()) return ''
  const kind = videoKindById(v.kind)
  const during = duringPolicy(v.kind, v.during)
  const { foci, sourced } = observationFoci(meta.subjectId)
  const section = sectionMinutes(meta.grade)
  const groups = v.groups > 1 ? Math.min(v.groups, 4) : 0
  const lines: string[] = [
    'FILM- UND VIDEOBEOBACHTUNG (verbindlich):',
    `- Das Blatt gehört zu: „${v.title}“${kind ? ` (${kind.label})` : ''}${v.minutes ? `, Laufzeit ${v.minutes} Minuten` : ''}${v.section ? `, gezeigter Abschnitt ${v.section}` : ''}.`,
    v.platform ? `- Herkunft: ${v.platform}.` : '',
    v.url ? `- Es liegt eine Adresse vor; die App druckt daraus QR-Code und Klartextlink. Schreibe die Adresse NICHT in einen Aufgabentext.` : '',
    v.summary.trim()
      ? `- Inhaltsangabe der Lehrkraft (verbindlich, sie hat das Video gesehen):\n${v.summary.trim()}`
      : '- Es liegt KEINE Inhaltsangabe vor. Stütze dich auf dein Wissen zu diesem Titel und baue die Aufträge so, dass sie auch dann tragen, wenn eine Einzelheit anders ist als erwartet (offene Beobachtungsraster statt Fragen nach genauen Einzelheiten).',
    '- Setze genau EINEN Baustein „video“ vor die Aufgaben dazu; er trägt Titel, Art, Laufzeit, Abschnitt und eine knappe Angabe, worum es geht (body).',
    '- Jede Aufgabe zum Video bekommt viewingPhase: "vor", "waehrend" oder "nach".',
    '',
    'DIE DREI PHASEN:',
    ...VIEWING_PHASES.map((p) => `- ${p.label}: ${p.purpose}`),
    '',
    'WÄHREND DES SEHENS:'
  ]
  if (during === 'keine') {
    lines.push(
      '- KEINE Aufgabe während des Sehens. ' + (kind?.reason ?? ''),
      '- Stattdessen: ein Beobachtungsauftrag VOR dem Sehen, der nur gelesen wird, und direkt danach eine Aufgabe, die die Eindrücke festhält.'
    )
  } else if (during === 'ankreuzen') {
    lines.push(
      '- Höchstens ZWEI Aufgaben während des Sehens, und nur mit ankreuzbaren Formaten: answer.kind = "trueFalse", "multipleChoice", "matching" oder "tableFill" mit kurzen Zellen.',
      '- Keine Freitextaufgabe während des Sehens: Wer schreibt, sieht nicht.',
      kind?.reason ? `- ${kind.reason}` : ''
    )
  } else {
    lines.push(
      '- Leitfragen während des Sehens sind erwünscht: kurze, klar prüfbare Fragen in der Reihenfolge des Videos.',
      '- Weise darauf hin, dass das Video zum Beantworten angehalten werden darf.',
      kind?.reason ? `- ${kind.reason}` : ''
    )
  }
  lines.push(
    '',
    'BEOBACHTUNGSAUFTRÄGE:',
    '- Ein Auftrag richtet sich auf EINEN Aspekt und ist so genau formuliert, dass man beim Sehen erkennt, wann er gemeint ist (nicht „achte auf die Kamera“, sondern „notiere, an welchen Stellen die Kamera von unten auf die Figur schaut“).',
    `- Mögliche Schwerpunkte für ${meta.subjectLabel}: ${foci.map((f) => `${f.label} – ${f.task}`).join('; ')}.`,
    sourced ? '' : '- Diese Schwerpunkte sind aus allgemeinen Grundsätzen abgeleitet; wähle, was zum Thema wirklich passt.',
    '',
    'FILMSPRACHE – so weit darf es in diesem Jahrgang gehen:',
    ...filmLanguageRules(meta.grade).map((r) => `- ${r}`)
  )
  if (groups) {
    lines.push(
      '',
      'ARBEITSTEILIGE BEOBACHTUNG:',
      `- Baue ${groups} Beobachtungsaufträge, je einen für die Gruppen ${GROUP_LABELS.slice(0, groups).join(', ')}; trage die Gruppe in observerGroup ein.`,
      '- Die Aufträge sind gleich anspruchsvoll, betreffen unterschiedliche Aspekte und lassen sich hinterher zu einem Gesamtbild zusammensetzen.',
      '- Alle übrigen Aufgaben bleiben ohne observerGroup – sie gelten für alle.',
      '- Die letzte Aufgabe nach dem Sehen trägt die Beobachtungen der Gruppen ausdrücklich zusammen.'
    )
  }
  lines.push(
    '',
    'ZEITMARKEN UND LEHRERHINWEIS:',
    v.timecodesOnSheet
      ? '- Zeitmarken dürfen bei den Aufgaben stehen (Feld timecode), z. B. „03:20“.'
      : '- Zeitmarken NICHT in die Arbeitsanweisung schreiben. Gemeinte Stellen inhaltlich benennen („ab der Szene, in der …“); Zeitmarken gehören in videoTeacherNote.',
    `- Schreibe in videoTeacherNote, welche Angaben aus deinem Wissen über den Titel stammen und am Video zu prüfen sind${
      v.summary.trim() ? '' : ' – ohne Inhaltsangabe gilt das für alle inhaltlichen Einzelheiten'
    }.`,
    `- Abschnittslänge am Stück in diesem Jahrgang: etwa ${section.range[0]}–${section.range[1]} Minuten (Faustregel).`
  )
  const foreign = subjectById(meta.subjectId).foreignLanguage
  if (foreign && v.subtitles) {
    const sub = SUBTITLE_OPTIONS.find((o) => o.value === v.subtitles)
    if (sub) lines.push(`- Untertitel: ${sub.label}. ${sub.note}`)
  }
  if (v.kind === 'lernvideo' && v.minutes > LEARNING_VIDEO_MINUTES[1]) {
    lines.push(`- Das Video ist länger als ${LEARNING_VIDEO_MINUTES[1]} Minuten. Teile die Aufgaben in Abschnitte, damit zwischendurch angehalten werden kann.`)
  }
  return lines.filter(Boolean).join('\n')
}
