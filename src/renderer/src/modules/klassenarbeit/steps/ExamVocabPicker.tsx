import { ActionIcon, Badge, Button, Chip, Group, MultiSelect, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core'
import { IconBook2, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { MARK_BOX, MARK_EXPLAINED, MARK_GREY } from '@shared/types'
import type { SavedVocabList, TextbookMeta } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { markCount, NO_MARKS, sectionCount, textbookEntries } from '../../vokabeltest/steps/TextbookPicker'
import type { TextbookFilter } from '../../vokabeltest/steps/TextbookPicker'
import type { ExamVocab } from '../model/types'
import { collectKnownVocab } from '../../../shared/knownVocab'

/** Kennung einer aus dem Schulbuch übernommenen Auswahl (grenzt sie von gespeicherten Listen ab). */
const bookVocabId = (bookId: string, unit: string, sections: string[], filter: TextbookFilter): string =>
  `lehrwerk:${bookId}:${unit}:${sections.join('+')}${filter.boxes ? ':+kaesten' : ''}${filter.grey ? '' : ':-grau'}`

const isBookVocab = (v: ExamVocab): boolean => v.id.startsWith('lehrwerk:')

/**
 * Vokabeln, die in der Arbeit vorkommen dürfen: aus dem Schulbuch (Buch → Unit → Abschnitt,
 * Kästen zuschaltbar) oder aus den im Programm Vokabeltest gespeicherten Listen.
 */
export default function ExamVocabPicker({
  language,
  vocab,
  onChange
}: {
  /** Sprachcode des Fachs, z. B. „en“ – zeigt nur passende Lehrwerke */
  language: string
  vocab: ExamVocab[]
  onChange: (vocab: ExamVocab[]) => void
}): React.JSX.Element {
  const [books, setBooks] = useState<TextbookMeta[]>([])
  const [lists, setLists] = useState<SavedVocabList[]>([])
  const [bookId, setBookId] = useState<string | null>(null)
  const [unit, setUnit] = useState<string | null>(null)
  const [sections, setSections] = useState<string[]>([])
  const [filter, setFilter] = useState<TextbookFilter>(NO_MARKS)
  const [loading, setLoading] = useState(false)
  /** Grau markierte Vokabeln gespeicherter Listen mitnehmen (standardmäßig aus) */
  const [listsWithGrey, setListsWithGrey] = useState(false)

  useEffect(() => {
    window.api.textbooks
      .list()
      .then((all) => setBooks(all.filter((b) => b.language === language)))
      .catch(() => setBooks([]))
    window.api.library
      .list()
      .then(setLists)
      .catch(() => setLists([]))
  }, [language])

  const book = books.find((b) => b.id === bookId)
  const unitMeta = book?.units.find((u) => u.name === unit)
  // Neue Unit: zunächst kein Abschnitt gewählt – die Lehrkraft nimmt gezielt, was sie braucht
  useEffect(() => setSections([]), [bookId, unit])

  const chosen = unitMeta?.sections.filter((s) => sections.includes(s.name)) ?? []
  const count = chosen.reduce((n, s) => n + sectionCount(s, filter), 0)
  // Die Kennzeichnungen gehören zu den einzelnen Abschnitten – gezählt wird nur, was in der Auswahl liegt.
  // Der Schalter erscheint nur, wenn die gewählte Unit solche Vokabeln überhaupt enthält.
  const marks = [
    {
      bit: MARK_BOX,
      key: 'boxes' as const,
      short: 'mit Kästen',
      label: 'Vokabeln aus Kästen einbeziehen',
      hint: 'Wortfelder, die im Buch neben der laufenden Vokabelliste stehen'
    },
    {
      bit: MARK_GREY,
      key: 'grey' as const,
      short: 'mit grauen',
      label: 'Grau gedruckte Vokabeln einbeziehen',
      hint: 'Im Buch grau gedruckt – müssen die Schüler nicht unbedingt lernen'
    },
    {
      bit: MARK_EXPLAINED,
      key: 'explained' as const,
      short: 'mit erklärten Begriffen',
      label: 'Erklärte Begriffe einbeziehen',
      hint: 'Im Buch farbig gedruckt – sie tragen eine Erklärung statt einer Übersetzung'
    }
  ].map((m) => ({
    ...m,
    inSelection: chosen.reduce((n, s) => n + markCount(s, m.bit), 0),
    inUnit: unitMeta?.sections.reduce((n, s) => n + markCount(s, m.bit), 0) ?? 0
  }))

  const addFromBook = async (): Promise<void> => {
    if (!book || !unitMeta) return
    setLoading(true)
    try {
      const full = await window.api.textbooks.get(book.id)
      const words = textbookEntries(full, unitMeta.name, sections, filter).map((e) => ({
        term: e.term,
        translation: e.translation,
        ...(e.pos ? { pos: e.pos } : {}),
        ...(e.note ? { example: e.note } : {})
      }))
      const all = unitMeta.sections.map((s) => s.name)
      const part = sections.length === all.length ? '' : `, ${sections.join(' + ')}`
      const id = bookVocabId(book.id, unitMeta.name, sections, filter)
      // Im Namen stehen nur die Kennzeichnungen, die wirklich dazugenommen wurden
      const extra = marks
        .filter((m) => filter[m.key] && m.inSelection > 0)
        .map((m) => m.short)
        .join(', ')
      // Wortschatz der vorherigen Units und Bände: Die Arbeit bleibt in dem, was die Klasse kennt
      const known = await collectKnownVocab(full, unitMeta.name, sections, book.grade ?? 99, books, (id) => window.api.textbooks.get(id))
      const entry: ExamVocab = {
        id,
        name: `${book.name} – ${unitMeta.name}${part}${extra ? ` (${extra})` : ''}`,
        words,
        ...(known ? { known } : {})
      }
      onChange([...vocab.filter((v) => v.id !== id), entry])
    } catch (e) {
      notifyError(e)
    } finally {
      setLoading(false)
    }
  }

  const savedIds = vocab.filter((v) => !isBookVocab(v)).map((v) => v.id)
  const chosenLists = lists.filter((l) => savedIds.includes(l.id))
  const listGrey = chosenLists.reduce((n, l) => n + l.entries.filter((e) => e.grey).length, 0)

  /** Vokabeln einer gespeicherten Liste – grau markierte nur auf Wunsch */
  const wordsOf = (l: SavedVocabList, withGrey: boolean): ExamVocab['words'] =>
    l.entries
      .filter((e) => e.term.trim() && (withGrey || !e.grey))
      .map((e) => ({
        term: e.term,
        translation: e.translation,
        ...(e.pos ? { pos: e.pos } : {}),
        ...(e.note ? { example: e.note } : {})
      }))

  const applyLists = (ids: string[], withGrey: boolean): void =>
    onChange([
      ...vocab.filter(isBookVocab),
      ...ids
        .map((id) => lists.find((l) => l.id === id))
        .filter((l): l is SavedVocabList => Boolean(l))
        .map((l) => ({ id: l.id, name: l.name, words: wordsOf(l, withGrey) }))
    ])

  return (
    <Stack gap="xs">
      {books.length > 0 && (
        <>
          <SimpleGrid cols={2} spacing="xs">
            <Select
              size="sm"
              label="Schulbuch"
              description="Vokabeln aus dem Lehrwerk"
              placeholder="z. B. Green Line 1"
              data={books.map((b) => ({ value: b.id, label: b.name }))}
              value={bookId}
              onChange={(v) => {
                setBookId(v)
                setUnit(null)
              }}
              searchable
            />
            <Select
              size="sm"
              label="Unit"
              placeholder="Unit wählen"
              data={book?.units.map((u) => u.name) ?? []}
              value={unit}
              onChange={setUnit}
              disabled={!book}
              searchable
            />
          </SimpleGrid>
          {unitMeta && unitMeta.sections.length > 0 && (
            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={500}>
                  Abschnitte
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => setSections(sections.length === unitMeta.sections.length ? [] : unitMeta.sections.map((s) => s.name))}
                >
                  {sections.length === unitMeta.sections.length ? 'keine' : 'alle'}
                </Button>
              </Group>
              <Chip.Group multiple value={sections} onChange={setSections}>
                <Group gap={6}>
                  {unitMeta.sections.map((s) => (
                    <Chip key={s.name} value={s.name} size="xs">
                      {s.name} ({sectionCount(s, filter)})
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </div>
          )}
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
          {unitMeta && (
            <Button size="xs" variant="light" leftSection={<IconBook2 size={16} />} disabled={!count} loading={loading} onClick={addFromBook}>
              {count ? `${count} Vokabeln übernehmen` : 'Abschnitte wählen'}
            </Button>
          )}
        </>
      )}

      <MultiSelect
        label="Eigene Vokabellisten"
        description={
          lists.length
            ? 'Listen aus dem Programm Vokabellisten – die Vokabeln dürfen in der Arbeit vorkommen.'
            : 'Noch keine Vokabellisten gespeichert. Lege sie im Programm Vokabellisten an, dann erscheinen sie hier.'
        }
        placeholder={lists.length ? 'Liste wählen' : 'keine Listen vorhanden'}
        disabled={!lists.length}
        data={lists.map((l) => ({
          value: l.id,
          label: `${l.name} (${l.entries.length} Vokabeln)`
        }))}
        value={savedIds}
        onChange={(ids) => applyLists(ids, listsWithGrey)}
        clearable
        searchable
      />
      {listGrey > 0 && (
        <Switch
          size="xs"
          label={`Grau gedruckte Vokabeln einbeziehen (${listGrey})`}
          description="In den gewählten Listen grau markiert – die Schüler müssen sie nicht unbedingt lernen"
          checked={listsWithGrey}
          onChange={(e) => {
            setListsWithGrey(e.currentTarget.checked)
            applyLists(savedIds, e.currentTarget.checked)
          }}
        />
      )}

      {vocab.length > 0 && (
        <Group gap={6}>
          {vocab.map((v) => (
            <Badge
              key={v.id}
              variant="light"
              size="lg"
              rightSection={
                <ActionIcon size="xs" variant="transparent" aria-label={`${v.name} entfernen`} onClick={() => onChange(vocab.filter((x) => x.id !== v.id))}>
                  <IconX size={12} />
                </ActionIcon>
              }
            >
              {v.name} · {v.words.length}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  )
}
