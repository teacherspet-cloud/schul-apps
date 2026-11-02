/**
 * Klassenspiele – Lehrkraft (02.11.2026, Plan „wise-sauteeing-bubble"): Knopf „Klassenspiel" neben „Test planen"
 * (Kursseite, Meine Klassen), Startfenster in drei Schritten (Spiel · Inhalt · Schwierigkeit) und die Beamer-Ansicht im
 * Vollbild: Code und QR zum Beitreten, Teams losen (Animation – wirkt zufällig, abgestimmt), Spielfläche, Steuerung,
 * Ergebnis mit Team und Top 3, danach die Auswertung (nur für die Lehrkraft, nicht am Beamer).
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Stepper,
  Switch,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconDeviceGamepad2, IconMaximize, IconMinimize, IconPlayerPause, IconPlayerPlay, IconPlayerStop, IconRefresh, IconReportAnalytics, IconUsersGroup, IconX } from '@tabler/icons-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BBlock } from '@shared/klassenspiel/kern'
import { STANDARD_EINSTELLUNGEN, type KlassenEinstellungen, type KlassenspielInfo, type KlassenspielId } from '@shared/klassenspiel/typen'
import { useProgrammFarbe } from '../../../shared/components/AppKopf'
import { BandGruppe } from '../../../shared/components/BandCover'
import { notifyError } from '../../../shared/util'
import { useLiveSicht } from '../../../shared/liveSicht'
import { holen, senden } from '../../onlinetest/serverApi'
import { qrDataUrl } from '../../arbeitsblatt/render/qr'
import { auswahlZahlen, bandSchluessel, testAuswahlGliedern, unitSchluessel, type TestEintragDaten } from '../kurs/testPlanGliederung'
import { BeamerBloecke, Podest, TeamKarten } from './BeamerBloecke'

interface Angebot {
  titel: string
  sprache: string
  adresse: string
  spiele: (KlassenspielInfo & { spielbar: boolean })[]
  eintraege: TestEintragDaten[]
  lernende: number
  laufend: { code: string; spiel: KlassenspielId; phase: string } | null
  rekorde: Record<string, { wert: number; text: string; zeit: number }>
}

interface TeamSicht {
  name: string
  farbe: string
  symbol: string
  mitglieder: string[]
}

export interface BeamerSicht {
  code: string
  phase: 'lobby' | 'teams' | 'spiel' | 'ende'
  titel: string
  spiel: KlassenspielId
  spielName: string
  art: 'koop' | 'team' | 'einzeln'
  regel: string
  einst: KlassenEinstellungen
  jetzt: number
  bis: number
  pause: boolean
  level: number
  inhalt: { vok: number; gram: number; schwaechen: number }
  personen: { id: string; name: string; online: boolean; team: number; n: number }[]
  kurs: number
  teams: TeamSicht[]
  losenSeit: number | null
  bloecke: BBlock[]
  ergebnis?: {
    text: string
    sieg: boolean | null
    teams: { nr: number; name: string; farbe: string; symbol: string; wert: number }[] | null
    siegerTeams: number[]
    top3: { name: string; punkte: number }[]
    rekord: { bisher: number | null; neu: boolean; text: string } | null
  }
  auswertung?: {
    items: { id: string; text: string; bereich: 'vok' | 'gram'; richtig: number; falsch: number }[]
    personen: { id: string; name: string; richtig: number; falsch: number; punkte: number; entwicklung: string; fehler: string[] }[]
  }
}

const ART_TITEL: Record<string, string> = { koop: 'Alle zusammen', team: 'Teams gegeneinander', einzeln: 'Jede:r für sich' }

// ============================================================================ Knopf

/**
 * Knopf „Klassenspiel". Mit `kursId` (Kursseite) direkt; mit `gruppeId` („Meine Klassen") fragt er den Kurs der
 * Lerngruppe ab (wie „Test planen") – ohne Sprachkurs erscheint er nicht.
 */
