/**
 * Daten und Material (03.10.2026): was früher auf der Startseite stand – Freigaben der Fachschaften,
 * Themenbereiche über alle Programme – und die Sicherung des eigenen Materials. Seit dem Wunsch
 * „Kombiniere das Menü Verwaltung mit dem Menü Datenverwaltung" Teil der App „Verwaltung": für
 * Lehrkräfte die ganze App, für Admins der erste Reiter neben Nutzern, KI-Zugängen usw.
 */
import { Button, Card, Container, Group, Stack, Text, Title } from '@mantine/core'
import { IconDeviceFloppy, IconFolders } from '@tabler/icons-react'
import { FachordnerKarte } from '../../shared/components/Fachordner'
import { openSettings, openThemen } from '../../shared/navigation'
import { aufServer } from '../../shared/plattform'
import { imNetz } from '../../shared/netzZugang'

export default function VerwaltungLehrkraft(): React.JSX.Element {
  return (
    <Container size="lg" py="lg">
      <Title order={2} mb="md">
        Verwaltung
      </Title>
      <DatenUndMaterial />
    </Container>
  )
}

export function DatenUndMaterial(): React.JSX.Element {
  return (
    <Stack gap="lg" data-datenverwaltung>
      <>
        {/* Freigaben der Fachschaften (Server) */}
        {aufServer() && <FachordnerKarte />}
        <Card withBorder padding="md" radius="md">
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text fw={700}>Themenbereiche</Text>
              <Text size="sm" c="dimmed">
                Materialien aller Programme je Fach in Themenbereichen – etwa „Ökologie" mit Arbeitsblättern, Kontrollen und Tests.
              </Text>
            </div>
            <Button variant="light" leftSection={<IconFolders size={16} />} onClick={() => openThemen()}>
              Öffnen
            </Button>
          </Group>
        </Card>
        {!imNetz() && (
          <Card withBorder padding="md" radius="md">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={700}>Sicherung</Text>
                <Text size="sm" c="dimmed">
                  Alles Material als Sicherungsdatei, etwa auf einem USB-Stick – und eine Sicherung wieder einlesen.
                </Text>
              </div>
              <Button variant="light" leftSection={<IconDeviceFloppy size={16} />} onClick={() => openSettings('wartung')}>
                Zur Sicherung
              </Button>
            </Group>
          </Card>
        )}
      </>
    </Stack>
  )
}
