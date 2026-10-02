/**
 * Schreibfläche für Handschrift im Onlinetest (02.10.2026).
 *
 * Eine Zeichenfläche statt eines Textfelds: Apple Scribble und andere Systemerkennungen springen
 * nur in Textfeldern an – und deren Autokorrektur lässt sich nicht abschalten (Recherche
 * 02.10.2026). Hier bleibt die Tinte, wie sie geschrieben wurde.
 *
 * - Stift oder Finger; sobald ein Stift benutzt wurde, zählen Finger nicht mehr (Handballen).
 * - Durchkritzeln löscht, was darunter liegt; Radierer (Werkzeug oder Radierende des Stifts).
 * - Koordinaten logisch (Breite 1000, tinte.ts) – dieselbe Tinte in Feld und Vergrößerung.
 * - `korrektur`: Die Fläche liegt über Wortkärtchen; Striche sind dann nur Korrekturzeichen
 *   (`onGeste`) und verschwinden nach dem Zeichnen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { BREITE, geste, radieren, wegkritzeln, type Geste, type Strich } from './tinte'

export type Werkzeug = 'stift' | 'radierer'

export function Schreibflaeche({
  striche,
  onChange,
  hoehe,
  werkzeug = 'stift',
  korrektur = false,
  onGeste,
  onRuhe,
  linien = true,
  beschriftung
}: {
  striche: Strich[]
  onChange: (s: Strich[]) => void
  /** Höhe in CSS-Pixeln (die Breite füllt den Platz) */
  hoehe: number
  werkzeug?: Werkzeug
  korrektur?: boolean
  onGeste?: (g: Exclude<Geste, null>, strich: Strich, breite: number) => void
  /** Nach dem Absetzen ~1 s Ruhe (Erkennung starten) */
  onRuhe?: () => void
  linien?: boolean
  beschriftung?: string
}): React.JSX.Element {
  const leinwand = useRef<HTMLCanvasElement>(null)
  const huelle = useRef<HTMLDivElement>(null)
  const [breite, setBreite] = useState(600)
  const aktuell = useRef<Strich | null>(null)
  const radiert = useRef(false)
  const stiftGesehen = useRef(false)
  const ruhe = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skala = breite / BREITE

  useEffect(() => {
    const el = huelle.current
    if (!el) return
    const ro = new ResizeObserver(() => setBreite(Math.max(120, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => () => void (ruhe.current && clearTimeout(ruhe.current)), [])

  const zeichne = useCallback(() => {
    const c = leinwand.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(breite * dpr)
    c.height = Math.round(hoehe * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, breite, hoehe)
    if (linien && !korrektur) {
      // Schreiblinie wie im Heft
      g.strokeStyle = 'rgba(120,130,140,0.35)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(8, hoehe * 0.72)
      g.lineTo(breite - 8, hoehe * 0.72)
      g.stroke()
    }
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const alle = aktuell.current ? [...striche, aktuell.current] : striche
    for (const s of alle) {
      g.strokeStyle = korrektur ? 'rgba(224,49,49,0.85)' : '#1d4ed8'
      g.lineWidth = 2.6
      g.beginPath()
      s.forEach(([x, y], i) => (i ? g.lineTo(x * skala, y * skala) : g.moveTo(x * skala, y * skala)))
      if (s.length === 1) g.lineTo(s[0][0] * skala + 0.1, s[0][1] * skala)
      g.stroke()
    }
  }, [striche, breite, hoehe, skala, linien, korrektur])
  useEffect(zeichne, [zeichne])

  const punkt = (e: React.PointerEvent): [number, number] => {
    const r = leinwand.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / skala, (e.clientY - r.top) / skala]
  }
  const nimmt = (e: React.PointerEvent): boolean => {
    if (e.pointerType === 'pen') stiftGesehen.current = true
    // Handballen: Ist ein Stift im Spiel, schreiben Finger nicht
    return !(stiftGesehen.current && e.pointerType === 'touch')
  }

  return (
    <div ref={huelle} style={{ position: 'relative', width: '100%', height: hoehe }}>
      {beschriftung && !striche.length && (
        <div style={{ position: 'absolute', left: 10, top: 6, fontSize: 12, color: 'var(--mantine-color-dimmed)', pointerEvents: 'none' }}>{beschriftung}</div>
      )}
      <canvas
        ref={leinwand}
        data-schreibflaeche={korrektur ? 'korrektur' : 'schrift'}
        data-striche={striche.length}
        style={{ width: breite, height: hoehe, touchAction: 'none', display: 'block', cursor: werkzeug === 'radierer' ? 'cell' : 'crosshair' }}
        onPointerDown={(e) => {
          if (!nimmt(e)) return
          e.currentTarget.setPointerCapture(e.pointerId)
          if (ruhe.current) clearTimeout(ruhe.current)
          // Radierende des Stifts (buttons & 32) oder Werkzeug Radierer
          radiert.current = werkzeug === 'radierer' || (e.pointerType === 'pen' && (e.buttons & 32) !== 0)
          aktuell.current = [punkt(e)]
          zeichne()
        }}
        onPointerMove={(e) => {
          if (!aktuell.current || !nimmt(e)) return
          const ereignisse = 'getCoalescedEvents' in e.nativeEvent ? (e.nativeEvent as PointerEvent).getCoalescedEvents() : []
          if (ereignisse.length) {
            const r = leinwand.current!.getBoundingClientRect()
            for (const c of ereignisse) aktuell.current.push([(c.clientX - r.left) / skala, (c.clientY - r.top) / skala])
          } else aktuell.current.push(punkt(e))
          if (radiert.current) {
            const neu = radieren(striche, aktuell.current.slice(-4), 14)
            if (neu.length !== striche.length) onChange(neu)
          } else zeichne()
        }}
        onPointerUp={() => {
          const s = aktuell.current
          aktuell.current = null
          if (!s) return
          if (radiert.current) {
            radiert.current = false
            zeichne()
            return
          }
          const g = geste(s)
          if (korrektur) {
            // Über den Kärtchen sind Striche nur Korrekturzeichen
            if (g) onGeste?.(g, s, breite)
            zeichne()
            return
          }
          if (g === 'kritzeln' && striche.length) onChange(wegkritzeln(striche, s))
          else onChange([...striche, s])
          if (onRuhe) ruhe.current = setTimeout(onRuhe, 1000)
        }}
        onPointerCancel={() => {
          aktuell.current = null
          zeichne()
        }}
      />
    </div>
  )
}
