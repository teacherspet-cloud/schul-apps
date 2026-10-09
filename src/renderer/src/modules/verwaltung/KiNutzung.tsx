/**
 * KI-Nutzung der Lehrkräfte im Reiter „KI-Zugänge" (09.10.2026, Auftrag des Admins).
 *
 * NUR Nutzung über die Schlüssel der Schule – private Zugänge (eigenes Abo, eigener Schlüssel)
 * erfasst der Server gar nicht (server/kiNutzung.ts). Keine Daten von Lernenden.
 *
 * Darstellung: Kennzahlen, gestapelte Säulen je Tag (die vier häufigsten Auftragsarten + „Andere",
 * feste Farbreihenfolge wie im Reiter „Server", geprüft mit dem dataviz-Prüfskript), darunter eine
 * sortier- und durchsuchbare Tabelle je Lehrkraft mit Verlaufslinie. Inline-SVG, keine Bibliothek.
 */
import { Badge, Card, Group, SimpleGrid, Stack, Table, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { GestapelteSaeulen, Kennzahl, useFarbenMitAndere, useReihenFarben } from '../../shared/components/diagramme'
import { IconArrowDown, IconArrowUp, IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'

export type KiArt = string

export interface KiLehrkraftZeile {
  id: string
  name: string
  benutzer: string
  anfragen7: number
  anfragen30: number
  auftraege30: number
  verlauf: number[]
  arten: Record<KiArt, number>
  anbieter: Record<string, number>
  fehler: number
  limits: number
}

export interface KiNutzungDaten {
  tage: string[]
  jeTag: { tag: string; arten: Record<KiArt, number>; summe: number }[]
  lehrkraefte: KiLehrkraftZeile[]
  jeAnbieter: Record<string, { lehrkraefte: number; anfragen: number }>
  arten: Record<KiArt, string>
}

const ANDERE = '__andere'
const zahl = (n: number): string => n.toLocaleString('de-DE')

/** Die vier häufigsten Arten im Zeitraum, der Rest als „Andere" */
export function hauptArten(jeTag: KiNutzungDaten['jeTag'], max = 4): string[] {
  const summe = new Map<string, number>()
  for (const t of jeTag) for (const [a, n] of Object.entries(t.arten)) summe.set(a, (summe.get(a) ?? 0) + n)
  return [...summe.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([a]) => a)
}

function SaeulenJeTag({ daten }: { daten: KiNutzungDaten }): React.JSX.Element {
  // Gestapelte Säulen aus shared/components/diagramme (09.10.2026, gemeinsam mit dem Verbrauch der Einstellungen)
  const { farben, andere } = useFarbenMitAndere()
  const haupt = hauptArten(daten.jeTag)
  const mitAndere = daten.jeTag.some((t) => Object.keys(t.arten).some((a) => !haupt.includes(a) && t.arten[a] > 0))
  const name = (a: string): string => (a === ANDERE ? 'Andere' : (daten.arten[a] ?? a))
  const wert = (t: KiNutzungDaten['jeTag'][number], a: string): number =>
    a === ANDERE ? Object.entries(t.arten).reduce((s, [k, n]) => s + (haupt.includes(k) ? 0 : n), 0) : (t.arten[a] ?? 0)
  const reihen = [...haupt, ...(mitAndere ? [ANDERE] : [])].map((a, r) => ({
    name: name(a),
    farbe: a === ANDERE ? andere : farben[r],
    werte: daten.jeTag.map((t) => wert(t, a))
  }))
  const gesamt = daten.jeTag.reduce((s, t) => s + t.summe, 0)
  const aria = `Gestapelte Säulen: KI-Anfragen je Tag über die Schlüssel der Schule, ${daten.jeTag.length} Tage, insgesamt ${gesamt}. ${reihen
    .map((r) => `${r.name}: ${r.werte.reduce((s, v) => s + v, 0)}`)
    .join(', ')}.`
  return <GestapelteSaeulen tage={daten.jeTag.map((t) => t.tag)} reihen={reihen} beschreibung={aria} />
}

/** Verlaufslinie (30 Tage) einer Lehrkraft */
function Verlaufslinie({ werte }: { werte: number[] }): React.JSX.Element {
  const farbe = useReihenFarben()[0]
  const W = 96
  const H = 24
  const max = Math.max(1, ...werte)
  const pkt = werte.map((v, i) => `${(i / Math.max(1, werte.length - 1)) * (W - 4) + 2},${H - 3 - (v / max) * (H - 6)}`)
  const letzter = pkt[pkt.length - 1]?.split(',').map(Number)
  return (
    <svg width={W} height={H} role="img" aria-label={`Verlauf 30 Tage, höchstens ${max} Anfragen an einem Tag`}>
      <polyline points={pkt.join(' ')} fill="none" stroke={farbe} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {letzter && <circle cx={letzter[0]} cy={letzter[1]} r={2.5} fill={farbe} />}
    </svg>
  )
}

type Spalte = 'name' | 'anfragen7' | 'anfragen30' | 'auftraege30' | 'fehler'

/** Sortieren und Suchen (nach Name, Benutzername, Anbieter, Auftragsart) */
export function lehrkraefteFiltern(
  zeilen: KiLehrkraftZeile[],
  suche: string,
  spalte: Spalte,
  absteigend: boolean,
  artNamen: Record<string, string> = {}
): KiLehrkraftZeile[] {
  const s = suche.trim().toLowerCase()
  const treffer = s
    ? zeilen.filter((z) =>
        [z.name, z.benutzer, ...Object.keys(z.anbieter), ...Object.keys(z.arten).map((a) => artNamen[a] ?? a)].some((t) => t.toLowerCase().includes(s))
      )
    : zeilen
  const wert = (z: KiLehrkraftZeile): number | string => (spalte === 'name' ? z.name.toLowerCase() : spalte === 'fehler' ? z.fehler + z.limits : z[spalte])
  return [...treffer].sort((a, b) => {
    const x = wert(a)
    const y = wert(b)
    const v = typeof x === 'string' ? x.localeCompare(String(y), 'de') : x - (y as number)
    return absteigend ? -v : v
  })
}

export default function KiNutzung({ daten, anbieterName }: { daten: KiNutzungDaten; anbieterName: (id: string) => string }): React.JSX.Element {
  const [suche, setSuche] = useState('')
  const [sort, setSort] = useState<{ spalte: Spalte; ab: boolean }>({ spalte: 'anfragen30', ab: true })
  const zeilen = useMemo(() => lehrkraefteFiltern(daten.lehrkraefte, suche, sort.spalte, sort.ab, daten.arten), [daten, suche, sort])
  const summe7 = daten.lehrkraefte.reduce((s, z) => s + z.anfragen7, 0)
  const summe30 = daten.lehrkraefte.reduce((s, z) => s + z.anfragen30, 0)
  const aktiv7 = daten.lehrkraefte.filter((z) => z.anfragen7 > 0).length
  const fehler = daten.lehrkraefte.reduce((s, z) => s + z.fehler, 0)
  const limits = daten.lehrkraefte.reduce((s, z) => s + z.limits, 0)

  const Kopf = ({ spalte, children }: { spalte: Spalte; children: React.ReactNode }): React.JSX.Element => (
    <Table.Th>
      <UnstyledButton
        onClick={() => setSort((s) => ({ spalte, ab: s.spalte === spalte ? !s.ab : spalte !== 'name' }))}
        aria-label={`Nach ${typeof children === 'string' ? children : spalte} sortieren`}
      >
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={600}>
            {children}
          </Text>
          {sort.spalte === spalte && (sort.ab ? <IconArrowDown size={14} /> : <IconArrowUp size={14} />)}
        </Group>
      </UnstyledButton>
    </Table.Th>
  )

  return (
    <Stack gap="md" data-testid="ki-nutzung">
      <Text size="sm" c="dimmed">
        Nur Anfragen über die Schlüssel der Schule. Private Zugänge der Lehrkräfte (eigenes Abo oder eigener Schlüssel) werden nicht erfasst; Daten von
        Lernenden ebenso wenig. Gespeichert sind je Tag nur Zahlen, nach 90 Tagen gelöscht.
      </Text>
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Kennzahl titel="Anfragen, 7 Tage" wert={zahl(summe7)} />
        <Kennzahl titel="Anfragen, 30 Tage" wert={zahl(summe30)} />
        <Kennzahl titel="Aktive Lehrkräfte, 7 Tage" wert={zahl(aktiv7)} hinweis={`${zahl(daten.lehrkraefte.length)} in 30 Tagen`} />
        <Kennzahl titel="Fehler, 30 Tage" wert={zahl(fehler)} hinweis={limits ? `davon ${zahl(limits)} Limits erreicht` : 'keine Limits erreicht'} />
      </SimpleGrid>
      <Card withBorder>
        <Text fw={600} size="sm" mb="xs">
          Anfragen je Tag nach Art des Auftrags (30 Tage)
        </Text>
        {summe30 ? (
          <SaeulenJeTag daten={daten} />
        ) : (
          <Text size="sm" c="dimmed">
            In den letzten 30 Tagen keine Anfragen über die Schlüssel der Schule.
          </Text>
        )}
      </Card>
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Je Lehrkraft
        </Text>
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder="Lehrkraft, Anbieter oder Art suchen …"
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          w={280}
          aria-label="Lehrkräfte durchsuchen"
        />
      </Group>
      <Table.ScrollContainer minWidth={760}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Kopf spalte="name">Lehrkraft</Kopf>
              <Kopf spalte="anfragen7">7 Tage</Kopf>
              <Kopf spalte="anfragen30">30 Tage</Kopf>
              <Table.Th>Verlauf</Table.Th>
              <Kopf spalte="auftraege30">Aufträge</Kopf>
              <Table.Th>Hauptsächlich</Table.Th>
              <Table.Th>Anbieter</Table.Th>
              <Kopf spalte="fehler">Fehler / Limits</Kopf>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {zeilen.map((z) => (
              <Table.Tr key={z.id}>
                <Table.Td>
                  <Text size="sm">{z.name}</Text>
                  {z.benutzer && z.benutzer !== z.name && (
                    <Text size="xs" c="dimmed">
                      {z.benutzer}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{zahl(z.anfragen7)}</Table.Td>
                <Table.Td>{zahl(z.anfragen30)}</Table.Td>
                <Table.Td>
                  <Verlaufslinie werte={z.verlauf} />
                </Table.Td>
                <Table.Td>{zahl(z.auftraege30)}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {Object.entries(z.arten)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 3)
                      .map(([a, n]) => (
                        <Badge key={a} variant="light" size="sm">
                          {daten.arten[a] ?? a} {n}
                        </Badge>
                      ))}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {Object.entries(z.anbieter)
                      .sort((a, b) => b[1] - a[1])
                      .map(([a]) => anbieterName(a))
                      .join(', ')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {z.fehler ? (
                    <Tooltip label={z.limits ? `${z.limits} davon: Limit oder Kontingent erreicht` : 'Fehler ohne Limit'}>
                      <Badge color={z.limits ? 'orange' : 'gray'} variant="light">
                        {zahl(z.fehler)}
                        {z.limits ? ` / ${zahl(z.limits)} Limit` : ''}
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Text size="sm" c="dimmed">
                      –
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {!zeilen.length && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text size="sm" c="dimmed">
                    {suche.trim() ? 'Keine Treffer.' : 'Noch keine Nutzung über die Schlüssel der Schule.'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  )
}
