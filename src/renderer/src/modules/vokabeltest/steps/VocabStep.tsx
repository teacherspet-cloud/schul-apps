import { Alert, Badge, Button, Card, Container, Group, ScrollArea, Stack, Tabs, Text, TextInput, Title } from '@mantine/core'
import { useExperte } from '../../../shared/settingsStore'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import { IconArrowRight, IconBook2, IconClipboard, IconDeviceFloppy, IconFileUpload, IconList } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedVocabList } from '@shared/types'
import DropZone, { FILE_TYPES } from '../../../shared/components/DropZone'
import Formularfuss, { FormularSeite } from '../../../shared/components/Formularfuss'
import UndoRedoButtons from '../../../shared/components/UndoRedoButtons'
import { EintragMenue, EintragRueckfragen, useBibliothek } from '../../../shared/components/Bibliothek'
import { passtZurSuche } from '../../../shared/bibliothek'
import { loadLastChoice } from '../../../shared/lastChoice'
import { notifyError, notifySuccess, notifyInfo } from '../../../shared/util'
import { vokabellistenApi } from '../../vokabelliste/listenApi'
import { importVocabFromFile } from '../input/importVocab'
import { newId } from '../model/random'
import { LANGUAGES, type VocabEntry } from '../model/types'
import { alsListenEintrag, ausListe, includedVocab } from '../model/vocab'
import { aiCall, useVokabeltest } from '../store'
import { AutoCreateButton } from './AutoCreate'
import { SaveTestButton } from './TestLibrary'
import { TextbookPicker } from './TextbookPicker'
import type { BookSelection } from './TextbookPicker'
import VokabelTabelle from './VokabelTabelle'
import { AuswahlLeiste, EinfuegenFenster, PruefFenster } from './VokabelUebernahme'

type Quelle = 'datei' | 'schulbuch' | 'tabelle' | 'listen'
// Schlüssel mit „-2“: Seit dem Wunsch der Lehrkraft (01.10.2026) ist „Schulbuch“ der Standard –
// eine alte Merkung aus der Zeit, als „Datei hineinziehen“ vorne stand, soll ihn nicht verdecken.
const QUELLE_KEY = 'vokabeltest-quelle-2'
const gemerkteQuelle = (): Quelle => {
  try {
    const q = localStorage.getItem(QUELLE_KEY)
    return q === 'datei' || q === 'tabelle' || q === 'listen' ? q : 'schulbuch'
  } catch {
    return 'schulbuch'
  }
}

/**
 * Schritt 1: Vokabelliste.
 *
 * Aufbau seit Paket 7 (Wunsch der Lehrkraft): Die Quellen – Datei, Schulbuch, Tabelle, eigene
 * Listen – stehen in EINER Karte mit Reitern statt verteilt über Kacheln, Knöpfe und ein
 * Menü „Bibliothek". Darunter die Liste. „Weiter" und der Zähler „x von y werden abgefragt"
 * stehen fest in der Fußleiste (Formularfuss aus Paket 6), „Test automatisch erstellen" als
 * zweiter Weg daneben.
 */
