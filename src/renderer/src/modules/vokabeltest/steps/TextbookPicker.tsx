import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Menu,
  Modal,
  MultiSelect,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput
} from '@mantine/core'
import { IconBook2, IconDotsVertical, IconFileImport, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import { MARK_BOX, MARK_EXPLAINED, MARK_GREY } from '@shared/types'
import type { Textbook, TextbookMeta, TextbookSectionMeta } from '@shared/types'
import DropZone, { FILE_TYPES } from '../../../shared/components/DropZone'
import { collectKnownVocab } from '../../../shared/knownVocab'
import type { KnownVocab } from '../../../shared/knownVocab'
import { notifyError, notifySuccess } from '../../../shared/util'
import { buildTextbooks, ColumnMap, ColumnRole, COLUMN_ROLES, decodeCsv, detectColumns, guessLanguage, hasHeader, parseCsvRows } from '../input/textbookCsv'
import { newId } from '../model/random'
import { LANGUAGES, VocabEntry } from '../model/types'

const STORAGE_KEY = 'vokabeltest-lehrwerk-auswahl'

/** Beispiel mit allen erkannten Spalten (Semikolon wie in deutschem Excel; BOM, damit Umlaute richtig erscheinen) */
const TEMPLATE_CSV =
  String.fromCharCode(0xfeff) +
  [
    'Lehrwerk;Band;Klasse;Unit;Abschnitt;Englisch;Deutsch;Wortart;Beispiel;Seite;Passiv',
    'Green Line;1;5;Welcome;Check-in;hello;hallo;;Hello, I am Tom.;8;',
    ';;;;;goodbye;auf Wiedersehen;;;8;',
    ';;;Unit 1;Station 1;classroom;Klassenzimmer;n;;20;',
    ';;;;Station 2;ruler;Lineal;n;;24;ja'
  ].join(String.fromCharCode(13, 10))

const languageLabel = (code: string): string => LANGUAGES.find((l) => l.value === code)?.label ?? code

/**
 * Welche besonders gekennzeichneten Vokabeln mitkommen. Alle drei sind standardmäßig aus:
 * Abgefragt wird zunächst nur der laufende Wortschatz.
 */
export interface TextbookFilter {
  /** Vokabeln aus Kästen (z. B. „Numbers 0-12“) */
  boxes: boolean
  /** grau gedruckte Vokabeln (müssen die Schüler nicht unbedingt lernen) */
  grey: boolean
  /** Einträge mit Erklärung statt Übersetzung (im Buch farbig gedruckt) */
  explained: boolean
}

export const NO_MARKS: TextbookFilter = { boxes: false, grey: false, explained: false }

/** Passt eine Kennzeichnungs-Kombination (Bitmaske) zum Filter? */
const allowed = (mask: number, filter: TextbookFilter): boolean =>
  (!(mask & MARK_BOX) || filter.boxes) && (!(mask & MARK_GREY) || filter.grey) && (!(mask & MARK_EXPLAINED) || filter.explained)

/** Zahl der Vokabeln eines Abschnitts unter dem gewählten Filter. */
export function sectionCount(section: TextbookSectionMeta, filter: TextbookFilter): number {
  return section.marks.reduce((n, count, mask) => (allowed(mask, filter) ? n + count : n), 0)
}

/** Alle Vokabeln des Abschnitts, unabhängig von Kennzeichnungen */
export const sectionTotal = (section: TextbookSectionMeta): number => section.marks.reduce((a, b) => a + b, 0)

/** Vokabeln des Abschnitts mit einer bestimmten Kennzeichnung (z. B. alle aus Kästen) */
export const markCount = (section: TextbookSectionMeta, bit: number): number => section.marks.reduce((n, count, mask) => (mask & bit ? n + count : n), 0)

/**
 * Schulbuch-Vokabeln wie aus einer hineingezogenen Datei übernehmen.
 * Vokabeln aus Kästen und grau gedruckte kommen nur mit, wenn der Filter sie zulässt.
 */
export function textbookEntries(book: Textbook, unitName: string, sectionNames: string[], filter: TextbookFilter = NO_MARKS): VocabEntry[] {
  const unit = book.units.find((u) => u.name === unitName)
  if (!unit) return []
  return unit.sections
    .filter((s) => sectionNames.includes(s.name))
    .flatMap((s) =>
      s.entries
        .filter((e) => (filter.boxes || !e.inBox) && (filter.grey || !e.grey) && (filter.explained || !e.explained))
        .map((e) => ({
          id: newId(),
          term: e.term,
          translation: e.translation,
          pos: e.pos,
          // Der Beispielsatz des Buches gehört zur Vokabel und steht im Feld „Beispiel/Hinweis“
          note: [e.note, e.page ? `S. ${e.page}` : '', e.example].filter(Boolean).join(' · ') || undefined,
          ...(e.grey ? { grey: true } : {}),
          ...(e.inBox ? { inBox: true } : {}),
          ...(e.explained ? { explained: true } : {}),
          // Markiert ist alles außer den grau gedruckten Vokabeln
          include: !e.grey
        }))
    )
}

/** Jahrgang, Bundesland und Schulform des Bandes */
export const bookContext = (book: TextbookMeta): BookContext => ({
  bookName: book.name,
  grade: book.grade,
  stateId: book.stateId,
  schoolTypeId: book.schoolTypeId,
  language: book.language
})

export function selectionName(book: { name: string }, unit: string, sections: string[], allSections: string[]): string {
  const part = sections.length === allSections.length || sections.length === 0 ? '' : `, ${sections.join(' + ')}`
  return `${book.name} – ${unit}${part}`
}

/** Herkunft der übernommenen Vokabeln (Jahrgang, Bundesland, Schulform des Bandes) */
export interface BookContext {
  bookName: string
  grade?: number
  stateId?: string
  schoolTypeId?: string
  language?: string
  /** Wortschatz aus früheren Abschnitten und Bänden – die KI darf nicht darüber hinausgehen */
  known?: KnownVocab
}

/** Aktuelle Auswahl im Auswähler, auch ohne dass sie schon übernommen wurde */
export interface BookSelection {
  bookId: string
  name: string
  unit: string
  sections: string[]
  filter: TextbookFilter
  count: number
  context: BookContext
}

/** Lerngruppe, zu der ein Lehrwerk vorgeschlagen wird */
export interface BookPreference {
  stateId?: string
  schoolTypeId?: string
  grade?: number
  /** Sprachcode (en, fr …): blendet Lehrwerke anderer Sprachen aus */
  language?: string
}

/**
 * Wählt das Lehrwerk, das am besten zur Lerngruppe passt: gleiche Sprache, gleiches
 * Bundesland und gleiche Schulform, und der Jahrgang möglichst genau getroffen.
 */
export function bookForGroup(books: TextbookMeta[], want: BookPreference): TextbookMeta | undefined {
  const fits = books.filter(
    (b) =>
      (!want.language || b.language === want.language) &&
      (!want.stateId || !b.stateId || b.stateId === want.stateId) &&
      (!want.schoolTypeId || !b.schoolTypeId || b.schoolTypeId === want.schoolTypeId)
  )
  if (!fits.length || !want.grade) return fits[0]
  return [...fits].sort((a, b) => Math.abs((a.grade ?? 99) - want.grade!) - Math.abs((b.grade ?? 99) - want.grade!))[0]
}

/** Karte auf der ersten Seite: Lehrwerk → Unit → Abschnitte wählen und Vokabeln übernehmen. */
export function TextbookPicker({
  onEntries,
  onSelection,
  prefer,
  title,
  multiUnit
}: {
  onEntries: (entries: VocabEntry[], name: string, context: BookContext) => void
  /** Meldet die aktuelle Auswahl, damit „Test automatisch erstellen" sie schon nutzen kann */
  onSelection?: (selection: BookSelection | null) => void
  /** Lehrwerk zur Lerngruppe vorschlagen (statt der zuletzt genutzten Auswahl) */
  prefer?: BookPreference
  title?: string
  /**
   * Mehrere Units zugleich zulassen.
   *
   * Nur dort eingeschaltet, wo es gebraucht wird (Vokabelauswahl fürs Arbeitsblatt): Ein
   * Vokabeltest bezieht sich in der Regel auf eine Unit, ein Arbeitsblatt oft auf zwei oder
   * drei. Die Abschnitte bleiben dabei je Unit einzeln wählbar; neu hinzukommende Units sind
   * zunächst vollständig dabei, weil man bei mehreren Units meist den ganzen Stoff will.
   */
  multiUnit?: boolean
}): React.JSX.Element {
  const [books, setBooks] = useState<TextbookMeta[]>([])
  const [bookId, setBookId] = useState<string | null>(null)
  const [units, setUnits] = useState<string[]>([])
  const [sectionsByUnit, setSectionsByUnit] = useState<Record<string, string[]>>({})
  const [filter, setFilter] = useState<TextbookFilter>(NO_MARKS)
  const [loading, setLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  useEffect(() => {
    window.api.textbooks
      .list()
      .then((all) => {
        // Mit Lerngruppe: nur Lehrwerke der passenden Sprache und ein Vorschlag dazu
        const list = prefer?.language ? all.filter((b) => b.language === prefer.language) : all
        setBooks(list)
        if (prefer) {
          setBookId(bookForGroup(list, prefer)?.id ?? null)
          return
        }
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { bookId: string; unit: string } | null
          const book = list.find((b) => b.id === saved?.bookId)
          if (book) {
            setBookId(book.id)
            if (book.units.some((u) => u.name === saved?.unit)) setUnits([saved!.unit])
          }
        } catch {
          // keine gespeicherte Auswahl
        }
      })
      .catch(notifyError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefer?.language, prefer?.stateId, prefer?.schoolTypeId, prefer?.grade])

  const book = books.find((b) => b.id === bookId)
  // Die gewählten Units in der Reihenfolge des Buches – daraus ergibt sich, welche die späteste ist
  const unitMetas = book?.units.filter((u) => units.includes(u.name)) ?? []
  const single = unitMetas.length === 1 ? unitMetas[0] : undefined
  const unitMeta = single

  /*
   * Abschnitte je Unit.
   *
   * Abschnittsnamen wiederholen sich von Unit zu Unit („Station 1" gibt es in jeder), deshalb
   * eine Zuordnung Unit → Abschnitte statt einer flachen Liste. Sonst würde das Abwählen von
   * „Station 1" in Unit 2 auch Unit 5 treffen.
   */
  const sectionsOf = (unitName: string): string[] => sectionsByUnit[unitName] ?? []
  const setSectionsFor = (unitName: string, next: string[]): void => setSectionsByUnit((old) => ({ ...old, [unitName]: next }))

  useEffect(() => {
    setSectionsByUnit((old) => {
      const next: Record<string, string[]> = {}
      for (const u of book?.units.filter((x) => units.includes(x.name)) ?? []) {
        /*
         * Neu hinzugekommene Unit: Bei Mehrfachauswahl sind zunächst ALLE Abschnitte dabei –
         * wer mehrere Units nimmt, will in aller Regel den ganzen Stoff und schränkt danach
         * ein. Im Einzelmodus bleibt es wie bisher bei keinem Abschnitt, damit die Lehrkraft
         * im Vokabeltest gezielt auswählt.
         */
        next[u.name] = old[u.name] ?? (multiUnit ? u.sections.map((s) => s.name) : [])
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, units.join('|')])

  const chosen = unitMetas.flatMap((u) => u.sections.filter((s) => sectionsOf(u.name).includes(s.name)))
  const count = chosen.reduce((n, s) => n + sectionCount(s, filter), 0)
  // Die Kennzeichnungen gehören zu den einzelnen Abschnitten – gezählt wird nur, was in der Auswahl liegt.
  // Der Schalter erscheint nur, wenn die gewählte Unit solche Vokabeln überhaupt enthält.
  const marks = [
    { bit: MARK_BOX, key: 'boxes' as const, label: 'Vokabeln aus Kästen einbeziehen', hint: 'Wortfelder, die im Buch neben der laufenden Vokabelliste stehen' },
    {
      bit: MARK_GREY,
      key: 'grey' as const,
      label: 'Grau gedruckte Vokabeln einbeziehen',
      hint: 'Im Buch grau gedruckt – müssen die Schüler nicht unbedingt lernen'
    },
    {
      bit: MARK_EXPLAINED,
      key: 'explained' as const,
      label: 'Erklärte Begriffe einbeziehen',
      hint: 'Im Buch farbig gedruckt – sie tragen eine Erklärung statt einer Übersetzung'
    }
  ].map((m) => ({
    ...m,
    inSelection: chosen.reduce((n, s) => n + markCount(s, m.bit), 0),
    inUnit: unitMetas.reduce((n, u) => n + u.sections.reduce((k, s) => k + markCount(s, m.bit), 0), 0)
  }))

  // Auswahl nach außen melden: „Test automatisch erstellen" kann sie nutzen, ohne dass
  // die Vokabeln vorher in die Liste übernommen wurden.
  useEffect(() => {
    if (!onSelection) return
    onSelection(
      book && unitMeta && count
        ? {
            bookId: book.id,
            name: selectionName(
              book,
              unitMeta.name,
              sectionsOf(unitMeta.name),
              unitMeta.sections.map((s) => s.name)
            ),
            unit: unitMeta.name,
            sections: sectionsOf(unitMeta.name),
            filter,
            count,
            context: bookContext(book)
          }
        : null
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, units.join('|'), JSON.stringify(sectionsByUnit), filter.boxes, filter.grey, count])
  const bookOptions = useMemo(() => {
    const groups = new Map<string, { value: string; label: string }[]>()
    for (const b of books) {
      const g = languageLabel(b.language)
      groups.set(g, [...(groups.get(g) ?? []), { value: b.id, label: b.name }])
    }
    return [...groups.entries()].map(([group, items]) => ({ group, items }))
  }, [books])

  const take = async (): Promise<void> => {
    if (!book || !unitMetas.length) return
    setLoading(true)
    try {
      const full = await window.api.textbooks.get(book.id)
      // Je Unit ihre eigenen Abschnitte – gleichnamige Abschnitte anderer Units bleiben unberührt
      const entries = unitMetas.flatMap((u) => textbookEntries(full, u.name, sectionsOf(u.name), filter))
      /*
       * Die Obergrenze richtet sich nach der SPÄTESTEN gewählten Unit.
       *
       * Bekannt ist alles, was im Buch davor steht – wer Unit 2 und Unit 5 wählt, hat Unit 3
       * und 4 im Unterricht gehabt. Nähme man die erste Unit als Grenze, gälte der halbe
       * Band plötzlich als unbekannt, und die KI dürfte ihn nicht mehr benutzen.
       */
      const last = unitMetas[unitMetas.length - 1]
      const lastSections = sectionsOf(last.name)
      const known = await collectKnownVocab(full, last.name, lastSections, book.grade ?? 99, books, (id) => window.api.textbooks.get(id))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookId: book.id, unit: last.name }))
      } catch {
        // egal
      }
      onEntries(
        entries,
        single
          ? selectionName(
              book,
              single.name,
              sectionsOf(single.name),
              single.sections.map((s) => s.name)
            )
          : // Mehrere Units: je Unit die Abschnitte nennen, wenn nicht alle dabei sind
            `${book.name} – ${unitMetas
              .map((u) => {
                const picked = sectionsOf(u.name)
                return picked.length === u.sections.length ? u.name : `${u.name} (${picked.join(' + ')})`
              })
              .join(', ')}`,
        { ...bookContext(book), known: known ?? undefined }
      )
    } catch (e) {
      notifyError(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card withBorder padding="md" h="100%">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconBook2 size={20} />
          <Text fw={600}>{title ?? 'Vokabeln aus dem Schulbuch'}</Text>
        </Group>
        <Menu shadow="md" position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label="Lehrwerke verwalten">
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFileImport size={16} />} onClick={() => setImportOpen(true)}>
              Vokabelliste eines Lehrwerks importieren (CSV/Excel)
            </Menu.Item>
            <Menu.Item leftSection={<IconTrash size={16} />} disabled={!books.some((b) => !b.builtIn)} onClick={() => setManageOpen(true)}>
              Importierte Lehrwerke entfernen
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {books.length === 0 ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Noch keine Schulbuch-Vokabeln vorhanden. Importiere die Vokabelliste eines Lehrwerks als CSV- oder Excel-Datei (Spalten z. B. Lehrwerk, Unit,
            Abschnitt, Englisch, Deutsch).
          </Text>
          <Button variant="light" leftSection={<IconFileImport size={16} />} onClick={() => setImportOpen(true)}>
            Lehrwerk-Vokabeln importieren
          </Button>
        </Stack>
      ) : (
        <Stack gap="xs">
          <SimpleGrid cols={2} spacing="xs">
            <Select
              size="sm"
              label="Lehrwerk"
              placeholder="z. B. Green Line 1"
              data={bookOptions}
              value={bookId}
              onChange={(v) => {
                setBookId(v)
                setUnits([])
              }}
              searchable
            />
            {multiUnit ? (
              <MultiSelect
                size="sm"
                label="Units"
                placeholder={units.length ? '' : 'eine oder mehrere Units'}
                description={units.length > 1 ? 'Abschnitte lassen sich unten je Unit einzeln wählen.' : undefined}
                data={book?.units.map((u) => u.name) ?? []}
                value={units}
                onChange={setUnits}
                disabled={!book}
                searchable
                clearable
              />
            ) : (
              <Select
                size="sm"
                label="Unit"
                placeholder="Unit wählen"
                data={book?.units.map((u) => u.name) ?? []}
                value={units[0] ?? null}
                onChange={(v) => setUnits(v ? [v] : [])}
                disabled={!book}
                searchable
              />
            )}
          </SimpleGrid>
          {/* Ein Block je gewählter Unit: Abschnittsnamen wiederholen sich („Station 1"), und
              wer zwei Units nimmt, will trotzdem in jeder gezielt auswählen können. */}
          {unitMetas
            .filter((u) => u.sections.length > 0)
            .map((u) => {
              const picked = sectionsOf(u.name)
              const alle = u.sections.map((s) => s.name)
              return (
                <div key={u.name}>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm" fw={500}>
                      {single ? 'Abschnitte' : `Abschnitte · ${u.name}`}
                    </Text>
                    <Button size="compact-xs" variant="subtle" onClick={() => setSectionsFor(u.name, picked.length === alle.length ? [] : alle)}>
                      {picked.length === alle.length ? 'keine' : 'alle'}
                    </Button>
                  </Group>
                  <Chip.Group multiple value={picked} onChange={(next) => setSectionsFor(u.name, next)}>
                    <Group gap={6}>
                      {u.sections.map((s) => (
                        <Chip key={s.name} value={s.name} size="xs">
                          {s.name} ({sectionCount(s, filter)})
                        </Chip>
                      ))}
                    </Group>
                  </Chip.Group>
                </div>
              )
            })}
          {marks
            .filter((m) => m.inUnit > 0)
            .map((m) => (
              <Switch
                key={m.key}
                size="xs"
                disabled={m.inSelection === 0}
                label={`${m.label} (${m.inSelection})`}
                description={m.hint}
                checked={filter[m.key]}
                onChange={(e) => setFilter({ ...filter, [m.key]: e.currentTarget.checked })}
              />
            ))}
          <Button leftSection={<IconBook2 size={16} />} disabled={!count} loading={loading} onClick={take}>
            {count ? `${count} Vokabeln anzeigen und auswählen` : 'Unit und Abschnitte wählen'}
          </Button>
        </Stack>
      )}

      <TextbookImportModal
        opened={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={(list, first) => {
          setBooks(list)
          if (first) {
            setBookId(first)
            setUnits([])
          }
        }}
      />
      <Modal opened={manageOpen} onClose={() => setManageOpen(false)} title="Importierte Lehrwerke">
        <Stack gap="xs">
          {books
            .filter((b) => !b.builtIn)
            .map((b) => (
              <Group key={b.id} justify="space-between">
                <div>
                  <Text size="sm" fw={500}>
                    {b.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {languageLabel(b.language)} · {b.units.length} Units · {b.entryCount} Vokabeln
                  </Text>
                </div>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  aria-label={`${b.name} entfernen`}
                  onClick={async () => {
                    try {
                      setBooks(await window.api.textbooks.delete(b.id))
                      if (bookId === b.id) setBookId(null)
                    } catch (e) {
                      notifyError(e)
                    }
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
        </Stack>
      </Modal>
    </Card>
  )
}

/** Datei einlesen, Spalten zuordnen, Vorschau der Gliederung, speichern. */
function TextbookImportModal({
  opened,
  onClose,
  onSaved
}: {
  opened: boolean
  onClose: () => void
  onSaved: (books: TextbookMeta[], firstId: string | null) => void
}): React.JSX.Element {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [header, setHeader] = useState<string[]>([])
  const [map, setMap] = useState<ColumnMap>({})
  const [language, setLanguage] = useState<string>('en')
  const [bookName, setBookName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!opened) {
      setRows([])
      setHeader([])
      setFileName('')
    }
  }, [opened])

  const read = async (files: File[]): Promise<void> => {
    const file = files[0]
    if (!file) return
    try {
      const all = file.name.toLowerCase().endsWith('.xlsx')
        ? (await readSheet(file)).map((r) => r.map((c) => (c == null ? '' : String(c))))
        : parseCsvRows(decodeCsv(new Uint8Array(await file.arrayBuffer())))
      if (!all.length) throw new Error('Die Datei ist leer.')
      const withHeader = hasHeader(all[0])
      const head = withHeader ? all[0] : all[0].map((_, i) => `Spalte ${i + 1}`)
      const data = withHeader ? all.slice(1) : all
      const detected = withHeader ? detectColumns(all[0]) : { unit: 0, section: 1, term: 2, translation: 3 }
      setFileName(file.name)
      setHeader(head)
      setRows(data)
      setMap(detected)
      const names = detected.book !== undefined ? [...new Set(data.map((r) => r[detected.book!]).filter(Boolean))] : []
      setLanguage(guessLanguage(head, detected, [...names, file.name]) ?? 'en')
      setBookName(detected.book === undefined ? file.name.replace(/\.(csv|txt|tsv|xlsx)$/i, '').replace(/[_-]+/g, ' ') : '')
    } catch (e) {
      notifyError(e, 'Datei konnte nicht gelesen werden')
    }
  }

  const books = useMemo(() => (rows.length ? buildTextbooks(rows, map, { bookName, language }) : []), [rows, map, bookName, language])
  const missing = COLUMN_ROLES.filter((r) => r.required && map[r.value] === undefined)
  const columnOptions = header.map((h, i) => ({
    value: String(i),
    label: `${h || `Spalte ${i + 1}`}${rows[0]?.[i] ? ` – z. B. „${rows[0][i].slice(0, 24)}“` : ''}`
  }))

  return (
    <Modal opened={opened} onClose={onClose} title="Vokabelliste eines Lehrwerks importieren" size="xl">
      {!rows.length ? (
        <Stack>
          <Text size="sm">
            Die Datei sollte je Vokabel eine Zeile haben, z. B. mit den Spalten <b>Lehrwerk</b> (Green Line 1), <b>Unit</b> (Unit 1), <b>Abschnitt</b>{' '}
            (Check-in, Station 1, Station 2 …), <b>Englisch</b> und <b>Deutsch</b>. Wortart, Beispielsatz und Seite sind optional. Leere Zellen in Lehrwerk,
            Unit und Abschnitt übernehmen den Wert der Zeile darüber.
          </Text>
          <DropZone
            onFiles={read}
            accept={[...FILE_TYPES.csv, ...FILE_TYPES.xlsx]}
            title="CSV- oder Excel-Datei hierher ziehen oder klicken"
            multiple={false}
            minHeight={110}
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              size="xs"
              onClick={async () => {
                try {
                  await window.api.files.save('Lehrwerk-Vorlage.csv', [{ name: 'CSV', extensions: ['csv'] }], TEMPLATE_CSV)
                } catch (e) {
                  notifyError(e)
                }
              }}
            >
              Vorlage (CSV) speichern
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Text size="sm">
            <b>{fileName}</b>: {rows.length} Zeilen. Bitte prüfe die Zuordnung der Spalten.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
            {COLUMN_ROLES.map((role) => (
              <Select
                key={role.value}
                size="xs"
                label={`${role.label}${role.required ? ' *' : ''}`}
                data={columnOptions}
                value={map[role.value] !== undefined ? String(map[role.value]) : null}
                onChange={(v) =>
                  setMap((m) => ({
                    ...m,
                    [role.value as ColumnRole]: v === null ? undefined : Number(v)
                  }))
                }
                clearable
                placeholder="—"
              />
            ))}
          </SimpleGrid>
          <SimpleGrid cols={2} spacing="xs">
            <Select
              size="sm"
              label="Sprache der Vokabeln"
              data={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
              value={language}
              onChange={(v) => v && setLanguage(v)}
              allowDeselect={false}
            />
            {map.book === undefined && (
              <TextInput
                size="sm"
                label="Name des Lehrwerks"
                placeholder="z. B. Green Line 1"
                value={bookName}
                onChange={(e) => setBookName(e.currentTarget.value)}
              />
            )}
          </SimpleGrid>
          {missing.length > 0 && (
            <Alert color="orange" p="xs">
              Bitte noch zuordnen: {missing.map((m) => m.label).join(', ')}
            </Alert>
          )}
          <Text size="sm" fw={600}>
            Vorschau
          </Text>
          <ScrollArea.Autosize mah={260}>
            <Table striped withTableBorder fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Lehrwerk</Table.Th>
                  <Table.Th>Units und Abschnitte</Table.Th>
                  <Table.Th>Vokabeln</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {books.map((b) => (
                  <Table.Tr key={b.id}>
                    <Table.Td>
                      {b.name}
                      {b.grade ? ` (Kl. ${b.grade})` : ''}
                    </Table.Td>
                    <Table.Td>
                      {b.units.slice(0, 12).map((u) => (
                        <div key={u.name}>
                          <b>{u.name}</b>: {u.sections.map((s) => `${s.name} (${s.entries.length})`).join(', ')}
                        </div>
                      ))}
                      {b.units.length > 12 && <Text size="xs">… und {b.units.length - 12} weitere Units</Text>}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">{b.units.reduce((n, u) => n + u.sections.reduce((m, s) => m + s.entries.length, 0), 0)}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
          <Group justify="space-between">
            <Button variant="subtle" onClick={() => setRows([])}>
              Andere Datei
            </Button>
            <Group>
              <Button variant="default" onClick={onClose}>
                Abbrechen
              </Button>
              <Button
                loading={saving}
                disabled={missing.length > 0 || !books.length}
                onClick={async () => {
                  setSaving(true)
                  try {
                    const list = await window.api.textbooks.save(books)
                    notifySuccess(
                      `${books.length} Lehrwerk(e) mit ${books.reduce((n, b) => n + b.units.reduce((m, u) => m + u.sections.reduce((k, s) => k + s.entries.length, 0), 0), 0)} Vokabeln gespeichert.`
                    )
                    onSaved(list, books[0]?.id ?? null)
                    onClose()
                  } catch (e) {
                    notifyError(e)
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                {books.length} Lehrwerk(e) speichern
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
