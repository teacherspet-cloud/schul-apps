import { Alert, Text } from '@mantine/core'
import { IconHeartHandshake } from '@tabler/icons-react'
import { HILFETEXT } from '@shared/krise'

/**
 * Fester Hilfetext für Lernende (22.10.2026, KI-Sicherheitsprüfung, krise.ts): erscheint, wenn eine Äußerung auf
 * Selbstgefährdung hindeutet. Freundlich, ohne Vorwurf, nie eine Sperre; `text` nur, wenn der Server einen eigenen schickt.
 */
export function KrisenHilfe({ text = HILFETEXT }: { text?: string }): React.JSX.Element {
  return (
    <Alert color="blue" variant="light" icon={<IconHeartHandshake size={18} />} title="Du bist nicht allein" data-krisen-hilfe>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {text}
      </Text>
    </Alert>
  )
}
