/**
 * Einstellungen › „Vertrauliche Hinweise" (23.10.2026, Prüfung des Schulträgers, Meldeweg nach § 4 KKG – krise.ts):
 * Lehrkräfte und Vertrauenspersonen schalten hier freiwillig eine Benachrichtigung auf diesem Gerät ein. Sie kommt
 * sofort bei einem neuen Hinweis und einmal nach 24 Stunden, wenn ihn noch niemand gesehen hat – immer ohne Namen und
 * ohne Inhalt. Unabhängig davon zeigt die Startseite einen roten Punkt. Nur am Server.
 */
import { Alert, Button, Card, Group, Switch, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { senden } from '../modules/onlinetest/serverApi'
import { notifyError } from '../shared/util'
import { krisenPushAn, krisenPushAusschalten, krisenPushEinschalten, pushUnterstuetzung } from './krisenPush'

const GRUND: Record<string, string> = {
  'ios-browser': 'Auf iPhone und iPad gehen Benachrichtigungen nur in der Web-App vom Home-Bildschirm (ab iOS 16.4).',
  'ios-alt': 'Dieses iPhone/iPad unterstützt noch keine Benachrichtigungen (ab iOS 16.4).',
  unsicher: 'Benachrichtigungen brauchen eine sichere Verbindung (https).',
  keine: 'Dieser Browser unterstützt keine Benachrichtigungen.',
  gesperrt: 'Benachrichtigungen sind für diese Seite im Browser gesperrt und lassen sich dort in den Einstellungen erlauben.'
}

export default function KrisenPushKarte(): React.JSX.Element {
  const [an, setAn] = useState<boolean | null>(null)
  const [arbeitet, setArbeitet] = useState(false)
  const [fehler, setFehler] = useState('')
  const lage = pushUnterstuetzung()

  useEffect(() => {
    let aktiv = true
    void krisenPushAn().then((x) => aktiv && setAn(x))
    return () => {
      aktiv = false
    }
  }, [])

  const umschalten = async (ein: boolean): Promise<void> => {
    setArbeitet(true)
    setFehler('')
    try {
      if (ein) {
        const f = await krisenPushEinschalten()
        if (f) setFehler(f)
        else setAn(true)
      } else {
        await krisenPushAusschalten()
        setAn(false)
      }
    } catch (e) {
      notifyError(e)
    } finally {
      setArbeitet(false)
    }
  }

  return (
    <Card withBorder padding="lg" data-krisen-push>
      <Title order={4} mb={4}>
        Vertrauliche Hinweise
      </Title>
      <Text size="sm" c="dimmed" mb="sm">
        Benachrichtigung auf diesem Gerät, sobald ein vertraulicher Hinweis eingeht (Kind hat etwas zu Not oder Selbstgefährdung geäußert), und einmal
        nach 24 Stunden, falls ihn noch niemand gesehen hat. Die Benachrichtigung enthält weder Namen noch Inhalt. Der Hinweis selbst steht auf der
        Startseite (roter Punkt).
      </Text>
      {lage !== 'ok' && lage !== 'gesperrt' ? (
        <Text size="sm">{GRUND[lage]}</Text>
      ) : (
        <Group gap="sm">
          <Switch
            checked={Boolean(an)}
            disabled={an === null || arbeitet}
            onChange={(e) => void umschalten(e.currentTarget.checked)}
            label="Benachrichtigung auf diesem Gerät"
            data-krisen-push-schalter
          />
          {an && (
            <Button
              size="compact-sm"
              variant="light"
              onClick={() =>
                void senden<{ gesendet: number }>('/server/krisen/test').then(
                  (r) => !r.gesendet && setFehler('Die Test-Benachrichtigung kam beim Push-Dienst nicht an.'),
                  notifyError
                )
              }
            >
              Test senden
            </Button>
          )}
        </Group>
      )}
      {(fehler || lage === 'gesperrt') && (
        <Alert color="orange" variant="light" mt="sm">
          {fehler || GRUND.gesperrt}
        </Alert>
      )}
    </Card>
  )
}
