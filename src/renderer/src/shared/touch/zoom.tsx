import { ActionIcon, Button } from '@mantine/core'
import { IconZoomIn, IconZoomOut } from '@tabler/icons-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { abstand, pinchZoom, zoomSchritt, type Punkt } from './gestenLogik'
import { useTouch } from './touchModus'

/**
 * Zwei-Finger-Zoom für Blätter und Vorschauen (30.09.2026).
 *
 * Auf dem iPhone passt eine A4-Seite nur in etwa 40 % ihrer Größe auf den Bildschirm; zum Lesen
 * und Bearbeiten muss man hineinzoomen können – wie in jeder Dokument-App (Pages, GoodNotes).
 * Gezoomt wird nur das Blatt, nicht die ganze Oberfläche (die Leisten bleiben bedienbar).
 *
 * Technik: Touch-Ereignisse (nicht Pointer-Ereignisse – die bricht der Browser beim Rollen ab).
 * Liegen zwei Finger auf, verhindert `preventDefault` das Rollen, und der Abstand der Finger
 * bestimmt den Zoom. Der Punkt zwischen den Fingern bleibt dabei an seiner Stelle.
 *
 * WCAG 2.5.1: Jede Mehrfinger-Geste braucht einen Weg mit einem Finger – die Knöpfe
 * „–", „Prozent" (zurück auf Seitenbreite) und „+" (ZoomKnoepfe).
 */

/*
 * EIN Zoom für alle Blätter: Deckblatt und Seiten des Arbeitsblatts stehen untereinander und
 * sollen gleich groß bleiben; wer im Vokabeltest auf 150 % gezoomt hat, findet das nächste
 * Blatt ebenso vor (wie in einer Dokument-App). Die Knöpfe zeigt nur die letzte Fläche (touch.css).
 */
let blattFaktor = 1
const blattHoerer = new Set<() => void>()
const setBlattFaktor = (f: number): void => {
  blattFaktor = f
  blattHoerer.forEach((h) => h())
}

export function useBlattZoom(): [number, (f: number) => void] {
  const f = useSyncExternalStore(
    (h) => {
      blattHoerer.add(h)
      return () => blattHoerer.delete(h)
    },
    () => blattFaktor,
    () => 1
  )
  return [f, setBlattFaktor]
}

/** Nächster Vorfahr, der senkrecht rollt (ScrollArea-Fenster) */
function senkrechtRollend(el: HTMLElement | null): HTMLElement | null {
  for (let e = el?.parentElement ?? null; e; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY
    if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight) return e
  }
  return null
}

/**
 * Hängt den Zwei-Finger-Zoom an `flaeche`. `inhalt` ist das Element mit CSS-`zoom`;
 * `basis` der Zoom ohne Zutun der Lehrkraft (Seitenbreite), `faktor` ihr eigener darauf.
 */
