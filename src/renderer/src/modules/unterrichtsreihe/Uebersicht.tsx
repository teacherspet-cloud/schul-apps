/**
 * Übersicht einer zugewiesenen Reihe (abgestimmt: „Raster + Handlungsbedarf"): Lernende × Schritte
 * mit Status, oben die Liste, was die Lehrkraft tun sollte (bestätigen/bewerten, Hilferufe,
 * Präsenzschritte abhaken, Haltepunkte freigeben). Je Zelle: freischalten, als geschafft
 * markieren, zurücksetzen, Antworten/Uploads/Selbsteinschätzung ansehen. Export als CSV.
 * Keine Rangliste – sortiert wird nach Namen.
 */
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Menu,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconArrowLeft, IconCheck, IconDownload, IconHandStop, IconLock, IconPlayerPlay, IconQrcode, IconRefresh, IconUserMinus } from '@tabler/icons-react'
import { Zugang } from '../onlinetest/OnlinetestModule'
import { useCallback, useEffect, useState } from 'react'
import type { Reihe, SchrittLage, Stand, Status, Weg } from '@shared/reihe'
import { vorschlagSumme } from '@shared/reiheKiFeedback'
import { notifyError } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { NamenFolgeKnopf, useNamenFolge } from '../../shared/components/SortierTabelle'
import { namenVergleich } from '@shared/namenListe'

interface Daten {
  reihe: Reihe
  zuweisung: { id: string; lerngruppe: string; status: string; halteFrei: string[]; code?: string; link?: string; perCode?: string[] }
  lernende: { id: string; name: string; benutzer: string; weg: Weg; stand: Stand }[]
  bedarf: { art: string; schueler?: string; name?: string; schritt?: string; text: string; frage?: number }[]
}

export const STATUS: Record<Status, { zeichen: string; farbe: string; text: string }> = {
  geschafft: { zeichen: '✓', farbe: 'green', text: 'geschafft' },
  offen: { zeichen: '○', farbe: 'blue', text: 'offen' },
  eingereicht: { zeichen: '⏳', farbe: 'yellow', text: 'eingereicht' },
  nicht_geschafft: { zeichen: '✗', farbe: 'red', text: 'nicht geschafft' },
  gesperrt: { zeichen: '🔒', farbe: 'gray', text: 'gesperrt' },
  uebersprungen: { zeichen: '»', farbe: 'teal', text: 'übersprungen' }
}

