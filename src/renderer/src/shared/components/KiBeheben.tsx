import { Button, Tooltip } from '@mantine/core'
import { IconSparkles, IconWand } from '@tabler/icons-react'
import { useKiZugang } from '../useKiZugang'

/**
 * Die Knöpfe „Mit KI beheben" und „Alle beheben" (Paket 12) – überall gleich: an den Hinweisen
 * der Bausteine (Arbeitsblatt, Vokabeltest), in den Hinweisen zum Blatt, an den Befunden der
 * Lernzielkontrolle und in den Hinweiskästen von Grammatiktest und Klassenarbeit.
 *
 * Ein Klick startet einen Hintergrund-Auftrag (shared/auftraege.ts); das Ergebnis kommt als
 * ein Rückgängig-Schritt. Ohne KI-Zugang ist der Knopf gesperrt und sagt warum.
 */
export function KiBehebenKnopf({ onClick, laeuft, label = 'Mit KI beheben' }: { onClick: () => void; laeuft?: boolean; label?: string }): React.JSX.Element {
  const kiDa = useKiZugang()
  const knopf = (
    <Button
      size="compact-xs"
      variant="light"
      color="violet"
      leftSection={<IconSparkles size={12} />}
      loading={laeuft}
      disabled={!kiDa}
      onClick={onClick}
      // Neben langen Hinweistexten nicht zusammendrücken lassen
      style={{ flexShrink: 0 }}
      data-ki-beheben
    >
      {label}
    </Button>
  )
  return kiDa ? (
    knopf
  ) : (
    <Tooltip label="Zuerst einen KI-Zugang einrichten (Einstellungen › KI-Zugang)">
      <span style={{ flexShrink: 0 }}>{knopf}</span>
    </Tooltip>
  )
}

/** „Alle beheben": alle behebbaren Hinweise in EINEM Auftrag */
export function AlleBehebenKnopf({ anzahl, onClick, laeuft }: { anzahl: number; onClick: () => void; laeuft?: boolean }): React.JSX.Element | null {
  const kiDa = useKiZugang()
  if (anzahl < 2) return null
  return (
    <Button
      size="compact-xs"
      variant="filled"
      color="violet"
      leftSection={<IconWand size={12} />}
      loading={laeuft}
      disabled={!kiDa}
      title={kiDa ? undefined : 'Zuerst einen KI-Zugang einrichten'}
      onClick={onClick}
      data-alle-beheben
    >
      Alle beheben ({anzahl})
    </Button>
  )
}
