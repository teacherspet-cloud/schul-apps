/**
 * Vier neue Grammatikspiele (08.10.2026, im Plan-Modus mit der Lehrkraft abgestimmt). Grundlage sind nur schon geübte
 * Aufgaben; angeboten werden sie nur, wenn die Grammatik dazu passt (shared/grammatiktrainer.ts `grammatikSpielPasst`):
 *  - Richtig oder falsch? – 60 s, stimmt der Satz grammatisch?
 *  - Formen-Memory – Grundform/Vorgabe und gebildete Form als Paar
 *  - Tabellen-Puzzle – Formen in die leeren Felder einer geübten Tabelle setzen
 *  - Signalwort-Sortierer – welche (bekannte) Zeitform verrät das Signalwort?
 * Ergebnis und Fehler (Aufgaben-Kennungen) gehen wie bei den übrigen Spielen an den Server.
 */
import { Badge, Button, Group, Progress, SimpleGrid, Stack, Table, Text } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { memoryPaare, normiert, richtigFalschSaetze, type GrammatikAufgabe } from '@shared/grammatiktrainer'
import { signalRunden, type Zeitform } from '@shared/signalwoerter'
import { useVtFarbe } from '../vtFarben'
import { gemischt } from './SpieleErkennen'
import { ton } from '../../onlinetest/schuelerDarstellung'

type Ende = (wert: number, fehler: string[]) => void

// ---------------------------------------------------------------- Richtig oder falsch?

