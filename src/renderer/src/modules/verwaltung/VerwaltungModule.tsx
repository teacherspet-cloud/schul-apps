/**
 * Verwaltung – nur für Admins, nur auf dem Schul-Apps-Server (02.10.2026).
 *
 * Wunsch der Lehrkraft: „Für Admins soll eine Verwaltungs-App erstellt werden, in der die
 * wichtigsten Daten der Haupt- und Unter-Apps verwaltet werden können. Als Admin soll man
 * Logindaten für KIs, API-Keys etc. hinterlegen können, die auf Wunsch vom Admin von allen
 * Nutzern benutzt werden können." Dazu: Testkonten anlegen und löschen.
 *
 * Abos (ChatGPT, Claude) sind bewusst NICHT teilbar: Die Nutzungsbedingungen verbieten das
 * Teilen von Konten – jede Lehrkraft meldet ihr eigenes an (Einstellungen › KI-Zugang).
 */
import { ActionIcon, Alert, Badge, Button, Card, Code, Container, CopyButton, Group, Loader, Modal, PasswordInput, Select, SimpleGrid, Stack, Switch, Table, Tabs, Text, TextInput, Title, Tooltip } from '@mantine/core'
import { IconCheck, IconCopy, IconKey, IconLock, IconLockOpen, IconRefresh, IconTrash, IconUserPlus } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { serverIch } from '../../shared/plattform'

interface Uebersicht {
  nutzer: { id: string; benutzer: string; name: string; rolle: 'admin' | 'lehrkraft' | 'schueler'; quelle: string; gesperrt: boolean; eingerichtet: boolean; zuletzt: string | null; gruppen: number; passwortWechseln?: boolean }[]
  schluessel: { name: string; hinterlegt: string; fuerAlle: boolean }[]
  iserv: { aussteller: string; clientId: string; scopes: string; geheimnis: boolean }
  notzugang: boolean
  server: {
    speicher: { frei: number; gesamt: number; prozess: number }
    last: number[]
    platte: { frei: number; gesamt: number } | null
    stroeme: number
    laufzeit: number
    fassung: string
  }
}

const NAMEN: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic (Claude)', google: 'Google (Gemini)', elevenlabs: 'ElevenLabs (Hörtexte)', pixabay: 'Pixabay (Bilder)' }
const mb = (b: number): string => `${Math.round(b / 1024 / 1024)} MB`
const gb = (b: number): string => `${(b / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`

export default function VerwaltungModule({ active }: { active: boolean }): React.JSX.Element | null {
  const [d, setD] = useState<Uebersicht | null>(null)
  const [reiter, setReiter] = useState<string | null>('nutzer')
  const laden = useCallback(() => {
    void holen<Uebersicht>('/server/verwaltung/uebersicht')
      .then(setD)
      .catch((e: unknown) => notifyError(e))
  }, [])
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  if (!active) return null
  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="sm">
        <Title order={2}>Verwaltung</Title>
        <ActionIcon variant="subtle" onClick={laden} aria-label="Neu laden">
          <IconRefresh size={18} />
        </ActionIcon>
      </Group>
      {!d ? (
        <Loader />
      ) : (
        <Tabs value={reiter} onChange={setReiter}>
          <Tabs.List mb="md">
            <Tabs.Tab value="nutzer">Nutzer</Tabs.Tab>
            <Tabs.Tab value="ki">KI-Zugänge</Tabs.Tab>
            <Tabs.Tab value="iserv">IServ-Anbindung</Tabs.Tab>
            <Tabs.Tab value="hoertexte">Hörtexte</Tabs.Tab>
            <Tabs.Tab value="server">Server</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="nutzer">
            <Nutzer d={d} neu={laden} />
          </Tabs.Panel>
          <Tabs.Panel value="ki">
            <Schluessel d={d} neu={laden} />
          </Tabs.Panel>
          <Tabs.Panel value="iserv">
            <Iserv d={d} neu={laden} />
          </Tabs.Panel>
          <Tabs.Panel value="hoertexte">
            <Hoertexte />
          </Tabs.Panel>
          <Tabs.Panel value="server">
            <Server d={d} />
          </Tabs.Panel>
        </Tabs>
      )}
    </Container>
  )
}

