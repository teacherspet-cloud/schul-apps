/**
 * „Meine Klassen" (06.10.2026, abgestimmt mit der Lehrkraft) – Gruppe Verwaltung, nur mit dem Schul-Apps-Server.
 *
 *  - Übersicht (Runde 2): EINE Karte je Klasse („5b", „10b" – alphabetisch, Zahlen natürlich) mit ihren Fächern,
 *    Lernenden und Handlungsbedarf. Lerngruppen gleichen Namens sind die Fächer der Klasse (server/klassen.ts).
 *  - Klasse: oben die Fach-Leiste (Englisch | Geschichte | + Fach hinzufügen – ohne Fach nur „+ Fach hinzufügen"), darunter
 *    für das gewählte Fach der Kopf mit Kennzahlen, Vorschläge für Material, dann die Reiter Unterrichtsreihen & Blätter,
 *    Vokabeln & Grammatik (nur Sprachfächer), Tests & Noten, Lernende. Der Handlungsbedarf steht seit 10.10.2026 im
 *    Pop-up hinter der Kachel „Handlungsbedarf" bzw. der Zahl am Fach (Handlungsbedarf.tsx).
 *  - Materialien: sortier- und filterbar (MaterialListe.tsx), mit Details und „Ablegen ▾" (PDF, Word, Drucken, IServ in der
 *    Ablagestruktur der Verwaltung, klassenAblage.ts). Was von hier geöffnet wird, führt mit „Zurück" wieder hierher.
 *  - Vorschläge: „Wackelige Wörter" (09.10.2026) im Kurs der Klasse wiederholen lassen (wieder fällig, kein zweiter Kurs)
 *    oder als kurzes Arbeitsblatt; „Übungsblatt zu den Fehlern des letzten Tests" entsteht im Hintergrund (KI-Zugang der
 *    Lehrkraft) und erscheint fertig zum Ansehen und Freischalten.
 *  - Reiter Vokabeln/Grammatik (09.10.2026): „Vokabeln hinzufügen" / „Grammatik hinzufügen" mit denselben Dialogen wie in
 *    Sprachenlernen, für denselben Kurs der Klasse; in der Grammatik je Eintrag „+ Aufgaben".
 */
import { problemWoerterText } from '@shared/problemWoerter'
import { SchuljahrHinweis } from './SchuljahrHinweis'
import { LerngruppeAnlegenKnoepfe } from './LerngruppeAnlegen'
import { useExperte } from '../../shared/settingsStore'
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
  Menu,
  Modal,
  Popover,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook2,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircleMinus,
  IconClipboardCheck,
  IconExternalLink,
  IconFileText,
  IconLock,
  IconPencil,
  IconPlus,
  IconRepeat,
  IconRoute,
  IconSparkles,
  IconUsers
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DauerhaftMerken, useAufZu } from '../../shared/sitzung'
import { create } from 'zustand'
import { FAECHER, fachAusName, fachSchreibweise } from '@shared/faecher'
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { KlassenSuche, type SuchTreffer } from './KlassenSuche'
import { KursWahl, LernendeDetails } from './LernendeDetails'
import { neuAnlegen, openDocument, openModule, useDokumentOeffner, useNavigation } from '../../shared/navigation'
import { setzeFachVorgabe, setzeJahrgangVorgabe, setzeLerngruppeVorgabe } from '../../shared/fachVorgabe'
import { useReihenZiel } from '../unterrichtsreihe/UnterrichtsreiheModule'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { blattFuerKlasse, useFertigeBlaetter, vokabelBlattFuerKlasse, type FertigesBlatt } from './klassenMaterial'
// Förder- und Fordermaterial (12.10.2026): Dialog „Für wen" und Bündel „Für dich"
import { FoerderDialog } from './FoerderDialog'
import { FoerderBuendel } from './FoerderBuendel'
import { ProblemWoerterFenster } from './ProblemWoerterFenster'
import { GRAMMATIK_GEAENDERT, MehrAufgabenFenster } from '../lernen/kurs/KursGrammatik'
import { BlattFreigabeDialog } from '../arbeitsblatt/BlattFreigabeKnopf'
import { useAppSettings } from '../../shared/settingsStore'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import { ampel, DetailZeile, MaterialKarte, MaterialListe, type Eintrag } from './MaterialListe'
import { AblegenKnopf } from './AblegenKnopf'
import { blattQuelle, grammatikQuelle, testQuelle, vokabelQuelle } from './klassenAblage'
import { AlsSchuelerAnsehen } from './SchuelerVorschau'
import { FachKopf } from './FachKopf'
import { KlassenKurs } from './KlassenKurs'
import { FachLernstand } from './FachLernstand'
import { SprachLernstand } from './SprachLernstand'
import type { AbschnittStatistik } from '@shared/kursAbschnitte'
import { type AuszeichnungLehrkraft } from './LernendeAuszeichnung'
import { LernendeTabelle } from './LernendeTabelle'
import { IservVorschlaege } from './IservVorschlaege'
import { IservAbzeichen, IservErkennung, IservKursMenue, type IservAngabe, type IservUebersicht } from './IservKurse'
import { useEntwurfBedarf } from './kursBedarf'
import { HandlungsbedarfFenster, useBedarfFenster, type Bedarf } from './Handlungsbedarf'
// Freischaltungen planen (09.10.2026): Zeitleiste „Geplant“ und Kennzeichen „geplant ab …“
import GeplantKarte from './GeplantKarte'
import { geplantText } from '../../shared/components/FreigabePlanen'

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
  /** Aus IServ erkannt (10.10.2026) */
  iserv?: IservAngabe | null
}
interface KlasseKurz {
  schluessel: string
  name: string
  gruppen: string[]
  lernende: number
  bedarf: number
  vorschlaege: number
  faecher: FachKurz[]
  /** Aus IServ erkannter Kurs (10.10.2026) */
  iserv?: IservAngabe | null
}

type Vorschlag =
  | { art: 'vokabeln'; titel: string; text: string; sprache: string; fach: string; woerter: { term: string; translation: string; example?: string }[] }
  | { art: 'blatt'; titel: string; text: string; testId: string; thema: string; schwerpunkte: string[]; testArt: string }