export function RichtigFalsch({ aufgaben, ende }: { aufgaben: GrammatikAufgabe[]; ende: Ende }): React.JSX.Element {
  const farbe = useVtFarbe()
  const saetze = useMemo(() => {
    const l = gemischt(richtigFalschSaetze(aufgaben))
    return [...l, ...gemischt(l), ...gemischt(l)]
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [punkte, setPunkte] = useState(0)
  const [rest, setRest] = useState(60)
  const [rueck, setRueck] = useState<'gut' | 'schlecht' | null>(null)
  const fehler = useRef<string[]>([])
  const fertig = useRef(false)
  useEffect(() => {
    const t = setInterval(() => setRest((r) => r - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if ((rest <= 0 || i >= saetze.length) && !fertig.current) {
      fertig.current = true
      ende(punkte, fehler.current)
    }
  }, [rest, i, saetze.length, punkte, ende])
  const s = saetze[i]
  const antworten = (stimmt: boolean): void => {
    if (!s || rueck) return
    const ok = stimmt === s.stimmt
    if (ok) {
      setPunkte((p) => p + 1)
      ton('richtig')
    } else fehler.current.push(s.aufgabeId)
    setRueck(ok ? 'gut' : 'schlecht')
    setTimeout(() => (setRueck(null), setI((x) => x + 1)), ok ? 350 : 1100)
  }
  return (
    <Stack data-spiel="richtigfalsch">
      <Group justify="space-between">
        <Badge color={farbe.a} variant="light" size="lg">
          {punkte} richtig
        </Badge>
        <Text fw={700}>{Math.max(0, rest)} s</Text>
      </Group>
      <Progress value={(rest / 60) * 100} color={farbe.a} size="sm" />
      {s && (
        <Text ta="center" fz="xl" fw={700} py="lg" c={rueck === 'gut' ? 'teal' : rueck === 'schlecht' ? 'red' : undefined} data-rf-satz>
          {s.satz}
        </Text>
      )}
      {rueck === 'schlecht' && s && (
        <Text ta="center" size="sm" c="dimmed">
          {s.stimmt ? 'Der Satz war richtig.' : 'Der Satz hatte einen Fehler.'}
        </Text>
      )}
      <SimpleGrid cols={2}>
        <Button size="xl" radius="xl" color="teal" onClick={() => antworten(true)} data-rf="richtig">
          Stimmt
        </Button>
        <Button size="xl" radius="xl" color="red" variant="light" onClick={() => antworten(false)} data-rf="falsch">
          Falsch
        </Button>
      </SimpleGrid>
    </Stack>
  )
}

// ---------------------------------------------------------------- Formen-Memory

export function FormenMemory({ aufgaben, ende }: { aufgaben: GrammatikAufgabe[]; ende: Ende }): React.JSX.Element {
  const farbe = useVtFarbe()
  const karten = useMemo(() => {
    const p = gemischt(memoryPaare(aufgaben)).slice(0, 6)
    return gemischt(
      p.flatMap((x, n) => [
        { key: `${n}-l`, paar: n, text: x.links, links: true, aufgabeId: x.aufgabeId },
        { key: `${n}-r`, paar: n, text: x.rechts, links: false, aufgabeId: x.aufgabeId }
      ])
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [offen, setOffen] = useState<string[]>([])
  const [gefunden, setGefunden] = useState<Set<number>>(new Set())
  const [zuege, setZuege] = useState(0)
  const tippen = (k: (typeof karten)[number]): void => {
    if (offen.includes(k.key) || gefunden.has(k.paar) || offen.length >= 2) return
    const neu = [...offen, k.key]
    setOffen(neu)
    if (neu.length < 2) return
    setZuege((z) => z + 1)
    const [a, b] = neu.map((x) => karten.find((c) => c.key === x)!)
    if (a.paar === b.paar) {
      const g = new Set(gefunden).add(a.paar)
      setGefunden(g)
      setOffen([])
      ton('richtig')
      if (g.size === karten.length / 2) setTimeout(() => ende(zuege + 1, []), 700)
    } else setTimeout(() => setOffen([]), 1100)
  }
  return (
    <Stack data-spiel="formenmemory">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Finde die Paare: Grundform bzw. Vorgabe und die richtige Form.
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {zuege} Züge
        </Badge>
      </Group>
      <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
        {karten.map((k) => {
          const sichtbar = offen.includes(k.key) || gefunden.has(k.paar)
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => tippen(k)}
              className={`vt-memory ${sichtbar ? 'auf' : ''} ${gefunden.has(k.paar) ? 'gefunden' : ''}`}
              data-memory-karte={k.paar}
              aria-label={sichtbar ? k.text : 'Verdeckte Karte'}
            >
              <span className="vt-memory-innen">
                <span className="vt-memory-zu">?</span>
                <span className={`vt-memory-auf ${k.links ? 'de' : 'fs'}`} style={{ fontSize: k.text.length > 18 ? '.8rem' : undefined, padding: 4 }}>
                  {k.text}
                </span>
              </span>
            </button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

// ---------------------------------------------------------------- Tabellen-Puzzle

export function TabellenPuzzle({ aufgaben, ende }: { aufgaben: GrammatikAufgabe[]; ende: Ende }): React.JSX.Element {
  const farbe = useVtFarbe()
  const a = useMemo(() => gemischt(aufgaben.filter((x) => x.art === 'tabelle'))[0], []) // eslint-disable-line react-hooks/exhaustive-deps
  const zellen = useMemo(
    () =>
      (a?.zeilen ?? [])
        .flatMap((z, i) => z.loesungen.map((l, j) => ({ key: `${i}-${j}`, form: l, vorgabe: Boolean(z.vorgabe?.[j]) || !l })))
        .filter((z) => !z.vorgabe),
    [a]
  )
  const [chips] = useState(() => gemischt(zellen.map((z, n) => ({ n, form: z.form }))))
  const [belegt, setBelegt] = useState<Record<string, string>>({})
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const [falsch, setFalsch] = useState<string | null>(null)
  const fehlversuche = useRef(new Set<string>())
  const [genutzt, setGenutzt] = useState<Set<number>>(new Set())
  if (!a) return <Text>Keine Tabelle geübt.</Text>
  const setzen = (key: string, soll: string): void => {
    if (gewaehlt === null || belegt[key]) return
    const chip = chips[gewaehlt]
    if (normiert(chip.form) === normiert(soll)) {
      const neu = { ...belegt, [key]: chip.form }
      setBelegt(neu)
      setGenutzt(new Set(genutzt).add(gewaehlt))
      setGewaehlt(null)
      ton('richtig')
      if (Object.keys(neu).length === zellen.length)
        setTimeout(() => ende(zellen.length - fehlversuche.current.size, fehlversuche.current.size ? [a.id] : []), 600)
    } else {
      fehlversuche.current.add(key)
      setFalsch(key)
      setTimeout(() => setFalsch(null), 700)
    }
  }
  return (
    <Stack data-spiel="tabellenpuzzle">
      <Text c="dimmed" size="sm">
        {a.satz || a.anweisung} – Form antippen, dann das passende Feld.
      </Text>
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            {(a.spalten ?? []).map((s) => (
              <Table.Th key={s}>{s}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(a.zeilen ?? []).map((z, i) => (
            <Table.Tr key={z.name}>
              <Table.Td fw={700}>{z.name}</Table.Td>
              {z.loesungen.map((l, j) => {
                const key = `${i}-${j}`
                const fest = Boolean(z.vorgabe?.[j]) || !l
                return (
                  <Table.Td
                    key={key}
                    onClick={() => !fest && setzen(key, l)}
                    style={{
                      cursor: fest ? 'default' : 'pointer',
                      background:
                        falsch === key ? 'var(--mantine-color-red-light)' : belegt[key] ? 'var(--vt-gut-bg, var(--mantine-color-teal-light))' : undefined
                    }}
                    data-zelle={fest ? undefined : key}
                  >
                    {fest ? l : belegt[key] ?? '…'}
                  </Table.Td>
                )
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group gap="xs">
        {chips.map((c) =>
          genutzt.has(c.n) ? null : (
            <Button
              key={c.n}
              size="sm"
              radius="xl"
              variant={gewaehlt === c.n ? 'filled' : 'light'}
              color={farbe.a}
              onClick={() => setGewaehlt(c.n)}
              data-form-chip={c.form}
            >
              {c.form}
            </Button>
          )
        )}
      </Group>
    </Stack>
  )
}

// ---------------------------------------------------------------- Signalwort-Sortierer

export function SignalwortSortierer({ zeitformen, ende }: { zeitformen: Zeitform[]; ende: Ende }): React.JSX.Element {
  const farbe = useVtFarbe()
  const runden = useMemo(() => signalRunden(zeitformen), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [punkte, setPunkte] = useState(0)
  const [rueck, setRueck] = useState<string | null>(null)
  const r = runden[i]
  const waehlen = (id: string): void => {
    if (!r || rueck) return
    const ok = id === r.richtig
    if (ok) {
      setPunkte((p) => p + 1)
      ton('richtig')
    }
    setRueck(ok ? 'gut' : r.richtig)
    setTimeout(
      () => {
        setRueck(null)
        if (i + 1 >= runden.length) ende(punkte + (ok ? 1 : 0), [])
        else setI(i + 1)
      },
      ok ? 400 : 1400
    )
  }
  return (
    <Stack data-spiel="signalwort">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Signalwort {Math.min(i + 1, runden.length)} von {runden.length}
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {punkte} richtig
        </Badge>
      </Group>
      {r && (
        <Text ta="center" fz={28} fw={800} py="lg" data-signal>
          {r.signal}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        {zeitformen.map((z) => (
          <Button
            key={z.id}
            size="lg"
            radius="xl"
            variant={rueck && rueck !== 'gut' && z.id === rueck ? 'filled' : 'light'}
            color={rueck && rueck !== 'gut' && z.id === rueck ? 'teal' : farbe.a}
            onClick={() => waehlen(z.id)}
            data-zeitform={z.id}
          >
            {z.name}
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
