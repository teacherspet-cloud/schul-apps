/**
 * Bausteine des Beamers (Klassenspiele, 02.11.2026): groß, kontrastreich, aus der letzten Reihe lesbar. Der Server
 * beschreibt die Sicht (shared/klassenspiel/kern.ts `BBlock`) – nie Fragen, Lösungen oder Einzelergebnisse; Namen nur in
 * Teamlisten und am Ende im Podest (Top 3, abgestimmt).
 */
import { Badge, Group, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core'
import type { BBlock } from '@shared/klassenspiel/kern'

const TON: Record<string, string> = { gut: 'teal', info: 'blue', warn: 'orange' }

/** Berg mit Lagern: Pfad von unten links nach oben rechts, Fahne an der erreichten Stelle */
function Berg({ b }: { b: Extract<BBlock, { typ: 'berg' }> }): React.JSX.Element {
  const W = 900
  const H = 380
  const punkte = Array.from({ length: b.von + 1 }, (_, i) => ({ x: 70 + (i * (W - 140)) / b.von, y: H - 40 - (i * (H - 110)) / b.von + (i % 2 ? 18 : -6) }))
  const pos = Math.min(b.von, b.lager + b.anteil)
  const i0 = Math.floor(pos)
  const t = pos - i0
  const a = punkte[Math.min(i0, b.von)]
  const c = punkte[Math.min(i0 + 1, b.von)]
  const kl = { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t }
  return (
    <Paper radius="lg" p="md" withBorder data-beamer-berg={b.lager}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: '46vh', display: 'block' }} role="img" aria-label={`Lager ${b.lager} von ${b.von}`}>
        <defs>
          <linearGradient id="kb-himmel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dbeafe" />
            <stop offset="1" stopColor="#f0f9ff" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} rx="18" fill="url(#kb-himmel)" />
        <path d={`M0 ${H} L${W * 0.35} ${H * 0.45} L${W * 0.55} ${H * 0.62} L${W * 0.86} ${H * 0.08} L${W} ${H * 0.3} L${W} ${H} Z`} fill="#94a3b8" />
        <path d={`M${W * 0.8} ${H * 0.2} L${W * 0.86} ${H * 0.08} L${W * 0.92} ${H * 0.2} Z`} fill="#fff" />
        <polyline points={punkte.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#475569" strokeWidth="5" strokeDasharray="10 9" strokeLinecap="round" />
        {punkte.slice(1).map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="17" fill={i < b.lager ? '#16a34a' : '#fff'} stroke="#334155" strokeWidth="3" />
            <text x={p.x} y={p.y + 46} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1e293b">
              {b.namen[i] ?? ''}
            </text>
          </g>
        ))}
        <text x={kl.x} y={kl.y - 14} textAnchor="middle" fontSize="54" style={{ transition: 'all .6s' }}>
          🧗
        </text>
      </svg>
      <Group justify="space-between" mt="xs" wrap="nowrap">
        <Progress value={b.anteil * 100} size={22} radius="xl" color="teal" style={{ flex: 1 }} />
        <Text fw={800} size="xl" w={190} ta="right">
          Lager {b.lager}/{b.von}
        </Text>
      </Group>
      {b.hinweis && (
        <Text fw={800} size="xl" c="orange" ta="center" mt="xs" data-beamer-hinweis>
          {b.hinweis}
        </Text>
      )}
    </Paper>
  )
}

function Boss({ b }: { b: Extract<BBlock, { typ: 'boss' }> }): React.JSX.Element {
  const anteil = b.max ? b.hp / b.max : 0
  return (
    <Paper radius="lg" p="lg" withBorder ta="center" data-beamer-boss={b.hp}>
      <Text style={{ fontSize: 'min(26vh, 220px)', lineHeight: 1.05, filter: b.ruestung ? 'drop-shadow(0 0 18px #f59e0b)' : undefined, transition: 'transform .2s' }} aria-hidden>
        {b.symbol}
        {b.ruestung ? '🛡️' : ''}
      </Text>
      <Text fw={900} size="2.2rem">
        {b.name}
      </Text>
      <Progress value={anteil * 100} size={34} radius="xl" color={anteil > 0.66 ? 'red' : anteil > 0.33 ? 'orange' : 'yellow'} mt="sm" striped animated />
      <Text fw={800} size="xl" mt={6}>
        {b.hp} / {b.max} Lebenspunkte · Phase {b.phase}
        {b.ruestung ? ' · Rüstung: Schreiben trifft doppelt!' : ''}
      </Text>
    </Paper>
  )
}

