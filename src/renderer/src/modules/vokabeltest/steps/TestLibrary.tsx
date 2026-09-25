import { ActionIcon, Alert, Badge, Button, Card, Group, Menu, Modal, Popover, ScrollArea, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconDeviceFloppy, IconDots, IconFileImport, IconPencil, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedTestMeta } from '@shared/types'
import { notifyError, notifySuccess } from '../../../shared/util'
import { hasContent, openSavedTest, saveCurrentTest } from '../library'
import { formatPoints } from '../model/blocks'
import { parseProjectFile, PROJECT_FILTER } from '../project'
import { TestPayload, useVokabeltest } from '../store'
import { useConfirmKeys } from '../../../shared/useConfirmKeys'
import { imNetz } from '../../../shared/netzZugang'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Auswahl der in der App gespeicherten Vokabeltests. */
export function TestLibraryModal({ opened, onClose }: { opened: boolean; onClose: () => void }): React.JSX.Element {
  const { testId, newTest, loadDocument } = useVokabeltest()
  const [tests, setTests] = useState<SavedTestMeta[] | null>(null)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SavedTestMeta | null>(null)
  const removeTest = useCallback(async (): Promise<void> => {
    if (!confirmDelete) return
    try {
      setTests(await window.api.tests.delete(confirmDelete.id))
      if (useVokabeltest.getState().testId === confirmDelete.id) useVokabeltest.getState().markSaved('', '')
      setConfirmDelete(null)
    } catch (e) {
      notifyError(e)
    }
  }, [confirmDelete])
  // Enter bestätigt die Löschen-Rückfrage, Esc bricht ab
  useConfirmKeys(
    confirmDelete !== null,
    () => void removeTest(),
    () => setConfirmDelete(null)
  )

  useEffect(() => {
    if (!opened) return
    setQuery('')
    window.api.tests.list().then(setTests).catch(notifyError)
  }, [opened])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (tests ?? []).filter((t) => !q || t.name.toLowerCase().includes(q))
  }, [tests, query])

  /** Ungespeicherte Arbeit wird vor dem Wechsel gesichert, damit nichts verloren geht. */
  const keepCurrent = async (): Promise<void> => {
    if (hasContent() && !useVokabeltest.getState().testId) {
      await saveCurrentTest()
      notifySuccess(`Der bisherige Test wurde als „${useVokabeltest.getState().listName}" gespeichert.`)
    }
  }

  const open = async (id: string): Promise<void> => {
    try {
      if (id !== useVokabeltest.getState().testId) {
        await keepCurrent()
        await openSavedTest(id)
      }
      onClose()
    } catch (e) {
      notifyError(e)
    }
  }

  const rename = async (): Promise<void> => {
    if (!renaming) return
    try {
      const test = await window.api.tests.get(renaming.id)
      const { id, name: _old, payload, createdAt: _c, updatedAt: _u, ...stats } = test
      await window.api.tests.save({ id, name: renaming.name, stats, payload })
      if (useVokabeltest.getState().testId === id) useVokabeltest.getState().setListName(renaming.name.trim())
      setTests(await window.api.tests.list())
      setRenaming(null)
    } catch (e) {
      notifyError(e)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Vokabeltests" size="lg">
      <Stack gap="sm">
        <Group>
          <TextInput
            style={{ flex: 1 }}
            leftSection={<IconSearch size={16} />}
            placeholder="Suchen, z. B. Green Line 5"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            data-autofocus
          />
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={async () => {
              try {
                await keepCurrent()
                newTest()
                onClose()
              } catch (e) {
                notifyError(e)
              }
            }}
          >
            Neuer Vokabeltest
          </Button>
        </Group>

        <ScrollArea.Autosize mah="55vh">
          <Stack gap="xs">
            {tests && filtered.length === 0 && (
              <Text c="dimmed" size="sm" ta="center" py="lg">
                {tests.length === 0 ? 'Noch keine Vokabeltests gespeichert.' : 'Kein Test passt zur Suche.'}
              </Text>
            )}
            {filtered.map((t) => (
              <Card key={t.id} withBorder padding="sm" data-test-entry={t.name}>
                <Group wrap="nowrap" justify="space-between">
                  <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onDoubleClick={() => void open(t.id)}>
                    {renaming?.id === t.id ? (
                      <TextInput
                        size="xs"
                        value={renaming.name}
                        autoFocus
                        onChange={(e) => setRenaming({ id: t.id, name: e.currentTarget.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename()
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                        onBlur={() => void rename()}
                      />
                    ) : (
                      <Group gap={6}>
                        <Text fw={600} truncate>
                          {t.name}
                        </Text>
                        {t.id === testId && (
                          <Badge size="xs" variant="light">
                            geöffnet
                          </Badge>
                        )}
                      </Group>
                    )}
                    <Text size="xs" c="dimmed">
                      {t.vocabCount} Vokabeln ({t.includedCount} im Test)
                      {t.hasTest
                        ? ` · Test erstellt${t.variantCount > 1 ? `, ${t.variantCount} Varianten` : ''}, ${formatPoints(t.totalPoints)} Punkte`
                        : ' · noch kein Test'}
                      {' · '}
                      {dateFormat.format(new Date(t.updatedAt))}
                    </Text>
                  </div>
                  <Button size="xs" onClick={() => void open(t.id)}>
                    Öffnen
                  </Button>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" aria-label="Weitere Aktionen">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenaming({ id: t.id, name: t.name })}>
                        Umbenennen
                      </Menu.Item>
                      {/* Löschen gibt es nur am Rechner – über das Netz ist es gesperrt */}
                      {!imNetz() && (
                        <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => setConfirmDelete(t)}>
                          Löschen
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
                {confirmDelete?.id === t.id && (
                  <Alert color="red" mt="xs" p="xs">
                    <Group justify="space-between">
                      <Text size="sm">„{t.name}" endgültig löschen?</Text>
                      <Group gap="xs">
                        <Button size="xs" variant="default" onClick={() => setConfirmDelete(null)}>
                          Abbrechen
                        </Button>
                        <Button size="xs" color="red" autoFocus onClick={() => void removeTest()}>
                          Löschen
                        </Button>
                      </Group>
                    </Group>
                  </Alert>
                )}
              </Card>
            ))}
          </Stack>
        </ScrollArea.Autosize>

        <Group justify="space-between">
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconFileImport size={14} />}
            onClick={async () => {
              try {
                const file = await window.api.files.open(PROJECT_FILTER)
                if (!file) return
                const doc = parseProjectFile(file.data)
                await keepCurrent()
                newTest()
                loadDocument(doc)
                onClose()
              } catch (e) {
                notifyError(e)
              }
            }}
          >
            Aus Datei öffnen (.vokabeltest) …
          </Button>
          <Text size="xs" c="dimmed">
            Gespeicherte Tests werden bei jeder Änderung automatisch aktualisiert.
          </Text>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Speichern in der App; beim ersten Speichern wird ein Name abgefragt. */
export function SaveTestButton({ size = 'sm' }: { size?: 'xs' | 'sm' }): React.JSX.Element {
  const { testId, listName, lastSavedAt } = useVokabeltest()
  const [opened, setOpened] = useState(false)
  const [name, setName] = useState(listName)
  const [saving, setSaving] = useState(false)

  const save = async (value: string): Promise<void> => {
    setSaving(true)
    try {
      await saveCurrentTest(value)
      notifySuccess(`„${useVokabeltest.getState().listName}" gespeichert.`)
      setOpened(false)
    } catch (e) {
      notifyError(e)
    } finally {
      setSaving(false)
    }
  }

  if (testId) {
    return (
      <Tooltip label={lastSavedAt ? `Automatisch gespeichert: ${dateFormat.format(new Date(lastSavedAt))}` : 'Gespeichert'}>
        <Button size={size} variant="default" leftSection={<IconDeviceFloppy size={14} />} loading={saving} onClick={() => void save(listName)}>
          Gespeichert
        </Button>
      </Tooltip>
    )
  }
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow trapFocus>
      <Popover.Target>
        <Button
          size={size}
          variant="default"
          leftSection={<IconDeviceFloppy size={14} />}
          onClick={() => {
            setName(listName)
            setOpened((o) => !o)
          }}
        >
          Speichern
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={300}>
          <TextInput
            label="Name des Vokabeltests"
            placeholder="z. B. Green Line 5 – Unit 1, Station 1"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save(name)}
            data-autofocus
          />
          <Button size="xs" onClick={() => void save(name)} loading={saving} disabled={!name.trim()}>
            In der App speichern
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

export type { TestPayload }

/**
 * Gespeicherte Vokabeltests direkt auf der leeren Startseite des Programms (statt eines Pop-ups beim Öffnen).
 * Verschwindet, sobald eine Liste eingegeben oder ein Test geöffnet ist.
 */
export function RecentTests({ onShowAll }: { onShowAll: () => void }): React.JSX.Element | null {
  const { vocab, doc, testId } = useVokabeltest()
  const [tests, setTests] = useState<SavedTestMeta[]>([])
  const empty = !doc && !testId && !vocab.some((v) => v.term.trim())

  useEffect(() => {
    if (!empty) return
    window.api.tests.list().then(setTests).catch(notifyError)
  }, [empty])

  if (!empty || tests.length === 0) return null
  const shown = tests.slice(0, 4)
  return (
    <Card withBorder mt="lg" padding="md" data-recent-tests>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Gespeicherten Vokabeltest weiterbearbeiten</Text>
        {tests.length > shown.length && (
          <Button size="compact-sm" variant="subtle" onClick={onShowAll}>
            Alle {tests.length} anzeigen
          </Button>
        )}
      </Group>
      <Stack gap={6}>
        {shown.map((t) => (
          <Group key={t.id} justify="space-between" wrap="nowrap" data-test-entry={t.name}>
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {t.name}
              </Text>
              <Text size="xs" c="dimmed">
                {t.vocabCount} Vokabeln{t.hasTest ? ` · Test mit ${formatPoints(t.totalPoints)} Punkten` : ' · noch kein Test'} ·{' '}
                {dateFormat.format(new Date(t.updatedAt))}
              </Text>
            </div>
            <Group gap={4} wrap="nowrap">
              <Button size="xs" variant="light" onClick={() => void openSavedTest(t.id).catch(notifyError)}>
                Öffnen
              </Button>
              <Tooltip label="Löschen">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label={`${t.name} löschen`}
                  onClick={async () => {
                    if (!window.confirm(`„${t.name}" endgültig aus der App löschen?`)) return
                    try {
                      setTests(await window.api.tests.delete(t.id))
                    } catch (e) {
                      notifyError(e)
                    }
                  }}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}
