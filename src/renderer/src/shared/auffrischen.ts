/**
 * Listen der Lernenden frisch halten (08.10.2026, Befund im Unterricht: neu freigeschaltete Vokabeln erschienen erst
 * nach dem Neuladen). Lädt neu, sobald die Seite wieder sichtbar wird (Tab, App-Wechsel, Tablet aufgeweckt) und – solange
 * sie sichtbar ist – jede Minute. `aktiv = false` (z. B. während einer Übungsrunde) setzt das aus.
 */
import { useEffect, useRef } from 'react'

export function useAuffrischen(laden: () => void, aktiv = true, abstandMs = 60_000): void {
  const fn = useRef(laden)
  fn.current = laden
  useEffect(() => {
    if (!aktiv) return
    let zuletzt = Date.now()
    const jetztLaden = (): void => {
      // Nicht öfter als alle 5 Sekunden (Fokus und Sichtbarkeit kommen oft zusammen)
      if (Date.now() - zuletzt < 5000) return
      zuletzt = Date.now()
      fn.current()
    }
    const sichtbar = (): void => {
      if (document.visibilityState === 'visible') jetztLaden()
    }
    document.addEventListener('visibilitychange', sichtbar)
    window.addEventListener('focus', jetztLaden)
    const uhr = window.setInterval(() => document.visibilityState === 'visible' && jetztLaden(), abstandMs)
    return () => {
      document.removeEventListener('visibilitychange', sichtbar)
      window.removeEventListener('focus', jetztLaden)
      window.clearInterval(uhr)
    }
  }, [aktiv, abstandMs])
}
