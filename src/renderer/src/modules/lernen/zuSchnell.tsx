/**
 * „Zu schnell geklickt" in Richtig/Falsch-Spielen und -Abfragen (09.10.2026, Regeln: shared/schnellKlick.ts).
 * `frage()` beim Erscheinen jeder neuen Frage aufrufen, `melden()` bei jeder Antwort; `hinweis` zeigt die freundliche
 * Meldung für ein paar Sekunden.
 */
import { Alert } from '@mantine/core'
import { IconHandStop } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { schnellWaechter, ZU_SCHNELL_TEXT, type SchnellErgebnis } from '@shared/schnellKlick'

export function useZuSchnell<T = undefined>(): {
  frage: () => void
  melden: (antwort: string, daten?: T) => SchnellErgebnis<T>
  /** Folge beenden (z. B. eine andere Übungsart dazwischen) */
  zuruecksetzen: () => void
  hinweis: React.ReactNode
} {
  const waechter = useRef(schnellWaechter<T>())
  const seit = useRef(performance.now())
  const [zeigen, setZeigen] = useState(0)
  useEffect(() => {
    if (!zeigen) return
    const t = setTimeout(() => setZeigen(0), 3500)
    return () => clearTimeout(t)
  }, [zeigen])
  const frage = useCallback(() => {
    seit.current = performance.now()
  }, [])
  const melden = useCallback((antwort: string, daten?: T) => {
    // Ist bekannt, ob die Antwort stimmt (daten.gut), sperrt nur blindes Raten, nicht schnelles Können
    const gut = (daten as { gut?: unknown } | undefined)?.gut
    const r = waechter.current.melden(antwort, performance.now() - seit.current, daten, typeof gut === 'boolean' ? gut : undefined)
    if (r.hinweis) setZeigen((z) => z + 1)
    return r
  }, [])
  const zuruecksetzen = useCallback(() => waechter.current.zuruecksetzen(), [])
  const hinweis = zeigen ? (
    <Alert color="yellow" radius="lg" py={8} icon={<IconHandStop size={18} />} data-zu-schnell w="100%" maw={520}>
      {ZU_SCHNELL_TEXT}
    </Alert>
  ) : null
  return { frage, melden, zuruecksetzen, hinweis }
}
