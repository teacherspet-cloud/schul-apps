/**
 * Material für die Fachschaft (02.10.2026, nur mit dem Schul-Apps-Server; Server:
 * src/server/fachschaft.ts, erste Fassung src/server/fachordner.ts).
 *
 *  - In jeder Bibliothek: ⋯ › „Für Fachschaft freigeben" bzw. „Freigabe für Fachschaft zurücknehmen".
 *    Freigegeben wird das Original – die Fachschaft sieht immer den aktuellen Stand.
 *  - In jeder Bibliothek oben und auf der Startseite: „Von der Fachschaft" – Öffnen zeigt das
 *    Material; wer etwas ändert, bekommt eine eigene, namentlich benannte Kopie (der Server benennt
 *    sie beim ersten geänderten Speichern). Die Kopie sieht die Fachschaft erst, wenn man sie freigibt.
 *  - Sichtbar für alle, die das Fach unterrichten (eigene Fächer oder IServ-Gruppen).
 */
import { ActionIcon, Badge, Button, Card, Collapse, Group, Loader, Menu, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconDownload, IconFolders, IconShare, IconShareOff, IconTrash } from '@tabler/icons-react'
import { useCallback, useContext, useEffect, useState } from 'react'
import { create } from 'zustand'
import { holen, senden } from '../../modules/onlinetest/serverApi'
import { aufServer, serverIch } from '../plattform'
import { openDocument } from '../navigation'
import { notifyError, notifySuccess } from '../util'
import { AktuellesProgramm } from '../eigenesFenster'

const FREIGEBBAR = ['arbeitsblatt', 'vokabeltest', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'elternbrief', 'tafelbild']
const ARTNAME: Record<string, string> = {
  arbeitsblatt: 'Arbeitsblatt',
  vokabeltest: 'Vokabeltest',
  klassenarbeit: 'Klassenarbeit',
  lernzielkontrolle: 'Lernzielkontrolle',
  grammatiktest: 'Grammatiktest',
  elternbrief: 'Elternbrief',
  tafelbild: 'Tafelbild'
}

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

const useFachschaft = create<{ eintraege: Freigabe[] | null; faecher: { id: string; label: string }[]; laden: () => Promise<void> }>((set) => ({
  eintraege: null,
  faecher: [],
  laden: async () => {
    if (!aufServer()) return
    try {
      const d = await holen<{ eintraege: Freigabe[]; faecher: { id: string; label: string }[] }>('/server/fachschaft')
      set({ eintraege: d.eintraege, faecher: d.faecher })
    } catch {
      set({ eintraege: [] })
    }
  }
}))

