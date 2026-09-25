/**
 * Gelöstes Beispiel („Punkt 0") zu einer fertigen Aufgabe.
 *
 * Belegt als Konstruktionsprinzip: ÖSZ (2024), „Leitfaden zur Erstellung von Schularbeiten
 * in der Sekundarstufe 2": „Bei jeder Aufgabenstellung sollte zu Beginn ein gelöstes
 * Beispiel (0) vorgegeben sein." Dieselbe Form in den Modellsätzen des Goethe-Instituts und
 * in den Cambridge-Formaten, wo Item 0 mit eingetragener Lösung dasteht.
 *
 * Das Beispiel wird NACHTRÄGLICH erzeugt, auf Knopfdruck an der einzelnen Aufgabe. Zwei
 * Gründe dafür: Es kostet nur dort Kontingent, wo es gebraucht wird, und die Lehrkraft sieht
 * die fertige Aufgabe, bevor sie entscheidet. Es darf deshalb NICHTS an der Aufgabe ändern –
 * die KI bekommt sie als unveränderliche Grundlage und liefert nur den zusätzlichen Punkt.
 *
 * Wichtig für die Gültigkeit der Aufgabe: Das Beispiel darf keine echte Lösung vorwegnehmen.
 * Es zeigt die FORM der Antwort an einem Inhalt, der in keinem der Items abgefragt wird.
 */
import { obj, str, arr, int } from '../../../shared/aiSchema'
import { emptyAnswer } from '../model/factory'
import type { TaskBlock, TaskPart, WorksheetMeta } from '../model/types'
import type { AiCall } from './generate'

const EXAMPLE_SCHEMA = obj({
  instruction: str('Der Beispielpunkt: bei Ankreuzfragen die Beispielfrage, sonst der Beispielsatz – in der Sprache der Aufgabe'),
  options: arr(str('Antwortmöglichkeit'), 'Nur bei Ankreuzfragen: dieselbe Anzahl Möglichkeiten wie in den echten Fragen, sonst leer'),
  correct: int('Nur bei Ankreuzfragen: Nummer der richtigen Möglichkeit, beginnend bei 0'),
  solution: str('Die eingetragene Lösung als Text – bei Ankreuzfragen leer, sonst das, was dort stehen würde')
})

/** Kurzfassung der Aufgabe für den Auftrag – nur so viel, wie zum Nachbauen nötig ist. */
function aufgabenBild(block: TaskBlock): string {
  const items = block.parts.length
    ? block.parts.map((p, i) => `${i + 1}. ${p.instruction}${p.answer.kind === 'multipleChoice' ? ` [${p.answer.options.join(' | ')}]` : ''}`)
    : [block.instruction]
  const art = block.parts[0]?.answer.kind ?? block.answer.kind
  return [`Arbeitsanweisung: ${block.instruction}`, `Antwortform: ${art}`, 'Die vorhandenen Punkte:', ...items].join('\n')
}

/**
 * Erzeugt das gelöste Beispiel zu einer Aufgabe.
 *
 * Wirft, wenn die KI nichts Brauchbares liefert – die Oberfläche zeigt den Fehler dann an,
 * statt stillschweigend nichts zu tun. Genau dieses stille Nichtstun hat in diesem Projekt
 * schon einmal wie ein KI-Problem ausgesehen.
 */
export async function generateExample(block: TaskBlock, meta: WorksheetMeta, ai: AiCall): Promise<TaskPart> {
  const mc = (block.parts[0]?.answer.kind ?? block.answer.kind) === 'multipleChoice'
  const anzahl = block.parts[0]?.answer.options.length ?? block.answer.options.length ?? 3
  const data = await ai<{ instruction?: string; options?: string[]; correct?: number; solution?: string }>({
    system: [
      `Du bist eine erfahrene Lehrkraft für das Fach ${meta.subjectLabel}.`,
      'Du schreibst zu einer FERTIGEN Aufgabe ein gelöstes Beispiel, das ihr als Punkt „0" vorangestellt wird.',
      'Es zeigt den Lernenden, WIE geantwortet wird – es ist selbst keine Aufgabe.'
    ].join('\n'),
    user: [
      aufgabenBild(block),
      '',
      'Schreibe dazu genau EINEN gelösten Beispielpunkt. Verbindlich:',
      '- Er ist genauso gebaut wie die vorhandenen Punkte und steht in derselben Sprache.',
      '- Er ist deutlich EINFACHER als die echten Punkte – er soll die Form zeigen, nicht prüfen.',
      '- Sein Inhalt kommt in KEINEM der vorhandenen Punkte vor; er nimmt keine Lösung vorweg.',
      mc
        ? `- Gib ${anzahl} Antwortmöglichkeiten an und die Nummer der richtigen (bei 0 beginnend). Lass „solution" leer.`
        : '- Lass „options" leer und „correct" auf 0. Trage in „solution" ein, was an dieser Stelle stehen würde.',
      '- Ändere nichts an der Aufgabe selbst.'
    ].join('\n'),
    schemaName: 'solved_example',
    schema: EXAMPLE_SCHEMA
  })

  const instruction = String(data.instruction ?? '').trim()
  if (!instruction) throw new Error('Die KI hat kein Beispiel geliefert.')
  const options = (Array.isArray(data.options) ? data.options : []).map((o) => String(o).trim()).filter(Boolean)
  if (mc && options.length < 2) throw new Error('Das Beispiel enthält zu wenige Antwortmöglichkeiten.')
  const correct = Math.max(0, Math.min(options.length - 1, Math.round(Number(data.correct) || 0)))

  return {
    id: `${block.id}-beispiel`,
    instruction,
    answer: mc ? { ...emptyAnswer('multipleChoice'), options, correct: [correct] } : emptyAnswer('none'),
    solution: mc ? (options[correct] ?? '') : String(data.solution ?? '').trim()
  }
}
