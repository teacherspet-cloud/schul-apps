/**
 * Onlinetest – die App der Lehrkraft (02.10.2026, nur mit dem Schul-Apps-Server).
 *
 *  - Tests: Liste mit Sortieren/Filtern je Spalte; Code, Link und QR-Code für die Lernenden;
 *    gemeinsamer Start; Live-Stand (wer wartet, schreibt, abgegeben, die Seite verlassen hat);
 *    die KI wertet nach jeder Abgabe selbst aus; Durchsicht jeder Antwort zum Überstimmen,
 *    „Zu entscheiden" für kleine Fehler und vertretbare Abweichungen; Ergebnisse freigeben;
 *    Export (PDF, Excel, Word, Drucken, TeacherTool).
 *  - Lerngruppen: aus IServ (Anmeldung oder Ordner „Gruppen") oder von Hand; Historie mit Datum,
 *    Ergebnissen, Notenverteilung, Durchschnittsnote und Durchschnitt je Schülerin/Schüler.
 *
 * Wichtig (Wunsch der Lehrkraft): Die Auswertung ist ein VORSCHLAG – die Abgaben bitte trotzdem prüfen.
 * Der Bildschirm wird oft an die Tafel gespiegelt: Die Namensliste ist deshalb zugeklappt und
 * die Namen lassen sich ausblenden.
 */
import { useAppSettings } from '../../shared/settingsStore'
import { thresholdsForSubject } from '../../shared/gradeScale'
import type { Kurztest } from '../lernzielkontrolle/model/types'
import { kurztestToWorksheetAlle } from '../lernzielkontrolle/render/kurztestWorksheet'
import type { GrammarTest } from '../grammatiktest/model/types'
import { testToWorksheet } from '../grammatiktest/render/testWorksheet'
import { fassungenAusBlatt } from './blattOnline'
import { Erstellen, type BlattQuelleOnline } from './OnlinetestKnopf'
import { AppKopf } from '../../shared/components/AppKopf'
import { FAECHER } from '@shared/faecher'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import { useDokumentOeffner } from '../../shared/navigation'
import type { TestDocument } from '../vokabeltest/model/types'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Container,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFilter,
  IconFolders,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStop,
  IconPrinter,
  IconSparkles,
  IconTrash,
  IconUsersGroup,
  IconX
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { qrSvg } from '../arbeitsblatt/render/qr'
import { antwortAlsText, felderVon, loesungAlsText, type Antworten, type Bewertung, type Einheit, type Loesung, type OnlineAufgabe } from './kern'
import { holen, senden } from './serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { hatClient } from '../../shared/plattform'
import { AbgabeBlatt, abgabenHtml, type BlattKopf } from './blattAnsicht'
import type { Variant } from '../vokabeltest/model/types'
import { ergebnisDocx, ergebnisHtml, ergebnisXlsx, notenSpalte, teachertoolCsv, type ErgebnisDaten, type NotenFormat } from './ergebnisExport'

interface TestListe {
  id: string
  titel: string
  art: string
  thema: string
  zielsprache: string
  code: string
  link: string
  status: 'wartend' | 'offen' | 'beendet'
  erstellt: string
  lerngruppe: string
  teilnehmer: number
  abgegeben: number
  offen: number
  zuEntscheiden: number
}

interface Teilnahme {
  id: string
  name: string
  benutzer: string
  gast: boolean
  variante: string
  varianteNr: number
  beginn: number
  ende: number
  abgabe: number | null
  grund: string | null
  verlassen: boolean
  punkte: number
  max: number
  offen: number
  zuEntscheiden: number
  note: number | null
  antworten: Antworten
  bewertung: Bewertung
}

interface TestDetail {
  id: string
  titel: string
  code: string
  link: string
  status: 'wartend' | 'offen' | 'beendet'
  erstellt: string
  einstellungen: {
    zeitMin: number
    schwellen: number[]
    thema?: string
    gestartet?: number
    ergebnisFrei?: boolean
    art?: string
    blatt?: BlattKopf
    gaeste?: boolean
  }
  lerngruppe: { name: string } | null
  ohneIserv: boolean
  ki: { laeuft: boolean; fehler: string | null }
  ergebnisSichtbar: boolean
  fehlend: { name: string; benutzer: string }[]
  fassungen: { label: string; punkte: number; aufgaben: OnlineAufgabe[]; einheiten: Einheit[]; loesungen: Record<string, Loesung>; original?: Variant | null }[]
  teilnahmen: Teilnahme[]
}

export const PRUEF_HINWEIS =
  'Die Auswertung ist ein Vorschlag – bitte die Abgaben trotzdem prüfen, besonders die von der KI bewerteten und markierten Antworten.'

const datum = (s: string | number): string => new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
const STATUS_TEXT: Record<TestListe['status'], string> = { wartend: 'wartet auf Start', offen: 'läuft', beendet: 'beendet' }
const STATUS_FARBE: Record<TestListe['status'], string> = { wartend: 'yellow', offen: 'green', beendet: 'gray' }

/** Allgemeine Titel („Vocabulary Test") machen Tests ununterscheidbar – dann zählt das Thema */
const ALLGEMEIN = /^(vocabulary test|vokabeltest|vokabeltest englisch|test|onlinetest|vocab test|contrôle de vocabulaire|prueba de vocabulario)$/i
export const anzeigeName = (t: { titel: string; thema?: string }): string => (ALLGEMEIN.test(t.titel.trim()) && t.thema ? t.thema : t.titel)

export default function OnlinetestModule({ active }: { active: boolean }): React.JSX.Element | null {
  const [reiter, setReiter] = useState<string | null>('tests')
  // Von außen geöffnet (nach dem Erstellen): Detailansicht dieses Tests
  const [ziel, setZiel] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  useDokumentOeffner('onlinetest', async (id) => {
    setReiter('tests')
    setZiel(id)
  })
  if (!active) return null
  return (
    <Container size="xl" py="md">
      {neu && <NeuerOnlinetest schliessen={() => setNeu(false)} />}
      <Tabs value={reiter} onChange={setReiter}>
        {/* Gemeinsamer Kopf (Phase 6a): Reiter in der zweiten Zeile */}
        <AppKopf
          neu={{ label: 'Neuer Onlinetest', onClick: () => setNeu(true), kennung: 'onlinetest' }}
          links={
            <Tabs.List style={{ borderBottom: 0 }}>
              <Tabs.Tab value="tests">Tests</Tabs.Tab>
              <Tabs.Tab value="gruppen" leftSection={<IconUsersGroup size={16} />}>
                Lerngruppen
              </Tabs.Tab>
            </Tabs.List>
          }
        />
        <Tabs.Panel value="tests">
          <Tests ziel={ziel} zielErledigt={() => setZiel(null)} />
        </Tabs.Panel>
        <Tabs.Panel value="gruppen">
          <Lerngruppen />
        </Tabs.Panel>
      </Tabs>
    </Container>
  )
}

// ---------------------------------------------------------------- Testliste: sortieren und filtern je Spalte

type Spalte = 'name' | 'lerngruppe' | 'art' | 'datum' | 'abgaben' | 'status'
type Filter = Partial<Record<Spalte, string>>
const FILTER_TEXT: Record<Spalte, string> = { name: 'Test', lerngruppe: 'Klasse', art: 'Testart', datum: 'ab', abgaben: 'Abgaben', status: 'Status' }

const wertFuer = (t: TestListe, s: Spalte): string | number =>
  s === 'name'
    ? anzeigeName(t).toLowerCase()
    : s === 'lerngruppe'
      ? t.lerngruppe.toLowerCase()
      : s === 'art'
        ? t.art
        : s === 'datum'
          ? t.erstellt
          : s === 'abgaben'
            ? t.abgegeben
            : t.status

