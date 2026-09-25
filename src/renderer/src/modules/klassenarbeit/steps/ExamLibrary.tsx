import { ActionIcon, Alert, Badge, Button, Card, Container, Group, Menu, ScrollArea, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconDots, IconFilePlus, IconPencil, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { SavedExamMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { openSavedExam } from '../library'
import { useKlassenarbeit } from '../store'
import { useConfirmKeys } from '../../../shared/useConfirmKeys'
import { imNetz } from '../../../shared/netzZugang'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Übersicht der gespeicherten Klassenarbeiten, nach Fach gruppiert. */
export default function ExamLibrary({ onNew, onOpened }: { onNew: () => void; onOpened: () => void }): React.JSX.Element {
  const [exams, setExams] = useState<SavedExamMeta[]>([])
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SavedExamMeta | null>(null)
  const removeExam = useCallback(async (): Promise<void> => {
    if (!confirmDelete) return
    try {
      setExams(await window.api.exams.delete(confirmDelete.id))
      if (useKlassenarbeit.getState().docId === confirmDelete.id) useKlassenarbeit.getState().forgetSaved()
      setConfirmDelete(null)
    } catch (e) {
      notifyError(e)
    }
  }, [confirmDelete])
  // Enter bestätigt die Löschen-Rückfrage, Esc bricht ab
  useConfirmKeys(
    confirmDelete !== null,
    () => void removeExam(),
    () => setConfirmDelete(null)
  )
  const markSaved = useKlassenarbeit((s) => s.markSaved)

  useEffect(() => {
    window.api.exams.list().then(setExams).catch(notifyError)
  }, [])

  const subjects = [...new Set(exams.map((e) => e.subjectLabel))]

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={2}>Meine Klassenarbeiten</Title>
            <Text c="dimmed" size="sm">
              {exams.length === 1 ? 'Eine gespeicherte Arbeit' : `${exams.length} gespeicherte Arbeiten`}
            </Text>
          </div>
          <Button leftSection={<IconFilePlus size={16} />} onClick={onNew}>
            Neue Klassenarbeit
          </Button>
        </Group>

        {subjects.map((subject) => (
          <div key={subject}>
            <Title order={4} mt="md" mb="xs">
              {subject}
            </Title>
            <Stack gap="xs">
              {exams
                .filter((e) => e.subjectLabel === subject)
                .map((e) => (
                  <Card key={e.id} withBorder padding="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Group gap="xs">
                          <Text fw={600} truncate>
                            {e.name}
                          </Text>
                          <Badge variant="light">Klasse {e.grade}</Badge>
                          {e.hasTasks ? (
                            <Badge variant="light" color="teal">
                              Aufgaben erstellt
                            </Badge>
                          ) : (
                            // Entwürfe werden ab dem ersten Schritt gesichert – auch ganz ohne geplante Teile
                            <Badge variant="outline" color="gray">
                              {e.partCount ? 'nur Rahmen' : 'Entwurf'}
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {e.topic || 'ohne Thema'} · {e.partCount} {e.partCount === 1 ? 'Teil' : 'Teile'} · {e.minutes} Minuten ·{' '}
                          {dateFormat.format(new Date(e.updatedAt))}
                        </Text>
                      </div>
                      <Group gap={4} wrap="nowrap">
                        <Button size="xs" onClick={() => void openSavedExam(e.id).then(onOpened).catch(notifyError)}>
                          Öffnen
                        </Button>
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon variant="subtle" aria-label="Weitere Aktionen">
                              <IconDots size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenaming({ id: e.id, name: e.name })}>
                              Umbenennen
                            </Menu.Item>
                            {/* Löschen gibt es nur am Rechner – über das Netz ist es gesperrt */}
                            {!imNetz() && (
                              <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => setConfirmDelete(e)}>
                                Löschen
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Group>

                    {renaming?.id === e.id && (
                      <Group mt="xs" gap="xs">
                        <TextInput
                          size="xs"
                          style={{ flex: 1 }}
                          value={renaming.name}
                          onChange={(ev) => setRenaming({ id: e.id, name: ev.currentTarget.value })}
                        />
                        <Button
                          size="xs"
                          onClick={async () => {
                            try {
                              const saved = await window.api.exams.get(e.id)
                              const meta = await window.api.exams.save({ id: e.id, name: renaming.name, stats: saved, payload: saved.payload })
                              setExams(await window.api.exams.list())
                              if (useKlassenarbeit.getState().docId === e.id) markSaved(meta.id, meta.updatedAt, meta.name)
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

                    {confirmDelete?.id === e.id && (
                      <Alert color="red" mt="xs" p="xs">
                        <Group justify="space-between">
                          <Text size="sm">„{e.name}“ endgültig löschen?</Text>
                          <Group gap="xs">
                            <Button size="xs" variant="default" onClick={() => setConfirmDelete(null)}>
                              Abbrechen
                            </Button>
                            <Button size="xs" color="red" autoFocus onClick={() => void removeExam()}>
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
