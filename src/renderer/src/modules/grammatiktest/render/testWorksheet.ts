/**
 * Der Grammatiktest als Arbeitsblatt-Datenstruktur.
 *
 * Darstellung, Seitenumbruch, Druck und Word-Export sind im Arbeitsblatt gelöst; der Test wird
 * deshalb in dieselbe Struktur übersetzt – wie schon die Klassenarbeit.
 *
 * Der Notenschlüssel und das Fehlerprofil stehen im Lösungsteil: Beides gehört zur Lehrkraft.
 * Auf das Schülermaterial kommt der Schlüssel nur, wenn sie es ausdrücklich möchte.
 */
import { platziereKopfUndSchluss } from '../../arbeitsblatt/generation/illustrationen'
import { chosenGrammarTopics } from '../../arbeitsblatt/didactics/grammar'
import { defaultMeta } from '../../arbeitsblatt/model/defaults'
import type { Sheet, Worksheet, WorksheetMeta, WsBlock } from '../../arbeitsblatt/model/types'
import type { GrammarTest } from '../model/types'
import { istVerbTest, testPoints } from '../model/types'
import { TITEL } from '../../../shared/verben/formate'
import { gradeScaleLine } from '../../../shared/gradeScale'
import { notenpunkteFuer, punkteZeile } from '../../../shared/notenpunkte'

/** Kopfkasten: Zeit, Punkte und – auf Wunsch – der Notenschlüssel. `gruppe` = „A"/„B" bei zwei Fassungen. */
export function testHeadBlock(test: GrammarTest, gruppe = ''): WsBlock | null {
  const m = test.meta
  if (!m.infoBox) return null
  const english = m.subjectId === 'englisch'
  const points = testPoints(test) || m.points
  const topics = chosenGrammarTopics({ ...m, grammarTopics: m.topics } as never)
  // Unregelmäßige Verben (30.09.2026): Schwerpunkt ist die Liste, nicht ein Grammatikthema
  const verben = istVerbTest(test) ? `${TITEL[m.verben!.sprache]}${m.verben!.listenName && m.verben!.quelle === 'lehrwerk' ? ` (${m.verben!.listenName})` : ''}` : ''
  const lines = [
    gruppe ? (english ? `Group ${gruppe}` : `Gruppe ${gruppe}`) : '',
    english ? `Time: ${m.minutes} minutes` : `Bearbeitungszeit: ${m.minutes} Minuten`,
    english ? `${points} points` : `${points} Punkte`,
    // Die geprüfte Form wird genannt: Ein Test soll nicht raten lassen, worum es geht
    verben
      ? english
        ? `Focus: ${verben}`
        : `Schwerpunkt: ${verben}`
      : topics.length
        ? english
          ? `Focus: ${topics.map((t) => t.term || t.label).join(', ')}`
          : `Schwerpunkt: ${topics.map((t) => t.label).join(', ')}`
        : '',
    m.gradeScaleOnSheet && points > 0
      ? `${english ? 'Marks' : 'Notenschlüssel'}: ${((r) => (r ? punkteZeile(points, r.schwellen) : gradeScaleLine(points, m.gradeScaleThresholds)))(notenpunkteFuer(m))}`
      : ''
  ].filter(Boolean)
  return {
    id: gruppe && gruppe !== 'A' ? `test-head-${gruppe.toLowerCase()}` : 'test-head',
    type: 'infoBox',
    variant: 'wissen',
    title: m.title || (english ? 'Grammar test' : 'Grammatiktest'),
    // Von Hand geänderter Wortlaut hat Vorrang (30.09.2026); leer = aus den Angaben berechnet
    body: m.kopfText?.trim() ? m.kopfText : lines.map((l) => `- ${l}`).join('\n')
  }
}

