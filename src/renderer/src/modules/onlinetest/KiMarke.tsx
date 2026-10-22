import { Badge } from '@mantine/core'
import { IconSparkles } from '@tabler/icons-react'
import { KI_MARKE, type KiMarkeArt } from '@shared/datenschutzInfo'

/**
 * Kennzeichnung von KI-Inhalten für Lernende (22.10.2026, Prüfung des Schulträgers, Art. 50 KI-VO): kleine Marke an
 * jeder Stelle, an der Lernende eine Rückmeldung, Einschätzung oder einen Tipp der KI sehen. Für Lehrkräfte (außer in
 * der Musterschüler-Vorschau, dort ist die Rolle „schueler") erscheint sie nicht – sie wissen, woher die Texte kommen.
 */
export function KiMarke({ art = 'rueckmeldung', mt }: { art?: KiMarkeArt; mt?: number | string }): React.JSX.Element | null {
  const rolle = typeof window !== 'undefined' ? window.__schulappsServer?.rolle : undefined
  if (rolle === 'lehrkraft' || rolle === 'admin') return null
  return (
    <Badge
      variant="light"
      color="grape"
      radius="sm"
      size="sm"
      tt="none"
      fw={600}
      mt={mt}
      leftSection={<IconSparkles size={12} aria-hidden />}
      style={{ height: 'auto', minHeight: 20, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.3, paddingBlock: 2 }}
      data-ki-marke={art}
    >
      {KI_MARKE[art]}
    </Badge>
  )
}
