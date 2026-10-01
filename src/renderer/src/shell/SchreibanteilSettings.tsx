import { Card, Group, Stack, Text, Title } from '@mantine/core'
import ZahlFeld from '../shared/components/ZahlFeld'
import type { AppSettings } from '@shared/types'

const SPRACHEN: { id: string; label: string }[] = [
  { id: 'englisch', label: 'Englisch' },
  { id: 'franzoesisch', label: 'Französisch' },
  { id: 'spanisch', label: 'Spanisch' },
  { id: 'italienisch', label: 'Italienisch' },
  { id: 'russisch', label: 'Russisch' }
]

/**
 * Schreibanteil der Klassenarbeiten in den modernen Fremdsprachen (29.09.2026, Wunsch der
 * Lehrkraft: „einstellbar je Fachschaft"). Die Voreinstellung 60 % (Klasse 5) bzw. 70 % ist in
 * den Kerncurricula nicht belegt – sie ist eher ein Beschluss der Fachkonferenz.
 */
export default function SchreibanteilSettings({ settings, update }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void }): React.JSX.Element {
  const werte = settings.schreibanteil ?? {}
  const setze = (id: string, feld: 'k5' | 'ab6', v: number): void => {
    const alt = werte[id] ?? { k5: 60, ab6: 70 }
    update({ schreibanteil: { ...werte, [id]: { ...alt, [feld]: Math.max(0, Math.min(100, v)) } } })
  }
  return (
    <Card withBorder padding="lg" data-schreibanteil>
      <Title order={4} mb={4}>
        Schreibanteil in Fremdsprachen-Klassenarbeiten
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Anteil des Schreibteils an der Note, wenn er eine eigene Teilnote bekommt – wie von der Fachkonferenz festgelegt. Voreinstellung 60 % in Klasse 5, sonst 70 %.
      </Text>
      <Stack gap={6}>
        {SPRACHEN.map((s) => (
          <Group key={s.id} gap="xs" wrap="nowrap">
            <Text size="sm" w={110}>
              {s.label}
            </Text>
            <ZahlFeld size="xs" w={130} label="Klasse 5" suffix=" %" min={0} max={100} step={5} value={werte[s.id]?.k5 ?? 60} onChange={(v) => setze(s.id, 'k5', Number(v) || 0)} />
            <ZahlFeld size="xs" w={130} label="ab Klasse 6" suffix=" %" min={0} max={100} step={5} value={werte[s.id]?.ab6 ?? 70} onChange={(v) => setze(s.id, 'ab6', Number(v) || 0)} />
          </Group>
        ))}
      </Stack>
    </Card>
  )
}
