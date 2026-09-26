/**
 * Der Grammatiktest als Arbeitsblatt-Datenstruktur.
 *
 * Darstellung, Seitenumbruch, Druck und Word-Export sind im Arbeitsblatt gelöst; der Test wird
 * deshalb in dieselbe Struktur übersetzt – wie schon die Klassenarbeit.
 *
 * Der Notenschlüssel und das Fehlerprofil stehen im Lösungsteil: Beides gehört zur Lehrkraft.
 * Auf das Schülermaterial kommt der Schlüssel nur, wenn sie es ausdrücklich möchte.
 */
import { chosenGrammarTopics } from '../../arbeitsblatt/didactics/grammar'
import { defaultMeta } from '../../arbeitsblatt/model/defaults'
import type { Sheet, Worksheet, WorksheetMeta, WsBlock } from '../../arbeitsblatt/model/types'
import type { GrammarTest } from '../model/types'
import { testPoints } from '../model/types'
import { gradeScaleLine } from '../../../shared/gradeScale'

/** Kopfkasten: Zeit, Punkte und – auf Wunsch – der Notenschlüssel. */
export function testHeadBlock(test: GrammarTest): WsBlock | null {
  const m = test.meta
  if (!m.infoBox) return null
  const english = m.subjectId === 'englisch'
  const points = testPoints(test) || m.points
  const topics = chosenGrammarTopics({ ...m, grammarTopics: m.topics } as never)
  const lines = [
    english ? `Time: ${m.minutes} minutes` : `Bearbeitungszeit: ${m.minutes} Minuten`,
    english ? `${points} points` : `${points} Punkte`,
    // Die geprüfte Form wird genannt: Ein Test soll nicht raten lassen, worum es geht
    topics.length ? (english ? `Focus: ${topics.map((t) => t.term || t.label).join(', ')}` : `Schwerpunkt: ${topics.map((t) => t.label).join(', ')}`) : '',
    m.gradeScaleOnSheet && points > 0 ? `${english ? 'Marks' : 'Notenschlüssel'}: ${gradeScaleLine(points, m.gradeScaleThresholds)}` : ''
  ].filter(Boolean)
  return {
    id: 'test-head',
    type: 'infoBox',
    variant: 'wissen',
    title: m.title || (english ? 'Grammar test' : 'Grammatiktest'),
    body: lines.map((l) => `- ${l}`).join('\n')
  }
}

/** Blatt-Angaben, die die Darstellung aus dem Test ableitet. */
export function worksheetMetaForTest(test: GrammarTest): WorksheetMeta {
  const m = test.meta
  const base = defaultMeta(m.stateId, m.schoolTypeId, m.schoolTypeName)
  const points = testPoints(test) || m.points
  return {
    ...base,
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
    helpCards: false,
    minutes: m.minutes,
    pages: Math.max(1, Math.ceil(test.blocks.length / 6)),
    // Nur wenn über Punkte bewertet wird, sagt ein Schlüssel etwas aus
    ...(m.graded && points > 0 ? { gradeScale: { thresholds: m.gradeScaleThresholds, groups: [{ label: '', points }] } } : {})
  }
}

/** Übersetzt den Test in ein Arbeitsblatt, das sich anzeigen und exportieren lässt. */
export function testToWorksheet(test: GrammarTest): Worksheet {
  const head = testHeadBlock(test)
  const blocks: WsBlock[] = head ? [head, ...test.blocks] : [...test.blocks]
  const sheet: Sheet = { id: 'test', label: 'Grammatiktest', blocks }
  return {
    version: 1,
    meta: worksheetMetaForTest(test),
    // Auf einem Test tragen die Lernenden Name, Klasse und Datum ein
    design: { ...test.design, header: { ...test.design.header, fields: { name: true, class: true, date: true } } },
    outline: null,
    sheets: [sheet],
    sources: [],
    createdAt: test.createdAt
  }
}
