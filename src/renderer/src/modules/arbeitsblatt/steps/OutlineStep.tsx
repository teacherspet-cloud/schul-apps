import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Menu,
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
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconCopy, IconPlus, IconRefresh, IconSparkles, IconTrash, IconWand } from '@tabler/icons-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'
import { actualAfbMix } from '../didactics/checks'
import { suggestOutlineItem } from '../generation/generate'
import { BLOCK_LABELS } from '../model/factory'
import type { AnswerKind, OutlineItem, SocialForm, WsBlockType } from '../model/types'
import { profileFromMeta } from '../render/SheetPages'
import { aiCall, useArbeitsblatt } from '../store'
import { formuliereAus, planeNeu } from '../auftraege'
import UndoRedoButtons from '../../../shared/components/UndoRedoButtons'
import { EinfuegeStelle } from './EinfuegenMenue'
import { KiHinweise } from './KiHinweise'

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
  const { worksheet, setWorksheet, setStep, undo, redo, verlauf } = useArbeitsblatt()
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

  /*
   * An beliebiger Stelle einfügen und duplizieren (Paket 6) – vorher ging Hinzufügen nur am
   * Ende. Jede Änderung ist ein Verlaufsschritt (Strg+Z).
   */
  const einfuegen = (i: number, type: WsBlockType): void => {
    const items = [...outline.items]
    items.splice(i, 0, neuerPunkt(type))
    setItems(items)
  }
  const duplizieren = (i: number): void => {
    const items = [...outline.items]
    items.splice(i + 1, 0, { ...structuredClone(outline.items[i]), id: newId() })
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

  /*
   * Ausformulieren läuft als Hintergrund-Auftrag (../auftraege.ts) – mit einer Kopie der
   * Gliederung von jetzt. Das Programm zeigt bis dahin einen Hinweis statt dieser Seite; das
   * Ergebnis landet in diesem Blatt, auch wenn inzwischen ein anderes offen ist.
   */
  const docId = (): string => useArbeitsblatt.getState().docId
  const formulate = (): void => formuliereAus(worksheet, docId(), { review, economy })

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
            {/* Mit dem Originalmaterial vom ersten Planen; die alte Gliederung bleibt über Strg+Z erreichbar */}
            <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={() => planeNeu(worksheet, docId())}>
              Neu planen
            </Button>
          </Group>
        </Group>

        {outline.teacherNote && (
          <div style={{ marginBottom: 16 }}>
            <KiHinweise note={outline.teacherNote} />
          </div>
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

        <Stack gap={0}>
          {outline.items.map((it, i) => (
            <Fragment key={it.id}>
              <EinfuegeStelle position={i} onWaehlen={(typ) => einfuegen(i, typ)} />
              <Card withBorder padding="sm">
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
                        aria-label="Art des Bausteins"
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
                            aria-label="Anforderungsbereich"
                            data={['I', 'II', 'III']}
                            value={it.afb ?? null}
                            placeholder="AFB"
                            onChange={(v) => patchItem(i, { afb: (v as OutlineItem['afb']) ?? undefined })}
                          />
                          <TextInput
                            size="xs"
                            w={130}
                            placeholder="Operator"
                            aria-label="Operator"
                            value={it.operator}
                            onChange={(e) => patchItem(i, { operator: e.currentTarget.value })}
                          />
                          <Select
                            size="xs"
                            w={150}
                            aria-label="Sozialform"
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
                            aria-label="Antwortform"
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
                          aria-label="Niveau"
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
                    <Textarea
                      size="sm"
                      autosize
                      minRows={1}
                      aria-label="Beschreibung des Bausteins"
                      value={it.purpose}
                      onChange={(e) => patchItem(i, { purpose: e.currentTarget.value })}
                    />
                  </Stack>
                  <Stack gap={4}>
                    {/* Neu beschreiben lassen: Art, Anforderungsbereich, Operator, Sozialform und
                      Antwortform bleiben, wie die Lehrkraft sie gesetzt hat. */}
                    <Tooltip label={it.purpose.trim() ? 'Diesen Baustein von der KI neu beschreiben lassen' : 'Von der KI ausfüllen lassen'}>
                      <ActionIcon
                        variant="subtle"
                        loading={neu === it.id}
                        aria-label={it.purpose.trim() ? 'Von der KI neu beschreiben lassen' : 'Von der KI ausfüllen lassen'}
                        onClick={() => void beschreiben(i)}
                      >
                        <IconWand size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Duplizieren – die Kopie steht direkt darunter">
                      <ActionIcon variant="subtle" aria-label="Baustein duplizieren" onClick={() => duplizieren(i)}>
                        <IconCopy size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Entfernen (Strg+Z holt ihn zurück)">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Baustein entfernen"
                        onClick={() => setItems(outline.items.filter((_, j) => j !== i))}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Stack>
                </Group>
              </Card>
            </Fragment>
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
              <Menu.Item key={type} onClick={() => setItems([...outline.items, neuerPunkt(type as WsBlockType)])}>
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
    </ScrollArea>
  )
}

/** Ein neuer, noch leerer Gliederungspunkt. */
function neuerPunkt(type: WsBlockType): OutlineItem {
  return { id: newId(), type, purpose: '', operator: '', socialForm: 'EA', answerKind: 'lines', afb: type === 'task' ? 'II' : undefined }
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
