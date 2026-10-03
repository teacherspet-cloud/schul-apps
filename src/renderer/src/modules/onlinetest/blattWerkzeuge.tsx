/**
 * Werkzeuge auf dem freigegebenen Arbeitsblatt (03.10.2026, abgestimmt mit der Lehrkraft):
 * eine mitwandernde Leiste mit Tastatur, Stift (Farben), Textmarker (Farben), Radierer,
 * Textkästchen, Verbindungslinie (z. B. Kästchen → Datum auf einer Zeitleiste) und Punkt mit Wert
 * (Diagramme). Kästchen, Linien und Punkte sind Objekte (shared/blattObjekte.ts) – sie bleiben
 * verschieb- und änderbar und kommen auf den Seitenbildern auch bei der KI an.
 */
import { ActionIcon, ColorSwatch, Group, Paper, Text, Tooltip } from '@mantine/core'
import {
  IconArrowBackUp,
  IconArrowsDiagonal2,
  IconArrowsMove,
  IconCircleDot,
  IconEraser,
  IconHighlight,
  IconKeyboard,
  IconLine,
  IconPencil,
  IconTextPlus,
  IconX
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { BlattObjekt } from '@shared/blattObjekte'

export type Werkzeug = 'tastatur' | 'stift' | 'marker' | 'radierer' | 'text' | 'linie' | 'punkt'

export const STIFT_FARBEN = ['#1d4ed8', '#111827', '#dc2626', '#16a34a', '#9333ea']
export const MARKER_FARBEN = ['#facc15', '#4ade80', '#f472b6', '#60a5fa', '#fb923c']

const WERKZEUGE: { w: Werkzeug; name: string; icon: React.ReactNode }[] = [
  { w: 'tastatur', name: 'Tippen', icon: <IconKeyboard size={20} /> },
  { w: 'stift', name: 'Stift', icon: <IconPencil size={20} /> },
  { w: 'marker', name: 'Textmarker', icon: <IconHighlight size={20} /> },
  { w: 'radierer', name: 'Radierer (Stift, Textmarker, Kästchen, Linien)', icon: <IconEraser size={20} /> },
  { w: 'text', name: 'Textkästchen setzen', icon: <IconTextPlus size={20} /> },
  { w: 'linie', name: 'Verbindungslinie ziehen', icon: <IconLine size={20} /> },
  { w: 'punkt', name: 'Punkt mit Wert (Diagramm)', icon: <IconCircleDot size={20} /> }
]

/** Mitwandernde Leiste: bleibt beim Scrollen oben sichtbar */
export function Werkzeugleiste(p: {
  werkzeug: Werkzeug
  setWerkzeug: (w: Werkzeug) => void
  stiftFarbe: string
  setStiftFarbe: (f: string) => void
  markerFarbe: string
  setMarkerFarbe: (f: string) => void
  rueckgaengig?: () => void
}): React.JSX.Element {
  const hinweis: Record<Werkzeug, string> = {
    tastatur: 'In die Felder tippen',
    stift: 'Aufs Blatt schreiben oder zeichnen',
    marker: 'Text auf dem Blatt markieren',
    radierer: 'Über Striche wischen; Kästchen und Linien antippen',
    text: 'Auf die Stelle tippen, an die das Kästchen soll',
    linie: 'Von einem Punkt zum anderen ziehen',
    punkt: 'Auf die Stelle im Diagramm tippen, dann den Wert eintragen'
  }
  return (
    <Paper withBorder shadow="sm" p={6} radius="md" style={{ position: 'sticky', top: 8, zIndex: 30 }} data-werkzeuge>
      <Group gap={4} wrap="wrap">
        {WERKZEUGE.map((x) => {
          const aktiv = p.werkzeug === x.w
          const farbe = x.w === 'stift' ? p.stiftFarbe : x.w === 'marker' ? p.markerFarbe : undefined
          const knopf = (
            <ActionIcon
              size="lg"
              variant={aktiv ? 'filled' : 'subtle'}
              color={aktiv ? 'blue' : 'gray'}
              onClick={() => p.setWerkzeug(x.w)}
              aria-label={x.name}
              data-werkzeug={x.w}
              style={farbe ? { boxShadow: `inset 0 -4px 0 ${farbe}` } : undefined}
            >
              {x.icon}
            </ActionIcon>
          )
          return (
            <Tooltip key={x.w} label={x.name}>
              {knopf}
            </Tooltip>
          )
        })}
        {(p.werkzeug === 'stift' || p.werkzeug === 'marker') && (
          <Group gap={5} ml={4} data-farben>
            {(p.werkzeug === 'stift' ? STIFT_FARBEN : MARKER_FARBEN).map((f) => {
              const gewaehlt = (p.werkzeug === 'stift' ? p.stiftFarbe : p.markerFarbe) === f
              return (
                <ColorSwatch
                  key={f}
                  component="button"
                  type="button"
                  color={f}
                  size={24}
                  onClick={() => (p.werkzeug === 'stift' ? p.setStiftFarbe(f) : p.setMarkerFarbe(f))}
                  aria-label={`Farbe ${f}`}
                  style={{ cursor: 'pointer', outline: gewaehlt ? '2px solid var(--mantine-color-text)' : undefined, outlineOffset: 2 }}
                  data-farbe={f}
                />
              )
            })}
          </Group>
        )}
        {p.rueckgaengig && (
          <Tooltip label="Rückgängig">
            <ActionIcon size="lg" variant="subtle" color="gray" onClick={p.rueckgaengig} aria-label="Rückgängig" data-rueckgaengig>
              <IconArrowBackUp size={20} />
            </ActionIcon>
          </Tooltip>
        )}
        <Text size="xs" c="dimmed" ml={4}>
          {hinweis[p.werkzeug]}
        </Text>
      </Group>
    </Paper>
  )
}

const neueId = (): string => Math.random().toString(36).slice(2, 10)
const abstand = (px: number, py: number, o: { x: number; y: number; x2?: number; y2?: number }): number => {
  const x2 = o.x2 ?? o.x
  const y2 = o.y2 ?? o.y
  const dx = x2 - o.x
  const dy = y2 - o.y
  const l = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - o.x) * dx + (py - o.y) * dy) / l))
  return Math.hypot(px - (o.x + t * dx), py - (o.y + t * dy))
}

