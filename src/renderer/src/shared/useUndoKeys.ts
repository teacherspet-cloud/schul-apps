import { useEffect, useRef } from 'react'
import { schreibfeld, verlaufsTaste } from './undo'

/**
 * Strg+Z / Strg+Y / Strg+Umschalt+Z für ein Programm.
 *
 * Vorher hatten Arbeitsblatt und Vokabeltest je eine eigene Fassung, und beide hingen am
 * FENSTER, solange der Editor gemountet war – also auch dann, wenn ein anderes Programm
 * vorn lag (die Programme bleiben im Hintergrund erhalten). Strg+Z in der Klassenarbeit
 * nahm dann still eine Änderung im Arbeitsblatt zurück. Deshalb gilt die Taste nur, solange
 * `aktiv` ist.
 *
 * In Textfeldern bleibt die Taste beim Feld: Dort nimmt sie das Getippte zurück.
 */
export function useUndoKeys(aktiv: boolean, undo: () => void, redo: () => void): void {
  const aktuell = useRef({ undo, redo })
  aktuell.current = { undo, redo }
  useEffect(() => {
    if (!aktiv) return
    const onKey = (e: KeyboardEvent): void => {
      const taste = verlaufsTaste(e)
      if (!taste || schreibfeld(e.target)) return
      e.preventDefault()
      if (taste === 'undo') aktuell.current.undo()
      else aktuell.current.redo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aktiv])
}
