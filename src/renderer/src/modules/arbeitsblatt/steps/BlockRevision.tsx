import { ActionIcon, Button, Chip, Group, Popover, Stack, Text, Textarea, Tooltip } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconSparkles } from '@tabler/icons-react'
import { useState } from 'react'
import type { WsBlock } from '../model/types'
import { versionInfo } from '../model/versions'

const SUGGESTIONS: Partial<Record<WsBlock['type'], string[]>> = {
  text: ['einfacher formulieren', 'kürzer fassen', 'mehr Fachbegriffe erklären', 'Originalquelle verwenden', 'Beispiel aus dem Alltag ergänzen'],
  task: ['Aufgabe offener stellen', 'kleinschrittiger mit Teilaufgaben', 'anspruchsvoller (AFB III)', 'Satzanfänge als Hilfe ergänzen'],
  infoBox: ['kürzer fassen', 'Beispiel ergänzen', 'einfacher formulieren'],
  image: ['anderes Motiv wählen', 'Bildquelle (historisch) statt Zeichnung'],
  table: ['weniger Spalten', 'Beispielzeile ergänzen']
}

/**
 * Kleines KI-Symbol am Material: Die Lehrkraft beschreibt, was geändert werden soll; nur dieser Baustein
 * bekommt einen neuen Entwurf.
 */
export function AiReviseButton({ block, busy, onRevise }: { block: WsBlock; busy: boolean; onRevise: (instruction: string) => void }): React.JSX.Element {
  const [opened, setOpened] = useState(false)
  const [text, setText] = useState('')
  const suggestions = SUGGESTIONS[block.type] ?? ['einfacher formulieren', 'kürzer fassen', 'ausführlicher']
  const run = (): void => {
    if (!text.trim()) return
    onRevise(text.trim())
    setOpened(false)
    setText('')
  }
  return (
    <Popover opened={opened} onChange={setOpened} width={340} position="left-start" withArrow shadow="md" trapFocus>
      <Popover.Target>
        <Tooltip label="Mit KI überarbeiten (eigener Auftrag)" position="left" disabled={opened}>
          <ActionIcon
            className="editor-ai-revise"
            size="sm"
            variant="filled"
            loading={busy}
            aria-label="Mit KI überarbeiten"
            onClick={() => setOpened((o) => !o)}
          >
            <IconSparkles size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Diesen Baustein mit KI überarbeiten
          </Text>
          <Textarea
            placeholder="Was soll geändert werden? z. B. „Formuliere den Text für schwächere Leser einfacher.“"
            autosize
            minRows={2}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run()
            }}
            data-autofocus
          />
          <Group gap={4}>
            {suggestions.map((s) => (
              <Chip key={s} size="xs" checked={false} onChange={() => setText((t) => (t ? `${t}, ${s}` : s))}>
                {s}
              </Chip>
            ))}
          </Group>
          <Text size="xs" c="dimmed">
            Der bisherige Stand bleibt als Entwurf erhalten – mit den Pfeilen über dem Baustein wechselst du zwischen den Entwürfen. Andere Bausteine bleiben
            unverändert.
          </Text>
          <Button size="xs" leftSection={<IconSparkles size={14} />} disabled={!text.trim()} onClick={run}>
            Überarbeiten
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** „‹ Entwurf 2 von 3 ›“ über einem Baustein mit mehreren Entwürfen. */
export function VersionSwitcher({ block, onSwitch }: { block: WsBlock; onSwitch: (index: number) => void }): React.JSX.Element | null {
  const { count, current } = versionInfo(block)
  if (count < 2) return null
  return (
    <Group className="editor-version-bar" gap={4} justify="flex-end" wrap="nowrap">
      <ActionIcon size="xs" variant="subtle" aria-label="Vorheriger Entwurf" disabled={current <= 1} onClick={() => onSwitch(current - 2)}>
        <IconChevronLeft size={14} />
      </ActionIcon>
      <Text size="xs" c="dimmed">
        Entwurf {current} von {count}
      </Text>
      <ActionIcon size="xs" variant="subtle" aria-label="Nächster Entwurf" disabled={current >= count} onClick={() => onSwitch(current)}>
        <IconChevronRight size={14} />
      </ActionIcon>
    </Group>
  )
}
