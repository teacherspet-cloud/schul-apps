import { Button, Group, Modal, MultiSelect, Stack, Text } from '@mantine/core'
import { IconUsers } from '@tabler/icons-react'
import { useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'

/**
 * Mitlehrkräfte einladen (23.10.2026, Entscheidung der Lehrkraft nach der Prüfung „jeder sieht nur Eigenes“): Wer im selben
 * Kurs unterrichtet, sieht Material und Lernstand dieser Lerngruppe nur noch, wenn die Lehrkraft der Lerngruppe ihn hier
 * einlädt (server/ueberthemen.ts › mitlehrkraft_einladungen). Vorher genügte ein gleich benannter Kurs.
 */
export function MitlehrkraefteKnopf({ gruppeId }: { gruppeId: string }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [daten, setDaten] = useState<{ eingeladen: string[]; lehrkraefte: { id: string; name: string }[] } | null>(null)
  const [wahl, setWahl] = useState<string[]>([])
  const [speichert, setSpeichert] = useState(false)
  const pfad = `/server/themen/${encodeURIComponent(gruppeId)}/mitlehrkraefte`

  const oeffnen = (): void => {
    setOffen(true)
    void holen<{ eingeladen: string[]; lehrkraefte: { id: string; name: string }[] }>(pfad).then(
      (d) => {
        setDaten(d)
        setWahl(d.eingeladen)
      },
      (e: unknown) => notifyError(e, 'Die Mitlehrkräfte konnten nicht geladen werden')
    )
  }
  const speichern = async (): Promise<void> => {
    setSpeichert(true)
    try {
      await senden(pfad, { ids: wahl })
      notifySuccess(wahl.length ? 'Mitlehrkräfte eingeladen.' : 'Keine Mitlehrkräfte mehr eingeladen.')
      setOffen(false)
    } catch (e) {
      notifyError(e, 'Die Einladung konnte nicht gespeichert werden')
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <>
      <Button size="compact-xs" variant="subtle" leftSection={<IconUsers size={14} />} onClick={oeffnen} data-mitlehrkraefte-knopf>
        Mitlehrkräfte …
      </Button>
      <Modal opened={offen} onClose={() => setOffen(false)} title="Mitlehrkräfte dieser Lerngruppe" centered>
        <Stack gap="sm">
          <Text size="sm">
            Eingeladene Lehrkräfte sehen Material und Lernstand dieser Lerngruppe (nur ansehen, nicht ändern) – in ihrer eigenen
            Lerngruppe desselben Kurses und Fachs. Ohne Einladung sieht niemand etwas.
          </Text>
          <MultiSelect
            label="Eingeladen"
            placeholder={wahl.length ? undefined : 'Lehrkräfte wählen …'}
            data={(daten?.lehrkraefte ?? []).map((l) => ({ value: l.id, label: l.name }))}
            value={wahl}
            onChange={setWahl}
            searchable
            clearable
            disabled={!daten}
            data-mitlehrkraefte-wahl
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => void speichern()} loading={speichert} disabled={!daten} data-mitlehrkraefte-speichern>
              Speichern
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
