/**
 * Aufgaben mit dem Video verbinden, zu dem sie gehören.
 *
 * Ohne diese Zuordnung wüsste die Prüfung nicht, worauf sich eine Beobachtungsaufgabe
 * bezieht – genau der Fehler, der beim Hörverstehen lange unbemerkt blieb: Das Feld war
 * deklariert, wurde aber nie geschrieben.
 *
 * Zugeordnet wird jede Aufgabe NACH einem Video-Baustein, die eine Beobachtungsphase trägt.
 * Eine Aufgabe ohne Phase gehört nicht zur Beobachtung, auch wenn sie danach steht.
 */
import type { WsBlock } from '../model/types'

export function linkVideoTasks(blocks: WsBlock[]): number {
  let current: string | null = null
  let linked = 0
  for (const block of blocks) {
    if (block.type === 'video') {
      current = block.id
      continue
    }
    if (block.type !== 'task' || !current) continue
    if (!block.viewingPhase) continue
    block.videoId = current
    linked++
  }
  return linked
}

/**
 * Aufgaben vor dem Sehen dürfen nicht hinter denen während des Sehens stehen.
 *
 * Die KI liefert die Reihenfolge meist richtig, aber nicht immer. Auf Papier ist eine
 * vertauschte Reihenfolge fatal: Wer den Beobachtungsauftrag erst nach dem Film liest,
 * hat nicht beobachtet. Deshalb wird hier stabil sortiert – innerhalb einer Phase bleibt
 * die Reihenfolge der KI erhalten.
 */
const PHASE_ORDER = { vor: 0, waehrend: 1, nach: 2 } as const

export function sortViewingTasks(blocks: WsBlock[]): WsBlock[] {
  const firstTask = blocks.findIndex((b) => b.type === 'task' && b.viewingPhase)
  if (firstTask < 0) return blocks
  const lastTask = blocks.length - 1 - [...blocks].reverse().findIndex((b) => b.type === 'task' && b.viewingPhase)
  // Nur der zusammenhängende Bereich der Beobachtungsaufgaben wird umsortiert: Alles
  // andere – Material, Hilfen, Selbsteinschätzung – bleibt, wo die KI es hingestellt hat.
  const middle = blocks.slice(firstTask, lastTask + 1)
  if (middle.some((b) => b.type !== 'task' || !b.viewingPhase)) return blocks
  const sorted = middle
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const bx = x.b.type === 'task' && x.b.viewingPhase ? PHASE_ORDER[x.b.viewingPhase] : 9
      const by = y.b.type === 'task' && y.b.viewingPhase ? PHASE_ORDER[y.b.viewingPhase] : 9
      return bx - by || x.i - y.i
    })
    .map((x) => x.b)
  return [...blocks.slice(0, firstTask), ...sorted, ...blocks.slice(lastTask + 1)]
}
