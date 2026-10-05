/**
 * Sich füllender Fortschrittsbalken (05.10.2026, Wunsch der Lehrkraft): „Wenn 23 von 28 Schülern die Freigabe
 * begonnen und 10 eingereicht haben, sollen 5/28 rot, 13/28 orange und 10 grün sein. Die genaue Farbe soll
 * vom eingestellten Farbschema abhängen; Texte bleiben trotz der Färbung lesbar."
 *
 * Farben: Rot/Orange/Grün des aktiven Themes (Mantine-Palette, auch im Dunkelmodus); die Zahl in jedem
 * Abschnitt bekommt die Kontrastfarbe dieses Abschnitts (Mantine `getContrastColor`). Zu schmale Abschnitte
 * zeigen keine Zahl – die Legende darunter nennt alles. Beim ersten Erscheinen füllt sich der Balken.
 */
import { getContrastColor, Group, Progress, Text, useMantineTheme } from '@mantine/core'
import { useEffect, useState } from 'react'

export interface FortschrittTeil {
  wert: number
  /** Farbname der Theme-Palette (red, orange, green …) */
  farbe: string
  /** Für die Legende: „eingereicht", „in Arbeit" … */
  wort: string
}

export function FortschrittsBalken({
  teile,
  gesamt,
  legende = true,
  hoehe = 16
}: {
  teile: FortschrittTeil[]
  gesamt: number
  legende?: boolean
  hoehe?: number
}): React.JSX.Element | null {
  const theme = useMantineTheme()
  const [gefuellt, setGefuellt] = useState(false)
  // Erst leer zeichnen, dann füllen – der Balken „läuft voll"
  useEffect(() => {
    const t = setTimeout(() => setGefuellt(true), 60)
    return () => clearTimeout(t)
  }, [])
  if (gesamt <= 0) return null
  return (
    <div data-fortschritt>
      <Progress.Root size={hoehe} radius="sm" transitionDuration={700} aria-label={teile.map((t) => `${t.wert} ${t.wort}`).join(', ')}>
        {teile
          .filter((t) => t.wert > 0)
          .map((t) => {
            const anteil = (t.wert / gesamt) * 100
            const schrift = getContrastColor({ color: t.farbe, theme, autoContrast: true })
            return (
              <Progress.Section key={t.farbe} value={gefuellt ? anteil : 0} color={t.farbe} data-teil={t.farbe} data-wert={t.wert}>
                {anteil >= 9 && hoehe >= 14 && <Progress.Label style={{ color: schrift, fontSize: 10, fontWeight: 700 }}>{t.wert}</Progress.Label>}
              </Progress.Section>
            )
          })}
      </Progress.Root>
      {legende && (
        <Group gap={8} mt={2} wrap="wrap">
          {teile.map((t) => (
            <Group key={t.farbe} gap={3} wrap="nowrap">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--mantine-color-${t.farbe}-filled)`, display: 'inline-block' }} />
              <Text size="xs" c="dimmed">
                {t.wert} {t.wort}
              </Text>
            </Group>
          ))}
        </Group>
      )}
    </div>
  )
}

/** Freigabe: nicht begonnen (rot), in Arbeit (orange), eingereicht (grün) */
export function abgabeTeile(gesamt: number, begonnen: number, eingereicht: number): FortschrittTeil[] {
  const fertig = Math.min(eingereicht, gesamt)
  const inArbeit = Math.max(0, Math.min(begonnen, gesamt) - fertig)
  return [
    { wert: fertig, farbe: 'green', wort: 'eingereicht' },
    { wert: inArbeit, farbe: 'orange', wort: 'in Arbeit' },
    { wert: Math.max(0, gesamt - fertig - inArbeit), farbe: 'red', wort: 'nicht begonnen' }
  ]
}
