/**
 * Abschnitte eines Vokabelkurses in „Meine Klassen" → Reiter „Vokabeln" (09.10.2026, Wunsch der Lehrkraft): Übersicht
 * wie die Grammatik-Liste – je Unit gruppiert (die neueste offen, ältere zugeklappt, Suchfeld), je Abschnitt Wörter,
 * Freigabedatum, Stand der Klasse (sicher / im Aufbau / neu) und wie viele nach 14 Tagen noch unter 30 % sicher sind.
 * Ein Klick auf einen Abschnitt zeigt die schwierigsten Wörter und je Person eine kleine Ampel.
 * Die Zahlen rechnet der Server (shared/kursAbschnitte.ts `abschnittStatistik`).
 */
import { Badge, Collapse, Group, Progress, Stack, Table, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconSearch } from '@tabler/icons-react'
import { Fragment, useMemo, useState } from 'react'
import { nachUnits, REIF_TAGE, SCHWACH_UNTER, type AbschnittStatistik } from '@shared/kursAbschnitte'
import { ampel } from './MaterialListe'
import { GeplantMarke } from '../../shared/components/FreigabePlanen'
import { useExperte } from '../../shared/settingsStore'

const prozent = (x: number): string => `${Math.round(x * 100)} %`
const tag = (x: number): string => (x ? new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–')
const OHNE_UNIT = 'Weitere Vokabeln'

/** Balken sicher / im Aufbau / neu */
function StandBalken({ a, breite }: { a: Pick<AbschnittStatistik, 'sicher' | 'aufbau' | 'neu'>; breite?: number }): React.JSX.Element {
  return (
    <Tooltip label={`sicher ${prozent(a.sicher)} · im Aufbau ${prozent(a.aufbau)} · neu ${prozent(a.neu)}`}>
      <Progress.Root size="md" radius="xl" w={breite} style={{ flex: breite ? undefined : 1 }} data-abschnitt-stand>
        <Progress.Section value={a.sicher * 100} color="green" />
        <Progress.Section value={a.aufbau * 100} color="yellow" />
        <Progress.Section value={a.neu * 100} color="gray.4" />
      </Progress.Root>
    </Tooltip>
  )
}

/** Kleine Ampel je Person: nach 14 Tagen der Anteil sicher, vorher der Anteil kennengelernt (sicher + im Aufbau) */
function PersonenAmpeln({ a, namen }: { a: AbschnittStatistik; namen: string[] }): React.JSX.Element {
  const reif = a.schwach !== null
  return (
    <Group gap={4} data-abschnitt-personen>
      {namen.map((name, i) => {
        const [s, au] = a.jeLernende[i] ?? [0, 0]
        const wert = reif ? s : s + au
        return (
          <Tooltip key={`${name}-${i}`} label={`${name}: sicher ${prozent(s)} · im Aufbau ${prozent(au)} · neu ${prozent(Math.max(0, 1 - s - au))}`}>
            <Badge size="sm" variant="light" color={ampel(wert)} tt="none" leftSection="●" data-person-ampel={ampel(wert)}>
              {name}
            </Badge>
          </Tooltip>
        )
      })}
    </Group>
  )
}

export function VokabelAbschnitte({ abschnitte, namen }: { abschnitte: AbschnittStatistik[]; namen: string[] }): React.JSX.Element | null {
  const experte = useExperte()
  const [suche, setSuche] = useState('')
  /** Zu- bzw. aufgeklappte Units (Abweichung vom Standard: neueste offen) */
  const [umgeschaltet, setUmgeschaltet] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<number | null>(null)
  const q = suche.trim().toLowerCase()
  const gruppen = useMemo(() => {
    const passend = q
      ? abschnitte.filter((a) =>
          `${a.unit} ${a.name} ${a.probleme.map((p) => `${p.term} ${p.translation}`).join(' ')}`.toLowerCase().includes(q)
        )
      : abschnitte
    return nachUnits(passend)
  }, [abschnitte, q])
  if (!abschnitte.length) return null
  const offen = (unit: string, i: number): boolean => Boolean(q) || (i === 0) !== umgeschaltet.has(unit)
  const umschalten = (unit: string): void =>
    setUmgeschaltet((s) => {
      const n = new Set(s)
      if (n.has(unit)) n.delete(unit)
      else n.add(unit)
      return n
    })
  return (
    <Stack gap={6} mt="xs" data-vok-abschnitte>
      {abschnitte.length > 4 && (
        <TextInput
          size="xs"
          placeholder="Abschnitt, Unit oder Wort suchen"
          leftSection={<IconSearch size={13} />}
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          maw={320}
          data-abschnitt-suche
        />
      )}
      {!gruppen.length && (
        <Text size="xs" c="dimmed">
          Kein Abschnitt passt zur Suche.
        </Text>
      )}
      {gruppen.map((g, i) => {
        const auf = offen(g.unit, i)
        const woerter = g.zeilen.reduce((s, z) => s + z.woerter, 0)
        const sicher = woerter ? g.zeilen.reduce((s, z) => s + z.sicher * z.woerter, 0) / woerter : 0
        return (
          <div key={g.unit || OHNE_UNIT} data-abschnitt-gruppe={g.unit || OHNE_UNIT} data-offen={auf || undefined}>
            <UnstyledButton onClick={() => umschalten(g.unit)} aria-expanded={auf} data-abschnitt-gruppe-knopf>
              <Group gap={4} wrap="nowrap">
                {auf ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                <Text size="sm" fw={600}>
                  {g.unit || OHNE_UNIT}
                </Text>
                <Text size="xs" c="dimmed">
                  {g.zeilen.length} {g.zeilen.length === 1 ? 'Abschnitt' : 'Abschnitte'} · {woerter} Wörter · {prozent(sicher)} sicher
                </Text>
              </Group>
            </UnstyledButton>
            <Collapse expanded={auf}>
              <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing={4} horizontalSpacing="xs" fz="xs" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Abschnitt</Table.Th>
                      <Table.Th>Wörter</Table.Th>
                      <Table.Th>freigegeben</Table.Th>
                      <Table.Th w="34%">Stand der Klasse</Table.Th>
                      <Table.Th>
                        <Tooltip label={`Lernende unter ${prozent(SCHWACH_UNTER)} sicher – gezählt ab ${REIF_TAGE} Tagen nach der Freigabe`}>
                          <span>Schwierigkeiten</span>
                        </Tooltip>
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {g.zeilen.map((a) => (
                      <Fragment key={a.index}>
                        <Table.Tr
                          style={{ cursor: 'pointer' }}
                          onClick={() => setDetail((d) => (d === a.index ? null : a.index))}
                          aria-expanded={detail === a.index}
                          data-abschnitt={a.name}
                        >
                          <Table.Td>
                            <Group gap={4} wrap="nowrap">
                              {detail === a.index ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                              <Text size="xs" fw={500}>
                                {a.name}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>{a.woerter}</Table.Td>
                          {/* Geplanter Abschnitt (09.10.2026): `zeit` ist der geplante Zeitpunkt */}
                          <Table.Td>{a.zeit > Date.now() ? <GeplantMarke ab={a.zeit} /> : tag(a.zeit)}</Table.Td>
                          <Table.Td>
                            <StandBalken a={a} />
                          </Table.Td>
                          <Table.Td data-abschnitt-schwach={a.schwach ?? ''}>
                            {a.schwach === null ? (
                              <Text size="xs" c="dimmed">
                                noch zu früh
                              </Text>
                            ) : a.schwach ? (
                              <Badge size="sm" variant="light" color={a.schwach / Math.max(1, namen.length) >= 0.3 ? 'red' : 'orange'}>
                                {a.schwach} von {namen.length}
                              </Badge>
                            ) : (
                              <Text size="xs" c="teal">
                                keine
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                        {detail === a.index && (
                          <Table.Tr data-abschnitt-detail>
                            <Table.Td colSpan={5}>
                              <Stack gap={6} py={4}>
                                <Text size="xs">
                                  <b>Schwierigste Wörter:</b>{' '}
                                  {/* Fehlerquoten nur im Expertenmodus (09.10.2026) */}
                                  {a.probleme.length
                                    ? a.probleme.map((p) => `${p.term} – ${p.translation}${experte ? ` (${prozent(p.quote)} falsch)` : ''}`).join('; ')
                                    : experte
                                      ? 'noch keine (erst ab drei Versuchen gezählt)'
                                      : 'noch keine'}
                                </Text>
                                {namen.length > 0 ? (
                                  <PersonenAmpeln a={a} namen={namen} />
                                ) : (
                                  <Text size="xs" c="dimmed">
                                    Noch keine Lernenden im Kurs.
                                  </Text>
                                )}
                              </Stack>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Fragment>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Collapse>
          </div>
        )
      })}
    </Stack>
  )
}
