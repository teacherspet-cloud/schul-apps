/**
 * Bildnachweis für Lernende (22.10.2026, Prüfung des Schulträgers, Punkt 12): kleine Zeile unter einem Bild –
 * „KI-generiert“ bzw. Urheber und Lizenz bei Bildern aus Wikimedia/Openverse/Pixabay. Regeln: shared/bildLizenz.ts.
 */
import { Text } from '@mantine/core'
import { lernendenNachweis, type BildHerkunft } from '@shared/bildLizenz'

export function BildNachweis({ bild, text, mt = 2 }: { bild?: BildHerkunft | null; text?: string | null; mt?: number }): React.JSX.Element | null {
  const zeile = text ?? (bild ? lernendenNachweis(bild) : null)
  if (!zeile) return null
  return (
    <Text
      size="10px"
      c="dimmed"
      ta="center"
      mt={mt}
      lineClamp={2}
      title={zeile}
      style={{ maxWidth: 260, overflowWrap: 'anywhere' }}
      data-bild-nachweis={zeile === 'KI-generiert' ? 'ki' : 'fremd'}
    >
      {zeile}
    </Text>
  )
}
