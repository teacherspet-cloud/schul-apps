/**
 * Verbindung zur Spielrunde (08.10.2026): Server-Sent Events über fetch, bei Störung Rückfall auf Abfragen je Sekunde –
 * seit 24.10.2026 in shared/liveSicht.ts (auch für die Partnerarbeit). Hier nur noch die Sicht-Typen und der Wrapper.
 */
import { useCallback } from 'react'
import { senden } from '../../onlinetest/serverApi'
import { liveSenden, useLiveSicht } from '../../../shared/liveSicht'
import type { Block } from '@shared/mehrspieler/kern'
import type { Angebot } from '@shared/mehrspieler/regeln'
import type { MehrArt, Schwierigkeit } from '@shared/mehrspieler/typen'

export interface SpielSicht {
  code: string
  phase: 'warten' | 'spiel' | 'ende'
  spiel: string
  spielName: string
  art: MehrArt
  bereich: 'vok' | 'gram'
  titel: string
  ich: string
  host: boolean
  min: number
  max: number
  /** Titel und Profilbild (10.10.2026, Medaillen und Titel) – nur, wenn die Person sie zeigt */
  spieler: { id: string; name: string; verbunden: boolean; host: boolean; titel?: string | null; avatar?: string | null }[]
  schwierigkeit: Schwierigkeit
  schwierigkeiten: { id: Schwierigkeit; name: string; text: string }[]
  /** Zielsprache und Klasse des Kurses – Beschriftungen der Spielseite in der Zielsprache (09.10.2026) */
  sprache?: string
  jahrgang?: number | null
  form?: string
  formen: { id: string; name: string; waehlbar: boolean; hinweis?: string }[]
  spiele: Angebot[]
  rufe: { name: string; text: string; zeit: number }[]
  kurzrufe: string[]
  bloecke?: Block[]
  ergebnis?: {
    text: string
    teamZiel?: boolean
    unentschieden?: boolean
    sieger: string[]
    einheit: string
    eigen: { wert: number | null; richtig: number; fehler: number; gewonnen: boolean; platz?: number } | null
  }
  abbruch?: string
}

export function useSpielSicht(code: string): {
  sicht: SpielSicht | null
  fehler: string
  zug: (aktion: string, wert?: unknown) => Promise<void>
  senden: (pfad: string, k?: Record<string, unknown>) => Promise<void>
  neuLaden: () => void
} {
  // Seit 24.10.2026 über die gemeinsame Live-Sicht (shared/liveSicht.ts): erst beitreten, dann zuhören
  const vorher = useCallback(() => senden('/s/api/spiel/beitreten', { code }), [code])
  const { sicht, fehler, setSicht, setFehler, neuLaden } = useLiveSicht<SpielSicht>({
    strom: `/s/api/spiel/strom?lobby=${code}`,
    zustand: `/s/api/spiel/zustand?lobby=${code}`,
    kanal: 'spiel:sicht',
    vorher
  })
  const sendenFn = useCallback(
    async (pfad: string, k: Record<string, unknown> = {}): Promise<void> => {
      await liveSenden<SpielSicht>(`/s/api/spiel/${pfad}`, { lobby: code, ...k }, setSicht, setFehler)
    },
    [code, setSicht, setFehler]
  )
  const zug = useCallback((aktion: string, wert?: unknown) => sendenFn('zug', { aktion, wert }), [sendenFn])
  return { sicht, fehler, zug, senden: sendenFn, neuLaden }
}
