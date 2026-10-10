/**
 * Verwaltung › Schule: Schulkalender (10.10.2026, src/server/schulkalender.ts) – Quelle, letzter Abruf, Land, Beginn und
 * Ende der Schuljahre und die Liste der Ferien und Feiertage (nur lesen). Dazu der Stand des automatischen
 * Schuljahreswechsels (src/server/schuljahrWechsel.ts). Schuleigene bewegliche Ferientage gibt es bewusst nicht.
 */
import { Alert, Badge, Button, Card, Group, Loader, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { schuljahrGrenzen, schuljahrText, schuljahrVon, tagText, type SchulkalenderDaten } from '@shared/schulkalender'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError } from '../../shared/util'
import { ladeSchulkalender } from '../../shared/schulkalenderLaden'

interface Antwort {
  daten: SchulkalenderDaten | null
  land?: string | null
  heute?: string
  stand?: { versuch: string; ok: boolean; fehler: string } | null
  wechsel?: { schuljahr: number; zeit: number; eingerichtet?: boolean; zahlen?: { umbenannt: number; abschluss: number; wartet: number; klassenliste: number } } | null
}

const QUELLE: Record<SchulkalenderDaten['quelle'], string> = {
  openholidays: 'OpenHolidays API (openholidaysapi.org)',
  'ferien-api': 'ferien-api.de (Ferien) und eigene Rechnung (Feiertage)',
  datei: 'Datei (Testbetrieb)'
}

const zeit = (iso: string | number): string => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
const spanne = (von: string, bis: string): string => (von === bis ? tagText(von) : `${tagText(von, false)}–${tagText(bis)}`)

export function SchulkalenderKarte(): React.JSX.Element {
  const [a, setA] = useState<Antwort | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<Antwort>('/server/schulkalender').then(setA, (e: unknown) => (notifyError(e), setA({ daten: null })))
  }, [])
  const aktualisieren = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<Antwort>('/server/schulkalender/aktualisieren', {}, 60_000)
      setA((x) => ({ ...(x ?? { daten: null }), ...r }))
      void ladeSchulkalender(true)
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  if (!a) return <Loader size="sm" />
  const d = a.daten
  const jetzt = schuljahrVon(a.heute ?? Date.now(), d)
  const jahre = [jetzt, jetzt + 1].map((j) => ({ j, ...schuljahrGrenzen(j, d) }))
  // Liste ab den Sommerferien vor dem laufenden Schuljahr (ältere Einträge interessieren nicht mehr)
  const ab = `${jetzt}-06-01`
  const ferien = (d?.ferien ?? []).filter((f) => f.bis >= ab)
  const feiertage = (d?.feiertage ?? []).filter((f) => f.bis >= ab)
  return (
    <Card withBorder padding="lg" data-schulkalender>
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Title order={5}>Schulkalender</Title>
        <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} loading={laeuft} onClick={() => void aktualisieren()} data-kalender-aktualisieren>
          Jetzt abrufen
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Ferien und Feiertage des Bundeslands holt der Server selbst (wöchentlich). Sie bestimmen das Schuljahr (erster Schultag nach den Sommerferien),
        lassen Übungsserien in den Ferien pausieren, rücken Vorschläge für Termine aus den Ferien und geben Stunden einer Reihe ihr Datum. Am ersten
        Schultag rücken die Klassen automatisch auf; jede Lehrkraft kann das 14 Tage lang zurücknehmen.
      </Text>
      {!d ? (
        <Alert color="yellow" variant="light" data-kalender-leer>
          Noch keine Daten{a.land ? ` für ${a.land}` : ' – zuerst oben das Bundesland der Schule eintragen'}. Bis dahin gilt: Schuljahr ab 1. August, frei
          ist nur das Wochenende.
        </Alert>
      ) : (
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <Text size="sm">
              <b>Land:</b> {d.land}
            </Text>
            <Text size="sm" data-kalender-quelle={d.quelle}>
              <b>Quelle:</b> {QUELLE[d.quelle] ?? d.quelle}
            </Text>
            <Text size="sm">
              <b>Abgerufen:</b> {zeit(d.abgerufen)}
            </Text>
            {a.stand && !a.stand.ok && (
              <Text size="sm" c="orange" data-kalender-fehler>
                Letzter Versuch {zeit(a.stand.versuch)} fehlgeschlagen – die bisherigen Daten gelten weiter.
              </Text>
            )}
          </SimpleGrid>
          <Group gap="xs" data-kalender-schuljahre>
            {jahre.map((x) => (
              <Badge key={x.j} variant="light" color={x.j === jetzt ? 'teal' : 'gray'} tt="none" size="lg">
                {schuljahrText(x.j)}: {x.erster ? tagText(x.erster) : '?'} – {x.letzter ? tagText(x.letzter) : '?'}
              </Badge>
            ))}
          </Group>
          {a.wechsel && (
            <Text size="sm" data-kalender-wechsel={a.wechsel.schuljahr}>
              <b>Schuljahreswechsel:</b>{' '}
              {a.wechsel.eingerichtet
                ? `${schuljahrText(a.wechsel.schuljahr)} gilt als laufend – der nächste Wechsel kommt am ersten Schultag des nächsten Schuljahres.`
                : `${schuljahrText(a.wechsel.schuljahr)} am ${zeit(a.wechsel.zeit)}${
                    a.wechsel.zahlen
                      ? ` – ${a.wechsel.zahlen.umbenannt} Lerngruppen aufgerückt, ${a.wechsel.zahlen.abschluss} Abschlussgruppen beendet, ${a.wechsel.zahlen.wartet} IServ-Gruppen nach IServ`
                      : ''
                  }.`}
            </Text>
          )}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Table striped withTableBorder fz="xs" data-kalender-ferien>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ferien</Table.Th>
                  <Table.Th>Zeitraum</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {ferien.map((f) => (
                  <Table.Tr key={`${f.von}-${f.name}`}>
                    <Table.Td>{f.name}</Table.Td>
                    <Table.Td>{spanne(f.von, f.bis)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Table striped withTableBorder fz="xs" data-kalender-feiertage>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Feiertag</Table.Th>
                  <Table.Th>Datum</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {feiertage.map((f) => (
                  <Table.Tr key={`${f.von}-${f.name}`}>
                    <Table.Td>{f.name}</Table.Td>
                    <Table.Td>{spanne(f.von, f.bis)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </SimpleGrid>
        </Stack>
      )}
    </Card>
  )
}
