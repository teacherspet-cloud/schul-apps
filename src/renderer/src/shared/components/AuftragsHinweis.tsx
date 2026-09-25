import { Button, Card, Center, Group, Loader, Progress, Stack, Text, Title } from '@mantine/core'
import { IconPlus, IconX } from '@tabler/icons-react'
import { remainingLabel, remainingSeconds } from '../aiProgress'
import { brichAb, dauerLabel, useSekundentakt, type Auftrag } from '../auftraege'

/**
 * Statt des Formulars: „wird erzeugt … im Hintergrund".
 *
 * Bis 25.09.2026 lag an dieser Stelle ein Fenster ohne Schließen-Knopf über dem ganzen
 * Programm. Jetzt steht hier nur, was läuft – und daneben der Weg zum nächsten Dokument:
 * Wer „Neu …" drückt, legt ein weiteres an und kann es gleich erzeugen lassen. Das hier
 * erzeugte landet trotzdem in diesem Dokument und in der Bibliothek.
 */
export default function AuftragsHinweis({ auftrag, neuLabel, onNeu }: { auftrag: Auftrag; neuLabel?: string; onNeu?: () => void }): React.JSX.Element {
  const jetzt = useSekundentakt(true)
  const vergangen = jetzt - auftrag.start
  const rest = remainingLabel(remainingSeconds(auftrag.anteil, vergangen))
  return (
    <Center h="100%" p="lg">
      <Card withBorder shadow="sm" padding="xl" maw={560} w="100%" role="status" aria-live="polite" data-auftrag-hinweis={auftrag.docId}>
        <Stack gap="sm">
          <Group gap="sm" wrap="nowrap">
            <Loader size="sm" />
            <Title order={4}>
              {auftrag.art} – {auftrag.status === 'wartend' ? 'wartet auf freien Platz' : 'läuft im Hintergrund'}
            </Title>
          </Group>
          <Text size="sm" fw={500}>
            {auftrag.titel}
          </Text>
          {/* Solange nichts eingetroffen ist, wäre ein Balken bei 0 % eine Behauptung (Codex antwortet erst am Ende) */}
          {auftrag.anteil > 0 ? <Progress value={auftrag.anteil * 100} animated aria-label="Fortschritt" /> : <Loader size="sm" type="dots" />}
          <Group justify="space-between" gap="xs">
            <Text size="sm">
              {auftrag.status === 'wartend'
                ? (auftrag.wartegrund ?? 'Höchstens drei KI-Anfragen laufen zugleich – dieser Auftrag ist gleich dran.')
                : auftrag.meldung}
            </Text>
            {auftrag.anteil > 0 && (
              <Text size="sm" c="dimmed">
                {Math.round(auftrag.anteil * 100)} %
              </Text>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {dauerLabel(vergangen)} vergangen{rest ? ` · ${rest}` : ''}. Das Ergebnis erscheint hier und wird in der Bibliothek gespeichert – solange lässt sich
            in anderen Programmen oder an einem neuen Dokument weiterarbeiten.
          </Text>
          <Group justify="space-between" mt="xs">
            <Button variant="default" color="red" leftSection={<IconX size={16} />} onClick={() => brichAb(auftrag.id)}>
              Abbrechen
            </Button>
            {onNeu && (
              <Button variant="light" leftSection={<IconPlus size={16} />} onClick={onNeu}>
                {neuLabel ?? 'Neu'}
              </Button>
            )}
          </Group>
        </Stack>
      </Card>
    </Center>
  )
}
