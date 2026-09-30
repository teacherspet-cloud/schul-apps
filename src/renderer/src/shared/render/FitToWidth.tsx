import { useRef } from 'react'
import { useTouch } from '../touch/touchModus'
import { useBlattAnsicht } from '../touch/zoom'

/** A4-Breite in Bildschirmpunkten (96 dpi) */
const A4_PX = (210 * 96) / 25.4
/** Abstand der beiden Seiten einer Doppelseite */
const DOPPEL_LUECKE_PX = (10 * 96) / 25.4

/**
 * Die Blattfläche aller Programme: das Blatt mittig und auf die Breite eingepasst.
 *
 * Gemessen wird der äußere Behälter, gezoomt der innere – sonst würde sich der Zoom selbst
 * messen und aufschaukeln. `zoom` (nicht `transform`) ist hier richtig, weil dabei auch der
 * Platzbedarf mitwächst bzw. schrumpft und nichts abgeschnitten oder von leerem Raum gefolgt wird.
 *
 * Wunsch der Lehrkraft (30.09.2026): Das Blatt stand linksbündig – bei eingeklappter Leiste
 * blieb rechts eine große leere Fläche. Jetzt steht es mittig und füllt die Breite („Breite
 * einpassen", bis 150 %); der Zoom ist je Programm einstellbar und gemerkt (shared/touch/zoom.tsx:
 * Knöpfe, Strg + Mausrad, Trackpad, zwei Finger, Strg + Plus/Minus). Ist das gezoomte Blatt
 * breiter als der Platz, rollt die Fläche seitwärts.
 *
 * `doppelseite`: 'seiten' – die Seiten dürfen paarweise nebeneinander stehen (Umschalter in den
 * Zoom-Knöpfen); 'breite' – nur der Zoom richtet sich danach (Deckblatt über den Seiten, damit es
 * gleich groß erscheint); false – nie.
 */
export default function FitToWidth({
  className,
  children,
  widthPx = A4_PX,
  gutterPx = 24,
  minZoom = 0.5,
  doppelseite = 'seiten'
}: {
  className?: string
  children: React.ReactNode
  /** Breite, die hineinpassen muss (Standard: A4) */
  widthPx?: number
  gutterPx?: number
  minZoom?: number
  doppelseite?: 'seiten' | 'breite' | false
}): React.JSX.Element {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const touch = useTouch()
  const { zoom, breiter, zustand, knoepfe } = useBlattAnsicht({
    flaeche: outer,
    inhalt: inner,
    breitePx: widthPx,
    doppelBreitePx: doppelseite ? 2 * widthPx + DOPPEL_LUECKE_PX : undefined,
    doppelNurBreite: doppelseite === 'breite',
    randPx: gutterPx,
    // Auf dem iPhone passt die Seite ganz auf den Bildschirm (bis 30 %)
    minEinpassen: touch ? Math.min(minZoom, 0.3) : minZoom
  })
  const doppelt = doppelseite === 'seiten' && zustand.doppelseite

  return (
    <>
      {/*
        Volle Breite: Sonst richtet sich der Behälter nach dem gezoomten Inhalt und die Messung
        schaukelt sich auf. Der Inhalt steht mittig (margin-inline: auto); ist er breiter, rollt
        der Behälter seitwärts. `--blatt-zoom` braucht touch.css, um die Werkzeugleisten der
        Bausteine trotz Verkleinerung fingergroß zu halten.
      */}
      <div
        ref={outer}
        className="fit-to-width"
        style={{ width: '100%', overflowX: breiter ? 'auto' : undefined }}
        data-gezoomt={breiter || undefined}
        data-blatt-zoom={zoom}
      >
        <div
          ref={inner}
          className={`blatt-inhalt${doppelt ? ' blatt-doppelseite' : ''}${className ? ` ${className}` : ''}`}
          style={{ zoom, '--blatt-zoom': zoom } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
      {knoepfe}
    </>
  )
}
