/**
 * Mitlaufende Knöpfe am Blatt (27.11.2026, Befund der Lehrkraft: „Das ? und das Sprechblasensymbol … sind zu fixiert
 * von der Position – nicht mehr sichtbar, wenn man weiter unten auf dem Blatt ist"; abgestimmt: Sie laufen an der
 * Aufgabe mit).
 *
 * Ein Knopf steht zunächst an seinem Platz (Kopf der Aufgabe bzw. oben am Schreibfeld). Rollt man weiter, wandert er
 * am oberen Bildrand mit, solange seine Aufgabe bzw. sein Feld im Bild ist, und bleibt an deren Ende stehen.
 *
 * Technik: `position: sticky` scheidet aus – das Blatt liegt in einem Kasten mit overflow: hidden (Zoom), dort klebt
 * nichts. Stattdessen meldet ein Zuhörer (Rollen in jedem Bereich, Capture am Fenster; Größenänderung) die obere
 * Sichtkante in Blattkoordinaten; nur die Knöpfe zeichnen dann neu (useSyncExternalStore), nicht das ganze Blatt.
 */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { fokusScroller } from '../lernen/fokus/FokusRahmen'

export interface SichtStore {
  get: () => number
  subscribe: (f: () => void) => () => void
}

const OHNE: SichtStore = { get: () => -Infinity, subscribe: () => () => undefined }
export const SichtKontext = createContext<SichtStore>(OHNE)

/**
 * Obere Sichtkante in Blattkoordinaten. `inhalt` = der (unskalierte) Kasten des Blatts, `massstab` = Skalierung,
 * `abstand` = Platz für die klebende Werkzeugleiste oben (Bildschirm-px).
 */
export function useSichtStore(inhalt: React.RefObject<HTMLElement | null>, massstab: number, abstand = 72): SichtStore {
  const store = useMemo(() => {
    let wert = -Infinity
    const hoerer = new Set<() => void>()
    return {
      get: () => wert,
      subscribe: (f: () => void) => {
        hoerer.add(f)
        return () => hoerer.delete(f)
      },
      setze: (w: number) => {
        if (w === wert) return
        wert = w
        hoerer.forEach((f) => f())
      }
    }
  }, [])
  useEffect(() => {
    let rahmen = 0
    const messen = (): void => {
      rahmen = 0
      const el = inhalt.current
      if (!el || !massstab) return
      const kante = fokusScroller()?.getBoundingClientRect().top ?? 0
      store.setze(Math.round((Math.max(0, kante) + abstand - el.getBoundingClientRect().top) / massstab))
    }
    const bald = (): void => {
      if (!rahmen) rahmen = requestAnimationFrame(messen)
    }
    messen()
    window.addEventListener('scroll', bald, { capture: true, passive: true })
    window.addEventListener('resize', bald)
    return () => {
      if (rahmen) cancelAnimationFrame(rahmen)
      window.removeEventListener('scroll', bald, { capture: true })
      window.removeEventListener('resize', bald)
    }
  }, [inhalt, massstab, abstand, store])
  return store
}

/** Lage eines mitlaufenden Knopfs: an seinem Platz, mit der Sichtkante wandernd, höchstens bis zum Ende seines Bereichs */
export function mitlaufLage(von: number, bis: number, hoehe: number, sicht: number): number {
  return Math.max(von, Math.min(sicht, bis - hoehe))
}

/** Halter für einen Knopf auf dem Blatt (Blattkoordinaten) */
export function Mitlauf({ x, von, bis, hoehe = 36, z = 20, children }: { x: number; von: number; bis: number; hoehe?: number; z?: number; children: React.ReactNode }): React.JSX.Element {
  const store = useContext(SichtKontext)
  const sicht = useSyncExternalStore(store.subscribe, store.get)
  return (
    <div style={{ position: 'absolute', left: x, top: mitlaufLage(von, bis, hoehe, sicht), zIndex: z }} data-mitlauf>
      {children}
    </div>
  )
}
