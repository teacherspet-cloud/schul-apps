/**
 * Material für die Fachschaft (02.10.2026, nur mit dem Schul-Apps-Server; Server:
 * src/server/fachschaft.ts, erste Fassung src/server/fachordner.ts).
 *
 *  - In jeder Bibliothek: ⋯ › „Für Fachschaft freigeben" bzw. „Freigabe für Fachschaft zurücknehmen".
 *    Freigegeben wird das Original – die Fachschaft sieht immer den aktuellen Stand.
 *  - In jeder Bibliothek oben: „Von der Fachschaft" – Öffnen zeigt das Material; wer etwas ändert,
 *    bekommt eine eigene, namentlich benannte Kopie (der Server benennt sie beim ersten geänderten
 *    Speichern). Die Kopie sieht die Fachschaft erst, wenn man sie freigibt.
 *  - Seit 09.10.2026 (Entscheidung des Admins) gibt es die Sammelkarte unter „Schule & Daten ›
 *    Daten und Material" nicht mehr: Alles steht in der Bibliothek der jeweiligen App – auch die
 *    Kopien aus der ersten Fassung (Übernehmen/Entfernen) und die eigenen Freigaben. Noch nicht
 *    angesehene Einträge zählen Leiste und Bibliothek (shared/fachschaftNeu.ts).
 *  - Sichtbar für alle, die das Fach unterrichten (eigene Fächer oder IServ-Gruppen).
 *  - Seit 10.10.2026 (Entscheidung der Lehrkraft): Im Kopf jeder Bibliothek wählt ein Schalter „Nur meine Materialien" |
 *    „Auch Fachschaftsmaterial (n)". Vorgabe: nur die eigenen – „Von der Fachschaft" steht erst nach dem Umschalten da.
 *    Die Wahl gilt dauerhaft je Gerät (Ansichtswunsch, kein Auf/Zu – shared/sitzung.ts). Neues zeigt die Leiste weiter
 *    an; am Schalter ein Punkt, damit man findet, wo es steht. Findet eine Suche nur Fachschaftsmaterial, erscheint es
 *    trotzdem – mit Hinweis (wie bei Material aus Unterrichtsreihen).
 */
