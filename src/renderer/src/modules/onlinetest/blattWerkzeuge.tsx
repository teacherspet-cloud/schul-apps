/**
 * Werkzeuge auf dem freigegebenen Arbeitsblatt (03.10.2026, abgestimmt mit der Lehrkraft):
 * eine mitwandernde Leiste mit Tastatur, Stift (Farben), Textmarker (Farben), Radierer,
 * Textkästchen, Verbindungslinie (z. B. Kästchen → Datum auf einer Zeitleiste) und Punkt mit Wert
 * (Diagramme). Kästchen, Linien und Punkte sind Objekte (shared/blattObjekte.ts) – sie bleiben
 * verschieb- und änderbar und kommen auf den Seitenbildern auch bei der KI an.
 */
import { ActionIcon, ColorSwatch, Group, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { IconArrowBackUp, IconCircleDot, IconEraser, IconHighlight, IconKeyboard, IconLine, IconPencil, IconTextPlus, IconX } from '@tabler/icons-react'
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
const abstand = (px: number, py: number, o: BlattObjekt): number => {
  const x2 = o.x2 ?? o.x
  const y2 = o.y2 ?? o.y
  const dx = x2 - o.x
  const dy = y2 - o.y
  const l = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - o.x) * dx + (py - o.y) * dy) / l))
  return Math.hypot(px - (o.x + t * dx), py - (o.y + t * dy))
}

/**
 * Objekte einer Seite: Kästchen (bearbeitbar), Linien, Punkte. Im passenden Werkzeug entstehen
 * neue; mit dem Radierer verschwinden sie per Antippen. Lage in Seitenpixeln.
 */
export function ObjektEbene(p: {
  seite: number
  lage: { x: number; y: number; w: number; h: number }
  objekte: BlattObjekt[]
  aendern: (neu: BlattObjekt[]) => void
  werkzeug: Werkzeug
  farbe: string
  gesperrt: boolean
}): React.JSX.Element {
  const flaeche = useRef<HTMLDivElement>(null)
  const [zieht, setZieht] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null)
  const [fokus, setFokus] = useState<string | null>(null)
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
  const punkt = (e: React.PointerEvent): { x: number; y: number } => {
    const r = flaeche.current!.getBoundingClientRect()
    // Die Ebene ist mit dem Blatt skaliert: Bildschirm- in Seitenpixel umrechnen
    return { x: ((e.clientX - r.left) / r.width) * p.lage.w, y: ((e.clientY - r.top) / r.height) * p.lage.h }
  }
  const aktiv = !p.gesperrt && (p.werkzeug === 'text' || p.werkzeug === 'linie' || p.werkzeug === 'punkt' || p.werkzeug === 'radierer')
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
        pointerEvents: aktiv ? 'auto' : 'none',
        touchAction: aktiv ? 'none' : 'auto'
      }}
      data-objekte={p.seite}
      onPointerDown={(e) => {
        if (!aktiv || (e.target as HTMLElement).closest('[data-objekt-text]')) return
        const q = punkt(e)
        if (p.werkzeug === 'radierer') {
          // Linie oder Punkt in der Nähe löschen (Kästchen haben ihr eigenes ×)
          const treffer = eigene.find((o) => (o.t === 'linie' ? abstand(q.x, q.y, o) < 10 : o.t === 'punkt' ? Math.hypot(q.x - o.x, q.y - o.y) < 12 : false))
          if (treffer) setzeEigene(eigene.filter((o) => o !== treffer))
          return
        }
        if (p.werkzeug === 'text') {
          const id = neueId()
          setzeEigene([...eigene, { id, s: p.seite, t: 'text', x: q.x, y: q.y - 12, w: 170, text: '', farbe: p.farbe }])
          setFokus(id)
          return
        }
        if (p.werkzeug === 'punkt') {
          const id = neueId()
          setzeEigene([...eigene, { id, s: p.seite, t: 'punkt', x: q.x, y: q.y, text: '', farbe: p.farbe }])
          setFokus(id)
          return
        }
        if (p.werkzeug === 'linie') {
          flaeche.current!.setPointerCapture(e.pointerId)
          setZieht({ x: q.x, y: q.y, x2: q.x, y2: q.y })
        }
      }}
      onPointerMove={(e) => {
        if (!zieht) return
        const q = punkt(e)
        setZieht({ ...zieht, x2: q.x, y2: q.y })
      }}
      onPointerUp={() => {
        if (!zieht) return
        if (Math.hypot(zieht.x2 - zieht.x, zieht.y2 - zieht.y) > 8) setzeEigene([...eigene, { id: neueId(), s: p.seite, t: 'linie', ...zieht, farbe: p.farbe }])
        setZieht(null)
      }}
    >
      <svg width={p.lage.w} height={p.lage.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {[...eigene.filter((o) => o.t === 'linie'), ...(zieht ? [{ id: 'neu', s: p.seite, t: 'linie' as const, ...zieht, farbe: p.farbe }] : [])].map((o) => (
          <g key={o.id} data-objekt-linie>
            <line x1={o.x} y1={o.y} x2={o.x2} y2={o.y2} stroke={o.farbe ?? '#1d4ed8'} strokeWidth={2.2} strokeLinecap="round" />
            <circle cx={o.x} cy={o.y} r={3} fill={o.farbe ?? '#1d4ed8'} />
            <circle cx={o.x2} cy={o.y2} r={3} fill={o.farbe ?? '#1d4ed8'} />
          </g>
        ))}
        {eigene
          .filter((o) => o.t === 'punkt')
          .map((o) => (
            <circle key={o.id} cx={o.x} cy={o.y} r={4.5} fill={o.farbe ?? '#1d4ed8'} data-objekt-punkt />
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
              pointerEvents: 'auto'
            }}
            data-objekt-text
          />
        ))}
      {eigene
        .filter((o) => o.t === 'text')
        .map((o) => (
          <div
            key={o.id}
            style={{ position: 'absolute', left: o.x, top: o.y, width: o.w ?? 170, pointerEvents: 'auto' }}
            data-objekt-text
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Stack gap={0}>
              <textarea
                value={o.text ?? ''}
                disabled={p.gesperrt}
                data-objekt-id={o.id}
                rows={Math.max(1, (o.text ?? '').split('\n').length)}
                onChange={(e) => setzeEigene(eigene.map((x) => (x.id === o.id ? { ...x, text: e.currentTarget.value } : x)))}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = `${t.scrollHeight}px`
                }}
                style={{
                  width: '100%',
                  minHeight: 26,
                  resize: 'horizontal',
                  overflow: 'hidden',
                  fontSize: 13,
                  lineHeight: '17px',
                  padding: '4px 5px',
                  border: `1.4px solid ${o.farbe ?? '#1d4ed8'}`,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.92)',
                  color: o.farbe ?? '#1d4ed8',
                  fontFamily: 'system-ui, sans-serif'
                }}
                data-kaestchen={o.id}
              />
            </Stack>
            {!p.gesperrt && (
              <button
                type="button"
                aria-label="Kästchen entfernen"
                onClick={() => setzeEigene(eigene.filter((x) => x.id !== o.id))}
                style={{
                  position: 'absolute',
                  right: -9,
                  top: -9,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  border: '1px solid #94a3b8',
                  background: '#fff',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <IconX size={11} />
              </button>
            )}
          </div>
        ))}
    </div>
  )
}
