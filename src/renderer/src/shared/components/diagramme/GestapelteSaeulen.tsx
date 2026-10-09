/**
 * Gestapelte Säulen je Tag (09.10.2026, aus verwaltung/KiNutzung.tsx verallgemeinert): je Tag eine Säule, die Reihen
 * übereinander, 2px Abstand zwischen den Teilen, oben abgerundet. Tooltip beim Überfahren, Textfassung für Screenreader.
 * `markiert` hebt Tage hervor (z. B. erreichte Limits): ein kleines Dreieck über der Säule und eine Zeile im Tooltip.
 */
import { Box, Group, Text } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { useState } from 'react'
import { ACHSE, GITTER, type Reihe, tagKurz } from './grundteile'

const zahl = (n: number): string => n.toLocaleString('de-DE')

export function GestapelteSaeulen({
  tage,
  reihen,
  beschreibung,
  einheit = 'Anfragen',
  markiert,
  hoehe = 180,
  legende = true
}: {
  tage: string[]
  reihen: Reihe[]
  beschreibung: string
  einheit?: string
  /** Text der Hervorhebung je Tag (z. B. „Limit erreicht") oder null */
  markiert?: (i: number) => string | null
  hoehe?: number
  legende?: boolean
}): React.JSX.Element {
  const { ref, width } = useElementSize()
  const [hover, setHover] = useState<number | null>(null)
  const summe = (i: number): number => reihen.reduce((s, r) => s + (r.werte[i] ?? 0), 0)
  const max = Math.max(1, ...tage.map((_, i) => summe(i)))
  // Achse mit runden Schritten
  const schritt = Math.max(1, Math.ceil(max / 4 / (max > 40 ? 10 : 1)) * (max > 40 ? 10 : 1))
  const oben = Math.ceil(max / schritt) * schritt
  const H = hoehe
  const links = 32
  const unten = 20
  const kopf = markiert ? 14 : 6
  const breite = Math.max(200, width)
  const innen = breite - links - 4
  const n = tage.length
  const spalte = innen / Math.max(1, n)
  const sb = Math.max(3, Math.min(18, spalte - 4))
  const y = (v: number): number => kopf + (H - unten - kopf) * (1 - v / oben)
  const zeigeMarke = (i: number): boolean => i === 0 || i === n - 1 || n <= 8 || i % 7 === (n - 1) % 7
  const hinweis = hover !== null ? markiert?.(hover) : null
  return (
    <Box ref={ref} pos="relative">
      <div role="img" aria-label={beschreibung}>
        <svg width={breite} height={H} style={{ display: 'block' }} onMouseLeave={() => setHover(null)} aria-hidden>
          {Array.from({ length: Math.round(oben / schritt) + 1 }, (_, i) => i * schritt).map((v) => (
            <g key={v}>
              <line x1={links} x2={breite - 4} y1={y(v)} y2={y(v)} stroke={GITTER} strokeWidth={1} />
              <text x={links - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={ACHSE}>
                {v}
              </text>
            </g>
          ))}
          {tage.map((t, i) => {
            const x = links + i * spalte + (spalte - sb) / 2
            let basis = 0
            const teile = reihen
              .map((r) => ({ r, v: r.werte[i] ?? 0 }))
              .filter((s) => s.v > 0)
              .map((s, k, alle) => {
                const y0 = y(basis)
                basis += s.v
                const y1 = y(basis)
                const letztes = k === alle.length - 1
                // 2px Abstand zwischen den Teilen, abgerundetes Ende nur oben
                const h = Math.max(1, y0 - y1 - (k > 0 ? 2 : 0))
                return letztes ? (
                  <path
                    key={s.r.name}
                    d={`M${x},${y1 + h} V${y1 + Math.min(4, h)} Q${x},${y1} ${x + Math.min(4, sb / 2)},${y1} H${x + sb - Math.min(4, sb / 2)} Q${x + sb},${y1} ${x + sb},${y1 + Math.min(4, h)} V${y1 + h} Z`}
                    fill={s.r.farbe}
                  />
                ) : (
                  <rect key={s.r.name} x={x} y={y1} width={sb} height={h} fill={s.r.farbe} />
                )
              })
            const marke = markiert?.(i)
            const spitze = y(summe(i))
            return (
              <g key={t}>
                {hover === i && <rect x={links + i * spalte} y={2} width={spalte} height={H - unten - 2} fill="var(--mantine-color-default-hover)" />}
                {teile}
                {marke && (
                  <path d={`M${x + sb / 2 - 5},${spitze - 3} L${x + sb / 2 + 5},${spitze - 3} L${x + sb / 2},${spitze - 11} Z`} fill="var(--mantine-color-orange-6)" />
                )}
                {/* Trefferfläche größer als die Säule */}
                <rect x={links + i * spalte} y={0} width={spalte} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
                {zeigeMarke(i) && (
                  <text x={links + i * spalte + spalte / 2} y={H - 5} textAnchor="middle" fontSize={10} fill={ACHSE}>
                    {tagKurz(t)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {hover !== null && (
        <Box
          style={{
            position: 'absolute',
            top: 4,
            left: links + hover * spalte > breite - 200 ? undefined : links + (hover + 1) * spalte + 6,
            right: links + hover * spalte > breite - 200 ? breite - links - hover * spalte + 6 : undefined,
            pointerEvents: 'none',
            background: 'var(--mantine-color-body)',
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 12,
            boxShadow: 'var(--mantine-shadow-sm)',
            zIndex: 2
          }}
        >
          <Text size="xs" fw={600}>
            {tagKurz(tage[hover])} · {zahl(summe(hover))} {einheit}
          </Text>
          {reihen
            .filter((r) => (r.werte[hover] ?? 0) > 0)
            .map((r) => (
              <Group key={r.name} gap={6} wrap="nowrap">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: r.farbe, display: 'inline-block' }} />
                <Text size="xs">
                  {r.name}: {zahl(r.werte[hover] ?? 0)}
                </Text>
              </Group>
            ))}
          {hinweis && (
            <Text size="xs" c="orange.7" fw={600}>
              {hinweis}
            </Text>
          )}
        </Box>
      )}
      {legende && reihen.length > 0 && (
        <Group gap="md" mt={4} aria-hidden>
          {reihen.map((r) => (
            <Group key={r.name} gap={6} wrap="nowrap">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: r.farbe, display: 'inline-block' }} />
              <Text size="xs" c="dimmed">
                {r.name}
              </Text>
            </Group>
          ))}
        </Group>
      )}
    </Box>
  )
}
