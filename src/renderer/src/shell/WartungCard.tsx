import { Alert, Button, Card, Group, List, Modal, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconAlertTriangle, IconDeviceFloppy, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { notifyError, notifySuccess } from '../shared/util'
import SicherungEinlesen from './SicherungEinlesen'
import { SchulQuellen } from './Schulsuche'
import { useAppSettings } from '../shared/settingsStore'

/**
 * Sichern und Zurücksetzen.
 *
 * Wunsch der Lehrkraft (25.09.2026): ein Knopf, „mit dem man nach einer Warnung alle
 * Einstellungen und Inhalte, die bisher erstellt wurden, löscht und die Hauptapp auf
 * Werkszustand zurücksetzt."
 *
 * Drei Entscheidungen aus der Rücksprache stecken in dieser Oberfläche:
 *
 * - Die Warnung ZÄHLT AUF, was verschwindet – und zwar mit der tatsächlichen Zahl der Dateien,
 *   nicht als allgemeiner Satz. Wer liest „37 Arbeitsblätter", überlegt anders als bei „alle
 *   Inhalte".
 * - Eine Sicherung wird angeboten, aber nicht erzwungen.
 * - Der Knopf wird erst scharf, wenn das Wort eingetippt ist. Bei etwas Unumkehrbarem ist ein
 *   zweiter Klick zu wenig Abstand.
 */

/** Was beim Zurücksetzen verschwindet – in der Sprache der Lehrkraft, nicht in Ordnernamen. */
const NAMEN: Record<string, string> = {
  arbeitsblaetter: 'Arbeitsblätter',
  vokabeltests: 'Vokabeltests',
  klassenarbeiten: 'Klassenarbeiten',
  grammatiktests: 'Grammatiktests',
  lernzielkontrollen: 'Lernzielkontrollen',
  piktogramme: 'eigene Piktogramme',
  hoertexte: 'erzeugte Hörtexte'
}

const BESTAETIGUNG = 'ZURÜCKSETZEN'

export default function WartungCard(): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [bestand, setBestand] = useState<{ ordner: string; eintraege: number }[]>([])
  const [wort, setWort] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    if (!offen) return
    setWort('')
    window.api.wartung.bestand().then(setBestand).catch(notifyError)
  }, [offen])

  const sichern = async (): Promise<void> => {
    try {
      const { name, daten } = await window.api.wartung.sicherung()
      const pfad = await window.api.files.save(name, [{ name: 'Sicherung', extensions: ['json'] }], daten)
      if (pfad) {
        notifySuccess('Sicherung gespeichert.')
        // Für die Erinnerung auf der Startseite („letzte Sicherung vor … Tagen")
        await useAppSettings.getState().update({ letzteSicherung: new Date().toISOString() })
      }
    } catch (e) {
      notifyError(e, 'Die Sicherung konnte nicht erstellt werden')
    }
  }

  const zuruecksetzen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      await window.api.wartung.zuruecksetzen()
      /*
       * Neu laden statt Zustand aufräumen: Nach dem Löschen zeigen alle Programme noch ihre
       * alten Daten aus dem Arbeitsspeicher. Ein Neustart der Oberfläche ist der einzige
       * Weg, der garantiert nichts übrig lässt – und er führt gleich in den
       * Einrichtungsassistenten.
       */
      window.location.reload()
    } catch (e) {
      notifyError(e, 'Das Zurücksetzen ist fehlgeschlagen')
      setLaeuft(false)
    }
  }

  return (
    <Stack gap="lg">
      <Card withBorder padding="lg">
        <Title order={4} mb="xs">
          Sicherung
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Schreibt alle erstellten Materialien samt Themenbereichen, die Einstellungen und das Logo in eine einzige Datei. Die Zugänge zur KI bleiben aus
          Sicherheitsgründen draußen – sie stünden in der Datei im Klartext.
        </Text>
        <Group>
          <Button variant="light" leftSection={<IconDeviceFloppy size={16} />} onClick={() => void sichern()}>
            Sicherung speichern …
          </Button>
          <SicherungEinlesen />
        </Group>
      </Card>

      {/* Quellenvermerk der mitgelieferten Daten (Paket 13) – die Lizenzen verlangen die Namensnennung */}
      <Card withBorder padding="lg" data-quellen-karte>
        <Title order={4} mb="xs">
          Quellen und Lizenzen
        </Title>
        <SchulQuellen />
      </Card>

      <Card withBorder padding="lg" style={{ borderColor: 'var(--mantine-color-red-5)' }}>
        <Title order={4} mb="xs" c="red">
          Auf Werkszustand zurücksetzen
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Löscht alle erstellten Materialien, die Einstellungen, das Logo und die Zugänge. Danach startet die Einrichtung von vorn.
        </Text>
        <Alert variant="light" color="green" mb="md">
          <Text size="sm">
            <b>Vokabellisten und Lehrwerke bleiben erhalten.</b> Sie sind über Jahre gewachsen und lassen sich nicht wiederbeschaffen – deshalb rührt das
            Zurücksetzen sie nicht an.
          </Text>
        </Alert>
        <Button color="red" leftSection={<IconTrash size={16} />} onClick={() => setOffen(true)}>
          Zurücksetzen …
        </Button>
      </Card>

      <Modal opened={offen} onClose={() => setOffen(false)} title="Wirklich auf Werkszustand zurücksetzen?" size="lg">
        <Stack gap="md">
          <Alert variant="light" color="red" icon={<IconAlertTriangle size={18} />} title="Das lässt sich nicht rückgängig machen">
            <Text size="sm">Gelöscht werden:</Text>
            <List size="sm" mt={6}>
              {bestand.map((b) => (
                <List.Item key={b.ordner}>
                  <b>{b.eintraege}</b> {NAMEN[b.ordner] ?? b.ordner}
                </List.Item>
              ))}
              <List.Item>Schulname, Bundesland, Schulform, Logo und Farbschema</List.Item>
              <List.Item>eigene Designvorlagen</List.Item>
              <List.Item>die hinterlegten KI-Zugänge</List.Item>
            </List>
            <Text size="sm" mt="sm">
              Erhalten bleiben: <b>Vokabellisten und Lehrwerke</b>.
            </Text>
          </Alert>

          <Text size="sm">
            Sollen die Materialien erhalten bleiben, vorher sichern. Die Sicherung lässt sich danach im Einrichtungsassistenten oder hier wieder einlesen.
          </Text>
          <Group>
            <Button variant="light" leftSection={<IconDeviceFloppy size={16} />} onClick={() => void sichern()}>
              Vorher sichern …
            </Button>
          </Group>

          <TextInput
            label={`Zum Fortfahren ${BESTAETIGUNG} eingeben`}
            placeholder={BESTAETIGUNG}
            value={wort}
            onChange={(e) => setWort(e.currentTarget.value)}
            data-autofocus
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
            <Button color="red" disabled={wort.trim().toUpperCase() !== BESTAETIGUNG} loading={laeuft} onClick={() => void zuruecksetzen()}>
              Endgültig zurücksetzen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
