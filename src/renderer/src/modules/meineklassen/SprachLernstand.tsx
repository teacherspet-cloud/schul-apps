/**
 * Lernstand einer Sprachklasse in „Meine Klassen" (09.10.2026, Wunsch der Lehrkraft): dieselbe Übersicht wie auf der
 * Kursseite in Sprachenlernen – links „Lernstand im Karteikasten" (Säulen je Stufe), rechts „Units" mit Balken je Band
 * und Unit (neuester Band oben, mit Cover). Kompakt; ein Klick auf „Alle Abschnitte" führt in den Reiter „Vokabeln".
 */
import { Button, Card, Group, SimpleGrid, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { AbschnittStatistik } from '@shared/kursAbschnitte'
import type { Uebersicht } from '@shared/vokabeltrainer'
import { holen } from '../onlinetest/serverApi'
import { StufenDiagramm } from '../lernen/kurs/LernstandVerlauf'
import { UnitsKompakt } from '../lernen/kurs/KursSeite'

export function SprachLernstand({
  kursId,
  abschnitte,
  zuAbschnitten
}: {
  kursId: string
  abschnitte?: AbschnittStatistik[]
  zuAbschnitten: () => void
}): React.JSX.Element | null {
  const [gesamt, setGesamt] = useState<Uebersicht | null>(null)
  useEffect(() => {
    let aus = false
    void holen<{ gesamt: Uebersicht }>(`/server/vokabeln/${encodeURIComponent(kursId)}`)
      .then((r) => !aus && setGesamt(r.gesamt))
      .catch(() => undefined)
    return () => {
      aus = true
    }
  }, [kursId])
  if (!gesamt && !abschnitte?.length) return null
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" data-sprach-lernstand>
      {gesamt && (
        <Card withBorder radius="md" padding="md" data-kurs-lernstand>
          <Group justify="space-between" mb="xs">
            <Text fw={700}>Lernstand im Karteikasten</Text>
            <Text size="xs" c="dimmed">
              Anteil der Wörter je Stufe, alle Lernenden
            </Text>
          </Group>
          <StufenDiagramm u={gesamt} hoehe={110} />
        </Card>
      )}
      {abschnitte && abschnitte.length > 0 && (
        <Card withBorder radius="md" padding="md" data-sprach-units>
          <Group justify="space-between" mb="xs">
            <Text fw={700}>Units</Text>
            <Button size="compact-xs" variant="subtle" onClick={zuAbschnitten}>
              Alle Abschnitte
            </Button>
          </Group>
          <UnitsKompakt abschnitte={abschnitte} />
        </Card>
      )}
    </SimpleGrid>
  )
}
