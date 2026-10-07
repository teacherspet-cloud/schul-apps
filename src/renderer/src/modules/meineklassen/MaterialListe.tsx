/**
 * Materialliste in „Meine Klassen" (Runde 2, 06.10.2026, abgestimmt mit der Lehrkraft):
 *  - Standard: offene zuerst (nach Frist, dann neueste), danach beendete (neueste zuerst).
 *  - Über die Pfeile ↑↓ je Kategorie umsortieren; Rechtsklick auf einen Pfeil filtert nach dieser Kategorie.
 *  - Je Eintrag Kopf (Titel, Art, Status, Ablegen ▾), Kurzangaben, Ampel-Balken, aufklappbare Details.
 * Dazu die Ampelfarben, die überall in „Meine Klassen" gelten (wie in der Lernenden-Tabelle).
 */
import { useExperte } from '../../shared/settingsStore'
import { ActionIcon, Badge, Button, Card, Checkbox, Collapse, Group, Menu, Progress, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconChevronDown, IconChevronRight, IconFilter, IconRestore } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'

/** Ampel wie in der Lernenden-Tabelle: unter 30 % rot, unter 60 % gelb, sonst grün */
export const ampel = (x: number | null | undefined): string => (x == null ? 'gray' : x < 0.3 ? 'red' : x < 0.6 ? 'yellow' : 'teal')

export interface Eintrag {
  key: string
  art: string
  titel: string
  status: 'offen' | 'beendet'
  /** Freigegeben/erstellt (ms) */
  datum: number
  /** Frist (ms) */
  frist: number | null
  /** 0–1 (Fortschritt, Ergebnis), null = keins */
  wert: number | null
  /** Das Gezeigte */
  inhalt: React.ReactNode
}

type Kategorie = 'status' | 'datum' | 'frist' | 'art' | 'titel' | 'wert'

const NAMEN: Record<Kategorie, string> = { status: 'Status', datum: 'Datum', frist: 'Frist', art: 'Art', titel: 'Titel', wert: 'Stand' }
const TAG = 86_400_000

/** Filterwert eines Eintrags je Kategorie (Titel: nach Anfangsbuchstabe) */
function filterWert(e: Eintrag, k: Kategorie, jetzt: number): string {
  if (k === 'status') return e.status === 'offen' ? 'offen' : 'beendet'
  if (k === 'art') return e.art
  if (k === 'titel') return (e.titel.trim()[0] ?? '#').toUpperCase()
  if (k === 'datum') return jetzt - e.datum < 7 * TAG ? 'letzte 7 Tage' : jetzt - e.datum < 30 * TAG ? 'letzte 30 Tage' : 'älter'
  if (k === 'frist') return e.frist == null ? 'ohne Frist' : e.frist < jetzt ? 'Frist vorbei' : e.frist - jetzt < 7 * TAG ? 'in den nächsten 7 Tagen' : 'später'
  return e.wert == null ? 'ohne Angabe' : e.wert < 0.3 ? 'unter 30 %' : e.wert < 0.6 ? '30–60 %' : 'ab 60 %'
}

/** Standard: offene zuerst nach Frist (ohne Frist danach, neueste zuerst), beendete neueste zuerst */
export function standardFolge(a: Pick<Eintrag, 'status' | 'datum' | 'frist'>, b: Pick<Eintrag, 'status' | 'datum' | 'frist'>): number {
  if (a.status !== b.status) return a.status === 'offen' ? -1 : 1
  if (a.status === 'offen') {
    if (a.frist != null && b.frist != null && a.frist !== b.frist) return a.frist - b.frist
    if ((a.frist == null) !== (b.frist == null)) return a.frist == null ? 1 : -1
  }
  return b.datum - a.datum
}