/**
 * Andockstellen des Blatts (03.10.2026, Wunsch der Lehrkraft: Verbindungslinien sollen an Achse/Leiste
 * und Kästchen/Text einrasten, und es soll leicht festzulegen sein, WO): Punkte (Markierungen einer
 * Achse, Beschriftungen) rasten vorrangig ein, sonst die nächste Stelle auf einer Strecke (Achse).
 * Lage in Seitenpixeln.
 */
export type Andock = { art: 'punkt'; x: number; y: number } | { art: 'strecke'; x1: number; y1: number; x2: number; y2: number }

const PUNKT_RADIUS = 14
const STRECKE_RADIUS = 10
/** Kleinste Höhe eines Kästchens (eine Zeile) */
const KASTEN_MIN_H = 28

/** Lage eines Kästchens: Höhe aus dem Objekt oder gemessen */
interface Kasten {
  id: string
  x: number
  y: number
  w: number
  h: number
}

function einrasten(
  q: { x: number; y: number },
  andocken: Andock[],
  kaesten: Kasten[]
): { x: number; y: number; kasten?: string; art: 'punkt' | 'strecke' } | null {
  // Kästchen: Mitten und Ecken als Punkte, Kanten als Strecken
  const ausKasten = kaesten.flatMap((k) => {
    const r = k.x + k.w
    const u = k.y + k.h
    return [
      ...[
        [k.x + k.w / 2, k.y],
        [k.x + k.w / 2, u],
        [k.x, k.y + k.h / 2],
        [r, k.y + k.h / 2],
        [k.x, k.y],
        [r, k.y],
        [k.x, u],
        [r, u]
      ].map(([x, y]) => ({ art: 'punkt' as const, x, y, kasten: k.id })),
      ...[
        [k.x, k.y, r, k.y],
        [k.x, u, r, u],
        [k.x, k.y, k.x, u],
        [r, k.y, r, u]
      ].map(([x1, y1, x2, y2]) => ({ art: 'strecke' as const, x1, y1, x2, y2, kasten: k.id }))
    ]
  })
  const alle: (Andock & { kasten?: string })[] = [...andocken, ...ausKasten]
  let best: { x: number; y: number; kasten?: string; art: 'punkt' | 'strecke'; d: number } | null = null
  for (const a of alle)
    if (a.art === 'punkt') {
      const d = Math.hypot(q.x - a.x, q.y - a.y)
      if (d < PUNKT_RADIUS && (!best || best.art !== 'punkt' || d < best.d)) best = { x: a.x, y: a.y, kasten: a.kasten, art: 'punkt', d }
    }
  if (best) return best
  for (const a of alle)
    if (a.art === 'strecke') {
      const d = abstand(q.x, q.y, { x: a.x1, y: a.y1, x2: a.x2, y2: a.y2 })
      if (d >= STRECKE_RADIUS || (best && d >= best.d)) continue
      const dx = a.x2 - a.x1
      const dy = a.y2 - a.y1
      const l = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((q.x - a.x1) * dx + (q.y - a.y1) * dy) / l))
      best = { x: a.x1 + t * dx, y: a.y1 + t * dy, kasten: a.kasten, art: 'strecke', d }
    }
  return best
}

