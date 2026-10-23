/**
 * Weitere richtige Lösungen in Lücken des Grammatiktests (23.10.2026, Prüfung nach dem Befund der Lehrkraft zum
 * Vokabeltest: „in manchen Lücken würden mehrere der angebotenen Wörter passen"). Im Grammatiktest gab es keine
 * Prüfrunde dafür – typische Fälle: who/that im Relativsatz, Kurz- und Langform, Simple Past und Present Perfect ohne
 * klaren Zeitbezug. Abgestimmt (Vokabeltest): alle richtigen Lösungen gelten, jede Lücke für sich.
 *
 * Das Lückenformat trägt mehrere Lösungen schon: „[[who / that]]" – Lösungsblatt zeigt beide, der Onlinetest wertet beide
 * als richtig (onlinetest/kern.ts `alternativen`). Diese Runde ergänzt, was die KI im Entwurf nicht genannt hat.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, int, obj, str } from '../../../shared/aiSchema'
import { plainText } from '../../../shared/richtext/parse'
import type { Answer, WsBlock } from '../../arbeitsblatt/model/types'

/** Eine Stelle mit Lückentext: Aufgabe (bzw. Teilaufgabe) und ihre Antwort */
interface Stelle {
  id: string
  anweisung: string
  antwort: Answer
}

const LUECKE = /\[\[([^\]]*)\]\]/g

function stellen(blocks: readonly WsBlock[]): Stelle[] {
  const aus: Stelle[] = []
  blocks.forEach((b, i) => {
    if (b.type !== 'task') return
    if (b.answer?.kind === 'gapText' && b.answer.gapText?.includes('[[')) aus.push({ id: `a${i + 1}`, anweisung: plainText(b.instruction), antwort: b.answer })
    b.parts.forEach((p, k) => {
      if (p.answer?.kind === 'gapText' && p.answer.gapText?.includes('[['))
        aus.push({ id: `a${i + 1}.${k + 1}`, anweisung: `${plainText(b.instruction)} – ${plainText(p.instruction)}`, antwort: p.answer })
    })
  })
  return aus
}

/** Text mit nummerierten Lücken für die KI: „(1)[[went]]" */
const nummeriert = (text: string): string => {
  let n = 0
  return text.replace(LUECKE, (_, l: string) => `(${++n})[[${l}]]`)
}

export function alternativenAnfrage(blocks: readonly WsBlock[], sprache: string): StructuredRequest | null {
  const liste = stellen(blocks)
  if (!liste.length) return null
  return {
    system: `Du prüfst die Lösungen eines Grammatiktests (${sprache}) wie eine genaue Fachkollegin.`,
    user: [
      'In den Lückentexten steht die Lösung jeder Lücke in [[…]], nummeriert mit (1), (2) … Prüfe JEDE Lücke: Welche ANDEREN Antworten müsste eine Lehrkraft nach Arbeitsanweisung, vorgegebenen Wörtern (Kasten, Klammern) und Kontext als richtig gelten lassen?',
      '- Nur echte, gleichwertig richtige Alternativen (z. B. „that“ statt „who“ im notwendigen Relativsatz, Kurz- statt Langform, eine zweite Zeitform, wenn der Kontext beide zulässt).',
      '- Nicht: was nur in einer weit hergeholten Lesart passt, was gegen die Arbeitsanweisung verstößt (z. B. andere Form als verlangt), Schreibvarianten derselben Lösung, die Lösung selbst.',
      '- Steht schon „a / b“ in der Lücke, nenne nur, was noch fehlt. Leere Liste, wenn nichts weiter richtig ist.',
      '',
      ...liste.map((s) => `[${s.id}] Arbeitsanweisung: ${s.anweisung}\nText: ${nummeriert(s.antwort.gapText ?? '')}`)
    ].join('\n'),
    schemaName: 'grammatik_luecken_alternativen',
    schema: obj({ aufgaben: arr(obj({ id: str('Kennung in eckigen Klammern'), luecken: arr(obj({ nr: int('Nummer der Lücke'), auch: arr(str()) })) })) })
  }
}

const norm = (s: string): string => s.toLocaleLowerCase().replace(/\s+/g, ' ').trim()

/** Antwort einarbeiten: „[[went]]" → „[[went / has gone]]"; liefert die Zahl der Lücken mit neuen Alternativen */
export function alternativenEinarbeiten(blocks: WsBlock[], daten: unknown): number {
  const nachId = new Map<string, Map<number, string[]>>()
  for (const a of ((daten as { aufgaben?: { id?: unknown; luecken?: { nr?: unknown; auch?: unknown }[] }[] } | null)?.aufgaben ?? [])) {
    const m = new Map<number, string[]>()
    for (const l of a?.luecken ?? []) {
      const nr = Number(l?.nr)
      if (Number.isInteger(nr) && Array.isArray(l.auch)) m.set(nr, l.auch.map((x) => String(x ?? '').trim()).filter((x) => x && !/[[\]]/.test(x)))
    }
    nachId.set(String(a?.id ?? ''), m)
  }
  let neu = 0
  for (const s of stellen(blocks)) {
    const m = nachId.get(s.id)
    if (!m) continue
    let n = 0
    s.antwort.gapText = (s.antwort.gapText ?? '').replace(LUECKE, (ganz, inhalt: string) => {
      const auch = m.get(++n) ?? []
      const vorhanden = inhalt.split(/\s+\/\s+|\|/).map(norm)
      const dazu = [...new Set(auch.filter((x) => !vorhanden.includes(norm(x))))]
      if (!dazu.length) return ganz
      neu++
      return `[[${[inhalt.trim(), ...dazu].join(' / ')}]]`
    })
  }
  return neu
}