/** Blatt-Angaben, die die Darstellung aus dem Test ableitet. */
export function worksheetMetaForTest(test: GrammarTest): WorksheetMeta {
  const m = test.meta
  const base = defaultMeta(m.stateId, m.schoolTypeId, m.schoolTypeName)
  const points = testPoints(test) || m.points
  return {
    ...base,
    // KI-Kennzeichnung bis ins Blatt durchreichen (Großprogramm 0.4)
    ki: m.ki,
    kiVermerk: m.kiVermerk,
    subjectId: m.subjectId,
    subjectLabel: m.subjectId === 'englisch' ? 'English' : m.subjectLabel,
    topic: '',
    title: m.title || (m.subjectId === 'englisch' ? 'Grammar test' : 'Grammatiktest'),
    grade: m.grade,
    ...(m.courseLevel ? { courseLevel: m.courseLevel } : {}),
    cefrLevel: m.cefrLevel,
    languageOrder: m.languageOrder,
    lateStartLanguage: m.lateStartLanguage,
    acquisitionStage: m.acquisitionStage,
    grammarTopics: m.topics,
    skillFocus: 'grammar',
    knownVocab: m.knownVocab,
    instructionsInGerman: m.instructionsInGerman,
    labelLanguage: m.subjectId === 'englisch' ? 'en' : 'de',
    answerKey: m.answerKey,
    vorlagenfarbe: m.vorlagenfarbe,
    // Überthema (Paket 11) – den Themenbereich setzt der Editor beim Anzeigen ein
    ueberthema: m.ueberthema,
    ueberthemaAus: m.ueberthemaAus,
    // Blattoptionen wie beim Arbeitsblatt (27.09.2026)
    showSchool: m.showSchool,
    correctionMargin: m.correctionMargin,
    notesMargin: m.notesMargin,
    aiCanary: m.aiCanary,
    aiCanaryWords: m.aiCanaryWords,
    helpCards: false,
    minutes: m.minutes,
    pages: Math.max(1, Math.ceil(test.blocks.length / 6)),
    // Nur wenn über Punkte bewertet wird, sagt ein Schlüssel etwas aus
    ...(m.graded && points > 0
      ? {
          gradeScale: {
            thresholds: m.gradeScaleThresholds,
            groups: [{ label: '', points }],
            // Sekundarstufe II: Notenpunkte 0–15 (26.09.2026)
            ...((r) => (r ? { punkte: { schwellen: r.schwellen, hinweis: r.hinweis } } : {}))(notenpunkteFuer(m))
          }
        }
      : {})
  }
}

/** Übersetzt den Test in ein Arbeitsblatt, das sich anzeigen und exportieren lässt. */
/** Arbeiten bekommen nur Kopf und Schluss eine Figur (26.09.2026) */
export function testToWorksheet(test: GrammarTest): Worksheet {
  return platziereKopfUndSchluss(testToWorksheetOhneIllustration(test))
}

/** Die Fassungen des Tests: eine, oder Gruppe A und B (30.09.2026, unregelmäßige Verben) */
export const fassungenVon = (test: GrammarTest): WsBlock[][] => (test.blocksB?.length ? [test.blocks, test.blocksB] : [test.blocks])

/** Kennung des Blattes einer Fassung – A heißt wie bisher „test" */
export const blattIdVon = (index: number): string => (index === 0 ? 'test' : `test-${String.fromCharCode(97 + index)}`)

function testToWorksheetOhneIllustration(test: GrammarTest): Worksheet {
  const fassungen = fassungenVon(test)
  const sheets: Sheet[] = fassungen.map((bloecke, i) => {
    const gruppe = fassungen.length > 1 ? String.fromCharCode(65 + i) : ''
    const head = testHeadBlock(test, gruppe)
    return { id: blattIdVon(i), label: gruppe ? `Gruppe ${gruppe}` : 'Grammatiktest', blocks: head ? [head, ...bloecke] : [...bloecke] }
  })
  return {
    version: 1,
    meta: worksheetMetaForTest(test),
    // Auf einem Test tragen die Lernenden Name, Klasse und Datum ein
    design: { ...test.design, header: { ...test.design.header, fields: { name: true, class: true, date: true } } },
    outline: null,
    sheets,
    sources: [],
    createdAt: test.createdAt
  }
}
