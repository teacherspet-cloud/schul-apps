import { ActionIcon, Badge, Box, Button, Group, Table, Text, TextInput, Tooltip } from '@mantine/core'
import { IconBook2, IconPlus, IconTrash } from '@tabler/icons-react'
import { newId } from '../../vokabeltest/model/random'

/** Eine Zeile im Vokabel-Editor; `id` nur für die Bearbeitung in der Tabelle. */
export interface VocabRow {
  id: string
  term: string
  translation: string
  pos?: string
  note?: string
  /**
   * Beispielsatz aus dem Schulbuch (in den Verlagslisten die Spalte „Kontext“) und seine
   * Übersetzung. Sie stehen im Lehrwerk getrennt vom Hinweis und dürfen beim Bearbeiten
   * nicht verlorengehen.
   */
  example?: string
  exampleTranslation?: string
  /** Seite im Schulbuch */
  page?: string
  /** Im Schulbuch grau gedruckt – muss nicht unbedingt gelernt werden */
  grey?: boolean
  /** Stand im Buch in einem Kasten */
  inBox?: boolean
  /** Trägt eine Erklärung statt einer Übersetzung (im Buch farbig) */
  explained?: boolean
}

export const emptyRow = (): VocabRow => ({ id: newId(), term: '', translation: '' })

/** Tabelle mit Vokabeln zum Bearbeiten – für eigene Listen und für Schulbuch-Abschnitte. */
export default function VocabRows({
  rows,
  onChange,
  title,
  withExample
}: {
  rows: VocabRow[]
  onChange: (rows: VocabRow[]) => void
  title?: string
  /**
   * Schulbuch-Abschnitt: Beispielsatz und dessen Übersetzung bekommen eine eigene Spalte.
   * In eigenen Listen gibt es kein solches Feld – dort steht alles im Hinweis.
   */
  withExample?: boolean
}): React.JSX.Element {
  const update = (id: string, patch: Partial<VocabRow>): void => {
    const next = rows.map((x) => (x.id === id ? { ...x, ...patch } : x))
    // Wird in der letzten Zeile etwas eingetragen, kommt eine neue leere Zeile dazu
    const last = next[next.length - 1]
    onChange(last && (last.term.trim() || last.translation.trim()) ? [...next, emptyRow()] : next)
  }

  const filled = rows.filter((r) => r.term.trim()).length
  const greyCount = rows.filter((r) => r.grey && r.term.trim()).length
  const boxCount = rows.filter((r) => r.inBox && r.term.trim()).length

  return (
    <>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBook2 size={18} />
          <Text fw={600}>
            {title ? `${title}: ` : ''}
            {filled} {filled === 1 ? 'Vokabel' : 'Vokabeln'}
          </Text>
          {greyCount > 0 && (
            <Badge variant="light" color="gray">
              {greyCount} grau
            </Badge>
          )}
          {boxCount > 0 && (
            <Badge variant="light" color="gray">
              {boxCount} aus Kästen
            </Badge>
          )}
        </Group>
        <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => onChange([...rows, emptyRow()])}>
          Zeile hinzufügen
        </Button>
      </Group>
      <Box style={{ overflowX: 'auto' }}>
        <Table striped withTableBorder fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Wort</Table.Th>
              <Table.Th>Übersetzung</Table.Th>
              <Table.Th w={110}>Wortart</Table.Th>
              {withExample && (
                <Table.Th>
                  <Tooltip label="Beispielsatz aus dem Schulbuch, darunter seine Übersetzung" withArrow>
                    <span>Beispielsatz</span>
                  </Tooltip>
                </Table.Th>
              )}
              <Table.Th>{withExample ? 'Hinweis' : 'Beispiel/Hinweis'}</Table.Th>
              <Table.Th w={64}>
                <Tooltip label="Im Schulbuch grau gedruckt – muss nicht unbedingt gelernt werden" withArrow>
                  <span>grau</span>
                </Tooltip>
              </Table.Th>
              <Table.Th w={64}>
                <Tooltip label="Stand im Buch in einem Kasten" withArrow>
                  <span>Kasten</span>
                </Tooltip>
              </Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <TextInput variant="unstyled" aria-label="Wort" value={r.term} onChange={(e) => update(r.id, { term: e.currentTarget.value })} />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    variant="unstyled"
                    aria-label="Übersetzung"
                    value={r.translation}
                    onChange={(e) => update(r.id, { translation: e.currentTarget.value })}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput variant="unstyled" aria-label="Wortart" value={r.pos ?? ''} onChange={(e) => update(r.id, { pos: e.currentTarget.value })} />
                </Table.Td>
                {withExample && (
                  <Table.Td>
                    <TextInput
                      variant="unstyled"
                      aria-label="Beispielsatz"
                      value={r.example ?? ''}
                      onChange={(e) => update(r.id, { example: e.currentTarget.value })}
                    />
                    <TextInput
                      variant="unstyled"
                      size="xs"
                      styles={{ input: { color: 'var(--mantine-color-dimmed)' } }}
                      placeholder="Übersetzung des Beispielsatzes"
                      aria-label="Übersetzung des Beispielsatzes"
                      value={r.exampleTranslation ?? ''}
                      onChange={(e) => update(r.id, { exampleTranslation: e.currentTarget.value })}
                    />
                  </Table.Td>
                )}
                <Table.Td>
                  <TextInput
                    variant="unstyled"
                    aria-label={withExample ? 'Hinweis' : 'Beispiel oder Hinweis'}
                    value={r.note ?? ''}
                    onChange={(e) => update(r.id, { note: e.currentTarget.value })}
                  />
                </Table.Td>
                <Table.Td>
                  <input
                    type="checkbox"
                    aria-label={`${r.term} grau markieren`}
                    checked={Boolean(r.grey)}
                    onChange={(e) => update(r.id, { grey: e.currentTarget.checked })}
                  />
                </Table.Td>
                <Table.Td>
                  <input
                    type="checkbox"
                    aria-label={`${r.term} als Kasten-Vokabel markieren`}
                    checked={Boolean(r.inBox)}
                    onChange={(e) => update(r.id, { inBox: e.currentTarget.checked })}
                  />
                </Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" color="red" aria-label="Zeile entfernen" onClick={() => onChange(rows.filter((x) => x.id !== r.id))}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </>
  )
}
