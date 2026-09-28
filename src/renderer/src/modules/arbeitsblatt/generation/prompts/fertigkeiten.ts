import type { WorksheetMeta } from '../../model/types'
import { subjectById } from '../../model/subjects'
import { istUebungsklausur } from '../abiturPrompt'
import { istUebersetzungsfach, phrasenRegeln } from '../../didactics/phraseRules'
import { bilingualAktiv, glossarRegeln } from '../../didactics/bilingual'
import { vocabWorkRules } from '../../didactics/vocabWork'
import { chosenGrammarTopics, grammarFormatLabel } from '../../didactics/grammar'
import { wantedTasks } from './grundregeln'

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
