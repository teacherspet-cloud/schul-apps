import { Button, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { IconEraser, IconKeyboard, IconPencil, IconPuzzle, IconSpace } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { fuerServer, useDarstellung } from '../../onlinetest/schuelerDarstellung'
import { senden } from '../../onlinetest/serverApi'
import { erkenne, type Strich } from './erkennung'
import { gelegtText, LEER, leerAnhaengen, nurBuchstaben, tippStand, zuordnen, type Kachel } from './legeLogik'

export { gelegtText, LEER, leerAnhaengen, nurBuchstaben, tippStand, zuordnen, type Kachel }

type Art = 'legen' | 'tippen' | 'schreiben'

/** Steht der Fokus in einem Eingabefeld? Sonst gehört die Taste der Legeaufgabe. */
const imFeld = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
}

/**
 * „Lege das Wort" mit drei Eingabearten (08.10.2026, abgestimmt mit der Lehrkraft): Plättchen antippen, auf der Tastatur
 * tippen oder mit Finger/Stift schreiben. Getippte und geschriebene Buchstaben verbrauchen sichtbar die Plättchen –
 * die Aufgabe bleibt dieselbe. Die Wahl folgt dem Konto (Darstellung `legen`).
 *
 * Seit 09.10.2026 (Wunsch der Lehrkraft):
 *  - Tastatur wird erkannt: Wer beim Legen oder Schreiben einfach lostippt, ist ohne Klick auf „Tippen" im Tippmodus –
 *    der erste Buchstabe zählt schon. Enter prüft, sobald alles liegt; die Rücktaste nimmt das Letzte zurück.
 *  - `leerzeichen` (schwerste Stufe): Leerzeichen setzen die Lernenden selbst – mit der Leertaste oder dem Knopf
 *    „Leerzeichen", der bei JEDEM Wort bereitsteht und so nichts verrät.
 *  - `anzeige`: was das Tippfeld zeigt (im Trainer mit den Leerzeichen der Lösung, die schon dastehen).
 */
