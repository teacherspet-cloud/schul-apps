/**
 * Hör- und Bilderspiele (07.10.2026, im Plan-Modus mit der Lehrkraft abgestimmt): Aussprache und Bilder der
 * Medienbank spielerisch nutzen.
 *  - Hören: Hör-Memory, Richtig gehört? (Blitz), Buchstaben-Puzzle nach Gehör, Hör-Bingo
 *  - Bilder: Bild-Memory, Was fehlt? (Kim-Spiel), Bild aufdecken, Wort → Bild
 * Ton = Aufnahme der Medienbank, sonst die Stimme des Geräts (`sprich`). Antwortform in „Was fehlt?" und „Bild
 * aufdecken" nach dem Fach im Kasten: bis Fach 2 auswählen, ab Fach 3 schreiben. Wie alle Spiele: eigener Rekord,
 * Fehler kommen auf „nochmal ansehen" und machen das Wort im Kasten wackelig.
 */
import { ActionIcon, Badge, Button, Group, Progress, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconBackspace, IconCheck, IconVolume, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { auswahlOptionen, bewerte, type Vokabel, type WortStand } from '@shared/vokabeltrainer'
import { spielform } from '@shared/vokabelSpiele'
import { sprich } from '../VokabelTrainer'
import { useVtFarbe } from '../vtFarben'
import { gemischt, useSekunden, type SpielProps } from './SpieleErkennen'

/** Ab diesem Fach wird geschrieben statt gewählt (abgestimmt 07.10.2026) */
export const SCHREIBEN_AB_FACH = 3
const schreibt = (v: Vokabel, staende?: Record<string, WortStand>): boolean => (staende?.[v.id]?.fach ?? 0) >= SCHREIBEN_AB_FACH

const BILD: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12, background: '#fff' }

/** Antwort: vier Möglichkeiten oder schreiben (je nach Fach) – meldet richtig/falsch */
function Antwort({ v, alle, schreiben, fertig }: { v: Vokabel; alle: Vokabel[]; schreiben: boolean; fertig: (richtig: boolean) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const optionen = useMemo(() => auswahlOptionen(v, alle, 'fs').map(spielform), [v]) // eslint-disable-line react-hooks/exhaustive-deps
  const richtig = spielform(v.term)
  if (schreiben)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) fertig(bewerte(text, v.term).urteil !== 'falsch')
        }}
        style={{ width: '100%', maxWidth: 520 }}
      >
        <Group wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            size="lg"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Das Wort schreiben"
            data-spiel-eingabe
          />
          <Button size="lg" type="submit" disabled={!text.trim()}>
            OK
          </Button>
        </Group>
      </form>
    )
  return (
    <SimpleGrid cols={2} w="100%" maw={520} spacing="xs">
      {optionen.map((o) => (
        <Button
          key={o}
          size="lg"
          radius="lg"
          variant="default"
          className="vt-option"
          data-zustand={gewaehlt ? (o === richtig ? 'richtig' : o === gewaehlt ? 'falsch' : undefined) : undefined}
          style={{ height: 'auto', minHeight: 56, whiteSpace: 'normal' }}
          onClick={() => {
            if (gewaehlt) return
            setGewaehlt(o)
            fertig(o === richtig)
          }}
          data-option={o}
        >
          {o}
        </Button>
      ))}
    </SimpleGrid>
  )
}

/** Kurze Rückmeldung nach einer Runde */
function Rueck({ gut, richtig }: { gut: boolean; richtig: string }): React.JSX.Element {
  return (
    <Badge size="xl" radius="md" color={gut ? 'green' : 'red'} variant="light" tt="none" data-runde-urteil={gut ? 'richtig' : 'falsch'}>
      {gut ? 'Richtig!' : `Richtig: ${richtig}`}
    </Badge>
  )
}

// ---------------------------------------------------------------- Memory mit Ton bzw. Bild

