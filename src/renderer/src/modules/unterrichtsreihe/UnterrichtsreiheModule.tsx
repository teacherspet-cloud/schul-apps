/**
 * Programm „Unterrichtsreihe" (Etappe 6, 02.10.2026; nur mit dem Schul-Apps-Server – src/server/reihen.ts).
 *
 * Lernpfad für Lernende: Die Lehrkraft baut eine Reihe zu einem Oberthema aus Schritten (Arbeitsblatt,
 * Test, Schreibaufgabe, Zwischenaufgabe, Lernkarten, Selbsteinschätzung, Diagnose, Präsenz,
 * Wissensspeicher, Abschlussprodukt, Sprechaufgabe), legt Lernziele fest (Kerncurriculum oder KI)
 * und weist sie zu. Wer einen Schritt schafft, schaltet den nächsten frei (Regeln: shared/reihe.ts).
 */
import { Badge, Button, Card, Group, Loader, Menu, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { IconChartDots, IconDots, IconPlus, IconRoute, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { Reihe } from '@shared/reihe'
import { fachVon } from '@shared/faecher'
import { useAppSettings } from '../../shared/settingsStore'
import { notifyError } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { ReiheEditor } from './ReiheEditor'
import { Uebersicht } from './Uebersicht'

interface ReiheKurz {
  id: string
  titel: string
  fach: string
  fachId: string
  oberthema: string
  schritte: number
  geaendert: string
  zuweisungen: { id: string; lerngruppe: string; schueler: number; status: string }[]
}

function neueReihe(): Reihe {
  const { settings } = useAppSettings.getState()
  const fachId = settings.eigeneFaecher?.[0] ?? 'englisch'
  return {
    id: '',
    titel: '',
    fachId,
    fachLabel: fachVon(fachId)?.label ?? fachId,
    stateId: settings.defaults.stateId,
    schoolTypeId: settings.defaults.schoolTypeId,
    grade: 7,
    oberthema: '',
    lernziele: [],
    schritte: []
  }
}

export default function UnterrichtsreiheModule(): React.JSX.Element {
  const [ansicht, setAnsicht] = useState<{ art: 'liste' } | { art: 'editor'; reihe: Reihe } | { art: 'uebersicht'; zid: string }>({ art: 'liste' })
  const [liste, setListe] = useState<ReiheKurz[] | null>(null)
  const laden = useCallback(
    () =>
      void holen<{ reihen: ReiheKurz[] }>('/server/reihen').then(
        (d) => setListe(d.reihen),
        (e: unknown) => notifyError(e)
      ),
    []
  )
  useEffect(() => {
    if (ansicht.art === 'liste') laden()
  }, [ansicht.art, laden])
  if (ansicht.art === 'editor')
    return (
      <Rahmen>
        <ReiheEditor start={ansicht.reihe} zurueck={() => setAnsicht({ art: 'liste' })} />
      </Rahmen>
    )
  if (ansicht.art === 'uebersicht')
    return (
      <Rahmen>
        <Uebersicht zid={ansicht.zid} zurueck={() => setAnsicht({ art: 'liste' })} />
      </Rahmen>
    )
  const oeffnen = (id: string): void =>
    void holen<{ reihe: Reihe }>(`/server/reihen/${id}`).then(
      (d) => setAnsicht({ art: 'editor', reihe: d.reihe }),
      (e: unknown) => notifyError(e)
    )
  return (
    <Rahmen>
      <Stack data-reihen-liste>
        <Group justify="space-between">
          <div>
            <Title order={2}>Unterrichtsreihen</Title>
            <Text c="dimmed" size="sm">
              Lernpfade für Lernende: Schritt für Schritt freischalten, mit Lernzielen aus dem Kerncurriculum, eigenem Tempo und Haltepunkten.
            </Text>
          </div>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setAnsicht({ art: 'editor', reihe: neueReihe() })} data-reihe-neu>
            Neue Reihe
          </Button>
        </Group>
        {!liste && <Loader size="sm" />}
        {liste?.length === 0 && (
          <Text c="dimmed">
            Noch keine Reihe. Tipp: Erst Arbeitsblätter, Tests und Rückmeldungs-Aufgaben in den anderen Apps anlegen – hier werden sie zu Schritten.
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
          {liste?.map((r) => (
            <Card key={r.id} withBorder padding="md" data-reihe-karte={r.titel}>
              <Group justify="space-between" wrap="nowrap" align="start">
                <div style={{ minWidth: 0 }}>
                  <Text fw={700} truncate>
                    {r.titel}
                  </Text>
                  <Text size="sm" c="dimmed" truncate>
                    {r.fach} · {r.oberthema || 'ohne Oberthema'} · {r.schritte} Schritte
                  </Text>
                </div>
                <Menu position="bottom-end">
                  <Menu.Target>
                    <Button variant="subtle" size="xs" px={6} aria-label="Mehr">
                      <IconDots size={16} />
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => {
                        if (window.confirm(`„${r.titel}“ löschen? Zuweisungen und Fortschritt der Lernenden gehen verloren.`))
                          void senden(`/server/reihen/${r.id}/loeschen`).then(laden, (e: unknown) => notifyError(e))
                      }}
                    >
                      Löschen
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
              <Group gap={6} mt="sm">
                <Button size="xs" leftSection={<IconRoute size={14} />} onClick={() => oeffnen(r.id)} data-reihe-oeffnen>
                  Bearbeiten
                </Button>
                {r.zuweisungen.map((z) => (
                  <Button
                    key={z.id}
                    size="xs"
                    variant="light"
                    leftSection={<IconChartDots size={14} />}
                    onClick={() => setAnsicht({ art: 'uebersicht', zid: z.id })}
                    data-zuweisung-oeffnen
                  >
                    {z.lerngruppe}
                    {z.schueler ? ` (${z.schueler})` : ''}
                    {z.status !== 'offen' && (
                      <Badge size="xs" color="gray" ml={4}>
                        beendet
                      </Badge>
                    )}
                  </Button>
                ))}
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Rahmen>
  )
}

function Rahmen({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ padding: 'var(--mantine-spacing-lg)', maxWidth: 1400, margin: '0 auto', width: '100%' }}>{children}</div>
}
