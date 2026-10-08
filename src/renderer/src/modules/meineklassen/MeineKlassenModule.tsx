/**
 * „Meine Klassen" (06.10.2026, abgestimmt mit der Lehrkraft) – Gruppe Verwaltung, nur mit dem Schul-Apps-Server.
 *
 *  - Übersicht (Runde 2): EINE Karte je Klasse („5b", „10b" – alphabetisch, Zahlen natürlich) mit ihren Fächern,
 *    Lernenden und Handlungsbedarf. Lerngruppen gleichen Namens sind die Fächer der Klasse (server/klassen.ts).
 *  - Klasse: oben die Fach-Leiste (Englisch | Geschichte | + Fach hinzufügen – ohne Fach nur „+ Fach hinzufügen"), darunter
 *    für das gewählte Fach Handlungsbedarf, Vorschläge für Material, dann die Reiter Unterrichtsreihen & Blätter,
 *    Vokabeln & Grammatik (nur Sprachfächer), Tests & Noten, Lernende.
 *  - Materialien: sortier- und filterbar (MaterialListe.tsx), mit Details und „Ablegen ▾" (PDF, Word, Drucken, IServ in der
 *    Ablagestruktur der Verwaltung, klassenAblage.ts). Was von hier geöffnet wird, führt mit „Zurück" wieder hierher.
 *  - Vorschläge: „Wackelige Wörter" als Vokabeltraining (Vorschau → „Jetzt freischalten"); „Übungsblatt zu den Fehlern
 *    des letzten Tests" entsteht im Hintergrund (KI-Zugang der Lehrkraft) und erscheint fertig zum Ansehen und Freischalten.
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Collapse,
  Container,
  Group,
  Loader,
  Modal,
  Popover,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook2,
  IconCalendarEvent,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClipboardCheck,
  IconExternalLink,
  IconFileText,
  IconLanguage,
  IconLock,
  IconPencil,
  IconPlus,
  IconRoute,
  IconSparkles,
  IconUserExclamation,
  IconUsers,
  IconZzz
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { FAECHER, fachAusName } from '@shared/faecher'
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { ListenSuche } from '../../shared/components/AppSuche'
import { neuAnlegen, openDocument, openModule, useNavigation } from '../../shared/navigation'
import { setzeFachVorgabe, setzeJahrgangVorgabe } from '../../shared/fachVorgabe'
import { useReihenZiel } from '../unterrichtsreihe/UnterrichtsreiheModule'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { blattFuerKlasse, useFertigeBlaetter, type FertigesBlatt } from './klassenMaterial'
import { BlattFreigabeDialog } from '../arbeitsblatt/BlattFreigabeKnopf'
import { useAppSettings } from '../../shared/settingsStore'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import { ampel, DetailZeile, MaterialKarte, MaterialListe, type Eintrag } from './MaterialListe'
import { AblegenKnopf } from './AblegenKnopf'
import { blattQuelle, grammatikQuelle, testQuelle, vokabelQuelle } from './klassenAblage'
import { AlsSchuelerAnsehen } from './SchuelerVorschau'

interface FachKurz {
  id: string
  fach: string
  bedarf: number
  vorschlaege: number
  vokabelnSicher: number | null
  testSchnitt: number | null
  tests: number
  reihen: number
  blaetter: number
}
interface KlasseKurz {
  schluessel: string
  name: string
  gruppen: string[]
  lernende: number
  bedarf: number
  vorschlaege: number
  faecher: FachKurz[]
}

type Bedarf = { art: 'entscheiden' | 'foerdern' | 'inaktiv' | 'termin' | 'reihe' | 'blatt'; text: string; ziel?: { modul: string; id?: string } }
type Vorschlag =
  | { art: 'vokabeln'; titel: string; text: string; sprache: string; fach: string; woerter: { term: string; translation: string; example?: string }[] }
  | { art: 'blatt'; titel: string; text: string; testId: string; thema: string; schwerpunkte: string[]; testArt: string }

interface KlasseDetail {
  id: string
  name: string
  fach: string
  titel: string
  sprachfach: boolean
  ablageMuster: string
  lernende: {
    id: string
    name: string
    benutzer: string
    /** Gast mit persönlichem Anmeldecode (Vokabeltraining), der Klasse zugeordnet (08.10.2026) */
    gast?: boolean
    vokabelnSicher: number | null
    grammatikSicher?: number | null
    zuletztGeuebt: string | null
    testSchnitt: number | null
    tests: number
    reihenFortschritt: number | null
    blaetterEingereicht: number
  }[]
  tests: {
    id: string
    titel: string
    datum: string
    status: string
    teilnehmer: number
    offen: number
    durchschnitt: number | null
    verteilung: number[]
    art?: string
    thema?: string
    versionen?: string[]
    punkte?: number
    schwellen?: number[]
    zeitMin?: number
    fehlende?: string[]
    schwerpunkte?: string[]
    beste?: { titel: string; quote: number } | null
    schwaechste?: { titel: string; quote: number } | null
    mitOriginal?: boolean
  }[]
  vokabeln: {
    id: string
    titel: string
    testTermin: number | null
    sicherSchnitt: number
    status: 'offen' | 'beendet'
    erstellt: string
    bis: number | null
    woerter: number
    quelle: string
    lernende: number
    aktiv7: number
    probleme: { term: string; translation: string; quote: number; typisch: string[] }[]
    /** Kurs-Karte (08.10.2026): Anteile sicher / kennengelernt / neu über alle Lernenden */
    anteil?: { sicher: number; aufbau: number; neu: number }
    heuteAktiv?: number
  }[]
  grammatik: {
    id: string
    titel: string
    sicherSchnitt: number
    status: 'offen' | 'beendet'
    erstellt: string
    bis: number | null
    thema: string
    aufgaben: number
    regeln: number
    lernende: number
    aktiv7: number
    probleme: { satz: string; loesung: string; quote: number; typisch: string[] }[]
    /** Kurs, zu dem die Grammatik gehört ('' = eigenständig) und ob es eine Extra-Aufgabe für einzelne ist (08.10.2026) */
    vokId?: string
    extra?: boolean
  }[]
  wackelig: { term: string; translation: string; quote: number }[]
  reihen: {
    zid: string
    titel: string
    schnitt: number
    fertig: number
    lernende: number
    status: 'offen' | 'beendet'
    erstellt: string
    oberthema: string
    schritte: number
    nichtBegonnen: string[]
    lernziele: { text: string; erreicht: number }[]
  }[]
  blaetter: {
    id: string
    titel: string
    status: 'offen' | 'beendet'
    erstellt: string
    bis: number | null
    fach: string
    thema: string
    gesamt: number
    begonnen: number
    eingereicht: number
    nichtBegonnen: string[]
    nichtEingereicht: string[]
    aufgaben: number
    seiten: number
    loesung: boolean
    ergebnis: number | null
    schwierigste: { nr: number; anweisung: string; rot: number } | null
    quelle: { docId: string } | null
  }[]
  bedarf: Bedarf[]
  vorschlaege: Vorschlag[]
}