export function Uebersicht({ zid, zurueck }: { zid: string; zurueck: () => void }): React.JSX.Element {
  const [d, setD] = useState<Daten | null>(null)
  const [detail, setDetail] = useState<{ schueler: string; schritt: string } | null>(null)
  const [qr, setQr] = useState(false)
  // Vor- oder Nachname (08.10.2026, Wunsch der Lehrkraft)
  const [folge, setFolge] = useNamenFolge()
  const laden = useCallback(() => {
    void holen<Daten>(`/server/reihen/z/${zid}`).then(setD, (e: unknown) => notifyError(e))
  }, [zid])
  useEffect(laden, [laden])
  useEffect(() => {
    const t = setInterval(laden, 20000)
    return () => clearInterval(t)
  }, [laden])
  const aktion = (koerper: Record<string, unknown>): void => void senden(`/server/reihen/z/${zid}/aktion`, koerper).then(laden, (e: unknown) => notifyError(e))
  if (!d)
    return (
      <Group>
        <Loader size="sm" />
      </Group>
    )
  const lernende = [...d.lernende].sort((a, b) => namenVergleich(a.name, b.name, folge))
  const csv = (): void => {
    const kopf = [
      'Name',
      ...d.reihe.schritte.map((s) => (s.rolle === 'optional' ? `${s.titel} (optional)` : s.titel)),
      'Fortschritt',
      'Optional',
      'Abgeschlossen'
    ]
    const zeilen = lernende.map((l) => [
      l.name,
      ...l.weg.schritte.map((x) => STATUS[x.status].text),
      `${Math.round(l.weg.fortschritt * 100)} %`,
      l.weg.optional ? `${l.weg.optional.geschafft}/${l.weg.optional.gesamt}` : '',
      l.weg.fertig ? 'ja' : 'nein'
    ])
    const text = [kopf, ...zeilen].map((z) => z.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
    a.download = `${d.reihe.titel} – ${d.zuweisung.lerngruppe}.csv`
    a.click()
  }
  const det = detail ? { l: d.lernende.find((x) => x.id === detail.schueler)!, s: d.reihe.schritte.find((x) => x.id === detail.schritt)! } : null
  return (
    <Stack data-reihe-uebersicht>
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={zurueck}>
          Alle Reihen
        </Button>
        <Group gap="xs">
          <Button variant="subtle" leftSection={<IconRefresh size={16} />} onClick={laden}>
            Aktualisieren
          </Button>
          {d.zuweisung.code && d.zuweisung.link && (
            <Button variant="light" leftSection={<IconQrcode size={16} />} onClick={() => setQr(true)} data-reihe-qr>
              QR-Code {d.zuweisung.code}
            </Button>
          )}
          <Button variant="light" leftSection={<IconDownload size={16} />} onClick={csv}>
            Export (CSV)
          </Button>
          <Button variant="subtle" color="gray" onClick={() => aktion({ art: d.zuweisung.status === 'offen' ? 'beenden' : 'oeffnen' })}>
            {d.zuweisung.status === 'offen' ? 'Reihe beenden' : 'Wieder öffnen'}
          </Button>
        </Group>
      </Group>
      <div>
        <Title order={3}>{d.reihe.titel}</Title>
        <Text c="dimmed" size="sm">
          {d.zuweisung.lerngruppe} · {lernende.length} Lernende · {d.reihe.oberthema}
        </Text>
      </div>

      <Card withBorder data-handlungsbedarf>
        <Text fw={700} mb="xs">
          Handlungsbedarf {d.bedarf.length > 0 && <Badge color="red">{d.bedarf.length}</Badge>}
        </Text>
        {d.bedarf.length === 0 && (
          <Text size="sm" c="dimmed">
            Gerade nichts zu tun.
          </Text>
        )}
        <Stack gap={4}>
          {d.bedarf.map((b, i) => (
            <Group key={i} justify="space-between" wrap="nowrap">
              <Text size="sm">
                {b.name ? <b>{b.name}: </b> : null}
                {b.art === 'hilferuf' && <IconHandStop size={14} style={{ verticalAlign: -2 }} />} {b.text}
              </Text>
              <Group gap={4} wrap="nowrap">
                {b.art === 'halt' && (
                  <Button size="xs" leftSection={<IconPlayerPlay size={14} />} onClick={() => aktion({ art: 'halt', schritt: b.schritt })} data-halt-freigeben>
                    Weiter freigeben
                  </Button>
                )}
                {b.art === 'praesenz' && (
                  <Button size="xs" leftSection={<IconCheck size={14} />} onClick={() => aktion({ art: 'praesenz', schueler: b.schueler, schritt: b.schritt })}>
                    Abhaken
                  </Button>
                )}
                {(b.art === 'bewerten' || b.art === 'hilfe' || b.art === 'vorschlag') && b.schueler && b.schritt && (
                  <Button size="xs" variant="light" onClick={() => setDetail({ schueler: b.schueler!, schritt: b.schritt! })} data-bedarf-ansehen>
                    Ansehen
                  </Button>
                )}
                {b.art === 'frage' && b.schueler !== undefined && b.frage !== undefined && (
                  <AntwortKnopf antworten={(t) => aktion({ art: 'antworten', schueler: b.schueler, frage: b.frage, text: t })} />
                )}
                {b.art === 'abweichung' && b.schueler && (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      const ref = d.reihe.schritte.find((x) => x.inhalt.art === 'reflexion') ?? d.reihe.schritte[0]
                      if (ref) setDetail({ schueler: b.schueler!, schritt: ref.id })
                    }}
                  >
                    Ansehen
                  </Button>
                )}
                {b.art === 'hilferuf' && (
                  <Button size="xs" variant="light" onClick={() => aktion({ art: 'hilfe-erledigt', schueler: b.schueler })}>
                    Erledigt
                  </Button>
                )}
              </Group>
            </Group>
          ))}
        </Stack>
      </Card>

      <ScrollArea type="auto">
        <Table withTableBorder withColumnBorders striped stickyHeader data-raster>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <Group gap={4} wrap="nowrap">
                  Name
                  <NamenFolgeKnopf folge={folge} setFolge={setFolge} />
                </Group>
              </Table.Th>
              {d.reihe.schritte.map((s, i) => (
                <Table.Th key={s.id} style={{ minWidth: 44, textAlign: 'center' }}>
                  <Tooltip label={`${s.titel}${s.rolle === 'optional' ? ' (optional)' : ''}${s.halt ? ' (nach Haltepunkt)' : ''}`}>
                    <Text size="xs" fw={700} c={s.rolle === 'optional' ? 'teal' : undefined} fs={s.rolle === 'optional' ? 'italic' : undefined}>
                      {s.halt?.art === 'freigabe' && !d.zuweisung.halteFrei.includes(s.id) ? '⏸' : ''}
                      {i + 1}
                      {s.rolle === 'optional' ? '°' : ''}
                    </Text>
                  </Tooltip>
                </Table.Th>
              ))}
              <Table.Th>Fortschritt</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lernende.map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm" fw={500}>
                      {l.name}
                      {l.stand.hilfe ? ' ✋' : ''}
                    </Text>
                    {/* Per QR-Code beigetreten (05.10.2026): entfernbar */}
                    {d.zuweisung.perCode?.includes(l.id) && (
                      <Tooltip label="Per Code beigetreten – aus der Reihe entfernen">
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="red"
                          aria-label="Gast entfernen"
                          data-gast-entfernen={l.id}
                          onClick={() => {
                            if (!window.confirm(`${l.name} aus der Reihe entfernen? Der Stand geht verloren.`)) return
                            void senden(`/server/reihen/z/${zid}/gast-entfernen`, { nutzer: l.id }).then(laden, (e: unknown) => notifyError(e))
                          }}
                        >
                          <IconUserMinus size={12} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
                {l.weg.schritte.map((x: SchrittLage) => (
                  <Table.Td key={x.id} style={{ textAlign: 'center', padding: 2 }}>
                    <Zelle
                      lage={x}
                      oeffnen={() => setDetail({ schueler: l.id, schritt: x.id })}
                      aktion={(art) => aktion({ art, schueler: l.id, schritt: x.id })}
                    />
                  </Table.Td>
                ))}
                <Table.Td>
                  <Text size="sm">
                    {l.weg.fertig ? '✓ ' : ''}
                    {Math.round(l.weg.fortschritt * 100)} %{l.weg.abzeichen.length ? ` · ${l.weg.abzeichen.map(() => '🏅').join('')}` : ''}
                    {l.weg.optional ? ` · opt. ${l.weg.optional.geschafft}/${l.weg.optional.gesamt}` : ''}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {lernende.length === 0 && <Alert>In der Lerngruppe ist noch niemand. Schülerkonten legt die Verwaltung aus der Klassenliste an.</Alert>}
      <Text size="xs" c="dimmed">
        ° optionaler Schritt · ✓ geschafft · ○ offen · ⏳ eingereicht (wartet ggf. auf dich) · ✗ nicht geschafft · 🔒 gesperrt · » übersprungen (Diagnose).
        Klick auf ein Feld: Details und Freischalten.
      </Text>
      {det && (
        <Detail
          zid={zid}
          reihe={d.reihe}
          l={det.l}
          schrittId={det.s.id}
          schliessen={() => setDetail(null)}
          aktion={(k) => aktion({ ...k, schueler: det.l.id, schritt: det.s.id })}
        />
      )}
      {qr && d.zuweisung.code && d.zuweisung.link && (
        <Modal opened onClose={() => setQr(false)} title={`${d.reihe.titel} – für Gäste`} size="lg">
          <Zugang code={d.zuweisung.code} link={d.zuweisung.link} />
        </Modal>
      )}
    </Stack>
  )
}

function Zelle({ lage, oeffnen, aktion }: { lage: SchrittLage; oeffnen: () => void; aktion: (art: string) => void }): React.JSX.Element {
  const s = STATUS[lage.status]
  return (
    <Menu position="bottom" withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label={s.text} data-zelle={lage.status} style={{ width: '100%' }}>
          <Badge variant={lage.wartet ? 'filled' : 'light'} color={s.farbe} size="lg" radius="sm">
            {s.zeichen}
          </Badge>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{s.text}</Menu.Label>
        <Menu.Item onClick={oeffnen}>Details ansehen</Menu.Item>
        {lage.status === 'gesperrt' && (
          <Menu.Item leftSection={<IconLock size={14} />} onClick={() => aktion('freischalten')}>
            Für diese Person freischalten
          </Menu.Item>
        )}
        {lage.status !== 'geschafft' && <Menu.Item onClick={() => aktion('geschafft')}>Als geschafft markieren</Menu.Item>}
        <Menu.Item color="red" onClick={() => aktion('zuruecksetzen')}>
          Zurücksetzen
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

const AMPEL: Record<string, string> = { gruen: '🟢', gelb: '🟡', rot: '🔴' }

function Detail({
  zid,
  reihe,
  l,
  schrittId,
  schliessen,
  aktion
}: {
  zid: string
  reihe: Reihe
  l: Daten['lernende'][0]
  schrittId: string
  schliessen: () => void
  aktion: (k: Record<string, unknown>) => void
}): React.JSX.Element {
  const s = reihe.schritte.find((x) => x.id === schrittId)!
  const st = l.stand.schritte[schrittId] ?? {}
  const lage = l.weg.schritte.find((x) => x.id === schrittId)!
  const [text, setText] = useState(st.bewertung?.text ?? '')
  const [lkAmpel, setLkAmpel] = useState<Record<string, 'gruen' | 'gelb' | 'rot'>>(l.stand.lehrkraftAmpel ?? {})
  const eigeneFragen = (l.stand.fragen ?? []).map((f, i) => ({ f, i })).filter(({ f }) => f.schritt === schrittId)
  const ziele = [...reihe.lernziele, ...reihe.schritte.flatMap((x) => x.lernziele)]
  const fragen = s.inhalt.art === 'aufgabe' ? s.inhalt.fragen : []
  return (
    <Modal opened onClose={schliessen} title={`${l.name} – ${s.titel}`} size="lg">
      <Stack>
        <Badge color={STATUS[lage.status].farbe} variant="light">
          {STATUS[lage.status].text}
          {lage.hinweis ? ` – ${lage.hinweis}` : ''}
        </Badge>
        {st.antworten && Object.keys(st.antworten).length > 0 && (
          <Stack gap={4}>
            <Text fw={600} size="sm">
              Antworten
            </Text>
            {Object.entries(st.antworten).map(([k, v]) => (
              <Text key={k} size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {fragen[Number(k)] ? <b>{fragen[Number(k)]}: </b> : null}
                {v}
              </Text>
            ))}
          </Stack>
        )}
        {(st.dateien ?? []).map((f) => (
          <div key={f.id}>
            {f.typ.startsWith('audio/') ? (
              <audio controls src={`/server/reihen/z/${zid}/datei/${f.id}`} style={{ width: '100%' }} />
            ) : f.typ.startsWith('image/') ? (
              <img src={`/server/reihen/z/${zid}/datei/${f.id}`} alt={f.name} style={{ maxWidth: '100%', borderRadius: 6 }} />
            ) : (
              <Anchor href={`/server/reihen/z/${zid}/datei/${f.id}`} target="_blank">
                {f.name}
              </Anchor>
            )}
          </div>
        ))}
        {st.ki && (
          <Text size="sm">
            KI-Einschätzung der Kriterien: <b>{st.ki.einschaetzungen.join(', ')}</b>
          </Text>
        )}
        {st.diagnose && <Text size="sm">Diagnose: {st.diagnose.prozent} % richtig</Text>}
        {/* KI-Vorschlag zum Abschlussprodukt (08.10.2026, Plan E.6) – nur hier; die Lernenden sehen erst deine Bewertung */}
        {st.kiVorschlag && (
          <Alert color={st.kiVorschlag.fehler ? 'gray' : 'violet'} variant="light" title="KI-Vorschlag nach dem Raster" data-ki-vorschlag>
            {st.kiVorschlag.fehler ? (
              <Text size="sm">Die KI konnte nicht prüfen: {st.kiVorschlag.fehler}</Text>
            ) : (
              <Stack gap={4}>
                {st.kiVorschlag.kriterien.map((k, i) => (
                  <Text key={i} size="sm">
                    <b>
                      {k.kriterium}: {k.punkte}/{k.max}
                    </b>{' '}
                    – {k.begruendung}
                  </Text>
                ))}
                <Text size="sm" fw={600}>
                  Zusammen: {vorschlagSumme(st.kiVorschlag).punkte} von {vorschlagSumme(st.kiVorschlag).max} Punkten
                </Text>
                {st.kiVorschlag.gesamt && (
                  <Text size="sm" c="dimmed">
                    {st.kiVorschlag.gesamt}
                  </Text>
                )}
                <Button
                  size="xs"
                  variant="light"
                  w="fit-content"
                  onClick={() => {
                    const v = st.kiVorschlag!
                    const sum = vorschlagSumme(v)
                    setText(
                      [`${sum.punkte} von ${sum.max} Punkten.`, ...v.kriterien.map((k) => `${k.kriterium}: ${k.punkte}/${k.max} – ${k.begruendung}`)].join('\n')
                    )
                  }}
                  data-vorschlag-uebernehmen
                >
                  In die Rückmeldung übernehmen
                </Button>
              </Stack>
            )}
          </Alert>
        )}
        {st.ampel && (
          <Stack gap={4} data-ampeln>
            <Text fw={600} size="sm">
              Selbsteinschätzung – und deine Einschätzung daneben
            </Text>
            {Object.entries(st.ampel).map(([k, v]) => (
              <Group key={k} justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm" style={{ flex: 1 }}>
                  {AMPEL[v]} {ziele[Number(k)]?.ichKann || ziele[Number(k)]?.text || k}
                </Text>
                <SegmentedControl
                  size="xs"
                  value={lkAmpel[k] ?? ''}
                  onChange={(farbe) => {
                    setLkAmpel({ ...lkAmpel, [k]: farbe as 'gruen' | 'gelb' | 'rot' })
                    aktion({ art: 'lehrkraft-ampel', ziel: Number(k), farbe })
                  }}
                  data={[
                    { value: 'rot', label: '🔴' },
                    { value: 'gelb', label: '🟡' },
                    { value: 'gruen', label: '🟢' }
                  ]}
                />
              </Group>
            ))}
          </Stack>
        )}
        {eigeneFragen.map(({ f, i }) => (
          <Alert key={i} color={f.antwort ? 'gray' : 'blue'} variant="light" title="Frage">
            <Text size="sm">„{f.text}“</Text>
            {f.antwort ? (
              <Text size="sm" mt={4}>
                <b>Deine Antwort:</b> {f.antwort}
              </Text>
            ) : (
              <AntwortKnopf antworten={(t) => aktion({ art: 'antworten', frage: i, text: t })} />
            )}
          </Alert>
        ))}
        {st.tagebuch && (
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            <b>Lerntagebuch:</b> {st.tagebuch}
          </Text>
        )}
        {st.impuls && (
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }} data-impuls-lehrkraft>
            <b>KI-Impuls an die Person:</b> {st.impuls.text}
          </Text>
        )}
        {s.inhalt.art === 'abschluss' && s.inhalt.raster.length > 0 && (
          <Text size="sm" c="dimmed">
            Raster: {s.inhalt.raster.join(' · ')}
          </Text>
        )}
        <Textarea label="Rückmeldung an die Lernenden (optional)" autosize minRows={2} value={text} onChange={(e) => setText(e.currentTarget.value)} />
        <Group justify="space-between">
          <Group gap="xs">
            <Button variant="subtle" color="red" onClick={() => (aktion({ art: 'bewerten', geschafft: false, text }), schliessen())}>
              Noch nicht geschafft
            </Button>
            <Tooltip label="Der Schritt ist wieder offen (mit einer zusätzlichen Einreichung), bis neu eingereicht ist; dein Kommentar steht dabei.">
              <Button variant="light" color="orange" onClick={() => (aktion({ art: 'ueberarbeiten', text }), schliessen())} data-ueberarbeiten>
                Zur Überarbeitung
              </Button>
            </Tooltip>
          </Group>
          <Button
            leftSection={<IconCheck size={16} />}
            onClick={() => (aktion({ art: 'bewerten', geschafft: true, text }), schliessen())}
            data-bewerten-geschafft
          >
            Geschafft
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Kurz antworten (Frage an einen Schritt) */
function AntwortKnopf({ antworten }: { antworten: (t: string) => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [t, setT] = useState('')
  if (!offen)
    return (
      <Button size="xs" variant="light" onClick={() => setOffen(true)} data-antworten>
        Antworten
      </Button>
    )
  return (
    <Group gap={4} wrap="nowrap" mt={4}>
      <TextInput
        size="xs"
        value={t}
        onChange={(e) => setT(e.currentTarget.value)}
        placeholder="Antwort …"
        style={{ flex: 1, minWidth: 180 }}
        data-antwort-text
      />
      <Button size="xs" disabled={!t.trim()} onClick={() => (antworten(t), setOffen(false))} data-antwort-senden>
        Senden
      </Button>
    </Group>
  )
}
