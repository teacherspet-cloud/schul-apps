/** Typen des Sprechtrainings im Browser (Antworten von /s/api/sprechen, server/sprechen.ts) */
import type { Tipp } from '@shared/sprechen/bewertung'
import type { KriteriumId } from '@shared/sprechen/kriterien'
import type { Niveau, SprechSprache, Teil } from '@shared/sprechen/niveaus'

export interface Uebung {
  zeit: number
  teil: Teil
  modus: 'ueben' | 'pruefung'
  minuten: number
  wertung: Partial<Record<KriteriumId, number>>
  punkte: number
  staerke: string
  tipps: Tipp[]
  proaktiv?: string
  ausspracheUnsicher: boolean
}

export interface SprechFreigabe {
  id: string
  fach: string
  sprache: SprechSprache
  teile: Teil[]
  bis: number
  niveau: Niveau
  jahrgang: number | null
  minutenRest: number
  gesperrt: boolean
  uebungen: Uebung[]
}

/**
 * Übung in der Lehrkraft-Ansicht (23.10.2026, Nachprüfung des Schulträgers): nur Werte, Tipps und
 * das Datum – keine Uhrzeit, keine Minuten (server/sprechen.ts, fuerLehrkraft)
 */
export type LehrUebung = Omit<Uebung, 'zeit' | 'minuten'> & { datum: string }

/** Gewertete Übungen (ohne abgebrochene) */
export const gewertet = <T extends Pick<Uebung, 'wertung'>>(u: T[]): T[] => u.filter((x) => Object.keys(x.wertung).length > 0)
