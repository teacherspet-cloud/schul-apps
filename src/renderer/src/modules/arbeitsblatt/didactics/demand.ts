/**
 * Passt die Aufgabe zu dem, was ihr Operator verlangt?
 *
 * Der häufigste Fehler eines von einer KI geschriebenen Arbeitsblattes ist nicht ein falscher
 * Operator, sondern ein richtiger Operator ohne die dazugehörige Anforderung: Die Aufgabe
 * sagt „Arbeite heraus" (Anforderungsbereich II), aber die Lösung steht wörtlich im Material.
 * Dann ist es in Wahrheit ein „Nenne" – Anforderungsbereich I.
 *
 * Die Ursache liegt darin, dass dieselbe KI Material UND Aufgabe schreibt. Sie neigt dazu, die
 * Antwort als fertigen Satz in den Text zu legen. Drei Dinge wirken dagegen:
 * - Regeln für den Auftrag (`demandRules`), die das ausdrücklich verbieten,
 * - eine Prüfung ohne KI (`checkDemand`), die den Wortlaut von Lösung und Material vergleicht,
 * - und die vorhandene Nachbesserung, die schwere Befunde neu erzeugen lässt.
 *
 * Belegt ist die Unterscheidung in den KMK-Bildungsstandards und den Operatorenlisten der
 * Länder: AFB I gibt Gelerntes wieder, AFB II wendet es auf einen neuen Zusammenhang an,
 * AFB III urteilt und gestaltet. Ein Operator allein sagt darüber nichts – erst die Aufgabe.
 */
import type { Afb, Sheet, TaskBlock, WsBlock } from '../model/types'
import type { IntegrityFinding } from './integrity'

/** Wörter eines Textes in Kleinschreibung, ohne Satzzeichen und ohne sehr kurze Wörter. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\[\[|\]\]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3)
}

/** Wortketten fester Länge – sie erkennen wörtliche Übernahmen zuverlässiger als einzelne Wörter. */
function ngrams(list: string[], n = 4): string[] {
  const out: string[] = []
  for (let i = 0; i + n <= list.length; i++) out.push(list.slice(i, i + n).join(' '))
  return out
}

/**
 * Anteil der Wortketten aus `answer`, die wörtlich im `material` stehen (0 bis 1).
 * Hoch bedeutet: Die Lösung ist abgeschrieben.
 */
export function verbatimShare(answer: string, material: string): number {
  const a = ngrams(words(answer))
  if (!a.length) return 0
  const inMaterial = new Set(ngrams(words(material)))
  return a.filter((g) => inMaterial.has(g)).length / a.length
}

/** Ab diesem Anteil gilt eine Lösung als aus dem Material abgeschrieben. */
export const VERBATIM_LIMIT = 0.5

/** Alle Texte, die als Material auf dem Blatt stehen. */
function materialText(blocks: WsBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'text') return `${b.body} ${b.glossary.map((g) => `${g.term} ${g.explanation}`).join(' ')}`
      if (b.type === 'table') return `${b.headers.join(' ')} ${b.rows.flat().join(' ')}`
      if (b.type === 'infoBox') return b.body
      return ''
    })
    .join('\n')
}

/** Spaltenüberschriften der Materialtabellen des Blattes. */
function materialTableHeaders(blocks: WsBlock[]): string[][] {
  return blocks.filter((b) => b.type === 'table').map((b) => (b.type === 'table' ? b.headers.map((h) => h.toLowerCase().trim()) : []))
}

const demanding = (afb?: Afb): boolean => afb === 'II' || afb === 'III'

/**
 * Beansprucht die Aufgabe mehr als Wiedergeben? Bis 29.09.2026 entschied das allein der AFB.
 * Seit dem Stufenraster (shared/verstehen/stufen.ts) gilt: Wortgleichheit ist nur dann ein
 * Befund, wenn die Aufgabe eine höhere Stufe beansprucht – also AFB II/III ODER eine
 * ausgewiesene Stufe ab 3 (an der Aufgabe oder einer Teilaufgabe).
 */
const beanspruchtMehr = (block: TaskBlock): boolean =>
  demanding(block.afb) || (block.stufe ?? 0) >= 3 || block.parts.some((p) => (p.stufe ?? 0) >= 3)

/**
 * Operatoren, bei denen der Wortlaut des Materials in der Lösung stehen SOLL.
 * „Belege am Text" verlangt genau das – hier wäre eine Meldung falsch.
 */
const QUOTING_OPERATORS = ['beleg', 'weise nach', 'zitier', 'give evidence', 'quote', 'zeige am text', 'belegen']

const wantsQuotation = (operator: string, instruction: string): boolean => {
  const t = `${operator} ${instruction}`.toLowerCase()
  return QUOTING_OPERATORS.some((o) => t.includes(o))
}

/**
 * Prüft, ob die Aufgaben die Anforderung tragen, die ihr Operator verspricht –
 * und ob die Begriffserklärungen etwas leisten, das nicht schon im Text steht.
 */
