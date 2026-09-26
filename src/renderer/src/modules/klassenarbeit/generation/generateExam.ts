/**
 * Erzeugung der Klassenarbeit.
 *
 * Jeder Teil der Arbeit wird einzeln erzeugt: So bleibt jede Anfrage klein, und die Vorgaben
 * des Formats (Kompetenz, Aufgabenformate, Punkte, Anforderungsbereiche) lassen sich genau
 * übergeben. Für Material und Aufgaben werden dieselben Bausteine und derselbe Schemaaufbau
 * verwendet wie im Arbeitsblatt – dadurch funktionieren Darstellung, Seitenumbruch und Export
 * unverändert weiter.
 */
import type { StructuredRequest } from '@shared/types'
import { createRng, newId, randomSeed } from '../../vokabeltest/model/random'
import { comprehensionFormatById, defaultComprehensionFormats } from '../../arbeitsblatt/didactics/comprehensionFormats'
import { buildLearnerProfile, stageForGrade } from '../../arbeitsblatt/didactics/profile'
import { browserWorksheetImageDeps, worksheetImagePool } from '../../arbeitsblatt/generation/browserImages'
import { checkIntegrity } from '../../arbeitsblatt/didactics/integrity'
import { checkClosedFormatsHistory, checkItemWording, checkTrueFalseEvidence } from '../../arbeitsblatt/didactics/itemWording'
import { checkSourceHeaders } from '../../arbeitsblatt/didactics/sourceHeader'
import { checkNarration } from '../../arbeitsblatt/didactics/narration'
import { convertBlock } from '../../arbeitsblatt/generation/convert'
import { browserMaterialDienste, browserSourceServices, completeOriginalSources } from '../../arbeitsblatt/generation/originalSources'
import {
  alsAblage,
  beschaffeOriginalmaterial,
  materialBausteine,
  materialSprache,
  type GepruefterTreffer
} from '../../arbeitsblatt/generation/originalmaterial'
import { completeWorksheetImages } from '../../arbeitsblatt/generation/worksheetImages'
import { describeBlock } from '../../arbeitsblatt/generation/describe'
import { SHEET_SCHEMA } from '../../arbeitsblatt/generation/schemas'
import {
  originalMaterialVorgabe,
  originalSourceRules,
  sourceTextWords,
  STUDENT_TEXT_TYPES,
  systemPrompt,
  writingBriefRules,
  writingScaffoldRules
} from '../../arbeitsblatt/generation/prompts'
import { WORTZAHL_GRUND, wortzahlErlaubt } from '../model/examRules'
import { defaultMeta } from '../../arbeitsblatt/model/defaults'
import { subjectById } from '../../arbeitsblatt/model/subjects'
import type { LanguageSkill, OriginalMaterialAblage, Sheet, WorksheetMeta, WsBlock } from '../../arbeitsblatt/model/types'
import { CONTENT_SHARE, formatById } from '../model/formats'
import type { Exam, ExamPart } from '../model/types'
import { knownVocabRulesDe } from '../../../shared/knownVocab'
import { bilingualAktiv, checkBilingualOperatoren, PRUEFUNGSSPRACHE_HINWEIS } from '../../arbeitsblatt/didactics/bilingual'
import { glossarFuerArbeit } from './glossar'
import { scriptForSheet, wantsListening, writeListeningScript } from '../../arbeitsblatt/generation/listening'
import type { ListeningScript } from '../../arbeitsblatt/generation/listening'
import { linkListeningTasks } from '../../arbeitsblatt/generation/listening'
import { stoffBilder } from '../../../shared/files/stoffQuelle'
import {
  alleFassungen,
  fassungsLabel,
  gleichePunkte,
  laengenHinweis,
  materialweg,
  MAX_FASSUNGEN,
  mitBloecken,
  parallelAuftrag,
  punkteAufTeil,
  teileDerFassung,
  uebernimmMaterial
} from '../model/fassungen'

export type AiCall = <T>(req: StructuredRequest) => Promise<T>

/** Kompetenzschwerpunkt, der zu einem Aufgabenformat gehört */
function skillFor(formatId: string): LanguageSkill | 'mixed' {
  if (formatId === 'en-writing') return 'writing'
  if (formatId === 'en-mediation') return 'mediation'
  if (formatId === 'en-listening') return 'listening'
  if (formatId === 'en-reading') return 'reading'
  if (formatId === 'en-grammar' || formatId === 'en-language') return 'grammar'
  return 'mixed'
}

/**
 * Baut aus der Klassenarbeit ein Lerngruppen-Profil im Format des Arbeitsblatts.
 * So gelten dieselben Regeln zu Sprache, Operatoren und Aufgabenformaten.
 */
export function worksheetMetaFor(exam: Exam, part?: ExamPart): WorksheetMeta {
  const m = exam.meta
  const skill = part ? skillFor(part.formatId) : 'mixed'
  return {
    ...defaultMeta(m.stateId, m.schoolTypeId, m.schoolTypeName),
    title: m.title || 'Klassenarbeit',
    subjectId: m.subjectId,
    subjectLabel: m.subjectLabel,
    topic: m.topic,
    priorKnowledge: m.content,
    // Bilingual: als Prüfung markiert – das Glossar liegt der Arbeit einmal bei (glossarFuerArbeit)
    bilingual: m.bilingual ? { ...m.bilingual, pruefung: true, pruefsprache: m.bilingual.pruefsprache ?? 'ziel' } : undefined,
    grade: m.grade,
    courseLevel: m.courseLevel,
    cefrLevel: m.cefrLevel,
    minutes: part?.minutes ?? m.minutes,
    pages: 1,
    sheetType: 'lernkontrolle',
    answerKey: m.answerKey,
    /*
     * Wortzahl auf dem Blatt – in Niedersachsen bei Schreiben und Sprachmittlung untersagt.
     * Die Sperre steht hier und nicht nur in der Oberfläche: Eine ältere Arbeit, die mit
     * eingeschalteter Wortvorgabe gespeichert wurde, darf beim erneuten Erzeugen nicht
     * plötzlich wieder eine nennen.
     */
    wordLimit: wortzahlErlaubt(m.stateId, m.subjectId) ? (m.wordLimit ?? false) : false,
    skillFocus: skill,
    grammarTopic: m.grammarTopic,
    comprehensionFormats: part?.formats ?? [],
    // In der Arbeit wird bewertet, nicht geübt: keine Hilfen und keine Selbsteinschätzung
    differentiation: { levels: 1, mode: 'separate' },
    // In der gymnasialen Oberstufe darf kein von einer KI erfundenes Material verwendet
    // werden: Texte und Bilder müssen recherchierte Originalquellen sein.
    imageSource: upperSecondary(m) ? 'web' : 'placeholder',
    originalSources: upperSecondary(m) ? 'on' : 'off',
    boardPlan: false,
    // Hörtext-Einstellungen der Arbeit gelten für den Hörverstehensteil
    audioAi: m.audioAi,
    audioFormat: m.audioFormat,
    audioProvider: m.audioProvider,
    audioModel: m.audioModel
  }
}

