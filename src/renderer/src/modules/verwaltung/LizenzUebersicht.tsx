/**
 * Verwaltung › Info › Lizenzen (22.10.2026, Prüfung des Schulträgers, Punkt 12): mitgelieferte Fremddaten (OpenMoji,
 * Schulverzeichnis, Medienbank) und die eingebundenen npm-Pakete mit Lizenz. Die Liste erzeugt
 * scripts/lizenzen-erzeugen.mjs beim Bauen aus node_modules (src/shared/lizenzListe.json).
 */
import { Anchor, Badge, Card, Group, Stack, Switch, Table, Text, Title } from '@mantine/core'
import { useState } from 'react'
import liste from '@shared/lizenzListe.json'

interface Paket {
  name: string
  version: string
  lizenz: string
  autor: string
  adresse: string
  entwicklung?: boolean
}
interface Daten {
  name: string
  lizenz: string
  autor: string
  adresse: string
  hinweis?: string
}

const L = liste as { erzeugt: string; pakete: Paket[]; daten: Daten[] }

export function LizenzUebersicht(): React.JSX.Element {
  const [alle, setAlle] = useState(false)
  const pakete = L.pakete.filter((p) => alle || !p.entwicklung)
  return (
    <Stack maw={900} data-lizenzuebersicht>
      <Title order={4}>Lizenzen</Title>
      <Text size="sm" c="dimmed">
        Schul-Apps nutzt freie Software und frei lizenzierte Daten. Hier stehen die Rechteinhaber und Lizenzen der mitgelieferten Bestandteile (Stand{' '}
        {new Date(L.erzeugt).toLocaleDateString('de-DE')}). Das Programmgerüst Electron enthält zusätzlich Chromium mit eigener Lizenzdatei
        (LICENSES.chromium.html im Programmordner).
      </Text>
      <Card withBorder radius="md">
        <Text fw={600} mb="xs">
          Daten und Bilder
        </Text>
        <Stack gap="sm">
          {L.daten.map((d) => (
            <div key={d.name} data-lizenz-daten={d.name}>
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <Text size="sm" fw={600} style={{ flex: 1 }}>
                  {d.adresse ? (
                    <Anchor href={d.adresse} target="_blank" rel="noreferrer" inherit>
                      {d.name}
                    </Anchor>
                  ) : (
                    d.name
                  )}
                </Text>
              </Group>
              <Text size="xs">{d.lizenz}</Text>
              {d.autor && <Text size="xs" c="dimmed">{d.autor}</Text>}
              {d.hinweis && <Text size="xs" c="dimmed">{d.hinweis}</Text>}
            </div>
          ))}
        </Stack>
      </Card>
      <Card withBorder radius="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Software-Pakete ({pakete.length})</Text>
          <Switch size="xs" label="Auch Werkzeuge zum Bauen" checked={alle} onChange={(e) => setAlle(e.currentTarget.checked)} />
        </Group>
        <Table striped withRowBorders={false} fz="xs" verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Paket</Table.Th>
              <Table.Th>Version</Table.Th>
              <Table.Th>Lizenz</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pakete.map((p) => (
              <Table.Tr key={p.name} data-lizenz-paket={p.name}>
                <Table.Td>
                  {p.adresse ? (
                    <Anchor href={p.adresse} target="_blank" rel="noreferrer" inherit>
                      {p.name}
                    </Anchor>
                  ) : (
                    p.name
                  )}
                  {p.entwicklung && (
                    <Badge size="xs" variant="light" color="gray" ml={6}>
                      nur zum Bauen
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{p.version}</Table.Td>
                <Table.Td>{p.lizenz}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  )
}
