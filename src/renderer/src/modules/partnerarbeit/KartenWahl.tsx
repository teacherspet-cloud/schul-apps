/**
 * Kartenwahl der Partnerarbeit (24.10.2026, abgestimmt mit der Lehrkraft): drei Spalten Interview · Monolog · Dialog mit
 * Kacheln (Bild bei Bildkarten, Titel, Stand, Marke für Hilfen/dritte Rolle) und Häkchen, je Spalte „alle/keine".
 * Gefiltert nach dem gewählten Lehrwerk-Stand; anfangs alle gewählt. Das Auge öffnet die Vorschau: die Karte wie in der
 * Pool-App oder „So sehen es die Lernenden" (A|B|C), mit Pfeilen zur nächsten Karte der Spalte.
 */
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Image,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconEye } from '@tabler/icons-react'
import { useState } from 'react'
import { standText, type SprechKarte } from '@shared/sprechen/karten'
import type { Niveau, SprechSprache } from '@shared/sprechen/niveaus'
import { PA_TEIL_NAME, PA_TEILE, type PaTeil } from '@shared/partnerarbeit/typen'
import { HilfenMarke, KartenAnsicht } from '../sprechpruefungen/SprechpruefungenModule'
import { PartnerVorschau } from './PartnerVorschau'

const bildUrl = (datei: string): string => `/server/sprech-bank/bild/${datei}`
const titelVon = (k: SprechKarte): string => (k.art === 'interview' ? k.thema : k.titel)

/** Vorschau einer Karte: Karte | Partnersicht, Blättern innerhalb der Spalte */
export function KartenVorschauFenster({
  karten,
  start,
  sprache,
  jahrgang,
  niveau,
  groesse = 2,
  schliessen
}: {
  karten: SprechKarte[]
  start: number
  sprache: SprechSprache
  jahrgang: number | null
  niveau?: Niveau
  groesse?: 2 | 3
  schliessen: () => void
}): React.JSX.Element {
  const [i, setI] = useState(start)
  const [sicht, setSicht] = useState<'karte' | 'lernende'>('karte')
  const k = karten[i]
  if (!k) return <></>
  return (
    <Modal opened onClose={schliessen} size={sicht === 'lernende' ? '100%' : 'lg'} title={titelVon(k)} data-pa-kartenvorschau={k.id}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <SegmentedControl
            size="xs"
            value={sicht}
            onChange={(v) => setSicht(v as 'karte' | 'lernende')}
            data={[
              { value: 'karte', label: 'Karte' },
              { value: 'lernende', label: 'So sehen es die Lernenden' }
            ]}
            data-pa-vorschau-sicht
          />
          <Group gap="xs">
            <ActionIcon
              variant="light"
              onClick={() => setI((x) => Math.max(0, x - 1))}
              disabled={i === 0}
              aria-label="Vorherige Karte"
              data-pa-vorschau-zurueck
            >
              <IconChevronLeft size={16} />
            </ActionIcon>
            <Text size="sm" c="dimmed">
              {i + 1} von {karten.length}
            </Text>
            <ActionIcon
              variant="light"
              onClick={() => setI((x) => Math.min(karten.length - 1, x + 1))}
              disabled={i >= karten.length - 1}
              aria-label="Nächste Karte"
              data-pa-vorschau-weiter
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </Group>
        </Group>
        {sicht === 'karte' ? (
          <KartenAnsicht key={k.id} k={k} schliessen={schliessen} eingebettet />
        ) : (
          <PartnerVorschau key={k.id} karten={[k]} sprache={sprache} jahrgang={jahrgang} teile={[k.art as PaTeil]} groesse={groesse} niveau={niveau} />
        )}
      </Stack>
    </Modal>
  )
}