function Bahnen({ b }: { b: Extract<BBlock, { typ: 'bahnen' }> }): React.JSX.Element {
  if (b.seil && b.teams.length === 2) {
    const [l, r] = b.teams
    const diff = Math.max(-1, Math.min(1, (l.wert - r.wert) / Math.max(1, l.ziel / 2)))
    const pos = 50 - diff * 40
    return (
      <Paper radius="lg" p="lg" withBorder data-beamer-seil={Math.round(diff * 100)}>
        <Group justify="space-between" mb="md">
          <Text fw={900} size="2rem" c={l.farbe}>
            {l.symbol} {l.name} · {l.wert}
          </Text>
          <Text fw={900} size="2rem" c={r.farbe}>
            {r.wert} · {r.name} {r.symbol}
          </Text>
        </Group>
        <div style={{ position: 'relative', height: 64 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 26, height: 12, borderRadius: 6, background: '#a16207' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 4, background: '#334155' }} />
          <div style={{ position: 'absolute', left: `calc(${pos}% - 22px)`, top: 8, width: 44, height: 48, borderRadius: 10, background: '#dc2626', transition: 'left .5s', border: '3px solid #fff' }} />
        </div>
        <Text ta="center" c="dimmed" mt="sm" size="lg">
          Ziel: {l.ziel} Schritte je Teammitglied
        </Text>
      </Paper>
    )
  }
  return (
    <Stack gap="md" data-beamer-bahnen>
      {b.teams.map((t) => (
        <Paper key={t.name} radius="lg" p="md" withBorder>
          <Group justify="space-between" wrap="nowrap" mb={6}>
            <Text fw={900} size="1.8rem" c={t.farbe}>
              {t.symbol} Team {t.name}
            </Text>
            <Text fw={800} size="1.6rem">
              {t.wert} / {t.ziel}
            </Text>
          </Group>
          <div style={{ position: 'relative', height: 30, borderRadius: 15, background: 'var(--mantine-color-gray-2)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (t.wert / t.ziel) * 100)}%`, borderRadius: 15, background: `var(--mantine-color-${t.farbe}-filled)`, transition: 'width .5s' }} />
            <span style={{ position: 'absolute', left: `calc(${Math.min(100, (t.wert / t.ziel) * 100)}% - 18px)`, top: -6, fontSize: 32, transition: 'left .5s' }}>{t.symbol}</span>
          </div>
        </Paper>
      ))}
    </Stack>
  )
}

export function TeamKarten({ teams, gross = true }: { teams: { name: string; farbe: string; symbol: string; mitglieder: string[] }[]; gross?: boolean }): React.JSX.Element {
  return (
    <SimpleGrid cols={{ base: 1, sm: Math.min(3, teams.length) }} spacing="md" data-beamer-teams={teams.length}>
      {teams.map((t) => (
        <Paper key={t.name} radius="lg" p="md" withBorder style={{ borderTop: `8px solid var(--mantine-color-${t.farbe}-filled)` }}>
          <Text fw={900} size={gross ? '1.8rem' : 'lg'} c={t.farbe}>
            {t.symbol} Team {t.name}
          </Text>
          <Text size={gross ? 'lg' : 'sm'} mt={4}>
            {t.mitglieder.join(', ')}
          </Text>
        </Paper>
      ))}
    </SimpleGrid>
  )
}

export function Podest({ plaetze, titel }: { plaetze: { name: string; wert: string }[]; titel: string }): React.JSX.Element | null {
  if (!plaetze.length) return null
  // Reihenfolge 2 – 1 – 3 wie auf dem Siegertreppchen
  const ordnung = [1, 0, 2].filter((i) => plaetze[i])
  const hoehe = [150, 110, 80]
  return (
    <Stack gap={4} align="center" data-beamer-podest={plaetze.length}>
      <Text fw={800} size="lg" c="dimmed">
        {titel}
      </Text>
      <Group align="flex-end" gap="sm">
        {ordnung.map((i) => (
          <Stack key={i} gap={4} align="center" w={180}>
            <Text fw={800} size="xl" ta="center">
              {plaetze[i].name}
            </Text>
            <Paper w="100%" h={hoehe[i]} radius="md" bg={['yellow.4', 'gray.4', 'orange.3'][i]} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text fw={900} size="2.4rem" c="dark">
                {i + 1}
              </Text>
            </Paper>
            <Text size="sm" c="dimmed">
              {plaetze[i].wert}
            </Text>
          </Stack>
        ))}
      </Group>
    </Stack>
  )
}

export function BeamerBloecke({ bloecke }: { bloecke: BBlock[] }): React.JSX.Element {
  return (
    <Stack gap="md" data-beamer-bloecke>
      {bloecke.map((b, i) => {
        switch (b.typ) {
          case 'kopf':
            return (
              <Text key={i} fw={900} size="2rem">
                {b.titel}
              </Text>
            )
          case 'berg':
            return <Berg key={i} b={b} />
          case 'boss':
            return <Boss key={i} b={b} />
          case 'bahnen':
            return <Bahnen key={i} b={b} />
          case 'teams':
            return <TeamKarten key={i} teams={b.teams} />
          case 'ticker':
            return (
              <Stack key={i} gap={6} data-beamer-ticker>
                {b.eintraege.map((e, k) => (
                  <Badge key={k} size="xl" radius="md" variant={k === b.eintraege.length - 1 ? 'filled' : 'light'} color={TON[e.ton]} tt="none" h="auto" py={8} style={{ whiteSpace: 'normal' }}>
                    {e.text}
                  </Badge>
                ))}
              </Stack>
            )
          case 'zahlen':
            return (
              <SimpleGrid key={i} cols={b.eintraege.length} spacing="md">
                {b.eintraege.map((e) => (
                  <Paper key={e.titel} radius="lg" p="sm" withBorder ta="center">
                    <Text size="sm" c="dimmed" fw={700}>
                      {e.titel}
                    </Text>
                    <Text fw={900} size="2.2rem">
                      {e.wert}
                    </Text>
                  </Paper>
                ))}
              </SimpleGrid>
            )
          case 'podest':
            return <Podest key={i} titel={b.titel} plaetze={b.plaetze} />
          case 'text':
            return (
              <Text key={i} fw={b.gross ? 900 : 600} size={b.gross ? '2rem' : 'lg'} c={b.ton ? TON[b.ton] : undefined} ta="center">
                {b.text}
              </Text>
            )
        }
        return null
      })}
    </Stack>
  )
}
