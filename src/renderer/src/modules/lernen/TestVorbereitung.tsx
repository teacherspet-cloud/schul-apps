/**
 * „Für den Test üben" (28.10.2026, abgestimmt mit der Lehrkraft) – /s/fuer-test/<id>: Bereitschaft für einen
 * anstehenden Test, „Vokabeln für den Test üben" (Trainer mit ?uebung=test: zuerst die heutigen Testwörter, dann das
 * Unsichere) und die Grammatik des Tests. Geübt wird im normalen Kasten – es zählt aufs Tagesziel.
 * Daten: GET /s/api/lernstand (`anstehend`, shared/testVorbereitung.ts).
 */
import { Alert, Button, Center, Group, Loader, Paper, Progress, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconBook2, IconCalendarEvent, IconLanguage } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen } from '../onlinetest/serverApi'
import { bereitschaft, testWann, type AnstehenderTest } from '@shared/testVorbereitung'
import { fachAusName } from '@shared/faecher'
import { VokabelBalken } from '../../shared/components/VokabelBalken'

const prozent = (x: number): string => `${Math.round(x * 100)} %`

/** Zeile unter „Mein Fortschritt": anstehender Test mit Bereitschaft, führt zur Testvorbereitung */
export function AnstehenderTestZeile({ t }: { t: AnstehenderTest }): React.JSX.Element {
  const b = bereitschaft(t)
  const fach = fachAusName(t.fach)?.label ?? t.fach
  return (
    <a href={`/s/fuer-test/${encodeURIComponent(t.id)}`} className="sl-zeile" data-anstehender-test={t.id}>
      <Group gap={8} wrap="nowrap" style={{ minWidth: 0, width: '100%' }}>
        <ThemeIcon variant="light" color="orange" radius="xl" size="md">
          <IconCalendarEvent size={16} />
        </ThemeIcon>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={600} truncate>
            Test {testWann(t.termin)}
            {fach ? ` · ${fach}` : ''}
          </Text>
          {b !== null ? (
            <Group gap={6} wrap="nowrap">
              <Progress value={b * 100} size={6} radius="xl" color={b >= 0.8 ? 'teal' : b >= 0.5 ? 'yellow' : 'orange'} style={{ flex: 1 }} />
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {prozent(b)} bereit · üben
              </Text>
            </Group>
          ) : (
            <Text size="xs" c="dimmed" truncate>
              {t.titel}
            </Text>
          )}
        </div>
      </Group>
    </a>
  )
}

export default function TestVorbereitung({ id }: { id: string }): React.JSX.Element {
  const [t, setT] = useState<AnstehenderTest | null | undefined>(undefined)
  useEffect(() => {
    void holen<{ anstehend?: AnstehenderTest[] }>('/s/api/lernstand').then(
      (r) => setT((r.anstehend ?? []).find((x) => x.id === id) ?? null),
      () => setT(null)
    )
  }, [id])
  if (t === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  if (!t)
    return (
      <Alert color="gray" title="Kein Test in Sicht">
        Für diesen Test gibt es gerade nichts vorzubereiten – vielleicht ist er schon vorbei.{' '}
        <a href="/s/">Zur Startseite</a>
      </Alert>
    )
  const b = bereitschaft(t)
  const fach = fachAusName(t.fach)?.label ?? t.fach
  const unsicher = t.vok ? t.vok.gesamt - t.vok.sicher : 0
  return (
    <Stack gap="md" maw={720} mx="auto" data-testvorbereitung={t.id}>
      <Paper withBorder radius="xl" p="lg" className="sl-karte">
        <Group gap="xs" mb={4}>
          <ThemeIcon variant="light" color="orange" radius="md">
            <IconCalendarEvent size={18} />
          </ThemeIcon>
          <Title order={3}>Für den Test üben</Title>
        </Group>
        <Text size="sm">
          <b>{t.titel}</b> {testWann(t.termin)}
          {fach && !t.titel.includes(fach) ? ` · ${fach}` : ''}
        </Text>
        {t.abschnitte.length > 0 && (
          <Text size="sm" c="dimmed">
            Dran kommt: {t.abschnitte.join(' · ')}
          </Text>
        )}
        {b !== null && (
          <Group gap={8} wrap="nowrap" mt="sm" data-bereitschaft={Math.round(b * 100)}>
            <Progress value={b * 100} size="lg" radius="xl" color={b >= 0.8 ? 'teal' : b >= 0.5 ? 'yellow' : 'orange'} style={{ flex: 1 }} />
            <Text fw={700} style={{ whiteSpace: 'nowrap' }}>
              {prozent(b)} bereit
            </Text>
          </Group>
        )}
      </Paper>

      {t.vok && t.kursId && (
        <Paper withBorder radius="xl" p="lg" className="sl-karte" data-test-vokabeln>
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="teal" radius="md">
              <IconLanguage size={18} />
            </ThemeIcon>
            <Title order={4}>Vokabeln</Title>
          </Group>
          <VokabelBalken a={t.vok} breite="100%" rechts={<></>} />
          <Text size="sm" mt={6}>
            {t.vok.sicher} von {t.vok.gesamt} Wörtern sitzen sicher, {t.vok.aufbau} sind im Aufbau
            {t.vok.neu ? `, ${t.vok.neu} noch neu` : ''}.
          </Text>
          <Button component="a" href={`/s/v/${t.kursId}?uebung=test`} mt="sm" color="teal" data-test-vokabeln-ueben>
            Vokabeln für den Test üben{unsicher ? ` · ${unsicher} noch nicht sicher` : ''}
          </Button>
        </Paper>
      )}

      {t.gram.length > 0 && (
        <Paper withBorder radius="xl" p="lg" className="sl-karte" data-test-grammatik>
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="violet" radius="md">
              <IconBook2 size={18} />
            </ThemeIcon>
            <Title order={4}>Grammatik</Title>
          </Group>
          <Stack gap="xs">
            {[...t.gram]
              .sort((a, c) => a.sicher / Math.max(1, a.gesamt) - c.sicher / Math.max(1, c.gesamt))
              .map((g) => (
                <Group key={g.id} gap="sm" wrap="nowrap" data-test-grammatik-form={g.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {g.titel}
                    </Text>
                    <Progress value={g.gesamt ? (g.sicher / g.gesamt) * 100 : 0} size={6} radius="xl" color="violet" />
                  </div>
                  <Button component="a" href={`/s/g/${g.id}`} size="xs" variant="light" color="violet">
                    Üben
                  </Button>
                </Group>
              ))}
          </Stack>
        </Paper>
      )}

      {t.art === 'online' && (
        <Alert color="blue" title="Onlinetest">
          Zu diesem Onlinetest gibt es in der App keine eigenen Übungen. Frag deine Lehrkraft, was drankommt.{' '}
          <a href="/s/tests">Zu den Tests</a>
        </Alert>
      )}
    </Stack>
  )
}