export function KlassenspielKnopf({ kursId, gruppeId }: { kursId?: string; gruppeId?: string }): React.JSX.Element | null {
  const farbe = useProgrammFarbe()
  const [kurs, setKurs] = useState<string | null>(kursId ?? null)
  const [offen, setOffen] = useState(false)
  const [beamer, setBeamer] = useState<{ code: string; adresse: string } | null>(null)
  useEffect(() => {
    if (kursId || !gruppeId) return
    void holen<{ kurs: { id: string } | null }>(`/server/testplaene/${encodeURIComponent(gruppeId)}/kopf`).then(
      (k) => setKurs(k.kurs?.id ?? null),
      () => setKurs(null)
    )
  }, [kursId, gruppeId])
  if (!kurs) return null
  return (
    <>
      <Button variant="light" color={farbe} radius="xl" leftSection={<IconDeviceGamepad2 size={16} />} onClick={() => setOffen(true)} data-klassenspiel-knopf>
        Klassenspiel
      </Button>
      {offen && (
        <StartFenster
          kursId={kurs}
          schliessen={() => setOffen(false)}
          gestartet={(code, adresse) => {
            setOffen(false)
            setBeamer({ code, adresse })
          }}
        />
      )}
      {beamer && <Beamer code={beamer.code} adresse={beamer.adresse} schliessen={() => setBeamer(null)} />}
    </>
  )
}

// ============================================================================ Startfenster

