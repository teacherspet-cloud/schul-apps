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
  /** Stufenleiter: eigene Stufe, Format der Aufgabe, letzter Aufstieg */
  leiter?: { stufe: number; von: number; format: string; formatStufe: number; auf: { nr: number; stufe: number } | null }
  /** Tempo-Schutz: ab wann wieder geantwortet werden darf (Server-Zeit) und laufende Sperre */
  bereitAb?: number
  sperre?: { bis: number; grund: 'fehler' | 'schnell' } | null
  bis: number
  jetzt: number
  pause: boolean
  losenSeit?: number
  team: { name: string; farbe: string; symbol: string; mitglieder: string[] } | null
  bloecke?: Block[]
  /** Boss-Kampf mit Rollen: Anzahl je Rolle, Obergrenze, eigene Wahl */
  rollenWahl?: { zahlen: Record<'tank' | 'heiler' | 'angreifer', number>; grenze: number; gewaehlt: 'tank' | 'heiler' | 'angreifer' | null; offen: boolean }
  /** Boss-Kampf: Figurenwahl im Wartebereich */
  figurWahl?: { figuren: string[]; gewaehlt: string | null }
  /** Boss-Kampf: eigene Figur und Nummern für die Effekte (Schlag auf die Klasse, eigene Rückmeldung, Abwehr, Krit) */
  extra?: { rolle?: 'tank' | 'heiler' | 'angreifer'; wirkung?: { nr: number; art: 'schild' | 'heilung' | 'schaden'; wert: number } | null; figur?: string | null; schlag?: { nr: number; schaden: number }; rueck?: { nr: number; richtig: boolean } | null; abwehr?: number; krit?: number } | null
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

const ROLLE_ZEICHEN = { tank: '🛡️', heiler: '💚', angreifer: '⚔️' } as const

/** Rollenwahl im Wartebereich (Boss-Kampf mit Rollen, 17.11.2026): volle Rollen ausgegraut */
function RollenWahl({ s, waehlen }: { s: Sicht; waehlen: (r: string) => void }): React.JSX.Element {
  const w = s.rollenWahl!
  return (
    <Card withBorder radius="lg" padding="md" data-klasse-rollenwahl={w.gewaehlt ?? ''}>
      <Text fw={800} size="lg" ta="center">
        {kt(s.sprache, 'uiRolleWaehlen')}
      </Text>
      <Stack gap="xs" mt="sm">
        {(['tank', 'heiler', 'angreifer'] as const).map((ro) => {
          const voll = w.zahlen[ro] >= w.grenze && w.gewaehlt !== ro
          return (
            <UnstyledButton
              key={ro}
              onClick={() => !voll && waehlen(ro)}
              disabled={voll}
              aria-pressed={w.gewaehlt === ro}
              data-klasse-rolle={ro}
              style={{
                borderRadius: 12,
                padding: '10px 14px',
                opacity: voll ? 0.45 : 1,
                outline: w.gewaehlt === ro ? '4px solid var(--mantine-color-yellow-5)' : '1px solid var(--mantine-color-default-border)'
              }}
            >
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={800} size="lg">
                    {ROLLE_ZEICHEN[ro]} {kt(s.sprache, `rolle_${ro}` as const)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {kt(s.sprache, `rolleText_${ro}` as const)}
                  </Text>
                </div>
                <Badge variant="light" tt="none" style={{ flexShrink: 0, overflow: 'visible' }} miw={52}>
                  {voll ? kt(s.sprache, 'uiRolleVoll') : `${w.zahlen[ro]} / ${w.grenze}`}
                </Badge>
              </Group>
            </UnstyledButton>
          )
        })}
      </Stack>
    </Card>
  )
}

/**
 * Wirkung jeder richtigen Antwort als Animation (Boss mit Rollen, 17.11.2026, Wunsch der Lehrkraft: „grafische Animation
 * als direktes Feedback"): Schild fliegt in den Klassenbalken, Herzen steigen auf, Hieb in den Boss-Balken.
 */
function WirkungAnimation({ s }: { s: Sicht }): React.JSX.Element | null {
  const w = s.extra?.wirkung
  const [zeigen, setZeigen] = useState<{ nr: number; art: string; wert: number } | null>(null)
  const vorher = useRef<number | null>(null)
  useEffect(() => {
    // Vor der ersten Wirkung gilt 0 – sonst würde die allererste richtige Antwort nicht gezeigt
    const nr = w?.nr ?? 0
    if (vorher.current !== null && w && nr > vorher.current) {
      setZeigen(w)
      const t = setTimeout(() => setZeigen(null), 1300)
      vorher.current = nr
      return () => clearTimeout(t)
    }
    vorher.current = nr
  }, [w?.nr]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!zeigen) return null
  const zeichen = zeigen.art === 'schild' ? '🛡️' : zeigen.art === 'heilung' ? '💚' : '⚔️'
  const text = kt(s.sprache, zeigen.art === 'schild' ? 'woSchild' : zeigen.art === 'heilung' ? 'woHeilung' : 'woSchaden', zeigen.wert)
  const farbe = zeigen.art === 'schild' ? '#38bdf8' : zeigen.art === 'heilung' ? '#22c55e' : '#ef4444'
  return (
    <div key={zeigen.nr} className="ks-wirkung" style={{ color: farbe }} data-klasse-wirkung={zeigen.art} aria-live="polite">
      <span className={`ks-wirkung-zeichen ks-${zeigen.art}`}>{zeichen}</span>
      <span>{text}</span>
    </div>
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
.ks-wirkung { position: fixed; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 310; pointer-events: none; display: flex; align-items: center; gap: 10px;
  font-weight: 900; font-size: 1.4rem; text-shadow: 0 2px 6px #0008; animation: ks-wirkung 1.3s ease-out forwards }
.ks-wirkung-zeichen { font-size: 3rem; display: inline-block }
.ks-schild { animation: ks-fliegen-hoch 1.2s ease-in forwards }
.ks-heilung { animation: ks-steigen 1.2s ease-out forwards }
.ks-schaden { animation: ks-hieb 1.2s ease-in forwards }
@keyframes ks-wirkung { 0% { opacity: 0; transform: translate(-50%, -30%) scale(.7) } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1) } 70% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -120%) scale(.9) } }
@keyframes ks-fliegen-hoch { 60% { transform: translate(0, 0) scale(1.2) } 100% { transform: translate(-30vw, -38vh) scale(.4) } }
@keyframes ks-steigen { 0% { transform: translateY(0) } 50% { transform: translateY(-12px) scale(1.25) } 100% { transform: translate(-30vw, -36vh) scale(.5) } }
@keyframes ks-hieb { 0% { transform: rotate(-30deg) } 30% { transform: rotate(40deg) scale(1.3) } 100% { transform: translate(30vw, -34vh) rotate(90deg) scale(.5) } }
@media (prefers-reduced-motion: reduce) { .ks-wirkung, .ks-wirkung-zeichen { animation: none } }
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

