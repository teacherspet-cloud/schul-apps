/**
 * Erzeugung der Klassenarbeit.
 *
 * Jeder Teil der Arbeit wird einzeln erzeugt: So bleibt jede Anfrage klein, und die Vorgaben
 * des Formats (Kompetenz, Aufgabenformate, Punkte, Anforderungsbereiche) lassen sich genau
 * übergeben. Für Material und Aufgaben werden dieselben Bausteine und derselbe Schemaaufbau
 * verwendet wie im Arbeitsblatt – dadurch funktionieren Darstellung, Seitenumbruch und Export
 * unverändert weiter.
 */
import { schreibGrammatikRegeln } from '../didactics/schreibGrammatik'
import { fachRegeln, mitProtokoll, versuchFuerArbeit } from './fachRegeln'
import { fachDerArbeit, formatArt, inhaltsanteil, sprachfolge, zweiterTeil } from '../model/faecher'
import type { Quellentreffer, StructuredRequest } from '@shared/types'
import { obj, str } from '../../../shared/aiSchema'
import { createRng, newId, randomSeed } from '../../vokabeltest/model/random'
import { comprehensionFormatById, defaultComprehensionFormats } from '../../arbeitsblatt/didactics/comprehensionFormats'
import { buildLearnerProfile, stageForGrade } from '../../arbeitsblatt/didactics/profile'
import { browserWorksheetImageDeps, worksheetImagePool } from '../../arbeitsblatt/generation/browserImages'
import { checkIntegrity, verschluesseleMaterialverweise } from '../../arbeitsblatt/didactics/integrity'
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
  type GepruefterTreffer,
  quellenangabeMitAbruf
} from '../../arbeitsblatt/generation/originalmaterial'
import { completeWorksheetImages } from '../../arbeitsblatt/generation/worksheetImages'
import { describeBlock } from '../../arbeitsblatt/generation/describe'
import { SHEET_SCHEMA } from '../../arbeitsblatt/generation/schemas'
import {
  originalMaterialVorgabe,
  originalSourceRules,
  sourceTextWords,
  STUDENT_TEXT_TYPES,
  DEUTSCHE_TEXTSORTEN,
  systemPrompt,
  writingBriefRules,
  writingScaffoldRules
} from '../../arbeitsblatt/generation/prompts'
import { WORTZAHL_GRUND, wortzahlErlaubt } from '../model/examRules'
import { erkenneSprache, schneideZu } from '../../arbeitsblatt/generation/zuschnitt'
import { materialZiel } from '../model/textlaengen'
import { hilfenInsLehrermaterial } from '../model/lernhilfen'
import { defaultMeta } from '../../arbeitsblatt/model/defaults'
import { subjectById } from '../../arbeitsblatt/model/subjects'
import type { LanguageSkill, OriginalMaterialAblage, Sheet, WorksheetMeta, WsBlock } from '../../arbeitsblatt/model/types'
import { CONTENT_SHARE, formatById } from '../model/formats'
import type { Exam, ExamPart } from '../model/types'
import { knownVocabRulesDe } from '../../../shared/knownVocab'
import { bilingualAktiv, checkBilingualOperatoren, PRUEFUNGSSPRACHE_HINWEIS } from '../../arbeitsblatt/didactics/bilingual'
import { glossarFuerArbeit } from './glossar'
import { generateSprechDaten, sprechBausteine } from './sprechpruefung'
import { scriptForSheet, wantsListening, writeListeningScript } from '../../arbeitsblatt/generation/listening'
import type { ListeningScript } from '../../arbeitsblatt/generation/listening'
import { linkListeningTasks } from '../../arbeitsblatt/generation/listening'
import { stoffBilder, type StoffQuelle } from '../../../shared/files/stoffQuelle'
import { blindprobeAktiv, blindprobeBloecke, blindprobeMeldung } from '../../../shared/verstehen/blindprobe'
import {
  alleFassungen,
  bloeckeDerFassung,
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
  const art = formatArt(formatId)
  if (art === 'writing' || art === 'mediation' || art === 'listening' || art === 'reading') return art
  if (art === 'grammar' || art === 'language') return 'grammar'
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
    // KI-Kennzeichnung bis ins Blatt durchreichen (Großprogramm 0.4)
    ki: m.ki,
    kiVermerk: m.kiVermerk,
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
    // Französisch/Spanisch als 2. (oder 3.) Fremdsprache – bestimmt das GER-Niveau und die Sprachwahl
    languageOrder: sprachfolge(m),
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
    // Oberstufe: keine Formhinweise und Notizentabellen bei Schreibaufgaben (27.09.2026)
    ohneSchreibhilfen: upperSecondary(m),
    // Hilfen für Lernende (Rahmenzeile, Teilpunkte) nur auf ausdrücklichen Wunsch – sonst im Erwartungshorizont (01.10.2026)
    lernhilfen: m.lernhilfen === true,
    // Korrektur- und Notizrand wie beim Arbeitsblatt
    correctionMargin: m.correctionMargin,
    notesMargin: m.notesMargin,
    anmerkungen: m.anmerkungen,
    showSchool: m.showSchool,
    aiCanary: m.aiCanary,
    aiCanaryWords: m.aiCanaryWords,
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
  // raster = knapp mit Raster; ausfuehrlichRaster = ausformuliert mit Raster (26.09.2026)
  const knapp = detail === 'raster'
  return [
    `ERWARTUNGSHORIZONT (${knapp ? 'knapp' : 'ausformuliert'}, mit Bewertungsraster):`,
    knapp
      ? '- solution je Aufgabe: Stichpunkte der erwarteten Inhalte (keine ausformulierten Sätze) UND ein Raster mit Punkten je Kriterium.'
      : '- solution je Aufgabe: eine vollständig ausformulierte Musterlösung, wie sie eine gute Arbeit enthielte, UND ein Raster mit Punkten je Kriterium.',
    productive
      ? `- Die Schreibleistung wird getrennt bewertet: ${part.contentShare ?? inhaltsanteil(m.subjectId)} % Inhalt (erwartete Inhaltspunkte, je Punkt ein Kriterium) und ${100 - (part.contentShare ?? inhaltsanteil(m.subjectId))} % ${zweiterTeil(m.subjectId)} (${fachDerArbeit(m.subjectId).art === 'deutsch' ? 'Aufbau, Textsortenmerkmale, Ausdruck, sprachliche Richtigkeit, Zitieren' : 'kommunikative Textgestaltung, Ausdrucksvermögen, Sprachrichtigkeit'}).${part.points > 0 ? ` Verteile die ${part.points} Punkte entsprechend.` : ''} Nenne die Kriterien einzeln.`
      : part.items && part.items > 0
        ? `- GENAU ${part.items} Items, ein Punkt je Item; insgesamt ${part.points} Punkte. Die Lehrkraft hat die Zahl der Items vorgegeben.`
        : `- Nenne die Punkte je Item; insgesamt ${part.points} Punkte.`,
    '- Schreibe das Raster als Liste „Kriterium – Punkte", nicht als Fließtext.'
  ].join('\n')
}

