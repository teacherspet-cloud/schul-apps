import { Container, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { ThemenAnsicht } from '../shared/components/Themenbereiche'
import { useNavigation } from '../shared/navigation'
import type { Material } from './materialien'

/** Die übergreifende Seite hat keine „eigenen" Materialien – alle kommen als Karte ihres Programms */
const KEINE: Material[] = []

/**
 * „Themenbereiche" – alle Materialarten eines Fachs als Einheit (Paket 10b).
 *
 * Erreichbar von der Startseite (Abschnitt „Themenbereiche", Suchtreffer) und aus dem ⋯ am
 * Fach in jeder Bibliothek. In einem Bereich liegen Arbeitsblatt, Lernzielkontrolle,
 * Grammatiktest, Klassenarbeit und Vokabeltest nebeneinander; ein Klick öffnet im richtigen
 * Programm, „Neu in diesem Bereich" legt in einem wählbaren Programm an.
 */
export default function Themenuebersicht(): React.JSX.Element {
  const ziel = useNavigation((s) => s.themenZiel)
  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <Stack gap={4} mb="md">
          <Title order={2}>Themenbereiche</Title>
          <Text c="dimmed" size="sm">
            Alle Materialarten je Fach und Themenbereich – ein Klick öffnet im passenden Programm.
          </Text>
        </Stack>
        <ThemenAnsicht moduleId={null} eigene={KEINE} ziel={ziel} />
      </Container>
    </ScrollArea>
  )
}
