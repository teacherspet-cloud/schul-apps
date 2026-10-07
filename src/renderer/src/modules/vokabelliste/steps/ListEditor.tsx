import { Badge, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconCheck, IconClipboard, IconDeviceFloppy, IconSparkles } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { SavedVocabList } from '@shared/types'
import DropZone, { FILE_TYPES } from '../../../shared/components/DropZone'
import UndoRedoButtons from '../../../shared/components/UndoRedoButtons'
import { notifyError, notifySuccess } from '../../../shared/util'
import { useVerzoegertesSichern } from '../../../shared/useAutosave'
import { useUndoKeys } from '../../../shared/useUndoKeys'
import { useVerlauf } from '../../../shared/useVerlauf'
import { importVocabFromFile } from '../../vokabeltest/input/importVocab'
import { newId } from '../../vokabeltest/model/random'
import { LANGUAGES, type VocabEntry } from '../../vokabeltest/model/types'
import { alsListenEintrag } from '../../vokabeltest/model/vocab'
import { aiCall } from '../../vokabeltest/store'
import { TextbookPicker } from '../../vokabeltest/steps/TextbookPicker'
import VokabelTabelle, { leereZeile, ZUSATZ } from '../../vokabeltest/steps/VokabelTabelle'
import { EinfuegenFenster, PruefFenster } from '../../vokabeltest/steps/VokabelUebernahme'
import type { VocabRow } from './VocabRow'
import { MedienLeiste, useMedienAdmin, useMedienbank, useMedienZiel } from '../../../shared/medien/MedienUi'
import { setzeVokabelAnsicht, zielListe } from '../../../shared/medien/medienAuftrag'

/** Eine leere Liste bekommt gleich eine Zeile zum Eintippen */
const toRows = (list: SavedVocabList): VocabRow[] => {
  const rows = list.entries.map((e) => ({ ...alsListenEintrag(e), id: newId() }))
  return rows.length ? rows : [leereZeile<VocabRow>()]
}

/**
 * Eine eigene Vokabelliste bearbeiten.
 *
 * Gespeichert wird von selbst, kurz nach jeder Änderung – wie in den übrigen Programmen.
 * Vorher musste „Speichern" gedrückt werden; „Zurück zur Übersicht" verwarf alles andere
 * ohne Nachfrage.
 *
 * Seit Paket 7: dieselbe Tabelle und dieselbe Prüfansicht wie im Vokabeltest, Zeile löschen
 * mit Strg+Z statt Rückfrage, und „Test aus dieser Liste" führt direkt in den Vokabeltest.
 */
