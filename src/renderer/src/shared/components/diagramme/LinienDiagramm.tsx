/** Linien über die Zeit (09.10.2026 aus verwaltung/ServerDiagramme.tsx) */
import { useElementSize } from '@mantine/hooks'
import { useState } from 'react'
import { ACHSE, GITTER, Hinweisfeld, Legende, type Reihe } from './grundteile'

/**
 * Linien über die Zeit, y-Achse 0–100 % (alle Reihen sind Anteile 0–1). `zeiten` in ms.
 */
export function LinienDiagramm({
  zeiten,
  reihen,
  zeitText,
  hoehe = 180,
  beschreibung
}: {
  zeiten: number[]
  reihen: Reihe[]
  zeitText: (ms: number) => string
  hoehe?: number
  beschreibung: string
}): React.JSX.Element {
  const { ref, width } = useElementSize()
  const [zeiger, setZeiger] = useState<number | null>(null)
  const l = 40
  const r = 8
  const o = 8
  const u = 22
  const b = Math.max(0, width - l - r)
  const h = hoehe - o - u
  const n = zeiten.length
  const x = (i: number): number => l + (n > 1 ? (i / (n - 1)) * b : b / 2)
  const y = (v: number): number => o + h - Math.max(0, Math.min(1, v)) * h
  const marken = n > 1 ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1] : n ? [0] : []
  const bewegen = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (n < 1) return
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    setZeiger(Math.max(0, Math.min(n - 1, Math.round(((px - l) / Math.max(1, b)) * (n - 1)))))
  }
  return (
    <div>
      <div ref={ref} style={{ position: 'relative', width: '100%' }} role="img" aria-label={beschreibung}>
        {width > 0 && (
          <svg width={width} height={hoehe} onPointerMove={bewegen} onPointerLeave={() => setZeiger(null)} style={{ display: 'block', touchAction: 'pan-y' }} aria-hidden>
            {[0, 0.5, 1].map((v) => (
              <g key={v}>
                <line x1={l} x2={l + b} y1={y(v)} y2={y(v)} stroke={GITTER} strokeWidth={1} />
                <text x={l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={ACHSE}>
                  {Math.round(v * 100)} %
                </text>
              </g>
            ))}
            {marken.map((i) => (
              <text key={i} x={x(i)} y={hoehe - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={11} fill={ACHSE}>
                {zeitText(zeiten[i])}
              </text>
            ))}
            {reihen.map((rh) => (
              <polyline
                key={rh.name}
                fill="none"
                stroke={rh.farbe}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={rh.werte.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
              />
            ))}
            {zeiger !== null && (
              <g>
                <line x1={x(zeiger)} x2={x(zeiger)} y1={o} y2={o + h} stroke={ACHSE} strokeWidth={1} strokeDasharray="3 3" />
                {reihen.map((rh) => (
                  <circle key={rh.name} cx={x(zeiger)} cy={y(rh.werte[zeiger] ?? 0)} r={4} fill={rh.farbe} stroke="var(--mantine-color-body)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}
        {zeiger !== null && width > 0 && (
          <Hinweisfeld
            x={x(zeiger)}
            breite={width}
            zeilen={
              <>
                <div style={{ color: 'var(--mantine-color-dimmed)' }}>{zeitText(zeiten[zeiger])}</div>
                {reihen.map((rh) => (
                  <div key={rh.name}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: rh.farbe, marginRight: 6 }} />
                    {rh.name}: <b>{Math.round((rh.werte[zeiger] ?? 0) * 100)} %</b>
                  </div>
                ))}
              </>
            }
          />
        )}
      </div>
      <Legende reihen={reihen} />
    </div>
  )
}

