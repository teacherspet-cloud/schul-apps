import { Button, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconSparkles } from '@tabler/icons-react'

/**
 * Startbereich „noch leer – jetzt erzeugen" für Schritte, die erst nach dem Erzeugen etwas zeigen.
 *
 * Befund der Lehrkraft (01.10.2026, Klassenarbeit): Nach „Weiter zu den Aufgaben" stand nur eine
 * klein gedruckte Option „Arbeit erzeugen" in der Werkzeugleiste – erkennbar war der nächste
 * Schritt nicht. Solange kein Entwurf da ist, steht deshalb oben im Inhalt diese Karte: kurz,
 * was entsteht, ein großer Hauptknopf und daneben die anderen Wege (z. B. Aufgaben aus Material).
 * Die kleine Option in der Leiste bleibt für später („Neu erzeugen").
 *
 * Gedacht für alle Programme mit diesem Ablauf; Lernzielkontrolle, Grammatiktest, Arbeitsblatt
 * und Tafelbilder erzeugen schon im Formular selbst (Hauptknopf im Formularfuss) und sperren den
 * leeren zweiten Schritt, brauchen die Karte also derzeit nicht.
 */
export default function ErzeugenStart({
  titel,
  children,
  knopf,
  alternativen,
  testId = 'erzeugen-start'
}: {
  titel: string
  /** Kurze Erklärung, was beim Erzeugen entsteht */
  children: React.ReactNode
  /** Der Hauptknopf */
  knopf: { label: string; onClick: () => void; icon?: React.ReactNode; disabled?: boolean; laedt?: boolean }
  /** Weitere Wege als Knöpfe (variant „default" oder „light") */
  alternativen?: React.ReactNode
  testId?: string
}): React.JSX.Element {
  return (
    <Card withBorder radius="lg" padding="xl" mb="lg" mx="auto" maw={720} shadow="sm" data-testid={testId} className="erzeugen-start">
      <Stack align="center" gap="md" ta="center">
        <ThemeIcon size={56} radius="xl" variant="light">
          <IconSparkles size={30} />
        </ThemeIcon>
        <Title order={3}>{titel}</Title>
        <Text size="sm" c="dimmed" maw={560}>
          {children}
        </Text>
        <Button size="lg" leftSection={knopf.icon ?? <IconSparkles size={20} />} onClick={knopf.onClick} disabled={knopf.disabled} loading={knopf.laedt}>
          {knopf.label}
        </Button>
        {alternativen && (
          <Group gap="sm" justify="center">
            {alternativen}
          </Group>
        )}
      </Stack>
    </Card>
  )
}