function PaarMemory({
  spiel,
  karten,
  hinweis,
  ende,
  beimAufdecken
}: {
  spiel: string
  karten: { key: string; wid: string; seite: 'a' | 'b'; inhalt: React.ReactNode; label: string }[]
  hinweis: string
  ende: SpielProps['ende']
  beimAufdecken?: (k: { wid: string; seite: 'a' | 'b' }) => void
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const [offen, setOffen] = useState<string[]>([])
  const [gefunden, setGefunden] = useState<Set<string>>(new Set())
  const [zuege, setZuege] = useState(0)
  const tippen = (k: (typeof karten)[number]): void => {
    if (offen.includes(k.key) || gefunden.has(k.wid) || offen.length >= 2) return
    beimAufdecken?.(k)
    const neu = [...offen, k.key]
    setOffen(neu)
    if (neu.length < 2) return
    setZuege((z) => z + 1)
    const [a, b] = neu.map((x) => karten.find((c) => c.key === x)!)
    if (a.wid === b.wid && a.seite !== b.seite) {
      const g = new Set(gefunden).add(a.wid)
      setGefunden(g)
      setOffen([])
      if (g.size === karten.length / 2) setTimeout(() => ende(zuege + 1, []), 700)
    } else setTimeout(() => setOffen([]), 1100)
  }
  return (
    <Stack data-spiel={spiel}>
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {hinweis}
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {zuege} Züge
        </Badge>
      </Group>
      <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
        {karten.map((k) => {
          const sichtbar = offen.includes(k.key) || gefunden.has(k.wid)
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => tippen(k)}
              className={`vt-memory ${sichtbar ? 'auf' : ''} ${gefunden.has(k.wid) ? 'gefunden' : ''}`}
              data-memory-karte={k.wid}
              data-memory-seite={k.seite}
              aria-label={sichtbar ? k.label : 'Verdeckte Karte'}
            >
              <span className="vt-memory-innen">
                <span className="vt-memory-zu">?</span>
                <span className={`vt-memory-auf ${k.seite === 'a' ? 'fs' : 'de'}`}>{k.inhalt}</span>
              </span>
            </button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

/** Hör-Memory: Lautsprecherkarte ↔ geschriebenes Wort (bzw. Bild); das Aufdecken spricht */
export function HoerMemory({ woerter, sprache, ende }: SpielProps): React.JSX.Element {
  const karten = useMemo(
    () =>
      gemischt(
        gemischt(woerter)
          .slice(0, 6)
          .flatMap((v) => [
            { key: `${v.id}-t`, wid: v.id, seite: 'a' as const, inhalt: <IconVolume size={30} />, label: 'Tonkarte' },
            { key: `${v.id}-w`, wid: v.id, seite: 'b' as const, inhalt: spielform(v.term), label: spielform(v.term) }
          ])
      ),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <PaarMemory
      spiel="hoermemory"
      karten={karten}
      hinweis="Finde zu jedem Ton das passende Wort."
      ende={ende}
      beimAufdecken={(k) => {
        const v = woerter.find((w) => w.id === k.wid)
        if (v && k.seite === 'a') sprich(v.term, sprache)
      }}
    />
  )
}

/** Bild-Memory: Bild ↔ Wort */
export function BildMemory({ woerter, sprache, ende }: SpielProps): React.JSX.Element {
  const karten = useMemo(
    () =>
      gemischt(
        gemischt(woerter.filter((w) => w.bild))
          .slice(0, 6)
          .flatMap((v) => [
            { key: `${v.id}-b`, wid: v.id, seite: 'a' as const, inhalt: <img src={v.bild} alt="" style={BILD} />, label: 'Bildkarte' },
            { key: `${v.id}-w`, wid: v.id, seite: 'b' as const, inhalt: spielform(v.term), label: spielform(v.term) }
          ])
      ),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <PaarMemory
      spiel="bildmemory"
      karten={karten}
      hinweis="Finde zu jedem Bild das passende Wort."
      ende={ende}
      beimAufdecken={(k) => {
        const v = woerter.find((w) => w.id === k.wid)
        if (v && k.seite === 'b') sprich(v.term, sprache)
      }}
    />
  )
}

// ---------------------------------------------------------------- Richtig gehört?

export function RichtigGehoert({ woerter, sprache, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const sek = useSekunden()
  const DAUER = 60
  const neueRunde = (): { v: Vokabel; zeige: Vokabel } => {
    const v = gemischt(woerter)[0]
    const zeige = Math.random() < 0.5 ? v : gemischt(woerter.filter((w) => w.id !== v.id))[0] ?? v
    return { v, zeige }
  }
  const [runde, setRunde] = useState(neueRunde)
  const [gut, setGut] = useState(0)
  const [rueck, setRueck] = useState<boolean | null>(null)
  const fehler = useRef(new Set<string>())
  const fertig = useRef(false)
  useEffect(() => {
    sprich(runde.v.term, sprache)
  }, [runde]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sek >= DAUER && !fertig.current) {
      fertig.current = true
      ende(gut, [...fehler.current])
    }
  }, [sek]) // eslint-disable-line react-hooks/exhaustive-deps
  const antwort = (passt: boolean): void => {
    if (rueck !== null || fertig.current) return
    const richtig = passt === (runde.v.id === runde.zeige.id)
    setRueck(richtig)
    if (richtig) setGut((g) => g + 1)
    else fehler.current.add(runde.v.id)
    setTimeout(() => {
      setRueck(null)
      setRunde(neueRunde())
    }, 600)
  }
  return (
    <Stack align="center" data-spiel="richtiggehoert">
      <Group justify="space-between" w="100%">
        <Badge color={farbe.a} variant="light" size="lg">
          {gut} richtig
        </Badge>
        <Text fw={700}>{Math.max(0, DAUER - sek)} s</Text>
      </Group>
      <Progress value={(Math.min(sek, DAUER) / DAUER) * 100} w="100%" radius="xl" color={farbe.a} />
      <ActionIcon size={64} radius="xl" variant="light" color={farbe.a} onClick={() => sprich(runde.v.term, sprache)} aria-label="Noch einmal anhören">
        <IconVolume size={32} />
      </ActionIcon>
      <div style={{ width: 200, height: 200, display: 'grid', placeItems: 'center' }} data-gezeigt={runde.zeige.id}>
        {runde.zeige.bild ? (
          <img src={runde.zeige.bild} alt="" style={BILD} />
        ) : (
          <Text fz={26} fw={800} ta="center">
            {runde.zeige.translation}
          </Text>
        )}
      </div>
      {rueck !== null ? (
        <Badge size="xl" color={rueck ? 'green' : 'red'} variant="light">
          {rueck ? 'Richtig!' : 'Daneben'}
        </Badge>
      ) : (
        <Text size="sm" c="dimmed">
          Passt das Bild bzw. die Bedeutung zum gehörten Wort?
        </Text>
      )}
      <Group grow w="100%" maw={420}>
        <Button size="xl" radius="lg" color="green" leftSection={<IconCheck size={22} />} onClick={() => antwort(true)} data-passt>
          Passt
        </Button>
        <Button size="xl" radius="lg" color="red" variant="light" leftSection={<IconX size={22} />} onClick={() => antwort(false)} data-passt-nicht>
          Passt nicht
        </Button>
      </Group>
    </Stack>
  )
}

// ---------------------------------------------------------------- Buchstaben-Puzzle nach Gehör

const ABC = 'abcdefghijklmnopqrstuvwxyz'

export function BuchstabenPuzzle({ woerter, sprache, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const reihe = useMemo(() => gemischt(woerter.filter((w) => spielform(w.term).length <= 14)).slice(0, 8), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [gelegt, setGelegt] = useState<number[]>([])
  const [rueck, setRueck] = useState<boolean | null>(null)
  const [gut, setGut] = useState(0)
  const fehler = useRef(new Set<string>())
  const v = reihe[i]
  const wort = v ? spielform(v.term) : ''
  const kacheln = useMemo(() => {
    const buchstaben = [...wort.replace(/\s/g, '')]
    const ablenker = gemischt([...ABC].filter((b) => !buchstaben.includes(b))).slice(0, 2)
    return gemischt([...buchstaben, ...ablenker])
  }, [wort])
  useEffect(() => {
    if (v) setTimeout(() => sprich(v.term, sprache), 250)
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return <Text c="dimmed">Dafür gibt es noch zu wenige Wörter.</Text>
  const ziel = wort.replace(/\s/g, '')
  const gelegtText = gelegt.map((k) => kacheln[k]).join('')
  const pruefen = (): void => {
    const ok = gelegtText.toLowerCase() === ziel.toLowerCase()
    setRueck(ok)
    if (ok) setGut((g) => g + 1)
    else fehler.current.add(v.id)
    setTimeout(
      () => {
        if (i + 1 >= reihe.length) return ende(gut + (ok ? 1 : 0), [...fehler.current])
        setI(i + 1)
        setGelegt([])
        setRueck(null)
      },
      ok ? 800 : 1800
    )
  }
  return (
    <Stack align="center" data-spiel="buchstaben">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Wort {i + 1} von {reihe.length}
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {gut} richtig
        </Badge>
      </Group>
      <ActionIcon size={80} radius="xl" variant="light" color={farbe.a} onClick={() => sprich(v.term, sprache)} aria-label="Noch einmal anhören">
        <IconVolume size={40} />
      </ActionIcon>
      <Group gap={4} mih={52} justify="center" data-gelegt>
        {[...ziel].map((_, k) => (
          <span key={k} className="vt-raten-feld">
            {gelegt[k] !== undefined ? kacheln[gelegt[k]] : ''}
          </span>
        ))}
      </Group>
      {rueck !== null && <Rueck gut={rueck} richtig={wort} />}
      <Group gap={6} justify="center" maw={520}>
        {kacheln.map((b, k) => (
          <Button
            key={k}
            size="lg"
            radius="md"
            variant="default"
            w={52}
            px={0}
            disabled={gelegt.includes(k) || rueck !== null || gelegt.length >= ziel.length}
            onClick={() => setGelegt([...gelegt, k])}
            data-kachel={b}
          >
            {b}
          </Button>
        ))}
      </Group>
      <Group>
        <Button
          variant="subtle"
          leftSection={<IconBackspace size={16} />}
          disabled={!gelegt.length || rueck !== null}
          onClick={() => setGelegt(gelegt.slice(0, -1))}
        >
          Zurück
        </Button>
        <Button disabled={gelegt.length !== ziel.length || rueck !== null} onClick={pruefen} data-pruefen>
          Prüfen
        </Button>
      </Group>
    </Stack>
  )
}

// ---------------------------------------------------------------- Hör-Bingo

/** Alle Reihen, Spalten und Diagonalen eines n×n-Rasters */
export function bingoLinien(n: number): number[][] {
  const r = (i: number): number[] => Array.from({ length: n }, (_, k) => i * n + k)
  const s = (i: number): number[] => Array.from({ length: n }, (_, k) => k * n + i)
  return [
    ...Array.from({ length: n }, (_, i) => r(i)),
    ...Array.from({ length: n }, (_, i) => s(i)),
    Array.from({ length: n }, (_, k) => k * n + k),
    Array.from({ length: n }, (_, k) => k * n + (n - 1 - k))
  ]
}

export function HoerBingo({ woerter, sprache, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const n = woerter.length >= 16 ? 4 : 3
  const feld = useMemo(() => gemischt(woerter).slice(0, n * n), []) // eslint-disable-line react-hooks/exhaustive-deps
  const aufrufe = useMemo(() => gemischt(feld), [feld])
  const [k, setK] = useState(0)
  const [markiert, setMarkiert] = useState<Set<number>>(new Set())
  const [daneben, setDaneben] = useState<number | null>(null)
  const fehler = useRef(new Set<string>())
  const v = aufrufe[k]
  useEffect(() => {
    if (v) setTimeout(() => sprich(v.term, sprache), 300)
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  const tippen = (i: number): void => {
    if (!v || markiert.has(i)) return
    if (feld[i].id !== v.id) {
      fehler.current.add(v.id)
      setDaneben(i)
      setTimeout(() => setDaneben(null), 600)
      return
    }
    const neu = new Set(markiert).add(i)
    setMarkiert(neu)
    if (bingoLinien(n).some((l) => l.every((x) => neu.has(x)))) return void setTimeout(() => ende(k + 1, [...fehler.current]), 600)
    setK(k + 1)
  }
  return (
    <Stack align="center" data-spiel="hoerbingo">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Tippe das gehörte Wort – eine volle Reihe ist Bingo!
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {k + 1}. Aufruf
        </Badge>
      </Group>
      <ActionIcon
        size={64}
        radius="xl"
        variant="light"
        color={farbe.a}
        onClick={() => v && sprich(v.term, sprache)}
        aria-label="Noch einmal anhören"
        data-bingo-aufruf={v?.id}
      >
        <IconVolume size={32} />
      </ActionIcon>
      <SimpleGrid cols={n} spacing={6} w="100%" maw={460}>
        {feld.map((w, i) => (
          <button
            key={w.id}
            type="button"
            onClick={() => tippen(i)}
            className="vt-such"
            data-bingo-feld={w.id}
            style={{
              aspectRatio: '1',
              display: 'grid',
              placeItems: 'center',
              padding: 4,
              fontSize: '0.85rem',
              background: markiert.has(i) ? 'var(--vt-gut-bg)' : daneben === i ? 'var(--vt-schlecht-bg)' : undefined,
              borderColor: markiert.has(i) ? 'var(--vt-gut-rand)' : undefined
            }}
          >
            {w.bild ? <img src={w.bild} alt={spielform(w.term)} style={{ ...BILD, opacity: markiert.has(i) ? 0.5 : 1 }} /> : spielform(w.term)}
          </button>
        ))}
      </SimpleGrid>
    </Stack>
  )
}

// ---------------------------------------------------------------- Was fehlt? (Kim-Spiel)

export function WasFehlt({ woerter, sprache, ende, staende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const mitBild = useMemo(() => woerter.filter((w) => w.bild), [woerter])
  const RUNDEN = 5
  const neu = (): { bilder: Vokabel[]; fehlt: Vokabel } => {
    const bilder = gemischt(mitBild).slice(0, Math.min(9, Math.max(6, mitBild.length)))
    return { bilder, fehlt: gemischt(bilder)[0] }
  }
  const [r, setR] = useState(0)
  const [runde, setRunde] = useState(neu)
  const [phase, setPhase] = useState<'merken' | 'raten' | 'rueck'>('merken')
  const [ok, setOk] = useState(false)
  const [gut, setGut] = useState(0)
  const [rest, setRest] = useState(8)
  const fehler = useRef(new Set<string>())
  useEffect(() => {
    if (phase !== 'merken') return
    if (rest <= 0) return setPhase('raten')
    const t = setTimeout(() => setRest((x) => x - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, rest])
  const fertig = (richtig: boolean): void => {
    setOk(richtig)
    setPhase('rueck')
    if (richtig) setGut((g) => g + 1)
    else fehler.current.add(runde.fehlt.id)
    sprich(runde.fehlt.term, sprache)
    setTimeout(
      () => {
        if (r + 1 >= RUNDEN) return ende(gut + (richtig ? 1 : 0), [...fehler.current])
        setR(r + 1)
        setRunde(neu())
        setRest(8)
        setPhase('merken')
      },
      richtig ? 1000 : 2000
    )
  }
  return (
    <Stack align="center" data-spiel="wasfehlt" data-phase={phase}>
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          {phase === 'merken' ? `Präge dir die Bilder ein … ${rest}` : 'Welches Bild fehlt?'}
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          Runde {r + 1} von {RUNDEN} · {gut} richtig
        </Badge>
      </Group>
      <SimpleGrid cols={3} spacing={6} w="100%" maw={420}>
        {runde.bilder.map((w) => (
          <div
            key={w.id}
            style={{
              aspectRatio: '1',
              borderRadius: 12,
              border: '1px solid var(--vt-a-rand)',
              background: 'var(--vt-flaeche)',
              display: 'grid',
              placeItems: 'center'
            }}
            data-kim-bild={w.id}
          >
            {phase === 'merken' || w.id !== runde.fehlt.id ? (
              <img src={w.bild} alt="" style={BILD} />
            ) : phase === 'rueck' ? (
              <img src={w.bild} alt="" style={{ ...BILD, outline: `3px solid var(--vt-${ok ? 'gut' : 'schlecht'}-rand)` }} />
            ) : (
              <Text fz={36} c="dimmed">
                ?
              </Text>
            )}
          </div>
        ))}
      </SimpleGrid>
      {phase === 'merken' && (
        <Button variant="light" onClick={() => setRest(0)} data-kim-fertig>
          Ich habe sie mir gemerkt
        </Button>
      )}
      {phase === 'raten' && <Antwort v={runde.fehlt} alle={mitBild} schreiben={schreibt(runde.fehlt, staende)} fertig={fertig} />}
      {phase === 'rueck' && <Rueck gut={ok} richtig={spielform(runde.fehlt.term)} />}
    </Stack>
  )
}

// ---------------------------------------------------------------- Bild aufdecken

export function BildAufdecken({ woerter, sprache, ende, staende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const KACHELN = 12
  const reihe = useMemo(() => gemischt(woerter.filter((w) => w.bild)).slice(0, 6), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [weg, setWeg] = useState<number[]>([])
  const [rueck, setRueck] = useState<boolean | null>(null)
  const [punkte, setPunkte] = useState(0)
  const fehler = useRef(new Set<string>())
  const reihenfolge = useMemo(() => gemischt(Array.from({ length: KACHELN }, (_, k) => k)), [i])
  const v = reihe[i]
  useEffect(() => {
    if (rueck !== null || weg.length >= KACHELN) return
    const t = setTimeout(() => setWeg((w) => [...w, reihenfolge[w.length]]), 2000)
    return () => clearTimeout(t)
  }, [weg, rueck, reihenfolge])
  if (!v) return <Text c="dimmed">Dafür gibt es noch zu wenige Bilder.</Text>
  const fertig = (richtig: boolean): void => {
    setRueck(richtig)
    setWeg(Array.from({ length: KACHELN }, (_, k) => k))
    sprich(v.term, sprache)
    const p = richtig ? KACHELN - weg.length + 1 : 0
    if (richtig) setPunkte((x) => x + p)
    else fehler.current.add(v.id)
    setTimeout(
      () => {
        if (i + 1 >= reihe.length) return ende(punkte + p, [...fehler.current])
        setI(i + 1)
        setWeg([])
        setRueck(null)
      },
      richtig ? 1100 : 2000
    )
  }
  return (
    <Stack align="center" data-spiel="aufdecken">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Bild {i + 1} von {reihe.length} – je früher, desto mehr Punkte
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {punkte} Punkte
        </Badge>
      </Group>
      <div style={{ position: 'relative', width: 240, height: 240 }} data-aufdecken-bild={v.id}>
        <img src={v.bild} alt="" style={BILD} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}>
          {Array.from({ length: KACHELN }, (_, k) => (
            <div
              key={k}
              style={{
                background: weg.includes(k) ? 'transparent' : 'linear-gradient(135deg, var(--vt-a-mittel), var(--vt-a-tief))',
                border: weg.includes(k) ? 'none' : '1px solid var(--vt-a-dunkel)',
                transition: 'background .3s'
              }}
            />
          ))}
        </div>
      </div>
      {rueck === null ? (
        <Antwort key={v.id} v={v} alle={woerter.filter((w) => w.bild)} schreiben={schreibt(v, staende)} fertig={fertig} />
      ) : (
        <Rueck gut={rueck} richtig={spielform(v.term)} />
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- Wort → Bild

export function WortBild({ woerter, sprache, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const mitBild = useMemo(() => woerter.filter((w) => w.bild), [woerter])
  const reihe = useMemo(() => gemischt(mitBild).slice(0, 10), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [gut, setGut] = useState(0)
  const fehler = useRef(new Set<string>())
  const v = reihe[i]
  const optionen = useMemo(() => (v ? gemischt([v, ...gemischt(mitBild.filter((w) => w.id !== v.id)).slice(0, 3)]) : []), [v, mitBild])
  useEffect(() => {
    if (v) setTimeout(() => sprich(v.term, sprache), 250)
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return <Text c="dimmed">Dafür gibt es noch zu wenige Bilder.</Text>
  const waehle = (w: Vokabel): void => {
    if (gewaehlt) return
    setGewaehlt(w.id)
    const ok = w.id === v.id
    if (ok) setGut((g) => g + 1)
    else fehler.current.add(v.id)
    setTimeout(
      () => {
        if (i + 1 >= reihe.length) return ende(gut + (ok ? 1 : 0), [...fehler.current])
        setI(i + 1)
        setGewaehlt(null)
      },
      ok ? 700 : 1600
    )
  }
  return (
    <Stack align="center" data-spiel="wortbild">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Runde {i + 1} von {reihe.length}
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {gut} richtig
        </Badge>
      </Group>
      <Group gap="xs">
        <Text fz={30} fw={800} data-wortbild-wort>
          {spielform(v.term)}
        </Text>
        <ActionIcon size="lg" radius="xl" variant="light" color={farbe.a} onClick={() => sprich(v.term, sprache)} aria-label="Anhören">
          <IconVolume size={20} />
        </ActionIcon>
      </Group>
      <SimpleGrid cols={2} spacing="xs" w="100%" maw={420}>
        {optionen.map((w) => {
          const zustand = gewaehlt ? (w.id === v.id ? 'gut' : w.id === gewaehlt ? 'schlecht' : undefined) : undefined
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => waehle(w)}
              data-bild-option={w.id}
              style={{
                aspectRatio: '1',
                padding: 6,
                borderRadius: 14,
                cursor: 'pointer',
                border: `3px solid ${zustand ? `var(--vt-${zustand}-rand)` : 'var(--vt-a-rand)'}`,
                background: 'var(--vt-flaeche)'
              }}
            >
              <img src={w.bild} alt="" style={BILD} />
            </button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}
