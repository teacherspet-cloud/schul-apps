import { ActionIcon, Button, Group, Popover, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useState } from 'react'

/**
 * Warnhinweise zu einem Baustein als anklickbares Symbol.
 *
 * Auf dem Blatt selbst darf nichts davon stehen: Ein Kasten im Textfluss verschiebt die
 * Seitenaufteilung, und beim Drucken bliebe an seiner Stelle eine Lücke. Das Symbol
 * schwebt deshalb neben dem Baustein und öffnet die Hinweise erst auf Klick.
 */
export default function WarningButton({ warnings, onDismiss }: { warnings: string[]; onDismiss?: () => void }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!warnings.length) return null
  return (
    <Popover opened={open} onChange={setOpen} position="left-start" withArrow shadow="md" width={320}>
      <Popover.Target>
        <ActionIcon
          size="sm"
          variant="light"
          color="orange"
          aria-label={`${warnings.length} Hinweis${warnings.length === 1 ? '' : 'e'} anzeigen`}
          onClick={() => setOpen((v) => !v)}
        >
          <IconAlertTriangle size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text size="xs" fw={600}>
            {warnings.length === 1 ? 'Hinweis' : `${warnings.length} Hinweise`} zu diesem Baustein
          </Text>
          {warnings.map((w, i) => (
            <Text key={i} size="xs">
              {w}
            </Text>
          ))}
          <Group justify="flex-end" gap="xs">
            <Button size="compact-xs" variant="subtle" onClick={() => setOpen(false)}>
              Schließen
            </Button>
            {onDismiss && (
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => {
                  onDismiss()
                  setOpen(false)
                }}
              >
                Erledigt
              </Button>
            )}
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
