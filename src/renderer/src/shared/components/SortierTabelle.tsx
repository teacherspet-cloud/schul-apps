/**
 * Sortier- und Filterköpfe für Tabellen (08.10.2026, Wunsch der Lehrkraft: „sortierbar und filterbar wie bei manch
 * anderem Menü"). Gleiche Bedienung wie die Testliste im Onlinetest: Pfeil je Spalte sortiert (nochmal = umkehren),
 * Trichter filtert – mit Text oder einer Auswahl der vorkommenden Werte; aktive Filter stehen als Plaketten darüber.
 */
import { ActionIcon, Badge, Button, Group, Popover, Select, Table, Text, TextInput, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowsSort, IconArrowUp, IconFilter, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { namenVergleich, type NamenFolge } from '@shared/namenListe'

/*
 * Vor- oder Nachname (08.10.2026, Wunsch der Lehrkraft): Namensspalten sortieren wahlweise nach dem Vornamen oder nach
 * dem Nachnamen (letztes Wort, bei Gästen „Ben S." der Anfangsbuchstabe). Die Wahl gilt für alle Lernendenlisten und
 * bleibt auf diesem Gerät gemerkt.
 */
const FOLGE_SCHLUESSEL = 'schulapps-namen-folge'
const FOLGE_EREIGNIS = 'schulapps-namen-folge'
const liesFolge = (): NamenFolge => {
  try {
    return localStorage.getItem(FOLGE_SCHLUESSEL) === 'nachname' ? 'nachname' : 'vorname'
  } catch {
    return 'vorname'
  }
}

/** Gemerkte Namensfolge (Vorname/Nachname) – über alle Tabellen gleich */
export function useNamenFolge(): [NamenFolge, (f: NamenFolge) => void] {
  const [folge, setFolgeZustand] = useState<NamenFolge>(liesFolge)
  useEffect(() => {
    const neu = (): void => setFolgeZustand(liesFolge())
    window.addEventListener(FOLGE_EREIGNIS, neu)
    return () => window.removeEventListener(FOLGE_EREIGNIS, neu)
  }, [])
  const setFolge = useCallback((f: NamenFolge): void => {
    setFolgeZustand(f)
    try {
      localStorage.setItem(FOLGE_SCHLUESSEL, f)
    } catch {
      /* ohne Speicher nur für jetzt */
    }
    window.dispatchEvent(new Event(FOLGE_EREIGNIS))
  }, [])
  return [folge, setFolge]
}

/** Kleiner Umschalter „Vorname / Nachname" neben einer Namens-Überschrift */
export function NamenFolgeKnopf({ folge, setFolge, onClick }: { folge: NamenFolge; setFolge: (f: NamenFolge) => void; onClick?: () => void }): React.JSX.Element {
  return (
    <Tooltip label={folge === 'nachname' ? 'sortiert nach Nachnamen – umschalten auf Vornamen' : 'sortiert nach Vornamen – umschalten auf Nachnamen'}>
      <Button
        size="compact-xs"
        variant="subtle"
        color="gray"
        fw={500}
        onClick={() => (setFolge(folge === 'nachname' ? 'vorname' : 'nachname'), onClick?.())}
        aria-label={folge === 'nachname' ? 'nach Vornamen sortieren' : 'nach Nachnamen sortieren'}
        data-namen-folge={folge}
      >
        {folge === 'nachname' ? 'Nachname' : 'Vorname'}
      </Button>
    </Tooltip>
  )
}

export interface Spalte<T> {
  id: string
  label: string
  /** Wert zum Sortieren (Zahl oder Text) */
  wert: (t: T) => string | number
  /** Filter: freier Text oder Auswahl der vorkommenden Werte (über `filterWert`, sonst `wert`) */
  filter?: 'text' | 'auswahl'
  filterWert?: (t: T) => string
  /** Zuerst absteigend sortieren (Zahlen wie „sicher") */
  absteigend?: boolean
  breite?: string | number
  /** Namensspalte: sortiert nach Vor- oder Nachnamen (Umschalter im Kopf) */
  namen?: boolean
}

type Sort = { spalte: string; ab: boolean }

/** Sortierte und gefilterte Zeilen samt Zustand für die Köpfe */
export function useSortierTabelle<T>(zeilen: T[], spalten: Spalte<T>[], start: Sort) {
  const [sort, setSort] = useState<Sort>(start)
  const [filter, setFilter] = useState<Record<string, string | undefined>>({})
  const [folge, setFolge] = useNamenFolge()
  const sichtbar = useMemo(() => {
    const fw = (s: Spalte<T>, t: T): string => String(s.filterWert ? s.filterWert(t) : s.wert(t))
    const gefiltert = zeilen.filter((t) =>
      spalten.every((s) => {
        const f = filter[s.id]
        if (!f) return true
        return s.filter === 'auswahl' ? fw(s, t) === f : fw(s, t).toLowerCase().includes(f.toLowerCase())
      })
    )
    const sp = spalten.find((s) => s.id === sort.spalte)
    if (!sp) return gefiltert
    return [...gefiltert].sort((a, b) => {
      const x = sp.wert(a)
      const y = sp.wert(b)
      const v =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : sp.namen
            ? namenVergleich(String(x), String(y), folge)
            : String(x).localeCompare(String(y), 'de')
      return sort.ab ? -v : v
    })
  }, [zeilen, spalten, sort, filter, folge])
  const auswahl = (s: Spalte<T>): { value: string; label: string }[] =>
    [...new Set(zeilen.map((t) => String(s.filterWert ? s.filterWert(t) : s.wert(t))).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'de'))
      .map((v) => ({ value: v, label: v }))
  return { sichtbar, sort, setSort, filter, setFilter, auswahl, folge, setFolge }
}

/** Kopfzelle mit Sortierpfeil und Filtertrichter */
export function SortKopf<T>({ spalte, tabelle }: { spalte: Spalte<T>; tabelle: ReturnType<typeof useSortierTabelle<T>> }): React.JSX.Element {
  const { sort, setSort, filter, setFilter, auswahl, folge, setFolge } = tabelle
  const aktiv = sort.spalte === spalte.id
  const gefiltert = Boolean(filter[spalte.id])
  return (
    <Table.Th style={spalte.breite ? { width: spalte.breite } : undefined}>
      <Group gap={2} wrap="nowrap">
        <Text fw={700} size="sm">
          {spalte.label}
        </Text>
        <Tooltip label={aktiv ? (sort.ab ? 'absteigend – umkehren' : 'aufsteigend – umkehren') : 'sortieren'}>
          <ActionIcon
            size="sm"
            variant={aktiv ? 'light' : 'subtle'}
            color={aktiv ? undefined : 'gray'}
            onClick={() => setSort({ spalte: spalte.id, ab: aktiv ? !sort.ab : Boolean(spalte.absteigend) })}
            aria-label={`nach ${spalte.label} sortieren`}
            data-sortieren={spalte.id}
          >
            {aktiv ? sort.ab ? <IconArrowDown size={14} /> : <IconArrowUp size={14} /> : <IconArrowsSort size={14} />}
          </ActionIcon>
        </Tooltip>
        {spalte.namen && <NamenFolgeKnopf folge={folge} setFolge={setFolge} onClick={() => !aktiv && setSort({ spalte: spalte.id, ab: false })} />}
        {spalte.filter && (
          <Popover position="bottom-start" shadow="md" withArrow>
            <Popover.Target>
              <ActionIcon
                size="sm"
                variant={gefiltert ? 'filled' : 'subtle'}
                color={gefiltert ? undefined : 'gray'}
                aria-label={`nach ${spalte.label} filtern`}
                data-filtern={spalte.id}
              >
                <IconFilter size={13} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              {spalte.filter === 'auswahl' ? (
                <Select
                  label={`${spalte.label} filtern`}
                  data={auswahl(spalte)}
                  value={filter[spalte.id] ?? null}
                  onChange={(v) => setFilter({ ...filter, [spalte.id]: v ?? undefined })}
                  clearable
                  placeholder="alle"
                  comboboxProps={{ withinPortal: false }}
                  w={220}
                  data-filter-wahl={spalte.id}
                />
              ) : (
                <TextInput
                  label={`${spalte.label} enthält`}
                  value={filter[spalte.id] ?? ''}
                  onChange={(e) => setFilter({ ...filter, [spalte.id]: e.currentTarget.value || undefined })}
                  w={220}
                  data-filter-text={spalte.id}
                />
              )}
            </Popover.Dropdown>
          </Popover>
        )}
      </Group>
    </Table.Th>
  )
}

/** Aktive Filter als Plaketten, einzeln oder alle zurücksetzbar */
export function AktiveFilter<T>({ spalten, tabelle }: { spalten: Spalte<T>[]; tabelle: ReturnType<typeof useSortierTabelle<T>> }): React.JSX.Element | null {
  const { filter, setFilter } = tabelle
  const aktiv = spalten.filter((s) => filter[s.id])
  if (!aktiv.length) return null
  return (
    <Group gap="xs" mb="xs" data-aktive-filter>
      <Text size="sm" c="dimmed">
        Gefiltert:
      </Text>
      {aktiv.map((s) => (
        <Badge
          key={s.id}
          variant="light"
          tt="none"
          rightSection={
            <ActionIcon size="xs" variant="transparent" onClick={() => setFilter({ ...filter, [s.id]: undefined })} aria-label="Filter entfernen">
              <IconX size={10} />
            </ActionIcon>
          }
        >
          {s.label}: {filter[s.id]}
        </Badge>
      ))}
      <Button variant="subtle" size="xs" onClick={() => setFilter({})}>
        Filter zurücksetzen
      </Button>
    </Group>
  )
}
