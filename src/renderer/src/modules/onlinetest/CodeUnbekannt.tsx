/**
 * Unbekannter Code (09.10.2026, Befund der Lehrkraft): Wer einen falschen Code eintippte, landete auf der Seite eines
 * Onlinetests und sollte Vor- und Nachnamen eingeben – als gäbe es den Code. Jetzt sagt die jeweilige Code-Seite, dass
 * der Code nicht erkannt wurde. Nach dem Namen fragt nur noch ein gültiger Code mit offenem Zugang.
 */
import { Alert, Button, Text } from '@mantine/core'

export const CODE_UNBEKANNT = 'Diesen Code kennen wir nicht – bitte genau prüfen.'

export function CodeUnbekannt({ zurueck = true }: { zurueck?: boolean }): React.JSX.Element {
  return (
    <Alert color="orange" variant="light" data-code-unbekannt>
      <Text fw={600}>{CODE_UNBEKANNT}</Text>
      <Text size="sm" c="dimmed" mt={4}>
        Stimmt der Code, ist die Freigabe vielleicht schon beendet – dann bei der Lehrkraft nachfragen.
      </Text>
      {zurueck && (
        <Button component="a" href="/s/" variant="light" color="orange" size="sm" mt="sm" data-code-neu-eingeben>
          Code neu eingeben
        </Button>
      )}
    </Alert>
  )
}
