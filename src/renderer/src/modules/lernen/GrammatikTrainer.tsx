/**
 * Grammatiktraining der Lernenden (06.10.2026) – /s/g/<id>. Grundgerüst wie der Vokabeltrainer:
 * Kasten mit Lernstand und Regelkarten → Tagesration (Lücke, Auswahl, Umformen, Fehler finden, Satzbau) →
 * danach Spiele (Fehler finden, Satzbau-Puzzle, Formen-Blitz, Regel zuordnen) mit eigenem Rekord.
 * Regeln in shared/grammatiktrainer.ts, Server in server/grammatik.ts. Keine KI-Anfragen.
 * Im Fachordner (09.10.2026, regal/blaettern.tsx): Übungsrunde, Spiele und „Extra für dich" als nächste Seite im
 * Ordner – mit Umblättern; „Zurück" blättert zurück. Der eigene Rückweg-Knopf entfällt dort (der Ordner hat einen).
 */
import { useAuffrischen } from '../../shared/auffrischen'
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Paper,
  Popover,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton
} from '@mantine/core'
import {
  IconArrowLeft,
  IconBook2,
  IconCheck,
  IconChevronDown,
  IconFlame,
  IconPlayerPlay,
  IconSearch,
  IconShieldCheck,
  IconStairsUp,
  IconTrophy,
  IconX
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ART_NAME,
  GRAMMATIK_SPIELE,
  normiert,
  regelBeispiele,
  woerterVon,
  type GrammatikAufgabe,
  type GrammatikPaket,
  type GrammatikSpielId
} from '@shared/grammatiktrainer'
import { alsKarten, grammatikSpielPasst } from '@shared/grammatiktrainer'
import { einzelBeschreibung, spielName } from '@shared/spielSprache'
import { bekannteZeitformen, type Zeitform } from '@shared/signalwoerter'
import { FormenMemory, RichtigFalsch, SignalwortSortierer, TabellenPuzzle } from './spiele/SpieleGrammatik'
import { sitzungsWoerter, STUFEN, tagVon, uebersicht, type Urteil, type Vokabel, type WortStand } from '@shared/vokabeltrainer'
import { holen, senden } from '../onlinetest/serverApi'
import { CSS, TrainerFarben } from './VokabelTrainer'
import { BestimmenAufgabe, MehrfachAufgabe, TabellenAufgabe, UebersetzenAufgabe } from './LateinAufgaben'
import { BildVerb, FormenBlitz, MusterSortieren, StammformenTrio, type VerbDaten } from './spiele/SpieleVerben'
import { SPIELE_CSS } from './spiele/Spiele'
import ZusammenSpielen, { EinladungsCode } from './mehrspieler/ZusammenSpielen'
import { useVerbDaten } from './verbDaten'
import { useVtFarbe } from './vtFarben'
import { apostrophHinweis } from './apostrophHinweis'
import LoesungZeigen from './LoesungZeigen'
import { fuerServer, ton, useDarstellung } from '../onlinetest/schuelerDarstellung'
import { rueckweg } from './regal/beschriftung'
import { useBlaettern } from './regal/blaettern'
import { FokusRahmen } from './fokus/FokusRahmen'
import { BEREICHE, bereichVonRegel, type BereichId } from '@shared/grammatikBereiche'
import { offenLesen, offenMerken } from '../../shared/sitzung'

/** Offene Bereiche der Regel-Seite, je Training gemerkt (08.10.2026) – für die Sitzung (shared/sitzung.ts, 09.10.2026) */
function useOffeneBereiche(id: string): [Set<string>, (b: string) => void] {
  const schluessel = `schulapps-gram-bereiche-${id}`
  const [offen, setOffen] = useState<Set<string>>(() => new Set(offenLesen<string[]>(schluessel) ?? []))
  const umschalten = (b: string): void =>
    setOffen((alt) => {
      const neu = new Set(alt)
      if (neu.has(b)) neu.delete(b)
      else neu.add(b)
      offenMerken(schluessel, [...neu])
      return neu
    })
  return [offen, umschalten]
}

/** Spiele mit ablaufender Uhr – aus, wenn „Spiele mit Zeitdruck“ abgeschaltet ist (Einstellungen der Lernenden, 06.10.2026) */
const MIT_ZEITDRUCK: readonly GrammatikSpielId[] = ['formenblitz', 'satzbaupuzzle', 'richtigfalsch']
/** Aufgabenarten mit getippter Antwort – nur dort der Apostroph-Hinweis (08.10.2026) */
const GETIPPT: readonly string[] = ['luecke', 'umformen', 'fehler']
/** „Lösung zeigen" (09.10.2026): alle Arten, in denen getippt wird – auch Übersetzen und Tabellen (Latein) */
const MIT_LOESUNG_ZEIGEN: readonly string[] = [...GETIPPT, 'uebersetzen', 'tabelle']
/** Neue Spiele (08.10.2026) – laufen im Rahmen der Verbspiele */
const NEUE_SPIELE: readonly GrammatikSpielId[] = ['richtigfalsch', 'formenmemory', 'tabellenpuzzle', 'signalwort']

interface Daten {
  id: string
  titel: string
  fach: string
  sprache: string
  paket: GrammatikPaket
  staende: Record<string, WortStand>
  rekorde: Record<string, number>
  ansehen: string[]
  /** Sprachenlernen (08.10.2026): '' oder 'foerder'/'forder' (Extra für dich), bekannte Grammatik (passende Spiele) */
  art?: string
  bekannt?: string[]
  /** Angaben der Freigabe (Katalog-Kennungen → Bereiche) und Freigabedatum („Gerade dran"), 08.10.2026 */
  info?: { themen?: string[]; teilformen?: string[] }
  erstellt?: string
}
interface Ergebnis {
  urteil: Urteil
  richtig: string
  erklaerung: string
  stand: WortStand
}