export default function LegeEingabe({
  kacheln,
  gelegt,
  setGelegt,
  gesperrt,
  fertig,
  anzahl,
  leerzeichen = false,
  anzeige,
  children
}: {
  kacheln: Kachel[]
  gelegt: number[]
  setGelegt: (g: number[]) => void
  gesperrt: boolean
  /** Enter (im Tippfeld oder ohne Fokus), wenn alle Plättchen liegen */
  fertig: () => void
  /** Wie viele Buchstaben das Wort hat (Spiel mit Ablenker-Plättchen); sonst alle Plättchen */
  anzahl?: number
  /** Schwerste Stufe: Leerzeichen selbst setzen (09.10.2026) */
  leerzeichen?: boolean
  /** Text im Tippfeld zum Gelegten (sonst die Buchstaben hintereinander) */
  anzeige?: (gelegt: number[]) => string
  /** Die Plättchen zum Antippen (bleiben in jeder Art sichtbar) */
  children: React.ReactNode
}): React.JSX.Element {
  const voll = anzahl ?? kacheln.length
  const wahl = useDarstellung((s) => s.d)
  const setze = useDarstellung((s) => s.setze)
  const art: Art = wahl.legen ?? 'legen'
  const tippFeld = useRef<HTMLInputElement>(null)
  const umstellen = (a: Art): void => {
    const neu = { ...useDarstellung.getState().d, legen: a }
    setze(neu)
    if (window.__schulappsServer?.angemeldet) void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  const komplett = nurBuchstaben(gelegt).length >= voll
  // Aktueller Stand für die Tastatur (der Horcher hängt einmal am Fenster)
  const stand = useRef({ gelegt, kacheln, art, gesperrt, komplett, fertig, setGelegt, leerzeichen, voll })
  stand.current = { gelegt, kacheln, art, gesperrt, komplett, fertig, setGelegt, leerzeichen, voll }
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      const s = stand.current
      if (s.gesperrt || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || imFeld(e.target)) return
      if (e.key === 'Enter') {
        if (!s.komplett) return
        e.preventDefault()
        s.fertig()
        return
      }
      if (e.key === 'Backspace') {
        if (!s.gelegt.length) return
        e.preventDefault()
        s.setGelegt(s.gelegt.slice(0, -1))
        return
      }
      if (e.key.length !== 1) return
      // Leertaste: nur in der schwersten Stufe ein Zeichen; sonst bedient sie wie gewohnt den Knopf im Fokus
      if (e.key === ' ') {
        if (!s.leerzeichen) return
        e.preventDefault()
        s.setGelegt(leerAnhaengen(s.gelegt))
        return
      }
      if (!/[\p{L}\p{N}]/u.test(e.key)) return
      e.preventDefault()
      // Lostippen genügt: in den Tippmodus wechseln (am Konto gemerkt) – der Buchstabe zählt schon
      if (s.art !== 'tippen') umstellen('tippen')
      else tippFeld.current?.focus()
      const r = zuordnen(
        e.key,
        s.kacheln.filter((k) => !s.gelegt.includes(k.i))
      )
      if (!r.fehlt && nurBuchstaben(s.gelegt).length < s.voll) s.setGelegt([...s.gelegt, ...r.gelegt])
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
      {leerzeichen && (
        <Button
          variant="default"
          radius="md"
          size="sm"
          w={220}
          leftSection={<IconSpace size={16} />}
          disabled={gesperrt || !gelegt.length || gelegt[gelegt.length - 1] === LEER || komplett}
          onClick={() => setGelegt(leerAnhaengen(gelegt))}
          data-lege-leerzeichen
        >
          Leerzeichen
        </Button>
      )}
      {art === 'tippen' && (
        <Tippen
          feld={tippFeld}
          kacheln={kacheln}
          gelegt={gelegt}
          setGelegt={setGelegt}
          gesperrt={gesperrt}
          fertig={fertig}
          voll={voll}
          leerzeichen={leerzeichen}
          anzeige={anzeige}
        />
      )}
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

function Tippen({
  feld,
  kacheln,
  gelegt,
  setGelegt,
  gesperrt,
  fertig,
  voll,
  leerzeichen,
  anzeige
}: {
  feld: React.RefObject<HTMLInputElement | null>
  kacheln: Kachel[]
  gelegt: number[]
  setGelegt: (g: number[]) => void
  gesperrt: boolean
  fertig: () => void
  voll: number
  leerzeichen: boolean
  anzeige?: (gelegt: number[]) => string
}): React.JSX.Element {
  const [fehlt, setFehlt] = useState('')
  const text = anzeige ? anzeige(gelegt) : gelegtText(gelegt, kacheln)
  // Fokus und Schreibmarke ans Ende – auch, wenn gerade erst per Tastatur in den Tippmodus gewechselt wurde
  useEffect(() => {
    const el = feld.current
    if (!el || gesperrt) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Stack gap={2} align="center">
      <TextInput
        ref={feld}
        value={text}
        onChange={(e) => {
          const r = tippStand({ text, gelegt }, e.currentTarget.value, kacheln, leerzeichen)
          setFehlt(r.fehlt ?? '')
          if (!r.fehlt && nurBuchstaben(r.gelegt).length <= voll) setGelegt(r.gelegt)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && nurBuchstaben(gelegt).length === voll) {
            e.preventDefault()
            fertig()
          }
        }}
        disabled={gesperrt}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Wort eintippen …"
        size="md"
        w={260}
        styles={{ input: { textAlign: 'center', fontWeight: 700, letterSpacing: 2, whiteSpace: 'pre' } }}
        aria-label="Wort eintippen"
        data-lege-tippen
      />
      <Text size="xs" c={fehlt ? 'orange' : 'dimmed'} mih={18}>
        {fehlt
          ? `„${fehlt}“ ist nicht mehr unter den Buchstaben.`
          : leerzeichen
          ? 'Jeder getippte Buchstabe nimmt ein Plättchen – Leerzeichen setzt du selbst.'
          : 'Jeder getippte Buchstabe nimmt ein Plättchen.'}
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

  const fertigGelegt = nurBuchstaben(gelegt).length >= voll
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
