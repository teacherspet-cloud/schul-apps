/**
 * Stift-Ebene einer Seite des Online-Arbeitsblatts: Zeichnen mit Stift/Finger/Maus, Textmarker, Radierer, Rückgängig.
 *
 * Aus BlattAusfuellen.tsx herausgelöst (23.10.2026, Barrierefreiheit – WCAG 2.1 AA 2.1.1): Die Leinwand ist mit der
 * Tastatur bedienbar (shared/zeichenTastatur.ts): Tab auf die Seite, Pfeiltasten bewegen das Fadenkreuz, Leertaste
 * setzt Stift/Textmarker/Radierer auf und ab, Enter setzt Anfang und Ende eines geraden Strichs, Entf nimmt zurück.
 * Der Textmarker liegt als Farbe über dem Seitenbild (keine Textauswahl möglich) – er folgt deshalb dem Fadenkreuz.
 * Zeiger und Touch bleiben unverändert.
 */
import { ActionIcon } from '@mantine/core'
import { IconArrowBackUp } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'
import { zeichenHilfe, type ZPunkt } from '@shared/zeichenTastatur'
import { Fadenkreuz, useZeichenTastatur } from '../../shared/useZeichenTastatur'
import { ansagen } from '../../shared/ansage'
import type { Werkzeug } from './blattWerkzeuge'
import type { Stil } from './objektOptionen'

const NAME: Partial<Record<Werkzeug, string>> = { stift: 'Stift', marker: 'Textmarker', radierer: 'Radierer' }

