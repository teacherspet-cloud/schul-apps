import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Menu,
  Modal,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconPlus, IconRefresh, IconSparkles, IconTrash, IconWand } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'
import { actualAfbMix } from '../didactics/checks'
import { browserWorksheetImageDeps } from '../generation/browserImages'
import { finishWorksheet } from '../generation/finish'
import { browserSourceServices } from '../generation/originalSources'
import { generateOutline, generateWorksheet, suggestOutlineItem } from '../generation/generate'
import { BLOCK_LABELS } from '../model/factory'
import type { AnswerKind, OutlineItem, SocialForm, WsBlockType } from '../model/types'
import { profileFromMeta } from '../render/SheetPages'
import { aiCall, trackedAiCall, useArbeitsblatt } from '../store'
import UndoRedoButtons from '../../../shared/components/UndoRedoButtons'
import { AiProgressTracker, neverBackwards, phaseRatio, remainingLabel, remainingSeconds } from '../../../shared/aiProgress'
import type { RunPhase } from '../../../shared/aiProgress'

const ANSWER_LABELS: Record<AnswerKind, string> = {
  lines: 'Schreiblinien',
  grid: 'Rechenkästchen',
  space: 'freie Fläche',
  none: 'mündlich / keine',
  gapText: 'Lückentext',
  matching: 'Zuordnen',
  multipleChoice: 'Ankreuzen',
  trueFalse: 'Richtig/Falsch',
  ordering: 'Ordnen',
  tableFill: 'Tabelle ausfüllen',
  labels: 'Beschriften'
}

