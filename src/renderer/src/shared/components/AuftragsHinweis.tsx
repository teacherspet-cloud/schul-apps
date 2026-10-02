import { Box, Button, Card, Center, Group, Loader, Progress, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { IconEyeOff, IconPlus, IconX } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { brichAb, dauerLabel, useSekundentakt, type Auftrag } from '../auftraege'
import { restAnzeige } from '../restzeit'
import { useZwischenstaende, type Zwischenstand } from '../zwischenstand'

/**
 * Statt des Formulars: „wird erzeugt … im Hintergrund".
 *
 * Bis 25.09.2026 lag an dieser Stelle ein Fenster ohne Schließen-Knopf über dem ganzen
 * Programm. Jetzt steht hier nur, was läuft – und daneben der Weg zum nächsten Dokument:
 * Wer „Neu …" drückt, legt ein weiteres an und kann es gleich erzeugen lassen. Das hier
 * erzeugte landet trotzdem in diesem Dokument und in der Bibliothek.
 */
export default function AuftragsHinweis({
  auftrag,
  neuLabel,
  onNeu,
  vorschau,
  onAusblenden
}: {
  auftrag: Auftrag
  neuLabel?: string
  onNeu?: () => void
  /**
   * Live-Vorschau (02.10.2026): zeichnet den letzten Zwischenstand des Auftrags. Liegt einer vor,
   * wird die Karte zur schmalen Kopfzeile und darunter steht das entstehende Material.
   */
  vorschau?: (z: Zwischenstand) => ReactNode
  /** Nicht sperrender Auftrag: Die Vorschau lässt sich ausblenden, dahinter steht das Formular */
  onAusblenden?: () => void
}): React.JSX.Element {
  const jetzt = useSekundentakt(true)
  const vergangen = jetzt - auftrag.start
  const rest = restAnzeige(auftrag, jetzt)
  const zwischenstand = useZwischenstaende((s) => s.staende[auftrag.id])
  const inhalt = vorschau && zwischenstand ? vorschau(zwischenstand) : null
  if (inhalt)
    return (
      <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Card withBorder radius={0} padding="xs" role="status" aria-live="polite" data-auftrag-hinweis={auftrag.docId} data-live-kopf>
          <Group gap="sm" wrap="nowrap" justify="space-between">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
              <Loader size="xs" />
              <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
                {auftrag.art}
              </Text>
              {/* Laufzeile: was zuletzt geschehen ist, sonst die Meldung des Auftrags */}
              <Text size="sm" truncate data-live-laufzeile>
                {auftrag.status === 'wartend' ? 'wartet auf freien Platz' : (zwischenstand.was ?? auftrag.meldung)}
                {zwischenstand.was && auftrag.meldung && zwischenstand.was !== auftrag.meldung ? ` · ${auftrag.meldung}` : ''}
              </Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              {auftrag.anteil > 0 && <Progress value={auftrag.anteil * 100} animated w={120} aria-label="Fortschritt" />}
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {auftrag.anteil > 0 ? `${Math.round(auftrag.anteil * 100)} % · ` : ''}
                {dauerLabel(vergangen)}
                {rest ? ` · ${rest}` : ''}
              </Text>
              <Button size="xs" variant="default" color="red" leftSection={<IconX size={14} />} onClick={() => brichAb(auftrag.id)}>
                Abbrechen
              </Button>
              {onAusblenden && (
                <Button size="xs" variant="subtle" leftSection={<IconEyeOff size={14} />} onClick={onAusblenden} data-live-ausblenden>
                  Ausblenden
                </Button>
              )}
              {onNeu && (
                <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={onNeu}>
                  {neuLabel ?? 'Neu'}
                </Button>
              )}
            </Group>
          </Group>
          <Text size="xs" c="dimmed" mt={2}>
            Vorschau – entsteht gerade, noch nicht zu bearbeiten. Neues und Geändertes leuchtet kurz auf.
            {onAusblenden ? ' Das Formular bleibt dahinter offen.' : ''}
          </Text>
        </Card>
        <ScrollArea style={{ flex: 1, minHeight: 0 }} className="editor-canvas">
          <Box p="md">{inhalt}</Box>
        </ScrollArea>
      </Box>
    )
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
