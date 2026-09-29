/**
 * Anzeige der Schwierigkeitsstufe – NUR für die Lehrkraft (Editor des Erwartungshorizonts,
 * Lösungsteil), nie auf dem Schülerblatt (Entscheidung der Lehrkraft, 29.09.2026).
 */
import type { TaskBlock } from '../../modules/arbeitsblatt/model/types'
import { istStufe, STUFEN, stufenLabel, type VerstehensStufe } from './stufen'

/** Hat die Aufgabe irgendeine Stufe (an sich, an Teilaufgaben oder an Aussagen)? */
export function hatStufen(block: TaskBlock): boolean {
  return (
    istStufe(block.stufe) ||
    block.parts.some((p) => istStufe(p.stufe) || p.answer.statements?.some((s) => istStufe(s.stufe))) ||
    Boolean(block.answer.statements?.some((s) => istStufe(s.stufe)))
  )
}

/**
 * Kurzzeile für den Lehrkraft-Hinweis unter der Aufgabe, z. B. „Stufe 3 (mittel)" oder
 * „Stufen: a) 1 · b) 3 · c) 2". Leer, wenn nichts eingestuft ist.
 */
export function stufenZeile(block: TaskBlock): string {
  if (!hatStufen(block)) return ''
  const eigene = istStufe(block.stufe) ? block.stufe : undefined
  if (block.parts.length) {
    const je = block.parts.map((p, i) => {
      const s: VerstehensStufe | undefined = istStufe(p.stufe) ? p.stufe : eigene
      return s ? `${String.fromCharCode(97 + i)}) ${s}` : ''
    })
    const gesetzt = je.filter(Boolean)
    if (!gesetzt.length) return eigene ? stufenLabel(eigene) : ''
    const alle = block.parts.map((p) => (istStufe(p.stufe) ? p.stufe : eigene))
    if (alle.every((s) => s && s === alle[0])) return stufenLabel(alle[0]!)
    return `Stufen: ${gesetzt.join(' · ')}`
  }
  const aussagen = block.answer.kind === 'trueFalse' ? block.answer.statements.map((s) => (istStufe(s.stufe) ? s.stufe : eigene)) : []
  if (aussagen.some(Boolean) && !aussagen.every((s) => s === eigene)) return `Stufen: ${aussagen.map((s, i) => `${i + 1}) ${s ?? '–'}`).join(' · ')}`
  return eigene ? stufenLabel(eigene) : ''
}

/** Tooltip-Text zu einer Stufe (Kernmerkmal) */
export const stufenErklaerung = (s: VerstehensStufe): string => `${stufenLabel(s)}: ${STUFEN[s].merkmal}`
