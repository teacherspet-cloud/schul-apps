/**
 * Vorschlag einer zu schulenden Kompetenz für das Feld „Die Schülerinnen und Schüler können …“.
 *
 * Grundlage sind die KMK-Bildungsstandards und die typischen Kompetenzbereiche des Fachs.
 * Das Bundesland bestimmt nur, auf welche Lehrplanart sich der Vorschlag beziehen soll
 * (Kerncurriculum, Kernlehrplan, LehrplanPLUS …). Lehrplanstellen werden bewusst NICHT zitiert:
 * Die Zuordnung zum schulinternen Curriculum bleibt bei der Lehrkraft.
 */
import { obj, str } from '../../../shared/aiSchema'
import type { LearnerProfile } from '../didactics/profile'
import { stateInfo } from '../didactics/states'
import { subjectById } from '../model/subjects'
import type { WorksheetMeta } from '../model/types'

/** Kompetenzbereiche je Fach – Orientierung für den Vorschlag. */
const COMPETENCE_AREAS: Record<string, string[]> = {
  englisch: [
    'Hör-/Hörsehverstehen',
    'Leseverstehen',
    'Sprechen',
    'Schreiben',
    'Sprachmittlung',
    'Verfügung über sprachliche Mittel',
    'interkulturelle kommunikative Kompetenz',
    'Text- und Medienkompetenz'
  ],
  franzoesisch: [
    'Hör-/Hörsehverstehen',
    'Leseverstehen',
    'Sprechen',
    'Schreiben',
    'Sprachmittlung',
    'Verfügung über sprachliche Mittel',
    'interkulturelle kommunikative Kompetenz'
  ],
  spanisch: [
    'Hör-/Hörsehverstehen',
    'Leseverstehen',
    'Sprechen',
    'Schreiben',
    'Sprachmittlung',
    'Verfügung über sprachliche Mittel',
    'interkulturelle kommunikative Kompetenz'
  ],
  italienisch: ['Hör-/Hörsehverstehen', 'Leseverstehen', 'Sprechen', 'Schreiben', 'Sprachmittlung', 'Verfügung über sprachliche Mittel'],
  deutsch: ['Sprechen und Zuhören', 'Schreiben', 'Lesen – mit Texten und Medien umgehen', 'Sprache und Sprachgebrauch untersuchen'],
  geschichte: ['Sachkompetenz', 'Methodenkompetenz', 'Urteilskompetenz', 'Orientierungskompetenz'],
  politik: ['Sachkompetenz', 'Methodenkompetenz', 'Urteilskompetenz', 'Handlungskompetenz'],
  erdkunde: ['Fachwissen', 'räumliche Orientierung', 'Erkenntnisgewinnung durch Methoden', 'Kommunikation', 'Beurteilung und Bewertung', 'Handlung'],
  mathematik: ['Mathematisch argumentieren', 'Probleme lösen', 'Modellieren', 'Darstellungen verwenden', 'mit symbolischen Elementen umgehen', 'Kommunizieren'],
  biologie: ['Fachwissen', 'Erkenntnisgewinnung', 'Kommunikation', 'Bewertung'],
  chemie: ['Fachwissen', 'Erkenntnisgewinnung', 'Kommunikation', 'Bewertung'],
  physik: ['Fachwissen', 'Erkenntnisgewinnung', 'Kommunikation', 'Bewertung'],
  informatik: ['Modellieren und Implementieren', 'Begründen und Bewerten', 'Strukturieren und Vernetzen', 'Kommunizieren und Kooperieren'],
  religion: ['Wahrnehmungs- und Darstellungskompetenz', 'Deutungskompetenz', 'Urteilskompetenz', 'Dialogkompetenz'],
  kunst: ['Produktion', 'Rezeption', 'Reflexion'],
  musik: ['Musik gestalten', 'Musik hören und beschreiben', 'Musik deuten und einordnen'],
  sport: ['Bewegen und Können', 'Wissen und Reflektieren', 'Kooperieren und Wettkämpfen']
}

