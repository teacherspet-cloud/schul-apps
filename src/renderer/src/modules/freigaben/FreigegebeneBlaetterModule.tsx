/**
 * Freigegebene Arbeitsblätter (03.10.2026, Wunsch der Lehrkraft: „Es fehlt für die Lehrer noch eine
 * App, in der freigegebene Arbeitsblätter des Nutzers angezeigt werden"). Liste aller Freigaben mit
 * Stand, je Freigabe die Lernenden; jedes ausgefüllte Blatt lässt sich ansehen – mit Stift,
 * Kästchen, Markierungen und Randkommentaren, wie die Lernenden es sehen – und als PDF sichern.
 */
import { Badge, Button, Card, Center, Container, Group, Loader, Modal, SegmentedControl, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { IconArrowLeft, IconEye, IconQrcode, IconSearch } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { Zugang } from '../onlinetest/OnlinetestModule'
import { Ausfuellen, type BlattDaten } from '../onlinetest/BlattAusfuellen'
import { notifyError } from '../../shared/util'

export interface Freigabe {
  id: string
  titel: string
  status: string
  erstellt: string
  fach: string
  zuletzt: number
  lerngruppe: string
  schueler: number
  code?: string
  link?: string
  abgaben: number
  begonnen: number
}

interface Detail {
  id: string
  titel: string
  status: string
  abgaben: { name: string; benutzer: string; eingereicht: number; aktualisiert: number; fassungen: { nr: number; zeit: string; fehler?: string }[] }[]
}

export function useFreigaben(active = true): { liste: Freigabe[] | null; laden: () => void } {
  const [liste, setListe] = useState<Freigabe[] | null>(null)
  const laden = useCallback(
    () =>
      void holen<{ blaetter: Freigabe[] }>('/server/blaetter').then(
        (d) => setListe(d.blaetter),
        () => setListe([])
      ),
    []
  )
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  return { liste, laden }
}

/** Sprungziel von außen (Startseite) */
let sprung: string | null = null
export const oeffneFreigabe = (id: string): void => {
  sprung = id
  window.dispatchEvent(new Event('freigabe-oeffnen'))
}

export default function FreigegebeneBlaetterModule({ active }: { active: boolean }): React.JSX.Element {
  const { liste, laden } = useFreigaben(active)
  const [filter, setFilter] = useState<'offen' | 'beendet' | 'alle'>('offen')
  const [suche, setSuche] = useState('')
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  useEffect(() => {
    const auf = (): void => {
      if (sprung) setGewaehlt(sprung)
      sprung = null
    }
    auf()
    window.addEventListener('freigabe-oeffnen', auf)
    return () => window.removeEventListener('freigabe-oeffnen', auf)
  }, [])
  if (gewaehlt) return <FreigabeDetail id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
  if (!liste)
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    )
  const q = suche.trim().toLowerCase()
  const sichtbar = liste.filter((f) => (filter === 'alle' || f.status === filter) && (!q || `${f.titel} ${f.lerngruppe} ${f.fach}`.toLowerCase().includes(q)))
  return (
    <Container size="lg" py="lg" data-freigaben>
      <Title order={2}>Freigegebene Arbeitsblätter</Title>
      <Text c="dimmed" size="sm" mb="md">
        Freigeben lassen sich Blätter in der App „Arbeitsblatt" (Knopf „Für Lernende freigeben"). Hier ist zu sehen, wer begonnen und eingereicht hat.
      </Text>
      <Group mb="md">
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          data={[
            { value: 'offen', label: 'Laufend' },
            { value: 'beendet', label: 'Abgeschlossen' },
            { value: 'alle', label: 'Alle' }
          ]}
        />
        <TextInput leftSection={<IconSearch size={14} />} placeholder="Titel, Lerngruppe, Fach …" value={suche} onChange={(e) => setSuche(e.currentTarget.value)} w={280} />
      </Group>
      {!sichtbar.length && <Text c="dimmed">Keine Freigaben{filter === 'offen' ? ' laufen gerade' : ''}.</Text>}
      <Stack gap="xs">
        {sichtbar.map((f) => (
          <Card key={f.id} withBorder padding="sm" radius="md" data-freigabe={f.id}>
            <Group justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Group gap={6}>
                  <Text fw={700} truncate>
                    {f.titel}
                  </Text>
                  {f.status !== 'offen' && (
                    <Badge size="xs" color="gray">
                      abgeschlossen
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {[f.lerngruppe || (f.code ? 'Gäste per QR' : ''), f.fach, new Date(f.erstellt).toLocaleDateString('de-DE')].filter(Boolean).join(' · ')}
                </Text>
              </div>
              <Group gap="xs" wrap="nowrap">
                <Badge variant="light">{f.begonnen} begonnen</Badge>
                <Badge variant="light" color="green">
                  {f.abgaben} eingereicht
                </Badge>
                <Button size="xs" onClick={() => setGewaehlt(f.id)} data-freigabe-oeffnen>
                  Öffnen
                </Button>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>
    </Container>
  )
}

function FreigabeDetail({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const [d, setD] = useState<Detail | null>(null)
  const [kurz, setKurz] = useState<Freigabe | null>(null)
  const [blatt, setBlatt] = useState<BlattDaten | null>(null)
  const [qr, setQr] = useState(false)
  const laden = useCallback(() => {
    void holen<Detail>(`/server/blaetter/${id}`).then(setD, (e: unknown) => notifyError(e))
    void holen<{ blaetter: Freigabe[] }>('/server/blaetter').then((x) => setKurz(x.blaetter.find((f) => f.id === id) ?? null))
  }, [id])
  useEffect(() => laden(), [laden])
  if (blatt)
    return (
      <Container size="xl" py="lg">
        <Ausfuellen d={blatt} lehrkraft={{ zurueck: () => setBlatt(null) }} />
      </Container>
    )
  if (!d)
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    )
  const ansehen = (benutzer: string): void =>
    void holen<BlattDaten>(`/server/blaetter/${id}/abgabe?schueler=${encodeURIComponent(benutzer)}`).then(setBlatt, (e: unknown) => notifyError(e))
  return (
    <Container size="lg" py="lg" data-freigabe-detail>
      <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} px={4} onClick={zurueck} mb="xs">
        Alle Freigaben
      </Button>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>{d.titel}</Title>
          <Text size="sm" c="dimmed">
            {kurz?.lerngruppe || 'ohne Lerngruppe'} · {d.status === 'offen' ? 'läuft' : 'abgeschlossen'}
          </Text>
        </div>
        <Group gap="xs">
          {kurz?.code && kurz.link && (
            <Button variant="light" leftSection={<IconQrcode size={16} />} onClick={() => setQr(true)}>
              QR-Code
            </Button>
          )}
          <Button
            variant="default"
            onClick={() =>
              void senden(`/server/blaetter/${id}/status`, { status: d.status === 'offen' ? 'beendet' : 'offen' }).then(laden, (e: unknown) => notifyError(e))
            }
          >
            {d.status === 'offen' ? 'Beenden' : 'Wieder öffnen'}
          </Button>
        </Group>
      </Group>
      {!d.abgaben.length ? (
        <Text c="dimmed">Noch hat niemand begonnen.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Stand</Table.Th>
              <Table.Th>Zuletzt</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {d.abgaben.map((a) => (
              <Table.Tr key={a.benutzer || a.name}>
                <Table.Td>{a.name || a.benutzer}</Table.Td>
                <Table.Td>
                  {a.eingereicht ? (
                    <Badge color="green" variant="light">
                      {a.eingereicht}× eingereicht
                    </Badge>
                  ) : (
                    <Badge variant="light">in Arbeit</Badge>
                  )}
                  {a.fassungen.at(-1)?.fehler ? (
                    <Badge color="orange" variant="light" ml={4}>
                      Feedback fehlgeschlagen
                    </Badge>
                  ) : null}
                </Table.Td>
                <Table.Td>{a.aktualisiert ? new Date(a.aktualisiert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</Table.Td>
                <Table.Td>
                  <Button size="xs" variant="light" leftSection={<IconEye size={14} />} onClick={() => ansehen(a.benutzer)} disabled={!a.benutzer} data-blatt-ansehen>
                    Blatt ansehen
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {qr && kurz?.code && kurz.link && (
        <Modal opened onClose={() => setQr(false)} title={d.titel} size="lg">
          <Zugang code={kurz.code} link={kurz.link} />
        </Modal>
      )}
    </Container>
  )
}
