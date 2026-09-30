import { Button, Portal, type ButtonProps } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './kreismenue.css'

/**
 * Kreismenü (Radialmenü) mit Mehrfachauswahl – Wunsch der Lehrkraft (30.09.2026):
 * „Wenn mehrere Vorschläge da sind, soll sich ein Radialmenü mit einem Klick darauf öffnen, wo
 * man auswählt, welcher Vorschlag / welche Vorschläge umgesetzt werden sollen."
 *
 * Der Knopf selbst bleibt überall derselbe: Mit EINEM Eintrag setzt ein Klick ihn sofort um,
 * mit mehreren legt sich ein Kreis aus Einträgen um den Knopf; in der Mitte steht „Umsetzen".
 * Außerhalb klicken oder Esc schließt ohne Änderung. Der Kreis bleibt im Fenster (am Rand
 * rückt die Mitte nach innen).
 */
export interface KreismenueEintrag {
  id: string
  /** Kurzer Name im Kreis */
  label: string
  /** Ganzer Text als Hinweis beim Überfahren */
  titel?: string
}

export default function KreismenueKnopf({
  eintraege,
  onUmsetzen,
  children,
  aktionLabel = 'Umsetzen',
  knopf,
  testId
}: {
  eintraege: KreismenueEintrag[]
  onUmsetzen: (ids: string[]) => void
  children: React.ReactNode
  aktionLabel?: string
  knopf?: ButtonProps & { leftSection?: React.ReactNode }
  testId?: string
}): React.JSX.Element | null {
  const ref = useRef<HTMLButtonElement>(null)
  const [mitte, setMitte] = useState<{ x: number; y: number } | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string[]>([])
  if (!eintraege.length) return null
  const klick = (): void => {
    if (eintraege.length === 1) {
      onUmsetzen([eintraege[0].id])
      return
    }
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setGewaehlt([])
    setMitte({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }
  return (
    <>
      <Button
        ref={ref}
        size="compact-sm"
        variant="light"
        {...knopf}
        onClick={klick}
        aria-haspopup={eintraege.length > 1 ? 'menu' : undefined}
        aria-expanded={eintraege.length > 1 ? Boolean(mitte) : undefined}
        data-testid={testId}
      >
        {children}
      </Button>
      {mitte && (
        <Kreis
          mitte={mitte}
          eintraege={eintraege}
          gewaehlt={gewaehlt}
          aktionLabel={aktionLabel}
          onWechsel={(id) => setGewaehlt((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))}
          onSchliessen={() => {
            setMitte(null)
            ref.current?.focus()
          }}
          onUmsetzen={() => {
            // Reihenfolge wie in der Liste, nicht wie angeklickt
            const ids = eintraege.map((e) => e.id).filter((id) => gewaehlt.includes(id))
            setMitte(null)
            if (ids.length) onUmsetzen(ids)
          }}
        />
      )}
    </>
  )
}

/** Abstand der Einträge von der Mitte – wächst mit der Zahl der Einträge */
export const kreisRadius = (n: number): number => Math.max(110, 50 + n * 26)

/** Lage des i-ten von n Einträgen (oben beginnend, im Uhrzeigersinn) */
export function kreisLage(i: number, n: number, radius: number): { x: number; y: number } {
  const winkel = -Math.PI / 2 + (2 * Math.PI * i) / n
  return { x: Math.round(Math.cos(winkel) * radius), y: Math.round(Math.sin(winkel) * radius) }
}

const EINTRAG_BREITE = 150

function Kreis({
  mitte,
  eintraege,
  gewaehlt,
  aktionLabel,
  onWechsel,
  onSchliessen,
  onUmsetzen
}: {
  mitte: { x: number; y: number }
  eintraege: KreismenueEintrag[]
  gewaehlt: string[]
  aktionLabel: string
  onWechsel: (id: string) => void
  onSchliessen: () => void
  onUmsetzen: () => void
}): React.JSX.Element {
  const radius = kreisRadius(eintraege.length)
  const rand = radius + EINTRAG_BREITE / 2 + 8
  // Im Fenster halten: die Mitte rückt vom Rand weg
  const x = Math.min(Math.max(mitte.x, rand), Math.max(rand, window.innerWidth - rand))
  const y = Math.min(Math.max(mitte.y, radius + 30), Math.max(radius + 30, window.innerHeight - radius - 30))
  const ersterRef = useRef<HTMLButtonElement>(null)
  const [offen, setOffen] = useState(false)
  useLayoutEffect(() => {
    ersterRef.current?.focus()
    const t = requestAnimationFrame(() => setOffen(true))
    return () => cancelAnimationFrame(t)
  }, [])
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onSchliessen()
      }
    }
    window.addEventListener('keydown', taste, true)
    return () => window.removeEventListener('keydown', taste, true)
  }, [onSchliessen])
  return (
    <Portal>
      <div className="kreismenue-schleier" onMouseDown={onSchliessen} />
      <div className={`kreismenue ${offen ? 'kreismenue-offen' : ''}`} style={{ left: x, top: y }} role="menu" aria-label="Auswahl der Vorschläge">
        <svg className="kreismenue-ring" width={radius * 2} height={radius * 2} style={{ left: -radius, top: -radius }} aria-hidden>
          <circle cx={radius} cy={radius} r={radius - 1} />
        </svg>
        {eintraege.map((e, i) => {
          const lage = kreisLage(i, eintraege.length, radius)
          const an = gewaehlt.includes(e.id)
          return (
            <button
              key={e.id}
              ref={i === 0 ? ersterRef : undefined}
              type="button"
              role="menuitemcheckbox"
              aria-checked={an}
              title={e.titel}
              className={`kreismenue-eintrag ${an ? 'kreismenue-an' : ''}`}
              style={{ width: EINTRAG_BREITE, transform: offen ? `translate(calc(${lage.x}px - 50%), calc(${lage.y}px - 50%))` : 'translate(-50%, -50%) scale(0.4)' }}
              onClick={() => onWechsel(e.id)}
            >
              <span className="kreismenue-haken">{an && <IconCheck size={12} />}</span>
              <span>{e.label}</span>
            </button>
          )
        })}
        <button type="button" className="kreismenue-mitte" disabled={!gewaehlt.length} onClick={onUmsetzen} data-kreismenue-umsetzen>
          {aktionLabel}
          {gewaehlt.length ? ` (${gewaehlt.length})` : ''}
        </button>
      </div>
    </Portal>
  )
}
