import { Badge, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconAlertTriangle, IconBook2, IconChevronDown, IconChevronRight, IconCircleCheck, IconInfoCircle, IconMovie, IconPhoto } from '@tabler/icons-react'
import { useState } from 'react'
import { gliedereHinweise, type HinweisArt, type HinweisGruppe } from '../didactics/hinweise'

/**
 * Der „Hinweis der KI" als gegliederte Karten statt als ein Absatz.
 *
 * Befund der Lehrkraft (26.09.2026): Der bisherige Kasten fasste Planung, Quellenwahl,
 * Kürzungsprotokoll und Quellenwarnung in einen Fließtext – „unübersichtlich und überfrachtet".
 * Jetzt: je Thema eine Karte mit Überschrift, Stand in einer Zeile, wenigen Stichpunkten und
 * eingeklappten Einzelheiten. Was Aufmerksamkeit verlangt, trägt ein Warndreieck; was in
 * Ordnung ist, einen grünen Haken.
 */
const SYMBOL: Record<HinweisArt, React.ReactNode> = {
  blatt: <IconInfoCircle size={16} />,
  quelle: <IconBook2 size={16} />,
  quellen: <IconAlertTriangle size={16} />,
  medien: <IconMovie size={16} />,
  bilder: <IconPhoto size={16} />
}

function Karte({ gruppe }: { gruppe: HinweisGruppe }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const farbe = gruppe.warnung ? 'orange' : 'gray'
  return (
    <Paper withBorder p="sm" radius="md" style={{ borderColor: gruppe.warnung ? 'var(--mantine-color-orange-4)' : undefined }} data-hinweis-gruppe={gruppe.art}>
      <Stack gap={4}>
        <Group gap={6} wrap="nowrap" align="center">
          <Text c={farbe} style={{ display: 'flex' }}>
            {SYMBOL[gruppe.art]}
          </Text>
          <Text size="sm" fw={600} style={{ flex: 1 }}>
            {gruppe.titel}
          </Text>
          {gruppe.art !== 'blatt' && (
            <Badge
              size="xs"
              variant="light"
              color={gruppe.warnung ? 'orange' : 'green'}
              leftSection={gruppe.warnung ? <IconAlertTriangle size={10} /> : <IconCircleCheck size={10} />}
            >
              {gruppe.warnung ? 'Vor dem Einsatz prüfen' : 'In Ordnung'}
            </Badge>
          )}
        </Group>
        {gruppe.stand && (
          <Text size="sm" pl={22}>
            {gruppe.stand}
          </Text>
        )}
        {gruppe.punkte.length > 0 && (
          <Stack gap={2} pl={22}>
            {gruppe.punkte.map((p, i) => (
              <Text key={i} size="sm" c={gruppe.art === 'blatt' ? undefined : 'dimmed'}>
                {gruppe.art === 'blatt' ? p : `· ${p}`}
              </Text>
            ))}
          </Stack>
        )}
        {gruppe.details.length > 0 && (
          <div style={{ paddingLeft: 22 }}>
            <UnstyledButton onClick={() => setOffen((o) => !o)} aria-expanded={offen}>
              <Group gap={4} wrap="nowrap">
                {offen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                <Text size="xs" c="blue">
                  {offen ? 'Einzelheiten ausblenden' : `Einzelheiten anzeigen (${gruppe.details.length})`}
                </Text>
              </Group>
            </UnstyledButton>
            {offen && (
              <Stack gap={2} mt={4}>
                {gruppe.details.map((d, i) => (
                  <Text key={i} size="xs" c="dimmed">
                    · {d}
                  </Text>
                ))}
              </Stack>
            )}
          </div>
        )}
      </Stack>
    </Paper>
  )
}

export function KiHinweise({ note }: { note?: string }): React.JSX.Element | null {
  const gruppen = gliedereHinweise(note)
  if (!gruppen.length) return null
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        Hinweise der KI
      </Text>
      {gruppen.map((g) => (
        <Karte key={g.art} gruppe={g} />
      ))}
    </Stack>
  )
}
