import { ActionIcon, Alert, MultiSelect, SegmentedControl, Button, Card, Group, Popover, Select, Stack, Text, Textarea, Title, Tooltip } from '@mantine/core'
import { IconChalkboard, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { notifyError } from '../../../shared/util'
import type { LearnerProfile } from '../didactics/profile'
import { BOARD_LAYOUTS, generateBoard } from '../generation/board'
import type { BoardLayout, Worksheet } from '../model/types'
import { BoardPage } from '../render/BoardView'
import { aiCall, useArbeitsblatt } from '../store'
import { BOARD_FORMATS, boardFormatInfo, boardList, checkBoard } from '../didactics/boardDesign'
import type { BoardFormat } from '../didactics/boardDesign'
import type { BoardPlan } from '../model/types'
import { druckAkzent } from '../../../shared/fachfarben'

/** Reiter „Tafelbild“ im Editor: erstellen, bearbeiten, mit KI überarbeiten. */
export function BoardPanel({ ws, profile }: { ws: Worksheet; profile: LearnerProfile }): React.JSX.Element {
  const update = useArbeitsblatt((s) => s.update)
  const [busy, setBusy] = useState(false)
  const [wish, setWish] = useState('')
  const [reviseOpen, setReviseOpen] = useState(false)
  const [instruction, setInstruction] = useState('')

  /** Ändert das gerade gezeigte Tafelbild im Entwurf. */
  const setActive = (draft: Worksheet, fn: (b: BoardPlan) => void): void => {
    const list = boardList(draft)
    const target = list.find((b) => (b.format ?? 'mitteltafel') === activeFormat) ?? list[0]
    if (target) fn(target)
  }

  /** Welches der Tafelbilder gerade gezeigt wird */
  const [activeFormat, setActiveFormat] = useState<BoardFormat>('mitteltafel')
  const boards = boardList(ws)
  const active = boards.find((b) => (b.format ?? 'mitteltafel') === activeFormat) ?? boards[0]

  /** Erzeugt das Tafelbild für eine Fläche und legt es an ihrer Stelle ab. */
  const run = async (text: string, keepExisting: boolean, format: BoardFormat = activeFormat): Promise<void> => {
    setBusy(true)
    try {
      const base = keepExisting ? ws : { ...ws, board: null, boards: boards.filter((b) => (b.format ?? 'mitteltafel') !== format) }
      const board = await generateBoard(base, profile, aiCall, text, format)
      update((d) => {
        const list = boardList(d).filter((b) => (b.format ?? 'mitteltafel') !== format)
        d.boards = [...list, board].sort((a, b) => boardFormatInfo(a.format).ratio - boardFormatInfo(b.format).ratio)
        // Das erste Tafelbild bleibt zusätzlich im alten Feld: Export und ältere Dateien lesen es dort
        d.board = d.boards[0]
      })
      setActiveFormat(format)
    } catch (e) {
      notifyError(e, 'Tafelbild konnte nicht erstellt werden')
    } finally {
      setBusy(false)
    }
  }

  if (!boards.length) {
    return (
      <Card withBorder w="210mm" maw="100%" p="lg">
        <Stack gap="sm">
          <Group gap="xs">
            <IconChalkboard size={22} />
            <Title order={4}>Tafelbild zur Ergebnissicherung</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Die KI vergleicht die Aufgaben {ws.sheets.length > 1 ? 'aller Niveaustufen ' : ''}und schlägt ein Tafelbild vor, das im Unterrichtsgespräch aus den
            Ergebnissen entsteht – mit Impulsen und erwarteten Schülerbeiträgen. Es ist Material für die Lehrkraft und erscheint nicht auf den Arbeitsblättern.
          </Text>
          <Textarea
            label="Wünsche (optional)"
            placeholder="z. B. als Gegenüberstellung Vorteile/Nachteile, mit Leitfrage als Überschrift"
            autosize
            minRows={2}
            value={wish}
            onChange={(e) => setWish(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button leftSection={<IconSparkles size={16} />} loading={busy} onClick={() => run(wish.trim(), false)}>
              Tafelbild mit KI erstellen
            </Button>
          </Group>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="xs" align="center">
      <Group gap="xs" w="297mm" maw="100%">
        <Select
          size="xs"
          w={230}
          data={BOARD_LAYOUTS}
          value={active.layout}
          allowDeselect={false}
          onChange={(v) => v && update((d) => setActive(d, (b) => (b.layout = v as BoardLayout)))}
        />
        <MultiSelect
          size="xs"
          w={320}
          title="Für welche Flächen? Jede bekommt ein eigenes Tafelbild."
          placeholder="Tafelformat"
          data={BOARD_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
          value={boards.map((b) => b.format ?? 'mitteltafel')}
          onChange={(v) => {
            const wanted = (v.length ? v : ['mitteltafel']) as BoardFormat[]
            // Abgewählte Flächen fallen weg; neu gewählte werden gleich erzeugt
            update((d) => {
              d.boards = boardList(d).filter((b) => wanted.includes(b.format ?? 'mitteltafel'))
              d.board = d.boards[0] ?? null
            })
            const fehlend = wanted.filter((f) => !boards.some((b) => (b.format ?? 'mitteltafel') === f))
            if (fehlend[0]) void run('', true, fehlend[0])
            else if (!wanted.includes(activeFormat)) setActiveFormat(wanted[0])
          }}
        />
        <Popover opened={reviseOpen} onChange={setReviseOpen} width={340} position="bottom-start" withArrow shadow="md" trapFocus>
          <Popover.Target>
            <Button size="xs" variant="light" leftSection={<IconSparkles size={14} />} loading={busy} onClick={() => setReviseOpen((o) => !o)}>
              Mit KI überarbeiten
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Textarea
                placeholder="Was soll geändert werden? z. B. „weniger Stichpunkte“, „Ursache → Wirkung darstellen“"
                autosize
                minRows={2}
                value={instruction}
                onChange={(e) => setInstruction(e.currentTarget.value)}
                data-autofocus
              />
              <Button
                size="xs"
                disabled={!instruction.trim()}
                onClick={() => {
                  setReviseOpen(false)
                  void run(instruction.trim(), true).then(() => setInstruction(''))
                }}
              >
                Überarbeiten
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
        <Button size="xs" variant="default" loading={busy} onClick={() => run('', false)}>
          Neu erstellen
        </Button>
        <Tooltip label="Tafelbild entfernen">
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={() =>
              update((d) => {
                d.boards = boardList(d).filter((b) => (b.format ?? 'mitteltafel') !== activeFormat)
                d.board = d.boards[0] ?? null
              })
            }
            aria-label="Tafelbild entfernen"
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
        <Text size="xs" c="dimmed" style={{ flex: 1, textAlign: 'right' }}>
          Texte anklicken zum Bearbeiten · Strg+Z macht KI-Änderungen rückgängig
        </Text>
      </Group>
      {(() => {
        // Passt das Tafelbild überhaupt an eine Tafel? Die Grenzen kommen aus der Schriftgröße.
        const notes = checkBoard(active)
        if (!notes.length) return null
        return (
          <Alert color="orange" w="297mm" maw="100%" p="xs" title="Hinweise zur Tafelfläche">
            <Stack gap={2}>
              {notes.map((n, i) => (
                <Text size="xs" key={i}>
                  {n}
                </Text>
              ))}
            </Stack>
          </Alert>
        )
      })()}
      {boards.length > 1 && (
        <SegmentedControl
          size="xs"
          value={activeFormat}
          onChange={(v) => setActiveFormat(v as BoardFormat)}
          data={boards.map((b) => ({ value: b.format ?? 'mitteltafel', label: boardFormatInfo(b.format).label }))}
        />
      )}
      <div className="ws-editor-pages">
        <BoardPage
          board={active}
          meta={ws.meta}
          accent={druckAkzent(ws)}
          fontFamily={ws.design.page.fontFamily}
          onChange={(fn) => update((d) => setActive(d, fn))}
        />
      </div>
    </Stack>
  )
}
