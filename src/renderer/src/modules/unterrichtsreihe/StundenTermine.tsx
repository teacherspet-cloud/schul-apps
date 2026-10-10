/**
 * Termine der Stunden (10.10.2026, Schulkalender): erste Stunde am … und die Wochentage der Klasse – jede Stunde der
 * Reihe bekommt ihr Datum, Ferien und Feiertage des Landes werden übersprungen (shared/schulkalender.ts
 * `unterrichtsTage`). Ohne Angaben bleiben die Stunden ohne Datum wie bisher.
 */
import { ActionIcon, Chip, Group, Paper, Text, TextInput, Tooltip } from '@mantine/core'
import { IconCalendarEvent, IconX } from '@tabler/icons-react'
import type { Reihe } from '@shared/reihe'
import { schulkalender, tagText } from '@shared/schulkalender'
import { stundenDaten } from './stundenAnsicht'

const TAGE = [
  { wert: 1, name: 'Mo' },
  { wert: 2, name: 'Di' },
  { wert: 3, name: 'Mi' },
  { wert: 4, name: 'Do' },
  { wert: 5, name: 'Fr' }
]

export function StundenTermine({ reihe: r, setze }: { reihe: Reihe; setze: (teil: Partial<Reihe>) => void }): React.JSX.Element | null {
  if (!(r.stunden?.length ?? 0)) return null
  const t = r.stundenTermine ?? { beginn: '', tage: [] }
  const daten = stundenDaten(r).filter((d): d is string => Boolean(d))
  const aendern = (neu: { beginn: string; tage: number[] }): void => setze({ stundenTermine: neu.beginn || neu.tage.length ? neu : undefined })
  return (
    <Paper withBorder radius="md" p="xs" data-stunden-termine>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          type="date"
          size="xs"
          label="Erste Stunde am"
          leftSection={<IconCalendarEvent size={14} />}
          value={t.beginn}
          onChange={(e) => aendern({ ...t, beginn: e.currentTarget.value })}
          w={170}
          data-termine-beginn
        />
        <div>
          <Text size="xs" fw={500} mb={4}>
            Unterricht an
          </Text>
          <Chip.Group multiple value={t.tage.map(String)} onChange={(v) => aendern({ ...t, tage: v.map(Number).sort() })}>
            <Group gap={4} wrap="nowrap">
              {TAGE.map((d) => (
                <Chip key={d.wert} value={String(d.wert)} size="xs" data-termine-tag={d.wert}>
                  {d.name}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </div>
        {r.stundenTermine && (
          <Tooltip label="Termine entfernen">
            <ActionIcon variant="subtle" color="gray" onClick={() => setze({ stundenTermine: undefined })} aria-label="Termine entfernen" data-termine-entfernen>
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Text size="xs" c="dimmed" mt={4} data-termine-hinweis>
        {daten.length
          ? `${daten.length} von ${r.stunden!.length} Stunden mit Datum, letzte am ${tagText(daten[daten.length - 1])}. ${
              schulkalender() ? 'Ferien und Feiertage sind übersprungen.' : 'Ohne Schulkalender ist nur das Wochenende übersprungen.'
            }`
          : 'Mit Datum und Wochentagen bekommt jede Stunde ihren Termin – Ferien und Feiertage werden übersprungen.'}
      </Text>
    </Paper>
  )
}