export default function VocabStep(): React.JSX.Element {
  const { vocab, setVocab, listName, setListName, listContext, setListContext, setStep, settings, vokabelVerlauf, undoVocab, redoVocab } = useVokabeltest()
  const [importing, setImporting] = useState<string | null>(null)
  const [review, setReview] = useState<{ entries: VocabEntry[]; herkunft?: () => void } | null>(null)
  /** Name von Hand geändert? Dann folgt er der Schulbuch-Auswahl nicht mehr. */
  const nameEdited = useRef(false)
  // Aktuelle Auswahl im Reiter „Schulbuch“ – „Test automatisch erstellen“ kann sie schon nutzen
  const [bookSelection, setBookSelection] = useState<BookSelection | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [quelle, setQuelle] = useState<Quelle>(gemerkteQuelle)

  const waehleQuelle = (q: string | null): void => {
    if (!q) return
    setQuelle(q as Quelle)
    try {
      localStorage.setItem(QUELLE_KEY, q)
    } catch {
      // ohne lokalen Speicher gilt die Wahl nur bis zum Neustart
    }
  }

  const handleFiles = async (files: File[]): Promise<void> => {
    const collected: VocabEntry[] = []
    try {
      for (const f of files) {
        setImporting(`${f.name}: wird gelesen …`)
        collected.push(...(await importVocabFromFile(f, aiCall, (msg) => setImporting(`${f.name}: ${msg}`))))
      }
      if (collected.length === 0) notifyError('In der Datei wurden keine Vokabeln gefunden.')
      else setReview({ entries: collected })
    } catch (e) {
      notifyError(e, 'Import fehlgeschlagen')
    } finally {
      setImporting(null)
    }
  }

  // Änderungen am Wort machen eine frühere Bild-Analyse ungültig
  const bereinige = useCallback(
    (_v: VocabEntry, patch: Partial<VocabEntry>): Partial<VocabEntry> => (patch.term !== undefined ? { depictable: undefined, imageKeywords: undefined } : {}),
    []
  )

  const filled = vocab.filter((v) => v.term.trim())
  const selected = includedVocab(vocab)
  const sprache = settings?.targetLanguage || listContext?.language || loadLastChoice('vokabeltest').targetLanguage || ''

  const zaehler = `${selected.length} von ${filled.length} werden abgefragt`
  /*
   * Standardmodus (07.10.2026): „Test automatisch erstellen" ist der Hauptknopf – die KI stellt Aufgaben,
   * Niveau und Punkte zusammen. Die Testeinstellungen bleiben über den zweiten Knopf erreichbar.
   */
  const experte = useExperte()
  const weiter = (
    <Button
      size={experte ? 'md' : undefined}
      variant={experte ? 'filled' : 'default'}
      rightSection={<IconArrowRight size={experte ? 18 : 16} />}
      disabled={selected.length < 2}
      onClick={() => setStep(1)}
    >
      {experte ? 'Weiter zu den Testeinstellungen' : 'Selbst einstellen'}
    </Button>
  )
  const fuss = (
    <Formularfuss
      grund={selected.length < 2 ? (filled.length ? 'Mindestens zwei Vokabeln abfragen' : 'Noch keine Vokabeln') : undefined}
      links={experte ? <AutoCreateButton selection={bookSelection} /> : weiter}
    >
      {selected.length >= 2 && (
        <Text size="sm" c="dimmed" data-testid="abfrage-fuss">
          {zaehler}
        </Text>
      )}
      {experte ? weiter : <AutoCreateButton selection={bookSelection} haupt />}
    </Formularfuss>
  )

  return (
    <FormularSeite fuss={fuss}>
      <ScrollArea h="100%">
        <Container size="lg" py="lg">
          <Title order={2}>Vokabelliste</Title>
          <Text c="dimmed" size="sm" mb="md">
            Vokabeln aus dem Schulbuch, einer Datei, einer Tabelle oder einer gespeicherten Liste übernehmen – oder direkt eintippen. Das Häkchen legt fest,
            welche Vokabeln abgefragt werden.
          </Text>

          <Card withBorder padding="md" mb="lg">
            <Tabs value={quelle} onChange={waehleQuelle} keepMounted>
              <Tabs.List mb="md">
                <Tabs.Tab value="schulbuch" leftSection={<IconBook2 size={16} />}>
                  Schulbuch
                </Tabs.Tab>
                <Tabs.Tab value="datei" leftSection={<IconFileUpload size={16} />}>
                  Datei hineinziehen
                </Tabs.Tab>
                <Tabs.Tab value="tabelle" leftSection={<IconClipboard size={16} />}>
                  Tabelle einfügen
                </Tabs.Tab>
                <Tabs.Tab value="listen" leftSection={<IconList size={16} />}>
                  Aus meinen Listen
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="datei">
                <DropZone
                  onFiles={handleFiles}
                  accept={[...FILE_TYPES.image, ...FILE_TYPES.pdf, ...FILE_TYPES.docx, ...FILE_TYPES.csv, ...FILE_TYPES.xlsx]}
                  title={importing ?? 'Vokabelliste hierher ziehen oder klicken'}
                  hint="Fotos und Scans (JPG, PNG), PDF, Word (DOCX), Excel (XLSX) oder CSV. Die Texterkennung nutzt die in den Einstellungen gewählte KI."
                  loading={Boolean(importing)}
                  minHeight={150}
                />
              </Tabs.Panel>
              <Tabs.Panel value="schulbuch">
                <TextbookPicker
                  rahmen={false}
                  onSelection={(selection) => {
                    setBookSelection(selection)
                    // Der Listenname zeigt, was gerade gewählt ist – bis er von Hand geändert wird
                    if (!nameEdited.current && selection) setListName(selection.name)
                  }}
                  onEntries={(entries, name, context) => {
                    if (!entries.length) {
                      notifyError('In diesem Abschnitt sind keine Vokabeln hinterlegt.')
                      return
                    }
                    // Wie eine hineingezogene Datei: Prüfen und Festlegen im Prüffenster
                    setReview({
                      entries,
                      herkunft: () => {
                        if (!nameEdited.current) setListName(name)
                        setListContext(context)
                      }
                    })
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="tabelle">
                <Group justify="space-between" align="center">
                  <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 240 }}>
                    Tabelle aus Word oder Excel kopieren und einfügen (Spalte 1: Wort, Spalte 2: Deutsch). Danach lässt sich alles in der Prüfansicht
                    kontrollieren.
                  </Text>
                  <Button leftSection={<IconClipboard size={16} />} onClick={() => setPasteOpen(true)}>
                    Tabelle einfügen …
                  </Button>
                </Group>
              </Tabs.Panel>
              <Tabs.Panel value="listen">
                {/* Bei jedem Anzeigen neu geladen – eine eben in „Vokabellisten“ angelegte Liste steht so gleich da */}
                {quelle === 'listen' && (
                  <MeineListen
                    sprache={sprache}
                    onUebernehmen={(l) =>
                      setReview({
                        entries: ausListe(l.entries),
                        herkunft: () => {
                          if (!nameEdited.current) setListName(l.name)
                          setListContext({ bookName: l.source || l.name, language: l.language, grade: l.grade })
                        }
                      })
                    }
                  />
                )}
              </Tabs.Panel>
            </Tabs>
          </Card>

          <Card withBorder padding="md" mb="lg">
            <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
              <TextInput
                placeholder="Name des Vokabeltests, z. B. Green Line 5 – Unit 1, Station 1"
                aria-label="Name des Vokabeltests"
                value={listName}
                onChange={(e) => {
                  nameEdited.current = true
                  setListName(e.currentTarget.value)
                }}
                style={{ flex: 1, minWidth: 240, maxWidth: 420 }}
              />
              <Group gap="xs">
                <UndoRedoButtons
                  size="sm"
                  canUndo={vokabelVerlauf.past.length > 0}
                  canRedo={vokabelVerlauf.future.length > 0}
                  onUndo={undoVocab}
                  onRedo={redoVocab}
                />
                <SaveTestButton />
                <AlsListeSpeichern />
                {vocab.length > 0 && (
                  <Button
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      // Ohne Rückfrage – Strg+Z holt die Liste zurück (Paket 7, Verlauf aus Paket 1)
                      setVocab([])
                      notifyInfo('Die Liste wurde geleert. Strg+Z oder „Rückgängig“ holt sie zurück.')
                    }}
                  >
                    Liste leeren
                  </Button>
                )}
              </Group>
            </Group>

            {filled.length > 0 && <AuswahlLeiste entries={vocab} onChange={(v) => setVocab(v)} />}
            <VokabelTabelle zeilen={vocab} onChange={setVocab} abfragen mitVerlauf bereinige={bereinige} sprache={sprache || undefined} />
          </Card>
        </Container>

        <PruefFenster
          sprache={sprache || undefined}
          entries={review?.entries ?? null}
          onClose={() => setReview(null)}
          onApply={(entries, replace) => {
            review?.herkunft?.()
            setVocab(replace ? entries : [...vocab.filter((v) => v.term.trim()), ...entries])
            setReview(null)
            notifySuccess(`${entries.length} Vokabeln übernommen, davon werden ${includedVocab(entries).length} abgefragt.`)
          }}
        />
        <EinfuegenFenster
          opened={pasteOpen}
          onClose={() => setPasteOpen(false)}
          onParsed={(entries) => {
            setPasteOpen(false)
            setReview({ entries })
          }}
        />
      </ScrollArea>
    </FormularSeite>
  )
}

