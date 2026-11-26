/**
 * Diktat anhören (26.11.2026, abgestimmt: KI-Stimme, in Sinnabschnitten mit Wiederholen).
 *
 * Das Schülerblatt trägt nur einen unsichtbaren Anker (arbeitsblatt/render/baustein/diktat.tsx): Adresse der Aufnahme
 * und Beginn jedes Sinnabschnitts – nie den Text. Der Abspieler spielt einen Abschnitt und hält an; „Wiederholen"
 * spielt ihn noch einmal, „Weiter" den nächsten. „Ganzer Text" liest alles am Stück (Anfang und Ende, wie beim
 * Vorlesen im Unterricht).
 */
import { ActionIcon, Button, Group, Paper, Progress, Text, Tooltip } from '@mantine/core'
import { IconPlayerPlay, IconPlayerSkipBack, IconPlayerSkipForward, IconPlayerStop, IconRepeat } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface DiktatTon {
  url: string
  zeitmarken: number[]
  sekunden?: number
}

/** Anker aus dem Blatt-HTML lesen */
export function diktatToeneAus(html: string): DiktatTon[] {
  if (!html.includes('data-diktat-ton')) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll<HTMLElement>('[data-diktat-ton]')).flatMap((el) => {
    const url = el.dataset.diktatTon ?? ''
    if (!/^https?:\/\/|^\//.test(url)) return []
    const zeitmarken = (el.dataset.zeitmarken ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0)
    const sekunden = Number(el.dataset.sekunden) || undefined
    return [{ url, zeitmarken: zeitmarken.length ? zeitmarken : [0], ...(sekunden ? { sekunden } : {}) }]
  })
}

/** Abschnitt i: [Beginn, Ende) in Sekunden */
export function abschnittGrenzen(t: DiktatTon, i: number, dauer: number): [number, number] {
  const von = t.zeitmarken[i] ?? 0
  const bis = t.zeitmarken[i + 1] ?? (t.sekunden || dauer || von + 30)
  return [von, bis]
}

export default function DiktatAbspieler({ ton }: { ton: DiktatTon }): React.JSX.Element {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [nr, setNr] = useState(0)
  const [laeuft, setLaeuft] = useState<'abschnitt' | 'ganz' | null>(null)
  const [dauer, setDauer] = useState(ton.sekunden ?? 0)
  const ende = useRef<number>(Infinity)
  const anzahl = ton.zeitmarken.length
  const src = useMemo(() => `${ton.url.replace(/\/$/, '')}/ton.mp3`, [ton.url])

  useEffect(() => {
    const a = new Audio(src)
    a.preload = 'auto'
    audio.current = a
    const zeit = (): void => {
      if (a.currentTime >= ende.current - 0.05) {
        a.pause()
        setLaeuft(null)
      }
    }
    const fertig = (): void => setLaeuft(null)
    const meta = (): void => setDauer((d) => d || a.duration || 0)
    a.addEventListener('timeupdate', zeit)
    a.addEventListener('ended', fertig)
    a.addEventListener('loadedmetadata', meta)
    return () => {
      a.pause()
      a.removeEventListener('timeupdate', zeit)
      a.removeEventListener('ended', fertig)
      a.removeEventListener('loadedmetadata', meta)
    }
  }, [src])

  const spiele = (i: number): void => {
    const a = audio.current
    if (!a) return
    const [von, bis] = abschnittGrenzen(ton, i, dauer)
    setNr(i)
    ende.current = bis
    a.currentTime = von
    setLaeuft('abschnitt')
    void a.play().catch(() => setLaeuft(null))
  }
  const ganz = (): void => {
    const a = audio.current
    if (!a) return
    ende.current = Infinity
    a.currentTime = 0
    setLaeuft('ganz')
    void a.play().catch(() => setLaeuft(null))
  }
  const stopp = (): void => {
    audio.current?.pause()
    setLaeuft(null)
  }

  return (
    <Paper withBorder radius="md" p="xs" data-diktat-abspieler>
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Text size="sm" fw={700}>
          🔊 Diktat anhören
        </Text>
        <Group gap={6} wrap="nowrap">
          <Button size="xs" variant={laeuft === 'ganz' ? 'filled' : 'light'} leftSection={<IconPlayerPlay size={14} />} onClick={ganz} data-diktat-ganz>
            Ganzer Text
          </Button>
          <Tooltip label="Voriger Abschnitt">
            <ActionIcon variant="light" onClick={() => spiele(Math.max(0, nr - 1))} disabled={nr === 0} aria-label="Voriger Abschnitt">
              <IconPlayerSkipBack size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Abschnitt wiederholen">
            <ActionIcon variant="light" onClick={() => spiele(nr)} aria-label="Abschnitt wiederholen" data-diktat-wiederholen>
              <IconRepeat size={16} />
            </ActionIcon>
          </Tooltip>
          <Button
            size="xs"
            rightSection={<IconPlayerSkipForward size={14} />}
            onClick={() => spiele(laeuft === null && nr === 0 && !audio.current?.currentTime ? 0 : Math.min(anzahl - 1, nr + 1))}
            disabled={nr >= anzahl - 1 && Boolean(audio.current?.currentTime)}
            data-diktat-weiter
          >
            {nr === 0 && !audio.current?.currentTime ? 'Abschnitt 1' : 'Weiter'}
          </Button>
          {laeuft && (
            <ActionIcon variant="subtle" color="gray" onClick={stopp} aria-label="Anhalten">
              <IconPlayerStop size={16} />
            </ActionIcon>
          )}
        </Group>
      </Group>
      <Group gap="xs" mt={6} wrap="nowrap">
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }} data-diktat-nr={nr + 1}>
          Abschnitt {nr + 1} von {anzahl}
        </Text>
        <Progress value={((nr + 1) / Math.max(1, anzahl)) * 100} size="sm" style={{ flex: 1 }} />
      </Group>
    </Paper>
  )
}
