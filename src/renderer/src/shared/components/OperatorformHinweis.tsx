import { Alert, Button, Group, List, Text } from '@mantine/core'
import { IconWand, IconWriting } from '@tabler/icons-react'
import type { OperatorformBefund } from '../operatorformen'

/**
 * Hinweis über dem Blatt: Operatoren in falscher Satzstellung („Zusammenfassen Sie …" statt
 * „Fassen Sie … zusammen"), 01.10.2026. Läuft am angezeigten Blatt – so werden auch ältere oder
 * von Hand geänderte Materialien beim Öffnen erkannt. „Vorschlag der App umsetzen" korrigiert
 * alle Stellen in einem Schritt (Strg+Z nimmt es zurück), ohne KI und ohne Eingriff in den Inhalt.
 */
export default function OperatorformHinweis({
  befunde,
  onUmsetzen
}: {
  befunde: OperatorformBefund[]
  onUmsetzen: () => void
}): React.JSX.Element | null {
  if (!befunde.length) return null
  const gezeigt = befunde.slice(0, 6)
  return (
    <Alert
      color="yellow"
      icon={<IconWriting size={18} />}
      mb="md"
      p="xs"
      w="100%"
      maw={820}
      data-testid="operatorform-hinweis"
      title={befunde.length === 1 ? 'Satzstellung des Operators prüfen' : `Satzstellung der Operatoren prüfen (${befunde.length} Stellen)`}
    >
      <Text size="sm" mb={4}>
        Operatoren stehen als Imperativ; bei trennbaren Verben steht die Vorsilbe am Satzende („… zusammen", „… heraus").
      </Text>
      <List size="sm" spacing={2}>
        {gezeigt.map((b, i) => (
          <List.Item key={i}>
            {b.ort}: „{b.falsch}" → „{b.richtig}"
          </List.Item>
        ))}
      </List>
      {befunde.length > gezeigt.length && (
        <Text size="xs" c="dimmed" mt={4}>
          … und {befunde.length - gezeigt.length} weitere
        </Text>
      )}
      <Group mt="sm" gap="xs">
        <Button size="compact-sm" variant="light" leftSection={<IconWand size={14} />} data-testid="operatorform-umsetzen" onClick={onUmsetzen}>
          Vorschlag der App umsetzen
        </Button>
        <Text size="xs" c="dimmed">
          Nur die Stellung ändert sich, der Inhalt bleibt.
        </Text>
      </Group>
    </Alert>
  )
}