/**
 * Tempo-Schutz am Gerät (17.11.2026): Lesebalken bis zur Freigabe (früheres Tippen sperrt wachsend), bei Sperre sind die
 * Knöpfe aus und ein Hinweis zählt herunter. Gewertet wird auf dem Server (kern.ts `lesezeit`).
 */
function useTempo(s: Sicht | null): { gesperrt: 'fehler' | 'schnell' | null; rest: number; lesen: number } {
  const [jetzt, setJetzt] = useState(Date.now())
  const versatz = useRef(0)
  useEffect(() => {
    if (s) versatz.current = s.jetzt - Date.now()
    setJetzt(Date.now())
  }, [s])
  const bis = Math.max(s?.bereitAb ?? 0, s?.sperre?.bis ?? 0)
  useEffect(() => {
    if (!s || s.phase !== 'spiel' || bis <= Date.now() + versatz.current) return
    const t = setInterval(() => {
      setJetzt(Date.now())
      if (bis <= Date.now() + versatz.current) clearInterval(t)
    }, 100)
    return () => clearInterval(t)
  }, [bis, s?.phase]) // eslint-disable-line react-hooks/exhaustive-deps
  const server = jetzt + versatz.current
  const sperre = s?.sperre && server < s.sperre.bis ? s.sperre : null
  return {
    gesperrt: sperre?.grund ?? null,
    rest: sperre ? Math.ceil((sperre.bis - server) / 1000) : 0,
    lesen: !sperre && s?.bereitAb && server < s.bereitAb ? Math.min(1, (s.bereitAb - server) / 3000) : 0
  }
}

