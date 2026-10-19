/**
 * Reiter „Sprechprüfungstraining" für Lehrkräfte (19.10.2026, abgestimmt) – in „Meine Klassen" (Kurs der Klasse) und auf
 * der Kursseite in Sprachenlernen. Freigeben: Teile einzeln (Interview, Monolog, Dialog, ganze Prüfung), Dauer
 * (Standard 2 Wochen), Minuten je Woche und Person, Niveau, nur 7–21 Uhr, ganze Klasse oder Einzelne. Überblick: wer
 * wie oft geübt hat, Klassenschnitt je Kriterium, je Person Verlauf und Tipps; Vorfälle mit dem einen Satz und
 * „Entsperren". Alles eine Hilfe für die Vorbereitung, nicht für die Note.
 */
import { Alert, Badge, Button, Card, Checkbox, Group, Loader, MultiSelect, NumberInput, Progress, Select, Stack, Switch, Table, Text } from '@mantine/core'
import { IconLock, IconMicrophone } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KRITERIEN } from '@shared/sprechen/kriterien'
import { NIVEAUS, TEIL_NAME, TEILE, type Niveau, type Teil } from '@shared/sprechen/niveaus'
import { gewertet, type Uebung } from './typen'

interface Ueberblick {
  verfuegbar: boolean
  sprache: string
  freigaben: { id: string; teile: Teil[]; bis: number; status: string; einstellungen: { minutenWoche: number; nurSchulzeit: boolean; niveau?: Niveau }; schueler: string[]; niveau: Niveau }[]
  personen: { id: string; name: string; uebungen: Uebung[]; gesperrt: boolean; vorfaelle: { art: string; satz: string; zeit: number; freigabe: string }[] }[]
}

const ART: Record<string, string> = { umgehung: 'Umgehungsversuch', themenfremd: 'Themenfremd', unangemessen: 'Unangemessen', manipulation: 'Anweisungen verändert' }
const tag = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

/** Ist die Gesprächs-KI eingerichtet? (Reiter nur dann) */
export function useSprechVerfuegbar(): boolean {
  const [da, setDa] = useState(false)
  useEffect(() => {
    void holen<{ verfuegbar: boolean }>('/server/sprechen/verfuegbar').then(
      (r) => setDa(r.verfuegbar),
      () => setDa(false)
    )
  }, [])
  return da
}