/** Wo man in „Meine Klassen" steht – bleibt beim Ausflug in einen Test erhalten (Rückweg) */
const useSicht = create<{
  klasse: string | null
  gruppe: string | null
  reiter: string
  setze: (p: Partial<{ klasse: string | null; gruppe: string | null; reiter: string }>) => void
}>((set) => ({ klasse: null, gruppe: null, reiter: 'reihen', setze: (p) => set(p) }))

const prozent = (x: number | null): string => (x === null ? '–' : `${Math.round(x * 100)} %`)
const note = (x: number | null): string => (x === null ? '–' : x.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }))
const tag = (x: string | number | null | undefined): string => (x ? new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '–')
const ms = (iso: string): number => Date.parse(iso) || 0
const namen = (l: string[], max = 12): string => (l.length > max ? `${l.slice(0, max).join(', ')} und ${l.length - max} weitere` : l.join(', '))

/** Aus „Meine Klassen" öffnen – „Zurück" führt wieder hierher */
function oeffneMitRueckweg(modul: string, id?: string): void {
  useNavigation.getState().setRueckweg({ fuer: modul, nach: 'meineklassen', name: 'Meine Klassen' })
  if (id) void openDocument(modul, id)
  else openModule(modul)
}

/** Jahrgang aus dem Klassennamen („7b" → 7, „10" → 10; „Q1" → keiner) */
export const jahrgangAusKlasse = (name: string): number | undefined => {
  const n = Number(/^\s*(\d{1,2})(?!\d)/.exec(name)?.[1])
  return Number.isInteger(n) && n >= 1 && n <= 13 ? n : undefined
}

/**
 * Neu für diese Klasse (08.10.2026, Wunsch der Lehrkraft): Unterrichtsreihe bzw. Arbeitsblatt mit Fach und Jahrgang der
 * Klasse beginnen. Die Lerngruppe wählt man wie gewohnt beim Zuweisen bzw. Freigeben.
 */
function reiheFuerKlasse(d: Pick<KlasseDetail, 'name' | 'fach'>): void {
  useNavigation.getState().setRueckweg({ fuer: 'unterrichtsreihe', nach: 'meineklassen', name: 'Meine Klassen' })
  useReihenZiel.getState().setzeNeu(true, { fachId: fachAusName(d.fach)?.id, grade: jahrgangAusKlasse(d.name) })
  openModule('unterrichtsreihe')
}

async function blattNeuFuerKlasse(d: Pick<KlasseDetail, 'name' | 'fach'>): Promise<void> {
  const fachId = fachAusName(d.fach)?.id
  const jahrgang = jahrgangAusKlasse(d.name)
  if (fachId) setzeFachVorgabe('arbeitsblatt', fachId)
  if (jahrgang) setzeJahrgangVorgabe('arbeitsblatt', jahrgang)
  useNavigation.getState().setRueckweg({ fuer: 'arbeitsblatt', nach: 'meineklassen', name: 'Meine Klassen' })
  try {
    if (!(await neuAnlegen('arbeitsblatt'))) openModule('arbeitsblatt')
  } catch (e) {
    notifyError(e)
  }
}

const BEDARF_SYMBOL: Record<Bedarf['art'], React.ReactNode> = {
  entscheiden: <IconClipboardCheck size={16} />,
  foerdern: <IconUserExclamation size={16} />,
  inaktiv: <IconZzz size={16} />,
  termin: <IconCalendarEvent size={16} />,
  reihe: <IconRoute size={16} />,
  blatt: <IconFileText size={16} />
}
const BEDARF_FARBE: Record<Bedarf['art'], string> = { entscheiden: 'orange', foerdern: 'red', inaktiv: 'gray', termin: 'blue', reihe: 'violet', blatt: 'cyan' }

export default function MeineKlassenModule({ active }: { active: boolean }): React.JSX.Element | null {
  const [klassen, setKlassen] = useState<KlasseKurz[] | null>(null)
  const { klasse, setze } = useSicht()
  const [suche, setSuche] = useState('')
  const laden = useCallback(() => {
    void holen<{ klassen: KlasseKurz[] }>('/server/klassen').then(
      (d) => setKlassen(d.klassen),
      (e: unknown) => (notifyError(e), setKlassen([]))
    )
  }, [])
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  if (!active) return null
  const q = suche.trim().toLowerCase()
  const sichtbar = (klassen ?? []).filter((k) => !q || `${k.name} ${k.faecher.map((f) => f.fach).join(' ')}`.toLowerCase().includes(q))
  const gewaehlt = klassen?.find((k) => k.schluessel === klasse)
  return (
    <Container size="xl" py="lg" data-meine-klassen>
      <AppKopf
        beschreibung="Lernstand, Tests und Handlungsbedarf je Klasse und Fach – und passendes Material mit einem Klick."
        suche={<ListenSuche wert={suche} setzen={setSuche} platzhalter="Klasse, Fach …" />}
      />
      {klasse && gewaehlt ? (
        <KlasseAnsicht k={gewaehlt} neu={laden} zurueck={() => (setze({ klasse: null, gruppe: null }), laden())} />
      ) : !klassen ? (
        <Center h="40vh">
          <Loader />
        </Center>
      ) : klassen.length === 0 ? (
        <Alert icon={<IconUsers size={18} />} title="Noch keine Lerngruppen">
          Lerngruppen entstehen in der App „Onlinetest“ unter „Lerngruppen“ (aus IServ oder von Hand). Danach stehen sie hier mit ihrem Lernstand.
        </Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} data-klassen-liste>
          {sichtbar.map((k) => (
            <KlassenKarte key={k.schluessel} k={k} waehlen={() => setze({ klasse: k.schluessel, gruppe: k.faecher[0]?.id ?? null, reiter: 'reihen' })} />
          ))}
        </SimpleGrid>
      )}
    </Container>
  )
}