export default function ListEditor({
  list,
  onSaved,
  onBack,
  onTest,
  aktiv = true
}: {
  list: SavedVocabList
  onSaved: (lists: SavedVocabList[], saved: SavedVocabList) => void
  onBack: () => void
  /** „Test aus dieser Liste" – nach dem Sichern */
  onTest?: (list: SavedVocabList) => void
  /** Liegt das Programm vorn? Nur dann gilt Strg+Z hier */
  aktiv?: boolean
}): React.JSX.Element {
  const verlauf = useVerlauf<VocabRow[]>(() => toRows(list))
  const rows = verlauf.stand
  const [name, setName] = useState(list.name)
  const [language, setLanguage] = useState(list.language ?? 'en')
  // Medienbank (05.10.2026): Bild und Aussprache je Wort, gemeinsam für alle Listen und Lehrwerke
  const medienAdmin = useMedienAdmin()
  const [grade, setGrade] = useState<number | ''>(list.grade ?? '')
  // Ziel der Medienaufträge (06.10.2026): „Öffnen" in der Auftragsleiste führt zu dieser Liste; die Klasse steuert die Bildstufe
  const medienZiel = useMedienZiel(zielListe(list.id, name, grade || undefined))
  const medien = useMedienbank(
    language,
    rows.map((r) => r.term),
    medienZiel.stufe
  )
  useEffect(() => {
    if (!aktiv) return
    setzeVokabelAnsicht(list.id)
    return () => setzeVokabelAnsicht(null)
  }, [list.id, aktiv])
  const [dirty, setDirty] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [review, setReview] = useState<VocabEntry[] | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  // Zählt Änderungen – so bleibt eine Eingabe WÄHREND des Speicherns als ungesichert markiert
  const stand = useRef(0)
  // Die Sicherung liest immer den neuesten Stand (sie läuft verzögert)
  const aktuell = useRef({ rows, name, language, grade })
  aktuell.current = { rows, name, language, grade }

  const save = async (vonHand = false): Promise<SavedVocabList | null> => {
    const { rows: r, name: n, language: l, grade: g } = aktuell.current
    const entries = r.filter((x) => x.term.trim()).map(({ id: _id, ...e }) => alsListenEintrag(e))
    const gesichert = stand.current
    try {
      const next: SavedVocabList = {
        ...list,
        name: n.trim() || `Liste vom ${new Date().toLocaleDateString('de-DE')}`,
        language: l,
        ...(g === '' ? {} : { grade: Number(g) }),
        entries,
        updatedAt: new Date().toISOString()
      }
      if (g === '') delete next.grade
      const lists = await window.api.library.save(next)
      if (stand.current === gesichert) setDirty(false)
      onSaved(lists, next)
      if (vonHand) notifySuccess(`„${next.name}" gespeichert – ${entries.length} Vokabeln.`)
      return next
    } catch (e) {
      // Beim automatischen Sichern meldet der gemeinsame Mechanismus den Fehler
      if (!vonHand) throw e
      notifyError(e)
      return null
    }
  }
  const sicherung = useVerzoegertesSichern(() => save().then(() => undefined))
  /** Jede Änderung: als ungesichert markieren und kurz danach von selbst speichern. */
  const geaendert = (): void => {
    stand.current++
    setDirty(true)
    sicherung.plane(1200)
  }
  const setRows = (next: VocabRow[], gruppe?: string): void => {
    verlauf.setze(next, gruppe)
    geaendert()
  }
  useUndoKeys(
    aktiv && review === null && !pasteOpen,
    () => verlauf.undo() && geaendert(),
    () => verlauf.redo() && geaendert()
  )

  const addRows = (entries: VocabEntry[], replace = false): void => {
    const neu = entries.map(({ id: _id, include: _i, ...e }) => ({ ...alsListenEintrag(e), id: newId() }))
    setRows(replace ? neu : [...rows.filter((x) => x.term.trim() || x.translation.trim()), ...neu])
  }

  const filled = rows.filter((r) => r.term.trim()).length
  const grau = rows.filter((r) => r.grey && r.term.trim()).length

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Title order={3}>Vokabelliste bearbeiten</Title>
          <Text c="dimmed" size="sm">
            {ZUSATZ} wird im Test übernommen und gekennzeichnet, aber zunächst nicht abgefragt.
          </Text>
        </div>
        <Group wrap="nowrap">
          <Button
            variant="default"
            onClick={async () => {
              // Anstehendes zuerst sichern, dann erst zurück – die Übersicht zeigt so schon den neuen Stand
              await sicherung.sofort()
              onBack()
            }}
          >
            Zurück zur Übersicht
          </Button>
          {onTest && (
            <Button
              variant="light"
              leftSection={<IconSparkles size={16} />}
              disabled={filled === 0}
              onClick={async () => {
                // Erst sichern, damit der Test mit dem neuesten Stand beginnt
                await sicherung.sofort()
                const gespeichert = await save(false).catch(() => null)
                if (gespeichert) onTest(gespeichert)
              }}
            >
              Test aus dieser Liste
            </Button>
          )}
          {/* Zeigt den Stand; ein Klick sichert sofort, statt die kurze Wartezeit abzuwarten */}
          <Button
            variant={dirty ? 'filled' : 'light'}
            leftSection={dirty ? <IconDeviceFloppy size={16} /> : <IconCheck size={16} />}
            disabled={!dirty}
            onClick={() => void sicherung.sofort().then(() => save(true))}
          >
            {dirty ? 'Speichern' : 'Gesichert'}
          </Button>
        </Group>
      </Group>

      <Card withBorder>
        <Group grow align="flex-start">
          <TextInput
            label="Name der Liste"
            placeholder="z. B. Green Line 4 – Unit 1"
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value)
              geaendert()
            }}
          />
          <Select
            label="Sprache"
            data={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
            value={language}
            onChange={(v) => {
              if (!v) return
              setLanguage(v)
              geaendert()
            }}
            allowDeselect={false}
          />
          <NumberInput
            label="Jahrgang (optional)"
            placeholder="z. B. 8"
            min={1}
            max={13}
            clampBehavior="blur"
            value={grade}
            onChange={(v) => {
              setGrade(v === '' ? '' : Number(v))
              geaendert()
            }}
          />
        </Group>
      </Card>

      <Card withBorder>
        <Title order={5} mb="xs">
          Vokabeln hinzufügen
        </Title>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Stack gap="xs">
            <DropZone
              onFiles={async (files) => {
                const found: VocabEntry[] = []
                try {
                  for (const file of files) {
                    setImporting(`${file.name} wird gelesen …`)
                    found.push(...(await importVocabFromFile(file, aiCall, (m) => setImporting(m))))
                  }
                  if (found.length) setReview(found)
                  else notifyError('In der Datei wurden keine Vokabeln gefunden.')
                } catch (e) {
                  notifyError(e)
                } finally {
                  setImporting(null)
                }
              }}
              accept={[...FILE_TYPES.image, ...FILE_TYPES.pdf, ...FILE_TYPES.docx, ...FILE_TYPES.csv, ...FILE_TYPES.xlsx]}
              title={importing ?? 'Datei hierher ziehen (Foto, PDF, Word, Excel, CSV)'}
              loading={Boolean(importing)}
              minHeight={120}
            />
            <Button variant="light" leftSection={<IconClipboard size={16} />} onClick={() => setPasteOpen(true)}>
              Tabelle einfügen …
            </Button>
          </Stack>
          <TextbookPicker
            onEntries={(entries, selectionName) => {
              setReview(entries)
              if (!name.trim()) setName(selectionName)
            }}
          />
        </SimpleGrid>
      </Card>

      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <Text fw={600}>
              {filled} {filled === 1 ? 'Vokabel' : 'Vokabeln'}
            </Text>
            {grau > 0 && (
              <Badge variant="light" color="gray" tt="none">
                {grau} {ZUSATZ}
              </Badge>
            )}
          </Group>
          <UndoRedoButtons
            size="sm"
            canUndo={verlauf.kannUndo}
            canRedo={verlauf.kannRedo}
            onUndo={() => verlauf.undo() && geaendert()}
            onRedo={() => verlauf.redo() && geaendert()}
          />
        </Group>
        {medienAdmin && (
          <MedienLeiste sprache={language} vokabeln={rows.map((r) => ({ term: r.term, translation: r.translation }))} daten={medien.daten} ziel={medienZiel} />
        )}
        <VokabelTabelle
          zeilen={rows}
          onChange={setRows}
          mitVerlauf
          sprache={language}
          medien={{ sprache: language, daten: medien.daten, admin: medienAdmin, neuLaden: medien.laden, ziel: medienZiel }}
        />
      </Card>

      <PruefFenster
        sprache={language}
        entries={review}
        abfragen={false}
        onClose={() => setReview(null)}
        onApply={(entries, replace) => {
          addRows(entries, replace)
          setReview(null)
          notifySuccess(`${entries.length} Vokabeln übernommen.`)
        }}
      />
      <EinfuegenFenster
        opened={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onParsed={(entries) => {
          setPasteOpen(false)
          setReview(entries)
        }}
      />
    </Stack>
  )
}