export function useZweiFingerZoom(opts: {
  aktiv: boolean
  flaeche: React.RefObject<HTMLElement | null>
  inhalt: React.RefObject<HTMLElement | null>
  basis: number
  faktor: number
  setFaktor: (f: number) => void
  min?: number
  max?: number
}): void {
  const aktuell = useRef(opts)
  aktuell.current = opts

  useEffect(() => {
    const el = opts.flaeche.current
    if (!opts.aktiv || !el) return
    let start: { abstand: number; faktor: number } | null = null
    let letzter = opts.faktor

    const mitte = (t: TouchList): Punkt => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })
    const punkte = (t: TouchList): [Punkt, Punkt] => [
      { x: t[0].clientX, y: t[0].clientY },
      { x: t[1].clientX, y: t[1].clientY }
    ]

    /** Zoom setzen und den Punkt unter den Fingern festhalten */
    const anwenden = (faktor: number, m: Punkt): void => {
      const { inhalt, basis } = aktuell.current
      const innen = inhalt.current
      if (!innen) return
      const vorher = innen.getBoundingClientRect()
      const zAlt = basis * letzter
      const zNeu = basis * faktor
      const ix = (m.x - vorher.left) / zAlt
      const iy = (m.y - vorher.top) / zAlt
      innen.style.zoom = String(zNeu)
      letzter = faktor
      const nachher = innen.getBoundingClientRect()
      el.scrollLeft += nachher.left - (m.x - ix * zNeu)
      const senk = senkrechtRollend(el)
      if (senk) senk.scrollTop += nachher.top - (m.y - iy * zNeu)
    }

    const beginn = (e: TouchEvent): void => {
      if (e.touches.length !== 2) return
      const [a, b] = punkte(e.touches)
      letzter = aktuell.current.faktor
      start = { abstand: abstand(a, b), faktor: letzter }
      /*
       * Der erste Finger lag schon – für das Blatt sah das wie „langes Drücken zum Verschieben"
       * eines Bausteins aus (BausteinRahmen). Ein pointercancel beendet solche angefangenen
       * Gesten; der Zoom gehört jetzt beiden Fingern.
       */
      e.touches[0].target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch', isPrimary: true }))
    }
    const bewegung = (e: TouchEvent): void => {
      if (!start || e.touches.length !== 2) return
      // Zwei Finger gehören dem Zoom – nicht dem Rollen und nicht dem Zoom der ganzen Seite
      e.preventDefault()
      const [a, b] = punkte(e.touches)
      const { min, max } = aktuell.current
      const f = pinchZoom(start.faktor, start.abstand, abstand(a, b), min, max)
      if (Math.abs(f - letzter) >= 0.01) anwenden(f, mitte(e.touches))
    }
    const ende = (e: TouchEvent): void => {
      if (!start || e.touches.length >= 2) return
      start = null
      aktuell.current.setFaktor(letzter)
    }
    /*
     * Bewegen und Loslassen am DOKUMENT: Touch-Ereignisse gehen immer an das Element, auf dem der
     * Finger aufsetzte. Baut das Blatt dieses Element währenddessen neu, erreichten sie die
     * Fläche nicht mehr – der Zoom blieb dann halb stehen.
     */
    el.addEventListener('touchstart', beginn, { passive: true })
    document.addEventListener('touchmove', bewegung, { passive: false })
    document.addEventListener('touchend', ende, { passive: true })
    document.addEventListener('touchcancel', ende, { passive: true })
    return () => {
      el.removeEventListener('touchstart', beginn)
      document.removeEventListener('touchmove', bewegung)
      document.removeEventListener('touchend', ende)
      document.removeEventListener('touchcancel', ende)
    }
  }, [opts.aktiv, opts.flaeche, opts.inhalt])
}

/** „–", Prozent (zurück auf 100 %) und „+" – der Weg mit einem Finger (WCAG 2.5.1) */
export function ZoomKnoepfe({
  faktor,
  setFaktor,
  anzeige,
  min = 0.5,
  max = 3
}: {
  faktor: number
  setFaktor: (f: number) => void
  /** Angezeigter Wert in Prozent (z. B. tatsächliche Seitengröße); Standard: der Faktor */
  anzeige?: number
  min?: number
  max?: number
}): React.JSX.Element {
  return (
    <div className="zoom-knoepfe" data-zoom-knoepfe role="group" aria-label="Zoom">
      <ActionIcon variant="subtle" radius="xl" aria-label="Verkleinern" disabled={faktor <= min} onClick={() => setFaktor(zoomSchritt(faktor, -1, min, max))}>
        <IconZoomOut size={20} />
      </ActionIcon>
      <Button variant="subtle" radius="xl" size="xs" className="zoom-wert" aria-label="Zoom zurücksetzen" onClick={() => setFaktor(1)} data-zoom-wert>
        {Math.round((anzeige ?? faktor) * 100)} %
      </Button>
      <ActionIcon variant="subtle" radius="xl" aria-label="Vergrößern" disabled={faktor >= max} onClick={() => setFaktor(zoomSchritt(faktor, 1, min, max))}>
        <IconZoomIn size={20} />
      </ActionIcon>
    </div>
  )
}

/**
 * Eine Fläche mit Zwei-Finger-Zoom und Zoom-Knöpfen – nur im Touch-Modus; am PC gibt sie den
 * Inhalt unverändert aus. Für Vorschauen ohne eigene Einpassung (Druckvorschau).
 */
export function ZoomFlaeche({ children, className }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  const touch = useTouch()
  const flaeche = useRef<HTMLDivElement>(null)
  const inhalt = useRef<HTMLDivElement>(null)
  const [faktor, setFaktor] = useState(1)
  useZweiFingerZoom({ aktiv: touch, flaeche, inhalt, basis: 1, faktor, setFaktor })
  if (!touch) return <>{children}</>
  return (
    <>
      <div
        ref={flaeche}
        className={`zoom-flaeche ${className ?? ''}`}
        data-gezoomt={faktor > 1 || undefined}
        style={{ overflowX: faktor > 1 ? 'auto' : undefined, touchAction: 'pan-x pan-y' }}
      >
        <div ref={inhalt} style={faktor !== 1 ? { zoom: faktor } : undefined}>
          {children}
        </div>
      </div>
      <ZoomKnoepfe faktor={faktor} setFaktor={setFaktor} />
    </>
  )
}