/** Karte je Klasse – einheitlich aufgebaut, auch ohne Fach oder Material (Befund: Text rutschte sonst nach oben) */
function KlassenKarte({ k, waehlen }: { k: KlasseKurz; waehlen: () => void }): React.JSX.Element {
  return (
    <UnstyledButton
      onClick={waehlen}
      className="vorlage-karte"
      style={{ padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 168 }}
      data-klasse={k.name}
    >
      <Group justify="space-between" wrap="nowrap" mb={8}>
        <Text fw={800} size="lg">
          {/^\d/.test(k.name) ? `Klasse ${k.name}` : k.name}
        </Text>
        {k.bedarf > 0 ? (
          <Badge color="orange" leftSection={<IconAlertTriangle size={12} />}>
            {k.bedarf}
          </Badge>
        ) : (
          <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
            alles ruhig
          </Badge>
        )}
      </Group>
      <Group gap="lg" mb={8}>
        <Kennzahl wert={String(k.lernende)} text="Lernende" />
        <Kennzahl wert={String(k.faecher.length)} text={k.faecher.length === 1 ? 'Fach' : 'Fächer'} />
        {k.vorschlaege > 0 && <Kennzahl wert={String(k.vorschlaege)} text={k.vorschlaege === 1 ? 'Vorschlag' : 'Vorschläge'} />}
      </Group>
      <Stack gap={4} mih={44} justify="center">
        {k.faecher.length === 0 ? (
          <Text size="sm" c="dimmed">
            Noch kein Fach – in der Klasse mit „+ Fach hinzufügen“ anlegen.
          </Text>
        ) : (
          k.faecher.map((f) => (
            <Group key={f.id} gap={6} wrap="nowrap" data-klasse-fach={f.fach}>
              <Badge variant="light" style={{ flexShrink: 0 }}>
                {f.fach}
              </Badge>
              {f.vokabelnSicher !== null && (
                <Tooltip label={`Vokabeln ${prozent(f.vokabelnSicher)} sicher`}>
                  <Progress value={f.vokabelnSicher * 100} size="sm" radius="xl" color={ampel(f.vokabelnSicher)} w={60} />
                </Tooltip>
              )}
              <Text size="xs" c="dimmed" truncate>
                {[
                  f.testSchnitt !== null && `Ø ${note(f.testSchnitt)}`,
                  f.reihen && `${f.reihen} Reihe${f.reihen === 1 ? '' : 'n'}`,
                  f.blaetter && `${f.blaetter} Bl.`
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {f.bedarf > 0 && (
                <Badge size="xs" color="orange" variant="light" style={{ flexShrink: 0 }}>
                  {f.bedarf}
                </Badge>
              )}
            </Group>
          ))
        )}
      </Stack>
    </UnstyledButton>
  )
}

function Kennzahl({ wert, text }: { wert: string; text: string }): React.JSX.Element {
  return (
    <div>
      <Text fw={800} size="lg" lh={1.1}>
        {wert}
      </Text>
      <Text size="xs" c="dimmed">
        {text}
      </Text>
    </div>
  )
}

/** „+ Fach hinzufügen": eigene Fächer zuerst, dann alle; legt das Fach mit denselben Lernenden an */
function FachHinzufuegen({ k, fertig }: { k: KlasseKurz; fertig: (id: string) => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const vorhanden = new Set(k.faecher.map((f) => f.fach.toLowerCase()))
  const farbe = useProgrammFarbe()
  // Wert ist der Fachname; die eigenen Fächer stellt HaeufigSelect nach oben (im Standardmodus nur sie, weitere per Eintippen)
  const data = useMemo(
    () =>
      FAECHER.map((f) => f.label)
        .filter((l) => !vorhanden.has(l.toLowerCase()))
        .map((l) => ({ value: l, label: l })),
    [k.faecher] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const waehlen = async (fach: string | null): Promise<void> => {
    if (!fach) return
    // Lerngruppe ohne Fach bekommt es; sonst entsteht eine neue mit denselben Lernenden
    try {
      const r = await senden<{ id: string }>(`/server/klassen/${k.gruppen[0]}/fach`, { fach })
      notifySuccess(`${fach} ist jetzt ein Fach der Klasse ${k.name}.`)
      setOffen(false)
      fertig(r.id)
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <Popover opened={offen} onChange={setOffen} position="bottom-start" withinPortal trapFocus>
      <Popover.Target>
        <Button variant="light" color={farbe} radius="xl" leftSection={<IconPlus size={16} />} onClick={() => setOffen((o) => !o)} data-fach-hinzufuegen>
          Fach hinzufügen
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <HaeufigSelect
          art="fach"
          label="Fach"
          placeholder="Fach wählen …"
          searchable
          data={data}
          onChange={(v) => void waehlen(v)}
          comboboxProps={{ withinPortal: false }}
          w={260}
          data-fach-wahl
        />
      </Popover.Dropdown>
    </Popover>
  )
}

function KlasseAnsicht({ k, neu, zurueck }: { k: KlasseKurz; neu: () => void; zurueck: () => void }): React.JSX.Element {
  const { gruppe, setze } = useSicht()
  const farbe = useProgrammFarbe()
  const aktiv = k.faecher.find((f) => f.id === gruppe) ?? k.faecher[0]
  return (
    <Stack data-klasse-ansicht={k.name}>
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} px={4} onClick={zurueck}>
          Alle Klassen
        </Button>
      </Group>
      <Title order={2}>{/^\d/.test(k.name) ? `Klasse ${k.name}` : k.name}</Title>

      {/* ---------- Fach-Leiste über dem Handlungsbedarf, rechts daneben „Als Schüler ansehen" (ganze Klasse) */}
      <Group justify="space-between" align="flex-start" gap="xs">
        <Group gap="xs" className="mk-faecher" data-fach-leiste>
          {k.faecher.length > 0 && (
            <Tabs value={aktiv?.id ?? null} onChange={(v) => setze({ gruppe: v })} variant="pills" radius="xl" color={farbe}>
              <Tabs.List>
                {k.faecher.map((f) => (
                  <Tabs.Tab
                    key={f.id}
                    value={f.id}
                    rightSection={
                      f.bedarf > 0 ? (
                        <Badge size="xs" color="orange" circle>
                          {f.bedarf}
                        </Badge>
                      ) : undefined
                    }
                    data-fach={f.fach}
                  >
                    {f.fach}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          )}
          <FachHinzufuegen k={k} fertig={(id) => (setze({ gruppe: id }), neu())} />
        </Group>
        {k.gruppen.length > 0 && <AlsSchuelerAnsehen gruppe={aktiv?.id ?? k.gruppen[0]} klasse={k.name} />}
      </Group>

      {!aktiv ? (
        <Card withBorder radius="md" padding="xl" data-ohne-fach>
          <Center>
            <Text c="dimmed" ta="center" maw={460}>
              Für diese Klasse ist noch kein Fach angelegt. Mit „+ Fach hinzufügen“ das unterrichtete Fach wählen – danach stehen hier Lernstand, Material,
              Tests und die Lernenden.
            </Text>
          </Center>
        </Card>
      ) : (
        <FachAnsicht key={aktiv.id} id={aktiv.id} />
      )}
    </Stack>
  )
}

/**
 * Lehrwerk-Stand der Lerngruppe (08.10.2026, abgestimmt): bestimmt, welche Grammatik als bekannt gilt (passende Spiele,
 * Forderaufgaben). Ohne Eintrag gilt die höchste Unit aus den Vokabeltrainings der Lernenden.
 *
 * Klein (08.10.2026, Wunsch der Lehrkraft): ein Knopf in der Kopfzeile von „Vokabeln & Grammatik" („Lehrwerk: Green
 * Line 1 · Unit 2 (automatisch)"), die Auswahl im Pop-up. Zurück zu „automatisch": beide Felder leerbar und ein eigener
 * Knopf – der Server löscht dann den Eintrag (vorher ließ sich ein gewählter Stand nicht mehr abwählen).
 */
function LehrwerkStand({ gruppeId }: { gruppeId: string }): React.JSX.Element | null {
  const [d, setD] = useState<{
    stand: { buch: string; unit: string } | null
    automatisch?: { buch: string; unit: string } | null
    baende: Record<string, string[]>
  } | null>(null)
  const [offen, setOffen] = useState(false)
  const laden = useCallback(
    () => void holen<typeof d>(`/server/grammatik/lehrwerkstand?gruppe=${encodeURIComponent(gruppeId)}`).then(setD, () => setD(null)),
    [gruppeId]
  )
  useEffect(laden, [laden])
  if (!d) return null
  const setzen = (buch: string | null, unit: string | null): void =>
    void senden('/server/grammatik/lehrwerkstand', { gruppe: gruppeId, buch: buch ?? '', unit: unit ?? '' }).then(laden, (e: unknown) => notifyError(e))
  const buch = d.stand?.buch ?? null
  const auto = d.automatisch ?? null
  const gilt = d.stand ?? auto
  const knopfText = gilt ? `Lehrwerk: ${gilt.buch} · ${gilt.unit}${d.stand ? '' : ' (automatisch)'}` : 'Lehrwerk festlegen'
  return (
    <Popover opened={offen} onChange={setOffen} position="bottom-end" withinPortal shadow="md" trapFocus>
      <Popover.Target>
        <Button
          size="compact-sm"
          variant="subtle"
          rightSection={<IconPencil size={14} />}
          onClick={() => setOffen((o) => !o)}
          data-lehrwerk-knopf
          data-automatisch={d.stand ? undefined : ''}
        >
          {knopfText}
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw={360}>
        <Stack gap="xs" data-lehrwerk-stand>
          <Text fw={700} size="sm">
            Lehrwerk-Stand (Grammatik)
          </Text>
          <Text size="xs" c="dimmed">
            Bestimmt, welche Grammatik als bekannt gilt – für passende Spiele und Forderaufgaben. Automatisch: höchste Unit aus den Vokabeln der
            Klasse – {auto ? `zurzeit ${auto.buch} · ${auto.unit}` : 'zurzeit noch keine (keine Vokabeln mit Lehrwerk und Unit)'}.
          </Text>
          <Select
            label="Band"
            data={Object.keys(d.baende)}
            value={buch}
            onChange={(b) => (b ? setzen(b, d.baende[b][0] ?? '') : setzen(null, null))}
            clearable
            placeholder={auto ? `automatisch (${auto.buch})` : 'automatisch'}
            comboboxProps={{ withinPortal: false }}
            data-lehrwerk-band
          />
          <Select
            label="Unit"
            data={buch ? d.baende[buch] ?? [] : []}
            value={d.stand?.unit ?? null}
            onChange={(u) => (buch && u ? setzen(buch, u) : setzen(null, null))}
            clearable
            placeholder={auto && !buch ? `automatisch (${auto.unit})` : 'automatisch'}
            disabled={!buch}
            comboboxProps={{ withinPortal: false }}
            data-lehrwerk-unit
          />
          <Button
            size="xs"
            variant={d.stand ? 'light' : 'subtle'}
            disabled={!d.stand}
            leftSection={d.stand ? undefined : <IconCheck size={14} />}
            onClick={() => setzen(null, null)}
            data-lehrwerk-automatisch
          >
            {d.stand ? 'Automatisch (aus den Vokabeln)' : 'Automatisch (aus den Vokabeln) ist gewählt'}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
function FachAnsicht({ id }: { id: string }): React.JSX.Element {
  const [d, setD] = useState<KlasseDetail | null>(null)
  const [vorschau, setVorschau] = useState<Extract<Vorschlag, { art: 'vokabeln' }> | null>(null)
  const [freigabe, setFreigabe] = useState<FertigesBlatt | null>(null)
  const { reiter, setze } = useSicht()
  const laden = useCallback(() => {
    void holen<KlasseDetail>(`/server/klassen/${id}`).then(setD, (e: unknown) => notifyError(e))
  }, [id])
  useEffect(laden, [laden])
  const fertige = useFertigeBlaetter(id)
  const { logoDataUrl, settings } = useAppSettings()
  if (!d)
    return (
      <Center h="30vh">
        <Loader />
      </Center>
    )
  const ort = { klasse: d.name, fach: d.fach, muster: d.ablageMuster }
  const vokabelnFreischalten = async (v: Extract<Vorschlag, { art: 'vokabeln' }>): Promise<void> => {
    try {
      await senden('/server/vokabeln/freigeben', { lerngruppeId: d.id, titel: v.titel, sprache: v.sprache, fach: v.fach, woerter: v.woerter })
      notifySuccess(`„${v.titel}" ist für ${d.titel} freigeschaltet.`)
      setVorschau(null)
      laden()
    } catch (e) {
      notifyError(e)
    }
  }
  // Reiter: ohne Sprachfach kein „Vokabeln & Grammatik"
  const aktiverReiter = reiter === 'vokabeln' && !d.sprachfach ? 'reihen' : reiter
  return (
    <Stack data-klasse-detail={d.titel}>
      {/* ---------- Handlungsbedarf */}
      <Card withBorder radius="md" padding="md" data-handlungsbedarf>
        <Group gap={6} mb="xs">
          <IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />
          <Text fw={700}>Handlungsbedarf</Text>
        </Group>
        {d.bedarf.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nichts Dringendes – alle Abgaben geprüft, niemand hängt hinterher.
          </Text>
        ) : (
          <Stack gap={4}>
            {d.bedarf.map((b, i) => (
              <UnstyledButton key={i} onClick={() => b.ziel && oeffneMitRueckweg(b.ziel.modul, b.ziel.id)} className="klassen-bedarf" data-bedarf={b.art}>
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon size="sm" variant="light" color={BEDARF_FARBE[b.art]}>
                    {BEDARF_SYMBOL[b.art]}
                  </ThemeIcon>
                  <Text size="sm" style={{ flex: 1 }}>
                    {b.text}
                  </Text>
                  {b.ziel && <IconChevronRight size={14} />}
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Card>

      {/* ---------- Vorschläge für Material */}
      {(d.vorschlaege.length > 0 || fertige.length > 0) && (
        <div>
          <Group gap={6} mb={6}>
            <IconSparkles size={18} color="var(--mantine-color-grape-6)" />
            <Text fw={700}>Passendes Material</Text>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {fertige.map((f) => (
              <Card key={f.docId} withBorder radius="md" padding="md" style={{ borderColor: 'var(--mantine-color-teal-6)' }} data-blatt-fertig>
                <Badge color="teal" mb={6}>
                  fertig
                </Badge>
                <Text fw={700}>{f.titel}</Text>
                <Text size="sm" c="dimmed" mb="sm">
                  Kurz ansehen, dann für {d.titel} freischalten.
                </Text>
                <Group gap="xs">
                  <Button size="xs" variant="default" onClick={() => void openDocument('arbeitsblatt', f.docId)}>
                    Im Editor ansehen
                  </Button>
                  <Button size="xs" leftSection={<IconLock size={14} />} onClick={() => setFreigabe(f)} data-jetzt-freischalten>
                    Jetzt freischalten
                  </Button>
                </Group>
              </Card>
            ))}
            {d.vorschlaege.map((v, i) => (
              <Card key={i} withBorder radius="md" padding="md" data-vorschlag={v.art}>
                <Group gap={6} mb={4}>
                  {v.art === 'vokabeln' ? <IconBook2 size={16} /> : <IconFileText size={16} />}
                  <Text fw={700}>{v.titel}</Text>
                </Group>
                <Text size="sm" c="dimmed" mb={6}>
                  {v.text}
                </Text>
                {v.art === 'blatt' && (
                  <Stack gap={2} mb="sm">
                    {v.schwerpunkte.map((s) => (
                      <Text key={s} size="xs">
                        • {s}
                      </Text>
                    ))}
                  </Stack>
                )}
                {v.art === 'vokabeln' ? (
                  <Button size="xs" onClick={() => setVorschau(v)} data-vorschlag-ansehen>
                    Ansehen und freischalten
                  </Button>
                ) : (
                  <Tooltip label="Entsteht im Hintergrund mit dem eigenen KI-Zugang; ist es fertig, erscheint es hier zum Freischalten">
                    <Button size="xs" leftSection={<IconSparkles size={14} />} onClick={() => blattFuerKlasse(d, v)} data-blatt-erstellen>
                      Übungsblatt erstellen lassen
                    </Button>
                  </Tooltip>
                )}
              </Card>
            ))}
          </SimpleGrid>
        </div>
      )}

      {/* ---------- Reiter (Runde 2): Reihen & Blätter, Vokabeln & Grammatik (Sprachfach), Tests & Noten, Lernende */}
      <Tabs value={aktiverReiter} onChange={(v) => v && setze({ reiter: v })} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="reihen">Unterrichtsreihen & Blätter ({d.reihen.length + d.blaetter.length})</Tabs.Tab>
          {d.sprachfach && <Tabs.Tab value="vokabeln">Vokabeln & Grammatik ({d.vokabeln.length + d.grammatik.length})</Tabs.Tab>}
          <Tabs.Tab value="tests">Tests & Noten ({d.tests.length})</Tabs.Tab>
          <Tabs.Tab value="lernende">Lernende ({d.lernende.length})</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="reihen" pt="sm">
          {/* Neu für diese Klasse (08.10.2026): Reihe bzw. Blatt mit Fach und Jahrgang der Klasse beginnen */}
          <Group gap="xs" mb="sm" data-klasse-neu>
            <Button size="xs" variant="light" leftSection={<IconRoute size={14} />} onClick={() => reiheFuerKlasse(d)} data-reihe-erstellen>
              Unterrichtsreihe erstellen
            </Button>
            <Button size="xs" variant="light" leftSection={<IconFileText size={14} />} onClick={() => void blattNeuFuerKlasse(d)} data-arbeitsblatt-erstellen>
              Arbeitsblatt erstellen
            </Button>
          </Group>
          <MaterialListe eintraege={reihenEintraege(d, ort)} leer="Noch keine Unterrichtsreihen oder Blätter in dieser Lerngruppe." />
        </Tabs.Panel>
        {d.sprachfach && (
          <Tabs.Panel value="vokabeln" pt="sm">
            <Stack gap="xs">
              {/* Kopfzeile: Kurse links, Lehrwerk-Stand als kleiner Knopf rechts (08.10.2026) */}
              <Group justify="space-between" gap="xs">
                <Text fw={700} size="sm">
                  Kurse in Sprachenlernen
                </Text>
                <LehrwerkStand gruppeId={id} />
              </Group>
              <KursKarten d={d} ort={ort} />
              {d.wackelig.length > 0 && (
                <Card withBorder padding="sm" radius="md">
                  <Text fw={700} size="sm" mb={6}>
                    Am häufigsten daneben (alle laufenden Trainings)
                  </Text>
                  <Group gap={6}>
                    {d.wackelig.map((w) => (
                      <Badge key={w.term} variant="light" color={ampel(1 - w.quote)} tt="none">
                        {w.term} – {w.translation} · {Math.round(w.quote * 100)} %
                      </Badge>
                    ))}
                  </Group>
                </Card>
              )}
            </Stack>
          </Tabs.Panel>
        )}
        <Tabs.Panel value="tests" pt="sm">
          <MaterialListe
            eintraege={testEintraege(d, ort)}
            kategorien={['status', 'datum', 'art', 'titel', 'wert']}
            leer="Noch keine Onlinetests in dieser Lerngruppe."
          />
        </Tabs.Panel>
        <Tabs.Panel value="lernende" pt="sm">
          <LernendeTabelle d={d} />
        </Tabs.Panel>
      </Tabs>

      {vorschau && (
        <Modal opened onClose={() => setVorschau(null)} title={vorschau.titel} size="lg">
          <Stack>
            <Text size="sm" c="dimmed">
              {vorschau.woerter.length} Wörter für {d.titel} – als Vokabeltraining im Karteikasten der Lern-App.
            </Text>
            <Table withRowBorders={false} verticalSpacing={2}>
              <Table.Tbody>
                {vorschau.woerter.map((w) => (
                  <Table.Tr key={w.term}>
                    <Table.Td fw={600}>{w.term}</Table.Td>
                    <Table.Td>{w.translation}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setVorschau(null)}>
                Abbrechen
              </Button>
              <Button leftSection={<IconLock size={14} />} onClick={() => void vokabelnFreischalten(vorschau)} data-vokabeln-freischalten>
                Jetzt freischalten
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
      {freigabe && (
        <BlattFreigabeDialog
          ws={freigabe.ws}
          layouts={new Map()}
          logo={logoDataUrl ?? null}
          schoolName={settings.schoolName ?? ''}
          schliessen={() => setFreigabe(null)}
          ohneListe
          gruppeVorwahl={d.id}
          docId={freigabe.docId}
          freigegeben={() => {
            freigabe.erledigt()
            setFreigabe(null)
            laden()
          }}
        />
      )}
    </Stack>
  )
}

type Ort = { klasse: string; fach: string; muster: string }

const oeffnenKnopf = (titel: string, los: () => void): React.JSX.Element => (
  <Tooltip label={`„${titel}" öffnen`}>
    <ActionIcon variant="subtle" onClick={los} aria-label="Öffnen">
      <IconExternalLink size={16} />
    </ActionIcon>
  </Tooltip>
)

function reihenEintraege(d: KlasseDetail, ort: Ort): Eintrag[] {
  const reihen: Eintrag[] = d.reihen.map((r) => ({
    key: `r${r.zid}`,
    art: 'Reihe',
    titel: r.titel,
    status: r.status,
    datum: ms(r.erstellt),
    frist: null,
    wert: r.schnitt,
    inhalt: (
      <MaterialKarte
        symbol={<IconRoute size={16} />}
        titel={r.titel}
        art="Reihe"
        status={r.status}
        angaben={[`seit ${tag(r.erstellt)}`, r.oberthema, `${r.schritte} Schritte`, `${r.fertig} von ${r.lernende} fertig`]}
        wert={r.schnitt}
        wertText={`Ø ${prozent(r.schnitt)}`}
        oeffnen={() => oeffneMitRueckweg('laufendereihen')}
        aktionen={oeffnenKnopf(r.titel, () => oeffneMitRueckweg('laufendereihen'))}
        details={
          <>
            {r.lernziele.length > 0 && (
              <Stack gap={3}>
                <Text size="xs" fw={700}>
                  Lernziele (Anteil, der alle Schritte dazu geschafft hat)
                </Text>
                {r.lernziele.map((z) => (
                  <Group key={z.text} gap={6} wrap="nowrap">
                    <Progress value={z.erreicht * 100} w={70} size="sm" color={ampel(z.erreicht)} style={{ flexShrink: 0 }} />
                    <Text size="xs">
                      {prozent(z.erreicht)} – {z.text}
                    </Text>
                  </Group>
                ))}
              </Stack>
            )}
            {r.nichtBegonnen.length > 0 && <DetailZeile name="Noch nicht begonnen">{namen(r.nichtBegonnen)}</DetailZeile>}
          </>
        }
      />
    )
  }))
  const blaetter: Eintrag[] = d.blaetter.map((b) => {
    const abgegeben = b.gesamt ? b.eingereicht / b.gesamt : 0
    return {
      key: `b${b.id}`,
      art: 'Blatt',
      titel: b.titel,
      status: b.status,
      datum: ms(b.erstellt),
      frist: b.bis,
      wert: b.ergebnis ?? abgegeben,
      inhalt: (
        <MaterialKarte
          symbol={<IconFileText size={16} />}
          titel={b.titel}
          art="Blatt"
          status={b.status}
          angaben={[
            `freigegeben ${tag(b.erstellt)}`,
            b.bis ? `bis ${tag(b.bis)}${b.bis < Date.now() && b.status === 'offen' ? ' (vorbei)' : ''}` : 'ohne Frist',
            b.thema,
            `${b.eingereicht} von ${b.gesamt} eingereicht`,
            `${b.begonnen} begonnen`
          ]}
          wert={abgegeben}
          wertText={b.ergebnis != null ? `Ergebnis ${prozent(b.ergebnis)}` : `${prozent(abgegeben)} abgegeben`}
          oeffnen={() => oeffneMitRueckweg('freigaben', b.id)}
          aktionen={
            <>
              <AblegenKnopf quelle={blattQuelle(b.id, b.titel, Boolean(b.quelle))} {...ort} programm="arbeitsblatt" klein />
              {oeffnenKnopf(b.titel, () => oeffneMitRueckweg('freigaben', b.id))}
            </>
          }
          details={
            <>
              <DetailZeile name="Umfang">
                {b.seiten} Seite{b.seiten === 1 ? '' : 'n'}, {b.aufgaben} Aufgabe{b.aufgaben === 1 ? '' : 'n'}
                {b.loesung ? ', mit Lösung für die Lernenden' : ''}
              </DetailZeile>
              {b.ergebnis != null && <DetailZeile name="Ergebnis">{prozent(b.ergebnis)} der Aufgaben im Schnitt grün (Kurz-Feedback der KI)</DetailZeile>}
              {b.schwierigste && (
                <DetailZeile name="Schwierigste Aufgabe">
                  Nr. {b.schwierigste.nr} ({prozent(b.schwierigste.rot)} rot) – {b.schwierigste.anweisung}
                </DetailZeile>
              )}
              {b.nichtBegonnen.length > 0 && <DetailZeile name="Noch nicht begonnen">{namen(b.nichtBegonnen)}</DetailZeile>}
              {b.nichtEingereicht.length > 0 && <DetailZeile name="Begonnen, nicht eingereicht">{namen(b.nichtEingereicht)}</DetailZeile>}
            </>
          }
        />
      )
    }
  })
  return [...reihen, ...blaetter]
}

/**
 * Kurse statt Einzelliste (08.10.2026, Wunsch der Lehrkraft): EINE Karte je Kurs der Klasse – Titel, Vokabelstand
 * (sicher / kennengelernt / neu), „heute aktiv", Zahl der Grammatik-Trainings und Extras. Grammatik und Extra-Aufgaben
 * für einzelne stehen zugeklappt in der Karte; ein Klick auf die Karte öffnet den Kurs in Sprachenlernen. Was zu keinem
 * Kurs gehört (ältere eigenständige Grammatik-Trainings), liegt zugeklappt unter „Weitere".
 */
function KursKarten({ d, ort }: { d: KlasseDetail; ort: Ort }): React.JSX.Element {
  const kurse = [...d.vokabeln].sort((a, b) => (a.status === b.status ? ms(b.erstellt) - ms(a.erstellt) : a.status === 'offen' ? -1 : 1))
  const kursIds = new Set(kurse.map((k) => k.id))
  const weitere = d.grammatik.filter((g) => !g.vokId || !kursIds.has(g.vokId))
  if (!kurse.length && !weitere.length)
    return (
      <Text c="dimmed" size="sm" data-keine-kurse>
        Noch kein Kurs in dieser Lerngruppe – in Sprachenlernen einen Kurs für die Klasse freigeben.
      </Text>
    )
  return (
    <Stack gap="xs" data-kurse>
      {kurse.map((v) => {
        const gram = d.grammatik.filter((g) => g.vokId === v.id)
        const normal = gram.filter((g) => !g.extra)
        const extras = gram.filter((g) => g.extra)
        const laufendeExtras = extras.filter((g) => g.status === 'offen').length
        const a = v.anteil
        return (
          <div key={v.id} data-kurs={v.titel}>
            <MaterialKarte
              symbol={<IconLanguage size={16} />}
              titel={v.titel}
              art="Kurs"
              status={v.status}
              angaben={[
                v.woerter ? `${v.woerter} Wörter` : 'nur Grammatik',
                v.heuteAktiv != null ? `heute aktiv ${v.heuteAktiv}/${v.lernende}` : `${v.aktiv7} von ${v.lernende} aktiv (7 Tage)`,
                `${normal.length} Grammatik`,
                extras.length ? `${laufendeExtras} von ${extras.length} Extras laufen` : '',
                v.testTermin ? `Test ${tag(v.testTermin)}` : '',
                v.bis ? `bis ${tag(v.bis)}` : ''
              ]}
              wert={null}
              wertText={v.woerter ? `${prozent(v.sicherSchnitt)} sicher` : undefined}
              oeffnen={() => oeffneMitRueckweg('sprachenlernen', v.id)}
              aktionen={
                <>
                  <AblegenKnopf quelle={vokabelQuelle(v.id, v.titel)} {...ort} programm="vokabelliste" klein />
                  {oeffnenKnopf(v.titel, () => oeffneMitRueckweg('sprachenlernen', v.id))}
                </>
              }
              zusatz={
                <>
                  {v.woerter > 0 && a && (
                    <Tooltip label={`sicher ${prozent(a.sicher)} · kennengelernt ${prozent(a.aufbau)} · neu ${prozent(a.neu)}`}>
                      <Progress.Root mt={6} size="md" radius="xl" data-kurs-stand>
                        <Progress.Section value={a.sicher * 100} color="green" />
                        <Progress.Section value={a.aufbau * 100} color="yellow" />
                        <Progress.Section value={a.neu * 100} color="gray.4" />
                      </Progress.Root>
                    </Tooltip>
                  )}
                  {normal.length > 0 && (
                    <Aufklapp titel={`Grammatik (${normal.length})`} kennung="grammatik">
                      {normal.map((g) => (
                        <KursZeile key={g.id} g={g} />
                      ))}
                    </Aufklapp>
                  )}
                  {extras.length > 0 && (
                    <Aufklapp titel={`Extra-Aufgaben (${extras.length})`} kennung="extras">
                      {extras.map((g) => (
                        <KursZeile key={g.id} g={g} />
                      ))}
                    </Aufklapp>
                  )}
                </>
              }
              details={
                v.quelle || v.probleme.length ? (
                  <>
                    {v.quelle && <DetailZeile name="Lehrwerk">{v.quelle}</DetailZeile>}
                    {v.probleme.length > 0 && (
                      <DetailZeile name="Schwierigste Wörter">
                        {v.probleme
                          .map((p) => `${p.term} – ${p.translation} (${prozent(p.quote)} falsch${p.typisch.length ? `, oft „${p.typisch.join('“, „')}“` : ''})`)
                          .join('; ')}
                      </DetailZeile>
                    )}
                  </>
                ) : undefined
              }
            />
          </div>
        )
      })}
      {weitere.length > 0 && (
        <Aufklapp titel={`Weitere (${weitere.length})`} kennung="weitere" rahmen>
          <MaterialListe eintraege={grammatikEintraege(weitere, ort)} leer="" />
        </Aufklapp>
      )}
    </Stack>
  )
}

/** Zugeklappte Gruppe in einer Kurs-Karte */
function Aufklapp({ titel, kennung, rahmen, children }: { titel: string; kennung: string; rahmen?: boolean; children: React.ReactNode }): React.JSX.Element {
  const [auf, setAuf] = useState(false)
  return (
    <div data-aufklapp={kennung}>
      <UnstyledButton mt={6} onClick={() => setAuf((x) => !x)} aria-expanded={auf} data-aufklapp-knopf={kennung}>
        <Group gap={2}>
          {auf ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text size={rahmen ? 'sm' : 'xs'} c="dimmed" fw={rahmen ? 600 : undefined}>
            {titel}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={auf}>
        <Stack gap={4} mt={4} pl={rahmen ? 0 : 'md'}>
          {children}
        </Stack>
      </Collapse>
    </div>
  )
}

/** Eine Grammatik bzw. Extra-Aufgabe in der Kurs-Karte: Titel, Stand, Klick öffnet sie */
function KursZeile({ g }: { g: KlasseDetail['grammatik'][number] }): React.JSX.Element {
  return (
    <UnstyledButton onClick={() => oeffneMitRueckweg('grammatiktraining', g.id)} data-kurs-grammatik={g.titel}>
      <Group gap={6} wrap="nowrap">
        <IconBook2 size={14} />
        <Text size="xs" truncate style={{ flex: 1 }}>
          {g.titel}
          {g.status === 'beendet' ? ' (beendet)' : ''}
        </Text>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {prozent(g.sicherSchnitt)} sicher · {g.lernende} Lernende
        </Text>
      </Group>
    </UnstyledButton>
  )
}

function grammatikEintraege(liste: KlasseDetail['grammatik'], ort: Ort): Eintrag[] {
  return liste.map((g) => ({
    key: `g${g.id}`,
    art: 'Grammatik',
    titel: g.titel,
    status: g.status,
    datum: ms(g.erstellt),
    frist: g.bis,
    wert: g.sicherSchnitt,
    inhalt: (
      <MaterialKarte
        symbol={<IconBook2 size={16} />}
        titel={g.titel}
        art="Grammatik"
        status={g.status}
        angaben={[
          `seit ${tag(g.erstellt)}`,
          g.bis ? `bis ${tag(g.bis)}` : 'ohne Ende',
          `${g.aufgaben} Aufgaben`,
          `${g.aktiv7} von ${g.lernende} aktiv (7 Tage)`
        ]}
        wert={g.sicherSchnitt}
        wertText={`${prozent(g.sicherSchnitt)} sicher`}
        oeffnen={() => oeffneMitRueckweg('grammatiktraining', g.id)}
        aktionen={
          <>
            <AblegenKnopf quelle={grammatikQuelle(g.id, g.titel)} {...ort} programm="grammatiktest" klein />
            {oeffnenKnopf(g.titel, () => oeffneMitRueckweg('grammatiktraining', g.id))}
          </>
        }
        details={
          <>
            {g.thema && <DetailZeile name="Thema">{g.thema}</DetailZeile>}
            <DetailZeile name="Umfang">
              {g.regeln} Regelkarten, {g.aufgaben} Aufgaben
            </DetailZeile>
            {g.probleme.length > 0 && (
              <DetailZeile name="Schwierigste Aufgaben">
                {g.probleme
                  .map((p) => `${p.satz} → ${p.loesung} (${prozent(p.quote)} falsch${p.typisch.length ? `, oft „${p.typisch.join('“, „')}“` : ''})`)
                  .join('; ')}
              </DetailZeile>
            )}
          </>
        }
      />
    )
  }))
}

function testEintraege(d: KlasseDetail, ort: Ort): Eintrag[] {
  return d.tests.map((t) => {
    const art = t.art || 'Test'
    const status: 'offen' | 'beendet' = t.status === 'beendet' ? 'beendet' : 'offen'
    // Stand: Schnittnote auf 0–1 (1,0 = 1, 6,0 = 0)
    const wert = t.durchschnitt == null ? null : Math.max(0, Math.min(1, (6 - t.durchschnitt) / 5))
    return {
      key: `t${t.id}`,
      art,
      titel: t.titel,
      status,
      datum: ms(t.datum),
      frist: null,
      wert,
      inhalt: (
        <MaterialKarte
          symbol={<IconClipboardCheck size={16} />}
          titel={t.titel}
          art={art}
          status={status}
          angaben={[
            tag(t.datum),
            t.thema,
            t.versionen?.length ? `Version${t.versionen.length === 1 ? '' : 'en'} ${t.versionen.join(', ')}` : '',
            t.punkte ? `${t.punkte} Punkte` : '',
            `${t.teilnehmer} Teilnahmen`
          ]}
          wert={null}
          wertText={t.durchschnitt != null ? `Ø ${note(t.durchschnitt)}` : status === 'offen' ? 'läuft' : '–'}
          oeffnen={() => oeffneMitRueckweg('onlinetest', t.id)}
          aktionen={
            <>
              {t.offen > 0 && (
                <Badge color="orange" size="sm">
                  {t.offen} zu prüfen
                </Badge>
              )}
              <AblegenKnopf quelle={testQuelle(t.id, t.titel, Boolean(t.mitOriginal))} {...ort} programm="vokabeltest" klein />
              {oeffnenKnopf(t.titel, () => oeffneMitRueckweg('onlinetest', t.id))}
            </>
          }
          zusatz={
            t.teilnehmer > 0 ? (
              <Group gap="xs" mt={6}>
                <Verteilung werte={t.verteilung} />
                {wert != null && <Progress value={wert * 100} radius="xl" color={ampel(wert)} style={{ flex: 1 }} data-ampel={ampel(wert)} />}
              </Group>
            ) : undefined
          }
          details={
            <>
              {t.zeitMin ? <DetailZeile name="Bearbeitungszeit">{t.zeitMin} Minuten</DetailZeile> : null}
              {t.schwellen?.length ? <DetailZeile name="Notenschlüssel">{t.schwellen.map((s, i) => `${i + 1}: ab ${s} %`).join(' · ')}</DetailZeile> : null}
              {t.schwerpunkte?.length ? <DetailZeile name="Fehlerschwerpunkte">{t.schwerpunkte.join(', ')}</DetailZeile> : null}
              {t.beste && <DetailZeile name="Am besten gelöst">{`${t.beste.titel} (${prozent(t.beste.quote)} richtig)`}</DetailZeile>}
              {t.schwaechste && <DetailZeile name="Am schwächsten">{`${t.schwaechste.titel} (${prozent(t.schwaechste.quote)} richtig)`}</DetailZeile>}
              {t.fehlende?.length ? <DetailZeile name="Nicht teilgenommen">{namen(t.fehlende)}</DetailZeile> : null}
            </>
          }
        />
      )
    }
  })
}

function Verteilung({ werte }: { werte: number[] }): React.JSX.Element {
  const max = Math.max(1, ...werte)
  return (
    <Group gap={2} align="flex-end" h={22} wrap="nowrap">
      {werte.map((n, i) => (
        <Tooltip key={i} label={`Note ${i + 1}: ${n}`}>
          <div
            style={{
              width: 8,
              height: Math.max(2, (n / max) * 22),
              borderRadius: 2,
              background: i < 2 ? 'var(--mantine-color-teal-5)' : i < 4 ? 'var(--mantine-color-yellow-5)' : 'var(--mantine-color-red-5)'
            }}
          />
        </Tooltip>
      ))}
    </Group>
  )
}

function Anteil({ x }: { x: number | null | undefined }): React.JSX.Element {
  if (x == null) return <>–</>
  return (
    <Group gap={6} wrap="nowrap">
      <Progress value={x * 100} w={70} size="sm" color={ampel(x)} />
      <Text size="xs">{prozent(x)}</Text>
    </Group>
  )
}

function LernendeTabelle({ d }: { d: KlasseDetail }): React.JSX.Element {
  const zeilen = useMemo(() => d.lernende, [d])
  if (!zeilen.length) return <Text c="dimmed">Noch keine Lernenden in dieser Lerngruppe.</Text>
  const zeigtVokabeln = zeilen.some((l) => l.vokabelnSicher !== null)
  const zeigtReihen = zeilen.some((l) => l.reihenFortschritt !== null)
  const zeigtGrammatik = zeilen.some((l) => l.grammatikSicher != null)
  return (
    <Table striped highlightOnHover data-lernende-tabelle data-karten>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          {zeigtVokabeln && <Table.Th>Vokabeln sicher</Table.Th>}
          {zeigtVokabeln && <Table.Th>zuletzt geübt</Table.Th>}
          {zeigtGrammatik && <Table.Th>Grammatik sicher</Table.Th>}
          <Table.Th>Testschnitt</Table.Th>
          {zeigtReihen && <Table.Th>Reihen</Table.Th>}
          <Table.Th>Blätter eingereicht</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {zeilen.map((l) => (
          <Table.Tr key={l.id}>
            <Table.Td fw={600}>
              {l.name}
              {l.gast && (
                <Badge size="xs" variant="light" color="gray" ml={6} data-mit-anmeldecode title="Meldet sich mit dem persönlichen Code vom Zettel an">
                  mit Anmeldecode
                </Badge>
              )}
            </Table.Td>
            {zeigtVokabeln && (
              <Table.Td>
                <Anteil x={l.vokabelnSicher} />
              </Table.Td>
            )}
            {zeigtVokabeln && <Table.Td>{tag(l.zuletztGeuebt)}</Table.Td>}
            {zeigtGrammatik && (
              <Table.Td>
                <Anteil x={l.grammatikSicher} />
              </Table.Td>
            )}
            <Table.Td>{l.tests ? note(l.testSchnitt) : '–'}</Table.Td>
            {zeigtReihen && (
              <Table.Td>
                <Anteil x={l.reihenFortschritt} />
              </Table.Td>
            )}
            <Table.Td>{l.blaetterEingereicht}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
