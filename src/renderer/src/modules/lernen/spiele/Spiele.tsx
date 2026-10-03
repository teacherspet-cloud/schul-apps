/**
 * Spielauswahl nach geschaffter Tagesrunde (03.10.2026, abgestimmt mit der Lehrkraft): acht Spiele mit
 * den schon gelernten Wörtern, je Spiel der eigene Rekord – keine Ranglisten. Der Karteikasten bleibt
 * unverändert; Wörter, die im Spiel danebengingen, landen auf „nochmal ansehen".
 */
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import {
  IconArrowLeft,
  IconBolt,
  IconBrain,
  IconCards,
  IconFlower,
  IconGridDots,
  IconLayoutGrid,
  IconPuzzle,
  IconTrophy,
  IconTypography,
  IconX
} from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import type { Vokabel, WortStand } from '@shared/vokabeltrainer'
import { istRekord, SPIELE, spielWoerter, type SpielId } from '@shared/vokabelSpiele'
import { senden } from '../../onlinetest/serverApi'
import { useVtFarbe } from '../vtFarben'
import { Blitzrunde, Memory, Satzpuzzle, Zuordnen } from './SpieleErkennen'
import { FallendeWoerter, Kreuzwort, Suchsel, Wortraten } from './SpieleSchreiben'

const SYMBOL: Record<SpielId, React.ReactNode> = {
  memory: <IconCards size={22} />,
  zuordnen: <IconLayoutGrid size={22} />,
  blitz: <IconBolt size={22} />,
  satz: <IconPuzzle size={22} />,
  wortraten: <IconFlower size={22} />,
  kreuzwort: <IconGridDots size={22} />,
  fallend: <IconTypography size={22} />,
  suchsel: <IconBrain size={22} />
}
const FARBE: Record<SpielId, string> = {
  memory: 'red',
  zuordnen: 'grape',
  blitz: 'yellow',
  satz: 'cyan',
  wortraten: 'pink',
  kreuzwort: 'indigo',
  fallend: 'teal',
  suchsel: 'lime'
}

export const SPIELE_CSS = `
.vt-memory { aspect-ratio: 4 / 3; border: 0; padding: 0; background: none; perspective: 700px; cursor: pointer; }
.vt-memory-innen { position: relative; display: block; width: 100%; height: 100%; transition: transform .4s; transform-style: preserve-3d; }
.vt-memory.auf .vt-memory-innen { transform: rotateY(180deg); }
.vt-memory-zu, .vt-memory-auf { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 14px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  font-weight: 700; padding: 6px; text-align: center; font-size: .95rem; }
.vt-memory-zu { background: linear-gradient(135deg, var(--vt-a-mittel), var(--vt-a-tief)); color: #fff; font-size: 1.6rem; box-shadow: 0 4px 0 var(--vt-a-dunkel); }
.vt-memory-auf { transform: rotateY(180deg); background: var(--vt-flaeche); border: 2px solid var(--vt-a-rand); color: var(--vt-tinte); }
.vt-memory-auf.de { background: var(--vt-a-hell); }
.vt-memory.gefunden .vt-memory-auf { background: var(--vt-gut-bg); border-color: var(--vt-gut-rand); color: var(--vt-gut-text); }
.vt-option[data-zustand="gewaehlt"] { border-color: var(--vt-a) !important; background: var(--vt-a-hell) !important; }
.vt-blume { position: relative; width: 90px; height: 90px; }
.vt-blatt { position: absolute; left: 36px; top: 30px; width: 18px; height: 30px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; background: #f472b6;
  transform-origin: 9px 15px; transition: opacity .4s, background .4s; }
.vt-blatt.weg { opacity: .12; background: #cbd5e1; }
.vt-bluete { position: absolute; left: 33px; top: 33px; width: 24px; height: 24px; border-radius: 50%; background: #facc15; box-shadow: 0 0 0 3px var(--vt-flaeche); }
.vt-raten-feld { display: inline-grid; place-items: center; width: 30px; height: 38px; border-bottom: 3px solid var(--vt-a-mittel); font-size: 1.4rem; font-weight: 800; color: var(--vt-a-dunkel); }
.vt-fallfeld { position: relative; height: 340px; border-radius: 20px; overflow: hidden; background: linear-gradient(180deg, var(--vt-a-hell), var(--vt-a-hell2)); border: 1px solid var(--vt-a-rand); }
.vt-fallfeld::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: repeating-linear-gradient(90deg, var(--vt-a-mittel) 0 12px, var(--vt-a-zart) 12px 24px); }
.vt-fallwort { position: absolute; padding: 4px 10px; border-radius: 999px; background: var(--vt-flaeche); border: 2px solid var(--vt-a-zart); font-weight: 700; color: var(--vt-a-dunkel); white-space: nowrap;
  box-shadow: 0 3px 8px rgba(234,88,12,0.15); }
.vt-such { aspect-ratio: 1; border: 1px solid var(--vt-a-rand2); border-radius: 6px; background: var(--vt-flaeche); font-weight: 700; color: var(--vt-tinte); cursor: pointer; padding: 0; font-size: .95rem; }
.vt-such.gefunden { background: var(--vt-gut-bg); border-color: var(--vt-gut-rand); color: var(--vt-gut-text); }
.vt-such.start { background: var(--vt-a-rand); border-color: var(--vt-a); }
.vt-such.daneben { background: var(--vt-schlecht-bg); border-color: var(--vt-schlecht-rand); }
`