function SpaltenKopf({
  label,
  spalte,
  sort,
  setSort,
  filter,
  setFilter,
  auswahl
}: {
  label: string
  spalte: Spalte
  sort: { spalte: Spalte; ab: boolean }
  setSort: (s: { spalte: Spalte; ab: boolean }) => void
  filter: Filter
  setFilter: (f: Filter) => void
  /** Feste Werte (Klasse, Testart, Status) statt freiem Text */
  auswahl?: { value: string; label: string }[]
}): React.JSX.Element {
  const aktiv = sort.spalte === spalte
  const gefiltert = Boolean(filter[spalte])
  return (
    <Table.Th>
      <Group gap={2} wrap="nowrap">
        <Text fw={700} size="sm">
          {label}
        </Text>
        <Tooltip label={aktiv ? (sort.ab ? 'absteigend – umkehren' : 'aufsteigend – umkehren') : 'sortieren'}>
          <ActionIcon
            size="sm"
            variant={aktiv ? 'light' : 'subtle'}
            color={aktiv ? undefined : 'gray'}
            onClick={() => setSort({ spalte, ab: aktiv ? !sort.ab : spalte === 'datum' })}
            aria-label={`nach ${label} sortieren`}
          >
            {aktiv ? sort.ab ? <IconArrowDown size={14} /> : <IconArrowUp size={14} /> : <IconArrowsSort size={14} />}
          </ActionIcon>
        </Tooltip>
        <Popover position="bottom-start" shadow="md" withArrow>
          <Popover.Target>
            <ActionIcon
              size="sm"
              variant={gefiltert ? 'filled' : 'subtle'}
              color={gefiltert ? undefined : 'gray'}
              aria-label={`nach ${label} filtern`}
              data-filter={spalte}
            >
              <IconFilter size={13} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            {auswahl ? (
              <Select
                label={`${label} filtern`}
                data={auswahl}
                value={filter[spalte] ?? null}
                onChange={(v) => setFilter({ ...filter, [spalte]: v ?? undefined })}
                clearable
                placeholder="alle"
                comboboxProps={{ withinPortal: false }}
                w={220}
              />
            ) : spalte === 'datum' ? (
              <TextInput
                label="Datum ab"
                type="date"
                value={filter.datum ?? ''}
                onChange={(e) => setFilter({ ...filter, datum: e.currentTarget.value || undefined })}
                w={220}
              />
            ) : (
              <TextInput
                label={`${label} enthält`}
                value={filter[spalte] ?? ''}
                onChange={(e) => setFilter({ ...filter, [spalte]: e.currentTarget.value || undefined })}
                w={220}
                autoFocus
              />
            )}
          </Popover.Dropdown>
        </Popover>
      </Group>
    </Table.Th>
  )
}

function Tests({ ziel, zielErledigt }: { ziel: string | null; zielErledigt: () => void }): React.JSX.Element {
  const [liste, setListe] = useState<TestListe[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  useEffect(() => {
    if (!ziel) return
    setGewaehlt(ziel)
    zielErledigt()
  }, [ziel, zielErledigt])
  const [sort, setSort] = useState<{ spalte: Spalte; ab: boolean }>({ spalte: 'datum', ab: true })
  const [filter, setFilter] = useState<Filter>({})
  const laden = useCallback(() => {
    void holen<{ tests: TestListe[] }>('/server/onlinetest')
      .then((d) => setListe(d.tests))
      .catch((e: unknown) => notifyError(e))
  }, [])
  useEffect(laden, [laden])
  const sichtbar = useMemo(() => {
    if (!liste) return []
    const f = liste.filter(
      (t) =>
        (!filter.name || `${t.titel} ${t.thema} ${t.code}`.toLowerCase().includes(filter.name.toLowerCase())) &&
        (!filter.lerngruppe || t.lerngruppe === filter.lerngruppe) &&
        (!filter.art || t.art === filter.art) &&
        (!filter.status || t.status === filter.status) &&
        (!filter.datum || t.erstellt.slice(0, 10) >= filter.datum) &&
        (!filter.abgaben || (filter.abgaben === 'offen' ? t.offen + t.zuEntscheiden > 0 : t.offen + t.zuEntscheiden === 0))
    )
    return f.sort((a, b) => {
      const x = wertFuer(a, sort.spalte)
      const y = wertFuer(b, sort.spalte)
      const v = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'de')
      return sort.ab ? -v : v
    })
  }, [liste, sort, filter])
  if (gewaehlt) return <TestAnsicht id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
  const werte = (s: Spalte, f: (t: TestListe) => string): { value: string; label: string }[] =>
    [...new Set((liste ?? []).map(f).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'de'))
      .map((v) => ({ value: v, label: s === 'status' ? STATUS_TEXT[v as TestListe['status']] : v }))
  const kopf = { sort, setSort, filter, setFilter }
  return (
    <Stack>
      {!liste && <Loader />}
      {liste?.length === 0 && <Text c="dimmed">Noch keine Onlinetests.</Text>}
      {Object.values(filter).some(Boolean) && (
        <Group gap="xs" data-aktive-filter>
          <Text size="sm" c="dimmed">
            Gefiltert:
          </Text>
          {(Object.entries(filter) as [Spalte, string | undefined][])
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <Badge
                key={k}
                variant="light"
                rightSection={
                  <ActionIcon size="xs" variant="transparent" onClick={() => setFilter({ ...filter, [k]: undefined })} aria-label="Filter entfernen">
                    <IconX size={10} />
                  </ActionIcon>
                }
              >
                {FILTER_TEXT[k]}:{' '}
                {k === 'status' ? STATUS_TEXT[v as TestListe['status']] : k === 'abgaben' ? (v === 'offen' ? 'noch zu prüfen' : 'alles geprüft') : v}
              </Badge>
            ))}
          <Button variant="subtle" size="xs" onClick={() => setFilter({})}>
            Filter zurücksetzen
          </Button>
        </Group>
      )}
      {liste && liste.length > 0 && (
        <Table striped highlightOnHover data-testliste>
          <Table.Thead>
            <Table.Tr>
              <SpaltenKopf label="Test" spalte="name" {...kopf} />
              <SpaltenKopf label="Klasse" spalte="lerngruppe" auswahl={werte('lerngruppe', (t) => t.lerngruppe)} {...kopf} />
              <SpaltenKopf label="Testart" spalte="art" auswahl={werte('art', (t) => t.art)} {...kopf} />
              <SpaltenKopf label="Datum" spalte="datum" {...kopf} />
              <SpaltenKopf
                label="Abgaben"
                spalte="abgaben"
                auswahl={[
                  { value: 'offen', label: 'noch zu prüfen' },
                  { value: 'fertig', label: 'alles geprüft' }
                ]}
                {...kopf}
              />
              <SpaltenKopf label="Status" spalte="status" auswahl={werte('status', (t) => t.status)} {...kopf} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sichtbar.map((t) => (
              <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setGewaehlt(t.id)}>
                <Table.Td>
                  <Text fw={600}>{anzeigeName(t)}</Text>
                  <Text size="xs" c="dimmed">
                    {[anzeigeName(t) !== t.titel ? t.titel : t.thema, `Code ${t.code}`].filter(Boolean).join(' · ')}
                  </Text>
                </Table.Td>
                <Table.Td>{t.lerngruppe || '–'}</Table.Td>
                <Table.Td>{t.art}</Table.Td>
                <Table.Td>{datum(t.erstellt)}</Table.Td>
                <Table.Td>
                  {t.abgegeben}/{t.teilnehmer}
                  {t.offen + t.zuEntscheiden > 0 && (
                    <Badge ml="xs" color="orange" size="sm">
                      {t.offen + t.zuEntscheiden} zu prüfen
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge color={STATUS_FARBE[t.status]}>{STATUS_TEXT[t.status]}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {liste && liste.length > 0 && sichtbar.length === 0 && <Text c="dimmed">Kein Test passt zum Filter.</Text>}
    </Stack>
  )
}

function QrCode({ wert, mm = 40 }: { wert: string; mm?: number }): React.JSX.Element {
  // content-box: Der weiße Rand kommt ZU den 40 mm dazu – mit border-box ragte der Code rechts über den Hintergrund (02.10.2026)
  return (
    <div
      style={{ boxSizing: 'content-box', width: `${mm}mm`, height: `${mm}mm`, background: '#fff', padding: 6, lineHeight: 0, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: qrSvg(wert, mm) }}
      data-qr
    />
  )
}

export function Zugang({ code, link }: { code: string; link: string }): React.JSX.Element {
  return (
    <Group align="center" gap="lg">
      <QrCode wert={link} />
      <Stack gap={4}>
        <Text size="sm" c="dimmed">
          Code für die Lernenden
        </Text>
        <Text fw={800} size="2rem" ff="monospace" lts={4}>
          {code}
        </Text>
        <Group gap={4}>
          <Text size="sm">{link}</Text>
          <ActionIcon
            variant="subtle"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => notifySuccess('Link kopiert.'))}
            aria-label="Link kopieren"
          >
            <IconCopy size={16} />
          </ActionIcon>
        </Group>
      </Stack>
    </Group>
  )
}

/** Namen ausblenden (Tafel) – je Gerät gemerkt */
function useNamenVerdeckt(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem('onlinetest-namen-verdeckt') === '1'
    } catch {
      return false
    }
  })
  return [
    v,
    (neu) => {
      setV(neu)
      try {
        localStorage.setItem('onlinetest-namen-verdeckt', neu ? '1' : '0')
      } catch {
        // nur eine Annehmlichkeit
      }
    }
  ]
}

