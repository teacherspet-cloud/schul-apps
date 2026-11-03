/**
 * Einstellungen einer Blatt-Freigabe nachträglich ändern (03.11.2026, Wunsch der Lehrkraft: z. B. die Zahl der
 * Rückmeldungen je Aufgabe) – in „Freigegebene Blätter" (Kopf der Freigabe) und „Meine Klassen" (Karte des Blatts).
 * Server: POST /server/blaetter/<id>/einstellungen (arbeitsblaetter.ts). Mehr Runden gelten sofort; weniger nimmt
 * nichts zurück, was schon genutzt ist.
 */
import { ActionIcon, Button, Checkbox, Group, Modal, NumberInput, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core'
import { IconAdjustments } from '@tabler/icons-react'
import { useState } from 'react'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'

interface Einstellungen {
  feedback: boolean
  aufgabenFeedback: boolean
  runden: number
  aufgabenRunden: number
  stift: boolean
  grossKlein?: boolean
  schrittweise?: boolean
  merkAmEnde?: boolean
  bis?: number
  fristHart?: boolean
}

const tagText = (ms?: number): string => (ms ? new Date(ms).toLocaleDateString('sv-SE') : '')

export function FreigabeEinstellungenKnopf({ id, klein = false, geaendert }: { id: string; klein?: boolean; geaendert?: () => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [e, setE] = useState<Einstellungen | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const oeffnen = (): void => {
    setOffen(true)
    setE(null)
    void holen<{ einstellungen: Einstellungen }>(`/server/blaetter/${id}/einstellungen`).then(
      (d) => setE(d.einstellungen),
      (x: unknown) => (notifyError(x), setOffen(false))
    )
  }
  const setze = (teil: Partial<Einstellungen>): void => setE((v) => (v ? { ...v, ...teil } : v))
  const speichern = async (): Promise<void> => {
    if (!e) return
    setLaeuft(true)
    try {
      await senden(`/server/blaetter/${id}/einstellungen`, { ...e, grossKlein: e.grossKlein !== false, bis: e.bis ?? null })
      notifySuccess('Einstellungen gespeichert – sie gelten sofort für alle Lernenden.')
      setOffen(false)
      geaendert?.()
    } catch (x) {
      notifyError(x, 'Nicht gespeichert')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <>
      {klein ? (
        <Tooltip label="Einstellungen der Freigabe ändern">
          <ActionIcon variant="subtle" color="gray" onClick={(ev) => (ev.stopPropagation(), oeffnen())} aria-label="Einstellungen der Freigabe" data-freigabe-einstellungen={id}>
            <IconAdjustments size={16} />
          </ActionIcon>
        </Tooltip>
      ) : (
        <Button variant="default" leftSection={<IconAdjustments size={16} />} onClick={oeffnen} data-freigabe-einstellungen={id}>
          Einstellungen
        </Button>
      )}
      <Modal opened={offen} onClose={() => setOffen(false)} title="Einstellungen der Freigabe" size="md">
        {!e ? (
          <Text c="dimmed" size="sm">
            Wird geladen …
          </Text>
        ) : (
          <Stack gap="sm" data-freigabe-einstellungen-fenster>
            <NumberInput
              label="Einreichungen je Person"
              description="Wie oft das Blatt eingereicht werden kann (mit Rückmeldung zum Überarbeiten)."
              min={1}
              max={5}
              value={e.runden}
              onChange={(v) => setze({ runden: Number(v) || 1 })}
              data-einst-runden
            />
            <Switch label="KI-Feedback nach dem Einreichen (Bogen)" checked={e.feedback} onChange={(x) => setze({ feedback: x.currentTarget.checked })} />
            <Switch
              label="Feedback je Aufgabe während der Bearbeitung („Aufgabe prüfen“)"
              checked={e.aufgabenFeedback || Boolean(e.schrittweise) || Boolean(e.merkAmEnde)}
              disabled={Boolean(e.schrittweise) || Boolean(e.merkAmEnde)}
              description={e.schrittweise || e.merkAmEnde ? 'Nötig für „schrittweise“ bzw. „Merkkästen am Ende“.' : undefined}
              onChange={(x) => setze({ aufgabenFeedback: x.currentTarget.checked })}
            />
            <NumberInput
              label="Rückmeldungen je Aufgabe"
              description="Wie oft jede Person eine Aufgabe prüfen lassen kann."
              min={1}
              max={5}
              value={e.aufgabenRunden}
              disabled={!(e.aufgabenFeedback || e.schrittweise || e.merkAmEnde)}
              onChange={(v) => setze({ aufgabenRunden: Number(v) || 1 })}
              data-einst-aufgabenrunden
            />
            <Switch label="Aufgaben schrittweise freischalten" checked={Boolean(e.schrittweise)} onChange={(x) => setze({ schrittweise: x.currentTarget.checked })} />
            <Switch label="Merkkästen erst am Ende zeigen" checked={Boolean(e.merkAmEnde)} onChange={(x) => setze({ merkAmEnde: x.currentTarget.checked })} />
            <Switch label="Stift erlaubt" checked={e.stift} onChange={(x) => setze({ stift: x.currentTarget.checked })} />
            <Switch label="Satzanfänge automatisch großschreiben" checked={e.grossKlein !== false} onChange={(x) => setze({ grossKlein: x.currentTarget.checked })} />
            <Group align="end" gap="sm">
              <TextInput
                type="date"
                label="Bearbeiten bis"
                value={tagText(e.bis)}
                onChange={(x) => setze({ bis: x.currentTarget.value ? new Date(`${x.currentTarget.value}T23:59:00`).getTime() : undefined })}
                style={{ flex: 1 }}
                data-einst-bis
              />
              {e.bis && (
                <Button variant="subtle" color="gray" onClick={() => setze({ bis: undefined, fristHart: false })}>
                  Ohne Frist
                </Button>
              )}
            </Group>
            {e.bis && (
              <Checkbox label="Nach der Frist nur noch ansehen" checked={Boolean(e.fristHart)} onChange={(x) => setze({ fristHart: x.currentTarget.checked })} />
            )}
            <Group justify="flex-end" className="dialog-fuss">
              <Button variant="default" onClick={() => setOffen(false)}>
                Abbrechen
              </Button>
              <Button loading={laeuft} onClick={() => void speichern()} data-einst-speichern>
                Speichern
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
