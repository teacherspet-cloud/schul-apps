import { Button, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { IconEraser, IconKeyboard, IconPencil, IconPuzzle } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { fuerServer, useDarstellung } from '../../onlinetest/schuelerDarstellung'
import { senden } from '../../onlinetest/serverApi'
import { erkenne, type Strich } from './erkennung'

export interface Kachel {
  b: string
  i: number
}

type Art = 'legen' | 'tippen' | 'schreiben'

/**
 * „Lege das Wort" mit drei Eingabearten (08.10.2026, abgestimmt mit der Lehrkraft): Plättchen antippen, auf der Tastatur
 * tippen oder mit Finger/Stift schreiben. Getippte und geschriebene Buchstaben verbrauchen sichtbar die Plättchen –
 * die Aufgabe bleibt dieselbe. Die Wahl folgt dem Konto (Darstellung `legen`).
 */
export default function LegeEingabe({
  kacheln,
  gelegt,
  setGelegt,
  gesperrt,
  fertig,
  anzahl,
  children
}: {
  kacheln: Kachel[]
  gelegt: number[]
  setGelegt: (g: number[]) => void
  gesperrt: boolean
  /** Enter im Tippfeld, wenn alle Plättchen liegen */
  fertig: () => void
  /** Wie viele Buchstaben das Wort hat (Spiel mit Ablenker-Plättchen); sonst alle Plättchen */
  anzahl?: number
  /** Die Plättchen zum Antippen (bleiben in jeder Art sichtbar) */
  children: React.ReactNode
}): React.JSX.Element {
  const voll = anzahl ?? kacheln.length
  const wahl = useDarstellung((s) => s.d)
  const setze = useDarstellung((s) => s.setze)
  const art: Art = wahl.legen ?? 'legen'
  const umstellen = (a: Art): void => {
    const neu = { ...wahl, legen: a }
    setze(neu)
    if (window.__schulappsServer?.angemeldet) void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  return (
    <Stack align="center" gap="xs" w="100%">
      <SegmentedControl
        size="xs"
        value={art}
        onChange={(a) => umstellen(a as Art)}
        data={[
          { value: 'legen', label: <Mit icon={<IconPuzzle size={14} />} text="Legen" /> },
          { value: 'tippen', label: <Mit icon={<IconKeyboard size={14} />} text="Tippen" /> },
          { value: 'schreiben', label: <Mit icon={<IconPencil size={14} />} text="Schreiben" /> }
        ]}
        data-lege-art
      />
      {children}
      {art === 'tippen' && <Tippen kacheln={kacheln} gelegt={gelegt} setGelegt={setGelegt} gesperrt={gesperrt} fertig={fertig} voll={voll} />}
      {art === 'schreiben' && <Schreiben kacheln={kacheln} gelegt={gelegt} setGelegt={setGelegt} gesperrt={gesperrt} voll={voll} />}
    </Stack>
  )
}

function Mit({ icon, text }: { icon: React.ReactNode; text: string }): React.JSX.Element {
  return (
    <Group gap={4} wrap="nowrap" justify="center">
      {icon}
      <span>{text}</span>
    </Group>
  )
}

/** Buchstaben eines Textes den freien Plättchen zuordnen (Groß/Klein egal); null, wenn einer fehlt */
export function zuordnen(text: string, kacheln: Kachel[]): { gelegt: number[]; fehlt?: string } {
  const frei = [...kacheln]
  const gelegt: number[] = []
  for (const z of [...text]) {
    // Leerzeichen und Apostrophe stehen schon im Wort
    if (/[\s'’‘ʼ´`′]/.test(z)) continue
    const k = frei.findIndex((x) => x.b === z) >= 0 ? frei.findIndex((x) => x.b === z) : frei.findIndex((x) => x.b.toLowerCase() === z.toLowerCase())
    if (k < 0) return { gelegt, fehlt: z }
    gelegt.push(frei[k].i)
    frei.splice(k, 1)
  }
  return { gelegt }
}

function Tippen({
  kacheln,
  gelegt,
  setGelegt,
  gesperrt,
  fertig,
  voll
}: {
  kacheln: Kachel[]
  gelegt: number[]
  setGelegt: (g: number[]) => void
  gesperrt: boolean
  fertig: () => void
  voll: number
}): React.JSX.Element {
  const [fehlt, setFehlt] = useState('')
  const text = gelegt.map((i) => kacheln.find((k) => k.i === i)?.b ?? '').join('')
  return (
    <Stack gap={2} align="center">
      <TextInput
        value={text}
        onChange={(e) => {
          const r = zuordnen(e.currentTarget.value, kacheln)
          setFehlt(r.fehlt ?? '')
          if (!r.fehlt && r.gelegt.length <= voll) setGelegt(r.gelegt)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && gelegt.length === voll) fertig()
        }}
        disabled={gesperrt}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Wort eintippen …"
        size="md"
        w={260}
        styles={{ input: { textAlign: 'center', fontWeight: 700, letterSpacing: 2 } }}
        aria-label="Wort eintippen"
        data-lege-tippen
      />
      <Text size="xs" c={fehlt ? 'orange' : 'dimmed'} mih={18}>
        {fehlt ? `„${fehlt}“ ist nicht mehr unter den Buchstaben.` : 'Jeder getippte Buchstabe nimmt ein Plättchen.'}
      </Text>
    </Stack>
  )
}

/** Wartezeit nach dem letzten Strich, bevor erkannt wird (mehrteilige Buchstaben wie t, i, ä) */
const PAUSE_MS = 750

function Schreiben({
  kacheln,
  gelegt,
  setGelegt,
  gesperrt,
  voll
}: {
  kacheln: Kachel[]
  gelegt: number[]
  setGelegt: (g: number[]) => void
  gesperrt: boolean
  voll: number
}): React.JSX.Element {
  const flaeche = useRef<HTMLCanvasElement>(null)
  const striche = useRef<Strich[]>([])
  const aktiv = useRef<number | null>(null)
  const uhr = useRef<number | undefined>(undefined)
  // Für die Korrektur: die anderen Möglichkeiten zum zuletzt erkannten Buchstaben
  const [andere, setAndere] = useState<string[]>([])
  const stand = useRef({ gelegt, kacheln, setGelegt })
  stand.current = { gelegt, kacheln, setGelegt }

  const freie = (g: number[]): Kachel[] => kacheln.filter((k) => !g.includes(k.i))

  const leeren = (): void => {
    striche.current = []
    const c = flaeche.current
    const ctx = c?.getContext('2d')
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
  }

  const auswerten = (): void => {
    const { gelegt: g, kacheln: alle, setGelegt: legen } = stand.current
    const frei = alle.filter((k) => !g.includes(k.i))
    const treffer = erkenne(striche.current, frei.map((k) => k.b))
    leeren()
    if (!treffer.length) return
    const z = treffer[0].zeichen
    const k = frei.find((x) => x.b === z) ?? frei.find((x) => x.b.toLowerCase() === z)
    if (!k) return
    legen([...g, k.i])
    setAndere(treffer.slice(1, 4).map((t) => t.zeichen))
  }

  // Zeichenfläche an die Bildschirmdichte anpassen
  useEffect(() => {
    const c = flaeche.current
    if (!c) return
    const r = window.devicePixelRatio || 1
    c.width = c.clientWidth * r
    c.height = c.clientHeight * r
    c.getContext('2d')?.scale(r, r)
    return () => window.clearTimeout(uhr.current)
  }, [])

  const punkt = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const b = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - b.left, y: e.clientY - b.top }
  }
  const zeichne = (von: { x: number; y: number }, nach: { x: number; y: number }): void => {
    const ctx = flaeche.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = getComputedStyle(flaeche.current!).color
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(von.x, von.y)
    ctx.lineTo(nach.x + 0.01, nach.y)
    ctx.stroke()
  }

  const fertigGelegt = gelegt.length >= voll
  const zuletzt = gelegt.length ? kacheln.find((k) => k.i === gelegt[gelegt.length - 1]) : undefined
  return (
    <Stack gap={6} align="center">
      <canvas
        ref={flaeche}
        className="lege-schreibflaeche"
        style={{
          width: 240,
          height: 190,
          touchAction: 'none',
          borderRadius: 16,
          border: '2px dashed var(--vt-a-zart, var(--mantine-color-default-border))',
          background: 'var(--vt-a-hell, var(--mantine-color-default))',
          color: 'var(--vt-a-dunkel, var(--mantine-color-text))',
          cursor: 'crosshair',
          opacity: gesperrt || fertigGelegt ? 0.45 : 1
        }}
        aria-label="Hier einen Buchstaben schreiben"
        onPointerDown={(e) => {
          if (gesperrt || fertigGelegt) return
          e.currentTarget.setPointerCapture(e.pointerId)
          window.clearTimeout(uhr.current)
          aktiv.current = e.pointerId
          const p = punkt(e)
          striche.current.push([p])
          zeichne(p, p)
        }}
        onPointerMove={(e) => {
          if (aktiv.current !== e.pointerId) return
          const s = striche.current[striche.current.length - 1]
          const p = punkt(e)
          zeichne(s[s.length - 1], p)
          s.push(p)
        }}
        onPointerUp={(e) => {
          if (aktiv.current !== e.pointerId) return
          aktiv.current = null
          uhr.current = window.setTimeout(auswerten, PAUSE_MS)
        }}
        onPointerCancel={() => {
          aktiv.current = null
        }}
        data-lege-schreiben
      />
      <Text size="xs" c="dimmed" ta="center" maw={280}>
        Einen Buchstaben nach dem anderen hineinschreiben – er wird erkannt und gelegt.
      </Text>
      <Group gap={6} justify="center" mih={30}>
        {zuletzt && andere.length > 0 && !gesperrt && (
          <>
            <Text size="xs" c="dimmed">
              Nicht „{zuletzt.b}“? Stattdessen:
            </Text>
            {andere
              .filter((z) => freie(gelegt.slice(0, -1)).some((k) => k.b.toLowerCase() === z))
              .map((z) => (
                <Button
                  key={z}
                  size="compact-sm"
                  variant="default"
                  onClick={() => {
                    const vorher = gelegt.slice(0, -1)
                    const k = freie(vorher).find((x) => x.b.toLowerCase() === z)
                    if (!k) return
                    setGelegt([...vorher, k.i])
                    setAndere([])
                  }}
                  data-lege-statt={z}
                >
                  {kacheln.find((k) => k.b.toLowerCase() === z)?.b ?? z}
                </Button>
              ))}
          </>
        )}
        <Button size="compact-sm" variant="subtle" leftSection={<IconEraser size={14} />} onClick={leeren} disabled={gesperrt}>
          Fläche leeren
        </Button>
      </Group>
    </Stack>
  )
}
