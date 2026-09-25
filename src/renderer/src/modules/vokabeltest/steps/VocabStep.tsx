import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Menu,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { IconArrowRight, IconBooks, IconChecklist, IconClipboard, IconDeviceFloppy, IconFolderOpen, IconPlus, IconTrash } from '@tabler/icons-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { SavedVocabList } from '@shared/types'
import DropZone, { FILE_TYPES } from '../../../shared/components/DropZone'
import { notifyError, notifySuccess } from '../../../shared/util'
import { importVocabFromFile } from '../input/importVocab'
import { parseDelimited } from '../input/parseTable'
import { newId } from '../model/random'
import type { VocabEntry } from '../model/types'
import { includedVocab, isIncluded, specialVocab } from '../model/vocab'
import { aiCall, useVokabeltest } from '../store'
import { AutoCreateButton } from './AutoCreate'
import { RecentTests, SaveTestButton, TestLibraryModal } from './TestLibrary'
import { TextbookPicker } from './TextbookPicker'
import type { BookSelection } from './TextbookPicker'

export default function VocabStep(): React.JSX.Element {
  const { vocab, setVocab, listName, setListName, setListContext, setStep } = useVokabeltest()
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [review, setReview] = useState<VocabEntry[] | null>(null)
  /** Name von Hand geändert? Dann folgt er der Schulbuch-Auswahl nicht mehr. */
  const nameEdited = useRef(false)
  // Aktuelle Auswahl in der Karte „Vokabeln aus dem Schulbuch“
  const [bookSelection, setBookSelection] = useState<BookSelection | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [library, setLibrary] = useState<SavedVocabList[]>([])

  useEffect(() => {
    window.api.library.list().then(setLibrary).catch(notifyError)
  }, [])

  const handleFiles = async (files: File[]): Promise<void> => {
    const collected: VocabEntry[] = []
    try {
      for (const f of files) {
        setImporting(`${f.name}: wird gelesen …`)
        collected.push(...(await importVocabFromFile(f, aiCall, (msg) => setImporting(`${f.name}: ${msg}`))))
      }
      if (collected.length === 0) notifyError('In der Datei wurden keine Vokabeln gefunden.')
      else setReview(collected)
    } catch (e) {
      notifyError(e, 'Import fehlgeschlagen')
    } finally {
      setImporting(null)
    }
  }

  // Stabile Funktion: Sonst zeichnet die Tabelle (oft weit über hundert Zeilen) bei jeder
  // Kleinigkeit neu, etwa beim Schließen eines Pop-ups – das dauert dann sichtbar lange.
  const update = useCallback(
    (id: string, patch: Partial<VocabEntry>): void =>
      // Änderungen am Wort machen eine frühere Bild-Analyse ungültig
      setVocab(
        vocab.map((v) => (v.id === id ? { ...v, ...patch, ...(patch.term !== undefined ? { depictable: undefined, imageKeywords: undefined } : {}) } : v))
      ),
    [vocab, setVocab]
  )

  const filled = vocab.filter((v) => v.term.trim())
  const selected = includedVocab(vocab)

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={2}>Vokabelliste</Title>
            <Text c="dimmed" size="sm">
              Foto, Scan, PDF oder Word-Datei hineinziehen, eine Tabelle einfügen oder die Vokabeln direkt eintippen. Mit dem Häkchen legst du fest, welche
              Vokabeln im Test abgefragt werden.
            </Text>
          </div>
          <Group wrap="nowrap">
            <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={() => setLibraryOpen(true)}>
              Gespeicherten Test öffnen
            </Button>
            <AutoCreateButton selection={bookSelection} />
            <Button rightSection={<IconArrowRight size={18} />} disabled={selected.length < 2} onClick={() => setStep(1)}>
              Weiter zu den Testeinstellungen
            </Button>
          </Group>
          <TestLibraryModal opened={libraryOpen} onClose={() => setLibraryOpen(false)} />
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <DropZone
            onFiles={handleFiles}
            accept={[...FILE_TYPES.image, ...FILE_TYPES.pdf, ...FILE_TYPES.docx, ...FILE_TYPES.csv, ...FILE_TYPES.xlsx]}
            title={importing ?? 'Vokabelliste hierher ziehen oder klicken'}
            hint="Fotos und Scans (JPG, PNG), PDF, Word (DOCX), Excel (XLSX) oder CSV. Die Texterkennung nutzt die in den Einstellungen gewählte KI."
            loading={Boolean(importing)}
            minHeight={170}
          />
          <TextbookPicker
            onSelection={(selection) => {
              setBookSelection(selection)
              // Der Listenname zeigt, was gerade gewählt ist – bis die Lehrkraft ihn selbst ändert
              if (!nameEdited.current && selection) setListName(selection.name)
            }}
            onEntries={(entries, name, context) => {
              if (!entries.length) {
                notifyError('In diesem Abschnitt sind keine Vokabeln hinterlegt.')
                return
              }
              // Wie eine hineingezogene Datei: Prüfen und Auswählen im Übernahme-Fenster
              if (!nameEdited.current) setListName(name)
              setListContext(context)
              setReview(entries)
            }}
          />
        </SimpleGrid>

        <RecentTests onShowAll={() => setLibraryOpen(true)} />

        <Card withBorder mt="lg" padding="md">
          <Group justify="space-between" mb="sm">
            <TextInput
              placeholder="Name des Vokabeltests, z. B. Green Line 5 – Unit 1, Station 1"
              aria-label="Name des Vokabeltests"
              value={listName}
              onChange={(e) => {
                nameEdited.current = true
                setListName(e.currentTarget.value)
              }}
              style={{ flex: 1, maxWidth: 420 }}
            />
            <Group gap="xs">
              <SaveTestButton />
              <Button variant="light" leftSection={<IconClipboard size={16} />} onClick={() => setPasteOpen(true)}>
                Tabelle einfügen
              </Button>
              <Menu shadow="md" width={320} position="bottom-end">
                <Menu.Target>
                  <Button variant="light" leftSection={<IconBooks size={16} />}>
                    Bibliothek
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconDeviceFloppy size={16} />}
                    disabled={filled.length === 0}
                    onClick={async () => {
                      try {
                        const name = listName.trim() || `Liste vom ${new Date().toLocaleDateString('de-DE')}`
                        const existing = library.find((l) => l.name === name)
                        setLibrary(
                          await window.api.library.save({
                            id: existing?.id ?? newId(),
                            name,
                            updatedAt: '',
                            entries: filled.map(({ term, translation, pos, note, grey, inBox, include }) => ({
                              term,
                              translation,
                              pos,
                              note,
                              grey,
                              inBox,
                              include
                            }))
                          })
                        )
                        setListName(name)
                        notifySuccess(`„${name}" in der Bibliothek gespeichert.`)
                      } catch (e) {
                        notifyError(e)
                      }
                    }}
                  >
                    Aktuelle Liste speichern
                  </Menu.Item>
                  {library.length > 0 && <Menu.Divider />}
                  {library.map((l) => (
                    <Menu.Item
                      key={l.id}
                      onClick={() => {
                        // Grau markierte Vokabeln müssen die Schüler nicht lernen – sie bleiben abgewählt
                        setVocab(l.entries.map((e) => ({ ...e, id: newId(), include: e.include !== false && !e.grey })))
                        setListName(l.name)
                        if (l.language || l.grade) setListContext({ bookName: l.name, language: l.language, grade: l.grade })
                      }}
                      rightSection={
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={async (e) => {
                            e.stopPropagation()
                            setLibrary(await window.api.library.delete(l.id))
                          }}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      }
                    >
                      <Text size="sm">{l.name}</Text>
                      <Text size="xs" c="dimmed">
                        {l.entries.length} Vokabeln
                      </Text>
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
              {vocab.length > 0 && (
                <Button variant="subtle" color="red" onClick={() => setVocab([])}>
                  Liste leeren
                </Button>
              )}
            </Group>
          </Group>

          {filled.length > 0 && <SelectionBar entries={vocab} onChange={setVocab} />}
          <VocabTable entries={vocab} onUpdate={update} onChange={setVocab} />
        </Card>

        <Group justify="flex-end" mt="lg" mb="xl">
          <Text c="dimmed" size="sm">
            {selected.length} von {filled.length} Vokabeln für den Test markiert
          </Text>
        </Group>
      </Container>

      <ImportModal
        entries={review}
        onClose={() => setReview(null)}
        onApply={(entries, replace) => {
          setVocab(replace ? entries : [...vocab.filter((v) => v.term.trim()), ...entries])
          setReview(null)
          notifySuccess(`${entries.length} Vokabeln übernommen, davon ${includedVocab(entries).length} für den Test markiert.`)
        }}
      />
      <PasteModal
        opened={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onParsed={(entries) => {
          setPasteOpen(false)
          setReview(entries)
        }}
      />
    </ScrollArea>
  )
}

/** Sammelaktionen zum Markieren und Entmarkieren. */
function SelectionBar({ entries, onChange }: { entries: VocabEntry[]; onChange: (entries: VocabEntry[]) => void }): React.JSX.Element {
  const filled = entries.filter((v) => v.term.trim())
  const selected = filled.filter(isIncluded).length
  const special = specialVocab(filled)
  const setAll = (fn: (v: VocabEntry) => boolean): void => onChange(entries.map((v) => ({ ...v, include: fn(v) })))
  return (
    <Group gap="xs" mb="xs">
      <Badge variant="light" size="lg" leftSection={<IconChecklist size={14} />}>
        {selected} / {filled.length} im Test
      </Badge>
      <Button size="compact-sm" variant="subtle" onClick={() => setAll(() => true)}>
        Alle markieren
      </Button>
      <Button size="compact-sm" variant="subtle" onClick={() => setAll(() => false)}>
        Alle entmarkieren
      </Button>
      <Button size="compact-sm" variant="subtle" onClick={() => setAll((v) => !isIncluded(v))}>
        Auswahl umkehren
      </Button>
      {special.grey.length > 0 && (
        <Menu shadow="md">
          <Menu.Target>
            <Button size="compact-sm" variant="subtle" color="gray">
              Grau gedruckte ({special.grey.length}) …
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setAll((v) => (v.grey ? true : isIncluded(v)))}>alle markieren</Menu.Item>
            <Menu.Item onClick={() => setAll((v) => (v.grey ? false : isIncluded(v)))}>alle entmarkieren</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
      {special.box.length > 0 && (
        <Menu shadow="md">
          <Menu.Target>
            <Button size="compact-sm" variant="subtle" color="gray">
              Aus Kästen ({special.box.length}) …
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setAll((v) => (v.inBox ? true : isIncluded(v)))}>alle markieren</Menu.Item>
            <Menu.Item onClick={() => setAll((v) => (v.inBox ? false : isIncluded(v)))}>alle entmarkieren</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  )
}

const VocabTable = memo(function VocabTable({
  entries,
  onUpdate,
  onChange
}: {
  entries: VocabEntry[]
  onUpdate: (id: string, patch: Partial<VocabEntry>) => void
  onChange: (entries: VocabEntry[]) => void
}): React.JSX.Element {
  const lastRowRef = useRef<HTMLInputElement>(null)
  const [focusNew, setFocusNew] = useState(false)

  useEffect(() => {
    if (focusNew) {
      lastRowRef.current?.focus()
      setFocusNew(false)
    }
  }, [focusNew, entries.length])

  const addRow = (): void => {
    onChange([...entries, { id: newId(), term: '', translation: '', include: true }])
    setFocusNew(true)
  }

  const filled = entries.filter((v) => v.term.trim())
  const selectedCount = filled.filter(isIncluded).length

  return (
    <>
      <Table verticalSpacing={4} striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={44}>
              <Tooltip label="Alle markieren / entmarkieren">
                <Checkbox
                  aria-label="Alle für den Test markieren"
                  checked={filled.length > 0 && selectedCount === filled.length}
                  indeterminate={selectedCount > 0 && selectedCount < filled.length}
                  onChange={(e) => {
                    const on = e.currentTarget.checked
                    onChange(entries.map((v) => ({ ...v, include: on })))
                  }}
                />
              </Tooltip>
            </Table.Th>
            <Table.Th w={36}>#</Table.Th>
            <Table.Th>Wort / Ausdruck (Zielsprache)</Table.Th>
            <Table.Th>Deutsch</Table.Th>
            <Table.Th w={130}>Wortart</Table.Th>
            <Table.Th>Beispiel / Notiz</Table.Th>
            <Table.Th w={54}>
              <Tooltip label="Im Schulbuch grau gedruckt – muss nicht unbedingt gelernt werden">
                <span>grau</span>
              </Tooltip>
            </Table.Th>
            <Table.Th w={64}>
              <Tooltip label="Stand im Buch in einem Kasten">
                <span>Kasten</span>
              </Tooltip>
            </Table.Th>
            <Table.Th w={40} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((v, i) => {
            const included = v.include !== false
            return (
              <Table.Tr key={v.id} style={included ? undefined : { opacity: 0.55 }}>
                <Table.Td>
                  <Checkbox
                    aria-label={`${v.term || 'Vokabel'} im Test abfragen`}
                    checked={included}
                    onChange={(e) => onUpdate(v.id, { include: e.currentTarget.checked })}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {i + 1}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <TextInput
                      ref={i === entries.length - 1 ? lastRowRef : undefined}
                      variant="unstyled"
                      value={v.term}
                      onChange={(e) => onUpdate(v.id, { term: e.currentTarget.value })}
                      placeholder="z. B. to explore"
                      style={{ flex: 1 }}
                    />
                  </Group>
                </Table.Td>
                <Table.Td>
                  <TextInput
                    variant="unstyled"
                    value={v.translation}
                    onChange={(e) => onUpdate(v.id, { translation: e.currentTarget.value })}
                    placeholder="erkunden"
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput variant="unstyled" value={v.pos ?? ''} onChange={(e) => onUpdate(v.id, { pos: e.currentTarget.value })} />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    variant="unstyled"
                    value={v.note ?? ''}
                    onChange={(e) => onUpdate(v.id, { note: e.currentTarget.value })}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) && i === entries.length - 1) {
                        e.preventDefault()
                        addRow()
                      }
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Checkbox
                    aria-label={`${v.term || 'Vokabel'} grau markieren`}
                    checked={Boolean(v.grey)}
                    onChange={(e) => onUpdate(v.id, { grey: e.currentTarget.checked })}
                  />
                </Table.Td>
                <Table.Td>
                  <Checkbox
                    aria-label={`${v.term || 'Vokabel'} als Kasten-Vokabel markieren`}
                    checked={Boolean(v.inBox)}
                    onChange={(e) => onUpdate(v.id, { inBox: e.currentTarget.checked })}
                  />
                </Table.Td>
                <Table.Td>
                  <Tooltip label="Zeile löschen">
                    <ActionIcon variant="subtle" color="gray" onClick={() => onChange(entries.filter((x) => x.id !== v.id))}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
      <Button variant="subtle" leftSection={<IconPlus size={16} />} mt="xs" onClick={addRow}>
        Zeile hinzufügen
      </Button>
    </>
  )
})

/**
 * Liste zum Prüfen, Korrigieren und Markieren.
 *
 * Ohne Rückfrage: Grau gedruckte Vokabeln und Vokabeln aus Kästen sind gekennzeichnet
 * und lassen sich über die Auswahlleiste gruppenweise an- und abwählen.
 */
function ImportModal({
  entries,
  onClose,
  onApply
}: {
  entries: VocabEntry[] | null
  onClose: () => void
  onApply: (entries: VocabEntry[], replace: boolean) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<VocabEntry[]>([])

  useEffect(() => setDraft(entries ?? []), [entries])

  const special = specialVocab(draft)

  return (
    <Modal opened={entries !== null} onClose={onClose} title="Erkannte Vokabeln prüfen und für den Test markieren" size="80%">
      <Text size="sm" c="dimmed" mb="xs">
        Bitte kurz kontrollieren und bei Bedarf korrigieren. Nur markierte Vokabeln werden im Test abgefragt; nicht markierte bleiben in der Liste und lassen
        sich später wieder auswählen. Leere Zeilen werden ignoriert.
      </Text>
      {(special.grey.length > 0 || special.box.length > 0) && (
        <Alert color="gray" p="xs" mb="xs">
          <Text size="xs">
            Kennzeichnungen aus der Vorlage: <b>grau</b> = unauffälliger gedruckt, <b>Kasten</b> = stand in einem Kasten. Über die Knöpfe darunter lassen sich
            diese Gruppen auf einmal an- oder abwählen.
          </Text>
        </Alert>
      )}
      <SelectionBar entries={draft} onChange={setDraft} />
      <ScrollArea.Autosize mah="55vh">
        <VocabTable entries={draft} onChange={setDraft} onUpdate={(id, patch) => setDraft(draft.map((v) => (v.id === id ? { ...v, ...patch } : v)))} />
      </ScrollArea.Autosize>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="light"
          onClick={() =>
            onApply(
              draft.filter((v) => v.term.trim()),
              true
            )
          }
        >
          Bisherige Liste ersetzen
        </Button>
        <Button
          onClick={() =>
            onApply(
              draft.filter((v) => v.term.trim()),
              false
            )
          }
        >
          An Liste anhängen
        </Button>
      </Group>
    </Modal>
  )
}

function PasteModal({ opened, onClose, onParsed }: { opened: boolean; onClose: () => void; onParsed: (entries: VocabEntry[]) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <Modal opened={opened} onClose={onClose} title="Tabelle einfügen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Tabelle aus Word oder Excel kopieren und hier einfügen (Spalte 1: Wort, Spalte 2: Deutsch, optional Wortart und Notiz). Auch Zeilen wie „to explore –
          erkunden" funktionieren.
        </Text>
        <Textarea autosize minRows={10} maxRows={20} value={text} onChange={(e) => setText(e.currentTarget.value)} data-autofocus />
        <Group justify="flex-end">
          <Button
            disabled={!text.trim()}
            onClick={() => {
              const entries = parseDelimited(text)
              if (entries.length === 0) notifyError('Keine Vokabeln erkannt.')
              else {
                onParsed(entries)
                setText('')
              }
            }}
          >
            Übernehmen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
