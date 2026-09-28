import { stageForGrade } from '../../didactics/profile'
import type { WorksheetMeta } from '../../model/types'
import { subjectById } from '../../model/subjects'
import { listeningCount, listeningFormatById, listeningFormatsFor, listeningRules, listeningSeconds, listeningWords } from '../../didactics/listeningFormats'
import { listeningStateRulesText } from '../../didactics/listeningStates'
import { levelAtLeast } from '../../../../shared/cefr'
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
} from '../../didactics/videoTasks'
import { skillSizes, sourceTextWords, contextRules, writingBriefRules, wordLimitRule } from './schreiben'

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
