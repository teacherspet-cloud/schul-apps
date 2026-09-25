/* eslint-disable @typescript-eslint/no-explicit-any */
import { arr, bool, enumOf, obj, str } from '../../../shared/aiSchema'
import type { LearnerProfile } from '../didactics/profile'
import type { BoardLayout, BoardPlan, Sheet, Worksheet } from '../model/types'
import { taskNumbersFor } from '../render/SheetPages'
import { subjectById } from '../model/subjects'
import { describeBlock } from './describe'
import type { AiCall } from './generate'
import { systemPrompt, taskContext } from './prompts'
import { boardList, boardRules, boardStructureById } from '../didactics/boardDesign'
import type { BoardFormat } from '../didactics/boardDesign'
import type { BoardField } from '../didactics/boardDesign'

export const BOARD_LAYOUTS: { value: BoardLayout; label: string }[] = [
  { value: 'columns', label: 'Gegenüberstellung (Spalten)' },
  { value: 'flow', label: 'Ablauf / Ursache → Wirkung' },
  { value: 'cluster', label: 'Zentraler Begriff mit Aspekten' }
]

export const BOARD_SCHEMA = obj({
  title: str('Überschrift des Tafelbilds – als Leitfrage formuliert'),
  layout: enumOf(BOARD_LAYOUTS.map((l) => l.value)),
  structure: str('Strukturform (id aus der Liste im Auftrag)'),
  structureReason: str('In einem Satz: warum diese Strukturform zum Inhalt passt'),
  sections: arr(
    obj({
      heading: str('kurze Bereichsüberschrift'),
      points: arr(str(), 'höchstens 5 knappe Stichpunkte, je höchstens etwa 50 Zeichen'),
      field: enumOf(['links', 'mitte', 'rechts']),
      toNotebook: bool('Wird dieser Bereich ins Heft übertragen? Nur der Kern in der Mitte.'),
      fromTasks: str('z. B. „Aufgabe 1, 2b“'),
      sketch: str('Skizze, die die Lehrkraft dazuzeichnet (z. B. Kräftepfeile, Zahlenstrahl, Kartenskizze) – leer, wenn keine nötig')
    })
  ),
  conclusion: str('Merksatz / zentrales Ergebnis in 1–2 Sätzen'),
  steps: arr(
    obj({
      phase: str('Unterrichtsschritt, z. B. „Ergebnisse von Aufgabe 1 vergleichen“'),
      impulse: str('Impuls oder Frage der Lehrkraft'),
      expected: str('erwartete Schülerbeiträge, die an die Tafel kommen')
    })
  )
})

/** Blatt mit denselben Aufgabennummern, die die Schülerinnen und Schüler sehen. */
export function describeSheetForBoard(sheet: Sheet): string {
  const numbers = taskNumbersFor(sheet)
  return sheet.blocks.map((b) => (b.type === 'task' ? `Aufgabe ${numbers.get(b.id)}: ${describeBlock(b)}` : describeBlock(b))).join('\n\n')
}

export function describeBoard(board: BoardPlan): string {
  return [
    `Titel: ${board.title} (Anordnung: ${board.layout})`,
    ...board.sections.map((s) => `Bereich „${s.heading}“ (${s.fromTasks}): ${s.points.join('; ')}${s.sketch ? ` | Skizze: ${s.sketch}` : ''}`),
    `Merksatz: ${board.conclusion}`,
    ...board.steps.map((s, i) => `Schritt ${i + 1} – ${s.phase}: Impuls „${s.impulse}“ → ${s.expected}`)
  ].join('\n')
}