/**
 * Objekte einer Seite: Kästchen (bearbeitbar, verschiebbar, in Breite und Höhe ziehbar), Linien
 * (rasten an Kästchen, Achsen, Markierungen und Beschriftungen ein; an Kästchen gehängte Enden wandern
 * beim Verschieben mit), Punkte mit Wert. Radierer: Linie, Punkt oder Kästchen antippen; Striche
 * des Stifts radiert die Stift-Ebene darunter. Lage in Seitenpixeln; Kästchen bleiben auf der Seite.
 */
export function ObjektEbene(p: {
  seite: number
  lage: { x: number; y: number; w: number; h: number }
  objekte: BlattObjekt[]
  aendern: (neu: BlattObjekt[]) => void
  werkzeug: Werkzeug
  farbe: string
  gesperrt: boolean
  andocken?: Andock[]
}): React.JSX.Element {
  const flaeche = useRef<HTMLDivElement>(null)
  const [zieht, setZieht] = useState<{ x: number; y: number; x2: number; y2: number; v1?: string; v2?: string } | null>(null)
  const [ziel, setZiel] = useState<{ x: number; y: number } | null>(null)
  const [fokus, setFokus] = useState<string | null>(null)
  // Verschieben/Größe ändern eines Kästchens: Ausgangslage und Zeiger beim Anfassen
  const griff = useRef<{ id: string; art: 'schieben' | 'groesse'; px: number; py: number; o: BlattObjekt; h: number } | null>(null)
  /*
   * Neues Kästchen/neuer Punkt: Eingabe fokussieren – mit kurzer Verzögerung, weil der Browser nach
   * dem Antippen den Fokus sonst auf die Fläche zurücksetzt (gemessen: Wert ging ins Leere).
   */
  useEffect(() => {
    if (!fokus) return
    const t = setTimeout(() => flaeche.current?.querySelector<HTMLElement>(`[data-objekt-id="${fokus}"]`)?.focus(), 40)
    return () => clearTimeout(t)
  }, [fokus])
  const eigene = p.objekte.filter((o) => o.s === p.seite)
  const fremde = p.objekte.filter((o) => o.s !== p.seite)
  const setzeEigene = (neu: BlattObjekt[]): void => p.aendern([...fremde, ...neu])
  const punkt = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = flaeche.current!.getBoundingClientRect()
    // Die Ebene ist mit dem Blatt skaliert: Bildschirm- in Seitenpixel umrechnen
    return { x: ((e.clientX - r.left) / r.width) * p.lage.w, y: ((e.clientY - r.top) / r.height) * p.lage.h }
  }
  const massstab = (): number => {
    const r = flaeche.current?.getBoundingClientRect()
    return r && r.width ? p.lage.w / r.width : 1
  }
  /** Höhe eines Kästchens: gespeichert, sonst gemessen */
  const hoeheVon = (o: BlattObjekt): number => {
    if (o.h) return o.h
    const el = flaeche.current?.querySelector<HTMLElement>(`[data-kasten="${o.id}"]`)
    return el ? el.getBoundingClientRect().height * massstab() : KASTEN_MIN_H
  }
  const kaesten = (): Kasten[] => eigene.filter((o) => o.t === 'text').map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w ?? 170, h: hoeheVon(o) }))
  /** Auf der Seite halten */
  const klemmen = (o: BlattObjekt, h: number): BlattObjekt => {
    const w = Math.min(o.w ?? 170, p.lage.w - 4)
    return { ...o, w, x: Math.max(2, Math.min(p.lage.w - w - 2, o.x)), y: Math.max(2, Math.min(p.lage.h - h - 2, o.y)) }
  }
  const linieAktiv = !p.gesperrt && (p.werkzeug === 'linie' || p.werkzeug === 'text' || p.werkzeug === 'punkt')
  const radiert = !p.gesperrt && p.werkzeug === 'radierer'

  // Kästchen ziehen (Verschieben oder Größe) – über das ganze Fenster, damit schnelle Bewegungen nicht abreißen
  const bewegen = (e: PointerEvent): void => {
    const g = griff.current
    if (!g) return
    const k = massstab()
    const dx = (e.clientX - g.px) * k
    const dy = (e.clientY - g.py) * k
    const neu =
      g.art === 'schieben'
        ? klemmen({ ...g.o, x: g.o.x + dx, y: g.o.y + dy }, g.h)
        : { ...g.o, w: Math.max(60, Math.min(p.lage.w - g.o.x - 2, (g.o.w ?? 170) + dx)), h: Math.max(KASTEN_MIN_H, Math.min(p.lage.h - g.o.y - 2, g.h + dy)) }
    const ddx = neu.x - g.o.x
    const ddy = neu.y - g.o.y
    setzeEigene(
      eigene.map((x) => {
        if (x.id === g.id) return neu
        // Angehängte Linienenden wandern mit
        if (x.t === 'linie' && g.art === 'schieben' && (x.v1 === g.id || x.v2 === g.id)) {
          return {
            ...x,
            ...(x.v1 === g.id ? { x: (linienStart.current.get(x.id)?.x ?? x.x) + ddx, y: (linienStart.current.get(x.id)?.y ?? x.y) + ddy } : {}),
            ...(x.v2 === g.id ? { x2: (linienStart.current.get(x.id)?.x2 ?? x.x2!) + ddx, y2: (linienStart.current.get(x.id)?.y2 ?? x.y2!) + ddy } : {})
          }
        }
        return x
      })
    )
  }
  const linienStart = useRef(new Map<string, { x: number; y: number; x2: number; y2: number }>())
  const loslassen = (): void => {
    griff.current = null
    window.removeEventListener('pointermove', bewegen)
    window.removeEventListener('pointerup', loslassen)
  }
  const anfassen = (e: React.PointerEvent, o: BlattObjekt, art: 'schieben' | 'groesse'): void => {
    if (p.gesperrt) return
    e.preventDefault()
    e.stopPropagation()
    griff.current = { id: o.id, art, px: e.clientX, py: e.clientY, o, h: hoeheVon(o) }
    linienStart.current = new Map(eigene.filter((x) => x.t === 'linie').map((x) => [x.id, { x: x.x, y: x.y, x2: x.x2 ?? x.x, y2: x.y2 ?? x.y }]))
    window.addEventListener('pointermove', bewegen)
    window.addEventListener('pointerup', loslassen)
  }
  useEffect(() => loslassen, []) // eslint-disable-line react-hooks/exhaustive-deps

  const andocken = p.andocken ?? []
  return (
    <div
      ref={flaeche}
      style={{
        position: 'absolute',
        left: p.lage.x,
        top: p.lage.y,
        width: p.lage.w,
        height: p.lage.h,
        zIndex: 12,
        // Radierer: die Fläche lässt durch (Stift-Ebene darunter radiert); Linien, Punkte, Kästchen fangen selbst
        pointerEvents: linieAktiv ? 'auto' : 'none',
        touchAction: linieAktiv ? 'none' : 'auto'
      }}
      data-objekte={p.seite}
      onPointerDown={(e) => {
        if (!linieAktiv || (e.target as HTMLElement).closest('[data-objekt-text]')) return
        const q = punkt(e)
        if (p.werkzeug === 'text') {
          const id = neueId()
          setzeEigene([...eigene, klemmen({ id, s: p.seite, t: 'text', x: q.x, y: q.y - 12, w: 170, text: '', farbe: p.farbe }, KASTEN_MIN_H)])
          setFokus(id)
          return
        }
        if (p.werkzeug === 'punkt') {
          const id = neueId()
          const r = einrasten(q, andocken, [])
          setzeEigene([...eigene, { id, s: p.seite, t: 'punkt', x: r?.x ?? q.x, y: r?.y ?? q.y, text: '', farbe: p.farbe }])
          setFokus(id)
          return
        }
        if (p.werkzeug === 'linie') {
          flaeche.current!.setPointerCapture(e.pointerId)
          const r = einrasten(q, andocken, kaesten())
          const a = r ?? q
          setZieht({ x: a.x, y: a.y, x2: a.x, y2: a.y, ...(r?.kasten ? { v1: r.kasten } : {}) })
          setZiel(r ? { x: r.x, y: r.y } : null)
        }
      }}
      onPointerMove={(e) => {
        if (p.werkzeug !== 'linie' || !linieAktiv) return
        const q = punkt(e)
        const r = einrasten(q, andocken, kaesten())
        setZiel(r ? { x: r.x, y: r.y } : null)
        if (!zieht) return
        const { v2: _alt, ...rest } = zieht
        setZieht({ ...rest, x2: r?.x ?? q.x, y2: r?.y ?? q.y, ...(r?.kasten ? { v2: r.kasten } : {}) })
      }}
      onPointerLeave={() => !zieht && setZiel(null)}
      onPointerUp={() => {
        if (!zieht) return
        if (Math.hypot(zieht.x2 - zieht.x, zieht.y2 - zieht.y) > 8) setzeEigene([...eigene, { id: neueId(), s: p.seite, t: 'linie', ...zieht, farbe: p.farbe }])
        setZieht(null)
        setZiel(null)
      }}
    >
      <svg width={p.lage.w} height={p.lage.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {/* Linie-Werkzeug: Andockpunkte des Blatts zart zeigen, den gerade gewählten deutlich */}
        {p.werkzeug === 'linie' &&
          !p.gesperrt &&
          andocken.map((a, i) =>
            a.art === 'punkt' ? <circle key={`a${i}`} cx={a.x} cy={a.y} r={2.4} fill="none" stroke="#0ca678" strokeOpacity={0.55} strokeWidth={1} /> : null
          )}
        {ziel && <circle cx={ziel.x} cy={ziel.y} r={7} fill="rgba(12,166,120,0.18)" stroke="#0ca678" strokeWidth={2} data-andock-ziel />}
        {[...eigene.filter((o) => o.t === 'linie'), ...(zieht ? [{ id: 'neu', s: p.seite, t: 'linie' as const, ...zieht, farbe: p.farbe }] : [])].map((o) => (
          <g key={o.id} data-objekt-linie>
            {radiert && o.id !== 'neu' && (
              <line
                x1={o.x}
                y1={o.y}
                x2={o.x2}
                y2={o.y2}
                stroke="transparent"
                strokeWidth={18}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setzeEigene(eigene.filter((x) => x.id !== o.id))
                }}
                data-radier-linie
              />
            )}
            <line x1={o.x} y1={o.y} x2={o.x2} y2={o.y2} stroke={o.farbe ?? '#1d4ed8'} strokeWidth={2.2} strokeLinecap="round" />
            <circle cx={o.x} cy={o.y} r={3} fill={o.farbe ?? '#1d4ed8'} />
            <circle cx={o.x2} cy={o.y2} r={3} fill={o.farbe ?? '#1d4ed8'} />
          </g>
        ))}
        {eigene
          .filter((o) => o.t === 'punkt')
          .map((o) => (
            <circle
              key={o.id}
              cx={o.x}
              cy={o.y}
              r={radiert ? 9 : 4.5}
              fill={o.farbe ?? '#1d4ed8'}
              fillOpacity={radiert ? 0.5 : 1}
              style={radiert ? { pointerEvents: 'all', cursor: 'pointer' } : undefined}
              onPointerDown={
                radiert
                  ? (e) => {
                      e.stopPropagation()
                      setzeEigene(eigene.filter((x) => x.id !== o.id))
                    }
                  : undefined
              }
              data-objekt-punkt
            />
          ))}
      </svg>
      {eigene
        .filter((o) => o.t === 'punkt')
        .map((o) => (
          <input
            key={o.id}
            value={o.text ?? ''}
            disabled={p.gesperrt}
            data-objekt-id={o.id}
            placeholder="Wert"
            onChange={(e) => setzeEigene(eigene.map((x) => (x.id === o.id ? { ...x, text: e.currentTarget.value } : x)))}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: o.x + 8,
              top: o.y - 22,
              width: Math.max(44, ((o.text ?? '').length + 2) * 8),
              height: 20,
              fontSize: 13,
              border: (o.text ?? '') ? '0' : '1px dashed #94a3b8',
              background: 'rgba(255,255,255,0.85)',
              color: o.farbe ?? '#1d4ed8',
              padding: '0 3px',
              pointerEvents: radiert ? 'none' : 'auto'
            }}
            data-objekt-text
          />
        ))}
      {eigene
        .filter((o) => o.t === 'text')
        .map((roh) => {
          // Auch ältere Kästchen außerhalb der Seite wieder hereinholen (sonst weder sichtbar noch greifbar)
          const o = klemmen(roh, roh.h ?? KASTEN_MIN_H)
          const farbe = o.farbe ?? '#1d4ed8'
          return (
            <div
              key={o.id}
              style={{ position: 'absolute', left: o.x, top: o.y, width: o.w ?? 170, ...(o.h ? { height: o.h } : {}), pointerEvents: 'auto' }}
              data-objekt-text
              data-kasten={o.id}
              onPointerDown={(e) => {
                e.stopPropagation()
                // Radierer: Kästchen antippen entfernt es (samt Verbindungen)
                if (radiert)
                  setzeEigene(
                    eigene
                      .filter((x) => x.id !== o.id)
                      .map((x) => (x.v1 === o.id || x.v2 === o.id ? { ...x, v1: x.v1 === o.id ? undefined : x.v1, v2: x.v2 === o.id ? undefined : x.v2 } : x))
                  )
              }}
            >
              <textarea
                value={o.text ?? ''}
                disabled={p.gesperrt}
                readOnly={radiert}
                data-objekt-id={o.id}
                onChange={(e) => {
                  const t = e.currentTarget
                  const text = t.value
                  // Wächst mit dem Text, schrumpft aber nicht unter die gezogene Höhe
                  t.style.height = 'auto'
                  const noetig = t.scrollHeight + 2
                  t.style.height = ''
                  setzeEigene(eigene.map((x) => (x.id === o.id ? { ...x, text, ...(noetig > (x.h ?? 0) ? { h: Math.min(900, noetig) } : {}) } : x)))
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: KASTEN_MIN_H,
                  resize: 'none',
                  overflow: 'hidden',
                  fontSize: 13,
                  lineHeight: '17px',
                  padding: '4px 5px',
                  border: `1.4px solid ${farbe}`,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.92)',
                  color: farbe,
                  fontFamily: 'system-ui, sans-serif',
                  display: 'block',
                  cursor: radiert ? 'pointer' : undefined
                }}
                data-kaestchen={o.id}
              />
              {!p.gesperrt && !radiert && (
                <>
                  {/* Anfassen zum Verschieben (oben links) */}
                  <div
                    role="button"
                    aria-label="Kästchen verschieben"
                    onPointerDown={(e) => anfassen(e, o, 'schieben')}
                    style={{ ...GRIFF, left: -11, top: -11, cursor: 'move', borderColor: farbe }}
                    data-kasten-schieben={o.id}
                  >
                    <IconArrowsMove size={12} color={farbe} />
                  </div>
                  {/* Ziehen für Breite und Höhe (unten rechts) */}
                  <div
                    role="button"
                    aria-label="Kästchen größer oder kleiner ziehen"
                    onPointerDown={(e) => anfassen(e, o, 'groesse')}
                    style={{ ...GRIFF, right: -9, bottom: -9, width: 18, height: 18, cursor: 'nwse-resize', borderColor: farbe }}
                    data-kasten-groesse={o.id}
                  >
                    <IconArrowsDiagonal2 size={10} color={farbe} />
                  </div>
                  <button
                    type="button"
                    aria-label="Kästchen entfernen"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setzeEigene(eigene.filter((x) => x.id !== o.id))}
                    style={{ ...GRIFF, right: -9, top: -9, width: 18, height: 18, cursor: 'pointer' }}
                    data-kasten-weg={o.id}
                  >
                    <IconX size={11} />
                  </button>
                </>
              )}
            </div>
          )
        })}
    </div>
  )
}

const GRIFF: React.CSSProperties = {
  position: 'absolute',
  width: 22,
  height: 22,
  borderRadius: 11,
  border: '1px solid #94a3b8',
  background: '#fff',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'none',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  zIndex: 2
}
