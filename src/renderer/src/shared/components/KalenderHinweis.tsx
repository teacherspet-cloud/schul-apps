/**
 * Hinweis an Datumsfeldern (10.10.2026, Schulkalender): Liegt das gewählte Datum in den Ferien oder auf einem Feiertag
 * des Landes, steht darunter ein Hinweis – mit Knopf zum Verschieben auf den ersten Schultag danach (Beginn, Termin)
 * bzw. den letzten davor (Ende, Frist). Hindert nichts; ohne Kalenderdaten (PC, iPad) erscheint nichts.
 */
import { Button, Group, Text } from '@mantine/core'
import { IconBeach } from '@tabler/icons-react'
import { kalenderHinweis, schultagVorschlag, tagText } from '@shared/schulkalender'
import { useSchulkalender } from '../schulkalenderLaden'

export default function KalenderHinweis({
  wert,
  richtung = 'nach',
  verschieben
}: {
  /** Wert des Datumsfelds (JJJJ-MM-TT oder datetime-local) */
  wert: string | null | undefined
  /** 'nach' = Beginn/Termin → erster Schultag danach; 'vor' = Ende/Frist → letzter Schultag davor */
  richtung?: 'nach' | 'vor'
  /** Fehlt = nur der Hinweis, ohne Knopf */
  verschieben?: (tag: string) => void
}): React.JSX.Element | null {
  const k = useSchulkalender()
  const tag = (wert ?? '').slice(0, 10)
  if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(tag)) return null
  const h = kalenderHinweis(tag, k)
  if (!h) return null
  const ziel = schultagVorschlag(tag, richtung, k)
  return (
    <Group gap={6} wrap="wrap" mt={4} data-kalender-hinweis={h.art}>
      <IconBeach size={14} color="var(--mantine-color-orange-6)" />
      <Text size="xs" c="orange.8" style={{ flex: 1, minWidth: 180 }}>
        {h.text}
      </Text>
      {verschieben && ziel !== tag && (
        <Button size="compact-xs" variant="light" color="orange" onClick={() => verschieben(ziel)} data-kalender-verschieben={ziel}>
          Auf {tagText(ziel)} legen ({richtung === 'nach' ? 'erster Schultag danach' : 'letzter Schultag davor'})
        </Button>
      )}
    </Group>
  )
}