const mische = <T,>(l: T[]): T[] => {
  const a = [...l]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
/** Satzbauteile mischen – aber nie in der richtigen Reihenfolge lassen */
const teileGemischt = (teile: string[]): string[] => {
  for (let i = 0; i < 8; i++) {
    const m = mische(teile)
    if (m.join(' ') !== teile.join(' ')) return m
  }
  return [...teile].reverse()
}

export default function GrammatikTrainer({ id }: { id: string }): React.JSX.Element {
  const [d, setD] = useState<Daten | null | undefined>(undefined)
  const [fehler, setFehler] = useState('')
  const [sitzung, setSitzungRoh] = useState<GrammatikAufgabe[] | null>(null)
  const blatt = useBlaettern()
  const laden = useCallback(() => {
    void holen<Daten>(`/s/api/grammatik/liste?id=${encodeURIComponent(id)}`).then(setD, (e: unknown) => {
      setFehler(e instanceof Error ? e.message : String(e))
      setD(null)
    })
  }, [id])
  useEffect(laden, [laden])
  // Änderungen der Lehrkraft ohne Neuladen (08.10.2026) – nicht mitten in einer Runde oder einem Spiel
  useAuffrischen(() => !document.querySelector('[data-spiel], [data-verbspiel], [data-sitzung]') && laden(), !sitzung)
  if (d === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  if (!d) return <Alert color="orange">{fehler || 'Dieses Grammatiktraining gibt es nicht.'}</Alert>
  // Im Ordner: Runde als nächste Seite; Zurück (auch mitten in der Runde) lädt den Stand neu
  const setSitzung = (a: GrammatikAufgabe[] | null): void => {
    if (!blatt) return setSitzungRoh(a)
    if (a) blatt.oeffne('uebung', () => setSitzungRoh(a), () => (setSitzungRoh(null), laden()))
    else blatt.zurueck(() => setSitzungRoh(null))
  }
  return (
    <TrainerFarben fach={d.fach}>
      {sitzung ? (
        <Sitzung d={d} aufgaben={sitzung} fertig={(st) => (setD({ ...d, staende: st }), setSitzung(null))} />
      ) : (
        <Kasten d={d} starten={setSitzung} aktualisieren={(r) => setD({ ...d, ...r })} />
      )}
    </TrainerFarben>
  )
}

function Kasten({
  d,
  starten,
  aktualisieren
}: {
  d: Daten
  starten: (a: GrammatikAufgabe[]) => void
  aktualisieren: (r: Partial<Daten>) => void
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const karten = useMemo(() => alsKarten(d.paket.aufgaben) as Vokabel[], [d.paket.aufgaben])
  const u = uebersicht(karten, d.staende)
  /*
   * Heute dran (08.10.2026): fällige Wiederholungen, dann unbearbeitete Übungen in der Reihenfolge der Regeln (bei
   * Förderaufgaben nach Stufen) – je Tag höchstens 10 neue.
   */
  const heute = useMemo(() => {
    const faellig = sitzungsWoerter(karten, d.staende, Date.now(), 0)
    const heuteTag = tagVon(Date.now())
    const schonNeu = d.paket.aufgaben.filter((a) => d.staende[a.id]?.erstmals && tagVon(d.staende[a.id].erstmals!) === heuteTag).length
    const regelIndex = new Map(d.paket.regeln.map((r, i) => [r.id, i]))
    const neue = d.paket.aufgaben
      .filter((a) => !d.staende[a.id]?.versuche)
      .sort((a, b) => (a.stufe ?? 0) - (b.stufe ?? 0) || (regelIndex.get(a.regelId) ?? 0) - (regelIndex.get(b.regelId) ?? 0))
      .slice(0, Math.max(0, 10 - schonNeu))
    const nachId = new Map(karten.map((k) => [k.id, k]))
    return [...faellig, ...neue.map((a) => nachId.get(a.id)!)].filter(Boolean)
  }, [karten, d.staende, d.paket])
  const [offeneRegel, setOffeneRegel] = useState<string | null>(null)
  const [offeneBereiche, bereichKlappen] = useOffeneBereiche(d.id)
  const [suche, setSuche] = useState('')
  // „Extra für dich" aus anderen Freigaben (nur auf der normalen Grammatik-Seite)
  const [extras, setExtras] = useState<{ id: string; titel: string; fach: string; uebersicht: { unbearbeitet: number; gesamt: number } }[]>([])
  useEffect(() => {
    if (d.art) return
    let aus = false
    void holen<{ listen: { id: string; titel: string; fach: string; extra: boolean; uebersicht: { unbearbeitet: number; gesamt: number } }[] }>(
      '/s/api/grammatik'
    )
      .then((r) => !aus && setExtras((r.listen ?? []).filter((x) => x.extra && x.id !== d.id && x.fach.toLowerCase() === d.fach.toLowerCase())))
      .catch(() => undefined)
    return () => {
      aus = true
    }
  }, [d.id, d.art, d.fach])
  const [spiel, setSpielRoh] = useState<GrammatikSpielId | null>(null)
  // „Extra für dich" im Ordner: als nächste Seite statt eigener Seite
  const [extra, setExtraRoh] = useState<string | null>(null)
  const blatt = useBlaettern()
  const setSpiel = (s: GrammatikSpielId | null): void => {
    if (!blatt) return setSpielRoh(s)
    if (s) blatt.oeffne('spiel', () => setSpielRoh(s), () => setSpielRoh(null))
    else blatt.zurueck(() => setSpielRoh(null))
  }
  const { d: wahl, setze: setzeWahl } = useDarstellung()
  const ich = window.__schulappsServer
  const gast = !ich?.angemeldet || ich.quelle === 'gast'
  const nachId = new Map(d.paket.aufgaben.map((a) => [a.id, a]))
  const tagesAufgaben = heute.map((k) => nachId.get(k.id)!).filter(Boolean)
  // Spiele nur mit Aufgaben, die der Kasten schon eingeführt hat (wie bei den Vokabeln)
  const bekannt = useMemo(() => ({ ...d.paket, aufgaben: d.paket.aufgaben.filter((a) => (d.staende[a.id]?.fach ?? 0) > 0) }), [d.paket, d.staende])
  /*
   * Verbspiele (07.10.2026): Karte i gehört zur i-ten Verbaufgabe (verbAufgaben, gleiche Reihenfolge). Gespielt wird mit
   * den schon eingeführten Verben; geschrieben statt gewählt ab Fach 3.
   */
  const verbAufgabe = useMemo(() => {
    const auf = d.paket.aufgaben.filter((a) => a.regelId === 'verben')
    return new Map((d.paket.verben ?? []).map((k, i) => [k.id, auf[i]?.id ?? '']))
  }, [d.paket])
  const bekannteVerben = useMemo(
    () => (d.paket.verben ?? []).filter((k) => (d.staende[verbAufgabe.get(k.id) ?? '']?.fach ?? 0) > 0),
    [d.paket.verben, d.staende, verbAufgabe]
  )
  const verbDaten = useVerbDaten(bekannteVerben, d.paket.verbSprache, null, (k) => (d.staende[verbAufgabe.get(k.id) ?? '']?.fach ?? 0) >= 3)
  // Zeitformen, die das Kind kennt (Lehrwerk-Stand + freigegebene Grammatik) – für den Signalwort-Sortierer
  const zeitformen = useMemo(() => (d.sprache === 'en' ? bekannteZeitformen(d.bekannt ?? []) : []), [d.sprache, d.bekannt])
  /** Passt das Spiel zur Grammatik? Unpassende werden ausgeblendet (08.10.2026, abgestimmt) */
  const spielPasst = (id: GrammatikSpielId): boolean => {
    const s = GRAMMATIK_SPIELE.find((x) => x.id === id)!
    if (s.verben)
      return (
        Boolean(verbDaten) &&
        (id === 'bildverb'
          ? verbDaten!.karten.filter((k) => verbDaten!.bild(k)).length >= 4
          : id === 'verbblitz'
          ? verbDaten!.karten.length >= 4 && verbDaten!.mitTon
          : id === 'muster'
          ? verbDaten!.mitMuster
          : verbDaten!.karten.length >= 4)
      )
    return grammatikSpielPasst(id, bekannt.aufgaben, d.paket.regeln.length, zeitformen.length)
  }
  if (extra) return <GrammatikTrainer key={extra} id={extra} />
  if (spiel && NEUE_SPIELE.includes(spiel))
    return (
      <VerbSpielLauf
        d={d}
        spiel={spiel}
        aufgaben={bekannt.aufgaben}
        zeitformen={zeitformen}
        aufgabeVon={(id) => id}
        fertig={(r) => {
          setSpiel(null)
          if (r) aktualisieren(r)
        }}
      />
    )
  if (spiel && GRAMMATIK_SPIELE.find((s) => s.id === spiel)?.verben && verbDaten)
    return (
      <VerbSpielLauf
        d={d}
        spiel={spiel}
        daten={verbDaten}
        aufgabeVon={(id) => verbAufgabe.get(id) ?? ''}
        fertig={(r) => {
          setSpiel(null)
          if (r) aktualisieren(r)
        }}
      />
    )
  if (spiel)
    return (
      <Spiel
        d={{ ...d, paket: bekannt }}
        spiel={spiel}
        fertig={(r) => {
          setSpiel(null)
          if (r) aktualisieren(r)
        }}
      />
    )
  // ---------------------------------------------------------------- Ansicht nach Regeln (08.10.2026, abgestimmt)
  const jetzt = Date.now()
  const bearbeitet = d.paket.aufgaben.filter((a) => d.staende[a.id]?.versuche).length
  const erklaerungen: Record<string, string> = {
    bearbeitet: 'So viele Übungen hast du schon mindestens einmal gemacht. Unbearbeitete kommen bei „Weiter üben" zuerst nach den fälligen dran.',
    sicher:
      'Eine Übung ist sicher, wenn du sie zweimal selbst richtig gelöst hast – mit mindestens einer Woche Abstand dazwischen. Das klappt erst nach gut einer Woche.',
    'heute dran': 'Wiederholungen, die heute fällig sind, und die nächsten neuen Übungen. Danach sind die Spiele frei.'
  }
  const werte = [
    { name: 'bearbeitet', wert: `${bearbeitet} / ${d.paket.aufgaben.length}`, farbe: farbe.a, symbol: <IconStairsUp size={20} /> },
    { name: 'sicher', wert: String(u.sicher), farbe: '#14b8a6', symbol: <IconShieldCheck size={20} /> },
    { name: 'heute dran', wert: String(heute.length), farbe: '#f59e0b', symbol: <IconFlame size={20} /> }
  ]
  /** Übungen einer Regel: unbearbeitete, dann fällige, dann wackelige (Fach 1–2), höchstens 10 */
  const regelAufgaben = (rid: string): GrammatikAufgabe[] => {
    const l = d.paket.aufgaben.filter((a) => a.regelId === rid)
    const st = (a: GrammatikAufgabe): WortStand | undefined => d.staende[a.id]
    const rang = (a: GrammatikAufgabe): number => (!st(a)?.versuche ? 0 : (st(a)!.faellig ?? 0) <= jetzt ? 1 : (st(a)!.fach ?? 0) <= 2 ? 2 : 3)
    return [...l].sort((a, b) => rang(a) - rang(b) || (a.stufe ?? 0) - (b.stufe ?? 0)).slice(0, 10)
  }
  const arten = Object.entries(d.paket.aufgaben.reduce<Record<string, number>>((m, a) => ((m[a.art] = (m[a.art] ?? 0) + 1), m), {})) as [
    keyof typeof ART_NAME,
    number
  ][]
  const stufen = [1, 2, 3].map((s) => {
    const l = d.paket.aufgaben.filter((a) => a.stufe === s)
    return { s, gesamt: l.length, fertig: l.filter((a) => d.staende[a.id]?.versuche).length }
  })
  const spieleOffen = wahl.spielGruppen?.grammatik ?? false
  const spieleKlappen = (): void => {
    const neu = { ...wahl, spielGruppen: { ...(wahl.spielGruppen ?? {}), grammatik: !spieleOffen } }
    setzeWahl(neu)
    if (window.__schulappsServer?.angemeldet) void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  const spiele = GRAMMATIK_SPIELE.filter(
    (s) => (wahl.zeitdruck || !MIT_ZEITDRUCK.includes(s.id)) && Boolean(s.verben) === Boolean(d.paket.verben?.length) && spielPasst(s.id)
  )
  const zurueck = rueckweg(d.fach, 'gram', gast, useDarstellung.getState().d.materialien !== 'liste')
  /*
   * Viele Regeln (08.10.2026, abgestimmt): oben „Gerade dran" (in den letzten 14 Tagen freigegeben, Regeln mit noch
   * unbearbeiteten Übungen, „Extra für dich"), darunter die übrigen Regeln nach Bereichen – zugeklappt, je Gerät gemerkt.
   * Jede Regel steht genau einmal auf der Seite. Ab 16 Regeln gibt es eine Suche.
   */
  const kennungen = [...(d.info?.themen ?? []), ...(d.info?.teilformen ?? [])]
  const neuFreigegeben = Boolean(d.erstellt && jetzt - Date.parse(d.erstellt) < 14 * 864e5)
  const regelInfos = d.paket.regeln.flatMap((r, i) => {
    const l = d.paket.aufgaben.filter((a) => a.regelId === r.id)
    if (!l.length) return []
    const ru = uebersicht(alsKarten(l) as Vokabel[], d.staende)
    const fertig = l.filter((a) => d.staende[a.id]?.versuche).length
    return [{ r, i, l, ru, fertig, sicher: ru.sicher >= l.length, dran: neuFreigegeben || fertig < l.length, bereich: bereichVonRegel(r.titel, kennungen) }]
  })
  type RegelInfo = (typeof regelInfos)[number]
  const geradeDran = regelInfos.filter((x) => x.dran)
  const bereiche = BEREICHE.map((b) => ({ ...b, regeln: regelInfos.filter((x) => !x.dran && x.bereich === b.id) })).filter((b) => b.regeln.length) as {
    id: BereichId
    name: string
    regeln: RegelInfo[]
  }[]
  const gefunden = regelInfos.filter((x) => x.r.titel.toLowerCase().includes(suche.trim().toLowerCase()))
  const regelKarte = ({ r, i, l, ru, fertig }: RegelInfo): React.JSX.Element => {
    const offen = offeneRegel === r.id
    return (
      <Card key={r.id} withBorder radius="lg" padding="sm" data-regel={r.id}>
        <UnstyledButton onClick={() => setOffeneRegel(offen ? null : r.id)} w="100%" aria-expanded={offen} data-regel-kopf={r.id}>
          <Group justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text fw={700}>
                {d.paket.regeln.length > 1 ? `${i + 1} ` : ''}
                {r.titel}
              </Text>
              <Progress.Root size={8} radius="xl" mt={6}>
                <Progress.Section value={(ru.sicher / l.length) * 100} color="teal" />
                <Progress.Section value={((fertig - ru.sicher) / l.length) * 100} color={farbe.a} />
              </Progress.Root>
            </div>
            <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }} data-regel-stand={`${fertig}/${l.length}`}>
              {fertig}/{l.length}
            </Text>
            <IconChevronDown size={16} style={{ transform: offen ? 'rotate(180deg)' : undefined, transition: 'transform .2s', flex: 'none' }} />
          </Group>
        </UnstyledButton>
        {offen && (
          <Stack gap="xs" mt="sm">
            <RegelKarte r={r} />
            <Button variant="light" color={farbe.a} leftSection={<IconPlayerPlay size={16} />} onClick={() => starten(regelAufgaben(r.id))} data-regel-ueben={r.id}>
              Diese Regel üben
            </Button>
          </Stack>
        )}
      </Card>
    )
  }
  return (
    <Stack className="vt vt-rein" data-grammatik-kasten>
      <style>{CSS}</style>
      {/* Zurück wie beim Vokabeltraining (08.10.2026): Gäste zu „Meine Materialien", sonst in den Lernraum; im Ordner blättert dessen Knopf */}
      {!blatt && (
        <Button
          component="a"
          href={zurueck.href}
          variant="subtle"
          color={farbe.a}
          leftSection={<IconArrowLeft size={16} />}
          px={4}
          w="fit-content"
          data-zurueck-lernen
        >
          {zurueck.text}
        </Button>
      )}
      <div>
        <Text c="dimmed" size="sm">
          {d.art ? 'Extra für dich' : 'Grammatik'} · {d.fach}
        </Text>
        <Title order={2}>{d.art ? d.paket.thema || d.titel : d.titel}</Title>
      </div>
      <SimpleGrid cols={3}>
        {werte.map((w) => (
          <Popover key={w.name} width={280} position="bottom" withArrow shadow="md">
            <Popover.Target>
              <UnstyledButton aria-label={`${w.name}: ${w.wert} – Erklärung`} data-wert={w.name}>
                <Paper withBorder radius="lg" p="sm" style={{ borderColor: w.farbe }}>
                  <Group gap={6} c={w.farbe} wrap="nowrap">
                    {w.symbol}
                    <Text size="xs" fw={700} tt="uppercase">
                      {w.name}
                    </Text>
                  </Group>
                  <Text fz={24} fw={800}>
                    {w.wert}
                  </Text>
                </Paper>
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="sm" data-wert-erklaerung={w.name}>
                {erklaerungen[w.name]}
              </Text>
            </Popover.Dropdown>
          </Popover>
        ))}
      </SimpleGrid>
      {/* Förderaufgaben: Stufen erkennen → gelenkt bilden → selbst bilden */}
      {stufen.some((s) => s.gesamt) && (
        <Group gap="xs" data-stufen>
          {stufen
            .filter((s) => s.gesamt)
            .map((s) => (
              <Badge key={s.s} size="lg" variant={s.fertig >= s.gesamt ? 'filled' : 'light'} color={s.fertig >= s.gesamt ? 'teal' : farbe.a} tt="none">
                Stufe {s.s}: {['erkennen', 'gelenkt bilden', 'selbst bilden'][s.s - 1]} {s.fertig >= s.gesamt ? '✓' : `${s.fertig}/${s.gesamt}`}
              </Badge>
            ))}
        </Group>
      )}
      {heute.length > 0 ? (
        <Button size="lg" radius="xl" className="vt-los" leftSection={<IconPlayerPlay size={18} />} onClick={() => starten(tagesAufgaben)} data-grammatik-start>
          Weiter üben · {heute.length} {heute.length === 1 ? 'Übung' : 'Übungen'}
        </Button>
      ) : (
        <Alert color="teal" icon={<IconCheck size={16} />} data-grammatik-geschafft>
          {bearbeitet < d.paket.aufgaben.length
            ? 'Für heute ist alles geübt – morgen geht es weiter.'
            : 'Alle Übungen bearbeitet und für heute alles wiederholt.'}
          {wahl.spiele && spiele.length ? ' Jetzt noch ein Spiel?' : ''}
        </Alert>
      )}
      <Title order={4} mt="xs">
        Regeln
      </Title>
      {regelInfos.length > 15 && (
        <TextInput
          placeholder="Regel suchen"
          leftSection={<IconSearch size={16} />}
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          aria-label="Regel suchen"
          data-regel-suche
        />
      )}
      <Stack gap="xs" data-regeln>
        {suche.trim() ? (
          gefunden.length ? (
            gefunden.map(regelKarte)
          ) : (
            <Text size="sm" c="dimmed">
              Keine Regel gefunden.
            </Text>
          )
        ) : (
          <>
            {(geradeDran.length > 0 || extras.length > 0) && (
              <Stack gap="xs" data-gerade-dran>
                <Text size="sm" fw={700} c={farbe.a}>
                  Gerade dran
                </Text>
                {extras.map((x) => (
                  <Card
                    key={x.id}
                    component="a"
                    href={`/s/g/${x.id}`}
                    onClick={(e: React.MouseEvent) => {
                      if (!blatt || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
                      e.preventDefault()
                      blatt.oeffne('extra', () => setExtraRoh(x.id), () => setExtraRoh(null))
                    }}
                    withBorder
                    radius="lg"
                    padding="sm"
                    data-extra-link={x.id}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={700}>{x.titel}</Text>
                      <Badge variant="light" color={farbe.a} tt="none">
                        {x.uebersicht.unbearbeitet ? `noch ${x.uebersicht.unbearbeitet} von ${x.uebersicht.gesamt}` : 'alles bearbeitet'}
                      </Badge>
                    </Group>
                  </Card>
                ))}
                {geradeDran.map(regelKarte)}
              </Stack>
            )}
            {bereiche.map((b) => {
              const auf = offeneBereiche.has(b.id)
              const sicher = b.regeln.filter((x) => x.sicher).length
              return (
                <Card key={b.id} withBorder radius="lg" padding="sm" data-regel-bereich={b.id}>
                  <UnstyledButton onClick={() => bereichKlappen(b.id)} w="100%" aria-expanded={auf} data-regel-bereich-kopf={b.id}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={700}>{b.name}</Text>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }} data-bereich-sicher={`${sicher}/${b.regeln.length}`}>
                          {sicher} von {b.regeln.length} sicher
                        </Text>
                        <IconChevronDown size={16} style={{ transform: auf ? 'rotate(180deg)' : undefined, transition: 'transform .2s', flex: 'none' }} />
                      </Group>
                    </Group>
                  </UnstyledButton>
                  {auf && (
                    <Stack gap="xs" mt="sm">
                      {b.regeln.map(regelKarte)}
                    </Stack>
                  )}
                </Card>
              )
            })}
          </>
        )}
      </Stack>
      <Text size="sm" c="dimmed" data-uebungsarten>
        Übungsarten: {arten.map(([a, n]) => `${ART_NAME[a]} ${n}`).join(' · ')}
      </Text>
      {wahl.spiele && spiele.length > 0 && (
        <Card withBorder radius="lg" padding="sm" data-grammatik-spiele>
          <UnstyledButton onClick={spieleKlappen} w="100%" aria-expanded={spieleOffen} data-grammatik-spiele-kopf>
            <Group justify="space-between">
              <Text fw={700}>
                Spiele{' '}
                <Text span size="sm" c="dimmed" fw={400}>
                  · {spiele.length}
                </Text>
              </Text>
              <IconChevronDown size={16} style={{ transform: spieleOffen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
            </Group>
          </UnstyledButton>
          {spieleOffen && (
            <>
              {/* Einladungscode für Kooperativ/Versus oben im Spielbereich (09.10.2026) */}
              {!d.paket.verben?.length && (
                <div style={{ marginTop: 8 }}>
                  <EinladungsCode sprache={d.sprache} />
                </div>
              )}
              {heute.length > 0 && (
                <Text size="sm" c="dimmed" mt="xs">
                  Die Spiele gibt es nach der Übung für heute.
                </Text>
              )}
              <SimpleGrid cols={{ base: 2, sm: 4 }} mt="xs">
                {spiele.map((s) => (
                  <UnstyledButton key={s.id} disabled={heute.length > 0} onClick={() => setSpiel(s.id)} data-grammatik-spiel={s.id}>
                    <Card withBorder radius="lg" padding="sm" style={{ opacity: heute.length > 0 ? 0.5 : 1, height: '100%' }}>
                      <Text fw={700}>{spielName('gram', s.id, d.sprache, s.name)}</Text>
                      <Text size="xs" c="dimmed">
                        {einzelBeschreibung('gram', s.id, s.beschreibung, d.sprache)}
                      </Text>
                      {d.rekorde[s.id] !== undefined && (
                        <Badge mt={6} leftSection={<IconTrophy size={12} />} variant="light" color="yellow">
                          {d.rekorde[s.id]} {s.einheit}
                        </Badge>
                      )}
                    </Card>
                  </UnstyledButton>
                ))}
              </SimpleGrid>
              {/* Zusammen spielen: Kooperativ und Versus (08.10.2026) */}
              {!d.paket.verben?.length && (
                <Stack gap="xs" mt="sm">
                  <ZusammenSpielen bereich="gram" kurs={d.id} sprache={d.sprache} mitCode={false} />
                </Stack>
              )}
            </>
          )}
        </Card>
      )}
    </Stack>
  )
}

/** Ein Verbspiel im Grammatiktraining – Ergebnis und Fehler wie bei den übrigen Spielen an den Server */
function VerbSpielLauf({
  d,
  spiel,
  daten,
  aufgaben = [],
  zeitformen = [],
  aufgabeVon,
  fertig
}: {
  d: Daten
  spiel: GrammatikSpielId
  daten?: VerbDaten
  /** Neue Grammatikspiele (08.10.2026): geübte Aufgaben bzw. bekannte Zeitformen */
  aufgaben?: GrammatikAufgabe[]
  zeitformen?: Zeitform[]
  aufgabeVon: (verbId: string) => string
  fertig: (r?: Partial<Daten>) => void
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const info = GRAMMATIK_SPIELE.find((s) => s.id === spiel)!
  const [ende, setEnde] = useState<{ wert: number; rekord: boolean } | null>(null)
  const abschliessen = (wert: number, fehler: string[]): void => {
    void senden<{ rekord: boolean; rekorde: Record<string, number> }>('/s/api/grammatik/spiel', {
      id: d.id,
      spiel,
      wert,
      fehler: fehler.map(aufgabeVon).filter(Boolean)
    }).then(
      (r) => {
        d.rekorde = r.rekorde
        ton('geschafft')
        setEnde({ wert, rekord: r.rekord })
      },
      () => setEnde({ wert, rekord: false })
    )
  }
  if (ende)
    return (
      <Stack align="center" py="xl" className="vt vt-rein" data-spiel-ende>
        <style>{CSS}</style>
        <IconTrophy size={48} color={ende.rekord ? '#f59e0b' : 'gray'} />
        <Title order={2}>
          {ende.wert} {info.einheit}
        </Title>
        {ende.rekord && <Badge color="yellow">Neuer Rekord!</Badge>}
        <Button size="lg" radius="xl" className="vt-los" onClick={() => fertig({ rekorde: d.rekorde })}>
          Zurück zum Kasten
        </Button>
      </Stack>
    )
  return (
    // Vollbild beim Lernen (09.10.2026): das laufende Spiel füllt den Bildschirm, das Ergebnis zeigt die normale Ansicht
    <FokusRahmen name="grammatikspiel" onEnde={() => fertig()}>
    <Stack className="vt" data-verbspiel={spiel}>
      <style>{CSS}</style>
      <style>{SPIELE_CSS}</style>
      <Group justify="space-between">
        <Button variant="subtle" color={farbe.a} leftSection={<IconX size={16} />} onClick={() => fertig()} px={4} data-eigenes-beenden>
          Beenden
        </Button>
        <Text fw={800}>{spielName('gram', spiel, d.sprache, info.name)}</Text>
      </Group>
      <div className="vt-buehne">
        {spiel === 'richtigfalsch' ? (
          <RichtigFalsch aufgaben={aufgaben} ende={abschliessen} />
        ) : spiel === 'formenmemory' ? (
          <FormenMemory aufgaben={aufgaben} ende={abschliessen} />
        ) : spiel === 'tabellenpuzzle' ? (
          <TabellenPuzzle aufgaben={aufgaben} ende={abschliessen} />
        ) : spiel === 'signalwort' ? (
          <SignalwortSortierer zeitformen={zeitformen} ende={abschliessen} />
        ) : !daten ? null : spiel === 'verbtrio' ? (
          <StammformenTrio verben={daten} ende={abschliessen} />
        ) : spiel === 'verbblitz' ? (
          <FormenBlitz verben={daten} ende={abschliessen} />
        ) : spiel === 'bildverb' ? (
          <BildVerb verben={daten} ende={abschliessen} />
        ) : (
          <MusterSortieren verben={daten} ende={abschliessen} />
        )}
      </div>
    </Stack>
    </FokusRahmen>
  )
}

function RegelKarte({ r }: { r: GrammatikPaket['regeln'][number] }): React.JSX.Element {
  return (
    <Card withBorder radius="lg" padding="md" style={{ background: 'var(--vt-a-hell, transparent)' }} data-regelkarte>
      <Text fw={800} mb={4}>
        {r.titel}
      </Text>
      <Text size="sm">{r.erklaerung}</Text>
      {r.beispiele.map((b) => (
        <Text key={b} size="sm" fs="italic" mt={4}>
          → {b}
        </Text>
      ))}
      {(r.stolperfallen?.length ?? 0) > 0 && (
        <>
          <Text size="sm" fw={700} mt="sm">
            Stolperfallen
          </Text>
          {r.stolperfallen!.map((x) => (
            <Text key={x} size="sm" mt={2}>
              ⚠ {x}
            </Text>
          ))}
        </>
      )}
    </Card>
  )
}

function Sitzung({ d, aufgaben, fertig }: { d: Daten; aufgaben: GrammatikAufgabe[]; fertig: (st: Record<string, WortStand>) => void }): React.JSX.Element {
  const farbe = useVtFarbe()
  const [schlange, setSchlange] = useState(aufgaben)
  const [staende, setStaende] = useState(d.staende)
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const [zaehler, setZaehler] = useState({ richtig: 0, gesamt: 0, wiederholt: new Map<string, number>() })
  const [laeuft, setLaeuft] = useState(false)
  const [frage, setFrage] = useState(0)
  const [regel, setRegel] = useState(false)
  const [netz, setNetz] = useState('')
  // Tipp vor der Antwort (Förderaufgaben, 08.10.2026) – gilt für die aktuelle Frage
  const [tippFuer, setTippFuer] = useState<string | null>(null)
  // „Lösung zeigen" (09.10.2026): leere Antwort = falsch; die Rückmeldung nennt nur die Lösung
  const [aufgegeben, setAufgegeben] = useState(false)
  const a = schlange[0]
  const antworten = async (antwort: string, wort?: string, selbst?: Urteil, zeigen = false): Promise<void> => {
    if (!a || laeuft || ergebnis) return
    setAufgegeben(zeigen)
    setLaeuft(true)
    try {
      const e = await senden<Ergebnis>('/s/api/grammatik/antwort', {
        id: d.id,
        aufgabeId: a.id,
        antwort,
        ...(wort !== undefined ? { wort } : {}),
        ...(selbst ? { selbst } : {})
      })
      setStaende((s) => ({ ...s, [a.id]: e.stand }))
      setErgebnis(e)
      setZaehler((z) => ({ ...z, richtig: z.richtig + (e.urteil === 'richtig' ? 1 : 0), gesamt: z.gesamt + 1 }))
      if (e.urteil === 'richtig') ton('richtig')
      // Getippt richtig, aber mit typografischem Apostroph (don’t): Tastatur-Hinweis (08.10.2026)
      if (e.urteil === 'richtig' && !selbst && GETIPPT.includes(a.art)) apostrophHinweis(antwort)
      setNetz('')
    } catch (e) {
      // Verbindung trotz Wiederholung weg (08.10.2026): sagen statt scheinbar hängen – nochmal tippen geht
      setNetz(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
    }
  }
  const weiter = (): void => {
    if (!a || !ergebnis) return
    const n = zaehler.wiederholt.get(a.id) ?? 0
    const rest = schlange.slice(1)
    if (ergebnis.urteil !== 'richtig' && n < 2) {
      zaehler.wiederholt.set(a.id, n + 1)
      rest.splice(Math.min(3, rest.length), 0, a)
    }
    setSchlange(rest)
    setErgebnis(null)
    setRegel(false)
    setFrage((f) => f + 1)
  }
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && ergebnis) {
        e.preventDefault()
        weiter()
      }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })
  if (!a)
    return (
      <Stack align="center" py="xl" className="vt vt-rein" data-sitzung-fertig>
        <style>{CSS}</style>
        <div
          className="vt-ring"
          style={{ background: `conic-gradient(var(--vt-a) ${(zaehler.richtig / Math.max(1, zaehler.gesamt)) * 360}deg, var(--vt-a-rand) 0deg)` }}
        >
          <div className="vt-ring-innen">
            <IconCheck size={30} />
          </div>
        </div>
        <Title order={2}>Geschafft!</Title>
        <Text c="dimmed">
          {zaehler.richtig} von {zaehler.gesamt} Aufgaben auf Anhieb richtig.
        </Text>
        <Button size="lg" radius="xl" className="vt-los" onClick={() => fertig(staende)}>
          Zurück zum Kasten
        </Button>
      </Stack>
    )
  const r = d.paket.regeln.find((x) => x.id === a.regelId)
  const st = staende[a.id]
  return (
    // Vollbild beim Lernen (09.10.2026): die laufende Runde füllt den Bildschirm
    <FokusRahmen name="grammatikrunde" onEnde={() => fertig(staende)}>
    <Stack className="vt" data-sitzung>
      <style>{CSS}</style>
      <Group justify="space-between">
        <Button variant="subtle" color={farbe.a} leftSection={<IconX size={16} />} onClick={() => fertig(staende)} px={4} data-eigenes-beenden>
          Beenden
        </Button>
        <Group gap={6}>
          <Badge variant="light" color={farbe.a} size="lg" radius="sm" tt="none">
            {ART_NAME[a.art]}
          </Badge>
          <Badge variant="outline" color={farbe.a} size="lg" radius="sm" tt="none">
            {a.stufe ? `Stufe ${a.stufe}` : STUFEN[Math.min(6, st?.fach ?? 0)].name}
          </Badge>
        </Group>
      </Group>
      <Progress value={(zaehler.gesamt / Math.max(1, zaehler.gesamt + schlange.length)) * 100} radius="xl" size="lg" color={farbe.a} />
      {netz && (
        <Alert color="orange" data-netz-fehler>
          {netz} Deine Antwort ist noch nicht angekommen – tippe einfach noch einmal.
        </Alert>
      )}
      <div key={`${a.id}-${frage}`} className="vt-rein vt-buehne">
        <Aufgabe a={a} gesperrt={Boolean(ergebnis) || laeuft} antworten={(x, w, s) => void antworten(x, w, s)} ergebnis={ergebnis} />
      </div>
      {!ergebnis && MIT_LOESUNG_ZEIGEN.includes(a.art) && (
        <Group justify="center">
          <LoesungZeigen zeigen={() => void antworten('', undefined, undefined, true)} gesperrt={laeuft} />
        </Group>
      )}
      {a.tipp && !ergebnis && (
        <Stack gap={4}>
          <Button variant="light" size="xs" color="yellow" w="fit-content" onClick={() => setTippFuer(`${a.id}-${frage}`)} data-tipp-zeigen>
            Tipp
          </Button>
          {tippFuer === `${a.id}-${frage}` && (
            <Alert color="yellow" variant="light" data-tipp-text>
              {a.tipp}
            </Alert>
          )}
        </Stack>
      )}
      {r && (
        <Button
          variant="subtle"
          size="xs"
          color={farbe.a}
          leftSection={<IconBook2 size={14} />}
          w="fit-content"
          onClick={() => setRegel((x) => !x)}
          data-regel-zeigen
        >
          {regel ? 'Regel ausblenden' : 'Regel ansehen'}
        </Button>
      )}
      {r && (regel || (ergebnis && ergebnis.urteil !== 'richtig')) && <RegelKarte r={r} />}
      {ergebnis && (
        <Alert color={ergebnis.urteil === 'richtig' ? 'green' : ergebnis.urteil === 'fast' ? 'yellow' : 'red'} data-urteil={ergebnis.urteil}>
          <Text fw={700}>
            {ergebnis.urteil === 'richtig'
              ? 'Richtig!'
              : aufgegeben
              ? 'Hier ist die Lösung – die Aufgabe kommt bald wieder.'
              : ergebnis.urteil === 'fast'
              ? a.art === 'bestimmen' || a.art === 'mehrfach' || a.art === 'tabelle'
                ? 'Teilweise richtig.'
                : a.art === 'uebersetzen'
                ? 'Fast.'
                : 'Fast – achte auf die Schreibweise.'
              : 'Leider falsch.'}
          </Text>
          {ergebnis.urteil !== 'richtig' && (
            <Text size="sm" data-loesung-text>
              {aufgegeben ? 'Lösung' : 'Richtig'}: {ergebnis.richtig}
            </Text>
          )}
          {ergebnis.erklaerung && <Text size="sm">{ergebnis.erklaerung}</Text>}
        </Alert>
      )}
      {ergebnis && (
        <Button size="lg" radius="xl" className="vt-los" onClick={weiter} data-weiter autoFocus>
          Weiter
        </Button>
      )}
    </Stack>
    </FokusRahmen>
  )
}

/** Eine Aufgabe je nach Art – auch von den Spielen genutzt */
function Aufgabe({
  a,
  gesperrt,
  antworten,
  ergebnis
}: {
  a: GrammatikAufgabe
  gesperrt: boolean
  antworten: (antwort: string, wort?: string, selbst?: Urteil) => void
  ergebnis?: { urteil: Urteil } | null
}): React.JSX.Element {
  // Latein (07.10.2026): eigene Bedienelemente
  if (a.art === 'bestimmen')
    return (
      <AufgabenRahmen a={a}>
        <BestimmenAufgabe a={a} gesperrt={gesperrt} antworten={antworten} />
      </AufgabenRahmen>
    )
  if (a.art === 'mehrfach')
    return (
      <AufgabenRahmen a={a}>
        <MehrfachAufgabe a={a} gesperrt={gesperrt} antworten={antworten} />
      </AufgabenRahmen>
    )
  if (a.art === 'tabelle')
    return (
      <AufgabenRahmen a={a}>
        <TabellenAufgabe a={a} gesperrt={gesperrt} antworten={antworten} />
      </AufgabenRahmen>
    )
  if (a.art === 'uebersetzen')
    return (
      <AufgabenRahmen a={a}>
        <UebersetzenAufgabe a={a} gesperrt={gesperrt} antworten={antworten} />
      </AufgabenRahmen>
    )
  return <AufgabeAllgemein a={a} gesperrt={gesperrt} antworten={antworten} ergebnis={ergebnis} />
}

/** Anweisung über der Aufgabe */
function AufgabenRahmen({ a, children }: { a: GrammatikAufgabe; children: React.ReactNode }): React.JSX.Element {
  return (
    <Stack gap="sm" data-aufgabe={a.art}>
      <Text c="dimmed" size="sm">
        {a.anweisung || ART_NAME[a.art]}
      </Text>
      {children}
    </Stack>
  )
}

function AufgabeAllgemein({
  a,
  gesperrt,
  antworten,
  ergebnis
}: {
  a: GrammatikAufgabe
  gesperrt: boolean
  antworten: (antwort: string, wort?: string) => void
  ergebnis?: { urteil: Urteil } | null
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [wort, setWort] = useState<number | null>(null)
  const [gelegt, setGelegt] = useState<number[]>([])
  const teile = useMemo(() => (a.art === 'satzbau' ? teileGemischt(a.teile ?? []) : []), [a])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const optionen = useMemo(() => (a.art === 'auswahl' ? mische(a.optionen ?? []) : []), [a])
  const eingabe = useRef<HTMLInputElement>(null)
  useEffect(() => eingabe.current?.focus(), [a.id, wort])
  const absenden = (): void => {
    if (gesperrt) return
    if (a.art === 'fehler') {
      if (wort === null || !text.trim()) return
      return antworten(text, woerterVon(a.satz)[wort])
    }
    if (a.art === 'satzbau') {
      if (gelegt.length !== teile.length) return
      return antworten(gelegt.map((i) => teile[i]).join(' '))
    }
    if (text.trim()) antworten(text)
  }
  const [vor, nach] = a.satz.split('___')
  return (
    <Stack gap="sm" data-aufgabe={a.art}>
      <Text c="dimmed" size="sm">
        {a.anweisung || ART_NAME[a.art]}
      </Text>
      {a.art === 'luecke' && (
        <form onSubmit={(e) => (e.preventDefault(), absenden())}>
          <Text fz={22} fw={600} style={{ lineHeight: 1.9 }}>
            {vor}
            <TextInput
              ref={eingabe}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              disabled={gesperrt}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              display="inline-block"
              w={Math.max(120, (a.loesungen[0]?.length ?? 6) * 16)}
              size="md"
              styles={{ input: { fontSize: 20, fontWeight: 700 } }}
              data-luecke-eingabe
            />
            {nach}
          </Text>
          {a.vorgabe && (
            <Text c="dimmed" size="sm">
              {a.vorgabe}
            </Text>
          )}
          <Button mt="sm" type="submit" disabled={gesperrt || !text.trim()} data-pruefen>
            Prüfen
          </Button>
        </form>
      )}
      {a.art === 'auswahl' && (
        <>
          <Text fz={22} fw={600}>
            {vor}
            <Text span c="var(--vt-a)" fw={800}>
              {gewaehlt ?? '___'}
            </Text>
            {nach}
          </Text>
          <SimpleGrid cols={2}>
            {optionen.map((o) => (
              <Button
                key={o}
                size="lg"
                variant={gewaehlt === o ? 'filled' : 'default'}
                color={gewaehlt === o ? (ergebnis?.urteil === 'richtig' ? 'green' : ergebnis ? 'red' : undefined) : undefined}
                disabled={gesperrt && gewaehlt !== o}
                onClick={() => {
                  if (gesperrt) return
                  setGewaehlt(o)
                  antworten(o)
                }}
                data-option={o}
              >
                {o}
              </Button>
            ))}
          </SimpleGrid>
        </>
      )}
      {a.art === 'umformen' && (
        <form onSubmit={(e) => (e.preventDefault(), absenden())}>
          <Text fz={20} fw={600}>
            {a.satz}
          </Text>
          {a.vorgabe && <Text c="var(--vt-a)">{a.vorgabe}</Text>}
          <TextInput
            ref={eingabe}
            mt="sm"
            size="lg"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            disabled={gesperrt}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-umformen-eingabe
          />
          <Button mt="sm" type="submit" disabled={gesperrt || !text.trim()} data-pruefen>
            Prüfen
          </Button>
        </form>
      )}
      {a.art === 'fehler' && (
        <form onSubmit={(e) => (e.preventDefault(), absenden())}>
          <Group gap={6}>
            {woerterVon(a.satz).map((w, i) => (
              <Button
                key={i}
                size="md"
                variant={wort === i ? 'filled' : 'default'}
                color={wort === i ? 'red' : undefined}
                disabled={gesperrt}
                onClick={() => setWort(i)}
                data-fehlerwort={w}
              >
                {w}
              </Button>
            ))}
          </Group>
          {wort !== null && (
            <Group mt="sm" align="flex-end">
              <TextInput
                ref={eingabe}
                label={`Statt „${woerterVon(a.satz)[wort]}" richtig:`}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                disabled={gesperrt}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-korrektur-eingabe
              />
              <Button type="submit" disabled={gesperrt || !text.trim()} data-pruefen>
                Prüfen
              </Button>
            </Group>
          )}
        </form>
      )}
      {a.art === 'satzbau' && (
        <>
          <Paper withBorder radius="md" p="sm" mih={56} data-satz-gelegt>
            <Group gap={6}>
              {gelegt.map((i, k) => (
                <Button key={k} variant="light" disabled={gesperrt} onClick={() => setGelegt(gelegt.filter((_, x) => x !== k))}>
                  {teile[i]}
                </Button>
              ))}
            </Group>
          </Paper>
          <Group gap={6}>
            {teile.map((t, i) =>
              gelegt.includes(i) ? null : (
                <Button key={i} variant="default" disabled={gesperrt} onClick={() => setGelegt([...gelegt, i])} data-satzteil={t}>
                  {t}
                </Button>
              )
            )}
          </Group>
          <Button disabled={gesperrt || gelegt.length !== teile.length} onClick={absenden} w="fit-content" data-pruefen>
            Prüfen
          </Button>
        </>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- Spiele

function Spiel({ d, spiel, fertig }: { d: Daten; spiel: GrammatikSpielId; fertig: (r?: Partial<Daten>) => void }): React.JSX.Element {
  const farbe = useVtFarbe()
  const info = GRAMMATIK_SPIELE.find((s) => s.id === spiel)!
  const zeitSpiel = spiel === 'formenblitz' || spiel === 'satzbaupuzzle'
  const dauer = spiel === 'formenblitz' ? 60 : 120
  const runden = useMemo(() => {
    if (spiel === 'regelzuordnen') return mische(regelBeispiele(d.paket)).slice(0, 10)
    const art = spiel === 'fehlerjagd' ? 'fehler' : spiel === 'satzbaupuzzle' ? 'satzbau' : 'auswahl'
    const l = mische(d.paket.aufgaben.filter((a) => a.art === art))
    return zeitSpiel ? [...l, ...mische(l), ...mische(l)] : l.slice(0, 8)
  }, [d.paket, spiel, zeitSpiel])
  const [nr, setNr] = useState(0)
  const [punkte, setPunkte] = useState(0)
  const [fehler, setFehler] = useState<string[]>([])
  const [rest, setRest] = useState(dauer)
  const [urteil, setUrteil] = useState<Urteil | null>(null)
  const [ende, setEnde] = useState<{ rekord: boolean } | null>(null)
  const beendet = useRef(false)
  const abschliessen = useCallback(
    async (p: number, f: string[]) => {
      if (beendet.current) return
      beendet.current = true
      try {
        const r = await senden<{ rekord: boolean; rekorde: Record<string, number>; ansehen: string[] }>('/s/api/grammatik/spiel', {
          id: d.id,
          spiel,
          wert: p,
          fehler: f
        })
        setEnde({ rekord: r.rekord })
        ton('geschafft')
        d.rekorde = r.rekorde
      } catch {
        setEnde({ rekord: false })
      }
    },
    [d, spiel]
  )
  useEffect(() => {
    if (!zeitSpiel || ende) return
    const t = setInterval(() => setRest((x) => x - 1), 1000)
    return () => clearInterval(t)
  }, [zeitSpiel, ende])
  useEffect(() => {
    if (zeitSpiel && rest <= 0) void abschliessen(punkte, fehler)
  }, [rest, zeitSpiel, punkte, fehler, abschliessen])
  const naechste = (ok: boolean, aufgabeId?: string): void => {
    setUrteil(ok ? 'richtig' : 'falsch')
    // Zeitspiele: Falsch auf Zeit (08.10.2026, Wunsch der Lehrkraft): ein Punkt und eine Sekunde weniger
    const p = ok ? punkte + 1 : zeitSpiel ? Math.max(0, punkte - 1) : punkte
    if (!ok && zeitSpiel) setRest((r) => r - 1)
    const f = !ok && aufgabeId ? [...fehler, aufgabeId] : fehler
    setPunkte(p)
    setFehler(f)
    setTimeout(
      () => {
        setUrteil(null)
        if (nr + 1 >= runden.length) void abschliessen(p, f)
        else setNr(nr + 1)
      },
      ok ? 450 : 1300
    )
  }
  if (ende)
    return (
      <Stack align="center" py="xl" className="vt vt-rein" data-spiel-ende>
        <style>{CSS}</style>
        <IconTrophy size={48} color={ende.rekord ? '#f59e0b' : 'gray'} />
        <Title order={2}>
          {punkte} {info.einheit}
        </Title>
        {ende.rekord && <Badge color="yellow">Neuer Rekord!</Badge>}
        <Button size="lg" radius="xl" className="vt-los" onClick={() => fertig({ rekorde: d.rekorde })}>
          Zurück zum Kasten
        </Button>
      </Stack>
    )
  const runde = runden[nr]
  return (
    <Stack className="vt" data-spiel={spiel}>
      <style>{CSS}</style>
      <Group justify="space-between">
        <Button variant="subtle" color={farbe.a} leftSection={<IconX size={16} />} onClick={() => fertig()} px={4}>
          Abbrechen
        </Button>
        <Title order={4}>{spielName('gram', spiel, d.sprache, info.name)}</Title>
        <Badge size="lg" variant="light" color={farbe.a}>
          {zeitSpiel ? `${Math.max(0, rest)} s · ` : `${nr + 1}/${runden.length} · `}
          {punkte}
        </Badge>
      </Group>
      {zeitSpiel && <Progress value={(rest / dauer) * 100} color={farbe.a} radius="xl" />}
      <div
        key={nr}
        className="vt-rein vt-buehne"
        style={{ outline: urteil ? `3px solid ${urteil === 'richtig' ? '#2f9e44' : '#e03131'}` : undefined, borderRadius: 16 }}
      >
        {spiel === 'regelzuordnen' ? (
          <RegelRunde beispiel={runde as { satz: string; regelId: string }} regeln={d.paket.regeln} gesperrt={urteil !== null} urteil={(ok) => naechste(ok)} />
        ) : (
          <Aufgabe
            a={runde as GrammatikAufgabe}
            gesperrt={urteil !== null}
            ergebnis={urteil ? { urteil } : null}
            antworten={(x, w) => {
              const a = runde as GrammatikAufgabe
              const okWort = a.art !== 'fehler' || (w !== undefined && normiert(w) === normiert(a.fehlerWort ?? ''))
              const ok = okWort && a.loesungen.some((l) => normiert(l) === normiert(x))
              if (ok && GETIPPT.includes(a.art)) apostrophHinweis(x)
              naechste(ok, a.id)
            }}
          />
        )}
      </div>
      {urteil === null && spiel !== 'regelzuordnen' && runde && GETIPPT.includes((runde as GrammatikAufgabe).art) && (
        <Group justify="center">
          <LoesungZeigen zeigen={() => naechste(false, (runde as GrammatikAufgabe).id)} />
        </Group>
      )}
      {urteil === 'falsch' && spiel !== 'regelzuordnen' && <Text c="red">Richtig: {(runde as GrammatikAufgabe).loesungen[0]}</Text>}
    </Stack>
  )
}

function RegelRunde({
  beispiel,
  regeln,
  gesperrt,
  urteil
}: {
  beispiel: { satz: string; regelId: string }
  regeln: GrammatikPaket['regeln']
  gesperrt: boolean
  urteil: (ok: boolean) => void
}): React.JSX.Element {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const auswahl = useMemo(() => mische(regeln).slice(0, 4), [regeln])
  const optionen = auswahl.some((r) => r.id === beispiel.regelId)
    ? auswahl
    : [...auswahl.slice(0, 3), regeln.find((r) => r.id === beispiel.regelId)!].filter(Boolean)
  return (
    <Stack>
      <Text c="dimmed" size="sm">
        Welche Regel steckt in diesem Satz?
      </Text>
      <Text fz={22} fw={600}>
        {beispiel.satz}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {optionen.map((r) => (
          <Button
            key={r.id}
            size="lg"
            variant={gewaehlt === r.id ? 'filled' : 'default'}
            color={gewaehlt === r.id ? (r.id === beispiel.regelId ? 'green' : 'red') : undefined}
            disabled={gesperrt && gewaehlt !== r.id}
            onClick={() => {
              if (gesperrt) return
              setGewaehlt(r.id)
              urteil(r.id === beispiel.regelId)
            }}
            styles={{ label: { whiteSpace: 'normal' } }}
            h="auto"
            py="sm"
            data-regel-option={r.id}
          >
            {r.titel}
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