function useFreigaben(): Freigabe[] | null {
  const eintraege = useFachschaft((s) => s.eintraege)
  useEffect(() => {
    if (aufServer() && eintraege === null) void useFachschaft.getState().laden()
  }, [eintraege])
  return eintraege
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

function FreigabeZeile({ f, mitArt }: { f: Freigabe; mitArt?: boolean }): React.JSX.Element {
  return (
    <Group justify="space-between" wrap="nowrap" data-freigabe={f.id}>
      <div style={{ minWidth: 0 }}>
        <Text size="sm" truncate>
          {f.titel}
        </Text>
        <Text size="xs" c="dimmed">
          {mitArt && (
            <Badge size="xs" variant="light" mr={6}>
              {ARTNAME[f.art] ?? f.art}
            </Badge>
          )}
          {f.eigen ? 'eigenes Material' : f.vonName} · {new Date(f.datum).toLocaleDateString('de-DE')}
        </Text>
      </div>
      <Button size="xs" variant="light" onClick={() => void freigabeOeffnen(f)} data-freigabe-oeffnen>
        Öffnen
      </Button>
    </Group>
  )
}

/** In jeder Bibliothek: freigegebenes Material anderer Lehrkräfte für dieses Programm */
export function FachschaftsListe(): React.JSX.Element | null {
  const programm = useContext(AktuellesProgramm)
  const eintraege = useFreigaben()
  const [offen, setOffen] = useState(false)
  if (!aufServer() || !programm) return null
  const fremd = (eintraege ?? []).filter((e) => e.art === programm && !e.eigen)
  if (!fremd.length) return null
  return (
    <Card withBorder padding="sm" data-fachschaftsliste>
      <UnstyledButton onClick={() => setOffen(!offen)} style={{ width: '100%' }}>
        <Group gap="xs">
          {offen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <IconFolders size={16} />
          <Text fw={600} size="sm">
            Von der Fachschaft ({fremd.length})
          </Text>
          <Text size="xs" c="dimmed">
            Öffnen zeigt das Material; wer ändert, bekommt eine eigene Kopie.
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={offen}>
        <Stack gap={6} mt="xs">
          {fremd.map((f) => (
            <FreigabeZeile key={f.id} f={f} />
          ))}
        </Stack>
      </Collapse>
    </Card>
  )
}

interface AltEintrag {
  id: string
  art: string
  titel: string
  von: string
  vonName: string
  datum: string
}

/** Karte auf der Startseite: Freigaben der Fachschaften (dazu Kopien aus der ersten Fassung) */
export function FachordnerKarte(): React.JSX.Element | null {
  const eintraege = useFreigaben()
  const faecher = useFachschaft((s) => s.faecher)
  const [alt, setAlt] = useState<{ id: string; label: string; eintraege: AltEintrag[] }[]>([])
  const altLaden = useCallback(() => {
    void holen<{ faecher: { id: string; label: string; eintraege: AltEintrag[] }[] }>('/server/fach').then(
      (d) => setAlt(d.faecher.filter((f) => f.eintraege.length)),
      () => setAlt([])
    )
  }, [])
  useEffect(() => {
    if (aufServer()) {
      altLaden()
      void useFachschaft.getState().laden()
    }
  }, [altLaden])
  if (!aufServer()) return null
  const ich = serverIch()
  return (
    <Card withBorder padding="lg" mb="lg" data-fachordner>
      <Group gap="xs" mb="xs">
        <IconFolders size={20} />
        <Title order={4}>Fachschaft</Title>
      </Group>
      {!eintraege && <Loader size="sm" />}
      {eintraege && !eintraege.length && !alt.length && (
        <Text size="sm" c="dimmed">
          Noch nichts freigegeben. In jeder Bibliothek: ⋯ › „Für Fachschaft freigeben“.
        </Text>
      )}
      <Stack gap="md">
        {faecher.map((fach) => (
          <div key={fach.id}>
            <Text fw={700} mb={4}>
              {fach.label}
            </Text>
            <Stack gap={4}>
              {(eintraege ?? [])
                .filter((e) => e.fach === fach.id)
                .map((f) => (
                  <FreigabeZeile key={f.id} f={f} mitArt />
                ))}
            </Stack>
          </div>
        ))}
        {alt.map((f) => (
          <div key={`alt-${f.id}`}>
            <Text fw={700} mb={4}>
              {f.label} (Kopien zum Übernehmen)
            </Text>
            <Stack gap={4}>
              {f.eintraege.map((e) => (
                <Group key={e.id} justify="space-between" wrap="nowrap">
                  <Text size="sm" truncate>
                    {e.titel}
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · {e.vonName || e.von}
                    </Text>
                  </Text>
                  <Group gap={4} wrap="nowrap">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconDownload size={14} />}
                      onClick={() =>
                        void senden('/server/fach/uebernehmen', { fach: f.id, eintrag: e.id }).then(
                          () => notifySuccess(`„${e.titel}“ liegt jetzt in der eigenen Bibliothek.`),
                          (er: unknown) => notifyError(er)
                        )
                      }
                    >
                      Übernehmen
                    </Button>
                    {(e.von === ich?.benutzer || ich?.rolle === 'admin') && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Aus dem Fachordner entfernen"
                        onClick={() => window.confirm('Aus dem Fachordner entfernen?') && void senden('/server/fach/loeschen', { fach: f.id, eintrag: e.id }).then(altLaden, (er: unknown) => notifyError(er))}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
              ))}
            </Stack>
          </div>
        ))}
      </Stack>
    </Card>
  )
}
