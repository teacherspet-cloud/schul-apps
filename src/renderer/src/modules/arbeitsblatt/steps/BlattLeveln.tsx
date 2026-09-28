import { Button, Group, Select, Stack, Text } from '@mantine/core'
import { IconAdjustmentsHorizontal } from '@tabler/icons-react'
import { useState } from 'react'
import { GER_STUFEN, inZielsprache, levelAnweisung, levelbar, levelTitel, type LevelArt } from '../generation/leveln'
import type { WorksheetMeta, WsBlock } from '../model/types'

/**
 * „Alle Lesetexte leveln" in den Blattoptionen (Großprogramm 0.4, F1). Jeder Lesetext des
 * angezeigten Blattes bekommt eine neue Fassung; Originalquellen und Kästen bleiben unberührt.
 * Für eine zweite Niveaustufe desselben Blattes: erst das Blatt duplizieren, dann dort leveln.
 */
export default function BlattLeveln({
  bloecke,
  meta,
  onLeveln
}: {
  bloecke: WsBlock[]
  meta: Pick<WorksheetMeta, 'subjectId' | 'subjectLabel' | 'grade' | 'schoolTypeName' | 'cefrLevel'>
  onLeveln: (bloecke: WsBlock[], instruction: string) => void
}): React.JSX.Element | null {
  const texte = bloecke.filter((b) => b.type === 'text' && levelbar(b).ok)
  const zielsprache = texte.some((b) => inZielsprache(b, meta))
  const arten: LevelArt[] = zielsprache
    ? ['leichter', 'anspruchsvoller', ...GER_STUFEN.map((s) => `ger-${s}` as LevelArt)]
    : ['leichter', 'anspruchsvoller', 'einfach', 'leicht', 'glossar']
  const [art, setArt] = useState<LevelArt>('leichter')
  if (!texte.length) return null
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Alle Lesetexte leveln
      </Text>
      <Text size="xs" c="dimmed">
        {texte.length} Lesetext{texte.length === 1 ? '' : 'e'} auf diesem Blatt – jeder bekommt eine neue Fassung, die bisherige bleibt. Originalquellen bleiben
        unverändert.
      </Text>
      <Group gap="xs" align="flex-end">
        <Select
          size="xs"
          style={{ flex: 1 }}
          data={arten.map((a) => ({ value: a, label: levelTitel(a) }))}
          value={art}
          onChange={(v) => v && setArt(v as LevelArt)}
          allowDeselect={false}
          aria-label="Niveau"
        />
        <Button size="xs" variant="light" leftSection={<IconAdjustmentsHorizontal size={14} />} onClick={() => onLeveln(texte, levelAnweisung(art, meta))}>
          Leveln
        </Button>
      </Group>
    </Stack>
  )
}
