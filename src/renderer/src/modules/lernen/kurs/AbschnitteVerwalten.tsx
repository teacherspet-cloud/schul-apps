import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconBooks, IconChevronDown, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { GeplantMarke } from '../../../shared/components/FreigabePlanen'

/**
 * Freigegebene Abschnitte (08.10.2026, Wunsch der Lehrkraft): nur in den Details, als zugeklappter Kasten – zu sehen ist
 * die Wörterzahl, hervorgehoben, was in den letzten 2 Wochen dazukam; aufgeklappt die Abschnitte mit Datum. Je Abschnitt
 * „Entfernen" (Lernstand bleibt, kommt beim erneuten Hinzufügen zurück) und „Endgültig löschen" (mit Lernstand);
 * entfernte Abschnitte stehen darunter (08.10.2026, abgestimmt).
 */
export type AbschnittFrage = { was: 'entfernen' | 'loeschen'; titel: string; index?: number; entfernt?: number }
export function AbschnitteVerwalten({
  teile,
  gesamt,
  entfernt,
  ausfuehren
}: {
  teile: { titel: string; anzahl: number; zeit: number }[]
  gesamt: number
  entfernt: { teil: string; anzahl: number; zeit: number }[]
  ausfuehren: (f: AbschnittFrage) => Promise<void>
}): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [entferntOffen, setEntferntOffen] = useState(false)
  const [frage, setFrage] = useState<AbschnittFrage | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  // Geplante Abschnitte (09.10.2026: `zeit` = geplanter Zeitpunkt) zählen erst ab dann als neu
  const neu = teile.filter((t) => t.zeit > Date.now() - 14 * 864e5 && t.zeit <= Date.now() && t !== teile[0]).reduce((a, t) => a + t.anzahl, 0)
  const los = async (): Promise<void> => {
    if (!frage) return
    setLaeuft(true)
    try {
      await ausfuehren(frage)
      setFrage(null)
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Card withBorder padding="sm" data-vokabel-abschnitte>
      <UnstyledButton onClick={() => setOffen((x) => !x)} w="100%" aria-expanded={offen} data-vokabel-abschnitte-kopf>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <IconBooks size={18} />
            <Text fw={700}>{gesamt} Wörter</Text>
            {neu > 0 && (
              <Badge color="green" variant="filled" data-vokabel-neu14>
                +{neu} in den letzten 2 Wochen
              </Badge>
            )}
            {entfernt.length > 0 && (
              <Badge color="gray" variant="light" tt="none">
                {entfernt.length} entfernt
              </Badge>
            )}
          </Group>
          <IconChevronDown size={18} style={{ transform: offen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
        </Group>
      </UnstyledButton>
      {offen && (
        <Stack gap={4} mt="sm">
          {teile.map((t, i) => (
            <Group key={i} justify="space-between" wrap="nowrap" gap="xs" data-vokabel-abschnitt={t.titel}>
              <Text size="sm">{t.titel}</Text>
              <Group gap={4} wrap="nowrap">
                <GeplantMarke ab={t.zeit} />
                <Text size="xs" c={t.zeit > Date.now() - 14 * 864e5 && i > 0 ? 'green' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
                  {t.anzahl} Wörter · {t.zeit ? new Date(t.zeit).toLocaleDateString('de-DE') : ''}
                </Text>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`${t.titel}: entfernen`} data-vokabel-abschnitt-aktionen={i}>
                      <IconX size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => setFrage({ was: 'entfernen', titel: t.titel, index: i })} data-vokabel-abschnitt-entfernen>
                      Entfernen
                    </Menu.Item>
                    <Menu.Item color="red" onClick={() => setFrage({ was: 'loeschen', titel: t.titel, index: i })} data-vokabel-abschnitt-loeschen>
                      Endgültig löschen …
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
          ))}
          {entfernt.length > 0 && (
            <div data-vokabel-entfernt>
              <UnstyledButton onClick={() => setEntferntOffen(!entferntOffen)} aria-expanded={entferntOffen} data-vokabel-entfernt-kopf>
                <Group gap={4}>
                  <IconChevronDown size={14} style={{ transform: entferntOffen ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
                  <Text size="sm" c="dimmed">
                    Entfernt ({entfernt.length})
                  </Text>
                </Group>
              </UnstyledButton>
              {entferntOffen && (
                <Stack gap={4} mt={4} pl="md">
                  <Text size="xs" c="dimmed">
                    Wieder aufnehmen über „Vokabeln hinzufügen“ – der Lernstand gilt dann weiter.
                  </Text>
                  {entfernt.map((e, i) => (
                    <Group key={i} justify="space-between" wrap="nowrap" gap="xs" data-vokabel-entfernt-zeile={e.teil}>
                      <Text size="sm" c="dimmed">
                        {e.teil} · {e.anzahl} Wörter · entfernt am {new Date(e.zeit).toLocaleDateString('de-DE')}
                      </Text>
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => setFrage({ was: 'loeschen', titel: e.teil, entfernt: i })} data-vokabel-entfernt-loeschen={i}>
                        Endgültig löschen
                      </Button>
                    </Group>
                  ))}
                </Stack>
              )}
            </div>
          )}
        </Stack>
      )}
      <Modal opened={Boolean(frage)} onClose={() => setFrage(null)} title={frage?.was === 'loeschen' ? 'Abschnitt endgültig löschen?' : 'Abschnitt entfernen?'}>
        {frage && (
          <Stack gap="sm">
            <Text size="sm" fw={600}>
              {frage.titel}
            </Text>
            <Text size="sm">
              {frage.was === 'loeschen'
                ? 'Die Wörter und der Lernstand aller Lernenden zu diesen Wörtern werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.'
                : 'Abschnitt entfernen? Der Lernstand bleibt gespeichert und gilt wieder, wenn du den Abschnitt erneut hinzufügst.'}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setFrage(null)}>
                Abbrechen
              </Button>
              <Button color="red" loading={laeuft} onClick={() => void los()} data-vokabel-abschnitt-bestaetigen={frage.was}>
                {frage.was === 'loeschen' ? 'Endgültig löschen' : 'Entfernen'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Card>
  )
}
