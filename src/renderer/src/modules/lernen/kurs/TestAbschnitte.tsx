/**
 * Abschnitte des angekündigten Tests (12.10.2026, Entscheidung der Lehrkraft; Regeln in shared/testAbschnitte.ts):
 * unter dem Testtermin der Kurseinstellungen eine Mehrfachauswahl der Vokabelabschnitte und der verbundenen Grammatik.
 * Vorbelegt mit den Abschnitten seit dem letzten Test, sonst mit der zuletzt freigegebenen. Die gewählten Abschnitte
 * haben beim Üben Vorrang (shared/uebungsVorrang.ts) und bilden in den 3 Tagen vor dem Test die Runde der Lernenden.
 */
import { Anchor, Chip, Group, Stack, Text } from '@mantine/core'

export interface TestAbschnitteDaten {
  eintraege: { key: string; titel: string; zeit: number; art: 'vok' | 'gram' }[]
  gewaehlt: string[]
  /** false = Vorbelegung (noch nie von Hand gewählt) */
  eigeneWahl: boolean
  letzter: number | null
}

const datum = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

export function TestAbschnitte({
  daten,
  speichern
}: {
  daten: TestAbschnitteDaten
  /** Liste = Auswahl setzen; null = Vorbelegung wiederherstellen */
  speichern: (keys: string[] | null) => void
}): React.JSX.Element | null {
  if (!daten.eintraege.length) return null
  const gewaehlt = new Set(daten.gewaehlt)
  const umschalten = (key: string): void => {
    const neu = new Set(gewaehlt)
    if (neu.has(key)) neu.delete(key)
    else neu.add(key)
    speichern(daten.eintraege.map((e) => e.key).filter((k) => neu.has(k)))
  }
  const gruppe = (art: 'vok' | 'gram', titel: string): React.JSX.Element | null => {
    const liste = daten.eintraege.filter((e) => e.art === art)
    if (!liste.length) return null
    return (
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          {titel}
        </Text>
        <Group gap={6}>
          {liste.map((e) => (
            <Chip key={e.key} size="xs" checked={gewaehlt.has(e.key)} onChange={() => umschalten(e.key)} data-test-abschnitt={e.key}>
              {e.titel}
              {e.zeit > 0 ? ` · ${datum(e.zeit)}` : ''}
            </Chip>
          ))}
        </Group>
      </Stack>
    )
  }
  return (
    <Stack gap="xs" mt="sm" data-test-abschnitte>
      <Text size="sm" fw={600}>
        Was kommt im Test dran?
      </Text>
      <Text size="xs" c="dimmed">
        Diese Abschnitte üben die Lernenden ab jetzt zuerst – mit so vielen neuen Wörtern je Tag, dass bis 3 Tage vor dem Test jedes einmal dran war. In den 3
        Tagen davor üben sie nur sie.
        {!daten.eigeneWahl &&
          (daten.letzter ? ` Vorgeschlagen: alles seit dem letzten Test (${datum(daten.letzter)}).` : ' Vorgeschlagen: die zuletzt freigegebenen Abschnitte.')}
      </Text>
      {gruppe('vok', 'Vokabeln')}
      {gruppe('gram', 'Grammatik')}
      {daten.eigeneWahl && (
        <Anchor component="button" type="button" size="xs" onClick={() => speichern(null)}>
          Vorschlag wiederherstellen
        </Anchor>
      )}
    </Stack>
  )
}
