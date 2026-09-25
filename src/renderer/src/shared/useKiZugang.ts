import { useEffect, useState } from 'react'
import { useAppSettings } from './settingsStore'

/**
 * Ob ein Text-KI-Zugang eingerichtet ist – für den Sperrgrund im Formularfuß (Paket 6).
 *
 * Bis zur Antwort gilt „ja": Ein kurz gesperrter Knopf beim Öffnen des Formulars wäre ein
 * Flackern ohne Grund. Neu gefragt wird, wenn sich die KI-Einstellung ändert – die Programme
 * bleiben im Hintergrund geöffnet, während die Lehrkraft den Zugang einrichtet.
 */
export function useKiZugang(): boolean {
  const ai = useAppSettings((s) => s.settings.ai)
  const [da, setDa] = useState(true)
  useEffect(() => {
    let weg = false
    window.api.ai
      .status()
      .then((s) => !weg && setDa(s.hasTextKey))
      .catch(() => undefined)
    return () => {
      weg = true
    }
  }, [ai])
  return da
}