interface KlasseDetail {
  id: string
  name: string
  fach: string
  titel: string
  sprachfach: boolean
  /** Deutsch (13.10.2026): Grammatik ohne Vokabeln – fehlt bei älteren Servern (dann wie Sprachfach) */
  vokabelfach?: boolean
  ablageMuster: string
  /** Aus IServ erkannt: Name der IServ-Gruppe = ihr Gruppenordner (10.10.2026) */
  iserv?: IservAngabe | null
  /** Kürzel der Lehrkraft für die Kursordner-Erkennung beim Ablegen (10.10.2026) */
  iservKuerzel?: string | null
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
    /** Medaillen und Titel in der Sprache der Lerngruppe (10.10.2026) */
    auszeichnung?: AuszeichnungLehrkraft
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
    /** Problemwörter des Kurses (alle, shared/problemWoerter.ts); `probleme` nur die wichtigsten 5 */
    problemZahl?: number
    probleme: { term: string; translation: string; quote: number; typisch: string[] }[]
    /** Kurs-Karte (08.10.2026): Anteile sicher / kennengelernt / neu über alle Lernenden */
    anteil?: { sicher: number; aufbau: number; neu: number }
    heuteAktiv?: number
    /** Name nach Kurs (09.10.2026): „Vokabeln Englisch · Green Line 1–2" */
    kursName?: string
    baende?: string
    /** Übersicht je Abschnitt (shared/kursAbschnitte.ts) und die Namen in der Reihenfolge von `jeLernende` */
    abschnitte?: AbschnittStatistik[]
    lernendeNamen?: string[]
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
    /** Aus der Aufgabenbank (13.10.2026): „+ Aufgaben" nur in „Grammatikformen" */
    bank?: boolean
    lernende: number
    aktiv7: number
    probleme: { satz: string; loesung: string; quote: number; typisch: string[] }[]
    /** Kurs, zu dem die Grammatik gehört ('' = eigenständig) und ob es eine Extra-Aufgabe für einzelne ist (08.10.2026) */
    vokId?: string
    extra?: boolean
  }[]
  wackelig: { term: string; translation: string; quote: number; kurs?: string; id?: string }[]
  /** Alle Problemwörter der laufenden Kurse – `wackelig` sind höchstens 20 davon (10.10.2026) */
  problemZahl?: number
  /** Kurs der Klasse in Sprachenlernen (09.10.2026) – Ziel von „Vokabeln/Grammatik hinzufügen" */
  klassenKurs?: string | null
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
    geplantAb?: number | null
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
    geplantAb?: number | null
  }[]
  bedarf: Bedarf[]
  /** Ausgeblendeter Handlungsbedarf (09.10.2026) – kommt wieder, wenn sich die Lage ändert */
  bedarfAusgeblendet?: Bedarf[]
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
 * Klasse beginnen. Die Lerngruppe wählt man wie gewohnt beim Zuweisen bzw. Freigeben. Seit 13.10.2026 geht die Lerngruppe
 * mit: Reihe und Blatt übernehmen ihr Vorwissen (shared/lerngruppeVorwissen.tsx).
 */
function reiheFuerKlasse(d: Pick<KlasseDetail, 'id' | 'name' | 'fach'>): void {
  useNavigation.getState().setRueckweg({ fuer: 'unterrichtsreihe', nach: 'meineklassen', name: 'Meine Klassen' })
  useReihenZiel.getState().setzeNeu(true, { fachId: fachAusName(d.fach)?.id, grade: jahrgangAusKlasse(d.name), lerngruppe: { id: d.id, name: d.name } })
  openModule('unterrichtsreihe')
}

async function blattNeuFuerKlasse(d: Pick<KlasseDetail, 'id' | 'name' | 'fach'>): Promise<void> {
  const fachId = fachAusName(d.fach)?.id
  const jahrgang = jahrgangAusKlasse(d.name)
  if (fachId) setzeFachVorgabe('arbeitsblatt', fachId)
  if (jahrgang) setzeJahrgangVorgabe('arbeitsblatt', jahrgang)
  setzeLerngruppeVorgabe('arbeitsblatt', { id: d.id, name: d.name })
  useNavigation.getState().setRueckweg({ fuer: 'arbeitsblatt', nach: 'meineklassen', name: 'Meine Klassen' })
  try {
    if (!(await neuAnlegen('arbeitsblatt'))) openModule('arbeitsblatt')
  } catch (e) {
    notifyError(e)
  }
}

/** „2 Punkte Handlungsbedarf" */
const bedarfText = (n: number): string => `${n} ${n === 1 ? 'Punkt' : 'Punkte'} Handlungsbedarf`

/**
 * Zahl des Handlungsbedarfs (08.10.2026, Befund der Lehrkraft: die eingekreiste Zahl neben dem Fach war unklar):
 * kleines oranges Abzeichen mit Warnzeichen und Zahl, Erklärung beim Darüberfahren.
 */
function BedarfZahl({ n, size = 'sm', klick }: { n: number; size?: 'xs' | 'sm'; klick?: () => void }): React.JSX.Element {
  return (
    <Tooltip label={klick ? `${bedarfText(n)} – ansehen` : bedarfText(n)} withinPortal>
      <Badge
        size={size}
        onClick={klick}
        style={{ flexShrink: 0, cursor: klick ? 'pointer' : undefined }}
        color="orange"
        variant="filled"
        leftSection={<IconAlertTriangle size={size === 'xs' ? 10 : 12} />}
        aria-label={bedarfText(n)}
        data-bedarf-zahl={n}
      >
        {n}
      </Badge>
    </Tooltip>
  )
}

