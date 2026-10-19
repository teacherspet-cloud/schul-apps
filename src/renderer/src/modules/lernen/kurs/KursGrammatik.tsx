/**
 * Grammatik im Kurs (Sprachenlernen, 08.10.2026, abgestimmt): eine sortier- und filterbare Tabelle mit allen
 * Grammatik-Übungen des Kurses – freigegebene, Extra-Aufgaben einzelner Kinder und Entwürfe (KI fertig, noch nicht
 * freigegeben). Ein Klick öffnet das große Grammatik-Fenster: Aufgaben bearbeiten bzw. Lernstand und Einstellungen.
 * Dazu der Start der Förder-/Forderaufgaben (KI im Hintergrund, Ergebnis als Entwurf zum Prüfen).
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Chip,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Progress,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconDots, IconPencil, IconPlus, IconSearch, IconSparkles, IconTrash, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { ART_NAME, paketBereinigt, type AufgabenArt, type GrammatikPaket } from '@shared/grammatiktrainer'
import { STUFE_NAME, STUFEN, type Stufe } from '@shared/grammatikBank'
import { holen, senden } from '../../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../../shared/util'
import { starteAuftrag } from '../../../shared/auftraege'
import { useSortierTabelle, type Spalte } from '../../../shared/components/SortierTabelle'
import { EntwurfAnsehen, ladeEntwuerfe, Lernstand, speichereEntwuerfe, useEntwuerfe, type Entwurf } from '../GrammatikTraining'
import { erzeugeGrammatikPaket, erzeugeMehrAufgaben, mehrAnzahl, waehlbareArten, erzeugungsHinweis, type MehrAufgabenAuftrag } from '../grammatikErzeugen'
import { bekanntNachStand } from '@shared/zeitformSperre'
import { useAppSettings } from '../../../shared/settingsStore'
import { AufgabenEditor } from './AufgabenEditor'
import { KastenKopf, useGemerkt } from './Kasten'
import { bandGleich, grammatikNachLehrwerk, passtSuche, type GrammatikStandKurz, type KursAbschnittBezug } from './kursAnsicht'
import { LEHRWERK_GRAMMATIK } from '../../../shared/lehrwerkGrammatik'
import { BandGruppe } from '../../../shared/components/BandCover'
import { extraDocId, mehrAufgabenDocId } from './auftragsZiel'
import { useAufZu, useOffenGemerkt } from '../../../shared/sitzung'

/** Land und Schulform aus den Einstellungen – Maßstab für das Niveau der Grammatikaufgaben (09.10.2026, grammatikNiveau.ts) */
const niveauOrt = (): { land?: string; schulform?: string } => {
  const d = useAppSettings.getState().settings.defaults
  return { land: d?.stateId || undefined, schulform: d?.schoolTypeId || undefined }
}

export interface GrammatikZeile {
  id: string
  titel: string
  thema: string
  vokId?: string
  art?: string
  fuer?: { id: string; name: string }[]
  aufgaben: number
  lernende: number
  sicherSchnitt: number
  bearbeitetSchnitt?: number
  /** 'offen' | 'beendet' | 'entfernt' (08.10.2026: aus dem Kurs genommen, Lernstand bleibt) */
  status: string
  erstellt: string
  /** Schuljahr und Stelle im Lehrwerk (08.10.2026, Server: jahrgangDerGrammatik) */
  jahrgang?: number | null
  stelle?: number | null
  /** Regeltitel – für die Suche */
  regeln?: string[]
  /** Katalog-Themen der Freigabe (Dialog „Grammatik hinzufügen") */
  themen?: string[]
  /** Band und Unit (09.10.2026, Server: lehrwerkDerGrammatik) – Gliederung nach Lehrwerk */
  buch?: string
  unit?: string
  /** Station im Lehrwerk (10.10.2026, Gliederung Band › Unit › Station) */
  station?: string
  /** Geplante Freischaltung (ms) – noch nicht bei den Lernenden */
  geplantAb?: number | null
  /** Aus der Aufgabenbank (13.10.2026): Aufgaben werden in „Grammatikformen" gepflegt */
  bank?: boolean
}

/**
 * Stufen der hinterlegten Aufgaben in diesem Kurs (13.10.2026, abgestimmt): nach Schulform vorbelegt (Hauptschule
 * grundlegend, Gymnasium mittel + anspruchsvoll, sonst grundlegend + mittel), hier je Kurs änderbar – z. B. „anspruchsvoll"
 * für einen E-Kurs. Gilt für alle Grammatik des Kurses aus der Aufgabenbank; der Lernstand bleibt.
 */
