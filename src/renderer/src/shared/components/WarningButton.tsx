import { ActionIcon, Button, Group, Popover, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useState } from 'react'
import { istBehebbar, ohnePraefix } from '../kiBeheben'
import { AlleBehebenKnopf, KiBehebenKnopf } from './KiBeheben'

/**
 * Warnhinweise zu einem Baustein als anklickbares Symbol.
 *
 * Auf dem Blatt selbst darf nichts davon stehen: Ein Kasten im Textfluss verschiebt die
 * Seitenaufteilung, und beim Drucken bliebe an seiner Stelle eine Lücke. Das Symbol
 * schwebt deshalb neben dem Baustein und öffnet die Hinweise erst auf Klick.
 */
export default function WarningButton({
  warnings,
  onDismiss,
  onBeheben,
  laeuft
}: {
  warnings: string[]
  onDismiss?: () => void
  /**
   * „Mit KI beheben" (Paket 12): startet einen Hintergrund-Auftrag für die genannten Hinweise.
   * Nur behebbare Hinweise bekommen einen Knopf; reine Informationen bleiben ohne.
   */
  onBeheben?: (hinweise: string[]) => void
  /** Ein Auftrag arbeitet gerade an diesem Baustein */
  laeuft?: boolean
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!warnings.length) return null
  const behebbar = onBeheben ? warnings.filter(istBehebbar) : []
  const beheben = (liste: string[]): void => {
    onBeheben?.(liste)
    setOpen(false)
  }
  return (
    <Popover opened={open} onChange={setOpen} position="left-start" withArrow shadow="md" width={340}>
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
            <Stack key={i} gap={2} align="flex-start" data-hinweis>
              <Text size="xs">{onBeheben ? ohnePraefix(w) : w}</Text>
              {behebbar.includes(w) && <KiBehebenKnopf laeuft={laeuft} onClick={() => beheben([w])} />}
            </Stack>
          ))}
          <Group justify="flex-end" gap="xs">
            <AlleBehebenKnopf anzahl={behebbar.length} laeuft={laeuft} onClick={() => beheben(behebbar)} />
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
