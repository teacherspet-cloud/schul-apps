/**
 * Kurse aus IServ in „Meine Klassen" (10.10.2026, Wunsch der Lehrkraft; Erkennen in shared/iservKurse.ts, Anlegen in
 * server/iservKursgruppen.ts): kleines Abzeichen „aus IServ erkannt", Menü zum Umbenennen und Ausblenden („nicht meine
 * Gruppe") und – in der Übersicht – das erkannte Kürzel samt ausgeblendeten Kursen zum Wieder-Einblenden.
 */
import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconUsersGroup, IconDots, IconEye, IconEyeOff, IconPencil } from '@tabler/icons-react'
import { useState } from 'react'
import { notifyError, notifySuccess } from '../../shared/util'
import { senden } from '../onlinetest/serverApi'

export interface IservAngabe {
  roh: string
  text: string
  art: 'angelegt' | 'verknuepft'
}

export interface IservUebersicht {
  iservAusgeblendet?: { id: string; name: string; roh: string; geloescht: boolean }[]
  iservKuerzel?: { kuerzel: string | null; eigen: string; kurse: number }
}

/** Abzeichen „aus IServ erkannt" mit der Erkennung als Erklärung */
export function IservAbzeichen({ a, size = 'xs' }: { a: IservAngabe; size?: 'xs' | 'sm' }): React.JSX.Element {
  return (
    <Tooltip
      label={`IServ-Gruppe „${a.roh}“: ${a.text}${a.art === 'verknuepft' ? ' – mit der vorhandenen Lerngruppe verknüpft' : ''}`}
      multiline
      w={300}
      withinPortal
    >
      <Badge size={size} variant="light" color="grape" leftSection={<IconUsersGroup size={11} />} style={{ flexShrink: 0 }} data-iserv-erkannt={a.roh}>
        aus IServ erkannt
      </Badge>
    </Tooltip>
  )
}

/** Menü an einer erkannten Lerngruppe: Umbenennen, Ausblenden */
export function IservKursMenue({ gruppeId, name, geaendert }: { gruppeId: string; name: string; geaendert: (weg?: boolean, neuerName?: string) => void }): React.JSX.Element {
  const [umbenennen, setUmbenennen] = useState(false)
  const [ausblenden, setAusblenden] = useState(false)
  const [neu, setNeu] = useState(name)
  const [laeuft, setLaeuft] = useState(false)
  const speichern = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<{ name: string }>(`/server/klassen/${encodeURIComponent(gruppeId)}/umbenennen`, { name: neu })
      notifySuccess(`Umbenannt: ${r.name}`)
      setUmbenennen(false)
      geaendert(false, r.name)
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  const weg = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<{ art: 'geloescht' | 'ausgeblendet' | 'getrennt' }>(`/server/klassen/${encodeURIComponent(gruppeId)}/iserv-ausblenden`, {})
      notifySuccess(
        r.art === 'getrennt'
          ? 'Die Verknüpfung mit IServ ist gelöst – die Lerngruppe bleibt.'
          : r.art === 'ausgeblendet'
            ? 'Ausgeblendet. Freigegebenes Material bleibt für die Lernenden; unter „Aus IServ erkannt“ lässt sich die Gruppe wieder einblenden.'
            : 'Ausgeblendet. Die Gruppe entsteht nicht wieder; unter „Aus IServ erkannt“ lässt sie sich zurückholen.'
      )
      setAusblenden(false)
      geaendert(r.art !== 'getrennt')
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" aria-label="IServ-Kurs bearbeiten" data-iserv-menue>
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={15} />} onClick={() => (setNeu(name), setUmbenennen(true))} data-iserv-umbenennen>
            Umbenennen
          </Menu.Item>
          <Menu.Item color="red" leftSection={<IconEyeOff size={15} />} onClick={() => setAusblenden(true)} data-iserv-ausblenden>
            Nicht meine Gruppe – ausblenden
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal opened={umbenennen} onClose={() => setUmbenennen(false)} title="Lerngruppe umbenennen" centered>
        <Stack>
          <TextInput label="Name" value={neu} onChange={(e) => setNeu(e.currentTarget.value)} maxLength={80} data-autofocus data-iserv-name />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setUmbenennen(false)}>
              Abbrechen
            </Button>
            <Button loading={laeuft} disabled={!neu.trim()} onClick={() => void speichern()} data-iserv-name-ok>
              Speichern
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={ausblenden} onClose={() => setAusblenden(false)} title={`„${name}“ ausblenden?`} centered>
        <Stack>
          <Text size="sm">
            Die Gruppe wurde aus den IServ-Gruppen erkannt. Ausgeblendet steht sie nicht mehr in „Meine Klassen“ und entsteht auch bei der nächsten
            IServ-Anmeldung nicht wieder. Ohne Material wird sie entfernt; freigegebenes Material bleibt für die Lernenden erhalten.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAusblenden(false)}>
              Abbrechen
            </Button>
            <Button color="red" loading={laeuft} onClick={() => void weg()} data-iserv-ausblenden-ok>
              Ausblenden
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

