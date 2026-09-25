import { useEffect, useRef, useState } from 'react'

/** A4-Breite in Bildschirmpunkten (96 dpi) */
const A4_PX = (210 * 96) / 25.4

/**
 * Verkleinert eine A4-Vorschau so weit, dass sie in die Fensterbreite passt.
 *
 * Gemessen wird der äußere Behälter, verkleinert wird der innere – sonst würde sich
 * die Verkleinerung selbst messen und aufschaukeln. `zoom` (nicht `transform`) ist
 * hier richtig, weil dabei auch der Platzbedarf schrumpft und nichts abgeschnitten
 * oder von leerem Raum gefolgt wird.
 */
export default function FitToWidth({
  className,
  children,
  widthPx = A4_PX,
  gutterPx = 24,
  minZoom = 0.5
}: {
  className?: string
  children: React.ReactNode
  /** Breite, die hineinpassen muss (Standard: A4) */
  widthPx?: number
  gutterPx?: number
  minZoom?: number
}): React.JSX.Element {
  const outer = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const el = outer.current
    if (!el) return
    let lastWidth = 0
    const measure = (): void => {
      const available = el.clientWidth - gutterPx
      if (available <= 0) return
      // Kleine Schwankungen (auftauchender Rollbalken) nicht beachten, sonst schaltet die
      // Verkleinerung im Kreis hin und her.
      if (Math.abs(available - lastWidth) < 8) return
      lastWidth = available
      setZoom(available >= widthPx ? 1 : Math.max(minZoom, Math.round((available / widthPx) * 100) / 100))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [widthPx, gutterPx, minZoom])

  return (
    // Volle Breite: Sonst richtet sich der Behälter nach dem verkleinerten Inhalt
    // und die Messung schaukelt sich nach unten auf.
    <div ref={outer} className="fit-to-width" style={{ width: '100%' }}>
      <div className={className} style={zoom < 1 ? { zoom } : undefined}>
        {children}
      </div>
    </div>
  )
}
