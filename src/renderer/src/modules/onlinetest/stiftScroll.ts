/**
 * Scrollen mit dem Finger über Schreibfeldern (03.10.2026, gemeldet: „Das Hochscrollen funktioniert
 * nicht, um nach Vokabeln in Kästen zu schauen, während man in einem Kasten schreibt").
 *
 * Die Schreibfelder hatten `touch-action: none` – jede Berührung gehörte dem Feld, auch die des
 * Fingers. Ist einmal ein Stift im Spiel (Apple Pencil, Surface-Stift), schreibt ohnehin nur der
 * Stift (Handballen-Schutz). Dann darf der Finger scrollen: `touch-action: pan-y`, und nur
 * Stift-Berührungen werden vom Scrollen ausgenommen (Safari: `touchType === 'stylus'`).
 * Ohne Stift bleibt alles wie bisher – dann schreibt der Finger.
 */
import { useEffect, useState, type RefObject } from 'react'

let stiftErkannt = false
const hoerer = new Set<() => void>()

if (typeof window !== 'undefined')
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'pen' || stiftErkannt) return
      stiftErkannt = true
      hoerer.forEach((h) => h())
    },
    { capture: true, passive: true }
  )

/** `touch-action` für ein Schreibfeld; mit Stift scrollt der Finger, ohne Stift schreibt er */
export function useStiftTouch(ref: RefObject<HTMLElement | null>): string {
  const [stift, setStift] = useState(stiftErkannt)
  useEffect(() => {
    const neu = (): void => setStift(true)
    hoerer.add(neu)
    return () => void hoerer.delete(neu)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el || !stift) return
    // Stift-Berührungen nicht scrollen lassen (iPadOS meldet sie zusätzlich als Touch)
    const halt = (e: TouchEvent): void => {
      if ([...e.touches].some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus')) e.preventDefault()
    }
    el.addEventListener('touchstart', halt, { passive: false })
    el.addEventListener('touchmove', halt, { passive: false })
    return () => {
      el.removeEventListener('touchstart', halt)
      el.removeEventListener('touchmove', halt)
    }
  }, [ref, stift])
  return stift ? 'pan-y' : 'none'
}
