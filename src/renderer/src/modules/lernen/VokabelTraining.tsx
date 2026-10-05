/**
 * Vokabeltraining für Lehrkräfte (03.10.2026; Server: src/server/vokabeln.ts). Seit dem Wunsch der
 * Lehrkraft („Mach hieraus eine eigenständige App, in der man über einen längeren Zeitraum für eine
 * Lerngruppe/einzelne Lerner oder Personen mit QR Code / Code Zugriff auf das Lernen hat") eine
 * eigene App statt eines Reiters im Onlinetest: Lernzeitraum, Zugang per QR-Code für Gäste
 * (mit persönlichem Wiedereinstiegs-Code), beenden, wieder öffnen, löschen.
 *
 * Vokabeln (Lehrwerk-Abschnitt oder eigene Liste) einer Lerngruppe oder Einzelnen zum Lernen
 * freigeben, optional mit Testtermin. Lernstand je Lerngruppe und Kind – abgestimmt OHNE Ranglisten:
 * Verteilung auf die Fächer des Karteikastens, Erkennen vs. selbst schreiben, Aktivität der letzten
 * 7 Tage, Problemwörter mit typischen Falschantworten, Prognose zum Testtermin.
 */
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { useAlleLernenden } from './LernendeWahl'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { IconArrowLeft, IconBooks, IconCalendarEvent, IconPlus, IconQrcode, IconTrash, IconUser, IconUserMinus } from '@tabler/icons-react'
import { Zugang } from '../onlinetest/OnlinetestModule'
import { useCallback, useEffect, useState } from 'react'
import { STUFEN, type Uebersicht } from '@shared/vokabeltrainer'
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
  bis: number | null
  gaeste: number
  code?: string
  link?: string
}

const tag = (ms: number): string => new Date(ms).toLocaleDateString('de-DE')
/** Datumsfeld (JJJJ-MM-TT) ↔ Zeitpunkt: Termine morgens, Zeitraum-Ende am Abend */
const alsFeld = (ms: number | null): string => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : '')
const ausFeld = (v: string, uhr: string): number | null => (v ? new Date(`${v}T${uhr}`).getTime() : null)

/** Die App „Vokabeltraining" (Gruppe Unterricht) */
export function VokabeltrainingModule({ active }: { active: boolean }): React.JSX.Element | null {
  if (!active) return null
  return (
    <Container size="xl" py="md">
      <VokabelTraining />
    </Container>
  )
}