/**
 * In welcher Sprache der Originaltext gesucht wird.
 *
 * In den Fremdsprachen steht das Material in der Zielsprache – nur der Ausgangstext einer
 * Sprachmittlung ist deutsch (das entscheidet der Aufrufer).
 */
export function quellenSprache(subjectId: string): string {
  const fach = subjectById(subjectId)
  return fach.foreignLanguage ?? (subjectId === 'latein' ? 'la' : 'de')
}

/** Gymnasiale Oberstufe (Einführungs- und Qualifikationsphase) */
export function upperSecondary(meta: Exam['meta']): boolean {
  return stageForGrade(meta.grade, meta.schoolTypeId) === 'sek2'
}

/**
 * Vorgabe für die Oberstufe: ausschließlich recherchiertes Originalmaterial.
 * Grund: In der gymnasialen Oberstufe darf kein von einer KI erzeugtes Material eingesetzt werden.
 */
export function upperSecondaryRules(meta: Exam['meta'], material?: OriginalMaterialAblage | null): string {
  if (!upperSecondary(meta)) return ''
  /*
   * Ist das Material beschafft, treten die Gedaechtnis-Regeln zurueck.
   *
   * Gemeldet am 24.09.2026: Ein Text von 2025 wurde als bester Treffer angeboten und dann
   * doch nicht verwendet. Grund war der Satz „Kennst du keine passende Quelle sicher, sage
   * das" – ein Ausweg aus der Zeit, als die KI aus dem Gedaechtnis zitieren musste. Neben
   * einem geladenen Text ist er falsch und laedt zum Ausweichen ein.
   */
  if (material) {
    return [
      'OBERSTUFE – DAS MATERIAL IST BESCHAFFT:',
      '- Der Ausgangstext steht unten im Wortlaut. Die App hat ihn geladen, geprueft und setzt ihn selbst als Baustein ein.',
      '- Weiche NICHT aus: kein selbst geschriebener Ersatztext, keine Meldung „Quelle nicht sicher bekannt". Der Text liegt vor.',
      '- Plane die Aufgaben zu DIESEM Text.'
    ].join('\n')
  }
  return [
    'OBERSTUFE – NUR ORIGINALMATERIAL:',
    '- In der gymnasialen Oberstufe darf KEIN von einer KI erfundenes Material verwendet werden.',
    '- Jeder Text, jede Grafik und jedes Bild muss eine echte, veröffentlichte Quelle sein, die sich nachprüfen lässt.',
    '- Nimm nur Quellen, deren Wortlaut du sicher kennst (gemeinfrei oder frei zugänglich: Wikisource, Projekt Gutenberg, documentArchiv.de, LeMO, bpb, Wikimedia Commons, Presseartikel mit frei zugänglichem Volltext).',
    '- Erfinde niemals Zitate, Urheber, Titel oder Jahreszahlen. Kennst du keine passende Quelle sicher, sage das im Feld „solution" der Aufgabe, statt etwas zu erfinden.',
    '- Quellenangabe unter jedem Material: Urheber, Titel, Datum und Fundort (https-Adresse). Kürzungen mit […] kennzeichnen.',
    '- Die App gleicht den Wortlaut anschließend mit der angegebenen Adresse ab; erfundene Stellen fallen auf.'
  ].join('\n')
}

/** Was im Erwartungshorizont stehen soll. */
function answerKeyRules(exam: Exam, part: ExamPart): string {
  const m = exam.meta
  if (!m.answerKey) return '- solution: knappe Musterlösung für die Lehrkraft.'
  const productive = typeof part.contentShare === 'number'
  const detail = m.answerKeyDetail
  if (detail === 'kurz') {
    return [
      'ERWARTUNGSHORIZONT (knapp):',
      '- solution je Aufgabe: Stichpunkte der erwarteten Inhalte, keine ausformulierten Sätze.',
      productive ? '- Bei der Schreibaufgabe: die erwarteten Inhaltspunkte als Liste.' : '- Bei geschlossenen Aufgaben genügt die richtige Lösung je Item.'
    ].join('\n')
  }
  if (detail === 'ausfuehrlich') {
    return [
      'ERWARTUNGSHORIZONT (ausformuliert):',
      '- solution je Aufgabe: eine vollständig ausformulierte Musterlösung, wie sie eine gute Arbeit enthielte.',
      productive
        ? `- Bei der Schreibaufgabe: ein vollständiger Beispieltext in der Zielsprache, dazu die erwarteten Inhaltspunkte.`
        : '- Bei geschlossenen Aufgaben zusätzlich ein Satz, woran die Lösung im Text zu erkennen ist.'
    ].join('\n')
  }
  return [
    'ERWARTUNGSHORIZONT (mit Bewertungsraster):',
    '- solution je Aufgabe: ausformulierte Musterlösung UND ein Raster mit Punkten je Kriterium.',
    productive
      ? `- Die Schreibleistung wird getrennt bewertet: ${part.contentShare ?? CONTENT_SHARE} % Inhalt (erwartete Inhaltspunkte, je Punkt ein Kriterium) und ${100 - (part.contentShare ?? CONTENT_SHARE)} % Sprache (kommunikative Textgestaltung, Ausdrucksvermögen, Sprachrichtigkeit). Nenne die Kriterien einzeln.`
      : part.items && part.items > 0
        ? `- GENAU ${part.items} Items, ein Punkt je Item; insgesamt ${part.points} Punkte. Die Lehrkraft hat die Zahl der Items vorgegeben.`
        : `- Nenne die Punkte je Item; insgesamt ${part.points} Punkte.`,
    '- Schreibe das Raster als Liste „Kriterium – Punkte", nicht als Fließtext.'
  ].join('\n')
}

