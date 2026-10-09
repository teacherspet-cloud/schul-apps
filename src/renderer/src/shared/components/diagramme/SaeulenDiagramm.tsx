/** Gruppierte Säulen je Tag (09.10.2026 aus verwaltung/ServerDiagramme.tsx) */
import { useElementSize } from '@mantine/hooks'
import { useState } from 'react'
import { ACHSE, GITTER, Hinweisfeld, Legende, type Reihe } from './grundteile'

/** Gruppierte Säulen je Tag (Zahlen ab 0) */
export function SaeulenDiagramm({
  tage,
  reihen,
  hoehe = 160,
  beschreibung,
  einheit = ''
}: {
  tage: string[]
  reihen: Reihe[]
  hoehe?: number
  beschreibung: string
  einheit?: string
}): React.JSX.Element {
  const { ref, width } = useElementSize()
  const [zeiger, setZeiger] = useState<number | null>(null)
  const l = 34
  const r = 4
  const o = 8
  const u = 22
  const b = Math.max(0, width - l - r)
  const h = hoehe - o - u
  const n = tage.length
  const hoechst = Math.max(1, ...reihen.flatMap((rh) => rh.werte))
  // Runde Achse: 1, 2, 5, 10, 20, 50 …
  const stufe = 10 ** Math.floor(Math.log10(hoechst))
  const max = [1, 2, 5, 10].map((f) => f * stufe).find((m) => m >= hoechst) ?? hoechst
  const y = (v: number): number => o + h - (v / max) * h
  const feld = n ? b / n : 0
  const luecke = 2
  const saeule = Math.max(2, Math.min(18, (feld * 0.7 - luecke * (reihen.length - 1)) / Math.max(1, reihen.length)))
  const tagText = (t: string): string => `${Number(t.slice(8, 10))}.${Number(t.slice(5, 7))}.`
  const zeigeMarke = (i: number): boolean => n <= 8 || i % Math.ceil(n / 7) === (n - 1) % Math.ceil(n / 7)
  return (
    <div>
      <div ref={ref} style={{ position: 'relative', width: '100%' }} role="img" aria-label={beschreibung}>
        {width > 0 && (
          <svg width={width} height={hoehe} onPointerLeave={() => setZeiger(null)} style={{ display: 'block' }} aria-hidden>
            {[0, max / 2, max].map((v) => (
              <g key={v}>
                <line x1={l} x2={l + b} y1={y(v)} y2={y(v)} stroke={GITTER} strokeWidth={1} />
                <text x={l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={ACHSE}>
                  {Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}
                </text>
              </g>
            ))}
            {tage.map((t, i) => {
              const breiteGruppe = saeule * reihen.length + luecke * (reihen.length - 1)
              const ab = l + i * feld + (feld - breiteGruppe) / 2
              return (
                <g key={t} onPointerEnter={() => setZeiger(i)}>
                  {/* Trefferfläche: der ganze Tag */}
                  <rect x={l + i * feld} y={o} width={feld} height={h} fill={zeiger === i ? 'var(--mantine-color-default-hover)' : 'transparent'} />
                  {reihen.map((rh, k) => {
                    const v = rh.werte[i] ?? 0
                    const hh = Math.max(v > 0 ? 2 : 0, (v / max) * h)
                    return <rect key={rh.name} x={ab + k * (saeule + luecke)} y={o + h - hh} width={saeule} height={hh} rx={Math.min(3, saeule / 2)} fill={rh.farbe} />
                  })}
                  {zeigeMarke(i) && (
                    <text x={l + i * feld + feld / 2} y={hoehe - 6} textAnchor="middle" fontSize={11} fill={ACHSE}>
                      {tagText(t)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
        {zeiger !== null && width > 0 && (
          <Hinweisfeld
            x={l + zeiger * feld + feld / 2}
            breite={width}
            zeilen={
              <>
                <div style={{ color: 'var(--mantine-color-dimmed)' }}>{tagText(tage[zeiger])}</div>
                {reihen.map((rh) => (
                  <div key={rh.name}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: rh.farbe, marginRight: 6 }} />
                    {rh.name}: <b>{Math.round(rh.werte[zeiger] ?? 0)}</b>
                    {einheit}
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

