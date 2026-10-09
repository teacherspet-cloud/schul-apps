/**
 * Reiter „Server" der Verwaltung (09.10.2026, Wunsch des Admins: klar, einfach, intuitiv, mit Diagrammen).
 *
 *  1. Ampel oben: „Alles in Ordnung" oder was Aufmerksamkeit braucht – mit dem, was zu tun ist.
 *  2. Verlauf: Auslastung und Arbeitsspeicher (24 Stunden / 7 Tage).
 *  3. Nutzung: aktive Lehrkräfte und Lernende je Tag (nur Zahlen), langsame Anfragen.
 *  4. Platz und Sicherungen: Ring der Plattenbelegung, Liste der Sicherungen, Zertifikat, „Sicherung jetzt anlegen".
 *  5. KI: Anfragen über die Schlüssel der Schule je Tag – die Einzelheiten stehen unter „KI-Zugänge".
 *  6. Fehler: gleiche Meldungen zusammengefasst, mit Hinweis.
 * Genaue Zahlen, Rohprotokolle und Diagnose unter „Technische Details" (im Expertenmodus gleich offen).
 * Daten: GET /server/verwaltung/zustand (server/serverZustand.ts).
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Collapse,
  Group,
  Loader,
  Progress,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton
} from '@mantine/core'
import { IconAlertTriangle, IconChevronDown, IconChevronRight, IconCircleCheck, IconDatabaseExport, IconInfoCircle, IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { useExperte } from '../../shared/settingsStore'
import { LinienDiagramm, RingDiagramm, SaeulenDiagramm, useReihenFarben } from './ServerDiagramme'

type Stufe = 'ok' | 'hinweis' | 'warnung' | 'kritisch'
interface Befund {
  stufe: Stufe
  titel: string
  tun: string
}
interface Messwert {
  zeit: number
  cpu: number
  system: number
  prozess: number
  prozessByte: number
}
interface TagesZahl {
  tag: string
  lehrkraefte: number
  lernende: number
  anfragen: number
  langsam: number
  fehler: number
  ms: number
}
interface FehlerGruppe {
  meldung: string
  quelle: 'server' | 'browser' | 'protokoll'
  anzahl: number
  zuletzt: string
  hinweis: string
}
interface Zustand {
  gesundheit: Befund[]
  jetzt: {
    cpu: number
    prozessCpu: number
    kerne: number
    last: number[]
    systemAnteil: number
    prozessAnteil: number
    prozessByte: number
    speicher: { frei: number; gesamt: number }
    container: { belegt: number; grenze: number } | null
    platte: { frei: number; gesamt: number } | null
    stroeme: number
    aktiv: { lehrkraefte: number; lernende: number }
    laufzeit: number
  }
  verlauf: Messwert[]
  tage: TagesZahl[]
  platz: {
    datenbank: number
    medienbank: number
    ablagen: number
    sicherungen: number
    sonstiges: number
    ausserhalb: number
    frei: number
    gesamt: number
    zeit: number
    unvollstaendig: boolean
  } | null
  platzWirdGezaehlt: boolean
  sicherungen: { name: string; ort: 'sicherungen' | 'daten'; groesse: number; zeit: number }[]
  sicherung: { laeuft: boolean; schritt: string; anteil: number; meldung: string; datei: string; zeit: number }
  tls: { name: string; bis: number }[]
  ki: { tag: string; auftraege: number; anfragen: number }[] | null
  fehler: { letzte24h: number; gruppen: FehlerGruppe[] }
}

export const groesseText = (b: number): string =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const pz = (x: number): string => `${Math.round(x * 100)} %`
const datumZeit = (ms: number): string => new Date(ms).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const datum = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
const uhrzeit = (ms: number): string => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
const tagKurz = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })
const vorZeit = (ms: number): string => {
  const h = (Date.now() - ms) / 36e5
  return h < 1 ? 'vor weniger als einer Stunde' : h < 48 ? `vor ${Math.floor(h)} Stunden` : `vor ${Math.floor(h / 24)} Tagen`
}

const FARBE: Record<Stufe, string> = { ok: 'green', hinweis: 'blue', warnung: 'yellow', kritisch: 'red' }
const QUELLE: Record<FehlerGruppe['quelle'], string> = { server: 'Server', browser: 'Browser', protokoll: 'Protokoll' }

/** Ein-/ausklappbarer Abschnitt */
function Klappe({ titel, offen, setOffen, children }: { titel: string; offen: boolean; setOffen: (o: boolean) => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <UnstyledButton onClick={() => setOffen(!offen)} aria-expanded={offen}>
        <Group gap={6}>
          {offen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <Text fw={600} size="sm">
            {titel}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={offen}>
        <div style={{ paddingTop: 8 }}>{children}</div>
      </Collapse>
    </div>
  )
}

function Kennzahl({ satz, zusatz, anteil, farbe }: { satz: string; zusatz?: string; anteil?: number; farbe?: string }): React.JSX.Element {
  return (
    <Card withBorder padding="md">
      <Text fw={600}>{satz}</Text>
      {anteil !== undefined && <Progress value={Math.min(100, anteil * 100)} color={farbe ?? 'blue'} size="sm" mt={8} aria-hidden />}
      {zusatz && (
        <Text size="xs" c="dimmed" mt={6}>
          {zusatz}
        </Text>
      )}
    </Card>
  )
}

const ampelFarbe = (x: number, warn: number, krit: number): string => (x >= krit ? 'red' : x >= warn ? 'yellow' : 'teal')

export function ServerReiter({ sichtbar, zuKi }: { sichtbar: boolean; zuKi: () => void }): React.JSX.Element {
  const experte = useExperte()
  const farben = useReihenFarben()
  const [z, setZ] = useState<Zustand | null>(null)
  const [zeitraum, setZeitraum] = useState<'24h' | '7d'>('24h')
  const [technik, setTechnik] = useState(experte)
  const [alleSicherungen, setAlleSicherungen] = useState(false)
  const laden = useCallback(() => {
    void holen<Zustand>(`/server/verwaltung/zustand?zeitraum=${zeitraum}`).then(setZ, (e: unknown) => notifyError(e))
  }, [zeitraum])
  useEffect(() => {
    if (!sichtbar) return
    laden()
    // Jede Minute aktualisieren, solange der Reiter offen ist; während einer Sicherung öfter
    const t = setInterval(() => document.visibilityState === 'visible' && laden(), z?.sicherung.laeuft ? 1500 : 60_000)
    return () => clearInterval(t)
  }, [sichtbar, laden, z?.sicherung.laeuft])

  if (!z) return <Loader />
  const j = z.jetzt
  const speicherAnteil = j.container ? j.container.belegt / j.container.grenze : j.systemAnteil
  const platteFrei = j.platte && j.platte.gesamt ? j.platte.frei / j.platte.gesamt : null
  const heute = z.tage[z.tage.length - 1]
  const sicherungAnlegen = (): void => {
    void senden<{ ok: boolean }>('/server/verwaltung/sicherung', {}).then(
      () => (notifySuccess('Die Sicherung läuft …'), laden()),
      (e: unknown) => notifyError(e)
    )
  }
  const sicherungen = alleSicherungen ? z.sicherungen : z.sicherungen.slice(0, 5)
  const tlsBald = z.tls.length ? Math.min(...z.tls.map((t) => t.bis)) : null

  return (
    <Stack gap="md" maw={1200} data-server-reiter>
      {/* 1. Ampel */}
      {z.gesundheit.length === 0 ? (
        <Alert color="green" variant="light" icon={<IconCircleCheck />} title="Alles in Ordnung" data-server-ampel="ok">
          Auslastung, Speicher, Platz, Sicherung und Zertifikat sind im grünen Bereich.
        </Alert>
      ) : (
        <Alert
          color={FARBE[z.gesundheit[0].stufe]}
          variant="light"
          icon={z.gesundheit[0].stufe === 'hinweis' ? <IconInfoCircle /> : <IconAlertTriangle />}
          title={z.gesundheit.length === 1 ? 'Eine Sache braucht Aufmerksamkeit' : `${z.gesundheit.length} Dinge brauchen Aufmerksamkeit`}
          data-server-ampel={z.gesundheit[0].stufe}
        >
          <Stack gap={6}>
            {z.gesundheit.map((b) => (
              <div key={b.titel}>
                <Group gap={6} wrap="nowrap" align="baseline">
                  <Badge size="xs" color={FARBE[b.stufe]} variant="filled" style={{ flexShrink: 0 }}>
                    {b.stufe === 'kritisch' ? 'dringend' : b.stufe === 'warnung' ? 'bald' : 'Hinweis'}
                  </Badge>
                  <Text size="sm" fw={600}>
                    {b.titel}
                  </Text>
                </Group>
                <Text size="sm" c="dimmed" ml={4}>
                  {b.tun}
                </Text>
              </div>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Kurz gesagt */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <Kennzahl satz={`Der Server ist zu ${pz(j.cpu)} ausgelastet.`} anteil={j.cpu} farbe={ampelFarbe(j.cpu, 0.7, 0.9)} zusatz="Last der Prozessoren in der letzten Minute" />
        <Kennzahl
          satz={`Arbeitsspeicher zu ${pz(speicherAnteil)} belegt.`}
          anteil={speicherAnteil}
          farbe={ampelFarbe(speicherAnteil, 0.8, 0.92)}
          zusatz={`Schul-Apps braucht ${groesseText(j.prozessByte)}${j.container ? ` von ${groesseText(j.container.grenze)}` : ''}`}
        />
        <Kennzahl
          satz={platteFrei === null ? 'Platz auf der Platte unbekannt.' : `Auf der Platte ist ${pz(platteFrei)} frei.`}
          anteil={platteFrei === null ? undefined : 1 - platteFrei}
          farbe={platteFrei === null ? undefined : ampelFarbe(1 - platteFrei, 0.85, 0.95)}
          zusatz={j.platte ? `${groesseText(j.platte.frei)} von ${groesseText(j.platte.gesamt)}` : undefined}
        />
        <Kennzahl
          satz={`Gerade aktiv: ${j.aktiv.lehrkraefte} ${j.aktiv.lehrkraefte === 1 ? 'Lehrkraft' : 'Lehrkräfte'}, ${j.aktiv.lernende} Lernende`}
          zusatz={`in den letzten 15 Minuten · ${j.stroeme} offene Verbindungen`}
        />
      </SimpleGrid>

      {/* 2. Verlauf */}
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Title order={5}>Auslastung im Verlauf</Title>
          <SegmentedControl
            size="xs"
            value={zeitraum}
            onChange={(v) => setZeitraum(v as '24h' | '7d')}
            data={[
              { value: '24h', label: '24 Stunden' },
              { value: '7d', label: '7 Tage' }
            ]}
          />
        </Group>
        {z.verlauf.length < 2 ? (
          <Text size="sm" c="dimmed">
            Die ersten Messwerte erscheinen einige Minuten nach dem Start (gemessen wird alle 5 Minuten).
          </Text>
        ) : (
          <LinienDiagramm
            zeiten={z.verlauf.map((m) => m.zeit)}
            zeitText={zeitraum === '7d' ? tagKurz : uhrzeit}
            reihen={[
              { name: 'Prozessoren', farbe: farben[0], werte: z.verlauf.map((m) => m.cpu) },
              { name: 'Arbeitsspeicher (System)', farbe: farben[1], werte: z.verlauf.map((m) => m.system) },
              { name: j.container ? 'Schul-Apps (vom Container-Limit)' : 'Schul-Apps', farbe: farben[2], werte: z.verlauf.map((m) => m.prozess) }
            ]}
            beschreibung={`Auslastung der letzten ${zeitraum === '7d' ? '7 Tage' : '24 Stunden'}: Prozessoren im Mittel ${pz(
              z.verlauf.reduce((s, m) => s + m.cpu, 0) / z.verlauf.length
            )}, höchstens ${pz(Math.max(...z.verlauf.map((m) => m.cpu)))}; Arbeitsspeicher höchstens ${pz(Math.max(...z.verlauf.map((m) => m.system)))}.`}
          />
        )}
      </Card>

      {/* 3. Nutzung */}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Title order={5}>Aktive Konten je Tag</Title>
          <Text size="sm" c="dimmed" mb="xs">
            Heute {heute?.lehrkraefte ?? 0} Lehrkräfte und {heute?.lernende ?? 0} Lernende (nur Zahlen, keine Namen).
          </Text>
          <SaeulenDiagramm
            tage={z.tage.map((t) => t.tag)}
            reihen={[
              { name: 'Lehrkräfte', farbe: farben[0], werte: z.tage.map((t) => t.lehrkraefte) },
              { name: 'Lernende', farbe: farben[2], werte: z.tage.map((t) => t.lernende) }
            ]}
            beschreibung={`Aktive Konten der letzten 14 Tage: ${z.tage.map((t) => `${t.tag}: ${t.lehrkraefte} Lehrkräfte, ${t.lernende} Lernende`).join('; ')}`}
          />
        </Card>
        <Card withBorder>
          <Title order={5}>Langsame Anfragen je Tag</Title>
          <Text size="sm" c="dimmed" mb="xs">
            {heute && heute.anfragen
              ? `Heute ${heute.anfragen} Anfragen, im Mittel ${Math.round(heute.ms / heute.anfragen)} ms; ${heute.langsam} brauchten länger als 1 Sekunde.`
              : 'Heute noch keine Anfragen gezählt.'}
          </Text>
          <SaeulenDiagramm
            tage={z.tage.map((t) => t.tag)}
            reihen={[{ name: 'Länger als 1 Sekunde', farbe: farben[1], werte: z.tage.map((t) => t.langsam) }]}
            beschreibung={`Anfragen über 1 Sekunde je Tag: ${z.tage.map((t) => `${t.tag}: ${t.langsam}`).join('; ')}`}
          />
        </Card>
      </SimpleGrid>

      {/* 4. Platz und Sicherungen */}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Title order={5} mb="xs">
            Platz auf der Platte
          </Title>
          {z.platz ? (
            <>
              <RingDiagramm
                mitte={pz(z.platz.gesamt ? z.platz.frei / z.platz.gesamt : 0)}
                unten="frei"
                wertText={groesseText}
                teile={[
                  { name: 'Datenbank', wert: z.platz.datenbank, farbe: farben[0] },
                  { name: 'Medienbank', wert: z.platz.medienbank, farbe: farben[1] },
                  { name: 'Ablagen und Fachordner', wert: z.platz.ablagen, farbe: farben[2] },
                  { name: 'Sicherungen', wert: z.platz.sicherungen, farbe: farben[3] },
                  { name: 'Sonstiges (System, Protokolle …)', wert: z.platz.sonstiges + z.platz.ausserhalb, farbe: 'var(--mantine-color-gray-6)' },
                  { name: 'Frei', wert: z.platz.frei, farbe: 'var(--mantine-color-default-border)' }
                ]}
              />
              <Text size="xs" c="dimmed" mt="xs">
                Gezählt {vorZeit(z.platz.zeit)} (höchstens einmal je Stunde){z.platz.unvollstaendig ? ' – sehr viele Dateien, Werte sind Mindestgrößen' : ''}.
              </Text>
            </>
          ) : (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                Der Platz wird gerade gezählt – gleich neu laden.
              </Text>
            </Group>
          )}
        </Card>
        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Title order={5}>Sicherungen</Title>
            <Button size="xs" leftSection={<IconDatabaseExport size={16} />} onClick={sicherungAnlegen} loading={z.sicherung.laeuft} data-sicherung-anlegen>
              Sicherung jetzt anlegen
            </Button>
          </Group>
          {z.sicherung.laeuft && (
            <Stack gap={4} mb="xs">
              <Text size="sm">{z.sicherung.schritt === 'kopieren' ? 'Datenbank wird kopiert …' : `Wird gepackt … ${pz(z.sicherung.anteil)}`}</Text>
              <Progress value={z.sicherung.schritt === 'kopieren' ? 5 : 5 + z.sicherung.anteil * 95} animated size="sm" />
            </Stack>
          )}
          {!z.sicherung.laeuft && z.sicherung.schritt === 'fehler' && (
            <Alert color="red" variant="light" mb="xs">
              {z.sicherung.meldung}
            </Alert>
          )}
          {!z.sicherung.laeuft && z.sicherung.schritt === 'fertig' && Date.now() - z.sicherung.zeit < 10 * 60_000 && (
            <Alert color="green" variant="light" mb="xs">
              Sicherung angelegt: {z.sicherung.datei}
            </Alert>
          )}
          {z.sicherungen.length ? (
            <Text size="sm" mb="xs">
              Letzte Sicherung {vorZeit(z.sicherungen[0].zeit)} ({datumZeit(z.sicherungen[0].zeit)}).
            </Text>
          ) : (
            <Text size="sm" c="dimmed" mb="xs">
              Noch keine Sicherung vorhanden.
            </Text>
          )}
          {z.sicherungen.length > 0 && (
            <Table striped verticalSpacing={4} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Angelegt</Table.Th>
                  <Table.Th>Größe</Table.Th>
                  <Table.Th>Art</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sicherungen.map((s) => (
                  <Table.Tr key={`${s.ort}/${s.name}`} title={s.name}>
                    <Table.Td>{datumZeit(s.zeit)}</Table.Td>
                    <Table.Td>{groesseText(s.groesse)}</Table.Td>
                    <Table.Td>{s.ort === 'daten' ? 'vor einer Änderung' : s.name.endsWith('.gz') ? 'gepackt' : 'Kopie'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {z.sicherungen.length > 5 && (
            <Button size="compact-xs" variant="subtle" mt={4} onClick={() => setAlleSicherungen(!alleSicherungen)}>
              {alleSicherungen ? 'Weniger zeigen' : `Alle ${z.sicherungen.length} zeigen`}
            </Button>
          )}
          <Text size="xs" c="dimmed" mt="xs">
            Behalten werden die neuesten 14 im Ordner „sicherungen“. Eine Sicherung gehört zusätzlich außerhalb des Servers abgelegt.
          </Text>
          <Text size="sm" mt="sm">
            {tlsBald === null
              ? 'Kein Zertifikat gefunden (Server läuft ohne eigenes Zertifikat).'
              : `Zertifikat gültig bis ${datum(tlsBald)} (noch ${Math.max(0, Math.floor((tlsBald - Date.now()) / 864e5))} Tage).`}
          </Text>
        </Card>
      </SimpleGrid>

      {/* 5. KI */}
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <div>
            <Title order={5}>KI über die Schlüssel der Schule</Title>
            <Text size="xs" c="dimmed">
              Nur Anfragen mit den hier hinterlegten Schlüsseln – eigene Zugänge der Lehrkräfte zählen nicht.
            </Text>
          </div>
          <Button size="xs" variant="light" onClick={zuKi} data-zu-ki>
            Details unter KI-Zugänge
          </Button>
        </Group>
        {z.ki ? (
          <SaeulenDiagramm
            tage={z.ki.map((t) => t.tag)}
            reihen={[{ name: 'Anfragen', farbe: farben[3], werte: z.ki.map((t) => t.anfragen || t.auftraege) }]}
            beschreibung={`KI-Anfragen je Tag: ${z.ki.map((t) => `${t.tag}: ${t.anfragen || t.auftraege}`).join('; ')}`}
            hoehe={120}
          />
        ) : (
          <Text size="sm" c="dimmed">
            Noch keine Zahlen.
          </Text>
        )}
      </Card>

      {/* 6. Fehler */}
      <Fehler z={z} />

      {/* Technische Details */}
      <Card withBorder>
        <Klappe titel="Technische Details" offen={technik} setOffen={setTechnik}>
          <TechnischeDetails z={z} />
        </Klappe>
      </Card>
    </Stack>
  )
}

function Fehler({ z }: { z: Zustand }): React.JSX.Element {
  const [alle, setAlle] = useState<{ gruppen: FehlerGruppe[]; roh: { zeit: string; quelle: string; text: string }[] } | null>(null)
  const [roh, setRoh] = useState(false)
  const gruppen = alle?.gruppen ?? z.fehler.gruppen
  const ladeAlle = (): void => void holen<typeof alle>('/server/verwaltung/fehler').then(setAlle, (e: unknown) => notifyError(e))
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <div>
          <Title order={5}>Fehler</Title>
          <Text size="sm" c="dimmed">
            {z.fehler.letzte24h ? `${z.fehler.letzte24h} in den letzten 24 Stunden, gleiche Meldungen zusammengefasst (7 Tage).` : 'Keine Fehler in den letzten 24 Stunden.'}
          </Text>
        </div>
        <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={ladeAlle}>
          {alle ? 'Neu laden' : 'Alle zeigen'}
        </Button>
      </Group>
      {gruppen.length === 0 ? (
        <Text size="sm" c="dimmed">
          In den letzten 7 Tagen wurden keine Fehler aufgezeichnet.
        </Text>
      ) : (
        <Stack gap={6}>
          {gruppen.map((g) => (
            <Card key={`${g.quelle}|${g.meldung}`} withBorder padding="xs" data-fehler-gruppe>
              <Group gap={8} wrap="nowrap" align="flex-start">
                <Badge variant="light" color={g.anzahl >= 10 ? 'red' : 'gray'} style={{ flexShrink: 0 }}>
                  {g.anzahl}×
                </Badge>
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" style={{ wordBreak: 'break-word' }}>
                    {g.meldung.length > 220 ? `${g.meldung.slice(0, 220)} …` : g.meldung}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {QUELLE[g.quelle]} · zuletzt {g.zuletzt ? datumZeit(Date.parse(g.zuletzt)) : 'unbekannt'}
                  </Text>
                  {g.hinweis && (
                    <Text size="xs" c="blue" mt={2}>
                      {g.hinweis}
                    </Text>
                  )}
                </div>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
      {alle && (
        <div style={{ marginTop: 12 }}>
          <Klappe titel={`Rohprotokoll (${alle.roh.length} Zeilen)`} offen={roh} setOffen={setRoh}>
            <ScrollArea h={300}>
              <Code block fz="xs">
                {alle.roh.map((r) => `${r.zeit} [${r.quelle}] ${r.text}`).join('\n')}
              </Code>
            </ScrollArea>
          </Klappe>
        </div>
      )}
    </Card>
  )
}

function TechnischeDetails({ z }: { z: Zustand }): React.JSX.Element {
  const j = z.jetzt
  const [datei, setDatei] = useState<string>('')
  const [zeilen, setZeilen] = useState<string[] | null>(null)
  const zeige = (was: 'langsam' | 'browser' | 'protokoll'): void => {
    setDatei(was)
    setZeilen(null)
    if (was === 'protokoll')
      void holen<{ eintraege: { zeit: string; art: string; text: string }[] }>('/server/verwaltung/protokoll?anzahl=300').then(
        (r) => setZeilen(r.eintraege.map((e) => `${e.zeit} [${e.art}] ${e.text}`)),
        (e: unknown) => notifyError(e)
      )
    else
      void holen<{ zeilen: string[] }>(`/server/verwaltung/diagnose?datei=${was}&anzahl=500`).then(
        (r) => setZeilen([...r.zeilen].reverse()),
        (e: unknown) => notifyError(e)
      )
  }
  const werte: [string, string][] = [
    ['Last (1/5/15 min)', `${j.last.map((x) => x.toFixed(2)).join(' / ')} bei ${j.kerne} Kernen`],
    ['Schul-Apps: Prozessor', `${pz(j.prozessCpu)} eines Kerns (seit der letzten Abfrage)`],
    ['Arbeitsspeicher System', `${groesseText(j.speicher.gesamt - j.speicher.frei)} von ${groesseText(j.speicher.gesamt)} belegt`],
    ['Container', j.container ? `${groesseText(j.container.belegt)} von ${groesseText(j.container.grenze)} (Limit)` : 'kein Limit erkannt'],
    ['Schul-Apps (RSS)', groesseText(j.prozessByte)],
    ['Platte', j.platte ? `${groesseText(j.platte.frei)} frei von ${groesseText(j.platte.gesamt)}` : '–'],
    ['Offene Verbindungen', String(j.stroeme)],
    ['Läuft seit', `${Math.round(j.laufzeit / 3600)} h`],
    ['Zertifikate', z.tls.length ? z.tls.map((t) => `${t.name}: bis ${datumZeit(t.bis)}`).join(' · ') : '–']
  ]
  if (z.platz)
    werte.push([
      'Platz im Datenordner',
      `Datenbank ${groesseText(z.platz.datenbank)}, Medienbank ${groesseText(z.platz.medienbank)}, Ablagen ${groesseText(z.platz.ablagen)}, Sicherungen ${groesseText(
        z.platz.sicherungen
      )}, Sonstiges ${groesseText(z.platz.sonstiges)}, außerhalb ${groesseText(z.platz.ausserhalb)}`
    ])
  return (
    <Stack gap="sm">
      <Table verticalSpacing={4} fz="sm">
        <Table.Tbody>
          {werte.map(([k, v]) => (
            <Table.Tr key={k}>
              <Table.Td c="dimmed" w={220}>
                {k}
              </Table.Td>
              <Table.Td>{v}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group gap="xs">
        <Button size="xs" variant={datei === 'langsam' ? 'filled' : 'default'} onClick={() => zeige('langsam')}>
          Langsame Anfragen und Serverfehler
        </Button>
        <Button size="xs" variant={datei === 'browser' ? 'filled' : 'default'} onClick={() => zeige('browser')}>
          Fehlerberichte der Browser
        </Button>
        <Button size="xs" variant={datei === 'protokoll' ? 'filled' : 'default'} onClick={() => zeige('protokoll')}>
          Server-Protokoll
        </Button>
      </Group>
      {datei &&
        (zeilen === null ? (
          <Loader size="sm" />
        ) : (
          <ScrollArea h={320}>
            <Code block fz="xs" data-diagnose-zeilen>
              {zeilen.length ? zeilen.join('\n') : 'Keine Einträge.'}
            </Code>
          </ScrollArea>
        ))}
    </Stack>
  )
}
