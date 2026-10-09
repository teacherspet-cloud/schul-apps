/**
 * Verbindung zur Spielrunde (08.10.2026): Server-Sent Events über fetch (Kopfzeile x-schulapps-token wie bei den
 * übrigen Aufrufen), bei Störung Rückfall auf Abfragen je Sekunde. Der Server schickt jedem Gerät seine eigene Sicht.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { holen, senden } from '../../onlinetest/serverApi'
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
  spieler: { id: string; name: string; verbunden: boolean; host: boolean }[]
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

/** SSE-Text in Ereignisse zerlegen */
function zerlege(puffer: string): { daten: string[]; rest: string } {
  const teile = puffer.split(/\r?\n\r?\n/)
  const rest = teile.pop() ?? ''
  const daten = teile
    .map((t) =>
      t
        .split(/\r?\n/)
        .filter((z) => z.startsWith('data:'))
        .map((z) => z.slice(5).trimStart())
        .join('\n')
    )
    .filter(Boolean)
  return { daten, rest }
}

export function useSpielSicht(code: string): {
  sicht: SpielSicht | null
  fehler: string
  zug: (aktion: string, wert?: unknown) => Promise<void>
  senden: (pfad: string, k?: Record<string, unknown>) => Promise<void>
  neuLaden: () => void
} {
  const [sicht, setSicht] = useState<SpielSicht | null>(null)
  const [fehler, setFehler] = useState('')
  const [runde, setRunde] = useState(0)
  const strom = useRef(false)

  useEffect(() => {
    let aus = false
    const steuerung = new AbortController()
    let abfrage: ReturnType<typeof setInterval> | undefined
    const abfragen = (): void => {
      if (abfrage) return
      abfrage = setInterval(() => {
        if (strom.current) return
        void holen<{ sicht: SpielSicht }>(`/s/api/spiel/zustand?lobby=${code}`).then(
          (r) => !aus && setSicht(r.sicht),
          (e: Error) => !aus && setFehler(e.message)
        )
      }, 1000)
    }
    const verbinden = async (): Promise<void> => {
      let warte = 1000
      while (!aus) {
        try {
          const res = await fetch(`/s/api/spiel/strom?lobby=${code}`, {
            headers: { 'x-schulapps-token': 'server' },
            cache: 'no-store',
            signal: steuerung.signal
          })
          if (res.status === 404 || res.status === 403) {
            const d = (await res.json().catch(() => ({}))) as { fehler?: string }
            setFehler(d.fehler ?? 'Diese Spielrunde gibt es nicht (mehr).')
            return
          }
          if (!res.ok || !res.body) throw new Error(String(res.status))
          strom.current = true
          warte = 1000
          const leser = res.body.getReader()
          const dec = new TextDecoder()
          let puffer = ''
          for (;;) {
            const { done, value } = await leser.read()
            if (done) break
            puffer += dec.decode(value, { stream: true })
            const { daten, rest } = zerlege(puffer)
            puffer = rest
            for (const d of daten) {
              try {
                const e = JSON.parse(d) as { kanal: string; wert: SpielSicht }
                if (e.kanal === 'spiel:sicht' && !aus) setSicht(e.wert)
              } catch {
                /* unvollständig – überspringen */
              }
            }
          }
        } catch {
          /* abgerissen – unten neu verbinden, inzwischen abfragen */
        }
        strom.current = false
        if (aus) break
        abfragen()
        await new Promise((r) => setTimeout(r, warte))
        warte = Math.min(8000, warte * 2)
      }
    }
    // Erst beitreten (bzw. wieder verbinden), dann zuhören
    void senden('/s/api/spiel/beitreten', { code }).then(
      () => {
        if (aus) return
        void verbinden()
        abfragen()
      },
      (e: Error) => !aus && setFehler(e.message)
    )
    return () => {
      aus = true
      steuerung.abort()
      if (abfrage) clearInterval(abfrage)
    }
  }, [code, runde])

  const sendenFn = useCallback(
    async (pfad: string, k: Record<string, unknown> = {}): Promise<void> => {
      try {
        const r = await senden<{ sicht?: SpielSicht }>(`/s/api/spiel/${pfad}`, { lobby: code, ...k })
        if (r.sicht) setSicht(r.sicht)
        setFehler('')
      } catch (e) {
        setFehler(e instanceof Error ? e.message : String(e))
      }
    },
    [code]
  )
  const zug = useCallback((aktion: string, wert?: unknown) => sendenFn('zug', { aktion, wert }), [sendenFn])
  return { sicht, fehler, zug, senden: sendenFn, neuLaden: () => setRunde((x) => x + 1) }
}