/** Stufenleiter am Gerät: „Stufe 3/6 · Wort wählen" und beim Aufstieg ein goldener Hinweis */
function useLeiterAufstieg(s: Sicht | null): string {
  const [meldung, setMeldung] = useState('')
  const vorher = useRef<number | null>(null)
  const auf = s?.leiter?.auf
  useEffect(() => {
    if (!s?.leiter) return
    const nr = auf?.nr ?? 0
    if (vorher.current !== null && nr > vorher.current && auf) {
      setMeldung(kt(s.sprache, 'leAufstieg', auf.stufe, kt(s.sprache, `le_${s.leiter.format}` as never)))
      setTimeout(() => setMeldung(''), 3500)
    }
    vorher.current = nr
  }, [auf?.nr]) // eslint-disable-line react-hooks/exhaustive-deps
  return meldung
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
  const rolleWaehlen = useCallback((rolle: string): void => void liveSenden<Sicht>('/s/api/klassenspiel/rolle', { code, rolle }, setSicht, setFehler, 15000), [code, setSicht, setFehler])
  const figurWaehlen = useCallback((figur: string): void => void liveSenden<Sicht>('/s/api/klassenspiel/figur', { code, figur }, setSicht, setFehler, 15000), [code, setSicht, setFehler])
  const effekte = useBossEffekte(s ?? null)
  const tempo = useTempo(s ?? null)
  const aufstieg = useLeiterAufstieg(s ?? null)
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
          {(s.phase === 'lobby' || s.phase === 'teams') && s.rollenWahl?.offen && <RollenWahl s={s} waehlen={rolleWaehlen} />}
          {(s.phase === 'lobby' || s.phase === 'teams') && s.figurWahl && s.figurWahl.figuren.length > 0 && <FigurWahl s={s} waehlen={figurWaehlen} />}
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
                  {s.extra.rolle && (
                    <Badge size="lg" variant="light" tt="none" data-klasse-eigene-rolle={s.extra.rolle}>
                      {ROLLE_ZEICHEN[s.extra.rolle]} {kt(s.sprache, `rolle_${s.extra.rolle}` as const)}
                    </Badge>
                  )}
                </Group>
              )}
              {s.extra?.rolle && <WirkungAnimation s={s} />}
              {s.leiter && (
                <Group gap="xs" justify="space-between" wrap="nowrap" data-klasse-leiter={s.leiter.stufe}>
                  <Badge size="lg" variant="light" color="grape" tt="none">
                    {kt(s.sprache, 'leStufe', s.leiter.formatStufe, s.leiter.von, kt(s.sprache, `le_${s.leiter.format}` as never))}
                  </Badge>
                  <Group gap={3} aria-hidden>
                    {Array.from({ length: s.leiter.von }, (_, i) => (
                      <div key={i} style={{ width: 10, height: 6 + i * 3, borderRadius: 2, background: i < s.leiter!.stufe ? 'var(--mantine-color-grape-5)' : 'var(--mantine-color-default-border)' }} />
                    ))}
                  </Group>
                </Group>
              )}
              {aufstieg && (
                <Alert color="yellow" variant="filled" py={6} data-klasse-aufstieg>
                  {aufstieg}
                </Alert>
              )}
              {s.pause ? (
                <Card withBorder radius="lg" padding="xl" ta="center">
                  <Text fw={900} size="2rem">
                    ⏸ {kt(s.sprache, 'uiPause')}
                  </Text>
                </Card>
              ) : (
                <div ref={karte} style={{ position: 'relative' }}>
                  {tempo.gesperrt === 'schnell' && (
                    <Alert color="red" variant="filled" py={8} mb="xs" data-klasse-zu-schnell={tempo.rest}>
                      {kt(s.sprache, 'uiZuSchnell', tempo.rest)}
                    </Alert>
                  )}
                  {tempo.gesperrt === 'fehler' && (
                    <Text size="sm" c="dimmed" ta="center" mb={4} data-klasse-loesung-lesen>
                      {kt(s.sprache, 'uiLoesungLesen')}
                    </Text>
                  )}
                  <div
                    style={{ height: 4, borderRadius: 2, marginBottom: 6, background: 'var(--mantine-color-default-border)', overflow: 'hidden', visibility: tempo.lesen > 0 ? 'visible' : 'hidden' }}
                    aria-hidden
                    data-klasse-lesen={tempo.lesen > 0 ? 'ja' : ''}
                  >
                    <div style={{ height: '100%', width: `${Math.round(tempo.lesen * 100)}%`, background: 'var(--mantine-color-blue-5)', transition: 'width .1s linear' }} />
                  </div>
                  <div style={tempo.gesperrt ? { pointerEvents: 'none', opacity: 0.45, filter: 'grayscale(.6)' } : undefined} aria-disabled={tempo.gesperrt ? true : undefined}>
                    <Bloecke bloecke={s.bloecke ?? []} senden={antwort} sprache={s.sprache} jahrgang={s.jahrgang} />
                  </div>
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