/** Übersicht: erkanntes Kürzel (änderbar) und ausgeblendete Kurse */
export function IservErkennung({ d, geaendert }: { d: IservUebersicht; geaendert: () => void }): React.JSX.Element | null {
  const k = d.iservKuerzel
  const aus = d.iservAusgeblendet ?? []
  const [kuerzel, setKuerzel] = useState(k?.eigen ?? '')
  const [laeuft, setLaeuft] = useState(false)
  if (!k?.kurse && !aus.length) return null
  const kuerzelSpeichern = async (): Promise<void> => {
    setLaeuft(true)
    try {
      await senden('/server/klassen/iserv-kuerzel', { kuerzel })
      notifySuccess(kuerzel.trim() ? `Kürzel ${kuerzel.trim()} gespeichert.` : 'Kürzel wird wieder automatisch erkannt.')
      geaendert()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  const einblenden = async (id: string): Promise<void> => {
    try {
      await senden('/server/klassen/iserv-einblenden', { id })
      geaendert()
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <Card withBorder radius="md" mt="lg" data-iserv-erkennung>
      <Stack gap="xs">
        <Group gap="xs">
          <IconUsersGroup size={18} />
          <Text fw={700}>Aus IServ erkannt</Text>
        </Group>
        <Text size="sm" c="dimmed">
          Kurse (z. B. „FR 7 Kon“, „EN 13 eA Kon“) entstehen bei der Anmeldung über IServ als Lerngruppen mit genau den Lernenden der IServ-Gruppe.
          Gruppen mit fremdem Kürzel bleiben außen vor.
        </Text>
        <Group gap="xs" align="flex-end">
          <TextInput
            label="Eigenes Kürzel"
            description={k?.kuerzel && !k.eigen ? `automatisch erkannt: ${k.kuerzel}` : !k?.kuerzel ? 'noch nicht erkannt – dann zählt jede eigene Kursgruppe' : undefined}
            placeholder={k?.kuerzel ?? 'z. B. Kon'}
            value={kuerzel}
            onChange={(e) => setKuerzel(e.currentTarget.value)}
            w={220}
            data-iserv-kuerzel
          />
          <Button variant="light" loading={laeuft} onClick={() => void kuerzelSpeichern()} data-iserv-kuerzel-ok>
            Übernehmen
          </Button>
        </Group>
        {aus.length > 0 && (
          <Stack gap={4} data-iserv-ausgeblendet>
            <Text size="sm" fw={600}>
              Ausgeblendet
            </Text>
            {aus.map((a) => (
              <Group key={a.id} gap="xs" data-iserv-ausgeblendet-eintrag={a.roh}>
                <Text size="sm">{a.name}</Text>
                <Text size="xs" c="dimmed">
                  IServ: {a.roh}
                </Text>
                <Button size="compact-xs" variant="subtle" leftSection={<IconEye size={13} />} onClick={() => void einblenden(a.id)} data-iserv-einblenden>
                  Wieder einblenden
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
