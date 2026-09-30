import { useEffect, useRef, useState } from 'react'
import { useTouch } from '../touch/touchModus'
import { useBlattZoom, useZweiFingerZoom, ZoomKnoepfe } from '../touch/zoom'

/** A4-Breite in Bildschirmpunkten (96 dpi) */
const A4_PX = (210 * 96) / 25.4

/**
 * Verkleinert eine A4-Vorschau so weit, dass sie in die Fensterbreite passt.
 *
 * Gemessen wird der äußere Behälter, verkleinert wird der innere – sonst würde sich
 * die Verkleinerung selbst messen und aufschaukeln. `zoom` (nicht `transform`) ist
 * hier richtig, weil dabei auch der Platzbedarf schrumpft und nichts abgeschnitten
 * oder von leerem Raum gefolgt wird.
 *
 * Mit dem Finger (30.09.2026, shared/touch): Zwei-Finger-Zoom auf dem Blatt und Knöpfe „–",
 * „Prozent", „+" unten rechts. Auf dem iPhone passt die Seite außerdem ganz auf den
 * Bildschirm (bis 30 % statt 50 %) – vorher lief ihr rechter Teil aus dem Bild. Ist das Blatt
 * breiter als der Platz, rollt es seitwärts. Am PC mit Maus bleibt alles wie bisher.
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
  const inner = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const touch = useTouch()
  const untergrenze = touch ? Math.min(minZoom, 0.3) : minZoom
  // Eigener Zoom der Lehrkraft auf die Seitenbreite (nur mit dem Finger) – für alle Blätter derselbe
  const [faktor, setFaktor] = useBlattZoom()
  const gesamt = touch ? zoom * faktor : zoom

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
      setZoom(available >= widthPx ? 1 : Math.max(untergrenze, Math.round((available / widthPx) * 100) / 100))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [widthPx, gutterPx, untergrenze])

  useZweiFingerZoom({ aktiv: touch, flaeche: outer, inhalt: inner, basis: zoom, faktor, setFaktor, min: 0.5, max: 4 })

  return (
    <>
      {/*
        Volle Breite: Sonst richtet sich der Behälter nach dem verkleinerten Inhalt
        und die Messung schaukelt sich nach unten auf. `--blatt-zoom` braucht touch.css, um
        die Werkzeugleisten der Bausteine trotz Verkleinerung fingergroß zu halten.
      */}
      <div ref={outer} className="fit-to-width" style={{ width: '100%' }} data-gezoomt={(touch && faktor > 1) || undefined}>
        <div ref={inner} className={className} style={gesamt !== 1 ? ({ zoom: gesamt, '--blatt-zoom': gesamt } as React.CSSProperties) : undefined}>
          {children}
        </div>
      </div>
      {touch && <ZoomKnoepfe faktor={faktor} setFaktor={setFaktor} anzeige={gesamt} min={0.5} max={4} />}
    </>
  )
}
