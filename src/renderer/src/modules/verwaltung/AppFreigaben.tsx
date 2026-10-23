import { ActionIcon, Alert, Badge, Button, Card, Checkbox, Group, Loader, MultiSelect, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { ALLE_GRUPPE, STAND_APPS, type AppGruppe } from '@shared/appFreigaben'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { modules } from '../registry'

interface Lehrkraft {
  id: string
  name: string
  benutzer: string
}

/**
 * Schule & Daten › App-Freigaben (23.10.2026, Wunsch der Lehrkraft; Regeln in shared/appFreigaben.ts, Speicher in
 * server/appFreigaben.ts). Abgestimmt: eigene Gruppen von Lehrkräften, Grundgruppe „Alle Lehrkräfte" (anfangs alle Apps
 * von heute), neue Apps zunächst nur für Admins, ohne Freigabe gesperrt (eigenes Material bleibt als PDF exportierbar),
 * nur Admins verwalten. Admins sehen immer alles.
 */
export function AppFreigaben(): React.JSX.Element {
  const [gruppen, setGruppen] = useState<AppGruppe[] | null>(null)
  const [lehrkraefte, setLehrkraefte] = useState<Lehrkraft[]>([])
  const [geaendert, setGeaendert] = useState(false)
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    void holen<{ gruppen: AppGruppe[]; lehrkraefte: Lehrkraft[] }>('/server/app-freigaben')
      .then((d) => {
        setGruppen(d.gruppen)
        setLehrkraefte(d.lehrkraefte ?? [])
      })
      .catch((e: unknown) => notifyError(e, 'Die App-Freigaben konnten nicht geladen werden'))
  }, [])

  // Alle Apps für Lehrkräfte: was es auf dem Server gibt, ohne die Verwaltung selbst
  const apps = useMemo(() => {
    const ids = [...new Set([...modules.map((m) => m.id), ...STAND_APPS])].filter((id) => id !== 'verwaltung')
    return ids.map((id) => ({ id, name: modules.find((m) => m.id === id)?.name ?? id }))
  }, [])
  const auswahl = useMemo(
    () => lehrkraefte.map((l) => ({ value: l.id, label: l.name || l.benutzer })).sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [lehrkraefte]
  )

  if (!gruppen) return <Loader />
  const vergeben = new Set(gruppen.flatMap((g) => g.apps))
  const nurAdmins = apps.filter((a) => !vergeben.has(a.id))

  const aendern = (id: string, f: (g: AppGruppe) => AppGruppe): void => {
    setGruppen(gruppen.map((g) => (g.id === id ? f(g) : g)))
    setGeaendert(true)
  }
  const neueGruppe = (): void => {
    const id = `g-${Date.now().toString(36)}`
    setGruppen([...gruppen, { id, name: 'Neue Gruppe', apps: [], mitglieder: [] }])
    setGeaendert(true)
  }
  const speichern = async (): Promise<void> => {
    setSpeichert(true)
    try {
      const d = await senden<{ gruppen: AppGruppe[]; lehrkraefte: Lehrkraft[] }>('/server/app-freigaben', { gruppen })
      setGruppen(d.gruppen)
      setLehrkraefte(d.lehrkraefte ?? lehrkraefte)
      setGeaendert(false)
      notifySuccess('App-Freigaben gespeichert. Lehrkräfte sehen die Änderung, sobald sie die Seite neu laden.')
    } catch (e) {
      notifyError(e, 'Die App-Freigaben konnten nicht gespeichert werden')
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <Stack gap="md" maw={980} data-app-freigaben>
      <Group justify="space-between" align="start">
        <div>
          <Title order={3}>App-Freigaben</Title>
          <Text size="sm" c="dimmed" maw={680}>
            Welche Apps Lehrkräfte sehen und benutzen. Jede Lehrkraft gehört zu „Alle Lehrkräfte“ und darf zusätzlich alles, was eine ihrer
            Gruppen darf. Admins sehen immer alle Apps. Ohne Freigabe ist eine App gesperrt; eigenes Material daraus bleibt erhalten und
            lässt sich als PDF speichern.
          </Text>
        </div>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={neueGruppe} data-app-gruppe-neu>
            Gruppe hinzufügen
          </Button>
          <Button onClick={() => void speichern()} loading={speichert} disabled={!geaendert} data-app-freigaben-speichern>
            Speichern
          </Button>
        </Group>
      </Group>

      {nurAdmins.length > 0 && (
        <Alert color="orange" variant="light" icon={<IconInfoCircle size={18} />} data-app-nur-admins>
          Noch in keiner Gruppe freigegeben – nur Admins sehen: {nurAdmins.map((a) => a.name).join(', ')}
        </Alert>
      )}

      {gruppen.map((g) => {
        const alle = g.id === ALLE_GRUPPE
        return (
          <Card key={g.id} withBorder padding="md" data-app-gruppe={g.id}>
            <Group justify="space-between" align="end" mb="sm">
              {alle ? (
                <div>
                  <Text fw={700}>Alle Lehrkräfte</Text>
                  <Text size="xs" c="dimmed">
                    Grundgruppe – jede Lehrkraft gehört dazu
                  </Text>
                </div>
              ) : (
                <Group gap="sm" align="end" style={{ flex: 1 }}>
                  <TextInput
                    label="Name der Gruppe"
                    value={g.name}
                    onChange={(e) => {
                      const name = e.currentTarget.value
                      aendern(g.id, (x) => ({ ...x, name }))
                    }}
                    w={240}
                    data-app-gruppe-name
                  />
                  <MultiSelect
                    label="Lehrkräfte"
                    placeholder={g.mitglieder.length ? undefined : 'Lehrkräfte wählen …'}
                    data={auswahl}
                    value={g.mitglieder}
                    onChange={(mitglieder) => aendern(g.id, (x) => ({ ...x, mitglieder }))}
                    searchable
                    clearable
                    style={{ flex: 1, minWidth: 260 }}
                    data-app-gruppe-mitglieder
                  />
                </Group>
              )}
              {!alle && (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`Gruppe „${g.name}“ löschen`}
                  onClick={() => {
                    setGruppen(gruppen.filter((x) => x.id !== g.id))
                    setGeaendert(true)
                  }}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              )}
            </Group>
            <Group gap={6} mb={6}>
              <Text size="sm" fw={600}>
                Freigegebene Apps
              </Text>
              <Badge size="sm" variant="light">
                {g.apps.filter((a) => apps.some((x) => x.id === a)).length} von {apps.length}
              </Badge>
              <Button size="compact-xs" variant="subtle" onClick={() => aendern(g.id, (x) => ({ ...x, apps: apps.map((a) => a.id) }))}>
                alle
              </Button>
              <Button size="compact-xs" variant="subtle" onClick={() => aendern(g.id, (x) => ({ ...x, apps: [] }))}>
                keine
              </Button>
            </Group>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing={6}>
              {apps.map((a) => (
                <Checkbox
                  key={a.id}
                  label={a.name}
                  checked={g.apps.includes(a.id)}
                  onChange={(e) => {
                    const an = e.currentTarget.checked
                    aendern(g.id, (x) => ({ ...x, apps: an ? [...x.apps, a.id] : x.apps.filter((y) => y !== a.id) }))
                  }}
                  data-app-freigabe={a.id}
                />
              ))}
            </SimpleGrid>
          </Card>
        )
      })}
    </Stack>
  )
}
