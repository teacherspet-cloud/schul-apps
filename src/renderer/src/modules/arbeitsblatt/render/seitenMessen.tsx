/**
 * Seitenaufteilung messen, ohne dass der Editor offen ist (05.10.2026, Unterrichtsreihe: gekürzte
 * Materialien und Platzhalter-Blätter). Wunsch der Lehrkraft: „achte unbedingt darauf, dass die Seiten
 * weiterhin gut formatiert sind … die Seitenumbrüche keine abgeschnittenen Texte oder Bereiche
 * verursachen". Ohne Messung teilte der Druckweg selbst auf – das ist nicht der geprüfte Weg.
 *
 * Dieselbe Messung wie im Editor (`useSheetLayouts`, samt Nachprüfung gegen Überlauf), in einem
 * eigenen Bereich außerhalb des Bildschirms – NICHT `display: none` (dort ist jede Höhe 0).
 * Fertig, wenn alle Blätter gemessen sind und sich das Ergebnis eine Weile nicht mehr ändert.
 */
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { Worksheet } from '../model/types'
import type { PagePlan } from './paginate'
import { layoutKey, useSheetLayouts } from './SheetPages'

function Messung({
  ws,
  logo,
  schule,
  fertig
}: {
  ws: Worksheet
  logo: string | null
  schule: string
  fertig: (l: Map<string, PagePlan[]>) => void
}): React.JSX.Element {
  const { layouts, measure } = useSheetLayouts(ws, logo, schule)
  useEffect(() => {
    const alle = ws.sheets.every((s) => (layouts.get(layoutKey(s.id, false))?.length ?? 0) > 0)
    if (!alle) return
    // Ruhe abwarten: Nachprüfung und spät geladene Bilder/Schriften messen noch einmal
    const t = setTimeout(() => fertig(layouts), 900)
    return () => clearTimeout(t)
  }, [layouts, ws, fertig])
  return <>{measure}</>
}

/** Gemessene Seitenaufteilung aller Blätter (Schüler- und Lösungsteil) */
export function messeSeiten(ws: Worksheet, logo: string | null, schule: string, hoechstensMs = 20000): Promise<Map<string, PagePlan[]>> {
  return new Promise((ok) => {
    const ort = document.createElement('div')
    ort.setAttribute('aria-hidden', 'true')
    ort.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;pointer-events:none;'
    document.body.appendChild(ort)
    const root = createRoot(ort)
    let zuletzt = new Map<string, PagePlan[]>()
    let erledigt = false
    const ende = (l: Map<string, PagePlan[]>): void => {
      if (erledigt) return
      erledigt = true
      clearTimeout(notbremse)
      // Nach dem Rendern abbauen, nicht mittendrin
      setTimeout(() => {
        root.unmount()
        ort.remove()
      }, 0)
      ok(l)
    }
    const notbremse = setTimeout(() => ende(zuletzt), hoechstensMs)
    root.render(
      <Messung
        ws={ws}
        logo={logo}
        schule={schule}
        fertig={(l) => {
          zuletzt = l
          ende(l)
        }}
      />
    )
  })
}