function StartFenster({ kursId, schliessen, gestartet }: { kursId: string; schliessen: () => void; gestartet: (code: string, adresse: string) => void }): React.JSX.Element {
  const farbe = useProgrammFarbe()
  const [d, setD] = useState<Angebot | null>(null)
  const [schritt, setSchritt] = useState(0)
  const [e, setE] = useState<KlassenEinstellungen>({ ...STANDARD_EINSTELLUNGEN, spiel: 'expedition' })
  const [keys, setKeys] = useState<Set<string>>(new Set())
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<Angebot>(`/server/klassenspiel?kurs=${encodeURIComponent(kursId)}`).then(setD, (x: unknown) => {
      notifyError(x)
      schliessen()
    })
  }, [kursId, schliessen])
  const setze = (teil: Partial<KlassenEinstellungen>): void => setE((alt) => ({ ...alt, ...teil }))
  const baende = useMemo(() => testAuswahlGliedern(d?.eintraege ?? []), [d])
  const zahlen = auswahlZahlen(d?.eintraege ?? [], keys)
  const info = d?.spiele.find((s) => s.id === e.spiel)
  const umschalten = (liste: string[], an: boolean): void => {
    const neu = new Set(keys)
    for (const k of liste) if (an) neu.add(k)
    else neu.delete(k)
    setKeys(neu)
  }
  const starten = async (): Promise<void> => {
    if (!d) return
    setLaeuft(true)
    try {
      const r = await senden<{ code: string }>('/server/klassenspiel/neu', { kurs: kursId, einstellungen: { ...e, keys: [...keys] } })
      gestartet(r.code, d.adresse)
    } catch (x) {
      notifyError(x)
    } finally {
      setLaeuft(false)
    }
  }
  const auswahlLeer = e.quelle === 'auswahl' && keys.size === 0

  return (
    <Modal opened onClose={schliessen} size="xl" title={<Text fw={700}>Klassenspiel{d ? ` – ${d.titel}` : ''}</Text>} data-klassenspiel-start>
      {!d ? (
        <Center h={200}>
          <Loader />
        </Center>
      ) : d.laufend ? (
        <Stack>
          <Alert color="blue" title="Ein Klassenspiel läuft schon">
            Für diesen Kurs ist ein Klassenspiel offen. Du kannst es wieder auf den Beamer holen oder ein neues starten (das alte endet dann).
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setD({ ...d, laufend: null })}>
              Neues Spiel
            </Button>
            <Button color={farbe} onClick={() => gestartet(d.laufend!.code, d.adresse)} data-klassenspiel-zurueck>
              Zum laufenden Spiel
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <Stepper active={schritt} onStepClick={setSchritt} size="sm" color={farbe}>
            <Stepper.Step label="Spiel" />
            <Stepper.Step label="Inhalt" />
            <Stepper.Step label="Schwierigkeit" />
          </Stepper>

          {schritt === 0 && (
            <Stack gap="md">
              {(['koop', 'team', 'einzeln'] as const).map((art) => {
                const liste = d.spiele.filter((s) => s.art === art)
                if (!liste.length) return null
                return (
                  <div key={art}>
                    <Text fw={700} mb={6}>
                      {ART_TITEL[art]}
                    </Text>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      {liste.map((s) => {
                        const gewaehlt = e.spiel === s.id
                        const rekord = d.rekorde[s.id]
                        return (
                          <UnstyledButton key={s.id} disabled={!s.spielbar} onClick={() => setze({ spiel: s.id })} data-klassenspiel-wahl={s.id}>
                            <Card withBorder radius="md" padding="sm" style={{ opacity: s.spielbar ? 1 : 0.5, borderColor: gewaehlt ? `var(--mantine-color-${farbe}-filled)` : undefined, borderWidth: gewaehlt ? 2 : 1 }}>
                              <Group justify="space-between" wrap="nowrap" gap="xs">
                                <Text fw={700}>{s.name}</Text>
                                {!s.spielbar && <Badge size="xs" color="gray">bald</Badge>}
                                {rekord && s.spielbar && (
                                  <Badge size="xs" variant="light" color="yellow">
                                    Rekord: {rekord.text}
                                  </Badge>
                                )}
                              </Group>
                              <Text size="sm" c="dimmed">
                                {s.kurz}
                              </Text>
                              {gewaehlt && (
                                <Text size="xs" mt={4}>
                                  {s.regel}
                                </Text>
                              )}
                            </Card>
                          </UnstyledButton>
                        )
                      })}
                    </SimpleGrid>
                  </div>
                )
              })}
            </Stack>
          )}

          {schritt === 1 && (
            <Stack gap="sm">
              <SegmentedControl
                value={e.quelle}
                onChange={(v) => setze({ quelle: v as 'auswahl' | 'behandelt' })}
                data={[
                  { value: 'behandelt', label: 'Alles Behandelte gemischt' },
                  { value: 'auswahl', label: 'Gezielte Auswahl' }
                ]}
                data-klassenspiel-quelle
              />
              <Group gap="lg">
                <Checkbox label="Vokabeln" checked={e.vok} onChange={(x) => setze({ vok: x.currentTarget.checked, gram: x.currentTarget.checked ? e.gram : true })} data-klassenspiel-vok />
                <Checkbox label="Grammatik" checked={e.gram} onChange={(x) => setze({ gram: x.currentTarget.checked, vok: x.currentTarget.checked ? e.vok : true })} data-klassenspiel-gram />
                <Switch label="Schwächen der Klasse zuerst" checked={e.schwaechen} onChange={(x) => setze({ schwaechen: x.currentTarget.checked })} data-klassenspiel-schwaechen />
              </Group>
              {e.quelle === 'auswahl' && (
                <ScrollArea.Autosize mah="45vh" offsetScrollbars type="auto">
                  <Stack gap="sm" pr={4}>
                    {baende.map((b) => {
                      const alle = bandSchluessel(b)
                      const n = alle.filter((k) => keys.has(k)).length
                      return (
                        <BandGruppe key={b.buch || '-'} buch={b.buch} ohneBand="Ohne Lehrwerk" zusatz={n ? `${n} gewählt` : `${b.units.length} Units`}>
                          <Stack gap={6} mt={4}>
                            {b.units.map((u) => {
                              const uk = unitSchluessel(u).filter((k) => (k.startsWith('gram:') ? e.gram : e.vok))
                              if (!uk.length) return null
                              const m = uk.filter((k) => keys.has(k)).length
                              return (
                                <Paper key={u.schluessel} withBorder radius="md" p="xs">
                                  <Checkbox
                                    color={farbe}
                                    label={<Text fw={600} size="sm">{u.unit || 'Ohne Unit'}</Text>}
                                    checked={m > 0 && m === uk.length}
                                    indeterminate={m > 0 && m < uk.length}
                                    onChange={() => umschalten(uk, m < uk.length)}
                                    data-klassenspiel-unit={u.unit || 'ohne'}
                                  />
                                  <Group gap="md" mt={4} pl={28}>
                                    {e.vok &&
                                      u.vok.map((x) => (
                                        <Checkbox key={x.key} size="xs" color={farbe} checked={keys.has(x.key)} onChange={() => umschalten([x.key], !keys.has(x.key))} label={x.name || x.titel} />
                                      ))}
                                    {e.gram &&
                                      u.gram.map((x) => (
                                        <Checkbox key={x.key} size="xs" color={farbe} checked={keys.has(x.key)} onChange={() => umschalten([x.key], !keys.has(x.key))} label={`📘 ${x.titel}`} />
                                      ))}
                                  </Group>
                                </Paper>
                              )
                            })}
                          </Stack>
                        </BandGruppe>
                      )
                    })}
                  </Stack>
                </ScrollArea.Autosize>
              )}
              <Text size="sm" c="dimmed" data-klassenspiel-zahlen>
                {e.quelle === 'auswahl'
                  ? keys.size
                    ? `${zahlen.abschnitte} Abschnitte (${zahlen.woerter} Wörter) · ${zahlen.grammatik} Grammatik`
                    : 'Noch nichts gewählt.'
                  : 'Alle für die Lernenden freigegebenen Vokabeln und die Grammatik des Kurses – gemischt.'}
              </Text>
            </Stack>
          )}

          {schritt === 2 && (
            <Stack gap="md">
              <SegmentedControl
                value={e.schwierigkeit}
                onChange={(v) => setze({ schwierigkeit: v as KlassenEinstellungen['schwierigkeit'] })}
                data={[
                  { value: 'adaptiv', label: 'Adaptiv' },
                  { value: 'level', label: 'Level steigen' },
                  { value: 'fest', label: 'Feste Stufe' }
                ]}
                data-klassenspiel-schwierigkeit
              />
              <Text size="sm" c="dimmed">
                {e.schwierigkeit === 'adaptiv'
                  ? 'Jede:r bekommt Aufgaben auf dem eigenen Niveau (aus dem Lernstand, laufend nachgeregelt – etwa 3 von 4 gelingen). Leichtes zum Auswählen, Schweres zum Schreiben.'
                  : e.schwierigkeit === 'level'
                  ? 'Alle beginnen mit Erkennen und Auswählen; mit jedem Level wird es schwerer – bis zum Schreiben im Satz.'
                  : 'Alle bekommen dieselbe Antwortform; die Wörter und Formen richten sich nach dem eigenen Lernstand.'}
              </Text>
              {e.schwierigkeit === 'fest' && (
                <SegmentedControl
                  value={e.feste}
                  onChange={(v) => setze({ feste: v as KlassenEinstellungen['feste'] })}
                  data={[
                    { value: 'leicht', label: 'Leicht (auswählen)' },
                    { value: 'mittel', label: 'Mittel' },
                    { value: 'schwer', label: 'Schwer (schreiben)' }
                  ]}
                />
              )}
              <div>
                <Text size="sm" fw={600}>
                  Dauer: {e.dauer} Minuten
                </Text>
                <Slider min={3} max={30} step={1} value={e.dauer} onChange={(v) => setze({ dauer: v })} marks={[{ value: 5 }, { value: 10 }, { value: 15 }, { value: 20 }, { value: 30 }]} data-klassenspiel-dauer />
              </div>
              {info?.teams === 'waehlbar' && (
                <div>
                  <Text size="sm" fw={600} mb={4}>
                    Teams
                  </Text>
                  <SegmentedControl value={String(e.teams)} onChange={(v) => setze({ teams: Number(v) })} data={['2', '3', '4', '5', '6']} data-klassenspiel-teams />
                </div>
              )}
              <Switch
                label="Am Ende die Top 3 zeigen (nach Verbesserungspunkten – nie ein letzter Platz)"
                checked={e.top3}
                onChange={(x) => setze({ top3: x.currentTarget.checked })}
                data-klassenspiel-top3
              />
            </Stack>
          )}

          <Group justify="space-between" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            <Text size="sm" c="dimmed">
              {d.lernende} Lernende im Kurs
            </Text>
            <Group gap="xs">
              {schritt > 0 && (
                <Button variant="default" onClick={() => setSchritt(schritt - 1)}>
                  Zurück
                </Button>
              )}
              {schritt < 2 ? (
                <Button color={farbe} onClick={() => setSchritt(schritt + 1)} disabled={!info?.spielbar || (schritt === 1 && auswahlLeer)} data-klassenspiel-weiter>
                  Weiter
                </Button>
              ) : (
                <Button color={farbe} leftSection={<IconPlayerPlay size={16} />} onClick={() => void starten()} loading={laeuft} disabled={auswahlLeer} data-klassenspiel-oeffnen>
                  Spiel öffnen
                </Button>
              )}
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

// ============================================================================ Beamer

function useUhr(sicht: BeamerSicht | null): string {
  const [jetzt, setJetzt] = useState(Date.now())
  const versatz = useRef(0)
  useEffect(() => {
    if (sicht) versatz.current = sicht.jetzt - Date.now()
  }, [sicht])
  useEffect(() => {
    const t = setInterval(() => setJetzt(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  if (!sicht || sicht.phase !== 'spiel') return ''
  const rest = Math.max(0, Math.ceil((sicht.bis - (sicht.pause ? sicht.jetzt : jetzt + versatz.current)) / 1000))
  return `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`
}

/** Los-Animation: 3 Sekunden lang wechseln die Namen zufällig zwischen den Teams, dann steht das Ergebnis */
function useLosen(sicht: BeamerSicht | null): TeamSicht[] | null {
  const [anzeige, setAnzeige] = useState<TeamSicht[] | null>(null)
  const seit = sicht?.losenSeit ?? null
  useEffect(() => {
    if (!sicht || !seit || !sicht.teams.length) return setAnzeige(null)
    const alle = sicht.teams.flatMap((t) => t.mitglieder)
    const ende = Date.now() + 3000
    const t = setInterval(() => {
      if (Date.now() > ende) {
        clearInterval(t)
        setAnzeige(null)
        return
      }
      const gemischt = [...alle].sort(() => Math.random() - 0.5)
      setAnzeige(sicht.teams.map((x, i) => ({ ...x, mitglieder: gemischt.filter((_, k) => k % sicht.teams.length === i) })))
    }, 140)
    return () => clearInterval(t)
    // Nur bei neuem Losen starten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seit])
  return anzeige
}

export function Beamer({ code, adresse, schliessen }: { code: string; adresse: string; schliessen: () => void }): React.JSX.Element {
  const farbe = useProgrammFarbe()
  const rahmen = useRef<HTMLDivElement>(null)
  const { sicht, fehler, setSicht } = useLiveSicht<BeamerSicht>({
    strom: `/server/klassenspiel/${code}/strom`,
    zustand: `/server/klassenspiel/${code}/zustand`,
    kanal: 'klasse:beamer'
  })
  const uhr = useUhr(sicht)
  const losen = useLosen(sicht)
  const [vollbild, setVollbild] = useState(false)
  const [auswertung, setAuswertung] = useState(false)
  const [laeuft, setLaeuft] = useState('')
  const link = `${(adresse || window.location.origin).replace(/\/$/, '')}/s/ks/${code}`
  const qr = useMemo(() => qrDataUrl(link, 60), [link])

  const steuern = useCallback(
    async (aktion: string, extra: Record<string, unknown> = {}): Promise<void> => {
      setLaeuft(aktion)
      try {
        const r = await senden<{ sicht?: BeamerSicht }>(`/server/klassenspiel/${code}/steuern`, { aktion, ...extra })
        if (r.sicht) setSicht(r.sicht)
        if (aktion === 'schliessen') schliessen()
      } catch (x) {
        notifyError(x)
      } finally {
        setLaeuft('')
      }
    },
    [code, setSicht, schliessen]
  )
  const vollbildUmschalten = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void rahmen.current?.requestFullscreen?.().catch(() => undefined)
  }
  useEffect(() => {
    const f = (): void => setVollbild(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])

  const s = sicht
  const teamSpiel = Boolean(s && (s.art === 'team' || s.teams.length || ['puzzle', 'turnier'].includes(s.spiel)))
  const online = s?.personen.filter((p) => p.online).length ?? 0

  return (
    <Modal opened onClose={() => undefined} withCloseButton={false} fullScreen padding={0}>
      <div ref={rahmen} style={{ minHeight: '100vh', background: 'var(--mantine-color-body)', display: 'flex', flexDirection: 'column' }} data-klassenspiel-beamer={s?.phase ?? 'laden'}>
        {/* Kopf: Spiel, Uhr, Steuerung */}
        <Group justify="space-between" px="lg" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }} wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={42} radius="md" color={farbe}>
              <IconDeviceGamepad2 size={26} />
            </ThemeIcon>
            <div>
              <Title order={3}>{s?.spielName ?? 'Klassenspiel'}</Title>
              <Text size="sm" c="dimmed">
                {s?.titel} · Code <b>{code}</b>
                {s && s.einst.schwierigkeit === 'level' && s.phase === 'spiel' ? ` · Level ${s.level}` : ''}
              </Text>
            </div>
          </Group>
          {uhr && (
            <Text fw={900} size="2.4rem" c={s?.pause ? 'orange' : undefined} data-klassenspiel-uhr>
              {s?.pause ? '⏸ ' : ''}
              {uhr}
            </Text>
          )}
          <Group gap="xs" wrap="nowrap">
            {s?.phase === 'lobby' && teamSpiel && (
              <Button leftSection={<IconUsersGroup size={16} />} variant="light" color={farbe} onClick={() => void steuern('losen')} loading={laeuft === 'losen'} disabled={!s.personen.length} data-klassenspiel-losen>
                Teams losen
              </Button>
            )}
            {s?.phase === 'teams' && (
              <Button leftSection={<IconRefresh size={16} />} variant="default" onClick={() => void steuern('losen')} loading={laeuft === 'losen'} data-klassenspiel-neu-losen>
                Neu losen
              </Button>
            )}
            {(s?.phase === 'lobby' || s?.phase === 'teams') && (
              <Button leftSection={<IconPlayerPlay size={16} />} color={farbe} onClick={() => void steuern('start')} loading={laeuft === 'start'} disabled={!s.personen.length} data-klassenspiel-start-knopf>
                Start
              </Button>
            )}
            {s?.phase === 'spiel' &&
              (s.pause ? (
                <Button leftSection={<IconPlayerPlay size={16} />} color={farbe} onClick={() => void steuern('weiter')} data-klassenspiel-weiter-knopf>
                  Weiter
                </Button>
              ) : (
                <Button leftSection={<IconPlayerPause size={16} />} variant="default" onClick={() => void steuern('pause')} data-klassenspiel-pause>
                  Pause
                </Button>
              ))}
            {s?.phase === 'spiel' && (
              <Button leftSection={<IconPlayerStop size={16} />} variant="default" color="red" onClick={() => void steuern('ende')} loading={laeuft === 'ende'} data-klassenspiel-beenden>
                Beenden
              </Button>
            )}
            {s?.phase === 'ende' && (
              <>
                <Tooltip label="Zeigt Namen und Fehler – vorher den Beamer stummschalten">
                  <Button leftSection={<IconReportAnalytics size={16} />} variant="light" color={farbe} onClick={() => setAuswertung(!auswertung)} data-klassenspiel-auswertung-knopf>
                    {auswertung ? 'Zurück zum Ergebnis' : 'Auswertung'}
                  </Button>
                </Tooltip>
                <Button leftSection={<IconRefresh size={16} />} variant="default" onClick={() => void steuern('nochmal')} data-klassenspiel-nochmal>
                  Nochmal
                </Button>
              </>
            )}
            <Tooltip label={vollbild ? 'Vollbild verlassen' : 'Vollbild (Beamer)'}>
              <ActionIcon variant="default" size="lg" onClick={vollbildUmschalten} aria-label="Vollbild">
                {vollbild ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Klassenspiel schließen">
              <ActionIcon variant="default" size="lg" onClick={() => void steuern('schliessen')} aria-label="Klassenspiel schließen" data-klassenspiel-schliessen>
                <IconX size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <ScrollArea style={{ flex: 1 }} p="lg">
          {!s ? (
            <Center h="60vh">{fehler ? <Alert color="red">{fehler}</Alert> : <Loader />}</Center>
          ) : auswertung && s.phase === 'ende' ? (
            <Auswertung schliessen={() => setAuswertung(false)} sicht={s} />
          ) : s.phase === 'lobby' || s.phase === 'teams' ? (
            <Stack gap="lg" maw={1400} mx="auto">
              <Group align="flex-start" gap="xl" wrap="wrap" justify="center">
                <Paper withBorder radius="lg" p="lg" ta="center">
                  <img src={qr} alt={`QR-Code: ${link}`} style={{ width: 'min(32vh, 300px)', height: 'auto', display: 'block', margin: '0 auto' }} data-klassenspiel-qr />
                  <Text size="lg" mt="xs">
                    Code eingeben oder scannen
                  </Text>
                  <Text fw={900} style={{ fontSize: 'min(9vh, 84px)', letterSpacing: 10, lineHeight: 1.1 }} data-klassenspiel-code>
                    {code}
                  </Text>
                </Paper>
                <Stack gap="sm" style={{ flex: 1, minWidth: 320, maxWidth: 760 }}>
                  <Text fw={900} size="2rem">
                    {s.spielName}
                  </Text>
                  <Text size="xl">{s.regel}</Text>
                  <Group gap="xs">
                    <Badge size="lg" variant="light">
                      {s.inhalt.vok ? `${s.inhalt.vok} Vokabeln` : ''}
                      {s.inhalt.vok && s.inhalt.gram ? ' · ' : ''}
                      {s.inhalt.gram ? `${s.inhalt.gram} Grammatikaufgaben` : ''}
                    </Badge>
                    <Badge size="lg" variant="light" color="grape">
                      {s.einst.schwierigkeit === 'adaptiv' ? 'Adaptiv – jede:r auf eigenem Niveau' : s.einst.schwierigkeit === 'level' ? 'Level steigen' : `Feste Stufe: ${s.einst.feste}`}
                    </Badge>
                    <Badge size="lg" variant="light" color="gray">
                      {s.einst.dauer} Minuten
                    </Badge>
                  </Group>
                  <Text fw={800} size="xl" mt="sm" data-klassenspiel-dabei={s.personen.length}>
                    Dabei: {s.personen.length} von {s.kurs}
                    {online < s.personen.length ? ` (${online} verbunden)` : ''}
                  </Text>
                  {s.phase === 'lobby' && (
                    <Group gap={6}>
                      {s.personen.map((p) => (
                        <Badge key={p.id} size="lg" variant={p.online ? 'filled' : 'outline'} color={farbe} tt="none" data-klassenspiel-person={p.name}>
                          {p.name}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </Stack>
              </Group>
              {s.phase === 'teams' && <TeamKarten teams={losen ?? s.teams} />}
            </Stack>
          ) : (
            <Stack gap="lg" maw={1400} mx="auto">
              {s.phase === 'ende' && s.ergebnis && (
                <Paper withBorder radius="lg" p="lg" ta="center" data-klassenspiel-ergebnis>
                  <Text fw={900} size="2.6rem">
                    {s.ergebnis.sieg === true ? '🎉 ' : ''}
                    {s.ergebnis.text}
                  </Text>
                  {s.ergebnis.rekord?.neu && (
                    <Text fw={800} size="xl" c="yellow.7" mt="xs" data-klassenspiel-rekord>
                      🏆 Neuer Klassenrekord: {s.ergebnis.rekord.text}
                    </Text>
                  )}
                  {s.ergebnis.rekord && !s.ergebnis.rekord.neu && (
                    <Text c="dimmed" mt="xs">
                      Klassenrekord: {s.ergebnis.rekord.text}
                    </Text>
                  )}
                  {s.ergebnis.top3.length > 0 && (
                    <Center mt="lg">
                      <Podest titel="Am meisten verbessert" plaetze={s.ergebnis.top3.map((x) => ({ name: x.name, wert: `${x.punkte} Punkte` }))} />
                    </Center>
                  )}
                </Paper>
              )}
              {s.pause && s.phase === 'spiel' && (
                <Text fw={900} size="3rem" ta="center" c="orange">
                  ⏸ Pause
                </Text>
              )}
              <BeamerBloecke bloecke={s.bloecke} />
              {s.teams.length > 0 && s.phase === 'spiel' && s.spiel !== 'rennen' && <TeamKarten teams={s.teams} gross={false} />}
              {s.phase === 'spiel' && (
                <Text c="dimmed" ta="center">
                  {online} von {s.personen.length} verbunden · Wer später kommt: Code {code}
                </Text>
              )}
            </Stack>
          )}
        </ScrollArea>
      </div>
    </Modal>
  )
}

/**
 * Auswertung nur für die Lehrkraft: ersetzt nach einem Klick die Spielfläche (ein Seitenfenster wäre im Vollbild nicht zu
 * sehen). Namen und Fehler – darum der Hinweis, den Beamer vorher stummzuschalten.
 */
function Auswertung({ schliessen, sicht }: { schliessen: () => void; sicht: BeamerSicht | null }): React.JSX.Element {
  const a = sicht?.auswertung
  const [person, setPerson] = useState<string | null>(null)
  return (
    <Stack maw={1100} mx="auto" data-klassenspiel-auswertung>
      <Group justify="space-between">
        <Title order={3}>Auswertung – nur für dich</Title>
        <Button variant="default" onClick={schliessen}>
          Zurück zum Ergebnis
        </Button>
      </Group>
      <Alert color="orange" py={6}>
        Hier stehen Namen und Fehler. Wenn dein Bildschirm am Beamer hängt: vorher stummschalten (Taste „Freeze" bzw. „Blank").
      </Alert>
      {!a ? (
        <Text c="dimmed">Die Auswertung gibt es nach dem Spiel.</Text>
      ) : (
        <Stack gap="lg">
          <div>
            <Text fw={700} mb={4}>
              Was der Klasse schwerfiel
            </Text>
            {a.items.length === 0 ? (
              <Text size="sm" c="dimmed">
                Keine Fehler – alles saß.
              </Text>
            ) : (
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Wort / Aufgabe</Table.Th>
                    <Table.Th w={110}>richtig</Table.Th>
                    <Table.Th w={110}>falsch</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {a.items.map((i) => (
                    <Table.Tr key={i.id} data-auswertung-item>
                      <Table.Td>
                        {i.bereich === 'gram' ? '📘 ' : ''}
                        {i.text}
                      </Table.Td>
                      <Table.Td>{i.richtig}</Table.Td>
                      <Table.Td>{i.falsch}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            <Text size="xs" c="dimmed" mt={4}>
              Falsch Beantwortetes ist im Kasten der Lernenden jetzt als wackelig markiert und kommt beim Üben wieder.
            </Text>
          </div>
          <div>
            <Text fw={700} mb={4}>
              Je Lernende:r
            </Text>
            <Table withTableBorder highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>richtig</Table.Th>
                  <Table.Th>falsch</Table.Th>
                  <Table.Th>Entwicklung im Spiel</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {a.personen.map((p) => (
                  <Fragment key={p.id}>
                    <Table.Tr onClick={() => setPerson(person === p.id ? null : p.id)} style={{ cursor: 'pointer' }} data-auswertung-person={p.name}>
                      <Table.Td>{p.name}</Table.Td>
                      <Table.Td>{p.richtig}</Table.Td>
                      <Table.Td>{p.falsch}</Table.Td>
                      <Table.Td>{p.entwicklung}</Table.Td>
                    </Table.Tr>
                    {person === p.id && p.fehler.length > 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text size="sm">Fehler: {p.fehler.join(' · ')}</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Fragment>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        </Stack>
      )}
    </Stack>
  )
}
