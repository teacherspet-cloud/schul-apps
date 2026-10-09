/**
 * Verwaltung für Admins auf dem Schul-Apps-Server (02.10.2026). Der Reiter „Daten und Material"
 * (03.10.–09.10.2026) entfällt: Fachschaft-Freigaben stehen in der Bibliothek jeder App, Themenbereiche
 * und Sicherung unter Einstellungen › Material; Lehrkräfte sehen die App nicht mehr.
 *
 * Wunsch der Lehrkraft: „Für Admins soll eine Verwaltungs-App erstellt werden, in der die
 * wichtigsten Daten der Haupt- und Unter-Apps verwaltet werden können. Als Admin soll man
 * Logindaten für KIs, API-Keys etc. hinterlegen können, die auf Wunsch vom Admin von allen
 * Nutzern benutzt werden können." Dazu: Testkonten anlegen und löschen.
 *
 * Abos (ChatGPT, Claude) sind bewusst NICHT teilbar: Die Nutzungsbedingungen verbieten das
 * Teilen von Konten – jede Lehrkraft meldet ihr eigenes an (Einstellungen › KI-Zugang).
 */
import { DokumentSuche } from '../../shared/components/AppSuche'
import { AppKopf } from '../../shared/components/AppKopf'
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Card,
  Code,
  Container,
  CopyButton,
  Group,
  Loader,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import { IconCheck, IconCopy, IconKey, IconLock, IconLockOpen, IconRefresh, IconSearch, IconTrash, IconUserPlus, IconUsersMinus } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { nutzerSuchen, QUELLEN_TEXT, SUCHE_MAX, SUCHE_MIN } from '@shared/nutzerSuche'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KlassenlisteKarte } from './Klassenliste'
import { KiZugaenge } from './KiZugaenge'
import { SchuleEinrichten } from './SchuleEinrichten'
import { SchulFachfarben } from './SchulFachfarben'
import { serverIch } from '../../shared/plattform'
import { ServerReiter } from './ServerReiter'
import MaskottchenSettings from '../../shell/MaskottchenSettings'
import { useAppSettings } from '../../shared/settingsStore'
import { useZielZeiger } from '../../shared/navigation'

interface Uebersicht {
  nutzer: {
    id: string
    benutzer: string
    name: string
    rolle: 'admin' | 'lehrkraft' | 'schueler'
    quelle: string
    gesperrt: boolean
    eingerichtet: boolean
    zuletzt: string | null
    gruppen: number
    passwortWechseln?: boolean
    /** Klasse eines Schülerkontos (Gruppe „klasse:…") */
    klasse?: string
  }[]
  /** Bekannte Klassen (Schülerkonten und Lerngruppen) für die Zuordnung */
  klassen?: string[]
  schluessel: { name: string; hinterlegt: string; fuerAlle: boolean }[]
  iserv: { aussteller: string; clientId: string; scopes: string; geheimnis: boolean; abgleichSchwelle?: number }
  notzugang: boolean
  ablage?: { muster: string; standard: string }
  server: {
    speicher: { frei: number; gesamt: number; prozess: number }
    last: number[]
    platte: { frei: number; gesamt: number } | null
    stroeme: number
    laufzeit: number
    fassung: string
  }
}

