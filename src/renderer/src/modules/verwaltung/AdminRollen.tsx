import { Badge, Button, Group, Loader, Select, Stack, Table, Text } from '@mantine/core'
import { IconShieldCheck, IconShieldOff } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KlappKarte } from '../../shared/components/KlappKarte'
import { serverIch } from '../../shared/plattform'

interface Konto {
  id: string
  benutzer: string
  name: string
  quelle: string
  gesperrt: boolean
  fest: boolean
}

/**
 * Verwaltung › Nutzer › Admins (23.10.2026, Prüfung des Schulträgers; Regeln in server/adminRollen.ts): Liste der
 * Admins, „Admin-Rolle vergeben" an eine Lehrkraft, „Entziehen" – nie beim fest eingetragenen Admin und nie beim
 * letzten aktiven Admin. Jede Änderung steht im Protokoll (Verwaltung › Server).
 */
export function AdminRollen({ fertig }: { fertig?: () => void }): React.JSX.Element {
  const [daten, setDaten] = useState<{ admins: Konto[]; lehrkraefte: Konto[] } | null>(null)
  const [wahl, setWahl] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const ich = serverIch()?.benutzer ?? ''

  const laden = useCallback(() => {
    void holen<{ admins?: Konto[]; lehrkraefte?: Konto[] }>('/server/verwaltung/admins')
      .then((d) => setDaten({ admins: d.admins ?? [], lehrkraefte: d.lehrkraefte ?? [] }))
      .catch((e: unknown) => {
        setDaten({ admins: [], lehrkraefte: [] })
        notifyError(e)
      })
  }, [])
  useEffect(laden, [laden])

  const auswahl = useMemo(
    () => (daten?.lehrkraefte ?? []).map((l) => ({ value: l.id, label: l.name && l.name !== l.benutzer ? `${l.name} (${l.benutzer})` : l.benutzer })).sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [daten?.lehrkraefte]
  )
  const aktive = (daten?.admins ?? []).filter((a) => !a.gesperrt).length

  const aendern = async (weg: 'admin-vergeben' | 'admin-entziehen', id: string, meldung: string): Promise<void> => {
    setLaeuft(true)
    try {
      await senden('/server/verwaltung/' + weg, { id })
      notifySuccess(meldung)
      setWahl(null)
      laden()
      fertig?.()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <KlappKarte
      id="nutzer-admins"
      titel="Admins"
      status={daten === null ? 'Verwaltung der Schul-Apps' : `${daten.admins.length} ${daten.admins.length === 1 ? 'Admin' : 'Admins'}`}
      rahmen={{ 'data-admin-rollen': true }}
    >
      {daten === null ? (
        <Loader size="sm" />
      ) : (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Admins öffnen die Verwaltung (Nutzer, Schlüssel, IServ, Server). Die Admin-Rolle lässt sich nur an Lehrkraft-Konten vergeben; der fest eingetragene
            Admin und der letzte aktive Admin behalten sie. Jede Änderung steht im Protokoll.
          </Text>
          <Table striped withTableBorder>
            <Table.Tbody>
              {daten.admins.map((a) => (
                <Table.Tr key={a.id} data-admin-zeile={a.benutzer}>
                  <Table.Td>
                    <Text size="sm">{a.name || a.benutzer}</Text>
                    <Text size="xs" c="dimmed">
                      {a.benutzer}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {a.fest && <Badge variant="light">fest eingetragen</Badge>}
                      {a.benutzer === ich && <Badge variant="light" color="gray">eigenes Konto</Badge>}
                      {a.gesperrt && <Badge variant="light" color="red">gesperrt</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconShieldOff size={14} />}
                      disabled={laeuft || a.fest || (!a.gesperrt && aktive <= 1)}
                      title={a.fest ? 'Fest eingetragener Admin' : !a.gesperrt && aktive <= 1 ? 'Letzter aktiver Admin' : undefined}
                      onClick={() => void aendern('admin-entziehen', a.id, `Admin-Rolle entzogen: ${a.benutzer}`)}
                    >
                      Entziehen
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group align="end">
            <Select
              style={{ flex: 1 }}
              label="Admin-Rolle vergeben an"
              placeholder={auswahl.length ? 'Lehrkraft wählen …' : 'Keine Lehrkraft-Konten vorhanden'}
              data={auswahl}
              value={wahl}
              onChange={setWahl}
              searchable
              disabled={laeuft || !auswahl.length}
            />
            <Button
              leftSection={<IconShieldCheck size={16} />}
              disabled={laeuft || !wahl}
              onClick={() => wahl && void aendern('admin-vergeben', wahl, `Admin-Rolle vergeben: ${daten.lehrkraefte.find((l) => l.id === wahl)?.benutzer ?? ''}`)}
            >
              Admin-Rolle vergeben
            </Button>
          </Group>
        </Stack>
      )}
    </KlappKarte>
  )
}
