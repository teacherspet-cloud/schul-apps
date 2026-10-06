/**
 * Aufsicht für die Lehrkraft (06.10.2026): Vorfälle einer Teilnahme als Abzeichen mit Liste (Uhrzeit, Art, Dauer).
 * Nichts davon hat den Test abgegeben – die Lehrkraft entscheidet.
 */
import { Badge, Popover, Stack, Table, Text } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'
import { VORFALL_TEXT, type VorfallArt } from './aufsicht'

export interface Vorfall {
  art: VorfallArt
  zeit: number
  dauer?: number
  info?: string
}

const uhr = (t: number): string => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const dauerText = (s?: number): string => (s === undefined ? 'läuft' : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`)

/** Ohne „Text eingefügt" (das ist oft harmlos, steht aber in der Liste) */
export const auffaellig = (v: Vorfall[] | undefined): Vorfall[] => (v ?? []).filter((x) => x.art !== 'einfuegen')

/** Kurzfassung für Export und Druck: „3× Seite verlassen (1 min 20 s), 1× Seite übersetzt" */
export function vorfallKurz(v: Vorfall[] | undefined): string {
  const je = new Map<VorfallArt, { n: number; s: number }>()
  for (const x of v ?? []) {
    const e = je.get(x.art) ?? { n: 0, s: 0 }
    e.n++
    e.s += x.dauer ?? 0
    je.set(x.art, e)
  }
  return [...je].map(([art, e]) => `${e.n}× ${VORFALL_TEXT[art] ?? art}${e.s ? ` (${dauerText(e.s)})` : ''}`).join(', ')
}

export function VorfallAbzeichen({ vorfaelle }: { vorfaelle?: Vorfall[] }): React.JSX.Element | null {
  const liste = vorfaelle ?? []
  if (!liste.length) return null
  const n = auffaellig(liste).length
  return (
    <Popover width={360} position="bottom-start" withArrow shadow="md">
      <Popover.Target>
        <Badge
          ml={6}
          color={n ? 'red' : 'gray'}
          variant={n ? 'filled' : 'light'}
          leftSection={<IconEye size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={(e) => e.stopPropagation()}
          data-vorfaelle={liste.length}
        >
          {n ? `${n} Auffälligkeit${n === 1 ? '' : 'en'}` : `${liste.length}× eingefügt`}
        </Badge>
      </Popover.Target>
      <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Protokoll der Aufsicht
          </Text>
          <Table fz="xs" verticalSpacing={2} withRowBorders={false}>
            <Table.Tbody>
              {liste.map((x, i) => (
                <Table.Tr key={i}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{uhr(x.zeit)}</Table.Td>
                  <Table.Td>
                    {VORFALL_TEXT[x.art] ?? x.art}
                    {x.info ? ` · ${x.info}` : ''}
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {x.art === 'kopieren' || x.art === 'einfuegen' || x.art === 'uebersetzt' ? '' : dauerText(x.dauer)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed">
            Nichts davon hat den Test abgegeben. Kurze Fokuswechsel können auch harmlos sein (z. B. eine Systemmeldung).
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
