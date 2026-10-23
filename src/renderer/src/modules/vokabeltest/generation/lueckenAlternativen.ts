/**
 * Auch richtig in Lücken mit Wortkasten (23.10.2026, Befund der Lehrkraft: „in manchen Lücken würden vom Kontext her
 * mehrere der angebotenen Vokabeln passen"). Abgestimmt: Alle passenden Wörter gelten – die Lösung nennt sie
 * („big (auch: large)"), im Onlinetest zählen sie als richtig; jede Lücke wird für sich gewertet, der Satz bleibt.
 *
 * Eine eigene, kleine KI-Prüfung je Aufgabe mit Wortkasten: Welche ANDEREN Wörter des Kastens müsste eine Lehrkraft in
 * dieser Lücke als richtig gelten lassen? Übernommen wird nur, was wirklich aus dem Kasten stammt.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, int, obj, str } from '../../../shared/aiSchema'
import type { Block, GapBlock, GapTextBlock } from '../model/types'
import { baseForm } from '../render/helpTexts'
import { describeBlock } from './quality'

type LueckenBlock = GapBlock | GapTextBlock

/** Lücken mit Wortkasten – nur dort stehen die anderen Wörter den Lernenden vor Augen */
export const hatWortkasten = (b: Block): b is LueckenBlock => (b.kind === 'gap' && b.taskType !== 'wrongWord' && b.wordBank) || (b.kind === 'gapText' && b.wordBank)

/** Die Wörter des Kastens, wie sie auf dem Blatt stehen */
export function kastenWoerter(b: LueckenBlock): string[] {
  const eigene = b.kind === 'gap' ? b.items.map((i) => i.bankWord || i.answer) : b.parts.flatMap((p) => (p.type === 'gap' ? [p.bankWord || p.answer] : []))
  return [...new Set([...eigene, ...b.extraBankWords].map((w) => w.trim()).filter(Boolean))]
}

/** Die Lücken in der Zählung, die die KI sieht (describeBlock): Nummer → Lösung */
function luecken(b: LueckenBlock): { nr: number; answer: string }[] {
  if (b.kind === 'gap') return b.items.map((it, i) => ({ nr: i + 1, answer: it.answer }))
  let n = 0
  return b.parts.flatMap((p) => (p.type === 'gap' && !p.folge ? [{ nr: ++n, answer: p.answer }] : []))
}

export function alternativenAnfrage(b: LueckenBlock, system: string): StructuredRequest {
  return {
    system,
    user:
      `The students fill each gap with a word from this word box: ${kastenWoerter(b).join(', ')}\n` +
      'For EVERY gap, try each OTHER word of the word box: would a teacher have to accept it as a correct answer in this ' +
      'sentence – grammatically correct in the form the gap requires AND natural in meaning? List exactly those words, ' +
      'written as they would have to stand in the gap (adapted form if needed). Do NOT list the given answer, words that ' +
      'are not in the box, or words that only fit in a far-fetched reading. Empty list if only the given answer fits.\n\n' +
      describeBlock(b),
    schemaName: 'luecken_alternativen',
    schema: obj({ gaps: arr(obj({ itemNumber: int('number of the gap as in the task'), alsoCorrect: arr(str()) })) })
  }
}

/** Gehört die Antwort zu einem Wort des Kastens (auch in angepasster Form)? */
function ausDemKasten(wort: string, kasten: string[]): boolean {
  const w = baseForm(wort).toLowerCase()
  return kasten.some((k) => {
    const g = baseForm(k).toLowerCase()
    if (!g || !w) return false
    if (g === w) return true
    // Angepasste Form (eats, went, bigger …): gemeinsamer Wortanfang, ohne zu kurze Zufallstreffer
    const stamm = g.slice(0, Math.max(3, g.length - 2))
    return g.length >= 4 && w.startsWith(stamm)
  })
}

/**
 * Antwort der KI übernehmen: nur Wörter aus dem Kasten, nie die Lösung selbst, ohne Doppeltes. Liefert die Nummern der
 * Lücken (Zählung der Prüfung), die jetzt Alternativen haben.
 */
export function alternativenUebernehmen(b: LueckenBlock, daten: unknown): number[] {
  const kasten = kastenWoerter(b)
  const nachNr = new Map<number, string[]>()
  for (const g of ((daten as { gaps?: { itemNumber?: unknown; alsoCorrect?: unknown }[] } | null)?.gaps ?? [])) {
    const nr = Number(g?.itemNumber)
    if (!Number.isInteger(nr) || !Array.isArray(g.alsoCorrect)) continue
    nachNr.set(nr, g.alsoCorrect.map((x) => String(x ?? '').trim()).filter(Boolean))
  }
  const mit: number[] = []
  const auch = (nr: number, antwort: string): string[] | undefined => {
    const eigen = baseForm(antwort).toLowerCase()
    const liste = [...new Set((nachNr.get(nr) ?? []).filter((w) => baseForm(w).toLowerCase() !== eigen && w.toLowerCase() !== antwort.toLowerCase() && ausDemKasten(w, kasten)))]
    if (liste.length) mit.push(nr)
    return liste.length ? liste : undefined
  }
  const nummern = luecken(b)
  if (b.kind === 'gap') {
    b.items.forEach((it, i) => {
      const a = auch(nummern[i].nr, it.answer)
      if (a) it.auchRichtig = a
      else delete it.auchRichtig
    })
  } else {
    let k = 0
    for (const p of b.parts) {
      if (p.type !== 'gap' || p.folge) continue
      const a = auch(nummern[k++].nr, p.answer)
      if (a) p.auchRichtig = a
      else delete p.auchRichtig
    }
  }
  return mit
}
