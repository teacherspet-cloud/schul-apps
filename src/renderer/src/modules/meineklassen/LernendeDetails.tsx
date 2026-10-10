/**
 * Details einer lernenden Person in „Meine Klassen" (10.10.2026, Ziel der Suche): Lernstand in ihrer Klasse bzw. ihrem
 * Kurs – Vokabeln, Grammatik, Tests, Reihen und Blätter, Medaillen und Titel sowie der Handlungsbedarf, der sie nennt.
 * Ist sie in mehreren Kursen der Lehrkraft, wählt man vorher den Kurs (`KursWahl`). Daten wie im Reiter „Lernende"
 * (GET /server/klassen/<Lerngruppe>) – nichts darüber hinaus.
 */
import { Badge, Button, Center, Group, Loader, Modal, Progress, Stack, Table, Text } from '@mantine/core'
import { IconAlertTriangle, IconArrowRight } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen } from '../onlinetest/serverApi'
import { notifyError } from '../../shared/util'
import { LernendeAuszeichnung, type AuszeichnungLehrkraft } from './LernendeAuszeichnung'
import { ampel } from './MaterialListe'

interface Zeile {
  id: string
  name: string
  vokabelnSicher: number | null
  grammatikSicher?: number | null
  zuletztGeuebt: string | null
  testSchnitt: number | null
  tests: number
  reihenFortschritt: number | null
  blaetterEingereicht: number
  auszeichnung?: AuszeichnungLehrkraft
}
interface Detail {
  id: string
  name: string
  fach: string
  titel: string
  lernende: Zeile[]
  bedarf: { text: string; ids?: string[]; schluessel: string }[]
}

const prozent = (x: number | null | undefined): string => (x == null ? '–' : `${Math.round(x * 100)} %`)
const tag = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'noch nie')

function Anteil({ x }: { x: number | null | undefined }): React.JSX.Element {
  if (x == null) return <Text size="sm">–</Text>
  return (
    <Group gap={6} wrap="nowrap">
      <Progress value={x * 100} w={80} size="sm" color={ampel(x)} />
      <Text size="sm">{prozent(x)}</Text>
    </Group>
  )
}

export function LernendeDetails({
  gruppeId,
  personId,
  name,
  schliessen,
  zurKlasse
}: {
  gruppeId: string
  personId: string
  name: string
  schliessen: () => void
  /** „In der Klasse zeigen": Klasse mit dem Reiter „Lernende" öffnen */
  zurKlasse: (gruppeId: string) => void
}): React.JSX.Element {
  const [d, setD] = useState<Detail | null>(null)
  useEffect(() => {
    let aus = false
    void holen<Detail>(`/server/klassen/${encodeURIComponent(gruppeId)}`).then(
      (x) => !aus && setD(x),
      (e: unknown) => (notifyError(e), schliessen())
    )
    return () => {
      aus = true
    }
  }, [gruppeId]) // eslint-disable-line react-hooks/exhaustive-deps
  const l = d?.lernende.find((x) => x.id === personId)
  const bedarf = (d?.bedarf ?? []).filter((b) => b.ids?.includes(personId))
  const klein = typeof window !== 'undefined' && window.innerWidth < 700
  return (
    <Modal opened onClose={schliessen} title={d ? `${name} · ${d.titel}` : name} size="lg" fullScreen={klein} data-lernende-details={name}>
      {!d ? (
        <Center h={160}>
          <Loader />
        </Center>
      ) : !l ? (
        <Text c="dimmed">Diese Person steht nicht (mehr) in {d.titel}.</Text>
      ) : (
        <Stack gap="sm">
          {bedarf.length > 0 && (
            <Stack gap={4} data-lernende-details-bedarf>
              {bedarf.map((b) => (
                <Group key={b.schluessel} gap={6} wrap="nowrap" align="flex-start">
                  <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Text size="sm">{b.text}</Text>
                </Group>
              ))}
            </Stack>
          )}
          <Table withRowBorders={false} verticalSpacing={4} data-lernende-details-stand>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td fw={600}>Vokabeln sicher</Table.Td>
                <Table.Td>
                  <Anteil x={l.vokabelnSicher} />
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={600}>Zuletzt geübt</Table.Td>
                <Table.Td>{tag(l.zuletztGeuebt)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={600}>Grammatik sicher</Table.Td>
                <Table.Td>
                  <Anteil x={l.grammatikSicher} />
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={600}>Tests</Table.Td>
                <Table.Td>{l.tests ? `${l.tests} · Schnitt ${l.testSchnitt == null ? '–' : l.testSchnitt.toFixed(1).replace('.', ',')}` : 'noch keine'}</Table.Td>
              </Table.Tr>
              {l.reihenFortschritt !== null && (
                <Table.Tr>
                  <Table.Td fw={600}>Unterrichtsreihen</Table.Td>
                  <Table.Td>
                    <Anteil x={l.reihenFortschritt} />
                  </Table.Td>
                </Table.Tr>
              )}
              <Table.Tr>
                <Table.Td fw={600}>Blätter eingereicht</Table.Td>
                <Table.Td>{l.blaetterEingereicht}</Table.Td>
              </Table.Tr>
              {l.auszeichnung && (
                <Table.Tr>
                  <Table.Td fw={600}>Medaillen & Titel</Table.Td>
                  <Table.Td>
                    <LernendeAuszeichnung a={l.auszeichnung} />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
          <Group justify="flex-end">
            <Button variant="light" rightSection={<IconArrowRight size={14} />} onClick={() => zurKlasse(gruppeId)} data-lernende-details-klasse>
              In {d.titel} zeigen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

/** Kurswahl, wenn die Person in mehreren Kursen der Lehrkraft ist */
export function KursWahl({
  name,
  gruppen,
  waehlen,
  schliessen
}: {
  name: string
  gruppen: { id: string; name: string; fach: string }[]
  waehlen: (gruppeId: string) => void
  schliessen: () => void
}): React.JSX.Element {
  return (
    <Modal opened onClose={schliessen} title={`${name} – welcher Kurs?`} size="sm" data-kurs-wahl>
      <Stack gap="xs">
        {gruppen.map((g) => (
          <Button key={g.id} variant="default" justify="space-between" rightSection={<IconArrowRight size={14} />} onClick={() => waehlen(g.id)} data-kurs-wahl-gruppe={g.id}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={600}>
                {g.name}
              </Text>
              {g.fach && (
                <Badge size="sm" variant="light" tt="none">
                  {g.fach}
                </Badge>
              )}
            </Group>
          </Button>
        ))}
      </Stack>
    </Modal>
  )
}
