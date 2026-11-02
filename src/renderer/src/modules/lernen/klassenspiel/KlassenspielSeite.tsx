/**
 * Klassenspiel – Lernende (02.11.2026): /s/ks/<CODE>. Warten auf den Start, Team (nach dem Losen), eigene Fragen auf dem
 * eigenen Niveau (Bausteine vom Server, wie „Zusammen spielen"), am Ende das Klassen-/Teamergebnis und die eigene
 * Leistung privat. Kein letzter Platz, nur Top 3 (abgestimmt).
 */
import { Alert, Badge, Button, Card, Center, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { IconHome, IconTrophy } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { Block } from '@shared/mehrspieler/kern'
import { liveSenden, useLiveSicht } from '../../../shared/liveSicht'
import { senden } from '../../onlinetest/serverApi'
import { Bloecke, SPIEL_OHNE_MARKIEREN } from '../mehrspieler/Bloecke'
import { kt } from '@shared/klassenspiel/texte'

interface Sicht {
  code: string
  phase: 'lobby' | 'teams' | 'spiel' | 'ende'
  titel: string
  spiel: string
  spielName: string
  art: string
  regel: string
  sprache: string
  jahrgang: number | null
  dabei: boolean
  name: string
  aufgabeNr?: number
  bis: number
  jetzt: number
  pause: boolean
  losenSeit?: number
  team: { name: string; farbe: string; symbol: string; mitglieder: string[] } | null
  bloecke?: Block[]
  ergebnis?: {
    text: string
    sieg: boolean | null
    teams: { nr: number; name: string; farbe: string; symbol: string; wert: number }[] | null
    siegerTeams: number[]
    top3: { name: string; ich: boolean }[]
    eigen: { richtig: number; falsch: number; punkte: number; gewonnen: boolean | null } | null
    eigenText?: string | null
    rekord: string | null
  }
}

function Uhr({ s }: { s: Sicht }): React.JSX.Element | null {
  const [jetzt, setJetzt] = useState(Date.now())
  const [versatz] = useState(() => s.jetzt - Date.now())
  useEffect(() => {
    const t = setInterval(() => setJetzt(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  if (s.phase !== 'spiel') return null
  const rest = Math.max(0, Math.ceil((s.bis - (s.pause ? s.jetzt : jetzt + versatz)) / 1000))
  return (
    <Text fw={800} c={rest <= 30 ? 'red' : undefined} data-klasse-uhr>
      ⏱ {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}
    </Text>
  )
}

/** Los-Animation am Gerät: kurz wechselnde Teamfarben, dann das eigene Team */
function Losen({ s }: { s: Sicht }): React.JSX.Element | null {
  const [mischen, setMischen] = useState(false)
  const [farbe, setFarbe] = useState(0)
  useEffect(() => {
    if (!s.losenSeit) return
    setMischen(true)
    const t = setInterval(() => setFarbe((f) => f + 1), 130)
    const aus = setTimeout(() => (clearInterval(t), setMischen(false)), 2800)
    return () => (clearInterval(t), clearTimeout(aus))
  }, [s.losenSeit])
  if (!s.team) return null
  const FARBEN = ['red', 'blue', 'teal', 'yellow', 'grape', 'orange']
  return (
    <Card withBorder radius="lg" padding="lg" ta="center" style={{ borderTop: `8px solid var(--mantine-color-${mischen ? FARBEN[farbe % 6] : s.team.farbe}-filled)` }} data-klasse-team={mischen ? '' : s.team.name}>
      {mischen ? (
        <Text fw={900} size="2rem">
          🎲 …
        </Text>
      ) : (
        <>
          <Text fw={900} size="2rem" c={s.team.farbe}>
            {s.team.symbol} {s.team.name}
          </Text>
          <Text mt={4}>{s.team.mitglieder.join(', ')}</Text>
        </>
      )}
    </Card>
  )
}

export function KlassenspielSeite({ code }: { code: string }): React.JSX.Element {
  const vorher = useCallback(() => senden('/s/api/klassenspiel/beitreten', { code }), [code])
  const { sicht: s, fehler, setSicht, setFehler } = useLiveSicht<Sicht>({
    strom: `/s/api/klassenspiel/strom?code=${code}`,
    zustand: `/s/api/klassenspiel/zustand?code=${code}`,
    kanal: 'klasse:sicht',
    vorher
  })
  const antwort = useCallback(
    (aktion: string, wert?: unknown): void => {
      // Antwort auf die Frage – oder ein Zug davor (Einsatz im Wett-Quiz, Sterne in der Gebietseroberung)
      if (aktion === 'antwort') void liveSenden<Sicht>('/s/api/klassenspiel/antwort', { code, wert, nr: s?.aufgabeNr ?? 0 }, setSicht, setFehler, 15000)
      else void liveSenden<Sicht>('/s/api/klassenspiel/zug', { code, aktion, wert }, setSicht, setFehler, 15000)
    },
    [code, s?.aufgabeNr, setSicht, setFehler]
  )

  return (
    <Stack gap="md" maw={720} mx="auto" p="md" data-mehr-seite data-klasse-seite={s?.phase ?? 'laden'}>
      <style>{SPIEL_OHNE_MARKIEREN}</style>
      {!s ? (
        <Center h={240}>{fehler ? <Alert color="red">{fehler}</Alert> : <Loader />}</Center>
      ) : (
        <>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Title order={3}>{s.spielName}</Title>
              <Text size="sm" c="dimmed">
                {s.titel}
                {s.name ? ` · ${s.name}` : ''}
              </Text>
            </div>
            <Uhr s={s} />
          </Group>
          {fehler && (
            <Alert color="orange" py={6}>
              {fehler}
            </Alert>
          )}
          {s.phase === 'lobby' && (
            <Card withBorder radius="lg" padding="lg" ta="center" data-klasse-warten>
              <Text fw={800} size="xl">
                {kt(s.sprache, 'uiDuDabei')}
              </Text>
              <Text mt="xs">{s.regel}</Text>
              <Text c="dimmed" mt="md">
                {kt(s.sprache, 'uiGleich')}
              </Text>
            </Card>
          )}
          {s.phase === 'teams' && (
            <Stack>
              <Losen s={s} />
              <Text c="dimmed" ta="center">
                {kt(s.sprache, 'uiGleichKurz')}
              </Text>
            </Stack>
          )}
          {s.phase === 'spiel' && (
            <>
              {s.team && (
                <Badge size="lg" color={s.team.farbe} variant="light" tt="none" style={{ alignSelf: 'flex-start' }}>
                  {s.team.symbol} {s.team.name}
                </Badge>
              )}
              {s.pause ? (
                <Card withBorder radius="lg" padding="xl" ta="center">
                  <Text fw={900} size="2rem">
                    ⏸ {kt(s.sprache, 'uiPause')}
                  </Text>
                </Card>
              ) : (
                <Bloecke bloecke={s.bloecke ?? []} senden={antwort} sprache={s.sprache} jahrgang={s.jahrgang} />
              )}
            </>
          )}
          {s.phase === 'ende' && s.ergebnis && (
            <Stack data-klasse-ergebnis>
              <Paper withBorder radius="lg" p="lg" ta="center">
                <Text fw={900} size="1.6rem">
                  {s.ergebnis.sieg ? '🎉 ' : ''}
                  {s.ergebnis.text}
                </Text>
                {s.ergebnis.rekord && (
                  <Text fw={800} c="yellow.7" mt="xs">
                    {kt(s.sprache, 'uiNeuerRekord', s.ergebnis.rekord)}
                  </Text>
                )}
              </Paper>
              {s.ergebnis.eigen && (
                <Card withBorder radius="lg" padding="md" data-klasse-eigen>
                  <Text fw={700}>{kt(s.sprache, 'uiDeineRunde')}</Text>
                  <Text>{kt(s.sprache, 'uiEigen', s.ergebnis.eigen.richtig, s.ergebnis.eigen.falsch, s.ergebnis.eigen.punkte)}</Text>
                  {s.ergebnis.eigen.gewonnen && <Text c="teal">{kt(s.sprache, 'uiTeamGewonnen')}</Text>}
                  {s.ergebnis.eigenText && (
                    <Text size="sm" mt={4} data-klasse-eigen-text>
                      {s.ergebnis.eigenText}
                    </Text>
                  )}
                  {s.ergebnis.eigen.falsch > 0 && (
                    <Text size="sm" c="dimmed" mt={4}>
                      {kt(s.sprache, 'uiWiederUeben')}
                    </Text>
                  )}
                </Card>
              )}
              {s.ergebnis.top3.length > 0 && (
                <Card withBorder radius="lg" padding="md">
                  <Group gap={6}>
                    <IconTrophy size={18} />
                    <Text fw={700}>{kt(s.sprache, 'uiVerbessert')}</Text>
                  </Group>
                  {s.ergebnis.top3.map((x, i) => (
                    <Text key={i} fw={x.ich ? 800 : 400}>
                      {i + 1}. {x.name}
                      {x.ich ? kt(s.sprache, 'uiDasBistDu') : ''}
                    </Text>
                  ))}
                </Card>
              )}
              <Button variant="light" leftSection={<IconHome size={16} />} component="a" href="/s/">
                {kt(s.sprache, 'uiStart')}
              </Button>
            </Stack>
          )}
        </>
      )}
    </Stack>
  )
}
