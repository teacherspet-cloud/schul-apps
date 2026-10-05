/**
 * Spiele mit der Medienbank (05.10.2026, Wunsch der Lehrkraft: „Spiele zum Vokabellernen mit den Bildern und
 * mit den Vokabeln, bei denen eine Aussprache hinterlegt ist – Wörter und Beispielsätze"):
 *  - Bilderrätsel: Beispielbild → das passende Wort wählen
 *  - Hörquiz: Aufnahme des Wortes → die richtige Schreibweise wählen
 *  - Satz-Diktat: Beispielsatz hören → Wörter ordnen (Satzpuzzle im Hörmodus, SpieleErkennen.tsx)
 * Zehn Runden, gezählt werden die richtigen Antworten; Fehler kommen auf „nochmal ansehen".
 */
import { ActionIcon, Badge, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconVolume } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { auswahlOptionen, type Vokabel } from '@shared/vokabeltrainer'
import { spielform } from '@shared/vokabelSpiele'
import { useVtFarbe } from '../vtFarben'
import { aufnahmeSpielen, medium } from '../medienCache'
import { gemischt, type SpielProps } from './SpieleErkennen'

const RUNDEN = 10

/** Hat das Wort eine Aufnahme seiner Aussprache? */
export const hatWortAufnahme = (v: Vokabel): boolean => Boolean(medium(v.term)?.ton?.url)

function Runden({
  spiel,
  fragen,
  optionenFuer,
  frageAnzeige,
  richtigFuer,
  ende
}: {
  spiel: string
  fragen: Vokabel[]
  optionenFuer: (v: Vokabel) => string[]
  frageAnzeige: (v: Vokabel) => React.ReactNode
  richtigFuer: (v: Vokabel) => string
  ende: SpielProps['ende']
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const [i, setI] = useState(0)
  const [gut, setGut] = useState(0)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const fehler = useRef(new Set<string>())
  const v = fragen[i]
  const optionen = useMemo(() => (v ? optionenFuer(v) : []), [v]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return <Text c="dimmed">Dafür gibt es noch zu wenige Wörter.</Text>
  const richtig = richtigFuer(v)
  const waehle = (o: string): void => {
    if (gewaehlt) return
    setGewaehlt(o)
    if (o === richtig) setGut((g) => g + 1)
    else fehler.current.add(v.id)
    setTimeout(
      () => {
        if (i + 1 >= fragen.length) return ende(gut + (o === richtig ? 1 : 0), [...fehler.current])
        setI(i + 1)
        setGewaehlt(null)
      },
      o === richtig ? 700 : 1600
    )
  }
  return (
    <Stack data-spiel={spiel} align="center">
      <Group justify="space-between" w="100%">
        <Text c="dimmed" size="sm">
          Runde {i + 1} von {fragen.length}
        </Text>
        <Badge color={farbe.a} variant="light" size="lg">
          {gut} richtig
        </Badge>
      </Group>
      {frageAnzeige(v)}
      <SimpleGrid cols={2} w="100%" maw={520} spacing="xs">
        {optionen.map((o) => {
          const zustand = gewaehlt ? (o === richtig ? 'richtig' : o === gewaehlt ? 'falsch' : undefined) : undefined
          return (
            <Button
              key={o}
              size="lg"
              radius="lg"
              variant="default"
              className="vt-option"
              data-zustand={zustand}
              style={{
                height: 'auto',
                minHeight: 56,
                whiteSpace: 'normal',
                ...(zustand === 'richtig'
                  ? { background: 'var(--vt-gut-bg)', color: 'var(--vt-gut-text)' }
                  : zustand === 'falsch'
                    ? { background: 'var(--vt-schlecht-bg)', color: 'var(--vt-schlecht-text)' }
                    : {})
              }}
              onClick={() => waehle(o)}
              data-option={o}
            >
              {o}
            </Button>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

/** Bilderrätsel: Bild zeigen, Wort in der Fremdsprache wählen */
export function BildRaetsel({ woerter, ende }: SpielProps): React.JSX.Element {
  const mitBild = useMemo(() => woerter.filter((w) => w.bild), [woerter])
  const fragen = useMemo(() => gemischt(mitBild).slice(0, RUNDEN), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Runden
      spiel="bildwort"
      fragen={fragen}
      optionenFuer={(v) => auswahlOptionen(v, mitBild, 'fs').map(spielform)}
      richtigFuer={(v) => spielform(v.term)}
      frageAnzeige={(v) => (
        <img
          src={v.bild}
          alt="Welches Wort passt?"
          style={{ width: 220, height: 220, objectFit: 'contain', borderRadius: 16, background: '#fff' }}
          data-bildraetsel-bild
        />
      )}
      ende={ende}
    />
  )
}

/** Hörquiz: Aufnahme abspielen, die richtige Schreibweise wählen */
export function HoerQuiz({ woerter, ende }: SpielProps): React.JSX.Element {
  const farbe = useVtFarbe()
  const mitTon = useMemo(() => woerter.filter(hatWortAufnahme), [woerter])
  const fragen = useMemo(() => gemischt(mitTon).slice(0, RUNDEN), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Runden
      spiel="hoeren"
      fragen={fragen}
      optionenFuer={(v) => auswahlOptionen(v, woerter, 'fs').map(spielform)}
      richtigFuer={(v) => spielform(v.term)}
      frageAnzeige={(v) => <HoerKnopf key={v.id} text={v.term} farbe={farbe.a} />}
      ende={ende}
    />
  )
}

/** Großer Knopf: spielt beim Erscheinen einmal ab, danach auf Tippen */
export function HoerKnopf({ text, farbe }: { text: string; farbe: string }): React.JSX.Element {
  useEffect(() => {
    aufnahmeSpielen(text)
  }, [text])
  return (
    <ActionIcon size={88} radius="xl" variant="light" color={farbe} onClick={() => aufnahmeSpielen(text)} aria-label="Noch einmal anhören" data-hoer-knopf>
      <IconVolume size={44} />
    </ActionIcon>
  )
}
