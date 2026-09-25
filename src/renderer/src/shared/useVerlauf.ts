import { useCallback, useState } from 'react'
import { leererVerlauf, merke, rueckgaengig, type Verlauf, wiederholen } from './undo'

/**
 * Ein Stand mit Rückgängig/Wiederholen für Editoren ohne eigenen Store (Listen- und
 * Schulbuch-Editor der Vokabellisten, Paket 7).
 *
 * Anlass: „Zeile löschen" soll dort nicht nachfragen, sondern mit Strg+Z zurückzuholen sein –
 * wie überall seit Paket 1. Rechnet mit denselben Funktionen wie die Stores (undo.ts).
 */
export function useVerlauf<T>(anfang: () => T): {
  stand: T
  /** Ändern; `gruppe` fasst fortlaufendes Tippen im selben Feld zu einem Schritt */
  setze: (neu: T, gruppe?: string) => void
  /** Neu laden (z. B. anderer Abschnitt) – ohne Verlaufseintrag, der Verlauf beginnt neu */
  lade: (neu: T) => void
  undo: () => boolean
  redo: () => boolean
  kannUndo: boolean
  kannRedo: boolean
} {
  const [z, setZ] = useState<{ stand: T; verlauf: Verlauf<T> }>(() => ({ stand: anfang(), verlauf: leererVerlauf() }))
  const setze = useCallback((neu: T, gruppe?: string) => setZ((a) => ({ stand: neu, verlauf: merke(a.verlauf, a.stand, gruppe ?? null) })), [])
  const lade = useCallback((neu: T) => setZ({ stand: neu, verlauf: leererVerlauf() }), [])
  const undo = (): boolean => {
    const r = rueckgaengig(z.verlauf, z.stand)
    if (r) setZ({ stand: r.stand, verlauf: r.verlauf })
    return Boolean(r)
  }
  const redo = (): boolean => {
    const r = wiederholen(z.verlauf, z.stand)
    if (r) setZ({ stand: r.stand, verlauf: r.verlauf })
    return Boolean(r)
  }
  return { stand: z.stand, setze, lade, undo, redo, kannUndo: z.verlauf.past.length > 0, kannRedo: z.verlauf.future.length > 0 }
}