import { ActionIcon, Anchor, Badge, Button, Card, Collapse, Group, Menu, Modal, SegmentedControl, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconChevronDown, IconChevronRight, IconDownload, IconFolders, IconShare, IconShareOff, IconTrash } from '@tabler/icons-react'
import { useContext, useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { holen, senden, ServerFehler } from '../../modules/onlinetest/serverApi'
import { FAECHER } from '@shared/faecher'
import { fachVorschlag } from '@shared/fachschaftFach'
import { useAppSettings } from '../settingsStore'
import HaeufigSelect from './HaeufigSelect'
import { aufServer, serverIch } from '../plattform'
import { openDocument } from '../navigation'
import { notifyError, notifySuccess } from '../util'
import { AktuellesProgramm } from '../eigenesFenster'
import { gesehenErgaenzen, gesehenLesen, gesehenSchreiben, neueJeProgramm, type FachschaftsEintrag } from '../fachschaftNeu'
import { passtZurSuche } from '../bibliothek'

const FREIGEBBAR = ['arbeitsblatt', 'vokabeltest', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'elternbrief', 'tafelbild']

export interface Freigabe {
  id: string
  art: string
  docId: string
  fach: string
  titel: string
  vonName: string
  eigen: boolean
  datum: string
  /** Überthema bzw. Thema des Materials (10.10.2026) */
  thema?: string
  jahrgang?: number
}

/** Kopie aus der ersten Fassung (Fachordner, /server/fach): zum Übernehmen in die eigene Ablage */
interface AltEintrag {
  id: string
  art: string
  titel: string
  von: string
  vonName: string
  datum: string
  /** Fach des Ordners (ergänzt beim Laden) */
  fach: string
}

const konto = (): string => serverIch()?.benutzer ?? ''

const useFachschaft = create<{
  eintraege: Freigabe[] | null
  faecher: { id: string; label: string }[]
  alt: AltEintrag[]
  gesehen: string[]
  laden: () => Promise<void>
  /** Die Einträge eines Programms als angesehen merken (Liste in der Bibliothek aufgeklappt) */
  gesehenMarkieren: (art: string) => void
}>((set, get) => ({
  eintraege: null,
  faecher: [],
  alt: [],
  gesehen: [],
  laden: async () => {
    if (!aufServer()) return
    set({ gesehen: gesehenLesen(konto()) })
    try {
      const d = await holen<{ eintraege: Freigabe[]; faecher: { id: string; label: string }[] }>('/server/fachschaft')
      set({ eintraege: d.eintraege, faecher: d.faecher })
    } catch {
      set({ eintraege: [] })
    }
    try {
      const d = await holen<{ faecher: { id: string; eintraege: Omit<AltEintrag, 'fach'>[] }[] }>('/server/fach')
      set({ alt: d.faecher.flatMap((f) => f.eintraege.map((e) => ({ ...e, fach: f.id }))) })
    } catch {
      set({ alt: [] })
    }
  },
  gesehenMarkieren: (art) => {
    const { eintraege, alt, gesehen } = get()
    const ids = [...(eintraege ?? []).filter((e) => e.art === art && !e.eigen).map((e) => e.id), ...alt.filter((e) => e.art === art).map((e) => `alt:${e.id}`)]
    const neu = gesehenErgaenzen(gesehen, ids)
    if (neu.length === gesehen.length) return
    gesehenSchreiben(konto(), neu)
    set({ gesehen: neu })
  }
}))

/** Alle Einträge für die Zählung „neu" (Freigaben und Kopien der ersten Fassung) */
const zaehlEintraege = (eintraege: Freigabe[] | null, alt: AltEintrag[]): FachschaftsEintrag[] => [
  ...(eintraege ?? []).map((e) => ({ id: e.id, art: e.art, eigen: e.eigen })),
  ...alt.map((e) => ({ id: `alt:${e.id}`, art: e.art, eigen: e.von === serverIch()?.benutzer }))
]

/** Alle Freigaben der Fachschaft (für die Materialien-Seite am Telefon) – lädt beim ersten Aufruf */
export function useFachschaftEintraege(): Freigabe[] | null {
  return useFreigaben()
}

function useFreigaben(): Freigabe[] | null {
  const eintraege = useFachschaft((s) => s.eintraege)
  useEffect(() => {
    if (aufServer() && eintraege === null) void useFachschaft.getState().laden()
  }, [eintraege])
  return eintraege
}

/**
 * Noch nicht angesehene Einträge der Fachschaft je Programm – für die Zahl an der App in der Leiste.
 * Lädt beim ersten Aufruf und danach alle zehn Minuten neu (nur auf dem Server).
 */
export function useFachschaftNeu(): Record<string, number> {
  const eintraege = useFachschaft((s) => s.eintraege)
  const alt = useFachschaft((s) => s.alt)
  const gesehen = useFachschaft((s) => s.gesehen)
  useEffect(() => {
    if (!aufServer()) return
    if (useFachschaft.getState().eintraege === null) void useFachschaft.getState().laden()
    const t = window.setInterval(() => void useFachschaft.getState().laden(), 10 * 60_000)
    return () => window.clearInterval(t)
  }, [])
  return useMemo(() => (aufServer() ? neueJeProgramm(zaehlEintraege(eintraege, alt), gesehen) : {}), [eintraege, alt, gesehen])
}

/** Freigegebenes Material öffnen – der Server legt eine stille Arbeitskopie an */
export async function freigabeOeffnen(f: Freigabe): Promise<void> {
  try {
    const r = await senden<{ art: string; id: string }>('/server/fachschaft/oeffnen', { freigabe: f.id })
    await openDocument(r.art, r.id)
  } catch (e) {
    notifyError(e, 'Ließ sich nicht öffnen')
  }
}

/** Material, für das gerade nach dem Fach gefragt wird (10.10.2026) */
const useFachFrage = create<{ frage: { art: string; id: string; name: string } | null }>(() => ({ frage: null }))

/**
 * Für die Fachschaft freigeben – aus dem ⋯-Menü der Bibliothek und der Materialien-Seite am Telefon. Erkennt der Server
 * kein Fach im Material (10.10.2026), fragt ein Dialog danach (`FachschaftFachFrage`, einmal in App.tsx).
 */
export async function fuerFachschaftFreigeben(art: string, id: string, name: string, fach?: string): Promise<boolean> {
  try {
    const r = await senden<{ label: string }>('/server/fachschaft/freigeben', { art, id, ...(fach ? { fach } : {}) })
    notifySuccess(`„${name}“ ist für die Fachschaft ${r.label} freigegeben – wer das Fach unterrichtet, sieht und öffnet es.`)
    void useFachschaft.getState().laden()
    return true
  } catch (e) {
    if (e instanceof ServerFehler && (e.daten as { fachNoetig?: boolean } | undefined)?.fachNoetig) useFachFrage.setState({ frage: { art, id, name } })
    else notifyError(e)
    return false
  }
}

const FACH_WAHL = FAECHER.filter((f) => f.id !== 'anderes').map((f) => ({ value: f.id, label: f.label }))

/** Dialog „Für welches Fach?" – vorbelegt mit dem eigenen Fach, wenn es genau eines ist */
export function FachschaftFachFrage(): React.JSX.Element | null {
  const frage = useFachFrage((s) => s.frage)
  const eigene = useAppSettings((s) => s.settings.eigeneFaecher)
  const [fach, setFach] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  useEffect(() => {
    if (frage) setFach(fachVorschlag(eigene))
  }, [frage])
  if (!frage) return null
  const zu = (): void => useFachFrage.setState({ frage: null })
  return (
    <Modal opened onClose={zu} title="Für welches Fach freigeben?" data-fachschaft-fachfrage>
      <Stack>
        <Text size="sm">
          In „{frage.name}“ ist kein Fach hinterlegt. Die Freigabe sehen alle Lehrkräfte, die das gewählte Fach unterrichten.
        </Text>
        <HaeufigSelect art="fach" label="Fach" data={FACH_WAHL} value={fach} onChange={setFach} searchable comboboxProps={{ withinPortal: true, zIndex: 400 }} data-fachschaft-fach />
        <Group justify="flex-end">
          <Button variant="default" onClick={zu}>
            Abbrechen
          </Button>
          <Button
            disabled={!fach}
            loading={sendet}
            data-fachschaft-fach-ok
            onClick={() => {
              if (!fach) return
              setSendet(true)
              void fuerFachschaftFreigeben(frage.art, frage.id, frage.name, fach).then((ok) => {
                setSendet(false)
                if (ok) zu()
              })
            }}
          >
            Freigeben
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Darf dieses Programm für die Fachschaft freigeben? (nur am Server) */
export const freigebbar = (moduleId: string): boolean => aufServer() && FREIGEBBAR.includes(moduleId)

/** Ist dieses Material schon für die Fachschaft freigegeben? */
export function useFreigegeben(moduleId: string, id: string): boolean {
  const eintraege = useFreigaben()
  return !!eintraege?.some((e) => e.eigen && e.art === moduleId && e.docId === id)
}

/** Freigabe zurücknehmen */
export async function freigabeZuruecknehmen(art: string, id: string, name: string): Promise<void> {
  try {
    await senden('/server/fachschaft/zuruecknehmen', { art, id })
    notifySuccess(`„${name}“ ist nicht mehr für die Fachschaft freigegeben.`)
    void useFachschaft.getState().laden()
  } catch (e) {
    notifyError(e)
  }
}

/** Menüpunkt im ⋯-Menü eines Eintrags (Bibliothek): freigeben bzw. zurücknehmen */
export function TeilenMenuePunkt({ moduleId, id, name }: { moduleId?: string; id: string; name: string }): React.JSX.Element | null {
  const eintraege = useFreigaben()
  if (!aufServer() || !moduleId || !FREIGEBBAR.includes(moduleId)) return null
  const freigegeben = eintraege?.some((e) => e.eigen && e.art === moduleId && e.docId === id)
  return freigegeben ? (
    <Menu.Item
      leftSection={<IconShareOff size={14} />}
      onClick={() => void freigabeZuruecknehmen(moduleId, id, name)}
      data-fachschaft-zuruecknehmen
    >
      Freigabe für Fachschaft zurücknehmen
    </Menu.Item>
  ) : (
    <Menu.Item
      leftSection={<IconShare size={14} />}
      onClick={() => void fuerFachschaftFreigeben(moduleId, id, name)}
      data-fachschaft-freigeben
    >
      Für Fachschaft freigeben
    </Menu.Item>
  )
}

/** Früher: Dialog „Mit der Fachschaft teilen" – die Freigabe braucht keinen Dialog mehr */
export function TeilenDialog(): null {
  return null
}

function FreigabeZeile({ f }: { f: Freigabe }): React.JSX.Element {
  return (
    <Group justify="space-between" wrap="nowrap" data-freigabe={f.id}>
      <div style={{ minWidth: 0 }}>
        <Text size="sm" truncate>
          {f.titel}
        </Text>
        <Text size="xs" c="dimmed">
          {f.eigen ? 'eigenes Material' : f.vonName} · {new Date(f.datum).toLocaleDateString('de-DE')}
        </Text>
      </div>
      <Button size="xs" variant="light" onClick={() => void freigabeOeffnen(f)} data-freigabe-oeffnen>
        Öffnen
      </Button>
    </Group>
  )
}

/** Kopie aus der ersten Fassung: übernehmen (eigene Kopie) oder aus dem Fachordner entfernen */
function AltZeile({ e }: { e: AltEintrag }): React.JSX.Element {
  const ich = serverIch()
  return (
    <Group justify="space-between" wrap="nowrap" data-fachordner-alt={e.id}>
      <div style={{ minWidth: 0 }}>
        <Text size="sm" truncate>
          {e.titel}
        </Text>
        <Text size="xs" c="dimmed">
          Kopie zum Übernehmen · {e.vonName || e.von} · {new Date(e.datum).toLocaleDateString('de-DE')}
        </Text>
      </div>
      <Group gap={4} wrap="nowrap">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={14} />}
          onClick={() =>
            void senden('/server/fach/uebernehmen', { fach: e.fach, eintrag: e.id }).then(
              () => notifySuccess(`„${e.titel}“ liegt jetzt in der eigenen Bibliothek.`),
              (er: unknown) => notifyError(er)
            )
          }
          data-fachordner-uebernehmen
        >
          Übernehmen
        </Button>
        {(e.von === ich?.benutzer || ich?.rolle === 'admin') && (
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Aus dem Fachordner entfernen"
            onClick={() =>
              window.confirm('Aus dem Fachordner entfernen?') &&
              void senden('/server/fach/loeschen', { fach: e.fach, eintrag: e.id }).then(
                () => void useFachschaft.getState().laden(),
                (er: unknown) => notifyError(er)
              )
            }
          >
            <IconTrash size={16} />
          </ActionIcon>
        )}
      </Group>
    </Group>
  )
}

// ---------------------------------------------------------------- Schalter „Nur meine" | „Auch Fachschaftsmaterial"

const ANSICHT_SCHLUESSEL = 'schulapps-fachschaft-einblenden'

function ansichtGemerkt(): boolean {
  try {
    return window.localStorage.getItem(ANSICHT_SCHLUESSEL) === '1'
  } catch {
    return false
  }
}

/** Fachschaftsmaterial in den Bibliotheken zeigen? Vorgabe: nein; gemerkt je Gerät, für alle Bibliotheken zugleich */
export const useFachschaftAnsicht = create<{ auch: boolean; setAuch: (an: boolean) => void }>((set) => ({
  auch: typeof window !== 'undefined' ? ansichtGemerkt() : false,
  setAuch: (an) => {
    try {
      window.localStorage.setItem(ANSICHT_SCHLUESSEL, an ? '1' : '0')
    } catch {
      /* ohne Speicher gilt es nur, solange die Seite steht */
    }
    set({ auch: an })
  }
}))

/** Fachschaftsmaterial des aktuellen Programms (Bibliothek) – null ohne Server bzw. ohne Material */
export interface FachschaftDaten {
  programm: string
  fremd: Freigabe[]
  eigene: Freigabe[]
  kopien: AltEintrag[]
  /** Noch nicht angesehene Einträge */
  neu: number
  /** Material anderer (Freigaben und Kopien der ersten Fassung) – die Zahl am Schalter */
  anzahl: number
  /** Zur Suche passend (ohne Suche: alles) */
  treffer: { fremd: Freigabe[]; eigene: Freigabe[]; kopien: AltEintrag[] }
  trefferAnzahl: number
}

export function useFachschaftDaten(suche: string): FachschaftDaten | null {
  const programm = useContext(AktuellesProgramm)
  const eintraege = useFreigaben()
  const alt = useFachschaft((s) => s.alt)
  const gesehen = useFachschaft((s) => s.gesehen)
  // Beim Öffnen der Bibliothek frisch laden – so erscheint Neues ohne Neustart
  useEffect(() => {
    if (aufServer() && programm) void useFachschaft.getState().laden()
  }, [programm])
  return useMemo(() => {
    if (!aufServer() || !programm) return null
    const fremd = (eintraege ?? []).filter((e) => e.art === programm && !e.eigen)
    const eigene = (eintraege ?? []).filter((e) => e.art === programm && e.eigen)
    const kopien = alt.filter((e) => e.art === programm)
    if (!fremd.length && !eigene.length && !kopien.length) return null
    const s = suche.trim()
    const passt = (felder: string[]): boolean => !s || passtZurSuche(felder, s)
    const treffer = {
      fremd: fremd.filter((f) => passt([f.titel, f.vonName])),
      eigene: eigene.filter((f) => passt([f.titel])),
      kopien: kopien.filter((e) => passt([e.titel, e.vonName || e.von]))
    }
    return {
      programm,
      fremd,
      eigene,
      kopien,
      neu: neueJeProgramm(zaehlEintraege(eintraege, alt), gesehen)[programm] ?? 0,
      anzahl: fremd.length + kopien.length,
      treffer,
      trefferAnzahl: treffer.fremd.length + treffer.eigene.length + treffer.kopien.length
    }
  }, [programm, eintraege, alt, gesehen, suche])
}

/** Schalter im Kopf der Bibliothek: „Nur meine Materialien" | „Auch Fachschaftsmaterial (n)" – Punkt bei Neuem */
export function FachschaftSchalter({ daten, onEinblenden }: { daten: FachschaftDaten; onEinblenden?: () => void }): React.JSX.Element {
  const auch = useFachschaftAnsicht((s) => s.auch)
  const setAuch = useFachschaftAnsicht((s) => s.setAuch)
  const schmal = useMediaQuery('(max-width: 600px)') ?? false
  const punkt =
    daten.neu > 0 && !auch ? (
      <Tooltip label={`${daten.neu} neu von der Fachschaft – hier einblenden`} withinPortal>
        <span
          data-fachschaft-schalter-neu={daten.neu}
          aria-label={`${daten.neu} neu`}
          style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: 'var(--mantine-color-orange-6)', marginLeft: 6, verticalAlign: 'middle' }}
        />
      </Tooltip>
    ) : null
  return (
    <SegmentedControl
      size="xs"
      radius="xl"
      value={auch ? 'auch' : 'nur'}
      onChange={(v) => {
        setAuch(v === 'auch')
        if (v === 'auch') onEinblenden?.()
      }}
      data={[
        { value: 'nur', label: schmal ? 'Nur meine' : 'Nur meine Materialien' },
        {
          value: 'auch',
          label: (
            <span data-fachschaft-schalter-auch>
              {schmal ? 'Mit Fachschaft' : 'Auch Fachschaftsmaterial'} ({daten.anzahl}){punkt}
            </span>
          )
        }
      ]}
      aria-label="Welches Material die Bibliothek zeigt"
      data-fachschaft-schalter={auch ? 'auch' : 'nur'}
      style={{ maxWidth: '100%' }}
    />
  )
}

