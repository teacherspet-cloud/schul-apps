/**
 * „Meine Rekorde" der Lernenden (08.10.2026, Wunsch der Lehrkraft): kleines Menü neben „Einstellungen". Persönliche
 * Rekorde je Spiel des laufenden Schuljahres, frühere Schuljahre als Rekordgeschichte (z. B. „Klasse 5"), dazu je
 * Schuljahr neu gelernte und sicher gewordene Wörter. Nur die eigenen Werte – keine Rangliste (Server: rekordbuch.ts).
 */
import { Badge, Button, Card, Group, Loader, Modal, Select, SimpleGrid, Stack, Table, Text } from '@mantine/core'
import { IconTrophy } from '@tabler/icons-react'
import { useState } from 'react'
import { holen } from './serverApi'

interface Jahr {
  schuljahr: string
  klasse: number | null
  gelernt: number
  sicher: number
  rekorde: { schluessel: string; name: string; einheit: string; bereich: string; wert: number; datum: number }[]
}

const jahrName = (j: Jahr, aktuell: string): string =>
  `${j.klasse ? `Klasse ${j.klasse} · ` : ''}Schuljahr ${j.schuljahr}${j.schuljahr === aktuell ? ' (jetzt)' : ''}`

export function RekordKnopf({ gross = false }: { gross?: boolean }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [d, setD] = useState<{ aktuell: string; jahre: Jahr[] } | null>(null)
  const [wahl, setWahl] = useState<string | null>(null)
  const oeffnen = (): void => {
    setOffen(true)
    void holen<{ aktuell: string; jahre: Jahr[] }>('/s/api/rekorde').then(
      (r) => (setD(r), setWahl(r.aktuell)),
      () => setD({ aktuell: '', jahre: [] })
    )
  }
  const j = d?.jahre.find((x) => x.schuljahr === wahl) ?? d?.jahre[0]
  return (
    <>
      {gross ? (
        <Button variant="default" size="md" leftSection={<IconTrophy size={18} />} onClick={oeffnen} data-rekorde-knopf>
          Meine Rekorde
        </Button>
      ) : (
        <Button variant="subtle" size="xs" leftSection={<IconTrophy size={14} />} onClick={oeffnen} data-rekorde-knopf>
          Rekorde
        </Button>
      )}
      <Modal opened={offen} onClose={() => setOffen(false)} title="Meine Rekorde" size="lg" zIndex={400}>
        {!d ? (
          <Loader size="sm" />
        ) : (
          <Stack data-rekorde>
            {d.jahre.length > 1 && (
              <Select
                label="Schuljahr"
                data={d.jahre.map((x) => ({ value: x.schuljahr, label: jahrName(x, d.aktuell) }))}
                value={wahl}
                onChange={setWahl}
                allowDeselect={false}
                data-rekorde-jahr
              />
            )}
            {j && (
              <>
                <Text fw={700}>{jahrName(j, d.aktuell)}</Text>
                <SimpleGrid cols={2}>
                  <Card withBorder padding="sm" radius="md">
                    <Text size="xs" c="dimmed">
                      Wörter neu gelernt
                    </Text>
                    <Text fz={26} fw={800} data-rekorde-gelernt>
                      {j.gelernt}
                    </Text>
                  </Card>
                  <Card withBorder padding="sm" radius="md">
                    <Text size="xs" c="dimmed">
                      Wörter sicher
                    </Text>
                    <Text fz={26} fw={800}>
                      {j.sicher}
                    </Text>
                  </Card>
                </SimpleGrid>
                {j.rekorde.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {j.schuljahr === d.aktuell
                      ? 'Noch keine Rekorde in diesem Schuljahr – spiel nach dem Üben ein Spiel!'
                      : 'In diesem Schuljahr gab es keine Rekorde.'}
                  </Text>
                ) : (
                  <Table striped data-karten data-rekorde-tabelle>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Spiel</Table.Th>
                        <Table.Th>Rekord</Table.Th>
                        <Table.Th>am</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {j.rekorde.map((r) => (
                        <Table.Tr key={r.schluessel}>
                          <Table.Td>
                            <Group gap={6} wrap="nowrap">
                              <Badge size="xs" variant="light" color={r.bereich === 'Grammatik' ? 'grape' : 'orange'} tt="none">
                                {r.bereich}
                              </Badge>
                              <Text size="sm">{r.name}</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td fw={700}>
                            {r.wert} {r.einheit}
                          </Table.Td>
                          <Table.Td>{new Date(r.datum).toLocaleDateString('de-DE')}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
                <Text size="xs" c="dimmed">
                  Mit jedem neuen Schuljahr beginnen die Rekorde neu – die alten bleiben hier als Rekordgeschichte.
                </Text>
              </>
            )}
          </Stack>
        )}
      </Modal>
    </>
  )
}
