/**
 * Vokabeltraining für Lehrkräfte (03.10.2026; Server: src/server/vokabeln.ts). Seit dem Wunsch der
 * Lehrkraft („Mach hieraus eine eigenständige App, in der man über einen längeren Zeitraum für eine
 * Lerngruppe/einzelne Lerner oder Personen mit QR Code / Code Zugriff auf das Lernen hat") eine
 * eigene App statt eines Reiters im Onlinetest: Lernzeitraum, Zugang per QR-Code für Gäste
 * (mit persönlichem Wiedereinstiegs-Code), beenden, wieder öffnen, löschen.
 *
 * Vokabeln (Lehrwerk-Abschnitt oder eigene Liste) einer Lerngruppe oder Einzelnen zum Lernen
 * freigeben, optional mit Testtermin. Lernstand je Lerngruppe und Kind – abgestimmt OHNE Ranglisten:
 * Verteilung auf die Fächer des Karteikastens, Erkennen vs. selbst schreiben, Aktivität der letzten
 * 7 Tage, Problemwörter mit typischen Falschantworten, Prognose zum Testtermin.
 */
import { useDokumentOeffner, useRueckweg } from '../../shared/navigation'
import { AktiveFilter, SortKopf, useSortierTabelle, type Spalte } from '../../shared/components/SortierTabelle'
import { ListenSuche } from '../../shared/components/AppSuche'
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { useAlleLernenden } from './LernendeWahl'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowsSort,
  IconArrowUp,
  IconBooks,
  IconCalendarEvent,
  IconCards,
  IconChevronDown,
  IconPencil,
  IconPlus,
  IconPrinter,
  IconQrcode,
  IconSchool,
  IconSparkles,
  IconTrash,
  IconUser,
  IconUserMinus,
  IconUserPlus,
  IconX
} from '@tabler/icons-react'
import { LernendeEintragen, ZettelDruck, type Zettel } from './LernendeEintragen'
import { KlasseZuordnen } from './KlasseZuordnen'
import { extraStarten, KursGrammatik, type ProfilPunkt } from './kurs/KursGrammatik'
import { useAppSettings } from '../../shared/settingsStore'
import { fachFarbe } from '../../shared/fachfarben'
import { Freigeben as GrammatikFreigeben, type GrammatikVorgabe } from './GrammatikTraining'
import { lehrwerkeMitGrammatik } from '../arbeitsblatt/didactics/grammatikAuswahl'
import { LEHRWERK_GRAMMATIK } from '../../shared/lehrwerkGrammatik'
import {
  AMPEL_NAME,
  ampelVon,
  bandVon,
  BEREICHE,
  bereichName,
  bereichVonRegel,
  empfehlung,
  langeNichtGeuebt,
  lehrwerkStelle,
  stellenRang,
  type Ampel
} from '@shared/grammatikBereiche'

/**
 * Grammatik zu einem Vokabeltraining (08.10.2026, abgestimmt): Empfänger fest = dessen Lernende; Band und Unit der
 * Vokabelliste werden in der Grammatikauswahl vorgeschlagen, wenn der Band dort Unit-Grammatik hat.
 */
export function grammatikVorgabe(vokId: string, titel: string, sprache: string, quelle?: { lehrwerk?: string; unit?: string } | null): GrammatikVorgabe {
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const fach = sprache === 'la' ? 'latein' : 'englisch'
  const id = norm(quelle?.lehrwerk ?? '')
  const buch = id
    ? lehrwerkeMitGrammatik(fach)
        .filter((b) => id.startsWith(norm(b)))
        .sort((a, b) => b.length - a.length)[0]
    : undefined
  return { vokId, titel, sprache, ...(buch ? { lehrwerk: { buch, unit: quelle?.unit } } : {}) }
}
import { Zugang } from '../onlinetest/OnlinetestModule'
import { useCallback, useEffect, useState } from 'react'
import { STUFEN, type Uebersicht } from '@shared/vokabeltrainer'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { mitBildern, VokabelQuelle, type VokabelAuswahl } from './VokabelQuelle'
import { istVerbSprache } from '@shared/verben'
import { verbKarten, type VerbKarte } from '@shared/verbTraining'
import { ladeVerbPool, verbenAusVokabeln } from '../../shared/verben/quellen'

/**
 * Unregelmäßige Verben einer Liste (07.10.2026, abgestimmt: automatisch im Vokabeltraining): aus der Verbliste des
 * Lehrwerks (mit früheren Bänden), sonst aus der Standardliste – für Stammformen-Übung und Verbspiele der Lernenden.
 */
export async function verbenDerListe(a: VokabelAuswahl): Promise<{ sprache: string; karten: VerbKarte[] } | null> {
  if (!istVerbSprache(a.sprache)) return null
  try {
    const pool = await ladeVerbPool({
      quelle: a.quelle?.lehrwerk ? 'lehrwerk' : 'standard',
      listeId: a.quelle?.lehrwerk,
      kumulativ: true,
      sprache: a.sprache,
      lernjahr: 6
    })
    const karten = verbKarten(verbenAusVokabeln(a.woerter, pool, a.sprache), a.sprache)
    return karten.length ? { sprache: a.sprache, karten } : null
  } catch {
    return null
  }
}

interface ZuweisungKurz {
  id: string
  titel: string
  /** Überschrift der Lehrkraft bzw. Standard „2026 - 5b - Englisch" (08.10.2026) */
  ueberschrift?: string
  eigeneUeberschrift?: boolean
  symbol?: 'verlauf' | 'farbe'
  faecher?: number[]
  fach: string
  lerngruppe: string
  woerter: number
  lernende: number
  sicherSchnitt: number
  testTermin: number | null
  status: string
  bis: number | null
  gaeste: number
  code?: string
  link?: string
}

const tag = (ms: number): string => new Date(ms).toLocaleDateString('de-DE')
/** Datumsfeld (JJJJ-MM-TT) ↔ Zeitpunkt: Termine morgens, Zeitraum-Ende am Abend */
const alsFeld = (ms: number | null): string => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : '')
export const ausFeld = (v: string, uhr: string): number | null => (v ? new Date(`${v}T${uhr}`).getTime() : null)

/** Die App „Vokabeltraining" (Gruppe Unterricht) */
/** Sprachenlernen (08.10.2026): Vokabel- und Grammatik-App in einem – je Gruppe ein Kurs */
export function SprachenlernenModule({ active }: { active: boolean }): React.JSX.Element | null {
  if (!active) return null
  return (
    <Container size="xl" py="md">
      <VokabelTraining />
    </Container>
  )
}

// Dieselben Lernstufen wie bei den Lernenden (shared/vokabeltrainer.ts, abgestimmt 03.10.2026)
export const FACH_NAMEN = STUFEN.map((x) => x.name)
export const FACH_FARBEN = ['gray', 'red', 'orange', 'yellow', 'lime', 'green', 'teal']

/**
 * Symbol links in der Übersicht (08.10.2026, Wunsch der Lehrkraft): Verlauf der Fächer über alle Lernenden – von unten
 * Neu (grau) bis Langzeitgedächtnis (türkis) – oder per Rechtsklick eine feste Farbe (Fachfarbe).
 */
export function LernstandSymbol({
  faecher,
  art,
  fach,
  umschalten
}: {
  faecher: number[]
  art: 'verlauf' | 'farbe'
  fach: string
  umschalten: () => void
}): React.JSX.Element {
  useAppSettings((s) => s.settings.fachfarben)
  const summe = faecher.reduce((a, b) => a + b, 0)
  let bis = 0
  const stopps = faecher.flatMap((n, i) => {
    if (!n) return []
    const von = bis
    bis += (n / summe) * 100
    const c = `var(--mantine-color-${FACH_FARBEN[i]}-6)`
    return [`${c} ${von.toFixed(1)}%`, `${c} ${bis.toFixed(1)}%`]
  })
  const geuebt = summe ? Math.round(((summe - (faecher[0] ?? 0)) / summe) * 100) : 0
  const hintergrund =
    art === 'farbe' ? fachFarbe(fach) ?? 'var(--mantine-color-blue-6)' : summe ? `linear-gradient(to top, ${stopps.join(', ')})` : 'var(--mantine-color-gray-6)'
  return (
    <Tooltip
      position="right"
      label={art === 'farbe' ? 'Rechtsklick: Lernstand als Verlauf zeigen' : `Lernstand aller: ${geuebt} % geübt – Rechtsklick: feste Farbe`}
    >
      <div
        onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), umschalten())}
        data-lernstand-symbol={art}
        style={{
          width: 52,
          height: 52,
          flexShrink: 0,
          borderRadius: 14,
          background: hintergrund,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontWeight: 800,
          fontSize: 13,
          textShadow: '0 1px 2px rgba(0,0,0,.6)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)'
        }}
      >
        {art === 'farbe' ? <IconCards size={24} /> : `${geuebt}%`}
      </div>
    </Tooltip>
  )
}

/** Balken der Fächerverteilung */
export function Faecherbalken({ u, hoehe = 10 }: { u: Uebersicht; hoehe?: number }): React.JSX.Element {
  return (
    <Progress.Root size={hoehe} radius="xl">
      {u.faecher.map((n, i) =>
        n ? (
          <Tooltip key={i} label={`${FACH_NAMEN[i]}: ${n}`}>
            <Progress.Section value={(n / Math.max(1, u.gesamt)) * 100} color={FACH_FARBEN[i]} />
          </Tooltip>
        ) : null
      )}
    </Progress.Root>
  )
}