export default function OutlineStep(): React.JSX.Element {
  const { worksheet, setWorksheet, setStep, applyGenerated, undo, redo, verlauf } = useArbeitsblatt()
  const [review, setReview] = useState(true)
  // Sparmodus (Einstellungen → Künstliche Intelligenz): alle Niveaustufen in einer Anfrage, ohne Prüfrunde
  const [economy, setEconomy] = useState(false)
  const aiSettings = useAppSettings((s) => s.settings.ai)
  useEffect(() => {
    window.api.ai
      .status()
      .then((s) => setEconomy(s.economy))
      .catch(() => undefined)
  }, [aiSettings])
  const [progress, setProgress] = useState<{ message: string; done: number; total: number; phase: RunPhase } | null>(null)
  // Fortschritt der laufenden KI-Anfrage: Der Balken folgt der Länge der eintreffenden Antwort
  const [chunkRatio, setChunkRatio] = useState(0)
  // Der angezeigte Anteil läuft nie zurück – das läse sich wie ein Fehler
  const shown = useRef(0)
  const startedAt = useRef(0)
  const tracker = useRef<AiProgressTracker | null>(null)
  const [replanning, setReplanning] = useState(false)
  /** Baustein, den die KI gerade beschreibt */
  const [neu, setNeu] = useState('')
  const profile = useMemo(() => (worksheet ? profileFromMeta(worksheet.meta) : null), [worksheet])

  if (!worksheet?.outline || !profile) return <Container py="xl">Noch keine Gliederung.</Container>
  const outline = worksheet.outline
  // Jede Änderung der Gliederung ist ein Schritt für Strg+Z; Tippen im selben Feld zählt als einer
  const setItems = (items: OutlineItem[], gruppe?: string): void => setWorksheet({ ...worksheet, outline: { ...outline, items } }, gruppe)
  const patchItem = (i: number, p: Partial<OutlineItem>): void =>
    setItems(
      outline.items.map((it, j) => (j === i ? { ...it, ...p } : it)),
      `baustein:${outline.items[i]?.id}:${Object.keys(p).sort().join(',')}`
    )
  const move = (i: number, d: number): void => {
    const items = [...outline.items]
    const [x] = items.splice(i, 1)
    items.splice(i + d, 0, x)
    setItems(items)
  }

  const tasks = outline.items.filter((i) => i.type === 'task')
  const actual = actualAfbMix(tasks.map((t) => t.afb))
  const combined = worksheet.meta.differentiation.levels > 1 && worksheet.meta.differentiation.mode === 'combined'

  /** Einen einzelnen Gliederungspunkt von der KI beschreiben lassen. */
  const beschreiben = async (i: number): Promise<void> => {
    const item = outline.items[i]
    setNeu(item.id)
    try {
      const vorschlag = await suggestOutlineItem(worksheet, profile, outline, i, aiCall)
      // Nur beschreiben, nicht umentscheiden: Operator bleibt, wenn die Lehrkraft einen gesetzt hat
      patchItem(i, { purpose: vorschlag.purpose || item.purpose, ...(item.operator || !vorschlag.operator ? {} : { operator: vorschlag.operator }) })
    } catch (e) {
      notifyError(e, 'Der Baustein konnte nicht beschrieben werden')
    } finally {
      setNeu('')
    }
  }

  const formulate = async (): Promise<void> => {
    setProgress({ message: 'Start …', done: 0, total: 1, phase: 'formulate' })
    startedAt.current = Date.now()
    setChunkRatio(0)
    shown.current = 0
    const t = new AiProgressTracker(() => setChunkRatio(t.ratio()))
    tracker.current = t
    const ai = trackedAiCall(t)
    try {
      // Die inhaltliche Prüfung läuft auch im Sparmodus: Ein Blatt mit falschen Verweisen
      // oder unlösbaren Aufgaben spart kein Kontingent, sondern kostet Unterrichtszeit.
      const result = await generateWorksheet(worksheet, profile, {
        ai,
        review,
        combined: economy,
        onProgress: (message, done, total) => setProgress({ message, done, total, phase: 'formulate' })
      })
      await finishWorksheet(result, profile, { ai, images: await browserWorksheetImageDeps(), sources: browserSourceServices() }, (message, done, total) =>
        setProgress({ message, done, total, phase: 'finish' })
      )
      // Bleibt dasselbe Dokument wie der Entwurf; Strg+Z führt zur Gliederung zurück
      applyGenerated(result, 2)
    } catch (e) {
      notifyError(e, 'Arbeitsblatt konnte nicht erstellt werden')
    } finally {
      t.dispose()
      tracker.current = null
      setProgress(null)
      setChunkRatio(0)
    }
  }

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={2}>Gliederung prüfen</Title>
            <Text c="dimmed" size="sm">
              Bausteine umsortieren, ändern oder ergänzen – danach formuliert die KI das Arbeitsblatt aus.
            </Text>
          </div>
          <Group>
            <UndoRedoButtons canUndo={verlauf.past.length > 0} canRedo={verlauf.future.length > 0} onUndo={undo} onRedo={redo} />
            <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => setStep(0)}>
              Zurück
            </Button>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              loading={replanning}
              onClick={async () => {
                setReplanning(true)
                try {
                  /*
                   * Mit dem Originalmaterial, das beim ersten Planen gefunden wurde. Vorher fehlte
                   * es hier: Die neue Gliederung plante Aufgaben zu einem gedachten Text, obwohl
                   * ein echter bereitlag. Die alte Gliederung bleibt über Strg+Z erreichbar.
                   */
                  const neu = await generateOutline(worksheet.meta, profile, worksheet.sources, aiCall, worksheet.originalMaterial ?? null)
                  const aktuell = useArbeitsblatt.getState().worksheet ?? worksheet
                  setWorksheet({ ...aktuell, outline: neu })
                } catch (e) {
                  notifyError(e)
                } finally {
                  setReplanning(false)
                }
              }}
            >
              Neu planen
            </Button>
          </Group>
        </Group>

        {outline.teacherNote && (
          <Alert color="yellow" mb="md" title="Hinweis der KI">
            {outline.teacherNote}
          </Alert>
        )}

        <Card withBorder mb="md">
          <Stack gap="sm">
            <TextInput
              label="Titel"
              value={worksheet.meta.title || outline.title}
              onChange={(e) => setWorksheet({ ...worksheet, meta: { ...worksheet.meta, title: e.currentTarget.value } }, 'titel')}
            />
            <Textarea
              label="Lernziele (eine pro Zeile)"
              autosize
              minRows={2}
              value={outline.learningGoals.join('\n')}
              onChange={(e) => setWorksheet({ ...worksheet, outline: { ...outline, learningGoals: e.currentTarget.value.split('\n') } })}
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Anforderungsbereiche der Aufgaben
              </Text>
              <AfbBar label="Soll" mix={profile.afbMix} />
              {actual && <AfbBar label="Plan" mix={actual} />}
            </div>
          </Stack>
        </Card>

        <Stack gap="xs">
          {outline.items.map((it, i) => (
            <Card key={it.id} withBorder padding="sm">
              <Group align="start" wrap="nowrap">
                <Stack gap={2}>
                  <ActionIcon size="sm" variant="default" aria-label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)}>
                    <IconArrowUp size={14} />
                  </ActionIcon>
                  <ActionIcon size="sm" variant="default" aria-label="Nach unten" disabled={i === outline.items.length - 1} onClick={() => move(i, 1)}>
                    <IconArrowDown size={14} />
                  </ActionIcon>
                </Stack>
                <Stack gap={6} style={{ flex: 1 }}>
                  <Group gap="xs" wrap="wrap">
                    <Select
                      size="xs"
                      w={200}
                      data={Object.entries(BLOCK_LABELS).map(([value, label]) => ({ value, label }))}
                      value={it.type}
                      onChange={(v) => v && patchItem(i, { type: v as WsBlockType })}
                      allowDeselect={false}
                    />
                    {it.type === 'task' && (
                      <>
                        <Select
                          size="xs"
                          w={90}
                          data={['I', 'II', 'III']}
                          value={it.afb ?? null}
                          placeholder="AFB"
                          onChange={(v) => patchItem(i, { afb: (v as OutlineItem['afb']) ?? undefined })}
                        />
                        <TextInput
                          size="xs"
                          w={130}
                          placeholder="Operator"
                          value={it.operator}
                          onChange={(e) => patchItem(i, { operator: e.currentTarget.value })}
                        />
                        <Select
                          size="xs"
                          w={150}
                          data={[
                            { value: 'EA', label: 'Einzelarbeit' },
                            { value: 'PA', label: 'Partnerarbeit' },
                            { value: 'GA', label: 'Gruppenarbeit' },
                            { value: 'Plenum', label: 'Klassengespräch' }
                          ]}
                          value={it.socialForm}
                          onChange={(v) => v && patchItem(i, { socialForm: v as SocialForm })}
                          allowDeselect={false}
                        />
                        <Select
                          size="xs"
                          w={160}
                          data={Object.entries(ANSWER_LABELS).map(([value, label]) => ({ value, label }))}
                          value={it.answerKind}
                          onChange={(v) => v && patchItem(i, { answerKind: v as AnswerKind })}
                          allowDeselect={false}
                        />
                      </>
                    )}
                    {combined && (
                      <Select
                        size="xs"
                        w={110}
                        data={[
                          { value: '0', label: 'für alle' },
                          { value: '2', label: '★★' },
                          { value: '3', label: '★★★' }
                        ]}
                        value={String(it.stars ?? 0)}
                        onChange={(v) => patchItem(i, { stars: v === '2' ? 2 : v === '3' ? 3 : undefined })}
                        allowDeselect={false}
                      />
                    )}
                  </Group>
                  <Textarea size="sm" autosize minRows={1} value={it.purpose} onChange={(e) => patchItem(i, { purpose: e.currentTarget.value })} />
                </Stack>
                <Stack gap={4}>
                  {/* Neu beschreiben lassen: Art, Anforderungsbereich, Operator, Sozialform und
                      Antwortform bleiben, wie die Lehrkraft sie gesetzt hat. */}
                  <Tooltip label={it.purpose.trim() ? 'Diesen Baustein von der KI neu beschreiben lassen' : 'Von der KI ausfüllen lassen'}>
                    <ActionIcon variant="subtle" loading={neu === it.id} onClick={() => void beschreiben(i)}>
                      <IconWand size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Entfernen (Strg+Z holt ihn zurück)">
                    <ActionIcon variant="subtle" color="red" aria-label="Baustein entfernen" onClick={() => setItems(outline.items.filter((_, j) => j !== i))}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Stack>
              </Group>
            </Card>
          ))}
        </Stack>

        <Menu shadow="md">
          <Menu.Target>
            <Button variant="subtle" mt="sm" leftSection={<IconPlus size={16} />}>
              Baustein hinzufügen
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {Object.entries(BLOCK_LABELS).map(([type, label]) => (
              <Menu.Item
                key={type}
                onClick={() =>
                  setItems([
                    ...outline.items,
                    {
                      id: newId(),
                      type: type as WsBlockType,
                      purpose: '',
                      operator: '',
                      socialForm: 'EA',
                      answerKind: 'lines',
                      afb: type === 'task' ? 'II' : undefined
                    }
                  ])
                }
              >
                {label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        <Card withBorder mt="lg" mb="xl">
          <Group justify="space-between">
            <Stack gap={2}>
              <Text size="sm">
                <b>{outline.items.length}</b> Bausteine, davon <b>{tasks.length}</b> Aufgaben ·{' '}
                {worksheet.meta.differentiation.levels > 1 ? `${worksheet.meta.differentiation.levels} Niveaustufen` : 'ein Niveau'}
              </Text>
              <Checkbox
                size="xs"
                label="Arbeitsblatt anschließend von der KI prüfen und verbessern lassen (empfohlen)"
                description={
                  economy ? 'Sparmodus ist an: eine KI-Anfrage je Niveaustufe. Die Prüfung läuft trotzdem – sie kostet eine weitere Anfrage.' : undefined
                }
                checked={review}
                onChange={(e) => setReview(e.currentTarget.checked)}
              />
            </Stack>
            <Group>
              {worksheet.sheets.length > 0 && (
                <Button variant="default" onClick={() => setStep(2)}>
                  Zum bestehenden Blatt
                </Button>
              )}
              <Button size="md" leftSection={<IconSparkles size={18} />} disabled={outline.items.length === 0} onClick={formulate}>
                Arbeitsblatt ausformulieren
              </Button>
            </Group>
          </Group>
        </Card>
      </Container>

      <Modal opened={progress !== null} onClose={() => {}} withCloseButton={false} centered title="Arbeitsblatt wird erstellt">
        {progress && (
          <Stack>
            {(() => {
              // Zwei Abschnitte mit eigener Zählung – zusammengeführt und ohne Rücksprung
              const ratio = neverBackwards(shown.current, phaseRatio(progress.phase, progress.done, progress.total, chunkRatio))
              shown.current = ratio
              const rest = remainingLabel(remainingSeconds(ratio, Date.now() - startedAt.current))
              return (
                <>
                  <Progress value={ratio * 100} animated />
                  <Group justify="space-between" gap="xs">
                    <Text size="sm">{progress.message}</Text>
                    <Text size="sm" c="dimmed">
                      {Math.round(ratio * 100)} %
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {rest || 'Das dauert je nach Umfang ein bis drei Minuten.'}
                  </Text>
                </>
              )
            })()}
          </Stack>
        )}
      </Modal>
    </ScrollArea>
  )
}

function AfbBar({ label, mix }: { label: string; mix: { I: number; II: number; III: number } }): React.JSX.Element {
  return (
    <Group gap="xs" mb={4} wrap="nowrap">
      <Badge variant="light" w={52}>
        {label}
      </Badge>
      <Progress.Root size={18} style={{ flex: 1 }}>
        <Progress.Section value={mix.I} color="teal">
          <Progress.Label>I {mix.I} %</Progress.Label>
        </Progress.Section>
        <Progress.Section value={mix.II} color="blue">
          <Progress.Label>II {mix.II} %</Progress.Label>
        </Progress.Section>
        <Progress.Section value={mix.III} color="grape">
          <Progress.Label>III {mix.III} %</Progress.Label>
        </Progress.Section>
      </Progress.Root>
    </Group>
  )
}
