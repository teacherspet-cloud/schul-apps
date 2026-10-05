import { Card, List, Switch, Text, Title } from '@mantine/core'
import { IconFolder } from '@tabler/icons-react'
import type { AppSettings, DeepPartial } from '@shared/types'

/**
 * Ablage auf dem iPad (30.09.2026) – nur in der iPad-App, in den Einstellungen (Reiter „Material")
 * und als Schritt des Einrichtungsassistenten.
 *
 * Eingeschaltet (Standard) landet jede ausgegebene Datei geordnet in der Dateien-App unter
 * „Auf meinem iPad › Schul-Apps › Schulmaterial › <Fach> › <Themenbereich>" (shared/schulmaterial.ts,
 * mobil/umgebung.ts). Ausgeschaltet gilt das frühere Verhalten: Ordner „Ausgaben" und sofort das
 * Teilen-Menü.
 */
export default function AblageCard({
  settings,
  update
}: {
  settings: AppSettings
  update: (patch: DeepPartial<AppSettings>) => Promise<void>
}): React.JSX.Element {
  const an = settings.schulmaterialAblage !== false
  return (
    <Card withBorder padding="lg">
      <Title order={4} mb={4}>
        Ablage auf dem iPad
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Erstelltes Material – PDF, Word, Hördateien, Lernplattform-Dateien – kann geordnet auf dem iPad liegen und ist dann in der Dateien-App jederzeit wieder
        da, auch ohne Netz.
      </Text>
      <Switch
        checked={an}
        onChange={(e) => void update({ schulmaterialAblage: e.currentTarget.checked })}
        label="Erstellte Materialien auf dem iPad ablegen"
        description={
          an
            ? 'Jede Datei landet ohne Nachfrage im passenden Ordner; die Meldung danach nennt den Ort und bietet „Teilen“ an (AirDrop, Mail, Drucken).'
            : 'Ausgeschaltet: Jede Datei kommt in den Ordner „Ausgaben“, und das Teilen-Menü öffnet sich sofort.'
        }
      />
      {an && (
        <List size="xs" c="dimmed" spacing={2} mt="md" icon={<IconFolder size={13} />}>
          <List.Item>Auf meinem iPad › Schul-Apps › Schulmaterial › Fach › Jahrgang › Thema › Materialart</List.Item>
          <List.Item>Fehlt eine Angabe, entfällt die Ebene; ohne Fach unter „Allgemein“ › Materialart.</List.Item>
          <List.Item>Vorhandene Dateien bleiben erhalten – eine neue gleichen Namens bekommt ein „(2)“.</List.Item>
        </List>
      )}
    </Card>
  )
}
