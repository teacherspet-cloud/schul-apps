/**
 * Vokabeltraining für Lehrkräfte (03.10.2026, Reiter in der App „Onlinetest"; Server: src/server/vokabeln.ts).
 *
 * Vokabeln (Lehrwerk-Abschnitt oder eigene Liste) einer Lerngruppe oder Einzelnen zum Lernen
 * freigeben, optional mit Testtermin. Lernstand je Lerngruppe und Kind – abgestimmt OHNE Ranglisten:
 * Verteilung auf die Fächer des Karteikastens, Erkennen vs. selbst schreiben, Aktivität der letzten
 * 7 Tage, Problemwörter mit typischen Falschantworten, Prognose zum Testtermin.
 */
import { useAlleLernenden } from './LernendeWahl'
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { IconArrowLeft, IconBooks, IconPlus } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { Uebersicht } from '@shared/vokabeltrainer'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { mitBildern, VokabelQuelle, type VokabelAuswahl } from './VokabelQuelle'

interface ZuweisungKurz {
  id: string
  titel: string
  fach: string
  lerngruppe: string
  woerter: number
  lernende: number
  sicherSchnitt: number
  testTermin: number | null
  status: string
}

export const FACH_NAMEN = ['neu', 'Fach 1', 'Fach 2', 'Fach 3', 'Fach 4', 'Fach 5', 'Langzeit']
export const FACH_FARBEN = ['gray', 'red', 'orange', 'yellow', 'lime', 'green', 'teal']

/** Balken der Fächerverteilung */
export function Faecherbalken({ u, hoehe = 10 }: { u: Uebersicht; hoehe?: number }): React.JSX.Element {
  return (
    <Progress.Root size={hoehe} radius="xl">
      {u.faecher.map((n, i) =>
        n ? (
          <Tooltip key={i} label={`${FACH_NAMEN[i]}: ${n}`}>
            <Progress.Section value={(n / Math.max(1, u.gesamt)) * 100} color={FACH_FARBEN[i]} />
          </Tooltip>
        ) : null
      )}
    </Progress.Root>
  )
}

