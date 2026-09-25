import { useEffect } from 'react'

/**
 * Tastatur für eine offene Rückfrage: Enter bestätigt, Esc bricht ab.
 *
 * Gehört an jede Löschen-Rückfrage. Der Fokus reicht dafür nicht: Nach dem Klick im
 * ⋮-Menü holt Mantine den Fokus auf den Menüknopf zurück, der Löschen-Knopf hätte ihn
 * also nicht mehr. Tippt jemand gerade in ein Feld (z. B. Umbenennen), bleibt die Taste
 * dort.
 */
export function useConfirmKeys(active: boolean, onConfirm: () => void, onCancel?: () => void): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Escape' && onCancel) {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onConfirm, onCancel])
}
