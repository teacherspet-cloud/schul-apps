/**
 * Klassenspiel – Lernende (02.11.2026): /s/ks/<CODE>. Warten auf den Start, Team (nach dem Losen), eigene Fragen auf dem
 * eigenen Niveau (Bausteine vom Server, wie „Zusammen spielen"), am Ende das Klassen-/Teamergebnis und die eigene
 * Leistung privat. Kein letzter Platz, nur Top 3 (abgestimmt).
 */
import { Alert, Badge, Button, Card, Center, Group, Loader, Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconHome, IconTrophy } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Block } from '@shared/mehrspieler/kern'
import { liveSenden, useLiveSicht } from '../../../shared/liveSicht'
import { senden } from '../../onlinetest/serverApi'
import { Bloecke, SPIEL_OHNE_MARKIEREN } from '../mehrspieler/Bloecke'
import { kt } from '@shared/klassenspiel/texte'
import { figurBild } from './bossBilder'

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
  /** Boss-Kampf: Figurenwahl im Wartebereich */
  figurWahl?: { figuren: string[]; gewaehlt: string | null }
  /** Boss-Kampf: eigene Figur und Nummern für die Effekte (Schlag auf die Klasse, eigene Rückmeldung, Abwehr, Krit) */
  extra?: { figur?: string | null; schlag?: { nr: number; schaden: number }; rueck?: { nr: number; richtig: boolean } | null; abwehr?: number; krit?: number } | null
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

/** Figurenwahl im Wartebereich (Boss-Kampf, 17.11.2026): Mehrfachwahl erlaubt, vorne unterscheidet ein Farbring */
function FigurWahl({ s, waehlen }: { s: Sicht; waehlen: (f: string) => void }): React.JSX.Element {
  const w = s.figurWahl!
  return (
    <Card withBorder radius="lg" padding="md" data-klasse-figurwahl={w.gewaehlt ?? ''}>
      <Text fw={800} size="lg" ta="center">
        {kt(s.sprache, 'uiFigurWaehlen')}
      </Text>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8, marginTop: 10 }}>
        {w.figuren.map((f) => (
          <UnstyledButton
            key={f}
            onClick={() => waehlen(f)}
            aria-label={f}
            aria-pressed={w.gewaehlt === f}
            data-klasse-figur={f}
            style={{
              borderRadius: 12,
              padding: 6,
              background: 'linear-gradient(#1e2650, #141a33)',
              outline: w.gewaehlt === f ? '4px solid var(--mantine-color-yellow-5)' : '1px solid var(--mantine-color-default-border)',
              display: 'flex',
              justifyContent: 'center'
            }}
          >
            <img src={figurBild(f)} alt="" aria-hidden style={{ height: 96, width: '100%', objectFit: 'contain' }} />
          </UnstyledButton>
        ))}
      </div>
      {w.gewaehlt && (
        <Text size="sm" c="dimmed" ta="center" mt="xs">
          {kt(s.sprache, 'uiFigurGewaehlt')}
        </Text>
      )}
    </Card>
  )
}

const BOSS_CSS = `
@keyframes ks-wackeln { 25% { transform: translateX(-6px) } 50% { transform: translateX(5px) } 75% { transform: translateX(-3px) } }
.ks-wackeln { animation: ks-wackeln .3s }
@media (prefers-reduced-motion: reduce) { .ks-wackeln { animation: none } }
.ks-rand { position: fixed; inset: 0; pointer-events: none; z-index: 300; transition: box-shadow .25s; box-shadow: inset 0 0 0 0 transparent }
.ks-rand.rot { box-shadow: inset 0 0 40px 10px #ef4444aa } .ks-rand.gold { box-shadow: inset 0 0 40px 10px #f59e0bbb }
`

/**
 * Spürbare Rückmeldung am Gerät (Boss-Kampf): eigene falsche Antwort → Karte rüttelt, roter Rand, kurze Vibration (Android;
 * iPads können nicht vibrieren); Schlag des Bosses → roter Rand bei allen; eigene Abwehr / kritischer Treffer → Gold.
 * Nie ein Fenster, nie Fokusverlust beim Tippen.
 */
