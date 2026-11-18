/**
 * Aufgabe ohne ihre Items (18.11.2026, Befund der Lehrkraft, Englisch 5b „Welcome to Maya's home!"):
 * „**Complete** the statements according to M1 … Example: Tom's room is … → small." – darunter standen KEINE
 * Satzanfänge. Die KI hatte das Format gewählt (answer.kind = gapText bzw. beim Neuerzeugen none), den Lückentext aber
 * leer gelassen; die Lösung nannte sogar „5 … 6 … 7 …". Keine Prüfung schlug an, auch nicht nach dem Neuerzeugen.
 *
 * Hier steht EINE Prüfung für alle Wege, die Arbeitsblatt-Bausteine erzeugen (Arbeitsblatt, Klassenarbeit, LZK über
 * `checkIntegrity`; Einzelerzeugung über `regenerateBlock`):
 * 1. Ein Antwortformat, das Inhalt braucht (Lückentext, Zuordnung, Auswahl, richtig/falsch, Reihenfolge, Tabelle),
 *    ist leer.
 * 2. Die Anweisung verlangt vorgegebene Items („Complete the statements", „Fill in the gaps", „Match", „Tick",
 *    „Ergänze die Sätze" …), aber weder Antwortbereich noch Teilaufgaben noch eine Liste in der Anweisung liefern sie.
 */
import type { Answer, TaskBlock } from '../model/types'

const voll = (s: unknown): boolean => String(s ?? '').trim().length > 0
const anzahl = (xs: readonly unknown[] | undefined): number => (xs ?? []).filter(voll).length

/** Wie viele Lücken ([[Lösung]]) ein Lückentext hat */
export const lueckenZahl = (s: string): number => (String(s ?? '').match(/\[\[[^\]]*\S[^\]]*\]\]/g) ?? []).length

const FORMAT_NAME: Partial<Record<Answer['kind'], string>> = {
  gapText: 'Lückentext',
  matching: 'Zuordnung',
  multipleChoice: 'Auswahlaufgabe',
  trueFalse: 'Richtig/Falsch',
  ordering: 'Reihenfolge',
  tableFill: 'Ausfülltabelle'
}

/** Befund, wenn ein Antwortformat, das Inhalt braucht, leer ist; sonst null (freie Formate brauchen keinen) */
export function leeresFormat(a: Answer | undefined): string | null {
  if (!a) return null
  const leer = ((): boolean => {
    switch (a.kind) {
      case 'gapText':
        return lueckenZahl(a.gapText) === 0
      case 'matching':
        return anzahl(a.left) < 2 || anzahl(a.right) < 2
      case 'multipleChoice':
        return anzahl(a.options) < 2
      case 'trueFalse':
        return !(a.statements ?? []).some((s) => voll(s?.text))
      case 'ordering':
        return anzahl(a.items) < 2
      case 'tableFill':
        return anzahl(a.headers) === 0 && !(a.rows ?? []).some((r) => (r ?? []).some(voll))
      default:
        return false
    }
  })()
  if (!leer) return null
  return a.kind === 'gapText'
    ? 'Der Lückentext ist leer: Es fehlen die Sätze bzw. Satzanfänge mit [[Lösung]] je Lücke.'
    : `Das Antwortformat „${FORMAT_NAME[a.kind] ?? a.kind}" hat keinen Inhalt (keine Aussagen, Optionen oder Einträge).`
}

/*
 * Anweisungen, die vorgegebene Items voraussetzen. Bewusst eng: nur Formulierungen, bei denen die Lernenden ohne
 * vorgegebene Sätze, Lücken, Paare oder Aussagen nichts tun können. „Answer the questions" fehlt absichtlich – die
 * Fragen können in einem Material stehen.
 */