export default function VerwaltungModule({ active }: { active: boolean }): React.JSX.Element | null {
  const [d, setD] = useState<Uebersicht | null>(null)
  // „Daten und Material" entfällt (09.10.2026, Entscheidung des Admins) – erster Reiter ist jetzt „Nutzer"
  const [reiter, setReiter] = useState<string | null>('nutzer')
  const settings = useAppSettings((s) => s.settings)
  const update = useAppSettings((s) => s.update)
  // „Öffnen" eines Maskottchen-Auftrags führt in den Reiter Maskottchen
  useZielZeiger('verwaltung', (z) => z.baustein === 'maskottchen' && setReiter('maskottchen'))
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
      <Tabs value={reiter} onChange={setReiter}>
        {/* Gemeinsamer Kopf (Phase 6a): Reiter in der zweiten Zeile, Neu laden rechts */}
        <AppKopf
          suche={<DokumentSuche alle platzhalter="Alle Materialien durchsuchen …" />}
          zusaetze={
            <ActionIcon variant="default" size="lg" radius="md" onClick={laden} aria-label="Neu laden">
              <IconRefresh size={18} />
            </ActionIcon>
          }
          links={
            <Tabs.List style={{ borderBottom: 0 }}>
              <Tabs.Tab value="nutzer">Nutzer</Tabs.Tab>
              {/* Schul-Einrichtung des Servers (09.10.2026) */}
              <Tabs.Tab value="schule">Schule</Tabs.Tab>
              <Tabs.Tab value="ki">KI-Zugänge</Tabs.Tab>
              <Tabs.Tab value="iserv">IServ-Anbindung</Tabs.Tab>
              {/* „Hörtexte" entfernt (07.10.2026, Wunsch der Lehrkraft): eine lange, unübersichtliche Liste aller QR-Freigaben */}
              <Tabs.Tab value="maskottchen">Maskottchen</Tabs.Tab>
              <Tabs.Tab value="server">Server</Tabs.Tab>
            </Tabs.List>
          }
        />
        {!d ? (
          <Loader />
        ) : (
          <>
            <Tabs.Panel value="nutzer">
              <Nutzer d={d} neu={laden} />
            </Tabs.Panel>
            <Tabs.Panel value="schule">
              <Stack gap="lg">
                <SchuleEinrichten />
                {/* Fachfarben gelten für die ganze Schule (09.10.2026, SchulFachfarben.tsx) */}
                <SchulFachfarben />
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="ki">
              {/* Aufklappbare Anbieterkarten, OpenAI-kompatible Anbieter und KI-Nutzung (09.10.2026, KiZugaenge.tsx) */}
              <KiZugaenge schluessel={d.schluessel} neu={laden} />
            </Tabs.Panel>
            <Tabs.Panel value="iserv">
              <Iserv d={d} neu={laden} />
            </Tabs.Panel>
            <Tabs.Panel value="maskottchen">
              <MaskottchenSettings settings={settings} update={(p) => void update(p)} schule />
            </Tabs.Panel>
            <Tabs.Panel value="server">
              {/* Neu gestaltet (09.10.2026): Ampel, Verlauf, Nutzung, Platz, Sicherungen, Fehler (ServerReiter.tsx) */}
              <ServerReiter sichtbar={reiter === 'server'} zuKi={() => setReiter('ki')} />
            </Tabs.Panel>
          </>
        )}
      </Tabs>
    </Container>
  )
}

/** Klasse eines Schülerkontos: wählen oder neu eintippen; gespeichert wird beim Verlassen des Felds bzw. mit Enter */
function KlasseFeld({ wert, klassen, speichern }: { wert: string; klassen: string[]; speichern: (klasse: string) => void }): React.JSX.Element {
  const [text, setText] = useState(wert)
  useEffect(() => setText(wert), [wert])
  const fertig = (v = text): void => {
    if (v.trim() !== wert) speichern(v.trim())
  }
  return (
    <Autocomplete
      size="xs"
      w={120}
      placeholder="keine"
      data={klassen}
      value={text}
      onChange={setText}
      onOptionSubmit={(v) => (setText(v), fertig(v))}
      onBlur={() => fertig()}
      onKeyDown={(e) => e.key === 'Enter' && fertig()}
      aria-label="Klasse"
      data-klasse-feld
    />
  )
}