export function competenceAreas(subjectId: string): string[] {
  return COMPETENCE_AREAS[subjectId] ?? ['Fachwissen', 'Erkenntnisgewinnung', 'Kommunikation', 'Bewertung']
}

const SCHEMA = obj({
  competence: str(
    'Ein Satz, der mit „Die Schülerinnen und Schüler können …“ fortgesetzt werden kann – ohne diese Einleitung, also beginnend mit dem Verb im Infinitiv'
  ),
  area: str('Kompetenzbereich des Fachs, dem der Satz zugeordnet ist')
})

export type AiCall = <T>(req: { system: string; user: string; schema: Record<string, unknown>; schemaName: string }) => Promise<T>

/**
 * Liefert eine weitere, zum Thema passende Kompetenz. Bereits vorhandene Sätze werden
 * übergeben, damit der Vorschlag einen anderen Kompetenzbereich abdeckt.
 */
export async function suggestCompetence(
  meta: WorksheetMeta,
  profile: LearnerProfile,
  existing: string[],
  ai: AiCall
): Promise<{ competence: string; area: string }> {
  const subject = subjectById(meta.subjectId)
  const state = stateInfo(meta.stateId)
  const areas = competenceAreas(meta.subjectId)
  const system = [
    `Du bist Fachdidaktikerin für ${meta.subjectLabel} und formulierst Kompetenzerwartungen für ein Arbeitsblatt.`,
    `Lerngruppe: ${meta.schoolTypeName} in ${state.name}, Klasse ${meta.grade}${subject.foreignLanguage ? `, Niveau ${meta.cefrLevel}` : ''}.`,
    `Orientiere dich an den KMK-Bildungsstandards und an typischen Inhalten des ${profile.curriculumName}s (${state.name}) für diese Lerngruppe.`,
    'Zitiere KEINE Lehrplanstellen, Kapitel- oder Kompetenznummern und erfinde keine Fundstellen.',
    `Kompetenzbereiche des Fachs: ${areas.join(', ')}.`,
    '',
    'REGELN FÜR DEN SATZ:',
    '- Beobachtbares Verhalten: ein Operator, der sich am Ergebnis prüfen lässt (nennen, beschreiben, erklären, vergleichen, beurteilen …) – nicht „verstehen“, „kennen“, „sich bewusst werden“.',
    '- Genau eine Kompetenz je Satz, fachlich konkret am Thema, ohne Aufzählung mit „und/oder“.',
    '- Gegenstand und, wo sinnvoll, die Bedingung nennen („… anhand einer Quelle …“, „… mithilfe einer Tabelle …“).',
    '- Altersgemäße Sprache, höchstens 25 Wörter, ohne die Einleitung „Die Schülerinnen und Schüler können“.'
  ].join('\n')
  const user = [
    `Thema des Arbeitsblatts: ${meta.topic || '(noch offen)'}`,
    meta.priorKnowledge ? `Vorwissen: ${meta.priorKnowledge}` : '',
    existing.length ? `Schon formuliert (decke einen ANDEREN Kompetenzbereich ab):\n${existing.map((e) => `- ${e}`).join('\n')}` : '',
    'Formuliere genau eine weitere Kompetenzerwartung.'
  ]
    .filter(Boolean)
    .join('\n')
  const res = await ai<{ competence: string; area: string }>({ system, user, schema: SCHEMA, schemaName: 'competence' })
  return { competence: (res.competence ?? '').trim().replace(/^Die Schülerinnen und Schüler können\s*/i, ''), area: (res.area ?? '').trim() }
}

/** Hängt eine Kompetenz an das Lernziel-Feld an (eine je Zeile). */
export function appendCompetence(current: string, competence: string): string {
  const line = competence.replace(/\s+/g, ' ').trim()
  if (!line) return current
  const lines = current
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.some((l) => l.toLowerCase() === line.toLowerCase())) return current
  return [...lines, line].join('\n')
}
