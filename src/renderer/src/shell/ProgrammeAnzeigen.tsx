import { Button, Card, Group, MultiSelect, Stack, Switch, Text, Title } from '@mantine/core'
import type { AppSettings, DeepPartial } from '@shared/types'
import { modules } from '../modules/registry'
import { SUBJECTS } from '../modules/arbeitsblatt/model/subjects'
import { programmPasst, programmSichtbar } from '../shared/programmSichtbarkeit'

type Update = (patch: DeepPartial<AppSettings>) => Promise<void>

/** Alle wählbaren Fächer – „Anderes Fach …" ist kein Fach, das man unterrichtet */
// Alphabetisch (03.10.2026)
const FAECHER = SUBJECTS.filter((s) => s.id !== 'anderes')
  .map((s) => ({ value: s.id, label: s.label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }))

/**
 * „Unterrichtete Fächer" (Paket 12) – Mehrfachwahl im Reiter „Schule" und im
 * Einrichtungsassistenten (beide zeigen die SchoolCard, die dieses Feld enthält).
 *
 * Wirkung: Die eigenen Fächer stehen in jeder Fachauswahl oben (HaeufigSelect), und Programme,
 * die zu keinem davon passen, verschwinden aus Leiste und Startseite.
 */
export function EigeneFaecherFeld({ settings, update }: { settings: AppSettings; update: Update }): React.JSX.Element {
  return (
    <MultiSelect
      label="Unterrichtete Fächer"
      description="Stehen in jeder Fachauswahl oben. Programme, die zu keinem dieser Fächer passen, werden ausgeblendet – ohne Auswahl bleibt alles sichtbar."
      placeholder={settings.eigeneFaecher?.length ? undefined : 'Fächer wählen'}
      data={FAECHER}
      value={settings.eigeneFaecher ?? []}
      onChange={(v) => void update({ eigeneFaecher: v })}
      searchable
      clearable
      hidePickedOptions
      maxDropdownHeight={320}
      data-eigene-faecher
    />
  )
}

/**
 * „Programme anzeigen": jedes Programm einzeln ein- oder ausblenden. Die Schalter zeigen, was
 * gerade gilt; wer einen umlegt, legt es für dieses Programm fest – unabhängig von den Fächern.
 * „Wie die Fächer" nimmt alle eigenen Festlegungen zurück.
 */
export function ProgrammeAnzeigenCard({ settings, update }: { settings: AppSettings; update: Update }): React.JSX.Element {
  const eigene = settings.eigeneFaecher ?? []
  const anzeigen = settings.programmeAnzeigen ?? {}
  const festgelegt = Object.keys(anzeigen).some((id) => typeof anzeigen[id] === 'boolean')
  return (
    <Card withBorder padding="lg" data-programme-anzeigen>
      <Group justify="space-between" align="start" mb={4}>
        <Title order={4}>Programme anzeigen</Title>
        {festgelegt && (
          <Button
            size="compact-sm"
            variant="subtle"
            // null nimmt die Festlegung zurück (der Hauptprozess löscht den Eintrag) – dann gilt wieder die Regel nach den Fächern
            onClick={() => void update({ programmeAnzeigen: Object.fromEntries(modules.map((m) => [m.id, null])) })}
          >
            Wie die Fächer
          </Button>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {eigene.length
          ? 'Nach den unterrichteten Fächern vorbelegt. Ausgeblendete Programme fehlen in Leiste und Startseite; ihre Materialien lassen sich über die Suche und „Zuletzt bearbeitet“ weiter öffnen.'
          : 'Ohne gewählte Fächer sind alle Programme sichtbar.'}
      </Text>
      <Stack gap="xs">
        {modules.map((m) => {
          const passt = programmPasst(m.faecher, eigene)
          return (
            <Switch
              key={m.id}
              label={m.name}
              description={!passt && eigene.length ? 'passt zu keinem der unterrichteten Fächer' : undefined}
              checked={programmSichtbar(m.id, m.faecher, eigene, anzeigen)}
              onChange={(e) => void update({ programmeAnzeigen: { [m.id]: e.currentTarget.checked } })}
              data-programm-schalter={m.id}
            />
          )
        })}
      </Stack>
    </Card>
  )
}