/** Nähere Vorgaben der Lehrkraft für diesen Teil. */
export function partNotes(part: ExamPart): string {
  const textType = STUDENT_TEXT_TYPES.find((t) => t.value === part.studentTextType && t.value)
  const lines = [
    textType
      ? `TEXTSORTE VORGEGEBEN: Die Lernenden schreiben „${textType.label}“ (brief.textType = "${textType.english}"). Die Situation muss dazu passen, und die Aufgabe verlangt die Merkmale dieser Textsorte.`
      : '',
    part.notes?.trim() ? `VORGABEN DER LEHRKRAFT (verbindlich):\n${part.notes.trim()}` : ''
  ].filter(Boolean)
  return lines.length ? `\n${lines.join('\n')}` : ''
}

/**
 * Vorgaben, Erwartungshorizont und Sprachgerüst einer Schreibaufgabe in der ARBEIT.
 *
 * Die Vorgaben und der Erwartungshorizont gelten hier wie auf dem Arbeitsblatt – eine
 * Schreibaufgabe ohne Situierung und Inhaltspunkte wäre in einer Arbeit noch weniger
 * brauchbar als im Unterricht.
 *
 * Das sprachliche GERÜST dagegen ist aus und muss eigens eingeschaltet werden: In keiner
 * der eingesehenen amtlichen Abschlussprüfungen bekommen Prüflinge Formulierungshilfen, und
 * Bayern nimmt aus der Angabe übernommene Wendungen ausdrücklich von der Bewertung der
 * sprachlichen Bandbreite aus („lifting").
 */
