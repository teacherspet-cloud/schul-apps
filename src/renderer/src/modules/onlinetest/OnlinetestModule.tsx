/**
 * Onlinetest – die App der Lehrkraft (02.10.2026, nur mit dem Schul-Apps-Server).
 *
 *  - Tests: Code, Link und QR-Code für die Lernenden, Live-Stand (wer arbeitet, wer abgegeben
 *    hat, wer die Seite verlassen hat), Auswertung mit KI für offene Antworten, Durchsicht jeder
 *    Antwort mit „richtig/falsch" zum Überstimmen, Test beenden.
 *  - Lerngruppen: aus den IServ-Gruppen oder von Hand; Historie mit Datum, Ergebnissen,
 *    Notenverteilung, Durchschnittsnote und Durchschnitt je Schülerin/Schüler.
 *
 * Wichtig (Wunsch der Lehrkraft): Die Auswertung ist ein VORSCHLAG – die Abgaben bitte trotzdem prüfen.
 */
import { ActionIcon, Alert, Badge, Button, Card, Container, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Textarea, Title, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconCopy, IconPlayerStop, IconPlayerPlay, IconRefresh, IconSparkles, IconTrash, IconUsersGroup, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { qrSvg } from '../arbeitsblatt/render/qr'
import type { Antworten, Bewertung, Einheit, Loesung, OnlineAufgabe } from './kern'
import { holen, senden } from './serverApi'
import { notifyError, notifySuccess } from '../../shared/util'

interface TestListe {
  id: string
  titel: string
  code: string
  link: string
  status: 'offen' | 'beendet'
  erstellt: string
  lerngruppe: string
  teilnehmer: number
  abgegeben: number
  offen: number
}

interface Teilnahme {
  id: string
  name: string
  benutzer: string
  variante: string
  varianteNr: number
  beginn: number
  ende: number
  abgabe: number | null
  grund: string | null
  verlassen: boolean
  punkte: number
  max: number
  offen: number
  note: number | null
  antworten: Antworten
  bewertung: Bewertung
}

interface TestDetail {
  id: string
  titel: string
  code: string
  link: string
  status: 'offen' | 'beendet'
  einstellungen: { zeitMin: number }
  fehlend: { name: string; benutzer: string }[]
  fassungen: { label: string; punkte: number; aufgaben: OnlineAufgabe[]; einheiten: Einheit[]; loesungen: Record<string, Loesung> }[]
  teilnahmen: Teilnahme[]
}

export const PRUEF_HINWEIS = 'Die Auswertung ist ein Vorschlag – bitte die Abgaben trotzdem prüfen, besonders die von der KI bewerteten und markierten Antworten.'

const datum = (s: string | number): string => new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

export default function OnlinetestModule({ active }: { active: boolean }): React.JSX.Element | null {
  const [reiter, setReiter] = useState<string | null>('tests')
  if (!active) return null
  return (
    <Container size="xl" py="md">
      <Title order={2} mb="sm">
        Onlinetest
      </Title>
      <Tabs value={reiter} onChange={setReiter}>
        <Tabs.List mb="md">
          <Tabs.Tab value="tests">Tests</Tabs.Tab>
          <Tabs.Tab value="gruppen" leftSection={<IconUsersGroup size={16} />}>
            Lerngruppen
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="tests">
          <Tests />
        </Tabs.Panel>
        <Tabs.Panel value="gruppen">
          <Lerngruppen />
        </Tabs.Panel>
      </Tabs>
    </Container>
  )
}

function Tests(): React.JSX.Element {
  const [liste, setListe] = useState<TestListe[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const laden = useCallback(() => {
    void holen<{ tests: TestListe[] }>('/server/onlinetest')
      .then((d) => setListe(d.tests))
      .catch((e: unknown) => notifyError(e))
  }, [])
  useEffect(laden, [laden])
  if (gewaehlt) return <TestAnsicht id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
  return (
    <Stack>
      <Alert variant="light" icon={<IconAlertTriangle size={16} />}>
        Neue Onlinetests entstehen im Vokabeltest: Test erstellen, dann im Editor „Onlinetest“ wählen.
      </Alert>
      {!liste && <Loader />}
      {liste?.length === 0 && <Text c="dimmed">Noch keine Onlinetests.</Text>}
      {liste && liste.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Test</Table.Th>
              <Table.Th>Lerngruppe</Table.Th>
              <Table.Th>Datum</Table.Th>
              <Table.Th>Abgaben</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {liste.map((t) => (
              <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setGewaehlt(t.id)}>
                <Table.Td>
                  <Text fw={600}>{t.titel}</Text>
                  <Text size="xs" c="dimmed">
                    Code {t.code}
                  </Text>
                </Table.Td>
                <Table.Td>{t.lerngruppe || '–'}</Table.Td>
                <Table.Td>{datum(t.erstellt)}</Table.Td>
                <Table.Td>
                  {t.abgegeben}/{t.teilnehmer}
                  {t.offen > 0 && (
                    <Badge ml="xs" color="orange" size="sm">
                      {t.offen} offen
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge color={t.status === 'offen' ? 'green' : 'gray'}>{t.status === 'offen' ? 'läuft' : 'beendet'}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}

function QrCode({ wert, mm = 40 }: { wert: string; mm?: number }): React.JSX.Element {
  return <div style={{ width: `${mm}mm`, background: '#fff', padding: 4 }} dangerouslySetInnerHTML={{ __html: qrSvg(wert, mm) }} />
}

export function Zugang({ code, link }: { code: string; link: string }): React.JSX.Element {
  return (
    <Group align="center" gap="lg">
      <QrCode wert={link} />
      <Stack gap={4}>
        <Text size="sm" c="dimmed">
          Code für die Lernenden
        </Text>
        <Text fw={800} size="2rem" ff="monospace" lts={4}>
          {code}
        </Text>
        <Group gap={4}>
          <Text size="sm">{link}</Text>
          <ActionIcon variant="subtle" onClick={() => void navigator.clipboard?.writeText(link).then(() => notifySuccess('Link kopiert.'))} aria-label="Link kopieren">
            <IconCopy size={16} />
          </ActionIcon>
        </Group>
      </Stack>
    </Group>
  )
}

function TestAnsicht({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const [d, setD] = useState<TestDetail | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [durchsicht, setDurchsicht] = useState<Teilnahme | null>(null)
  const laden = useCallback(() => {
    void holen<TestDetail>(`/server/onlinetest/${id}`)
      .then(setD)
      .catch((e: unknown) => notifyError(e))
  }, [id])
  useEffect(laden, [laden])
  // Live-Stand, solange der Test läuft
  useEffect(() => {
    if (d?.status !== 'offen') return
    const i = setInterval(laden, 5000)
    return () => clearInterval(i)
  }, [d?.status, laden])
  if (!d) return <Loader />
  const offen = d.teilnahmen.reduce((s, t) => s + t.offen, 0)
  const status = async (s: 'offen' | 'beendet'): Promise<void> => {
    if (s === 'beendet' && !window.confirm('Test beenden? Wer noch schreibt, gibt mit dem zuletzt gesicherten Stand ab.')) return
    await senden(`/server/onlinetest/${id}/status`, { status: s }).catch((e: unknown) => notifyError(e))
    laden()
  }
  const auswerten = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<{ anfragen: number; bewertet: number }>(`/server/onlinetest/${id}/auswerten`)
      notifySuccess(`${r.bewertet} Antworten von der KI bewertet (${r.anfragen} Anfrage${r.anfragen === 1 ? '' : 'n'}).`)
    } catch (e) {
      notifyError(e, 'Auswertung fehlgeschlagen')
    } finally {
      setLaeuft(false)
      laden()
    }
  }
  const loeschen = async (): Promise<void> => {
    if (!window.confirm(`Den Onlinetest „${d.titel}" mit allen Abgaben löschen?`)) return
    await senden(`/server/onlinetest/${id}/loeschen`).catch((e: unknown) => notifyError(e))
    zurueck()
  }
  return (
    <Stack>
      <Group justify="space-between">
        <Button variant="subtle" onClick={zurueck}>
          ← Alle Tests
        </Button>
        <Group gap="xs">
          <ActionIcon variant="subtle" onClick={laden} aria-label="Neu laden">
            <IconRefresh size={18} />
          </ActionIcon>
          {d.status === 'offen' ? (
            <Button color="red" variant="light" leftSection={<IconPlayerStop size={16} />} onClick={() => void status('beendet')}>
              Test beenden
            </Button>
          ) : (
            <Button variant="light" leftSection={<IconPlayerPlay size={16} />} onClick={() => void status('offen')}>
              Wieder öffnen
            </Button>
          )}
          <ActionIcon color="red" variant="subtle" onClick={() => void loeschen()} aria-label="Löschen">
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      </Group>
      <Card withBorder>
        <Title order={3}>{d.titel}</Title>
        <Text c="dimmed" mb="sm">
          {d.einstellungen.zeitMin} Minuten · {d.fassungen.map((f) => `Fassung ${f.label}: ${f.punkte} P.`).join(' · ')}
        </Text>
        {d.status === 'offen' && <Zugang code={d.code} link={d.link} />}
      </Card>
      <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
        {PRUEF_HINWEIS}
      </Alert>
      <Group>
        <Button leftSection={laeuft ? <Loader size={14} /> : <IconSparkles size={16} />} disabled={laeuft || offen === 0} onClick={() => void auswerten()}>
          Offene Antworten mit KI auswerten ({offen})
        </Button>
        <Text size="xs" c="dimmed">
          Eine Anfrage je Aufgabe über den eigenen KI-Zugang – ohne Namen, nur mit Kennungen.
        </Text>
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Fassung</Table.Th>
            <Table.Th>Stand</Table.Th>
            <Table.Th>Punkte</Table.Th>
            <Table.Th>Note</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {d.teilnahmen.map((t) => (
            <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDurchsicht(t)}>
              <Table.Td>
                {t.name}
                <Text size="xs" c="dimmed">
                  {t.benutzer}
                </Text>
              </Table.Td>
              <Table.Td>{t.variante}</Table.Td>
              <Table.Td>
                {!t.abgabe ? (
                  <Badge color="blue">schreibt</Badge>
                ) : t.verlassen ? (
                  <Tooltip label="Hat die Seite verlassen – automatisch abgegeben">
                    <Badge color="red">verlassen {new Date(t.abgabe).toLocaleTimeString('de-DE', { timeStyle: 'short' })}</Badge>
                  </Tooltip>
                ) : (
                  <Badge color={t.grund === 'zeit' ? 'orange' : 'green'}>{t.grund === 'zeit' ? 'Zeit abgelaufen' : t.grund === 'lehrkraft' ? 'beendet' : 'abgegeben'}</Badge>
                )}
              </Table.Td>
              <Table.Td>
                {t.abgabe ? `${t.punkte}/${t.max}` : '–'}
                {t.offen > 0 && (
                  <Badge ml="xs" size="sm" color="orange">
                    {t.offen} offen
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>{t.note ?? '–'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {d.fehlend.length > 0 && (
        <Text size="sm" c="dimmed">
          Noch nicht begonnen: {d.fehlend.map((f) => f.name || f.benutzer).join(', ')}
        </Text>
      )}
      {durchsicht && (
        <Durchsicht
          test={d}
          t={d.teilnahmen.find((x) => x.id === durchsicht.id) ?? durchsicht}
          schliessen={() => setDurchsicht(null)}
          geaendert={laden}
        />
      )}
    </Stack>
  )
}

const loesungText = (l: Loesung | undefined, optionen?: { wert: string; text: string }[]): string => {
  if (!l) return ''
  if (l.art === 'genau') return l.werte.join(' / ')
  if (l.art === 'auswahl') return optionen?.find((o) => o.wert === l.wert)?.text ?? l.wert
  if (l.art === 'ki') return `${l.erwartung} (Beispiel)`
  if (l.art === 'menge') return l.werte.join(', ')
  return '(frei – Lehrkraft)'
}

function Durchsicht({ test, t, schliessen, geaendert }: { test: TestDetail; t: Teilnahme; schliessen: () => void; geaendert: () => void }): React.JSX.Element {
  const f = test.fassungen[t.varianteNr]
  const felder = useMemo(() => new Map(f.aufgaben.flatMap((a) => a.eintraege.flatMap((e) => e.felder.map((x) => [x.id, x] as const)))), [f])
  const urteil = async (einheit: string, richtig: boolean, punkte?: number): Promise<void> => {
    await senden(`/server/onlinetest/${test.id}/korrektur`, { teilnahme: t.id, einheit, richtig, ...(punkte != null ? { punkte } : {}) }).catch((e: unknown) => notifyError(e))
    geaendert()
  }
  return (
    <Modal opened onClose={schliessen} title={`${t.name} · Fassung ${t.variante} · ${t.punkte}/${t.max} Punkte`} size="xl">
      <Stack>
        {!t.abgabe && (
          <Button
            variant="light"
            color="orange"
            onClick={() => void senden(`/server/onlinetest/${test.id}/abschliessen`, { teilnahme: t.id }).then(geaendert, (e: unknown) => notifyError(e))}
          >
            Für diese Person jetzt abgeben
          </Button>
        )}
        {f.aufgaben.map((a, ai) => (
          <Card key={a.id} withBorder padding="sm">
            <Text fw={700} mb={4}>
              {ai + 1}. {a.titel}
            </Text>
            <Stack gap={6}>
              {f.einheiten
                .filter((e) => e.aufgabe === a.id)
                .map((e) => {
                  const b = t.bewertung[e.id]
                  const farbe = b?.status === 'richtig' ? 'green' : b?.status === 'falsch' ? 'red' : 'orange'
                  return (
                    <Group key={e.id} align="start" wrap="nowrap" gap="sm">
                      <Badge color={farbe} w={90} variant={b?.quelle === 'lehrkraft' ? 'filled' : 'light'}>
                        {b ? (b.status === 'ki' ? 'KI offen' : b.status === 'lehrkraft' ? 'prüfen' : `${b.punkte}/${e.punkte}`) : '–'}
                      </Badge>
                      <Stack gap={0} style={{ flex: 1 }}>
                        {e.felder.map((id) => (
                          <Text key={id} size="sm">
                            <b>{t.antworten[id] || '—'}</b>
                            <Text span size="xs" c="dimmed">
                              {'  '}Lösung: {loesungText(f.loesungen[id], felder.get(id)?.optionen)}
                            </Text>
                          </Text>
                        ))}
                        {b?.hinweis && (
                          <Text size="xs" c={b.quelle === 'ki' ? 'violet' : 'orange'}>
                            {b.quelle === 'ki' ? 'KI: ' : ''}
                            {b.hinweis}
                          </Text>
                        )}
                      </Stack>
                      {e.punkte > 1 && f.loesungen[e.felder[0]]?.art === 'lehrkraft' ? (
                        <NumberInput size="xs" w={80} min={0} max={e.punkte} step={1} defaultValue={b?.punkte ?? 0} onBlur={(ev) => void urteil(e.id, true, Number(ev.currentTarget.value))} />
                      ) : (
                        <Group gap={2}>
                          <ActionIcon color="green" variant={b?.status === 'richtig' ? 'filled' : 'light'} onClick={() => void urteil(e.id, true)} aria-label="richtig">
                            <IconCheck size={16} />
                          </ActionIcon>
                          <ActionIcon color="red" variant={b?.status === 'falsch' ? 'filled' : 'light'} onClick={() => void urteil(e.id, false)} aria-label="falsch">
                            <IconX size={16} />
                          </ActionIcon>
                        </Group>
                      )}
                    </Group>
                  )
                })}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Modal>
  )
}

// ---------------------------------------------------------------- Lerngruppen

interface Gruppe {
  id: string
  name: string
  fach: string
  iserv_gruppe: string
  mitglieder: string[]
  anzahl: number
}

interface Historie {
  gruppe: Gruppe
  mitglieder: { name: string; benutzer: string }[]
  tests: { id: string; titel: string; datum: string; teilnehmer: number; offen: number; durchschnitt: number | null; verteilung: number[] }[]
  schueler: { name: string; benutzer: string; tests: number; durchschnitt: number; prozent: number }[]
}

function Lerngruppen(): React.JSX.Element {
  const [d, setD] = useState<{ gruppen: Gruppe[]; iservGruppen: { id: string; name: string }[] } | null>(null)
  const [neu, setNeu] = useState(false)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const laden = useCallback(() => {
    void holen<NonNullable<typeof d>>('/server/lerngruppen')
      .then(setD)
      .catch((e: unknown) => notifyError(e))
  }, [])
  useEffect(laden, [laden])
  if (gewaehlt) return <GruppenHistorie id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
  return (
    <Stack>
      <Group>
        <Button onClick={() => setNeu(true)}>Lerngruppe anlegen</Button>
      </Group>
      {!d && <Loader />}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        {d?.gruppen.map((g) => (
          <Card key={g.id} withBorder style={{ cursor: 'pointer' }} onClick={() => setGewaehlt(g.id)}>
            <Text fw={700}>{g.name}</Text>
            <Text size="sm" c="dimmed">
              {[g.fach, g.iserv_gruppe ? `IServ: ${g.iserv_gruppe}` : '', `${g.anzahl} Schüler/innen angemeldet`].filter(Boolean).join(' · ')}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
      {d?.gruppen.length === 0 && <Text c="dimmed">Noch keine Lerngruppe. Am einfachsten aus einer IServ-Gruppe (Klasse oder Kurs).</Text>}
      {neu && d && (
        <NeueGruppe
          iservGruppen={d.iservGruppen}
          fertig={() => {
            setNeu(false)
            laden()
          }}
        />
      )}
    </Stack>
  )
}

function NeueGruppe({ iservGruppen, fertig }: { iservGruppen: { id: string; name: string }[]; fertig: () => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const [fach, setFach] = useState('')
  const [iserv, setIserv] = useState<string | null>(null)
  const [mitglieder, setMitglieder] = useState('')
  return (
    <Modal opened onClose={fertig} title="Lerngruppe anlegen">
      <Stack>
        <Select
          label="IServ-Gruppe (Klasse oder Kurs)"
          description="Wer in dieser Gruppe ist und sich anmeldet, gehört automatisch dazu."
          data={iservGruppen.map((g) => ({ value: g.id, label: g.name }))}
          value={iserv}
          onChange={(v) => {
            setIserv(v)
            if (v && !name) setName(iservGruppen.find((g) => g.id === v)?.name ?? '')
          }}
          searchable
          clearable
          nothingFoundMessage={iservGruppen.length ? 'Nicht gefunden' : 'Ohne IServ-Anmeldung keine Gruppen'}
        />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="z. B. 8b Englisch" />
        <TextInput label="Fach (optional)" value={fach} onChange={(e) => setFach(e.currentTarget.value)} />
        <Textarea
          label="Weitere Mitglieder (IServ-Benutzernamen, optional)"
          description="Eine Zeile je Person, z. B. für Kurse ohne eigene IServ-Gruppe."
          value={mitglieder}
          onChange={(e) => setMitglieder(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Button
          disabled={!name.trim()}
          onClick={() =>
            void senden('/server/lerngruppen/anlegen', { name, fach, iservGruppe: iserv ?? '', mitglieder: mitglieder.split(/[\s,;]+/).filter(Boolean) })
              .then(fertig)
              .catch((e: unknown) => notifyError(e))
          }
        >
          Anlegen
        </Button>
      </Stack>
    </Modal>
  )
}

function Verteilung({ werte }: { werte: number[] }): React.JSX.Element {
  const max = Math.max(1, ...werte)
  return (
    <Group gap={3} align="end" h={36} aria-label={`Notenverteilung ${werte.join(', ')}`}>
      {werte.map((n, i) => (
        <Tooltip key={i} label={`Note ${i + 1}: ${n}`}>
          <Stack gap={0} align="center">
            <div style={{ width: 14, height: Math.max(2, (n / max) * 26), background: 'var(--mantine-primary-color-filled)', borderRadius: 2, opacity: n ? 1 : 0.25 }} />
            <Text size="9px">{i + 1}</Text>
          </Stack>
        </Tooltip>
      ))}
    </Group>
  )
}

function GruppenHistorie({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const [h, setH] = useState<Historie | null>(null)
  useEffect(() => {
    void holen<Historie>(`/server/lerngruppen/${id}`)
      .then(setH)
      .catch((e: unknown) => notifyError(e))
  }, [id])
  if (!h) return <Loader />
  const loeschen = async (): Promise<void> => {
    if (!window.confirm(`Lerngruppe „${h.gruppe.name}" löschen? Die Onlinetests bleiben erhalten.`)) return
    await senden('/server/lerngruppen/loeschen', { id }).catch((e: unknown) => notifyError(e))
    zurueck()
  }
  return (
    <Stack>
      <Group justify="space-between">
        <Button variant="subtle" onClick={zurueck}>
          ← Alle Lerngruppen
        </Button>
        <ActionIcon color="red" variant="subtle" onClick={() => void loeschen()} aria-label="Lerngruppe löschen">
          <IconTrash size={18} />
        </ActionIcon>
      </Group>
      <Title order={3}>{h.gruppe.name}</Title>
      <Text size="sm" c="dimmed">
        {h.mitglieder.length} Schülerinnen und Schüler angemeldet{h.mitglieder.length ? `: ${h.mitglieder.map((m) => m.name).join(', ')}` : ''}
      </Text>
      <Title order={4}>Tests</Title>
      {h.tests.length === 0 ? (
        <Text c="dimmed">Noch keine Onlinetests in dieser Lerngruppe.</Text>
      ) : (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Datum</Table.Th>
              <Table.Th>Test</Table.Th>
              <Table.Th>Teilnehmer</Table.Th>
              <Table.Th>Ø Note</Table.Th>
              <Table.Th>Verteilung</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {h.tests.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{new Date(t.datum).toLocaleDateString('de-DE')}</Table.Td>
                <Table.Td>
                  {t.titel}
                  {t.offen > 0 && (
                    <Badge ml="xs" size="sm" color="orange">
                      {t.offen} offen
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{t.teilnehmer}</Table.Td>
                <Table.Td>{t.durchschnitt?.toFixed(2).replace('.', ',') ?? '–'}</Table.Td>
                <Table.Td>
                  <Verteilung werte={t.verteilung} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Title order={4}>Schülerinnen und Schüler</Title>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Tests</Table.Th>
            <Table.Th>Ø Note</Table.Th>
            <Table.Th>Ø Prozent</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {h.schueler.map((s) => (
            <Table.Tr key={s.benutzer}>
              <Table.Td>{s.name}</Table.Td>
              <Table.Td>{s.tests}</Table.Td>
              <Table.Td>{s.durchschnitt.toFixed(2).replace('.', ',')}</Table.Td>
              <Table.Td>{s.prozent} %</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}
