import { ActionIcon, Button, Group, Menu, Text, Tooltip } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconHistory, IconRefresh, IconWand } from '@tabler/icons-react'
import type { WsBlock } from '../model/types'
import { versionInfo } from '../model/versions'
import KiWunschKnoepfe from '../../../shared/components/KiWunschKnoepfe'
import type { WunschArt, WunschKontext } from '../../../shared/kiWunsch'
import { istLeer } from '../model/factory'

/**
 * Die KI-Knöpfe eines Bausteins: Zauberstab „Überarbeiten", Kreis „Neu erzeugen" (beide mit
 * demselben Wunschfeld, shared/components/KiWunschKnoepfe.tsx) und darunter das Menü „KI" mit
 * den weiteren KI-Aktionen des Bausteins (Leveln, Bewertungsraster, Beispiel …).
 *
 * Bis Paket 6 standen hier zwei fast gleiche Symbole übereinander, deren Unterschied nur der
 * Tooltip verriet (Befund der Lehrkraft, 25.09.2026) – daraufhin kam alles in ein Menü. Seit
 * 30.09.2026 wünscht die Lehrkraft den Kreis zum Neugenerieren zurück, MIT Änderungswunsch,
 * und dazu den Zauberstab zum Überarbeiten. Beide öffnen dasselbe Feld, dort stehen beide
 * Aktionen ausgeschrieben; das Menü bietet dieselben zwei Einträge (kein zweiter Weg).
 */
export function KiMenue({
  block,
  busy,
  kontext,
  onWunsch,
  children
}: {
  block: WsBlock
  busy: boolean
  kontext: () => WunschKontext
  onWunsch: (art: WunschArt, wunsch: string) => void
  /** Weitere KI-Einträge des Bausteins (Menu.Item), z. B. das gelöste Beispiel */
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <KiWunschKnoepfe
      blockId={block.id}
      kontext={kontext}
      busy={busy}
      onAusfuehren={onWunsch}
      // Ein leerer Baustein hat nichts zum Überarbeiten – dort füllt der eigene Zauberstab
      ohneUeberarbeiten={istLeer(block)}
      fassungen
      menue={(oeffne) => (
        <Menu position="left-start" withArrow shadow="md">
          <Menu.Target>
            <Tooltip label="Weitere KI-Aktionen" position="left">
              <Button className="editor-ai-revise" size="compact-xs" px={4} variant="filled" loading={busy} aria-label="KI-Aktionen">
                KI
              </Button>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>KI-Aktionen für diesen Baustein</Menu.Label>
            {!istLeer(block) && (
              <Menu.Item leftSection={<IconWand size={14} />} onClick={() => oeffne('ueberarbeiten')}>
                Mit KI überarbeiten …
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconRefresh size={14} />} onClick={() => oeffne('neu')}>
              Mit KI neu erzeugen …
            </Menu.Item>
            {children}
          </Menu.Dropdown>
        </Menu>
      )}
    />
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
