import { Menu, Tooltip } from '@mantine/core'
import { IconAdjustmentsHorizontal, IconBook2 } from '@tabler/icons-react'
import { GER_STUFEN, levelAnweisung, levelbar, levelTitel, inZielsprache, type LevelArt } from '../generation/leveln'
import type { WorksheetMeta, WsBlock } from '../model/types'

/**
 * „Leveln" im KI-Menü eines Bausteins (Großprogramm 0.4, F1): leichter, anspruchsvoller, Einfache
 * oder Leichte Sprache, GER-Stufe (Fremdsprachen), Worterklärungen für DaZ. Jede Wahl läuft als
 * „Mit KI überarbeiten" – das Ergebnis ist eine neue Fassung, die alte bleibt.
 */
export default function LevelnMenue({
  block,
  meta,
  onRevise
}: {
  block: WsBlock
  meta: Pick<WorksheetMeta, 'subjectId' | 'subjectLabel' | 'grade' | 'schoolTypeName' | 'cefrLevel'>
  onRevise: (instruction: string) => void
}): React.JSX.Element | null {
  if (block.type !== 'text' && block.type !== 'infoBox') return null
  const pruefung = levelbar(block)
  if (!pruefung.ok)
    return (
      <Tooltip label={pruefung.grund} position="left" multiline w={260}>
        <div>
          <Menu.Item leftSection={<IconAdjustmentsHorizontal size={14} />} disabled>
            Leveln
          </Menu.Item>
        </div>
      </Tooltip>
    )
  const arten: LevelArt[] = inZielsprache(block, meta)
    ? ['leichter', 'anspruchsvoller', ...GER_STUFEN.map((s) => `ger-${s}` as LevelArt)]
    : ['leichter', 'anspruchsvoller', 'einfach', 'leicht']
  return (
    <>
      <Menu.Sub position="left-start">
        <Menu.Sub.Target>
          <Menu.Sub.Item leftSection={<IconAdjustmentsHorizontal size={14} />}>Leveln</Menu.Sub.Item>
        </Menu.Sub.Target>
        <Menu.Sub.Dropdown>
          <Menu.Label>Neue Fassung – die bisherige bleibt</Menu.Label>
          {arten.map((art) => (
            <Menu.Item key={art} onClick={() => onRevise(levelAnweisung(art, meta))} data-leveln={art}>
              {levelTitel(art)}
            </Menu.Item>
          ))}
        </Menu.Sub.Dropdown>
      </Menu.Sub>
      {block.type === 'text' && !inZielsprache(block, meta) && (
        <Menu.Item leftSection={<IconBook2 size={14} />} onClick={() => onRevise(levelAnweisung('glossar', meta))} data-leveln="glossar">
          {levelTitel('glossar')}
        </Menu.Item>
      )}
    </>
  )
}