export function checkDemand(sheet: Sheet): IntegrityFinding[] {
  const findings: IntegrityFinding[] = []
  const material = materialText(sheet.blocks)
  const headers = materialTableHeaders(sheet.blocks)

  for (const block of sheet.blocks) {
    if (block.type === 'task') {
      // 1. Lösung wörtlich im Material, obwohl der Operator (oder die Stufe) mehr verlangt
      if (beanspruchtMehr(block) && !wantsQuotation(block.operator, block.instruction)) {
        const eintraege = [
          { solution: block.solution, stufe: block.stufe },
          ...block.parts.map((p) => ({ solution: p.solution ?? '', stufe: p.stufe ?? block.stufe }))
        ].filter((e) => words(e.solution).length >= 8)
        for (const { solution, stufe } of eintraege) {
          // Stufe 1–2 ausdrücklich ausgewiesen: Wortgleichheit ist dort gewollt (Stufenraster, 29.09.2026)
          if (stufe !== undefined && stufe <= 2) continue
          if (verbatimShare(solution, material) >= VERBATIM_LIMIT) {
            findings.push({
              blockId: block.id,
              severity: 'hoch',
              message:
                stufe !== undefined && !demanding(block.afb)
                  ? `Die Aufgabe ist als Schwierigkeitsstufe ${stufe} ausgewiesen, die Lösung steht aber fast wörtlich im Material. Das entspricht Stufe 1 („sehr leicht"). Entweder die Stufe senken oder die Aufgabe so zuschneiden, dass die Lösung umformuliert oder aus mehreren Stellen erschlossen werden muss.`
                  : `Die Aufgabe verlangt „${block.operator}" (Anforderungsbereich ${block.afb}), die Lösung steht aber fast wörtlich im Material. So ist es in Wahrheit ein Wiedergeben. Das Material darf die Antwort nicht als fertigen Satz enthalten – sie muss aus mehreren Stellen erschlossen werden.`
            })
            break
          }
        }
      }

      // 2. Die Aufgabentabelle bildet die Materialtabelle nach – dann wird nur umgeschrieben
      const answers = [block.answer, ...block.parts.map((p) => p.answer)]
      for (const answer of answers) {
        if (answer?.kind !== 'tableFill' || !answer.headers?.length) continue
        const own = answer.headers.map((h) => h.toLowerCase().trim()).filter(Boolean)
        for (const source of headers) {
          const shared = own.filter((h) => source.includes(h)).length
          if (own.length >= 2 && shared >= Math.max(2, Math.ceil(own.length * 0.6))) {
            findings.push({
              blockId: block.id,
              severity: 'mittel',
              message:
                'Die Tabelle der Aufgabe hat dieselben Spalten wie die Tabelle im Material – die Lernenden schreiben nur um. Verlange einen anderen Zuschnitt: vergleichen, ordnen, gewichten oder eine Folgerung ziehen.'
            })
            break
          }
        }
      }
    }

    // 3. Begriffserklärung wiederholt, was im Text schon steht
    if (block.type === 'text' && block.glossary.length) {
      const body = block.body
      for (const entry of block.glossary) {
        if (words(entry.explanation).length < 5) continue
        if (verbatimShare(entry.explanation, body) >= 0.6) {
          findings.push({
            blockId: block.id,
            severity: 'mittel',
            message: `Die Erklärung zu „${entry.term}" steht fast wörtlich schon im Text. Eine Erklärung am Rand ist dazu da, den Begriff IM Text benutzen zu können, ohne ihn dort auszubreiten – der Text soll die Erklärung also nicht doppeln.`
          })
        }
      }
    }
  }
  return findings
}

/**
 * Regeln für den KI-Auftrag.
 * Sie stehen bei den Aufgabenregeln, weil sie jede Aufgabe betreffen.
 */
export function demandRules(): string {
  return [
    'ANFORDERUNG UND OPERATOR MÜSSEN ZUSAMMENPASSEN:',
    '- Bei Anforderungsbereich II und III darf die Lösung NICHT als fertiger Satz im Material stehen. Sie muss aus mindestens zwei Stellen zusammengesetzt, aus Angaben erschlossen oder begründet gewichtet werden.',
    '- Prüfe jede Aufgabe selbst: Ließe sich die Lösung durch Abschreiben eines einzigen Satzes finden? Dann ist es ein „Nenne" – entweder der Operator wird zu „Nenne" geändert oder die Aufgabe wird anspruchsvoller zugeschnitten.',
    '- Schreibe Material und Aufgabe NICHT parallel: Das Material enthält die Angaben, die Aufgabe verlangt etwas, das daraus erst entsteht (Vergleich, Ursache, Folge, Gewichtung, Widerspruch, Übertragung).',
    '- Eine Tabelle in der Aufgabe hat NIE dieselben Spalten wie eine Tabelle im Material. Sonst wird nur umgeschrieben. Wähle einen anderen Zuschnitt – etwa Gegenüberstellung, Rangfolge, Ursache und Folge oder „Wer gewinnt, wer verliert".',
    '- Liegen die Angaben schon geordnet vor (Tabelle, Aufzählung), lautet die anspruchsvolle Aufgabe: vergleichen, gewichten, Widersprüche zeigen, eine Entscheidung begründen – nicht übertragen.',
    '',
    'BEGRIFFSERKLÄRUNGEN (glossary):',
    '- Eine Erklärung am Rand ist dazu da, den Begriff im Text BENUTZEN zu können, ohne ihn dort zu erläutern. Steht die Erklärung schon im Fließtext, gehört sie nicht zusätzlich ins Glossar.',
    '- Entscheide je Begriff: entweder im Text erklärt ODER im Glossar – niemals beides.',
    '- Ins Glossar gehören nur Begriffe, die zum Verstehen nötig sind und nicht zum geprüften Lernstoff gehören.'
  ].join('\n')
}