export function TintenSeite({
  seite,
  lage,
  bild,
  werkzeug,
  farbe,
  stil,
  setTinte
}: {
  seite: number
  lage: { x: number; y: number; w: number; h: number }
  bild?: string
  werkzeug: Werkzeug
  farbe: string
  /** Stärke und Linienart der nächsten Striche (Rechtsklick aufs Werkzeug, 06.10.2026) */
  stil?: Stil
  setTinte: (s: number, url: string) => void
}): React.JSX.Element {
  const leinwand = useRef<HTMLCanvasElement>(null)
  const verlauf = useRef<string[]>([])
  const zeichnet = useRef(false)
  // Textmarker (03.10.2026, Befund der Lehrkraft: „übermalen … statt semitransparent"): Stand vor dem Strich
  const vorStrich = useRef<ImageData | null>(null)
  const strich = useRef<{ x: number; y: number }[]>([])
  const AUFLOESUNG = 2
  // Beim Laden und wenn die Seite wächst (neue Linien – die Leinwand wird dabei geleert): Bild in Originalgröße wieder einzeichnen
  useEffect(() => {
    const c = leinwand.current
    if (!c || !bild) return
    const img = new Image()
    img.onload = () => c.getContext('2d')?.drawImage(img, 0, 0)
    img.src = bild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lage.w, lage.h])
  const punkt = (e: React.PointerEvent): { x: number; y: number } => {
    const r = leinwand.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * leinwand.current!.width, y: ((e.clientY - r.top) / r.height) * leinwand.current!.height }
  }
  const aktiv = werkzeug === 'stift' || werkzeug === 'marker' || werkzeug === 'radierer'
  const fertig = (): void => {
    if (!zeichnet.current) return
    zeichnet.current = false
    setTinte(seite, leinwand.current!.toDataURL('image/png'))
  }
  /** Strich beginnen – Leinwandpixel (Zeiger und Tastatur, 23.10.2026) */
  const beginne = (x: number, y: number, druck?: number): void => {
    const ctx = leinwand.current!.getContext('2d')!
    verlauf.current = [...verlauf.current.slice(-9), leinwand.current!.toDataURL('image/png')]
    zeichnet.current = true
    vorStrich.current = werkzeug === 'marker' ? ctx.getImageData(0, 0, leinwand.current!.width, leinwand.current!.height) : null
    strich.current = [{ x, y }]
    ctx.globalCompositeOperation = werkzeug === 'radierer' ? 'destination-out' : 'source-over'
    // Textmarker: breit und durchscheinend (03.10.2026)
    ctx.strokeStyle = werkzeug === 'marker' ? `${farbe}59` : farbe
    const faktor = stil?.staerke === 1 ? 0.6 : stil?.staerke === 3 ? 1.7 : 1
    ctx.lineWidth = (werkzeug === 'radierer' ? 22 : werkzeug === 'marker' ? 16 * faktor : 2.2 * faktor * (druck ? 0.6 + druck : 1)) * AUFLOESUNG
    ctx.lineCap = werkzeug === 'marker' ? 'butt' : 'round'
    // Gestrichelt/gepunktet nur beim Stift
    const w = 2.2 * faktor * AUFLOESUNG
    ctx.setLineDash(
      werkzeug === 'stift' && stil?.linienArt === 'strich' ? [w * 3.2, w * 2.4] : werkzeug === 'stift' && stil?.linienArt === 'punkt' ? [0.1, w * 2.3] : []
    )
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }
  /** Strich fortsetzen – Leinwandpixel */
  const weiter = (x: number, y: number): void => {
    if (!zeichnet.current) return
    const ctx = leinwand.current!.getContext('2d')!
    if (vorStrich.current) {
      // Ein Strich = eine gleichmäßig durchscheinende Spur: Stand davor herstellen, Strich einmal ziehen
      strich.current.push({ x, y })
      ctx.putImageData(vorStrich.current, 0, 0)
      ctx.beginPath()
      strich.current.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
      ctx.stroke()
      return
    }
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  const rueckgaengig = (): boolean => {
    const vorher = verlauf.current.pop()
    const c = leinwand.current!
    const ctx = c.getContext('2d')!
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, c.width, c.height)
    if (!vorher) {
      setTinte(seite, c.toDataURL('image/png'))
      return false
    }
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      setTinte(seite, c.toDataURL('image/png'))
    }
    img.src = vorher
    return true
  }

  // Tastatur (23.10.2026): Fadenkreuz in Seitenpixeln, die Leinwand rechnet × AUFLOESUNG
  const lp = (q: ZPunkt): [number, number] => [q.x * AUFLOESUNG, q.y * AUFLOESUNG]
  const ding = NAME[werkzeug] ?? 'Stift'
  const tasten = useZeichenTastatur({
    breite: lage.w,
    hoehe: lage.h,
    modus: 'frei',
    aktiv,
    bezeichnung: `Seite ${seite + 1}: ${ding}`,
    hilfe: zeichenHilfe('frei', 'Werkzeuge: S Stift, T Textmarker, E Radierer, B Textkästchen, L Linie, W Punkt, R Rechteck, K Kreis, P Pfeil.'),
    ding,
    ergebnis: werkzeug === 'marker' ? 'markiert' : werkzeug === 'radierer' ? 'radiert' : 'Linie gezeichnet',
    merkSchluessel: `blatt-${seite}`,
    ausfuehren: (a) => {
      if (a.art === 'aufsetzen') beginne(...lp(a.punkt))
      else if (a.art === 'bewegen' && a.zeichnen) weiter(...lp(a.nach))
      else if (a.art === 'absetzen' || a.art === 'abbrechen') fertig()
      else if (a.art === 'ende') {
        beginne(...lp(a.von))
        weiter(...lp(a.nach))
        fertig()
      } else if (a.art === 'loeschen') {
        fertig()
        return rueckgaengig() ? 'rückgängig' : 'Nichts mehr rückgängig zu machen'
      }
    }
  })
  return (
    <>
      <canvas
        ref={leinwand}
        width={Math.round(lage.w * AUFLOESUNG)}
        height={Math.round(lage.h * AUFLOESUNG)}
        style={{
          position: 'absolute',
          left: lage.x,
          top: lage.y,
          width: lage.w,
          height: lage.h,
          pointerEvents: aktiv ? 'auto' : 'none',
          touchAction: aktiv ? 'none' : 'auto',
          zIndex: 10,
          // Wie ein echter Textmarker: Farbe legt sich über den Text, der Text bleibt lesbar
          mixBlendMode: 'multiply'
        }}
        data-tinte={seite}
        {...tasten.flaeche}
        data-zeichen-seite={seite}
        onPointerDown={(e) => {
          if (!aktiv) return
          leinwand.current!.setPointerCapture(e.pointerId)
          const { x, y } = punkt(e)
          beginne(x, y, e.pressure)
        }}
        onPointerMove={(e) => {
          if (!zeichnet.current) return
          const { x, y } = punkt(e)
          weiter(x, y)
        }}
        onPointerUp={fertig}
        onPointerCancel={fertig}
      />
      {tasten.hilfe}
      {tasten.sichtbar && <Fadenkreuz z={tasten.zustand} links={lage.x} oben={lage.y} />}
      {aktiv && (
        <ActionIcon
          variant="default"
          style={{ position: 'absolute', left: lage.x + lage.w - 40, top: lage.y + 8, zIndex: 11 }}
          aria-label="Rückgängig"
          onClick={() => {
            if (!rueckgaengig()) return
            ansagen('rückgängig')
          }}
        >
          <IconArrowBackUp size={16} />
        </ActionIcon>
      )}
    </>
  )
}
