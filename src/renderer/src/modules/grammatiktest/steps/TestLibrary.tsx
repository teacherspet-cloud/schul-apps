import { ActionIcon, Alert, Badge, Button, Card, Container, Group, Menu, ScrollArea, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconDots, IconFilePlus, IconPencil, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { SavedGrammarTestMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { useConfirmKeys } from '../../../shared/useConfirmKeys'
import { openSavedTest } from '../library'
import { useGrammatiktest } from '../store'
import { imNetz } from '../../../shared/netzZugang'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Übersicht der gespeicherten Grammatiktests, nach Fach gruppiert. */
export default function TestLibrary({ onNew, onOpened }: { onNew: () => void; onOpened: () => void }): React.JSX.Element {
  const [tests, setTests] = useState<SavedGrammarTestMeta[]>([])
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SavedGrammarTestMeta | null>(null)
  const markSaved = useGrammatiktest((s) => s.markSaved)

  const removeTest = useCallback(async (): Promise<void> => {
    if (!confirmDelete) return
    try {
      setTests(await window.api.grammarTests.delete(confirmDelete.id))
      // Der offene Test darf nicht weiter auf eine gelöschte Datei zeigen
      if (useGrammatiktest.getState().docId === confirmDelete.id) useGrammatiktest.getState().markSaved('', '', '')
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
    window.api.grammarTests.list().then(setTests).catch(notifyError)
  }, [])

  const subjects = [...new Set(tests.map((t) => t.subjectLabel))]

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={2}>Meine Grammatiktests</Title>
            <Text c="dimmed" size="sm">
              {tests.length === 1 ? 'Ein gespeicherter Test' : `${tests.length} gespeicherte Tests`}
            </Text>
          </div>
          <Button leftSection={<IconFilePlus size={16} />} onClick={onNew}>
            Neuer Test
          </Button>
        </Group>

        {subjects.map((subject) => (
          <div key={subject}>
            <Title order={4} mt="md" mb="xs">
              {subject}
            </Title>
            <Stack gap="xs">
              {tests
                .filter((t) => t.subjectLabel === subject)
                .map((t) => (
                  <Card key={t.id} withBorder padding="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Group gap="xs">
                          <Text fw={600} truncate>
                            {t.name}
                          </Text>
                          <Badge variant="light">Klasse {t.grade}</Badge>
                          {t.graded ? (
                            <Badge variant="light" color="grape">
                              benotet
                            </Badge>
                          ) : (
                            <Badge variant="outline" color="gray">
                              ohne Note
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {t.topics || 'ohne Form'} · {t.taskCount} {t.taskCount === 1 ? 'Aufgabe' : 'Aufgaben'} · {t.points} Punkte · {t.minutes} Minuten ·{' '}
                          {dateFormat.format(new Date(t.updatedAt))}
                        </Text>
                      </div>
                      <Group gap={4} wrap="nowrap">
                        <Button size="xs" onClick={() => void openSavedTest(t.id).then(onOpened).catch(notifyError)}>
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
                    </Group>

                    {renaming?.id === t.id && (
                      <Group mt="xs" gap="xs">
                        <TextInput
                          size="xs"
                          style={{ flex: 1 }}
                          value={renaming.name}
                          onChange={(ev) => setRenaming({ id: t.id, name: ev.currentTarget.value })}
                        />
                        <Button
                          size="xs"
                          onClick={async () => {
                            try {
                              const saved = await window.api.grammarTests.get(t.id)
                              const meta = await window.api.grammarTests.save({ id: t.id, name: renaming.name, stats: saved, payload: saved.payload })
                              setTests(await window.api.grammarTests.list())
                              if (useGrammatiktest.getState().docId === t.id) markSaved(meta.id, meta.updatedAt, meta.name)
                              setRenaming(null)
                            } catch (err) {
                              notifyError(err)
                            }
                          }}
                        >
                          Speichern
                        </Button>
                        <Button size="xs" variant="default" onClick={() => setRenaming(null)}>
                          Abbrechen
                        </Button>
                      </Group>
                    )}

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
          </div>
        ))}
      </Container>
    </ScrollArea>
  )
}
