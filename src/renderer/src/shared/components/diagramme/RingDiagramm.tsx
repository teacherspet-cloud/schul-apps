/** Ringdiagramme (09.10.2026 aus verwaltung/ServerDiagramme.tsx) */
import { Group, Text } from '@mantine/core'

/** Ring mit Anteilen (z. B. Platz auf der Platte); Legende mit Werten daneben. `titel` leitet die Textfassung ein. */
export function RingDiagramm({
  teile,
  mitte,
  unten,
  groesse = 150,
  wertText,
  titel = 'Platz auf der Platte'
}: {
  teile: { name: string; wert: number; farbe: string }[]
  mitte: string
  unten?: string
  groesse?: number
  wertText: (v: number) => string
  titel?: string
}): React.JSX.Element {
  const summe = Math.max(1, teile.reduce((s, t) => s + t.wert, 0))
  const rad = 15.9155
  const umfang = 2 * Math.PI * rad
  const sichtbar = teile.filter((t) => t.wert > 0)
  const luecke = sichtbar.length > 1 ? 0.8 : 0
  let start = 0
  const boegen = sichtbar.map((t) => {
    const laenge = (t.wert / summe) * umfang
    const bg = { ...t, von: start, laenge: Math.max(0.3, laenge - luecke) }
    start += laenge
    return bg
  })
  const beschreibung = teile.map((t) => `${t.name} ${wertText(t.wert)} (${Math.round((t.wert / summe) * 100)} %)`).join(', ')
  return (
    <Group gap="lg" align="center" wrap="wrap">
      <div role="img" aria-label={`${titel}: ${beschreibung}`} style={{ position: 'relative', width: groesse, height: groesse, flexShrink: 0 }}>
        <svg width={groesse} height={groesse} viewBox="0 0 42 42" aria-hidden>
          <circle cx="21" cy="21" r={rad} fill="none" stroke="var(--mantine-color-default-border)" strokeWidth="5" />
          {boegen.map((bg) => (
            <circle
              key={bg.name}
              cx="21"
              cy="21"
              r={rad}
              fill="none"
              stroke={bg.farbe}
              strokeWidth="5"
              strokeDasharray={`${bg.laenge} ${umfang - bg.laenge}`}
              strokeDashoffset={-bg.von}
              transform="rotate(-90 21 21)"
            >
              <title>{`${bg.name}: ${wertText(bg.wert)}`}</title>
            </circle>
          ))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          <div>
            <Text fw={700} size="lg" lh={1.1}>
              {mitte}
            </Text>
            {unten && (
              <Text size="xs" c="dimmed">
                {unten}
              </Text>
            )}
          </div>
        </div>
      </div>
      <div aria-hidden>
        {teile.map((t) => (
          <Group key={t.name} gap={8} wrap="nowrap" mb={2}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: t.farbe, display: 'inline-block', flexShrink: 0 }} />
            <Text size="sm" style={{ minWidth: 150 }}>
              {t.name}
            </Text>
            <Text size="sm" c="dimmed">
              {wertText(t.wert)}
            </Text>
          </Group>
        ))}
      </div>
    </Group>
  )
}
