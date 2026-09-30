import { useEffect, useRef, useState } from 'react'
import { BEWEGUNG_PX } from './gestenLogik'
import { useTouch } from './touchModus'

/**
 * Wischaktionen an einem Listeneintrag (30.09.2026) – wie in Mail oder Dateien auf dem iPhone:
 * nach links wischen legt Knöpfe frei („Kopie", „Löschen"), ein langer Druck öffnet das Menü
 * des Eintrags.
 *
 * Beides ist Abkürzung, nie der einzige Weg (WCAG 2.5.1/2.5.7): Dieselben Aktionen stehen im
 * ⋯-Menü des Eintrags. Senkrecht bleibt Wischen Rollen (`touch-action: pan-y`), erst eine
 * deutlich waagerechte Bewegung zieht den Eintrag. Am PC mit Maus gibt die Komponente nur
 * ihren Inhalt aus.
 */
export interface WischAktion {
  label: string
  icon: React.ReactNode
  farbe: string
  onClick: () => void
}

const BREITE = 88

export default function WischZeile({
  aktionen,
  onLangerDruck,
  children
}: {
  aktionen: WischAktion[]
  /** Langer Druck auf den Eintrag (gesten.ts meldet ihn als `langerdruck`) */
  onLangerDruck?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const touch = useTouch()
  const rahmen = useRef<HTMLDivElement>(null)
  const [versatz, setVersatz] = useState(0)
  const [zieht, setZieht] = useState(false)
  const start = useRef<{ x: number; y: number; basis: number; waagerecht: boolean | null; id: number } | null>(null)
  const offenBreite = aktionen.length * BREITE

  useEffect(() => {
    const el = rahmen.current
    if (!el || !onLangerDruck) return
    const h = (): void => onLangerDruck()
    el.addEventListener('langerdruck', h)
    return () => el.removeEventListener('langerdruck', h)
  }, [onLangerDruck, touch])

  // Offen und woanders angetippt: wieder schließen
  useEffect(() => {
    if (versatz === 0) return
    const zu = (e: PointerEvent): void => {
      if (!rahmen.current?.contains(e.target as Node)) setVersatz(0)
    }
    document.addEventListener('pointerdown', zu, true)
    return () => document.removeEventListener('pointerdown', zu, true)
  }, [versatz])

  if (!touch) return <>{children}</>

  const unten = (e: React.PointerEvent): void => {
    if (e.pointerType === 'mouse') return
    start.current = { x: e.clientX, y: e.clientY, basis: versatz, waagerecht: null, id: e.pointerId }
  }
  const bewegen = (e: React.PointerEvent): void => {
    const s = start.current
    if (!s || e.pointerId !== s.id) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (s.waagerecht === null) {
      if (Math.hypot(dx, dy) < BEWEGUNG_PX) return
      s.waagerecht = Math.abs(dx) > Math.abs(dy) * 1.5
      if (s.waagerecht) {
        setZieht(true)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }
    }
    if (!s.waagerecht) return
    setVersatz(Math.max(-offenBreite - 24, Math.min(0, s.basis + dx)))
  }
  const oben = (e: React.PointerEvent): void => {
    const s = start.current
    start.current = null
    if (!s || !s.waagerecht) return
    setZieht(false)
    const offen = versatz < -offenBreite / 2
    setVersatz(offen ? -offenBreite : 0)
    // Kein Öffnen des Eintrags durch den Klick am Ende des Wischens
    const schlucken = (ev: Event): void => {
      ev.stopPropagation()
      ev.preventDefault()
    }
    const el = e.currentTarget
    el.addEventListener('click', schlucken, { capture: true, once: true })
    window.setTimeout(() => el.removeEventListener('click', schlucken, { capture: true }), 400)
  }

  return (
    <div ref={rahmen} className="wisch-zeile" data-langdruck={onLangerDruck ? '' : undefined} data-wisch-zeile data-offen={versatz !== 0 || undefined}>
      <div className="wisch-zeile-aktionen" aria-hidden={versatz === 0} style={{ width: offenBreite }}>
        {aktionen.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={versatz === 0 ? -1 : 0}
            style={{ background: a.farbe }}
            onClick={() => {
              setVersatz(0)
              a.onClick()
            }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="wisch-zeile-inhalt"
        data-zieht={zieht || undefined}
        style={{ transform: versatz ? `translateX(${versatz}px)` : undefined }}
        onPointerDown={unten}
        onPointerMove={bewegen}
        onPointerUp={oben}
        onPointerCancel={() => {
          start.current = null
          setZieht(false)
          setVersatz((v) => (v < -offenBreite / 2 ? -offenBreite : 0))
        }}
      >
        {children}
      </div>
    </div>
  )
}
