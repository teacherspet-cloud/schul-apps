/**
 * Bereits akzeptierte Alternativen (10.10.2026) in der Oberfläche: je Sprache einmal vom Server geholt und gemerkt –
 * Lösungsblätter (Editor, Druck, PDF) lesen sie ohne eigenen Abruf; nur mit dem Schul-Apps-Server.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { aufServer } from '../../shared/plattform'
import type { AkzeptiertListe } from './akzeptiert'
import { holen, senden } from './serverApi'

const listen = new Map<string, AkzeptiertListe>()
const laeuft = new Set<string>()
const hoerer = new Set<() => void>()
let stand = 0

const melden = (): void => {
  stand++
  for (const h of hoerer) h()
}

const abonnieren = (h: () => void): (() => void) => {
  hoerer.add(h)
  return () => hoerer.delete(h)
}
const lesen = (): number => stand

/** Liste einer Sprache (neu = vom Server neu holen, z. B. nach einer Entscheidung) */
export function akzeptierteLaden(sprache: string | undefined, neu = false): void {
  if (!sprache || !aufServer() || laeuft.has(sprache) || (!neu && listen.has(sprache))) return
  laeuft.add(sprache)
  void holen<{ liste: AkzeptiertListe }>(`/server/onlinetest/alternativen?sprache=${encodeURIComponent(sprache)}`)
    .then((r) => {
      listen.set(sprache, r.liste ?? {})
      melden()
    })
    .catch(() => undefined)
    .finally(() => laeuft.delete(sprache))
}

/** Eine Alternative entfernen (×) */
export async function akzeptierteEntfernen(sprache: string, wort: string, text: string): Promise<void> {
  const r = await senden<{ liste: AkzeptiertListe }>('/server/onlinetest/alternativen/entfernen', { sprache, wort, text })
  listen.set(sprache, r.liste ?? {})
  melden()
}

/** Nach Entscheidungen im Onlinetest: beim nächsten Öffnen eines Lösungsblatts neu holen */
export function akzeptierteVergessen(): void {
  listen.clear()
}

/** Die gemerkte Liste (ohne Abruf) – z. B. für das statische Drucken */
export const akzeptierteVon = (sprache: string | undefined): AkzeptiertListe | undefined => (sprache ? listen.get(sprache) : undefined)

/** React: Liste einer Sprache, lädt beim ersten Gebrauch */
export function useAkzeptierte(sprache: string | undefined): AkzeptiertListe | undefined {
  useSyncExternalStore(abonnieren, lesen, lesen)
  useEffect(() => akzeptierteLaden(sprache), [sprache])
  return akzeptierteVon(sprache)
}
