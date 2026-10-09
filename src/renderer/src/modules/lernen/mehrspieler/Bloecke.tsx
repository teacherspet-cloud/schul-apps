/**
 * Bausteine der Spielsicht (08.10.2026): Der Server beschreibt jede Sicht mit wenigen Bausteinen (shared/mehrspieler/
 * kern.ts `Block`), diese Datei zeichnet sie – für alle Mehrspieler-Spiele gleich. Groß und antippbar (iPad), Schreiben
 * nur, wo die Schwierigkeit es verlangt.
 */
import { Alert, Badge, Button, Card, Group, Image, Progress, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconCheck, IconClock, IconVolume } from '@tabler/icons-react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { spielText, type TextSchluessel } from '@shared/spielSprache'
import type { Block, Kachel } from '@shared/mehrspieler/kern'
import { kannSprechen, sprich } from '../VokabelTrainer'

type Senden = (aktion: string, wert?: unknown) => void

/** Beschriftungen der Bausteine in der Zielsprache des Kurses (09.10.2026); ohne Angabe Deutsch */
const Sprache = createContext<{ sprache: string; jahrgang: number | null }>({ sprache: 'de', jahrgang: null })
function useT(): (k: TextSchluessel, ...w: (string | number)[]) => string {
  const { sprache, jahrgang } = useContext(Sprache)
  return (k, ...w) => spielText(sprache, jahrgang, k, ...w)
}

const TON_FARBE: Record<string, string> = { gut: 'teal', schlecht: 'red', info: 'blue', warn: 'orange', leise: 'gray' }
const KACHEL_FARBE: Record<string, string> = {
  gut: 'var(--mantine-color-teal-light)',
  schlecht: 'var(--mantine-color-red-light)',
  markiert: 'var(--mantine-color-teal-filled)',
  offen: 'var(--mantine-color-blue-light)',
  treffer: 'var(--mantine-color-red-filled)',
  wasser: 'var(--mantine-color-blue-light)',
  schiff: 'var(--mantine-color-gray-5)'
}

function Uhr({ bis, text }: { bis: number; text?: string }): React.JSX.Element {
  const [jetzt, setJetzt] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setJetzt(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.ceil((bis - jetzt) / 1000))
  return (
    <Group gap={6} data-mehr-uhr>
      <IconClock size={16} />
      <Text size="sm" fw={700} c={s <= 10 ? 'red' : undefined}>
        {text ? `${text}: ` : ''}
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </Text>
    </Group>
  )
}

function Vorlesen({ text, sprache }: { text: string; sprache: string }): React.JSX.Element {
  const t = useT()
  const zuletzt = useRef('')
  useEffect(() => {
    if (zuletzt.current === text) return
    zuletzt.current = text
    if (kannSprechen(sprache)) sprich(text, sprache)
  }, [text, sprache])
  return (
    <Button variant="light" leftSection={<IconVolume size={18} />} onClick={() => sprich(text, sprache)} data-mehr-vorlesen>
      {t('uiNochmalHoeren')}
    </Button>
  )
}

function Frage({ b, senden }: { b: Extract<Block, { typ: 'frage' }>; senden: Senden }): React.JSX.Element {
  const t = useT()
  const [text, setText] = useState('')
  useEffect(() => setText(''), [b.frage])
  return (
    <Card withBorder radius="lg" padding="md" data-mehr-frage>
      <Text fw={800} size="xl" ta="center" data-mehr-frage-text>
        {b.frage}
      </Text>
      {b.zusatz && (
        <Text size="sm" c="dimmed" ta="center" mb="sm">
          {b.zusatz}
        </Text>
      )}
      {b.tippen ? (
        <Group mt="sm" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            size="lg"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && text.trim() && (senden(b.aktion, text), setText(''))}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoCapitalize="off"
            disabled={b.gesperrt}
            placeholder={t('uiAntwortSchreiben')}
            data-mehr-eingabe
          />
          <Button size="lg" disabled={b.gesperrt || !text.trim()} onClick={() => (senden(b.aktion, text), setText(''))} data-mehr-senden>
            OK
          </Button>
        </Group>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mt="sm">
          {b.optionen.map((o) => (
            <Button key={o} size="lg" radius="lg" variant="default" disabled={b.gesperrt} onClick={() => senden(b.aktion, o)} styles={{ label: { whiteSpace: 'normal' } }} h="auto" mih={56} data-mehr-option={o}>
              {o}
            </Button>
          ))}
          {!b.optionen.length && (
            <Text size="sm" c="dimmed">
              {t('uiKeineAntwort')}
            </Text>
          )}
        </SimpleGrid>
      )}
    </Card>
  )
}

