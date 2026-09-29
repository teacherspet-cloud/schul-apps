import { Button, Card, Group, NumberInput, Stack, Switch, Table, Text, Title } from '@mantine/core'
import { IconDeviceFloppy, IconFileText, IconFolder, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { useAppSettings } from '../shared/settingsStore'
import { aufIos } from '../shared/plattform'
import { notifyError, notifySuccess } from '../shared/util'
import SicherungEinlesen from './SicherungEinlesen'

/**
 * Automatische Sicherung, Protokoll, verwaiste Hörtexte (27.09.2026, Großprogramm 0.4).
 *
 * Die App sichert einmal am Tag selbst (userData/sicherungen, die neuesten sieben Stände).
 * Hier sieht die Lehrkraft die vorhandenen Stände, kann einen zurückspielen, zusätzlich in
 * einen eigenen Ordner sichern lassen (USB-Stick, Cloud-Ordner), das Fehlerprotokoll
 * speichern und nicht mehr benutzte Hörtexte löschen.
 */
const mb = (b: number): string => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)
const datum = (iso: string): string => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

export default function SicherungenCard(): React.JSX.Element {
  const sicherung = useAppSettings((s) => s.settings.sicherung)
  const update = useAppSettings((s) => s.update)
  const [liste, setListe] = useState<{ name: string; groesse: number; erstellt: string }[]>([])
  const [verwaist, setVerwaist] = useState<{ dateien: string[]; bytes: number } | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const laden = useCallback(() => {
    window.api.wartung.sicherungen().then(setListe).catch(notifyError)
    window.api.wartung
      .hoertexte()
      .then(setVerwaist)
      .catch(() => setVerwaist(null))
  }, [])
  useEffect(laden, [laden])

  const jetzt = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const e = await window.api.wartung.sichereJetzt()
      notifySuccess(`Sicherung angelegt (${mb(e.groesse)}).`)
      laden()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }

  const ordnerWaehlen = async (): Promise<void> => {
    const ordner = await window.api.wartung.sicherungsOrdner().catch(() => null)
    if (ordner) await update({ sicherung: { ...sicherung, ordner } })
  }

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Title order={4}>Automatische Sicherung</Title>
        <Text size="sm" c="dimmed">
          Einmal am Tag sichert die App alle Materialien, Einstellungen, Lehrwerke, Vokabellisten und Maskottchen – ohne API-Schlüssel. Die neuesten Stände
          bleiben erhalten; ältere werden gelöscht.
        </Text>
        <Group gap="lg" align="flex-end">
          <Switch
            label="Täglich automatisch sichern"
            checked={sicherung?.automatisch !== false}
            onChange={(e) => void update({ sicherung: { ...sicherung, automatisch: e.currentTarget.checked } })}
          />
          <NumberInput
            label="Stände behalten"
            w={140}
            min={1}
            max={60}
            value={sicherung?.behalten ?? 7}
            onChange={(v) => void update({ sicherung: { ...sicherung, behalten: Number(v) || 7 } })}
          />
          <Button variant="light" leftSection={<IconDeviceFloppy size={16} />} loading={laeuft} onClick={() => void jetzt()}>
            Jetzt sichern
          </Button>
        </Group>
        {/* iPad: Die Sicherungen liegen schon sichtbar in der Dateien-App – ein zweiter Ordner entfällt */}
        {aufIos() ? (
          <Text size="xs" c="dimmed">
            Die Sicherungen liegen in der Dateien-App unter „Auf meinem iPad › Schul-Apps › Sicherungen“ und lassen sich von dort in die iCloud oder auf den PC
            kopieren.
          </Text>
        ) : (
          <Group gap="xs">
            <Button variant="default" size="xs" leftSection={<IconFolder size={14} />} onClick={() => void ordnerWaehlen()}>
              {sicherung?.ordner ? 'Anderen Ordner wählen …' : 'Zusätzlich in einen Ordner sichern …'}
            </Button>
            {sicherung?.ordner && (
              <>
                <Text size="xs" c="dimmed">
                  Kopie nach: {sicherung.ordner}
                </Text>
                <Button variant="subtle" size="xs" color="gray" onClick={() => void update({ sicherung: { ...sicherung, ordner: '' } })}>
                  keine Kopie
                </Button>
              </>
            )}
          </Group>
        )}
        {liste.length > 0 ? (
          <Table striped withTableBorder fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Angelegt</Table.Th>
                <Table.Th>Größe</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {liste.map((e) => (
                <Table.Tr key={e.name}>
                  <Table.Td>{datum(e.erstellt)}</Table.Td>
                  <Table.Td>{mb(e.groesse)}</Table.Td>
                  <Table.Td>
                    <SicherungEinlesen
                      variant="default"
                      label="Wiederherstellen …"
                      quelle={{ name: e.name, laden: () => window.api.wartung.sicherungLaden(e.name) }}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            Noch keine automatische Sicherung vorhanden.
          </Text>
        )}

        <Title order={5} mt="sm">
          Fehlerprotokoll und Aufräumen
        </Title>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconFileText size={16} />}
            onClick={() =>
              void window.api.protokoll
                .speichern()
                .then((p) => p && notifySuccess('Protokoll gespeichert.'))
                .catch(notifyError)
            }
          >
            Protokoll speichern …
          </Button>
          {verwaist && verwaist.dateien.length > 0 && (
            <Button
              variant="default"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() =>
                void window.api.wartung
                  .hoertexteAufraeumen()
                  .then((v) => {
                    notifySuccess(`${v.dateien.length} Hörtexte gelöscht (${mb(v.bytes)}).`)
                    laden()
                  })
                  .catch(notifyError)
              }
            >
              {verwaist.dateien.length} nicht mehr benutzte Hörtexte löschen ({mb(verwaist.bytes)})
            </Button>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          Das Protokoll enthält nur Fehlermeldungen und Ereignisse, keine Inhalte und keine Schlüssel – zum Weitergeben, wenn etwas nicht funktioniert.
        </Text>
      </Stack>
    </Card>
  )
}
