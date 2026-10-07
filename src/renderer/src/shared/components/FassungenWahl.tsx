import { SegmentedControl, Stack, Text } from '@mantine/core'
import type { FassungsArt } from '../testFassungen'

/**
 * Fassungen A–D wählen (06.10.2026, Vorbild Vokabeltest) – gemeinsam für Grammatiktest und
 * Lernzielkontrolle. Ohne `art` nur die Zahl (unregelmäßige Verben: andere Verben aus der Liste).
 */
export default function FassungenWahl({
  anzahl,
  onAnzahl,
  art,
  onArt,
  kiText = 'andere Sätze (KI)',
  hinweis
}: {
  anzahl: number
  onAnzahl: (n: 1 | 2 | 3 | 4) => void
  art?: FassungsArt
  onArt?: (art: FassungsArt) => void
  /** Bezeichnung des KI-Wegs */
  kiText?: string
  /** Zeile unter der Wahl, z. B. was der KI-Weg kostet */
  hinweis?: string
}): React.JSX.Element {
  return (
    <Stack gap={4} data-fassungen-wahl>
      <Text size="sm" fw={500}>
        Fassungen
      </Text>
      <SegmentedControl
        fullWidth
        size="xs"
        value={String(Math.min(4, Math.max(1, anzahl)))}
        onChange={(v) => onAnzahl(Number(v) as 1 | 2 | 3 | 4)}
        data={[
          { value: '1', label: 'eine' },
          { value: '2', label: 'A / B' },
          { value: '3', label: 'A – C' },
          { value: '4', label: 'A – D' }
        ]}
        data-fassungen
      />
      {anzahl > 1 && onArt && (
        <SegmentedControl
          fullWidth
          size="xs"
          value={art ?? 'parallel'}
          onChange={(v) => onArt(v as FassungsArt)}
          data={[
            { value: 'parallel', label: kiText },
            { value: 'umgestellt', label: 'umgestellt (ohne KI)' }
          ]}
          data-fassungs-art
        />
      )}
      {anzahl > 1 && (
        <Text size="xs" c="dimmed">
          {art === 'umgestellt' && onArt
            ? 'Dieselben Aufgaben; Antwortoptionen, Zuordnungen und Einzelsätze stehen in anderer Reihenfolge. Sofort fertig, ohne weitere KI-Anfrage.'
            : hinweis ?? 'Gleiche Aufgabentypen und Punkte, andere Sätze und Beispiele.'}
        </Text>
      )}
    </Stack>
  )
}
