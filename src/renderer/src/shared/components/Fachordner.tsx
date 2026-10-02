/**
 * Gemeinsame Fachordner in der Oberfläche (02.10.2026, nur mit dem Schul-Apps-Server; Server:
 * src/server/fachordner.ts).
 *
 *  - In jeder Bibliothek: ⋯ › „Mit der Fachschaft teilen …" legt eine KOPIE in den Fachordner.
 *  - Auf der Startseite: die Fachordner der eigenen Fächer; „Übernehmen" holt eine eigene Kopie.
 */
import { ActionIcon, Badge, Button, Card, Group, Loader, Menu, Modal, Select, Stack, Text, Title } from '@mantine/core'
import { IconDownload, IconFolders, IconShare, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { create } from 'zustand'
import { FAECHER } from '@shared/faecher'
import { holen, senden } from '../../modules/onlinetest/serverApi'
import { aufServer, serverIch } from '../plattform'
import { useAppSettings } from '../settingsStore'
import { notifyError, notifySuccess } from '../util'

const TEILBAR = ['arbeitsblatt', 'vokabeltest', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'elternbrief', 'tafelbild']
const ARTNAME: Record<string, string> = {
  arbeitsblatt: 'Arbeitsblatt',
  vokabeltest: 'Vokabeltest',
  klassenarbeit: 'Klassenarbeit',
  lernzielkontrolle: 'Lernzielkontrolle',
  grammatiktest: 'Grammatiktest',
  elternbrief: 'Elternbrief',
  tafelbild: 'Tafelbild'
}

const useTeilen = create<{ offen: { art: string; id: string; name: string } | null }>(() => ({ offen: null }))

/** Menüpunkt im ⋯-Menü eines Eintrags (Bibliothek) */
export function TeilenMenuePunkt({ moduleId, id, name }: { moduleId?: string; id: string; name: string }): React.JSX.Element | null {
  if (!aufServer() || !moduleId || !TEILBAR.includes(moduleId)) return null
  return (
    <Menu.Item leftSection={<IconShare size={14} />} onClick={() => useTeilen.setState({ offen: { art: moduleId, id, name } })}>
      Mit der Fachschaft teilen …
    </Menu.Item>
  )
}

/** Der Dialog – einmal in der Oberfläche (App.tsx) */
export function TeilenDialog(): React.JSX.Element | null {
  const offen = useTeilen((s) => s.offen)
  const eigene = useAppSettings((s) => s.settings.eigeneFaecher)
  const [fach, setFach] = useState<string | null>(null)
  useEffect(() => setFach(eigene?.[0] ?? null), [offen, eigene])
  if (!offen) return null
  const liste = eigene?.length ? FAECHER.filter((f) => eigene.includes(f.id)) : FAECHER
  return (
    <Modal opened onClose={() => useTeilen.setState({ offen: null })} title="Mit der Fachschaft teilen">
      <Stack>
        <Text size="sm">
          „{offen.name}“ geht als Kopie in den Fachordner – mit Hörtexten und Design. Wer es übernimmt, bekommt eine eigene Kopie; das eigene Material bleibt unverändert.
        </Text>
        <Select label="Fachordner" data={liste.map((f) => ({ value: f.id, label: f.label }))} value={fach} onChange={setFach} searchable allowDeselect={false} />
        <Group justify="flex-end">
          <Button
            disabled={!fach}
            onClick={() =>
              void senden('/server/fach/teilen', { fach, art: offen.art, id: offen.id }).then(
                () => {
                  notifySuccess(`In den Fachordner ${FAECHER.find((f) => f.id === fach)?.label ?? ''} gelegt.`)
                  useTeilen.setState({ offen: null })
                },
                (e: unknown) => notifyError(e)
              )
            }
          >
            Teilen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

interface FachEintrag {
  id: string
  art: string
  titel: string
  von: string
  vonName: string
  datum: string
}

/** Karte auf der Startseite: die Fachordner der eigenen Fächer */
export function FachordnerKarte(): React.JSX.Element | null {
  const [d, setD] = useState<{ faecher: { id: string; label: string; eintraege: FachEintrag[] }[] } | null>(null)
  const laden = useCallback(() => {
    void holen<NonNullable<typeof d>>('/server/fach').then(setD, () => setD({ faecher: [] }))
  }, [])
  useEffect(() => {
    if (aufServer()) laden()
  }, [laden])
  if (!aufServer()) return null
  const mitInhalt = d?.faecher.filter((f) => f.eintraege.length) ?? []
  const ich = serverIch()
  return (
    <Card withBorder padding="lg" mb="lg" data-fachordner>
      <Group gap="xs" mb="xs">
        <IconFolders size={20} />
        <Title order={4}>Fachordner</Title>
      </Group>
      {!d && <Loader size="sm" />}
      {d && !mitInhalt.length && (
        <Text size="sm" c="dimmed">
          Noch nichts geteilt. In jeder Bibliothek: ⋯ › „Mit der Fachschaft teilen …“.
        </Text>
      )}
      <Stack gap="md">
        {mitInhalt.map((f) => (
          <div key={f.id}>
            <Text fw={700} mb={4}>
              {f.label}
            </Text>
            <Stack gap={4}>
              {f.eintraege.map((e) => (
                <Group key={e.id} justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {e.titel}
                    </Text>
                    <Text size="xs" c="dimmed">
                      <Badge size="xs" variant="light" mr={6}>
                        {ARTNAME[e.art] ?? e.art}
                      </Badge>
                      {e.vonName || e.von} · {new Date(e.datum).toLocaleDateString('de-DE')}
                    </Text>
                  </div>
                  <Group gap={4} wrap="nowrap">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconDownload size={14} />}
                      onClick={() =>
                        void senden<{ uebernommen: unknown[] }>('/server/fach/uebernehmen', { fach: f.id, eintrag: e.id }).then(
                          () => notifySuccess(`„${e.titel}“ liegt jetzt in der eigenen Bibliothek (${ARTNAME[e.art] ?? e.art}).`),
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
                        onClick={() => window.confirm('Aus dem Fachordner entfernen?') && void senden('/server/fach/loeschen', { fach: f.id, eintrag: e.id }).then(laden, (er: unknown) => notifyError(er))}
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
