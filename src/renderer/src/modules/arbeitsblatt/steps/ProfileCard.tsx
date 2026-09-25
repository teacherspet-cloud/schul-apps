import { Badge, Button, Card, Group, List, NumberInput, Popover, Select, Stack, Text, Title } from '@mantine/core'
import { IconAdjustments, IconSchool } from '@tabler/icons-react'
import type { LearnerProfile } from '../didactics/profile'
import MehrText from '../../../shared/components/MehrText'
import type { WorksheetMeta } from '../model/types'

/** Zeigt, wie Jahrgang, Schulform und Bundesland das Arbeitsblatt steuern; Werte sind überschreibbar. */
export function ProfileCard({
  profile,
  meta,
  onOverrides
}: {
  profile: LearnerProfile
  meta: WorksheetMeta
  onOverrides: (o: WorksheetMeta['overrides']) => void
}): React.JSX.Element {
  const o = meta.overrides
  const customized = Boolean(o.afbMix || o.fontPt || o.scaffolding)
  return (
    <Card withBorder padding="md" className="task-card-selected">
      <Group justify="space-between" mb={6}>
        <Group gap={8}>
          <IconSchool size={20} />
          <Title order={5}>So wird das Arbeitsblatt angepasst</Title>
          {customized && <Badge color="orange">angepasst</Badge>}
        </Group>
        <Popover width={320} position="bottom-end" shadow="md" withArrow>
          <Popover.Target>
            <Button size="xs" variant="default" leftSection={<IconAdjustments size={14} />}>
              Anpassen
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Anforderungsbereiche (%)
              </Text>
              <Group grow>
                <NumberInput
                  size="xs"
                  label="AFB I"
                  min={0}
                  max={100}
                  value={profile.afbMix.I}
                  onChange={(v) => onOverrides({ ...o, afbMix: { I: Number(v) || 0, II: 0, III: profile.afbMix.III } })}
                />
                <NumberInput size="xs" label="AFB II" value={profile.afbMix.II} disabled />
                <NumberInput
                  size="xs"
                  label="AFB III"
                  min={0}
                  max={100}
                  value={profile.afbMix.III}
                  onChange={(v) => onOverrides({ ...o, afbMix: { I: profile.afbMix.I, II: 0, III: Number(v) || 0 } })}
                />
              </Group>
              <NumberInput
                size="xs"
                label="Schriftgröße (pt)"
                min={9}
                max={22}
                step={0.5}
                decimalScale={1}
                value={profile.typography.fontPt}
                onChange={(v) => onOverrides({ ...o, fontPt: Number(v) || undefined })}
              />
              <Select
                size="xs"
                label="Umfang der Hilfen"
                data={[
                  { value: 'hoch', label: 'umfangreich' },
                  { value: 'mittel', label: 'gezielt' },
                  { value: 'gering', label: 'nur optional' }
                ]}
                value={profile.scaffolding}
                onChange={(v) => v && onOverrides({ ...o, scaffolding: v as 'hoch' | 'mittel' | 'gering' })}
                allowDeselect={false}
              />
              {customized && (
                <Button size="xs" variant="subtle" color="orange" onClick={() => onOverrides({})}>
                  Auf Vorschlag zurücksetzen
                </Button>
              )}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
      <List size="sm" spacing={2}>
        {profile.summary.map((s, i) => (
          <List.Item key={i}>{s}</List.Item>
        ))}
      </List>
      {/* Herkunft der Werte hinter „Mehr“ (Paket 6) – vollständig, nur kürzer im Formular */}
      <MehrText
        mt={6}
        text="Grundlage: KMK-Bildungsstandards (Anforderungsbereiche, Operatoren), Lesbarkeitsforschung (Schriftgröße, Satzlänge, LIX), Differenzierungs- und Sprachbildungsdidaktik. Werte mit Faustregel-Charakter sind als Vorschlag zu verstehen."
      />
    </Card>
  )
}
