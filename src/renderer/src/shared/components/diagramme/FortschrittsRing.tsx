/**
 * Fortschrittsring für EINEN Anteil (0–1), z. B. verbrauchtes Kontingent (09.10.2026). Ab `warnAb` orange, ab 100 % rot –
 * der Wert steht zusätzlich als Zahl in der Mitte (nicht nur über die Farbe lesbar).
 */
import { Text } from '@mantine/core'

export function FortschrittsRing({
  anteil,
  titel,
  unten,
  groesse = 92,
  farbe = 'var(--mantine-color-blue-6)',
  warnAb = 0.8
}: {
  anteil: number
  titel: string
  unten?: string
  groesse?: number
  farbe?: string
  warnAb?: number
}): React.JSX.Element {
  const a = Math.max(0, Math.min(1, Number.isFinite(anteil) ? anteil : 0))
  const rad = 15.9155
  const umfang = 2 * Math.PI * rad
  const strich = a >= 1 ? 'var(--mantine-color-red-6)' : a >= warnAb ? 'var(--mantine-color-orange-6)' : farbe
  const prozent = Math.round(a * 100)
  return (
    <div role="img" aria-label={`${titel}: ${prozent} %${unten ? `, ${unten}` : ''}`} style={{ position: 'relative', width: groesse, height: groesse, flexShrink: 0 }}>
      <svg width={groesse} height={groesse} viewBox="0 0 42 42" aria-hidden>
        <circle cx="21" cy="21" r={rad} fill="none" stroke="var(--mantine-color-default-border)" strokeWidth="4" />
        {a > 0 && (
          <circle
            cx="21"
            cy="21"
            r={rad}
            fill="none"
            stroke={strich}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.5, a * umfang)} ${umfang}`}
            transform="rotate(-90 21 21)"
          />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }} aria-hidden>
        <Text fw={700} size="md" lh={1}>
          {prozent} %
        </Text>
      </div>
    </div>
  )
}
