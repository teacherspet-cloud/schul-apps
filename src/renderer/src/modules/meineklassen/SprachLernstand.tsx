/**
 * Lernstand einer Sprachklasse in „Meine Klassen" (09.10.2026, Wunsch der Lehrkraft): dieselbe Übersicht wie auf der
 * Kursseite in Sprachenlernen – links „Lernstand im Karteikasten" (Säulen je Stufe), rechts „Units" mit Balken je Band
 * und Unit (neuester Band oben, mit Cover). Kompakt; ein Klick auf „Alle Abschnitte" führt in den Reiter „Vokabeln".
 *
 * 10.10.2026: der kleine Kennzahlen-Kasten (`kopf`) steht vorn in derselben Reihe – drei Karten nebeneinander auf breiten
 * Schirmen, zwei auf dem Tablet, eine je Zeile auf dem Handy (dort mit knapperem Innenabstand); gleiche Höhe je Reihe.
 *
 * 10.10.2026: „Passendes Material" (`material`) kann mit in die Reihe – dann zwei Spalten ab Tablet (Kennzahlen +
 * Karteikasten, darunter Units + Passendes Material nebeneinander, gleiche Höhe je Reihe), eine je Zeile auf dem Handy.
 */
import { vokabelnHinzufuegen } from '../lernen/kurs/KursSeite'
import { IconPlus } from '@tabler/icons-react'
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
  zuAbschnitten,
  kopf,
  material
}: {
  kursId: string
  /** Kennzahlen-Kasten (FachKopf kompakt) – vorn in der Reihe */
  kopf?: React.ReactNode
  abschnitte?: AbschnittStatistik[]
  zuAbschnitten: () => void
  /** Kasten „Passendes Material" – in derselben Reihe wie „Units" */
  material?: React.ReactNode
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
  if (!gesamt && !abschnitte?.length && !kopf && !material) return null
  return (
    <SimpleGrid cols={material ? { base: 1, sm: 2 } : { base: 1, sm: 2, lg: 3 }} spacing="md" data-sprach-lernstand>
      <style>{`
        @media (max-width: 700px) {
          [data-sprach-lernstand] > .mantine-Card-root { --card-padding: 10px !important; padding: 10px; }
        }
      `}</style>
      {kopf}
      {gesamt && (
        <Card withBorder radius="md" padding="md" h="100%" data-kurs-lernstand>
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
        <Card withBorder radius="md" padding="md" h="100%" data-sprach-units>
          <Group justify="space-between" mb="xs">
            <Text fw={700}>Units</Text>
            <Group gap={4} wrap="nowrap">
              {/* „+ Vokabeln hinzufügen" (10.10.2026): zum Reiter „Vokabeln" und gleich der Dialog */}
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() => (zuAbschnitten(), vokabelnHinzufuegen(kursId))}
                data-units-hinzufuegen
              >
                Vokabeln hinzufügen
              </Button>
              <Button size="compact-xs" variant="subtle" onClick={zuAbschnitten}>
                Alle Abschnitte
              </Button>
            </Group>
          </Group>
          <UnitsKompakt abschnitte={abschnitte} schluessel={kursId} />
        </Card>
      )}
      {material}
    </SimpleGrid>
  )
}