function vergleich(k: Kategorie): (a: Eintrag, b: Eintrag) => number {
  const leerHinten = (x: number | null, y: number | null): number | null => (x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : null)
  if (k === 'status') return (a, b) => (a.status === b.status ? 0 : a.status === 'offen' ? -1 : 1)
  if (k === 'datum') return (a, b) => a.datum - b.datum
  if (k === 'frist') return (a, b) => leerHinten(a.frist, b.frist) ?? a.frist! - b.frist!
  if (k === 'wert') return (a, b) => leerHinten(a.wert, b.wert) ?? a.wert! - b.wert!
  if (k === 'art') return (a, b) => a.art.localeCompare(b.art, 'de')
  return (a, b) => a.titel.localeCompare(b.titel, 'de', { numeric: true })
}

export function MaterialListe({
  eintraege,
  kategorien = ['status', 'datum', 'frist', 'art', 'titel', 'wert'],
  leer
}: {
  eintraege: Eintrag[]
  kategorien?: Kategorie[]
  leer: string
}): React.JSX.Element {
  const [sortierung, setSortierung] = useState<{ k: Kategorie; ab: boolean } | null>(null)
  const [filter, setFilter] = useState<Partial<Record<Kategorie, string[]>>>({})
  const [filterOffen, setFilterOffen] = useState<Kategorie | null>(null)
  const jetzt = Date.now()
  const werte = useMemo(() => {
    const m: Partial<Record<Kategorie, string[]>> = {}
    for (const k of kategorien) m[k] = [...new Set(eintraege.map((e) => filterWert(e, k, jetzt)))].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
    return m
  }, [eintraege, kategorien]) // eslint-disable-line react-hooks/exhaustive-deps
  const sichtbar = useMemo(() => {
    const gefiltert = eintraege.filter((e) => kategorien.every((k) => !filter[k]?.length || filter[k]!.includes(filterWert(e, k, jetzt))))
    if (!sortierung) return [...gefiltert].sort(standardFolge)
    const v = vergleich(sortierung.k)
    // Bei Gleichstand gilt die Standardfolge
    return [...gefiltert].sort((a, b) => (sortierung.ab ? v(b, a) : v(a, b)) || standardFolge(a, b))
  }, [eintraege, filter, sortierung, kategorien]) // eslint-disable-line react-hooks/exhaustive-deps
  const aktiv = Object.values(filter).some((l) => l?.length) || sortierung
  // Standardmodus (07.10.2026): ohne Sortier- und Filterpfeile – die Liste steht in der Standardfolge (offen nach Frist, fertig nach Datum)
  const experte = useExperte()
  useEffect(() => {
    if (experte) return
    setSortierung(null)
    setFilter({})
  }, [experte])
  return (
    <Stack gap="xs" data-material-liste>
      <Group gap={6} wrap="wrap" className="mk-kategorien" display={experte ? undefined : 'none'}>
        {kategorien.map((k) => {
          const gefiltert = Boolean(filter[k]?.length)
          const pfeil = (ab: boolean): React.JSX.Element => (
            <Tooltip label={`Nach ${NAMEN[k]} ${ab ? 'absteigend' : 'aufsteigend'} sortieren · Rechtsklick: filtern`} openDelay={500}>
              <ActionIcon
                size="sm"
                variant={sortierung?.k === k && sortierung.ab === ab ? 'filled' : 'subtle'}
                onClick={() => setSortierung({ k, ab })}
                onContextMenu={(e) => (e.preventDefault(), setFilterOffen(k))}
                aria-label={`${NAMEN[k]} ${ab ? 'absteigend' : 'aufsteigend'}`}
                data-sortieren={`${k}-${ab ? 'ab' : 'auf'}`}
              >
                {ab ? <IconArrowDown size={13} /> : <IconArrowUp size={13} />}
              </ActionIcon>
            </Tooltip>
          )
          return (
            <Menu
              key={k}
              opened={filterOffen === k}
              onChange={(o) => setFilterOffen(o ? k : null)}
              closeOnItemClick={false}
              position="bottom-start"
              withinPortal
            >
              <Menu.Target>
                <Group gap={2} wrap="nowrap" className="mk-kategorie" data-kategorie={k} data-gefiltert={gefiltert || undefined}>
                  <Text size="xs" fw={600} c={gefiltert ? 'var(--mantine-primary-color-filled)' : 'dimmed'} px={4}>
                    {gefiltert && <IconFilter size={11} style={{ verticalAlign: -1, marginRight: 2 }} />}
                    {NAMEN[k]}
                  </Text>
                  {pfeil(false)}
                  {pfeil(true)}
                </Group>
              </Menu.Target>
              <Menu.Dropdown data-filter-menue={k}>
                <Menu.Label>Filtern nach {NAMEN[k]}</Menu.Label>
                {(werte[k] ?? []).map((w) => (
                  <Menu.Item key={w} py={4}>
                    <Checkbox
                      size="xs"
                      label={w}
                      checked={filter[k]?.includes(w) ?? false}
                      onChange={(e) => {
                        const an = e.currentTarget.checked
                        setFilter((f) => ({ ...f, [k]: an ? [...(f[k] ?? []), w] : (f[k] ?? []).filter((x) => x !== w) }))
                      }}
                      data-filter-wert={w}
                    />
                  </Menu.Item>
                ))}
                {gefiltert && (
                  <Menu.Item color="red" onClick={() => (setFilter((f) => ({ ...f, [k]: [] })), setFilterOffen(null))}>
                    Filter entfernen
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )
        })}
        {aktiv && (
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconRestore size={12} />}
            onClick={() => (setSortierung(null), setFilter({}))}
            data-sortierung-standard
          >
            Standard
          </Button>
        )}
      </Group>
      {sichtbar.length === 0 ? (
        <Text c="dimmed" size="sm" ta="center" py="md">
          {eintraege.length ? 'Kein Eintrag passt zum Filter.' : leer}
        </Text>
      ) : (
        sichtbar.map((e) => <div key={e.key}>{e.inhalt}</div>)
      )}
    </Stack>
  )
}

/** Ein Eintrag: Kopf, Kurzangaben, Ampel-Balken, aufklappbare Details */
export function MaterialKarte({
  symbol,
  titel,
  art,
  status,
  angaben,
  wert,
  wertText,
  aktionen,
  oeffnen,
  details,
  zusatz
}: {
  symbol: React.ReactNode
  titel: string
  art: string
  status: 'offen' | 'beendet'
  angaben: (string | false | null | undefined)[]
  wert: number | null
  wertText?: string
  aktionen?: React.ReactNode
  oeffnen?: () => void
  details?: React.ReactNode
  zusatz?: React.ReactNode
}): React.JSX.Element {
  const [auf, setAuf] = useState(false)
  return (
    <Card withBorder padding="sm" radius="md" data-material={art} data-material-titel={titel} data-status={status}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <UnstyledButton onClick={oeffnen} disabled={!oeffnen} style={{ flex: 1, minWidth: 0 }} data-material-oeffnen>
          <Group gap={6} wrap="nowrap">
            {symbol}
            <Text fw={600} truncate>
              {titel}
            </Text>
            <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
              {art}
            </Badge>
            {status === 'beendet' && (
              <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>
                beendet
              </Badge>
            )}
          </Group>
        </UnstyledButton>
        <Group gap={4} wrap="nowrap">
          {wertText && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {wertText}
            </Text>
          )}
          {aktionen}
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mt={2}>
        {angaben.filter(Boolean).join(' · ')}
      </Text>
      {wert != null && <Progress mt={6} value={wert * 100} radius="xl" color={ampel(wert)} data-ampel={ampel(wert)} />}
      {zusatz}
      {details && (
        <>
          <UnstyledButton mt={6} onClick={() => setAuf((a) => !a)} data-details-auf>
            <Group gap={2}>
              {auf ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <Text size="xs" c="dimmed">
                Details
              </Text>
            </Group>
          </UnstyledButton>
          <Collapse expanded={auf}>
            <Stack gap={4} mt={4} pl="md" data-details>
              {details}
            </Stack>
          </Collapse>
        </>
      )}
    </Card>
  )
}

/** Zeile in den Details: fett der Name, dahinter der Inhalt */
export function DetailZeile({ name, children }: { name: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <Text size="xs">
      <b>{name}:</b> {children}
    </Text>
  )
}