/**
 * Reiter „Aus meinen Listen": die gespeicherten Vokabellisten, gefiltert nach Fach.
 *
 * Vorher ein kleines Menü „Bibliothek", einmal beim Start geladen – eine eben angelegte Liste
 * fehlte darin, und gelöscht wurde dort ohne Rückfrage. Jetzt mit Suche, Fachfilter und den
 * gemeinsamen Aktionen der Bibliotheken (Umbenennen, Kopie, Löschen mit Rückfrage).
 */
function MeineListen({ sprache, onUebernehmen }: { sprache: string; onUebernehmen: (l: SavedVocabList) => void }): React.JSX.Element {
  const bib = useBibliothek<SavedVocabList>(vokabellistenApi, { offeneId: () => null })
  const [fach, setFach] = useState<string>(sprache || 'alle')
  useEffect(() => setFach(sprache || 'alle'), [sprache])
  const listen = (bib.eintraege ?? []).filter(
    (l) => (fach === 'alle' || !l.language || l.language === fach) && passtZurSuche([l.name, l.source, l.grade ? `Klasse ${l.grade}` : ''], bib.suche)
  )
  return (
    <Stack gap="xs">
      <Group gap="xs" align="flex-end">
        <HaeufigSelect
          art="fach"
          label="Fach"
          size="sm"
          w={200}
          data={[{ value: 'alle', label: 'Alle Fächer' }, ...LANGUAGES.map((l) => ({ value: l.value, label: l.label }))]}
          value={fach}
          onChange={(v) => v && setFach(v)}
          allowDeselect={false}
        />
        <TextInput
          size="sm"
          label="Suchen"
          placeholder="Name, Klasse"
          value={bib.suche}
          onChange={(e) => bib.setSuche(e.currentTarget.value)}
          style={{ flex: 1, maxWidth: 320 }}
        />
      </Group>
      {bib.eintraege && listen.length === 0 && (
        <Text size="sm" c="dimmed" py="sm">
          {bib.eintraege.length === 0
            ? 'Noch keine Vokabellisten gespeichert. Listen entstehen im Programm „Vokabellisten“ oder hier über „Als Liste speichern“.'
            : 'Keine passende Liste – anderes Fach oder anderen Suchbegriff wählen.'}
        </Text>
      )}
      <ScrollArea.Autosize mah={300}>
        <Stack gap={6}>
          {listen.map((l) => (
            <Card key={l.id} withBorder padding="xs" data-liste={l.name}>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Group gap={6}>
                    <Text fw={600} size="sm" truncate>
                      {l.name}
                    </Text>
                    <Badge size="sm" variant="light">
                      {l.entries.length} {l.entries.length === 1 ? 'Vokabel' : 'Vokabeln'}
                    </Badge>
                    {l.grade ? (
                      <Badge size="sm" variant="outline">
                        Klasse {l.grade}
                      </Badge>
                    ) : null}
                  </Group>
                  {l.source && (
                    <Text size="xs" c="dimmed">
                      {l.source}
                    </Text>
                  )}
                </div>
                <Group gap={4} wrap="nowrap">
                  <Button size="xs" onClick={() => onUebernehmen(l)}>
                    Übernehmen
                  </Button>
                  <EintragMenue bib={bib} eintrag={l} />
                </Group>
              </Group>
              <EintragRueckfragen bib={bib} eintrag={l} />
            </Card>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  )
}

/**
 * „Als Liste speichern": die aktuelle Liste in „Vokabellisten" ablegen.
 *
 * Seit Paket 7 mit Sprache, Jahrgang und Herkunft (vorher ohne – die Liste erschien dann bei
 * JEDEM Fach) und ohne die Abfrage-Wahl dieses Tests. Eine gleichnamige Liste wird nicht mehr
 * still überschrieben: Es gibt eine Rückfrage direkt am Knopf.
 */
function AlsListeSpeichern(): React.JSX.Element {
  const { vocab, listName, setListName, listContext, settings } = useVokabeltest()
  const [rueckfrage, setRueckfrage] = useState<{ name: string; vorhanden: SavedVocabList; frei: string } | null>(null)
  const filled = vocab.filter((v) => v.term.trim())

  const speichern = async (name: string, id: string): Promise<void> => {
    try {
      const language = settings?.targetLanguage || listContext?.language
      const grade = settings?.grade ?? listContext?.grade
      await window.api.library.save({
        id,
        name,
        updatedAt: '',
        ...(language ? { language } : {}),
        ...(grade ? { grade } : {}),
        ...(listContext?.bookName && listContext.bookName !== name ? { source: listContext.bookName } : {}),
        entries: filled.map(alsListenEintrag)
      })
      setRueckfrage(null)
      notifySuccess(`„${name}“ unter „Vokabellisten“ gespeichert.`)
    } catch (e) {
      notifyError(e)
    }
  }

  const start = async (): Promise<void> => {
    const name = listName.trim() || `Liste vom ${new Date().toLocaleDateString('de-DE')}`
    if (!listName.trim()) setListName(name)
    try {
      const alle = await window.api.library.list()
      const vorhanden = alle.find((l) => l.name === name)
      if (!vorhanden) return speichern(name, newId())
      // Freier Name für die Kopie: „Name (2)“, „Name (3)“ …
      let n = 2
      while (alle.some((l) => l.name === `${name} (${n})`)) n++
      setRueckfrage({ name, vorhanden, frei: `${name} (${n})` })
    } catch (e) {
      notifyError(e)
    }
  }

  return (
    <>
      <Button variant="light" leftSection={<IconDeviceFloppy size={16} />} disabled={filled.length === 0} onClick={() => void start()}>
        Als Liste speichern
      </Button>
      {rueckfrage && (
        <Alert color="yellow" p="xs" w="100%" data-testid="liste-rueckfrage">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm">Eine Liste „{rueckfrage.name}“ gibt es schon.</Text>
            <Group gap="xs" wrap="nowrap">
              <Button size="xs" variant="default" onClick={() => setRueckfrage(null)}>
                Abbrechen
              </Button>
              <Button size="xs" variant="light" color="red" onClick={() => void speichern(rueckfrage.name, rueckfrage.vorhanden.id)}>
                Ersetzen
              </Button>
              <Button size="xs" autoFocus onClick={() => void speichern(rueckfrage.frei, newId())}>
                Als „{rueckfrage.frei}“ speichern
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
    </>
  )
}