function Kacheln({ b, senden }: { b: Extract<Block, { typ: 'kacheln' }>; senden: Senden }): React.JSX.Element {
  const t = useT()
  const [wahl, setWahl] = useState<string[]>([])
  const mehr = Boolean(b.mehrfach && b.senden)
  const klick = (k: Kachel): void => {
    if (mehr) return setWahl((w) => (w.includes(k.id) ? w.filter((x) => x !== k.id) : w.length < b.mehrfach! ? [...w, k.id] : w))
    if (b.aktion && k.status !== 'aus') senden(b.aktion, k.id)
  }
  const tippbar = Boolean(b.aktion || mehr)
  return (
    <Stack gap={6} data-mehr-kacheln={b.aktion ?? b.senden ?? ''}>
      {b.titel && (
        <Text size="sm" fw={700}>
          {b.titel}
        </Text>
      )}
      <SimpleGrid cols={b.spalten ? b.spalten : { base: 2, xs: 3 }} spacing={b.spalten && b.spalten > 4 ? 4 : 'xs'}>
        {b.kacheln.map((k) => {
          const gewaehlt = wahl.includes(k.id)
          const inhalt = (
            <Card
              withBorder
              radius="md"
              padding={b.spalten && b.spalten > 4 ? 4 : 'xs'}
              style={{
                background: gewaehlt ? 'var(--mantine-color-blue-light)' : k.status ? KACHEL_FARBE[k.status] : undefined,
                opacity: k.status === 'aus' ? 0.45 : 1,
                minHeight: b.spalten && b.spalten > 4 ? 36 : 48,
                display: 'grid',
                placeItems: 'center',
                textAlign: 'center',
                color: k.status === 'markiert' || k.status === 'treffer' ? 'white' : undefined
              }}
            >
              {k.bild && <Image src={k.bild} alt="" w={64} h={64} fit="contain" />}
              {k.text && (
                <Text fw={600} size={b.spalten && b.spalten > 5 ? 'xs' : 'sm'}>
                  {k.text}
                </Text>
              )}
              {k.klein && (
                <Text size="xs" c="dimmed">
                  {k.klein}
                </Text>
              )}
              {gewaehlt && <IconCheck size={14} />}
            </Card>
          )
          return tippbar ? (
            <UnstyledButton key={k.id} onClick={() => klick(k)} aria-pressed={gewaehlt} data-mehr-kachel={k.id} data-status={k.status}>
              {inhalt}
            </UnstyledButton>
          ) : (
            <div key={k.id} data-mehr-kachel-fest={k.id} data-status={k.status}>
              {inhalt}
            </div>
          )
        })}
      </SimpleGrid>
      {mehr && (
        <Button disabled={!wahl.length} onClick={() => (senden(b.senden!, wahl), setWahl([]))} data-mehr-kacheln-senden>
          {t('uiAbschickenN', wahl.length)}
        </Button>
      )}
    </Stack>
  )
}

