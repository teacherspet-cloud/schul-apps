/**
 * Themenspezifische Vorschläge per KI – nur auf Knopfdruck.
 *
 * Entscheidung der Lehrkraft (25.09.2026): „Live, ohne KI + Knopf mit KI“. Die Tabellen liefern
 * die belegten Vorschläge sofort und kostenlos; die KI ergänzt, was zum konkreten Thema gehört.
 * Ihre Vorschläge sind IMMER als „KI-Vorschlag – bitte prüfen“ gekennzeichnet.
 *
 * Lernziele: „Voraussetzungen der Ziele“ – aus jedem Lernziel wird abgeleitet, was man dafür schon
 * können muss. Was selbst Lernziel ist, darf nicht als Vorwissen erscheinen, sonst wäre das Ziel
 * schon erreicht.
 */
import { arr, enumOf, obj, str } from '../../../../shared/aiSchema'
import { subjectById } from '../../model/subjects'
import { stateInfo } from '../states'
import {
  ART_LABEL,
  ARTEN_VORWISSEN,
  lernjahrFuer,
  type VorwissenAnfrage,
  type VorwissenArt,
  type VorwissenErgebnis,
  type VorwissenVorschlag
} from './vorwissen'

export type KiAufruf = <T>(req: { system: string; user: string; schema: Record<string, unknown>; schemaName: string }) => Promise<T>

export const KI_QUELLE = 'KI-Vorschlag – bitte prüfen'

const SCHEMA_VORWISSEN = obj({
  vorschlaege: arr(
    obj({
      art: enumOf(ARTEN_VORWISSEN),
      text: str('Kurz und konkret, höchstens 15 Wörter, ohne Vorsilbe wie „Fehlvorstellung:“')
    })
  )
})

const SCHEMA_STOFF = obj({
  vorschlaege: arr(str('Ein typischer Inhalt der Unterrichtseinheit, höchstens 12 Wörter'))
})

function lerngruppe(a: VorwissenAnfrage): string {
  const fach = subjectById(a.subjectId)
  const land = stateInfo(a.stateId)
  const sprache = fach.foreignLanguage || fach.uebersetzungssprache ? `, ${a.languageOrder ?? 1}. Fremdsprache im ${lernjahrFuer(a)}. Lernjahr` : ''
  return `Fach ${fach.label}, Klasse ${a.grade}, Schulform ${a.schoolTypeId}, ${land.name} (${land.curriculumName})${sprache}`
}

export async function kiVorwissen(a: VorwissenAnfrage, bekannt: VorwissenErgebnis, ai: KiAufruf): Promise<VorwissenVorschlag[]> {
  const system = [
    'Du bist Fachdidaktikerin und planst Unterricht an deutschen Schulen. Du schlägst vor, welches Vorwissen eine Lerngruppe zu einem Thema vermutlich mitbringt.',
    `Lerngruppe: ${lerngruppe(a)}.`,
    'Gruppen (Feld „art“):',
    ...ARTEN_VORWISSEN.map((art) => `- ${art}: ${ART_LABEL[art]}`),
    '',
    'REGELN:',
    '- Je Gruppe 2 bis 4 Vorschläge; jede Gruppe kommt vor. Zurückhaltung heißt hier NICHT weglassen: Eine leere Gruppe ist ein Fehler.',
    '- fach: Inhalte, die VOR diesem Thema behandelt werden und dafür gebraucht werden – konkret („Brüche kürzen und erweitern“), nicht vage („Grundkenntnisse“).',
    '- begriff: Fachbegriffe, die bekannt sein sollten, als „Begriffe: A, B, C“.',
    '- methode: Arbeitstechniken des Fachs, die in diesem Jahrgang üblich sind.',
    '- fehlvorstellung: typische Alltagsvorstellungen zum THEMA, die fachlich falsch sind – als Aussage formuliert, wie Lernende sie denken.',
    '- nochNicht: was zu diesem Zeitpunkt vermutlich noch NICHT behandelt ist, aber naheläge (spätere Themen, anspruchsvollere Verfahren).',
    '- Lernziele: Leite aus jedem Lernziel ab, was man dafür schon können muss. Schlage NIE etwas vor, das selbst ein Lernziel ist oder es vorwegnimmt.',
    '- Keine Lehrplanstellen, Kapitel- oder Seitenzahlen erfinden. Keine Aussagen über einzelne Schülerinnen und Schüler.',
    '- Wiederhole nichts, was unter „Schon vorgeschlagen“ steht.'
  ].join('\n')
  const user = [
    `Thema: ${a.topic || '(noch offen)'}`,
    a.learningGoals?.trim() ? `Lernziele:\n${a.learningGoals.trim()}` : 'Lernziele: keine angegeben – schlage vom Thema aus vor, eher vorsichtig.',
    bekannt.hinweise.length ? `Hinweise zur Lerngruppe:\n${bekannt.hinweise.map((h) => `- ${h}`).join('\n')}` : '',
    bekannt.vorschlaege.length ? `Schon vorgeschlagen:\n${bekannt.vorschlaege.map((v) => `- [${v.art}] ${v.text}`).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
  const res = await ai<{ vorschlaege: { art: VorwissenArt; text: string }[] }>({ system, user, schema: SCHEMA_VORWISSEN, schemaName: 'vorwissen' })
  return (res.vorschlaege ?? [])
    .filter((v) => ARTEN_VORWISSEN.includes(v.art) && v.text?.trim())
    .map((v) => ({ art: v.art, text: bereinigt(v.text), quelle: KI_QUELLE, sicher: false, ki: true }))
}

export async function kiStoff(a: VorwissenAnfrage, bekannt: VorwissenErgebnis, ai: KiAufruf): Promise<VorwissenVorschlag[]> {
  const system = [
    'Du bist Fachdidaktikerin und planst Unterricht an deutschen Schulen.',
    `Lerngruppe: ${lerngruppe(a)}.`,
    'Nenne 6 bis 10 Inhalte, die in einer Unterrichtseinheit zu diesem Thema in dieser Lerngruppe typischerweise behandelt werden – Teilthemen, Verfahren, Begriffe, Textsorten oder Grammatik.',
    'Konkret und prüfbar; keine Lehrplanstellen erfinden; nichts wiederholen, was schon vorgeschlagen ist.'
  ].join('\n')
  const user = [
    `Thema: ${a.topic || '(noch offen)'}`,
    bekannt.vorschlaege.length ? `Schon vorgeschlagen:\n${bekannt.vorschlaege.map((v) => `- ${v.text}`).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
  const res = await ai<{ vorschlaege: string[] }>({ system, user, schema: SCHEMA_STOFF, schemaName: 'stoff' })
  return (res.vorschlaege ?? [])
    .filter((t) => t?.trim())
    .map((t) => ({ art: 'stoff' as const, text: bereinigt(t), quelle: KI_QUELLE, sicher: false, ki: true }))
}

/** Vorsilben entfernen, die die KI trotz Anweisung mitschickt */
function bereinigt(text: string): string {
  return text
    .trim()
    .replace(/^[-•*]\s*/, '')
    .replace(/^(fehlvorstellung|noch nicht behandelt)\s*:\s*/i, '')
}
