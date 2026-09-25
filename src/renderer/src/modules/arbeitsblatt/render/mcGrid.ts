/**
 * Darstellung einer Reihe von Ankreuzfragen (Multiple Choice).
 *
 * Vorlage ist die Klassenarbeit der Lehrkraft („Exam no 1", Aufgabe 1b). Dort steht der
 * Operator EINMAL in der Arbeitsanweisung – „Listen again and choose ☒ the correct answer" –
 * und darunter folgen die Fragen in einer rahmenlosen Tabelle:
 *
 *   1. What's in Ruby's picture?        3. What can't Karam find?
 *      a) ☐ a dog                          a) ☐ the library
 *      b) ☐ a ball                         b) ☐ his classroom
 *      c) ☐ a horse                        c) ☐ the assembly hall
 *   2. What can the students write about?
 *      …
 *
 * Zwei Dinge daran sind nicht beliebig:
 *
 * SPALTENWEISE gefüllt. In der Vorlage stehen 1 und 2 links, 3 und 4 rechts – nicht 1 und 2
 * nebeneinander. Man liest also eine Spalte zu Ende und beginnt oben in der nächsten. Das
 * ist die Leserichtung, die eine zweispaltige Aufgabenliste braucht; zeilenweise gefüllt
 * müsste das Auge bei jeder Frage springen.
 *
 * KEIN Rahmen. Die Tabelle ordnet nur an, sie gliedert nichts. Ein sichtbares Gitter würde
 * eine Struktur behaupten, die es inhaltlich nicht gibt.
 */
import type { TaskPart } from '../model/types'

/**
 * Gilt die Aufgabe als Reihe von Ankreuzfragen?
 *
 * Erst ab zwei Fragen: Bei einer einzigen gibt es nichts anzuordnen, und die Frage steht
 * dann ohnehin schon in der Arbeitsanweisung.
 */
export function istMcListe(parts: Pick<TaskPart, 'answer'>[]): boolean {
  return parts.length >= 2 && parts.every((p) => p.answer.kind === 'multipleChoice')
}

/**
 * Wird bei dieser Aufgabe angekreuzt?
 *
 * Weiter gefasst als `istMcListe`: Auch eine EINZELNE Ankreuzfrage ist eine Ankreuzaufgabe.
 * Daran hängt das angekreuzte Kästchen an der Arbeitsanweisung – es zeigt in einem Zeichen,
 * was zu tun ist, und das gilt unabhängig davon, ob eine oder vier Fragen folgen.
 */
export function istAnkreuzAufgabe(block: { answer: { kind: string }; parts: Pick<TaskPart, 'answer'>[] }): boolean {
  if (block.parts.length) return block.parts.every((p) => p.answer.kind === 'multipleChoice')
  return block.answer.kind === 'multipleChoice'
}

/**
 * Obergrenze, ab der eine Frage zu lang für eine halbe Blattbreite ist.
 *
 * Faustregel, keine Fundstelle: Eine Spalte ist bei A4 mit Lochrand rund 85 mm breit, das
 * sind bei 11 pt etwa 45 Zeichen je Zeile. Bis etwa 55 Zeichen bricht eine Frage auf zwei
 * Zeilen um – das trägt. Darüber wird die Spalte zum Zeilensalat, dann ist einspaltig
 * besser lesbar als gedrängt zweispaltig.
 */
export const MC_SPALTE_MAX_ZEICHEN = 55

/**
 * Wie viele Spalten die ANTWORTMÖGLICHKEITEN einer einzelnen Frage vertragen.
 *
 * Untereinander ist die belegte Grundform: „Format the item vertically instead of
 * horizontally" (Haladyna, Downing & Rodriguez 2002, Guideline 10); die Autoren nennen es
 * ausdrücklich Konsens der Testpraxis, nicht ein Ergebnis von Wirksamkeitsstudien. Nebeneinander
 * gesetzt – wie bisher in dieser App – zerfließt die Zuordnung, sobald die Möglichkeiten
 * unterschiedlich lang sind.
 *
 * Zwei Spalten erst bei VIELEN und KURZEN Möglichkeiten: Eine Ankreuzliste mit zehn Hobbys
 * über eine ganze Seite zu ziehen, verschenkt Platz. Genau so steht es auch in der
 * Klassenarbeit der Lehrkraft (Aufgabe 2: zehn Hobbys in zwei Spalten).
 */
