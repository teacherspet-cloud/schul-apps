import { useEffect, useMemo, useRef, useState } from 'react'
import { formatInfo } from '../formate'
import { istLinie, istTextElement, neueId, type TbElement, type TbTafel } from '../model'
import { tafelSvg, type SvgOptionen } from '../svg'
import { sichtbareElemente } from '../varianten'

/**
 * Freie Zeichenfläche des Tafelbilds (30.09.2026): Elemente verschieben, Größe ändern, Text direkt
 * ändern (Doppelklick bzw. Doppeltippen), freie Striche zeichnen, Pfeile ziehen, Verbinder setzen.
 * Ausrichtungshilfen an den Kanten und Mitten der anderen Elemente, auf Wunsch ein Raster.
 *
 * Bedient wird mit Zeigerereignissen – dieselben für Maus, Stift und Finger (iPad). Jede Geste ist
 * EIN Rückgängig-Schritt (Gruppe im Verlauf).
 */
export type Werkzeug = 'auswahl' | 'zeichnen' | 'pfeil' | 'verbinder'

interface Props {
  tafel: TbTafel
  ansicht: SvgOptionen
  auswahl: string | null
  setAuswahl: (id: string | null) => void
  aendern: (fn: (t: TbTafel) => void, gruppe?: string) => void
  gruppeEnde: () => void
  werkzeug: Werkzeug
  setWerkzeug: (w: Werkzeug) => void
  markiert: string[]
  /** Nach dem Loslassen: z. B. Schrift an die neue Größe anpassen */
  nachGeste?: (id: string) => void
  /**
   * Tasten (Pfeile verschieben, Entf/Rücktaste löschen) nur, solange nichts darüber liegt – in der
   * Präsentation blättern Pfeile und Rücktaste; vorher verschoben bzw. LÖSCHTEN sie dabei das
   * gewählte Element im Hintergrund (30.09.2026).
   */
  tastatur?: boolean
}

type Griff = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'ende'

interface Zug {
  id: string
  modus: 'schieben' | Griff
  start: { x: number; y: number }
  orig: TbElement
  gruppe: string
  bewegt: boolean
}

const MIN = 0.015
const klemme = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