export default function VokabelTraining(): React.JSX.Element {
  const farbe = useProgrammFarbe()
  const [liste, setListe] = useState<ZuweisungKurz[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  const [filter, setFilter] = useState<'offen' | 'beendet'>('offen')
  const [grammatikOffen, setGrammatikOffen] = useState<string | null>(null)
  // openDocument('sprachenlernen', id) – Kurs; „g:<id>" = Grammatik (öffnet den Kurs und darin das Grammatik-Fenster)
  useDokumentOeffner('sprachenlernen', async (id) => {
    if (!id.startsWith('g:')) return setGewaehlt(id)
    const gid = id.slice(2)
    const g = (await holen<{ zuweisungen: { id: string; vokId?: string }[] }>('/server/grammatik')).zuweisungen.find((x) => x.id === gid)
    if (!g?.vokId) {
      // Noch ohne Kurs: die Liste legt ihn an (Überführung) – dann erneut nachsehen
      await holen('/server/vokabeln')
      const g2 = (await holen<{ zuweisungen: { id: string; vokId?: string }[] }>('/server/grammatik')).zuweisungen.find((x) => x.id === gid)
      if (!g2?.vokId) return
      setGrammatikOffen(gid)
      return setGewaehlt(g2.vokId)
    }
    setGrammatikOffen(gid)
    setGewaehlt(g.vokId)
  })
  const [suche, setSuche] = useState('')
  const [umbenennen, setUmbenennen] = useState<{ id: string; text: string; standard: string } | null>(null)
  const laden = useCallback(
    () =>
      void holen<{ zuweisungen: ZuweisungKurz[] }>('/server/vokabeln').then(
        (d) => setListe(d.zuweisungen),
        (e: unknown) => notifyError(e)
      ),
    []
  )
  useEffect(laden, [laden])
  if (gewaehlt)
    return (
      <Lernstand
        id={gewaehlt}
        zurueck={() => (setGewaehlt(null), setGrammatikOffen(null), laden())}
        grammatikOffen={grammatikOffen}
        setGrammatikOffen={setGrammatikOffen}
      />
    )
  const q = suche.trim().toLowerCase()
  const sichtbar = (liste ?? []).filter(
    (z) => z.status === filter && (!q || `${z.ueberschrift ?? ''} ${z.titel} ${z.fach} ${z.lerngruppe}`.toLowerCase().includes(q))
  )
  return (
    <Stack data-vokabeltraining>
      {/* Gemeinsamer Kopf (Phase 6a): Filter in der zweiten Zeile */}
      <AppKopf
        beschreibung="Vokabeln und Grammatik je Gruppe als Kurs – für eine Lerngruppe, einzelne Lernende oder per Code. Geübt wird in der Lern-App; hier stehen Lernstand, Stärken und Schwächen."
        suche={<ListenSuche wert={suche} setzen={setSuche} platzhalter="Titel, Fach, Lerngruppe …" />}
        hauptknopf={
          <Button leftSection={<IconPlus size={16} />} radius="md" color={farbe} onClick={() => setNeu(true)} data-vokabeln-freigeben>
            Neuer Kurs
          </Button>
        }
        links={
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            data={[
              { value: 'offen', label: `Laufend${liste ? ` (${liste.filter((z) => z.status === 'offen').length})` : ''}` },
              { value: 'beendet', label: `Abgeschlossen${liste ? ` (${liste.filter((z) => z.status !== 'offen').length})` : ''}` }
            ]}
          />
        }
      />
      {!liste && <Loader size="sm" />}
      {liste && sichtbar.length === 0 && <Text c="dimmed">{filter === 'offen' ? 'Gerade läuft kein Vokabeltraining.' : 'Nichts abgeschlossen.'}</Text>}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {sichtbar.map((z) => (
          <Card key={z.id} withBorder style={{ cursor: 'pointer' }} onClick={() => setGewaehlt(z.id)} data-vokabel-zuweisung={z.id}>
            <Group justify="space-between" wrap="nowrap">
              <LernstandSymbol
                faecher={z.faecher ?? []}
                art={z.symbol ?? 'verlauf'}
                fach={z.fach}
                umschalten={() =>
                  void senden(`/server/vokabeln/${z.id}/symbol`, { art: z.symbol === 'farbe' ? 'verlauf' : 'farbe' }).then(laden, (e: unknown) =>
                    notifyError(e)
                  )
                }
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap={4} wrap="nowrap">
                  <Text fw={700} truncate data-vokabel-ueberschrift>
                    {z.ueberschrift || z.titel}
                  </Text>
                  <Tooltip label="Überschrift ändern">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="gray"
                      aria-label="Überschrift ändern"
                      onClick={(e) => (
                        e.stopPropagation(),
                        setUmbenennen({
                          id: z.id,
                          text: z.eigeneUeberschrift ? z.ueberschrift ?? '' : '',
                          standard: z.eigeneUeberschrift ? '' : z.ueberschrift ?? ''
                        })
                      )}
                      data-vokabel-umbenennen
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Text size="sm" c="dimmed">
                  {z.lerngruppe} · {z.woerter} Wörter · {z.lernende} Lernende{z.gaeste ? ` (davon ${z.gaeste} per QR-Code)` : ''}
                </Text>
                <Text size="xs" c="dimmed">
                  {[z.bis ? `Lernzeitraum bis ${tag(z.bis)}` : 'ohne Enddatum', z.testTermin ? `Test am ${tag(z.testTermin)}` : ''].filter(Boolean).join(' · ')}
                </Text>
              </div>
              <Stack gap={4} align="flex-end">
                <Badge variant="light" color="green">
                  {Math.round(z.sicherSchnitt * 100)} % sicher
                </Badge>
                {z.code && (
                  <Badge variant="light" color="blue" leftSection={<IconQrcode size={10} />}>
                    {z.code}
                  </Badge>
                )}
              </Stack>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      {neu && <Freigeben schliessen={() => (setNeu(false), laden())} />}
      <Modal opened={Boolean(umbenennen)} onClose={() => setUmbenennen(null)} title="Überschrift ändern">
        {umbenennen && (
          <Stack>
            <TextInput
              label="Überschrift"
              description={
                umbenennen.standard ? `Leer lassen für den Standard „${umbenennen.standard}“` : 'Leer lassen für den Standard „Jahr - Lerngruppe - Fach“'
              }
              value={umbenennen.text}
              onChange={(e) => setUmbenennen({ ...umbenennen, text: e.currentTarget.value })}
              data-autofocus
              data-umbenennen-eingabe
            />
            <Group justify="flex-end">
              <Button
                onClick={() =>
                  void senden(`/server/vokabeln/${umbenennen.id}/ueberschrift`, { text: umbenennen.text }).then(
                    () => (setUmbenennen(null), laden()),
                    (e: unknown) => notifyError(e)
                  )
                }
                data-umbenennen-speichern
              >
                Speichern
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

/** Gruppen + Mitglieder aller eigenen Lerngruppen (wie beim Zuweisen der Reihen) */
export function useLerngruppen(): { gruppen: { id: string; name: string }[]; alle: { gruppeId: string; gruppe: string; benutzer: string; name: string }[] } {
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [alle, setAlle] = useState<{ gruppeId: string; gruppe: string; benutzer: string; name: string }[]>([])
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(async (d) => {
      setGruppen(d.gruppen)
      const l = await Promise.all(
        d.gruppen.map((g) =>
          holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(g.id)}`).then(
            (m) => m.mitglieder.map((x) => ({ ...x, gruppeId: g.id, gruppe: g.name })),
            () => []
          )
        )
      )
      setAlle(l.flat())
    })
  }, [])
  return { gruppen, alle }
}

/** Sprachen eines Kurses nur mit Grammatik */
const KURS_SPRACHEN = [
  { value: 'en', label: 'Englisch' },
  { value: 'fr', label: 'Französisch' },
  { value: 'es', label: 'Spanisch' },
  { value: 'la', label: 'Latein' },
  { value: 'de', label: 'Deutsch' }
]

function Freigeben({ schliessen }: { schliessen: () => void }): React.JSX.Element {
  const [auswahl, setAuswahl] = useState<VokabelAuswahl | null>(null)
  const [titel, setTitel] = useState('')
  const [art, setArt] = useState<'gruppe' | 'einzeln' | 'code'>('gruppe')
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [termin, setTermin] = useState('')
  const [bis, setBis] = useState('')
  const [qr, setQr] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  // Passende Grammatik gleich mit freigeben (08.10.2026): nach den Vokabeln öffnet der Grammatik-Dialog, vorbelegt
  const [mitGrammatik, setMitGrammatik] = useState(false)
  const [grammatikDanach, setGrammatikDanach] = useState<GrammatikVorgabe | null>(null)
  // Kurs nur mit Grammatik (Sprachenlernen, 08.10.2026): Sprache wählen, Vokabeln später
  const [nurGrammatik, setNurGrammatik] = useState(false)
  const [sprache, setSprache] = useState<string | null>('en')
  const { gruppen } = useLerngruppen()
  useEffect(() => {
    if (auswahl) setTitel(auswahl.titel)
  }, [auswahl])
  const alleLernenden = useAlleLernenden()
  const los = async (): Promise<void> => {
    if (nurGrammatik) {
      if (!sprache) return
      setLaeuft(true)
      try {
        const name = KURS_SPRACHEN.find((s) => s.value === sprache)!.label
        const { id: neueId } = await senden<{ id: string }>('/server/vokabeln/freigeben', {
          titel: titel || name,
          sprache,
          fach: name,
          woerter: [],
          nurGrammatik: true,
          lerngruppeId: art === 'gruppe' ? gruppe : '',
          schueler: art === 'einzeln' ? einzelne : [],
          bis: ausFeld(bis, '23:59:00'),
          gaeste: art === 'code' || qr
        })
        notifySuccess('Kurs angelegt – jetzt die Grammatik wählen.')
        return setGrammatikDanach({ vokId: neueId, titel: titel || name, sprache })
      } catch (e) {
        notifyError(e, 'Kurs nicht angelegt')
      } finally {
        setLaeuft(false)
      }
      return
    }
    if (!auswahl) return
    setLaeuft(true)
    try {
      const mit = await mitBildern(auswahl)
      const verben = await verbenDerListe(mit)
      const { id: neueId } = await senden<{ id: string }>('/server/vokabeln/freigeben', {
        titel: titel || auswahl.titel,
        sprache: mit.sprache,
        fach: mit.fach,
        woerter: mit.woerter,
        lerngruppeId: art === 'gruppe' ? gruppe : '',
        schueler: art === 'einzeln' ? einzelne : [],
        testTermin: ausFeld(termin, '08:00:00'),
        bis: ausFeld(bis, '23:59:00'),
        gaeste: art === 'code' || qr,
        ...(auswahl.quelle ? { quelle: auswahl.quelle } : {}),
        ...(verben ? { verben } : {})
      })
      notifySuccess(
        art === 'code' || qr
          ? 'Freigegeben – QR-Code und Code stehen beim Training (Knopf „QR-Code").'
          : 'Freigegeben – die Lernenden finden die Vokabeln in ihrer Lern-App.'
      )
      if (mitGrammatik && neueId) return setGrammatikDanach(grammatikVorgabe(neueId, titel || auswahl.titel, mit.sprache, auswahl.quelle))
      schliessen()
    } catch (e) {
      notifyError(e, 'Nicht freigegeben')
    } finally {
      setLaeuft(false)
    }
  }
  if (grammatikDanach) return <GrammatikFreigeben vorgabe={grammatikDanach} schliessen={schliessen} />
  return (
    <Modal opened onClose={schliessen} title="Neuer Kurs" size="lg">
      <Stack>
        <Switch
          label="Nur Grammatik (Vokabeln lassen sich später hinzufügen)"
          checked={nurGrammatik}
          onChange={(e) => setNurGrammatik(e.currentTarget.checked)}
          data-nur-grammatik
        />
        {nurGrammatik ? (
          <Select label="Sprache" data={KURS_SPRACHEN} value={sprache} onChange={setSprache} allowDeselect={false} data-kurs-sprache />
        ) : (
          <VokabelQuelle wahl={setAuswahl} />
        )}
        {auswahl && (
          <Text size="sm" c="dimmed">
            {auswahl.woerter.length} Wörter, davon {auswahl.woerter.filter((w) => w.example).length} mit Beispielsatz.
          </Text>
        )}
        <TextInput label="Titel (sehen die Lernenden)" value={titel} onChange={(e) => setTitel(e.currentTarget.value)} />
        <SegmentedControl
          value={art}
          onChange={(v) => (setArt(v as typeof art), setEinzelne([]))}
          data={[
            { value: 'gruppe', label: 'Lerngruppe' },
            { value: 'einzeln', label: 'Einzelne Lernende' },
            { value: 'code', label: 'Nur per QR-Code' }
          ]}
          data-vokabel-art
        />
        {art === 'code' ? (
          <Text size="sm" c="dimmed">
            Wer den QR-Code scannt oder den Code eingibt, lernt mit – Lernende mit Konto direkt, alle anderen mit Vorname und Anfangsbuchstabe. Gäste bekommen
            einen persönlichen Code, mit dem sie an anderen Tagen und Geräten weiterlernen.
          </Text>
        ) : art === 'gruppe' ? (
          <Select
            label="Lerngruppe"
            data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
            value={gruppe}
            onChange={setGruppe}
            placeholder="wählen …"
            data-vokabel-gruppe
          />
        ) : (
          <MultiSelect
            label="Lernende"
            data={alleLernenden.daten}
            value={einzelne}
            onChange={setEinzelne}
            searchable
            clearable
            nothingFoundMessage="Kein Schülerkonto mit diesem Namen"
            placeholder="Namen suchen …"
          />
        )}
        {art !== 'code' && (
          <Switch
            label="Zusätzlich per QR-Code / Code zugänglich"
            description="Etwa für Lernende ohne Konto oder aus anderen Gruppen."
            checked={qr}
            onChange={(e) => setQr(e.currentTarget.checked)}
            data-vokabel-qr
          />
        )}
        <Group align="flex-start" grow>
          <TextInput
            type="date"
            label="Lernzeitraum bis (optional)"
            description="Danach ist das Training abgeschlossen; ohne Datum läuft es, bis es beendet wird."
            value={bis}
            onChange={(e) => setBis(e.currentTarget.value)}
            data-vokabel-bis
          />
          <TextInput
            type="date"
            label="Testtermin (optional)"
            description="Bis dahin plant der Karteikasten so, dass jedes Wort vorher mehrmals verteilt geübt ist."
            value={termin}
            onChange={(e) => setTermin(e.currentTarget.value)}
          />
        </Group>
        {!nurGrammatik && (auswahl?.sprache === 'en' || auswahl?.sprache === 'la' || auswahl?.sprache === 'fr' || auswahl?.sprache === 'es') && (
          <Switch
            label="Passende Grammatik gleich mit freigeben"
            description="Danach öffnet sich die Grammatikauswahl – mit Band und Unit vorbelegt, für dieselben Lernenden."
            checked={mitGrammatik}
            onChange={(e) => setMitGrammatik(e.currentTarget.checked)}
            data-vokabel-mit-grammatik
          />
        )}
        <Group justify="flex-end">
          <Button
            loading={laeuft}
            disabled={(nurGrammatik ? !sprache : !auswahl?.woerter.length) || (art === 'gruppe' ? !gruppe : art === 'einzeln' ? !einzelne.length : false)}
            onClick={() => void los()}
            data-vokabeln-los
          >
            {nurGrammatik ? 'Kurs anlegen und Grammatik wählen' : 'Freigeben'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

interface Lernstanddaten {
  id: string
  titel: string
  fach: string
  testTermin: number | null
  status: string
  bis: number | null
  /** Spiele heute freigeschaltet / neue Vokabeln je Tag (08.10.2026) */
  spieleFrei?: boolean
  /** Verbspiele: '' automatisch (ab bekannter Vergangenheit), 'an', 'aus' (08.10.2026) */
  verbspiele?: '' | 'an' | 'aus'
  tagesziel?: number
  adresse?: string
  ueberschrift?: string
  teile?: { titel: string; anzahl: number; zeit: number }[]
  sprache?: string
  quelle?: { lehrwerk?: string; unit?: string } | null
  code?: string
  link?: string
  lerngruppe: string
  woerter: { id: string; term: string; translation: string }[]
  lernende: {
    id: string
    name: string
    gast?: boolean
    perCode?: boolean
    zugang?: string
    uebersicht: Uebersicht
    tage7: number
    /** In 7 Tagen neu gelernt / wiederholt (08.10.2026) */
    neu7?: number
    wiederholt7?: number
    /** Stärken/Schwächen in Grammatik und Extra-Aufgaben (Sprachenlernen, 08.10.2026) */
    grammatik?: {
      staerken: ProfilPunkt[]
      schwaechen: ProfilPunkt[]
      extra: { id: string; art: string; titel: string; bearbeitet: number; gesamt: number; status: string }[]
      /** Alle geübten Regeln (ab 1 Versuch) – Grammatik-Übersicht und Fördern/Fordern je Regel */
      regeln?: ProfilPunkt[]
    }
  }[]
  lerngruppeId?: string
  gesamt: Uebersicht
  problem: { id: string; term: string; translation: string; versuche: number; falsch: number; quote: number; typisch: string[] }[]
}

/**
 * Freigegebene Abschnitte (08.10.2026, Wunsch der Lehrkraft): nur in den Details, als zugeklappter Kasten – zu sehen ist
 * die Wörterzahl, hervorgehoben, was in den letzten 2 Wochen dazukam; aufgeklappt die Abschnitte mit Datum.
 */
function VokabelAbschnitte({ teile, gesamt }: { teile: { titel: string; anzahl: number; zeit: number }[]; gesamt: number }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const neu = teile.filter((t) => t.zeit > Date.now() - 14 * 864e5 && t !== teile[0]).reduce((a, t) => a + t.anzahl, 0)
  return (
    <Card withBorder padding="sm" data-vokabel-abschnitte>
      <UnstyledButton onClick={() => setOffen((x) => !x)} w="100%" aria-expanded={offen} data-vokabel-abschnitte-kopf>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <IconBooks size={18} />
            <Text fw={700}>{gesamt} Wörter</Text>
            {neu > 0 && (
              <Badge color="green" variant="filled" data-vokabel-neu14>
                +{neu} in den letzten 2 Wochen
              </Badge>
            )}
          </Group>
          <IconChevronDown size={18} style={{ transform: offen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
        </Group>
      </UnstyledButton>
      {offen && (
        <Stack gap={4} mt="sm">
          {teile.map((t, i) => (
            <Group key={i} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm">{t.titel}</Text>
              <Text size="xs" c={t.zeit > Date.now() - 14 * 864e5 && i > 0 ? 'green' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
                {t.anzahl} Wörter · {t.zeit ? new Date(t.zeit).toLocaleDateString('de-DE') : ''}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  )
}

/**
 * Grammatik zu einem Vokabeltraining (08.10.2026): ein fertiges Grammatiktraining verbinden (seine bisherigen
 * Empfänger behalten den Zugang) oder ein neues erstellen; verbundene lassen sich wieder lösen.
 */
function GrammatikDazu({ vokId, vorgabe, schliessen }: { vokId: string; vorgabe: GrammatikVorgabe; schliessen: () => void }): React.JSX.Element {
  const [liste, setListe] = useState<{ id: string; titel: string; lerngruppe: string; status: string; vokId?: string }[] | null>(null)
  const [wahl, setWahl] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  const laden = useCallback(
    () =>
      void holen<{ zuweisungen: { id: string; titel: string; lerngruppe: string; status: string; vokId?: string }[] }>('/server/grammatik').then(
        (r) => setListe(r.zuweisungen),
        (e: unknown) => notifyError(e)
      ),
    []
  )
  useEffect(laden, [laden])
  const verbinden = (gid: string, mit: boolean): void =>
    void senden(`/server/grammatik/${gid}/verbinden`, { vokId: mit ? vokId : '' }).then(
      () => (notifySuccess(mit ? 'Verbunden – die Lernenden des Vokabeltrainings üben diese Grammatik mit.' : 'Verbindung gelöst.'), setWahl(null), laden()),
      (e: unknown) => notifyError(e)
    )
  if (neu) return <GrammatikFreigeben vorgabe={vorgabe} schliessen={schliessen} />
  const verbunden = (liste ?? []).filter((g) => g.vokId === vokId)
  const andere = (liste ?? []).filter((g) => g.vokId !== vokId && g.status === 'offen')
  return (
    <Modal opened onClose={schliessen} title="Grammatik zu diesem Vokabeltraining" size="lg">
      <Stack data-grammatik-dazu>
        {!liste && <Loader size="sm" />}
        {verbunden.length > 0 && (
          <div>
            <Text fw={700} size="sm" mb={4}>
              Schon verbunden
            </Text>
            {verbunden.map((g) => (
              <Group key={g.id} justify="space-between" wrap="nowrap" data-grammatik-verbunden={g.id}>
                <Text size="sm">{g.titel}</Text>
                <Button size="compact-sm" variant="subtle" color="red" onClick={() => verbinden(g.id, false)}>
                  Lösen
                </Button>
              </Group>
            ))}
          </div>
        )}
        <Select
          label="Fertiges Grammatiktraining verbinden"
          description="Seine bisherigen Lernenden behalten den Zugang; die Lernenden dieses Vokabeltrainings kommen dazu – auch alle, die später eingetragen werden."
          data={andere.map((g) => ({ value: g.id, label: g.lerngruppe ? `${g.titel} (${g.lerngruppe})` : g.titel }))}
          value={wahl}
          onChange={setWahl}
          placeholder={liste && !andere.length ? 'Kein weiteres laufendes Grammatiktraining' : 'wählen …'}
          disabled={!andere.length}
          searchable
          data-grammatik-dazu-wahl
        />
        <Group justify="space-between">
          <Button variant="light" color="grape" leftSection={<IconSparkles size={16} />} onClick={() => setNeu(true)} data-grammatik-dazu-neu>
            Neues Grammatiktraining erstellen
          </Button>
          <Button disabled={!wahl} onClick={() => wahl && verbinden(wahl, true)} data-grammatik-dazu-verbinden>
            Verbinden
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Vokabeln nachträglich zu einer Freigabe hinzufügen (08.10.2026): Lernstand bleibt, Doppeltes wird übersprungen */
function Hinzufuegen({ id, schliessen }: { id: string; schliessen: () => void }): React.JSX.Element {
  const [auswahl, setAuswahl] = useState<VokabelAuswahl | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const los = async (): Promise<void> => {
    if (!auswahl) return
    setLaeuft(true)
    try {
      const mit = await mitBildern(auswahl)
      const verben = await verbenDerListe(mit)
      const r = await senden<{ neu: number }>(`/server/vokabeln/${id}/woerter`, { woerter: mit.woerter, titel: auswahl.titel, ...(verben ? { verben } : {}) })
      notifySuccess(r.neu ? `${r.neu} Vokabeln hinzugefügt – sie kommen als neue Wörter in den Kasten.` : 'Alle diese Vokabeln waren schon dabei.')
      schliessen()
    } catch (e) {
      notifyError(e, 'Nicht hinzugefügt')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title="Vokabeln hinzufügen" size="lg">
      <Stack>
        <VokabelQuelle wahl={setAuswahl} />
        {auswahl && (
          <Text size="sm" c="dimmed">
            {auswahl.woerter.length} Wörter gewählt – schon vorhandene werden übersprungen.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button onClick={() => void los()} loading={laeuft} disabled={!auswahl?.woerter.length} data-vokabel-hinzufuegen-los>
            Hinzufügen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

type Lernende = Lernstanddaten['lernende'][number]

/** Aufgeklappt-Zustand eines Kastens, auf diesem Gerät gemerkt */
function useGemerkt(schluessel: string, vorgabe: boolean): [boolean, (v: boolean) => void] {
  const [wert, setWert] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(`schulapps-${schluessel}`)
      return v === null ? vorgabe : v === '1'
    } catch {
      return vorgabe
    }
  })
  const setzen = (v: boolean): void => {
    setWert(v)
    try {
      localStorage.setItem(`schulapps-${schluessel}`, v ? '1' : '0')
    } catch {
      /* ohne Speicher nur für jetzt */
    }
  }
  return [wert, setzen]
}
/** Wie useGemerkt, aber mit Text (gewählte Ansicht) */
function useGemerktText(schluessel: string, vorgabe: string): [string, (v: string) => void] {
  const [wert, setWert] = useState<string>(() => {
    try {
      return localStorage.getItem(`schulapps-${schluessel}`) ?? vorgabe
    } catch {
      return vorgabe
    }
  })
  const setzen = (v: string): void => {
    setWert(v)
    try {
      localStorage.setItem(`schulapps-${schluessel}`, v)
    } catch {
      /* ohne Speicher nur für jetzt */
    }
  }
  return [wert, setzen]
}

/** Kopf eines auf- und zuklappbaren Kastens */
function KastenKopf({
  titel,
  offen,
  umschalten,
  rechts,
  ...rest
}: { titel: React.ReactNode; offen: boolean; umschalten: () => void; rechts?: React.ReactNode } & Record<
  `data-${string}`,
  string | boolean
>): React.JSX.Element {
  return (
    <Group justify="space-between" wrap="nowrap">
      <UnstyledButton onClick={umschalten} aria-expanded={offen} style={{ flex: 1 }} {...rest}>
        <Group gap="xs" wrap="nowrap">
          <IconChevronDown size={18} style={{ transform: offen ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
          <Text fw={700}>{titel}</Text>
        </Group>
      </UnstyledButton>
      {rechts}
    </Group>
  )
}

/** Schwellen wie im Server (grammatik.ts): Schwäche unter 60 %, Stärke ab 85 %, Befund erst ab 5 Versuchen */
type Stufe = 'rot' | 'gelb' | 'gruen' | 'grau'
const stufeVon = (r: { versuche: number; quote: number } | undefined): Stufe | null =>
  !r ? null : r.versuche < 5 ? 'grau' : r.quote < 0.6 ? 'rot' : r.quote < 0.85 ? 'gelb' : 'gruen'
const prozent = (p: { quote: number }): string => `${Math.round(p.quote * 100)} %`
/** Alle geübten Regeln einer Person (ältere Server ohne `regeln`: nur Stärken und Schwächen) */
const regelnVon = (l: Lernende): ProfilPunkt[] => l.grammatik?.regeln ?? [...(l.grammatik?.schwaechen ?? []), ...(l.grammatik?.staerken ?? [])]
const regelVon = (l: Lernende, titel: string): ProfilPunkt | undefined => regelnVon(l).find((p) => p.titel === titel)

const AMPEL_FARBE: Record<Ampel, string> = { sicher: 'teal', aufbau: 'yellow', schwaeche: 'red', wenig: 'gray' }
const datum = (ms?: number): string => (ms ? new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–')

/** Laufende Extra-Aufgaben einer Person als kleine Plaketten (08.10.2026) */
function ExtraPlaketten({ l }: { l: Lernende }): React.JSX.Element | null {
  const extra = l.grammatik?.extra ?? []
  if (!extra.length) return null
  return (
    <Group gap={4}>
      {extra.map((x) => (
        <Tooltip key={x.id} label={x.titel}>
          <Badge size="sm" variant="outline" color={x.bearbeitet >= x.gesamt ? 'teal' : 'gray'} tt="none" data-extra-stand={x.id}>
            {x.art === 'foerder' ? 'Förderung' : 'Forderung'} {x.bearbeitet >= x.gesamt ? 'geschafft' : `${x.bearbeitet}/${x.gesamt}`}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  )
}

/** Wo im Lehrwerk eine Regel eingeführt wurde: Band/Unit der Freigabe, sonst aus den Kennungen und dem Band des Kurses */
function stelleVon(p: ProfilPunkt, band: string | undefined): { text: string; rang: number } | null {
  if (p.lehrwerk && LEHRWERK_GRAMMATIK[p.lehrwerk.buch]?.[p.lehrwerk.unit]) {
    const rang = stellenRang(p.lehrwerk.buch, p.lehrwerk.unit, LEHRWERK_GRAMMATIK)
    if (rang !== null) return { text: `${p.lehrwerk.buch} · ${p.lehrwerk.unit}`, rang }
  }
  const s = lehrwerkStelle(p.kennungen ?? [], band ?? (p.lehrwerk ? bandVon(p.lehrwerk.buch, LEHRWERK_GRAMMATIK) : undefined), LEHRWERK_GRAMMATIK)
  return s ? { text: `${s.buch} · ${s.unit}`, rang: s.rang } : null
}

type DetailFilter = Ampel | 'alt' | null

/**
 * Details je Lernende/r (08.10.2026, abgestimmt): großes Fenster für viele Grammatikregeln über die Jahre. Oben die
 * Zahlen als Filter, darunter nach Bereichen (Schwächen zuerst und aufgeklappt, alles Sichere zugeklappt) oder
 * chronologisch nach Lehrwerk-Units; je Regel Ampel, Anteil richtig, Versuche, zuletzt geübt, Unit, typische Fehler und
 * Fördern/Fordern genau für diese Regel.
 */
function GrammatikDetails({
  l,
  name,
  band,
  starten,
  schliessen
}: {
  l: Lernende
  name: string
  band: string | undefined
  starten: (art: 'foerder' | 'forder', regel: string) => void
  schliessen: () => void
}): React.JSX.Element {
  const [filter, setFilter] = useState<DetailFilter>(null)
  const [ansicht, setAnsicht] = useGemerktText('vok-details-ansicht', 'bereiche')
  const [umgeschaltet, setUmgeschaltet] = useState<Record<string, boolean>>({})
  const jetzt = Date.now()
  const regeln = regelnVon(l).map((p) => ({ p, a: ampelVon(p), b: bereichVonRegel(p.titel, p.kennungen ?? []), s: stelleVon(p, band) }))
  const zahl = (f: Exclude<DetailFilter, null>): number => regeln.filter((r) => (f === 'alt' ? langeNichtGeuebt(r.p.zuletzt, jetzt) : r.a === f)).length
  const passt = (r: (typeof regeln)[number]): boolean => !filter || (filter === 'alt' ? langeNichtGeuebt(r.p.zuletzt, jetzt) : r.a === filter)
  const chips: { f: Exclude<DetailFilter, null>; text: string; farbe: string }[] = [
    { f: 'sicher', text: 'Sicher', farbe: 'teal' },
    { f: 'aufbau', text: 'im Aufbau', farbe: 'yellow' },
    { f: 'schwaeche', text: 'Schwäche', farbe: 'red' },
    { f: 'alt', text: 'seit 3 Wochen nicht geübt', farbe: 'gray' },
    ...(zahl('wenig') ? [{ f: 'wenig' as const, text: 'zu wenig geübt', farbe: 'gray' }] : [])
  ]
  // Gruppen: Bereiche (Schwächen zuerst, sonst feste Reihenfolge) oder Lehrwerk-Units (chronologisch, ohne Stelle zuletzt)
  const gruppen = new Map<string, { titel: string; rang: number; zeilen: typeof regeln }>()
  for (const r of regeln) {
    const schluessel = ansicht === 'units' ? (r.s?.text ?? '') : r.b
    const g = gruppen.get(schluessel) ?? {
      titel: ansicht === 'units' ? (r.s?.text ?? 'ohne Lehrwerk-Stelle') : bereichName(r.b),
      rang: ansicht === 'units' ? (r.s?.rang ?? Number.MAX_SAFE_INTEGER) : BEREICHE.findIndex((x) => x.id === r.b),
      zeilen: []
    }
    g.zeilen.push(r)
    gruppen.set(schluessel, g)
  }
  const liste = [...gruppen.entries()]
    .map(([k, g]) => ({ k, ...g, schwach: g.zeilen.some((r) => r.a === 'schwaeche'), alleSicher: g.zeilen.every((r) => r.a === 'sicher') }))
    .sort((x, y) => (ansicht === 'units' ? 0 : Number(y.schwach) - Number(x.schwach)) || x.rang - y.rang)
  const istOffen = (g: (typeof liste)[number]): boolean => (filter ? true : (umgeschaltet[g.k] ?? !g.alleSicher))
  const regelZeile = (r: (typeof regeln)[number]): React.JSX.Element => {
    const { p, a } = r
    return (
      <Table.Tr key={p.titel} data-regel-zeile={p.titel} data-ampel={a}>
        <Table.Td style={{ width: 22 }}>
          <Tooltip label={AMPEL_NAME[a]}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: `var(--mantine-color-${AMPEL_FARBE[a]}-6)` }} />
          </Tooltip>
        </Table.Td>
        <Table.Td>
          <Text size="sm" fw={600}>
            {p.titel}
          </Text>
          {p.fehler.length > 0 && (
            <Text size="xs" c="dimmed" data-regel-fehler>
              {p.fehler.slice(-3).map((f, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <Text span size="xs" c="red" td="line-through">
                    {f.antwort || '(leer)'}
                  </Text>{' '}
                  →{' '}
                  <Text span size="xs" c="teal" fw={600}>
                    {f.richtig}
                  </Text>
                </span>
              ))}
            </Text>
          )}
        </Table.Td>
        <Table.Td>{prozent(p)}</Table.Td>
        <Table.Td>{p.versuche}</Table.Td>
        <Table.Td>
          <Text size="sm" c={langeNichtGeuebt(p.zuletzt, jetzt) ? 'orange' : undefined}>
            {datum(p.zuletzt)}
          </Text>
        </Table.Td>
        {ansicht !== 'units' && (
          <Table.Td>
            <Text size="xs" c="dimmed">
              {r.s?.text ?? '–'}
            </Text>
          </Table.Td>
        )}
        <Table.Td>
          <Group gap={4} wrap="nowrap" justify="flex-end">
            <Button
              size="compact-xs"
              variant={a === 'schwaeche' ? 'filled' : 'light'}
              color="orange"
              disabled={a !== 'schwaeche' && a !== 'aufbau'}
              onClick={() => (starten('foerder', p.titel), schliessen())}
              data-regel-extra={`foerder:${p.titel}`}
            >
              Fördern
            </Button>
            <Button
              size="compact-xs"
              variant={a === 'sicher' ? 'filled' : 'light'}
              color="teal"
              disabled={a !== 'sicher'}
              onClick={() => (starten('forder', p.titel), schliessen())}
              data-regel-extra={`forder:${p.titel}`}
            >
              Fordern
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    )
  }
  return (
    <Stack gap="sm" data-lernende-details={l.name}>
      {!regeln.length ? (
        <Text size="sm" c="dimmed">
          Noch keine Grammatik geübt – ein Befund erscheint ab 5 Versuchen je Regel.
        </Text>
      ) : (
        <>
          <Group justify="space-between" gap="xs">
            <Group gap={6} data-details-zahlen>
              {chips.map((c) => (
                <Button
                  key={c.f}
                  size="compact-sm"
                  radius="xl"
                  variant={filter === c.f ? 'filled' : 'light'}
                  color={c.farbe}
                  onClick={() => setFilter(filter === c.f ? null : c.f)}
                  aria-pressed={filter === c.f}
                  data-details-filter={c.f}
                >
                  {c.text} {zahl(c.f)}
                </Button>
              ))}
            </Group>
            <SegmentedControl
              size="xs"
              value={ansicht}
              onChange={setAnsicht}
              data={[
                { value: 'bereiche', label: 'nach Bereichen' },
                { value: 'units', label: 'nach Lehrwerk-Units' }
              ]}
              data-details-ansicht
            />
          </Group>
          {ansicht === 'units' && !band && (
            <Text size="xs" c="dimmed">
              Kein Lehrwerk mit Grammatikliste am Kurs – nur Freigaben mit Band und Unit haben eine Stelle.
            </Text>
          )}
          {liste.map((g) => {
            const zeilen = g.zeilen.filter(passt)
            if (filter && !zeilen.length) return null
            const n = (a: Ampel): number => g.zeilen.filter((r) => r.a === a).length
            const offen = istOffen(g)
            return (
              <Card key={g.k} withBorder padding="sm" data-details-gruppe={g.titel}>
                <UnstyledButton
                  onClick={() => setUmgeschaltet({ ...umgeschaltet, [g.k]: !offen })}
                  aria-expanded={offen}
                  disabled={Boolean(filter)}
                  data-details-gruppe-kopf={g.titel}
                >
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Group gap="xs" wrap="nowrap">
                      <IconChevronDown size={16} style={{ transform: offen ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
                      <Text fw={700}>{g.titel}</Text>
                    </Group>
                    <Group gap="sm" wrap="nowrap">
                      <Progress.Root size={10} w={140} radius="xl">
                        {(['sicher', 'aufbau', 'schwaeche', 'wenig'] as const).map((a) => (
                          <Progress.Section key={a} value={(n(a) / g.zeilen.length) * 100} color={AMPEL_FARBE[a]} />
                        ))}
                      </Progress.Root>
                      <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }} data-gruppe-sicher={`${n('sicher')}/${g.zeilen.length}`}>
                        {n('sicher')} von {g.zeilen.length} sicher
                      </Text>
                    </Group>
                  </Group>
                </UnstyledButton>
                {offen && (
                  <Table.ScrollContainer minWidth={640} mt="xs">
                    <Table verticalSpacing={4}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th />
                          <Table.Th>Regel · typische Fehler</Table.Th>
                          <Table.Th>richtig</Table.Th>
                          <Table.Th>Versuche</Table.Th>
                          <Table.Th>zuletzt</Table.Th>
                          {ansicht !== 'units' && <Table.Th>Lehrwerk</Table.Th>}
                          <Table.Th />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>{zeilen.map(regelZeile)}</Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                )}
              </Card>
            )
          })}
        </>
      )}
      {(l.grammatik?.extra.length ?? 0) > 0 && (
        <div>
          <Text size="xs" fw={700} mb={4}>
            Extra-Aufgaben von {name}
          </Text>
          <ExtraPlaketten l={l} />
        </div>
      )}
    </Stack>
  )
}

/** Befund einer Person für Filter und Hinweis */
const befundVon = (l: Lernende): string => {
  const e = empfehlung(regelnVon(l))
  return e.art === 'foerder' ? 'braucht Förderung' : e.art === 'forder' ? 'braucht Forderung' : regelnVon(l).length ? 'im Aufbau' : 'zu wenig geübt'
}

/**
 * Reiter „Grammatik" (08.10.2026, abgestimmt): Name | Details | Fördern | Fordern. Empfohlen wird mit Grund – mindestens
 * eine Schwäche: Fördern hervorgehoben („2 Schwächen", Vorrang auch bei Stärken), sonst mindestens eine Stärke: Fordern
 * („3 Stärken, keine Schwäche"), sonst beide gedämpft („erst mehr üben").
 */
function GrammatikTabelle({
  lernende,
  anzeige,
  extra,
  details
}: {
  lernende: Lernende[]
  anzeige: (l: Lernende) => string
  extra: (l: Lernende, art: 'foerder' | 'forder') => void
  details: (l: Lernende) => void
}): React.JSX.Element {
  const spalten: Spalte<Lernende>[] = [
    { id: 'name', label: 'Name', wert: (l) => anzeige(l).toLowerCase(), filterWert: anzeige, filter: 'text' },
    { id: 'details', label: 'Details', wert: (l) => regelnVon(l).length, filter: 'auswahl', filterWert: befundVon, absteigend: true },
    { id: 'foerdern', label: 'Fördern', wert: (l) => empfehlung(regelnVon(l)).schwaechen, absteigend: true },
    { id: 'fordern', label: 'Fordern', wert: (l) => empfehlung(regelnVon(l)).staerken, absteigend: true }
  ]
  const t = useSortierTabelle(lernende, spalten, { spalte: 'name', ab: false })
  const knopf = (l: Lernende, art: 'foerder' | 'forder'): React.JSX.Element => {
    const e = empfehlung(regelnVon(l))
    const punkte = (art === 'foerder' ? l.grammatik?.schwaechen : l.grammatik?.staerken) ?? []
    const empfohlen = e.art === art
    const titel = regelnVon(l)
      .filter((p) => ampelVon(p) === (art === 'foerder' ? 'schwaeche' : 'sicher'))
      .map((p) => p.titel)
    const b = (
      <Button
        size="compact-sm"
        variant={empfohlen ? 'filled' : 'light'}
        color={art === 'foerder' ? 'orange' : 'teal'}
        disabled={!punkte.length}
        onClick={() => extra(l, art)}
        data-foerdern={art === 'foerder' ? l.name : undefined}
        data-fordern={art === 'forder' ? l.name : undefined}
        data-empfohlen={empfohlen || undefined}
      >
        {art === 'foerder' ? 'Fördern' : 'Fordern'}
      </Button>
    )
    return (
      <Stack gap={2} align="flex-start">
        {punkte.length ? (
          b
        ) : (
          <Tooltip
            label={
              e.art === null
                ? 'Noch kein Befund – ab 5 Versuchen je Regel'
                : art === 'foerder'
                  ? 'Keine Schwäche (unter 60 % richtig)'
                  : 'Keine Stärke (ab 85 % richtig und gefestigt)'
            }
          >
            <span>{b}</span>
          </Tooltip>
        )}
        {empfohlen && (
          <Text
            size="xs"
            c={art === 'foerder' ? 'orange' : 'teal'}
            fw={600}
            data-schwaechen={art === 'foerder' ? titel.join(' · ') : undefined}
            data-staerken={art === 'forder' ? titel.join(' · ') : undefined}
          >
            {e.text}
          </Text>
        )}
        {e.art === null && art === 'foerder' && (
          <Text size="xs" c="dimmed" data-befund-offen>
            {e.text}
          </Text>
        )}
      </Stack>
    )
  }
  return (
    <>
      <AktiveFilter spalten={spalten} tabelle={t} />
      <Table mt="xs" verticalSpacing="xs" data-grammatik-tabelle>
        <Table.Thead>
          <Table.Tr>
            {spalten.map((sp) => (
              <SortKopf key={sp.id} spalte={sp} tabelle={t} />
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {t.sichtbar.map((l) => (
            <Table.Tr key={l.id} data-grammatik-profil={anzeige(l)}>
              <Table.Td>{anzeige(l)}</Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <Button size="compact-sm" variant="default" onClick={() => details(l)} data-grammatik-details={l.name}>
                    Details
                  </Button>
                  <ExtraPlaketten l={l} />
                </Group>
              </Table.Td>
              <Table.Td>{knopf(l, 'foerder')}</Table.Td>
              <Table.Td>{knopf(l, 'forder')}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  )
}

/**
 * Grammatik-Übersicht (08.10.2026): Lernende × Regeln, Zelle nach Anteil richtig gefärbt; Klick auf Rot/Gelb fördert,
 * auf Grün fordert – genau für diese Regel und dieses Kind.
 */
function GrammatikMatrix({
  lernende,
  anzeige,
  starten
}: {
  lernende: Lernende[]
  anzeige: (l: Lernende) => string
  starten: (l: Lernende, art: 'foerder' | 'forder', regel: string) => void
}): React.JSX.Element {
  const [sort, setSort] = useState<{ spalte: string; ab: boolean }>({ spalte: '', ab: false })
  const regeln = [...new Set(lernende.flatMap((l) => regelnVon(l).map((p) => p.titel)))].sort((a, b) => a.localeCompare(b, 'de'))
  if (!regeln.length)
    return (
      <Text size="sm" c="dimmed" mt="xs" data-grammatik-matrix>
        Noch hat niemand Grammatik in diesem Kurs geübt.
      </Text>
    )
  const zeilen = [...lernende].sort((a, b) => {
    const v = sort.spalte
      ? (regelVon(a, sort.spalte)?.quote ?? 2) - (regelVon(b, sort.spalte)?.quote ?? 2)
      : anzeige(a).localeCompare(anzeige(b), 'de')
    return sort.ab ? -v : v
  })
  const kopf = (spalte: string, label: string): React.JSX.Element => {
    const aktiv = sort.spalte === spalte
    return (
      <UnstyledButton onClick={() => setSort({ spalte, ab: aktiv ? !sort.ab : false })} data-matrix-sortieren={spalte || 'name'}>
        <Group gap={2} wrap="nowrap" align="flex-start">
          <Text size="xs" fw={700} style={{ whiteSpace: 'normal', lineHeight: 1.2 }}>
            {label}
          </Text>
          {aktiv ? sort.ab ? <IconArrowDown size={12} /> : <IconArrowUp size={12} /> : <IconArrowsSort size={12} style={{ opacity: 0.4 }} />}
        </Group>
      </UnstyledButton>
    )
  }
  return (
    <>
      <Table.ScrollContainer minWidth={200} mt="xs">
        <table className="gram-matrix" data-grammatik-matrix>
          <thead>
            <tr>
              <th className="gm-name">{kopf('', 'Name')}</th>
              {regeln.map((r) => (
                <th key={r} title={r}>
                  {kopf(r, r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((l) => (
              <tr key={l.id}>
                <td className="gm-name">
                  <Text size="sm">{anzeige(l)}</Text>
                </td>
                {regeln.map((r) => {
                  const p = regelVon(l, r)
                  const s = stufeVon(p)
                  if (!p || !s)
                    return (
                      <td key={r}>
                        <div className="gm-zelle" data-stufe="leer">
                          –
                        </div>
                      </td>
                    )
                  const art = s === 'rot' || s === 'gelb' ? 'foerder' : s === 'gruen' ? 'forder' : null
                  const text = `${prozent(p)}`
                  return (
                    <td key={r}>
                      {art ? (
                        <Tooltip
                          label={`${p.versuche} Versuche – klicken: ${art === 'foerder' ? 'Förderaufgaben' : 'Forderaufgaben'} zu „${r}“ erstellen lassen`}
                          multiline
                          maw={280}
                        >
                          <button
                            type="button"
                            className="gm-zelle"
                            data-stufe={s}
                            onClick={() => starten(l, art, r)}
                            data-matrix-zelle={`${l.name}|${r}`}
                          >
                            {text}
                          </button>
                        </Tooltip>
                      ) : (
                        <Tooltip label={`erst ${p.versuche} Versuche – noch kein Befund`}>
                          <div className="gm-zelle" data-stufe={s} data-matrix-zelle={`${l.name}|${r}`}>
                            {text}
                          </div>
                        </Tooltip>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Table.ScrollContainer>
      <Group gap="xs" mt="xs">
        {(
          [
            ['rot', 'unter 60 % – fördern'],
            ['gelb', '60–85 %'],
            ['gruen', 'ab 85 % – fordern'],
            ['grau', 'unter 5 Versuchen']
          ] as const
        ).map(([s, t]) => (
          <Group key={s} gap={4} wrap="nowrap">
            <div className="gm-zelle gm-legende" data-stufe={s} />
            <Text size="xs" c="dimmed">
              {t}
            </Text>
          </Group>
        ))}
      </Group>
    </>
  )
}

/**
 * Je Lernende/r (08.10.2026, Wunsch der Lehrkraft): auf- und zuklappbar, Namen ausblendbar (etwa am Beamer),
 * sortier- und filterbar; statt der Übungstage die in 7 Tagen neu gelernten und wiederholten Vokabeln. Reiter
 * „Lernende" nur mit den Vokabeln; „Grammatik" mit Details je Person und Fördern/Fordern (abgestimmt 08.10.2026);
 * „Übersicht" = Lernende × Regeln.
 */
function LernendeTabelle({
  lernende,
  gastZeigen,
  entfernen,
  kurs
}: {
  lernende: Lernende[]
  gastZeigen: (l: Lernende) => void
  entfernen: (l: Lernende) => void
  kurs: {
    id: string
    fach: string
    sprache: string
    lerngruppe: string
    woerter: { term: string; translation: string }[]
    quelle?: { lehrwerk?: string; unit?: string } | null
    lerngruppeId?: string
  }
}): React.JSX.Element {
  /*
   * Förder-/Forderaufgaben (08.10.2026, abgestimmt): für das eine Kind; wer dieselbe Schwäche bzw. Stärke hat, wird im
   * Prüf-Fenster angeboten. Bekannte Grammatik = die Grammatik dieses Kurses und die Regeln aus den Profilen. Mit `regel`
   * nur diese eine Regel (aus den Details oder der Übersicht).
   */
  const extra = async (l: Lernende, art: 'foerder' | 'forder', regel?: string): Promise<void> => {
    const einzeln = regel ? regelVon(l, regel) : undefined
    const punkte = regel ? (einzeln ? [einzeln] : []) : ((art === 'foerder' ? l.grammatik?.schwaechen : l.grammatik?.staerken) ?? [])
    if (!punkte.length) return
    const titel = new Set(punkte.map((p) => p.titel))
    const passt = (x: Lernende): boolean => {
      if (regel) {
        const s = stufeVon(regelVon(x, regel))
        return art === 'foerder' ? s === 'rot' || s === 'gelb' : s === 'gruen'
      }
      return ((art === 'foerder' ? x.grammatik?.schwaechen : x.grammatik?.staerken) ?? []).some((p) => titel.has(p.titel))
    }
    const gleiche = lernende.filter((x) => x.id !== l.id && passt(x)).map((x) => ({ id: x.id, name: x.name }))
    const kursGrammatik = await holen<{ zuweisungen: { vokId?: string; thema: string; art?: string }[] }>('/server/grammatik')
      .then((r) => r.zuweisungen.filter((g) => g.vokId === kurs.id && !g.art).map((g) => g.thema))
      .catch(() => [] as string[])
    const bekannt = [...new Set([...kursGrammatik, ...lernende.flatMap((x) => regelnVon(x).map((p) => p.titel))])]
    extraStarten({
      art,
      vokId: kurs.id,
      fach: kurs.fach,
      sprache: kurs.sprache,
      jahrgang: Number(/\d{1,2}/.exec(kurs.lerngruppe)?.[0] ?? 6) || 6,
      fuer: { id: l.id, name: l.name },
      punkte,
      gleiche,
      bekannt,
      woerter: kurs.woerter.map((w) => `${w.term} – ${w.translation}`)
    })
  }
  const [offen, setOffen] = useGemerkt('vok-lernende-offen', true)
  const [ohneNamen, setOhneNamen] = useGemerkt('vok-lernende-ohne-namen', false)
  const [ansicht, setAnsicht] = useGemerktText('vok-lernende-ansicht', 'liste')
  const [detailsFuer, setDetailsFuer] = useState<string | null>(null)
  // Band des Kurses für die Units-Ansicht: aus der Vokabelquelle, sonst der Lehrwerk-Stand der Lerngruppe („Meine Klassen")
  const bandQuelle = kurs.quelle?.lehrwerk ? bandVon(kurs.quelle.lehrwerk, LEHRWERK_GRAMMATIK) : undefined
  const [bandStand, setBandStand] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (bandQuelle || !kurs.lerngruppeId || detailsFuer === null) return
    let aus = false
    void holen<{ stand: { buch: string } | null; automatisch: { buch: string } | null }>(
      `/server/grammatik/lehrwerkstand?gruppe=${encodeURIComponent(kurs.lerngruppeId)}`
    )
      .then((r) => !aus && setBandStand(r.stand?.buch ?? r.automatisch?.buch))
      .catch(() => undefined)
    return () => {
      aus = true
    }
  }, [bandQuelle, kurs.lerngruppeId, detailsFuer])
  // Ersatzname je Person bleibt beim Sortieren gleich (Reihenfolge nach Namen)
  const nummer = new Map([...lernende].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((l, i) => [l.id, i + 1]))
  const anzeige = (l: Lernende): string => (ohneNamen ? `Lernende/r ${nummer.get(l.id)}` : l.name)
  const spalten: Spalte<Lernende>[] = [
    { id: 'name', label: 'Name', wert: (l) => anzeige(l).toLowerCase(), filterWert: anzeige, filter: 'text' },
    {
      id: 'kasten',
      label: 'Karteikasten',
      wert: (l) => (l.uebersicht.gesamt ? (l.uebersicht.gesamt - l.uebersicht.neu) / l.uebersicht.gesamt : 0),
      absteigend: true,
      breite: '32%'
    },
    { id: 'sicher', label: 'sicher', wert: (l) => l.uebersicht.sicher, absteigend: true },
    { id: 'faellig', label: 'fällig', wert: (l) => l.uebersicht.faellig, absteigend: true },
    {
      id: 'woche',
      label: 'geübt (7 Tage)',
      wert: (l) => (l.neu7 ?? 0) + (l.wiederholt7 ?? 0),
      filter: 'auswahl',
      filterWert: (l) => ((l.neu7 ?? 0) + (l.wiederholt7 ?? 0) > 0 ? 'hat geübt' : 'noch nicht geübt'),
      absteigend: true
    }
  ]
  const t = useSortierTabelle(lernende, spalten, { spalte: 'name', ab: false })
  const halt = (e: React.MouseEvent): void => e.stopPropagation()
  const detailsPerson = lernende.find((l) => l.id === detailsFuer)
  return (
    <Card withBorder data-lernende-kasten>
      <KastenKopf
        titel={`Je Lernende/r (${lernende.length})`}
        offen={offen}
        umschalten={() => setOffen(!offen)}
        data-lernende-kopf
        rechts={
          offen && (
            <Switch size="xs" label="Namen ausblenden" checked={ohneNamen} onChange={(e) => setOhneNamen(e.currentTarget.checked)} data-namen-ausblenden />
          )
        }
      />
      {offen && (
        <>
          <SegmentedControl
            mt="xs"
            size="xs"
            value={ansicht === 'matrix' || ansicht === 'grammatik' ? ansicht : 'liste'}
            onChange={setAnsicht}
            data={[
              { value: 'liste', label: 'Lernende' },
              { value: 'grammatik', label: 'Grammatik' },
              { value: 'matrix', label: 'Übersicht' }
            ]}
            data-lernende-ansicht
          />
          {ansicht === 'matrix' ? (
            <GrammatikMatrix lernende={lernende} anzeige={anzeige} starten={(l, art, regel) => void extra(l, art, regel)} />
          ) : ansicht === 'grammatik' ? (
            <GrammatikTabelle lernende={lernende} anzeige={anzeige} extra={(l, art) => void extra(l, art)} details={(l) => setDetailsFuer(l.id)} />
          ) : (
            <>
              <AktiveFilter spalten={spalten} tabelle={t} />
              <Table data-karten mt="xs" data-lernende-tabelle>
                <Table.Thead>
                  <Table.Tr>
                    {spalten.map((sp) => (
                      <SortKopf key={sp.id} spalte={sp} tabelle={t} />
                    ))}
                    <Table.Th style={{ width: 40 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {t.sichtbar.map((l) => (
                    <Table.Tr key={l.id} data-lernende-zeile={l.name}>
                      <Table.Td data-lernende-name>
                        {l.gast && !ohneNamen ? (
                          <Text
                            component="button"
                            type="button"
                            size="sm"
                            td="underline"
                            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}
                            onClick={(e: React.MouseEvent) => (halt(e), gastZeigen(l))}
                            data-gast-name={l.name}
                          >
                            {l.name}
                          </Text>
                        ) : (
                          anzeige(l)
                        )}
                        {l.gast && (
                          <Tooltip label="Gast (per Code oder QR-Code)">
                            <IconUser size={12} style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.6 }} />
                          </Tooltip>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Faecherbalken u={l.uebersicht} />
                      </Table.Td>
                      <Table.Td>
                        {l.uebersicht.sicher}/{l.uebersicht.gesamt}
                      </Table.Td>
                      <Table.Td>{l.uebersicht.faellig}</Table.Td>
                      <Table.Td data-woche={`${l.neu7 ?? 0}/${l.wiederholt7 ?? 0}`}>
                        {(l.neu7 ?? 0) + (l.wiederholt7 ?? 0) ? (
                          <Text size="sm">
                            <b>{l.neu7 ?? 0}</b> neu · <b>{l.wiederholt7 ?? 0}</b> wiederholt
                          </Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            noch nicht
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {l.perCode && (
                          <Tooltip label="Aus dieser Freigabe entfernen">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => entfernen(l)}
                              aria-label={`${anzeige(l)} entfernen`}
                              data-gast-entfernen={l.name}
                            >
                              <IconUserMinus size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          )}
          <Text size="xs" c="dimmed" mt="xs">
            {ansicht === 'matrix'
              ? 'Anteil richtig je Grammatikregel. Klick auf eine rote oder gelbe Zelle lässt Förderaufgaben zu genau dieser Regel erstellen, auf eine grüne Forderaufgaben – als Entwurf zum Prüfen in der Grammatik des Kurses.'
              : ansicht === 'grammatik'
                ? 'Empfohlen ist Fördern, sobald es eine Schwäche gibt (unter 60 % richtig ab 5 Versuchen), sonst Fordern bei Stärken (ab 85 % richtig und gefestigt). „Details" zeigt alle Regeln nach Bereichen oder Lehrwerk-Units – mit Fördern/Fordern je Regel.'
                : 'Stufen: Neu (grau) → Angefangen → Wiedererkannt → Geübt → Gefestigt → Gekonnt → Im Langzeitgedächtnis (türkis). „Sicher“ = zweimal frei richtig geschrieben im Abstand von mindestens einer Woche. „geübt (7 Tage)“: Vokabeln, die in den letzten 7 Tagen zum ersten Mal geübt bzw. wiederholt wurden.'}
          </Text>
        </>
      )}
      <Modal
        opened={Boolean(detailsPerson)}
        onClose={() => setDetailsFuer(null)}
        title={detailsPerson ? `Grammatik – ${anzeige(detailsPerson)}` : ''}
        size="80rem"
        fullScreen={typeof window !== 'undefined' && window.innerWidth < 700}
      >
        {detailsPerson && (
          <GrammatikDetails
            l={detailsPerson}
            name={anzeige(detailsPerson)}
            band={bandQuelle ?? bandStand}
            starten={(art, regel) => void extra(detailsPerson, art, regel)}
            schliessen={() => setDetailsFuer(null)}
          />
        )}
      </Modal>
    </Card>
  )
}

function Lernstand({
  id,
  zurueck,
  grammatikOffen = null,
  setGrammatikOffen = () => undefined
}: {
  id: string
  zurueck: () => void
  grammatikOffen?: string | null
  setGrammatikOffen?: (id: string | null) => void
}): React.JSX.Element {
  const rueck = useRueckweg('sprachenlernen', zurueck, 'Alle Kurse')
  const [grammatikStand, setGrammatikStand] = useState(0)
  const [d, setD] = useState<Lernstanddaten | null>(null)
  const [qr, setQr] = useState(false)
  const [loeschen, setLoeschen] = useState(false)
  const [entfernen, setEntfernen] = useState<Lernstanddaten['lernende'][number] | null>(null)
  // Zugangscode eines Gastes ansehen (08.10.2026) und Vokabeln nachträglich hinzufügen
  const [gast, setGast] = useState<Lernstanddaten['lernende'][number] | null>(null)
  const [hinzu, setHinzu] = useState(false)
  const [eintragen, setEintragen] = useState(false)
  const [klasse, setKlasse] = useState(false)
  const [grammatik, setGrammatik] = useState(false)
  const [zettelDruck, setZettelDruck] = useState<Zettel[] | null>(null)
  const [ziel, setZiel] = useState<number | string>('')
  const laden = useCallback(() => void holen<Lernstanddaten>(`/server/vokabeln/${id}`).then(setD, (e: unknown) => notifyError(e)), [id])
  useEffect(laden, [laden])
  if (!d) return <Loader size="sm" />
  const aendern = (was: string, daten: Record<string, unknown>): void =>
    void senden(`/server/vokabeln/${id}/${was}`, daten).then(laden, (e: unknown) => notifyError(e))
  const tageBisTest = d.testTermin ? Math.ceil((d.testTermin - Date.now()) / 86_400_000) : null
  const lernende = [...d.lernende].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const mitWoertern = d.woerter.length > 0
  // Zettel für alle Gäste mit lesbarem Code (eingetragene und solche mit neu erzeugtem Code)
  const zettel = lernende.filter((l) => l.gast && l.zugang && l.zugang.length === 8).map((l) => ({ name: l.name, zugang: l.zugang! }))
  const anteilSicher = d.gesamt.gesamt ? d.gesamt.sicher / d.gesamt.gesamt : 0
  const anteilGeuebt = d.gesamt.gesamt ? (d.gesamt.gesamt - d.gesamt.neu) / d.gesamt.gesamt : 0
  return (
    <Stack data-lernstand>
      <Button
        variant="subtle"
        leftSection={<IconArrowLeft size={16} />}
        onClick={rueck.los}
        w="fit-content"
        data-zurueck={rueck.aus ? 'meineklassen' : undefined}
      >
        {rueck.name}
      </Button>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="xs">
            <Title order={3}>{d.ueberschrift || d.titel}</Title>
            {d.status !== 'offen' && <Badge color="gray">abgeschlossen</Badge>}
          </Group>
          <Text c="dimmed" size="sm">
            {d.lerngruppe} · {d.woerter.length} Wörter · {lernende.length} Lernende
          </Text>
        </div>
        <Group gap="xs">
          {d.code && d.link && (
            <Button variant="light" leftSection={<IconQrcode size={16} />} onClick={() => setQr(true)} data-vokabel-qr-zeigen>
              QR-Code
            </Button>
          )}
          <Button variant="default" onClick={() => aendern('status', { status: d.status === 'offen' ? 'beendet' : 'offen' })} data-vokabel-status>
            {d.status === 'offen' ? 'Beenden' : 'Wieder öffnen'}
          </Button>
          <Tooltip label="Löschen">
            <ActionIcon variant="subtle" color="red" size="lg" onClick={() => setLoeschen(true)} aria-label="Löschen">
              <IconTrash size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {/* Kurs nur mit Grammatik (08.10.2026): Vokabelteile erst, wenn Vokabeln dazukommen */}
      {mitWoertern && <VokabelAbschnitte teile={d.teile ?? []} gesamt={d.woerter.length} />}
      <Group gap="md" align="flex-end">
        <TextInput
          type="date"
          label="Lernzeitraum bis"
          leftSection={<IconCalendarEvent size={14} />}
          value={alsFeld(d.bis)}
          onChange={(e) => aendern('zeitraum', { bis: ausFeld(e.currentTarget.value, '23:59:00') })}
          w={200}
          data-vokabel-bis-aendern
        />
        <TextInput
          type="date"
          label="Testtermin"
          value={alsFeld(d.testTermin)}
          onChange={(e) => aendern('termin', { testTermin: ausFeld(e.currentTarget.value, '08:00:00') })}
          w={200}
        />
      </Group>
      <Group gap="md" align="flex-end" data-vokabel-tag>
        {mitWoertern && (
          <NumberInput
            label="Neue Vokabeln pro Tag"
            description="vor den Spielen; geübt wird in 10er-Schritten"
            min={1}
            max={200}
            w={230}
            value={ziel === '' ? d.tagesziel ?? 10 : ziel}
            onChange={setZiel}
            onBlur={() => {
              if (ziel !== '' && Number(ziel) !== d.tagesziel) aendern('tagesziel', { tagesziel: Number(ziel) })
              setZiel('')
            }}
            data-vokabel-tagesziel
          />
        )}
        {mitWoertern && (
          <Switch
            label="Spiele heute schon freischalten"
            description="gilt nur für heute – ohne erst die Tagesvokabeln zu üben"
            checked={Boolean(d.spieleFrei)}
            onChange={(e) => aendern('spiele', { frei: e.currentTarget.checked })}
            mb={4}
            data-vokabel-spiele-frei
          />
        )}
        {mitWoertern && (
          <Select
            label="Unregelmäßige Verben (Spiele und Stammformen)"
            description="Automatisch: erst wenn die Vergangenheit laut Lehrwerk-Stand oder freigegebener Grammatik dran war"
            data={[
              { value: '', label: 'automatisch' },
              { value: 'an', label: 'jetzt freischalten' },
              { value: 'aus', label: 'ausblenden' }
            ]}
            value={d.verbspiele ?? ''}
            onChange={(w) => aendern('verbspiele', { wert: w ?? '' })}
            allowDeselect={false}
            maw={420}
            mb={4}
            data-vokabel-verbspiele
          />
        )}
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setHinzu(true)} data-vokabel-hinzufuegen>
          Vokabeln hinzufügen
        </Button>
        {/* Lernende eintragen + Zettel mit persönlichem Code (08.10.2026) */}
        <Button variant="light" leftSection={<IconUserPlus size={16} />} onClick={() => setEintragen(true)} data-lernende-eintragen>
          Lernende eintragen
        </Button>
        {/* Lernende (auch Gäste mit Anmeldecode) zusätzlich einer Lerngruppe aus „Meine Klassen" zuordnen (08.10.2026) */}
        {lernende.length > 0 && (
          <Button variant="default" leftSection={<IconSchool size={16} />} onClick={() => setKlasse(true)} data-klasse-zuordnen-knopf>
            Lernende einer Klasse zuordnen…
          </Button>
        )}
        {zettel.length > 0 && (
          <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => setZettelDruck(zettel)} data-zettel-alle>
            Zettel für alle ({zettel.length})
          </Button>
        )}
      </Group>
      {grammatik && (
        <GrammatikDazu
          vokId={id}
          vorgabe={grammatikVorgabe(id, d.titel, d.sprache ?? '', d.quelle)}
          schliessen={() => (setGrammatik(false), setGrammatikStand((n) => n + 1))}
        />
      )}
      {zettelDruck && (
        <ZettelDruck
          titel={d.ueberschrift || d.titel}
          zettel={zettelDruck}
          adresse={d.adresse || window.location.origin}
          schliessen={() => setZettelDruck(null)}
        />
      )}
      {eintragen && (
        <LernendeEintragen
          id={id}
          titel={d.ueberschrift || d.titel}
          adresse={d.adresse || window.location.origin}
          schonDa={lernende.map((l) => l.name)}
          schliessen={() => (setEintragen(false), laden())}
        />
      )}
      {hinzu && <Hinzufuegen id={id} schliessen={() => (setHinzu(false), laden())} />}
      {klasse && <KlasseZuordnen id={id} schliessen={(geaendert) => (setKlasse(false), geaendert && laden())} />}
      <Modal opened={Boolean(gast)} onClose={() => setGast(null)} title={gast ? `Zugang für ${gast.name}` : ''}>
        {gast && (
          <Stack gap="sm" data-gast-zugang>
            <Text size="sm">
              {gast.zugang?.length === 8
                ? `${gast.name} meldet sich auf der Lernseite unter „Mit Code öffnen“ direkt mit dem persönlichen Code an.`
                : `So kommt ${gast.name} an einem anderen Tag oder Gerät wieder hinein: Code des Trainings eingeben, „Schon dabei?“ wählen, dann Name und persönlicher Code.`}
            </Text>
            <SimpleGrid cols={2}>
              <div>
                <Text size="xs" c="dimmed">
                  Code des Trainings
                </Text>
                <Title order={3} ff="monospace">
                  {d.code ?? '–'}
                </Title>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Persönlicher Code
                </Text>
                <Title order={3} ff="monospace" data-gast-code>
                  {gast.zugang || '–'}
                </Title>
              </div>
            </SimpleGrid>
            {!gast.zugang && (
              <Text size="xs" c="dimmed">
                Der Code wurde vor der Anzeige-Funktion vergeben und ist nicht lesbar gespeichert – ein neuer Code ersetzt ihn.
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                variant="default"
                data-gast-code-neu
                onClick={() =>
                  void senden<{ zugang: string }>(`/server/vokabeln/${id}/gast-code`, { id: gast.id }).then(
                    (r) => (setGast({ ...gast, zugang: r.zugang }), laden()),
                    (e: unknown) => notifyError(e)
                  )
                }
              >
                Neuen Code erzeugen
              </Button>
              {gast.zugang?.length === 8 && (
                <Button leftSection={<IconPrinter size={16} />} onClick={() => setZettelDruck([{ name: gast.name, zugang: gast.zugang! }])}>
                  Zettel drucken
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
      {qr && d.code && d.link && (
        <Modal opened onClose={() => setQr(false)} title={d.titel} size="lg">
          <Zugang code={d.code} link={d.link} />
          <Text size="sm" c="dimmed" mt="sm">
            Gäste geben Vorname und Anfangsbuchstabe ein und bekommen einen persönlichen Code zum Weiterlernen an anderen Tagen und Geräten.
          </Text>
        </Modal>
      )}
      <Modal opened={loeschen} onClose={() => setLoeschen(false)} title="Vokabeltraining löschen?">
        <Text size="sm" mb="md">
          Das Training wird samt Lernstand aller Lernenden und der Gastzugänge endgültig gelöscht. Die Vokabelliste selbst bleibt erhalten.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setLoeschen(false)}>
            Abbrechen
          </Button>
          <Button
            color="red"
            onClick={() => void senden(`/server/vokabeln/${id}/loeschen`, {}).then(zurueck, (e: unknown) => notifyError(e))}
            data-vokabel-loeschen
          >
            Endgültig löschen
          </Button>
        </Group>
      </Modal>
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Lerngruppe insgesamt
          </Text>
          <Title order={3}>{Math.round(anteilSicher * 100)} % sicher</Title>
          <Text size="xs" c="dimmed" mb={6}>
            {Math.round(anteilGeuebt * 100)} % schon geübt · Erkennen richtig: {Math.round(d.gesamt.erkennen * 100)} %
          </Text>
          <Faecherbalken u={d.gesamt} />
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Aktiv in den letzten 7 Tagen
          </Text>
          <Title order={3}>
            {lernende.filter((l) => l.tage7 > 0).length} von {lernende.length}
          </Title>
          <Text size="xs" c="dimmed">
            {lernende.filter((l) => l.tage7 === 0).length
              ? `${lernende.filter((l) => l.tage7 === 0).length} haben diese Woche noch nicht geübt.`
              : 'Alle haben diese Woche geübt.'}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Testtermin
          </Text>
          <Title order={3}>{d.testTermin ? new Date(d.testTermin).toLocaleDateString('de-DE') : '–'}</Title>
          <Text size="xs" c="dimmed">
            {tageBisTest !== null && tageBisTest >= 0
              ? `in ${tageBisTest} Tag${tageBisTest === 1 ? '' : 'en'} · Prognose: ${Math.round(
                  anteilGeuebt * 100
                )} % der Wörter sind bis dahin mindestens geübt`
              : 'Ohne Termin plant der Kasten nach den festen Abständen.'}
          </Text>
        </Card>
      </SimpleGrid>

      <Card withBorder display={mitWoertern ? undefined : 'none'}>
        <Group gap="xs" mb="xs">
          <IconBooks size={18} />
          <Text fw={700}>Problemwörter der Lerngruppe</Text>
        </Group>
        {d.problem.length === 0 ? (
          <Text size="sm" c="dimmed">
            Noch keine – sie erscheinen, sobald genug geübt ist.
          </Text>
        ) : (
          <Table striped data-karten>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Wort</Table.Th>
                <Table.Th>Fehlerquote</Table.Th>
                <Table.Th>Typische Falschantworten</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {d.problem.map((p) => (
                <Table.Tr key={p.id} data-problemwort={p.id}>
                  <Table.Td>
                    <b>{p.term}</b> – {p.translation}
                  </Table.Td>
                  <Table.Td>{Math.round(p.quote * 100)} %</Table.Td>
                  <Table.Td>{p.typisch.join(' · ') || '–'}</Table.Td>
                  <Table.Td>
                    <Tooltip label="Aus der Liste nehmen – kommt wieder, wenn neue Fehler dazukommen">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => aendern('problem-aus', { id: p.id })}
                        aria-label={`${p.term} aus der Liste nehmen`}
                        data-problem-aus={p.id}
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <LernendeTabelle
        lernende={lernende}
        gastZeigen={setGast}
        entfernen={setEntfernen}
        kurs={{ id, fach: d.fach, sprache: d.sprache ?? '', lerngruppe: d.lerngruppe, woerter: d.woerter, quelle: d.quelle, lerngruppeId: d.lerngruppeId }}
      />
      <KursGrammatik vokId={id} hinzufuegen={() => setGrammatik(true)} geoeffnet={grammatikOffen} oeffnen={setGrammatikOffen} stand={grammatikStand} />
      <Modal opened={Boolean(entfernen)} onClose={() => setEntfernen(null)} title="Aus dieser Freigabe entfernen?">
        {entfernen && (
          <Stack gap="sm">
            <Text size="sm">
              „{entfernen.name}“ verliert sofort den Zugang zu diesen Vokabeln; der Lernstand dazu wird gelöscht.
              {entfernen.gast ? ' Das Gastkonto wird ganz gelöscht.' : ' Das IServ-Konto selbst bleibt bestehen.'}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEntfernen(null)}>
                Abbrechen
              </Button>
              <Button color="red" data-gast-entfernen-bestaetigen onClick={() => (aendern('gast-entfernen', { id: entfernen.id }), setEntfernen(null))}>
                Entfernen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
      {lernende.length === 0 && <Alert>{d.code ? 'Noch niemand dabei – den QR-Code zeigen oder den Code nennen.' : 'Noch niemand in der Lerngruppe.'}</Alert>}
    </Stack>
  )
}
