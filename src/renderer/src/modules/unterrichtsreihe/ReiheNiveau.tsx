/**
 * Niveau der Reihe (08.10.2026, wie beim Arbeitsblatt): Anspruch und Sprache relativ zum Jahrgang (StufenWahl des
 * Arbeitsblatts, didactics/schwierigkeit.ts) und die Zahl der Niveaustufen. Im Fenster „Mit KI planen" und im Kopf der
 * Reihe; gilt als Vorgabe für die Planung und für alle Schritte (grundlage.ts `schrittNiveau`).
 */
import { Group, SegmentedControl, Stack, Text } from '@mantine/core'
import type { ReiheNiveau } from '@shared/reihe'
import StufenWahl from '../arbeitsblatt/steps/StufenWahl'
import { niveauVon } from './planungDidaktik'

export function NiveauWahl({
  niveau,
  setze,
  hinweis = false
}: {
  niveau: ReiheNiveau | undefined
  setze: (n: ReiheNiveau) => void
  /** Erläuterung der Stufen unter der Wahl */
  hinweis?: boolean
}): React.JSX.Element {
  const n = niveauVon({ niveau })
  return (
    <Stack gap={6} data-reihe-niveau>
      <StufenWahl titel="Niveau der Reihe" value={{ anspruch: n.anspruch, sprache: n.sprache }} onChange={(s) => setze({ ...n, ...s })} hinweis={hinweis} />
      <Group gap="xs" align="center">
        <Text size="xs" c="dimmed">
          Niveaustufen der Arbeitsblätter
        </Text>
        <SegmentedControl
          size="xs"
          data={[
            { value: '1', label: 'ein Niveau' },
            { value: '2', label: '★ / ★★' },
            { value: '3', label: '★ / ★★ / ★★★' }
          ]}
          value={String(n.stufen)}
          onChange={(v) => setze({ ...n, stufen: Number(v) as 1 | 2 | 3 })}
          aria-label="Niveaustufen"
          data-reihe-stufen
        />
      </Group>
    </Stack>
  )
}
