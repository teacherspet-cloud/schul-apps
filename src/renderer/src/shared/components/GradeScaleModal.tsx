import { Alert, Button, Group, Modal, Stack, Table, Text } from '@mantine/core'
import ZahlFeld from './ZahlFeld'
import { useEffect, useState } from 'react'
import { DEFAULT_THRESHOLDS, gradeBoundaries, GRADE_LABELS, normalizeThresholds } from '../gradeScale'

/**
 * Notenschlüssel bearbeiten.
 *
 * Gezeigt wird beides nebeneinander: die Prozentschwelle, die eingestellt wird, und die
 * Punktzahl, die sich daraus für DIESE Arbeit ergibt. Ohne die zweite Spalte müsste die
 * Lehrkraft im Kopf rechnen, und genau da entstehen die Fehler.
 *
 * Die Schwellen werden beim Schließen geordnet: Eine bessere Note kann nie eine niedrigere
 * Schwelle haben als eine schlechtere, und die Sechs beginnt immer bei null.
 */
export default function GradeScaleModal({
  opened,
  onClose,
  points,
  thresholds,
  onChange
}: {
  opened: boolean
  onClose: () => void
  /** Punktzahl der Arbeit – nur für die Vorschau */
  points: number
  thresholds?: number[]
  onChange: (thresholds: number[]) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<number[]>(normalizeThresholds(thresholds))

  useEffect(() => {
    if (opened) setDraft(normalizeThresholds(thresholds))
  }, [opened, thresholds])

  const preview = gradeBoundaries(points, normalizeThresholds(draft))
  const isDefault = normalizeThresholds(draft).every((v, i) => v === DEFAULT_THRESHOLDS[i])

  const save = (): void => {
    onChange(normalizeThresholds(draft))
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Notenschlüssel" size="md">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Die Schwellen gelten in Prozent der Gesamtpunktzahl – derselbe Schlüssel passt damit auf jede Arbeit. Gerundet wird ab ,5 aufwärts.
        </Text>

        <Table fz="sm" withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Note</Table.Th>
              <Table.Th w={130}>ab Prozent</Table.Th>
              <Table.Th w={120}>ab Punkten</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {draft.map((value, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  {i + 1} ({GRADE_LABELS[i]})
                </Table.Td>
                <Table.Td>
                  {i === 5 ? (
                    <Text size="sm" c="dimmed">
                      0 % (fest)
                    </Text>
                  ) : (
                    <ZahlFeld
                      size="xs"
                      min={0}
                      max={100}
                      suffix=" %"
                      value={value}
                      onChange={(v) => setDraft(draft.map((d, k) => (k === i ? Number(v) || 0 : d)))}
                    />
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{preview[i]?.fromPoints ?? 0}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        {points <= 0 && (
          <Alert color="gray" p="xs">
            <Text size="xs">Die Punktzahl der Arbeit steht noch nicht fest – die Spalte „ab Punkten" füllt sich, sobald sie gesetzt ist.</Text>
          </Alert>
        )}

        <Group justify="space-between">
          <Button size="compact-sm" variant="subtle" disabled={isDefault} onClick={() => setDraft([...DEFAULT_THRESHOLDS])}>
            Auf die Voreinstellung zurücksetzen
          </Button>
          <Group gap="xs">
            <Button size="compact-sm" variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button size="compact-sm" onClick={save}>
              Übernehmen
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