function Nutzer({ d, neu }: { d: Uebersicht; neu: () => void }): React.JSX.Element {
  const [konto, setKonto] = useState<{ benutzer: string; passwort: string; titel?: string } | null>(null)
  const [rolle, setRolle] = useState<string>('lehrkraft')
  const [neuerNutzer, setNeuerNutzer] = useState({ benutzer: '', name: '', rolle: 'lehrkraft', passwort: '', klasse: '' })
  const ich = serverIch()?.benutzer
  // Gäste aus Onlinetests (ohne IServ) nur als Zahl – sonst würde die Liste mit jedem Test länger
  const gaeste = d.nutzer.filter((n) => n.quelle === 'gast').length
  /*
   * Suche statt Liste aller Konten (09.10.2026, Wunsch des Admins): Bei einer ganzen Schule wurde die Liste unübersichtlich.
   * Treffer ab 2 Zeichen nach Name, Benutzername, Rolle, Anmeldeart und Klasse, höchstens 50.
   */
  const [suche, setSuche] = useState('')
  const ohneGaeste = useMemo(() => d.nutzer.filter((n) => n.quelle !== 'gast'), [d.nutzer])
  const { treffer: konten, gesamt } = useMemo(() => nutzerSuchen(ohneGaeste, suche), [ohneGaeste, suche])
  const zuKurz = suche.trim().length < SUCHE_MIN
  const anlegen = async (): Promise<void> => {
    try {
      const r = await senden<{ benutzer: string; passwort: string }>('/server/verwaltung/nutzer-anlegen', neuerNutzer)
      setKonto({ ...r, titel: 'Nutzer angelegt' })
      setNeuerNutzer({ benutzer: '', name: '', rolle: neuerNutzer.rolle, passwort: '', klasse: neuerNutzer.klasse })
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
          <TextInput
            label="Name"
            placeholder="Max Mustermann"
            value={neuerNutzer.name}
            onChange={(e) => setNeuerNutzer({ ...neuerNutzer, name: e.currentTarget.value })}
          />
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
          {neuerNutzer.rolle === 'schueler' && (
            <Autocomplete
              label="Klasse"
              description="Vorhandene wählen oder neue eintippen (z. B. 7a) – das Konto erscheint dann in jeder Lerngruppe dieser Klasse"
              placeholder="z. B. 7a"
              data={d.klassen ?? []}
              value={neuerNutzer.klasse}
              onChange={(v) => setNeuerNutzer({ ...neuerNutzer, klasse: v })}
              data-feld="klasse"
            />
          )}
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
      <KlassenlisteKarte fertig={neu} />
      <Card withBorder>
        <Group align="end">
          <Select
            label="Testkonto anlegen als"
            data={[
              { value: 'lehrkraft', label: 'Lehrkraft' },
              { value: 'schueler', label: 'Schüler/in' }
            ]}
            value={rolle}
            onChange={(v) => v && setRolle(v)}
            allowDeselect={false}
            w={200}
          />
          <Button leftSection={<IconUserPlus size={16} />} onClick={() => void testkonto()}>
            Testkonto anlegen
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Testkonten melden sich mit Benutzername und Passwort an (Anmeldeseite › Testkonto). Löschen entfernt das Konto mit allen Daten.
        </Text>
      </Card>
      <IservAbgleich d={d} neu={neu} />
      <Card withBorder data-nutzer-suche>
        <TextInput
          label="Nutzer suchen"
          description={`Name, Benutzername, Rolle, Anmeldeart oder Klasse – ab ${SUCHE_MIN} Zeichen. ${ohneGaeste.length} Konten insgesamt.`}
          placeholder="z. B. mustermann, 7a, Lehrkraft, IServ"
          leftSection={<IconSearch size={16} />}
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-feld="suche"
        />
        {!zuKurz && (
          <Text size="xs" c="dimmed" mt={6} data-suche-anzahl>
            {gesamt === 0
              ? 'Keine Treffer.'
              : gesamt > konten.length
                ? `${gesamt} Treffer, die ersten ${SUCHE_MAX} werden gezeigt – Suche genauer fassen.`
                : `${gesamt} Treffer`}
          </Text>
        )}
      </Card>
      {!zuKurz && konten.length > 0 && (
      <Table striped highlightOnHover data-karten>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Konto</Table.Th>
            <Table.Th>Rolle</Table.Th>
            <Table.Th>Klasse</Table.Th>
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
                {n.rolle === 'schueler' ? (
                  <KlasseFeld wert={n.klasse ?? ''} klassen={d.klassen ?? []} speichern={(klasse) => aendern(n.id, { klasse })} />
                ) : (
                  <Text size="xs" c="dimmed">
                    –
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Badge variant="light" color={n.quelle === 'iserv' ? 'blue' : n.quelle === 'test' ? 'grape' : n.quelle === 'lokal' ? 'teal' : 'orange'}>
                  {QUELLEN_TEXT[n.quelle] ?? 'Notzugang'}
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
                    {/* IServ-Konten nicht einzeln löschen (09.10.2026): Sie kämen bei der nächsten Anmeldung wieder; Abgänge entfernt „Mit IServ abgleichen" */}
                    {n.quelle !== 'iserv' && (
                      <Tooltip label="Löschen">
                        <ActionIcon variant="subtle" color="red" onClick={() => loeschen(n)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      )}
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

interface AbgleichErgebnis {
  geprueft: number
  iservAnzahl: number
  entfernen: { id: string; benutzer: string; name: string; rolle: string; zuletzt: string | null }[]
  /** Gastkonten mit IServ-Anmeldung (Code/QR + IServ) */
  verknuepft?: number
  /** Gastkonten, deren IServ-Person fehlt: nur die Verknüpfung wird gelöst */
  loesen?: { id: string; benutzer: string; name: string; rolle: string; zuletzt: string | null }[]
  abbruch?: string
  schwelle: number
  kennung: string
}

/**
 * „Mit IServ abgleichen" (09.10.2026): IServ-Konten, die es in IServ nicht mehr gibt, entfernen. Zwei Schritte – „Prüfen"
 * zeigt nur die Liste, „Entfernen" erst nach Rückfrage; der Server prüft dabei erneut und sichert vorher die Datenbank.
 */
function IservAbgleich({ d, neu }: { d: Uebersicht; neu: () => void }): React.JSX.Element {
  const [schwelle, setSchwelle] = useState<number>(d.iserv.abgleichSchwelle ?? 20)
  const [laeuft, setLaeuft] = useState(false)
  const [ergebnis, setErgebnis] = useState<AbgleichErgebnis | null>(null)
  const [fehler, setFehler] = useState('')
  const bereit = Boolean(d.iserv.clientId && d.iserv.geheimnis)
  const pruefen = async (): Promise<void> => {
    setLaeuft(true)
    setFehler('')
    setErgebnis(null)
    try {
      setErgebnis(await senden<AbgleichErgebnis>('/server/verwaltung/iserv-abgleich-pruefen', { schwelle }))
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
    }
  }
  const entfernen = async (): Promise<void> => {
    if (!ergebnis?.kennung) return
    const n = ergebnis.entfernen.length
    const l = ergebnis.loesen?.length ?? 0
    const frage = [
      n ? `${n} Konto${n === 1 ? '' : 'en'} samt ALLER Daten (Material, Ergebnisse, Einstellungen) endgültig entfernen?` : '',
      l ? `Bei ${l} Gastkonto${l === 1 ? '' : 'en'} die IServ-Anmeldung lösen (Konto und Code bleiben)?` : ''
    ]
      .filter(Boolean)
      .join(' ')
    if (!window.confirm(`${frage} Vorher wird die Datenbank gesichert.`)) return
    setLaeuft(true)
    try {
      const r = await senden<{ entfernt: number; geloest?: number; sicherung: string }>('/server/verwaltung/iserv-abgleich-entfernen', { kennung: ergebnis.kennung, bestaetigt: true })
      notifySuccess(
        `${r.entfernt} Konto${r.entfernt === 1 ? '' : 'en'} entfernt${r.geloest ? `, ${r.geloest} Verknüpfung${r.geloest === 1 ? '' : 'en'} gelöst` : ''}.${r.sicherung ? ` Sicherung: ${r.sicherung}` : ''}`
      )
      setErgebnis(null)
      neu()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      setErgebnis(null)
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Card withBorder data-iserv-abgleich>
      <Text fw={600} mb={4}>
        Mit IServ abgleichen
      </Text>
      <Text size="xs" c="dimmed" mb="xs">
        Konten mit IServ-Anmeldung, die es in IServ nicht mehr gibt, aus Schul-Apps entfernen. „Prüfen“ zeigt zuerst die Liste, entfernt wird erst nach
        Bestätigung. Admins, das eigene Konto und Konten ohne IServ bleiben immer.
      </Text>
      {!bereit ? (
        <Text size="sm" c="dimmed">
          Erst die IServ-Anbindung einrichten (Reiter „IServ-Anbindung“).
        </Text>
      ) : (
        <Group align="end">
          <NumberInput
            label="Abbrechen ab (%)"
            description="Würden mehr IServ-Konten entfernt, passiert nichts"
            min={1}
            max={100}
            w={220}
            value={schwelle}
            onChange={(v) => setSchwelle(typeof v === 'number' ? v : Number(v) || 20)}
            data-abgleich-schwelle
          />
          <Button variant="light" leftSection={<IconSearch size={16} />} loading={laeuft && !ergebnis} onClick={() => void pruefen()} data-abgleich-pruefen>
            Prüfen
          </Button>
        </Group>
      )}
      {fehler && (
        <Alert color="red" mt="sm" data-abgleich-fehler>
          {fehler}
        </Alert>
      )}
      {ergebnis && (
        <Stack gap="xs" mt="sm" data-abgleich-ergebnis>
          <Text size="sm">
            {ergebnis.geprueft} IServ-Konten in Schul-Apps geprüft, IServ kennt {ergebnis.iservAnzahl} Konten.{' '}
            {ergebnis.entfernen.length ? `${ergebnis.entfernen.length} fehlen in IServ:` : 'Alle sind noch in IServ vorhanden.'}
          </Text>
          {(ergebnis.loesen?.length ?? 0) > 0 && (
            <Text size="sm" data-abgleich-loesen>
              Dazu {ergebnis.loesen!.length} von {ergebnis.verknuepft ?? 0} Gastkonten mit IServ-Anmeldung, deren Person in IServ fehlt – dort wird nur die
              Verknüpfung gelöst, Konto und Code bleiben: {ergebnis.loesen!.map((n) => n.name).join(', ')}
            </Text>
          )}
          {ergebnis.abbruch && <Alert color="orange">{ergebnis.abbruch}</Alert>}
          {ergebnis.entfernen.length > 0 && (
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Konto</Table.Th>
                  <Table.Th>Rolle</Table.Th>
                  <Table.Th>Zuletzt angemeldet</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {ergebnis.entfernen.map((n) => (
                  <Table.Tr key={n.id}>
                    <Table.Td>
                      <Text fw={600}>{n.name}</Text>
                      <Text size="xs" c="dimmed">
                        {n.benutzer}
                      </Text>
                    </Table.Td>
                    <Table.Td>{n.rolle === 'schueler' ? 'Schüler/in' : n.rolle === 'lehrkraft' ? 'Lehrkraft' : n.rolle}</Table.Td>
                    <Table.Td>{n.zuletzt ? new Date(n.zuletzt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {ergebnis.kennung && (
            <Group>
              <Button color="red" leftSection={<IconUsersMinus size={16} />} loading={laeuft} onClick={() => void entfernen()} data-abgleich-entfernen>
                Entfernen ({ergebnis.entfernen.length + (ergebnis.loesen?.length ?? 0)})
              </Button>
              <Button variant="subtle" onClick={() => setErgebnis(null)}>
                Abbrechen
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Card>
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
      <PasswordInput
        label="Client-Geheimnis"
        placeholder={d.iserv.geheimnis ? 'hinterlegt – leer lassen zum Behalten' : ''}
        value={geheimnis}
        onChange={(e) => setGeheimnis(e.currentTarget.value)}
      />
      <Group>
        <Button
          onClick={() =>
            void senden('/server/verwaltung/iserv', { aussteller, clientId, geheimnis }).then(
              () => {
                notifySuccess('IServ-Anbindung gespeichert.')
                setGeheimnis('')
                neu()
              },
              (e: unknown) => notifyError(e)
            )
          }
        >
          Speichern
        </Button>
        <Button component="a" href="/auth/iserv" target="_blank" variant="light" disabled={!d.iserv.clientId || !d.iserv.geheimnis}>
          Anmeldung testen
        </Button>
      </Group>
      <AblageStruktur d={d} neu={neu} />
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

/**
 * Ordnerstruktur für „In IServ ablegen" aus „Meine Klassen" (06.10.2026): gilt für alle Lehrkräfte. Platzhalter {Klasse},
 * {Fach}, {Schuljahr}; Standard „Gruppen/Klasse {Klasse}/{Fach}".
 */
function AblageStruktur({ d, neu }: { d: Uebersicht; neu: () => void }): React.JSX.Element {
  const standard = d.ablage?.standard ?? 'Gruppen/Klasse {Klasse}/{Fach}'
  const [muster, setMuster] = useState(d.ablage?.muster ?? standard)
  const beispiel = muster
    .replace(/\{Klasse\}/g, '10b')
    .replace(/\{Fach\}/g, 'Englisch')
    .replace(/\{Schuljahr\}/g, '2026-27')
  return (
    <Stack gap={4} mt="md" data-ablage-struktur>
      <TextInput
        label="Ablage in IServ (aus „Meine Klassen“)"
        description="Ordner für „In IServ ablegen“. Platzhalter: {Klasse}, {Fach}, {Schuljahr}. Gilt für alle Lehrkräfte."
        value={muster}
        onChange={(e) => setMuster(e.currentTarget.value)}
        data-ablage-muster
      />
      <Text size="xs" c="dimmed">
        Beispiel: {beispiel.split('/').join(' › ')}
      </Text>
      <Group gap="xs">
        <Button
          size="xs"
          onClick={() =>
            void senden('/server/verwaltung/iserv-ablage', { muster }).then(
              () => (notifySuccess('Ablagestruktur gespeichert.'), neu()),
              (e: unknown) => notifyError(e)
            )
          }
          data-ablage-speichern
        >
          Speichern
        </Button>
        <Button size="xs" variant="subtle" onClick={() => setMuster(standard)}>
          Standard
        </Button>
      </Group>
    </Stack>
  )
}
