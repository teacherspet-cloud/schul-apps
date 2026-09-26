import { Alert, Group, List, Text } from '@mantine/core'
import { AlleBehebenKnopf, KiBehebenKnopf } from './KiBeheben'
import { IconMessageCircle } from '@tabler/icons-react'
import type { Sheet, WorksheetMeta } from '../../modules/arbeitsblatt/model/types'
import { checkAnrede } from '../../modules/arbeitsblatt/didactics/anrede'

/**
 * Befunde der Anrede-Prüfung für die angezeigten Blätter (Paket 8b).
 *
 * Mit mehreren Fassungen (Klassenarbeit A/B) steht der Name der Fassung davor – sonst
 * fände die Lehrkraft „Aufgabe 2" in der falschen Fassung.
 */
export function anredeBefunde(meta: WorksheetMeta, sheets: Sheet[]): string[] {
  return sheets.flatMap((s) => checkAnrede(s, meta).map((w) => (sheets.length > 1 ? `${s.label}, ${w.message}` : w.message)))
}

/**
 * Hinweis über dem Blatt, wenn die Anrede der Lernenden nicht zur Stufe passt.
 *
 * Grammatiktest und Klassenarbeit zeigen keine Hinweise an den Bausteinen wie das
 * Arbeitsblatt. Die Prüfung läuft deshalb hier, am angezeigten Blatt – so erfasst sie auch,
 * was nach dem Erzeugen überarbeitet oder von Hand geändert wurde. Die App ändert nichts von
 * selbst, weil ein automatisch umgeformter Satz leicht schief wird – seit Paket 12 aber auf
 * Knopfdruck („Mit KI beheben"): Die KI formuliert die Stelle im Zusammenhang um.
 */
export default function AnredeHinweise({
  befunde,
  onBeheben,
  laeuft
}: {
  befunde: string[]
  /** „Mit KI beheben" (Paket 12): formuliert die genannten Stellen in der richtigen Anrede um */
  onBeheben?: (befunde: string[]) => void
  laeuft?: boolean
}): React.JSX.Element | null {
  if (!befunde.length) return null
  const gezeigt = befunde.slice(0, 8)
  return (
    <Alert
      color="yellow"
      icon={<IconMessageCircle size={18} />}
      mb="md"
      p="xs"
      title={befunde.length === 1 ? 'Anrede prüfen' : `Anrede prüfen (${befunde.length} Stellen)`}
    >
      <Text size="sm" mb={4}>
        Regel: In der Sekundarstufe I werden die Lernenden geduzt, in der Sekundarstufe II gesiezt. Zitate und Material bleiben unberührt; geändert wird nur auf
        Knopfdruck.
      </Text>
      <List size="sm" spacing={2}>
        {gezeigt.map((b, i) => (
          <List.Item key={i}>
            <Group gap="xs" wrap="nowrap" align="flex-start" data-hinweis>
              <span>{b}</span>
              {onBeheben && <KiBehebenKnopf laeuft={laeuft} onClick={() => onBeheben([b])} />}
            </Group>
          </List.Item>
        ))}
      </List>
      {onBeheben && (
        <Group justify="flex-end" mt={6}>
          <AlleBehebenKnopf anzahl={befunde.length} laeuft={laeuft} onClick={() => onBeheben(befunde)} />
        </Group>
      )}
      {befunde.length > gezeigt.length && (
        <Text size="xs" c="dimmed" mt={4}>
          … und {befunde.length - gezeigt.length} weitere
        </Text>
      )}
    </Alert>
  )
}
