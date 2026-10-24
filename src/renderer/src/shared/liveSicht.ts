/**
 * Live-Sicht vom Server (08.10.2026 für Spielrunden, 24.10.2026 herausgezogen für die Partnerarbeit): Server-Sent
 * Events über fetch (Kopfzeile x-schulapps-token wie bei den übrigen Aufrufen), bei Störung Rückfall auf Abfragen je
 * Sekunde und Neuverbinden mit wachsendem Abstand. Der Server schickt jedem Gerät seine eigene Sicht.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { holen, senden } from '../modules/onlinetest/serverApi'

/** SSE-Text in Ereignisse zerlegen */
export function zerlege(puffer: string): { daten: string[]; rest: string } {
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

export interface LiveSicht<T> {
  sicht: T | null
  fehler: string
  setSicht: (s: T) => void
  setFehler: (f: string) => void
  neuLaden: () => void
  /** Strom offen (sonst Abfrage-Rückfall) */
  verbunden: boolean
}

export function useLiveSicht<T>(o: {
  /** GET-Pfad des Stroms (text/event-stream) */
  strom: string
  /** GET-Pfad für den Rückfall → { sicht } */
  zustand: string
  kanal: string
  /** Vor dem Zuhören (z. B. beitreten/anmelden); Fehler beendet den Versuch */
  vorher?: () => Promise<unknown>
  /** Antwort der Vorher-Anfrage enthält schon eine Sicht */
  sichtAus?: (antwort: unknown) => T | null
  aktiv?: boolean
}): LiveSicht<T> {
  const [sicht, setSicht] = useState<T | null>(null)
  const [fehler, setFehler] = useState('')
  const [runde, setRunde] = useState(0)
  const [verbunden, setVerbunden] = useState(false)
  const strom = useRef(false)
  const { strom: stromPfad, zustand, kanal, vorher, sichtAus, aktiv = true } = o

  useEffect(() => {
    if (!aktiv) return
    let aus = false
    const steuerung = new AbortController()
    let abfrage: ReturnType<typeof setInterval> | undefined
    const abfragen = (): void => {
      if (abfrage) return
      abfrage = setInterval(() => {
        if (strom.current) return
        void holen<{ sicht: T }>(zustand).then(
          (r) => !aus && setSicht(r.sicht),
          (e: Error) => !aus && setFehler(e.message)
        )
      }, 1000)
    }
    const verbinden = async (): Promise<void> => {
      let warte = 1000
      while (!aus) {
        try {
          const res = await fetch(stromPfad, { headers: { 'x-schulapps-token': 'server' }, cache: 'no-store', signal: steuerung.signal })
          if (res.status === 404 || res.status === 403 || res.status === 401) {
            const d = (await res.json().catch(() => ({}))) as { fehler?: string }
            setFehler(d.fehler ?? 'Das gibt es nicht (mehr).')
            return
          }
          if (!res.ok || !res.body) throw new Error(String(res.status))
          strom.current = true
          setVerbunden(true)
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
                const e = JSON.parse(d) as { kanal: string; wert: T }
                if (e.kanal === kanal && !aus) setSicht(e.wert), setFehler('')
              } catch {
                /* unvollständig – überspringen */
              }
            }
          }
        } catch {
          /* abgerissen – unten neu verbinden, inzwischen abfragen */
        }
        strom.current = false
        setVerbunden(false)
        if (aus) break
        abfragen()
        await new Promise((r) => setTimeout(r, warte))
        warte = Math.min(8000, warte * 2)
      }
    }
    const start = (): void => {
      if (aus) return
      void verbinden()
      abfragen()
    }
    if (vorher)
      vorher().then(
        (antwort) => {
          const s = sichtAus?.(antwort)
          if (s && !aus) setSicht(s)
          start()
        },
        (e: Error) => !aus && setFehler(e.message)
      )
    else start()
    return () => {
      aus = true
      steuerung.abort()
      if (abfrage) clearInterval(abfrage)
    }
    // vorher/sichtAus bewusst nicht als Abhängigkeit – sie wechseln je Render
  }, [stromPfad, zustand, kanal, runde, aktiv]) // eslint-disable-line react-hooks/exhaustive-deps

  const neuLaden = useCallback(() => setRunde((x) => x + 1), [])
  return { sicht, fehler, setSicht, setFehler, neuLaden, verbunden }
}

/** POST mit Sicht in der Antwort (`{ sicht }`) – die Sicht wird sofort übernommen */
export async function liveSenden<T>(
  pfad: string,
  koerper: Record<string, unknown>,
  uebernehmen: (s: T) => void,
  fehler: (f: string) => void
): Promise<boolean> {
  try {
    const r = await senden<{ sicht?: T }>(pfad, koerper)
    if (r.sicht) uebernehmen(r.sicht)
    fehler('')
    return true
  } catch (e) {
    fehler(e instanceof Error ? e.message : String(e))
    return false
  }
}
