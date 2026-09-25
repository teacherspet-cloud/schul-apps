import { ActionIcon, Menu, Tooltip } from '@mantine/core'
import { IconPlus, IconRowInsertBottom, IconRowInsertTop } from '@tabler/icons-react'
import { BLOCK_LABELS } from '../model/factory'
import type { WsBlockType } from '../model/types'

/**
 * Untermenü „Darüber einfügen“ / „Darunter einfügen“ im „⋯“-Menü eines Bausteins (Paket 6).
 *
 * Im Editor liegt zwischen den Bausteinen keine Lücke, die sich überfahren ließe: Die Seiten
 * sind fertig umbrochen, und ein eingeschobener „+“-Streifen veränderte den Umbruch, den die
 * Lehrkraft gerade prüft. Deshalb sitzt das Einfügen am Baustein selbst.
 */
export function EinfuegenUntermenue({
  titel,
  onWaehlen
}: {
  titel: 'Darüber einfügen' | 'Darunter einfügen'
  onWaehlen: (typ: WsBlockType) => void
}): React.JSX.Element {
  return (
    <Menu.Sub position="left-start">
      <Menu.Sub.Target>
        <Menu.Sub.Item leftSection={titel === 'Darüber einfügen' ? <IconRowInsertTop size={14} /> : <IconRowInsertBottom size={14} />}>{titel}</Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown>
        {Object.entries(BLOCK_LABELS).map(([typ, label]) => (
          <Menu.Item key={typ} onClick={() => onWaehlen(typ as WsBlockType)}>
            {label}
          </Menu.Item>
        ))}
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  )
}

/**
 * Einfügestelle ZWISCHEN zwei Gliederungspunkten (Paket 6): ein „+“, das beim Überfahren der
 * Lücke erscheint – am Tablet (ohne Maus) steht es dauernd da (app.css, `.einfuege-stelle`).
 * In der Gliederung geht das, anders als im Editor: Dort gibt es keinen Seitenumbruch, den ein
 * zusätzlicher Streifen verschieben könnte.
 */
export function EinfuegeStelle({ position, onWaehlen }: { position: number; onWaehlen: (typ: WsBlockType) => void }): React.JSX.Element {
  return (
    <div className="einfuege-stelle">
      <Menu shadow="md" position="bottom">
        <Menu.Target>
          <Tooltip label="Baustein hier einfügen">
            <ActionIcon size="sm" radius="xl" variant="light" aria-label={`Baustein an Stelle ${position + 1} einfügen`}>
              <IconPlus size={14} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Baustein an dieser Stelle einfügen</Menu.Label>
          {Object.entries(BLOCK_LABELS).map(([typ, label]) => (
            <Menu.Item key={typ} onClick={() => onWaehlen(typ as WsBlockType)}>
              {label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}