export default function MeineKlassenModule({ active }: { active: boolean }): React.JSX.Element | null {
  const [klassen, setKlassen] = useState<KlasseKurz[] | null>(null)
  const [iservDaten, setIservDaten] = useState<IservUebersicht>({})
  const { klasse, setze } = useSicht()
  // Suche (10.10.2026): Person gewählt → Kurswahl (mehrere Kurse) bzw. Details
  const [person, setPerson] = useState<{ p: SuchTreffer; gruppe: string | null } | null>(null)
  const laden = useCallback(() => {
    void holen<{ klassen: KlasseKurz[] } & IservUebersicht>('/server/klassen').then(
      (d) => (setKlassen(d.klassen), setIservDaten({ iservAusgeblendet: d.iservAusgeblendet, iservKuerzel: d.iservKuerzel })),
      (e: unknown) => (notifyError(e), setKlassen([]))
    )
  }, [])
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  /*
   * „Öffnen" eines Auftrags aus „Meine Klassen" (09.10.2026): docId = Lerngruppe → diese Klasse mit dem Fach. Unbekanntes
   * führt still zur Übersicht.
   */
  useDokumentOeffner('meineklassen', async (gruppeId) => {
    try {
      const d = await holen<{ klassen: KlasseKurz[] }>('/server/klassen')
      setKlassen(d.klassen)
      const k = d.klassen.find((x) => x.faecher.some((f) => f.id === gruppeId) || x.gruppen.includes(gruppeId))
      setze(
        k ? { klasse: k.schluessel, gruppe: k.faecher.some((f) => f.id === gruppeId) ? gruppeId : k.faecher[0]?.id ?? null } : { klasse: null, gruppe: null }
      )
    } catch {
      setze({ klasse: null, gruppe: null })
    }
  })
  if (!active) return null
  const sichtbar = klassen ?? []
  const gewaehlt = klassen?.find((k) => k.schluessel === klasse)
  /** Klasse einer Lerngruppe öffnen (aus der Suche bzw. den Details) */
  const zurGruppe = (gruppeId: string, reiter?: string): void => {
    const k = (klassen ?? []).find((x) => x.gruppen.includes(gruppeId) || x.faecher.some((f) => f.id === gruppeId))
    if (k)
      setze({ klasse: k.schluessel, gruppe: k.faecher.some((f) => f.id === gruppeId) ? gruppeId : k.faecher[0]?.id ?? null, ...(reiter ? { reiter } : {}) })
  }
  /*
   * Auf/Zu (10.10.2026, Entscheidung der Lehrkraft): Alles Aufklappbare in „Meine Klassen" bleibt dauerhaft je Gerät so,
   * wie die Lehrkraft es verlassen hat (Vorsilbe „mk:", getrennt von Sprachenlernen); je Lerngruppe eigener Stand.
   */
  return (
    <DauerhaftMerken vorsilbe="mk:">
      <Container size="xl" py="lg" data-meine-klassen>
        <AppKopf
          beschreibung="Lernstand, Tests und Handlungsbedarf je Klasse und Fach – und passendes Material mit einem Klick."
          // Lerngruppen entstehen nur noch hier (10.10.2026, Entscheidung der Lehrkraft) – in der Übersicht
          hauptknopf={!klasse ? <LerngruppeAnlegenKnoepfe geaendert={laden} /> : undefined}
          suche={
            <KlassenSuche
              klassen={klassen ?? []}
              aktuell={gewaehlt ?? null}
              klasseWaehlen={(k) => setze({ klasse: k.schluessel, gruppe: k.faecher[0]?.id ?? null, reiter: 'reihen' })}
              personWaehlen={(p) => setPerson({ p, gruppe: p.gruppen.length === 1 ? p.gruppen[0].id : null })}
            />
          }
        />
        {person && !person.gruppe && (
          <KursWahl name={person.p.name} gruppen={person.p.gruppen} waehlen={(g) => setPerson({ ...person, gruppe: g })} schliessen={() => setPerson(null)} />
        )}
        {person?.gruppe && (
          <DauerhaftMerken bereich={person.gruppe}>
            <LernendeDetails
              key={`${person.p.id}:${person.gruppe}`}
              gruppeId={person.gruppe}
              personId={person.p.id}
              name={person.p.name}
              schliessen={() => setPerson(null)}
              zurKlasse={(g) => (setPerson(null), zurGruppe(g, 'lernende'))}
            />
          </DauerhaftMerken>
        )}
        {!klasse && <SchuljahrHinweis geaendert={laden} />}
        {klasse && gewaehlt ? (
          <KlasseAnsicht k={gewaehlt} neu={laden} zurueck={() => (setze({ klasse: null, gruppe: null }), laden())} />
        ) : !klassen ? (
          <Center h="40vh">
            <Loader />
          </Center>
        ) : klassen.length === 0 ? (
          <Alert icon={<IconUsers size={18} />} title="Noch keine Lerngruppen" data-klassen-leer>
            Lerngruppen entstehen hier über „Lerngruppe anlegen“ (von Hand) oder „Aus IServ übernehmen“. Danach stehen sie hier mit ihrem Lernstand.
          </Alert>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} data-klassen-liste>
            {sichtbar.map((k) => (
              <KlassenKarte key={k.schluessel} k={k} waehlen={() => setze({ klasse: k.schluessel, gruppe: k.faecher[0]?.id ?? null, reiter: 'reihen' })} />
            ))}
          </SimpleGrid>
        )}
        {!klasse && klassen && <IservErkennung key={JSON.stringify(iservDaten.iservKuerzel ?? {})} d={iservDaten} geaendert={laden} />}
      </Container>
    </DauerhaftMerken>
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
        <Text fw={800} size="lg" truncate>
          {/^\d/.test(k.name) ? `Klasse ${k.name}` : k.name}
        </Text>
        {k.bedarf > 0 ? (
          <BedarfZahl n={k.bedarf} />
        ) : (
          <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
            alles ruhig
          </Badge>
        )}
      </Group>
      <Group gap="lg" mb={8} align="center">
        <Kennzahl wert={String(k.lernende)} text="Lernende" />
        <Kennzahl wert={String(k.faecher.length)} text={k.faecher.length === 1 ? 'Fach' : 'Fächer'} />
        {k.vorschlaege > 0 && <Kennzahl wert={String(k.vorschlaege)} text={k.vorschlaege === 1 ? 'Vorschlag' : 'Vorschläge'} />}
        {k.iserv && <IservAbzeichen a={k.iserv} />}
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
                {fachSchreibweise(f.fach)}
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
              {f.bedarf > 0 && <BedarfZahl n={f.bedarf} size="xs" />}
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
  // Vorhandene Fächer über den Katalog erkennen – auch ältere Schreibweisen („englisch")
  const vorhanden = new Set(k.faecher.map((f) => fachAusName(f.fach)?.id ?? f.fach.trim().toLowerCase()))
  const farbe = useProgrammFarbe()
  // Wert ist der Fachname; die eigenen Fächer stellt HaeufigSelect nach oben (im Standardmodus nur sie, weitere per Eintippen)
  const data = useMemo(
    () =>
      FAECHER.filter((f) => f.id !== 'anderes' && !vorhanden.has(f.id) && !vorhanden.has(f.label.toLowerCase())).map((f) => ({
        value: f.label,
        label: f.label
      })),
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
  // Rechtsklick auf ein Fach (08.10.2026, Wunsch der Lehrkraft): „Fach in der Klasse abwählen"
  const [menue, setMenue] = useState<{ f: FachKurz; x: number; y: number } | null>(null)
  const [abwahl, setAbwahl] = useState<FachKurz | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const klasse = /^\d/.test(k.name) ? `Klasse ${k.name}` : k.name
  const abwaehlen = async (f: FachKurz): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<{ art: 'ausgeblendet' | 'entfernt' }>(`/server/klassen/${f.id}/abwaehlen`, {})
      notifySuccess(
        r.art === 'ausgeblendet'
          ? `${fachSchreibweise(f.fach)} ist in ${klasse} abgewählt. Freigegebenes Material bleibt für die Lernenden; „+ Fach hinzufügen" holt das Fach zurück.`
          : `${fachSchreibweise(f.fach)} ist in ${klasse} abgewählt.`
      )
      setAbwahl(null)
      setze({ gruppe: null })
      neu()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Stack data-klasse-ansicht={k.name}>
      <Menu opened={Boolean(menue)} onChange={(o) => !o && setMenue(null)} position="bottom-start" withinPortal>
        <Menu.Target>
          <div style={{ position: 'fixed', left: menue?.x ?? 0, top: menue?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }} />
        </Menu.Target>
        <Menu.Dropdown data-fach-menue>
          <Menu.Item color="red" leftSection={<IconCircleMinus size={16} />} onClick={() => (menue && setAbwahl(menue.f), setMenue(null))} data-fach-abwaehlen>
            {menue ? `${fachSchreibweise(menue.f.fach)} in ${klasse} abwählen` : ''}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal opened={Boolean(abwahl)} onClose={() => setAbwahl(null)} title={abwahl ? `${fachSchreibweise(abwahl.fach)} in ${klasse} abwählen?` : ''} centered>
        <Stack>
          <Text size="sm">
            Das Fach steht dann nicht mehr bei {klasse} in „Meine Klassen". Bereits freigegebenes Material (Kurse, Tests, Arbeitsblätter, Reihen) bleibt für die
            Lernenden erhalten. Über „+ Fach hinzufügen" lässt sich das Fach jederzeit zurückholen.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbwahl(null)}>
              Abbrechen
            </Button>
            <Button color="red" loading={laeuft} onClick={() => abwahl && void abwaehlen(abwahl)} data-fach-abwahl-ok>
              Abwählen
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} px={4} onClick={zurueck}>
          Alle Klassen
        </Button>
      </Group>
      <Group gap="xs" align="center">
        <Title order={2}>{klasse}</Title>
        {k.iserv && <IservAbzeichen a={k.iserv} size="sm" />}
        {(aktiv?.iserv ?? k.iserv) && (
          <IservKursMenue
            gruppeId={(aktiv?.iserv ? aktiv.id : k.faecher.find((f) => f.iserv)?.id) ?? k.gruppen[0]}
            name={k.name}
            geaendert={(weg, neuerName) => {
              if (weg) return zurueck()
              // Umbenannt: die Klasse heißt jetzt anders – Ansicht bleibt auf ihr
              if (neuerName) setze({ klasse: neuerName.trim().toLowerCase().replace(/\s+/g, ' ') })
              neu()
            }}
          />
        )}
      </Group>

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
                    // Zahl am Fach (10.10.2026): öffnet das Pop-up „Handlungsbedarf" dieses Fachs
                    rightSection={f.bedarf > 0 ? <BedarfZahl n={f.bedarf} size="xs" klick={() => useBedarfFenster.getState().oeffne(f.id)} /> : undefined}
                    onContextMenu={(e: React.MouseEvent) => {
                      e.preventDefault()
                      setMenue({ f, x: e.clientX, y: e.clientY })
                    }}
                    aria-label={f.bedarf > 0 ? `${fachSchreibweise(f.fach)}, ${bedarfText(f.bedarf)}` : undefined}
                    data-fach={f.fach}
                  >
                    {fachSchreibweise(f.fach)}
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
        <DauerhaftMerken key={aktiv.id} bereich={aktiv.id}>
          <FachAnsicht id={aktiv.id} bedarfGeaendert={neu} />
        </DauerhaftMerken>
      )}
    </Stack>
  )
}