export default function Zeichenflaeche(p: Props): React.JSX.Element {
  const f = formatInfo(p.tafel.format)
  const W = f.breite
  const H = f.hoehe
  const buehne = useRef<HTMLDivElement>(null)
  const overlay = useRef<SVGSVGElement>(null)
  const zug = useRef<Zug | null>(null)
  const [groesse, setGroesse] = useState({ w: 800, h: 400 })
  const [hilfen, setHilfen] = useState<{ x?: number; y?: number }>({})
  const [striche, setStriche] = useState<{ x: number; y: number }[] | null>(null)
  const [pfeilNeu, setPfeilNeu] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null)
  const [verbinderVon, setVerbinderVon] = useState<string | null>(null)
  const [textId, setTextId] = useState<string | null>(null)
  const [textWert, setTextWert] = useState('')
  const letzterTipp = useRef<{ id: string; t: number } | null>(null)

  // Fläche so groß wie möglich, im Seitenverhältnis des Formats
  useEffect(() => {
    const el = buehne.current
    if (!el) return
    const beobachter = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const s = Math.min((r.width - 24) / W, (r.height - 24) / H)
      setGroesse({ w: Math.max(200, W * s), h: Math.max(100, H * s) })
    })
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [W, H])

  const svg = useMemo(() => tafelSvg(p.tafel, { ...p.ansicht, ohneTextur: true, editor: true, markiert: p.markiert }), [p.tafel, p.ansicht, p.markiert])
  const sichtbar = useMemo(() => sichtbareElemente(p.tafel, p.ansicht), [p.tafel, p.ansicht])
  const nachId = useMemo(() => new Map(p.tafel.elemente.map((e) => [e.id, e])), [p.tafel.elemente])
  const gewaehlt = p.auswahl ? nachId.get(p.auswahl) : undefined

  const punkt = (ev: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = overlay.current!.getBoundingClientRect()
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height }
  }

  // Raster: Quadrate von 1/24 der Höhe
  const rasterX = H / 24 / W
  const rasterY = 1 / 24
  const schwelle = { x: 7 / groesse.w, y: 7 / groesse.h }

  /** Einrasten an Kanten/Mitten der übrigen Elemente, sonst am Raster */
  function einrasten(e: TbElement, x: number, y: number): { x: number; y: number; hx?: number; hy?: number } {
    const andere = sichtbar.filter((o) => o.id !== e.id && !istLinie(o))
    const zieleX = [0.5, ...andere.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])]
    const zieleY = [...andere.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])]
    let hx: number | undefined
    let hy: number | undefined
    let bestX = schwelle.x
    for (const [i, kante] of [x, x + e.w / 2, x + e.w].entries())
      for (const z of zieleX)
        if (Math.abs(kante - z) < bestX) {
          bestX = Math.abs(kante - z)
          x = z - (i * e.w) / 2
          hx = z
        }
    let bestY = schwelle.y
    for (const [i, kante] of [y, y + e.h / 2, y + e.h].entries())
      for (const z of zieleY)
        if (Math.abs(kante - z) < bestY) {
          bestY = Math.abs(kante - z)
          y = z - (i * e.h) / 2
          hy = z
        }
    if (p.tafel.raster) {
      if (hx === undefined) x = Math.round(x / rasterX) * rasterX
      if (hy === undefined) y = Math.round(y / rasterY) * rasterY
    }
    return { x, y, hx, hy }
  }

  // Zeiger festhalten; ein Zeiger, den der Browser schon wieder vergessen hat (Stift/Finger, der beim
  // Antippen abhebt), wirft sonst mitten in der Geste einen Fehler
  const fange = (pointerId: number): void => {
    try {
      overlay.current?.setPointerCapture(pointerId)
    } catch {
      /* ohne Festhalten geht es auch – die Fläche bekommt die Bewegung trotzdem */
    }
  }

  const beginne = (ev: React.PointerEvent, id: string, modus: Zug['modus']): void => {
    ev.stopPropagation()
    const e = nachId.get(id)
    if (!e) return
    if (p.werkzeug === 'verbinder' && modus === 'schieben' && !istLinie(e)) {
      if (!verbinderVon) setVerbinderVon(id)
      else if (verbinderVon !== id) {
        const von = verbinderVon
        p.aendern((t) => {
          const a = t.elemente.find((x) => x.id === von)
          const b = t.elemente.find((x) => x.id === id)
          t.elemente.push({
            id: neueId('v'),
            typ: 'verbinder',
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            text: '',
            farbe: 'grund',
            schritt: Math.max(a?.schritt ?? 1, b?.schritt ?? 1),
            von,
            nach: id,
            pfeilArt: 'pfeil',
            schrift: (a?.schrift ?? f.schrift.text) * 0.85
          })
        })
        setVerbinderVon(null)
        p.setWerkzeug('auswahl')
      }
      return
    }
    if (p.werkzeug !== 'auswahl') return
    // Doppeltippen/Doppelklick auf Text: direkt bearbeiten
    const jetzt = Date.now()
    if (modus === 'schieben' && letzterTipp.current?.id === id && jetzt - letzterTipp.current.t < 380 && (istTextElement(e) || istLinie(e))) {
      letzterTipp.current = null
      setTextId(id)
      setTextWert(e.text)
      return
    }
    letzterTipp.current = { id, t: jetzt }
    p.setAuswahl(id)
    fange(ev.pointerId)
    zug.current = { id, modus, start: punkt(ev), orig: structuredClone(e), gruppe: `tb-zug-${id}-${jetzt}`, bewegt: false }
  }

  const bewege = (ev: React.PointerEvent): void => {
    const pt = punkt(ev)
    if (striche) {
      setStriche([...striche, pt])
      return
    }
    if (pfeilNeu) {
      setPfeilNeu({ ...pfeilNeu, b: pt })
      return
    }
    const z = zug.current
    if (!z) return
    const dx = pt.x - z.start.x
    const dy = pt.y - z.start.y
    if (!z.bewegt && Math.abs(dx) < 2 / groesse.w && Math.abs(dy) < 2 / groesse.h) return
    z.bewegt = true
    const o = z.orig
    let neu: Partial<TbElement> = {}
    let h: { x?: number; y?: number } = {}
    if (z.modus === 'schieben') {
      if (o.typ === 'pfeil') neu = { x: o.x + dx, y: o.y + dy }
      else {
        const r = einrasten(o, klemme(o.x + dx, 0, 1 - o.w), klemme(o.y + dy, 0, 1 - o.h))
        neu = { x: klemme(r.x, 0, 1 - o.w), y: klemme(r.y, 0, 1 - o.h) }
        h = { x: r.hx, y: r.hy }
      }
    } else if (z.modus === 'start') neu = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy }
    else if (z.modus === 'ende') neu = { w: o.w + dx, h: o.h + dy }
    else {
      let { x, y, w, h: hh } = o
      if (z.modus.includes('e')) w = Math.max(MIN, o.w + dx)
      if (z.modus.includes('s')) hh = Math.max(MIN, o.h + dy)
      if (z.modus.includes('w')) {
        w = Math.max(MIN, o.w - dx)
        x = o.x + o.w - w
      }
      if (z.modus.includes('n')) {
        hh = Math.max(MIN, o.h - dy)
        y = o.y + o.h - hh
      }
      // Symbole und Bilder behalten ihr Seitenverhältnis an den Ecken
      if ((o.typ === 'symbol' || o.typ === 'bild') && z.modus.length === 2) {
        const v = (o.w * W) / (o.h * H)
        hh = (w * W) / v / H
        if (z.modus.includes('n')) y = o.y + o.h - hh
      }
      neu = { x: klemme(x, 0, 1), y: klemme(y, 0, 1), w: Math.min(w, 1 - Math.max(0, x)), h: Math.min(hh, 1 - Math.max(0, y)) }
    }
    setHilfen(h)
    p.aendern((t) => {
      const e = t.elemente.find((x) => x.id === z.id)
      if (e) Object.assign(e, neu)
    }, z.gruppe)
  }

  const beende = (ev: React.PointerEvent): void => {
    if (striche) {
      const pts = striche
      setStriche(null)
      if (pts.length > 2) {
        const xs = pts.map((q) => q.x)
        const ys = pts.map((q) => q.y)
        const x0 = Math.min(...xs)
        const y0 = Math.min(...ys)
        const w = Math.max(0.01, Math.max(...xs) - x0)
        const h = Math.max(0.01, Math.max(...ys) - y0)
        const pfad = pts.map((q, i) => `${i ? 'L' : 'M'}${Math.round(((q.x - x0) / w) * 1000)} ${Math.round(((q.y - y0) / h) * 1000)}`).join('')
        const id = neueId('s')
        p.aendern((t) => {
          // Striche kurz hintereinander an derselben Stelle gehören zu EINER Skizze
          const letzte = t.elemente[t.elemente.length - 1]
          if (letzte?.typ === 'skizze' && letzte.id === p.auswahl && !letzte.vorlage) {
            const bx0 = Math.min(letzte.x, x0)
            const by0 = Math.min(letzte.y, y0)
            const bx1 = Math.max(letzte.x + letzte.w, x0 + w)
            const by1 = Math.max(letzte.y + letzte.h, y0 + h)
            const um = (px: number, py: number, ex: TbElement | { x: number; y: number; w: number; h: number }): string =>
              `${Math.round(((ex.x + (px / 1000) * ex.w - bx0) / (bx1 - bx0)) * 1000)} ${Math.round(((ex.y + (py / 1000) * ex.h - by0) / (by1 - by0)) * 1000)}`
            const umrechnen = (d: string, ex: { x: number; y: number; w: number; h: number }): string => d.replace(/([ML])(-?\d+) (-?\d+)/g, (_, c, a, b) => `${c}${um(Number(a), Number(b), ex)}`)
            letzte.pfade = [...(letzte.pfade ?? []).map((d) => umrechnen(d, letzte)), umrechnen(pfad, { x: x0, y: y0, w, h })]
            Object.assign(letzte, { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 })
          } else t.elemente.push({ id, typ: 'skizze', x: x0, y: y0, w, h, text: '', farbe: 'grund', schritt: 1, pfade: [pfad] })
        })
        if (!p.auswahl || nachId.get(p.auswahl)?.typ !== 'skizze') p.setAuswahl(id)
      }
      return
    }
    if (pfeilNeu) {
      const { a, b } = pfeilNeu
      setPfeilNeu(null)
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.02) {
        const id = neueId('p')
        p.aendern((t) => t.elemente.push({ id, typ: 'pfeil', x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, text: '', farbe: 'grund', schritt: 1, pfeilArt: 'pfeil', schrift: f.schrift.text * 0.85 }))
        p.setAuswahl(id)
        p.setWerkzeug('auswahl')
      }
      return
    }
    const z = zug.current
    zug.current = null
    setHilfen({})
    try {
      overlay.current?.releasePointerCapture(ev.pointerId)
    } catch {
      /* schon freigegeben */
    }
    if (z?.bewegt) {
      p.gruppeEnde()
      if (z.modus !== 'schieben') p.nachGeste?.(z.id)
    }
  }

  const leerGedrueckt = (ev: React.PointerEvent): void => {
    const pt = punkt(ev)
    if (p.werkzeug === 'zeichnen') {
      fange(ev.pointerId)
      setStriche([pt])
      return
    }
    if (p.werkzeug === 'pfeil') {
      fange(ev.pointerId)
      setPfeilNeu({ a: pt, b: pt })
      return
    }
    setVerbinderVon(null)
    p.setAuswahl(null)
  }

  // Entf/Rück löscht, Pfeiltasten schieben (mit Umschalt weiter)
  useEffect(() => {
    const taste = (ev: KeyboardEvent): void => {
      const ziel = ev.target as HTMLElement | null
      if (p.tastatur === false || !p.auswahl || textId || (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable))) return
      const id = p.auswahl
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault()
        p.aendern((t) => {
          t.elemente = t.elemente.filter((e) => e.id !== id && e.von !== id && e.nach !== id)
        })
        p.setAuswahl(null)
        return
      }
      const schritt = ev.shiftKey ? 0.02 : 0.004
      const d = { ArrowLeft: [-schritt, 0], ArrowRight: [schritt, 0], ArrowUp: [0, -schritt], ArrowDown: [0, schritt] }[ev.key]
      if (!d) return
      ev.preventDefault()
      p.aendern((t) => {
        const e = t.elemente.find((x) => x.id === id)
        if (!e) return
        e.x = istLinie(e) ? e.x + d[0] : klemme(e.x + d[0], 0, 1 - e.w)
        e.y = istLinie(e) ? e.y + d[1] : klemme(e.y + d[1], 0, 1 - e.h)
      }, `tb-taste-${id}`)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [p.auswahl, textId, p])

  const textFertig = (uebernehmen: boolean): void => {
    const id = textId
    setTextId(null)
    if (!id || !uebernehmen) return
    const wert = textWert
    p.aendern((t) => {
      const e = t.elemente.find((x) => x.id === id)
      if (e) e.text = wert
    })
    p.nachGeste?.(id)
  }

  // Griffe in Bildschirmgröße (auf dem iPad größer)
  const grob = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const gr = ((grob ? 22 : 12) / groesse.w) * W
  const griffe = (e: TbElement): React.JSX.Element[] => {
    if (e.typ === 'pfeil')
      return (['start', 'ende'] as Griff[]).map((g) => {
        const x = (g === 'start' ? e.x : e.x + e.w) * W
        const y = (g === 'start' ? e.y : e.y + e.h) * H
        return <circle key={g} className="tb-griff" data-griff={g} cx={x} cy={y} r={gr / 1.6} strokeWidth={gr / 6} onPointerDown={(ev) => beginne(ev, e.id, g)} />
      })
    if (e.typ === 'verbinder') return []
    const x0 = e.x * W
    const y0 = e.y * H
    const x1 = (e.x + e.w) * W
    const y1 = (e.y + e.h) * H
    const pos: Record<Exclude<Griff, 'start' | 'ende'>, [number, number]> = {
      nw: [x0, y0],
      n: [(x0 + x1) / 2, y0],
      ne: [x1, y0],
      e: [x1, (y0 + y1) / 2],
      se: [x1, y1],
      s: [(x0 + x1) / 2, y1],
      sw: [x0, y1],
      w: [x0, (y0 + y1) / 2]
    }
    return Object.entries(pos).map(([g, [x, y]]) => (
      <rect key={g} className="tb-griff" data-griff={g} x={x - gr / 2} y={y - gr / 2} width={gr} height={gr} strokeWidth={gr / 6} onPointerDown={(ev) => beginne(ev, e.id, g as Griff)} />
    ))
  }

  const trefferLinie = (e: TbElement): React.JSX.Element | null => {
    let a: { x: number; y: number }
    let b: { x: number; y: number }
    if (e.typ === 'pfeil') {
      a = { x: e.x * W, y: e.y * H }
      b = { x: (e.x + e.w) * W, y: (e.y + e.h) * H }
    } else {
      const von = e.von ? nachId.get(e.von) : undefined
      const nach = e.nach ? nachId.get(e.nach) : undefined
      if (!von) return null
      a = { x: (von.x + von.w / 2) * W, y: (von.y + von.h / 2) * H }
      b = nach ? { x: (nach.x + nach.w / 2) * W, y: (nach.y + nach.h / 2) * H } : e.zielPunkt ? { x: e.zielPunkt.x * W, y: e.zielPunkt.y * H } : a
    }
    return (
      <line
        key={e.id}
        className="tb-treffer-linie"
        data-element={e.id}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        strokeWidth={(grob ? 30 : 16) * (W / groesse.w)}
        onPointerDown={(ev) => beginne(ev, e.id, 'schieben')}
      />
    )
  }

  const textEl = textId ? nachId.get(textId) : undefined
  const zeichenModus = p.werkzeug === 'zeichnen' || p.werkzeug === 'pfeil'

  return (
    <div className="tb-buehne" ref={buehne}>
      <div className="tb-flaeche" style={{ width: groesse.w, height: groesse.h }} data-tb-flaeche={p.tafel.format}>
        <div className="tb-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        <svg
          ref={overlay}
          className={`tb-overlay${zeichenModus ? ' tb-zeichnen' : ''}`}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerDown={leerGedrueckt}
          onPointerMove={bewege}
          onPointerUp={beende}
          onPointerCancel={beende}
        >
          {p.tafel.raster && (
            <g>
              {Array.from({ length: Math.floor(1 / rasterX) }, (_, i) => (
                <line key={`x${i}`} className="tb-raster" x1={(i + 1) * rasterX * W} x2={(i + 1) * rasterX * W} y1={0} y2={H} strokeWidth={W / groesse.w} />
              ))}
              {Array.from({ length: 23 }, (_, i) => (
                <line key={`y${i}`} className="tb-raster" y1={(i + 1) * rasterY * H} y2={(i + 1) * rasterY * H} x1={0} x2={W} strokeWidth={W / groesse.w} />
              ))}
            </g>
          )}
          {sichtbar.filter(istLinie).map(trefferLinie)}
          {sichtbar
            .filter((e) => !istLinie(e))
            .map((e) => (
              <rect key={e.id} className="tb-treffer" data-element={e.id} x={e.x * W} y={e.y * H} width={e.w * W} height={e.h * H} onPointerDown={(ev) => beginne(ev, e.id, 'schieben')} />
            ))}
          {verbinderVon && nachId.get(verbinderVon) && (
            <rect
              className="tb-verbinder-start"
              x={nachId.get(verbinderVon)!.x * W - 6}
              y={nachId.get(verbinderVon)!.y * H - 6}
              width={nachId.get(verbinderVon)!.w * W + 12}
              height={nachId.get(verbinderVon)!.h * H + 12}
              strokeWidth={(3 * W) / groesse.w}
            />
          )}
          {gewaehlt && !istLinie(gewaehlt) && (
            <rect className="tb-auswahl" x={gewaehlt.x * W - 3} y={gewaehlt.y * H - 3} width={gewaehlt.w * W + 6} height={gewaehlt.h * H + 6} strokeWidth={(2 * W) / groesse.w} />
          )}
          {gewaehlt && p.werkzeug === 'auswahl' && griffe(gewaehlt)}
          {hilfen.x !== undefined && <line className="tb-hilfslinie" x1={hilfen.x * W} x2={hilfen.x * W} y1={0} y2={H} strokeWidth={(1.5 * W) / groesse.w} />}
          {hilfen.y !== undefined && <line className="tb-hilfslinie" y1={hilfen.y * H} y2={hilfen.y * H} x1={0} x2={W} strokeWidth={(1.5 * W) / groesse.w} />}
          {striche && striche.length > 1 && (
            <polyline points={striche.map((q) => `${q.x * W},${q.y * H}`).join(' ')} fill="none" stroke="#fab005" strokeWidth={(3 * W) / groesse.w} strokeLinecap="round" />
          )}
          {pfeilNeu && <line x1={pfeilNeu.a.x * W} y1={pfeilNeu.a.y * H} x2={pfeilNeu.b.x * W} y2={pfeilNeu.b.y * H} stroke="#fab005" strokeWidth={(3 * W) / groesse.w} />}
        </svg>
        {textEl && (
          <textarea
            className="tb-textfeld"
            data-tb-textfeld
            autoFocus
            value={textWert}
            onChange={(ev) => setTextWert(ev.currentTarget.value)}
            onBlur={() => textFertig(true)}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') textFertig(false)
              if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) textFertig(true)
            }}
            style={{
              left: `${(istLinie(textEl) ? 0.35 : textEl.x) * 100}%`,
              top: `${(istLinie(textEl) ? 0.4 : textEl.y) * 100}%`,
              width: `${Math.max(istLinie(textEl) ? 0.3 : textEl.w, 0.18) * 100}%`,
              height: `${Math.max(istLinie(textEl) ? 0.15 : textEl.h, 0.1) * 100}%`,
              fontSize: Math.max(13, Math.min(22, (textEl.schrift ?? 0.05) * groesse.h * 0.8))
            }}
          />
        )}
      </div>
    </div>
  )
}
