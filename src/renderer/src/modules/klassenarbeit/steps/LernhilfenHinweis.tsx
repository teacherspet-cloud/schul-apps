import { Alert, Button, Group, Text } from '@mantine/core'
import { IconWand, IconWriting } from '@tabler/icons-react'
import type { Hilfenbefund } from '../model/lernhilfen'

/**
 * Hinweis über einer bestehenden Arbeit (01.10.2026): Teilpunkte stehen als Teilaufgaben oder als
 * Aufzählung in der Aufgabe – auf dem Schülerblatt, obwohl die Hilfen für Lernende aus sind.
 * „Vorschlag der App umsetzen" verschiebt sie in den Erwartungshorizont (Strg+Z nimmt es zurück).
 */
export default function LernhilfenHinweis({ befunde, onUmsetzen }: { befunde: Hilfenbefund[]; onUmsetzen: () => void }): React.JSX.Element | null {
  if (!befunde.length) return null
  const punkte = befunde.reduce((n, b) => n + b.anzahl, 0)
  return (
    <Alert
      color="yellow"
      icon={<IconWriting size={18} />}
      mb="md"
      p="xs"
      w="100%"
      maw={820}
      data-testid="lernhilfen-hinweis"
      title={befunde.length === 1 ? 'Hilfestellung in einer Aufgabe' : `Hilfestellungen in ${befunde.length} Aufgaben`}
    >
      <Text size="sm">
        {punkte} inhaltliche Teilpunkte stehen auf dem Schülerblatt (als Teilaufgaben oder Aufzählung). In Klassenarbeiten gehören sie in den Erwartungshorizont
        – die Aufgabe nennt Situation, Adressat und Auftrag im Fließtext.
      </Text>
      <Group mt="sm" gap="xs">
        <Button size="compact-sm" variant="light" leftSection={<IconWand size={14} />} data-testid="lernhilfen-umsetzen" onClick={onUmsetzen}>
          Vorschlag der App umsetzen
        </Button>
        <Text size="xs" c="dimmed">
          Die Teilpunkte wandern ins Lehrermaterial; die Aufgabe selbst bleibt.
        </Text>
      </Group>
    </Alert>
  )
}
