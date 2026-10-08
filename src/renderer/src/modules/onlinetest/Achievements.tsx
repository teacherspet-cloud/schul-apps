/**
 * Achievements der Lernenden (08.10.2026, mit der Lehrkraft abgestimmt): erster Reiter im Fenster „Achievements"
 * (Rekorde.tsx). Nur Erreichtes, nach den sechs Gruppen, mit Medaille und Datum – dazu „Noch N Achievements zu
 * entdecken" ohne Hinweis, welche. Keine Rangliste, kein Vergleich.
 *
 * Glückwunsch: Nach Antworten und Spielen (Ereignis „schulapps-gesendet" aus serverApi.ts) fragt die Seite kurz danach
 * nach neu Erreichtem und zeigt eine kurze Meldung – mit etwas Konfetti, außer bei „ruhiger Darstellung"
 * (html.sa-ruhig) oder reduzierter Bewegung im System.
 */
import { Badge, Card, Group, Loader, Stack, Text, ThemeIcon } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAward, IconLock, IconStarFilled } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { abrufen } from './serverApi'

type Medaille = 'bronze' | 'silber' | 'gold' | null
interface Eintrag {
  id: string
  am: number
  titel: string
  text: string
  gruppe: string
  medaille: Medaille
}
interface Antwort {
  erreicht: Eintrag[]
  verborgen: number
  gruppen: { id: string; name: string }[]
  neu: string[]
}

/** Medaillenfarben – in Hell und Dunkel gut zu sehen; Einmaliges ohne Stufe in Violett */
const FARBE: Record<string, string> = { bronze: '#b8733a', silber: '#8f9aa6', gold: '#d4a017', ohne: '#7c5cd6' }
const STUFE: Record<string, string> = { bronze: 'Bronze', silber: 'Silber', gold: 'Gold' }

