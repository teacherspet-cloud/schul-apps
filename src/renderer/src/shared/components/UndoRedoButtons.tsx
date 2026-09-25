import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconArrowBackUp, IconArrowForwardUp } from '@tabler/icons-react'

/**
 * Rückgängig und Wiederholen als Knöpfe – überall gleich beschriftet.
 *
 * Die Tastenkürzel allein findet nicht jeder; und ohne `aria-label` hießen die beiden
 * Symbole für einen Bildschirmleser nur „Schaltfläche".
 */
export default function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  size = 'md'
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  size?: 'sm' | 'md'
}): React.JSX.Element {
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label="Rückgängig (Strg+Z)">
        <ActionIcon variant="default" size={size} aria-label="Rückgängig" onClick={onUndo} disabled={!canUndo}>
          <IconArrowBackUp size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Wiederholen (Strg+Y)">
        <ActionIcon variant="default" size={size} aria-label="Wiederholen" onClick={onRedo} disabled={!canRedo}>
          <IconArrowForwardUp size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