function Nutzer({ d, neu }: { d: Uebersicht; neu: () => void }): React.JSX.Element {
  const [konto, setKonto] = useState<{ benutzer: string; passwort: string; titel?: string } | null>(null)
  const [rolle, setRolle] = useState<string>('lehrkraft')
  const [neuerNutzer, setNeuerNutzer] = useState({ benutzer: '', name: '', rolle: 'lehrkraft', passwort: '' })
  const ich = serverIch()?.benutzer
  // Gäste aus Onlinetests (ohne IServ) nur als Zahl – sonst würde die Liste mit jedem Test länger
  const gaeste = d.nutzer.filter((n) => n.quelle === 'gast').length
  const konten = d.nutzer.filter((n) => n.quelle !== 'gast')
  const anlegen = async (): Promise<void> => {
    try {
      const r = await senden<{ benutzer: string; passwort: string }>('/server/verwaltung/nutzer-anlegen', neuerNutzer)
      setKonto({ ...r, titel: 'Nutzer angelegt' })
      setNeuerNutzer({ benutzer: '', name: '', rolle: neuerNutzer.rolle, passwort: '' })
      neu()
    } catch (e) {
      notifyError(e)
    }
  }
  const zuruecksetzen = (n: Uebersicht['nutzer'][number]): void => {
    if (!window.confirm(`Für „${n.benutzer}" ein neues vorübergehendes Passwort erzeugen? Laufende Anmeldungen enden.`)) return
    void senden<{ benutzer: string; passwort: string }>('/server/verwaltung/passwort-zuruecksetzen', { id: n.id }).then(
      (r) => setKonto({ ...r, titel: 'Neues vorübergehendes Passwort' }),
      (e: unknown) => notifyError(e)
    )
  }
  const testkonto = async (): Promise<void> => {
    try {
      setKonto(await senden<{ benutzer: string; passwort: string }>('/server/verwaltung/testkonto', { rolle }))
      neu()
    } catch (e) {
      notifyError(e)
    }
  }
  const aendern = (id: string, patch: object): void => void senden('/server/verwaltung/nutzer', { id, ...patch }).then(neu, (e: unknown) => notifyError(e))
  const loeschen = (n: Uebersicht['nutzer'][number]): void => {
    if (!window.confirm(`Konto „${n.benutzer}" samt ALLER Daten (Material, Einstellungen, Abo-Anmeldung) löschen?`)) return
    void senden('/server/verwaltung/nutzer-loeschen', { id: n.id }).then(neu, (e: unknown) => notifyError(e))
  }
  return (
    <Stack>
      <Card withBorder data-nutzer-anlegen>
        <Text fw={600} mb="xs">
          Neuen Nutzer anlegen
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Benutzername"
            placeholder="m.mustermann"
            value={neuerNutzer.benutzer}
            onChange={(e) => setNeuerNutzer({ ...neuerNutzer, benutzer: e.currentTarget.value.toLowerCase() })}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-feld="benutzer"
          />
          <TextInput label="Name" placeholder="Max Mustermann" value={neuerNutzer.name} onChange={(e) => setNeuerNutzer({ ...neuerNutzer, name: e.currentTarget.value })} />
          <Select
            label="Rolle"
            data={[
              { value: 'lehrkraft', label: 'Lehrkraft' },
              { value: 'admin', label: 'Admin' },
              { value: 'schueler', label: 'Schüler/in' }
            ]}
            value={neuerNutzer.rolle}
            onChange={(v) => v && setNeuerNutzer({ ...neuerNutzer, rolle: v })}
            allowDeselect={false}
          />
          <TextInput
            label="Vorübergehendes Passwort"
            description="Leer lassen: wird erzeugt"
            value={neuerNutzer.passwort}
            onChange={(e) => setNeuerNutzer({ ...neuerNutzer, passwort: e.currentTarget.value })}
            autoComplete="off"
            data-feld="passwort"
          />
        </SimpleGrid>
        <Group justify="space-between" mt="sm">
          <Text size="xs" c="dimmed">
            Anmeldung mit Benutzername und Passwort; bei der ersten Anmeldung muss ein eigenes Passwort (mind. 10 Zeichen) festgelegt werden.
          </Text>
          <Button leftSection={<IconUserPlus size={16} />} disabled={neuerNutzer.benutzer.length < 2} onClick={() => void anlegen()}>
            Nutzer anlegen
          </Button>
        </Group>
      </Card>
      <Card withBorder>
        <Group align="end">
          <Select label="Testkonto anlegen als" data={[{ value: 'lehrkraft', label: 'Lehrkraft' }, { value: 'schueler', label: 'Schüler/in' }]} value={rolle} onChange={(v) => v && setRolle(v)} allowDeselect={false} w={200} />
          <Button leftSection={<IconUserPlus size={16} />} onClick={() => void testkonto()}>
            Testkonto anlegen
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Testkonten melden sich mit Benutzername und Passwort an (Anmeldeseite › Testkonto). Löschen entfernt das Konto mit allen Daten.
        </Text>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Konto</Table.Th>
            <Table.Th>Rolle</Table.Th>
            <Table.Th>Anmeldung</Table.Th>
            <Table.Th>Zuletzt</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {konten.map((n) => (
            <Table.Tr key={n.id} opacity={n.gesperrt ? 0.5 : 1}>
              <Table.Td>
                <Text fw={600}>{n.name}</Text>
                <Text size="xs" c="dimmed">
                  {n.benutzer}
                </Text>
              </Table.Td>
              <Table.Td>
                <Select
                  size="xs"
                  w={140}
                  data={[
                    { value: 'admin', label: 'Admin' },
                    { value: 'lehrkraft', label: 'Lehrkraft' },
                    { value: 'schueler', label: 'Schüler/in' }
                  ]}
                  value={n.rolle}
                  disabled={n.benutzer === ich}
                  onChange={(v) => v && aendern(n.id, { rolle: v })}
                  allowDeselect={false}
                />
              </Table.Td>
              <Table.Td>
                <Badge variant="light" color={n.quelle === 'iserv' ? 'blue' : n.quelle === 'test' ? 'grape' : n.quelle === 'lokal' ? 'teal' : 'orange'}>
                  {n.quelle === 'iserv' ? 'IServ' : n.quelle === 'test' ? 'Testkonto' : n.quelle === 'lokal' ? 'Passwort' : 'Notzugang'}
                </Badge>
                {n.passwortWechseln && (
                  <Text size="xs" c="dimmed">
                    vorübergehendes Passwort
                  </Text>
                )}
              </Table.Td>
              <Table.Td>{n.zuletzt ? new Date(n.zuletzt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</Table.Td>
              <Table.Td>
                {n.benutzer !== ich && (
                  <Group gap={4} justify="flex-end">
                    <Tooltip label={n.gesperrt ? 'Entsperren' : 'Sperren'}>
                      <ActionIcon variant="subtle" onClick={() => aendern(n.id, { gesperrt: !n.gesperrt })}>
                        {n.gesperrt ? <IconLockOpen size={16} /> : <IconLock size={16} />}
                      </ActionIcon>
                    </Tooltip>
                    {(n.quelle === 'lokal' || n.quelle === 'test') && (
                      <Tooltip label="Neues vorübergehendes Passwort">
                        <ActionIcon variant="subtle" onClick={() => zuruecksetzen(n)}>
                          <IconKey size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Löschen">
                      <ActionIcon variant="subtle" color="red" onClick={() => loeschen(n)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {gaeste > 0 && (
        <Text size="xs" c="dimmed">
          Dazu {gaeste} Gast{gaeste === 1 ? '' : 'e'} aus Onlinetests (Beitritt mit Namen, ohne IServ) – sie haben nur Zugang zu ihrem Test.
        </Text>
      )}
      {konto && (
        <Modal opened onClose={() => setKonto(null)} title={konto.titel ?? 'Testkonto angelegt'}>
          <Stack>
            <Alert color="orange">Das Passwort wird nur jetzt angezeigt.</Alert>
            {[
              ['Benutzername', konto.benutzer],
              ['Passwort', konto.passwort]
            ].map(([k, v]) => (
              <Group key={k} justify="space-between">
                <Text>{k}</Text>
                <Group gap={4}>
                  <Code fz="md">{v}</Code>
                  <CopyButton value={v}>
                    {({ copied, copy }) => (
                      <ActionIcon variant="subtle" onClick={copy}>
                        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                      </ActionIcon>
                    )}
                  </CopyButton>
                </Group>
              </Group>
            ))}
          </Stack>
        </Modal>
      )}
    </Stack>
  )
}

function Schluessel({ d, neu }: { d: Uebersicht; neu: () => void }): React.JSX.Element {
  const [werte, setWerte] = useState<Record<string, string>>({})
  const speichern = (name: string, patch: object): void =>
    void senden('/server/verwaltung/schluessel', { name, ...patch }).then(() => {
      notifySuccess('Gespeichert.')
      setWerte((w) => ({ ...w, [name]: '' }))
      neu()
    }, (e: unknown) => notifyError(e))
  return (
    <Stack>
      <Alert variant="light">
        Freigegebene API-Schlüssel nutzen alle Lehrkräfte, die keinen eigenen hinterlegt haben – die Kosten trägt das Konto des Schlüssels. Schlüssel liegen
        verschlüsselt auf dem Server und werden nie wieder angezeigt. ChatGPT-/Claude-Abos sind nicht teilbar (Nutzungsbedingungen): Jede Lehrkraft meldet ihr eigenes
        in den Einstellungen an.
      </Alert>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {d.schluessel.map((s) => (
          <Card key={s.name} withBorder>
            <Group justify="space-between" mb="xs">
              <Text fw={700}>{NAMEN[s.name] ?? s.name}</Text>
              {s.hinterlegt ? <Badge color="green">hinterlegt {s.hinterlegt}</Badge> : <Badge color="gray">kein Schlüssel</Badge>}
            </Group>
            <Group align="end">
              <PasswordInput
                style={{ flex: 1 }}
                leftSection={<IconKey size={14} />}
                placeholder={s.hinterlegt ? 'neuen Schlüssel eintragen' : 'Schlüssel eintragen'}
                value={werte[s.name] ?? ''}
                onChange={(e) => setWerte((w) => ({ ...w, [s.name]: e.currentTarget.value }))}
              />
              <Button disabled={!(werte[s.name] ?? '').trim()} onClick={() => speichern(s.name, { wert: werte[s.name] })}>
                Speichern
              </Button>
            </Group>
            <Group justify="space-between" mt="sm">
              <Switch label="Für alle Lehrkräfte freigeben" checked={s.fuerAlle} disabled={!s.hinterlegt} onChange={(e) => speichern(s.name, { fuerAlle: e.currentTarget.checked })} />
              {s.hinterlegt && (
                <Button size="xs" variant="subtle" color="red" onClick={() => window.confirm('Schlüssel entfernen?') && speichern(s.name, { wert: '', fuerAlle: false })}>
                  Entfernen
                </Button>
              )}
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  )
}

function Iserv({ d, neu }: { d: Uebersicht; neu: () => void }): React.JSX.Element {
  const [aussteller, setAussteller] = useState(d.iserv.aussteller)
  const [clientId, setClientId] = useState(d.iserv.clientId)
  const [geheimnis, setGeheimnis] = useState('')
  const adresse = serverIch()?.adresse ?? ''
  return (
    <Stack maw={640}>
      <Alert variant="light">
        Die IServ-Administration trägt Schul-Apps unter „System › Single-Sign-On“ ein (Anleitung: IServ-Freischaltung.md). Weiterleitungs-URI:{' '}
        <Code>{adresse}/auth/rueckruf</Code>
      </Alert>
      <TextInput label="IServ-Adresse" value={aussteller} onChange={(e) => setAussteller(e.currentTarget.value)} />
      <TextInput label="Client-ID" value={clientId} onChange={(e) => setClientId(e.currentTarget.value)} />
      <PasswordInput label="Client-Geheimnis" placeholder={d.iserv.geheimnis ? 'hinterlegt – leer lassen zum Behalten' : ''} value={geheimnis} onChange={(e) => setGeheimnis(e.currentTarget.value)} />
      <Group>
        <Button
          onClick={() =>
            void senden('/server/verwaltung/iserv', { aussteller, clientId, geheimnis }).then(() => {
              notifySuccess('IServ-Anbindung gespeichert.')
              setGeheimnis('')
              neu()
            }, (e: unknown) => notifyError(e))
          }
        >
          Speichern
        </Button>
        <Button component="a" href="/auth/iserv" target="_blank" variant="light" disabled={!d.iserv.clientId || !d.iserv.geheimnis}>
          Anmeldung testen
        </Button>
      </Group>
      <Switch
        mt="md"
        label="Notzugang (Anmeldung des Admins mit Passwort) erlauben"
        description="Abschalten, sobald die Anmeldung über IServ funktioniert. Testkonten gehen weiter."
        checked={d.notzugang}
        onChange={(e) => void senden('/server/verwaltung/notzugang', { an: e.currentTarget.checked }).then(neu, (er: unknown) => notifyError(er))}
      />
    </Stack>
  )
}

function Hoertexte(): React.JSX.Element {
  const [liste, setListe] = useState<{ kennung: string; benutzer: string; datei: string; titel: string; erstellt: string; abrufe: number }[] | null>(null)
  const laden = useCallback(() => void holen<{ freigaben: NonNullable<typeof liste> }>('/server/verwaltung/hoertexte').then((d) => setListe(d.freigaben), (e: unknown) => notifyError(e)), [])
  useEffect(laden, [laden])
  if (!liste) return <Loader />
  return (
    <Table striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Hörtext</Table.Th>
          <Table.Th>Lehrkraft</Table.Th>
          <Table.Th>Erstellt</Table.Th>
          <Table.Th>Abrufe</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {liste.map((f) => (
          <Table.Tr key={f.kennung}>
            <Table.Td>
              <a href={`/h/${f.kennung}`} target="_blank" rel="noreferrer">
                {f.titel || f.datei}
              </a>
            </Table.Td>
            <Table.Td>{f.benutzer}</Table.Td>
            <Table.Td>{new Date(f.erstellt).toLocaleDateString('de-DE')}</Table.Td>
            <Table.Td>{f.abrufe}</Table.Td>
            <Table.Td>
              <Button
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => window.confirm('Freigabe widerrufen? Der QR-Code auf gedruckten Blättern funktioniert dann nicht mehr.') && void senden('/server/verwaltung/hoertext-widerrufen', { kennung: f.kennung }).then(laden, (e: unknown) => notifyError(e))}
              >
                Widerrufen
              </Button>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

function Server({ d }: { d: Uebersicht }): React.JSX.Element {
  const s = d.server
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
      {[
        ['Fassung', s.fassung || '–'],
        ['Arbeitsspeicher', `${mb(s.speicher.gesamt - s.speicher.frei)} von ${mb(s.speicher.gesamt)} belegt (Schul-Apps: ${mb(s.speicher.prozess)})`],
        ['Platte', s.platte ? `${gb(s.platte.frei)} frei von ${gb(s.platte.gesamt)}` : '–'],
        ['Last (1/5/15 min)', s.last.map((x) => x.toFixed(2)).join(' / ')],
        ['Offene Verbindungen', String(s.stroeme)],
        ['Läuft seit', `${Math.round(s.laufzeit / 3600)} h`]
      ].map(([k, v]) => (
        <Card key={k} withBorder>
          <Text size="xs" c="dimmed">
            {k}
          </Text>
          <Text fw={600}>{v}</Text>
        </Card>
      ))}
    </SimpleGrid>
  )
}
