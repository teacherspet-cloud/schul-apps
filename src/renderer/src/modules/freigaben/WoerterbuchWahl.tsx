/**
 * Auswahl der Wörterbücher für eine Freigabe (27.11.2026): Arbeitsblatt, Onlinetest, Klassenarbeit. Leer = keins.
 * „Vorschlag" setzt die üblichen für das Fach (shared/woerterbuecher.ts › woerterbuchVorschlag).
 */
import { Button, Group, MultiSelect, Text } from '@mantine/core'
import { IconBook2 } from '@tabler/icons-react'
import { WOERTERBUECHER, woerterbuchVorschlag, type WoerterbuchId } from '@shared/woerterbuecher'

export function WoerterbuchWahl({
  wert,
  setze,
  fachId,
  pruefung = false
}: {
  wert: WoerterbuchId[]
  setze: (w: WoerterbuchId[]) => void
  fachId?: string
  /** Onlinetest/Klassenarbeit: Hinweis, dass die Suche dort ohne Korrekturvorschläge arbeitet */
  pruefung?: boolean
}): React.JSX.Element {
  return (
    <div data-woerterbuch-wahl-lehrkraft>
      <MultiSelect
        label={
          <Group gap={6} wrap="nowrap">
            <IconBook2 size={16} />
            <span>Wörterbücher für die Lernenden</span>
          </Group>
        }
        placeholder={wert.length ? undefined : 'keins'}
        data={WOERTERBUECHER.map((w) => ({ value: w.id, label: w.label }))}
        value={wert}
        onChange={(v) => setze(WOERTERBUECHER.map((w) => w.id).filter((id) => v.includes(id)))}
        clearable
        comboboxProps={{ withinPortal: true }}
      />
      <Group gap="xs" mt={4} justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {pruefung
            ? 'In Tests nur Treffer am Wortanfang, ohne „Meinten Sie …“ (wie im Abitur: ohne Rechtschreibprüfung).'
            : 'Offene Daten (Wiktionary, OpenThesaurus) auf dem Server; Suche mit ähnlichen Wörtern bei Tippfehlern.'}
        </Text>
        {!wert.length && (
          <Button size="compact-xs" variant="subtle" onClick={() => setze(woerterbuchVorschlag(fachId))} data-woerterbuch-vorschlag>
            Vorschlag fürs Fach
          </Button>
        )}
      </Group>
    </div>
  )
}