function ergebnisDaten(d: TestDetail): ErgebnisDaten {
  return {
    titel: anzeigeName({ titel: d.titel, thema: d.einstellungen.thema }),
    lerngruppe: d.lerngruppe?.name ?? '',
    datum: new Date(d.erstellt).toLocaleDateString('de-DE'),
    schwellen: d.einstellungen.schwellen,
    zeilen: d.teilnahmen
      .filter((t) => t.beginn > 0)
      .map((t) => ({
        name: t.name,
        fassung: t.variante,
        punkte: t.punkte,
        max: t.max,
        note: t.note,
        abgabe: t.abgabe,
        verlassen: t.verlassen,
        offen: t.offen + t.zuEntscheiden
      }))
  }
}

const dateiName = (d: TestDetail): string =>
  `Ergebnisse ${anzeigeName({ titel: d.titel, thema: d.einstellungen.thema })}${d.lerngruppe ? ` ${d.lerngruppe.name}` : ''}`.replace(/[\\/:*?"<>|]/g, '-')

/** Abgabe als Blatt: geht nur mit Kopf und Originalfassung (Tests ab 02.10.2026 abends) */
const blattMoeglich = (d: TestDetail, t: Teilnahme): boolean => Boolean(d.einstellungen.blatt && d.fassungen[t.varianteNr]?.original && t.beginn > 0)
const abgabeVon = (d: TestDetail, t: Teilnahme, name: string) => ({
  variante: d.fassungen[t.varianteNr].original!,
  antworten: t.antworten,
  bewertung: t.bewertung,
  abgabe: {
    name,
    datum: new Date(t.abgabe ?? t.beginn).toLocaleDateString('de-DE'),
    punkte: t.punkte,
    max: t.max,
    note: t.note,
    // Je Aufgabe: erreicht und möglich (Aufgabe = Block des Vokabeltests)
    jeAufgabe: Object.fromEntries(
      d.fassungen[t.varianteNr].aufgaben.map((a) => [
        a.id,
        {
          erreicht: d.fassungen[t.varianteNr].einheiten.filter((e) => e.aufgabe === a.id).reduce((s, e) => s + (t.bewertung[e.id]?.punkte ?? 0), 0),
          max: a.punkte
        }
      ])
    )
  }
})

function Export({ d }: { d: TestDetail }): React.JSX.Element {
  const [format, setFormat] = useState<NotenFormat>('ganz')
  const daten = ergebnisDaten(d)
  const speichern = async (endung: string, filter: string, inhalt: Uint8Array | string): Promise<void> => {
    try {
      const pfad = await window.api.files.save(`${dateiName(d)}.${endung}`, [{ name: filter, extensions: [endung] }], inhalt)
      if (pfad) notifySuccess('Gespeichert.')
    } catch (e) {
      notifyError(e, 'Nicht gespeichert')
    }
  }
  const leer = daten.zeilen.length === 0
  return (
    <Group gap="xs">
      <Select
        size="xs"
        w={180}
        data={[
          { value: 'ganz', label: 'Noten ganz (2)' },
          { value: 'tendenz', label: 'Noten mit Tendenz (2-)' },
          { value: 'punkte', label: 'Punkte statt Noten' }
        ]}
        value={format}
        onChange={(v) => v && setFormat(v as NotenFormat)}
        allowDeselect={false}
        aria-label="Notenformat"
      />
      <Menu shadow="md" position="bottom-end">
        <Menu.Target>
          <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} disabled={leer} data-export>
            Ergebnisse ausgeben
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconPrinter size={14} />}
            onClick={() => void window.api.exporter.print(ergebnisHtml(daten, format)).catch((e: unknown) => notifyError(e))}
          >
            Drucken
          </Menu.Item>
          <Menu.Item onClick={() => void window.api.exporter.pdf(ergebnisHtml(daten, format), `${dateiName(d)}.pdf`).catch((e: unknown) => notifyError(e))}>
            PDF
          </Menu.Item>
          <Menu.Item onClick={() => void speichern('xlsx', 'Excel', ergebnisXlsx(daten, format))}>Excel (.xlsx)</Menu.Item>
          <Menu.Item onClick={() => void ergebnisDocx(daten, format).then((b) => speichern('docx', 'Word', b))}>Word (.docx)</Menu.Item>
          {d.einstellungen.blatt && d.teilnahmen.some((t) => blattMoeglich(d, t)) && (
            <>
              <Menu.Divider />
              <Menu.Label>Abgaben als Blatt (DIN A4)</Menu.Label>
              <Menu.Item
                leftSection={<IconPrinter size={14} />}
                onClick={() =>
                  void window.api.exporter
                    .print(
                      abgabenHtml(
                        d.einstellungen.blatt!,
                        d.teilnahmen.filter((t) => blattMoeglich(d, t)).map((t) => abgabeVon(d, t, t.name))
                      )
                    )
                    .catch((e: unknown) => notifyError(e))
                }
              >
                Alle drucken
              </Menu.Item>
              <Menu.Item
                onClick={() =>
                  void window.api.exporter
                    .pdf(
                      abgabenHtml(
                        d.einstellungen.blatt!,
                        d.teilnahmen.filter((t) => blattMoeglich(d, t)).map((t) => abgabeVon(d, t, t.name))
                      ),
                      `${dateiName(d)} Abgaben.pdf`
                    )
                    .catch((e: unknown) => notifyError(e))
                }
                data-alle-blaetter
              >
                Alle als PDF
              </Menu.Item>
            </>
          )}
          <Menu.Divider />
          <Menu.Label>TeacherTool</Menu.Label>
          <Menu.Item onClick={() => void window.api.exporter.print(ergebnisHtml(daten, format, true)).catch((e: unknown) => notifyError(e))}>
            Abschreibliste drucken
          </Menu.Item>
          <Menu.Item
            onClick={() =>
              void window.api.exporter.pdf(ergebnisHtml(daten, format, true), `${dateiName(d)} Abschreibliste.pdf`).catch((e: unknown) => notifyError(e))
            }
          >
            Abschreibliste als PDF
          </Menu.Item>
          <Menu.Item
            onClick={() =>
              void navigator.clipboard?.writeText(notenSpalte(daten, format)).then(() => notifySuccess('Notenspalte kopiert (Reihenfolge: Nachname, Vorname).'))
            }
          >
            Notenspalte kopieren
          </Menu.Item>
          <Menu.Item onClick={() => void speichern('csv', 'CSV', teachertoolCsv(daten))}>CSV für neuen Kurs (Vorname, Name, Klasse)</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}

function TestAnsicht({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const [d, setD] = useState<TestDetail | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [durchsicht, setDurchsicht] = useState<string | null>(null)
  const [entscheiden, setEntscheiden] = useState(false)
  const [listeOffen, setListeOffen] = useState(false)
  const [verdeckt, setVerdeckt] = useNamenVerdeckt()
  const [umbenennen, setUmbenennen] = useState<string | null>(null)
  const laden = useCallback(() => {
    void holen<TestDetail>(`/server/onlinetest/${id}`)
      .then(setD)
      .catch((e: unknown) => notifyError(e))
  }, [id])
  useEffect(laden, [laden])
  // Live-Stand: solange der Test läuft oder wartet, und solange die KI noch auswertet
  useEffect(() => {
    if (!d || (d.status === 'beendet' && !d.ki.laeuft)) return
    const i = setInterval(laden, d.status === 'wartend' ? 3000 : 5000)
    return () => clearInterval(i)
  }, [d, laden])
  if (!d) return <Loader />
  const wartend = d.teilnahmen.filter((t) => t.beginn === 0)
  const schreibend = d.teilnahmen.filter((t) => t.beginn > 0 && !t.abgabe)
  const abgegeben = d.teilnahmen.filter((t) => t.abgabe)
  const offen = d.teilnahmen.reduce((s, t) => s + t.offen, 0)
  const zuEntscheiden = d.teilnahmen.reduce((s, t) => s + t.zuEntscheiden, 0)
  const nameVon = (t: Teilnahme, i: number): string => (verdeckt ? `Person ${i + 1}` : t.name)
  const status = async (s: 'starten' | 'beendet' | 'offen' | 'freigeben' | 'zurueckhalten' | 'gaeste' | 'nurKonto'): Promise<void> => {
    if (s === 'beendet' && !window.confirm('Test beenden? Wer noch schreibt, gibt mit dem zuletzt gesicherten Stand ab.')) return
    await senden(`/server/onlinetest/${id}/status`, { status: s }).catch((e: unknown) => notifyError(e))
    laden()
  }
  const auswerten = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<{ ok: boolean; anfragen: number; bewertet: number; fehler?: string }>(`/server/onlinetest/${id}/auswerten`)
      if (r.ok === false) throw new Error(r.fehler)
      notifySuccess(`${r.bewertet} Antworten von der KI bewertet (${r.anfragen} Anfrage${r.anfragen === 1 ? '' : 'n'}).`)
    } catch (e) {
      notifyError(e, 'Auswertung fehlgeschlagen')
    } finally {
      setLaeuft(false)
      laden()
    }
  }
  const loeschen = async (): Promise<void> => {
    if (!window.confirm(`Den Onlinetest „${d.titel}" mit allen Abgaben löschen?`)) return
    await senden(`/server/onlinetest/${id}/loeschen`).catch((e: unknown) => notifyError(e))
    zurueck()
  }
  const titel = anzeigeName({ titel: d.titel, thema: d.einstellungen.thema })
  return (
    <Stack>
      <Group justify="space-between">
        <Button variant="subtle" onClick={zurueck}>
          ← Alle Tests
        </Button>
        <Group gap="xs">
          {d.status === 'wartend' && (
            <Button color="green" leftSection={<IconPlayerPlay size={16} />} onClick={() => void status('starten')} data-test-starten>
              Test für alle starten
            </Button>
          )}
          {d.status === 'offen' && (
            <Button color="red" variant="light" leftSection={<IconPlayerStop size={16} />} onClick={() => void status('beendet')}>
              Test beenden
            </Button>
          )}
          {d.status === 'beendet' && (
            <Button variant="light" leftSection={<IconPlayerPlay size={16} />} onClick={() => void status('offen')}>
              Wieder öffnen
            </Button>
          )}
          <Tooltip label="Test löschen">
            <ActionIcon color="red" variant="subtle" onClick={() => void loeschen()} aria-label="Test löschen">
              <IconTrash size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Card withBorder>
        <Group gap="xs" wrap="nowrap">
          <Title order={3}>{titel}</Title>
          <Tooltip label="Umbenennen">
            <ActionIcon variant="subtle" color="gray" onClick={() => setUmbenennen(d.titel)} aria-label="Umbenennen">
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text c="dimmed" mb="sm">
          {[d.lerngruppe?.name, `${d.einstellungen.zeitMin} Minuten`, ...d.fassungen.map((f) => `Fassung ${f.label}: ${f.punkte} P.`)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {d.status !== 'beendet' && <Zugang code={d.code} link={d.link} />}
        {d.status === 'wartend' && (
          <Alert mt="sm" color="yellow" variant="light">
            {d.ohneIserv
              ? 'Die Lernenden scannen den QR-Code und geben Vorname + Anfangsbuchstabe ein. '
              : 'Die Lernenden scannen den QR-Code und melden sich mit IServ an. '}
            Sie sehen einen Wartebildschirm, bis der Test gestartet wird. Bereit: {wartend.length}
          </Alert>
        )}
      </Card>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {[
          ['warten', wartend.length, 'yellow'],
          ['schreiben', schreibend.length, 'blue'],
          ['abgegeben', abgegeben.length, 'green'],
          ['Seite verlassen', d.teilnahmen.filter((t) => t.verlassen).length, 'red']
        ].map(([k, n, c]) => (
          <Card key={k} withBorder padding="sm">
            <Text size="xl" fw={800} c={`${c}.7`}>
              {n}
            </Text>
            <Text size="sm" c="dimmed">
              {k}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
      <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
        {PRUEF_HINWEIS}
      </Alert>
      <Card withBorder>
        <Stack gap="xs">
          <Group justify="space-between">
            <Group gap="xs">
              {d.ki.laeuft || laeuft ? (
                <>
                  <Loader size={16} />
                  <Text size="sm">Die KI wertet die Abgaben aus …</Text>
                </>
              ) : d.ki.fehler ? (
                <Text size="sm" c="red">
                  KI-Auswertung fehlgeschlagen: {d.ki.fehler}
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  Die KI wertet jede Abgabe automatisch aus (eigener KI-Zugang, ohne Namen).
                </Text>
              )}
            </Group>
            {(offen > 0 || d.ki.fehler) && (
              <Button size="xs" variant="light" leftSection={<IconSparkles size={14} />} disabled={laeuft || d.ki.laeuft} onClick={() => void auswerten()}>
                Jetzt auswerten ({offen})
              </Button>
            )}
          </Group>
          <Group justify="space-between">
            <Group gap="xs">
              {zuEntscheiden > 0 ? (
                <Button size="xs" color="orange" onClick={() => setEntscheiden(true)} data-zu-entscheiden>
                  {zuEntscheiden} Antwort{zuEntscheiden === 1 ? '' : 'en'} zu entscheiden
                </Button>
              ) : (
                <Text size="sm" c="dimmed">
                  Nichts zu entscheiden.
                </Text>
              )}
              {d.ohneIserv && d.status !== 'beendet' && (
                <Tooltip label="Nur mit Konto: Ergebnisse stehen bei den Lernenden unter „Meine Ergebnisse“. Gäste geben nur ihren Namen ein.">
                  <Switch
                    size="sm"
                    label="auch Gäste (mit Namen)"
                    checked={d.einstellungen.gaeste !== false}
                    onChange={(e) => void status(e.currentTarget.checked ? 'gaeste' : 'nurKonto')}
                    data-gaeste-schalter
                  />
                </Tooltip>
              )}
            </Group>
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                {d.ergebnisSichtbar ? 'Ergebnisse für die Lernenden sichtbar' : 'Ergebnisse erscheinen, wenn alle abgegeben haben'}
              </Text>
              <Button
                size="xs"
                variant="light"
                onClick={() => void status(d.einstellungen.ergebnisFrei ? 'zurueckhalten' : 'freigeben')}
                data-ergebnis-freigeben
              >
                {d.einstellungen.ergebnisFrei ? 'Freigabe zurücknehmen' : 'Ergebnisse jetzt freigeben'}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Card>
      <Group justify="space-between">
        <Button
          variant="subtle"
          leftSection={listeOffen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          onClick={() => setListeOffen(!listeOffen)}
          data-namensliste-knopf
        >
          Teilnehmende ({d.teilnahmen.length})
        </Button>
        <Group gap="xs">
          <Tooltip label={verdeckt ? 'Namen zeigen' : 'Namen ausblenden (z. B. an der Tafel)'}>
            <ActionIcon variant="light" onClick={() => setVerdeckt(!verdeckt)} aria-label={verdeckt ? 'Namen zeigen' : 'Namen ausblenden'} data-namen-verdecken>
              {verdeckt ? <IconEye size={16} /> : <IconEyeOff size={16} />}
            </ActionIcon>
          </Tooltip>
          <Export d={d} />
        </Group>
      </Group>
      <Collapse expanded={listeOffen}>
        <Table striped highlightOnHover data-namensliste>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Fassung</Table.Th>
              <Table.Th>Stand</Table.Th>
              <Table.Th>Punkte</Table.Th>
              <Table.Th>Note</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {d.teilnahmen.map((t, i) => (
              <Table.Tr key={t.id} style={{ cursor: t.beginn ? 'pointer' : undefined }} onClick={() => t.beginn && setDurchsicht(t.id)}>
                <Table.Td>
                  {nameVon(t, i)}
                  {!verdeckt && t.benutzer && (
                    <Text size="xs" c="dimmed">
                      {t.benutzer}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{t.variante}</Table.Td>
                <Table.Td>
                  {t.beginn === 0 ? (
                    <Badge color="yellow">wartet</Badge>
                  ) : !t.abgabe ? (
                    <Badge color="blue">schreibt</Badge>
                  ) : t.verlassen ? (
                    <Tooltip label="Hat die Seite verlassen – automatisch abgegeben">
                      <Badge color="red">verlassen {new Date(t.abgabe).toLocaleTimeString('de-DE', { timeStyle: 'short' })}</Badge>
                    </Tooltip>
                  ) : (
                    <Badge color={t.grund === 'zeit' ? 'orange' : 'green'}>
                      {t.grund === 'zeit' ? 'Zeit abgelaufen' : t.grund === 'lehrkraft' ? 'beendet' : 'abgegeben'}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  {t.abgabe ? `${t.punkte}/${t.max}` : '–'}
                  {t.offen + t.zuEntscheiden > 0 && (
                    <Badge ml="xs" size="sm" color="orange">
                      {t.offen + t.zuEntscheiden} zu prüfen
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{t.note ?? '–'}</Table.Td>
                <Table.Td>
                  {t.beginn === 0 && (
                    <Tooltip label="Entfernen (z. B. vertippter Name)">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation()
                          void senden(`/server/onlinetest/${id}/entfernen`, { teilnahme: t.id }).then(laden, (er: unknown) => notifyError(er))
                        }}
                        aria-label="Entfernen"
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {d.fehlend.length > 0 && !verdeckt && (
          <Text size="sm" c="dimmed" mt="xs">
            Noch nicht beigetreten: {d.fehlend.map((f) => f.name || f.benutzer).join(', ')}
          </Text>
        )}
      </Collapse>
      {durchsicht && (
        <Durchsicht
          test={d}
          t={d.teilnahmen.find((x) => x.id === durchsicht)!}
          name={nameVon(
            d.teilnahmen.find((x) => x.id === durchsicht)!,
            d.teilnahmen.findIndex((x) => x.id === durchsicht)
          )}
          schliessen={() => setDurchsicht(null)}
          geaendert={laden}
        />
      )}
      {entscheiden && <Entscheidungen test={d} verdeckt={verdeckt} schliessen={() => setEntscheiden(false)} geaendert={laden} />}
      {umbenennen != null && (
        <Modal opened onClose={() => setUmbenennen(null)} title="Test umbenennen">
          <Stack>
            <TextInput value={umbenennen} onChange={(e) => setUmbenennen(e.currentTarget.value)} data-autofocus />
            <Button
              disabled={!umbenennen.trim()}
              onClick={() =>
                void senden(`/server/onlinetest/${id}/umbenennen`, { titel: umbenennen }).then(
                  () => (setUmbenennen(null), laden()),
                  (e: unknown) => notifyError(e)
                )
              }
            >
              Speichern
            </Button>
          </Stack>
        </Modal>
      )}
    </Stack>
  )
}

const PRUEF_TEXT = { kleinerFehler: 'kleiner Fehler – trotzdem Punkt?', sinnvoll: 'andere, sinnvolle Antwort – akzeptieren?' }

/** Eine Bewertungseinheit: Antworten mit Lösung, Hinweis der KI und die Entscheidung der Lehrkraft */
/** Handschrift einer Teilnahme: je Feld die Schriftbilder mit dem erkannten Text */
type Tinte = Record<string, { bild: string; text: string; unsicher: boolean }[]>

function EinheitZeile({
  test,
  t,
  e,
  urteil,
  tinte
}: {
  test: TestDetail
  t: Teilnahme
  e: Einheit
  urteil: (einheit: string, richtig: boolean, punkte?: number) => void
  tinte?: Tinte
}): React.JSX.Element {
  const f = test.fassungen[t.varianteNr]
  const felder = useMemo(() => felderVon(f), [f])
  const b = t.bewertung[e.id]
  const offen = b?.pruefen && b.quelle !== 'lehrkraft'
  const farbe = offen ? 'orange' : b?.status === 'richtig' ? 'green' : b?.status === 'falsch' ? 'red' : 'orange'
  return (
    <Group align="start" wrap="nowrap" gap="sm" data-einheit={e.id}>
      <Badge color={farbe} w={96} variant={b?.quelle === 'lehrkraft' ? 'filled' : 'light'}>
        {b ? (b.status === 'ki' ? 'KI offen' : b.status === 'lehrkraft' ? 'prüfen' : offen ? 'entscheiden' : `${b.punkte}/${e.punkte}`) : '–'}
      </Badge>
      <Stack gap={0} style={{ flex: 1 }}>
        {e.felder.map((id) => {
          const x = felder.get(id)
          return (
            <Text key={id} size="sm">
              {x?.feld.beschriftung ? `${x.feld.beschriftung}: ` : ''}
              <b>{antwortAlsText(t.antworten[id], x?.feld.optionen) || '—'}</b>
              <Text span size="xs" c="dimmed">
                {'  '}Lösung: {loesungAlsText(f.loesungen[id], x?.feld.optionen) || '(frei – Lehrkraft)'}
              </Text>
            </Text>
          )
        })}
        {e.felder.flatMap((id) => tinte?.[id] ?? []).length > 0 && (
          <Group gap={6} mt={4} data-tinte>
            {e.felder
              .flatMap((id) => tinte?.[id] ?? [])
              .map((x, i) => (
                <Tooltip key={i} label={`erkannt als: ${x.text || '—'}${x.unsicher ? ' (unsicher)' : ''}`}>
                  <img
                    src={x.bild}
                    alt={`Handschrift: ${x.text}`}
                    style={{ height: 34, background: '#fff', border: `1px solid ${x.unsicher ? '#f08c00' : '#ced4da'}`, borderRadius: 4 }}
                  />
                </Tooltip>
              ))}
            <Text size="xs" c="dimmed">
              Handschrift
            </Text>
          </Group>
        )}
        {b?.pruefen && (
          <Text size="xs" c="orange.8" fw={600}>
            {PRUEF_TEXT[b.pruefen]}
            {b.quelle === 'lehrkraft' ? (b.status === 'richtig' ? ' – akzeptiert' : ' – nicht akzeptiert') : ''}
          </Text>
        )}
        {b?.hinweis && (
          <Text size="xs" c={b.quelle === 'ki' ? 'violet' : 'dimmed'}>
            {b.quelle === 'ki' && !b.hinweis.startsWith('KI') ? 'KI: ' : ''}
            {b.hinweis}
          </Text>
        )}
      </Stack>
      {e.punkte > 1 && f.loesungen[e.felder[0]]?.art === 'lehrkraft' ? (
        <NumberInput
          size="xs"
          w={80}
          min={0}
          max={e.punkte}
          step={1}
          defaultValue={b?.punkte ?? 0}
          onBlur={(ev) => urteil(e.id, true, Number(ev.currentTarget.value))}
        />
      ) : (
        <Group gap={2} wrap="nowrap">
          <Tooltip label={offen ? 'Akzeptieren (ganzer Punkt)' : 'richtig'}>
            <ActionIcon color="green" variant={b?.status === 'richtig' ? 'filled' : 'light'} onClick={() => urteil(e.id, true)} aria-label="richtig">
              <IconCheck size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={offen ? 'Nicht akzeptieren' : 'falsch'}>
            <ActionIcon color="red" variant={b?.status === 'falsch' && !offen ? 'filled' : 'light'} onClick={() => urteil(e.id, false)} aria-label="falsch">
              <IconX size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Group>
  )
}

function Durchsicht({
  test,
  t,
  name,
  schliessen,
  geaendert
}: {
  test: TestDetail
  t: Teilnahme
  name: string
  schliessen: () => void
  geaendert: () => void
}): React.JSX.Element {
  const f = test.fassungen[t.varianteNr]
  const [blatt, setBlatt] = useState(false)
  const [tinte, setTinte] = useState<Tinte>({})
  useEffect(() => {
    void senden<{ tinte: { feld: string; bild: string; text: string; unsicher: boolean }[] }>(`/server/onlinetest/${test.id}/tinte`, { teilnahme: t.id })
      .then((r) => {
        const m: Tinte = {}
        for (const x of r.tinte) (m[x.feld] ??= []).push(x)
        setTinte(m)
      })
      .catch(() => undefined)
  }, [test.id, t.id])
  if (blatt && blattMoeglich(test, t)) {
    const a = abgabeVon(test, t, name)
    return (
      <Modal opened onClose={schliessen} title={`${name} · als Blatt`} size="auto" data-blatt-modal>
        <Group mb="sm" gap="xs">
          <Button variant="subtle" onClick={() => setBlatt(false)}>
            ← Zur Durchsicht
          </Button>
          <Button
            variant="light"
            leftSection={<IconPrinter size={14} />}
            onClick={() => void window.api.exporter.print(abgabenHtml(test.einstellungen.blatt!, [a])).catch((e: unknown) => notifyError(e))}
          >
            Drucken
          </Button>
          <Button
            variant="light"
            onClick={() =>
              void window.api.exporter.pdf(abgabenHtml(test.einstellungen.blatt!, [a]), `${dateiName(test)} ${name}.pdf`).catch((e: unknown) => notifyError(e))
            }
          >
            PDF
          </Button>
        </Group>
        <div style={{ overflowX: 'auto' }}>
          <Text size="xs" c="dimmed" mb={4}>
            Ein Klick auf ein Zeichen ändert die Bewertung: ✓ richtig · (✓) knapp richtig · ✗ falsch · ? zu allgemein.
          </Text>
          <AbgabeBlatt
            kopf={test.einstellungen.blatt!}
            {...a}
            aendern={(einheit, zeichen) =>
              void senden(`/server/onlinetest/${test.id}/korrektur`, { teilnahme: t.id, einheit, zeichen }).then(geaendert, (e: unknown) => notifyError(e))
            }
          />
        </div>
      </Modal>
    )
  }
  const urteil = (einheit: string, richtig: boolean, punkte?: number): void =>
    void senden(`/server/onlinetest/${test.id}/korrektur`, { teilnahme: t.id, einheit, richtig, ...(punkte != null ? { punkte } : {}) }).then(
      geaendert,
      (e: unknown) => notifyError(e)
    )
  return (
    <Modal opened onClose={schliessen} title={`${name} · Fassung ${t.variante} · ${t.punkte}/${t.max} Punkte`} size="xl">
      <Stack>
        {!t.abgabe && (
          <Button
            variant="light"
            color="orange"
            onClick={() => void senden(`/server/onlinetest/${test.id}/abschliessen`, { teilnahme: t.id }).then(geaendert, (e: unknown) => notifyError(e))}
          >
            Für diese Person jetzt abgeben
          </Button>
        )}
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Jede Antwort lässt sich nachträglich umentscheiden – auch nach dem Ende des Tests: ✓ gibt den ganzen Punkt, ✗ nimmt ihn.
          </Text>
          <Tooltip
            label={
              blattMoeglich(test, t) ? 'Der ganze Test als DIN-A4-Blatt mit den Eingaben' : 'Nur für Onlinetests, die ab dem 02.10.2026 abends angelegt wurden'
            }
          >
            <Button size="xs" variant="light" disabled={!blattMoeglich(test, t)} onClick={() => setBlatt(true)} data-als-blatt>
              Als Blatt ansehen
            </Button>
          </Tooltip>
        </Group>
        {f.aufgaben.map((a, ai) => (
          <Card key={a.id} withBorder padding="sm">
            <Text fw={700} mb={4}>
              {ai + 1}. {a.titel}
            </Text>
            <Stack gap={6}>
              {f.einheiten
                .filter((e) => e.aufgabe === a.id)
                .map((e) => (
                  <EinheitZeile key={e.id} test={test} t={t} e={e} urteil={urteil} tinte={tinte} />
                ))}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Modal>
  )
}

/** Alle von der KI markierten Antworten aller Lernenden auf einen Blick */
function Entscheidungen({
  test,
  verdeckt,
  schliessen,
  geaendert
}: {
  test: TestDetail
  verdeckt: boolean
  schliessen: () => void
  geaendert: () => void
}): React.JSX.Element {
  const [alle, setAlle] = useState(false)
  const faelle = test.teilnahmen.flatMap((t, i) =>
    test.fassungen[t.varianteNr].einheiten
      .filter((e) => {
        const b = t.bewertung[e.id]
        return b?.pruefen && (alle || b.quelle !== 'lehrkraft')
      })
      .map((e) => ({ t, e, name: verdeckt ? `Person ${i + 1}` : t.name }))
  )
  return (
    <Modal opened onClose={schliessen} title="Zu entscheiden" size="xl">
      <Stack>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Kleine Fehler und von der Lösung abweichende, sinnvolle Antworten – bis zur Entscheidung 0 Punkte.
          </Text>
          <Switch size="xs" label="auch schon entschiedene" checked={alle} onChange={(e) => setAlle(e.currentTarget.checked)} />
        </Group>
        {faelle.length === 0 && <Text c="dimmed">Alles entschieden.</Text>}
        {faelle.map(({ t, e, name }) => (
          <Card key={`${t.id}-${e.id}`} withBorder padding="xs">
            <Text size="xs" c="dimmed" mb={4}>
              {name} · {test.fassungen[t.varianteNr].aufgaben.find((a) => a.id === e.aufgabe)?.titel}
            </Text>
            <EinheitZeile
              test={test}
              t={t}
              e={e}
              urteil={(einheit, richtig) =>
                void senden(`/server/onlinetest/${test.id}/korrektur`, { teilnahme: t.id, einheit, richtig }).then(geaendert, (er: unknown) => notifyError(er))
              }
            />
          </Card>
        ))}
      </Stack>
    </Modal>
  )
}

// ---------------------------------------------------------------- Lerngruppen

interface Gruppe {
  id: string
  name: string
  fach: string
  iserv_gruppe: string
  mitglieder: string[]
  anzahl: number
}

interface Historie {
  gruppe: Gruppe
  mitglieder: { name: string; benutzer: string }[]
  tests: { id: string; titel: string; datum: string; teilnehmer: number; offen: number; durchschnitt: number | null; verteilung: number[] }[]
  schueler: { name: string; benutzer: string; tests: number; durchschnitt: number; prozent: number }[]
}

/**
 * Gruppen aus den IServ-ORDNERN (02.10.2026, Wunsch der Lehrkraft): Solange IServ die Gruppen
 * nicht über die Anmeldung liefert, zeigt der Ordner „Groups" (Gruppen), wo jemand Mitglied ist –
 * „Klasse 10b" heißt: Lerngruppe 10b. Lesen kann das nur die Exe (IServ-Passwort bleibt am PC).
 */
const KLASSE_ODER_KURS = /^(klasse|kl\.?|jahrgang|jg\.?|kurs|q[12]|e[f]?|\d{1,2}\s*[a-z]{0,2}\b)/i
export const lerngruppenName = (ordner: string): string => ordner.replace(/^klasse\s+/i, '').trim()

async function iservGruppenordner(): Promise<string[] | null> {
  if (!hatClient()) return null
  const status = (await window.api.iserv.status().catch(() => null)) as { verbunden?: boolean } | null
  if (!status?.verbunden) return null
  return (await window.api.iserv.ordner('Groups')).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
}

function IservGruppenUebernehmen({ vorhanden, fertig }: { vorhanden: string[]; fertig: () => void }): React.JSX.Element {
  const [ordner, setOrdner] = useState<string[] | null>(null)
  const [fehler, setFehler] = useState('')
  const [wahl, setWahl] = useState<Set<string>>(new Set())
  useEffect(() => {
    iservGruppenordner()
      .then((o) => {
        if (!o)
          return setFehler(
            hatClient()
              ? 'IServ ist in der Exe noch nicht verbunden (Einstellungen › Material › IServ).'
              : 'Die IServ-Ordner kann nur die Exe „Schul-Apps Online“ lesen – das IServ-Passwort bleibt am PC.'
          )
        setOrdner(o)
        setWahl(new Set(o.filter((n) => KLASSE_ODER_KURS.test(n) && !vorhanden.includes(lerngruppenName(n).toLowerCase()))))
      })
      .catch((e: unknown) => setFehler(e instanceof Error ? e.message : String(e)))
  }, [vorhanden])
  const uebernehmen = async (): Promise<void> => {
    try {
      for (const n of wahl) await senden('/server/lerngruppen/anlegen', { name: lerngruppenName(n), iservGruppe: n })
      notifySuccess(`${wahl.size} Lerngruppe${wahl.size === 1 ? '' : 'n'} angelegt.`)
      fertig()
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <Modal opened onClose={fertig} title="Gruppen aus IServ übernehmen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Aus dem IServ-Ordner „Gruppen“: Jeder Gruppenordner zeigt eine Mitgliedschaft (z. B. „Klasse 10b“ → Lerngruppe „10b“). Klassen und Kurse sind
          vorausgewählt.
        </Text>
        {fehler && <Alert color="orange">{fehler}</Alert>}
        {!ordner && !fehler && <Loader />}
        {ordner?.length === 0 && <Text c="dimmed">Im Ordner „Gruppen“ ist nichts.</Text>}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {ordner?.map((n) => {
            const da = vorhanden.includes(lerngruppenName(n).toLowerCase())
            return (
              <Checkbox
                key={n}
                label={da ? `${n} (schon angelegt)` : n}
                disabled={da}
                checked={wahl.has(n)}
                onChange={(e) => {
                  const w = new Set(wahl)
                  if (e.currentTarget.checked) w.add(n)
                  else w.delete(n)
                  setWahl(w)
                }}
              />
            )
          })}
        </SimpleGrid>
        <Group justify="flex-end">
          <Button disabled={!wahl.size} onClick={() => void uebernehmen()}>
            {wahl.size} übernehmen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function Lerngruppen(): React.JSX.Element {
  const [d, setD] = useState<{ gruppen: Gruppe[]; iservGruppen: { id: string; name: string }[] } | null>(null)
  const [neu, setNeu] = useState(false)
  const [ausIserv, setAusIserv] = useState(false)
  const [ordnerGruppen, setOrdnerGruppen] = useState<{ id: string; name: string }[]>([])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const laden = useCallback(() => {
    void holen<NonNullable<typeof d>>('/server/lerngruppen')
      .then(setD)
      .catch((e: unknown) => notifyError(e))
  }, [])
  useEffect(laden, [laden])
  // In der Exe: Gruppenordner still mitlesen – sie stehen dann beim Anlegen zur Auswahl
  useEffect(() => {
    void iservGruppenordner()
      .then((o) => setOrdnerGruppen((o ?? []).map((n) => ({ id: n, name: n }))))
      .catch(() => undefined)
  }, [])
  if (gewaehlt) return <GruppenHistorie id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
  const auswahl = [...(d?.iservGruppen ?? []), ...ordnerGruppen.filter((o) => !d?.iservGruppen.some((g) => g.id === o.id))]
  return (
    <Stack>
      <Group>
        <Button onClick={() => setNeu(true)}>Lerngruppe anlegen</Button>
        <Tooltip label={hatClient() ? 'Klassen und Kurse aus dem IServ-Ordner „Gruppen“' : 'Nur in der Exe „Schul-Apps Online“ (IServ-Passwort bleibt am PC)'}>
          <Button variant="light" leftSection={<IconFolders size={16} />} onClick={() => setAusIserv(true)} data-iserv-gruppen>
            Aus IServ übernehmen
          </Button>
        </Tooltip>
      </Group>
      {!d && <Loader />}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        {d?.gruppen.map((g) => (
          <Card key={g.id} withBorder style={{ cursor: 'pointer' }} onClick={() => setGewaehlt(g.id)}>
            <Text fw={700}>{g.name}</Text>
            <Text size="sm" c="dimmed">
              {[g.fach, g.iserv_gruppe ? `IServ: ${g.iserv_gruppe}` : '', `${g.anzahl} Schüler/innen angemeldet`].filter(Boolean).join(' · ')}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
      {d?.gruppen.length === 0 && <Text c="dimmed">Noch keine Lerngruppe. Am einfachsten aus einer IServ-Gruppe (Klasse oder Kurs).</Text>}
      {ausIserv && d && (
        <IservGruppenUebernehmen
          vorhanden={d.gruppen.map((g) => g.name.toLowerCase())}
          fertig={() => {
            setAusIserv(false)
            laden()
          }}
        />
      )}
      {neu && d && (
        <NeueGruppe
          iservGruppen={auswahl}
          fertig={() => {
            setNeu(false)
            laden()
          }}
        />
      )}
    </Stack>
  )
}

function NeueGruppe({ iservGruppen, fertig }: { iservGruppen: { id: string; name: string }[]; fertig: () => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const [fach, setFach] = useState('')
  const [iserv, setIserv] = useState<string | null>(null)
  const [mitglieder, setMitglieder] = useState('')
  return (
    <Modal opened onClose={fertig} title="Lerngruppe anlegen">
      <Stack>
        <Select
          label="IServ-Gruppe (Klasse oder Kurs)"
          description="Wer in dieser Gruppe ist und sich anmeldet, gehört automatisch dazu."
          data={iservGruppen.map((g) => ({ value: g.id, label: g.name }))}
          value={iserv}
          onChange={(v) => {
            setIserv(v)
            if (v && !name) setName(lerngruppenName(iservGruppen.find((g) => g.id === v)?.name ?? ''))
          }}
          searchable
          clearable
          nothingFoundMessage={
            iservGruppen.length ? 'Nicht gefunden' : 'Keine Gruppen – Anmeldung über IServ oder die Exe „Schul-Apps Online“ mit verbundenem IServ'
          }
        />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="z. B. 8b Englisch" />
        <HaeufigSelect
          art="fach"
          label="Fach (optional)"
          searchable
          clearable
          data={FAECHER.filter((f) => f.id !== 'anderes').map((f) => ({ value: f.label, label: f.label }))}
          value={fach || null}
          onChange={(v) => setFach(v ?? '')}
        />
        <Textarea
          label="Weitere Mitglieder (IServ-Benutzernamen, optional)"
          description="Eine Zeile je Person, z. B. für Kurse ohne eigene IServ-Gruppe."
          value={mitglieder}
          onChange={(e) => setMitglieder(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Button
          disabled={!name.trim()}
          onClick={() =>
            void senden('/server/lerngruppen/anlegen', { name, fach, iservGruppe: iserv ?? '', mitglieder: mitglieder.split(/[\s,;]+/).filter(Boolean) })
              .then(fertig)
              .catch((e: unknown) => notifyError(e))
          }
        >
          Anlegen
        </Button>
      </Stack>
    </Modal>
  )
}

function Verteilung({ werte }: { werte: number[] }): React.JSX.Element {
  const max = Math.max(1, ...werte)
  return (
    <Group gap={3} align="end" h={36} aria-label={`Notenverteilung ${werte.join(', ')}`}>
      {werte.map((n, i) => (
        <Tooltip key={i} label={`Note ${i + 1}: ${n}`}>
          <Stack gap={0} align="center">
            <div
              style={{
                width: 14,
                height: Math.max(2, (n / max) * 26),
                background: 'var(--mantine-primary-color-filled)',
                borderRadius: 2,
                opacity: n ? 1 : 0.25
              }}
            />
            <Text size="9px">{i + 1}</Text>
          </Stack>
        </Tooltip>
      ))}
    </Group>
  )
}

function GruppenHistorie({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const [h, setH] = useState<Historie | null>(null)
  useEffect(() => {
    void holen<Historie>(`/server/lerngruppen/${id}`)
      .then(setH)
      .catch((e: unknown) => notifyError(e))
  }, [id])
  if (!h) return <Loader />
  const loeschen = async (): Promise<void> => {
    if (!window.confirm(`Lerngruppe „${h.gruppe.name}" löschen? Die Onlinetests bleiben erhalten.`)) return
    await senden('/server/lerngruppen/loeschen', { id }).catch((e: unknown) => notifyError(e))
    zurueck()
  }
  return (
    <Stack>
      <Group justify="space-between">
        <Button variant="subtle" onClick={zurueck}>
          ← Alle Lerngruppen
        </Button>
        <ActionIcon color="red" variant="subtle" onClick={() => void loeschen()} aria-label="Lerngruppe löschen">
          <IconTrash size={18} />
        </ActionIcon>
      </Group>
      <Title order={3}>{h.gruppe.name}</Title>
      <Text size="sm" c="dimmed">
        {h.mitglieder.length} Schülerinnen und Schüler angemeldet{h.mitglieder.length ? `: ${h.mitglieder.map((m) => m.name).join(', ')}` : ''}
      </Text>
      <Title order={4}>Tests</Title>
      {h.tests.length === 0 ? (
        <Text c="dimmed">Noch keine Onlinetests in dieser Lerngruppe.</Text>
      ) : (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Datum</Table.Th>
              <Table.Th>Test</Table.Th>
              <Table.Th>Teilnehmer</Table.Th>
              <Table.Th>Ø Note</Table.Th>
              <Table.Th>Verteilung</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {h.tests.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{new Date(t.datum).toLocaleDateString('de-DE')}</Table.Td>
                <Table.Td>
                  {t.titel}
                  {t.offen > 0 && (
                    <Badge ml="xs" size="sm" color="orange">
                      {t.offen} offen
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{t.teilnehmer}</Table.Td>
                <Table.Td>{t.durchschnitt?.toFixed(2).replace('.', ',') ?? '–'}</Table.Td>
                <Table.Td>
                  <Verteilung werte={t.verteilung} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Title order={4}>Schülerinnen und Schüler</Title>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Tests</Table.Th>
            <Table.Th>Ø Note</Table.Th>
            <Table.Th>Ø Prozent</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {h.schueler.map((s, i) => (
            <Table.Tr key={`${s.benutzer}-${s.name}-${i}`}>
              <Table.Td>{s.name}</Table.Td>
              <Table.Td>{s.tests}</Table.Td>
              <Table.Td>{s.durchschnitt.toFixed(2).replace('.', ',')}</Table.Td>
              <Table.Td>{s.prozent} %</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

/**
 * „Neuer Onlinetest" oben rechts (03.10.2026, Wunsch der Lehrkraft): einen gespeicherten Vokabeltest
 * wählen, dann derselbe Dialog wie im Vokabeltest – ohne Umweg über dessen Editor.
 */
/**
 * „Neuer Onlinetest" (05.10.2026 erweitert): Vokabeltest, Grammatiktest oder Lernzielkontrolle aus den
 * eigenen gespeicherten Dokumenten – dieselbe Durchführung wie über den Knopf im jeweiligen Editor.
 */
type NeuArt = 'vokabeltest' | 'grammatiktest' | 'lernzielkontrolle'
const NEU_ARTEN: { value: NeuArt; label: string; app: string }[] = [
  { value: 'vokabeltest', label: 'Vokabeltest', app: 'Vokabeltest' },
  { value: 'grammatiktest', label: 'Grammatiktest', app: 'Grammatiktest' },
  { value: 'lernzielkontrolle', label: 'Lernzielkontrolle', app: 'Lernzielkontrolle' }
]

function NeuerOnlinetest({ schliessen }: { schliessen: () => void }): React.JSX.Element {
  const [art, setArt] = useState<NeuArt>('vokabeltest')
  const [liste, setListe] = useState<{ id: string; name: string; updatedAt?: string }[] | null>(null)
  const [doc, setDoc] = useState<TestDocument | null>(null)
  const [blatt, setBlatt] = useState<BlattQuelleOnline | null>(null)
  const [listName, setListName] = useState('')
  const { logoDataUrl, settings } = useAppSettings()
  useEffect(() => {
    setListe(null)
    const laden = art === 'vokabeltest' ? window.api.tests.list() : art === 'grammatiktest' ? window.api.grammarTests.list() : window.api.kurztests.list()
    void laden.then(
      (l: { id: string; name: string; updatedAt?: string }[]) =>
        setListe([...l].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))),
      () => setListe([])
    )
  }, [art])
  if (doc) return <Erstellen doc={doc} listName={listName} schliessen={schliessen} />
  if (blatt) return <Erstellen blatt={blatt} schliessen={schliessen} />
  const name = NEU_ARTEN.find((a) => a.value === art)!
  const waehlen = async (id: string): Promise<void> => {
    if (art === 'vokabeltest') {
      const t = await window.api.tests.get(id)
      // Gespeicherte Vokabeltests: { vocab, settings, doc } – ältere/Test-Dateien: das Dokument selbst
      const p = t.payload as { doc?: TestDocument | null } & Partial<TestDocument>
      const d = p.doc ?? (p.variants ? (p as TestDocument) : null)
      if (!d) throw new Error('Dieser Vokabeltest ist noch nicht erstellt (nur eine Vokabelliste).')
      setListName(t.name)
      setDoc(d)
      return
    }
    if (art === 'grammatiktest') {
      const t = (await window.api.grammarTests.get(id)).payload as GrammarTest
      const ws = testToWorksheet(t)
      if (!ws.sheets.some((s) => s.blocks.some((b) => b.type === 'task'))) throw new Error('Dieser Grammatiktest hat noch keine Aufgaben.')
      setBlatt({
        art: 'Grammatiktest',
        fach: t.meta.subjectLabel,
        titel: t.meta.title || 'Grammatiktest',
        thema: t.meta.title || '',
        varianten: ws.sheets.map((s, i) => s.label || String.fromCharCode(65 + i)),
        fassungen: () => fassungenAusBlatt(ws, logoDataUrl ?? null, settings.schoolName)
      })
      return
    }
    const t = (await window.api.kurztests.get(id)).payload as Kurztest
    const ws = kurztestToWorksheetAlle(t, thresholdsForSubject(settings.gradeScale, t.meta.subjectId))
    if (!ws.sheets.some((s) => s.blocks.some((b) => b.type === 'task'))) throw new Error('Diese Lernzielkontrolle hat noch keine Aufgaben.')
    setBlatt({
      art: 'Lernzielkontrolle',
      fach: t.meta.subjectLabel,
      titel: t.meta.title || t.meta.thema || 'Lernzielkontrolle',
      thema: t.meta.thema || '',
      varianten: ws.sheets.map((s, i) => s.label || String.fromCharCode(65 + i)),
      fassungen: () => fassungenAusBlatt(ws, logoDataUrl ?? null, settings.schoolName)
    })
  }
  return (
    <Modal opened onClose={schliessen} title="Neuer Onlinetest" size="lg">
      <Stack>
        <SegmentedControl
          value={art}
          onChange={(v) => setArt(v as NeuArt)}
          data={NEU_ARTEN.map(({ value, label }) => ({ value, label }))}
          data-onlinetest-art
        />
        <Text size="sm" c="dimmed">
          Welcher {name.label} soll online geschrieben werden? Neue entstehen in der App „{name.app}“.
        </Text>
        {!liste && <Loader size="sm" />}
        {liste?.length === 0 && <Text c="dimmed">Noch nichts gespeichert.</Text>}
        <Select
          key={art}
          searchable
          label={name.label}
          placeholder="suchen …"
          data={(liste ?? []).map((t) => ({ value: t.id, label: t.name }))}
          onChange={(id) => {
            if (id) void waehlen(id).catch((e: unknown) => notifyError(e))
          }}
          data-onlinetest-wahl
        />
      </Stack>
    </Modal>
  )
}
