/**
 * Vokabelspiele zum Erkennen (03.10.2026, abgestimmt): Memory, Zuordnen gegen die Uhr, Blitzrunde,
 * Satzpuzzle. Jedes Spiel meldet am Ende seinen Wert (Züge, Sekunden, Treffer) und die Wörter, die
 * danebengingen – der Karteikasten bleibt unverändert.
 */
import { hatSatzAufnahme } from '../medienCache'
import { HoerKnopf } from './SpieleMedien'
import { Badge, Button, Group, Progress, SimpleGrid, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { auswahlOptionen, type Vokabel } from '@shared/vokabeltrainer'
import { satzTeile, spielform } from '@shared/vokabelSpiele'
import { useVtFarbe } from '../vtFarben'

export interface SpielProps {
  woerter: Vokabel[]
  sprache: string
  ende: (wert: number, fehler: string[]) => void
}

export const gemischt = <T,>(l: readonly T[]): T[] => [...l].sort(() => Math.random() - 0.5)

/** Laufende Sekunden seit dem Start */
export function useSekunden(laeuft = true): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!laeuft) return
    const t = setInterval(() => setS((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [laeuft])
  return s
}

// ---------------------------------------------------------------- Memory

export function Memory({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const karten = useMemo(() => {
    const w = gemischt(woerter).slice(0, 6)
    return gemischt(
      w.flatMap((v) => [
        { key: `${v.id}-f`, wid: v.id, text: spielform(v.term), fs: true },
        { key: `${v.id}-d`, wid: v.id, text: v.translation, fs: false }
      ])
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [offen, setOffen] = useState<string[]>([])
  const [gefunden, setGefunden] = useState<Set<string>>(new Set())
  const [zuege, setZuege] = useState(0)
  const tippen = (k: (typeof karten)[number]): void => {
    if (offen.includes(k.key) || gefunden.has(k.wid) || offen.length >= 2) return
    const neu = [...offen, k.key]
    setOffen(neu)
    if (neu.length < 2) return
    setZuege((z) => z + 1)
    const [a, b] = neu.map((x) => karten.find((c) => c.key === x)!)
    if (a.wid === b.wid && a.fs !== b.fs) {
      const g = new Set(gefunden).add(a.wid)
      setGefunden(g)
      setOffen([])
      if (g.size === karten.length / 2) setTimeout(() => ende(zuege + 1, []), 700)
    } else setTimeout(() => setOffen([]), 950)
  }
  return (
    <Stack data-spiel="memory">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Finde die Paare: Wort und Übersetzung.
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
              aria-label={sichtbar ? k.text : 'Verdeckte Karte'}
            >
              <span className="vt-memory-innen">
                <span className="vt-memory-zu">?</span>
                <span className={`vt-memory-auf ${k.fs ? 'fs' : 'de'}`}>{k.text}</span>
              </span>
            </button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

// ---------------------------------------------------------------- Zuordnen gegen die Uhr

export function Zuordnen({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const vorrat = useMemo(() => gemischt(woerter).slice(0, 10), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [naechster, setNaechster] = useState(Math.min(5, vorrat.length))
  const [links, setLinks] = useState(() => vorrat.slice(0, 5).map((v) => v.id))
  const [rechts, setRechts] = useState(() => gemischt(vorrat.slice(0, 5).map((v) => v.id)))
  const [wahl, setWahl] = useState<{ seite: 'l' | 'r'; id: string } | null>(null)
  const [falsch, setFalsch] = useState<string | null>(null)
  const [geschafft, setGeschafft] = useState(0)
  const fehler = useRef(new Set<string>())
  const sek = useSekunden(geschafft < vorrat.length)
  const v = (id: string): Vokabel => vorrat.find((x) => x.id === id)!
  const tippen = (seite: 'l' | 'r', id: string): void => {
    if (!wahl || wahl.seite === seite) return setWahl({ seite, id })
    const l = seite === 'l' ? id : wahl.id
    const r = seite === 'r' ? id : wahl.id
    setWahl(null)
    if (l !== r) {
      fehler.current.add(l)
      setFalsch(`${l}|${r}`)
      setTimeout(() => setFalsch(null), 500)
      return
    }
    // Paar gefunden: beide verschwinden, ein neues rückt nach
    const neu = vorrat[naechster]
    setLinks((x) => x.flatMap((y) => (y === l ? (neu ? [neu.id] : []) : [y])))
    setRechts((x) => {
      const ohne = x.filter((y) => y !== r)
      if (!neu) return ohne
      const pos = Math.floor(Math.random() * (ohne.length + 1))
      return [...ohne.slice(0, pos), neu.id, ...ohne.slice(pos)]
    })
    setNaechster((n) => n + 1)
    const g = geschafft + 1
    setGeschafft(g)
    if (g === vorrat.length) setTimeout(() => ende(sek, [...fehler.current]), 500)
  }
  const knopf = (seite: 'l' | 'r', id: string): React.JSX.Element => {
    const an = wahl?.seite === seite && wahl.id === id
    const rot = falsch?.split('|')[seite === 'l' ? 0 : 1] === id
    return (
      <Button
        key={`${seite}${id}`}
        size="md"
        radius="lg"
        className="vt-option"
        data-zustand={rot ? 'falsch' : an ? 'gewaehlt' : undefined}
        onClick={() => tippen(seite, id)}
        styles={{ label: { whiteSpace: 'normal' } }}
        h="auto"
        py={8}
        data-zuordnen={seite}
        data-wid={id}
      >
        {seite === 'l' ? spielform(v(id).term) : v(id).translation}
      </Button>
    )
  }
  return (
    <Stack data-spiel="zuordnen">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Tippe ein Wort und seine Übersetzung.
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {sek} s · {geschafft}/{vorrat.length}
        </Badge>
      </Group>
      <SimpleGrid cols={2} spacing="sm">
        <Stack gap="xs">{links.map((id) => knopf('l', id))}</Stack>
        <Stack gap="xs">{rechts.map((id) => knopf('r', id))}</Stack>
      </SimpleGrid>
    </Stack>
  )
}

// ---------------------------------------------------------------- Blitzrunde (60 Sekunden)

export function Blitzrunde({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const DAUER = 60
  const [frage, setFrage] = useState(() => gemischt(woerter)[0])
  const [optionen, setOptionen] = useState(() => auswahlOptionen(frage, woerter, 'de'))
  const [treffer, setTreffer] = useState(0)
  const [rest, setRest] = useState(DAUER)
  const [blitz, setBlitz] = useState<'gut' | 'schlecht' | null>(null)
  const fehler = useRef(new Set<string>())
  const fertig = useRef(false)
  useEffect(() => {
    const t = setInterval(() => setRest((r) => r - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (rest <= 0 && !fertig.current) {
      fertig.current = true
      ende(treffer, [...fehler.current])
    }
  }, [rest, treffer, ende])
  const weiter = (): void => {
    const andere = woerter.filter((w) => w.id !== frage.id)
    const n = andere.length ? andere[Math.floor(Math.random() * andere.length)] : frage
    setFrage(n)
    setOptionen(auswahlOptionen(n, woerter, 'de'))
  }
  const waehle = (o: string): void => {
    if (rest <= 0) return
    const gut = o === frage.translation
    if (gut) setTreffer((t) => t + 1)
    else fehler.current.add(frage.id)
    setBlitz(gut ? 'gut' : 'schlecht')
    setTimeout(() => setBlitz(null), 250)
    weiter()
  }
  return (
    <Stack data-spiel="blitz" align="center">
      <Group justify="space-between" w="100%">
        <Badge color={rest <= 10 ? 'red' : farbe.a} variant="filled" size="xl">
          {Math.max(0, rest)} s
        </Badge>
        <Badge color="teal" variant="light" size="xl">
          {treffer} richtig
        </Badge>
      </Group>
      <Progress value={(Math.max(0, rest) / DAUER) * 100} color={farbe.a} w="100%" radius="xl" />
      <Text
        fw={800}
        size="2rem"
        ta="center"
        c={blitz === 'gut' ? 'teal' : blitz === 'schlecht' ? 'red' : 'var(--vt-tinte)'}
        style={{ transition: 'color .15s' }}
      >
        {spielform(frage.term)}
      </Text>
      <SimpleGrid cols={2} w="100%" maw={520} spacing="xs">
        {optionen.map((o) => (
          <Button
            key={o}
            size="lg"
            radius="lg"
            className="vt-option"
            onClick={() => waehle(o)}
            styles={{ label: { whiteSpace: 'normal' } }}
            h="auto"
            py="sm"
            data-blitz-option
          >
            {o}
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
  )
}

// ---------------------------------------------------------------- Satzpuzzle

/**
 * Satzpuzzle; `hoeren` (Satz-Diktat, 05.10.2026): nur Sätze mit Aufnahme, statt der Übersetzung erklingt der
 * Satz (Medienbank) – ordnen nach Gehör.
 */
export function Satzpuzzle({ woerter, ende, hoeren = false }: SpielProps & { hoeren?: boolean }): React.JSX.Element {
  const farbe = useVtFarbe()
  const saetze = useMemo(
    () => gemischt(woerter.filter((w) => w.example && satzTeile(w.example).length >= 3 && (!hoeren || hatSatzAufnahme(w.example)))).slice(0, 5),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [i, setI] = useState(0)
  const [gelegt, setGelegt] = useState<number[]>([])
  const [geloest, setGeloest] = useState(0)
  const [urteil, setUrteil] = useState<'richtig' | 'falsch' | null>(null)
  const fehler = useRef(new Set<string>())
  const v = saetze[i]
  const teile = useMemo(() => (v ? satzTeile(v.example!) : []), [v])
  const reihe = useMemo(() => gemischt(teile.map((t, k) => ({ t, k }))), [teile])
  if (!v) return <Text c="dimmed">Für das Satzpuzzle braucht es Wörter mit Beispielsatz.</Text>
  const pruefen = (): void => {
    const gut = gelegt.map((k) => teile[k]).join(' ') === teile.join(' ')
    setUrteil(gut ? 'richtig' : 'falsch')
    if (gut) setGeloest((g) => g + 1)
    else fehler.current.add(v.id)
  }
  const weiter = (): void => {
    if (i + 1 >= saetze.length) return ende(geloest, [...fehler.current])
    setI(i + 1)
    setGelegt([])
    setUrteil(null)
  }
  return (
    <Stack data-spiel={hoeren ? 'satzhoeren' : 'satz'} align="center">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Satz {i + 1} von {saetze.length} · mit „{spielform(v.term)}“
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {geloest} gelöst
        </Badge>
      </Group>
      {hoeren ? (
        <HoerKnopf key={v.id} text={v.example!} farbe={farbe.a} />
      ) : (
        v.exampleTranslation && (
          <Text size="sm" c="dimmed" fs="italic" ta="center">
            {v.exampleTranslation}
          </Text>
        )
      )}
      {/* Gelegte Wörter antippen nimmt sie wieder heraus (Wunsch der Lehrkraft, 03.10.2026) */}
      <div className="vt-gelegt" style={{ minHeight: 64, width: '100%', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }} data-satz-gelegt>
        {gelegt.length === 0 && <Text c="dimmed">Tippe die Wörter unten in der richtigen Reihenfolge an.</Text>}
        {gelegt.map((k) => (
          <button
            key={k}
            type="button"
            disabled={Boolean(urteil)}
            onClick={() => setGelegt(gelegt.filter((x) => x !== k))}
            title={urteil ? undefined : 'Antippen zum Herausnehmen'}
            style={{
              border: 0,
              borderRadius: 8,
              padding: '4px 8px',
              font: 'inherit',
              fontSize: '1.1rem',
              fontWeight: 600,
              cursor: urteil ? 'default' : 'pointer',
              background: 'var(--vt-flaeche)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              color: urteil === 'falsch' ? 'var(--vt-schlecht-text)' : urteil === 'richtig' ? 'var(--vt-gut-text)' : 'var(--vt-a-dunkel)'
            }}
            data-satz-gelegtes={k}
          >
            {teile[k]}
          </button>
        ))}
      </div>
      {urteil === 'falsch' && (
        <Text size="sm" ta="center">
          Richtig: <b>{teile.join(' ')}</b>
        </Text>
      )}
      <Group gap={6} justify="center">
        {reihe.map(({ t, k }) => (
          <Button
            key={k}
            className="vt-kachel"
            disabled={gelegt.includes(k) || Boolean(urteil)}
            onClick={() => setGelegt([...gelegt, k])}
            px="sm"
            data-satz-teil={k}
          >
            {t}
          </Button>
        ))}
      </Group>
      <Group>
        <Button variant="subtle" color={farbe.a} disabled={!gelegt.length || Boolean(urteil)} onClick={() => setGelegt(gelegt.slice(0, -1))}>
          Zurück
        </Button>
        {urteil ? (
          <Button className="vt-los" radius="xl" onClick={weiter} data-satz-weiter>
            Weiter
          </Button>
        ) : (
          <Button className="vt-los" radius="xl" disabled={gelegt.length !== teile.length} onClick={pruefen} data-satz-pruefen>
            Prüfen
          </Button>
        )}
      </Group>
    </Stack>
  )
}
