/**
 * Schwebendes, verschiebbares Fenster in der Seite (27.11.2026, Wunsch der Lehrkraft: „Die sich öffnenden Kästen sollten
 * verschiebbar sein, damit die Nutzer sie sich legen können, wie sie es gerade brauchen").
 *
 * Genutzt für Hilfekarten, Formulierungshilfen und das Wörterbuch auf dem Schülerblatt. Ersetzt das frühere eigene
 * Browserfenster der Hilfekarten: Auf dem iPad öffnete es einen neuen Tab (und beendete dabei das Vollbild).
 *
 *  - Als Portal am Ende von <body> (data-portal): sichtbar über der Fokusansicht, auch im echten Vollbild, und
 *    unabhängig vom skalierten Blatt (transform würde „fixed" sonst an das Blatt binden).
 *  - Verschieben am Kopf mit Maus, Stift oder Finger (Pointer-Events mit Capture); bleibt beim Rollen an seinem Platz.
 *  - Lage je Art (`merken`) wird im Gerät gemerkt – nur Bequemlichkeit, ohne Speicher geht es genauso.
 *  - Immer ganz im Bild: beim Ziehen und bei Größenänderung des Fensters an den Rand geklemmt.
 */
import { CloseButton, Group, Portal, Text } from '@mantine/core'
import { IconGripHorizontal } from '@tabler/icons-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface SchwebefensterProps {
  titel: React.ReactNode
  children: React.ReactNode
  schliessen: () => void
  /** Startpunkt (Bildschirmkoordinaten), etwa neben dem Knopf; sonst rechts oben */
  start?: { x: number; y: number }
  /** Lage im Gerät merken unter diesem Schlüssel (z. B. „hilfe", „phrasen", „woerterbuch") */
  merken?: string
  breite?: number
  /** Höchsthöhe des Inhalts (CSS), Vorgabe 60vh */
  hoehe?: string
  farbe?: string
  /** data-Attribut für Tests */
  kennung?: Record<string, string>
}

const RAND = 8
const SCHLUESSEL = 'sa-schwebefenster-'
let ebeneOben = 400

function gemerkt(k?: string): { x: number; y: number } | null {
  if (!k) return null
  try {
    const roh = localStorage.getItem(SCHLUESSEL + k)
    const p = roh ? (JSON.parse(roh) as { x?: unknown; y?: unknown }) : null
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null
  } catch {
    return null
  }
}

function merke(k: string | undefined, p: { x: number; y: number }): void {
  if (!k) return
  try {
    localStorage.setItem(SCHLUESSEL + k, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }))
  } catch {
    /* ohne Speicher: nicht merken */
  }
}

/** In den sichtbaren Bereich klemmen */
export function geklemmt(p: { x: number; y: number }, w: number, h: number, fw = window.innerWidth, fh = window.innerHeight): { x: number; y: number } {
  return {
    x: Math.max(RAND, Math.min(p.x, fw - w - RAND)),
    y: Math.max(RAND, Math.min(p.y, fh - Math.min(h, 48) - RAND))
  }
}

export function Schwebefenster({ titel, children, schliessen, start, merken, breite = 320, hoehe = '60vh', farbe = 'var(--mantine-color-indigo-6)', kennung }: SchwebefensterProps): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [lage, setLage] = useState<{ x: number; y: number }>(() => {
    const w = Math.min(breite, window.innerWidth - 2 * RAND)
    return geklemmt(gemerkt(merken) ?? start ?? { x: window.innerWidth - w - 24, y: 90 }, w, 200)
  })
  const [z, setZ] = useState(() => ++ebeneOben)
  const zug = useRef<{ dx: number; dy: number; id: number } | null>(null)

  // Nach dem ersten Zeichnen mit der echten Höhe klemmen; bei Größenänderung des Fensters ebenso
  useLayoutEffect(() => {
    const klemmen = (): void => {
      const r = box.current?.getBoundingClientRect()
      if (r) setLage((l) => geklemmt(l, r.width, r.height))
    }
    klemmen()
    window.addEventListener('resize', klemmen)
    return () => window.removeEventListener('resize', klemmen)
  }, [])

  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && box.current?.contains(document.activeElement)) {
        e.preventDefault()
        schliessen()
      }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [schliessen])

  const runter = (e: React.PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    setZ(++ebeneOben)
    zug.current = { dx: e.clientX - lage.x, dy: e.clientY - lage.y, id: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const ziehen = (e: React.PointerEvent<HTMLDivElement>): void => {
    const g = zug.current
    if (!g || g.id !== e.pointerId) return
    const r = box.current?.getBoundingClientRect()
    setLage(geklemmt({ x: e.clientX - g.dx, y: e.clientY - g.dy }, r?.width ?? breite, r?.height ?? 200))
  }
  const loslassen = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!zug.current || zug.current.id !== e.pointerId) return
    zug.current = null
    merke(merken, lage)
  }

  return (
    <Portal>
      <div
        ref={box}
        role="dialog"
        aria-label={typeof titel === 'string' ? titel : undefined}
        onPointerDownCapture={() => setZ(++ebeneOben)}
        style={{
          position: 'fixed',
          left: lage.x,
          top: lage.y,
          width: `min(${breite}px, calc(100vw - ${2 * RAND}px))`,
          zIndex: z,
          background: 'var(--mantine-color-body)',
          color: 'var(--mantine-color-text)',
          border: `2px solid ${farbe}`,
          borderRadius: 12,
          boxShadow: '0 8px 28px rgba(0,0,0,.22)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        data-schwebefenster={merken ?? ''}
        {...kennung}
      >
        <div
          onPointerDown={runter}
          onPointerMove={ziehen}
          onPointerUp={loslassen}
          onPointerCancel={loslassen}
          style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none', background: farbe, color: '#fff', padding: '6px 8px 6px 10px' }}
          data-schwebefenster-griff
          title="Zum Verschieben ziehen"
        >
          <Group justify="space-between" wrap="nowrap" gap={6}>
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <IconGripHorizontal size={16} style={{ flex: 'none', opacity: 0.8 }} />
              <Text fw={700} size="sm" truncate>
                {titel}
              </Text>
            </Group>
            <CloseButton size="sm" variant="transparent" c="white" onClick={schliessen} aria-label="Schließen" data-schwebefenster-zu />
          </Group>
        </div>
        <div style={{ maxHeight: hoehe, overflowY: 'auto', overscrollBehavior: 'contain', padding: 10 }}>{children}</div>
      </div>
    </Portal>
  )
}
