import { Button, Card, Group, NumberInput, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconCheck, IconClipboard, IconDeviceFloppy } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import type { SavedVocabList } from '@shared/types'
import DropZone, { FILE_TYPES } from '../../../shared/components/DropZone'
import { notifyError, notifySuccess } from '../../../shared/util'
import { useVerzoegertesSichern } from '../../../shared/useAutosave'
import { importVocabFromFile } from '../../vokabeltest/input/importVocab'
import { parseDelimited } from '../../vokabeltest/input/parseTable'
import { newId } from '../../vokabeltest/model/random'
import { LANGUAGES } from '../../vokabeltest/model/types'
import { aiCall } from '../../vokabeltest/store'
import { TextbookPicker } from '../../vokabeltest/steps/TextbookPicker'
import VocabRows, { emptyRow } from './VocabRows'
import type { VocabRow } from './VocabRows'

const toRows = (list: SavedVocabList): VocabRow[] => [...list.entries.map((e) => ({ ...e, id: newId() })), emptyRow()]

/**
 * Eine eigene Vokabelliste bearbeiten.
 *
 * Gespeichert wird von selbst, kurz nach jeder Änderung – wie in den übrigen Programmen.
 * Vorher musste „Speichern" gedrückt werden; „Zurück zur Übersicht" verwarf alles andere
 * ohne Nachfrage.
 */
export default function ListEditor({
  list,
  onSaved,
  onBack
}: {
  list: SavedVocabList
  onSaved: (lists: SavedVocabList[], saved: SavedVocabList) => void
  onBack: () => void
}): React.JSX.Element {
  const [rows, setRows] = useState<VocabRow[]>(() => toRows(list))
  const [name, setName] = useState(list.name)
  const [language, setLanguage] = useState(list.language ?? 'en')
  const [grade, setGrade] = useState<number | ''>(list.grade ?? '')
  const [dirty, setDirty] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  // Zählt Änderungen – so bleibt eine Eingabe WÄHREND des Speicherns als ungesichert markiert
  const stand = useRef(0)

  const save = async (vonHand = false): Promise<void> => {
    const entries = rows.filter((r) => r.term.trim()).map(({ id: _id, ...e }) => ({ ...e, term: e.term.trim(), translation: e.translation.trim() }))
    if (!entries.length) {
      // Von selbst wird eine leere Liste still übergangen; nur auf Knopfdruck gibt es den Hinweis
      if (vonHand) notifyError('Die Liste enthält noch keine Vokabeln.')
      return
    }
    const gesichert = stand.current
    try {
      const next: SavedVocabList = {
        ...list,
        name: name.trim() || `Liste vom ${new Date().toLocaleDateString('de-DE')}`,
        language,
        ...(grade === '' ? {} : { grade: Number(grade) }),
        entries,
        updatedAt: new Date().toISOString()
      }
      const lists = await window.api.library.save(next)
      if (stand.current === gesichert) setDirty(false)
      onSaved(lists, next)
      if (vonHand) notifySuccess(`„${next.name}" gespeichert – ${entries.length} Vokabeln.`)
    } catch (e) {
      // Beim automatischen Sichern meldet der gemeinsame Mechanismus den Fehler
      if (!vonHand) throw e
      notifyError(e)
    }
  }
  const sicherung = useVerzoegertesSichern(() => save())
  /** Jede Änderung: als ungesichert markieren und kurz danach von selbst speichern. */
  const geaendert = (): void => {
    stand.current++
    setDirty(true)
    sicherung.plane(1200)
  }

  const addRows = (entries: { term: string; translation: string; pos?: string; note?: string; grey?: boolean; inBox?: boolean }[]): void => {
    setRows((r) => [...r.filter((x) => x.term.trim() || x.translation.trim()), ...entries.map((e) => ({ ...e, id: newId() })), emptyRow()])
    geaendert()
  }

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Title order={3}>Vokabelliste bearbeiten</Title>
          <Text c="dimmed" size="sm">
            Grau markierte Vokabeln müssen die Schüler nicht unbedingt lernen – sie sind im Test und in der Klassenarbeit standardmäßig abgewählt.
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
        <Group align="flex-start" grow>
          <DropZone
            onFiles={async (files) => {
              const file = files[0]
              if (!file) return
              setImporting('Die Datei wird gelesen …')
              try {
                addRows(await importVocabFromFile(file, aiCall, (m) => setImporting(m)))
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
          <TextbookPicker
            onEntries={(entries, selectionName) => {
              addRows(entries)
              if (!name.trim()) setName(selectionName)
              geaendert()
            }}
          />
        </Group>
        <TextInput
          mt="sm"
          label="Tabelle einfügen"
          description="Aus Word oder Excel kopieren: Spalte 1 Wort, Spalte 2 Übersetzung – oder je Zeile „word – Wort“"
          placeholder="hier einfügen (Strg+V)"
          leftSection={<IconClipboard size={16} />}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (!text.trim()) return
            e.preventDefault()
            const entries = parseDelimited(text)
            if (!entries.length) {
              notifyError('In der Zwischenablage stehen keine erkennbaren Vokabeln.')
              return
            }
            addRows(entries)
            notifySuccess(`${entries.length} Vokabeln übernommen.`)
          }}
        />
      </Card>

      <Card withBorder>
        <VocabRows
          rows={rows}
          onChange={(r) => {
            setRows(r)
            geaendert()
          }}
        />
      </Card>
    </Stack>
  )
}
