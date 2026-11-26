import { Checkbox, Chip, Group, NumberInput, Paper, SegmentedControl, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { DIKTAT_FORMEN, DIKTAT_SCHWERPUNKTE, DIKTAT_ZUSATZ, diktatWortzahl } from '../didactics/diktat'
import type { DiktatSetup } from '../model/types'

/**
 * Einstellungen eines Diktatblatts (26.11.2026): Form, Rechtschreibschwerpunkte (Mehrfachauswahl),
 * Wortzahl, Zählregel – und nur auf Wunsch Vor- und Nachbereitung. Ohne weitere Wahl entsteht nur
 * das Diktat selbst (abgestimmt mit der Lehrkraft).
 */
export default function DiktatKarte({
  setup,
  klasse,
  onChange,
  nurPruefung = false
}: {
  setup: DiktatSetup
  klasse: number
  onChange: (s: DiktatSetup) => void
  /** Klassenarbeit/Lernzielkontrolle: nur Formen zur Leistungsfeststellung (ISB) */
  nurPruefung?: boolean
}): React.JSX.Element {
  const set = (p: Partial<DiktatSetup>): void => onChange({ ...setup, ...p })
  const gruppen = [...new Set(DIKTAT_SCHWERPUNKTE.map((s) => s.gruppe))]
  const form = DIKTAT_FORMEN.find((f) => f.value === setup.form)
  const zusatz = (wann: 'vorher' | 'nachher'): React.JSX.Element => (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {wann === 'vorher' ? 'Vorbereitung (optional)' : 'Nachbereitung (optional)'}
      </Text>
      {DIKTAT_ZUSATZ.filter((z) => z.wann === wann).map((z) => (
        <Checkbox
          key={z.value}
          label={z.label}
          checked={setup.zusatz.includes(z.value)}
          onChange={(e) => set({ zusatz: e.currentTarget.checked ? [...setup.zusatz, z.value] : setup.zusatz.filter((x) => x !== z.value) })}
          data-diktat-zusatz={z.value}
        />
      ))}
    </Stack>
  )
  return (
    <Paper withBorder p="md" radius="md" data-diktat-karte>
      <Stack gap="sm">
        <Select
          label="Form des Diktats"
          description={`${form?.beschreibung ?? ''}${form?.nurUebung ? ' Nur zum Üben, nicht zur Leistungsfeststellung (ISB Bayern).' : ''}`}
          data={DIKTAT_FORMEN.filter((f) => !nurPruefung || !f.nurUebung).map((f) => ({ value: f.value, label: f.nurUebung ? `${f.label} (Übung)` : f.label }))}
          value={setup.form}
          onChange={(v) => v && set({ form: v as DiktatSetup['form'] })}
          allowDeselect={false}
          data-diktat-form
        />
        <div>
          <Text size="sm" fw={600}>
            Rechtschreibschwerpunkte (mehrere möglich)
          </Text>
          <Text size="xs" c="dimmed" mb={6}>
            Ohne Auswahl wählt die KI ein bis zwei Schwerpunkte, die zu Klasse {klasse} passen.
          </Text>
          <Stack gap={6}>
            {gruppen.map((g) => (
              <div key={g}>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={2}>
                  {g}
                </Text>
                <Chip.Group multiple value={setup.schwerpunkte} onChange={(v) => set({ schwerpunkte: v })}>
                  <Group gap={6}>
                    {DIKTAT_SCHWERPUNKTE.filter((s) => s.gruppe === g).map((s) => (
                      <Chip key={s.value} value={s.value} size="xs" title={`z. B. ${s.beispiele.join(', ')} · ${s.strategie} · üblich ab Klasse ${s.ab}`} data-diktat-schwerpunkt={s.value}>
                        {s.label}
                        {s.ab > klasse ? ' ⚠' : ''}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </div>
            ))}
          </Stack>
          <TextInput
            mt={6}
            size="xs"
            placeholder="Eigener Schwerpunkt, z. B. Wörter mit -ig und -lich"
            value={setup.eigenerSchwerpunkt ?? ''}
            onChange={(e) => set({ eigenerSchwerpunkt: e.currentTarget.value })}
          />
        </div>
        <Group grow align="end">
          <NumberInput
            label="Wortzahl"
            description={`Faustregel für Klasse ${klasse}: etwa ${diktatWortzahl(klasse)} Wörter`}
            placeholder={String(diktatWortzahl(klasse))}
            min={20}
            max={400}
            step={10}
            value={setup.woerter || ''}
            onChange={(v) => set({ woerter: Number(v) || 0 })}
            data-diktat-woerter
          />
          <NumberInput
            label="Note 6 ab … % Fehler"
            description="Vorschlag 10 % (Faustregel), nur Orientierung"
            min={3}
            max={25}
            value={setup.sechsAbProzent}
            onChange={(v) => set({ sechsAbProzent: Number(v) || 10 })}
          />
        </Group>
        <div>
          <Text size="sm" fw={600} mb={4}>
            Fehlerzählung
          </Text>
          <SegmentedControl
            size="xs"
            value={setup.zaehlart}
            onChange={(v) => set({ zaehlart: v as DiktatSetup['zaehlart'] })}
            data={[
              { value: 'isb', label: 'Satzzeichen halb (ISB)' },
              { value: 'streng', label: 'Satzzeichen ganz' },
              { value: 'woerter', label: 'Nur Wörter' }
            ]}
          />
        </div>
        <Switch label="Kommas werden mitdiktiert" checked={setup.kommasDiktiert} onChange={(e) => set({ kommasDiktiert: e.currentTarget.checked })} />
        <Group align="start" grow>
          {zusatz('vorher')}
          {zusatz('nachher')}
        </Group>
      </Stack>
    </Paper>
  )
}
