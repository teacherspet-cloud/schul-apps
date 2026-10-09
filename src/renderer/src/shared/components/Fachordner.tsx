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
 */
import { ActionIcon, Badge, Button, Card, Collapse, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconDownload, IconFolders, IconShare, IconShareOff, IconTrash } from '@tabler/icons-react'
import { useContext, useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { holen, senden } from '../../modules/onlinetest/serverApi'
import { aufServer, serverIch } from '../plattform'
import { openDocument } from '../navigation'
import { notifyError, notifySuccess } from '../util'
import { AktuellesProgramm } from '../eigenesFenster'
import { gesehenErgaenzen, gesehenLesen, gesehenSchreiben, neueJeProgramm, type FachschaftsEintrag } from '../fachschaftNeu'

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

/** Menüpunkt im ⋯-Menü eines Eintrags (Bibliothek): freigeben bzw. zurücknehmen */
export function TeilenMenuePunkt({ moduleId, id, name }: { moduleId?: string; id: string; name: string }): React.JSX.Element | null {
  const eintraege = useFreigaben()
  if (!aufServer() || !moduleId || !FREIGEBBAR.includes(moduleId)) return null
  const freigegeben = eintraege?.some((e) => e.eigen && e.art === moduleId && e.docId === id)
  return freigegeben ? (
    <Menu.Item
      leftSection={<IconShareOff size={14} />}
      onClick={() =>
        void senden('/server/fachschaft/zuruecknehmen', { art: moduleId, id }).then(
          () => {
            notifySuccess(`„${name}“ ist nicht mehr für die Fachschaft freigegeben.`)
            void useFachschaft.getState().laden()
          },
          (e: unknown) => notifyError(e)
        )
      }
      data-fachschaft-zuruecknehmen
    >
      Freigabe für Fachschaft zurücknehmen
    </Menu.Item>
  ) : (
    <Menu.Item
      leftSection={<IconShare size={14} />}
      onClick={() =>
        void senden<{ label: string }>('/server/fachschaft/freigeben', { art: moduleId, id }).then(
          (r) => {
            notifySuccess(`„${name}“ ist für die Fachschaft ${r.label} freigegeben – wer das Fach unterrichtet, sieht und öffnet es.`)
            void useFachschaft.getState().laden()
          },
          (e: unknown) => notifyError(e)
        )
      }
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

/**
 * In jeder Bibliothek (BibliothekKopf): „Von der Fachschaft" für dieses Programm – Freigaben anderer
 * Lehrkräfte (Öffnen), Kopien aus der ersten Fassung (Übernehmen/Entfernen) und die eigenen Freigaben.
 * Die Zahl „neu" verschwindet, sobald die Liste einmal aufgeklappt war.
 */
export function FachschaftsListe(): React.JSX.Element | null {
  const programm = useContext(AktuellesProgramm)
  const eintraege = useFreigaben()
  const alt = useFachschaft((s) => s.alt)
  const gesehen = useFachschaft((s) => s.gesehen)
  const faecher = useFachschaft((s) => s.faecher)
  const [offen, setOffen] = useState(false)
  // Beim Öffnen der Bibliothek frisch laden – so erscheint Neues ohne Neustart
  useEffect(() => {
    if (aufServer() && programm) void useFachschaft.getState().laden()
  }, [programm])
  if (!aufServer() || !programm) return null
  const fremd = (eintraege ?? []).filter((e) => e.art === programm && !e.eigen)
  const eigene = (eintraege ?? []).filter((e) => e.art === programm && e.eigen)
  const kopien = alt.filter((e) => e.art === programm)
  if (!fremd.length && !eigene.length && !kopien.length) return null
  const neu = neueJeProgramm(zaehlEintraege(eintraege, alt), gesehen)[programm] ?? 0
  const fachName = (id: string): string => faecher.find((f) => f.id === id)?.label ?? id
  const umschalten = (): void => {
    if (!offen) useFachschaft.getState().gesehenMarkieren(programm)
    setOffen(!offen)
  }
  // Mehrere Fächer: nach Fach getrennt (wie früher die Sammelkarte)
  const fachIds = [...new Set([...fremd, ...kopien].map((e) => e.fach))]
  return (
    <Card withBorder padding="sm" data-fachschaftsliste>
      <UnstyledButton onClick={umschalten} style={{ width: '100%' }} aria-expanded={offen}>
        <Group gap="xs">
          {offen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <IconFolders size={16} />
          <Text fw={600} size="sm">
            Von der Fachschaft ({fremd.length + kopien.length})
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
      <Collapse expanded={offen}>
        <Stack gap={6} mt="xs">
          {!fremd.length && !kopien.length && (
            <Text size="sm" c="dimmed">
              Von anderen Lehrkräften ist für diese App noch nichts freigegeben.
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