function KursStufen({ vokId, geaendert }: { vokId: string; geaendert: () => void }): React.JSX.Element | null {
  const [stufen, setStufen] = useState<Stufe[] | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<{ stufen: Stufe[] }>(`/server/grammatik/kurs-stufen?vokId=${encodeURIComponent(vokId)}`).then(
      (r) => setStufen(r.stufen),
      () => setStufen(null)
    )
  }, [vokId])
  if (!stufen) return null
  const setze = async (neu: Stufe[]): Promise<void> => {
    if (!neu.length) return
    setLaeuft(true)
    try {
      const r = await senden<{ stufen: Stufe[] }>('/server/grammatik/kurs-stufen', { vokId, stufen: neu })
      setStufen(r.stufen)
      notifySuccess(`Übungen jetzt: ${r.stufen.map((st) => STUFE_NAME[st]).join(', ')}.`)
      geaendert()
    } catch (e) {
      notifyError(e, 'Nicht gespeichert')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Group gap="xs" data-kurs-stufen>
      <Text size="xs" c="dimmed">
        Schwierigkeit der Übungen:
      </Text>
      <Chip.Group multiple value={stufen} onChange={(v) => void setze(STUFEN.filter((st) => v.includes(st)))}>
        <Group gap={4}>
          {STUFEN.map((st) => (
            <Chip key={st} value={st} size="xs" disabled={laeuft} data-kurs-stufe={st}>
              {STUFE_NAME[st]}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </Group>
  )
}

/** Nach Änderungen im Hintergrund (z. B. „+ Aufgaben" fertig) lädt die Grammatik des Kurses neu */
export const GRAMMATIK_GEAENDERT = 'kurs-grammatik-geaendert'

/**
 * Grammatik eines Kurses mit Lernstand für den Kasten „Units" (17.10.2026): nur, was beim ganzen Kurs angekommen ist –
 * ohne Entferntes, Geplantes und Extra für Einzelne. Lädt nach Änderungen an der Grammatik neu.
 */
export function useKursGrammatikStand(vokId: string, stand = 0): GrammatikStandKurz[] {
  const [liste, setListe] = useState<GrammatikStandKurz[]>([])
  const laden = useCallback(
    () =>
      void holen<{ zuweisungen: GrammatikZeile[] }>('/server/grammatik').then(
        (r) =>
          setListe(
            r.zuweisungen
              .filter((g) => g.vokId === vokId && g.status !== 'entfernt' && !g.art && !((g.geplantAb ?? 0) > Date.now()))
              .map((g) => ({
                id: g.id,
                titel: g.titel,
                buch: g.buch,
                unit: g.unit,
                station: g.station,
                aufgaben: g.aufgaben,
                bearbeitet: g.bearbeitetSchnitt ?? 0,
                sicher: g.sicherSchnitt
              }))
          ),
        () => setListe([])
      ),
    [vokId]
  )
  useEffect(laden, [laden, stand])
  useEffect(() => {
    window.addEventListener(GRAMMATIK_GEAENDERT, laden)
    return () => window.removeEventListener(GRAMMATIK_GEAENDERT, laden)
  }, [laden])
  return liste
}

/** Zeile der Tabelle: freigegeben oder Entwurf */
type Zeile = { art: 'frei'; g: GrammatikZeile } | { art: 'entwurf'; e: Entwurf }

const ART_TEXT = (art: string | undefined, fuer?: { name: string }[]): string =>
  art === 'foerder' || art === 'forder' ? `Extra für ${(fuer ?? []).map((f) => f.name).join(', ')}` : 'ganzer Kurs'

/** Grammatik-Fenster: Aufgaben bearbeiten | Lernstand und Einstellungen */
export function GrammatikFenster({ id, schliessen, nurAufgaben }: { id: string; schliessen: () => void; nurAufgaben?: boolean }): React.JSX.Element {
  const [d, setD] = useState<{ titel: string; paket: GrammatikPaket; info?: { bank?: string[] } } | null>(null)
  const [paket, setPaket] = useState<GrammatikPaket | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const laden = useCallback(
    () =>
      void holen<{ titel: string; paket: GrammatikPaket; info?: { bank?: string[] } }>(`/server/grammatik/${id}`).then(
        (r) => (setD(r), setPaket(r.paket)),
        (e: unknown) => notifyError(e)
      ),
    [id]
  )
  useEffect(laden, [laden])
  const geaendert = Boolean(d && paket && JSON.stringify(d.paket) !== JSON.stringify(paket))
  const speichern = async (): Promise<void> => {
    if (!paket) return
    setLaeuft(true)
    try {
      const r = await senden<{ aufgaben: number; paket: GrammatikPaket }>(`/server/grammatik/${id}/paket`, { paket })
      const weg = paket.aufgaben.length - r.aufgaben
      notifySuccess(weg > 0 ? `Gespeichert – ${weg} unvollständige Aufgabe(n) wurden entfernt.` : 'Gespeichert – die Lernenden sehen die Änderungen sofort.')
      setD({ ...d!, paket: r.paket })
      setPaket(r.paket)
    } catch (e) {
      notifyError(e, 'Nicht gespeichert')
    } finally {
      setLaeuft(false)
    }
  }
  const editor = !paket ? (
    <Loader size="sm" />
  ) : d?.info?.bank?.length ? (
    // Aufgabenbank (13.10.2026): hier nur ansehen – geändert wird an der Form, dann gilt es in allen Kursen
    <Stack data-grammatik-aus-bank>
      <Alert color="blue" p="sm">
        Diese Aufgaben sind an der Grammatikform hinterlegt. Ändern und ergänzen in der App „Grammatikformen“ (Grammatikpunkt anklicken → Übungsaufgaben) – die
        Änderung gilt dann in allen Kursen.
      </Alert>
      <Text size="sm" c="dimmed">
        {paket.aufgaben.length} Aufgaben in {paket.regeln.length} Teilbereichen: {paket.regeln.map((r) => r.titel).join(' · ')}
      </Text>
    </Stack>
  ) : (
    <Stack>
      <AufgabenEditor paket={paket} aendern={setPaket} />
      <Group justify="flex-end" pos="sticky" bottom={0} py="xs" bg="var(--mantine-color-body)">
        <Button variant="default" disabled={!geaendert} onClick={() => setPaket(d!.paket)}>
          Verwerfen
        </Button>
        <Button loading={laeuft} disabled={!geaendert} onClick={() => void speichern()} data-grammatik-speichern>
          Änderungen speichern
        </Button>
      </Group>
    </Stack>
  )
  // „Bearbeiten" in der Aufgaben-Spalte (08.10.2026): nur die Aufgaben – ändern oder löschen, die übrigen behalten ihre Kennung
  if (nurAufgaben)
    return (
      <Modal
        opened
        onClose={schliessen}
        title={`${d?.titel ?? 'Grammatik'} – Aufgaben bearbeiten`}
        size="xl"
        fullScreen={window.matchMedia?.('(max-width: 700px)').matches}
      >
        <div data-grammatik-fenster data-aufgaben-bearbeiten-fenster>
          {editor}
        </div>
      </Modal>
    )
  return (
    <Modal opened onClose={schliessen} title={d?.titel ?? 'Grammatik'} size="xl" fullScreen={window.matchMedia?.('(max-width: 700px)').matches}>
      <Tabs defaultValue="aufgaben" data-grammatik-fenster>
        <Tabs.List mb="md">
          <Tabs.Tab value="aufgaben">Aufgaben</Tabs.Tab>
          <Tabs.Tab value="lernstand" data-reiter-lernstand>
            Lernstand und Einstellungen
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="aufgaben">{editor}</Tabs.Panel>
        <Tabs.Panel value="lernstand">
          <Lernstand id={id} zurueck={schliessen} imFenster />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}

/**
 * „+ Aufgaben" (08.10.2026, Wunsch der Lehrkraft): weitere Aufgaben zu einer freigegebenen Grammatik erstellen lassen –
 * Anzahl 4–20, Aufgabenarten, Schwierigkeit und Wünsche. Die KI arbeitet im Hintergrund; die neuen Aufgaben werden
 * angehängt, die bisherigen behalten ihre Kennungen (der Lernstand bleibt).
 */
export function MehrAufgabenFenster({ g, schliessen }: { g: GrammatikZeile; schliessen: () => void }): React.JSX.Element {
  const [d, setD] = useState<{
    titel: string
    fach: string
    sprache?: string
    thema: string
    info?: { jahrgang?: number; themen?: string[]; lehrwerk?: { buch?: string; unit?: string } }
    paket: GrammatikPaket
  } | null>(null)
  const [anzahl, setAnzahl] = useState(10)
  const [arten, setArten] = useState<AufgabenArt[] | null>(null)
  const [schwierigkeit, setSchwierigkeit] = useState<MehrAufgabenAuftrag['schwierigkeit']>('mittel')
  const [wunsch, setWunsch] = useState('')
  useEffect(
    () =>
      void holen<NonNullable<typeof d>>(`/server/grammatik/${g.id}`).then(
        (r) => setD(r),
        (e: unknown) => (notifyError(e), schliessen())
      ),
    [g.id] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const moeglich = d ? waehlbareArten(d.sprache ?? '', d.fach) : []
  // Vorauswahl: die Arten, die schon im Paket vorkommen (sonst alle)
  const vorhanden = d ? moeglich.filter((a) => d.paket.aufgaben.some((x) => x.art === a)) : []
  const gewaehlt = arten ?? (vorhanden.length ? vorhanden : moeglich)
  const starten = (): void => {
    if (!d || !gewaehlt.length) return
    const eingabe: MehrAufgabenAuftrag = {
      thema: d.thema || d.titel,
      fach: d.fach,
      sprache: d.sprache ?? '',
      jahrgang: d.info?.jahrgang ?? g.jahrgang ?? 6,
      anzahl: mehrAnzahl(anzahl),
      arten: gewaehlt,
      schwierigkeit,
      wunsch: wunsch.trim() || undefined,
      regeln: d.paket.regeln.map((r) => ({ id: r.id, titel: r.titel, erklaerung: r.erklaerung, beispiele: r.beispiele })),
      vorhanden: d.paket.aufgaben.map((a) => (a.satz || a.form || (a.teile ?? []).join(' ')).slice(0, 120)).filter(Boolean),
      // Bekannte Grammatik (09.10.2026): Lehrwerk-Stand der Freigabe, sonst der Jahrgang – unbekannte Zeitformen gesperrt
      bekannt: bekanntNachStand(d.info?.lehrwerk, d.info?.jahrgang ?? g.jahrgang ?? 6),
      themenIds: d.info?.themen ?? [],
      // Maßstab für das Niveau (09.10.2026): „Schwierigkeit" gilt relativ zu Land, Schulform und Klasse
      ...niveauOrt()
    }
    const titel = d.titel
    void starteAuftrag({
      moduleId: 'sprachenlernen',
      // „Öffnen" im Auftrag: Kurs mit dem Fenster dieser Grammatik (auftragsZiel.ts)
      docId: mehrAufgabenDocId(g.id),
      titel: `${titel}: ${eingabe.anzahl} weitere Aufgaben`,
      art: 'Weitere Grammatikaufgaben',
      eingabe,
      sperrt: false,
      fehlerTitel: 'Weitere Aufgaben konnten nicht erstellt werden',
      arbeit: async (e, h) => erzeugeMehrAufgaben(e, h.ai, (x) => h.melde(x)),
      ablegen: async (paket) => {
        const r = await senden<{ dazu: number; aufgaben: number }>(`/server/grammatik/${g.id}/anhaengen`, { paket })
        window.dispatchEvent(new Event(GRAMMATIK_GEAENDERT))
        notifySuccess(`„${titel}": ${r.dazu} neue Aufgaben angehängt – jetzt ${r.aufgaben}. Die Lernenden üben sie gleich mit.`)
      },
      abschluss: (p) => `${p.aufgaben.length} Aufgaben angehängt${erzeugungsHinweis(p)}`
    })
    notifySuccess('Die KI erstellt die weiteren Aufgaben im Hintergrund – sie werden danach automatisch angehängt.')
    schliessen()
  }
  return (
    <Modal opened onClose={schliessen} title={`Weitere Aufgaben – ${g.titel}`} size="lg">
      {!d ? (
        <Loader size="sm" />
      ) : (
        <Stack data-mehr-aufgaben-fenster>
          <Text size="sm" c="dimmed">
            Bisher {d.paket.aufgaben.length} Aufgaben zu {d.paket.regeln.length} {d.paket.regeln.length === 1 ? 'Regel' : 'Regeln'}. Die neuen kommen dazu; der
            Lernstand der Lernenden bleibt.
          </Text>
          <NumberInput
            label="Anzahl"
            min={4}
            max={20}
            value={anzahl}
            onChange={(v) => setAnzahl(Number(v) || 4)}
            clampBehavior="strict"
            w={140}
            data-mehr-anzahl
          />
          <Checkbox.Group label="Aufgabenarten" value={gewaehlt} onChange={(v) => setArten(v as AufgabenArt[])} data-mehr-arten>
            <Group gap="md" mt={4}>
              {moeglich.map((a) => (
                <Checkbox key={a} value={a} label={ART_NAME[a]} data-mehr-art={a} />
              ))}
            </Group>
          </Checkbox.Group>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Schwierigkeit
            </Text>
            <SegmentedControl
              value={schwierigkeit}
              onChange={(v) => setSchwierigkeit(v as typeof schwierigkeit)}
              data={[
                { value: 'grundlegend', label: 'grundlegend' },
                { value: 'mittel', label: 'mittel' },
                { value: 'anspruchsvoll', label: 'anspruchsvoll' }
              ]}
              data-mehr-schwierigkeit
            />
          </Stack>
          <Textarea
            label="Wünsche (optional)"
            autosize
            minRows={2}
            value={wunsch}
            onChange={(e) => setWunsch(e.currentTarget.value)}
            placeholder="z. B. mehr Fragen und Verneinungen, Wortschatz aus Unit 3"
            data-mehr-wunsch
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button leftSection={<IconSparkles size={16} />} disabled={!gewaehlt.length} onClick={starten} data-mehr-starten>
              {mehrAnzahl(anzahl)} Aufgaben erstellen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

/** Offene Jahre je Kurs, gemerkt für die Sitzung (shared/sitzung.ts, 09.10.2026; in „Meine Klassen" dauerhaft, 10.10.2026) */
const JAHRE_SCHLUESSEL = (vokId: string): string => `schulapps-vok-grammatik-jahre-${vokId}`

/**
 * Die Grammatik des Kurses (08.10.2026, abgestimmt): zugeklappter Kasten, „Grammatik hinzufügen" im Kopf (auch
 * zugeklappt erreichbar); innen nach Schuljahren wie im Ordner der Lernenden – neuestes Jahr oben und offen, eine Suche
 * über Titel, Thema und Regeln öffnet alle passenden Jahre. Entfernen behält den Lernstand („Entfernt (n)" mit
 * Wiederherstellen); „Endgültig löschen" löscht ihn mit.
 */
export function KursGrammatik({
  vokId,
  hinzufuegen,
  geoeffnet,
  oeffnen,
  stand,
  immerOffen = false,
  eingebettet = false,
  abschnitte
}: {
  vokId: string
  /** Fach des Kurses (bis 10.10.2026 für die Jahrgangs-Überschriften; die Gliederung folgt jetzt dem Lehrwerk) */
  fach: string
  /** Knopf „+ Grammatik hinzufügen" */
  hinzufuegen: () => void
  /** Von außen geöffnete Grammatik (z. B. aus „Meine Klassen") */
  geoeffnet: string | null
  oeffnen: (id: string | null) => void
  /** Zähler zum Neuladen (nach Freigaben) */
  stand: number
  /** Im Reiter „Grammatik" der Kursseite (09.10.2026): ohne Auf- und Zuklappen */
  immerOffen?: boolean
  /** In „Meine Klassen" (09.10.2026, Wunsch der Lehrkraft): zuklappbar, zu Beginn offen */
  eingebettet?: boolean
  /** Abschnitte des Vokabelkurses (10.10.2026): Band › Unit › Station wie bei den Vokabeln, Einordnung nach Freigabezeit */
  abschnitte?: KursAbschnittBezug[]
}): React.JSX.Element {
  const [liste, setListe] = useState<GrammatikZeile[] | null>(null)
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null)
  const [offenGemerkt, setOffen] = useGemerkt(eingebettet ? 'mk-grammatik-liste-offen' : 'vok-kasten-grammatik', eingebettet)
  const offen = (immerOffen && !eingebettet) || offenGemerkt
  // „Entfernt (n)": bisher ungemerkt; in „Meine Klassen" dauerhaft (10.10.2026)
  const [entferntOffen, setEntferntOffen] = useAufZu(`grammatik-entfernt-${vokId}`, false)
  const [suche, setSuche] = useState('')
  const [jahre, setJahre] = useOffenGemerkt<Record<string, boolean>>(JAHRE_SCHLUESSEL(vokId), {})
  const [frage, setFrage] = useState<{ was: 'entfernen' | 'loeschen'; g: GrammatikZeile } | null>(null)
  const [mehr, setMehr] = useState<GrammatikZeile | null>(null)
  const [bearbeiten, setBearbeiten] = useState<string | null>(null)
  const entwuerfe = useEntwuerfe().filter((e) => e.empfaenger.vokId === vokId)
  const laden = useCallback(
    () =>
      void holen<{ zuweisungen: GrammatikZeile[] }>('/server/grammatik').then(
        (r) => setListe(r.zuweisungen.filter((g) => g.vokId === vokId)),
        () => setListe([])
      ),
    [vokId]
  )
  useEffect(laden, [laden, stand])
  useEffect(() => {
    window.addEventListener(GRAMMATIK_GEAENDERT, laden)
    return () => window.removeEventListener(GRAMMATIK_GEAENDERT, laden)
  }, [laden])
  const aktive = (liste ?? []).filter((g) => g.status !== 'entfernt')
  const entfernte = (liste ?? []).filter((g) => g.status === 'entfernt')
  const zeilen: Zeile[] = [...entwuerfe.map((e) => ({ art: 'entwurf' as const, e })), ...aktive.map((g) => ({ art: 'frei' as const, g }))]
  const spalten: Spalte<Zeile>[] = [
    {
      id: 'titel',
      label: 'Grammatik',
      wert: (z) => (z.art === 'frei' ? z.g.titel : z.e.titel).toLowerCase(),
      filter: 'text',
      filterWert: (z) => (z.art === 'frei' ? `${z.g.titel} ${z.g.thema}` : z.e.titel)
    },
    {
      id: 'fuer',
      label: 'Für',
      wert: (z) => (z.art === 'frei' ? ART_TEXT(z.g.art, z.g.fuer) : ART_TEXT(z.e.empfaenger.art, z.e.empfaenger.fuer)),
      filterWert: (z) => ((z.art === 'frei' ? z.g.art : z.e.empfaenger.art) ? 'Extra einzelner' : 'ganzer Kurs'),
      filter: 'auswahl'
    },
    { id: 'aufgaben', label: 'Aufgaben', wert: (z) => (z.art === 'frei' ? z.g.aufgaben : z.e.paket.aufgaben.length), absteigend: true },
    { id: 'bearbeitet', label: 'bearbeitet Ø', wert: (z) => (z.art === 'frei' ? z.g.bearbeitetSchnitt ?? 0 : -1), absteigend: true },
    { id: 'sicher', label: 'sicher Ø', wert: (z) => (z.art === 'frei' ? z.g.sicherSchnitt : -1), absteigend: true }
  ]
  // Spalte „Status" entfällt (08.10.2026, Wunsch der Lehrkraft): Entwürfe stehen oben, „abgeschlossen" als Plakette am Titel
  const t = useSortierTabelle(zeilen, spalten, { spalte: 'titel', ab: false })
  const sucht = suche.trim().length > 0
  const gefunden = [...t.sichtbar.filter((z) => z.art === 'entwurf'), ...t.sichtbar.filter((z) => z.art !== 'entwurf')].filter((z) =>
    passtSuche(z.art === 'frei' ? [z.g.titel, z.g.thema, ...(z.g.regeln ?? [])] : [z.e.titel, z.e.thema, ...z.e.paket.regeln.map((r) => r.titel)], suche)
  )
  /*
   * Gliederung wie die Vokabeln (10.10.2026, Entscheidung der Lehrkraft): Band (mit Cover) › Unit › Station › Themen –
   * nur Freigegebenes, Späteres oben (kursAnsicht.ts `grammatikNachLehrwerk`). Was sich keiner Stelle im Lehrwerk zuordnen
   * lässt, steht unter der Unit, in der es freigegeben wurde. Entwürfe (zum Prüfen) stehen darüber, Geplantes darunter.
   * Die Suche geht über alle Gruppen und öffnet die passenden.
   */
  const jetzt = Date.now()
  const entwurfZeilen = gefunden.filter((z): z is Extract<Zeile, { art: 'entwurf' }> => z.art === 'entwurf')
  const freiZeilen = gefunden.filter((z): z is Extract<Zeile, { art: 'frei' }> => z.art === 'frei')
  const geplantZeilen = freiZeilen.filter((z) => (z.g.geplantAb ?? 0) > jetzt)
  const gliederung = grammatikNachLehrwerk(
    freiZeilen.filter((z) => !((z.g.geplantAb ?? 0) > jetzt)),
    (z) => (z.g.buch ? { buch: z.g.buch, unit: z.g.unit, station: z.g.station } : null),
    (z) => Math.max(Date.parse(z.g.erstellt) || 0, z.g.geplantAb ?? 0),
    (abschnitte ?? []).filter((x) => x.zeit <= jetzt),
    (buch) => Object.keys(LEHRWERK_GRAMMATIK[Object.keys(LEHRWERK_GRAMMATIK).find((k) => bandGleich(k, buch)) ?? ''] ?? {})
  )
  const ersteBand = gliederung.baende[0]
  const ersteUnit = ersteBand?.units[0]
  const vorgabeOffen = (k: string): boolean =>
    k === ersteBand?.schluessel || k === ersteUnit?.schluessel || k === 'ohne' || (ersteUnit ? k === `${ersteUnit.schluessel}|${ersteUnit.stationen[0]?.station ?? ''}` : false)
  const istAuf = (k: string): boolean => sucht || (k in jahre ? jahre[k] : vorgabeOffen(k))
  const umschalten = (k: string): void => {
    if (sucht) return
    setJahre({ ...jahre, [k]: !istAuf(k) })
  }
  const anzahl = (n: number): React.JSX.Element => (
    <Badge size="sm" variant="light" color="gray">
      {n}
    </Badge>
  )
  const ausfuehren = (was: 'entfernen' | 'loeschen' | 'wiederherstellen', g: GrammatikZeile): void =>
    void senden(`/server/grammatik/${g.id}/${was}`, {}).then(
      () => (
        notifySuccess(
          was === 'entfernen'
            ? `„${g.titel}" entfernt – der Lernstand bleibt gespeichert.`
            : was === 'loeschen'
            ? `„${g.titel}" endgültig gelöscht.`
            : `„${g.titel}" ist wieder im Kurs.`
        ),
        setFrage(null),
        laden()
      ),
      (e: unknown) => notifyError(e)
    )
  const halt = (e: React.MouseEvent): void => e.stopPropagation()
  /** Kurzangabe einer Gruppe: Zahl der Themen, Ø sicher */
  const zusatzText = (gs: GrammatikZeile[], units?: number): string => {
    const sicher = gs.length ? gs.reduce((s, g) => s + g.sicherSchnitt, 0) / gs.length : null
    return [
      units !== undefined ? `${units} ${units === 1 ? 'Unit' : 'Units'}` : '',
      `${gs.length} ${gs.length === 1 ? 'Thema' : 'Themen'}`,
      sicher !== null && gs.length ? `${Math.round(sicher * 100)} % sicher` : ''
    ]
      .filter(Boolean)
      .join(' · ')
  }
  /** Balken: sicher (grün) · bearbeitet (lila) · offen (grau) – wie die Grammatik-Balken im Kasten „Units" */
  const standBalken = (bearbeitet: number, sicher: number): React.JSX.Element => (
    <Tooltip label={`sicher ${Math.round(sicher * 100)} % · bearbeitet ${Math.round(bearbeitet * 100)} %`}>
      <Progress.Root size="sm" radius="xl" w={64} style={{ flexShrink: 0, gap: 2 }}>
        <Progress.Section value={sicher * 100} color="teal" />
        <Progress.Section value={Math.max(0, bearbeitet - sicher) * 100} color="grape.4" />
        <Progress.Section value={Math.max(0, 1 - bearbeitet) * 100} color="gray.4" />
      </Progress.Root>
    </Tooltip>
  )
  const entwurfZeile = (e: Entwurf): React.JSX.Element => (
    <UnstyledButton key={e.schluessel} onClick={() => setEntwurf(e)} data-grammatik-entwurf={e.titel} style={{ display: 'block', width: '100%' }}>
      <Group gap={6} wrap="nowrap">
        <Text size="sm" fw={500} truncate style={{ flex: '1 1 120px', minWidth: 60 }}>
          {e.titel}
        </Text>
        <Badge size="xs" variant="light" color={e.empfaenger.art ? 'teal' : 'grape'} tt="none" style={{ flexShrink: 0 }}>
          {ART_TEXT(e.empfaenger.art, e.empfaenger.fuer)}
        </Badge>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {e.paket.aufgaben.length} Aufg.
        </Text>
        <Badge color="yellow" variant="light" tt="none" size="sm" style={{ flexShrink: 0 }}>
          Entwurf – prüfen
        </Badge>
      </Group>
    </UnstyledButton>
  )
  const freiZeile = (g: GrammatikZeile): React.JSX.Element => (
    <div
      key={g.id}
      className="kg-zeile"
      style={{ cursor: 'pointer', borderRadius: 6, padding: '2px 4px' }}
      onClick={() => oeffnen(g.id)}
      data-grammatik-zeile={g.id}
    >
      <Group gap={6} wrap="nowrap">
        <div style={{ flex: '1 1 140px', minWidth: 60 }}>
          <Text size="sm" fw={500} truncate title={g.thema && g.thema !== g.titel ? `${g.titel} – ${g.thema}` : g.titel}>
            {g.titel}
            {g.status === 'beendet' && (
              <Badge ml={6} size="xs" variant="light" color="gray" tt="none" data-grammatik-abgeschlossen>
                abgeschlossen
              </Badge>
            )}
          </Text>
        </div>
        <Badge size="xs" variant="light" color={g.art ? 'teal' : 'grape'} tt="none" style={{ flexShrink: 0 }} visibleFrom="sm">
          {ART_TEXT(g.art, g.fuer)}
        </Badge>
        <Group gap={2} wrap="nowrap" onClick={halt} style={{ cursor: 'default', flexShrink: 0 }} data-grammatik-aufgaben={g.id}>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }} mr={2}>
            {g.aufgaben} Aufg.
          </Text>
          {g.bank ? (
            <Tooltip label="An der Grammatikform hinterlegt – ändern in der App „Grammatikformen“">
              <Badge size="xs" variant="light" color="blue" tt="none" data-grammatik-bank={g.id}>
                hinterlegt
              </Badge>
            </Tooltip>
          ) : (
            <>
              <Tooltip label="Weitere Aufgaben erstellen">
                <ActionIcon size="sm" variant="subtle" color="grape" onClick={() => setMehr(g)} aria-label="Weitere Aufgaben" data-grammatik-mehr={g.id}>
                  <IconPlus size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Aufgaben bearbeiten">
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setBearbeiten(g.id)} aria-label="Bearbeiten" data-grammatik-bearbeiten={g.id}>
                  <IconPencil size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
        {standBalken(g.bearbeitetSchnitt ?? 0, g.sicherSchnitt)}
        <Text size="xs" c="dimmed" w={34} ta="right" style={{ flexShrink: 0 }}>
          {Math.round(g.sicherSchnitt * 100)} %
        </Text>
        <div onClick={halt}>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`${g.titel}: weitere Aktionen`} data-grammatik-aktionen={g.id}>
                <IconDots size={15} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconX size={14} />} onClick={() => setFrage({ was: 'entfernen', g })} data-grammatik-entfernen>
                Entfernen
              </Menu.Item>
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setFrage({ was: 'loeschen', g })} data-grammatik-loeschen>
                Endgültig löschen …
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </Group>
    </div>
  )
  return (
    <Card withBorder data-kurs-grammatik>
      {immerOffen && !eingebettet ? (
        <Group justify="space-between" wrap="nowrap">
          <Text fw={700}>Grammatik ({zeilen.length})</Text>
          <Button size="xs" variant="light" color="grape" leftSection={<IconPlus size={14} />} onClick={hinzufuegen} data-vokabel-grammatik>
            Grammatik hinzufügen
          </Button>
        </Group>
      ) : (
        <KastenKopf
          titel={`Grammatik (${zeilen.length})`}
          offen={offen}
          umschalten={() => setOffen(!offen)}
          data-kurs-grammatik-kopf
          rechts={
            <Button size="xs" variant="light" color="grape" leftSection={<IconPlus size={14} />} onClick={hinzufuegen} data-vokabel-grammatik>
              Grammatik hinzufügen
            </Button>
          }
        />
      )}
      {offen && (
        <Stack gap="xs" mt="sm">
          {!liste ? (
            <Loader size="sm" />
          ) : zeilen.length === 0 ? (
            <Text size="sm" c="dimmed">
              Noch keine Grammatik in diesem Kurs – mit „Grammatik hinzufügen“ ein Thema erstellen lassen oder ein fertiges verbinden.
            </Text>
          ) : (
            <>
              <TextInput
                placeholder="Grammatik suchen (Titel, Thema, Regel) …"
                leftSection={<IconSearch size={14} />}
                value={suche}
                onChange={(e) => setSuche(e.currentTarget.value)}
                maw={360}
                size="xs"
                data-grammatik-suche
              />
              {aktive.some((g) => g.bank) && <KursStufen vokId={vokId} geaendert={laden} />}
              {/*
               * Gliederung wie bei den Vokabeln (19.10.2026, Wunsch der Lehrkraft: übersichtlicher und grafischer): Band mit
               * Cover › Unit › Station – jede Ebene auf- und zuklappbar, Neuestes offen; je Thema eine ruhige Zeile mit Balken.
               */}
              <Stack gap={14} data-grammatik-gruppe-tabelle>
                {gefunden.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Nichts gefunden.
                  </Text>
                )}
                {/* Entwürfe zum Prüfen – noch nicht freigegeben, deshalb oben und immer offen */}
                {entwurfZeilen.length > 0 && (
                  <div
                    data-grammatik-entwuerfe={entwurfZeilen.length}
                    style={{ background: 'var(--mantine-color-yellow-light)', borderRadius: 8, padding: '6px 10px' }}
                  >
                    <Group gap="xs" wrap="nowrap" mb={4}>
                      <Text fw={700} size="sm">
                        Entwürfe zum Prüfen
                      </Text>
                      {anzahl(entwurfZeilen.length)}
                    </Group>
                    <Stack gap={4}>{entwurfZeilen.map((z) => entwurfZeile(z.e))}</Stack>
                  </div>
                )}
                {gliederung.baende.map((band) => {
                  const themen = band.units.flatMap((u) => u.stationen.flatMap((st) => st.eintraege.map((z) => z.g)))
                  return (
                    <BandGruppe
                      key={band.schluessel}
                      buch={band.buch}
                      ohneBand="Weitere Grammatik"
                      zusatz={zusatzText(themen, band.units.length)}
                      offen={istAuf(band.schluessel)}
                      umschalten={() => umschalten(band.schluessel)}
                      data-grammatik-band={band.buch || 'Weitere Grammatik'}
                    >
                      <Stack gap={12}>
                        {band.units.map((u) => {
                          const unitAuf = istAuf(u.schluessel)
                          const unitThemen = u.stationen.flatMap((st) => st.eintraege.map((z) => z.g))
                          const mitStationen = u.stationen.length > 1 || u.stationen.some((st) => st.station)
                          return (
                            <div key={u.schluessel}>
                              <UnstyledButton onClick={() => umschalten(u.schluessel)} aria-expanded={unitAuf} data-grammatik-unit={u.unit || 'ohne Unit'}>
                                <Group gap={6} wrap="nowrap">
                                  {unitAuf ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                  <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }}>
                                    {u.unit || 'Ohne Unit'}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {zusatzText(unitThemen)}
                                  </Text>
                                </Group>
                              </UnstyledButton>
                              {unitAuf && (
                                <Stack gap={8} mt={6} pl={{ base: 6, sm: 20 }}>
                                  {mitStationen
                                    ? u.stationen.map((st) => {
                                        const sk = `${u.schluessel}|${st.station}`
                                        const stAuf = istAuf(sk)
                                        return (
                                          <div key={sk}>
                                            <UnstyledButton onClick={() => umschalten(sk)} aria-expanded={stAuf} data-grammatik-station={st.station || 'Unit'}>
                                              <Group gap={6} wrap="nowrap">
                                                {stAuf ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                                                <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
                                                  {st.station || 'In dieser Unit freigegeben'}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                  {zusatzText(st.eintraege.map((z) => z.g))}
                                                </Text>
                                              </Group>
                                            </UnstyledButton>
                                            {stAuf && (
                                              <Stack gap={4} mt={4} pl={{ base: 6, sm: 18 }}>
                                                {st.eintraege.map((z) => freiZeile(z.g))}
                                              </Stack>
                                            )}
                                          </div>
                                        )
                                      })
                                    : u.stationen.flatMap((st) => st.eintraege.map((z) => freiZeile(z.g)))}
                                </Stack>
                              )}
                            </div>
                          )
                        })}
                      </Stack>
                    </BandGruppe>
                  )
                })}
                {gliederung.ohne.length > 0 && (
                  <BandGruppe
                    buch=""
                    ohneBand="Weitere Grammatik"
                    zusatz={zusatzText(gliederung.ohne.map((z) => z.g))}
                    offen={istAuf('ohne')}
                    umschalten={() => umschalten('ohne')}
                    data-grammatik-band="Weitere Grammatik"
                  >
                    <Stack gap={4}>{gliederung.ohne.map((z) => freiZeile(z.g))}</Stack>
                  </BandGruppe>
                )}
                {/* Geplant (Freigabe in der Zukunft) – noch nicht bei den Lernenden */}
                {geplantZeilen.length > 0 && (
                  <div>
                    <UnstyledButton onClick={() => umschalten('geplant')} aria-expanded={istAuf('geplant')} data-grammatik-geplant={geplantZeilen.length}>
                      <Group gap={6} wrap="nowrap">
                        {istAuf('geplant') ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                        <Text fw={700} size="sm" c="dimmed">
                          Geplant
                        </Text>
                        {anzahl(geplantZeilen.length)}
                      </Group>
                    </UnstyledButton>
                    {istAuf('geplant') && (
                      <Stack gap={4} mt={6} pl={{ base: 6, sm: 20 }}>
                        {geplantZeilen.map((z) => freiZeile(z.g))}
                      </Stack>
                    )}
                  </div>
                )}
              </Stack>
            </>
          )}
          {entfernte.length > 0 && (
            <div data-grammatik-entfernt>
              <UnstyledButton onClick={() => setEntferntOffen(!entferntOffen)} aria-expanded={entferntOffen} data-grammatik-entfernt-kopf>
                <Group gap={4}>
                  <IconChevronDown size={14} style={{ transform: entferntOffen ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
                  <Text size="sm" c="dimmed">
                    Entfernt ({entfernte.length})
                  </Text>
                </Group>
              </UnstyledButton>
              {entferntOffen && (
                <Stack gap={4} mt={4} pl="md">
                  {entfernte.map((g) => (
                    <Group key={g.id} justify="space-between" wrap="nowrap" data-grammatik-entfernt-zeile={g.id}>
                      <Text size="sm" c="dimmed">
                        {g.titel}
                        {g.art ? ` · ${ART_TEXT(g.art, g.fuer)}` : ''}
                      </Text>
                      <Group gap="xs" wrap="nowrap">
                        <Button size="compact-xs" variant="light" onClick={() => ausfuehren('wiederherstellen', g)} data-grammatik-wiederherstellen={g.id}>
                          Wiederherstellen
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="red"
                          onClick={() => setFrage({ was: 'loeschen', g })}
                          data-grammatik-endgueltig={g.id}
                        >
                          Endgültig löschen
                        </Button>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              )}
            </div>
          )}
        </Stack>
      )}
      <Modal opened={Boolean(frage)} onClose={() => setFrage(null)} title={frage?.was === 'loeschen' ? 'Grammatik endgültig löschen?' : 'Grammatik entfernen?'}>
        {frage && (
          <Stack gap="sm">
            <Text size="sm">
              {frage.was === 'loeschen'
                ? `„${frage.g.titel}" wird samt Lernstand aller Lernenden endgültig gelöscht. Das lässt sich nicht rückgängig machen.`
                : `„${frage.g.titel}" verschwindet für die Lernenden. Der Lernstand bleibt gespeichert und gilt wieder, wenn du die Grammatik wiederherstellst oder dasselbe Thema erneut hinzufügst.`}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setFrage(null)}>
                Abbrechen
              </Button>
              <Button color="red" onClick={() => ausfuehren(frage.was, frage.g)} data-grammatik-bestaetigen={frage.was}>
                {frage.was === 'loeschen' ? 'Endgültig löschen' : 'Entfernen'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
      {geoeffnet && <GrammatikFenster id={geoeffnet} schliessen={() => (oeffnen(null), laden())} />}
      {bearbeiten && <GrammatikFenster id={bearbeiten} nurAufgaben schliessen={() => (setBearbeiten(null), laden())} />}
      {mehr && <MehrAufgabenFenster g={mehr} schliessen={() => setMehr(null)} />}
      {entwurf && <EntwurfAnsehen e={entwurf} schliessen={() => setEntwurf(null)} fertig={() => (setEntwurf(null), laden())} />}
    </Card>
  )
}

/** Punkt aus Stärken/Schwächen (Server: grammatikProfil) */
export interface ProfilPunkt {
  titel: string
  erklaerung: string
  beispiele: string[]
  versuche: number
  quote: number
  fehler: { antwort: string; richtig: string }[]
  themen: string[]
  /** Katalog-Kennungen, zuletzt geübt (ms), mittleres Fach, Band/Unit der Freigabe (08.10.2026, Details je Lernende/r) */
  kennungen?: string[]
  zuletzt?: number
  fach?: number
  lehrwerk?: { buch: string; unit: string }
}

/**
 * Förder- oder Forderaufgaben für ein Kind erstellen lassen (KI im Hintergrund). Das Ergebnis liegt als Entwurf in der
 * Grammatik-Tabelle des Kurses – mit dem Angebot, es auch für Kinder mit derselben Schwäche/Stärke freizuschalten.
 */
export function extraStarten(k: {
  art: 'foerder' | 'forder'
  vokId: string
  fach: string
  sprache: string
  jahrgang: number
  fuer: { id: string; name: string }
  punkte: ProfilPunkt[]
  gleiche: { id: string; name: string }[]
  bekannt: string[]
  woerter: string[]
}): void {
  const thema = k.punkte.map((p) => p.titel).join(' · ')
  const titel = `${k.art === 'foerder' ? 'Förderung' : 'Forderung'}: ${thema}`
  void starteAuftrag({
    moduleId: 'sprachenlernen',
    docId: extraDocId(k.vokId, k.fuer.id),
    titel: `${titel} (${k.fuer.name})`,
    art: k.art === 'foerder' ? 'Förderaufgaben' : 'Forderaufgaben',
    eingabe: {
      thema,
      fach: k.fach,
      sprache: k.sprache,
      jahrgang: k.jahrgang,
      ...niveauOrt(),
      ...(k.woerter.length ? { woerter: k.woerter.slice(0, 300), wortQuelle: 'Vokabeln des Kurses' } : {}),
      extra: {
        art: k.art,
        regeln: k.punkte.map((p) => ({ titel: p.titel, erklaerung: p.erklaerung, beispiele: p.beispiele })),
        // Fehlertexte gekürzt – keine Namen oder sonstigen Angaben zum Kind
        fehler: k.punkte
          .flatMap((p) => p.fehler)
          .map((f) => ({ antwort: f.antwort.slice(0, 120), richtig: f.richtig.slice(0, 120) }))
          .slice(0, 10),
        bekannt: k.bekannt
      }
    },
    sperrt: false,
    fehlerTitel: 'Extra-Aufgaben konnten nicht erstellt werden',
    arbeit: async (e, h) => erzeugeGrammatikPaket(e, h.ai, (x) => h.melde(x)),
    ablegen: async (paket) => {
      const p = paketBereinigt(paket, thema)
      speichereEntwuerfe([
        ...ladeEntwuerfe(),
        {
          schluessel: `${Date.now()}`,
          titel,
          fach: k.fach,
          sprache: k.sprache,
          thema,
          empfaenger: {
            lerngruppeId: '',
            schueler: [],
            gaeste: false,
            bis: null,
            gruppe: k.fuer.name,
            vokId: k.vokId,
            art: k.art,
            fuer: [k.fuer],
            gleiche: k.gleiche
          },
          info: { themen: [], teilformen: [], jahrgang: k.jahrgang, fuerRegeln: k.punkte.map((x) => x.titel) },
          paket: p
        }
      ])
      notifySuccess(`${titel} für ${k.fuer.name} ist fertig – in der Grammatik des Kurses prüfen und freischalten.`)
    },
    abschluss: (p) => `${p.aufgaben.length} Aufgaben fertig${erzeugungsHinweis(p)} – prüfen und freischalten`
  })
  notifySuccess(
    `Die KI erstellt ${k.art === 'foerder' ? 'Förderaufgaben' : 'Forderaufgaben'} für ${k.fuer.name} – sie erscheinen gleich als Entwurf beim Kurs.`
  )
}
