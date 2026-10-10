/**
 * Achievements der Lernenden (08.10.2026, mit der Lehrkraft abgestimmt): erster Reiter im Fenster „Achievements"
 * (Rekorde.tsx), nach Gruppen, mit Medaille und Datum.
 * Seit 09.10.2026 (Wunsch der Lehrkraft): alle Achievements, auch noch nicht erreichte, mit Fortschrittsbalken (23/50);
 * geheime Überraschungen nur als Zahl, bis sie erreicht sind. Je Achievement „X % der Lernenden der Schule haben es"
 * (ab 10 Lernenden) und oben der eigene Platz in der Klasse nach Übungstagen der letzten 4 Wochen (ab 5 Lernenden) –
 * keine Namen, keine Plätze anderer.
 *
 * Seit 10.10.2026 (Wunsch der Lehrkraft): Platz in der Klasse und jede Gruppe als einklappbarer Abschnitt (AuszKlapp.tsx),
 * eingeklappt mit Zusammenfassung („3 von 8 geschafft · als Nächstes: …"); offen/zu gilt für die Sitzung.
 *
 * Glückwunsch: Nach Antworten und Spielen (Ereignis „schulapps-gesendet" aus serverApi.ts) fragt die Seite kurz danach
 * nach neu Erreichtem und zeigt eine kurze Meldung – mit etwas Konfetti, außer bei „ruhiger Darstellung"
 * (html.sa-ruhig) oder reduzierter Bewegung im System.
 */
import { Badge, Card, Group, Loader, Progress, Stack, Text, ThemeIcon } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAward, IconLock, IconStarFilled, IconUsersGroup } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { abrufen } from './serverApi'
import { AuszKlapp } from './AuszKlapp'