export function schreibvorgabenRegeln(exam: Exam, part: ExamPart): string {
  if (!part.formatId?.startsWith('en-writing') && part.formatId !== 'en-mediation') return ''
  const meta = worksheetMetaFor(exam, part)
  return [
    writingBriefRules(meta),
    wortzahlErlaubt(exam.meta.stateId, exam.meta.subjectId)
      ? ''
      : `- KEINE WORTZAHL in der Aufgabe, in den Vorgaben oder in den Formhinweisen. ${WORTZAHL_GRUND}`,
    exam.meta.writingScaffold
      ? writingScaffoldRules(meta)
      : '- KEIN sprachliches Gerüst, keine Formulierungshilfen, kein Wortspeicher auf dem Blatt. Was dort steht, zählt in der Bewertung nicht als eigene sprachliche Leistung.'
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Zugeordnete Vokabeln. Sie geben den Wortschatz vor, aus dem die Arbeit schöpft –
 * geprüft wird nur, was im Unterricht geübt wurde.
 */
export function vocabRules(exam: Exam): string {
  const words = exam.meta.vocab.flatMap((v) => v.words)
  if (!words.length) return ''
  // Sehr lange Listen kürzen, damit die Anfrage klein bleibt
  const shown = words.slice(0, 120)
  const lines = shown.map((w) => [`${w.term} – ${w.translation}`, w.pos, w.example].filter(Boolean).join(' | ')).join('\n')
  return [
    `GEÜBTER WORTSCHATZ (aus ${exam.meta.vocab.map((v) => v.name).join(', ')}):`,
    lines,
    words.length > shown.length ? `… und ${words.length - shown.length} weitere.` : '',
    '- Je Zeile: Wort – Übersetzung | Wortart | Beispielsatz aus dem Lehrwerk.',
    '- Baue Material und Aufgaben so, dass dieser Wortschatz vorkommt; er gilt als bekannt.',
    '- Anderer Wortschatz nur, soweit er auf dem Niveau der Lerngruppe selbstverständlich ist.',
    // Vokabeln der vorherigen Units und Bände: gerade in jüngeren Klassen ist alles andere unbekannt
    ...exam.meta.vocab.map((v) => knownVocabRulesDe(v.known)).filter(Boolean)
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Hineingezogene Unterlagen aus dem Unterricht (Schritt „Rahmen", unter den Inhalten).
 *
 * Dieselbe Idee wie in der Lernzielkontrolle: Eine getippte Inhaltsangabe bleibt grob, ein
 * Arbeitsblatt oder Tafelbild zeigt genau die Begriffe, Texte und Beispiele, die die Klasse
 * kennt. Der Text steht im Auftrag; Seitenbilder gehen zusätzlich als Bild mit (`unterlagenBilder`).
 */
export function unterlagenTeil(exam: Exam): string {
  const quellen = (exam.meta.materialQuellen ?? []).filter((q) => q.aktiv)
  if (!quellen.length) return ''
  const out = [
    'UNTERLAGEN AUS DEM UNTERRICHT (von der Lehrkraft beigefügt):',
    '- Sie zeigen, was tatsächlich behandelt wurde: Begriffe, Texte, Beispiele, Schreibweisen.',
    '- Geprüft wird nur, was dort oder in den Inhalten der Unterrichtseinheit vorkommt. Übernimm die Bezeichnungen der Unterlagen.',
    '- Übernimm Material NICHT wörtlich aus den Unterlagen: Ein im Unterricht besprochener Text wäre in der Arbeit keine neue Leistung mehr.'
  ]
  for (const q of quellen) {
    out.push(`--- ${q.fileName} ---`)
    out.push(q.text.trim() ? q.text.trim().slice(0, 6000) : '(kein auslesbarer Text – siehe das beigefügte Bild)')
  }
  return out.join('\n')
}

/** Die Seitenbilder der Unterlagen als Zusatz einer Anfrage (leer, wenn es keine gibt). */
export function unterlagenBilder(exam: Exam): { images?: string[] } {
  const images = stoffBilder(exam.meta.materialQuellen)
  return images.length ? { images } : {}
}

/** Auftrag für einen Teil der Arbeit. */
export function partPrompt(exam: Exam, part: ExamPart, number: number, material?: OriginalMaterialAblage | null): string {
  const m = exam.meta
  const format = formatById(part.formatId)
  const productive = typeof part.contentShare === 'number'
  const formats = (part.formats?.length ? part.formats : defaultComprehensionFormats(part.formatId === 'en-listening' ? 'listening' : 'reading', m.grade))
    .map((id) => comprehensionFormatById(id)?.label)
    .filter(Boolean)
  return [
    `Erstelle Teil ${number} einer Klassenarbeit im Fach ${m.subjectLabel}.`,
    `Thema der Arbeit: ${m.topic}`,
    m.content ? `Inhalte der Unterrichtseinheit, auf die sich die Arbeit bezieht: ${m.content}` : '',
    unterlagenTeil(exam),
    `Teil ${number}: ${format?.label ?? part.label} – Kompetenzbereich ${part.competence}.`,
    format?.description ? `Was der Teil verlangt: ${format.description}` : '',
    `Bearbeitungszeit für diesen Teil: ${part.minutes} Minuten.`,
    productive
      ? `Dieser Teil wird nicht über Punkte bewertet, sondern zu ${part.contentShare ?? CONTENT_SHARE} % über den Inhalt und zu ${100 - (part.contentShare ?? CONTENT_SHARE)} % über die Sprache. Vergib in answer keine Punkte.`
      : part.items && part.items > 0
        ? `Dieser Teil hat GENAU ${part.items} Items und ${part.points} Punkte – ein Punkt je Item. Die Lehrkraft hat die Zahl vorgegeben; halte sie ein und nenne die Punkte je Aufgabe im Feld points.`
        : `Dieser Teil hat insgesamt ${part.points} Punkte. Verteile sie auf die Items und nenne die Punkte je Aufgabe im Feld points.`,
    ['en-listening', 'en-reading'].includes(part.formatId) && formats.length ? `Benutze diese Aufgabenformate: ${formats.join(', ')}.` : '',
    `Erlaubte Hilfsmittel: ${m.aids || 'keine'}.`,
    vocabRules(exam),
    partNotes(part),
    schreibvorgabenRegeln(exam, part),
    '',
    upperSecondaryRules(m, material),
    upperSecondary(m) ? originalSourceRules(worksheetMetaFor(exam, part), null, material) : '',
    '',
    'REGELN FÜR EINE KLASSENARBEIT:',
    '- Geprüft wird nur, was laut den Inhalten der Unterrichtseinheit geübt wurde. Keine neuen Themen einführen.',
    '- Keine Hilfen, keine Tipps, keine Lösungsbeispiele, keine Selbsteinschätzung – das ist eine Leistungssituation.',
    '- Die Arbeit hat kein Deckblatt: Beginne direkt mit dem Material bzw. der ersten Aufgabe dieses Teils.',
    '- Jede Aufgabe ist ohne Rückfragen verständlich und allein mit dem Material auf dem Blatt lösbar.',
    '- Keine Lernziele, keine Merkkästen, keine Arbeitsfläche „zum Üben".',
    '',
    answerKeyRules(exam, part),
    '',
    `Gib nur die Bausteine dieses Teils zurück (Material und Aufgaben), höchstens ${productive ? 2 : 4} Bausteine.`
  ]
    .filter(Boolean)
    .join('\n')
}

export interface ExamProgress {
  (message: string): void
}

/** Lerngruppen-Profil aus den Angaben der Arbeit. */
function profileFor(meta: WorksheetMeta): ReturnType<typeof buildLearnerProfile> {
  return buildLearnerProfile({
    stateId: meta.stateId,
    schoolTypeId: meta.schoolTypeId,
    schoolTypeName: meta.schoolTypeName,
    grade: meta.grade,
    courseLevel: meta.courseLevel,
    subjectId: meta.subjectId,
    subjectLabel: meta.subjectLabel,
    languageMode: meta.languageMode,
    cefrLevel: meta.cefrLevel,
    instructionsInGerman: meta.instructionsInGerman
  })
}

/**
 * Formate, deren Material eine echte, zu analysierende QUELLE ist.
 *
 * Entscheidung der Lehrkraft (24.09.2026) auf die Frage nach dem Umfang: Quellenanalyse,
 * Quellenvergleich, Leseverstehen UND Sprachmittlung.
 *
 * Nicht dabei sind Grammatik- und Wortschatzteile. Deren Text ist zwar auch ein Text, aber
 * ein konstruierter Uebungstext mit gezielt gesetzten Luecken – eine Originalquelle waere
 * dort nicht nur unnoetig, sondern unbrauchbar.
 */
const QUELLENFORMATE = ['ge-source', 'ge-comparison', 'en-reading', 'en-mediation']

/**
 * Braucht dieser Teil einen beschafften Originaltext?
 *
 * Nur in der Oberstufe: Dort darf kein von einer KI erfundenes Material verwendet werden.
 * In der Sekundarstufe I bleibt es beim bisherigen Weg.
 */
export function brauchtOriginaltext(exam: Exam, part: ExamPart): boolean {
  return upperSecondary(exam.meta) && QUELLENFORMATE.includes(part.formatId)
}

/**
 * Der Teil, fuer den sich kein Originaltext finden liess.
 *
 * Entscheidung der Lehrkraft (24.09.2026): „Nur diesen Teil offen lassen." Die uebrigen
 * Teile entstehen normal – wer wegen eines fehlenden Textes die ganze Arbeit verliert,
 * faengt von vorn an, obwohl vier Teile fertig waren.
 *
 * Der Baustein bleibt bewusst sichtbar im Blatt stehen und sagt, WONACH gesucht wurde und
 * WARUM die Funde verworfen wurden. Ein leerer Teil ohne Erklaerung waere von einem Fehler
 * der App nicht zu unterscheiden.
 */
export function fehlenderTextBaustein(part: ExamPart, grund: string): WsBlock {
  return {
    id: newId(createRng(randomSeed())),
    type: 'infoBox',
    variant: 'wissen',
    title: `${part.label}: Originaltext fehlt`,
    body: [
      'Fuer diesen Teil wurde kein geeigneter Originaltext gefunden.',
      grund,
      'In der Oberstufe darf kein von einer KI erfundenes Material verwendet werden – deshalb ist dieser Teil leer geblieben.',
      'Setze hier einen eigenen Text ein und erzeuge den Teil danach neu.'
    ].join(' '),
    warnings: ['Dieser Teil ist unvollstaendig: Es fehlt der Originaltext.']
  }
}

/** Erzeugt die Bausteine eines Teils. */
export async function generateExamPart(
  exam: Exam,
  part: ExamPart,
  number: number,
  ai: AiCall,
  /** Beschaffter Originaltext – die App setzt ihn selbst ein, die KI plant nur die Aufgaben dazu */
  material?: OriginalMaterialAblage | null
): Promise<WsBlock[]> {
  const meta = worksheetMetaFor(exam, part)
  const profile = profileFor(meta)
  // Hörverstehen: erst den Hörtext schreiben (auf Wunsch mit einem stärkeren Modell),
  // dann die Aufgaben dazu – so passen sie wirklich zum Text.
  let script: ListeningScript | null = null
  if (part.formatId === 'en-listening' && wantsListening(meta)) {
    try {
      script = await writeListeningScript(meta, profile, ai, { provider: meta.audioProvider, model: meta.audioModel })
    } catch {
      script = null
    }
  }
  const res = await ai<{ blocks: unknown[] }>({
    system: systemPrompt(meta, profile),
    user: [partPrompt(exam, part, number), originalMaterialVorgabe(material), scriptForSheet(script)].filter(Boolean).join('\n\n'),
    schema: SHEET_SCHEMA,
    schemaName: 'exam_part',
    ...unterlagenBilder(exam)
  })
  const rng = createRng(randomSeed())
  const blocks = (res.blocks ?? [])
    .map((b) => convertBlock(b, rng, []))
    .filter((b): b is WsBlock => Boolean(b))
    .map((b) => (b.type === 'task' ? { ...b, id: b.id || newId(rng) } : b))
  /*
   * Den Originaltext setzt die APP ein, nicht die KI. Ein Sprachmodell, das einen Text
   * „uebernimmt", aendert dabei Kleinigkeiten – in einer Klausur staende das mit
   * Quellenangabe da und saehe aus wie ein Zitat.
   */
  if (!material) return blocks
  /*
   * In der Klausur stehen die Aufgaben VORN, das Material danach auf einer eigenen Seite –
   * gewuenscht am 24.09.2026 und so auch in der Pruefung ueblich. Wer die Aufgaben vorher
   * gelesen hat, weiss beim Lesen des Materials, worauf er achten muss.
   */
  const [erster, ...weitere] = materialBausteine(material, meta, () => newId(rng))
  return [...blocks, { ...erster, pageBreakBefore: true }, ...weitere]
}

/**
 * Erzeugt einen Teil neu und berücksichtigt dabei einen zusätzlichen Auftrag der Lehrkraft
 * („kürzer", „ohne Multiple Choice", „anderes Thema") sowie den bisherigen Stand.
 */
export async function reviseExamPart(exam: Exam, part: ExamPart, number: number, instruction: string, ai: AiCall): Promise<WsBlock[]> {
  const meta = worksheetMetaFor(exam, part)
  const profile = profileFor(meta)
  const current = part.blocks.map((b) => describeBlock(b)).join('\n\n')
  const res = await ai<{ blocks: unknown[] }>({
    system: systemPrompt(meta, profile),
    user: [
      partPrompt(exam, part, number),
      '',
      current ? `BISHERIGER STAND DIESES TEILS:\n${current}` : '',
      '',
      `ÄNDERUNGSWUNSCH DER LEHRKRAFT (hat Vorrang): ${instruction}`,
      'Gib den ganzen Teil neu zurück, nicht nur die Änderung.'
    ]
      .filter(Boolean)
      .join('\n'),
    schema: SHEET_SCHEMA,
    schemaName: 'exam_part',
    ...unterlagenBilder(exam)
  })
  const rng = createRng(randomSeed())
  return (res.blocks ?? []).map((b) => convertBlock(b, rng, [])).filter((b): b is WsBlock => Boolean(b))
}

/**
 * Einen Teil in einer WEITEREN Fassung (B, C) erzeugen – als gleichwertiges Gegenstück zu
 * Fassung A (Regeln und Begründung in model/fassungen.ts).
 *
 * Fehlt in Fassung A der Originaltext (Oberstufe, nichts gefunden), gibt es auch für B nichts
 * zu erzeugen: Der Hinweisbaustein wird übernommen, ohne eine Anfrage zu verbrauchen.
 */
export async function generateParallelPart(
  exam: Exam,
  part: ExamPart,
  number: number,
  fassung: number,
  vorlage: WsBlock[],
  ai: AiCall,
  material?: OriginalMaterialAblage | null
): Promise<{ blocks: WsBlock[]; hinweise: string[] }> {
  if (!vorlage.some((b) => b.type === 'task')) return { blocks: structuredClone(vorlage), hinweise: [] }
  const label = fassungsLabel(fassung, Math.max(2, exam.meta.variants))
  const meta = worksheetMetaFor(exam, part)
  const profile = profileFor(meta)
  const weg = materialweg(exam, part)
  const res = await ai<{ blocks: unknown[] }>({
    system: systemPrompt(meta, profile),
    user: [
      partPrompt(exam, part, number, material),
      '',
      // Steht zuletzt und geht dem „Gib die Bausteine zurück" im Auftrag darüber vor
      parallelAuftrag(exam, part, label, vorlage, vorlage.map((b) => describeBlock(b)).join('\n\n'))
    ].join('\n'),
    schema: SHEET_SCHEMA,
    schemaName: 'exam_part',
    ...unterlagenBilder(exam)
  })
  const rng = createRng(randomSeed())
  const neu = (res.blocks ?? [])
    .map((b) => convertBlock(b, rng, []))
    .filter((b): b is WsBlock => Boolean(b))
    .map((b) => (b.id ? b : { ...b, id: newId(rng) }))
  // Dasselbe Material setzt die App selbst ein – mit derselben id wie in Fassung A
  const blocks = weg === 'gleich' ? uebernimmMaterial(vorlage, neu) : neu
  // Die Punkte gleicht `fassungenAbschliessen` am Ende an – nach der Nachbesserung, die sie sonst wieder verschöbe
  const laenge = weg === 'parallel' ? laengenHinweis(vorlage, blocks) : null
  const hinweise = laenge ? [laenge] : []
  return { blocks, hinweise }
}

/** Ein Teil ohne weitere Fassungen – für eine Arbeit, die (wieder) nur eine Fassung hat. */
function nurFassungA(part: ExamPart): ExamPart {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { weitereFassungen, ...rest } = part
  return rest
}

/** Erzeugt alle Teile nacheinander und gibt die ergänzte Arbeit zurück. */
export interface ExamOptions {
  /**
   * In der Oberstufe waehlt die Lehrkraft die Quelle aus (Entscheidung vom 24.09.2026).
   * Fehlt die Rueckfrage, nimmt die App die bestbewertete.
   */
  auswahl?: (treffer: GepruefterTreffer[]) => Promise<string | null>
  /** Websuche und Bild-KI eines Hintergrund-Auftrags – dann lassen sie sich mit ihm abbrechen */
  websuche?: Parameters<typeof browserMaterialDienste>[0]
  bild?: (prompt: string) => Promise<string>
}

export async function generateExam(exam: Exam, ai: AiCall, onProgress: ExamProgress = () => undefined, opts: ExamOptions = {}): Promise<Exam> {
  /*
   * Fassungen (A/B, A/B/C): Je Teil entsteht zuerst Fassung A, gleich danach ihre
   * Gegenstücke – so liegt die Vorlage vor, zu der B gleichwertig sein muss (model/fassungen.ts).
   */
  const anzahl = Math.min(MAX_FASSUNGEN, Math.max(1, Math.round(exam.meta.variants || 1)))
  const label = (f: number): string => fassungsLabel(f, anzahl)
  const parts: ExamPart[] = []
  const materialNotizen: string[] = []
  const notes: string[] = []
  for (let i = 0; i < exam.parts.length; i++) {
    const part = nurFassungA(exam.parts[i])
    onProgress(`Teil ${i + 1} von ${exam.parts.length}: ${part.label}${anzahl > 1 ? ' (Fassung A)' : ''} …`)

    /*
     * Oberstufe: Der Ausgangstext wird beschafft, BEVOR die Aufgaben entstehen.
     *
     * Vorgabe der Lehrkraft (24.09.2026): In Sek II duerfen nur Originalquellen verwendet
     * werden, und eine Klausur darf NICHT auf einen KI-Text ausweichen. Findet sich nichts,
     * bleibt dieser eine Teil offen – die uebrigen entstehen normal.
     */
    let material: OriginalMaterialAblage | null = null
    let blocks: WsBlock[] | null = null
    if (brauchtOriginaltext(exam, part)) {
      const teilMeta = worksheetMetaFor(exam, part)
      const ergebnis = await beschaffeOriginalmaterial({
        wunsch: {
          thema: [exam.meta.topic, part.label].filter(Boolean).join(' – '),
          fach: exam.meta.subjectLabel,
          fachId: exam.meta.subjectId,
          sprache: materialSprache(subjectById(exam.meta.subjectId), part.formatId === 'en-mediation'),
          jahrgang: exam.meta.grade,
          zielWortzahl: sourceTextWords(teilMeta),
          // Klausur: kein Ausweichen auf einen Autorentext
          pruefung: true
        },
        dienste: browserMaterialDienste(opts.websuche),
        ai,
        fortschritt: (text) => onProgress(`Teil ${i + 1}: ${text}`),
        auswahl: opts.auswahl
      }).catch((e) => ({ art: 'abbruch' as const, grund: e instanceof Error ? e.message : String(e), kandidaten: [] }))

      if (ergebnis.art === 'gefunden') {
        material = alsAblage(ergebnis.material)
        materialNotizen.push(
          `Teil ${i + 1} (${part.label}): Originalquelle „${material.titel}". ${material.wortlautGeprueft ? 'Wortlaut geprueft.' : 'ACHTUNG – Abweichungen beim Wortlautabgleich.'} ${material.protokoll.join(' ')}`
        )
      } else {
        // Nur dieser Teil bleibt offen; der Grund steht sichtbar im Blatt (in jeder Fassung)
        blocks = [fehlenderTextBaustein(part, ergebnis.grund)]
        materialNotizen.push(`Teil ${i + 1} (${part.label}): KEIN Originaltext gefunden. ${ergebnis.grund}`)
      }
    }

    blocks ??= await generateExamPart(exam, part, i + 1, ai, material)
    // Punkte VOR den weiteren Fassungen angleichen – ihr Auftrag nennt die Punkte der Vorlage
    punkteAufTeil(blocks, part.points)
    let fertig: ExamPart = { ...part, blocks }
    for (let f = 1; f < anzahl; f++) {
      onProgress(`Teil ${i + 1} von ${exam.parts.length}: ${part.label} (Fassung ${label(f)}) …`)
      const r = await generateParallelPart(exam, part, i + 1, f, blocks, ai, material)
      fertig = mitBloecken(fertig, f, r.blocks)
      if (r.hinweise.length) notes.push(`Fassung ${label(f)}, Teil ${i + 1}: ${r.hinweise.join(' ')}`)
    }
    parts.push(fertig)
  }

  // Prüfung und Nachbesserung: Verweise auf Material, das es nicht gibt, leeres Material,
  // Vergleichslisten in gleicher Reihenfolge. Läuft für JEDE Fassung – eine eigene Prüfkette
  // nur für A liesse B ungeprüft (getrennte Erzeugungswege, siehe Projektnotizen).
  onProgress(anzahl > 1 ? `Die ${anzahl} Fassungen werden geprüft …` : 'Die Arbeit wird geprüft …')
  const fassungen: ExamPart[][] = []
  for (let f = 0; f < anzahl; f++) {
    fassungen.push(await pruefeFassung(exam, teileDerFassung({ ...exam, parts }, f), f, anzahl > 1 ? `Fassung ${label(f)}, ` : '', ai, onProgress, notes))
  }

  /*
   * Bilingual (nur Geschichte): zielsprachliche Operatoren prüfen, auf die Prüfungssprache
   * hinweisen und das Glossar EINMAL am Ende beilegen – Entscheidungen vom 25.09.2026.
   * Das Glossar entsteht aus Fassung A und liegt jeder Fassung bei (derselbe Baustein).
   */
  if (bilingualAktiv(worksheetMetaFor(exam))) {
    fassungen.forEach((teile, f) =>
      teile.forEach((part, i) => {
        const befunde = checkBilingualOperatoren({ id: part.id, label: part.label, blocks: part.blocks }, worksheetMetaFor(exam, part))
        if (befunde.length) notes.push(`${anzahl > 1 ? `Fassung ${label(f)}, ` : ''}Teil ${i + 1} – Operatoren: ${befunde.map((b) => b.message).join(' ')}`)
      })
    )
    notes.push(`Prüfungssprache: ${PRUEFUNGSSPRACHE_HINWEIS}`)
    onProgress('Das zweisprachige Glossar wird erstellt …')
    try {
      const glossar = await glossarFuerArbeit(exam, fassungen[0], ai)
      const letzter = parts.length - 1
      if (glossar && letzter >= 0) {
        for (const teile of fassungen) teile[letzter] = { ...teile[letzter], blocks: [...teile[letzter].blocks, structuredClone(glossar)] }
      } else notes.push('Das zweisprachige Glossar blieb leer – bitte in Schritt 2 einen Baustein „Nützliche Ausdrücke“ ergänzen.')
    } catch {
      notes.push('Das zweisprachige Glossar konnte nicht erstellt werden – bitte in Schritt 2 einen Baustein „Nützliche Ausdrücke“ ergänzen.')
    }
  }

  // Die geprüften Fassungen wieder zu Teilen zusammensetzen: A in `blocks`, B/C daneben
  let result: Exam = {
    ...exam,
    parts: parts.map((p, i) =>
      fassungen.slice(1).reduce((teil, teile, k) => mitBloecken(teil, k + 1, teile[i].blocks), { ...p, blocks: fassungen[0][i].blocks })
    )
  }
  if (materialNotizen.length) {
    result.meta = {
      ...result.meta,
      teacherNote: [result.meta.teacherNote, `Originalmaterial: ${materialNotizen.join(' | ')}`].filter(Boolean).join('\n')
    }
  }

  // Oberstufe: Das Material muss echt sein. Die Wortlaute werden gegen die angegebene
  // Fundstelle geprüft und Bilder aus Wikimedia Commons geholt – nie KI-erzeugt.
  if (upperSecondary(exam.meta)) {
    const blocks = result.parts.flatMap((p) => alleFassungen(p).flat())
    const meta = worksheetMetaFor(exam)
    try {
      onProgress('Originalquellen werden geprüft …')
      const found = await completeOriginalSources(blocks, browserSourceServices(), (done, total) =>
        onProgress(`Originalquellen werden geprüft (${done} von ${total}) …`)
      )
      onProgress('Bildquellen werden gesucht …')
      // Bilder, die die Lerngruppe von Arbeitsblättern zum selben Thema kennt, kommen zuerst:
      // Dasselbe Motiv in Übung und Abfrage wirkt als Abrufhilfe (Schneider u. a. 2020).
      const reuse = await worksheetImagePool(meta.subjectId, meta.topic, meta.grade)
      const images = await completeWorksheetImages(
        blocks,
        meta,
        { ...(await browserWorksheetImageDeps(opts.bild ? { ai, bild: opts.bild } : undefined)), reuse },
        (message) => onProgress(message)
      )
      const hinweise = [
        found.texts ? `${found.texts} Textquelle(n) geprüft – Wortlaut und Fundstelle vor dem Einsatz kontrollieren.` : '',
        images.web || images.missing || images.reused
          ? `Bilder: ${images.web} aus dem Internet${images.reused ? `, ${images.reused} aus einem Arbeitsblatt derselben Klasse übernommen (bekanntes Motiv hilft beim Abruf)` : ''}${images.missing ? `, ${images.missing} noch auszuwählen` : ''}.`
          : ''
      ].filter(Boolean)
      if (hinweise.length) {
        result.meta = {
          ...result.meta,
          teacherNote: [result.meta.teacherNote, `Oberstufe – nur Originalmaterial: ${hinweise.join(' ')}`].filter(Boolean).join('\n')
        }
      }
    } catch (e) {
      result.meta = {
        ...result.meta,
        teacherNote: [result.meta.teacherNote, `Die Originalquellen konnten nicht geprüft werden: ${e instanceof Error ? e.message : String(e)}`]
          .filter(Boolean)
          .join('\n')
      }
    }
  }

  // Abschluss der Fassungen: übernommenes Material auf den Stand von A, gleiche Punkte
  result = { ...result, parts: result.parts.map((p, i) => fassungenAbschliessen(exam, p, i, notes, label)) }

  /*
   * Zuordnung der Höraufgaben zum Hörtext – ABSCHLIESSEND und für JEDE Fassung.
   *
   * Die Nachbesserung ersetzt die Bausteine eines Teils durch frisch erzeugte. Die Zuordnung
   * aus der Prüfschleife galt dann für Bausteine, die es nicht mehr gibt: In der fertigen Arbeit
   * stand bei keiner einzigen Höraufgabe, zu welchem Hörtext sie gehört. Aufgefallen ist das
   * erst im Lauf mit echter KI. Deshalb hier am Ende, wo jeder Weg vorbeikommt – und seit es
   * Fassungen gibt, für jede von ihnen: Fassung B hat ihre eigenen Höraufgaben.
   */
  for (const part of result.parts) for (const liste of alleFassungen(part)) linkListeningTasks(liste)

  if (notes.length) {
    result.meta = { ...result.meta, teacherNote: [result.meta.teacherNote, `Prüfung der Arbeit: ${notes.join(' | ')}`].filter(Boolean).join('\n') }
  }

  onProgress('fertig')
  return result
}

/**
 * Prüfung und Nachbesserung EINER Fassung.
 *
 * Bis 25.09.2026 stand diese Schleife direkt in `generateExam` und kannte nur die eine
 * Fassung. Mit A/B muss sie für jede laufen – sonst ginge Fassung B ungeprüft hinaus.
 */
async function pruefeFassung(
  exam: Exam,
  teile: ExamPart[],
  fassung: number,
  praefix: string,
  ai: AiCall,
  onProgress: ExamProgress,
  notes: string[]
): Promise<ExamPart[]> {
  const out = [...teile]
  for (let i = 0; i < out.length; i++) {
    const part = out[i]
    // Hörverstehen: Erst die Aufgaben ihrem Hörtext zuordnen, dann prüfen – sonst liefe
    // die Lösungsprüfung gegen alle Skripte des Teils zugleich.
    linkListeningTasks(part.blocks)
    const sheet: Sheet = { id: part.id, label: part.label, blocks: part.blocks }
    /*
     * Auch der Wortlaut der Einzelfragen wird geprüft – dieselbe Prüfung wie beim
     * Arbeitsblatt. Die Klassenarbeit hat eine EIGENE Prüfkette; ohne diese Zeile gälte die
     * Regel nur nebenan, und genau daran ist in diesem Projekt schon mehrfach etwas
     * durchgerutscht. Die Meldungen sind Hinweise, keine schweren Mängel: Sie landen in den
     * Lehrkraft-Notizen, lösen aber keine Neuerzeugung aus.
     */
    const teilMeta = worksheetMetaFor(exam, part)
    const wortlaut = [
      ...checkItemWording(sheet, teilMeta),
      ...checkTrueFalseEvidence(sheet, teilMeta),
      ...checkClosedFormatsHistory(sheet, teilMeta),
      ...checkSourceHeaders(sheet, teilMeta),
      ...checkNarration(sheet, teilMeta)
    ]
    if (wortlaut.length) notes.push(`${praefix}Teil ${i + 1} – Fragewortlaut: ${wortlaut.map((w) => w.message).join(' ')}`)
    /*
     * Verweise gegen die GANZE Fassung prüfen: Die App nummeriert das Material über alle Teile
     * hinweg (render/examWorksheet.ts setzt sie auf ein Blatt). Ein „M3" in Teil 2 kann in Teil 1
     * stehen – gemeldet wurde es trotzdem als fehlend (Paket 12, 26.09.2026).
     */
    const findings = checkIntegrity(
      sheet,
      out.flatMap((p) => p.blocks)
    )
    if (!findings.length) continue
    const severe = findings.filter((f) => f.severity === 'hoch')
    if (severe.length) {
      onProgress(`${praefix}Teil ${i + 1} wird nachgebessert …`)
      try {
        let blocks = await reviseExamPart(exam, part, i + 1, `Behebe diese Mängel: ${severe.map((f) => f.message).join(' ')}`, ai)
        // Weitere Fassung mit übernommenem Material: Das Material bleibt, nur die Aufgaben sind neu
        if (fassung > 0 && materialweg(exam, part) === 'gleich') blocks = uebernimmMaterial(part.blocks, blocks)
        out[i] = { ...part, blocks }
        notes.push(`${praefix}Teil ${i + 1} nachgebessert: ${severe.map((f) => f.message).join(' ')}`)
        continue
      } catch {
        // Konnte nicht nachgebessert werden – der Befund bleibt als Hinweis stehen
      }
    }
    notes.push(`${praefix}Teil ${i + 1}: ${findings.map((f) => f.message).join(' ')}`)
  }
  return out
}

/**
 * Die weiteren Fassungen eines Teils abschließen.
 *
 * - Übernommenes Material (Hörtext, Quelle) wird aus Fassung A neu eingesetzt. Hat die
 *   Nachbesserung Fassung A ersetzt oder die Oberstufenprüfung ihr Material ergänzt, stünde
 *   in B sonst ein anderer Hörtext als in A – bei einem Text, der der ganzen Klasse vorgespielt
 *   wird, ein grober Fehler.
 * - Punkte: Fassung A auf die Punkte des Teils (`punkteAufTeil`), die weiteren Fassungen
 *   übernehmen sie als Zusage (model/fassungen.ts, `gleichePunkte`).
 */
function fassungenAbschliessen(exam: Exam, part: ExamPart, index: number, notes: string[], label: (f: number) => string): ExamPart {
  // Die Nachbesserung kann Fassung A ersetzt haben – ihre Punkte erst wieder auf den Teil bringen
  punkteAufTeil(part.blocks, part.points)
  if (!part.weitereFassungen?.length) return part
  const gleich = materialweg(exam, part) === 'gleich' && part.blocks.some((b) => b.type === 'task')
  const weitere = part.weitereFassungen.map((liste, k) => {
    const neu = gleich ? uebernimmMaterial(part.blocks, liste) : liste
    const hinweis = gleichePunkte(part.blocks, neu)
    if (hinweis) notes.push(`Fassung ${label(k + 1)}, Teil ${index + 1}: ${hinweis}`)
    return neu
  })
  return { ...part, weitereFassungen: weitere }
}
