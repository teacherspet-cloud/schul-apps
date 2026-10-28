/**
 * Dreiteiliger Vokabelbalken (28.10.2026, abgestimmt mit der Lehrkraft): sicher (grün) · im Aufbau (hellgrün) · neu
 * (grau). Vorher stand nur „% sicher" da – „sicher" braucht zwei richtige Antworten im Abstand einer Woche, in den ersten
 * Wochen also überall 0 %. Genutzt in „Meine Klassen" (je Kind, Klassenkarte) und auf der Startseite (je Kurs).
 */
import { Group, Progress, Text, Tooltip } from '@mantine/core'

export interface VokabelAnteile {
  sicher: number
  aufbau: number
  neu: number
}

/** Begonnen = sicher + im Aufbau (Anteil 0–1) */
export const begonnenAnteil = (a: VokabelAnteile): number => {
  const g = a.sicher + a.aufbau + a.neu
  return g ? (a.sicher + a.aufbau) / g : 0
}

const zahl = (x: number): string => (Number.isInteger(x) ? String(x) : x.toLocaleString('de-DE', { maximumFractionDigits: 1 }))

/** Tooltip-Text: „4 sicher · 28 im Aufbau · 28 neu" (bei Schnitten mit „im Schnitt") */
export const anteileText = (a: VokabelAnteile, schnitt = false): string =>
  `${schnitt ? 'im Schnitt ' : ''}${zahl(a.sicher)} sicher · ${zahl(a.aufbau)} im Aufbau · ${zahl(a.neu)} neu`

export function VokabelBalken({
  a,
  rechts,
  breite = 90,
  schnitt = false,
  titel
}: {
  a: VokabelAnteile
  /** Text rechts neben dem Balken (Vorgabe: „32/60 begonnen") */
  rechts?: React.ReactNode
  breite?: number | string
  schnitt?: boolean
  /** Zusatz im Tooltip (z. B. „Vokabeln") */
  titel?: string
}): React.JSX.Element {
  const g = a.sicher + a.aufbau + a.neu
  const p = (x: number): number => (g ? (x / g) * 100 : 0)
  const begonnen = a.sicher + a.aufbau
  return (
    <Tooltip
      label={`${titel ? `${titel}: ` : ''}${anteileText(a, schnitt)} – „sicher“: zweimal richtig im Abstand von mindestens einer Woche`}
      multiline
      w={300}
      withinPortal
    >
      <Group gap={6} wrap="nowrap" data-vokabel-balken={Math.round(begonnenAnteil(a) * 100)}>
        <Progress.Root w={breite} size={8} radius="xl" style={{ flex: typeof breite === 'string' ? 1 : 'none' }} aria-label={anteileText(a, schnitt)}>
          <Progress.Section value={p(a.sicher)} color="teal.7" />
          <Progress.Section value={p(a.aufbau)} color="teal.3" />
          <Progress.Section value={p(a.neu)} color="var(--mantine-color-default-border)" />
        </Progress.Root>
        {rechts ?? (
          <Text size="xs" c={begonnen ? undefined : 'dimmed'} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {begonnen ? `${zahl(begonnen)}/${zahl(g)} begonnen` : 'noch nicht geübt'}
          </Text>
        )}
      </Group>
    </Tooltip>
  )
}