type Medaille = 'bronze' | 'silber' | 'gold' | null
interface Eintrag {
  id: string
  am: number
  titel: string
  text: string
  gruppe: string
  medaille: Medaille
}
/** Ein Achievement mit Fortschritt (09.10.2026, shared/achievements.ts AchSicht) */
interface Sicht {
  id: string
  titel: string
  text: string
  gruppe: string
  medaille: Medaille
  erreicht: boolean
  am: number | null
  ist: number
  ziel: number
  anteil: number | null
}
interface Antwort {
  alle?: Sicht[]
  erreicht: Eintrag[]
  /** Geheime, noch nicht erreichte – nur die Zahl */
  verborgen: number
  gruppen: { id: string; name: string }[]
  neu: string[]
  platz?: { platz: number; von: number; tage: number } | null
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
  // Ältere Antwort ohne `alle`: nur Erreichtes
  const alle: Sicht[] = d.alle ?? d.erreicht.map((e) => ({ ...e, erreicht: true, ist: 1, ziel: 1, anteil: null }))
  const geschafft = alle.filter((e) => e.erreicht).length
  return (
    <Stack gap="xs" data-achievements>
      <Text size="sm" fw={600} data-achievements-zahl={`${geschafft}/${alle.length}`}>
        {geschafft} von {alle.length} Achievements geschafft
      </Text>
      {/* Eigener Platz in der Klasse (09.10.2026): nur die eigene Zahl – keine Namen, keine Plätze anderer */}
      {d.platz && (
        <AuszKlapp
          id="ach-platz"
          titel="Platz in deiner Klasse"
          status={`Platz ${d.platz.platz} von ${d.platz.von} · nach Übungstagen der letzten 4 Wochen`}
          rahmen={{ 'data-achievements-platz': `${d.platz.platz}/${d.platz.von}` }}
        >
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" radius="xl" size="lg" color="indigo">
              <IconUsersGroup size={18} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text size="sm" fw={700}>
                Du bist auf Platz {d.platz.platz} von {d.platz.von} in deiner Klasse
              </Text>
              <Text size="xs" c="dimmed">
                nach Übungstagen der letzten 4 Wochen · du: {d.platz.tage} {d.platz.tage === 1 ? 'Tag' : 'Tage'}
              </Text>
            </Stack>
          </Group>
        </AuszKlapp>
      )}
      {d.verborgen > 0 && (
        <Group gap="xs" wrap="nowrap" data-achievements-verborgen={d.verborgen}>
          <ThemeIcon variant="light" radius="xl" size="lg" color="gray">
            <IconLock size={18} />
          </ThemeIcon>
          <Text size="sm" fw={600}>
            Dazu {d.verborgen === 1 ? 'eine geheime Überraschung' : `${d.verborgen} geheime Überraschungen`} – welche, wird nicht verraten.
          </Text>
        </Group>
      )}
      {d.gruppen.map((g) => {
        const liste = alle.filter((e) => e.gruppe === g.id)
        if (!liste.length) return null
        const zahl = liste.filter((e) => e.erreicht).length
        // Als Nächstes: das offene, dem am wenigsten fehlt
        const naechstes = liste.filter((e) => !e.erreicht && e.ziel > 1).sort((a, b) => b.ist / b.ziel - a.ist / a.ziel)[0]
        const neuHier = liste.filter((e) => neu.has(e.id)).length
        return (
          <AuszKlapp
            key={g.id}
            id={`ach-gruppe-${g.id}`}
            titel={g.name}
            status={`${zahl} von ${liste.length} geschafft${neuHier ? ` · ${neuHier} neu` : ''}${naechstes ? ` · als Nächstes: ${naechstes.titel} (${naechstes.ist}/${naechstes.ziel})` : ''}`}
            rahmen={{ 'data-achievements-gruppe': g.id }}
          >
            <Stack gap={6}>
              {liste.map((e) => (
                <Card
                  key={e.id}
                  withBorder
                  padding="xs"
                  radius="md"
                  style={neu.has(e.id) ? { borderColor: FARBE[e.medaille ?? 'ohne'], borderWidth: 2 } : undefined}
                  data-achievement={e.id}
                  data-erreicht={e.erreicht}
                >
                  <Group gap="sm" wrap="nowrap" align="flex-start">
                    <div style={e.erreicht ? undefined : { opacity: 0.35, filter: 'grayscale(1)' }}>
                      <Medaille m={e.medaille} />
                    </div>
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Group gap={6}>
                        <Text fw={700} size="sm" c={e.erreicht ? undefined : 'dimmed'}>
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
                      {e.erreicht ? (
                        <Text size="xs" c="dimmed">
                          {e.medaille ? `${STUFE[e.medaille]} · ` : ''}erreicht{e.am ? ` am ${new Date(e.am).toLocaleDateString('de-DE')}` : ''}
                        </Text>
                      ) : e.ziel > 1 ? (
                        <Group gap={8} wrap="nowrap" data-achievement-fortschritt={`${e.ist}/${e.ziel}`}>
                          <Progress
                            value={(e.ist / e.ziel) * 100}
                            size="sm"
                            radius="xl"
                            color={FARBE[e.medaille ?? 'ohne']}
                            style={{ flex: 1 }}
                            aria-label={`Fortschritt ${e.ist} von ${e.ziel}`}
                          />
                          <Text size="xs" fw={700} style={{ whiteSpace: 'nowrap' }}>
                            {e.ist}/{e.ziel}
                          </Text>
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed" data-achievement-fortschritt="0/1">
                          noch nicht erreicht
                        </Text>
                      )}
                      {e.anteil !== null && (
                        <Text size="xs" c="dimmed" data-achievement-anteil={e.anteil}>
                          {e.anteil === 0 ? 'Noch niemand an der Schule hat es' : `${e.anteil} % der Lernenden der Schule haben es`}
                        </Text>
                      )}
                    </Stack>
                  </Group>
                </Card>
              ))}
            </Stack>
          </AuszKlapp>
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

/** Neue Medaille oder neuer Titel (10.10.2026, server/achievements.ts auszText) */
interface AuszMeldung {
  art: 'medaille' | 'titel'
  sprache: string
  stufe: number
  titel: string
  text: string
}

function gluckwunsch(neu: Eintrag[], ausz: AuszMeldung[] = []): void {
  if (!neu.length && !ausz.length) return
  konfetti()
  // Medaillen und Titel zuerst – höchstens zwei Meldungen, der Rest steht im Fenster
  for (const a of ausz.slice(0, 2))
    notifications.show({
      title: a.art === 'titel' ? a.titel : `Neue Medaille: ${a.titel}`,
      message: a.art === 'titel' ? `Du bist jetzt „${a.text}". Wie dein Titel lautet, wählst du unter „Achievements".` : a.text,
      icon: <Medaille m={a.stufe >= 3 ? 'gold' : a.stufe === 2 ? 'silber' : 'bronze'} />,
      autoClose: 6000,
      withBorder: true,
      radius: 'md'
    })
  if (ausz.length >= 2) return
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
    const r = await lesen<{ neu: Eintrag[]; auszeichnungen?: AuszMeldung[] }>('/s/api/achievements/neu')
    gluckwunsch(r?.neu ?? [], r?.auszeichnungen ?? [])
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