export function optionSpalten(options: string[]): 1 | 2 {
  if (options.length < 6) return 1
  return options.every((o) => o.length <= 28) ? 2 : 1
}

/** Wie viele Spalten die Fragen vertragen. */
export function mcSpalten(parts: Pick<TaskPart, 'instruction' | 'answer'>[]): 1 | 2 {
  if (parts.length < 2) return 1
  const laengste = Math.max(
    ...parts.map((p) => Math.max(p.instruction.length, ...(p.answer.kind === 'multipleChoice' ? p.answer.options.map((o) => o.length) : [0])))
  )
  return laengste <= MC_SPALTE_MAX_ZEICHEN ? 2 : 1
}

/**
 * Die Fragen auf Zeilen verteilen – SPALTENWEISE gefüllt.
 *
 * Bei vier Fragen und zwei Spalten entsteht [[0, 2], [1, 3]], angezeigt also
 * „1 | 3" über „2 | 4". Leere Plätze am Ende sind `null`, damit die Zelle gezeichnet,
 * aber nicht gefüllt wird.
 */
export function mcZeilen<T>(items: T[], spalten: number): (T | null)[][] {
  if (spalten <= 1) return items.map((i) => [i])
  const proSpalte = Math.ceil(items.length / spalten)
  const zeilen: (T | null)[][] = []
  for (let z = 0; z < proSpalte; z++) {
    const zeile: (T | null)[] = []
    for (let s = 0; s < spalten; s++) {
      const idx = s * proSpalte + z
      zeile.push(idx < items.length ? items[idx] : null)
    }
    zeilen.push(zeile)
  }
  return zeilen
}

/**
 * Operatoren, die das Ankreuzen meinen – in den Sprachen, die auf den Blättern vorkommen.
 * Sie stehen schon in der Arbeitsanweisung; in jeder einzelnen Frage sind sie nur Lärm.
 */
const ANKREUZ_OPERATOREN = ['tick', 'choose', 'select', 'mark', 'kreuze an', 'kreuze', 'ankreuzen', 'wähle', 'coche', 'choisis', 'marca', 'elige', 'segna']

/**
 * Den wiederholten Operator vom Anfang einer Ankreuzfrage nehmen.
 *
 * Gemeldet wurde: „Die Multiple-Choice-Antworten werden alle formuliert mit **Tick** …" –
 * bei vier Fragen steht das Wort viermal da, obwohl die Arbeitsanweisung es schon sagt und
 * daneben ein angekreuztes Kästchen steht.
 *
 * Entfernt wird NUR ein fett ausgezeichnetes Wort am Anfang, und nur, wenn es der Operator
 * der Aufgabe ist oder ein bekanntes Ankreuzwort. Alles andere bleibt stehen: Ein fettes
 * Wort kann auch eine Hervorhebung im Fragetext sein, und eine Frage stillschweigend zu
 * beschneiden wäre schlimmer als eine Wiederholung.
 */
export function ohneOperator(instruction: string, operator = ''): string {
  const m = /^\s*\*\*([^*]{1,20})\*\*[\s:,-]*/.exec(instruction)
  if (!m) return instruction
  const wort = m[1]
    .trim()
    .toLowerCase()
    .replace(/[.:,]$/, '')
  const passt = (operator && wort === operator.trim().toLowerCase()) || ANKREUZ_OPERATOREN.includes(wort)
  if (!passt) return instruction
  const rest = instruction.slice(m[0].length)
  if (!rest.trim()) return instruction
  // Der Rest war vorher Satzmitte und beginnt klein – als eigene Frage braucht er einen großen Anfang
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}