// Dieselben Lernstufen wie bei den Lernenden (shared/vokabeltrainer.ts, abgestimmt 03.10.2026)
export const FACH_NAMEN = STUFEN.map((x) => x.name)
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
  const farbe = useProgrammFarbe()
  const [liste, setListe] = useState<ZuweisungKurz[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  const [filter, setFilter] = useState<'offen' | 'beendet'>('offen')
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
  const sichtbar = (liste ?? []).filter((z) => z.status === filter)
  return (
    <Stack data-vokabeltraining>
      {/* Gemeinsamer Kopf (Phase 6a): Filter in der zweiten Zeile */}
      <AppKopf
        beschreibung="Vokabeln über einen längeren Zeitraum zum Lernen freigeben – für eine Lerngruppe, einzelne Lernende oder per QR-Code. Geübt wird im Karteikasten der Lern-App; hier steht der Lernstand."
        hauptknopf={
          <Button leftSection={<IconPlus size={16} />} radius="md" color={farbe} onClick={() => setNeu(true)} data-vokabeln-freigeben>
            Vokabeln freigeben
          </Button>
        }
        links={
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            data={[
              { value: 'offen', label: `Laufend${liste ? ` (${liste.filter((z) => z.status === 'offen').length})` : ''}` },
              { value: 'beendet', label: `Abgeschlossen${liste ? ` (${liste.filter((z) => z.status !== 'offen').length})` : ''}` }
            ]}
          />
        }
      />
      {!liste && <Loader size="sm" />}
      {liste && sichtbar.length === 0 && <Text c="dimmed">{filter === 'offen' ? 'Gerade läuft kein Vokabeltraining.' : 'Nichts abgeschlossen.'}</Text>}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {sichtbar.map((z) => (
          <Card key={z.id} withBorder style={{ cursor: 'pointer' }} onClick={() => setGewaehlt(z.id)} data-vokabel-zuweisung>
            <Group justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Text fw={700} truncate>
                  {z.titel}
                </Text>
                <Text size="sm" c="dimmed">
                  {z.lerngruppe} · {z.woerter} Wörter · {z.lernende} Lernende{z.gaeste ? ` (davon ${z.gaeste} per QR-Code)` : ''}
                </Text>
                <Text size="xs" c="dimmed">
                  {[z.bis ? `Lernzeitraum bis ${tag(z.bis)}` : 'ohne Enddatum', z.testTermin ? `Test am ${tag(z.testTermin)}` : ''].filter(Boolean).join(' · ')}
                </Text>
              </div>
              <Stack gap={4} align="flex-end">
                <Badge variant="light" color="green">
                  {Math.round(z.sicherSchnitt * 100)} % sicher
                </Badge>
                {z.code && (
                  <Badge variant="light" color="blue" leftSection={<IconQrcode size={10} />}>
                    {z.code}
                  </Badge>
                )}
              </Stack>
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
  const [art, setArt] = useState<'gruppe' | 'einzeln' | 'code'>('gruppe')
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [termin, setTermin] = useState('')
  const [bis, setBis] = useState('')
  const [qr, setQr] = useState(false)
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
        schueler: art === 'einzeln' ? einzelne : [],
        testTermin: ausFeld(termin, '08:00:00'),
        bis: ausFeld(bis, '23:59:00'),
        gaeste: art === 'code' || qr,
        ...(auswahl.quelle ? { quelle: auswahl.quelle } : {})
      })
      notifySuccess(
        art === 'code' || qr
          ? 'Freigegeben – QR-Code und Code stehen beim Training (Knopf „QR-Code").'
          : 'Freigegeben – die Lernenden finden die Vokabeln in ihrer Lern-App.'
      )
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
          onChange={(v) => (setArt(v as typeof art), setEinzelne([]))}
          data={[
            { value: 'gruppe', label: 'Lerngruppe' },
            { value: 'einzeln', label: 'Einzelne Lernende' },
            { value: 'code', label: 'Nur per QR-Code' }
          ]}
          data-vokabel-art
        />
        {art === 'code' ? (
          <Text size="sm" c="dimmed">
            Wer den QR-Code scannt oder den Code eingibt, lernt mit – Lernende mit Konto direkt, alle anderen mit Vorname und Anfangsbuchstabe. Gäste bekommen
            einen persönlichen Code, mit dem sie an anderen Tagen und Geräten weiterlernen.
          </Text>
        ) : art === 'gruppe' ? (
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
        {art !== 'code' && (
          <Switch
            label="Zusätzlich per QR-Code / Code zugänglich"
            description="Etwa für Lernende ohne Konto oder aus anderen Gruppen."
            checked={qr}
            onChange={(e) => setQr(e.currentTarget.checked)}
            data-vokabel-qr
          />
        )}
        <Group align="flex-start" grow>
          <TextInput
            type="date"
            label="Lernzeitraum bis (optional)"
            description="Danach ist das Training abgeschlossen; ohne Datum läuft es, bis es beendet wird."
            value={bis}
            onChange={(e) => setBis(e.currentTarget.value)}
            data-vokabel-bis
          />
          <TextInput
            type="date"
            label="Testtermin (optional)"
            description="Bis dahin plant der Karteikasten so, dass jedes Wort vorher mehrmals verteilt geübt ist."
            value={termin}
            onChange={(e) => setTermin(e.currentTarget.value)}
          />
        </Group>
        <Group justify="flex-end">
          <Button
            loading={laeuft}
            disabled={!auswahl?.woerter.length || (art === 'gruppe' ? !gruppe : art === 'einzeln' ? !einzelne.length : false)}
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
  status: string
  bis: number | null
  code?: string
  link?: string
  lerngruppe: string
  woerter: { id: string; term: string; translation: string }[]
  lernende: { id: string; name: string; gast?: boolean; perCode?: boolean; uebersicht: Uebersicht; tage7: number }[]
  gesamt: Uebersicht
  problem: { id: string; term: string; translation: string; versuche: number; falsch: number; quote: number; typisch: string[] }[]
}

function Lernstand({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const [d, setD] = useState<Lernstanddaten | null>(null)
  const [qr, setQr] = useState(false)
  const [loeschen, setLoeschen] = useState(false)
  const [entfernen, setEntfernen] = useState<Lernstanddaten['lernende'][number] | null>(null)
  const laden = useCallback(() => void holen<Lernstanddaten>(`/server/vokabeln/${id}`).then(setD, (e: unknown) => notifyError(e)), [id])
  useEffect(laden, [laden])
  if (!d) return <Loader size="sm" />
  const aendern = (was: string, daten: Record<string, unknown>): void =>
    void senden(`/server/vokabeln/${id}/${was}`, daten).then(laden, (e: unknown) => notifyError(e))
  const tageBisTest = d.testTermin ? Math.ceil((d.testTermin - Date.now()) / 86_400_000) : null
  const lernende = [...d.lernende].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const anteilSicher = d.gesamt.gesamt ? d.gesamt.sicher / d.gesamt.gesamt : 0
  const anteilGeuebt = d.gesamt.gesamt ? (d.gesamt.gesamt - d.gesamt.neu) / d.gesamt.gesamt : 0
  return (
    <Stack data-lernstand>
      <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={zurueck} w="fit-content">
        Alle Freigaben
      </Button>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="xs">
            <Title order={3}>{d.titel}</Title>
            {d.status !== 'offen' && <Badge color="gray">abgeschlossen</Badge>}
          </Group>
          <Text c="dimmed" size="sm">
            {d.lerngruppe} · {d.woerter.length} Wörter · {lernende.length} Lernende
          </Text>
        </div>
        <Group gap="xs">
          {d.code && d.link && (
            <Button variant="light" leftSection={<IconQrcode size={16} />} onClick={() => setQr(true)} data-vokabel-qr-zeigen>
              QR-Code
            </Button>
          )}
          <Button variant="default" onClick={() => aendern('status', { status: d.status === 'offen' ? 'beendet' : 'offen' })} data-vokabel-status>
            {d.status === 'offen' ? 'Beenden' : 'Wieder öffnen'}
          </Button>
          <Tooltip label="Löschen">
            <ActionIcon variant="subtle" color="red" size="lg" onClick={() => setLoeschen(true)} aria-label="Löschen">
              <IconTrash size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Group gap="md" align="flex-end">
        <TextInput
          type="date"
          label="Lernzeitraum bis"
          leftSection={<IconCalendarEvent size={14} />}
          value={alsFeld(d.bis)}
          onChange={(e) => aendern('zeitraum', { bis: ausFeld(e.currentTarget.value, '23:59:00') })}
          w={200}
          data-vokabel-bis-aendern
        />
        <TextInput
          type="date"
          label="Testtermin"
          value={alsFeld(d.testTermin)}
          onChange={(e) => aendern('termin', { testTermin: ausFeld(e.currentTarget.value, '08:00:00') })}
          w={200}
        />
      </Group>
      {qr && d.code && d.link && (
        <Modal opened onClose={() => setQr(false)} title={d.titel} size="lg">
          <Zugang code={d.code} link={d.link} />
          <Text size="sm" c="dimmed" mt="sm">
            Gäste geben Vorname und Anfangsbuchstabe ein und bekommen einen persönlichen Code zum Weiterlernen an anderen Tagen und Geräten.
          </Text>
        </Modal>
      )}
      <Modal opened={loeschen} onClose={() => setLoeschen(false)} title="Vokabeltraining löschen?">
        <Text size="sm" mb="md">
          Das Training wird samt Lernstand aller Lernenden und der Gastzugänge endgültig gelöscht. Die Vokabelliste selbst bleibt erhalten.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setLoeschen(false)}>
            Abbrechen
          </Button>
          <Button
            color="red"
            onClick={() => void senden(`/server/vokabeln/${id}/loeschen`, {}).then(zurueck, (e: unknown) => notifyError(e))}
            data-vokabel-loeschen
          >
            Endgültig löschen
          </Button>
        </Group>
      </Modal>
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
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lernende.map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>
                  {l.name}
                  {l.gast && (
                    <Tooltip label="Per QR-Code dazugekommen">
                      <IconUser size={12} style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.6 }} />
                    </Tooltip>
                  )}
                </Table.Td>
                <Table.Td>
                  <Faecherbalken u={l.uebersicht} />
                </Table.Td>
                <Table.Td>
                  {l.uebersicht.sicher}/{l.uebersicht.gesamt}
                </Table.Td>
                <Table.Td>{l.uebersicht.faellig}</Table.Td>
                <Table.Td>{l.tage7 ? `an ${l.tage7} Tag${l.tage7 === 1 ? '' : 'en'}` : <Text c="dimmed">noch nicht</Text>}</Table.Td>
                <Table.Td>
                  {l.perCode && (
                    <Tooltip label="Aus dieser Freigabe entfernen">
                      <ActionIcon variant="subtle" color="red" onClick={() => setEntfernen(l)} aria-label={`${l.name} entfernen`} data-gast-entfernen={l.name}>
                        <IconUserMinus size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed" mt="xs">
          Stufen: Neu (grau) → Angefangen → Wiedererkannt → Geübt → Gefestigt → Gekonnt → Im Langzeitgedächtnis (türkis). „Sicher“ = zweimal frei richtig
          geschrieben im Abstand von mindestens einer Woche. Keine Rangliste – sortiert nach Namen.
        </Text>
      </Card>
      <Modal opened={Boolean(entfernen)} onClose={() => setEntfernen(null)} title="Aus dieser Freigabe entfernen?">
        {entfernen && (
          <Stack gap="sm">
            <Text size="sm">
              „{entfernen.name}“ verliert sofort den Zugang zu diesen Vokabeln; der Lernstand dazu wird gelöscht.
              {entfernen.gast ? ' Das Gastkonto wird ganz gelöscht.' : ' Das IServ-Konto selbst bleibt bestehen.'}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEntfernen(null)}>
                Abbrechen
              </Button>
              <Button color="red" data-gast-entfernen-bestaetigen onClick={() => (aendern('gast-entfernen', { id: entfernen.id }), setEntfernen(null))}>
                Entfernen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
      {lernende.length === 0 && <Alert>{d.code ? 'Noch niemand dabei – den QR-Code zeigen oder den Code nennen.' : 'Noch niemand in der Lerngruppe.'}</Alert>}
    </Stack>
  )
}
