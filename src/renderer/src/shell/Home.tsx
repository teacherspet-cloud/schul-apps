import { Badge, Card, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { modules } from '../modules/registry'
import { useAppSettings } from '../shared/settingsStore'

export default function Home({ onOpen }: { onOpen: (id: string) => void }): React.JSX.Element {
  const schoolName = useAppSettings((s) => s.settings.schoolName)
  return (
    <Container size="lg" py={48} style={{ height: '100%', overflow: 'auto' }}>
      <Stack gap={4} className="home-hero">
        <Title order={1}>Schul-Apps</Title>
        <Text opacity={0.92}>{schoolName ? `${schoolName} · ` : ''}Material für den Unterricht und Organisatorisches schnell erstellen.</Text>
      </Stack>
      <SimpleGrid cols={{ base: 2, md: 3 }} spacing="lg">
        {modules.map((m) => (
          <Card key={m.id} withBorder padding="xl" className="home-tile" onClick={() => onOpen(m.id)}>
            <ThemeIcon size={64} variant="light" mb="md">
              <m.icon size={36} />
            </ThemeIcon>
            <Text fw={700} size="lg">
              {m.name}
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              {m.description}
            </Text>
            {m.acceptedFiles && (
              <Group gap={4} mt="md">
                {m.acceptedFiles.map((f) => (
                  <Badge key={f} variant="outline" color="gray" size="sm">
                    {f}
                  </Badge>
                ))}
              </Group>
            )}
          </Card>
        ))}
        <Card withBorder padding="xl" style={{ borderStyle: 'dashed', background: 'transparent' }}>
          <ThemeIcon size={64} color="gray" variant="light" mb="md">
            <IconPlus size={36} />
          </ThemeIcon>
          <Text fw={700} size="lg" c="dimmed">
            Weitere Programme folgen
          </Text>
        </Card>
      </SimpleGrid>
    </Container>
  )
}
