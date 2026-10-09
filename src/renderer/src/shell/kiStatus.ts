/**
 * Stand der KI-Zugänge für die Köpfe der eingeklappten Karten in den Einstellungen (09.10.2026).
 * Neu geholt, wenn sich die Einstellungen ändern oder ein Schlüssel gespeichert/entfernt wurde (`meldeKiStatus`).
 */
import { useEffect, useState } from 'react'
import type { AiStatus, SecretName } from '@shared/types'
import { useAppSettings } from '../shared/settingsStore'

const EREIGNIS = 'schulapps:ki-status'

/** Nach dem Speichern oder Entfernen eines Schlüssels aufrufen */
export function meldeKiStatus(): void {
  try {
    window.dispatchEvent(new Event(EREIGNIS))
  } catch {
    // ohne Fenster (Tests) nichts zu tun
  }
}

function useNeuHolen<T>(holen: () => Promise<T>, abhaengig: unknown): T | null {
  const [wert, setWert] = useState<T | null>(null)
  useEffect(() => {
    let weg = false
    const los = (): void => void holen().then((w) => !weg && setWert(w), () => undefined)
    los()
    window.addEventListener(EREIGNIS, los)
    return () => {
      weg = true
      window.removeEventListener(EREIGNIS, los)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abhaengig])
  return wert
}

export function useKiStatus(): AiStatus | null {
  const ai = useAppSettings((s) => s.settings.ai)
  return useNeuHolen(() => window.api.ai.status(), ai)
}

/** Ist ein Schlüssel hinterlegt? null, solange es noch nicht feststeht */
export function useSchluesselDa(name: SecretName): boolean | null {
  return useNeuHolen(() => window.api.secrets.has(name), name)
}
