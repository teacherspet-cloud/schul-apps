/**
 * „Meine Klassen" (06.10.2026, abgestimmt mit der Lehrkraft) – Gruppe Verwaltung, nur mit dem Schul-Apps-Server.
 *
 *  - Übersicht: je Lerngruppe und Fach eine Karte („5b – Englisch", alphabetisch) mit Lernstand, Testschnitt und
 *    Handlungsbedarf.
 *  - Klasse: oben der Handlungsbedarf (zu prüfen, Förderbedarf, lange nicht geübt, Testtermine, Reihen, Blätter), darunter
 *    Vorschläge für Material aus dem Lernstand, dann Lernende, Tests & Noten, Reihen & Blätter, Vokabeln.
 *  - Vorschläge: „Wackelige Wörter" als Vokabeltraining (Vorschau → „Jetzt freischalten"); „Übungsblatt zu den Fehlern
 *    des letzten Tests" entsteht im Hintergrund (KI-Zugang der Lehrkraft), ist es fertig, erscheint es hier zum
 *    Ansehen und Freischalten – nach kurzer Sichtung, nicht automatisch.
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook2,
  IconCalendarEvent,
  IconCheck,
  IconChevronRight,
  IconClipboardCheck,
  IconFileText,
  IconLock,
  IconRoute,
  IconSparkles,
  IconUserExclamation,
  IconUsers,
  IconZzz
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppKopf } from '../../shared/components/AppKopf'
import { ListenSuche } from '../../shared/components/AppSuche'
import { openDocument, openModule } from '../../shared/navigation'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { blattFuerKlasse, useFertigeBlaetter, type FertigesBlatt } from './klassenMaterial'
import { BlattFreigabeDialog } from '../arbeitsblatt/BlattFreigabeKnopf'
import { useAppSettings } from '../../shared/settingsStore'

interface KlasseKurz {
  id: string
  name: string
  fach: string
  titel: string
  lernende: number
  vokabelnSicher: number | null
  testSchnitt: number | null
  tests: number
  reihen: number
  blaetter: number
  bedarf: number
  vorschlaege: number
}

type Bedarf = { art: 'entscheiden' | 'foerdern' | 'inaktiv' | 'termin' | 'reihe' | 'blatt'; text: string; ziel?: { modul: string; id?: string } }
type Vorschlag =
  | { art: 'vokabeln'; titel: string; text: string; sprache: string; fach: string; woerter: { term: string; translation: string; example?: string }[] }
  | { art: 'blatt'; titel: string; text: string; testId: string; thema: string; schwerpunkte: string[]; testArt: string }

interface KlasseDetail {
  id: string
  name: string
  fach: string
  titel: string
  lernende: {
    id: string
    name: string
    benutzer: string
    vokabelnSicher: number | null
    zuletztGeuebt: string | null
    testSchnitt: number | null
    tests: number
    reihenFortschritt: number | null
    blaetterEingereicht: number
  }[]
  tests: { id: string; titel: string; datum: string; status: string; teilnehmer: number; offen: number; durchschnitt: number | null; verteilung: number[] }[]
  vokabeln: { id: string; titel: string; testTermin: number | null; sicherSchnitt: number }[]
  wackelig: { term: string; translation: string; quote: number }[]
  reihen: { zid: string; titel: string; schnitt: number; fertig: number; lernende: number }[]
  blaetter: { id: string; titel: string; gesamt: number; begonnen: number; eingereicht: number }[]
  bedarf: Bedarf[]
  vorschlaege: Vorschlag[]
}

const prozent = (x: number | null): string => (x === null ? '–' : `${Math.round(x * 100)} %`)
const note = (x: number | null): string => (x === null ? '–' : x.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }))
const tag = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '–')

const BEDARF_SYMBOL: Record<Bedarf['art'], React.ReactNode> = {
  entscheiden: <IconClipboardCheck size={16} />,
  foerdern: <IconUserExclamation size={16} />,
  inaktiv: <IconZzz size={16} />,
  termin: <IconCalendarEvent size={16} />,
  reihe: <IconRoute size={16} />,
  blatt: <IconFileText size={16} />
}
const BEDARF_FARBE: Record<Bedarf['art'], string> = { entscheiden: 'orange', foerdern: 'red', inaktiv: 'gray', termin: 'blue', reihe: 'violet', blatt: 'cyan' }

export default function MeineKlassenModule({ active }: { active: boolean }): React.JSX.Element | null {
  const [klassen, setKlassen] = useState<KlasseKurz[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const laden = useCallback(() => {
    void holen<{ klassen: KlasseKurz[] }>('/server/klassen').then(
      (d) => setKlassen(d.klassen),
      (e: unknown) => (notifyError(e), setKlassen([]))
    )
  }, [])
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  if (!active) return null
  const q = suche.trim().toLowerCase()
  const sichtbar = (klassen ?? []).filter((k) => !q || k.titel.toLowerCase().includes(q))
  return (
    <Container size="xl" py="lg" data-meine-klassen>
      <AppKopf
        beschreibung="Lernstand, Tests und Handlungsbedarf je Klasse und Fach – und passendes Material mit einem Klick."
        suche={<ListenSuche wert={suche} setzen={setSuche} platzhalter="Klasse, Fach …" />}
      />
      {gewaehlt ? (
        <KlasseAnsicht id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
      ) : !klassen ? (
        <Center h="40vh">
          <Loader />
        </Center>
      ) : klassen.length === 0 ? (
        <Alert icon={<IconUsers size={18} />} title="Noch keine Lerngruppen">
          Lerngruppen entstehen in der App „Onlinetest“ unter „Lerngruppen“ (aus IServ oder von Hand). Danach stehen sie hier mit ihrem Lernstand.
        </Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} data-klassen-liste>
          {sichtbar.map((k) => (
            <UnstyledButton key={k.id} onClick={() => setGewaehlt(k.id)} className="vorlage-karte" style={{ padding: 14 }} data-klasse={k.titel}>
              <Group justify="space-between" wrap="nowrap" mb={8}>
                <Text fw={800} size="lg">
                  {k.titel}
                </Text>
                {k.bedarf > 0 ? (
                  <Badge color="orange" leftSection={<IconAlertTriangle size={12} />}>
                    {k.bedarf}
                  </Badge>
                ) : (
                  <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
                    alles ruhig
                  </Badge>
                )}
              </Group>
              <Group gap="lg" mb={6}>
                <Kennzahl wert={String(k.lernende)} text="Lernende" />
                <Kennzahl wert={prozent(k.vokabelnSicher)} text="Vokabeln sicher" />
                <Kennzahl wert={note(k.testSchnitt)} text={`Testschnitt (${k.tests})`} />
              </Group>
              {k.vokabelnSicher !== null && (
                <Progress value={k.vokabelnSicher * 100} size="sm" radius="xl" color={k.vokabelnSicher < 0.4 ? 'orange' : 'teal'} />
              )}
              <Group gap={6} mt={8}>
                {k.reihen > 0 && (
                  <Badge variant="light">
                    {k.reihen} Reihe{k.reihen === 1 ? '' : 'n'}
                  </Badge>
                )}
                {k.blaetter > 0 && (
                  <Badge variant="light">
                    {k.blaetter} Blatt{k.blaetter === 1 ? '' : 'er'}
                  </Badge>
                )}
                {k.vorschlaege > 0 && (
                  <Badge variant="light" color="grape" leftSection={<IconSparkles size={12} />}>
                    {k.vorschlaege} Vorschlag{k.vorschlaege === 1 ? '' : 'e'}
                  </Badge>
                )}
              </Group>
            </UnstyledButton>
          ))}
        </SimpleGrid>
      )}
    </Container>
  )
}

function Kennzahl({ wert, text }: { wert: string; text: string }): React.JSX.Element {
  return (
    <div>
      <Text fw={800} size="lg" lh={1.1}>
        {wert}
      </Text>
      <Text size="xs" c="dimmed">
        {text}
      </Text>
    </div>
  )
}

function KlasseAnsicht({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const [d, setD] = useState<KlasseDetail | null>(null)
  const [vorschau, setVorschau] = useState<Extract<Vorschlag, { art: 'vokabeln' }> | null>(null)
  const [freigabe, setFreigabe] = useState<FertigesBlatt | null>(null)
  const laden = useCallback(() => {
    void holen<KlasseDetail>(`/server/klassen/${id}`).then(setD, (e: unknown) => notifyError(e))
  }, [id])
  useEffect(laden, [laden])
  const fertige = useFertigeBlaetter(id)
  const { logoDataUrl, settings } = useAppSettings()
  if (!d)
    return (
      <Center h="40vh">
        <Loader />
      </Center>
    )
  const oeffne = (z?: { modul: string; id?: string }): void => {
    if (!z) return
    if (z.id) void openDocument(z.modul, z.id)
    else openModule(z.modul)
  }
  const vokabelnFreischalten = async (v: Extract<Vorschlag, { art: 'vokabeln' }>): Promise<void> => {
    try {
      await senden('/server/vokabeln/freigeben', { lerngruppeId: d.id, titel: v.titel, sprache: v.sprache, fach: v.fach, woerter: v.woerter })
      notifySuccess(`„${v.titel}" ist für ${d.titel} freigeschaltet.`)
      setVorschau(null)
      laden()
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <Stack data-klasse-detail={d.titel}>
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} px={4} onClick={zurueck}>
          Alle Klassen
        </Button>
      </Group>
      <Title order={2}>{d.titel}</Title>

      {/* ---------- Handlungsbedarf */}
      <Card withBorder radius="md" padding="md" data-handlungsbedarf>
        <Group gap={6} mb="xs">
          <IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />
          <Text fw={700}>Handlungsbedarf</Text>
        </Group>
        {d.bedarf.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nichts Dringendes – alle Abgaben geprüft, niemand hängt hinterher.
          </Text>
        ) : (
          <Stack gap={4}>
            {d.bedarf.map((b, i) => (
              <UnstyledButton key={i} onClick={() => oeffne(b.ziel)} className="klassen-bedarf" data-bedarf={b.art}>
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon size="sm" variant="light" color={BEDARF_FARBE[b.art]}>
                    {BEDARF_SYMBOL[b.art]}
                  </ThemeIcon>
                  <Text size="sm" style={{ flex: 1 }}>
                    {b.text}
                  </Text>
                  {b.ziel && <IconChevronRight size={14} />}
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Card>

      {/* ---------- Vorschläge für Material */}
      {(d.vorschlaege.length > 0 || fertige.length > 0) && (
        <div>
          <Group gap={6} mb={6}>
            <IconSparkles size={18} color="var(--mantine-color-grape-6)" />
            <Text fw={700}>Passendes Material</Text>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {fertige.map((f) => (
              <Card key={f.docId} withBorder radius="md" padding="md" style={{ borderColor: 'var(--mantine-color-teal-6)' }} data-blatt-fertig>
                <Badge color="teal" mb={6}>
                  fertig
                </Badge>
                <Text fw={700}>{f.titel}</Text>
                <Text size="sm" c="dimmed" mb="sm">
                  Kurz ansehen, dann für {d.titel} freischalten.
                </Text>
                <Group gap="xs">
                  <Button size="xs" variant="default" onClick={() => void openDocument('arbeitsblatt', f.docId)}>
                    Im Editor ansehen
                  </Button>
                  <Button size="xs" leftSection={<IconLock size={14} />} onClick={() => setFreigabe(f)} data-jetzt-freischalten>
                    Jetzt freischalten
                  </Button>
                </Group>
              </Card>
            ))}
            {d.vorschlaege.map((v, i) => (
              <Card key={i} withBorder radius="md" padding="md" data-vorschlag={v.art}>
                <Group gap={6} mb={4}>
                  {v.art === 'vokabeln' ? <IconBook2 size={16} /> : <IconFileText size={16} />}
                  <Text fw={700}>{v.titel}</Text>
                </Group>
                <Text size="sm" c="dimmed" mb={6}>
                  {v.text}
                </Text>
                {v.art === 'blatt' && (
                  <Stack gap={2} mb="sm">
                    {v.schwerpunkte.map((s) => (
                      <Text key={s} size="xs">
                        • {s}
                      </Text>
                    ))}
                  </Stack>
                )}
                {v.art === 'vokabeln' ? (
                  <Button size="xs" onClick={() => setVorschau(v)} data-vorschlag-ansehen>
                    Ansehen und freischalten
                  </Button>
                ) : (
                  <Tooltip label="Entsteht im Hintergrund mit dem eigenen KI-Zugang; ist es fertig, erscheint es hier zum Freischalten">
                    <Button size="xs" leftSection={<IconSparkles size={14} />} onClick={() => blattFuerKlasse(d, v)} data-blatt-erstellen>
                      Übungsblatt erstellen lassen
                    </Button>
                  </Tooltip>
                )}
              </Card>
            ))}
          </SimpleGrid>
        </div>
      )}

      <Tabs defaultValue="lernende" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="lernende">Lernende ({d.lernende.length})</Tabs.Tab>
          <Tabs.Tab value="tests">Tests & Noten ({d.tests.length})</Tabs.Tab>
          <Tabs.Tab value="reihen">Reihen & Blätter ({d.reihen.length + d.blaetter.length})</Tabs.Tab>
          <Tabs.Tab value="vokabeln">Vokabeln ({d.vokabeln.length})</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="lernende" pt="sm">
          <LernendeTabelle d={d} />
        </Tabs.Panel>
        <Tabs.Panel value="tests" pt="sm">
          {d.tests.length === 0 ? (
            <Text c="dimmed">Noch keine Onlinetests in dieser Lerngruppe.</Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Test</Table.Th>
                  <Table.Th>Datum</Table.Th>
                  <Table.Th>Teilnahmen</Table.Th>
                  <Table.Th>Schnitt</Table.Th>
                  <Table.Th>Noten 1–6</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[...d.tests].reverse().map((t) => (
                  <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => void openDocument('onlinetest', t.id)}>
                    <Table.Td>{t.titel}</Table.Td>
                    <Table.Td>{tag(t.datum)}</Table.Td>
                    <Table.Td>{t.teilnehmer}</Table.Td>
                    <Table.Td fw={700}>{note(t.durchschnitt)}</Table.Td>
                    <Table.Td>
                      <Verteilung werte={t.verteilung} />
                    </Table.Td>
                    <Table.Td>{t.offen > 0 && <Badge color="orange">{t.offen} zu prüfen</Badge>}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="reihen" pt="sm">
          <Stack gap="xs">
            {d.reihen.length + d.blaetter.length === 0 && <Text c="dimmed">Gerade keine laufenden Reihen oder Blätter.</Text>}
            {d.reihen.map((r) => (
              <Card key={r.zid} withBorder padding="sm" radius="md">
                <Group justify="space-between">
                  <Group gap={6}>
                    <IconRoute size={16} />
                    <Text fw={600}>{r.titel}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {r.fertig} von {r.lernende} fertig
                  </Text>
                </Group>
                <Progress mt={6} value={r.schnitt * 100} radius="xl" />
              </Card>
            ))}
            {d.blaetter.map((b) => (
              <Card key={b.id} withBorder padding="sm" radius="md" style={{ cursor: 'pointer' }} onClick={() => void openDocument('freigaben', b.id)}>
                <Group justify="space-between">
                  <Group gap={6}>
                    <IconFileText size={16} />
                    <Text fw={600}>{b.titel}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {b.begonnen} begonnen · {b.eingereicht} von {b.gesamt} eingereicht
                  </Text>
                </Group>
                <Progress mt={6} value={b.gesamt ? (b.eingereicht / b.gesamt) * 100 : 0} radius="xl" color="cyan" />
              </Card>
            ))}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="vokabeln" pt="sm">
          <Stack gap="xs">
            {d.vokabeln.length === 0 && <Text c="dimmed">Gerade kein Vokabeltraining in dieser Lerngruppe.</Text>}
            {d.vokabeln.map((v) => (
              <Card key={v.id} withBorder padding="sm" radius="md">
                <Group justify="space-between">
                  <Text fw={600}>{v.titel}</Text>
                  <Group gap={6}>
                    {v.testTermin && <Badge variant="light">Test {tag(new Date(v.testTermin).toISOString())}</Badge>}
                    <Text size="sm">{prozent(v.sicherSchnitt)} sicher</Text>
                  </Group>
                </Group>
                <Progress mt={6} value={v.sicherSchnitt * 100} radius="xl" color={v.sicherSchnitt < 0.4 ? 'orange' : 'teal'} />
              </Card>
            ))}
            {d.wackelig.length > 0 && (
              <Card withBorder padding="sm" radius="md">
                <Text fw={700} size="sm" mb={6}>
                  Am häufigsten daneben
                </Text>
                <Group gap={6}>
                  {d.wackelig.map((w) => (
                    <Badge key={w.term} variant="light" color="orange" tt="none">
                      {w.term} – {w.translation} · {Math.round(w.quote * 100)} %
                    </Badge>
                  ))}
                </Group>
              </Card>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {vorschau && (
        <Modal opened onClose={() => setVorschau(null)} title={vorschau.titel} size="lg">
          <Stack>
            <Text size="sm" c="dimmed">
              {vorschau.woerter.length} Wörter für {d.titel} – als Vokabeltraining im Karteikasten der Lern-App.
            </Text>
            <Table withRowBorders={false} verticalSpacing={2}>
              <Table.Tbody>
                {vorschau.woerter.map((w) => (
                  <Table.Tr key={w.term}>
                    <Table.Td fw={600}>{w.term}</Table.Td>
                    <Table.Td>{w.translation}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setVorschau(null)}>
                Abbrechen
              </Button>
              <Button leftSection={<IconLock size={14} />} onClick={() => void vokabelnFreischalten(vorschau)} data-vokabeln-freischalten>
                Jetzt freischalten
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
      {freigabe && (
        <BlattFreigabeDialog
          ws={freigabe.ws}
          layouts={new Map()}
          logo={logoDataUrl ?? null}
          schoolName={settings.schoolName ?? ''}
          schliessen={() => setFreigabe(null)}
          ohneListe
          gruppeVorwahl={d.id}
          freigegeben={() => {
            freigabe.erledigt()
            setFreigabe(null)
            laden()
          }}
        />
      )}
    </Stack>
  )
}

function Verteilung({ werte }: { werte: number[] }): React.JSX.Element {
  const max = Math.max(1, ...werte)
  return (
    <Group gap={2} align="flex-end" h={22} wrap="nowrap">
      {werte.map((n, i) => (
        <Tooltip key={i} label={`Note ${i + 1}: ${n}`}>
          <div
            style={{
              width: 8,
              height: Math.max(2, (n / max) * 22),
              borderRadius: 2,
              background: i < 2 ? 'var(--mantine-color-teal-5)' : i < 4 ? 'var(--mantine-color-yellow-5)' : 'var(--mantine-color-red-5)'
            }}
          />
        </Tooltip>
      ))}
    </Group>
  )
}

function LernendeTabelle({ d }: { d: KlasseDetail }): React.JSX.Element {
  const zeilen = useMemo(() => d.lernende, [d])
  if (!zeilen.length) return <Text c="dimmed">Noch keine Lernenden in dieser Lerngruppe.</Text>
  const zeigtVokabeln = zeilen.some((l) => l.vokabelnSicher !== null)
  const zeigtReihen = zeilen.some((l) => l.reihenFortschritt !== null)
  return (
    <Table striped highlightOnHover data-lernende-tabelle>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          {zeigtVokabeln && <Table.Th>Vokabeln sicher</Table.Th>}
          {zeigtVokabeln && <Table.Th>zuletzt geübt</Table.Th>}
          <Table.Th>Testschnitt</Table.Th>
          {zeigtReihen && <Table.Th>Reihen</Table.Th>}
          <Table.Th>Blätter eingereicht</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {zeilen.map((l) => (
          <Table.Tr key={l.id}>
            <Table.Td fw={600}>{l.name}</Table.Td>
            {zeigtVokabeln && (
              <Table.Td>
                {l.vokabelnSicher === null ? (
                  '–'
                ) : (
                  <Group gap={6} wrap="nowrap">
                    <Progress
                      value={l.vokabelnSicher * 100}
                      w={70}
                      size="sm"
                      color={l.vokabelnSicher < 0.3 ? 'red' : l.vokabelnSicher < 0.6 ? 'yellow' : 'teal'}
                    />
                    <Text size="xs">{prozent(l.vokabelnSicher)}</Text>
                  </Group>
                )}
              </Table.Td>
            )}
            {zeigtVokabeln && <Table.Td>{tag(l.zuletztGeuebt)}</Table.Td>}
            <Table.Td>{l.tests ? note(l.testSchnitt) : '–'}</Table.Td>
            {zeigtReihen && <Table.Td>{prozent(l.reihenFortschritt)}</Table.Td>}
            <Table.Td>{l.blaetterEingereicht}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