export function SprechLehrkraft({ vokId, lernende = [] }: { vokId: string; lernende?: { benutzer: string; name: string }[] }): React.JSX.Element {
  const [d, setD] = useState<Ueberblick | null>(null)
  const laden = useCallback(() => {
    void holen<Ueberblick>(`/server/sprechen?kurs=${encodeURIComponent(vokId)}`).then(setD, (e: unknown) => notifyError(e))
  }, [vokId])
  useEffect(laden, [laden])
  const [teile, setTeile] = useState<Teil[]>(['interview', 'dialog'])
  const [tage, setTage] = useState(14)
  const [minuten, setMinuten] = useState(30)
  const [niveau, setNiveau] = useState<string | null>(null)
  const [schulzeit, setSchulzeit] = useState(true)
  const [einzelne, setEinzelne] = useState<string[]>([])
  if (!d) return <Loader size="sm" />
  if (!['en', 'fr', 'es'].includes(d.sprache))
    return <Text c="dimmed">Das Sprechtraining gibt es für Englisch, Französisch und Spanisch.</Text>
  const freigeben = (): void =>
    void senden('/server/sprechen/freigeben', { kurs: vokId, teile, tage, minutenWoche: minuten, niveau, nurSchulzeit: schulzeit, schueler: einzelne }).then(
      () => (notifySuccess('Sprechtraining freigegeben.'), laden()),
      (e: unknown) => notifyError(e)
    )
  const laufend = d.freigaben.filter((f) => f.status === 'offen')
  const alle = d.personen.flatMap((p) => gewertet(p.uebungen))
  const schnitt = (k: string): number | null => {
    const w = alle.map((u) => u.wertung[k as keyof Uebung['wertung']]).filter((x): x is number => typeof x === 'number')
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null
  }
  return (
    <Stack gap="md" data-sprech-lehrkraft>
      {!d.verfuegbar && <Alert color="orange">Die Gesprächs-KI ist nicht eingerichtet (Einstellungen › Bilder und Hörtexte › Gesprächs-KI).</Alert>}
      <Card withBorder radius="md" padding="md">
        <Group gap="xs" mb="xs">
          <IconMicrophone size={18} />
          <Text fw={700}>Sprechtraining freigeben</Text>
        </Group>
        <Stack gap="sm">
          <Group gap="md">
            {TEILE.map((t) => (
              <Checkbox
                key={t}
                label={TEIL_NAME[t]}
                checked={teile.includes(t)}
                onChange={(e) => setTeile(e.currentTarget.checked ? [...teile, t] : teile.filter((x) => x !== t))}
                data-sprech-freigabe-teil={t}
              />
            ))}
          </Group>
          <Text size="xs" c="dimmed">
            Monolog braucht Bildkarten aus dem Pool der Schule; solange es keine gibt, bleibt er in der ganzen Prüfung weg.
          </Text>
          <Group gap="md" align="flex-end">
            <NumberInput label="Tage" min={1} max={90} value={tage} onChange={(v) => setTage(Number(v) || 14)} w={90} />
            <NumberInput label="Minuten je Woche und Person" min={5} max={300} value={minuten} onChange={(v) => setMinuten(Number(v) || 30)} w={210} />
            <Select
              label="Niveau"
              placeholder="nach Jahrgang"
              data={NIVEAUS.map((n) => ({ value: n, label: `GER ${n}` }))}
              value={niveau}
              onChange={setNiveau}
              clearable
              w={150}
            />
          </Group>
          <Switch label="Nur zwischen 7 und 21 Uhr" checked={schulzeit} onChange={(e) => setSchulzeit(e.currentTarget.checked)} />
          {lernende.length > 0 && (
            <MultiSelect
              label="Nur für einzelne (leer = ganze Klasse)"
              data={lernende.map((l) => ({ value: l.benutzer, label: l.name }))}
              value={einzelne}
              onChange={setEinzelne}
              searchable
              clearable
            />
          )}
          <Button onClick={freigeben} disabled={!teile.length} w="fit-content" data-sprech-freigeben>
            Für {tage} Tage freigeben
          </Button>
        </Stack>
      </Card>

      {laufend.length > 0 && (
        <Card withBorder radius="md" padding="md" data-sprech-freigaben>
          <Text fw={700} mb="xs">
            Laufende Freigaben
          </Text>
          <Stack gap={6}>
            {laufend.map((f) => (
              <Group key={f.id} justify="space-between" wrap="nowrap">
                <Group gap={6}>
                  {f.teile.map((t) => (
                    <Badge key={t} variant="light" tt="none">
                      {TEIL_NAME[t]}
                    </Badge>
                  ))}
                  <Text size="xs" c="dimmed">
                    bis {tag(f.bis)} · GER {f.niveau} · {f.einstellungen.minutenWoche} Min./Woche{f.schueler.length ? ` · ${f.schueler.length} Einzelne` : ''}
                  </Text>
                </Group>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  onClick={() => void senden(`/server/sprechen/${f.id}/beenden`, {}).then(laden, (e: unknown) => notifyError(e))}
                >
                  Beenden
                </Button>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      <Card withBorder radius="md" padding="md" data-sprech-ueberblick>
        <Text fw={700} mb="xs">
          Überblick
        </Text>
        {!d.personen.length ? (
          <Text size="sm" c="dimmed">
            Noch hat niemand geübt.
          </Text>
        ) : (
          <Stack gap="sm">
            <Group gap="lg">
              {KRITERIEN.map((k) => {
                const s = schnitt(k.id)
                return (
                  <div key={k.id} style={{ minWidth: 130 }}>
                    <Text size="xs" c="dimmed">
                      {k.kurz} (Klasse)
                    </Text>
                    <Progress value={((s ?? 0) / 5) * 100} size="sm" radius="xl" />
                    <Text size="xs">{s === null ? '–' : `${s.toFixed(1)}/5`}</Text>
                  </div>
                )
              })}
            </Group>
            <Table striped data-sprech-personen>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Übungen</Table.Th>
                  <Table.Th>Zuletzt</Table.Th>
                  <Table.Th>Tipp</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {d.personen.map((p) => {
                  const g = gewertet(p.uebungen)
                  const letzte = g[g.length - 1]
                  return (
                    <Table.Tr key={p.id} data-sprech-person={p.name}>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {p.name}
                        </Text>
                        {p.vorfaelle.map((v, i) => (
                          <Text key={i} size="xs" c="orange" data-sprech-vorfall={v.art}>
                            {ART[v.art] ?? v.art} · {tag(v.zeit)}
                            {v.satz ? ` · „${v.satz}“` : ''}
                          </Text>
                        ))}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{g.length}</Text>
                        <Text size="xs" c="dimmed">
                          {TEILE.filter((t) => g.some((u) => u.teil === t))
                            .map((t) => `${TEIL_NAME[t]} ${g.filter((u) => u.teil === t).length}`)
                            .join(' · ')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {letzte ? (
                          <Text size="xs">
                            {KRITERIEN.map((k) => `${k.kurz.split(' ')[0]} ${letzte.wertung[k.id] ?? '–'}`).join(' · ')}
                          </Text>
                        ) : (
                          '–'
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" lineClamp={2}>
                          {letzte?.tipps[0] ? `${letzte.tipps[0].titel}: ${letzte.tipps[0].besser || letzte.tipps[0].warum}` : '–'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {p.gesperrt && (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="orange"
                            leftSection={<IconLock size={12} />}
                            onClick={() =>
                              void senden(`/server/sprechen/${p.vorfaelle[0]?.freigabe ?? laufend[0]?.id ?? ''}/entsperren`, { schueler: p.id }).then(laden, (e: unknown) => notifyError(e))
                            }
                            data-sprech-entsperren={p.name}
                          >
                            Entsperren
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
      </Card>
    </Stack>
  )
}
