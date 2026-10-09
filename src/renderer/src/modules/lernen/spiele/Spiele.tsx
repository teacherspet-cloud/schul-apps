/**
 * Spielauswahl nach geschaffter Tagesrunde (03.10.2026, abgestimmt mit der Lehrkraft): acht Spiele mit
 * den schon gelernten Wörtern, je Spiel der eigene Rekord – keine Ranglisten. Wörter, die im Spiel danebengingen,
 * landen auf „nochmal ansehen" und (seit 06.10.2026) wackelig im Kasten; Treffer befördern nichts.
 */
import { Badge, Button, Card, Group, Modal, SimpleGrid, Stack, Table, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import {
  IconArrowLeft,
  IconBolt,
  IconBrain,
  IconCards,
  IconEar,
  IconFlower,
  IconGridDots,
  IconLayoutGrid,
  IconMessage2,
  IconPhoto,
  IconPuzzle,
  IconChevronDown,
  IconTrophy,
  IconTypography,
  IconX
} from '@tabler/icons-react'
import { useCallback, useMemo, useState } from 'react'
import type { Vokabel, WortStand } from '@shared/vokabeltrainer'
import { istRekord, SPIELE, spielWoerter, VERBSPIELE, type SpielId } from '@shared/vokabelSpiele'
import { einzelBeschreibung, spielName, spielText } from '@shared/spielSprache'
import { senden } from '../../onlinetest/serverApi'
import { useVtFarbe } from '../vtFarben'
import { Blitzrunde, Memory, Satzpuzzle, Zuordnen } from './SpieleErkennen'
import { FallendeWoerter, Kreuzwort, Suchsel, Wortraten } from './SpieleSchreiben'
import { BildRaetsel, hatWortAufnahme, HoerQuiz } from './SpieleMedien'
import { HoerenSchreiben, mitSatzLuecke, SatzLuecke, Wortduell } from './SpieleNeu'
import { BildAufdecken, BildMemory, BuchstabenPuzzle, HoerBingo, HoerMemory, RichtigGehoert, WasFehlt, WortBild } from './SpieleHoerenBild'
import { BildVerb, FormenBlitz, MusterSortieren, StammformenTrio, type VerbDaten } from './SpieleVerben'
import { kannSprechen } from '../VokabelTrainer'
import { useBlaettern } from '../regal/blaettern'
import { FokusRahmen } from '../fokus/FokusRahmen'
import { hatSatzAufnahme } from '../medienCache'
import { fuerServer, ton, useDarstellung } from '../../onlinetest/schuelerDarstellung'
import ZusammenSpielen, { EinladungsCode } from '../mehrspieler/ZusammenSpielen'

/** Spiele mit ablaufender Uhr oder Bestzeit – aus, wenn „Spiele mit Zeitdruck“ abgeschaltet ist (06.10.2026) */
export const MIT_ZEITDRUCK: readonly SpielId[] = ['zuordnen', 'blitz', 'fallend', 'duell', 'richtiggehoert', 'aufdecken', 'formenblitz']

const SYMBOL: Record<SpielId, React.ReactNode> = {
  memory: <IconCards size={22} />,
  zuordnen: <IconLayoutGrid size={22} />,
  blitz: <IconBolt size={22} />,
  satz: <IconPuzzle size={22} />,
  wortraten: <IconFlower size={22} />,
  kreuzwort: <IconGridDots size={22} />,
  fallend: <IconTypography size={22} />,
  suchsel: <IconBrain size={22} />,
  bildwort: <IconPhoto size={22} />,
  hoeren: <IconEar size={22} />,
  satzhoeren: <IconMessage2 size={22} />,
  diktat: <IconEar size={22} />,
  satzluecke: <IconMessage2 size={22} />,
  duell: <IconBolt size={22} />,
  hoermemory: <IconCards size={22} />,
  richtiggehoert: <IconEar size={22} />,
  buchstaben: <IconTypography size={22} />,
  hoerbingo: <IconGridDots size={22} />,
  bildmemory: <IconCards size={22} />,
  wasfehlt: <IconPhoto size={22} />,
  aufdecken: <IconPhoto size={22} />,
  wortbild: <IconPhoto size={22} />,
  verbtrio: <IconCards size={22} />,
  formenblitz: <IconBolt size={22} />,
  bildverb: <IconPhoto size={22} />,
  muster: <IconLayoutGrid size={22} />
}
/** KI-Bilder der Spiele (03.10.2026, über die Bild-KI der Exe erzeugt); ohne Bild das Symbol */
const BILDER = import.meta.glob<string>('../../../assets/programme/spiel-*.webp', { eager: true, import: 'default' })
const spielBild = (id: SpielId): string | undefined => BILDER[`../../../assets/programme/spiel-${id}.webp`]

const FARBE: Record<SpielId, string> = {
  memory: 'red',
  zuordnen: 'grape',
  blitz: 'yellow',
  satz: 'cyan',
  wortraten: 'pink',
  kreuzwort: 'indigo',
  fallend: 'teal',
  suchsel: 'lime',
  bildwort: 'orange',
  hoeren: 'blue',
  satzhoeren: 'violet',
  diktat: 'blue',
  satzluecke: 'cyan',
  duell: 'orange',
  hoermemory: 'blue',
  richtiggehoert: 'teal',
  buchstaben: 'indigo',
  hoerbingo: 'grape',
  bildmemory: 'orange',
  wasfehlt: 'pink',
  aufdecken: 'yellow',
  wortbild: 'lime',
  verbtrio: 'red',
  formenblitz: 'yellow',
  bildverb: 'orange',
  muster: 'cyan'
}

export const SPIELE_CSS = `
.vt-memory { aspect-ratio: 4 / 3; border: 0; padding: 0; background: none; perspective: 700px; cursor: pointer; }
.vt-memory-innen { position: relative; display: block; width: 100%; height: 100%; transition: transform .4s; transform-style: preserve-3d; }
.vt-memory.auf .vt-memory-innen { transform: rotateY(180deg); }
.vt-memory-zu, .vt-memory-auf { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 14px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  font-weight: 700; padding: 6px; text-align: center; font-size: .95rem; }
.vt-memory-zu { background: linear-gradient(135deg, var(--vt-a-mittel), var(--vt-a-tief)); color: var(--vt-auf-a); font-size: 1.6rem; box-shadow: 0 4px 0 var(--vt-a-dunkel); }
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
/* Weniger Bewegung (Einstellung der Lernenden „ruhig" bzw. des Geräts, 07.10.2026): Karten drehen nicht, nichts gleitet */
html.sa-ruhig [data-spiel] *, html.sa-ruhig [data-verbspiel] *, html.sa-ruhig .vt-memory-innen { transition: none !important; animation: none !important; }
@media (prefers-reduced-motion: reduce) { [data-spiel] *, [data-verbspiel] *, .vt-memory-innen { transition: none !important; animation: none !important; } }
`

/**
 * Bereiche der Spielauswahl (08.10.2026, Wunsch der Lehrkraft: „durch die Masse sehr unübersichtlich"): nach der Art
 * des Spielens statt nur Erkennen/Schreiben, auf- und zuklappbar; die Wahl der Lernenden hängt am Konto.
 */
const GRUPPEN: { id: string; name: string; text: string; offen: boolean; spiele: SpielId[] }[] = [
  {
    id: 'paare',
    name: 'Paare finden',
    text: 'Memory und Zuordnen – Wort, Bedeutung, Ton oder Bild',
    offen: true,
    spiele: ['memory', 'zuordnen', 'hoermemory', 'bildmemory']
  },
  {
    id: 'schnell',
    name: 'Schnell reagieren',
    text: 'Gegen die Uhr oder die eigene Bestzeit',
    offen: true,
    spiele: ['blitz', 'duell', 'fallend', 'richtiggehoert']
  },
  {
    id: 'hoeren',
    name: 'Hören',
    text: 'Hinhören, erkennen, aufschreiben',
    offen: false,
    spiele: ['hoeren', 'buchstaben', 'hoerbingo', 'satzhoeren', 'diktat']
  },
  { id: 'bilder', name: 'Bilder', text: 'Zum Bild das Wort – und umgekehrt', offen: false, spiele: ['bildwort', 'wortbild', 'wasfehlt', 'aufdecken'] },
  { id: 'raetseln', name: 'Rätseln und schreiben', text: 'Buchstabe für Buchstabe', offen: false, spiele: ['wortraten', 'kreuzwort', 'suchsel'] },
  { id: 'saetze', name: 'Sätze', text: 'Wörter im Zusammenhang', offen: false, spiele: ['satz', 'satzluecke'] },
  { id: 'verben', name: 'Unregelmäßige Verben', text: 'Stammformen üben', offen: false, spiele: ['verbtrio', 'formenblitz', 'bildverb', 'muster'] }
]

/** Wörter, die in Spielen danebengingen: ein kleiner Knopf, die Liste erst auf Nachfrage */
function NochmalAnsehen({ ids, woerter }: { ids: string[]; woerter: Vokabel[] }): React.JSX.Element | null {
  const farbe = useVtFarbe()
  const [offen, setOffen] = useState(false)
  // Neueste zuerst, jedes Wort einmal
  const liste = [...new Set([...ids].reverse())].map((id) => woerter.find((w) => w.id === id)).filter((w): w is Vokabel => Boolean(w))
  if (!liste.length) return null
  return (
    <Card radius="lg" withBorder padding="sm" style={{ borderColor: 'var(--vt-a-rand)', background: 'var(--vt-a-hell)' }} data-nochmal-ansehen>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">Diese Wörter gingen in Spielen daneben – sie kommen im Karteikasten bald wieder dran.</Text>
        <Button size="xs" radius="xl" variant="white" color={farbe.a} onClick={() => setOffen(true)} style={{ flex: 'none' }} data-nochmal-knopf>
          Wörter zum Wiederholen ({liste.length})
        </Button>
      </Group>
      <Modal opened={offen} onClose={() => setOffen(false)} title={`Wörter zum Wiederholen (${liste.length})`} size="md">
        <Text size="sm" c="dimmed" mb="sm">
          Schau sie dir in Ruhe an. Die neuesten stehen oben.
        </Text>
        <Table striped data-nochmal-liste>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Wort</Table.Th>
              <Table.Th>Bedeutung</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {liste.map((w) => (
              <Table.Tr key={w.id}>
                <Table.Td fw={700}>{w.term}</Table.Td>
                <Table.Td>{w.translation}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Modal>
    </Card>
  )
}

export function Spielwahl({
  woerter,
  staende,
  sprache,
  rekorde,
  ansehen,
  listeId,
  aktualisieren,
  spielt,
  verben,
  nurVerben,
  vorDerRunde,
  klasse
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
  /** Unregelmäßige Verben der Liste (07.10.2026) – dann gibt es die Verbspiele */
  verben?: VerbDaten
  /** Nur die Verbspiele (Grammatiktraining „Unregelmäßige Verben") */
  nurVerben?: boolean
  /** Von der Lehrkraft für heute freigeschaltet, die Tagesrunde steht noch aus (08.10.2026) */
  vorDerRunde?: boolean
  /** Klasse der Lernenden (Tempo der Spiele) */
  klasse?: number | null
}): React.JSX.Element {
  const farbe = useVtFarbe()
  // Einstellungen der Lernenden: Spiele an/aus, Zeitdruck an/aus
  const { d: wahl, setze: setzeWahl } = useDarstellung()
  const [spiel, setSpielRoh] = useState<SpielId | null>(null)
  const zeigeSpiel = (s: SpielId | null): void => {
    setSpielRoh(s)
    spielt?.(Boolean(s))
    if (s && !blatt) window.scrollTo({ top: 0 })
  }
  // Im Fachordner (09.10.2026, regal/blaettern.tsx): das Spiel als nächste Seite, Beenden/Ende blättert zurück
  const blatt = useBlaettern()
  const setSpiel = (s: SpielId | null): void => {
    if (!blatt) return zeigeSpiel(s)
    if (s) blatt.oeffne('spiel', () => zeigeSpiel(s), () => zeigeSpiel(null))
    else blatt.zurueck(() => zeigeSpiel(null))
  }
  const [runde, setRunde] = useState(0)
  const [ergebnis, setErgebnis] = useState<{ spiel: SpielId; wert: number; rekord: boolean; fehler: number } | null>(null)
  // Je Spielstart einmal gemischt (06.10.2026: Mischung aus fälligen, wackeligen und sicheren Wörtern ist zufällig)
  const pool = useMemo(() => spielWoerter(woerter, staende), [woerter, staende, spiel, runde]) // eslint-disable-line react-hooks/exhaustive-deps
  const mitSatz = pool.filter((w) => w.example && w.example.split(/\s+/).length >= 3).length
  // Medienbank (05.10.2026): Bilder und Aufnahmen – aus allen Wörtern der Liste, nicht nur den gelernten
  const mitBild = woerter.filter((w) => w.bild).length
  const mitTon = woerter.filter(hatWortAufnahme).length
  // Hörspiele (07.10.2026): Aufnahme ODER Stimme des Geräts
  const geraet = kannSprechen(sprache)
  const hoerbar = geraet ? woerter.length : mitTon
  const verbZahl = verben?.karten.length ?? 0
  const verbBilder = verben ? verben.karten.filter((k) => verben.bild(k)).length : 0
  const mitSatzTon = woerter.filter((w) => w.example && w.example.split(/\s+/).length >= 3 && hatSatzAufnahme(w.example)).length
  const ende = useCallback(
    (wert: number, fehler: string[]) => {
      if (!spiel) return
      const id = spiel
      const rekord = istRekord(id, wert, rekorde[id])
      setErgebnis({ spiel: id, wert, rekord, fehler: fehler.length })
      ton('geschafft')
      setSpiel(null)
      void senden<{ rekorde: Record<string, number>; ansehen: string[] }>('/s/api/vokabeln/spiel', { id: listeId, spiel: id, wert, fehler }).then(
        aktualisieren,
        () => undefined
      )
    },
    [spiel, rekorde, listeId, aktualisieren]
  )
  const info = (id: SpielId) => SPIELE.find((s) => s.id === id)!

  if (!wahl.spiele && !spiel && !ergebnis)
    return (
      <Text size="sm" c="dimmed" ta="center" data-spiele-aus>
        Spiele sind in deinen Einstellungen ausgeschaltet.
      </Text>
    )

  if (spiel) {
    const props = { woerter: pool, sprache, ende, staende, klasse }
    // Hörspiele ohne Gerätestimme nur mit Wörtern, die eine Aufnahme haben
    const hoerWoerter = geraet ? woerter : woerter.filter(hatWortAufnahme)
    return (
      // Vollbild beim Lernen (09.10.2026): das laufende Spiel füllt den Bildschirm; am Spielende zurück zur vorigen Ansicht
      <FokusRahmen name="spiel" onEnde={() => setSpiel(null)}>
      <Stack data-spiel-laeuft={spiel}>
        <style>{SPIELE_CSS}</style>
        <Group justify="space-between">
          <Button variant="subtle" color={farbe.a} leftSection={<IconX size={16} />} px={4} onClick={() => setSpiel(null)} data-eigenes-beenden>
            Beenden
          </Button>
          <Text fw={800}>{spielName('vok', spiel, sprache, info(spiel).name)}</Text>
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
          ) : spiel === 'bildwort' ? (
            <BildRaetsel {...props} woerter={woerter} />
          ) : spiel === 'hoeren' ? (
            <HoerQuiz {...props} woerter={woerter} />
          ) : spiel === 'satzhoeren' ? (
            <Satzpuzzle {...props} woerter={woerter} hoeren />
          ) : spiel === 'diktat' ? (
            <HoerenSchreiben {...props} />
          ) : spiel === 'satzluecke' ? (
            <SatzLuecke {...props} woerter={mitSatzLuecke(pool).length >= 3 ? pool : woerter} />
          ) : spiel === 'duell' ? (
            <Wortduell {...props} />
          ) : spiel === 'hoermemory' ? (
            <HoerMemory {...props} woerter={hoerWoerter} />
          ) : spiel === 'richtiggehoert' ? (
            <RichtigGehoert {...props} woerter={hoerWoerter} />
          ) : spiel === 'buchstaben' ? (
            <BuchstabenPuzzle {...props} woerter={hoerWoerter} />
          ) : spiel === 'hoerbingo' ? (
            <HoerBingo {...props} woerter={hoerWoerter} />
          ) : spiel === 'bildmemory' ? (
            <BildMemory {...props} woerter={woerter} />
          ) : spiel === 'wasfehlt' ? (
            <WasFehlt {...props} woerter={woerter} />
          ) : spiel === 'aufdecken' ? (
            <BildAufdecken {...props} woerter={woerter} />
          ) : spiel === 'wortbild' ? (
            <WortBild {...props} woerter={woerter} />
          ) : spiel === 'verbtrio' && verben ? (
            <StammformenTrio verben={verben} ende={ende} />
          ) : spiel === 'formenblitz' && verben ? (
            <FormenBlitz verben={verben} ende={ende} />
          ) : spiel === 'bildverb' && verben ? (
            <BildVerb verben={verben} ende={ende} />
          ) : spiel === 'muster' && verben ? (
            <MusterSortieren verben={verben} ende={ende} />
          ) : (
            <Suchsel {...props} />
          )}
        </div>
      </Stack>
      </FokusRahmen>
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
          {spielName('vok', ergebnis.spiel, sprache, i.name)}: <b>{ergebnis.wert}</b> {i.einheit}
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

  // Eine Karte je Spiel (null = ausgeblendet, weil Bilder, Ton oder Verben fehlen)
  const karteFuer = (s: (typeof SPIELE)[number]): React.JSX.Element | null => {
    // Ohne Verben keine Verbspiele; Verbspiele nach ihren Daten (07.10.2026)
    if (VERBSPIELE.includes(s.id) && !verbZahl) return null
    const gesperrtNeu =
      s.id === 'hoermemory'
        ? hoerbar < 6
        : s.id === 'richtiggehoert' || s.id === 'buchstaben'
        ? hoerbar < 4
        : s.id === 'hoerbingo'
        ? hoerbar < 9
        : s.id === 'bildmemory' || s.id === 'wasfehlt'
        ? mitBild < 6
        : s.id === 'aufdecken' || s.id === 'wortbild'
        ? mitBild < 4
        : s.id === 'verbtrio' || s.id === 'muster'
        ? verbZahl < 4 || (s.id === 'muster' && !verben?.mitMuster)
        : s.id === 'formenblitz'
        ? verbZahl < 4 || !(geraet || verben?.mitTon)
        : s.id === 'bildverb'
        ? verbBilder < 4
        : s.id === 'diktat'
        ? hoerbar < 4
        : undefined
    // Medienspiele erst zeigen, wenn es Bilder bzw. Ton gibt
    if (gesperrtNeu) return null
    const gesperrt =
      gesperrtNeu === false
        ? pool.length < 4 && !VERBSPIELE.includes(s.id)
        : s.id === 'satzluecke'
        ? mitSatzLuecke(woerter).length < 3
        : s.id === 'satz'
        ? mitSatz < 1
        : s.id === 'bildwort'
        ? mitBild < 4
        : s.id === 'hoeren'
        ? mitTon < 4 || woerter.length < 4
        : s.id === 'satzhoeren'
        ? mitSatzTon < 1
        : pool.length < 4
    // Spiele der Medienbank erst zeigen, wenn es Bilder bzw. Aufnahmen gibt
    if (gesperrt && (s.id === 'bildwort' || s.id === 'hoeren' || s.id === 'satzhoeren')) return null
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
          {spielBild(s.id) ? (
            <img src={spielBild(s.id)} alt="" width={56} height={56} style={{ flex: 'none', borderRadius: 14 }} data-spiel-bild={s.id} />
          ) : (
            <ThemeIcon size={44} radius="md" variant="light" color={FARBE[s.id]}>
              {SYMBOL[s.id]}
            </ThemeIcon>
          )}
          <div style={{ minWidth: 0 }}>
            <Text fw={700}>{spielName('vok', s.id, sprache, s.name)}</Text>
            <Text size="xs" c="dimmed">
              {gesperrt ? spielText(sprache, null, s.id === 'satz' || s.id === 'satzluecke' ? 'brauchtBeispielsatz' : 'brauchtVier') : einzelBeschreibung('vok', s.id, s.beschreibung, sprache)}
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
  }
  // Bereiche auf- und zuklappen – am Konto gemerkt, folgt auf jedes Gerät (08.10.2026)
  const klappen = (id: string, offen: boolean): void => {
    const neu = { ...wahl, spielGruppen: { ...(wahl.spielGruppen ?? {}), [id]: offen } }
    setzeWahl(neu)
    if (window.__schulappsServer?.angemeldet) void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }

  return (
    <Stack data-spielwahl>
      <style>{SPIELE_CSS}</style>
      <div>
        <Title order={3} c="var(--vt-a-dunkel)">
          Spielen mit deinen Wörtern
        </Title>
        <Text size="sm" c="dimmed" data-spiele-freigeschaltet={vorDerRunde || undefined}>
          {vorDerRunde ? 'Deine Lehrkraft hat die Spiele für heute freigeschaltet. ' : 'Für heute ist alles geübt. '}Gespielt wird mit fälligen, wackeligen und
          ein paar sicheren Wörtern. Was im Spiel danebengeht, kommt im Karteikasten bald wieder dran.
        </Text>
      </div>
      {/* Einladungscode für Kooperativ/Versus ganz oben (09.10.2026, Wunsch der Lehrkraft) */}
      {!nurVerben && !listeId.startsWith('lb:') && <EinladungsCode sprache={sprache} />}
      {/* Nochmal ansehen (08.10.2026, Befund im Unterricht: lange Liste, schwer verständlich) – nur auf Nachfrage */}
      {ansehen.length > 0 && <NochmalAnsehen ids={ansehen} woerter={woerter} />}
      {GRUPPEN.map((g) => {
        const karten = g.spiele
          .map((id) => SPIELE.find((s) => s.id === id))
          .filter(
            (s): s is (typeof SPIELE)[number] => Boolean(s) && (wahl.zeitdruck || !MIT_ZEITDRUCK.includes(s!.id)) && (!nurVerben || VERBSPIELE.includes(s!.id))
          )
          .map(karteFuer)
          .filter(Boolean)
        if (!karten.length) return null
        const offen = nurVerben || (wahl.spielGruppen?.[g.id] ?? g.offen)
        return (
          <div key={g.id} data-spiel-gruppe={g.id} data-offen={offen || undefined}>
            <UnstyledButton
              onClick={() => klappen(g.id, !offen)}
              aria-expanded={offen}
              w="100%"
              py={6}
              style={{ borderBottom: '1px solid var(--vt-a-rand)' }}
              data-spiel-gruppe-kopf={g.id}
            >
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={700} c="var(--vt-a-dunkel)">
                    {g.name}{' '}
                    <Text span size="sm" c="dimmed" fw={400}>
                      · {karten.length}
                    </Text>
                  </Text>
                  <Text size="xs" c="dimmed">
                    {g.text}
                  </Text>
                </div>
                <IconChevronDown size={18} style={{ transform: offen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
              </Group>
            </UnstyledButton>
            {offen && (
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mt="sm">
                {karten}
              </SimpleGrid>
            )}
          </div>
        )
      })}
      {/* Zusammen spielen: Kooperativ und Versus (08.10.2026) – nicht im Vokabelweg und nicht bei den reinen Verbspielen */}
      {!nurVerben && !listeId.startsWith('lb:') && <ZusammenSpielen bereich="vok" kurs={listeId} sprache={sprache} mitCode={false} />}
    </Stack>
  )
}