export function KartenWahl({
  karten,
  gewaehlt,
  aendern,
  sprache,
  jahrgang,
  niveau,
  groesse
}: {
  /** Karten im gewählten Lehrwerk-Stand */
  karten: SprechKarte[]
  gewaehlt: Set<string>
  aendern: (neu: Set<string>) => void
  sprache: SprechSprache
  jahrgang: number | null
  niveau?: Niveau
  groesse?: 2 | 3
}): React.JSX.Element {
  const [vorschau, setVorschau] = useState<{ teil: PaTeil; index: number } | null>(null)
  const spalte = (teil: PaTeil): SprechKarte[] => karten.filter((k) => k.art === teil)
  const setze = (ids: string[], an: boolean): void => {
    const neu = new Set(gewaehlt)
    for (const id of ids) an ? neu.add(id) : neu.delete(id)
    aendern(neu)
  }
  const anzahl = karten.filter((k) => gewaehlt.has(k.id)).length
  return (
    <Stack gap="xs" data-pa-kartenwahl>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
        {PA_TEILE.map((teil) => {
          const l = spalte(teil)
          const n = l.filter((k) => gewaehlt.has(k.id)).length
          return (
            <Stack key={teil} gap={6} data-pa-kartenwahl-spalte={teil}>
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text fw={700} size="sm">
                  {PA_TEIL_NAME[teil]}{' '}
                  <Text span c="dimmed" size="xs">
                    ({n === l.length ? l.length : `${n} von ${l.length}`})
                  </Text>
                </Text>
                {l.length > 0 && (
                  <Group gap={2}>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={() =>
                        setze(
                          l.map((k) => k.id),
                          true
                        )
                      }
                      data-pa-kartenwahl-alle={teil}
                    >
                      alle
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={() =>
                        setze(
                          l.map((k) => k.id),
                          false
                        )
                      }
                      data-pa-kartenwahl-keine={teil}
                    >
                      keine
                    </Button>
                  </Group>
                )}
              </Group>
              {!l.length && (
                <Text size="xs" c="dimmed">
                  Keine Karten bis zu diesem Stand.
                </Text>
              )}
              {l.map((k, index) => {
                const an = gewaehlt.has(k.id)
                return (
                  <Card key={k.id} withBorder radius="md" padding="xs" style={{ opacity: an ? 1 : 0.6 }} data-pa-karte={k.id} data-gewaehlt={an ? '1' : '0'}>
                    <Group gap="xs" wrap="nowrap" align="flex-start">
                      <Checkbox
                        checked={an}
                        onChange={(e) => setze([k.id], e.currentTarget.checked)}
                        aria-label={`${titelVon(k)} wählen`}
                        mt={2}
                        data-pa-karte-haken
                      />
                      <UnstyledButton onClick={() => setze([k.id], !an)} style={{ flex: 1, minWidth: 0 }}>
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                          {k.art === 'monolog' && k.bilder[0] && (
                            <Image src={bildUrl(k.bilder[0])} w={56} h={42} radius="sm" fit="cover" alt="" aria-hidden="true" />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600} lineClamp={1}>
                              {titelVon(k)}
                            </Text>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {k.stand ? standText(k.stand).replace(/^bis /, '') : 'ohne Lehrwerk-Stand'}
                            </Text>
                            <HilfenMarke k={k} />
                          </div>
                        </Group>
                      </UnstyledButton>
                      <Tooltip label="Vorschau">
                        <ActionIcon variant="subtle" onClick={() => setVorschau({ teil, index })} aria-label="Vorschau" data-pa-karte-auge>
                          <IconEye size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                    {k.art === 'dialog' && (
                      <Badge size="xs" variant="light" color={(k.hilfen?.rollen.length ?? 2) >= 3 ? 'teal' : 'gray'} tt="none" mt={4}>
                        {(k.hilfen?.rollen.length ?? 2) >= 3 ? '3 Rollen' : '2 Rollen'}
                      </Badge>
                    )}
                  </Card>
                )
              })}
            </Stack>
          )
        })}
      </SimpleGrid>
      <Text size="sm" c="dimmed" data-pa-kartenwahl-zahl>
        Gewählt: {anzahl} von {karten.length} Karten
      </Text>
      {vorschau && (
        <KartenVorschauFenster
          karten={spalte(vorschau.teil)}
          start={vorschau.index}
          sprache={sprache}
          jahrgang={jahrgang}
          niveau={niveau}
          groesse={groesse}
          schliessen={() => setVorschau(null)}
        />
      )}
    </Stack>
  )
}