const VERLANGT_ITEMS: RegExp[] = [
  // Englisch
  // Tabellen fehlen absichtlich: Eine auszufüllende Tabelle kann als eigener Baustein danebenstehen
  /\b(?:complete|finish)\b[^.\n]{0,40}\b(?:statements?|sentences?|sentence (?:beginnings|starters|halves)|gaps|blanks)\b/i,
  /\bfill in\b[^.\n]{0,40}\b(?:gaps|blanks|missing words)\b/i,
  /\bmatch\b[^.\n]{0,60}\b(?:with|to|and)\b/i,
  // „underline/circle … in M2" kann sich auf ein Material beziehen – nur „tick" verlangt eigene Optionen
  /\btick\b[^.\n]{0,40}\b(?:correct|right|true|false)\b/i,
  /\btrue or false\b|\bright or wrong\b/i,
  /\b(?:put|number)\b[^.\n]{0,50}\b(?:in|into) the (?:right|correct) order\b/i,
  // Deutsch
  /\b(?:ergänze|ergänzt|ergänzen sie|vervollständige|vervollständigt|vervollständigen sie)\b[^.\n]{0,50}\b(?:sätze|satzanfänge|satzhälften|lücken|aussagen|lückentext)\b/i,
  /\bfülle\b[^.\n]{0,30}\blücken\b|\bsetze\b[^.\n]{0,50}\bin die lücken\b/i,
  // „Ordne … zu" fehlt absichtlich: Die Dinge stehen oft im Material („Ordne die Ereignisse aus M2 den Phasen zu")
  /\bkreuze\b[^.\n]{0,40}\ban\b|\bkreuzen sie\b[^.\n]{0,40}\ban\b|\brichtig oder falsch\b/i,
  // Französisch / Spanisch / Italienisch / Latein (Anweisungen in der Zielsprache)
  /\bcompl[eè]te[sz]?\b[^.\n]{0,40}\b(?:phrases|trous)\b|\bcoche[sz]?\b|\brelie[sz]?\b|\bvrai ou faux\b/i,
  /\bcompleta[d]?\b[^.\n]{0,40}\b(?:frases|huecos)\b|\brelaciona[d]?\b|\bverdadero o falso\b/i,
  /\bcompleta(?:te)?\b[^.\n]{0,40}\b(?:frasi|spazi)\b|\bvero o falso\b|\bcollega(?:te)?\b/i
]

/** Zeilen der Anweisung, die Items aufzählen (- …, 1. …, a) …) – das Beispiel zählt nicht mit */
function aufzaehlungInAnweisung(instruction: string): number {
  return String(instruction ?? '')
    .split('\n')
    .filter((z) => !/^\s*(?:\*\*)?(?:example|beispiel|exemple|ejemplo|esempio)\b/i.test(z))
    .filter((z) => /^\s*(?:[-•*–]|\d{1,2}[.)]|[a-hA-H][.)])\s+\S/.test(z)).length
}

/** Die Arbeitsanweisung ohne Beispiel- und Hilfszeilen, nur der eigentliche Auftrag */
const auftrag = (instruction: string): string =>
  String(instruction ?? '')
    .split('\n')
    .filter((z) => !/^\s*(?:\*\*)?(?:example|beispiel|exemple|ejemplo|esempio)\b/i.test(z))
    .join('\n')
    .replace(/\*\*/g, '')

/**
 * Alle Befunde „Aufgabe ohne Inhalt" einer Aufgabe (leer = in Ordnung). Teilaufgaben werden einzeln geprüft;
 * der Antwortbereich der Aufgabe selbst nur, wenn es keine Teilaufgaben gibt (sonst tragen diese die Items).
 */
export function fehlenderAufgabeninhalt(
  task: Pick<TaskBlock, 'instruction' | 'answer' | 'parts'>,
  /** Ein Material, auf das die Aufgabe verweist, enthält selbst Lücken („___", [[…]]) – dann stehen die Items dort */
  itemsImMaterial = false
): string[] {
  const befunde: string[] = []
  const teile = task.parts ?? []
  if (!teile.length) {
    const f = leeresFormat(task.answer)
    if (f) befunde.push(f)
  }
  teile.forEach((p, i) => {
    const f = leeresFormat(p.answer)
    if (f) befunde.push(`Teilaufgabe ${String.fromCharCode(97 + i)}): ${f}`)
  })
  if (!befunde.length && !teile.length && !itemsImMaterial) {
    const frei = !task.answer || !(task.answer.kind in FORMAT_NAME)
    const text = auftrag(task.instruction)
    if (frei && VERLANGT_ITEMS.some((r) => r.test(text)) && aufzaehlungInAnweisung(task.instruction) < 2) {
      befunde.push(
        'Die Anweisung verlangt vorgegebene Sätze, Lücken, Aussagen oder Paare, die Aufgabe enthält aber keine – nur Anweisung und Beispiel. Die Items gehören in den Antwortbereich (z. B. Lückentext mit [[Lösung]] je Satz, Aussagen, Optionen) oder in Teilaufgaben.'
      )
    }
  }
  return befunde
}