/**
 * Lehrwerk-Stand der Lerngruppe (08.10.2026, abgestimmt): bestimmt, welche Grammatik als bekannt gilt (passende Spiele,
 * Forderaufgaben). Ohne Eintrag gilt seit 09.10.2026 der Band zu Klassenstufe, Schulform und Land (shared/lehrwerkBand.ts)
 * – ohne Unit; bekannt sind dann alle früheren Bände und das Freigegebene des aktuellen.
 *
 * Klein (08.10.2026, Wunsch der Lehrkraft): ein Knopf in der Kopfzeile von „Vokabeln & Grammatik" („Lehrwerk: Green
 * Line 1 · Unit 2 (automatisch)"), die Auswahl im Pop-up. Zurück zu „automatisch": beide Felder leerbar und ein eigener
 * Knopf – der Server löscht dann den Eintrag (vorher ließ sich ein gewählter Stand nicht mehr abwählen).
 */
function LehrwerkStand({ gruppeId }: { gruppeId: string }): React.JSX.Element | null {
  const [d, setD] = useState<{
    stand: { buch: string; unit: string } | null
    automatisch?: { buch: string; unit: string; grund?: 'jahrgang' | 'vokabeln' } | null
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
  // Automatisch (09.10.2026, abgestimmt): nur der Band – „Lehrwerk: Green Line 6 (automatisch)", keine Unit
  const knopfText = d.stand ? `Lehrwerk: ${d.stand.buch} · ${d.stand.unit}` : auto ? `Lehrwerk: ${auto.buch} (automatisch)` : 'Lehrwerk festlegen'
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
            Bestimmt, welche Grammatik als bekannt gilt – für passende Spiele und Forderaufgaben. Automatisch: der Band zu Klassenstufe, Schulform und
            Bundesland; bekannt sind alle früheren Bände und was aus diesem Band schon freigegeben ist.{' '}
            <span data-lehrwerk-auto-text>{auto ? `automatisch: ${auto.buch}` : 'Zurzeit keiner erkannt (noch keine Vokabeln aus einem Lehrwerk).'}</span>
          </Text>
          <Select
            label="Band"
            data={Object.keys(d.baende)}
            value={buch}
            onChange={(b) => (b ? setzen(b, d.baende[b][0] ?? '') : setzen(null, null))}
            clearable
            placeholder={auto ? `automatisch: ${auto.buch}` : 'automatisch'}
            comboboxProps={{ withinPortal: false }}
            data-lehrwerk-band
          />
          <Select
            label="Unit"
            data={buch ? d.baende[buch] ?? [] : []}
            value={d.stand?.unit ?? null}
            onChange={(u) => (buch && u ? setzen(buch, u) : setzen(null, null))}
            clearable
            placeholder={auto && !buch ? 'automatisch: frühere Bände + Freigegebenes' : 'automatisch'}
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
            {d.stand ? 'Automatisch (nach Klassenstufe)' : 'Automatisch (nach Klassenstufe) ist gewählt'}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
function FachAnsicht({ id, bedarfGeaendert }: { id: string; bedarfGeaendert?: () => void }): React.JSX.Element {
  const experte = useExperte()
  const [d, setD] = useState<KlasseDetail | null>(null)
  const [vorschau, setVorschau] = useState<Extract<Vorschlag, { art: 'vokabeln' }> | null>(null)
  const [freigabe, setFreigabe] = useState<FertigesBlatt | null>(null)
  // Förder-/Fordermaterial (12.10.2026): Dialog und Vorwahl der Gruppe beim Freischalten
  const [foerderOffen, setFoerderOffen] = useState(false)
  const [foerderVorwahl, setFoerderVorwahl] = useState<string[] | null>(null)
  const [wiederholt, setWiederholt] = useState(false)
  // Pop-up „Problemwörter" (10.10.2026): Kachel in „Auf einen Blick"
  const [problemeOffen, setProblemeOffen] = useState(false)
  const { reiter, setze } = useSicht()
  const laden = useCallback(() => {
    void holen<KlasseDetail>(`/server/klassen/${id}`).then(setD, (e: unknown) => notifyError(e))
  }, [id])
  useEffect(laden, [laden])
  // Ausgeblendet/eingeblendet (09.10.2026): Fach neu laden und die Zahlen in Fach-Leiste und Übersicht
  const bedarfNeu = useCallback(() => {
    laden()
    bedarfGeaendert?.()
  }, [laden, bedarfGeaendert])
  // „+ Aufgaben" fertig, Grammatik zurückgeholt … → neu laden
  useEffect(() => {
    window.addEventListener(GRAMMATIK_GEAENDERT, laden)
    return () => window.removeEventListener(GRAMMATIK_GEAENDERT, laden)
  }, [laden])
  const fertige = useFertigeBlaetter(id)
  const bedarfFenster = useBedarfFenster((s) => s.gruppe)
  // Pop-up schließen, wenn das Fach verlassen wird (nicht, wenn es gerade für ein anderes Fach geöffnet wurde)
  useEffect(() => () => void (useBedarfFenster.getState().gruppe === id && useBedarfFenster.getState().schliesse()), [id])
  const { logoDataUrl, settings } = useAppSettings()
  // Grammatik-Entwürfe der Kurse (nur in diesem Gerät, 09.10.2026) – wie auf der Kursseite vorne im Handlungsbedarf
  const entwurfBedarf = useEntwurfBedarf(d?.vokabeln ?? [])
  if (!d)
    return (
      <Center h="30vh">
        <Loader />
      </Center>
    )
  const ort = { klasse: d.name, fach: d.fach, muster: d.ablageMuster, iservGruppe: d.iserv?.roh, kuerzel: d.iservKuerzel ?? null }
  /*
   * „Wackelige Wörter" (09.10.2026, Wunsch der Lehrkraft): kein neuer Kurs mehr (er erschien als zweiter Kurs im Ordner der
   * Lernenden) – die Wörter stehen schon im Kurs der Klasse und werden dort wieder fällig; oder ein kurzes Arbeitsblatt.
   */
  const imKursWiederholen = async (): Promise<void> => {
    setWiederholt(true)
    try {
      const r = await senden<{ woerter: number; lernende: number; kurse: string[] }>(`/server/klassen/${d.id}/wackelig-wiederholen`, {})
      notifySuccess(
        r.woerter
          ? `${r.woerter} ${r.woerter === 1 ? 'Problemwort ist' : 'Problemwörter sind'} für ${r.lernende} Lernende wieder dran – im Kurs ${r.kurse
              .map((k) => `„${k}“`)
              .join(', ')}.`
          : 'Gerade wackelt bei niemandem eines dieser Wörter – nichts zu wiederholen.'
      )
      setVorschau(null)
      laden()
    } catch (e) {
      notifyError(e)
    } finally {
      setWiederholt(false)
    }
  }
  const alsArbeitsblatt = (v: Extract<Vorschlag, { art: 'vokabeln' }>): void => {
    vokabelBlattFuerKlasse(d, v)
    notifySuccess('Die KI erstellt das Arbeitsblatt im Hintergrund – fertig steht es hier unter „Passendes Material“ zum Freischalten.')
    setVorschau(null)
  }
  /*
   * Freischalten (12.10.2026): Förder-/Forderblätter einer Gruppe – die Lernenden der bestätigten Gruppe vom Server
   * vorwählen und das Blatt bei ihnen unter „Für dich" ablegen. Ganze Lerngruppe: wie jedes Blatt. Abgelaufen: ohne Vorwahl.
   */
  const freischalten = async (f: FertigesBlatt): Promise<void> => {
    setFoerderVorwahl(null)
    if (f.foerder && f.foerder.gruppe !== 'alle')
      try {
        const r = await holen<{ schueler: string[] }>(
          `/server/foerdern/auftrag?id=${encodeURIComponent(f.foerder.auftrag)}&gruppe=${encodeURIComponent(f.foerder.gruppe)}`
        )
        setFoerderVorwahl(r.schueler)
      } catch (e) {
        notifyError(e)
        setFoerderVorwahl([])
      }
    setFreigabe(f)
  }
  // Kurs der Klasse (sonst der erste laufende mit Wörtern) – für den Lernstand oben
  const sprachKurs = d.vokabeln.find((v) => v.id === d.klassenKurs) ?? d.vokabeln.find((v) => v.status === 'offen' && v.woerter > 0)
  // Reiter: ohne Sprachfach kein „Vokabeln & Grammatik"
  const aktiverReiter =
    (reiter === 'vokabeln' || reiter === 'grammatik') && !d.sprachfach ? 'reihen' : reiter === 'vokabeln' && d.vokabelfach === false ? 'grammatik' : reiter
  const sichtbarerBedarf = [...entwurfBedarf, ...d.bedarf]
  const wackeligVorschlag = d.vorschlaege.find((v): v is Extract<Vorschlag, { art: 'vokabeln' }> => v.art === 'vokabeln') ?? null
  const kopfDaten = { ...d, bedarf: sichtbarerBedarf }
  // Auch Kurse nur mit Grammatik (17.10.2026, abgestimmt): der Kasten „Units" zeigt dann die Grammatik je Unit.
  // 19.10.2026 (Wunsch der Lehrkraft): auch ganz ohne Vokabeln/Grammatik – die Kästen stehen dann mit Platzhalter da
  const mitLernstand = Boolean(d.sprachfach && sprachKurs)
  /*
   * „Passendes Material" (10.10.2026): Problemwörter stehen nicht mehr hier – die Kachel „Problemwörter" in „Auf einen
   * Blick" öffnet ihr eigenes Pop-up (ProblemWoerterFenster.tsx). In Sprachklassen mit Lernstand ein Kasten in der Reihe
   * neben „Units" (SprachLernstand), sonst wie bisher eigene Karten unter dem Kopf.
   */
  const materialVorschlaege = d.vorschlaege.filter((v): v is Extract<Vorschlag, { art: 'blatt' }> => v.art === 'blatt')
  const materialKasten = (alsKarte: boolean): React.JSX.Element | null => {
    if (!materialVorschlaege.length && !fertige.length) return null
    const kopf = (
      <Group gap={6} mb={alsKarte ? 'xs' : 6}>
        <IconSparkles size={18} color="var(--mantine-color-grape-6)" />
        <Text fw={700}>Passendes Material</Text>
      </Group>
    )
    const karten = (
      <>
        {fertige.map((f) => (
          <Card key={f.docId} withBorder radius="md" padding="md" style={{ borderColor: 'var(--mantine-color-teal-6)' }} data-blatt-fertig>
            <Group gap={6} mb={6}>
              <Badge color="teal">fertig</Badge>
              {/* Förder-/Forderblatt (12.10.2026): nur für die Lehrkraft gekennzeichnet */}
              {f.foerder && (
                <Badge color={f.foerder.art === 'forder' ? 'grape' : 'blue'} variant="light" data-blatt-foerder={f.foerder.art}>
                  {f.foerder.art === 'forder' ? 'Forderblatt' : 'Förderblatt'} · {f.foerder.gruppenTitel}
                </Badge>
              )}
            </Group>
            <Text fw={700}>{f.titel}</Text>
            <Text size="sm" c="dimmed" mb="sm">
              {f.foerder && f.foerder.gruppe !== 'alle'
                ? 'Kurz ansehen, dann für die Kinder der Gruppe freischalten (erscheint bei ihnen oben im Fachordner).'
                : `Kurz ansehen, dann für ${d.titel} freischalten.`}
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => void openDocument('arbeitsblatt', f.docId)}>
                Im Editor ansehen
              </Button>
              <Button size="xs" leftSection={<IconLock size={14} />} onClick={() => void freischalten(f)} data-jetzt-freischalten>
                Jetzt freischalten
              </Button>
            </Group>
          </Card>
        ))}
        {materialVorschlaege.map((v, i) => (
          <Card key={i} withBorder radius="md" padding="md" data-vorschlag={v.art}>
            <Group gap={6} mb={4}>
              <IconFileText size={16} />
              <Text fw={700}>{v.titel}</Text>
            </Group>
            <Text size="sm" c="dimmed" mb={6}>
              {v.text}
            </Text>
            <Stack gap={2} mb="sm">
              {v.schwerpunkte.map((s) => (
                <Text key={s} size="xs">
                  • {s}
                </Text>
              ))}
            </Stack>
            <Tooltip label="Entsteht im Hintergrund mit dem eigenen KI-Zugang; ist es fertig, erscheint es hier zum Freischalten">
              <Button size="xs" leftSection={<IconSparkles size={14} />} onClick={() => blattFuerKlasse(d, v)} data-blatt-erstellen>
                Übungsblatt erstellen lassen
              </Button>
            </Tooltip>
          </Card>
        ))}
      </>
    )
    return alsKarte ? (
      <Card withBorder radius="md" padding="md" h="100%" data-passendes-material>
        {kopf}
        <Stack gap="xs">{karten}</Stack>
      </Card>
    ) : (
      <div data-passendes-material>
        {kopf}
        <SimpleGrid cols={{ base: 1, md: 2 }}>{karten}</SimpleGrid>
      </div>
    )
  }
  return (
    <Stack data-klasse-detail={d.titel}>
      {/* ---------- Kopf mit Kennzahlen (09.10.2026, „Kopf + Reiter" wie die Kursseite; für jedes Fach) – in Sprachklassen
           mit Lernstand klein neben Karteikasten und Units (10.10.2026, unten) */}
      {d.sprachfach && !mitLernstand && <FachKopf d={kopfDaten} gehe={(r) => setze({ reiter: r })} />}
      {/* ---------- Andere Fächer (19.10.2026, abgestimmt): dieselbe Reihe aus Kästen – Auf einen Blick, Lernstand in
           Reihen & Blättern, Reihen & Blätter – immer, auch ohne Material */}
      {!d.sprachfach && (
        <FachLernstand
          gruppeId={d.id}
          fach={d.fach}
          reihen={d.reihen}
          blaetter={d.blaetter}
          tests={d.tests}
          lernende={d.lernende.length}
          kopf={<FachKopf d={kopfDaten} gehe={(r) => setze({ reiter: r })} kompakt />}
          material={materialKasten(true)}
          zuReihen={() => setze({ reiter: 'reihen' })}
          reiheErstellen={() => reiheFuerKlasse(d)}
          blattErstellen={() => void blattNeuFuerKlasse(d)}
          oeffnen={(art, mid) =>
            art === 'blatt'
              ? oeffneMitRueckweg('freigaben', mid)
              : art === 'reihe'
                ? oeffneMitRueckweg('laufendereihen')
                : art === 'test'
                  ? oeffneMitRueckweg('onlinetest', mid)
                  : oeffneMitRueckweg('rueckmeldung')
          }
        />
      )}
      {/* ---------- Lernstand der Sprachklasse (09.10.2026): wie der Überblick der Kursseite – Karteikasten und Units;
           seit 10.10.2026 mit dem kompakten Kennzahlen-Kasten vorn in derselben Reihe */}
      {mitLernstand && sprachKurs && (
        <SprachLernstand
          kursId={sprachKurs.id}
          abschnitte={sprachKurs.abschnitte}
          zuAbschnitten={() => setze({ reiter: 'vokabeln' })}
          zuGrammatik={() => setze({ reiter: 'grammatik' })}
          kopf={<FachKopf d={kopfDaten} gehe={(r) => setze({ reiter: r })} kompakt problemeOeffnen={() => setProblemeOffen(true)} />}
          material={materialKasten(true)}
        />
      )}

      {/* ---------- Handlungsbedarf als Pop-up (10.10.2026): öffnet die Kachel „Handlungsbedarf" bzw. die Zahl am Fach */}
      {bedarfFenster === d.id && (
        <HandlungsbedarfFenster
          gruppeId={d.id}
          titel={d.titel}
          bedarf={sichtbarerBedarf}
          ausgeblendet={d.bedarfAusgeblendet ?? []}
          wackelig={wackeligVorschlag ? { woerter: wackeligVorschlag.woerter.length, gesamt: d.problemZahl ?? wackeligVorschlag.woerter.length } : null}
          oeffnen={oeffneMitRueckweg}
          setzeReiter={(r) => setze({ reiter: r })}
          geaendert={bedarfNeu}
          wackeligAnsehen={() => (mitLernstand ? setProblemeOffen(true) : wackeligVorschlag && setVorschau(wackeligVorschlag))}
          wackeligWiederholen={() => void imKursWiederholen()}
          wiederholtLaeuft={wiederholt}
        />
      )}

      {/* ---------- Geplante Freischaltungen (09.10.2026) */}
      <GeplantKarte gruppeId={d.id} neuLaden={laden} />

      {/* ---------- Vorschläge für Material: in Sprachklassen mit Lernstand oben in der Reihe neben „Units" (10.10.2026) */}
      {d.sprachfach && !mitLernstand && materialKasten(false)}

      {/* ---------- Reiter (Runde 2): Reihen & Blätter, Vokabeln & Grammatik (Sprachfach), Tests & Noten, Lernende */}
      <Tabs value={aktiverReiter} onChange={(v) => v && setze({ reiter: v })} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="reihen">Unterrichtsreihen & Blätter ({d.reihen.length + d.blaetter.length})</Tabs.Tab>
          {/* Vokabeln und Grammatik getrennt (08.10.2026, Wunsch der Lehrkraft) */}
          {/* Zahl nur Kurse mit Wörtern (19.10.2026, Befund 9c: der leere Klassenkurs zählte als „Vokabeln (1)") */}
          {d.sprachfach && d.vokabelfach !== false && <Tabs.Tab value="vokabeln">Vokabeln ({d.vokabeln.filter((v) => v.woerter > 0).length})</Tabs.Tab>}
          {d.sprachfach && <Tabs.Tab value="grammatik">Grammatik ({d.grammatik.length})</Tabs.Tab>}
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
            {/* Förder- und Fordermaterial (12.10.2026, Entscheidung der Lehrkraft): rechts neben „Arbeitsblatt erstellen" */}
            <Button
              size="xs"
              variant="light"
              color="grape"
              leftSection={<IconUsers size={14} />}
              onClick={() => setFoerderOffen(true)}
              data-foerder-erstellen-knopf
            >
              Förder- und Fordermaterial erstellen
            </Button>
          </Group>
          <FoerderBuendel gruppeId={d.id} klasse={d.name} fach={d.fach} />
          <MaterialListe eintraege={reihenEintraege(d, ort)} leer="Noch keine Unterrichtsreihen oder Blätter in dieser Lerngruppe." />
        </Tabs.Panel>
        {d.sprachfach && (
          <Tabs.Panel value="vokabeln" pt="sm">
            <Stack gap="xs">
              {/* Dieselbe Kursseite wie in Sprachenlernen, eingebettet (09.10.2026); Lehrwerk-Stand rechts in der Kopfzeile */}
              <KlassenKurs
                kurse={d.vokabeln}
                klassenKurs={d.klassenKurs}
                bereich="vokabeln"
                rechts={<LehrwerkStand gruppeId={id} />}
                aktionen={(k) => <AblegenKnopf quelle={vokabelQuelle(k.id, k.titel)} {...ort} programm="vokabelliste" klein />}
                geaendert={laden}
              />
              {/* „Am häufigsten daneben" nur im Expertenmodus (09.10.2026, Wunsch der Lehrkraft) */}
              {d.wackelig.length > 0 && experte && (
                <Card withBorder padding="sm" radius="md" data-haeufig-daneben>
                  <Text fw={700} size="sm" mb={6}>
                    {problemWoerterText(d.problemZahl ?? d.wackelig.length, d.wackelig.length)} (alle laufenden Kurse)
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
        {d.sprachfach && (
          <Tabs.Panel value="grammatik" pt="sm">
            <Stack gap="xs">
              <KlassenKurs kurse={d.vokabeln} klassenKurs={d.klassenKurs} bereich="grammatik" rechts={<LehrwerkStand gruppeId={id} />} geaendert={laden} />
              {/* Grammatik ohne Kurs (ältere eigenständige Trainings) */}
              <GrammatikReiter d={d} ort={ort} nurWeitere />
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
          {/* Erste IServ-Anmeldung, mehrdeutig: mit dem bisherigen Gastkonto zusammenführen? (09.10.2026) */}
          <IservVorschlaege gruppeId={d.id} geaendert={laden} />
          <LernendeTabelle gruppeId={d.id} titel={d.titel || d.name} lernende={d.lernende} neuLaden={laden} />
        </Tabs.Panel>
      </Tabs>

      {vorschau && (
        <Modal opened onClose={() => setVorschau(null)} title={vorschau.titel} size="lg">
          <Stack>
            <Text size="sm" c="dimmed">
              {vorschau.woerter.length} Wörter für {d.titel}. Sie stehen schon im Kurs der Klasse: „Im Kurs wiederholen“ macht sie bei allen, die darin wackeln,
              in der nächsten Tagesrunde wieder fällig – ohne neuen Kurs. Oder die KI erstellt daraus ein kurzes Arbeitsblatt (höchstens zwei Seiten), das
              danach hier zum Freischalten bereitsteht.
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
              <Button variant="light" leftSection={<IconFileText size={14} />} onClick={() => alsArbeitsblatt(vorschau)} data-wackelig-blatt>
                Als kurzes Arbeitsblatt
              </Button>
              <Button leftSection={<IconRepeat size={14} />} loading={wiederholt} onClick={() => void imKursWiederholen()} data-wackelig-wiederholen>
                Im Kurs wiederholen
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
      {problemeOffen && sprachKurs && (
        <ProblemWoerterFenster
          kursId={sprachKurs.id}
          klasse={d}
          schliessen={() => setProblemeOffen(false)}
          wiederholen={imKursWiederholen}
          wiederholtLaeuft={wiederholt}
          geaendert={bedarfNeu}
        />
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
          {...(freigabe.foerder && freigabe.foerder.gruppe !== 'alle' ? { einzelneVorwahl: foerderVorwahl ?? [], fuerDich: true } : {})}
          freigegeben={() => {
            freigabe.erledigt()
            setFreigabe(null)
            laden()
          }}
        />
      )}
      {foerderOffen && <FoerderDialog klasse={d} schliessen={() => setFoerderOffen(false)} />}
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
    geplant: Boolean(r.geplantAb && r.geplantAb > Date.now()),
    inhalt: (
      <MaterialKarte
        kennung={`r${r.zid}`}
        symbol={<IconRoute size={16} />}
        titel={r.titel}
        art="Reihe"
        status={r.status}
        angaben={[geplantText(r.geplantAb), `seit ${tag(r.erstellt)}`, r.oberthema, `${r.schritte} Schritte`, `${r.fertig} von ${r.lernende} fertig`]}
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
      geplant: Boolean(b.geplantAb && b.geplantAb > Date.now()),
      inhalt: (
        <MaterialKarte
          kennung={`b${b.id}`}
          symbol={<IconFileText size={16} />}
          titel={b.titel}
          art="Blatt"
          status={b.status}
          angaben={[
            geplantText(b.geplantAb),
            !b.geplantAb && `freigegeben ${tag(b.erstellt)}`,
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
/** Reiter „Grammatik“ (08.10.2026): je Kurs die Grammatiktrainings, Extra-Aufgaben zugeklappt, nicht verbundene unter „Weitere“ */
function GrammatikReiter({ d, ort, nurWeitere = false }: { d: KlasseDetail; ort: Ort; nurWeitere?: boolean }): React.JSX.Element | null {
  const kurse = [...d.vokabeln].sort((a, b) => (a.status === b.status ? ms(b.erstellt) - ms(a.erstellt) : a.status === 'offen' ? -1 : 1))
  const kursIds = new Set(kurse.map((k) => k.id))
  const weitere = d.grammatik.filter((g) => !g.vokId || !kursIds.has(g.vokId))
  // Eingebettete Kursseite (09.10.2026): hier nur noch, was zu keinem Kurs gehört
  if (nurWeitere)
    return weitere.length ? (
      <Aufklapp titel={`Grammatik ohne Kurs (${weitere.length})`} kennung="weitere" merken="weitere-ohne-kurs" rahmen>
        <MaterialListe eintraege={grammatikEintraege(weitere, ort)} leer="" />
      </Aufklapp>
    ) : null
  if (!d.grammatik.length)
    return (
      <Text c="dimmed" size="sm" data-keine-grammatik>
        Noch keine Grammatik für diese Lerngruppe – oben „Grammatik hinzufügen“.
      </Text>
    )
  return (
    <Stack gap="sm" data-grammatik-reiter>
      {kurse.map((v) => {
        const gram = d.grammatik.filter((g) => g.vokId === v.id)
        if (!gram.length) return null
        const normal = gram.filter((g) => !g.extra)
        const extras = gram.filter((g) => g.extra)
        return (
          <Stack key={v.id} gap={4} data-grammatik-kurs={v.titel}>
            <Text size="xs" c="dimmed" fw={600}>
              {v.titel}
            </Text>
            <MaterialListe eintraege={grammatikEintraege(normal, ort)} leer="Nur Extra-Aufgaben in diesem Kurs." />
            {extras.length > 0 && (
              <Aufklapp titel={`Extra-Aufgaben (${extras.length})`} kennung="extras" merken={`extras-${v.id}`}>
                {extras.map((g) => (
                  <KursZeile key={g.id} g={g} />
                ))}
              </Aufklapp>
            )}
          </Stack>
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

/** Zugeklappte Gruppe in einer Kurs-Karte (Auf/Zu dauerhaft unter `merken`, sonst `kennung`) */
function Aufklapp({
  titel,
  kennung,
  merken,
  rahmen,
  children
}: {
  titel: string
  kennung: string
  merken?: string
  rahmen?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [auf, setAuf] = useAufZu(`aufklapp-${merken ?? kennung}`, false)
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

/** „+ Aufgaben" (09.10.2026, Wunsch der Lehrkraft): wie in der Grammatik-Tabelle des Kurses – KI im Hintergrund, angehängt */
function MehrAufgabenKnopf({ g }: { g: KlasseDetail['grammatik'][number] }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  return (
    <>
      <Tooltip label="Weitere Aufgaben zu dieser Grammatik erstellen lassen">
        <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={() => setOffen(true)} data-mk-mehr-aufgaben={g.titel}>
          Aufgaben
        </Button>
      </Tooltip>
      {offen && (
        <MehrAufgabenFenster
          g={{
            id: g.id,
            titel: g.titel,
            thema: g.thema,
            aufgaben: g.aufgaben,
            lernende: g.lernende,
            sicherSchnitt: g.sicherSchnitt,
            status: g.status,
            erstellt: g.erstellt
          }}
          schliessen={() => setOffen(false)}
        />
      )}
    </>
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
        kennung={`g${g.id}`}
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
            {g.status === 'offen' && !g.bank && <MehrAufgabenKnopf g={g} />}
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
          kennung={`t${t.id}`}
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