/** Hinweis über einem Suchergebnis, das nur aus Fachschaftsmaterial besteht (sonst ausgeblendet) */
/** Steht gerade ein Fachschafts-Treffer da? Dann zeigt BibliothekLeer kein „Nichts gefunden" darunter (10.10.2026) */
export const useFachschaftTreffer = create<{ n: number }>(() => ({ n: 0 }))

export function NurFachschaftHinweis({ onEinblenden }: { onEinblenden: () => void }): React.JSX.Element {
  useEffect(() => {
    useFachschaftTreffer.setState((z) => ({ n: z.n + 1 }))
    return () => useFachschaftTreffer.setState((z) => ({ n: z.n - 1 }))
  }, [])
  return (
    <Text size="xs" c="dimmed" data-nur-fachschaft-treffer>
      Nur Treffer von der Fachschaft – sonst ausgeblendet.{' '}
      <Anchor component="button" type="button" size="xs" onClick={onEinblenden}>
        Immer einblenden
      </Anchor>
    </Text>
  )
}

/**
 * In jeder Bibliothek (BibliothekKopf): „Von der Fachschaft" für dieses Programm – Freigaben anderer
 * Lehrkräfte (Öffnen), Kopien aus der ersten Fassung (Übernehmen/Entfernen) und die eigenen Freigaben.
 * Die Zahl „neu" verschwindet, sobald die Liste einmal aufgeklappt war. Seit 10.10.2026 nur nach dem Schalter
 * „Auch Fachschaftsmaterial" (bzw. bei einer Suche, die nur hier etwas findet); mit Suche nur die passenden Einträge.
 */