/** Codewort (Fluchtraum, 09.10.2026): freigeschaltete Buchstaben bzw. gefundene Buchstaben ohne Stelle, Wort eintippen */
function Codewort({ b, senden }: { b: Extract<Block, { typ: 'codewort' }>; senden: Senden }): React.JSX.Element {
  const [wort, setWort] = useState('')
  const schicken = (): void => {
    if (!wort.trim() || b.gesperrt) return
    senden(b.aktion, wort.trim())
    setWort('')
  }
  return (
    <Card withBorder radius="lg" padding="sm" data-mehr-codewort={b.felder.length}>
      <Text size="sm" fw={600} ta="center">
        {b.titel}
      </Text>
      <Group gap={6} justify="center" mt={6} wrap="wrap">
        {b.felder.map((f, i) => (
          <Card key={i} withBorder radius="md" padding={0} w={36} h={44} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-mehr-codefeld={f ?? ''}>
            <Text fw={800} size="xl">
              {f ?? '·'}
            </Text>
          </Card>
        ))}
      </Group>
      {b.buchstaben && b.buchstaben.length > 0 && (
        <Group gap={6} justify="center" mt={8} data-mehr-codebuchstaben>
          {b.buchstaben.map((c, i) => (
            <Badge key={i} size="xl" variant="light" color="grape" tt="none">
              {c}
            </Badge>
          ))}
        </Group>
      )}
      <Group mt="xs" wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          size="md"
          value={wort}
          onChange={(e) => setWort(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && schicken()}
          placeholder={b.platzhalter}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={b.gesperrt}
          data-mehr-codewort-eingabe
        />
        <Button size="md" disabled={b.gesperrt || !wort.trim()} onClick={schicken} data-mehr-codewort-senden>
          {b.knopf}
        </Button>
      </Group>
    </Card>
  )
}

function Eingaben({ b, senden }: { b: Extract<Block, { typ: 'eingaben' }>; senden: Senden }): React.JSX.Element {
  const t = useT()
  const [werte, setWerte] = useState<Record<string, string>>({})
  const schluessel = b.felder.map((f) => f.id).join()
  useEffect(() => setWerte({}), [schluessel])
  return (
    <Stack gap="xs" data-mehr-eingaben>
      {b.felder.map((f) => (
        <TextInput
          key={f.id}
          label={f.titel}
          value={werte[f.id] ?? ''}
          onChange={(e) => {
            const v = e.currentTarget.value
            setWerte((w) => ({ ...w, [f.id]: v }))
          }}
          disabled={b.gesperrt}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoCapitalize="off"
          data-mehr-feld={f.id}
        />
      ))}
      <Button disabled={b.gesperrt} onClick={() => senden(b.aktion, werte)} data-mehr-eingaben-senden>
        {t('uiAbschicken')}
      </Button>
    </Stack>
  )
}

export function Bloecke({
  bloecke,
  senden,
  sprache = 'de',
  jahrgang = null
}: {
  bloecke: Block[]
  senden: Senden
  sprache?: string
  jahrgang?: number | null
}): React.JSX.Element {
  return (
    <Sprache.Provider value={{ sprache, jahrgang }}>
      <Stack gap="sm" data-mehr-bloecke>
        {bloecke.map((b, i) => {
          switch (b.typ) {
            case 'titel':
              return (
                <Text key={i} fw={800} size="lg">
                  {b.text}
                </Text>
              )
            case 'text':
              return b.ton && b.ton !== 'leise' ? (
                <Alert key={i} color={TON_FARBE[b.ton]} radius="md" py={6} data-mehr-text={b.ton}>
                  <Text size={b.gross ? 'lg' : 'sm'} fw={b.gross ? 700 : 500}>
                    {b.text}
                  </Text>
                </Alert>
              ) : (
                <Text key={i} size={b.gross ? 'xl' : 'sm'} fw={b.gross ? 800 : 400} c={b.ton === 'leise' ? 'dimmed' : undefined} ta={b.gross ? 'center' : undefined} data-mehr-text={b.ton ?? ''}>
                  {b.text}
                </Text>
              )
            case 'frage':
              return <Frage key={i} b={b} senden={senden} />
            case 'kacheln':
              return <Kacheln key={i} b={b} senden={senden} />
            case 'reihe':
              return (
                <div key={i} data-mehr-reihe>
                  {b.titel && (
                    <Text size="sm" fw={700} mb={4}>
                      {b.titel}
                    </Text>
                  )}
                  <Group gap={6}>
                    {b.teile.map((t, k) => (
                      <Badge key={k} size="lg" radius="sm" variant="light" tt="none">
                        {t}
                      </Badge>
                    ))}
                    {Array.from({ length: b.leer ?? 0 }, (_, k) => (
                      <Badge key={`l${k}`} size="lg" radius="sm" variant="outline" color="gray">
                        …
                      </Badge>
                    ))}
                  </Group>
                </div>
              )
            case 'seil': {
              const p = ((b.wert + b.ziel) / (2 * b.ziel)) * 100
              return (
                <div key={i} data-mehr-seil={b.wert}>
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>
                      {b.links}
                    </Text>
                    <Text size="sm" fw={700}>
                      {b.rechts}
                    </Text>
                  </Group>
                  <div style={{ position: 'relative', height: 28, borderRadius: 14, background: 'var(--mantine-color-gray-light)' }}>
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'var(--mantine-color-gray-5)' }} />
                    <div style={{ position: 'absolute', left: `calc(${p}% - 14px)`, top: 0, width: 28, height: 28, borderRadius: 14, background: 'var(--mantine-color-orange-filled)', transition: 'left .3s' }} />
                  </div>
                </div>
              )
            }
            case 'fortschritt':
              return (
                <div key={i}>
                  <Text size="sm" fw={600}>
                    {b.titel}
                  </Text>
                  <Progress value={(b.wert / Math.max(1, b.max)) * 100} color={TON_FARBE[b.ton ?? 'info']} radius="xl" size="lg" />
                </div>
              )
            case 'punkte':
              return (
                <Group key={i} gap="xs" data-mehr-punkte>
                  {b.eintraege.map((e, k) => (
                    <Badge key={k} size="lg" variant={e.ich ? 'filled' : 'light'} tt="none">
                      {e.name}: {e.wert}
                    </Badge>
                  ))}
                </Group>
              )
            case 'uhr':
              return <Uhr key={i} bis={b.bis} text={b.text} />
            case 'codewort':
              return <Codewort key={i} b={b} senden={senden} />
            case 'vorlesen':
              return <Vorlesen key={i} text={b.text} sprache={b.sprache} />
            case 'knoepfe':
              return (
                <Group key={i} grow data-mehr-knoepfe>
                  {b.knoepfe.map((k, n) => (
                    <Button key={n} size="lg" color={k.farbe} variant={k.farbe ? 'filled' : 'default'} disabled={k.gesperrt} onClick={() => senden(k.aktion, k.wert)} data-mehr-knopf={k.aktion} styles={{ label: { whiteSpace: 'normal' } }} h="auto" mih={52}>
                      {k.text}
                    </Button>
                  ))}
                </Group>
              )
            case 'eingaben':
              return <Eingaben key={i} b={b} senden={senden} />
            case 'turm':
              return (
                <Stack key={i} gap={2} align="center" data-mehr-turm={b.hoehe} style={{ transform: b.wackeln ? `rotate(${b.wackeln % 2 ? 2 : -2}deg)` : undefined }}>
                  {Array.from({ length: b.ziel }, (_, k) => b.ziel - 1 - k).map((k) => (
                    <div key={k} style={{ width: 120, height: 14, borderRadius: 3, background: k < b.hoehe ? 'var(--mantine-color-orange-filled)' : 'var(--mantine-color-gray-light)' }} />
                  ))}
                </Stack>
              )
          }
          return null
        })}
      </Stack>
    </Sprache.Provider>
  )
}