/** Ohne Umleitung zur Anmeldung (die Meldung ist Nebensache) */
async function lesen<T>(pfad: string): Promise<T | null> {
  try {
    const r = await abrufen(pfad, { headers: { 'x-schulapps-token': 'server' }, cache: 'no-store' })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

export function Medaille({ m, gross = false }: { m: Medaille; gross?: boolean }): React.JSX.Element {
  const farbe = FARBE[m ?? 'ohne']
  return (
    <ThemeIcon size={gross ? 44 : 36} radius="xl" style={{ background: farbe, color: '#fff', flex: 'none' }} aria-label={m ? STUFE[m] : 'Besonders'}>
      {m ? <IconAward size={gross ? 26 : 22} /> : <IconStarFilled size={gross ? 22 : 18} />}
    </ThemeIcon>
  )
}

export function AchievementsInhalt(): React.JSX.Element {
  const [d, setD] = useState<Antwort | null | 'fehler'>(null)
  useEffect(() => {
    void lesen<Antwort>('/s/api/achievements').then((r) => setD(r ?? 'fehler'))
  }, [])
  if (d === null) return <Loader size="sm" />
  if (d === 'fehler')
    return (
      <Text size="sm" c="dimmed">
        Die Achievements lassen sich gerade nicht laden – bitte gleich noch einmal öffnen.
      </Text>
    )
  const neu = new Set(d.neu)
  return (
    <Stack gap="md" data-achievements>
      <Group gap="xs" wrap="nowrap" data-achievements-verborgen>
        <ThemeIcon variant="light" radius="xl" size="lg" color="gray">
          <IconLock size={18} />
        </ThemeIcon>
        <Text size="sm" fw={600}>
          {d.verborgen > 0
            ? `Noch ${d.verborgen} ${d.verborgen === 1 ? 'Achievement' : 'Achievements'} zu entdecken`
            : d.erreicht.length
              ? 'Alles entdeckt, was es gerade zu entdecken gibt!'
              : 'Übe mit Vokabeln und Grammatik – hier sammeln sich deine Achievements.'}
        </Text>
      </Group>
      {d.erreicht.length === 0 && (
        <Text size="sm" c="dimmed">
          Noch keine Achievements – schon ein paar Tage Üben bringen die ersten.
        </Text>
      )}
      {d.gruppen.map((g) => {
        const liste = d.erreicht.filter((e) => e.gruppe === g.id)
        if (!liste.length) return null
        return (
          <Stack key={g.id} gap={6} data-achievements-gruppe={g.id}>
            <Group gap={8}>
              <Text fw={800}>{g.name}</Text>
              <Badge size="sm" variant="light" color="gray" tt="none">
                {liste.length}
              </Badge>
            </Group>
            {liste.map((e) => (
              <Card
                key={e.id}
                withBorder
                padding="xs"
                radius="md"
                style={neu.has(e.id) ? { borderColor: FARBE[e.medaille ?? 'ohne'], borderWidth: 2 } : undefined}
                data-achievement={e.id}
              >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Medaille m={e.medaille} />
                  <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                    <Group gap={6}>
                      <Text fw={700} size="sm">
                        {e.titel}
                      </Text>
                      {neu.has(e.id) && (
                        <Badge size="xs" color="green" tt="none">
                          neu
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {e.text}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {e.medaille ? `${STUFE[e.medaille]} · ` : ''}erreicht am {new Date(e.am).toLocaleDateString('de-DE')}
                    </Text>
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>
        )
      })}
    </Stack>
  )
}

// ---------------------------------------------------------------- Glückwunsch nach Antworten und Spielen

const ruhig = (): boolean =>
  document.documentElement.classList.contains('sa-ruhig') || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/** Kurzes Konfetti von oben (Web Animations, ohne Stylesheet) */
function konfetti(): void {
  if (ruhig() || typeof document.body.animate !== 'function') return
  const huelle = document.createElement('div')
  huelle.setAttribute('aria-hidden', 'true')
  huelle.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1000'
  const farben = [FARBE.gold, FARBE.bronze, '#2f9e44', '#1c7ed6', '#e64980', FARBE.ohne]
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span')
    const x = Math.random() * 100
    s.style.cssText = `position:absolute;top:-12px;left:${x}vw;width:8px;height:12px;border-radius:2px;background:${farben[i % farben.length]}`
    huelle.appendChild(s)
    s.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${(Math.random() - 0.5) * 30}vw, ${55 + Math.random() * 45}vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ],
      { duration: 1200 + Math.random() * 600, easing: 'cubic-bezier(.2,.6,.4,1)', delay: Math.random() * 200, fill: 'forwards' }
    )
  }
  document.body.appendChild(huelle)
  setTimeout(() => huelle.remove(), 2200)
}

function gluckwunsch(neu: Eintrag[]): void {
  if (!neu.length) return
  konfetti()
  // Viele auf einmal (etwa beim ersten Öffnen nach der Einführung): zwei zeigen, der Rest steht im Fenster
  for (const e of neu.slice(0, 2))
    notifications.show({
      title: 'Achievement freigeschaltet!',
      message: e.titel,
      icon: <Medaille m={e.medaille} />,
      autoClose: 5000,
      withBorder: true,
      radius: 'md'
    })
  if (neu.length > 2)
    notifications.show({
      title: `… und ${neu.length - 2} weitere`,
      message: 'Alle findest du oben unter „Achievements".',
      autoClose: 5000,
      withBorder: true,
      radius: 'md'
    })
}

const BEOBACHTET = /^\/s\/api\/(vokabeln|grammatik)\/(antwort|spiel)$/
let uhr: ReturnType<typeof setTimeout> | null = null
let ersteAntwort = 0
let fragt = false

async function nachfragen(): Promise<void> {
  uhr = null
  ersteAntwort = 0
  if (fragt) return
  fragt = true
  try {
    const r = await lesen<{ neu: Eintrag[] }>('/s/api/achievements/neu')
    gluckwunsch(r?.neu ?? [])
  } finally {
    fragt = false
  }
}

/**
 * Nach einem Spiel gleich, nach Antworten erst nach einer kurzen Pause (höchstens alle 30 Sekunden während einer
 * Runde) – so rechnet der Server nicht nach jeder einzelnen Antwort.
 */
function beobachten(pfad: string): void {
  if (!BEOBACHTET.test(pfad)) return
  const spiel = pfad.endsWith('/spiel')
  const jetzt = Date.now()
  if (!ersteAntwort) ersteAntwort = jetzt
  if (uhr) clearTimeout(uhr)
  const warten = spiel ? 600 : Math.max(300, Math.min(4000, 30000 - (jetzt - ersteAntwort)))
  uhr = setTimeout(() => void nachfragen(), warten)
}

if (typeof window !== 'undefined' && !(window as { __achievementsWache?: boolean }).__achievementsWache) {
  ;(window as { __achievementsWache?: boolean }).__achievementsWache = true
  window.addEventListener('schulapps-gesendet', (e) => beobachten(String((e as CustomEvent<{ pfad?: string }>).detail?.pfad ?? '')))
}
