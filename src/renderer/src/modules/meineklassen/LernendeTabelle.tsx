/**
 * Reiter „Lernende" in „Meine Klassen" (10.10.2026, Wunsch der Lehrkraft: „grafisch passend zur Oberfläche"): statt
 * reinem Text kleine Fortschrittsbalken, Ampelpunkte, Symbole und kurze Zahlen.
 *  - Breiter Bildschirm: kompakte Tabelle, die Namensspalte bleibt beim waagerechten Rollen stehen; Sortierpfeile und
 *    Filter je Spalte (shared/components/SortierTabelle.tsx), Vor-/Nachname im Namenskopf.
 *  - Telefon: je Lernende/r eine kleine Karte mit denselben Mini-Bildern; Sortieren über eine Auswahl darüber.
 * Spalten ohne Werte (keine Vokabeln, keine Reihen …) entfallen wie bisher. Hell und dunkel über die Mantine-Farben.
 */
import { ActionIcon, Badge, Group, Paper, Progress, Select, SimpleGrid, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconArrowDown, IconArrowUp, IconBook2, IconClipboardCheck, IconFileText, IconLanguage, IconRoute } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { AktiveFilter, NamenFolgeKnopf, SortKopf, useSortierTabelle, type Spalte } from '../../shared/components/SortierTabelle'
import { CodezettelKnopf, GastFenster, useGaesteMitCode, type GastMitCode } from './LernendeCodes'
import { LernendeAuszeichnung, type AuszeichnungLehrkraft } from './LernendeAuszeichnung'
import { ampel } from './MaterialListe'

export interface LernendeZeile {
  id: string
  name: string
  gast?: boolean
  vokabelnSicher: number | null
  grammatikSicher?: number | null
  zuletztGeuebt: string | null
  testSchnitt: number | null
  tests: number
  reihenFortschritt: number | null
  blaetterEingereicht: number
  auszeichnung?: AuszeichnungLehrkraft
}

const TAG = 86_400_000
const prozent = (x: number): string => `${Math.round(x * 100)} %`
const note = (x: number): string => x.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** Tage seit dem letzten Üben (null = noch nie) */
export const tageSeit = (iso: string | null, jetzt = Date.now()): number | null => {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  const heute = new Date(jetzt)
  heute.setHours(0, 0, 0, 0)
  const tag = new Date(t)
  tag.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((heute.getTime() - tag.getTime()) / TAG))
}

/** Ampel „zuletzt geübt": bis 2 Tage grün, bis 7 gelb, länger rot, nie grau */
export const uebenAmpel = (tage: number | null): string => (tage === null ? 'gray' : tage <= 2 ? 'teal' : tage <= 7 ? 'yellow' : 'red')

/** „heute", „gestern", „vor 4 T.", sonst Datum */
export function uebenText(iso: string | null, jetzt = Date.now()): string {
  const tage = tageSeit(iso, jetzt)
  if (tage === null) return 'noch nie'
  if (tage === 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 14) return `vor ${tage} T.`
  return new Date(iso!).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

/** Farbe einer Schnittnote (1,0 … 6,0) */
export const notenFarbe = (n: number): string => (n <= 2.5 ? 'teal' : n <= 3.5 ? 'lime' : n <= 4.5 ? 'orange' : 'red')

const uebenGruppe = (tage: number | null): string => (tage === null ? 'noch nie' : tage <= 7 ? 'diese Woche' : 'länger her')

/** Kleiner Balken mit Prozent (Ampelfarbe) */
function MiniBalken({ x, titel }: { x: number | null | undefined; titel: string }): React.JSX.Element {
  if (x == null)
    return (
      <Text size="xs" c="dimmed">
        –
      </Text>
    )
  return (
    <Tooltip label={`${titel}: ${prozent(x)} sicher`} withinPortal>
      <Group gap={6} wrap="nowrap" data-mini-balken={ampel(x)}>
        <Progress value={x * 100} w={56} size={6} radius="xl" color={ampel(x)} aria-label={`${titel} ${prozent(x)}`} />
        <Text size="xs" fw={600} w={34} ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {prozent(x)}
        </Text>
      </Group>
    </Tooltip>
  )
}

/** Ampelpunkt mit kurzem Text */
function Punkt({ farbe, text, titel }: { farbe: string; text: string; titel?: string }): React.JSX.Element {
  const inhalt = (
    <Group gap={6} wrap="nowrap" data-ampel={farbe}>
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: `var(--mantine-color-${farbe}-${farbe === 'gray' ? 4 : 6})` }}
      />
      <Text size="xs" style={{ whiteSpace: 'nowrap' }}>
        {text}
      </Text>
    </Group>
  )
  return titel ? (
    <Tooltip label={titel} withinPortal>
      {inhalt}
    </Tooltip>
  ) : (
    inhalt
  )
}

