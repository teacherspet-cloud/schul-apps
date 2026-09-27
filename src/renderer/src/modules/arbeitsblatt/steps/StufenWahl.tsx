import { Group, SegmentedControl, Text } from '@mantine/core'
import { SCHWIERIGKEITEN, SCHWIERIGKEIT_LABEL, type Schwierigkeit, type Stufe } from '../didactics/schwierigkeit'

/**
 * Zwei Wahlen je Blatt oder Fassung (Entscheidung der Lehrkraft, 27.09.2026): der ANSPRUCH
 * (Denkprozess, Offenheit, Hilfen, Anforderungsbereiche) und die SPRACHE (Satzlänge,
 * Lesbarkeit, Fachsprache) – beide relativ zum Jahrgang, „mittel" ist der Jahrgang selbst.
 */
export default function StufenWahl({
  titel,
  value,
  onChange,
  hinweis = true
}: {
  titel: string
  value: Stufe
  onChange: (s: Stufe) => void
  /** Erläuterung darunter – bei mehreren Wahlen nur einmal */
  hinweis?: boolean
}): React.JSX.Element {
  const daten = SCHWIERIGKEITEN.map((s) => ({ value: s, label: SCHWIERIGKEIT_LABEL[s] }))
  return (
    <div>
      <Text size="sm" fw={500} mb={4}>
        {titel}
      </Text>
      <Group gap="md" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed" mb={2}>
            Anspruch (Denkprozess, Offenheit, Hilfen)
          </Text>
          <SegmentedControl
            size="xs"
            data={daten}
            value={value.anspruch}
            onChange={(v) => onChange({ ...value, anspruch: v as Schwierigkeit })}
            aria-label={`${titel}: Anspruch`}
          />
        </div>
        <div>
          <Text size="xs" c="dimmed" mb={2}>
            Sprache (Satzlänge, Lesbarkeit, Fachsprache)
          </Text>
          <SegmentedControl
            size="xs"
            data={daten}
            value={value.sprache}
            onChange={(v) => onChange({ ...value, sprache: v as Schwierigkeit })}
            aria-label={`${titel}: Sprache`}
          />
        </div>
      </Group>
      {hinweis && (
        <Text size="xs" c="dimmed" mt={2}>
          „mittel" ist der Jahrgang, wie ihn das Lerngruppen-Profil beschreibt; die anderen Stufen verschieben Anforderungsbereiche, Satzlänge und Hilfen etwa
          um eine Klassenstufe. Nach der Erzeugung misst die App die Lesbarkeit der Texte nach und lässt Abweichungen umschreiben.
        </Text>
      )}
    </div>
  )
}
