import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Dichte der linken Leiste (09.10.2026, Befund am Notebook 1366 × 768: die Leiste passte nicht und rollte).
 *
 * Die Leiste misst nach jedem Zeichnen, ob die Programmliste überläuft, und wird dann stufenweise dichter
 * (app.css `.app-leiste[data-dichte]`):
 *  - Stufe 1: kleinere Abstände und Gruppenköpfe, Kacheln 44 statt 56 Punkte
 *  - Stufe 2 (nur mit Maus): schmale Leiste mit zwei Kacheln nebeneinander je Gruppe, breite Leiste mit flachen Zeilen
 * Mit dem Finger bleibt es bei Stufe 1 – darunter würden die Ziele kleiner als 44 Punkte.
 * Ändern sich Fensterhöhe, Breite der Leiste oder auf-/zugeklappte Gruppen, beginnt die Messung wieder bei 0.
 */
export function useLeistenDichte(schluessel: string, touch: boolean): number {
  const [stufe, setStufe] = useState(0)
  const [hoehe, setHoehe] = useState(() => (typeof window === 'undefined' ? 0 : window.innerHeight))
  const zuletzt = useRef('')
  useEffect(() => {
    const neu = (): void => setHoehe(window.innerHeight)
    window.addEventListener('resize', neu)
    return () => window.removeEventListener('resize', neu)
  }, [])
  useLayoutEffect(() => {
    const k = `${schluessel}|${hoehe}|${touch}`
    if (zuletzt.current !== k) {
      zuletzt.current = k
      if (stufe !== 0) {
        setStufe(0)
        return
      }
    }
    const liste = document.querySelector<HTMLElement>('.app-leiste .leiste-liste')
    if (!liste) return
    if (stufe < (touch ? 1 : 2) && liste.scrollHeight > liste.clientHeight + 1) setStufe(stufe + 1)
  })
  return stufe
}
