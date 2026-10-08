/**
 * Reihenart wählen und wechseln (08.10.2026, Plan „Unterrichtsreihe" E1/E5): drei Karten beim Anlegen einer neuen Reihe
 * (auch aus „Laufende Reihen" und „Meine Klassen" – alle Wege legen über `neueReihe` ohne Art an), eine Plakette im Kopf
 * und dort der Wechsel mit Rückfrage, die erklärt, was umgebaut wird (reihePlanung.ts). Eine zugewiesene Reihe kann
 * nicht zur Planungsreihe werden (der Server prüft es beim Speichern ebenfalls).
 */
import { Alert, Badge, Button, Card, Group, List, Menu, Modal, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconDeviceLaptop, IconNotes, IconUsersGroup } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { artVon, REIHEN_ARTEN, type Reihe, type ReiheArt } from '@shared/reihe'
import { holen } from '../onlinetest/serverApi'
import { wechselHinweis } from './reihePlanung'

const SYMBOL: Record<ReiheArt, typeof IconNotes> = { digital: IconDeviceLaptop, gemischt: IconUsersGroup, planung: IconNotes }
export const ART_FARBE: Record<ReiheArt, string> = { digital: 'cyan', gemischt: 'blue', planung: 'grape' }

/** Drei Karten: Welche Art von Reihe? */
export function ArtWahl({ waehle }: { waehle: (a: ReiheArt) => void }): React.JSX.Element {
  return (
    <Card withBorder p="lg" data-reihe-art-wahl>
      <Stack gap="sm">
        <Text fw={700} size="lg">
          Welche Art von Reihe?
        </Text>
        <Text size="sm" c="dimmed">
          Die Art lässt sich später im Kopf der Reihe ändern – die Schritte bzw. Phasen werden dabei umgewandelt.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {REIHEN_ARTEN.map((a) => {
            const Symbol = SYMBOL[a.id]
            return (
              <UnstyledButton key={a.id} onClick={() => waehle(a.id)} data-reihe-art={a.id} style={{ height: '100%' }}>
                <Card withBorder radius="md" p="md" h="100%" style={{ borderColor: `var(--mantine-color-${ART_FARBE[a.id]}-4)` }}>
                  <Group gap="xs" mb={6} wrap="nowrap">
                    <Symbol size={22} color={`var(--mantine-color-${ART_FARBE[a.id]}-6)`} />
                    <Text fw={700}>{a.label}</Text>
                    <Text size="xs" c="dimmed">
                      {a.kurz}
                    </Text>
                  </Group>
                  <Text size="sm">{a.text}</Text>
                </Card>
              </UnstyledButton>
            )
          })}
        </SimpleGrid>
      </Stack>
    </Card>
  )
}

/** Plakette der Art im Kopf – Klick: Art wechseln */
export function ArtPlakette({ reihe, wechseln }: { reihe: Reihe; wechseln: (nach: ReiheArt) => void }): React.JSX.Element {
  const art = artVon(reihe)
  const a = REIHEN_ARTEN.find((x) => x.id === art)!
  const [ziel, setZiel] = useState<ReiheArt | null>(null)
  return (
    <>
      <Menu position="bottom-start" withinPortal width={320}>
        <Menu.Target>
          <Tooltip label={`${a.text} – Klick: Art ändern`} multiline w={300} openDelay={400}>
            <Badge
              variant="light"
              color={ART_FARBE[art]}
              rightSection={<IconChevronDown size={10} />}
              style={{ cursor: 'pointer', textTransform: 'none', flexShrink: 0 }}
              data-reihe-art-plakette={art}
            >
              {a.label}
            </Badge>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Art der Reihe ändern</Menu.Label>
          {REIHEN_ARTEN.filter((x) => x.id !== art).map((x) => (
            <Menu.Item key={x.id} onClick={() => setZiel(x.id)} data-reihe-art-nach={x.id}>
              <Text size="sm" fw={600}>
                {x.label}
              </Text>
              <Text size="xs" c="dimmed">
                {x.text}
              </Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      {ziel && (
        <WechselFenster
          reihe={reihe}
          nach={ziel}
          schliessen={() => setZiel(null)}
          los={() => {
            wechseln(ziel)
            setZiel(null)
          }}
        />
      )}
    </>
  )
}

/** Rückfrage: was beim Wechsel geschieht; „Planung" nur ohne Zuweisungen */
function WechselFenster({ reihe, nach, schliessen, los }: { reihe: Reihe; nach: ReiheArt; schliessen: () => void; los: () => void }): React.JSX.Element {
  const [zugewiesen, setZugewiesen] = useState<number | null>(nach === 'planung' && reihe.id ? null : 0)
  useEffect(() => {
    if (nach !== 'planung' || !reihe.id) return
    let aktiv = true
    void holen<{ reihen: { id: string; zuweisungen: unknown[] }[] }>('/server/reihen').then(
      (d) => aktiv && setZugewiesen(d.reihen.find((x) => x.id === reihe.id)?.zuweisungen.length ?? 0),
      () => aktiv && setZugewiesen(0)
    )
    return () => {
      aktiv = false
    }
  }, [nach, reihe.id])
  const von = REIHEN_ARTEN.find((x) => x.id === artVon(reihe))!
  const zu = REIHEN_ARTEN.find((x) => x.id === nach)!
  const gesperrt = nach === 'planung' && (zugewiesen ?? 0) > 0
  return (
    <Modal opened onClose={schliessen} title={`Von „${von.label}“ zu „${zu.label}“ wechseln?`} size="md">
      <Stack gap="sm" data-reihe-art-wechsel={nach}>
        <Text size="sm" c="dimmed">
          {zu.text}
        </Text>
        {gesperrt ? (
          <Alert color="red" variant="light" data-reihe-art-gesperrt>
            Die Reihe ist zugewiesen ({zugewiesen}) – eine zugewiesene Reihe kann keine Planungsreihe werden. Beende bzw. lösche zuerst die Zuweisungen oder
            verdopple die Reihe.
          </Alert>
        ) : (
          <>
            <Text size="sm" fw={600}>
              Was geschieht:
            </Text>
            <List size="sm" spacing={4}>
              {wechselHinweis(reihe, nach).map((z) => (
                <List.Item key={z}>{z}</List.Item>
              ))}
            </List>
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button disabled={gesperrt || zugewiesen === null} loading={zugewiesen === null} onClick={los} data-reihe-art-los>
            Wechseln
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
