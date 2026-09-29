import { Alert, Checkbox, Stack, Text } from '@mantine/core'
import { IconScale } from '@tabler/icons-react'
import { RECHTSHINWEIS_ABSAETZE, RECHTSHINWEIS_BESTAETIGUNG, RECHTSHINWEIS_FUSS, RECHTSHINWEIS_TITEL } from './rechtshinweisTexte'

/**
 * Rechtshinweis mit Bestätigungs-Häkchen (29.09.2026) – vor JEDEM Import, der Verlagsmaterial
 * an die KI schickt. Das Häkchen gehört dem aufrufenden Dialog (kein gespeicherter Zustand):
 * Bei jedem neuen Import steht es wieder leer da.
 */
export default function Rechtshinweis({ bestaetigt, onChange }: { bestaetigt: boolean; onChange: (an: boolean) => void }): React.JSX.Element {
  return (
    <Alert color="yellow" variant="light" icon={<IconScale size={18} />} title={RECHTSHINWEIS_TITEL}>
      <Stack gap={6}>
        {RECHTSHINWEIS_ABSAETZE.map((a) => (
          <Text key={a.slice(0, 24)} size="xs">
            {a}
          </Text>
        ))}
        <Checkbox
          mt={4}
          size="sm"
          checked={bestaetigt}
          onChange={(e) => onChange(e.currentTarget.checked)}
          label={RECHTSHINWEIS_BESTAETIGUNG}
          data-testid="rechtshinweis-bestaetigt"
        />
        <Text size="xs" c="dimmed">
          {RECHTSHINWEIS_FUSS}
        </Text>
      </Stack>
    </Alert>
  )
}
