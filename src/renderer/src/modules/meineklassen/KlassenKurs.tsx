/**
 * Reiter „Vokabeln" und „Grammatik" in „Meine Klassen" (09.10.2026, abgestimmt mit der Lehrkraft): dieselbe Kursseite
 * wie in Sprachenlernen (lernen/kurs/KursSeite.tsx), eingebettet – ohne Wechsel in eine andere App. Gezeigt wird der Kurs
 * der Klasse; hat die Lerngruppe mehrere Kurse, wählt eine kleine Leiste darüber den Kurs.
 */
import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core'
import { IconSettings } from '@tabler/icons-react'
import { useState } from 'react'
import type { AbschnittStatistik } from '@shared/kursAbschnitte'
import { KursSeite } from '../lernen/kurs/KursSeite'

interface KursKurz {
  id: string
  titel: string
  kursName?: string
  status: 'offen' | 'beendet'
  abschnitte?: AbschnittStatistik[]
  lernendeNamen?: string[]
}

export function KlassenKurs({
  kurse,
  klassenKurs,
  bereich,
  rechts,
  aktionen,
  geaendert
}: {
  kurse: KursKurz[]
  klassenKurs?: string | null
  bereich: 'vokabeln' | 'grammatik'
  /** Rechts in der Kopfzeile (Lehrwerk-Stand) */
  rechts?: React.ReactNode
  /** Knöpfe je Kurs (z. B. „Ablegen ▾") */
  aktionen?: (kurs: KursKurz) => React.ReactNode
  geaendert: () => void
}): React.JSX.Element {
  const sortiert = [...kurse].sort((a, b) => (a.id === klassenKurs ? -1 : b.id === klassenKurs ? 1 : a.status === b.status ? 0 : a.status === 'offen' ? -1 : 1))
  const [wahl, setWahl] = useState<string | null>(null)
  const [einstellungen, setEinstellungen] = useState(false)
  const kurs = sortiert.find((k) => k.id === wahl) ?? sortiert[0]
  if (!kurs)
    return (
      <Stack gap="xs">
        <Group justify="flex-end">{rechts}</Group>
        <Text c="dimmed" size="sm" data-keine-kurse>
          Noch kein Kurs in dieser Lerngruppe – in Sprachenlernen einen Kurs für die Klasse freigeben.
        </Text>
      </Stack>
    )
  return (
    <Stack gap="xs" data-klassen-kurs={kurs.id} data-kurs={kurs.titel} data-kurs-name={kurs.kursName ?? kurs.titel}>
      <Group justify="space-between" gap="xs">
        {sortiert.length > 1 ? (
          <SegmentedControl
            size="xs"
            value={kurs.id}
            onChange={setWahl}
            data={sortiert.map((k) => ({ value: k.id, label: `${k.kursName ?? k.titel}${k.status === 'offen' ? '' : ' (beendet)'}` }))}
            data-klassen-kurs-wahl
          />
        ) : (
          <Text fw={600} size="sm" data-klassen-kurs-titel>
            {kurs.kursName ?? kurs.titel}
          </Text>
        )}
        <Group gap="xs">
          <Button size="compact-sm" variant="subtle" color="gray" leftSection={<IconSettings size={14} />} onClick={() => setEinstellungen(true)} data-kurs-einstellungen-knopf>
            Kurseinstellungen
          </Button>
          {aktionen?.(kurs)}
          {rechts}
        </Group>
      </Group>
      <KursSeite
        key={`${kurs.id}-${bereich}`}
        kursId={kurs.id}
        eingebettet
        nurReiter={bereich}
        abschnitte={kurs.abschnitte ? { abschnitte: kurs.abschnitte, namen: kurs.lernendeNamen ?? [] } : undefined}
        geaendert={geaendert}
        einstellungenOffen={einstellungen}
        einstellungenSchliessen={() => setEinstellungen(false)}
      />
    </Stack>
  )
}