export function boardPrompt(ws: Worksheet, profile: LearnerProfile, instruction = '', format: BoardFormat = 'mitteltafel'): string {
  const target = boardList(ws).find((b) => (b.format ?? 'mitteltafel') === format)
  const multi = ws.sheets.length > 1
  return [
    'Entwickle ein Tafelbild zur Ergebnissicherung für dieses Arbeitsblatt. Die Lehrkraft entwickelt es im Unterrichtsgespräch, indem die Ergebnisse der Aufgaben verglichen und zusammengeführt werden.',
    boardRules(ws.meta, format, target?.structure),
    '',
    'Weitere Regeln:',
    '- layout nach der Denkstruktur des Themas: „columns“ für Vergleich/Gegenüberstellung, „flow“ für Abläufe, Ursache → Wirkung oder Entwicklungen (Bereiche in zeitlicher/logischer Reihenfolge), „cluster“ für einen zentralen Begriff mit Merkmalen oder Aspekten.',
    '- fromTasks: aus welchen Aufgaben die Inhalte des Bereichs stammen (Aufgabennummern wie auf dem Blatt).',
    '- sketch: nur wenn eine einfache Zeichnung das Verständnis trägt, kurz beschreiben, was gezeichnet wird; sonst leer.',
    '- Formeln und Rechenwege als LaTeX in $…$, Hervorhebungen mit **fett**.',
    boardSubjectHints(ws.meta),
    '- conclusion: Merksatz bzw. Antwort auf die Leitfrage in 1–2 Sätzen, der die Ergebnisse der Aufgaben verbindet.',
    '- steps: 3–6 Schritte in Unterrichtsreihenfolge – je Schritt die Phase (welche Aufgabenergebnisse verglichen werden), ein offener Impuls bzw. eine Frage der Lehrkraft und die erwarteten Schülerbeiträge, die an die Tafel kommen. Der letzte Schritt führt zum Merksatz.',
    multi
      ? '- Es gibt mehrere Niveaustufen. Vergleiche die Aufgaben der Fassungen: Das Tafelbild enthält das gemeinsame Kernergebnis, das alle erreichen; Inhalte, die nur aus der anspruchsvollsten Fassung stammen, mit „(★★★)“ kennzeichnen. Aufgabennummern mit Stufe angeben, falls sie sich unterscheiden (z. B. „★ A2 / ★★★ A3“).'
      : '',
    '- Nur Inhalte, die sich aus den Aufgaben, Materialien und Lösungen ergeben – nichts Neues hinzuerfinden. Fachlich korrekt, Sprache passend zur Lerngruppe.',
    instruction ? `Auftrag der Lehrkraft für die Überarbeitung (genau umsetzen, alles andere möglichst beibehalten): ${instruction}` : '',
    instruction && ws.board ? `Bisheriges Tafelbild:\n${describeBoard(ws.board)}` : '',
    taskContext(ws.meta, profile),
    ws.sheets.map((s) => `${multi ? `=== Fassung ${s.label} ===\n` : ''}${describeSheetForBoard(s)}`).join('\n\n')
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Fachtypische Tafelbilder (Fachdidaktik: Sicherung, Strukturierung, Visualisierung) */
export function boardSubjectHints(meta: Worksheet['meta']): string {
  const subject = subjectById(meta.subjectId)
  const id = meta.subjectId
  if (subject.foreignLanguage) {
    return `- Fremdsprache: Tafelbild in der Zielsprache (Regel/Struktur mit Beispielsätzen, Signalwörter, Redemittel)${['Pre-A1', 'A1', 'A2'].includes(meta.cefrLevel) ? '; eine kurze deutsche Erklärung der Regel ist erlaubt' : ''}.`
  }
  if (id === 'mathematik')
    return '- Mathematik: Begriff/Regel, ein vollständig durchgerechnetes Beispiel ($…$) und typische Fehler bzw. Vorgehen in Schritten; Graphen oder Zahlenstrahl als sketch.'
  if (id === 'physik' || id === 'chemie')
    return '- Naturwissenschaft: Frage/Hypothese → Beobachtung → Erklärung (Je-desto, Formel oder Reaktionsgleichung in $…$); Versuchsaufbau oder Modell als sketch.'
  if (id === 'biologie' || id === 'sachunterricht') return '- Struktur und Funktion bzw. Ablauf (Pfeile), Fachbegriffe fett; Schema als sketch, wenn es hilft.'
  if (id === 'informatik') return '- Begriff, Ablauf/Algorithmus in Schritten oder als Struktogramm-Beschreibung (sketch), Beispiel.'
  if (id === 'erdkunde') return '- Raumbezug: Faktoren → Folgen, Pro/Contra oder Kartenskizze/Profil als sketch.'
  if (id === 'geschichte' || id === 'politik') return '- Ursachen → Ereignis → Folgen, Perspektiven oder Pro/Contra; Zeitleiste als sketch, wenn sinnvoll.'
  if (id === 'religion' || id === 'werte-und-normen') return '- Positionen/Perspektiven gegenüberstellen, zentrale Begriffe und eigene Urteilsfrage.'
  if (id === 'deutsch' || id === 'latein')
    return '- Merkmale/Aufbau mit kurzen Textbelegen (Zeilenangaben) und Fachbegriffen; Grammatik als Regel mit Beispielen.'
  if (id === 'kunst' || id === 'musik')
    return '- Beobachtung → Gestaltungsmittel/Fachbegriffe → Wirkung/Deutung; Skizze der Bildkomposition bzw. des Formverlaufs als sketch.'
  if (id === 'sport') return '- Bewegungsphasen oder Knotenpunkte mit Beobachtungskriterien; Strichfiguren als sketch.'
  if (id === 'daz') return '- Wortspeicher mit Artikel und Plural, Satzmuster und Beispielsätze; Bilder als sketch.'
  return ''
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Antwort der KI in ein sauberes Tafelbild umwandeln. */
export function convertBoard(data: any): BoardPlan {
  const sections = (Array.isArray(data?.sections) ? data.sections : [])
    .map((s: any) => ({
      heading: text(s?.heading),
      points: (Array.isArray(s?.points) ? s.points : []).map(text).filter(Boolean),
      field: (['links', 'mitte', 'rechts'] as const).includes(s?.field) ? (s.field as BoardField) : 'mitte',
      toNotebook: s?.toNotebook !== false,
      fromTasks: text(s?.fromTasks),
      ...(text(s?.sketch) ? { sketch: text(s?.sketch) } : {})
    }))
    .filter((s: BoardPlan['sections'][number]) => s.heading || s.points.length)
  if (!sections.length) throw new Error('Die KI hat kein Tafelbild geliefert.')
  const layout = BOARD_LAYOUTS.some((l) => l.value === data?.layout) ? (data.layout as BoardLayout) : 'columns'
  const structure = boardStructureById(text(data?.structure))
  return {
    title: text(data?.title),
    layout,
    // Verlangt die Strukturform ein bestimmtes Format (Zeitleiste braucht Breite), gilt es
    ...(structure ? { structure: structure.id } : {}),
    ...(text(data?.structureReason) ? { structureReason: text(data.structureReason) } : {}),
    sections,
    conclusion: text(data?.conclusion),
    steps: (Array.isArray(data?.steps) ? data.steps : [])
      .map((s: any) => ({ phase: text(s?.phase), impulse: text(s?.impulse), expected: text(s?.expected) }))
      .filter((s: BoardPlan['steps'][number]) => s.phase || s.impulse || s.expected)
  }
}

/**
 * Erzeugt ein Tafelbild für GENAU EINE Fläche.
 * Eine Mitteltafel und ein 16:9-Display fassen Unterschiedliches – wer beides will,
 * bekommt zwei eigene Tafelbilder.
 */
export async function generateBoard(
  ws: Worksheet,
  profile: LearnerProfile,
  ai: AiCall,
  instruction = '',
  format: BoardFormat = 'mitteltafel'
): Promise<BoardPlan> {
  const data = await ai<any>({
    system: systemPrompt(ws.meta, profile),
    user: boardPrompt(ws, profile, instruction, format),
    schemaName: 'worksheet_board',
    schema: BOARD_SCHEMA
  })
  return { ...convertBoard(data), format }
}