function useBossEffekte(s: Sicht | null): { rand: string; wackeln: number; meldung: string } {
  const [rand, setRand] = useState('')
  const [wackeln, setWackeln] = useState(0)
  const [meldung, setMeldung] = useState('')
  const vorher = useRef<{ schlag: number; rueck: number; abwehr: number; krit: number } | null>(null)
  const x = s?.spiel === 'boss' && s.phase === 'spiel' ? s.extra : null
  useEffect(() => {
    if (!x || !s) return
    const jetzt = { schlag: x.schlag?.nr ?? 0, rueck: x.rueck?.nr ?? 0, abwehr: x.abwehr ?? 0, krit: x.krit ?? 0 }
    const alt = vorher.current
    vorher.current = jetzt
    if (!alt) return
    const zeigen = (farbe: string, text: string): void => {
      setRand(farbe)
      setMeldung(text)
      setTimeout(() => setRand(''), 650)
    }
    if (jetzt.abwehr > alt.abwehr) zeigen('gold', kt(s.sprache, 'boAbgewehrtDu'))
    else if (jetzt.krit > alt.krit) zeigen('gold', kt(s.sprache, 'boKrit'))
    else if (jetzt.rueck > alt.rueck && x.rueck && !x.rueck.richtig) {
      zeigen('rot', kt(s.sprache, 'boLaedt'))
      setWackeln((w) => w + 1)
      try {
        navigator.vibrate?.(120)
      } catch {
        // nicht überall erlaubt
      }
    } else if (jetzt.rueck > alt.rueck) setMeldung('')
    if (jetzt.schlag > alt.schlag && x.schlag) zeigen('rot', kt(s.sprache, 'boSchlag', x.schlag.schaden))
  }, [x?.schlag?.nr, x?.rueck?.nr, x?.abwehr, x?.krit]) // eslint-disable-line react-hooks/exhaustive-deps
  return { rand, wackeln, meldung }
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
  const figurWaehlen = useCallback((figur: string): void => void liveSenden<Sicht>('/s/api/klassenspiel/figur', { code, figur }, setSicht, setFehler, 15000), [code, setSicht, setFehler])
  const effekte = useBossEffekte(s ?? null)
  const karte = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = karte.current
    if (!el || !effekte.wackeln) return
    el.classList.remove('ks-wackeln')
    void el.offsetWidth
    el.classList.add('ks-wackeln')
  }, [effekte.wackeln])

  return (
    <Stack gap="md" maw={720} mx="auto" p="md" data-mehr-seite data-klasse-seite={s?.phase ?? 'laden'}>
      <style>{SPIEL_OHNE_MARKIEREN + BOSS_CSS}</style>
      <div className={`ks-rand ${effekte.rand}`} data-klasse-rand={effekte.rand} />
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
          {(s.phase === 'lobby' || s.phase === 'teams') && s.figurWahl && <FigurWahl s={s} waehlen={figurWaehlen} />}
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
              {s.extra?.figur && (
                <Group gap="xs" wrap="nowrap" data-klasse-eigene-figur={s.extra.figur}>
                  <img src={figurBild(s.extra.figur)} alt="" aria-hidden style={{ height: 44, width: 'auto' }} />
                  <Text size="sm" c="dimmed">
                    {kt(s.sprache, 'uiDuBist')}
                  </Text>
                </Group>
              )}
              {s.pause ? (
                <Card withBorder radius="lg" padding="xl" ta="center">
                  <Text fw={900} size="2rem">
                    ⏸ {kt(s.sprache, 'uiPause')}
                  </Text>
                </Card>
              ) : (
                <div ref={karte}>
                  <Bloecke bloecke={s.bloecke ?? []} senden={antwort} sprache={s.sprache} jahrgang={s.jahrgang} />
                </div>
              )}
              {s.spiel === 'boss' && effekte.meldung && (
                <Text size="sm" fw={700} ta="center" c={effekte.rand === 'gold' ? 'yellow.7' : 'grape'} data-klasse-boss-meldung>
                  {effekte.meldung}
                </Text>
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
