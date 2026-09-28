import { Card, Select, Stack, Table, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'

/**
 * Verbrauch der KI-Dienste je Monat (27.09.2026, Großprogramm 0.4). Eine Zählung, keine
 * Kostenrechnung: Preise hängen am Vertrag. Token meldet nur der API-Weg; beim Abo-Weg über
 * die Kommandozeilenprogramme zählt die App nur die Anfragen.
 */
type Zaehler = { anfragen: number; wiederholungen: number; eingabe: number; ausgabe: number; bilder: number; ttsZeichen: number }
const zahl = (n: number): string => (n ? n.toLocaleString('de-DE') : '–')

export default function VerbrauchCard(): React.JSX.Element {
  const [daten, setDaten] = useState<Record<string, Record<string, Zaehler>>>({})
  const monate = Object.keys(daten).sort().reverse()
  const [monat, setMonat] = useState<string | null>(null)
  useEffect(() => {
    window.api.verbrauch
      .get()
      .then(setDaten)
      .catch(() => setDaten({}))
  }, [])
  const gewaehlt = monat ?? monate[0] ?? null
  const zeilen = gewaehlt ? Object.entries(daten[gewaehlt] ?? {}) : []
  return (
    <Card withBorder>
      <Stack gap="sm">
        <Title order={4}>Verbrauch</Title>
        <Text size="sm" c="dimmed">
          Wie viel die App bei den KI-Diensten angefragt hat – eine Zählung, keine Kostenrechnung. Token melden nur Zugänge mit API-Schlüssel; „Wiederholungen"
          sind Anfragen, die die App wegen einer unbrauchbaren Antwort einmal neu gestellt hat.
        </Text>
        {monate.length > 0 && <Select w={180} label="Monat" data={monate} value={gewaehlt} onChange={setMonat} allowDeselect={false} />}
        {zeilen.length ? (
          <Table striped withTableBorder fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Dienst · Modell</Table.Th>
                <Table.Th>Anfragen</Table.Th>
                <Table.Th>davon Wiederholungen</Table.Th>
                <Table.Th>Token ein</Table.Th>
                <Table.Th>Token aus</Table.Th>
                <Table.Th>Bilder</Table.Th>
                <Table.Th>Zeichen vertont</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {zeilen.map(([k, z]) => (
                <Table.Tr key={k}>
                  <Table.Td>{k}</Table.Td>
                  <Table.Td>{zahl(z.anfragen)}</Table.Td>
                  <Table.Td>{zahl(z.wiederholungen)}</Table.Td>
                  <Table.Td>{zahl(z.eingabe)}</Table.Td>
                  <Table.Td>{zahl(z.ausgabe)}</Table.Td>
                  <Table.Td>{zahl(z.bilder)}</Table.Td>
                  <Table.Td>{zahl(z.ttsZeichen)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            Noch nichts gezählt.
          </Text>
        )}
      </Stack>
    </Card>
  )
}
