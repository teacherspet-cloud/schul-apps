/**
 * Wie viele Items eine Aufgabe abfragt.
 *
 * Ein Item ist die kleinste EINZELN BEWERTETE Einheit – bei Verstehensaufgaben zugleich die
 * Einheit, auf die ein Punkt entfällt. Das ist nicht dasselbe wie „Zahl der Antwortfelder":
 * Eine Multiple-Choice-Frage mit vier Möglichkeiten ist EIN Item, nicht vier; ein Lückentext
 * mit acht Lücken sind acht.
 *
 * Gebraucht wird die Zahl im Erwartungshorizont: Dort steht neben der Lösung, wie viele
 * Items die Aufgabe hat – sonst muss die Lehrkraft beim Korrigieren selbst nachzählen, ob
 * die Punkte zur Aufgabe passen.
 */
import type { Answer, TaskBlock } from './types'

/** Lücken eines Lückentextes: jede [[Lösung]] ist ein Item. */
const gaps = (text: string): number => (text.match(/\[\[[^\]]*\]\]/g) ?? []).length

/** Leere Zellen einer Tabelle: jede ist auszufüllen und zählt einzeln. */
const emptyCells = (rows: string[][]): number => rows.reduce((n, row) => n + row.filter((c) => !c.trim()).length, 0)

export function answerItems(answer: Answer): number {
  switch (answer.kind) {
    case 'gapText':
      return gaps(answer.gapText)
    case 'trueFalse':
      return answer.statements.length
    case 'matching':
      return answer.left.length
    case 'tableFill':
      // Sind keine Zellen leer, füllen die Lernenden die Lösungszeilen – dann zählen die
      return emptyCells(answer.rows) || answer.solutionRows.reduce((n, r) => n + r.length, 0)
    case 'labels':
      return answer.labels.length
    case 'multipleChoice':
      // Eine Frage mit mehreren Möglichkeiten ist EIN Item, nicht eines je Möglichkeit
      return 1
    case 'ordering':
      // Die Reihenfolge wird als Ganzes bewertet
      return 1
    case 'none':
      return 0
    default:
      return 1
  }
}

/** Items der ganzen Aufgabe – Teilaufgaben zählen einzeln. */
export function taskItems(task: TaskBlock): number {
  if (task.parts.length) return task.parts.reduce((n, p) => n + answerItems(p.answer), 0)
  return answerItems(task.answer)
}
