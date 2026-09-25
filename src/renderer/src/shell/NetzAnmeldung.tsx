import { Alert, Button, Card, Center, PinInput, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle, IconDeviceTablet } from '@tabler/icons-react'
import { useState } from 'react'
import { anmelden } from '../shared/netzZugang'

/**
 * Die PIN-Abfrage, wenn die Oberfläche aus dem Netz geöffnet wird.
 *
 * Steht VOR der App: Ohne Anmeldung wird ohnehin jeder Aufruf abgewiesen; dann lieber
 * einmal klar nach der PIN fragen, als die Oberfläche mit lauter Fehlermeldungen zeigen.
 *
 * Die PIN steht am Rechner unter Einstellungen → Netzwerk. Nach zehn Fehlversuchen sperrt
 * der Server – das steht hier, damit niemand ratlos weiterprobiert.
 */
export default function NetzAnmeldung({ onFertig }: { onFertig: () => void | Promise<void> }): React.JSX.Element {
  const [pin, setPin] = useState('')
  const [fehler, setFehler] = useState('')
  const [busy, setBusy] = useState(false)

  const senden = async (wert: string): Promise<void> => {
    setBusy(true)
    setFehler('')
    try {
      await anmelden(wert)
      // Abwarten: `onFertig` holt die Einstellungen nach. Ohne das Warten steht die
      // PIN-Karte kurz wieder auf „bereit", waehrend im Hintergrund noch geladen wird.
      await onFertig()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Center h="100vh" p="md">
      <Card withBorder padding="xl" style={{ maxWidth: 420, width: '100%' }}>
        <Stack gap="md" align="center">
          <IconDeviceTablet size={36} opacity={0.6} />
          <Title order={3}>Schul-Apps</Title>
          <Text size="sm" c="dimmed" ta="center">
            Dieses Gerät greift über das Netz auf deinen Rechner zu. Gib einmalig die PIN ein, die dort unter <b>Einstellungen → Netzwerk</b> steht.
          </Text>
          <PinInput
            length={6}
            type="number"
            size="lg"
            value={pin}
            onChange={setPin}
            onComplete={(v) => void senden(v)}
            disabled={busy}
            aria-label="PIN"
            autoFocus
          />
          {fehler && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />} w="100%">
              {fehler}
            </Alert>
          )}
          <Button fullWidth loading={busy} disabled={pin.length < 6} onClick={() => void senden(pin)}>
            Anmelden
          </Button>
          <Text size="xs" c="dimmed" ta="center">
            Gerechnet wird auf deinem Rechner. Er muss eingeschaltet sein und das Programm geöffnet haben.
          </Text>
        </Stack>
      </Card>
    </Center>
  )
}
