import type { WsBlock } from './types'

/** Inhalt eines Bausteins ohne Versionsverwaltung */
export type BlockVersion = Omit<WsBlock, 'versions' | 'versionIndex'>

const strip = (block: WsBlock): BlockVersion => {
  const { versions: _v, versionIndex: _i, ...rest } = block as WsBlock & { versions?: unknown; versionIndex?: unknown }
  return structuredClone(rest) as BlockVersion
}

/** Anzahl der Entwürfe und aktueller Entwurf (1-basiert) */
export function versionInfo(block: WsBlock): { count: number; current: number } {
  const count = block.versions?.length ?? 1
  return { count, current: (block.versionIndex ?? count - 1) + 1 }
}

/**
 * Hängt einen neuen Entwurf an (z. B. nach einer KI-Überarbeitung). Der bisherige Stand bleibt als Entwurf erhalten,
 * einschließlich eigener Änderungen der Lehrkraft. ID und Niveaustufe bleiben gleich.
 */
export function addVersion(block: WsBlock, fresh: WsBlock): WsBlock {
  const history = [...(block.versions ?? [])]
  const index = block.versionIndex ?? history.length - 1
  if (history.length === 0) history.push(strip(block))
  else history[index] = strip(block)
  history.push(strip({ ...fresh, id: block.id, stars: block.stars } as WsBlock))
  return { ...(structuredClone(history[history.length - 1]) as WsBlock), versions: history, versionIndex: history.length - 1 }
}

/** Wechselt zu einem anderen Entwurf; Änderungen am aktuellen Entwurf werden vorher gesichert. */
export function switchVersion(block: WsBlock, target: number): WsBlock {
  const history = [...(block.versions ?? [strip(block)])]
  const index = block.versionIndex ?? history.length - 1
  const next = Math.max(0, Math.min(history.length - 1, target))
  history[index] = strip(block)
  return { ...(structuredClone(history[next]) as WsBlock), versions: history, versionIndex: next }
}