export function Spielwahl({
  woerter,
  staende,
  sprache,
  rekorde,
  ansehen,
  listeId,
  aktualisieren,
  spielt
}: {
  woerter: Vokabel[]
  staende: Record<string, WortStand>
  sprache: string
  rekorde: Record<string, number>
  ansehen: string[]
  listeId: string
  aktualisieren: (r: { rekorde: Record<string, number>; ansehen: string[] }) => void
  /** Spiel läuft (Kasten ausblenden) */
  spielt?: (an: boolean) => void
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const [spiel, setSpielRoh] = useState<SpielId | null>(null)
  const setSpiel = (s: SpielId | null): void => {
    setSpielRoh(s)
    spielt?.(Boolean(s))
    if (s) window.scrollTo({ top: 0 })
  }
  const [runde, setRunde] = useState(0)
  const [ergebnis, setErgebnis] = useState<{ spiel: SpielId; wert: number; rekord: boolean; fehler: number } | null>(null)
  const pool = spielWoerter(woerter, staende)
  const mitSatz = pool.filter((w) => w.example && w.example.split(/\s+/).length >= 3).length
  const ende = useCallback(
    (wert: number, fehler: string[]) => {
      if (!spiel) return
      const id = spiel
      const rekord = istRekord(id, wert, rekorde[id])
      setErgebnis({ spiel: id, wert, rekord, fehler: fehler.length })
      setSpiel(null)
      void senden<{ rekorde: Record<string, number>; ansehen: string[] }>('/s/api/vokabeln/spiel', { id: listeId, spiel: id, wert, fehler }).then(
        aktualisieren,
        () => undefined
      )
    },
    [spiel, rekorde, listeId, aktualisieren]
  )
  const info = (id: SpielId) => SPIELE.find((s) => s.id === id)!

  if (spiel) {
    const props = { woerter: pool, sprache, ende }
    return (
      <Stack data-spiel-laeuft={spiel}>
        <style>{SPIELE_CSS}</style>
        <Group justify="space-between">
          <Button variant="subtle" color={farbe.a} leftSection={<IconX size={16} />} px={4} onClick={() => setSpiel(null)}>
            Beenden
          </Button>
          <Text fw={800}>{info(spiel).name}</Text>
        </Group>
        <div className="vt-buehne" key={runde}>
          {spiel === 'memory' ? (
            <Memory {...props} />
          ) : spiel === 'zuordnen' ? (
            <Zuordnen {...props} />
          ) : spiel === 'blitz' ? (
            <Blitzrunde {...props} />
          ) : spiel === 'satz' ? (
            <Satzpuzzle {...props} />
          ) : spiel === 'wortraten' ? (
            <Wortraten {...props} />
          ) : spiel === 'kreuzwort' ? (
            <Kreuzwort {...props} />
          ) : spiel === 'fallend' ? (
            <FallendeWoerter {...props} />
          ) : (
            <Suchsel {...props} />
          )}
        </div>
      </Stack>
    )
  }

  if (ergebnis) {
    const i = info(ergebnis.spiel)
    return (
      <Stack align="center" className="vt-rein" data-spiel-ergebnis>
        <ThemeIcon size={72} radius="xl" color={ergebnis.rekord ? 'yellow' : farbe.a} variant={ergebnis.rekord ? 'filled' : 'light'}>
          <IconTrophy size={40} />
        </ThemeIcon>
        <Title order={3}>{ergebnis.rekord ? 'Neuer Rekord!' : 'Geschafft!'}</Title>
        <Text size="lg">
          {i.name}: <b>{ergebnis.wert}</b> {i.einheit}
          {rekorde[ergebnis.spiel] !== undefined && !ergebnis.rekord ? ` · Rekord: ${rekorde[ergebnis.spiel]} ${i.einheit}` : ''}
        </Text>
        {ergebnis.fehler > 0 && (
          <Text size="sm" c="dimmed">
            {ergebnis.fehler} {ergebnis.fehler === 1 ? 'Wort steht' : 'Wörter stehen'} jetzt auf „nochmal ansehen“.
          </Text>
        )}
        <Group>
          <Button variant="default" radius="xl" leftSection={<IconArrowLeft size={16} />} onClick={() => setErgebnis(null)}>
            Andere Spiele
          </Button>
          <Button
            className="vt-los"
            radius="xl"
            onClick={() => {
              setSpiel(ergebnis.spiel)
              setErgebnis(null)
              setRunde((r) => r + 1)
            }}
            data-nochmal-spielen
          >
            Nochmal
          </Button>
        </Group>
      </Stack>
    )
  }

  return (
    <Stack data-spielwahl>
      <style>{SPIELE_CSS}</style>
      <div>
        <Title order={3} c="var(--vt-a-dunkel)">
          Spielen mit deinen Wörtern
        </Title>
        <Text size="sm" c="dimmed">
          Für heute ist alles geübt. Die Spiele verändern deinen Karteikasten nicht – sie machen die Wörter nur noch vertrauter.
        </Text>
      </div>
      {ansehen.length > 0 && (
        <Card radius="lg" withBorder style={{ borderColor: 'var(--vt-a-rand)', background: 'var(--vt-a-hell)' }} data-nochmal-ansehen>
          <Text fw={700} size="sm" mb={6}>
            Nochmal ansehen
          </Text>
          <Group gap={6}>
            {ansehen
              .map((id) => woerter.find((w) => w.id === id))
              .filter((w): w is Vokabel => Boolean(w))
              .map((w) => (
                <Badge key={w.id} variant="white" color={farbe.a} size="lg" tt="none">
                  {w.term} – {w.translation}
                </Badge>
              ))}
          </Group>
        </Card>
      )}
      {(['erkennen', 'schreiben'] as const).map((art) => (
        <div key={art}>
          <Text fw={700} size="sm" mb={6} c="var(--vt-a-dunkel)">
            {art === 'erkennen' ? 'Erkennen' : 'Schreiben'}
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            {SPIELE.filter((s) => s.art === art).map((s) => {
              const gesperrt = s.id === 'satz' ? mitSatz < 1 : pool.length < 4
              return (
                <Card
                  key={s.id}
                  radius="lg"
                  withBorder
                  padding="md"
                  component="button"
                  type="button"
                  disabled={gesperrt}
                  onClick={() => !gesperrt && setSpiel(s.id)}
                  style={{ textAlign: 'left', cursor: gesperrt ? 'not-allowed' : 'pointer', opacity: gesperrt ? 0.5 : 1, width: '100%' }}
                  data-spiel-wahl={s.id}
                >
                  <Group wrap="nowrap" align="flex-start">
                    <ThemeIcon size={44} radius="md" variant="light" color={FARBE[s.id]}>
                      {SYMBOL[s.id]}
                    </ThemeIcon>
                    <div style={{ minWidth: 0 }}>
                      <Text fw={700}>{s.name}</Text>
                      <Text size="xs" c="dimmed">
                        {gesperrt ? (s.id === 'satz' ? 'Braucht Wörter mit Beispielsatz.' : 'Braucht mindestens vier Wörter.') : s.beschreibung}
                      </Text>
                      {rekorde[s.id] !== undefined && (
                        <Badge mt={6} size="sm" variant="light" color="yellow" leftSection={<IconTrophy size={10} />}>
                          Rekord: {rekorde[s.id]} {s.einheit}
                        </Badge>
                      )}
                    </div>
                  </Group>
                </Card>
              )
            })}
          </SimpleGrid>
        </div>
      ))}
    </Stack>
  )
}