export default function VokabelTraining(): React.JSX.Element {
  const [liste, setListe] = useState<ZuweisungKurz[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  const laden = useCallback(
    () =>
      void holen<{ zuweisungen: ZuweisungKurz[] }>('/server/vokabeln').then(
        (d) => setListe(d.zuweisungen),
        (e: unknown) => notifyError(e)
      ),
    []
  )
  useEffect(laden, [laden])
  if (gewaehlt) return <Lernstand id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
  return (
    <Stack data-vokabeltraining>
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Vokabeln zum Lernen freigeben – die Lernenden üben im Karteikasten ihrer Lern-App, du siehst den Lernstand.
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setNeu(true)} data-vokabeln-freigeben>
          Vokabeln freigeben
        </Button>
      </Group>
      {!liste && <Loader size="sm" />}
      {liste?.length === 0 && <Text c="dimmed">Noch keine Vokabeln freigegeben.</Text>}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {liste?.map((z) => (
          <Card key={z.id} withBorder style={{ cursor: 'pointer' }} onClick={() => setGewaehlt(z.id)} data-vokabel-zuweisung>
            <Group justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Text fw={700} truncate>
                  {z.titel}
                </Text>
                <Text size="sm" c="dimmed">
                  {z.lerngruppe} · {z.woerter} Wörter · {z.lernende} Lernende
                  {z.testTermin ? ` · Test am ${new Date(z.testTermin).toLocaleDateString('de-DE')}` : ''}
                </Text>
              </div>
              <Badge variant="light" color="green">
                {Math.round(z.sicherSchnitt * 100)} % sicher
              </Badge>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      {neu && <Freigeben schliessen={() => (setNeu(false), laden())} />}
    </Stack>
  )
}

/** Gruppen + Mitglieder aller eigenen Lerngruppen (wie beim Zuweisen der Reihen) */
function useLerngruppen(): { gruppen: { id: string; name: string }[]; alle: { gruppeId: string; gruppe: string; benutzer: string; name: string }[] } {
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [alle, setAlle] = useState<{ gruppeId: string; gruppe: string; benutzer: string; name: string }[]>([])
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(async (d) => {
      setGruppen(d.gruppen)
      const l = await Promise.all(
        d.gruppen.map((g) =>
          holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(g.id)}`).then(
            (m) => m.mitglieder.map((x) => ({ ...x, gruppeId: g.id, gruppe: g.name })),
            () => []
          )
        )
      )
      setAlle(l.flat())
    })
  }, [])
  return { gruppen, alle }
}

function Freigeben({ schliessen }: { schliessen: () => void }): React.JSX.Element {
  const [auswahl, setAuswahl] = useState<VokabelAuswahl | null>(null)
  const [titel, setTitel] = useState('')
  const [art, setArt] = useState<'gruppe' | 'einzeln'>('gruppe')
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [termin, setTermin] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const { gruppen } = useLerngruppen()
  useEffect(() => {
    if (auswahl) setTitel(auswahl.titel)
  }, [auswahl])
  const alleLernenden = useAlleLernenden()
  const los = async (): Promise<void> => {
    if (!auswahl) return
    setLaeuft(true)
    try {
      const mit = await mitBildern(auswahl)
      await senden('/server/vokabeln/freigeben', {
        titel: titel || auswahl.titel,
        sprache: mit.sprache,
        fach: mit.fach,
        woerter: mit.woerter,
        lerngruppeId: art === 'gruppe' ? gruppe : '',
        schueler: einzelne,
        testTermin: termin ? new Date(`${termin}T08:00:00`).getTime() : null
      })
      notifySuccess('Freigegeben – die Lernenden finden die Vokabeln in ihrer Lern-App.')
      schliessen()
    } catch (e) {
      notifyError(e, 'Nicht freigegeben')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title="Vokabeln zum Lernen freigeben" size="lg">
      <Stack>
        <VokabelQuelle wahl={setAuswahl} />
        {auswahl && (
          <Text size="sm" c="dimmed">
            {auswahl.woerter.length} Wörter, davon {auswahl.woerter.filter((w) => w.example).length} mit Beispielsatz.
          </Text>
        )}
        <TextInput label="Titel (sehen die Lernenden)" value={titel} onChange={(e) => setTitel(e.currentTarget.value)} />
        <SegmentedControl
          value={art}
          onChange={(v) => (setArt(v as 'gruppe' | 'einzeln'), setEinzelne([]))}
          data={[
            { value: 'gruppe', label: 'Lerngruppe' },
            { value: 'einzeln', label: 'Einzelne Lernende' }
          ]}
        />
        {art === 'gruppe' ? (
          <Select
            label="Lerngruppe"
            data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
            value={gruppe}
            onChange={setGruppe}
            placeholder="wählen …"
            data-vokabel-gruppe
          />
        ) : (
          <MultiSelect
            label="Lernende"
            data={alleLernenden.daten}
            value={einzelne}
            onChange={setEinzelne}
            searchable
            clearable
            nothingFoundMessage="Kein Schülerkonto mit diesem Namen"
            placeholder="Namen suchen …"
          />
        )}
        <TextInput
          type="date"
          label="Testtermin (optional)"
          description="Bis dahin plant der Karteikasten so, dass jedes Wort vorher mehrmals verteilt geübt ist."
          value={termin}
          onChange={(e) => setTermin(e.currentTarget.value)}
          w={240}
        />
        <Group justify="flex-end">
          <Button
            loading={laeuft}
            disabled={!auswahl?.woerter.length || (art === 'gruppe' ? !gruppe : !einzelne.length)}
            onClick={() => void los()}
            data-vokabeln-los
          >
            Freigeben
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

interface Lernstanddaten {
  id: string
  titel: string
  fach: string
  testTermin: number | null
  lerngruppe: string
  woerter: { id: string; term: string; translation: string }[]
  lernende: { id: string; name: string; uebersicht: Uebersicht; tage7: number }[]
  gesamt: Uebersicht
  problem: { id: string; term: string; translation: string; versuche: number; falsch: number; quote: number; typisch: string[] }[]
}

function Lernstand({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const [d, setD] = useState<Lernstanddaten | null>(null)
  useEffect(() => void holen<Lernstanddaten>(`/server/vokabeln/${id}`).then(setD, (e: unknown) => notifyError(e)), [id])
  if (!d) return <Loader size="sm" />
  const tageBisTest = d.testTermin ? Math.ceil((d.testTermin - Date.now()) / 86_400_000) : null
  const lernende = [...d.lernende].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const anteilSicher = d.gesamt.gesamt ? d.gesamt.sicher / d.gesamt.gesamt : 0
  const anteilGeuebt = d.gesamt.gesamt ? (d.gesamt.gesamt - d.gesamt.neu) / d.gesamt.gesamt : 0
  return (
    <Stack data-lernstand>
      <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={zurueck} w="fit-content">
        Alle Freigaben
      </Button>
      <div>
        <Title order={3}>{d.titel}</Title>
        <Text c="dimmed" size="sm">
          {d.lerngruppe} · {d.woerter.length} Wörter · {lernende.length} Lernende
        </Text>
      </div>
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Lerngruppe insgesamt
          </Text>
          <Title order={3}>{Math.round(anteilSicher * 100)} % sicher</Title>
          <Text size="xs" c="dimmed" mb={6}>
            {Math.round(anteilGeuebt * 100)} % schon geübt · Erkennen richtig: {Math.round(d.gesamt.erkennen * 100)} %
          </Text>
          <Faecherbalken u={d.gesamt} />
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Aktiv in den letzten 7 Tagen
          </Text>
          <Title order={3}>
            {lernende.filter((l) => l.tage7 > 0).length} von {lernende.length}
          </Title>
          <Text size="xs" c="dimmed">
            {lernende.filter((l) => l.tage7 === 0).length
              ? `${lernende.filter((l) => l.tage7 === 0).length} haben diese Woche noch nicht geübt.`
              : 'Alle haben diese Woche geübt.'}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Testtermin
          </Text>
          <Title order={3}>{d.testTermin ? new Date(d.testTermin).toLocaleDateString('de-DE') : '–'}</Title>
          <Text size="xs" c="dimmed">
            {tageBisTest !== null && tageBisTest >= 0
              ? `in ${tageBisTest} Tag${tageBisTest === 1 ? '' : 'en'} · Prognose: ${Math.round(anteilGeuebt * 100)} % der Wörter sind bis dahin mindestens geübt`
              : 'Ohne Termin plant der Kasten nach den festen Abständen.'}
          </Text>
        </Card>
      </SimpleGrid>

      <Card withBorder>
        <Group gap="xs" mb="xs">
          <IconBooks size={18} />
          <Text fw={700}>Problemwörter der Lerngruppe</Text>
        </Group>
        {d.problem.length === 0 ? (
          <Text size="sm" c="dimmed">
            Noch keine – sie erscheinen, sobald genug geübt ist.
          </Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Wort</Table.Th>
                <Table.Th>Fehlerquote</Table.Th>
                <Table.Th>Typische Falschantworten</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {d.problem.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td>
                    <b>{p.term}</b> – {p.translation}
                  </Table.Td>
                  <Table.Td>{Math.round(p.quote * 100)} %</Table.Td>
                  <Table.Td>{p.typisch.join(' · ') || '–'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Card withBorder>
        <Text fw={700} mb="xs">
          Je Lernende/r
        </Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th style={{ width: '40%' }}>Karteikasten</Table.Th>
              <Table.Th>sicher</Table.Th>
              <Table.Th>fällig</Table.Th>
              <Table.Th>geübt (7 Tage)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lernende.map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>{l.name}</Table.Td>
                <Table.Td>
                  <Faecherbalken u={l.uebersicht} />
                </Table.Td>
                <Table.Td>
                  {l.uebersicht.sicher}/{l.uebersicht.gesamt}
                </Table.Td>
                <Table.Td>{l.uebersicht.faellig}</Table.Td>
                <Table.Td>{l.tage7 ? `an ${l.tage7} Tag${l.tage7 === 1 ? '' : 'en'}` : <Text c="dimmed">noch nicht</Text>}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed" mt="xs">
          Farben: grau neu · rot bis grün Fach 1–5 · türkis Langzeit. „Sicher“ = zweimal frei richtig geschrieben im Abstand von mindestens einer Woche. Keine
          Rangliste – sortiert nach Namen.
        </Text>
      </Card>
      {lernende.length === 0 && <Alert>Noch niemand in der Lerngruppe.</Alert>}
    </Stack>
  )
}
