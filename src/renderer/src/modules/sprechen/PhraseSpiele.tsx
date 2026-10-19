/**
 * Spiele zu den Useful Phrases (19.10.2026, abgestimmt mit der Lehrkraft): Phrase-Memory (Situation ↔ Wendung),
 * „Sag es!" (Situation lesen, Wendung sprechen – Spracherkennung des Browsers, nichts wird gespeichert oder gesendet),
 * Satzbaukasten (Wendung aus Bausteinen legen) und Lückensätze (im Mini-Dialog die passende Wendung wählen).
 * Ohne KI und ohne Kosten.
 */
import { Badge, Button, Group, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconMicrophone, IconRefresh } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { Phrase } from '@shared/sprechen/phrases'
import type { SprechSprache } from '@shared/sprechen/niveaus'

const mischen = <T,>(l: T[]): T[] => {
  const a = [...l]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/…|\.\.\./g, ' ')
    .replace(/[^a-z0-9ñ' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Passt das Gesagte zur Wendung? Mindestens 60 % ihrer Wörter (ohne Platzhalter) kommen vor */
export function passtZurPhrase(gesagt: string, phrase: string): boolean {
  const ziel = norm(phrase).split(' ').filter((w) => w.length > 1)
  if (!ziel.length) return false
  const da = new Set(norm(gesagt).split(' '))
  return ziel.filter((w) => da.has(w)).length / ziel.length >= 0.6
}

export type SpielId = 'memory' | 'sages' | 'baukasten' | 'luecke'
export const SPIEL_NAME: Record<SpielId, string> = { memory: 'Phrase-Memory', sages: 'Sag es!', baukasten: 'Satzbaukasten', luecke: 'Lückensätze' }

/** Phrase-Memory: 6 Paare Situation ↔ Wendung */
function Memory({ phrases, sprache, fertig }: { phrases: Phrase[]; sprache: SprechSprache; fertig: (z: number) => void }): React.JSX.Element {
  const auswahl = useMemo(() => mischen(phrases).slice(0, 6), [phrases])
  const karten = useMemo(
    () => mischen(auswahl.flatMap((p) => [{ id: p.id, k: `${p.id}s`, text: p.situation, art: 's' as const }, { id: p.id, k: `${p.id}p`, text: p.text[sprache], art: 'p' as const }])),
    [auswahl, sprache]
  )
  const [offen, setOffen] = useState<string[]>([])
  const [gefunden, setGefunden] = useState<Set<string>>(new Set())
  const [zuege, setZuege] = useState(0)
  const tippen = (k: string, id: string): void => {
    if (gefunden.has(id) || offen.includes(k) || offen.length === 2) return
    const neu = [...offen, k]
    setOffen(neu)
    if (neu.length === 2) {
      setZuege((z) => z + 1)
      const [a, b] = neu.map((x) => karten.find((c) => c.k === x)!)
      setTimeout(() => {
        if (a.id === b.id) {
          const g = new Set(gefunden).add(a.id)
          setGefunden(g)
          if (g.size === auswahl.length) fertig(zuege + 1)
        }
        setOffen([])
      }, 700)
    }
  }
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing={8} data-phrase-memory>
      {karten.map((c) => {
        const sicht = offen.includes(c.k) || gefunden.has(c.id)
        return (
          <UnstyledButton
            key={c.k}
            onClick={() => tippen(c.k, c.id)}
            style={{
              minHeight: 78,
              borderRadius: 10,
              padding: 8,
              fontSize: 13,
              textAlign: 'center',
              border: '2px solid var(--og-akzent, var(--mantine-color-blue-6))',
              background: gefunden.has(c.id) ? 'var(--mantine-color-teal-light)' : sicht ? 'var(--og-karte, var(--mantine-color-body))' : 'var(--og-akzent, var(--mantine-color-blue-6))',
              color: sicht ? 'inherit' : '#fff',
              fontStyle: c.art === 's' ? 'italic' : undefined
            }}
            data-memory-karte={c.id}
          >
            {sicht ? c.text : '?'}
          </UnstyledButton>
        )
      })}
    </SimpleGrid>
  )
}

/** „Sag es!": Situation lesen, Wendung sprechen (oder tippen, wenn der Browser keine Spracherkennung hat) */
function SagEs({ phrases, sprache, fertig }: { phrases: Phrase[]; sprache: SprechSprache; fertig: (z: number) => void }): React.JSX.Element {
  const runde = useMemo(() => mischen(phrases).slice(0, 6), [phrases])
  const [i, setI] = useState(0)
  const [treffer, setTreffer] = useState(0)
  const [ergebnis, setErgebnis] = useState<{ gesagt: string; ok: boolean } | null>(null)
  const [hoert, setHoert] = useState(false)
  const [getippt, setGetippt] = useState('')
  const p = runde[i]
  const Erkennung = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition
  const pruefen = (gesagt: string): void => {
    const ok = passtZurPhrase(gesagt, p.text[sprache])
    setErgebnis({ gesagt, ok })
    if (ok) setTreffer((t) => t + 1)
  }
  const sprechen = (): void => {
    if (!Erkennung) return
    const r = new Erkennung() as { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; start: () => void }
    r.lang = sprache === 'en' ? 'en-GB' : sprache === 'fr' ? 'fr-FR' : 'es-ES'
    r.interimResults = false
    r.onresult = (e) => pruefen(e.results[0]?.[0]?.transcript ?? '')
    r.onend = () => setHoert(false)
    setHoert(true)
    r.start()
  }
  const weiter = (): void => {
    setErgebnis(null)
    setGetippt('')
    if (i + 1 >= runde.length) fertig(treffer)
    else setI(i + 1)
  }
  if (!p) return <Text c="dimmed">Keine Wendungen.</Text>
  return (
    <Stack gap="sm" data-sag-es>
      <Text size="xs" c="dimmed">
        {i + 1} von {runde.length} · {treffer} richtig
      </Text>
      <Text fw={700} size="lg">
        {p.situation}
      </Text>
      {!ergebnis &&
        (Erkennung ? (
          <Button leftSection={<IconMicrophone size={18} />} onClick={sprechen} loading={hoert} radius="xl" w="fit-content" data-sag-es-sprechen>
            Sprich die Wendung
          </Button>
        ) : (
          <Group gap="xs">
            <TextInput value={getippt} onChange={(e) => setGetippt(e.currentTarget.value)} placeholder="Wendung tippen …" data-sag-es-tippen />
            <Button onClick={() => pruefen(getippt)} disabled={!getippt.trim()}>
              Prüfen
            </Button>
          </Group>
        ))}
      {ergebnis && (
        <Stack gap={4}>
          <Text size="sm">
            Du hast gesagt: „{ergebnis.gesagt || '…'}“
          </Text>
          <Text size="sm" c={ergebnis.ok ? 'teal' : 'orange'} fw={600}>
            {ergebnis.ok ? 'Passt!' : 'Fast – so geht es:'} {p.text[sprache]}
          </Text>
          <Button size="xs" w="fit-content" onClick={weiter} data-sag-es-weiter>
            Weiter
          </Button>
        </Stack>
      )}
    </Stack>
  )
}

/** Satzbaukasten: die Wendung aus ihren Wörtern legen */
function Baukasten({ phrases, sprache, fertig }: { phrases: Phrase[]; sprache: SprechSprache; fertig: (z: number) => void }): React.JSX.Element {
  const runde = useMemo(() => mischen(phrases.filter((p) => p.text[sprache].split(' ').length >= 3)).slice(0, 5), [phrases, sprache])
  const [i, setI] = useState(0)
  const [gelegt, setGelegt] = useState<number[]>([])
  const [richtig, setRichtig] = useState(0)
  const p = runde[i]
  const woerter = useMemo(() => (p ? p.text[sprache].split(' ') : []), [p, sprache])
  const reihenfolge = useMemo(() => mischen(woerter.map((_, k) => k)), [woerter])
  if (!p) return <Text c="dimmed">Keine Wendungen.</Text>
  const fertigGelegt = gelegt.length === woerter.length
  const stimmt = fertigGelegt && gelegt.map((k) => woerter[k]).join(' ') === woerter.join(' ')
  return (
    <Stack gap="sm" data-baukasten>
      <Text size="xs" c="dimmed">
        {i + 1} von {runde.length} · {p.situation}
      </Text>
      <Group gap={6} mih={40} style={{ borderBottom: '2px dashed var(--mantine-color-default-border)', paddingBottom: 6 }}>
        {gelegt.map((k, n) => (
          <Badge key={n} size="lg" variant="filled" tt="none" style={{ cursor: 'pointer' }} onClick={() => setGelegt(gelegt.filter((_, m) => m !== n))}>
            {woerter[k]}
          </Badge>
        ))}
      </Group>
      <Group gap={6}>
        {reihenfolge
          .filter((k) => !gelegt.includes(k))
          .map((k) => (
            <Badge key={k} size="lg" variant="light" tt="none" style={{ cursor: 'pointer' }} onClick={() => setGelegt([...gelegt, k])} data-baustein>
              {woerter[k]}
            </Badge>
          ))}
      </Group>
      {fertigGelegt && (
        <Group gap="xs">
          <Text c={stimmt ? 'teal' : 'orange'} fw={600} size="sm">
            {stimmt ? 'Richtig!' : `So heißt es: ${p.text[sprache]}`}
          </Text>
          <Button
            size="xs"
            onClick={() => {
              const r = richtig + (stimmt ? 1 : 0)
              setRichtig(r)
              setGelegt([])
              if (i + 1 >= runde.length) fertig(r)
              else setI(i + 1)
            }}
          >
            Weiter
          </Button>
        </Group>
      )}
    </Stack>
  )
}

/** Lückensätze: passende Wendung für die Situation wählen (eine richtige, zwei aus anderen Situationen) */
function Luecke({ phrases, sprache, fertig }: { phrases: Phrase[]; sprache: SprechSprache; fertig: (z: number) => void }): React.JSX.Element {
  const runde = useMemo(() => mischen(phrases).slice(0, 6), [phrases])
  const [i, setI] = useState(0)
  const [wahl, setWahl] = useState<string | null>(null)
  const [richtig, setRichtig] = useState(0)
  const p = runde[i]
  const optionen = useMemo(() => (p ? mischen([p, ...mischen(phrases.filter((x) => x.gruppe !== p.gruppe)).slice(0, 2)]) : []), [p, phrases])
  if (!p) return <Text c="dimmed">Keine Wendungen.</Text>
  return (
    <Stack gap="sm" data-luecke>
      <Text size="xs" c="dimmed">
        {i + 1} von {runde.length}
      </Text>
      <Text fw={600}>{p.situation}</Text>
      <Text size="sm" fs="italic" c="dimmed">
        A: … <b>________</b> …
      </Text>
      <Stack gap={6}>
        {optionen.map((o) => (
          <Button
            key={o.id}
            variant={wahl ? (o.id === p.id ? 'filled' : o.id === wahl ? 'light' : 'default') : 'default'}
            color={wahl ? (o.id === p.id ? 'teal' : 'orange') : undefined}
            onClick={() => {
              if (wahl) return
              setWahl(o.id)
              if (o.id === p.id) setRichtig((r) => r + 1)
            }}
            styles={{ label: { whiteSpace: 'normal', textAlign: 'left' } }}
            h="auto"
            py={6}
            data-luecke-option={o.id === p.id ? 'richtig' : 'falsch'}
          >
            {o.text[sprache]}
          </Button>
        ))}
      </Stack>
      {wahl && (
        <Button
          size="xs"
          w="fit-content"
          onClick={() => {
            setWahl(null)
            if (i + 1 >= runde.length) fertig(richtig)
            else setI(i + 1)
          }}
        >
          Weiter
        </Button>
      )}
    </Stack>
  )
}

export function PhraseSpiel({ spiel, phrases, sprache, zurueck }: { spiel: SpielId; phrases: Phrase[]; sprache: SprechSprache; zurueck: () => void }): React.JSX.Element {
  const [lauf, setLauf] = useState(0)
  const [ende, setEnde] = useState<number | null>(null)
  const fertig = (z: number): void => setEnde(z)
  return (
    <Stack gap="sm" data-phrase-spiel={spiel}>
      <Group justify="space-between">
        <Text fw={800}>{SPIEL_NAME[spiel]}</Text>
        <Button size="xs" variant="subtle" onClick={zurueck}>
          Zurück
        </Button>
      </Group>
      {ende !== null ? (
        <Stack gap="xs" data-spiel-ende>
          <Text fw={700}>{spiel === 'memory' ? `Geschafft in ${ende} Zügen!` : `${ende} richtig – gut gemacht!`}</Text>
          <Button leftSection={<IconRefresh size={14} />} w="fit-content" onClick={() => (setEnde(null), setLauf((l) => l + 1))}>
            Nochmal
          </Button>
        </Stack>
      ) : spiel === 'memory' ? (
        <Memory key={lauf} phrases={phrases} sprache={sprache} fertig={fertig} />
      ) : spiel === 'sages' ? (
        <SagEs key={lauf} phrases={phrases} sprache={sprache} fertig={fertig} />
      ) : spiel === 'baukasten' ? (
        <Baukasten key={lauf} phrases={phrases} sprache={sprache} fertig={fertig} />
      ) : (
        <Luecke key={lauf} phrases={phrases} sprache={sprache} fertig={fertig} />
      )}
    </Stack>
  )
}