export function FachschaftsListe({
  daten,
  suche = '',
  offenAnfang = false
}: {
  daten: FachschaftDaten
  suche?: string
  /** Gleich aufgeklappt (eben eingeblendet) */
  offenAnfang?: boolean
}): React.JSX.Element | null {
  const faecher = useFachschaft((s) => s.faecher)
  const [offen, setOffen] = useState(offenAnfang)
  const programm = daten.programm
  // Aufgeklappt = angesehen
  useEffect(() => {
    if (offen) useFachschaft.getState().gesehenMarkieren(programm)
  }, [offen, programm])
  const sucht = suche.trim().length > 0
  if (sucht && !daten.trefferAnzahl) return null
  const { fremd, eigene, kopien } = daten.treffer
  const neu = daten.neu
  // Mit Suche aufgeklappt – die Treffer sollen zu sehen sein
  const aufgeklappt = offen || sucht
  const fachName = (id: string): string => faecher.find((f) => f.id === id)?.label ?? id
  // Mehrere Fächer: nach Fach getrennt (wie früher die Sammelkarte)
  const fachIds = [...new Set([...fremd, ...kopien].map((e) => e.fach))]
  return (
    <Card withBorder padding="sm" data-fachschaftsliste>
      <UnstyledButton onClick={() => setOffen(!aufgeklappt)} style={{ width: '100%' }} aria-expanded={aufgeklappt}>
        <Group gap="xs">
          {aufgeklappt ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <IconFolders size={16} />
          <Text fw={600} size="sm">
            Von der Fachschaft ({sucht ? `${fremd.length + kopien.length} von ${daten.anzahl}` : daten.anzahl})
          </Text>
          {neu > 0 && (
            <Badge size="sm" color="orange" variant="filled" data-fachschaft-neu={neu}>
              {neu} neu
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            Öffnen zeigt das Material; wer ändert, bekommt eine eigene Kopie.
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={aufgeklappt}>
        <Stack gap={6} mt="xs">
          {!fremd.length && !kopien.length && (
            <Text size="sm" c="dimmed">
              {sucht ? 'Von anderen Lehrkräften passt nichts zur Suche.' : 'Von anderen Lehrkräften ist für diese App noch nichts freigegeben.'}
            </Text>
          )}
          {fachIds.map((fach) => (
            <Stack key={fach} gap={4}>
              {fachIds.length > 1 && (
                <Text fw={700} size="sm">
                  {fachName(fach)}
                </Text>
              )}
              {fremd
                .filter((f) => f.fach === fach)
                .map((f) => (
                  <FreigabeZeile key={f.id} f={f} />
                ))}
              {kopien
                .filter((e) => e.fach === fach)
                .map((e) => (
                  <AltZeile key={`alt-${e.id}`} e={e} />
                ))}
            </Stack>
          ))}
          {eigene.length > 0 && (
            <>
              <Text fw={700} size="sm" mt={4}>
                Eigene Freigaben
              </Text>
              {eigene.map((f) => (
                <FreigabeZeile key={f.id} f={f} />
              ))}
            </>
          )}
        </Stack>
      </Collapse>
    </Card>
  )
}

/** Andere Bezeichnung derselben Liste (Eingang der Fachschaft in jeder Bibliothek) */
export const FachschaftEingang = FachschaftsListe
