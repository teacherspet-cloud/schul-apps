/**
 * Einstellungen › Material (09.10.2026, Entscheidung des Admins): was bis dahin im Menü „Daten und Material"
 * stand und keine eigene App braucht.
 *  - Themenbereiche: Materialien aller Programme je Fach (die übergreifende Seite „themen").
 *  - Eigenes Material sichern: führt zur Sicherung im Reiter Wartung (nur am Rechner – im Netz gibt es sie nicht).
 * Die Freigaben der Fachschaft stehen seitdem in der Bibliothek jeder App (shared/components/Fachordner.tsx).
 */
import { Button, Card, Group, Text, Title } from '@mantine/core'
import { IconDeviceFloppy, IconFolders } from '@tabler/icons-react'
import { openSettings, openThemen } from '../shared/navigation'
import { imNetz } from '../shared/netzZugang'

export function ThemenbereicheCard(): React.JSX.Element {
  return (
    <Card withBorder padding="lg" data-einstellungen-themen>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Title order={4}>Themenbereiche</Title>
          <Text size="sm" c="dimmed">
            Materialien aller Programme je Fach in Themenbereichen – etwa „Ökologie" mit Arbeitsblättern, Kontrollen und Tests.
          </Text>
        </div>
        <Button variant="light" leftSection={<IconFolders size={16} />} onClick={() => openThemen()}>
          Öffnen
        </Button>
      </Group>
    </Card>
  )
}

export function EigenesMaterialSichernCard(): React.JSX.Element | null {
  if (imNetz()) return null
  return (
    <Card withBorder padding="lg" data-einstellungen-sicherung>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Title order={4}>Eigenes Material sichern</Title>
          <Text size="sm" c="dimmed">
            Alles Material als Sicherungsdatei, etwa auf einem USB-Stick – und eine Sicherung wieder einlesen.
          </Text>
        </div>
        <Button variant="light" leftSection={<IconDeviceFloppy size={16} />} onClick={() => openSettings('wartung')}>
          Zur Sicherung
        </Button>
      </Group>
    </Card>
  )
}
