/**
 * Neue Vokabelspiele (06.10.2026, abgestimmt mit der Lehrkraft): Hören & Schreiben, Satz-Lücke im Kontext, Wortduell
 * auf Zeit. Wie die übrigen Spiele: nur eigener Rekord, keine Ranglisten; Fehler gehen als „nochmal ansehen" an den
 * Server und machen das Wort im Kasten wackelig (shared/vokabelSpiele.ts `nachSpielfehler`).
 */
import { Badge, Button, Group, Progress, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconVolume } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { auswahlOptionen, bewerte, satzMitLuecke, type Vokabel } from '@shared/vokabeltrainer'
import { spielform } from '@shared/vokabelSpiele'
import { sprich } from '../VokabelTrainer'
import { useVtFarbe } from '../vtFarben'
import { apostrophHinweis } from '../apostrophHinweis'
import { gemischt, useSekunden, type SpielProps } from './SpieleErkennen'
import { useZuSchnell } from '../zuSchnell'
import LoesungZeigen from '../LoesungZeigen'

const RUNDEN = 10

/** Eingabefeld, das Autokorrektur und Großschreibung des Geräts ausschaltet */
function Eingabe(p: {
  wert: string
  setzen: (v: string) => void
  fertig: () => void
  platzhalter: string
  kennung: string
  farbe?: string
}): React.JSX.Element {
  const feld = useRef<HTMLInputElement>(null)
  useEffect(() => feld.current?.focus(), [])
  return (
    <TextInput
      ref={feld}
      size="lg"
      w="100%"
      maw={520}
      value={p.wert}
      onChange={(e) => p.setzen(e.currentTarget.value)}
      onKeyDown={(e) => e.key === 'Enter' && p.fertig()}
      placeholder={p.platzhalter}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      styles={p.farbe ? { input: { borderColor: p.farbe, borderWidth: 2 } } : undefined}
      {...{ [p.kennung]: '' }}
    />
  )
}

// ---------------------------------------------------------------- Hören & Schreiben

