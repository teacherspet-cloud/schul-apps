import { Group, SegmentedControl, Text } from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import type { PageLimit } from '../model/types'
import { pageLimitMin } from '../render/useTestLayout'

const seiten = (v: string | number): number => Math.max(1, Math.min(10, Math.round(Number(v) || 1)))

/**
 * Seitenumfang je Test: automatisch, höchstens, genau oder von–bis.
 *
 * Eine Komponente für Testeinstellungen und Editor („Kopf & Format"), damit beide dasselbe
 * anbieten. Die Spanne kam mit Paket 7 dazu (Wunsch der Lehrkraft: „2–3 Seiten").
 */
export default function SeitenVorgabe({
  limit,
  onChange,
  size = 'sm'
}: {
  limit: PageLimit
  onChange: (next: PageLimit) => void
  size?: 'xs' | 'sm'
}): React.JSX.Element {
  const min = pageLimitMin(limit)
  const setMode = (mode: PageLimit['mode']): void => {
    if (mode === 'range') {
      // Aus „höchstens 2" wird „1–2", aus „genau 1" wird „1–2"
      const bis = Math.max(limit.pages, 2)
      onChange({ mode, pages: bis, pagesMin: Math.min(limit.pages, bis - 1) })
    } else onChange({ mode, pages: limit.pages })
  }
  return (
    <Group gap="sm" align="center" wrap="wrap">
      <SegmentedControl
        size={size}
        aria-label="Seitenumfang je Test"
        data={[
          { value: 'auto', label: 'automatisch' },
          { value: 'max', label: 'höchstens' },
          { value: 'exact', label: 'genau' },
          { value: 'range', label: 'von–bis' }
        ]}
        value={limit.mode}
        onChange={(v) => setMode(v as PageLimit['mode'])}
      />
      {limit.mode === 'range' ? (
        <Group gap={6} align="center" wrap="nowrap">
          <ZahlFeld
            size={size}
            aria-label="Seiten von"
            min={1}
            max={9}
            w={64}
            value={min}
            onChange={(v) => {
              const von = seiten(v)
              onChange({ mode: 'range', pagesMin: von, pages: Math.max(limit.pages, von + 1) })
            }}
          />
          <Text size={size}>bis</Text>
          <ZahlFeld
            size={size}
            aria-label="Seiten bis"
            min={2}
            max={10}
            w={64}
            value={limit.pages}
            onChange={(v) => {
              const bis = Math.max(2, seiten(v))
              onChange({ mode: 'range', pages: bis, pagesMin: Math.min(min, bis - 1) })
            }}
          />
          <Text size={size}>Seiten</Text>
        </Group>
      ) : (
        limit.mode !== 'auto' && (
          <Group gap={6} align="center" wrap="nowrap">
            <ZahlFeld
              size={size}
              aria-label="Anzahl Seiten"
              min={1}
              max={10}
              w={64}
              value={limit.pages}
              onChange={(v) => onChange({ ...limit, pages: seiten(v) })}
            />
            <Text size={size}>{limit.pages === 1 ? 'Seite' : 'Seiten'}</Text>
          </Group>
        )
      )}
    </Group>
  )
}