function TestPille({ l }: { l: LernendeZeile }): React.JSX.Element {
  if (!l.tests || l.testSchnitt == null)
    return (
      <Text size="xs" c="dimmed">
        –
      </Text>
    )
  return (
    <Tooltip label={`${l.tests} ${l.tests === 1 ? 'Test' : 'Tests'}, Schnitt ${note(l.testSchnitt)}`} withinPortal>
      <Group gap={4} wrap="nowrap">
        <Badge size="sm" variant="light" color={notenFarbe(l.testSchnitt)} style={{ fontVariantNumeric: 'tabular-nums' }}>
          Ø {note(l.testSchnitt)}
        </Badge>
        <Text size="xs" c="dimmed">
          ({l.tests})
        </Text>
      </Group>
    </Tooltip>
  )
}

function Blaetter({ n }: { n: number }): React.JSX.Element {
  return (
    <Tooltip label={`${n} ${n === 1 ? 'Blatt' : 'Blätter'} eingereicht`} withinPortal>
      <Group gap={4} wrap="nowrap" c={n ? undefined : 'dimmed'}>
        <IconFileText size={14} />
        <Text size="xs" fw={600}>
          {n}
        </Text>
      </Group>
    </Tooltip>
  )
}

export function LernendeTabelle({
  gruppeId,
  titel,
  lernende,
  neuLaden
}: {
  gruppeId: string
  titel: string
  lernende: LernendeZeile[]
  neuLaden: () => void
}): React.JSX.Element {
  const telefon = useMediaQuery('(max-width: 700px)') ?? false
  // Lernende mit Anmeldecode (09.10.2026, LernendeCodes.tsx): Codezettel für alle, Klick auf den Namen öffnet den Zugang
  const { gaeste, laden: gaesteLaden } = useGaesteMitCode(gruppeId, lernende.some((l) => l.gast))
  const [gastOffen, setGastOffen] = useState<GastMitCode | null>(null)
  const zeigtVokabeln = lernende.some((l) => l.vokabelnSicher !== null)
  const zeigtReihen = lernende.some((l) => l.reihenFortschritt !== null)
  const zeigtGrammatik = lernende.some((l) => l.grammatikSicher != null)
  const zeigtAuszeichnung = lernende.some((l) => l.auszeichnung)
  const spalten = useMemo<Spalte<LernendeZeile>[]>(
    () =>
      [
        { id: 'name', label: 'Name', wert: (l: LernendeZeile) => l.name, namen: true, filter: 'text' as const },
        zeigtVokabeln && { id: 'vokabeln', label: 'Vokabeln', wert: (l: LernendeZeile) => l.vokabelnSicher ?? -1, absteigend: true },
        zeigtVokabeln && {
          id: 'geuebt',
          label: 'Zuletzt geübt',
          wert: (l: LernendeZeile) => Date.parse(l.zuletztGeuebt ?? '') || 0,
          absteigend: true,
          filter: 'auswahl' as const,
          filterWert: (l: LernendeZeile) => uebenGruppe(tageSeit(l.zuletztGeuebt))
        },
        zeigtGrammatik && { id: 'grammatik', label: 'Grammatik', wert: (l: LernendeZeile) => l.grammatikSicher ?? -1, absteigend: true },
        { id: 'tests', label: 'Tests', wert: (l: LernendeZeile) => (l.tests && l.testSchnitt != null ? l.testSchnitt : 99) },
        {
          id: 'reihen',
          label: zeigtReihen ? 'Reihen & Blätter' : 'Blätter',
          wert: (l: LernendeZeile) => (l.reihenFortschritt ?? -1) * 1000 + l.blaetterEingereicht,
          absteigend: true
        }
      ].filter(Boolean) as Spalte<LernendeZeile>[],
    [zeigtVokabeln, zeigtGrammatik, zeigtReihen]
  )
  const t = useSortierTabelle(lernende, spalten, { spalte: 'name', ab: false })
  if (!lernende.length) return <Text c="dimmed">Noch keine Lernenden in dieser Lerngruppe.</Text>

  const name = (l: LernendeZeile): React.JSX.Element => (
    <Group gap={6} wrap="nowrap">
      {l.gast ? (
        <UnstyledButton
          fw={600}
          fz="sm"
          td="underline"
          style={{ textDecorationStyle: 'dotted', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}
          title="Code, Zettel und Name"
          onClick={() => setGastOffen(gaeste.find((g) => g.id === l.id) ?? { id: l.id, name: l.name, zugang: '' })}
          data-gast-name={l.name}
        >
          {l.name}
        </UnstyledButton>
      ) : (
        <Text fw={600} size="sm" style={{ whiteSpace: 'nowrap' }}>
          {l.name}
        </Text>
      )}
      {l.gast && (
        <Tooltip label="Meldet sich mit dem persönlichen Code vom Zettel an" withinPortal>
          <Badge size="xs" variant="light" color="gray" data-mit-anmeldecode>
            Code
          </Badge>
        </Tooltip>
      )}
    </Group>
  )
  const geuebt = (l: LernendeZeile): React.JSX.Element => {
    const tage = tageSeit(l.zuletztGeuebt)
    return <Punkt farbe={uebenAmpel(tage)} text={uebenText(l.zuletztGeuebt)} titel={`Vokabeln zuletzt geübt: ${uebenText(l.zuletztGeuebt)}`} />
  }
  const reihenBlaetter = (l: LernendeZeile): React.JSX.Element => (
    <Group gap="sm" wrap="nowrap">
      {zeigtReihen && <MiniBalken x={l.reihenFortschritt} titel="Unterrichtsreihen" />}
      <Blaetter n={l.blaetterEingereicht} />
    </Group>
  )

  const kopf = (
    <>
      {lernende.some((l) => l.gast) && gaeste.some((g) => g.zugang.length === 8) && (
        <Group justify="flex-end" data-lernende-codezettel>
          <CodezettelKnopf titel={titel} gaeste={gaeste} />
        </Group>
      )}
      {gastOffen && (
        <GastFenster gruppeId={gruppeId} titel={titel} gast={gastOffen} schliessen={() => setGastOffen(null)} geaendert={() => (gaesteLaden(), neuLaden())} />
      )}
      <AktiveFilter spalten={spalten} tabelle={t} />
    </>
  )

  // ---------- Telefon: je Lernende/r eine kleine Karte
  if (telefon) {
    const sp = spalten.find((s) => s.id === t.sort.spalte)
    return (
      <Stack gap="xs" data-lernende-tabelle data-lernende-karten>
        {kopf}
        <Group gap={6} wrap="nowrap">
          <Select
            size="xs"
            data={spalten.map((s) => ({ value: s.id, label: s.label }))}
            value={t.sort.spalte}
            onChange={(v) => v && t.setSort({ spalte: v, ab: Boolean(spalten.find((s) => s.id === v)?.absteigend) })}
            allowDeselect={false}
            aria-label="Sortieren nach"
            leftSection={<Text size="xs">↕</Text>}
            style={{ flex: 1 }}
            data-lernende-sortieren
          />
          <ActionIcon variant="light" onClick={() => t.setSort({ ...t.sort, ab: !t.sort.ab })} aria-label={t.sort.ab ? 'absteigend – umkehren' : 'aufsteigend – umkehren'}>
            {t.sort.ab ? <IconArrowDown size={14} /> : <IconArrowUp size={14} />}
          </ActionIcon>
          {sp?.namen && <NamenFolgeKnopf folge={t.folge} setFolge={t.setFolge} />}
        </Group>
        {t.sichtbar.map((l) => (
          <Paper key={l.id} withBorder radius="md" p="xs" data-lernende-karte={l.name}>
            <Group justify="space-between" wrap="nowrap" mb={6}>
              {name(l)}
              {zeigtVokabeln && geuebt(l)}
            </Group>
            <SimpleGrid cols={2} spacing={6} verticalSpacing={4}>
              {zeigtVokabeln && (
                <Group gap={4} wrap="nowrap">
                  <IconLanguage size={14} color="var(--mantine-color-dimmed)" />
                  <MiniBalken x={l.vokabelnSicher} titel="Vokabeln" />
                </Group>
              )}
              {zeigtGrammatik && (
                <Group gap={4} wrap="nowrap">
                  <IconBook2 size={14} color="var(--mantine-color-dimmed)" />
                  <MiniBalken x={l.grammatikSicher} titel="Grammatik" />
                </Group>
              )}
              {zeigtReihen && (
                <Group gap={4} wrap="nowrap">
                  <IconRoute size={14} color="var(--mantine-color-dimmed)" />
                  <MiniBalken x={l.reihenFortschritt} titel="Unterrichtsreihen" />
                </Group>
              )}
              <Group gap="sm" wrap="nowrap">
                <Group gap={4} wrap="nowrap">
                  <IconClipboardCheck size={14} color="var(--mantine-color-dimmed)" />
                  <TestPille l={l} />
                </Group>
                <Blaetter n={l.blaetterEingereicht} />
              </Group>
            </SimpleGrid>
            {l.auszeichnung && (
              <div style={{ marginTop: 6 }}>
                <LernendeAuszeichnung a={l.auszeichnung} name={l.name} />
              </div>
            )}
          </Paper>
        ))}
      </Stack>
    )
  }

  // ---------- Breit: kompakte Tabelle, Namensspalte bleibt beim Rollen stehen
  return (
    <Stack gap="xs">
      {kopf}
      <Table.ScrollContainer minWidth={640} type="native">
        <Table highlightOnHover verticalSpacing={6} className="mk-lernende" data-lernende-tabelle>
          <Table.Thead>
            <Table.Tr>
              {spalten.map((s) => (
                <SortKopf key={s.id} spalte={s} tabelle={t} />
              ))}
              {zeigtAuszeichnung && <Table.Th title="Medaillen und Titel – als Gesprächsanlass, ohne Rangfolge">Medaillen & Titel</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {t.sichtbar.map((l) => (
              <Table.Tr key={l.id} data-lernende-zeile={l.name}>
                <Table.Td>{name(l)}</Table.Td>
                {zeigtVokabeln && (
                  <Table.Td>
                    <MiniBalken x={l.vokabelnSicher} titel="Vokabeln" />
                  </Table.Td>
                )}
                {zeigtVokabeln && <Table.Td>{geuebt(l)}</Table.Td>}
                {zeigtGrammatik && (
                  <Table.Td>
                    <MiniBalken x={l.grammatikSicher} titel="Grammatik" />
                  </Table.Td>
                )}
                <Table.Td>
                  <TestPille l={l} />
                </Table.Td>
                <Table.Td>{reihenBlaetter(l)}</Table.Td>
                {zeigtAuszeichnung && (
                  <Table.Td>
                    <LernendeAuszeichnung a={l.auszeichnung} name={l.name} />
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
            {t.sichtbar.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={spalten.length + (zeigtAuszeichnung ? 1 : 0)}>
                  <Text size="sm" c="dimmed">
                    Niemand passt zum Filter.
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