export function HoerenSchreiben({ woerter, sprache, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const reihe = useMemo(() => gemischt(woerter).slice(0, RUNDEN), [woerter])
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  const [rueck, setRueck] = useState<{ gut: boolean; richtig: string } | null>(null)
  const [treffer, setTreffer] = useState(0)
  const fehler = useRef(new Set<string>())
  const v = reihe[i]
  useEffect(() => {
    if (v) setTimeout(() => sprich(v.term, sprache), 250)
  }, [v, sprache])
  const pruefen = (): void => {
    if (!v || rueck) return
    const u = bewerte(text, v.term)
    const gut = u.urteil === 'richtig'
    // Richtig, aber mit typografischem Apostroph: Tastatur-Hinweis (08.10.2026)
    if (gut) apostrophHinweis(text)
    if (gut) setTreffer((t) => t + 1)
    else fehler.current.add(v.id)
    setRueck({ gut, richtig: spielform(v.term) })
  }
  const weiter = (): void => {
    setRueck(null)
    setText('')
    if (i + 1 >= reihe.length) ende(treffer, [...fehler.current])
    else setI(i + 1)
  }
  if (!v) return <Text>Keine Wörter.</Text>
  return (
    <Stack data-spiel="diktat" align="center">
      <Group justify="space-between" w="100%">
        <Badge color={farbe.a} variant="light" size="lg">
          {i + 1} / {reihe.length}
        </Badge>
        <Badge color="teal" variant="light" size="lg">
          {treffer} richtig
        </Badge>
      </Group>
      <Button size="xl" radius="xl" className="vt-los" leftSection={<IconVolume size={26} />} onClick={() => sprich(v.term, sprache)} data-diktat-hoeren>
        Nochmal hören
      </Button>
      <Text c="dimmed" size="sm">
        Bedeutung: {v.translation}
      </Text>
      <Eingabe
        wert={text}
        setzen={setText}
        fertig={() => (rueck ? weiter() : pruefen())}
        platzhalter="Was hörst du? Schreib es auf …"
        kennung="data-diktat-eingabe"
        farbe={rueck ? (rueck.gut ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)') : undefined}
      />
      {rueck ? (
        <Stack align="center" gap={4}>
          <Text fw={800} c={rueck.gut ? 'teal' : 'red'}>
            {rueck.gut ? 'Richtig!' : `Richtig wäre: ${rueck.richtig}`}
          </Text>
          <Button radius="xl" onClick={weiter} data-weiter>
            Weiter
          </Button>
        </Stack>
      ) : (
        <Group>
          <Button radius="xl" onClick={pruefen} disabled={!text.trim()} data-pruefen>
            Prüfen
          </Button>
          {/* Nicht gewusst (09.10.2026): Lösung ansehen, zählt als Fehler */}
          <LoesungZeigen
            zeigen={() => {
              fehler.current.add(v.id)
              setRueck({ gut: false, richtig: spielform(v.term) })
            }}
          />
        </Group>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- Satz-Lücke im Kontext

/** Wörter mit Beispielsatz, in dem das Wort tatsächlich vorkommt */
export const mitSatzLuecke = (woerter: Vokabel[]): Vokabel[] => woerter.filter((w) => w.example && satzMitLuecke(w.example, w.term))

export function SatzLuecke({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const reihe = useMemo(() => gemischt(mitSatzLuecke(woerter)).slice(0, RUNDEN), [woerter])
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  // Erst tippen; nach einem Fehlversuch drei Wörter zur Auswahl
  const [auswahl, setAuswahl] = useState(false)
  const [rueck, setRueck] = useState<{ gut: boolean; richtig: string } | null>(null)
  const [treffer, setTreffer] = useState(0)
  const fehler = useRef(new Set<string>())
  const v = reihe[i]
  const luecke = v?.example ? satzMitLuecke(v.example, v.term) : null
  const optionen = useMemo(() => (v ? auswahlOptionen(v, woerter, 'fs').slice(0, 3) : []), [v, woerter])
  const loesen = (antwort: string): void => {
    if (!v || !luecke || rueck) return
    const gut = bewerte(antwort, luecke.loesung).urteil === 'richtig'
    if (!gut && !auswahl) {
      // Erster Fehlversuch: das Wort zählt als Fehler, aber es gibt eine zweite Chance mit Auswahl
      fehler.current.add(v.id)
      setAuswahl(true)
      setText('')
      return
    }
    // Getippt richtig, aber mit typografischem Apostroph: Tastatur-Hinweis (08.10.2026)
    if (gut && !auswahl) apostrophHinweis(antwort)
    if (gut && !fehler.current.has(v.id)) setTreffer((t) => t + 1)
    if (!gut) fehler.current.add(v.id)
    setRueck({ gut, richtig: luecke.loesung })
  }
  const weiter = (): void => {
    setRueck(null)
    setText('')
    setAuswahl(false)
    if (i + 1 >= reihe.length) ende(treffer, [...fehler.current])
    else setI(i + 1)
  }
  if (!v || !luecke) return <Text>Keine Wörter mit Beispielsatz.</Text>
  return (
    <Stack data-spiel="satzluecke" align="center">
      <Group justify="space-between" w="100%">
        <Badge color={farbe.a} variant="light" size="lg">
          {i + 1} / {reihe.length}
        </Badge>
        <Badge color="teal" variant="light" size="lg">
          {treffer} richtig
        </Badge>
      </Group>
      <Text fw={700} size="xl" ta="center" maw={620} data-satz-luecke>
        {luecke.vor}
        <span
          style={{
            display: 'inline-block',
            minWidth: 90,
            borderBottom: '3px solid var(--vt-a)',
            margin: '0 6px',
            color: rueck ? (rueck.gut ? 'teal' : 'red') : undefined
          }}
        >
          {rueck ? rueck.richtig : ' '}
        </span>
        {luecke.nach}
      </Text>
      {v.exampleTranslation && (
        <Text size="sm" c="dimmed" ta="center" maw={620}>
          {v.exampleTranslation}
        </Text>
      )}
      <Text size="sm" c="dimmed">
        Gesucht: {v.translation}
      </Text>
      {rueck ? (
        <Stack align="center" gap={4}>
          <Text fw={800} c={rueck.gut ? 'teal' : 'red'}>
            {rueck.gut ? 'Richtig!' : `Richtig wäre: ${rueck.richtig}`}
          </Text>
          <Button radius="xl" onClick={weiter} data-weiter>
            Weiter
          </Button>
        </Stack>
      ) : auswahl ? (
        <>
          <Text size="sm" fw={600}>
            Noch nicht – eins davon passt:
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 3 }} w="100%" maw={620} spacing="xs">
            {optionen.map((o) => (
              <Button
                key={o}
                size="lg"
                radius="lg"
                className="vt-option"
                onClick={() => loesen(o)}
                styles={{ label: { whiteSpace: 'normal' } }}
                h="auto"
                py="sm"
                data-luecke-option
              >
                {spielform(o)}
              </Button>
            ))}
          </SimpleGrid>
        </>
      ) : (
        <>
          <Eingabe wert={text} setzen={setText} fertig={() => text.trim() && loesen(text)} platzhalter="Das fehlende Wort …" kennung="data-luecke-eingabe" />
          <Group>
            <Button radius="xl" onClick={() => loesen(text)} disabled={!text.trim()} data-pruefen>
              Prüfen
            </Button>
            {/* Nicht gewusst (09.10.2026): Lösung ansehen, zählt als Fehler */}
            <LoesungZeigen
              zeigen={() => {
                fehler.current.add(v.id)
                setRueck({ gut: false, richtig: luecke.loesung })
              }}
            />
          </Group>
        </>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- Wortduell auf Zeit

const DUELL_RUNDEN = 20
const STRAFE = 3

export function Wortduell({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  // Je Runde ein Paar: zur Hälfte richtig, sonst mit der Übersetzung eines anderen Worts
  const runden = useMemo(
    () =>
      Array.from({ length: DUELL_RUNDEN }, () => {
        const v = woerter[Math.floor(Math.random() * woerter.length)]
        const andere = woerter.filter((w) => w.id !== v.id && w.translation !== v.translation)
        const passt = Math.random() < 0.5 || !andere.length
        return { v, passt, zeigt: passt ? v.translation : andere[Math.floor(Math.random() * andere.length)].translation }
      }),
    [woerter]
  )
  const [i, setI] = useState(0)
  const [strafe, setStrafe] = useState(0)
  const [blitz, setBlitz] = useState<'gut' | 'schlecht' | null>(null)
  const fertig = i >= runden.length
  const sekunden = useSekunden(!fertig)
  const fehler = useRef(new Set<string>())
  const gemeldet = useRef(false)
  useEffect(() => {
    if (fertig && !gemeldet.current) {
      gemeldet.current = true
      ende(sekunden + strafe, [...fehler.current])
    }
  }, [fertig, sekunden, strafe, ende])
  // Blind immer dieselbe Seite (09.10.2026): zählt nicht – die Runden kommen noch einmal
  const schnell = useZuSchnell<{ gut: boolean; id: string }>()
  useEffect(() => schnell.frage(), [i, schnell.frage])
  const antworten = (passt: boolean): void => {
    const r = runden[i]
    if (!r) return
    const gut = passt === r.passt
    const s = schnell.melden(passt ? 'passt' : 'passt nicht', { gut, id: r.v.id })
    if (!s.werten) {
      for (const x of s.zurueck) if (!x.gut) fehler.current.delete(x.id)
      if (s.zurueck.length) setI(Math.max(0, i - s.zurueck.length))
      schnell.frage()
      return
    }
    if (!gut) {
      fehler.current.add(r.v.id)
      setStrafe((s) => s + STRAFE)
    }
    setBlitz(gut ? 'gut' : 'schlecht')
    setTimeout(() => setBlitz(null), 220)
    setI(i + 1)
  }
  const r = runden[Math.min(i, runden.length - 1)]
  return (
    <Stack data-spiel="duell" align="center">
      <Group justify="space-between" w="100%">
        <Badge color={farbe.a} variant="filled" size="xl">
          {sekunden + strafe} s
        </Badge>
        <Badge color={strafe ? 'red' : 'gray'} variant="light" size="lg">
          {strafe ? `+${strafe} s Strafe` : 'je Fehler +3 s'}
        </Badge>
      </Group>
      <Progress value={(i / runden.length) * 100} color={farbe.a} w="100%" radius="xl" />
      <Stack
        gap={2}
        align="center"
        p="lg"
        style={{
          borderRadius: 20,
          minWidth: 280,
          background: blitz === 'gut' ? 'var(--mantine-color-teal-light)' : blitz === 'schlecht' ? 'var(--mantine-color-red-light)' : 'var(--vt-a-hell)',
          transition: 'background .15s'
        }}
      >
        <Text fw={800} size="2rem" ta="center">
          {spielform(r.v.term)}
        </Text>
        <Text size="xl" ta="center" c="dimmed">
          = {r.zeigt}
        </Text>
      </Stack>
      {schnell.hinweis}
      <Group grow w="100%" maw={520}>
        <Button size="xl" radius="xl" color="teal" onClick={() => antworten(true)} disabled={fertig} data-duell-passt>
          ✓ passt
        </Button>
        <Button size="xl" radius="xl" color="red" onClick={() => antworten(false)} disabled={fertig} data-duell-passt-nicht>
          ✗ passt nicht
        </Button>
      </Group>
    </Stack>
  )
}