/** Nähere Vorgaben der Lehrkraft für diesen Teil. */
export function partNotes(part: ExamPart): string {
  // Deutsch: Aufsatzformen (Befund D4), sonst die Textsorten der Fremdsprachen
  const textType = [...STUDENT_TEXT_TYPES, ...DEUTSCHE_TEXTSORTEN].find((t) => t.value === part.studentTextType && t.value)
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
  const art = formatArt(part.formatId)
  if (art !== 'writing' && art !== 'mediation') return ''
  const meta = worksheetMetaFor(exam, part)
  return [
    writingBriefRules(meta),
    // Grammatik ausdrücklich mitprüfen (29.09.2026) – nur im Schreibteil
    art === 'writing' ? schreibGrammatikRegeln(exam, part) : '',
    /*
     * Oberstufe (Befund der Lehrkraft, 27.09.2026): Eine Klausuraufgabe im 13. Jahrgang trug
     * „Use an appropriate salutation and closing · Organise the email in clear paragraphs" –
     * Hilfen, die dort Teil der geprüften Leistung sind. Formhinweise und Notizentabelle entfallen.
     */
    upperSecondary(exam.meta)
      ? '- OBERSTUFE: brief.form und brief.notes bleiben LEER – keine Formhinweise (Anrede, Grußformel, Absätze) und keine Notizentabelle; Textsortenkompetenz ist Teil der Leistung. Die Inhaltspunkte (brief.points) sind knappe Teilaufgaben mit Operator, ohne Erläuterung oder Tipp.'
      : '',
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

/**
 * Material FÜR die Arbeit (27.09.2026): die aktiven Quellen aus dem Kasten unter „Aufbau der
 * Arbeit". Das erste mit Text wird bei textgebundenen Teilen (Lesen, Quelle, Mediation) wie ein
 * beschaffter Originaltext von der APP eingesetzt; alle gehen als Grundlage in den Auftrag.
 */
export function arbeitsmaterialQuellen(exam: Exam): StoffQuelle[] {
  /*
   * Befund 29.09.2026: Der Filter verlangte Text – Scans und Fotos ohne Textebene (etwa ein
   * gescannter Klassenarbeitsvorschlag des Verlags) fielen dadurch STILLSCHWEIGEND heraus, und
   * ihre Seitenbilder gingen nie an die KI. Jetzt zählt auch eine Quelle, die nur Bilder hat;
   * die Bilder hängt `unterlagenBilder` an jede Anfrage.
   */
  return (exam.meta.arbeitsmaterial ?? []).filter((q) => q.aktiv && (q.text.trim() || (q.bilder?.length ?? 0) > 0))
}

/** Die Kopfzeilen, die `urlQuelle` dem Text einer Webseite voranstellt, abschneiden */
export const ohneWebseitenKopf = (text: string): string => text.replace(/^\s*(?:(?:Webseite|Adresse|Titel):[^\n]*\n?)+\s*/i, '').trim()

/** Das erste Material als Ablage, wie sie `materialBausteine` versteht – die App setzt es wörtlich ein */
export function arbeitsmaterialAblage(exam: Exam): OriginalMaterialAblage | null {
  // Wörtlich einsetzen lässt sich nur Text – ein Scan ohne Textebene geht als Bild an die KI (29.09.2026)
  const q = arbeitsmaterialQuellen(exam).find((x) => x.text.trim())
  if (!q) return null
  const titel = q.fileName.replace(/\.[^.]+$/, '').trim() || 'Material'
  return {
    titel,
    urheber: '',
    url: q.url ?? '',
    // Die Kopfzeilen der Webseite („Webseite: …", „Adresse: …") sind Auskunft für die KI, kein Lesetext (27.09.2026)
    text: ohneWebseitenKopf(q.text),
    // Ohne „Quelle:" – das Wort setzt die Darstellung selbst davor; die volle Angabe ermittelt `quellenangabenErmitteln`
    quellenangabe: q.quellenangabe || q.url || `Material der Lehrkraft: ${q.fileName}`,
    hinweis: '',
    protokoll: [],
    wortlautGeprueft: true
  }
}

const QUELLENANGABE_SCHEMA = obj({
  urheber: str('Verfasser bzw. Urheber des Textes – leer, wenn nicht erkennbar'),
  titel: str('Titel des Textes'),
  publikationsort: str('Zeitung, Zeitschrift, Webseite oder Verlag'),
  datum: str('Erscheinungsdatum, so genau wie erkennbar – leer, wenn unbekannt')
})

/**
 * Vollständige Quellenangabe für Material FÜR die Arbeit (Befund der Lehrkraft vom 27.09.2026:
 * „die Quellenangaben sind weiterhin nur die URL"). Die KI liest Urheber, Titel, Publikationsort
 * und Datum aus dem Text; Fundort und Abrufdatum setzt die App – dasselbe Format wie bei
 * beschafften Originaltexten (`quellenangabeMitAbruf`). Ermittelt wird einmal je Quelle; die
 * Angabe bleibt an der Quelle und lässt sich am Baustein bearbeiten.
 */
export async function quellenangabenErmitteln(quellen: StoffQuelle[], ai: AiCall): Promise<StoffQuelle[]> {
  return Promise.all(
    quellen.map(async (q) => {
      if (!q.url || q.quellenangabe || !q.text.trim()) return q
      try {
        const d = await ai<{ urheber?: string; titel?: string; publikationsort?: string; datum?: string }>({
          system:
            'Du ermittelst bibliografische Angaben zu einem Text von einer Webseite. Erfinde nichts: Was im Text oder in der Adresse nicht steht, bleibt leer.',
          user: [`Adresse: ${q.url}`, `Dateiname bzw. Seitentitel: ${q.fileName}`, 'TEXT (Anfang):', q.text.slice(0, 2500)].join('\n'),
          schemaName: 'material_quellenangabe',
          schema: QUELLENANGABE_SCHEMA
        })
        const titel = (d?.titel ?? '').trim() || q.fileName.replace(/\.[^.]+$/, '').trim()
        const angabe = [(d?.urheber ?? '').trim(), titel ? `„${titel}“` : '', (d?.publikationsort ?? '').trim(), (d?.datum ?? '').trim()]
          .filter(Boolean)
          .join(', ')
        return { ...q, quellenangabe: quellenangabeMitAbruf(angabe, { url: q.url, titel, urheber: (d?.urheber ?? '').trim() } as Quellentreffer) }
      } catch {
        return q
      }
    })
  )
}

/**
 * Das Material der Lehrkraft für EINEN Teil (01.10.2026) – nach der Sprache des Textes.
 *
 * Vorher bekam jeder textgebundene Teil das erste Material: Eine deutsche Seite für die
 * Sprachmittlung stand dann auch als Lesetext im Leseverstehen. Jetzt gilt: Sprachmittlung nimmt
 * einen deutschen Text, Leseverstehen einen in der Zielsprache. Lässt sich die Sprache nicht
 * erkennen (kurzer Text), gilt das Material für jeden Teil wie bisher.
 */
export function arbeitsmaterialFuerTeil(exam: Exam, part: Pick<ExamPart, 'formatId'>): StoffQuelle | null {
  const mitText = arbeitsmaterialQuellen(exam).filter((q) => q.text.trim())
  if (!mitText.length) return null
  const fach = subjectById(exam.meta.subjectId)
  if (!fach.foreignLanguage) return mitText[0]
  const gewuenscht = materialSprache(fach, formatArt(part.formatId) === 'mediation')
  const kandidaten = [...new Set(['de', fach.foreignLanguage])]
  const sprache = (q: StoffQuelle): string => erkenneSprache(ohneWebseitenKopf(q.text), kandidaten)
  return mitText.find((q) => sprache(q) === gewuenscht) ?? mitText.find((q) => !sprache(q)) ?? null
}

/**
 * Roter Faden (01.10.2026): Alle Teile einer Arbeit beziehen sich auf dasselbe Thema. Steht in
 * jedem Teilauftrag und im Auftrag zum Zuschnitt des Materials.
 */
export function roterFaden(exam: Exam, part?: Pick<ExamPart, 'id'>): string {
  if (exam.parts.length < 2) return ''
  const material = arbeitsmaterialQuellen(exam).find((q) => q.text.trim())
  return [
    'ROTER FADEN – DIE ARBEIT HAT EIN DURCHGEHENDES THEMA:',
    `- Alle Teile beziehen sich auf das Thema „${exam.meta.topic}“ und greifen verschiedene Seiten davon auf – Leseverstehen, Sprachmittlung und Schreiben bauen aufeinander auf, ohne sich zu wiederholen.`,
    material ? `- Gemeinsamer Bezugspunkt ist das Material der Lehrkraft („${material.fileName}“). Die Sprachmittlung nutzt die für ihre Aufgabe relevanten Abschnitte; Lese- und Schreibteil bleiben beim selben Thema.` : '',
    `- Teile der Arbeit: ${exam.parts.map((p, i) => `${i + 1}. ${p.label}${part && p.id === part.id ? ' (dieser Teil)' : ''}`).join('; ')}.`
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Material der Lehrkraft von einer Internetadresse auf die Länge des Teils zuschneiden
 * (01.10.2026): wörtlich, am Thema der ganzen Arbeit ausgerichtet, mit Einleitungssatz und
 * Quellenangabe „(gekürzt)". Dateien der Lehrkraft (ohne Adresse) bleiben unverändert – sie hat
 * sie selbst zusammengestellt.
 */
export async function materialFuerTeil(
  exam: Exam,
  part: ExamPart,
  ai: AiCall,
  opts: { netzsuche?: (auftrag: string) => Promise<{ titel: string; url: string; auszug: string }[]>; fortschritt?: (t: string) => void } = {}
): Promise<OriginalMaterialAblage | null> {
  const q = arbeitsmaterialFuerTeil(exam, part)
  if (!q) return null
  if (!q.url) return { ...arbeitsmaterialAblage({ ...exam, meta: { ...exam.meta, arbeitsmaterial: [q] } })! }
  const fach = subjectById(exam.meta.subjectId)
  const mediation = formatArt(part.formatId) === 'mediation'
  const text = ohneWebseitenKopf(q.text)
  const sprache = erkenneSprache(text, [...new Set(['de', fach.foreignLanguage ?? 'de'])]) || materialSprache(fach, mediation)
  const format = formatById(part.formatId)
  const r = await schneideZu(
    {
      text,
      seitentitel: q.fileName,
      url: q.url,
      quellenangabe: q.quellenangabe,
      ziel: materialZiel(exam, part),
      thema: exam.meta.topic,
      leitgedanke: [roterFaden(exam, part), exam.meta.content ? `Inhalte der Unterrichtseinheit: ${exam.meta.content}` : ''].filter(Boolean).join('\n'),
      teil: part.label,
      aufgabe: format?.description,
      sprache,
      ...(fach.foreignLanguage ? { zielsprache: fach.foreignLanguage } : {}),
      fach: exam.meta.subjectLabel,
      jahrgang: exam.meta.grade,
      mediation
    },
    ai,
    opts
  )
  return r.ablage
}

/** Textgebundene Teile: Dort steht das Material der Lehrkraft als Lesetext auf der Arbeit */
/** Formate, deren Material eine echte, zu analysierende Quelle ist (Begründung bei `brauchtOriginaltext`) */
const QUELLENFORMATE = ['ge-source', 'ge-comparison', 'pol-text', 'de-textanalyse', 'de-gedicht', 'de-sachtext']
/** Fremdsprachen: Leseverstehen und Sprachmittlung jeder Sprache */
function istQuellenformat(formatId: string): boolean {
  return QUELLENFORMATE.includes(formatId) || ['reading', 'mediation'].includes(formatArt(formatId) ?? '')
}
export const textgebunden = (part: Pick<ExamPart, 'formatId'>): boolean => istQuellenformat(part.formatId)

/** Auftragsteil: Material der Lehrkraft als Grundlage (Schreib-, Mediations- und andere Teile) */
export function arbeitsmaterialTeil(exam: Exam, part: ExamPart): string {
  const quellen = arbeitsmaterialQuellen(exam)
  if (!quellen.length) return ''
  const eingesetzt = textgebunden(part)
  const out = [
    'MATERIAL FÜR DIE ARBEIT (von der Lehrkraft beigefügt – wird in der Arbeit VERWENDET):',
    eingesetzt
      ? '- Das erste Material setzt die App als Lesetext dieses Teils wörtlich ein (mit Quellenangabe). Plane die Aufgaben zu DIESEM Text; gib ihn nicht wieder.'
      : '- Dieser Teil baut auf dem Material auf: Die Schreib- bzw. Mediationsaufgabe bezieht sich inhaltlich darauf (Sachverhalt, Standpunkte, Angaben). Zitiere daraus nur kurz mit Angabe; ein Lesetext wird hier nicht abgedruckt.',
    '- Nichts erfinden, was das Material nicht hergibt.'
  ]
  for (const q of quellen) {
    out.push(`--- ${q.fileName}${q.url ? ` (${q.url})` : ''} ---`)
    // Scan oder Foto ohne Textebene: Der Inhalt kommt über das Bild (29.09.2026)
    out.push(q.text.trim() ? q.text.trim().slice(0, 8000) : '(Scan bzw. Foto ohne auslesbaren Text – der Inhalt steht im beigefügten Bild; lies ihn von dort)')
  }
  return out.join('\n')
}

/**
 * Die Seitenbilder als Zusatz einer Anfrage (leer, wenn es keine gibt).
 *
 * Seit 29.09.2026 auch die Bilder des Materials FÜR die Arbeit – zuerst, weil es in der Arbeit
 * verwendet wird; die Unterlagen aus dem Unterricht füllen bis zur Obergrenze auf. Vorher gingen
 * gescannte Arbeitsmaterialien gar nicht an die KI.
 */
export function unterlagenBilder(exam: Exam): { images?: string[] } {
  // Nur Material ohne Text: Bei einer digitalen PDF steht der Inhalt schon als Text im Auftrag
  const material = stoffBilder(
    (exam.meta.arbeitsmaterial ?? []).filter((q) => !q.text.trim()),
    6
  )
  const images = [...material, ...stoffBilder(exam.meta.materialQuellen, 8 - material.length)].slice(0, 8)
  return images.length ? { images } : {}
}

/** Auftrag für einen Teil der Arbeit. */
export function partPrompt(exam: Exam, part: ExamPart, number: number, material?: OriginalMaterialAblage | null): string {
  const m = exam.meta
  const format = formatById(part.formatId)
  const productive = typeof part.contentShare === 'number'
  const formats = (
    part.formats?.length ? part.formats : defaultComprehensionFormats(formatArt(part.formatId) === 'listening' ? 'listening' : 'reading', m.grade)
  )
    .map((id) => comprehensionFormatById(id)?.label)
    .filter(Boolean)
  return [
    `Erstelle Teil ${number} einer Klassenarbeit im Fach ${m.subjectLabel}.`,
    `Thema der Arbeit: ${m.topic}`,
    roterFaden(exam, part),
    m.content ? `Inhalte der Unterrichtseinheit, auf die sich die Arbeit bezieht: ${m.content}` : '',
    unterlagenTeil(exam),
    arbeitsmaterialTeil(exam, part),
    `Teil ${number}: ${format?.label ?? part.label} – Kompetenzbereich ${part.competence}.`,
    format?.description ? `Was der Teil verlangt: ${format.description}` : '',
    `Bearbeitungszeit für diesen Teil: ${part.minutes} Minuten.`,
    productive
      ? part.points > 0
        ? `Dieser Teil hat ${part.points} Punkte: ${part.contentShare ?? inhaltsanteil(m.subjectId)} % für den Inhalt, ${100 - (part.contentShare ?? inhaltsanteil(m.subjectId))} % für die ${zweiterTeil(m.subjectId)}. Nenne die Punkte im Erwartungshorizont.`
        : `Dieser Teil wird nicht über Punkte bewertet, sondern zu ${part.contentShare ?? CONTENT_SHARE} % über den Inhalt und zu ${100 - (part.contentShare ?? CONTENT_SHARE)} % über die Sprache. Vergib in answer keine Punkte.`
      : part.items && part.items > 0
        ? `Dieser Teil hat GENAU ${part.items} Items und ${part.points} Punkte – ein Punkt je Item. Die Lehrkraft hat die Zahl vorgegeben; halte sie ein und nenne die Punkte je Aufgabe im Feld points.`
        : `Dieser Teil hat insgesamt ${part.points} Punkte. Verteile sie auf die Items und nenne die Punkte je Aufgabe im Feld points.`,
    ['listening', 'reading'].includes(formatArt(part.formatId) ?? '') && formats.length ? `Benutze diese Aufgabenformate: ${formats.join(', ')}.` : '',
    `Erlaubte Hilfsmittel: ${m.aids || 'keine'}.`,
    vocabRules(exam),
    partNotes(part),
    // Fächer vom 29.09.2026: Mathematik (Teil A/B), Latein/Griechisch (Fehlerquote), NaWi (Versuch), Informatik, Musik/Kunst, Werte-Fächer
    fachRegeln(exam, part),
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
// QUELLENFORMATE und istQuellenformat stehen weiter oben (vor `textgebunden`)

/**
 * Braucht dieser Teil einen beschafften Originaltext?
 *
 * Nur in der Oberstufe: Dort darf kein von einer KI erfundenes Material verwendet werden.
 * In der Sekundarstufe I bleibt es beim bisherigen Weg.
 */
export function brauchtOriginaltext(exam: Exam, part: ExamPart): boolean {
  return upperSecondary(exam.meta) && istQuellenformat(part.formatId)
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
  if (formatArt(part.formatId) === 'listening' && wantsListening(meta)) {
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
  // Versuchsteil (29.09.2026): Protokollvorlage hinter die Aufgabe „protokollieren"
  const blocks = mitProtokoll(
    exam,
    part,
    (res.blocks ?? [])
      .map((b) => convertBlock(b, rng, []))
      .filter((b): b is WsBlock => Boolean(b))
      .map((b) => (b.type === 'task' ? { ...b, id: b.id || newId(rng) } : b))
  )
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
  // Sprechprüfung: Karten und Prüferbogen neu, der Wunsch geht als Vorgabe der Lehrkraft mit
  if (formatArt(part.formatId) === 'speaking') {
    const teil = { ...part, notes: [part.notes, `Änderungswunsch (hat Vorrang): ${instruction}`].filter(Boolean).join('\n') }
    return sprechBausteine(exam, part, await generateSprechDaten(exam, teil, ai))
  }
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

export async function generateExam(examEingabe: Exam, ai: AiCall, onProgress: ExamProgress = () => undefined, opts: ExamOptions = {}): Promise<Exam> {
  // Versuch mit Protokoll (29.09.2026): einmal ausarbeiten, alle Fassungen protokollieren denselben Versuch
  if (examEingabe.meta.versuch?.aktiv && !examEingabe.meta.versuch.daten) onProgress('Die KI arbeitet den Versuch aus …')
  let exam = await versuchFuerArbeit(examEingabe, ai)
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
     * Sprechprüfung (01.10.2026): eigener Weg – Karten, Prüferbogen und Raster aus EINER Anfrage
     * für alle Kartensätze. Die Kartensätze ersetzen die Fassungen; jede Fassung zeigt denselben Teil.
     */
    if (formatArt(part.formatId) === 'speaking') {
      onProgress(`Teil ${i + 1} von ${exam.parts.length}: ${part.label} – Karten und Prüferbogen …`)
      const sprechDaten = await generateSprechDaten(exam, part, ai)
      const sprechBloecke = sprechBausteine(exam, part, sprechDaten)
      let fertig: ExamPart = { ...part, sprechDaten, blocks: sprechBloecke }
      for (let f = 1; f < anzahl; f++) fertig = mitBloecken(fertig, f, structuredClone(sprechBloecke))
      parts.push(fertig)
      continue
    }

    /*
     * Oberstufe: Der Ausgangstext wird beschafft, BEVOR die Aufgaben entstehen.
     *
     * Vorgabe der Lehrkraft (24.09.2026): In Sek II duerfen nur Originalquellen verwendet
     * werden, und eine Klausur darf NICHT auf einen KI-Text ausweichen. Findet sich nichts,
     * bleibt dieser eine Teil offen – die uebrigen entstehen normal.
     */
    let material: OriginalMaterialAblage | null = null
    let blocks: WsBlock[] | null = null
    // Material der Lehrkraft (27.09.2026) hat Vorrang vor jeder Suche: Bei textgebundenen Teilen wird es als Lesetext eingesetzt
    if (textgebunden(part) && arbeitsmaterialQuellen(exam).some((q) => q.url && !q.quellenangabe)) {
      onProgress(`Teil ${i + 1}: Quellenangabe des Materials wird ermittelt …`)
      exam = { ...exam, meta: { ...exam.meta, arbeitsmaterial: await quellenangabenErmitteln(exam.meta.arbeitsmaterial ?? [], ai) } }
    }
    /*
     * Material von einer Internetadresse wird auf die Länge des Teils zugeschnitten (01.10.2026):
     * wörtlich, am Thema der ganzen Arbeit ausgerichtet, Sprachmittlung mit deutschem Text.
     */
    const eigenes = textgebunden(part)
      ? await materialFuerTeil(exam, part, ai, {
          netzsuche: browserMaterialDienste(opts.websuche).netzsuche,
          fortschritt: (t) => onProgress(`Teil ${i + 1}: ${t}`)
        }).catch(() => arbeitsmaterialAblage(exam))
      : null
    if (eigenes) {
      material = eigenes
      materialNotizen.push(
        `Teil ${i + 1} (${part.label}): Material der Lehrkraft „${eigenes.titel}" als Lesetext eingesetzt.${eigenes.protokoll.length ? ` ${eigenes.protokoll.join(' ')}` : ''}`
      )
    } else if (brauchtOriginaltext(exam, part)) {
      const teilMeta = worksheetMetaFor(exam, part)
      const ergebnis = await beschaffeOriginalmaterial({
        wunsch: {
          thema: [exam.meta.topic, part.label].filter(Boolean).join(' – '),
          fach: exam.meta.subjectLabel,
          fachId: exam.meta.subjectId,
          sprache: materialSprache(subjectById(exam.meta.subjectId), formatArt(part.formatId) === 'mediation'),
          jahrgang: exam.meta.grade,
          zielWortzahl: sourceTextWords(teilMeta),
          // Klausur: kein Ausweichen auf einen Autorentext
          pruefung: true,
          /*
           * Ablehnungen gelten für das Thema der ARBEIT, nicht für „Thema – Teil" (01.10.2026):
           * Eine in „Mediation" aussortierte Seite soll auch im Teil „Reading" nicht wiederkommen.
           */
          kernthema: exam.meta.topic,
          lernziel: teilMeta.learningGoals,
          mediation: formatArt(part.formatId) === 'mediation'
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
    // Nummern der KI werden zu Kennungen, gezählt über alle bisherigen Teile (die Nummern laufen über die ganze Arbeit)
    blocks = verschluesseleMaterialverweise(blocks, [...parts.flatMap((p) => p.blocks), ...blocks])
    // Punkte VOR den weiteren Fassungen angleichen – ihr Auftrag nennt die Punkte der Vorlage
    punkteAufTeil(blocks, part.points)
    let fertig: ExamPart = { ...part, blocks }
    for (let f = 1; f < anzahl; f++) {
      onProgress(`Teil ${i + 1} von ${exam.parts.length}: ${part.label} (Fassung ${label(f)}) …`)
      const r = await generateParallelPart(exam, part, i + 1, f, blocks, ai, material)
      fertig = mitBloecken(fertig, f, verschluesseleMaterialverweise(r.blocks, [...parts.flatMap((p) => bloeckeDerFassung(p, f)), ...r.blocks]))
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

  /*
   * Ohne „Hilfen für Lernende" (Voreinstellung der Klassenarbeit, 01.10.2026): Teilpunkte, die die
   * KI trotz Auftrag als Teilaufgaben oder Aufzählung geliefert hat, wandern in den Erwartungshorizont.
   */
  if (!exam.meta.lernhilfen) {
    result = {
      ...result,
      parts: result.parts.map((p) => ({
        ...p,
        blocks: hilfenInsLehrermaterial(p.blocks),
        ...(p.weitereFassungen ? { weitereFassungen: p.weitereFassungen.map(hilfenInsLehrermaterial) } : {})
      }))
    }
  }

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
    // Sprechprüfung: Karten und Prüferbogen sind keine Aufgaben mit Material – die Prüfkette passt nicht
    if (formatArt(part.formatId) === 'speaking') continue
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
  // Ankreuzfragen zu Texten (01.10.2026): Blindprobe ohne Text, Lösbares neu fassen (shared/verstehen/blindprobe.ts)
  if (blindprobeAktiv())
    for (let i = 0; i < out.length; i++) {
      if (formatArt(out[i].formatId) === 'speaking') continue
      const b = await blindprobeBloecke(out[i].blocks, ai, { melde: (m) => onProgress(`${praefix}Teil ${i + 1}: ${m}`) }).catch(() => null)
      if (!b?.geprueft) continue
      out[i] = { ...out[i], blocks: b.bloecke }
      if (b.ersetzt || b.markiert) notes.push(`${praefix}Teil ${i + 1} – Ankreuzfragen: ${blindprobeMeldung(b)}`)
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
