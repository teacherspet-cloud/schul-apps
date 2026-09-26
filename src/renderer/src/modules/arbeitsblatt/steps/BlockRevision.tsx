import { ActionIcon, Button, Chip, Group, Menu, Popover, Stack, Text, Textarea, Tooltip } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconHistory, IconRefresh, IconSparkles } from '@tabler/icons-react'
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
 * Das KI-Menü eines Bausteins: überarbeiten (mit eigenem Auftrag), neu erzeugen und – je nach
 * Baustein – weitere KI-Aktionen.
 *
 * Bis Paket 6 standen hier zwei fast gleiche Symbole übereinander: Funken für „überarbeiten“
 * und ein Kreispfeil für „neu erzeugen“, dazu das gelöste Beispiel. Welches was tut, zeigte nur
 * der Tooltip (Befund der Lehrkraft, 25.09.2026). Jetzt gibt es EINEN beschrifteten Knopf „KI“
 * mit einem Menü, in dem jede Aktion ausgeschrieben steht. „Überarbeiten …“ öffnet wie bisher
 * das Feld für den Auftrag, am selben Knopf.
 */
export function KiMenue({
  block,
  busy,
  onRevise,
  onRegenerate,
  children
}: {
  block: WsBlock
  busy: boolean
  onRevise: (instruction: string) => void
  onRegenerate: () => void
  /** Weitere KI-Einträge des Bausteins (Menu.Item), z. B. das gelöste Beispiel */
  children?: React.ReactNode
}): React.JSX.Element {
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
        <div>
          <Menu position="left-start" withArrow shadow="md">
            <Menu.Target>
              <Tooltip label="KI-Aktionen: überarbeiten, neu erzeugen" position="left" disabled={opened}>
                <Button className="editor-ai-revise" size="compact-xs" px={4} variant="filled" loading={busy} aria-label="KI-Aktionen">
                  KI
                </Button>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>KI-Aktionen für diesen Baustein</Menu.Label>
              <Menu.Item leftSection={<IconSparkles size={14} />} onClick={() => setOpened(true)}>
                Mit KI überarbeiten …
              </Menu.Item>
              <Menu.Item leftSection={<IconRefresh size={14} />} onClick={onRegenerate}>
                Mit KI neu erzeugen
              </Menu.Item>
              {children}
            </Menu.Dropdown>
          </Menu>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Diesen Baustein mit KI überarbeiten
          </Text>
          <Textarea
            placeholder="Was soll geändert werden? z. B. „Den Text für schwächere Leser einfacher formulieren.“"
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
            Der bisherige Stand bleibt erhalten: Über dem Baustein erscheint „Fassung 1 / 2“ – die Pfeile wechseln zwischen alter und
            neuer Fassung. Andere Bausteine bleiben unverändert.
          </Text>
          <Button size="xs" leftSection={<IconSparkles size={14} />} disabled={!text.trim()} onClick={run}>
            Überarbeiten
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/**
 * Fassungen eines Bausteins nach einer KI-Überarbeitung: „Fassung 2 / 2 · neu“.
 *
 * Bis 26.09.2026 stand rechts oben nur „‹ Entwurf 2 von 2 ›“ – ohne Symbol, ohne Erklärung,
 * halb über dem Bausteinrand. Die Lehrkraft fand das „unintuitiv platziert / dargestellt“.
 * Jetzt: eine blaue Marke LINKS oben am Baustein (dort beginnt das Lesen), mit Uhr-Symbol,
 * dem Wort „Fassung“, der Kennzeichnung „ursprünglich“ bzw. „neu“ und einem Tooltip, der
 * sagt, woher die Fassungen kommen und dass nichts verloren geht. Die Pfeile tragen
 * beschriftete Tooltips.
 */
export function VersionSwitcher({ block, onSwitch }: { block: WsBlock; onSwitch: (index: number) => void }): React.JSX.Element | null {
  const { count, current } = versionInfo(block)
  if (count < 2) return null
  const kennung = current === count ? 'neu' : current === 1 ? 'ursprünglich' : 'älter'
  return (
    <Tooltip
      label={`Dieser Baustein liegt in ${count} Fassungen vor: der ursprünglichen und ${count - 1 === 1 ? 'einer KI-Überarbeitung' : `${count - 1} KI-Überarbeitungen`}. Mit den Pfeilen wechseln – keine Fassung geht verloren.`}
      multiline
      w={300}
      position="top-start"
      openDelay={300}
    >
      <Group className="editor-version-bar" gap={2} wrap="nowrap" aria-label={`Fassung ${current} von ${count}`}>
        <IconHistory size={13} />
        <Text size="xs" fw={600} span>
          Fassung {current} / {count}
        </Text>
        <Text size="xs" span className="editor-version-kennung">
          · {kennung}
        </Text>
        <Tooltip label="Vorherige Fassung zeigen" position="bottom" disabled={current <= 1}>
          <ActionIcon size="xs" variant="subtle" aria-label="Vorherige Fassung" disabled={current <= 1} onClick={() => onSwitch(current - 2)}>
            <IconChevronLeft size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Neuere Fassung zeigen" position="bottom" disabled={current >= count}>
          <ActionIcon size="xs" variant="subtle" aria-label="Nächste Fassung" disabled={current >= count} onClick={() => onSwitch(current)}>
            <IconChevronRight size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Tooltip>
  )
}
