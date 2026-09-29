import type { WorksheetMeta } from '../../model/types'
import { GEZAEHLTE_SEITEN, seitenVorgabe } from '../../didactics/seiten'

// ---------- Fremdsprachen: Sprachmittlung, Schreiben, Hörverstehen ----------

/** Textlänge und Umfang je GER-Niveau (Ausgangstext / Schreibprodukt / Hörtext). */
export function skillSizes(level: string): {
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
    '- Die Arbeitsanweisung nennt das Material, auf das sie sich bezieht. Verweise über die Kennung des Materials („… based on M{text}", „… mit Hilfe von M{tabelle} und M{bild}"; jeder Materialbaustein trägt sie in „ref") – die App setzt daraus die Nummern M1, M2 …; verweise nur auf Material, das es gibt.',
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

/**
 * Aufsatzformen im Fach Deutsch (29.09.2026, Befund D4): Die Liste oben ist auf die
 * Fremdsprachen zugeschnitten (E-Mail, Blog …). Deutsch braucht die Aufsatzformen der
 * Kerncurricula (NI-KC Deutsch, KLP NRW): Inhaltsangabe, Erörterung, Interpretation,
 * Charakterisierung, Beschreibung, Bericht, Leserbrief, Kommentar, appellativer Text.
 */
export const DEUTSCHE_TEXTSORTEN: { value: string; label: string; english: string }[] = [
  { value: '', label: 'KI wählt passend zur Aufgabe', english: '' },
  { value: 'erzaehlung', label: 'Erzählung', english: 'Erzählung' },
  { value: 'bericht-de', label: 'Bericht', english: 'Bericht' },
  { value: 'vorgangsbeschreibung', label: 'Vorgangsbeschreibung', english: 'Vorgangsbeschreibung' },
  { value: 'personenbeschreibung', label: 'Personenbeschreibung', english: 'Personenbeschreibung' },
  { value: 'brief-de', label: 'Persönlicher oder sachlicher Brief', english: 'Brief' },
  { value: 'appellativ', label: 'Appellativer Text (Aufruf, Flyer)', english: 'appellativer Text' },
  { value: 'inhaltsangabe', label: 'Inhaltsangabe', english: 'Inhaltsangabe' },
  { value: 'charakterisierung', label: 'Charakterisierung', english: 'Charakterisierung' },
  { value: 'interpretation', label: 'Interpretationsaufsatz', english: 'Interpretationsaufsatz' },
  { value: 'eroerterung-linear', label: 'Lineare Erörterung', english: 'lineare Erörterung' },
  { value: 'eroerterung-dialektisch', label: 'Dialektische (antithetische) Erörterung', english: 'dialektische Erörterung' },
  { value: 'eroerterung-textgebunden', label: 'Textgebundene Erörterung', english: 'textgebundene Erörterung' },
  { value: 'leserbrief', label: 'Leserbrief', english: 'Leserbrief' },
  { value: 'kommentar', label: 'Kommentar', english: 'Kommentar' }
]

/** Textsorten für ein Fach: Deutsch mit Aufsatzformen, sonst die Liste der Fremdsprachen */
export const textsortenFuer = (subjectId: string): { value: string; label: string; english: string }[] =>
  subjectId === 'deutsch' || subjectId === 'daz' ? DEUTSCHE_TEXTSORTEN : STUDENT_TEXT_TYPES

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
  const vorgabe = seitenVorgabe(meta)
  return [
    'UMFANG – RICHTWERTE, KEINE OBERGRENZEN:',
    vorgabe
      ? `- Seitenzahl (${vorgabe.max > vorgabe.min ? `zwischen ${vorgabe.min} und ${vorgabe.max} Seiten, nach Bedarf des Materials` : vorgabe.min}; gezählt nur ${GEZAEHLTE_SEITEN}), Umfang des Schülertextes und Umfang des Ausgangstextes sind VORSCHLÄGE. Verlangt der Inhalt mehr, darfst du darüber hinausgehen; verlangt er weniger Seiten, darf das Blatt auch kürzer sein.`
      : '- Die Seitenzahl ist nicht vorgegeben: Wähle sie selbst so, wie Jahrgang, Bearbeitungszeit und Aufgaben es brauchen. Umfang des Schülertextes und Umfang des Ausgangstextes sind VORSCHLÄGE. Verlangt der Inhalt mehr, darfst du darüber hinausgehen.',
    '- Überschreite nur, wenn es die Sache verlangt: eine Quelle, die sich nicht sinnvoll kürzen lässt; Inhaltspunkte, die in der vorgegebenen Wortzahl nicht zu behandeln sind; Material, das sonst unleserlich klein würde.',
    vorgabe
      ? `- Höchstens EINE Seite mehr als vorgegeben${vorgabe.max > vorgabe.min ? ` (also höchstens ${vorgabe.max + 1})` : ''}, und höchstens ein Viertel mehr Wörter. Darüber hinaus kürze lieber die Aufgabenstellung.`
      : '- Höchstens ein Viertel mehr Wörter als vorgegeben. Darüber hinaus kürze lieber die Aufgabenstellung.',
    '- UNTERSCHREITE die Wortvorgaben nicht. Weniger wäre keine Hilfe, sondern eine stillschweigende Kürzung.',
    vorgabe
      ? '- Jede Abweichung gehört in teacherNote, mit Grund und Zahl: „Drei statt zwei Seiten: Der Originalauszug umfasst 480 Wörter und lässt sich nicht kürzen." Bei der Seitenzahl dazu Grund und Vorschläge unter seiten.'
      : '- Jede Abweichung gehört in teacherNote, mit Grund und Zahl: „180 statt 150 Wörter: Der Originalauszug lässt sich nicht kürzen."'
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
