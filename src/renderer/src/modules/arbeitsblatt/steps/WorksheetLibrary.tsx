import {
  ActionIcon,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Container,
  Group,
  Image,
  Menu,
  Modal,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core'
import { IconChalkboard, IconDots, IconFilePlus, IconFolder, IconFolderOpen, IconPencil, IconSearch, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedWorksheetMeta } from '@shared/types'
import { notifyError, notifySuccess } from '../../../shared/util'
import { openSavedWorksheet } from '../library'
import { useArbeitsblatt } from '../store'
import { useConfirmKeys } from '../../../shared/useConfirmKeys'
import { imNetz } from '../../../shared/netzZugang'

export type FolderMode = 'grade' | 'topic'

/** Ordnername eines Blattes: Jahrgang („Klasse 7“) oder Thema */
export function folderOf(sheet: SavedWorksheetMeta, mode: FolderMode): string {
  return mode === 'grade' ? `Klasse ${sheet.grade}` : sheet.topic || 'Ohne Thema'
}

export interface Folder {
  name: string
  sheets: SavedWorksheetMeta[]
}

/** Gruppiert die Blätter und sortiert: Jahrgänge nach Zahl, Themen alphabetisch. */
export function buildFolders(sheets: SavedWorksheetMeta[], mode: FolderMode): Folder[] {
  const map = new Map<string, SavedWorksheetMeta[]>()
  for (const s of sheets) {
    const name = folderOf(s, mode)
    map.set(name, [...(map.get(name) ?? []), s])
  }
  const collator = new Intl.Collator('de', { numeric: true })
  return [...map.entries()]
    .map(([name, list]) => ({ name, sheets: [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }))
    .sort((a, b) => collator.compare(a.name, b.name))
}

const dateText = (iso: string): string => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Startseite des Arbeitsblatt-Programms: gespeicherte Blätter nach Fach, darin nach Jahrgang oder Thema. */
export default function WorksheetLibrary({
  onNew,
  onOpenFile,
  onOpened
}: {
  onNew: () => void
  onOpenFile: () => void
  onOpened: () => void
}): React.JSX.Element {
  const [sheets, setSheets] = useState<SavedWorksheetMeta[]>([])
  const [subject, setSubject] = useState<string | null>(null)
  const [mode, setMode] = useState<FolderMode>('grade')
  const [folder, setFolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<SavedWorksheetMeta | null>(null)
  const removeSheet = useCallback(async (): Promise<void> => {
    if (!confirmDelete) return
    try {
      setSheets(await window.api.sheets.delete(confirmDelete.id))
      // Das offene Blatt darf nicht weiter auf den gelöschten Eintrag zeigen – sonst legte die
      // nächste Sicherung ihn unter derselben Kennung stillschweigend wieder an
      if (useArbeitsblatt.getState().docId === confirmDelete.id) useArbeitsblatt.getState().forgetSaved()
      notifySuccess('Arbeitsblatt gelöscht.')
    } catch (e) {
      notifyError(e)
    } finally {
      setConfirmDelete(null)
    }
  }, [confirmDelete])
  // Enter bestätigt die Löschen-Rückfrage (Esc schließt das Fenster ohnehin)
  useConfirmKeys(confirmDelete !== null, () => void removeSheet())
  const [rename, setRename] = useState<SavedWorksheetMeta | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    window.api.sheets.list().then(setSheets).catch(notifyError)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sheets
    return sheets.filter((s) => [s.name, s.topic, s.subjectLabel, `Klasse ${s.grade}`].join(' ').toLowerCase().includes(q))
  }, [sheets, search])

  const subjects = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const s of filtered) {
      const entry = map.get(s.subjectId) ?? { label: s.subjectLabel, count: 0 }
      map.set(s.subjectId, { label: entry.label, count: entry.count + 1 })
    }
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'de'))
  }, [filtered])

  const inSubject = subject ? filtered.filter((s) => s.subjectId === subject) : []
  const folders = useMemo(() => (subject ? buildFolders(inSubject, mode) : []), [inSubject, mode, subject])
  const openFolder = folder ? folders.find((f) => f.name === folder) : null
  const subjectLabel = subjects.find(([id]) => id === subject)?.[1].label ?? ''

  const open = async (id: string): Promise<void> => {
    try {
      await openSavedWorksheet(id)
      onOpened()
    } catch (e) {
      notifyError(e, 'Arbeitsblatt konnte nicht geöffnet werden')
    }
  }

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="md" wrap="nowrap">
          <div>
            <Title order={2}>Meine Arbeitsblätter</Title>
            <Text c="dimmed" size="sm">
              {sheets.length} gespeicherte Arbeitsblätter. Sie werden automatisch gesichert und lassen sich hier weiterbearbeiten.
            </Text>
          </div>
          <Group wrap="nowrap">
            <TextInput
              placeholder="Suchen …"
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              w={220}
            />
            <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={onOpenFile}>
              Datei öffnen
            </Button>
            <Button leftSection={<IconFilePlus size={16} />} onClick={onNew}>
              Neues Arbeitsblatt
            </Button>
          </Group>
        </Group>

        <Group justify="space-between" mb="sm">
          <Breadcrumbs separator="›">
            <Button variant="subtle" size="compact-sm" onClick={() => (setSubject(null), setFolder(null))}>
              Alle Fächer
            </Button>
            {subject && (
              <Button variant="subtle" size="compact-sm" onClick={() => setFolder(null)}>
                {subjectLabel}
              </Button>
            )}
            {openFolder && (
              <Text size="sm" fw={600}>
                {openFolder.name}
              </Text>
            )}
          </Breadcrumbs>
          {subject && (
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => {
                setMode(v as FolderMode)
                setFolder(null)
              }}
              data={[
                { value: 'grade', label: 'Nach Jahrgang' },
                { value: 'topic', label: 'Nach Thema' }
              ]}
            />
          )}
        </Group>

        {!subject && (
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
            {subjects.map(([id, { label, count }]) => (
              <Card key={id} withBorder padding="md" className="picker-tile" onClick={() => setSubject(id)} style={{ cursor: 'pointer' }}>
                <Group gap="sm" wrap="nowrap">
                  <IconFolder size={28} />
                  <div style={{ minWidth: 0 }}>
                    <Text fw={600} lineClamp={1}>
                      {label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {count} {count === 1 ? 'Arbeitsblatt' : 'Arbeitsblätter'}
                    </Text>
                  </div>
                </Group>
              </Card>
            ))}
            {subjects.length === 0 && <Text c="dimmed">Keine gespeicherten Arbeitsblätter gefunden.</Text>}
          </SimpleGrid>
        )}

        {subject && !openFolder && (
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
            {folders.map((f) => (
              <Card key={f.name} withBorder padding="md" className="picker-tile" onClick={() => setFolder(f.name)} style={{ cursor: 'pointer' }}>
                <Group gap="sm" wrap="nowrap">
                  <IconFolder size={28} />
                  <div style={{ minWidth: 0 }}>
                    <Text fw={600} lineClamp={2}>
                      {f.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {f.sheets.length} {f.sheets.length === 1 ? 'Blatt' : 'Blätter'}
                    </Text>
                  </div>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )}

        {openFolder && (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {openFolder.sheets.map((s) => (
              <Card key={s.id} withBorder padding="sm">
                <Card.Section
                  onClick={() => open(s.id)}
                  style={{
                    cursor: 'pointer',
                    background: 'var(--mantine-color-gray-1)',
                    height: 170,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {s.thumb ? (
                    <Image src={s.thumb} h={166} fit="contain" alt="" />
                  ) : (
                    <Text size="xs" c="dimmed">
                      {s.sheetCount === 0 ? 'Entwurf – noch nicht ausformuliert' : 'Keine Vorschau'}
                    </Text>
                  )}
                </Card.Section>
                <Group justify="space-between" mt="xs" wrap="nowrap" align="flex-start">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={600} lineClamp={2} style={{ cursor: 'pointer' }} onClick={() => open(s.id)}>
                      {s.name}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {s.subjectLabel} · Klasse {s.grade} · {dateText(s.updatedAt)}
                    </Text>
                    <Group gap={4} mt={4}>
                      {/* Entwürfe werden ab dem ersten Schritt gesichert – noch ohne ausformuliertes Blatt */}
                      {s.sheetCount === 0 && (
                        <Badge size="xs" variant="light" color="gray">
                          Entwurf
                        </Badge>
                      )}
                      {s.sheetCount > 1 && (
                        <Badge size="xs" variant="light">
                          {s.sheetCount} Niveaustufen
                        </Badge>
                      )}
                      {s.hasBoard && (
                        <Badge size="xs" variant="light" leftSection={<IconChalkboard size={11} />}>
                          Tafelbild
                        </Badge>
                      )}
                    </Group>
                  </div>
                  <Menu shadow="md" position="bottom-end">
                    <Menu.Target>
                      <ActionIcon variant="subtle" aria-label="Mehr">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={() => open(s.id)}>
                        Öffnen
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconPencil size={14} />}
                        onClick={() => {
                          setRename(s)
                          setRenameValue(s.name)
                        }}
                      >
                        Umbenennen
                      </Menu.Item>
                      {/* Löschen gibt es nur am Rechner – über das Netz ist es gesperrt */}
                      {!imNetz() && (
                        <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => setConfirmDelete(s)}>
                          Löschen
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )}

        <Modal opened={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Arbeitsblatt löschen">
          <Stack>
            <Text size="sm">„{confirmDelete?.name}“ wird dauerhaft aus der App gelöscht. Exportierte Dateien (PDF, Word, .arbeitsblatt) bleiben erhalten.</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirmDelete(null)}>
                Abbrechen
              </Button>
              <Button color="red" leftSection={<IconTrash size={16} />} data-autofocus onClick={() => void removeSheet()}>
                Löschen
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal opened={rename !== null} onClose={() => setRename(null)} title="Arbeitsblatt umbenennen">
          <Stack>
            <TextInput label="Name" value={renameValue} onChange={(e) => setRenameValue(e.currentTarget.value)} data-autofocus />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRename(null)}>
                Abbrechen
              </Button>
              <Button
                disabled={!renameValue.trim()}
                onClick={async () => {
                  try {
                    const full = await window.api.sheets.get(rename!.id)
                    const meta = await window.api.sheets.save({ id: full.id, name: renameValue.trim(), stats: full, thumb: full.thumb, payload: full.payload })
                    // Ist das Blatt gerade offen, übernimmt es den Namen – sonst schriebe die nächste Sicherung den alten zurück
                    if (useArbeitsblatt.getState().docId === meta.id) useArbeitsblatt.getState().markSaved(meta.id, meta.updatedAt, meta.name)
                    setSheets(await window.api.sheets.list())
                  } catch (e) {
                    notifyError(e)
                  } finally {
                    setRename(null)
                  }
                }}
              >
                Speichern
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Box h="lg" />
      </Container>
    </ScrollArea>
  )
}
