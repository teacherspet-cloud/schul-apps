import { Affix, Button, Group, Paper, Text } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'
import { ansicht, ansichtBeenden } from '../shared/plattform'

/**
 * Band „Ansicht als …" (App-Freigaben, 23.10.2026): zeigt in dem Fenster, das ein Admin über „Ansicht zeigen" geöffnet
 * hat, dass hier die Sicht einer Gruppe nachgestellt ist – und dass gespeichert wird, was man tut (Admin-Konto).
 */
export default function AnsichtBand(): React.JSX.Element | null {
  const a = ansicht()
  if (!a) return null
  return (
    <Affix position={{ bottom: 16, left: '50%' }} style={{ transform: 'translateX(-50%)' }} zIndex={400}>
      <Paper shadow="md" radius="xl" px="md" py={6} withBorder maw="calc(100vw - 32px)" data-ansicht-band>
        <Group gap="sm" wrap="nowrap">
          <IconEye size={18} />
          <Text size="sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Ansicht der Gruppe <b>„{a.name}“</b> · Änderungen landen im Admin-Konto
          </Text>
          <Button size="compact-sm" variant="light" onClick={ansichtBeenden} style={{ flex: 'none' }} data-ansicht-beenden>
            Ansicht beenden
          </Button>
        </Group>
      </Paper>
    </Affix>
  )
}
